"""
Customer Payments & Portal — Combined Module (UNIFIED v1.0)
- Todas las tarifas y cálculos vienen de utils.py
- Sin duplicación de lógica de precios
- Mínimo de $40 unificado con PD_MINIMUM_CHARGE

FIX v1.1:
- checkout-auth ahora usa los campos ya calculados por el backend (extra_charge,
  lbs_from_allowance, membership_discount) en lugar de recalcular, evitando que
  la orden actual se cuente dos veces en el cálculo del allowance del ciclo.
"""

import os
import logging
import uuid
import base64
import json as _json
from datetime import datetime, timezone
from typing import Optional

import stripe
from fastapi import APIRouter, HTTPException, Request, Depends, UploadFile, File, Query
from fastapi.responses import Response
from pydantic import BaseModel

from database import db
from auth import get_current_user, get_current_customer
from realtime import emit_realtime
from utils import (
    get_customer_ids_by_email,
    customer_owns_order,
    calculate_final_amount_with_membership,
    is_active_member,
    create_audit_log,
    get_customer_cycle_usage,
    _get_rate,
    calculate_delivery_fee,
    PRICING,
    PD_MINIMUM_CHARGE,
    MEMBERSHIP_ALLOWANCE_SURCHARGE,
    _get_plan_allowance,
    _normalize_service_type,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/customer", tags=["Customer"])

# ─────────────────────────────────────────────────────────────────────────────
# Configuration & Constants
# ─────────────────────────────────────────────────────────────────────────────

STRIPE_API_KEY = os.environ.get("STRIPE_API_KEY", "")
STRIPE_PUBLISHABLE_KEY = os.environ.get("STRIPE_PUBLISHABLE_KEY", "")
stripe.api_key = STRIPE_API_KEY

STRIPE_PROCESSING_FEE_RATE = 0.03  # 3% card processing fee

MINIMUM_ORDER = PD_MINIMUM_CHARGE  # 40.0

MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB
ALLOWED_RECEIPT_TYPES = {"image/jpeg", "image/jpg", "image/png", "image/webp", "image/heic"}


def _get_stripe_key():
    return STRIPE_API_KEY or os.environ.get("STRIPE_SECRET_KEY", "")


def _get_frontend_url():
    return (
        os.environ.get("FRONTEND_URL")
        or os.environ.get("REACT_APP_BACKEND_URL")
        or os.environ.get("BUSINESS_WEBSITE", "")
    )


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


async def _get_or_create_stripe_customer(customer_doc: dict) -> str:
    """Return existing Stripe customer ID or create a new one."""
    existing_id = customer_doc.get("stripe_customer_id")
    if existing_id:
        return existing_id

    stripe_customer = stripe.Customer.create(
        name=customer_doc.get("name", ""),
        email=customer_doc.get("email", ""),
        phone=customer_doc.get("phone", ""),
        metadata={"internal_id": customer_doc.get("id", "")},
    )
    await db.customers.update_one(
        {"id": customer_doc["id"]},
        {"$set": {"stripe_customer_id": stripe_customer.id, "updated_at": _now()}},
    )
    return stripe_customer.id


async def _find_customer_by_user(current_user: dict) -> Optional[dict]:
    """Look up the customer record for the authenticated user."""
    user_id = current_user.get("id") or current_user.get("customer_id")
    customer = await db.customers.find_one(
        {"$or": [{"id": user_id}, {"user_id": user_id}, {"email": current_user.get("email")}]},
        {"_id": 0},
    )
    return customer


async def _require_membership(customer_id: str):
    """Verify customer has active membership."""
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


# ─────────────────────────────────────────────────────────────────────────────
# KEY FIX: Compute checkout amount from already-stored breakdown fields
# ─────────────────────────────────────────────────────────────────────────────

def _compute_amount_from_stored_fields(order: dict, customer: dict) -> Optional[float]:
    """
    Reads the billing breakdown that was already computed and stored by the
    PUT /orders/{order_id} endpoint (when the operator set actual_lbs).

    This avoids recalling calculate_final_amount_with_membership, which would
    re-query get_remaining_membership_allowance and count this order's lbs
    twice in the current billing cycle (once when saved, once at checkout time).

    Returns the amount to charge (before Stripe processing fee), or None if
    the order is not ready for payment.

    Priority:
      1. extra_charge stored on order (most authoritative — set by PUT /orders)
      2. Recompute only if extra_charge is missing/zero AND actual_lbs is set
         but in that case we use lbs_from_allowance already stored to avoid
         double-counting.
    """
    # ── Fast path: backend already computed and stored the breakdown ──────────
    extra_charge = order.get("extra_charge")
    if extra_charge is not None and float(extra_charge) > 0:
        return float(extra_charge)

    # ── Fully covered by membership (extra_charge == 0, stored explicitly) ───
    # When update_order set payment_status = "paid" / "membership_covered" the
    # amount is genuinely $0 — not missing data.
    if (
        order.get("payment_method") == "membership_covered"
        or order.get("payment_status") == "membership_covered"
    ):
        return 0.0

    # ── Fallback: extra_charge not stored yet (lbs just set, no auto-charge) ─
    # Use lbs_from_allowance that IS stored (computed at PUT /orders time) so
    # we don't double-count. Only recompute the math, not the DB allowance query.
    lbs = float(order.get("actual_lbs") or 0)
    if lbs <= 0:
        # No weight recorded — check add-ons only
        addons_total = sum(
            float(a.get("price", 0)) * int(a.get("qty") or a.get("quantity") or 1)
            for a in (order.get("addon_services") or [])
        )
        delivery_fee = float(order.get("delivery_fee") or
                             calculate_delivery_fee(order.get("distance_miles")))
        if addons_total > 0:
            return round(addons_total + delivery_fee, 2)
        return None  # Nothing to charge

    service_type  = _normalize_service_type(order.get("service_type") or "pickup_delivery")
    plan          = (order.get("service_plan") or "standard").lower()
    is_wf         = service_type == "wash_fold"
    from utils import WF_MINIMUM_LBS
    billable_lbs  = max(lbs, WF_MINIMUM_LBS) if is_wf else lbs

    # Use stored lbs_from_allowance (set by PUT /orders) — do NOT query DB again
    lbs_covered   = float(order.get("lbs_from_allowance") or 0)
    lbs_extra     = float(order.get("extra_lbs_billed") or max(0.0, billable_lbs - lbs_covered))
    allowance_surch = MEMBERSHIP_ALLOWANCE_SURCHARGE.get(plan, 0.0)

    is_member     = is_active_member(order, customer)

    if is_member and lbs_covered > 0:
        # Member with partial or full allowance coverage
        amount = round(lbs_covered * allowance_surch + lbs_extra * _get_rate(service_type, plan, True), 2)
    elif is_member:
        # Member but allowance exhausted — member rates on all lbs
        amount = round(billable_lbs * _get_rate(service_type, plan, True), 2)
    else:
        # Non-member
        amount = round(billable_lbs * _get_rate(service_type, plan, False), 2)
        # Apply P&D $40 minimum only for non-members with no coverage
        if not is_wf:
            full_regular = billable_lbs * _get_rate(service_type, plan, False)
            if full_regular < PD_MINIMUM_CHARGE:
                amount = max(amount, PD_MINIMUM_CHARGE)

    # Add delivery fee and add-ons
    delivery_fee  = float(order.get("delivery_fee") or
                          calculate_delivery_fee(order.get("distance_miles")))
    addons_total  = sum(
        float(a.get("price", 0)) * int(a.get("qty") or a.get("quantity") or 1)
        for a in (order.get("addon_services") or [])
    )
    return round(amount + delivery_fee + addons_total, 2)


# ─────────────────────────────────────────────────────────────────────────────
# Pydantic Models
# ─────────────────────────────────────────────────────────────────────────────

class SaveMethodRequest(BaseModel):
    payment_method_id: str
    customer_name: Optional[str] = None
    customer_email: Optional[str] = None


class ChargeByWeightRequest(BaseModel):
    order_id: str
    actual_weight_lbs: float
    service_type: Optional[str] = None
    service_plan: Optional[str] = None


# =============================================================================
# SECTION 1: PUBLIC ENDPOINTS (no authentication required)
# =============================================================================

@router.get("/order/{order_id}")
async def get_customer_order(order_id: str):
    """Public endpoint to get order details by ID."""
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
        "stripe_processing_fee": float(order.get("stripe_processing_fee") or 0),
    }


@router.post("/order/{order_id}/checkout")
async def create_customer_checkout(order_id: str, request: Request):
    """Public endpoint — creates a Stripe Checkout session for the customer (with 3% card fee)"""
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

    charge_base = max(total, PD_MINIMUM_CHARGE)
    processing_fee = round(charge_base * STRIPE_PROCESSING_FEE_RATE, 2)
    total_with_fee = charge_base + processing_fee

    try:
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
                        "description": f"{order.get('service_type', 'Laundry Service')} (incluye 3% comision tarjeta)",
                    },
                    "unit_amount": int(total_with_fee * 100),
                },
                "quantity": 1,
            }],
            mode="payment",
            success_url=f"{frontend}/customer/pay/{order_id}?paid=1",
            cancel_url=f"{frontend}/customer/pay/{order_id}",
            metadata={"order_id": order_id, "order_number": order.get("order_number", "")},
        )

        await db.orders.update_one(
            {"id": order_id},
            {"$set": {"processing_fee": processing_fee, "updated_at": _now()}}
        )

        return {"url": session.url, "processing_fee": processing_fee, "total_charged": total_with_fee}
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

    now = _now()
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


# =============================================================================
# SECTION 2: STRIPE SETUPINTENT + AUTO-CHARGE (Customer authenticated endpoints)
# =============================================================================

@router.post("/payments/setup-intent")
async def create_setup_intent(current_customer: dict = Depends(get_current_customer)):
    """Create a Stripe SetupIntent so the client can securely collect card details."""
    if not STRIPE_API_KEY:
        raise HTTPException(status_code=503, detail="Stripe not configured")

    customer_doc = await _find_customer_by_user(current_customer)
    if not customer_doc:
        raise HTTPException(status_code=404, detail="Customer record not found")

    stripe_customer_id = await _get_or_create_stripe_customer(customer_doc)

    setup_intent = stripe.SetupIntent.create(
        customer=stripe_customer_id,
        payment_method_types=["card"],
        usage="off_session",
        metadata={"customer_id": customer_doc["id"]},
    )

    return {
        "client_secret": setup_intent.client_secret,
        "publishable_key": STRIPE_PUBLISHABLE_KEY,
        "stripe_customer_id": stripe_customer_id,
    }


@router.post("/payments/save-method")
async def save_payment_method(
    body: SaveMethodRequest,
    current_customer: dict = Depends(get_current_customer),
):
    """Attach PaymentMethod to Stripe customer and save reference in MongoDB."""
    if not STRIPE_API_KEY:
        raise HTTPException(status_code=503, detail="Stripe not configured")

    customer_doc = await _find_customer_by_user(current_customer)
    if not customer_doc:
        raise HTTPException(status_code=404, detail="Customer record not found")

    stripe_customer_id = await _get_or_create_stripe_customer(customer_doc)

    try:
        stripe.PaymentMethod.attach(body.payment_method_id, customer=stripe_customer_id)
        stripe.Customer.modify(
            stripe_customer_id,
            invoice_settings={"default_payment_method": body.payment_method_id},
        )
    except stripe.error.StripeError as e:
        logger.error(f"Error attaching payment method: {e}")
        raise HTTPException(status_code=400, detail=str(e.user_message or e))

    pm = stripe.PaymentMethod.retrieve(body.payment_method_id)
    card = pm.get("card", {})

    now = _now()
    await db.customers.update_one(
        {"id": customer_doc["id"]},
        {
            "$set": {
                "stripe_customer_id": stripe_customer_id,
                "stripe_payment_method_id": body.payment_method_id,
                "card_last4": card.get("last4"),
                "card_brand": card.get("brand"),
                "card_exp_month": card.get("exp_month"),
                "card_exp_year": card.get("exp_year"),
                "card_saved_at": now,
                "updated_at": now,
            }
        },
    )

    return {
        "ok": True,
        "last4": card.get("last4"),
        "brand": card.get("brand"),
        "exp_month": card.get("exp_month"),
        "exp_year": card.get("exp_year"),
    }


@router.get("/payments/method")
async def get_payment_method(current_customer: dict = Depends(get_current_customer)):
    """Return saved card info (masked) for the current customer."""
    customer_doc = await _find_customer_by_user(current_customer)
    if not customer_doc:
        raise HTTPException(status_code=404, detail="Customer not found")

    pm_id = customer_doc.get("stripe_payment_method_id")
    if not pm_id:
        return {"has_card": False}

    return {
        "has_card": True,
        "last4": customer_doc.get("card_last4"),
        "brand": customer_doc.get("card_brand"),
        "exp_month": customer_doc.get("card_exp_month"),
        "exp_year": customer_doc.get("card_exp_year"),
        "saved_at": customer_doc.get("card_saved_at"),
    }


@router.get("/payments/setup-intent-key")
async def get_stripe_publishable_key():
    """Return Stripe publishable key for frontend."""
    return {
        "publishable_key": STRIPE_PUBLISHABLE_KEY,
        "stripe_configured": bool(STRIPE_API_KEY)
    }


@router.delete("/payments/method")
async def delete_payment_method(current_customer: dict = Depends(get_current_customer)):
    """Detach and remove the saved card."""
    customer_doc = await _find_customer_by_user(current_customer)
    if not customer_doc:
        raise HTTPException(status_code=404, detail="Customer not found")

    pm_id = customer_doc.get("stripe_payment_method_id")
    if pm_id and STRIPE_API_KEY:
        try:
            stripe.PaymentMethod.detach(pm_id)
        except stripe.error.StripeError as e:
            logger.warning(f"Could not detach payment method: {e}")

    await db.customers.update_one(
        {"id": customer_doc["id"]},
        {
            "$unset": {
                "stripe_payment_method_id": "",
                "card_last4": "",
                "card_brand": "",
                "card_exp_month": "",
                "card_exp_year": "",
                "card_saved_at": "",
            },
            "$set": {"updated_at": _now()},
        },
    )
    return {"ok": True, "message": "Card removed"}


@router.post("/payments/charge-by-weight")
async def charge_by_weight(
    body: ChargeByWeightRequest,
    current_user: dict = Depends(get_current_user),
):
    """
    Called by operator when registering actual weight.
    Looks up order -> finds customer's saved card -> calculates total -> charges.
    """
    if not STRIPE_API_KEY:
        raise HTTPException(status_code=503, detail="Stripe not configured")

    if body.actual_weight_lbs <= 0:
        raise HTTPException(status_code=400, detail="Weight must be greater than 0")

    order = await db.orders.find_one(
        {"$or": [{"id": body.order_id}, {"order_id": body.order_id}, {"order_number": body.order_id}]},
        {"_id": 0},
    )
    if not order:
        raise HTTPException(status_code=404, detail=f"Order not found: {body.order_id}")

    if (order.get("payment_status") or "").lower() == "paid":
        return {"ok": True, "skipped": True, "reason": "Order already paid"}

    customer_id = order.get("customer_id")
    customer = None
    if customer_id:
        customer = await db.customers.find_one({"id": customer_id}, {"_id": 0})

    if not customer:
        email = order.get("customer_email")
        if email:
            customer = await db.customers.find_one({"email": email}, {"_id": 0})

    if not customer:
        return {
            "ok": False,
            "charged": False,
            "reason": "Customer record not found — charge manually",
        }

    pm_id = customer.get("stripe_payment_method_id")
    stripe_customer_id = customer.get("stripe_customer_id")

    if not pm_id or not stripe_customer_id:
        return {
            "ok": False,
            "charged": False,
            "reason": "Customer has no saved card — charge manually",
            "customer_name": customer.get("name"),
        }

    service_type = body.service_type or order.get("service_type") or "pickup_delivery"
    service_plan = body.service_plan or order.get("service_plan") or "standard"

    order_copy = {**order, "actual_lbs": body.actual_weight_lbs,
                  "service_type": service_type, "service_plan": service_plan}
    breakdown = await calculate_final_amount_with_membership(order_copy, customer)
    if not breakdown:
        raise HTTPException(status_code=400, detail="Could not calculate final amount")

    total_amount = breakdown["total"]

    if total_amount <= 0:
        now = _now()
        await db.orders.update_one(
            {"id": order["id"]},
            {"$set": {
                "actual_weight_lbs": body.actual_weight_lbs,
                "total_amount": 0.0,
                "payment_status": "paid",
                "payment_method": "membership_covered",
                "paid_at": now,
                "updated_at": now,
            }}
        )
        return {"ok": True, "charged": False, "covered_by_membership": True}

    amount_cents = int(total_amount * 100)
    if amount_cents < 50:
        return {
            "ok": False,
            "charged": False,
            "reason": f"Amount too small (${total_amount:.2f}) — Stripe minimum is $0.50",
        }

    order_number = order.get("order_number", body.order_id[:8].upper())

    try:
        intent = stripe.PaymentIntent.create(
            amount=amount_cents,
            currency="usd",
            customer=stripe_customer_id,
            payment_method=pm_id,
            confirm=True,
            off_session=True,
            description=(
                f"Ventura Fresh Laundry — Orden {order_number} — "
                f"{body.actual_weight_lbs} lbs"
            ),
            metadata={
                "order_id": order["id"],
                "order_number": order_number,
                "customer_id": customer["id"],
                "weight_lbs": str(body.actual_weight_lbs),
                "service_type": service_type,
                "service_plan": service_plan,
            },
            receipt_email=customer.get("email"),
        )
    except stripe.error.CardError as e:
        err = e.error
        logger.error(f"Card declined for order {body.order_id}: {err.code} — {err.message}")
        await db.orders.update_one(
            {"id": order["id"]},
            {"$set": {
                "auto_charge_failed": True,
                "auto_charge_error": err.message,
                "auto_charge_attempted_at": _now(),
                "updated_at": _now(),
            }},
        )
        raise HTTPException(
            status_code=402,
            detail={
                "message": "Card declined — charge manually",
                "decline_code": err.code,
                "stripe_message": err.message,
            },
        )
    except stripe.error.StripeError as e:
        logger.error(f"Stripe error for order {body.order_id}: {e}")
        raise HTTPException(status_code=400, detail=str(e.user_message or e))

    now = _now()
    await db.orders.update_one(
        {"id": order["id"]},
        {
            "$set": {
                "actual_weight_lbs": body.actual_weight_lbs,
                "total_amount": total_amount,
                "extra_charge": total_amount,
                "payment_status": "paid",
                "payment_method": "card_auto",
                "stripe_payment_intent_id": intent.id,
                "auto_charged": True,
                "auto_charged_at": now,
                "auto_charge_amount": total_amount,
                "updated_at": now,
            }
        },
    )

    await db.finances.insert_one({
        "id": str(uuid.uuid4()),
        "type": "income",
        "category": "service_payment_auto",
        "description": f"Cobro automatico orden {order_number} — {body.actual_weight_lbs} lbs",
        "amount": total_amount,
        "payment_method": "card_auto",
        "order_id": order["id"],
        "order_number": order_number,
        "customer_name": customer.get("name"),
        "customer_id": customer["id"],
        "stripe_payment_intent_id": intent.id,
        "date": now[:10],
        "created_at": now,
        "updated_at": now,
    })

    logger.info(f"Auto-charged ${total_amount} for order {order_number}")

    return {
        "ok": True,
        "charged": True,
        "amount": total_amount,
        "weight_lbs": body.actual_weight_lbs,
        "rate_per_lb": breakdown["rate_used"],
        "order_number": order_number,
        "stripe_payment_intent_id": intent.id,
        "card_last4": customer.get("card_last4"),
        "card_brand": customer.get("card_brand"),
    }


@router.get("/payments/history")
async def get_payment_history(current_customer: dict = Depends(get_current_customer)):
    """Return auto-charge history for the authenticated customer."""
    customer_doc = await _find_customer_by_user(current_customer)
    if not customer_doc:
        raise HTTPException(status_code=404, detail="Customer not found")

    entries = await db.finances.find(
        {"customer_id": customer_doc["id"], "category": "service_payment_auto"},
        {"_id": 0},
    ).sort("created_at", -1).to_list(50)

    return entries


@router.post("/payments/operator/charge-order/{order_id}")
async def operator_charge_order(
    order_id: str,
    body: dict,
    current_user: dict = Depends(get_current_user),
):
    """Operator triggers manual charge for an order."""
    role = current_user.get("role", "")
    if role not in ("admin", "operator"):
        raise HTTPException(status_code=403, detail="Operator access required")

    weight = float(body.get("actual_weight_lbs", 0))
    req = ChargeByWeightRequest(order_id=order_id, actual_weight_lbs=weight)
    return await charge_by_weight(req, current_user)


# =============================================================================
# SECTION 3: AUTHENTICATED CUSTOMER ENDPOINTS (require customer token)
# =============================================================================

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
    """Update customer profile (address, name, phone, city, state, zip)"""
    allowed = {"name", "phone", "address", "city", "state", "zip_code"}
    updates = {k: v for k, v in body.items() if k in allowed and v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No valid fields to update")

    if "address" in updates or "city" in updates or "state" in updates or "zip_code" in updates:
        street = updates.get("address", current_customer.get("address", ""))
        city = updates.get("city", current_customer.get("city", ""))
        state = updates.get("state", current_customer.get("state", ""))
        zip_code = updates.get("zip_code", current_customer.get("zip_code", ""))

        parts = []
        if street:
            parts.append(street)
        street_lower = street.lower()
        for component, value in [("city", city), ("state", state), ("zip", zip_code)]:
            if value and value.lower() not in street_lower:
                parts.append(value)
        full_address = ", ".join(parts) if parts else None

        updates["address"] = full_address
        updates["city"] = city
        updates["state"] = state
        updates["zip_code"] = zip_code

    updates["updated_at"] = datetime.now(timezone.utc).isoformat()

    await db.customers.update_one(
        {"id": current_customer["id"]},
        {"$set": updates},
    )

    customer_email = current_customer.get("email", "")
    if customer_email:
        sync_fields = {k: v for k, v in updates.items() if k in ("phone", "address", "city", "state", "zip_code", "updated_at")}
        await db.customers.update_many(
            {
                "email": {"$regex": f"^{customer_email}$", "$options": "i"},
                "id": {"$ne": current_customer["id"]},
            },
            {"$set": sync_fields},
        )

    updated = await db.customers.find_one(
        {"id": current_customer["id"]}, {"_id": 0, "password_hash": 0}
    )
    return updated


@router.get("/orders")
async def get_customer_orders(current_customer: dict = Depends(get_current_customer)):
    """Get all orders for the customer with membership breakdown."""
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
            # Use stored fields if available (avoids double-counting allowance)
            if order.get("extra_charge") is not None:
                # Already computed — just expose the stored fields
                order.setdefault("lbs_from_allowance", order.get("lbs_from_allowance", 0))
                order.setdefault("extra_lbs_billed", order.get("extra_lbs_billed", 0))
                order.setdefault("membership_discount", order.get("membership_discount", 0.0))
            else:
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
    """Return only orders that require actual payment (excludes membership-covered)."""
    customer_id = current_customer["id"]
    customer_email = current_customer.get("email", "")

    linked_ids = await get_customer_ids_by_email(customer_email) if customer_email else set()
    linked_ids.add(customer_id)

    or_clauses = [{"customer_id": {"$in": list(linked_ids)}}]
    if customer_email:
        or_clauses.append({"customer_email": customer_email})

    query = {
        "$or": or_clauses,
        "payment_status": {"$in": ["unpaid", "pending", "pending_verification"]},
        "total_amount": {"$gt": 0},
    }

    orders = await db.orders.find(query, {"_id": 0}).sort("created_at", -1).to_list(100)

    has_active_membership = is_active_member(None, current_customer)
    result = []

    for order in orders:
        if "order_number" not in order:
            order["order_number"] = order.get("id", "")[:8]

        extra_charge = float(order.get("total_amount", 0))
        covered_by_membership = False

        if has_active_membership and order.get("actual_lbs"):
            # Use stored breakdown fields to avoid double-counting
            if order.get("extra_charge") is not None:
                extra_charge = float(order["extra_charge"])
                order["extra_charge"] = extra_charge
                covered_by_membership = extra_charge <= 0.50
            else:
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
    """Apply active customer membership to a pending order."""
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

    now_iso = _now()
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
        logger.warning("get_customer_cycle_usage fallo")
    return {}


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
    now = _now()

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
    now = _now()
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
    """
    Create Stripe checkout session for authenticated customer (with 3% card fee).

    FIX: Instead of calling calculate_final_amount_with_membership again (which
    re-queries the DB allowance and double-counts the current order's lbs),
    we now read the pre-computed breakdown fields stored by PUT /orders/{order_id}
    (extra_charge, lbs_from_allowance, extra_lbs_billed, membership_discount).

    This ensures the customer pays exactly what was computed when the operator
    entered the weight — no more, no less.
    """
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order or not await customer_owns_order(order, current_customer):
        raise HTTPException(status_code=404, detail="Order not found")

    if order.get("payment_status") == "paid":
        raise HTTPException(status_code=400, detail="Order already paid")

    # Fetch full customer record for membership checks
    customer = await db.customers.find_one({"id": current_customer["id"]}, {"_id": 0})
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    # ── KEY FIX: use stored breakdown, not a fresh DB query ──────────────────
    amount_to_charge = _compute_amount_from_stored_fields(order, customer)

    if amount_to_charge is None:
        raise HTTPException(
            status_code=400,
            detail="Order has no weight recorded yet. The operator must enter the weight first.",
        )

    if amount_to_charge <= 0:
        # Fully covered — mark as paid without Stripe
        now_iso = _now()
        await db.orders.update_one(
            {"id": order_id},
            {"$set": {
                "payment_status": "paid",
                "payment_method": "membership_covered",
                "amount_paid": 0.0,
                "processing_fee": 0.0,
                "paid_at": now_iso,
                "updated_at": now_iso,
            }}
        )
        return {
            "covered_by_membership": True,
            "amount_charged": 0.0,
            "message": "Order fully covered by membership",
        }

    # Apply Stripe 3% processing fee
    processing_fee = round(amount_to_charge * STRIPE_PROCESSING_FEE_RATE, 2)
    total_with_fee = round(amount_to_charge + processing_fee, 2)

    if not _get_stripe_key():
        raise HTTPException(status_code=503, detail="Payment service not configured")

    logger.info(
        f"Checkout for order {order_id}: base={amount_to_charge:.2f} "
        f"fee={processing_fee:.2f} total={total_with_fee:.2f} "
        f"lbs_covered={order.get('lbs_from_allowance', 0)} "
        f"lbs_extra={order.get('extra_lbs_billed', 0)}"
    )

    try:
        stripe.api_key = _get_stripe_key()
        frontend = _get_frontend_url() or str(request.base_url).rstrip("/")

        # Build a descriptive line-item
        lbs = float(order.get("actual_lbs") or 0)
        lbs_covered = float(order.get("lbs_from_allowance") or 0)
        lbs_extra = float(order.get("extra_lbs_billed") or 0)

        if lbs_covered > 0 and lbs_extra > 0:
            desc = (
                f"{order.get('service_type', 'Laundry')} — "
                f"{lbs_covered:.1f} lbs covered by membership, "
                f"{lbs_extra:.1f} lbs extra — includes 3% card fee"
            )
        elif lbs_extra > 0 and lbs_covered == 0 and is_active_member(order, customer):
            desc = (
                f"{order.get('service_type', 'Laundry')} — "
                f"{lbs:.1f} lbs at member rate (allowance exhausted) — includes 3% card fee"
            )
        else:
            desc = (
                f"{order.get('service_type', 'Laundry Service')} — "
                f"includes 3% card fee"
            )

        session = stripe.checkout.Session.create(
            payment_method_types=["card"],
            line_items=[{
                "price_data": {
                    "currency": "usd",
                    "product_data": {
                        "name": f"Ventura Fresh Laundry - {order.get('order_number', '')}",
                        "description": desc,
                    },
                    "unit_amount": int(total_with_fee * 100),
                },
                "quantity": 1,
            }],
            mode="payment",
            success_url=f"{frontend}/account?paid={order_id}",
            cancel_url=f"{frontend}/account",
            metadata={
                "order_id": order_id,
                "order_number": order.get("order_number", ""),
                "amount_base": str(amount_to_charge),
                "processing_fee": str(processing_fee),
            },
        )

        # Update order with the confirmed amounts for this checkout session
        await db.orders.update_one(
            {"id": order_id},
            {"$set": {
                "processing_fee":  processing_fee,
                "extra_charge":    amount_to_charge,   # base amount (without card fee)
                "total_amount":    total_with_fee,      # what customer will pay
                "updated_at":      _now(),
            }}
        )

        return {
            "url":              session.url,
            "processing_fee":   processing_fee,
            "total_charged":    total_with_fee,
            "amount_base":      amount_to_charge,
            "lbs_covered":      lbs_covered,
            "lbs_extra":        lbs_extra,
        }

    except Exception as exc:
        logger.error("Stripe checkout error: %s", exc)
        raise HTTPException(status_code=500, detail="Payment service error")


# =============================================================================
# SECTION 4: RECEIPT UPLOAD & OCR
# =============================================================================

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
        "created_at": _now(),
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
        "created_at": _now(),
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


# =============================================================================
# SECTION 5: ORDER IMAGES (Pickup, Weight, Delivery)
# =============================================================================

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

    image_records = await db.pickup_images.find(
        {"order_id": real_id}, {"_id": 0}
    ).sort("created_at", -1).limit(1).to_list(1)
    image_record = image_records[0] if image_records else None

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


@router.get("/order/{order_id}/weight-image/view")
async def get_customer_weight_image(
    order_id: str,
    current_customer: dict = Depends(get_current_customer),
):
    """Get weight proof image for customer order"""
    order = await db.orders.find_one(
        {"$or": [{"id": order_id}, {"order_id": order_id}, {"order_number": order_id}]},
        {"_id": 0},
    )
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if not await customer_owns_order(order, current_customer):
        raise HTTPException(status_code=403, detail="Not your order")

    real_id = order.get("id") or order.get("order_id") or order_id

    image_records = await db.weight_images.find(
        {"order_id": real_id}, {"_id": 0}
    ).sort("created_at", -1).limit(1).to_list(1)
    image_record = image_records[0] if image_records else None

    if not image_record and order.get("weight_image_data"):
        data = base64.b64decode(order["weight_image_data"])
        return Response(
            content=data,
            media_type="image/jpeg",
            headers={
                "Content-Disposition": f'inline; filename="weight_{real_id}.jpg"',
                "Cache-Control": "private, max-age=86400",
            },
        )

    if not image_record:
        raise HTTPException(status_code=404, detail="No weight proof image found")

    data_b64 = image_record.get("data_base64")
    if not data_b64:
        raise HTTPException(status_code=404, detail="No image data available")

    data = base64.b64decode(data_b64)
    filename = image_record.get("original_filename") or f"weight_{real_id}.jpg"
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

    image_records = await db.delivery_images.find(
        {"order_id": real_id}, {"_id": 0}
    ).sort("created_at", -1).limit(1).to_list(1)
    image_record = image_records[0] if image_records else None

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


# =============================================================================
# SECTION 6: RECURRENCE MANAGEMENT
# =============================================================================

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

    now = _now()
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


@router.post("/customer/orders/{order_id}/auto-charge")
async def auto_charge_order(
    order_id: str,
    current_user: dict = Depends(get_current_customer),
) -> dict:
    """
    Automatically charge the customer's saved card for the order balance.
    Uses stored extra_charge (already computed with membership) — no re-query.
    """
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    if order.get("customer_id") != current_user.get("id"):
        raise HTTPException(status_code=403, detail="Not your order")

    if order.get("payment_status") == "paid":
        return {"success": True, "message": "Already paid", "amount": 0}

    # Use stored extra_charge (computed at weight-entry time) — no recalculation
    amount_due = float(order.get("extra_charge") or order.get("total_amount") or 0)

    if amount_due <= 0.50:
        await db.orders.update_one(
            {"id": order_id},
            {"$set": {"payment_status": "paid", "payment_method": "membership_covered"}}
        )
        return {"success": True, "message": "Covered by membership", "amount": 0}

    stripe_customer_id = current_user.get("stripe_customer_id")
    if not stripe_customer_id:
        return {"success": False, "error": "No saved payment method"}

    try:
        stripe_customer = stripe.Customer.retrieve(stripe_customer_id)
        payment_method_id = stripe_customer.get("invoice_settings", {}).get("default_payment_method")

        if not payment_method_id:
            payment_methods = stripe.PaymentMethod.list(
                customer=stripe_customer_id,
                type="card",
                limit=1
            )
            if not payment_methods.data:
                return {"success": False, "error": "No payment method found"}
            payment_method_id = payment_methods.data[0].id

        payment_intent = stripe.PaymentIntent.create(
            amount=int(amount_due * 100),
            currency="usd",
            customer=stripe_customer_id,
            payment_method=payment_method_id,
            off_session=True,
            confirm=True,
            metadata={"order_id": order_id, "type": "auto_charge"}
        )

        if payment_intent.status == "succeeded":
            await db.orders.update_one(
                {"id": order_id},
                {"$set": {
                    "payment_status": "paid",
                    "payment_method": "card",
                    "amount_paid": amount_due,
                    "paid_at": datetime.now(timezone.utc).isoformat()
                }}
            )
            return {"success": True, "amount": amount_due, "payment_intent_id": payment_intent.id}
        else:
            return {"success": False, "error": f"Payment {payment_intent.status}"}

    except stripe.error.CardError as e:
        return {"success": False, "error": e.error.message}
    except Exception as e:
        logger.error(f"Auto-charge error: {e}")
        return {"success": False, "error": str(e)}