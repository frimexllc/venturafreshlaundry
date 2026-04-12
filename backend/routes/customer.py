"""Customer-facing endpoints — public order lookup and Stripe checkout"""
import os
import logging
import uuid
import base64
import json as _json
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Request, Depends, UploadFile, File, Query
from fastapi.responses import Response
from typing import Optional

from database import db
from auth import get_current_customer
from realtime import emit_realtime

# Lazy import for file uploads
try:
    from file_uploads import put_object, get_object
    _HAS_FILE_UPLOADS = True
except ImportError:
    _HAS_FILE_UPLOADS = False
    put_object = None
    get_object = None

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/customer", tags=["customer"])


def _get_stripe_key():
    """Read Stripe key lazily to ensure dotenv is loaded."""
    return os.environ.get("STRIPE_SECRET_KEY") or os.environ.get("STRIPE_API_KEY", "")


def _get_frontend_url():
    """Read frontend URL lazily."""
    return os.environ.get("FRONTEND_URL") or os.environ.get("REACT_APP_BACKEND_URL") or os.environ.get("BUSINESS_WEBSITE", "")

MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB
ALLOWED_RECEIPT_TYPES = {"image/jpeg", "image/png", "image/webp", "image/heic"}


# ─────────────────────────────────────────────────────────────────────────────
# PUBLIC — sin autenticación
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/order/{order_id}")
async def get_customer_order(order_id: str):
    """Public endpoint — customer views their order details for payment"""
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    return {
        "id": order.get("id"),
        "order_number": order.get("order_number", ""),
        "customer_name": order.get("customer_name", ""),
        "service_type": order.get("service_type", ""),
        "status": order.get("status", ""),
        "payment_status": order.get("payment_status", "unpaid"),
        "total_amount": float(order.get("total_amount") or 0),
        "subtotal": float(order.get("subtotal") or order.get("total_amount") or 0),
        "delivery_fee": float(order.get("delivery_fee") or 0),
        "processing_fee": float(order.get("processing_fee") or 0),
        "actual_lbs": float(order.get("actual_lbs") or 0),
    }


@router.post("/order/{order_id}/checkout")
async def create_customer_checkout(order_id: str, request: Request):
    """Public endpoint — creates a Stripe Checkout session for the customer"""
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.get("payment_status") == "paid":
        raise HTTPException(status_code=400, detail="Order already paid")

    total = float(order.get("total_amount") or 0)
    if total <= 0:
        raise HTTPException(status_code=400, detail="Invalid order total")
    if not _get_stripe_key():
        raise HTTPException(status_code=503, detail="Payment service not configured")

    try:
        import stripe
        stripe.api_key = _get_stripe_key()
        base_url = str(request.base_url).rstrip("/")
        frontend = _get_frontend_url() or base_url

        session = stripe.checkout.Session.create(
            payment_method_types=["card"],
            line_items=[{
                "price_data": {
                    "currency": "usd",
                    "product_data": {
                        "name": f"Ventura Fresh Laundry - {order.get('order_number', '')}",
                        "description": order.get("service_type", "Laundry Service"),
                    },
                    "unit_amount": int(total * 100),
                },
                "quantity": 1,
            }],
            mode="payment",
            success_url=f"{frontend}/customer/pay/{order_id}?paid=1",
            cancel_url=f"{frontend}/customer/pay/{order_id}",
            metadata={"order_id": order_id, "order_number": order.get("order_number", "")},
        )
        return {"url": session.url}
    except Exception as exc:
        logger.error("Stripe checkout error: %s", exc)
        raise HTTPException(status_code=500, detail="Payment service error")


@router.post("/order/{order_id}/confirm-payment")
async def confirm_customer_payment(order_id: str):
    """
    Called when customer returns from Stripe checkout with ?paid=1.
    NOTE: For production, rely on the Stripe webhook to confirm payment.
    This endpoint should only be called from the Stripe success_url redirect.
    """
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.get("payment_status") == "paid":
        return {"ok": True, "detail": "Already paid"}

    now = datetime.now(timezone.utc).isoformat()
    await db.orders.update_one(
        {"id": order_id},
        {
            "$set": {
                "payment_status": "paid",
                "payment_method": "tarjeta",
                "updated_at": now,
            },
            "$push": {
                "status_history": {
                    "status": "payment_confirmed",
                    "timestamp": now,
                    "by": "customer_checkout",
                }
            },
        },
    )
    # Notify operator dashboard in real-time
    await emit_realtime("order_status", {
        "order_id": order_id,
        "order_number": order.get("order_number"),
        "payment_status": "paid",
        "payment_method": "tarjeta",
        "updated_at": now,
    })
    return {"ok": True, "detail": "Payment confirmed"}


# ─────────────────────────────────────────────────────────────────────────────
# AUTHENTICATED — requiere customer token
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/me")
async def get_customer_profile(current_customer: dict = Depends(get_current_customer)):
    return {
        "id": current_customer.get("id"),
        "name": current_customer.get("name", ""),
        "email": current_customer.get("email", ""),
        "phone": current_customer.get("phone", ""),
        "address": current_customer.get("address", ""),
    }


@router.get("/orders")
async def get_customer_orders(current_customer: dict = Depends(get_current_customer)):
    customer_id = current_customer["id"]
    customer_email = current_customer.get("email", "")

    # Get all customer IDs with the same email
    linked_ids = await _get_customer_ids_by_email(customer_email) if customer_email else set()
    linked_ids.add(customer_id)

    query = {"$or": [{"customer_id": {"$in": list(linked_ids)}}]}
    if customer_email:
        query["$or"].append({"customer_email": customer_email})

    orders = await db.orders.find(
        query,
        {"_id": 0},
    ).sort("created_at", -1).to_list(100)

    for o in orders:
        if "order_number" not in o:
            o["order_number"] = o.get("id", "")[:8]
        if "total_amount" not in o:
            o["total_amount"] = 0.0
    return orders


@router.get("/pending-payments")
async def get_pending_payments(current_customer: dict = Depends(get_current_customer)):
    customer_id = current_customer["id"]
    customer_email = current_customer.get("email", "")

    # Get all customer IDs with the same email
    linked_ids = await _get_customer_ids_by_email(customer_email) if customer_email else set()
    linked_ids.add(customer_id)

    query = {
        "$or": [{"customer_id": {"$in": list(linked_ids)}}],
        "payment_status": {"$in": ["unpaid", "pending", "pending_verification"]},
        "total_amount": {"$gt": 0},
    }
    if customer_email:
        query["$or"].append({"customer_email": customer_email})

    orders = await db.orders.find(
        query,
        {"_id": 0},
    ).sort("created_at", -1).to_list(100)

    for o in orders:
        if "order_number" not in o:
            o["order_number"] = o.get("id", "")[:8]
    return orders


@router.get("/membership-status")
async def get_membership_status(current_customer: dict = Depends(get_current_customer)):
    now = datetime.now(timezone.utc).isoformat()
    membership = await db.memberships.find_one(
        {
            "customer_id": current_customer["id"],
            "status": "active",
            "$or": [
                {"expires_at": {"$exists": False}},
                {"expires_at": {"$gt": now}},
            ],
        },
        {"_id": 0},
    )
    return {
        "has_membership": membership is not None,
        "membership_plan": membership.get("plan") if membership else None,
    }


# ── Helper para verificar membresía activa ────────────────────────────────────
async def _require_membership(customer_id: str):
    now = datetime.now(timezone.utc).isoformat()
    membership = await db.memberships.find_one({
        "customer_id": customer_id,
        "status": "active",
        "$or": [
            {"expires_at": {"$exists": False}},
            {"expires_at": {"$gt": now}},
        ],
    })
    if not membership:
        raise HTTPException(status_code=403, detail="Active membership required")
    return membership


@router.get("/preferences")
async def get_customer_preferences(current_customer: dict = Depends(get_current_customer)):
    await _require_membership(current_customer["id"])
    prefs = await db.customer_preferences.find_one(
        {"customer_id": current_customer["id"]},
        {"_id": 0},
    )
    if not prefs:
        return {}
    prefs.pop("customer_id", None)
    return prefs


@router.post("/preferences")
async def save_customer_preferences(
    prefs: dict,
    current_customer: dict = Depends(get_current_customer),
):
    await _require_membership(current_customer["id"])
    now = datetime.now(timezone.utc).isoformat()

    existing = await db.customer_preferences.find_one({"customer_id": current_customer["id"]})
    current_version = existing.get("version", 0) if existing else 0

    clean_prefs = {k: v for k, v in prefs.items() if v not in (None, "")}
    clean_prefs["customer_id"] = current_customer["id"]
    clean_prefs["updated_at"] = now
    clean_prefs["version"] = current_version + 1

    await db.customer_preferences.update_one(
        {"customer_id": current_customer["id"]},
        {"$set": clean_prefs},
        upsert=True,
    )
    return {"ok": True, "updated_at": now, "version": clean_prefs["version"]}


@router.delete("/preferences")
async def delete_customer_preferences(current_customer: dict = Depends(get_current_customer)):
    result = await db.customer_preferences.delete_one({"customer_id": current_customer["id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="No preferences found")
    return {"ok": True}


async def _get_customer_ids_by_email(email: str) -> set:
    """Get all customer IDs that share the same email — handles duplicate customer records."""
    if not email:
        return set()
    customers = await db.customers.find(
        {"email": {"$regex": f"^{email}$", "$options": "i"}},
        {"_id": 0, "id": 1},
    ).to_list(20)
    return {c["id"] for c in customers if c.get("id")}


async def _customer_owns_order(order: dict, current_customer: dict) -> bool:
    """Check if the logged-in customer owns the order (by customer_id OR email match)."""
    current_id = current_customer["id"]
    current_email = current_customer.get("email", "").lower()
    order_cid = order.get("customer_id", "")

    # Direct ID match
    if order_cid == current_id:
        return True

    # Email match on the order itself
    order_email = (order.get("customer_email") or "").lower()
    if current_email and order_email and order_email == current_email:
        return True

    # Check if order's customer_id belongs to a customer record with same email
    if order_cid and current_email:
        linked_ids = await _get_customer_ids_by_email(current_email)
        if order_cid in linked_ids:
            return True

    return False


@router.post("/order/{order_id}/mark-zelle")
async def mark_zelle_payment(
    order_id: str,
    method: str = Query("zelle"),
    current_customer: dict = Depends(get_current_customer),
):
    # Buscar la orden solo por id primero
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    if not await _customer_owns_order(order, current_customer):
        raise HTTPException(status_code=403, detail="Not your order")

    if order.get("payment_status") == "paid":
        return {"ok": True, "detail": "Already paid"}

    payment_method = method if method in ("zelle", "venmo", "cashapp") else "zelle"
    now = datetime.now(timezone.utc).isoformat()
    await db.orders.update_one(
        {"id": order_id},
        {
            "$set": {
                "payment_status": "pending_verification",
                "payment_method": payment_method,
                "updated_at": now,
            },
            "$push": {
                "status_history": {
                    "status": f"{payment_method}_submitted",
                    "timestamp": now,
                    "by": "customer_portal",
                }
            },
        },
    )
    # Notify operator dashboard in real-time
    await emit_realtime("order_status", {
        "order_id": order_id,
        "order_number": order.get("order_number"),
        "payment_status": "pending_verification",
        "payment_method": payment_method,
        "updated_at": now,
    })
    return {"ok": True, "detail": f"Payment via {payment_method} submitted for verification"}


@router.post("/order/{order_id}/checkout-auth")
async def create_authenticated_checkout(
    order_id: str,
    request: Request,
    current_customer: dict = Depends(get_current_customer),
):
    # Buscar la orden solo por id
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    if not await _customer_owns_order(order, current_customer):
        raise HTTPException(status_code=403, detail="Not your order")

    if order.get("payment_status") == "paid":
        raise HTTPException(status_code=400, detail="Order already paid")

    total = float(order.get("total_amount") or 0)
    if total <= 0:
        raise HTTPException(status_code=400, detail="Invalid order total")
    if not _get_stripe_key():
        raise HTTPException(status_code=503, detail="Payment service not configured")

    try:
        import stripe
        stripe.api_key = _get_stripe_key()
        base_url = str(request.base_url).rstrip("/")
        frontend = _get_frontend_url() or base_url

        session = stripe.checkout.Session.create(
            payment_method_types=["card"],
            line_items=[{
                "price_data": {
                    "currency": "usd",
                    "product_data": {
                        "name": f"Ventura Fresh Laundry - {order.get('order_number', '')}",
                        "description": order.get("service_type", "Laundry Service"),
                    },
                    "unit_amount": int(total * 100),
                },
                "quantity": 1,
            }],
            mode="payment",
            success_url=f"{frontend}/account?paid={order_id}",
            cancel_url=f"{frontend}/account",
            metadata={"order_id": order_id, "order_number": order.get("order_number", "")},
        )
        return {"url": session.url}
    except Exception as exc:
        logger.error("Stripe checkout error: %s", exc)
        raise HTTPException(status_code=500, detail="Payment service error")


# ─────────────────────────────────────────────────────────────────────────────
# UPLOAD DE COMPROBANTE + OCR  (usa get_current_customer, no get_current_user)
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/upload-receipt")
async def upload_receipt(
    file: UploadFile = File(...),
    context: Optional[str] = Query(None),
    current_customer: dict = Depends(get_current_customer),
):
    """Cliente sube un comprobante de pago; devuelve el file_id para OCR."""
    if not _HAS_FILE_UPLOADS:
        raise HTTPException(status_code=503, detail="File upload service not available")
    data = await file.read()
    if len(data) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="File too large (max 10 MB)")

    ct = file.content_type or ""
    if ct not in ALLOWED_RECEIPT_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"File type not allowed. Use: {', '.join(ALLOWED_RECEIPT_TYPES)}",
        )

    ext = file.filename.rsplit(".", 1)[-1].lower() if file.filename and "." in file.filename else "jpg"
    uid = str(uuid.uuid4())
    storage_path = f"ventura-fresh-laundry/customer_receipts/{current_customer['id']}/{uid}.{ext}"

    result = put_object(storage_path, data, ct)

    file_record = {
        "id": uid,
        "storage_path": result["path"],
        "original_filename": file.filename,
        "content_type": ct,
        "size": result.get("size", len(data)),
        "context": context,
        "uploaded_by": current_customer["id"],
        "uploader_type": "customer",
        "is_deleted": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.files.insert_one(file_record)

    return {
        "id": uid,
        "filename": file.filename,
        "content_type": ct,
        "size": file_record["size"],
    }


@router.post("/ocr-receipt/{file_id}")
async def ocr_receipt(
    file_id: str,
    current_customer: dict = Depends(get_current_customer),
):
    """
    Corre OCR sobre un comprobante subido por el cliente.
    Endpoint separado de /api/files/ocr/{file_id} que usa get_current_user (staff).
    """
    # Solo el dueño del archivo puede correr OCR sobre él
    record = await db.files.find_one(
        {
            "id": file_id,
            "uploaded_by": current_customer["id"],
            "uploader_type": "customer",
            "is_deleted": False,
        },
        {"_id": 0},
    )
    if not record:
        raise HTTPException(status_code=404, detail="File not found")

    ct = record.get("content_type", "")
    if not ct.startswith("image/"):
        raise HTTPException(status_code=400, detail="OCR only works with images")

    ocr_log = {
        "id": str(uuid.uuid4()),
        "file_id": file_id,
        "user_id": current_customer["id"],
        "user_type": "customer",
        "filename": record.get("original_filename", ""),
        "status": "processing",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    try:
        image_data, _ = get_object(record["storage_path"])
    except Exception as exc:
        logger.error("OCR download failed: %s", exc)
        ocr_log["status"] = "error"
        ocr_log["error"] = "download_failed"
        await db.ocr_logs.insert_one(ocr_log)
        raise HTTPException(status_code=500, detail="Failed to download image")

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
            session_id=f"customer-ocr-{file_id}",
            system_message=(
                "You are a receipt/payment OCR assistant. "
                "Analyze the image and extract the total amount paid. "
                'Return ONLY valid JSON: {"amount": <number>, "description": "<text>", '
                '"date": "<YYYY-MM-DD or empty>", "vendor": "<name or empty>"} '
                "If you cannot determine a field, use 0 for amount, empty string for others."
            ),
        )
        chat.with_model("openai", "gpt-4o")

        img = ImageContent(image_base64=b64)
        user_msg = UserMessage(
            text="Extract the total amount paid from this payment receipt.",
            file_contents=[img],
        )
        response_text = await chat.send_message(user_msg)

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

        ocr_log["status"] = "success"
        ocr_log["result"] = extracted
        ocr_log["amount_extracted"] = extracted["amount"] > 0
        await db.ocr_logs.insert_one(ocr_log)

        return extracted

    except Exception as exc:
        logger.error("Customer OCR failed: %s", exc)
        ocr_log["status"] = "error"
        ocr_log["error"] = str(exc)[:200]
        await db.ocr_logs.insert_one(ocr_log)
        raise HTTPException(status_code=500, detail=f"OCR analysis failed: {str(exc)}")


@router.get("/files/{file_id}/download")
async def download_customer_file(
    file_id: str,
    current_customer: dict = Depends(get_current_customer),
):
    record = await db.files.find_one(
        {
            "id": file_id,
            "uploaded_by": current_customer["id"],
            "uploader_type": "customer",
            "is_deleted": False,
        }
    )
    if not record:
        raise HTTPException(status_code=404, detail="File not found")
    data, content_type = get_object(record["storage_path"])
    return Response(
        content=data,
        media_type=record.get("content_type", content_type),
        headers={
            "Content-Disposition": f'inline; filename="{record.get("original_filename", "file")}"'
        },
    )