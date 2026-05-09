"""Customer-facing endpoints — public order lookup, Stripe checkout, membership, preferences"""
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
from utils import (
    get_customer_ids_by_email,
    customer_owns_order,
    calculate_final_amount_with_membership,
    is_active_member,
    create_audit_log,
    get_customer_cycle_usage,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/customer", tags=["Customer"])


def _get_stripe_key():
    return os.environ.get("STRIPE_SECRET_KEY") or os.environ.get("STRIPE_API_KEY", "")


def _get_frontend_url():
    return (
        os.environ.get("FRONTEND_URL")
        or os.environ.get("REACT_APP_BACKEND_URL")
        or os.environ.get("BUSINESS_WEBSITE", "")
    )


MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB
ALLOWED_RECEIPT_TYPES = {"image/jpeg", "image/jpg", "image/png", "image/webp", "image/heic"}


# ==================== PUBLIC — sin autenticación ====================

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
    """Called when customer returns from Stripe checkout with ?paid=1"""
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


@router.get("/payment-info")
async def get_payment_info():
    """Get payment methods info (Zelle, Venmo, CashApp)"""
    return {
        "zelle_phone": "(805) 626-2524",
        "zelle_handle": "VFLaundry",
        "venmo_handle": "@VFLaundry",
        "cashapp_tag": "$VFLaundry",
    }


# ==================== AUTHENTICATED — require customer token ====================

@router.get("/me")
async def get_customer_profile(current_customer: dict = Depends(get_current_customer)):
    """Get customer profile"""
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
    """Update customer profile"""
    allowed = {"name", "phone", "address", "city", "state", "zip_code"}
    updates = {k: v for k, v in body.items() if k in allowed and v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No valid fields to update")

    city = updates.get("city", current_customer.get("city", ""))
    state = updates.get("state", current_customer.get("state", ""))
    zip_code = updates.get("zip_code", current_customer.get("zip_code", ""))
    addr = updates.get("address") or current_customer.get("address", "")

    if any(k in updates for k in ("city", "state", "zip_code")) and addr:
        base_addr = addr.split(",")[0].strip() if "," in addr else addr
        addr_parts = [p for p in [base_addr, city, state, zip_code] if p]
        updates["address"] = ", ".join(addr_parts)

    updates["updated_at"] = datetime.now(timezone.utc).isoformat()

    await db.customers.update_one(
        {"id": current_customer["id"]},
        {"$set": updates},
    )
    
    # Sincronizar otros registros con el mismo email
    customer_email = current_customer.get("email", "")
    if customer_email:
        await db.customers.update_many(
            {
                "email": {"$regex": f"^{customer_email}$", "$options": "i"},
                "id": {"$ne": current_customer["id"]},
            },
            {
                "$set": {
                    k: v
                    for k, v in updates.items()
                    if k in ("phone", "address", "city", "state", "zip_code", "updated_at")
                }
            },
        )

    updated = await db.customers.find_one(
        {"id": current_customer["id"]}, {"_id": 0, "password_hash": 0}
    )
    return updated


@router.get("/orders")
async def get_customer_orders(current_customer: dict = Depends(get_current_customer)):
    """Obtiene todas las órdenes del cliente, con campos de desglose de membresía."""
    customer_id = current_customer["id"]
    customer_email = current_customer.get("email", "")

    linked_ids = await get_customer_ids_by_email(customer_email) if customer_email else set()
    linked_ids.add(customer_id)

    query = {"$or": [{"customer_id": {"$in": list(linked_ids)}}]}
    if customer_email:
        query["$or"].append({"customer_email": customer_email})

    orders = await db.orders.find(query, {"_id": 0}).sort("created_at", -1).to_list(100)

    has_active_membership = is_active_member(None, current_customer)

    for order in orders:
        if "order_number" not in order:
            order["order_number"] = order.get("id", "")[:8]
        if "total_amount" not in order:
            order["total_amount"] = 0.0

        if has_active_membership and order.get("actual_lbs") and order.get("payment_status") != "paid":
            try:
                breakdown = await calculate_final_amount_with_membership(order, current_customer)
                if breakdown:
                    order["extra_charge"] = breakdown["total"]
                    order["membership_discount"] = breakdown["membership_discount"]
                    order["lbs_from_allowance"] = breakdown.get("lbs_covered", 0)
                    order["extra_lbs_billed"] = breakdown.get("lbs_extra", 0)
                else:
                    order.setdefault("extra_charge", 0.0)
                    order.setdefault("lbs_from_allowance", 0)
                    order.setdefault("extra_lbs_billed", 0)
            except Exception:
                order.setdefault("extra_charge", 0.0)
                order.setdefault("lbs_from_allowance", 0)
                order.setdefault("extra_lbs_billed", 0)
        else:
            order.setdefault("extra_charge", 0.0)
            order.setdefault("lbs_from_allowance", 0)
            order.setdefault("extra_lbs_billed", 0)

    return orders


@router.get("/pending-payments")
async def get_pending_payments(current_customer: dict = Depends(get_current_customer)):
    """Devuelve solo las órdenes que requieren pago real (excluye las cubiertas por membresía)."""
    customer_id = current_customer["id"]
    customer_email = current_customer.get("email", "")

    linked_ids = await get_customer_ids_by_email(customer_email) if customer_email else set()
    linked_ids.add(customer_id)

    query = {
        "$or": [{"customer_id": {"$in": list(linked_ids)}}],
        "payment_status": {"$in": ["unpaid", "pending", "pending_verification"]},
        "total_amount": {"$gt": 0},
    }
    if customer_email:
        query["$or"].append({"customer_email": customer_email})

    orders = await db.orders.find(query, {"_id": 0}).sort("created_at", -1).to_list(100)

    has_active_membership = is_active_member(None, current_customer)
    result = []

    for order in orders:
        if "order_number" not in order:
            order["order_number"] = order.get("id", "")[:8]

        extra_charge = float(order.get("total_amount", 0))
        covered_by_membership = False

        if has_active_membership and order.get("actual_lbs"):
            try:
                breakdown = await calculate_final_amount_with_membership(order, current_customer)
                if breakdown:
                    extra_charge = breakdown["total"]
                    order["extra_charge"] = extra_charge
                    order["membership_discount"] = breakdown["membership_discount"]
                    order["lbs_from_allowance"] = breakdown.get("lbs_covered", 0)
                    order["extra_lbs_billed"] = breakdown.get("lbs_extra", 0)
                    covered_by_membership = extra_charge <= 0.50
                else:
                    order.setdefault("extra_charge", extra_charge)
            except Exception:
                order.setdefault("extra_charge", extra_charge)
        else:
            order["extra_charge"] = float(order.get("total_amount", 0))

        if covered_by_membership:
            continue
        if order.get("payment_method") == "membership_covered" and order.get("payment_status") != "paid":
            continue

        result.append(order)

    return result


@router.post("/order/{order_id}/apply-membership")
async def customer_apply_membership(
    order_id: str,
    current_customer: dict = Depends(get_current_customer),
):
    """Aplica la membresía activa del cliente a una orden pendiente."""
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order or not await customer_owns_order(order, current_customer):
        raise HTTPException(status_code=404, detail="Order not found")

    if order.get("payment_status") == "paid":
        raise HTTPException(status_code=400, detail="Order already paid")

    if not is_active_member(order, current_customer):
        raise HTTPException(status_code=403, detail="No active membership")

    breakdown = await calculate_final_amount_with_membership(order, current_customer)
    if not breakdown:
        raise HTTPException(status_code=400, detail="Cannot calculate membership coverage")

    if breakdown["total"] > 0.50:
        raise HTTPException(
            status_code=400,
            detail=f"Order not fully covered. Extra amount due: ${breakdown['total']:.2f}",
        )

    now_iso = datetime.now(timezone.utc).isoformat()
    await db.orders.update_one(
        {"id": order_id},
        {
            "$set": {
                "payment_status": "paid",
                "payment_method": "membership_covered",
                "amount_paid": 0.0,
                "processing_fee": 0.0,
                "change_due": 0.0,
                "paid_at": now_iso,
                "updated_at": now_iso,
                "extra_charge": breakdown["total"],
                "lbs_from_allowance": breakdown.get("lbs_covered", 0),
                "extra_lbs_billed": breakdown.get("lbs_extra", 0),
                "membership_discount": breakdown["membership_discount"],
            }
        },
    )

    await create_audit_log(
        "CUSTOMER_APPLIED_MEMBERSHIP",
        "order",
        order_id,
        current_customer["id"],
        {"order_number": order.get("order_number")},
    )

    return {"ok": True, "message": "Order covered by membership"}


@router.get("/membership-status")
async def get_membership_status(current_customer: dict = Depends(get_current_customer)):
    """Get customer membership status"""
    has_membership = is_active_member(None, current_customer)
    plan = current_customer.get("membership_plan") if has_membership else None
    return {
        "has_membership": has_membership,
        "membership_plan": plan,
        "membership_status": current_customer.get("membership_status") if has_membership else None,
        "membership_start_date": current_customer.get("membership_start_date"),
    }


@router.get("/membership-usage")
async def get_membership_usage(current_customer: dict = Depends(get_current_customer)):
    """Get customer membership usage (lbs used this cycle)"""
    try:
        usage = await get_customer_cycle_usage(current_customer["id"])
        if usage:
            return usage
    except Exception:
        logger.warning("get_customer_cycle_usage falló")
    return {}


# ── Helper para verificar membresía activa ───────────────────────────

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


# ── Preferencias de lavandería ───────────────────────────────────────

@router.get("/preferences")
async def get_customer_preferences(current_customer: dict = Depends(get_current_customer)):
    """Get customer laundry preferences (requires active membership)"""
    await _require_membership(current_customer["id"])
    prefs = await db.customer_preferences.find_one(
        {"customer_id": current_customer["id"]}, {"_id": 0}
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
    """Save customer laundry preferences (requires active membership)"""
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
    """Delete customer laundry preferences"""
    result = await db.customer_preferences.delete_one({"customer_id": current_customer["id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="No preferences found")
    return {"ok": True}


# ── Marcar pago por Zelle / Venmo / CashApp ──────────────────────────

@router.post("/order/{order_id}/mark-zelle")
async def mark_zelle_payment(
    order_id: str,
    method: str = Query("zelle"),
    current_customer: dict = Depends(get_current_customer),
):
    """Mark order as paid via Zelle/Venmo/CashApp (pending verification)"""
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order or not await customer_owns_order(order, current_customer):
        raise HTTPException(status_code=404, detail="Order not found")

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
    """Create Stripe checkout session for authenticated customer"""
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order or not await customer_owns_order(order, current_customer):
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
        frontend = _get_frontend_url() or str(request.base_url).rstrip("/")

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


# ── Upload de comprobante + OCR ──────────────────────────────────────

@router.post("/upload-receipt")
async def upload_receipt(
    file: UploadFile = File(...),
    context: Optional[str] = Query(None),
    current_customer: dict = Depends(get_current_customer),
):
    """Upload payment receipt image for verification"""
    data = await file.read()
    if len(data) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="File too large (max 10 MB)")

    ct = file.content_type or ""
    if ct not in ALLOWED_RECEIPT_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"File type not allowed. Use: {', '.join(ALLOWED_RECEIPT_TYPES)}",
        )

    ext = (
        file.filename.rsplit(".", 1)[-1].lower()
        if file.filename and "." in file.filename
        else "jpg"
    )
    uid = str(uuid.uuid4())
    storage_path = (
        f"ventura-fresh-laundry/customer_receipts/{current_customer['id']}/{uid}.{ext}"
    )
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

    return {"id": uid, "filename": file.filename, "content_type": ct, "size": len(data)}


@router.post("/ocr-receipt/{file_id}")
async def ocr_receipt(
    file_id: str,
    current_customer: dict = Depends(get_current_customer),
):
    """AI-powered OCR to validate payment receipt"""
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
                "1. Is this a COMPLETED/SENT payment transaction?\n"
                "2. Extract the total amount that was ACTUALLY PAID.\n"
                "3. Extract the date, recipient/vendor name.\n\n"
                "CRITICAL RULES:\n"
                "- A payment REQUEST screen is NOT a valid payment. Mark is_valid_payment=false.\n"
                "- Only COMPLETED transactions showing 'Sent', 'Paid', 'Completed' are valid.\n"
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
    """Download customer uploaded file"""
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

    data_b64 = record.get("data_base64")
    if data_b64:
        data = base64.b64decode(data_b64)
    else:
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


# ── Imágenes de recolección y entrega (autoridad única en /customer/*) ─

@router.get("/order/{order_id}/pickup-image/view")
async def get_customer_pickup_image(
    order_id: str,
    current_customer: dict = Depends(get_current_customer),
):
    """Get pickup proof image for customer order"""
    order = await db.orders.find_one(
        {"$or": [{"id": order_id}, {"order_id": order_id}, {"order_number": order_id}]},
        {"_id": 0},
    )
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if not await customer_owns_order(order, current_customer):
        raise HTTPException(status_code=403, detail="Not your order")

    real_id = order.get("id") or order.get("order_id") or order_id

    image_record = await db.pickup_images.find_one(
        {"order_id": real_id}, {"_id": 0}, sort=[("created_at", -1)]
    )

    if not image_record and order.get("pickup_image_data"):
        data = base64.b64decode(order["pickup_image_data"])
        return Response(content=data, media_type="image/jpeg", headers={
            "Content-Disposition": f'inline; filename="pickup_{real_id}.jpg"',
            "Cache-Control": "private, max-age=86400",
        })

    if not image_record:
        raise HTTPException(status_code=404, detail="No pickup image found for this order")

    data_b64 = image_record.get("data_base64")
    if not data_b64:
        raise HTTPException(status_code=404, detail="No image data available")

    data = base64.b64decode(data_b64)
    filename = image_record.get("original_filename") or f"pickup_{real_id}.jpg"
    return Response(
        content=data,
        media_type=image_record.get("content_type", "image/jpeg"),
        headers={
            "Content-Disposition": f'inline; filename="{filename}"',
            "Cache-Control": "private, max-age=86400",
        },
    )


@router.get("/order/{order_id}/delivery-image/view")
async def get_customer_delivery_image(
    order_id: str,
    current_customer: dict = Depends(get_current_customer),
):
    """Get delivery proof image for customer order"""
    order = await db.orders.find_one(
        {"$or": [{"id": order_id}, {"order_id": order_id}, {"order_number": order_id}]},
        {"_id": 0},
    )
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if not await customer_owns_order(order, current_customer):
        raise HTTPException(status_code=403, detail="Not your order")

    real_id = order.get("id") or order.get("order_id") or order_id

    image_record = await db.delivery_images.find_one(
        {"order_id": real_id}, {"_id": 0}, sort=[("created_at", -1)]
    )

    if not image_record and order.get("delivery_image_data"):
        data = base64.b64decode(order["delivery_image_data"])
        return Response(content=data, media_type="image/jpeg", headers={
            "Content-Disposition": f'inline; filename="delivery_{real_id}.jpg"',
            "Cache-Control": "private, max-age=86400",
        })

    if not image_record:
        raise HTTPException(status_code=404, detail="No delivery image found for this order")

    data_b64 = image_record.get("data_base64")
    if not data_b64:
        raise HTTPException(status_code=404, detail="No image data available")

    data = base64.b64decode(data_b64)
    filename = image_record.get("original_filename") or f"delivery_{real_id}.jpg"
    return Response(
        content=data,
        media_type=image_record.get("content_type", "image/jpeg"),
        headers={
            "Content-Disposition": f'inline; filename="{filename}"',
            "Cache-Control": "private, max-age=86400",
        },
    )


# ── Recurrencia ──────────────────────────────────────────────────────

@router.get("/orders/{order_id}/recurrence")
async def get_order_recurrence_customer(
    order_id: str,
    current_customer: dict = Depends(get_current_customer),
):
    """Get recurrence settings for an order"""
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order or not await customer_owns_order(order, current_customer):
        raise HTTPException(status_code=404, detail="Order not found")

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
        "recurrence_days": order.get("recurrence_days", []),
        "recurrence_end_date": order.get("recurrence_end_date"),
        "upcoming_pickups": upcoming,
    }


@router.patch("/orders/{order_id}/recurrence")
async def update_order_recurrence_customer(
    order_id: str,
    body: dict,
    current_customer: dict = Depends(get_current_customer),
):
    """Update recurrence settings for an order"""
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order or not await customer_owns_order(order, current_customer):
        raise HTTPException(status_code=404, detail="Order not found")

    recurrence = body.get("recurrence", order.get("recurrence", "once"))
    recurrence_days = body.get("recurrence_days")
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