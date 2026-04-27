"""
File upload/download endpoints using Emergent Object Storage with local fallback.
"""

from fastapi import APIRouter, HTTPException, Depends, File, UploadFile, Query, Header
from fastapi.responses import Response
from typing import Optional
from datetime import datetime, timezone
import uuid
import os
import logging
import requests
import json as _json
import base64

from database import db
from auth import get_current_user, decode_token

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/files", tags=["Files"])

STORAGE_URL = "https://integrations.emergentagent.com/objstore/api/v1/storage"
EMERGENT_KEY = os.environ.get("EMERGENT_LLM_KEY")
APP_NAME = "ventura-fresh-laundry"

_storage_key_cache: dict = {}

MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB
ALLOWED_TYPES = {
    "image/jpeg", "image/png", "image/webp", "image/gif", "image/heic",
    "application/pdf", "text/plain", "text/csv",
}

# ──────────────────────────────────────────────────────────────────────────────
# Storage helpers with local fallback
# ──────────────────────────────────────────────────────────────────────────────

def init_storage() -> str:
    """Initialize Emergent object storage and return storage key."""
    if _storage_key_cache.get("key"):
        return _storage_key_cache["key"]
    if not EMERGENT_KEY:
        raise RuntimeError("EMERGENT_LLM_KEY not set")
    try:
        resp = requests.post(
            f"{STORAGE_URL}/init",
            json={"emergent_key": EMERGENT_KEY},
            timeout=30,
        )
        resp.raise_for_status()
        key = resp.json()["storage_key"]
        _storage_key_cache["key"] = key
        logger.info("Object storage initialized")
        return key
    except Exception as exc:
        logger.error(f"Storage init failed: {exc}")
        raise RuntimeError(f"Storage init failed: {exc}") from exc


def _is_local_path(path: str) -> bool:
    return path.startswith("/") or "uploads/" in path or "/app/backend/" in path


def get_object(path: str):
    if _is_local_path(path):
        try:
            with open(path, "rb") as f:
                data = f.read()
            content_type = "application/octet-stream"
            if path.endswith(".jpg") or path.endswith(".jpeg"):
                content_type = "image/jpeg"
            elif path.endswith(".png"):
                content_type = "image/png"
            elif path.endswith(".webp"):
                content_type = "image/webp"
            elif path.endswith(".pdf"):
                content_type = "application/pdf"
            return data, content_type
        except FileNotFoundError:
            raise FileNotFoundError(f"Local file not found: {path}")
        except Exception as e:
            raise RuntimeError(f"Failed to read local file {path}: {e}")

    key = init_storage()
    try:
        resp = requests.get(
            f"{STORAGE_URL}/objects/{path}",
            headers={"X-Storage-Key": key},
            timeout=60,
        )
        if resp.status_code == 404:
            raise FileNotFoundError(f"Object not found: {path}")
        resp.raise_for_status()
        return resp.content, resp.headers.get("Content-Type", "application/octet-stream")
    except requests.exceptions.HTTPError as e:
        if e.response.status_code in (401, 403):
            _storage_key_cache.clear()
            new_key = init_storage()
            resp = requests.get(
                f"{STORAGE_URL}/objects/{path}",
                headers={"X-Storage-Key": new_key},
                timeout=60,
            )
            if resp.status_code == 404:
                raise FileNotFoundError(f"Object not found: {path}")
            resp.raise_for_status()
            return resp.content, resp.headers.get("Content-Type", "application/octet-stream")
        raise
    except requests.exceptions.Timeout:
        raise TimeoutError(f"Storage timeout for {path}")


def put_object(path: str, data: bytes, content_type: str) -> dict:
    key = init_storage()
    resp = requests.put(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key, "Content-Type": content_type},
        data=data,
        timeout=120,
    )
    resp.raise_for_status()
    return resp.json()


# ──────────────────────────────────────────────────────────────────────────────
# RUTAS CON NOMBRES FIJOS (siempre antes de /{file_id}/...)
# ──────────────────────────────────────────────────────────────────────────────

@router.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    context: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_user),
):
    data = await file.read()
    if len(data) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="File too large (max 10MB)")

    ct = file.content_type or "application/octet-stream"
    if ct not in ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail=f"File type {ct} not allowed")

    ext = file.filename.split(".")[-1].lower() if file.filename and "." in file.filename else "bin"
    uid = str(uuid.uuid4())
    storage_path = f"{APP_NAME}/uploads/{current_user['id']}/{uid}.{ext}"

    data_b64 = base64.b64encode(data).decode("utf-8")

    file_record = {
        "id": uid,
        "storage_path": storage_path,
        "original_filename": file.filename,
        "content_type": ct,
        "size": len(data),
        "data_base64": data_b64,
        "context": context,
        "uploaded_by": current_user["id"],
        "uploader_type": "operator",
        "is_deleted": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.files.insert_one(file_record)

    return {
        "id": uid,
        "filename": file.filename,
        "content_type": ct,
        "size": len(data),
        "url": f"/api/files/{uid}/download",
    }


@router.get("/ocr-analytics")
async def get_ocr_analytics(current_user: dict = Depends(get_current_user)):
    total_scans = await db.ocr_logs.count_documents({})
    successful = await db.ocr_logs.count_documents({"status": "success"})
    failed = await db.ocr_logs.count_documents({"status": "error"})

    amount_ok = await db.ocr_logs.count_documents({"status": "success", "amount_extracted": True})
    vendor_ok = await db.ocr_logs.count_documents({"status": "success", "vendor_extracted": True})
    date_ok   = await db.ocr_logs.count_documents({"status": "success", "date_extracted": True})

    pipeline = [
        {"$match": {"status": "success", "result.amount": {"$gt": 0}}},
        {"$group": {"_id": None, "total": {"$sum": "$result.amount"}}},
    ]
    agg = await db.ocr_logs.aggregate(pipeline).to_list(1)
    total_captured = agg[0]["total"] if agg else 0

    recent = await db.ocr_logs.find(
        {}, {"_id": 0, "id": 1, "filename": 1, "status": 1, "result": 1, "created_at": 1}
    ).sort("created_at", -1).limit(20).to_list(20)

    vendor_pipeline = [
        {"$match": {"status": "success", "result.vendor": {"$ne": ""}}},
        {"$group": {"_id": "$result.vendor", "count": {"$sum": 1}, "total": {"$sum": "$result.amount"}}},
        {"$sort": {"count": -1}},
        {"$limit": 10},
    ]
    top_vendors = await db.ocr_logs.aggregate(vendor_pipeline).to_list(10)

    return {
        "total_scans": total_scans,
        "successful": successful,
        "failed": failed,
        "success_rate": round(successful / total_scans * 100, 1) if total_scans > 0 else 0,
        "field_rates": {
            "amount": round(amount_ok / successful * 100, 1) if successful > 0 else 0,
            "vendor": round(vendor_ok / successful * 100, 1) if successful > 0 else 0,
            "date":   round(date_ok   / successful * 100, 1) if successful > 0 else 0,
        },
        "total_amount_captured": round(total_captured, 2),
        "recent_scans": recent,
        "top_vendors": [
            {"vendor": v["_id"], "count": v["count"], "total": round(v["total"], 2)}
            for v in top_vendors
        ],
    }


@router.get("/by-context/{context_type}/{context_id}")
async def list_files_by_context(
    context_type: str,
    context_id: str,
    current_user: dict = Depends(get_current_user),
):
    context = f"{context_type}:{context_id}"
    files = await db.files.find(
        {"context": context, "is_deleted": False},
        {"_id": 0, "storage_path": 0, "data_base64": 0},
    ).sort("created_at", -1).to_list(50)
    for f in files:
        f["url"] = f"/api/files/{f['id']}/download"
    return files


@router.get("/receipts-by-order/{order_id}")
async def list_receipts_by_order(
    order_id: str,
    current_user: dict = Depends(get_current_user),
):
    files = await db.files.find(
        {"context": f"payment:{order_id}", "is_deleted": False},
        {"_id": 0, "storage_path": 0, "data_base64": 0},
    ).sort("created_at", -1).to_list(20)

    for f in files:
        f["url"] = f"/api/files/{f['id']}/download"
        validation = await db.payment_validations.find_one({"file_id": f["id"]}, {"_id": 0})
        if validation:
            f["ai_validation_status"] = validation.get("status", "pending")
            f["ai_validation_notes"]  = validation.get("notes", "")
            f["ai_extracted_amount"]  = validation.get("amount", 0)
        else:
            f["ai_validation_status"] = "pending"
            f["ai_validation_notes"]  = ""
            f["ai_extracted_amount"]  = 0
    return files


@router.post("/validate-payment-receipt/{file_id}")
async def validate_payment_receipt(
    file_id: str,
    order_id: str = Query(..., description="Order ID to cross-check the amount"),
    current_user: dict = Depends(get_current_user),
):
    record = await db.files.find_one({"id": file_id, "is_deleted": False}, {"_id": 0})
    if not record:
        raise HTTPException(status_code=404, detail="File not found")

    ct = record.get("content_type", "")
    if not ct.startswith("image/"):
        raise HTTPException(status_code=400, detail="Payment validation only works with images")

    order = await db.orders.find_one(
        {"$or": [{"id": order_id}, {"order_id": order_id}, {"order_number": order_id}]},
        {"_id": 0, "total_amount": 1, "order_number": 1},
    )
    expected_amount = float((order or {}).get("total_amount") or 0)
    order_number    = (order or {}).get("order_number", order_id)

    data_b64 = record.get("data_base64")
    if data_b64:
        image_data = base64.b64decode(data_b64)
    else:
        try:
            image_data, _ = get_object(record.get("storage_path", ""))
        except FileNotFoundError:
            raise HTTPException(status_code=404, detail="Image file not found in storage")
        except TimeoutError:
            raise HTTPException(status_code=504, detail="Storage service timeout")
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"Failed to download image: {exc}")

    b64 = base64.b64encode(image_data).decode("utf-8")
    llm_key = os.environ.get("EMERGENT_LLM_KEY")
    if not llm_key:
        raise HTTPException(status_code=500, detail="LLM key not configured")

    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent

        system_prompt = (
            "You are a strict payment verification assistant for a laundry business. "
            "Analyze the image and determine if it is a COMPLETED payment receipt.\n\n"
            "Rules:\n"
            "1. Must be an ACTUAL payment confirmation: Zelle, Venmo, Cash App, bank transfer, card receipt.\n"
            "2. Payment must be COMPLETED/SENT — not pending, not a payment request, not a preview.\n"
            "3. Payment REQUEST screens or 'pay now' previews = NOT valid.\n"
            "4. Screenshot of a SENT/COMPLETED transaction = valid.\n"
            "5. Extract the total amount paid if visible.\n\n"
            "Return ONLY valid JSON, no markdown, no extra text:\n"
            '{"is_valid_payment": true|false, "amount": <number or 0>, '
            '"status": "verified_paid"|"rejected", '
            '"notes": "<brief explanation in Spanish, max 120 chars>"}'
        )

        chat = LlmChat(api_key=llm_key, session_id=f"pay-val-{file_id}", system_message=system_prompt)
        chat.with_model("openai", "gpt-4o")

        img      = ImageContent(image_base64=b64)
        user_msg = UserMessage(
            text=f"Analyze this image. Expected payment: ${expected_amount:.2f} for order {order_number}. Is this a completed payment receipt?",
            file_contents=[img],
        )
        response_text = await chat.send_message(user_msg)

        cleaned = response_text.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
        result = _json.loads(cleaned)

        is_valid = bool(result.get("is_valid_payment", False))
        amount   = float(result.get("amount", 0))
        status   = "verified_paid" if is_valid else "rejected"
        notes    = str(result.get("notes", ""))[:200]
        now      = datetime.now(timezone.utc).isoformat()

        await db.payment_validations.update_one(
            {"file_id": file_id},
            {"$set": {
                "file_id": file_id, "order_id": order_id, "status": status,
                "is_valid_payment": is_valid, "amount": amount, "notes": notes,
                "expected_amount": expected_amount,
                "validated_by": current_user["id"], "validated_at": now,
            }},
            upsert=True,
        )

        if is_valid:
            await db.orders.update_one(
                {"$or": [{"id": order_id}, {"order_id": order_id}]},
                {
                    "$set": {"payment_status": "paid", "payment_method": "transfer", "updated_at": now},
                    "$push": {"status_history": {
                        "status": "payment_confirmed_by_ai", "timestamp": now,
                        "by": f"operator:{current_user['id']}",
                        "notes": f"AI validated receipt. Amount: ${amount:.2f}",
                    }},
                },
            )

        return {"is_valid_payment": is_valid, "amount": amount, "status": status, "notes": notes}

    except _json.JSONDecodeError as exc:
        logger.error(f"AI response not valid JSON: {exc}")
        raise HTTPException(status_code=500, detail="AI returned invalid response")
    except Exception as exc:
        logger.error(f"Payment validation failed: {exc}")
        raise HTTPException(status_code=500, detail=f"AI validation failed: {exc}")


# ──────────────────────────────────────────────────────────────────────────────
# RUTAS CON PATH-PARAMS  ──  DEBEN IR DESPUÉS DE TODAS LAS RUTAS FIJAS
# ──────────────────────────────────────────────────────────────────────────────

@router.patch("/{file_id}/context")
async def update_file_context(
    file_id: str,
    context: str = Query(..., description="New context, e.g. expense:abc123"),
    current_user: dict = Depends(get_current_user),
):
    """
    Reasigna el contexto de un archivo ya subido.
    Usado para vincular archivos OCR (ocr-temp) al gasto definitivo (expense:{id}).
    """
    result = await db.files.update_one(
        {"id": file_id, "is_deleted": False, "uploaded_by": current_user["id"]},
        {"$set": {"context": context}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="File not found or not yours")
    return {"ok": True, "file_id": file_id, "context": context}


@router.get("/{file_id}/download")
async def download_file(
    file_id: str,
    authorization: Optional[str] = Header(None),
    auth: Optional[str] = Query(None),
):
    """Download a file. Accepts token via Authorization header OR ?auth= query param."""
    tok = None
    if authorization:
        tok = authorization.removeprefix("Bearer ").strip()
    elif auth:
        tok = auth.strip()

    if not tok:
        raise HTTPException(status_code=401, detail="Authentication required")

    try:
        decode_token(tok)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")

    record = await db.files.find_one({"id": file_id, "is_deleted": False}, {"_id": 0})
    if not record:
        raise HTTPException(status_code=404, detail="File not found")

    # Prioridad 1: datos en MongoDB
    data_b64 = record.get("data_base64")
    if data_b64:
        data = base64.b64decode(data_b64)
        return Response(
            content=data,
            media_type=record.get("content_type", "application/octet-stream"),
            headers={
                "Content-Disposition": f'inline; filename="{record.get("original_filename", "file")}"',
                "Cache-Control": "private, max-age=3600",
            },
        )

    # Prioridad 2: storage externo (legacy)
    storage_path = record.get("storage_path")
    if not storage_path:
        raise HTTPException(status_code=400, detail="No storage path in record")

    try:
        data, content_type = get_object(storage_path)
        await db.files.update_one(
            {"id": file_id},
            {"$set": {"data_base64": base64.b64encode(data).decode("utf-8")}},
        )
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="File not found in storage")
    except TimeoutError:
        raise HTTPException(status_code=504, detail="Storage service timeout")
    except Exception as exc:
        logger.exception(f"Download error for {file_id}: {exc}")
        raise HTTPException(status_code=500, detail=f"Storage error: {str(exc)}")

    return Response(
        content=data,
        media_type=record.get("content_type", content_type),
        headers={
            "Content-Disposition": f'inline; filename="{record.get("original_filename", "file")}"',
            "Cache-Control": "private, max-age=3600",
        },
    )


@router.post("/ocr/{file_id}")
async def ocr_extract(file_id: str, current_user: dict = Depends(get_current_user)):
    """Extract amount and description from an uploaded receipt image using AI vision."""
    record = await db.files.find_one({"id": file_id, "is_deleted": False}, {"_id": 0})
    if not record:
        raise HTTPException(status_code=404, detail="File not found")

    ct = record.get("content_type", "")
    if not ct.startswith("image/"):
        raise HTTPException(status_code=400, detail="OCR only works with images")

    ocr_log = {
        "id": str(uuid.uuid4()),
        "file_id": file_id,
        "user_id": current_user["id"],
        "filename": record.get("original_filename", ""),
        "status": "processing",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    data_b64_stored = record.get("data_base64")
    if data_b64_stored:
        image_data = base64.b64decode(data_b64_stored)
    else:
        try:
            image_data, _ = get_object(record.get("storage_path", ""))
        except Exception as exc:
            logger.error(f"OCR download failed: {exc}")
            ocr_log["status"] = "error"
            ocr_log["error"]  = "download_failed"
            await db.ocr_logs.insert_one(ocr_log)
            raise HTTPException(status_code=500, detail="Failed to download image")

    b64     = base64.b64encode(image_data).decode("utf-8")
    llm_key = os.environ.get("EMERGENT_LLM_KEY")
    if not llm_key:
        ocr_log["status"] = "error"
        ocr_log["error"]  = "no_llm_key"
        await db.ocr_logs.insert_one(ocr_log)
        raise HTTPException(status_code=500, detail="LLM key not configured")

    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent

        chat = LlmChat(
            api_key=llm_key,
            session_id=f"ocr-{file_id}",
            system_message=(
                "You are a receipt/invoice OCR assistant. "
                "Analyze the image and extract: total amount, short description, date, and vendor name. "
                'Return ONLY valid JSON: {"amount": <number>, "description": "<text>", '
                '"date": "<YYYY-MM-DD or empty>", "vendor": "<name or empty>"} '
                "If you cannot determine a field, use 0 for amount, empty string for others."
            ),
        )
        chat.with_model("openai", "gpt-4o")

        img      = ImageContent(image_base64=b64)
        user_msg = UserMessage(
            text="Extract the total amount, short description, date, and vendor/store name from this receipt.",
            file_contents=[img],
        )
        response_text = await chat.send_message(user_msg)

        cleaned = response_text.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
        result = _json.loads(cleaned)

        extracted = {
            "amount":      float(result.get("amount", 0)),
            "description": str(result.get("description", "")),
            "date":        str(result.get("date", "")),
            "vendor":      str(result.get("vendor", "")),
        }

        ocr_log["status"]           = "success"
        ocr_log["result"]           = extracted
        ocr_log["amount_extracted"] = extracted["amount"] > 0
        ocr_log["vendor_extracted"] = len(extracted["vendor"]) > 0
        ocr_log["date_extracted"]   = len(extracted["date"]) > 0
        await db.ocr_logs.insert_one(ocr_log)

        return extracted

    except Exception as exc:
        logger.error(f"OCR LLM failed: {exc}")
        ocr_log["status"] = "error"
        ocr_log["error"]  = str(exc)[:200]
        await db.ocr_logs.insert_one(ocr_log)
        raise HTTPException(status_code=500, detail=f"OCR analysis failed: {exc}")


@router.delete("/{file_id}")
async def soft_delete_file(file_id: str, current_user: dict = Depends(get_current_user)):
    result = await db.files.update_one(
        {"id": file_id, "is_deleted": False},
        {"$set": {"is_deleted": True, "deleted_at": datetime.now(timezone.utc).isoformat()}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="File not found")
    return {"ok": True}


@router.get("/check-storage/{file_id}")
async def check_storage(file_id: str, current_user: dict = Depends(get_current_user)):
    record = await db.files.find_one({"id": file_id})
    if not record:
        return {"exists": False, "error": "No record in DB"}
    storage_path = record.get("storage_path")
    try:
        get_object(storage_path)
        return {"exists": True, "path": storage_path}
    except FileNotFoundError:
        return {"exists": False, "path": storage_path, "error": "Not found in storage"}
    except Exception as e:
        return {"exists": False, "path": storage_path, "error": str(e)}