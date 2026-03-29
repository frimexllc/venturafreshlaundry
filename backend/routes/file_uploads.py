"""File upload/download endpoints using Emergent Object Storage"""
from fastapi import APIRouter, HTTPException, Depends, File, UploadFile, Query, Header
from fastapi.responses import Response
from typing import Optional
from datetime import datetime, timezone
import uuid
import os
import logging
import requests

from database import db
from auth import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/files", tags=["Files"])

STORAGE_URL = "https://integrations.emergentagent.com/objstore/api/v1/storage"
EMERGENT_KEY = os.environ.get("EMERGENT_LLM_KEY")
APP_NAME = "ventura-fresh-laundry"
storage_key = None

MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB
ALLOWED_TYPES = {
    "image/jpeg", "image/png", "image/webp", "image/gif", "image/heic",
    "application/pdf", "text/plain", "text/csv",
}


def init_storage():
    global storage_key
    if storage_key:
        return storage_key
    if not EMERGENT_KEY:
        raise RuntimeError("EMERGENT_LLM_KEY not set")
    resp = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_KEY}, timeout=30)
    resp.raise_for_status()
    storage_key = resp.json()["storage_key"]
    logger.info("Object storage initialized")
    return storage_key


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


def get_object(path: str):
    key = init_storage()
    resp = requests.get(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key},
        timeout=60,
    )
    resp.raise_for_status()
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")


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

    result = put_object(storage_path, data, ct)

    file_record = {
        "id": uid,
        "storage_path": result["path"],
        "original_filename": file.filename,
        "content_type": ct,
        "size": result.get("size", len(data)),
        "context": context,
        "uploaded_by": current_user["id"],
        "is_deleted": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.files.insert_one(file_record)

    return {
        "id": uid,
        "filename": file.filename,
        "content_type": ct,
        "size": file_record["size"],
        "url": f"/api/files/{uid}/download",
    }


@router.get("/{file_id}/download")
async def download_file(
    file_id: str,
    authorization: Optional[str] = Header(None),
    auth: Optional[str] = Query(None),
):
    token = None
    if authorization:
        token = authorization.replace("Bearer ", "")
    elif auth:
        token = auth

    if not token:
        raise HTTPException(status_code=401, detail="Authentication required")

    from auth import decode_token
    try:
        decode_token(token)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")

    record = await db.files.find_one({"id": file_id, "is_deleted": False}, {"_id": 0})
    if not record:
        raise HTTPException(status_code=404, detail="File not found")

    data, content_type = get_object(record["storage_path"])
    return Response(
        content=data,
        media_type=record.get("content_type", content_type),
        headers={"Content-Disposition": f"inline; filename=\"{record.get('original_filename', 'file')}\""},
    )


@router.get("/by-context/{context_type}/{context_id}")
async def list_files_by_context(
    context_type: str,
    context_id: str,
    current_user: dict = Depends(get_current_user),
):
    context = f"{context_type}:{context_id}"
    files = await db.files.find(
        {"context": context, "is_deleted": False},
        {"_id": 0, "storage_path": 0},
    ).sort("created_at", -1).to_list(50)
    for f in files:
        f["url"] = f"/api/files/{f['id']}/download"
    return files


@router.post("/ocr/{file_id}")
async def ocr_extract(file_id: str, current_user: dict = Depends(get_current_user)):
    """Extract amount and description from an uploaded receipt image using AI vision"""
    record = await db.files.find_one({"id": file_id, "is_deleted": False}, {"_id": 0})
    if not record:
        raise HTTPException(status_code=404, detail="File not found")

    ct = record.get("content_type", "")
    if not ct.startswith("image/"):
        raise HTTPException(status_code=400, detail="OCR only works with images")

    # Track the OCR attempt
    ocr_log = {
        "id": str(uuid.uuid4()),
        "file_id": file_id,
        "user_id": current_user["id"],
        "filename": record.get("original_filename", ""),
        "status": "processing",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    try:
        image_data, _ = get_object(record["storage_path"])
    except Exception as e:
        logger.error(f"OCR download failed: {e}")
        ocr_log["status"] = "error"
        ocr_log["error"] = "download_failed"
        await db.ocr_logs.insert_one(ocr_log)
        raise HTTPException(status_code=500, detail="Failed to download image")

    import base64
    b64 = base64.b64encode(image_data).decode("utf-8")

    llm_key = os.environ.get("EMERGENT_LLM_KEY")
    if not llm_key:
        ocr_log["status"] = "error"
        ocr_log["error"] = "no_llm_key"
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
                "Return ONLY valid JSON: {\"amount\": <number>, \"description\": \"<text>\", \"date\": \"<YYYY-MM-DD or empty>\", \"vendor\": \"<name or empty>\"} "
                "If you cannot determine a field, use 0 for amount, empty string for others."
            ),
        )
        chat.with_model("openai", "gpt-4o")

        img = ImageContent(image_base64=b64)
        user_msg = UserMessage(
            text="Extract the total amount, short description, date, and vendor/store name from this receipt.",
            file_contents=[img],
        )
        response_text = await chat.send_message(user_msg)

        import json as _json
        cleaned = response_text.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
        result = _json.loads(cleaned)

        extracted = {
            "amount": float(result.get("amount", 0)),
            "description": str(result.get("description", "")),
            "date": str(result.get("date", "")),
            "vendor": str(result.get("vendor", "")),
        }

        # Log successful OCR
        ocr_log["status"] = "success"
        ocr_log["result"] = extracted
        ocr_log["amount_extracted"] = extracted["amount"] > 0
        ocr_log["vendor_extracted"] = len(extracted["vendor"]) > 0
        ocr_log["date_extracted"] = len(extracted["date"]) > 0
        await db.ocr_logs.insert_one(ocr_log)

        return extracted
    except Exception as e:
        logger.error(f"OCR LLM failed: {e}")
        ocr_log["status"] = "error"
        ocr_log["error"] = str(e)[:200]
        await db.ocr_logs.insert_one(ocr_log)
        raise HTTPException(status_code=500, detail=f"OCR analysis failed: {str(e)}")


@router.delete("/{file_id}")
async def soft_delete_file(file_id: str, current_user: dict = Depends(get_current_user)):
    result = await db.files.update_one(
        {"id": file_id, "is_deleted": False},
        {"$set": {"is_deleted": True, "deleted_at": datetime.now(timezone.utc).isoformat()}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="File not found")
    return {"ok": True}


@router.get("/ocr-analytics")
async def get_ocr_analytics(current_user: dict = Depends(get_current_user)):
    """Return OCR usage analytics for the dashboard."""
    total_scans = await db.ocr_logs.count_documents({})
    successful = await db.ocr_logs.count_documents({"status": "success"})
    failed = await db.ocr_logs.count_documents({"status": "error"})

    # Field extraction rates
    amount_ok = await db.ocr_logs.count_documents({"status": "success", "amount_extracted": True})
    vendor_ok = await db.ocr_logs.count_documents({"status": "success", "vendor_extracted": True})
    date_ok = await db.ocr_logs.count_documents({"status": "success", "date_extracted": True})

    # Total amount captured via OCR
    pipeline = [
        {"$match": {"status": "success", "result.amount": {"$gt": 0}}},
        {"$group": {"_id": None, "total": {"$sum": "$result.amount"}}},
    ]
    agg = await db.ocr_logs.aggregate(pipeline).to_list(1)
    total_captured = agg[0]["total"] if agg else 0

    # Recent scans
    recent = await db.ocr_logs.find(
        {}, {"_id": 0, "id": 1, "filename": 1, "status": 1, "result": 1, "created_at": 1}
    ).sort("created_at", -1).limit(20).to_list(20)

    # Top vendors
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
            "date": round(date_ok / successful * 100, 1) if successful > 0 else 0,
        },
        "total_amount_captured": round(total_captured, 2),
        "recent_scans": recent,
        "top_vendors": [{"vendor": v["_id"], "count": v["count"], "total": round(v["total"], 2)} for v in top_vendors],
    }
