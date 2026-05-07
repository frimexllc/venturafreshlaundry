# routes/customer.py
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
        "city": current_customer.get("city", ""),
        "state": current_customer.get("state", ""),
        "zip_code": current_customer.get("zip_code", ""),
    }


@router.put("/me")
async def update_customer_profile(
    body: dict,
    current_customer: dict = Depends(get_current_customer),
):
    """Update customer profile (name, phone, address, city, state, zip_code)."""
    allowed = {"name", "phone", "address", "city", "state", "zip_code"}
    updates = {k: v for k, v in body.items() if k in allowed and v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No valid fields to update")

    # Build full address from parts if individual fields provided
    city = updates.get("city", current_customer.get("city", ""))
    state = updates.get("state", current_customer.get("state", ""))
    zip_code = updates.get("zip_code", current_customer.get("zip_code", ""))
    addr = updates.get("address") or current_customer.get("address", "")

    # If city/state/zip updated but address is a full string, reconstruct
    if any(k in updates for k in ("city", "state", "zip_code")) and addr:
        base_addr = addr.split(",")[0].strip() if "," in addr else addr
        addr_parts = [p for p in [base_addr, city, state, zip_code] if p]
        updates["address"] = ", ".join(addr_parts)

    updates["updated_at"] = datetime.now(timezone.utc).isoformat()

    await db.customers.update_one(
        {"id": current_customer["id"]},
        {"$set": updates},
    )

    # Also update all linked customer records with same email
    customer_email = current_customer.get("email", "")
    if customer_email:
        await db.customers.update_many(
            {"email": {"$regex": f"^{customer_email}$", "$options": "i"}, "id": {"$ne": current_customer["id"]}},
            {"$set": {k: v for k, v in updates.items() if k in ("phone", "address", "city", "state", "zip_code", "updated_at")}},
        )

    updated = await db.customers.find_one({"id": current_customer["id"]}, {"_id": 0, "password_hash": 0})
    return updated


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


# ─────────────────────────────────────────────────────────────────────────────
# PAYMENT INFO (público)
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/payment-info")
async def get_payment_info():
    """
    Devuelve la información de pago (Zelle, Venmo, CashApp) para mostrar en el modal.
    Esto evita el error 404 en el frontend.
    """
    return {
        "zelle_phone": "(805) 626-2524",
        "zelle_handle": "VFLaundry",
        "venmo_handle": "@VFLaundry",
        "cashapp_tag": "$VFLaundry",
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

    # Store binary data as base64 in MongoDB — no external storage dependency
    data_b64 = base64.b64encode(data).decode("utf-8")

    file_record = {
        "id": uid,
        "storage_path": storage_path,
        "original_filename": file.filename,
        "content_type": ct,
        "size": len(data),
        "data_base64": data_b64,
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
        "size": len(data),
    }


@router.post("/ocr-receipt/{file_id}")
async def ocr_receipt(
    file_id: str,
    current_customer: dict = Depends(get_current_customer),
):
    """
    Corre OCR sobre un comprobante subido por el cliente.
    Verifica que sea un pago COMPLETADO real (no preview, no solicitud).
    """
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

    # Read image from MongoDB (data_base64) or fallback to storage
    data_b64_stored = record.get("data_base64")
    if data_b64_stored:
        image_data = base64.b64decode(data_b64_stored)
    else:
        try:
            from file_uploads import get_object as local_get_object
            image_data, _ = local_get_object(record["storage_path"])
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
                "You are a strict payment verification assistant for Ventura Fresh Laundry. "
                "Analyze the uploaded image and determine:\n"
                "1. Is this a COMPLETED/SENT payment transaction? (Zelle sent, Venmo paid, CashApp sent, bank transfer completed)\n"
                "2. Extract the total amount that was ACTUALLY PAID.\n"
                "3. Extract the date, recipient/vendor name.\n\n"
                "CRITICAL RULES:\n"
                "- A payment REQUEST screen (e.g. 'Request $X' or 'Pay Now' button visible) is NOT a valid payment. Mark is_valid_payment=false.\n"
                "- A payment PREVIEW or confirmation screen BEFORE the user taps 'Send' is NOT valid.\n"
                "- Only COMPLETED transactions showing 'Sent', 'Paid', 'Completed', 'Transferred' are valid.\n"
                "- Screenshots showing transaction history with a completed status are valid.\n"
                "- If the image is not a payment receipt at all (random photo, document, etc.), mark is_valid_payment=false.\n"
                "- If you cannot clearly see a completed payment, default to is_valid_payment=false.\n\n"
                "Return ONLY valid JSON, no markdown, no extra text:\n"
                '{"is_valid_payment": true|false, "amount": <number or 0>, '
                '"description": "<brief description>", '
                '"date": "<YYYY-MM-DD or empty>", "vendor": "<recipient name or empty>", '
                '"rejection_reason": "<reason in Spanish if rejected, empty if valid>"}'
            ),
        )
        chat.with_model("openai", "gpt-4o")

        img = ImageContent(image_base64=b64)
        user_msg = UserMessage(
            text="Analyze this image. Is it a COMPLETED payment receipt? Extract the amount paid.",
            file_contents=[img],
        )
        response_text = await chat.send_message(user_msg)

        cleaned = response_text.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
        result = _json.loads(cleaned)

        is_valid = bool(result.get("is_valid_payment", False))
        extracted = {
            "is_valid_payment": is_valid,
            "amount": float(result.get("amount", 0)),
            "description": str(result.get("description", "")),
            "date": str(result.get("date", "")),
            "vendor": str(result.get("vendor", "")),
            "rejection_reason": str(result.get("rejection_reason", "")) if not is_valid else "",
        }

        ocr_log["status"] = "success"
        ocr_log["result"] = extracted
        ocr_log["amount_extracted"] = extracted["amount"] > 0
        ocr_log["is_valid_payment"] = is_valid
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
        },
        {"_id": 0},
    )
    if not record:
        raise HTTPException(status_code=404, detail="File not found")

    # Read from MongoDB
    data_b64 = record.get("data_base64")
    if data_b64:
        data = base64.b64decode(data_b64)
    else:
        # Fallback to local storage
        try:
            from file_uploads import get_object as local_get_object
            data, _ = local_get_object(record["storage_path"])
        except Exception:
            raise HTTPException(status_code=404, detail="File data not found")

    return Response(
        content=data,
        media_type=record.get("content_type", "application/octet-stream"),
        headers={
            "Content-Disposition": f'inline; filename="{record.get("original_filename", "file")}"'
        },
    )

# ══════════════════════════════════════════════════════════════════════
# Pickup Image para Clientes
# ══════════════════════════════════════════════════════════════════════

@router.get("/order/{order_id}/pickup-image/view")
async def get_customer_pickup_image(
    order_id: str,
    current_customer: dict = Depends(get_current_customer)
):
    """
    Permite al cliente ver la imagen de recolección de su orden.
    """
    # Buscar la orden por múltiples campos
    order = await db.orders.find_one({
        "$or": [
            {"id": order_id},
            {"order_id": order_id},
            {"order_number": order_id}
        ]
    }, {"_id": 0})
    
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    # Verificar que la orden pertenece al cliente
    customer_id = current_customer["id"]
    customer_email = current_customer.get("email", "").lower()
    order_customer_id = order.get("customer_id", "")
    order_email = (order.get("customer_email") or "").lower()
    
    # Verificar propiedad por ID o email
    authorized = False
    if order_customer_id == customer_id or order_email == customer_email:
        authorized = True
    else:
        linked_ids = await _get_customer_ids_by_email(customer_email) if customer_email else set()
        if order_customer_id in linked_ids:
            authorized = True
    
    if not authorized:
        raise HTTPException(status_code=403, detail="Not your order")
    
    real_order_id = order.get("id") or order.get("order_id") or order_id
    
    # Buscar imagen en la colección pickup_images
    image_record = await db.pickup_images.find_one(
        {"order_id": real_order_id},
        {"_id": 0},
        sort=[("created_at", -1)]
    )
    
    # Si no hay en colección, buscar en la orden directamente
    if not image_record and order.get("pickup_image_data"):
        data = base64.b64decode(order["pickup_image_data"])
        return Response(
            content=data,
            media_type="image/jpeg",
            headers={
                "Content-Disposition": f'inline; filename="pickup_{real_order_id}.jpg"',
                "Cache-Control": "private, max-age=86400",
            }
        )
    
    if not image_record:
        raise HTTPException(status_code=404, detail="No pickup image found for this order")
    
    # Obtener los datos de la imagen
    data_b64 = image_record.get("data_base64")
    if not data_b64:
        raise HTTPException(status_code=404, detail="No image data available")
    
    data = base64.b64decode(data_b64)
    filename = image_record.get('original_filename') or f"pickup_{real_order_id}.jpg"
    
    return Response(
        content=data,
        media_type=image_record.get("content_type", "image/jpeg"),
        headers={
            "Content-Disposition": f'inline; filename="{filename}"',
            "Cache-Control": "private, max-age=86400",
        }
    )


@router.get("/order/{order_id}/delivery-image/view")
async def get_customer_delivery_image(
    order_id: str,
    current_customer: dict = Depends(get_current_customer)
):
    """
    Permite al cliente ver la imagen de entrega de su orden.
    """
    order = await db.orders.find_one({
        "$or": [
            {"id": order_id},
            {"order_id": order_id},
            {"order_number": order_id}
        ]
    }, {"_id": 0})

    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    # Verificar propiedad
    customer_id = current_customer["id"]
    customer_email = current_customer.get("email", "").lower()
    order_customer_id = order.get("customer_id", "")
    order_email = (order.get("customer_email") or "").lower()

    authorized = False
    if order_customer_id == customer_id or order_email == customer_email:
        authorized = True
    else:
        linked_ids = await _get_customer_ids_by_email(customer_email) if customer_email else set()
        if order_customer_id in linked_ids:
            authorized = True

    if not authorized:
        raise HTTPException(status_code=403, detail="Not your order")

    real_order_id = order.get("id") or order.get("order_id") or order_id

    # Buscar imagen en delivery_images
    image_record = await db.delivery_images.find_one(
        {"order_id": real_order_id},
        {"_id": 0},
        sort=[("created_at", -1)]
    )

    # Si no hay en colección, buscar en la orden directamente
    if not image_record and order.get("delivery_image_data"):
        data = base64.b64decode(order["delivery_image_data"])
        return Response(
            content=data,
            media_type="image/jpeg",
            headers={
                "Content-Disposition": f'inline; filename="delivery_{real_order_id}.jpg"',
                "Cache-Control": "private, max-age=86400",
            }
        )

    if not image_record:
        raise HTTPException(status_code=404, detail="No delivery image found for this order")

    data_b64 = image_record.get("data_base64")
    if not data_b64:
        raise HTTPException(status_code=404, detail="No image data available")

    data = base64.b64decode(data_b64)
    filename = image_record.get('original_filename') or f"delivery_{real_order_id}.jpg"

    return Response(
        content=data,
        media_type=image_record.get("content_type", "image/jpeg"),
        headers={
            "Content-Disposition": f'inline; filename="{filename}"',
            "Cache-Control": "private, max-age=86400",
        }
    )


# ─────────────────────────────────────────────────────────────────────────────
# RECURRENCIA — autenticado con token de cliente (con soporte para días específicos)
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/orders/{order_id}/recurrence")
async def get_order_recurrence_customer(
    order_id: str,
    current_customer: dict = Depends(get_current_customer),
):
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if not await _customer_owns_order(order, current_customer):
        raise HTTPException(status_code=403, detail="Not your order")

    # Órdenes futuras hijas (pickups generados automáticamente por recurrencia)
    upcoming = await db.orders.find(
        {
            "recurrence_parent_id": order_id,
            "status": {"$nin": ["cancelled", "completed"]},
        },
        {"_id": 0, "id": 1, "order_number": 1, "pickup_date": 1, "status": 1},
    ).sort("pickup_date", 1).to_list(10)

    return {
        "is_recurring": order.get("is_recurring", False),
        "recurrence": order.get("recurrence", "once"),
        "recurrence_days": order.get("recurrence_days", []),   # ← nuevo campo
        "recurrence_end_date": order.get("recurrence_end_date"),
        "upcoming_pickups": upcoming,
    }


@router.patch("/orders/{order_id}/recurrence")
async def update_order_recurrence_customer(
    order_id: str,
    body: dict,
    current_customer: dict = Depends(get_current_customer),
):
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if not await _customer_owns_order(order, current_customer):
        raise HTTPException(status_code=403, detail="Not your order")

    recurrence = body.get("recurrence", order.get("recurrence", "once"))
    recurrence_days = body.get("recurrence_days")        # ← nuevo campo (lista de strings)
    end_date = body.get("recurrence_end_date")
    cancel_future = bool(body.get("cancel_future", False))

    now = datetime.now(timezone.utc).isoformat()
    updates = {
        "recurrence": recurrence,
        "is_recurring": recurrence != "once",
        "recurrence_end_date": end_date,
        "updated_at": now,
    }
    if recurrence_days is not None:
        updates["recurrence_days"] = recurrence_days

    await db.orders.update_one({"id": order_id}, {"$set": updates})

    if cancel_future:
        await db.orders.update_many(
            {
                "recurrence_parent_id": order_id,
                "status": {"$nin": ["cancelled", "completed", "delivered"]},
            },
            {
                "$set": {
                    "status": "cancelled",
                    "cancelled_at": now,
                    "cancellation_reason": "Customer cancelled recurring schedule",
                }
            },
        )

    await emit_realtime("order_status", {
        "order_id": order_id,
        "order_number": order.get("order_number"),
        "recurrence": recurrence,
        "recurrence_days": recurrence_days,
        "updated_at": now,
    })

    return {
        "ok": True,
        "recurrence": recurrence,
        "recurrence_days": recurrence_days,
        "recurrence_end_date": end_date,
    }