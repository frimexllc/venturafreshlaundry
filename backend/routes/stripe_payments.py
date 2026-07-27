"""Stripe Payment Intents — Tap-to-Pay, Apple Pay, Google Pay, Card.

Provides the publishable key and PaymentIntent creation for
customer-present / inline payments (checkout widget, POS, and Stripe
Terminal). These flows are on-session: the PaymentIntent is created here
and *confirmed* client-side (or by a physical card tap), so — unlike the
off-session auto-charge flows consolidated in `services/payments.py` —
a duplicate PaymentIntent here does not by itself charge a customer
twice. We still give each one an idempotency key so a duplicate request
(double-tap, network retry) reuses the same PaymentIntent instead of
littering Stripe with abandoned ones.

All Stripe SDK calls are offloaded via `asyncio.to_thread` because
`stripe-python` is a synchronous client; calling it directly inside an
`async def` route would block the FastAPI event loop for the duration of
the network round-trip to Stripe.
"""
import asyncio
import logging
import os
import uuid
from datetime import datetime, timezone
from typing import Optional

import stripe
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from auth import get_current_user
from database import db

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/stripe", tags=["stripe-payments"])

STRIPE_API_KEY = os.environ.get("STRIPE_API_KEY", "")
STRIPE_PUBLISHABLE_KEY = os.environ.get("STRIPE_PUBLISHABLE_KEY", "")
stripe.api_key = STRIPE_API_KEY

MIN_CHARGEABLE_CENTS = 50  # Stripe's minimum charge amount ($0.50)


class PaymentIntentRequest(BaseModel):
    amount: float
    currency: str = "usd"
    orderId: Optional[str] = None
    orderNumber: Optional[str] = None
    customerName: Optional[str] = None
    description: Optional[str] = None


class QuickSaleRequest(BaseModel):
    customerName: str
    amount: float
    description: Optional[str] = "Venta en tienda"
    customerPhone: Optional[str] = None
    customerEmail: Optional[str] = None


def _require_stripe_configured() -> None:
    if not STRIPE_API_KEY:
        raise HTTPException(status_code=503, detail="Stripe not configured")


def _require_chargeable_amount(amount_cents: int) -> None:
    if amount_cents < MIN_CHARGEABLE_CENTS:
        raise HTTPException(status_code=400, detail="Amount must be at least $0.50")


def _new_pos_order_number() -> str:
    return f"POS-{datetime.now(timezone.utc).strftime('%Y%m%d')}-{uuid.uuid4().hex[:6].upper()}"


@router.get("/publishable-key")
async def get_publishable_key() -> dict:
    """Return the Stripe publishable key for frontend Stripe.js init."""
    if not STRIPE_PUBLISHABLE_KEY:
        raise HTTPException(status_code=503, detail="Stripe not configured")
    return {"publishableKey": STRIPE_PUBLISHABLE_KEY}


@router.post("/create-payment-intent")
async def create_payment_intent(req: PaymentIntentRequest) -> dict:
    """Create a PaymentIntent for an inline card/Apple Pay/Google Pay charge."""
    _require_stripe_configured()

    amount_cents = int(round(req.amount * 100))
    _require_chargeable_amount(amount_cents)

    metadata = {}
    if req.orderId:
        metadata["order_id"] = req.orderId
    if req.orderNumber:
        metadata["order_number"] = req.orderNumber
    if req.customerName:
        metadata["customer_name"] = req.customerName

    description = req.description or "Ventura Fresh Laundry"
    if req.orderNumber:
        description = f"Orden {req.orderNumber} - {req.customerName or 'Cliente'}"

    idempotency_key = f"payment-intent:{req.orderId or uuid.uuid4()}:{amount_cents}"

    try:
        intent = await asyncio.to_thread(
            stripe.PaymentIntent.create,
            amount=amount_cents,
            currency=req.currency,
            payment_method_types=["card"],
            metadata=metadata,
            description=description,
            idempotency_key=idempotency_key,
        )
    except stripe.StripeError as e:
        logger.error("Stripe PaymentIntent error: %s", e)
        raise HTTPException(status_code=400, detail=str(getattr(e, "user_message", None) or e))

    return {"clientSecret": intent.client_secret, "paymentIntentId": intent.id}


@router.post("/quick-sale")
async def create_quick_sale(
    req: QuickSaleRequest,
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Create a quick POS sale and return a PaymentIntent for a Stripe tap/card payment."""
    _require_stripe_configured()

    amount_cents = int(round(req.amount * 100))
    _require_chargeable_amount(amount_cents)

    order_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    order_number = _new_pos_order_number()

    try:
        intent = await asyncio.to_thread(
            stripe.PaymentIntent.create,
            amount=amount_cents,
            currency="usd",
            payment_method_types=["card"],
            metadata={
                "order_id": order_id,
                "order_number": order_number,
                "customer_name": req.customerName,
                "source": "pos",
            },
            description=f"POS {order_number} - {req.customerName} - {req.description or 'Venta'}",
            idempotency_key=f"pos-sale:{order_id}",
        )
    except stripe.StripeError as e:
        logger.error("Stripe quick-sale error: %s", e)
        raise HTTPException(status_code=400, detail=str(getattr(e, "user_message", None) or e))

    order_doc = {
        "id": order_id,
        "order_number": order_number,
        "customer_name": req.customerName,
        "customer_phone": req.customerPhone or "",
        "customer_email": req.customerEmail or "",
        "items": [{"product_name": req.description or "Venta en tienda", "price": req.amount, "quantity": 1}],
        "total": req.amount,
        "subtotal": round(req.amount * 0.9225, 2),
        "shipping_fee": 0,
        "fulfillment_type": "in-store",
        "payment_status": "pending",
        "payment_method": "card",
        "stripe_payment_intent_id": intent.id,
        "status": "pending",
        "source": "pos",
        "created_by": current_user.get("id", ""),
        "created_at": now,
        "updated_at": now,
    }
    await db.store_orders.insert_one(order_doc)

    return {
        "clientSecret": intent.client_secret,
        "paymentIntentId": intent.id,
        "orderId": order_id,
        "orderNumber": order_number,
    }


@router.post("/confirm-payment")
async def confirm_payment_success(
    payload: dict,
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Called by the frontend after a successful client-side confirmation
    to mark the order paid and write the finance ledger entry.
    """
    payment_intent_id = payload.get("paymentIntentId", "")
    order_id = payload.get("orderId", "")
    now = datetime.now(timezone.utc).isoformat()

    order_doc = None
    if order_id:
        result = await db.store_orders.update_one(
            {"id": order_id},
            {"$set": {"payment_status": "paid", "status": "completed", "paid_at": now, "updated_at": now}},
        )
        if result.modified_count > 0:
            order_doc = await db.store_orders.find_one({"id": order_id}, {"_id": 0})
        else:
            await db.orders.update_one(
                {"id": order_id},
                {"$set": {"payment_status": "paid", "payment_method": "card", "paid_at": now, "updated_at": now}},
            )
            order_doc = await db.orders.find_one({"id": order_id}, {"_id": 0})
    elif payment_intent_id:
        await db.store_orders.update_one(
            {"stripe_payment_intent_id": payment_intent_id},
            {"$set": {"payment_status": "paid", "status": "completed", "paid_at": now, "updated_at": now}},
        )
        order_doc = await db.store_orders.find_one({"stripe_payment_intent_id": payment_intent_id}, {"_id": 0})

    if order_doc:
        # NOTE: this endpoint can legitimately be called more than once
        # for the same order (frontend retry after a flaky response). A
        # follow-up worth doing in a later pass: key this insert on
        # order_id/payment_intent_id (e.g. an upsert or a uniqueness
        # check against `finances`) so a repeated call can't write a
        # second income entry for the same payment. Left unchanged here
        # since it touches the shared `finances` collection used across
        # many modules — flagged for a dedicated review rather than a
        # rushed fix.
        is_service_order = order_doc.get("service_type") is not None
        amount = float(order_doc.get("total_amount") or order_doc.get("total") or 0)
        finance_entry = {
            "id": str(uuid.uuid4()),
            "type": "income",
            "category": "service_payment" if is_service_order else "store_sale",
            "description": f"Pago Stripe {order_doc.get('order_number', order_id)}",
            "amount": amount,
            "payment_method": "card",
            "order_id": order_doc.get("id"),
            "order_number": order_doc.get("order_number"),
            "customer_name": order_doc.get("customer_name"),
            "date": now[:10],
            "created_at": now,
            "updated_at": now,
        }
        await db.finances.insert_one(finance_entry)

    return {"ok": True}


@router.post("/quick-sale/cash")
async def create_quick_sale_cash(
    req: QuickSaleRequest,
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Record a cash POS sale — no Stripe processing needed."""
    order_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    order_number = _new_pos_order_number()

    order_doc = {
        "id": order_id,
        "order_number": order_number,
        "customer_name": req.customerName,
        "customer_phone": req.customerPhone or "",
        "customer_email": req.customerEmail or "",
        "items": [{"product_name": req.description or "Venta en tienda", "price": req.amount, "quantity": 1}],
        "total": req.amount,
        "subtotal": round(req.amount * 0.9225, 2),
        "shipping_fee": 0,
        "fulfillment_type": "in-store",
        "payment_status": "paid",
        "payment_method": "cash",
        "status": "completed",
        "source": "pos",
        "created_by": current_user.get("id", ""),
        "created_at": now,
        "updated_at": now,
        "paid_at": now,
    }
    await db.store_orders.insert_one(order_doc)

    finance_entry = {
        "id": str(uuid.uuid4()),
        "type": "income",
        "category": "store_sale",
        "description": f"Venta Efectivo {order_number} - {req.customerName}",
        "amount": req.amount,
        "payment_method": "cash",
        "order_id": order_id,
        "order_number": order_number,
        "customer_name": req.customerName,
        "date": now[:10],
        "created_at": now,
        "updated_at": now,
    }
    await db.finances.insert_one(finance_entry)

    return {
        "orderId": order_id,
        "orderNumber": order_number,
        "status": "completed",
        "amount": req.amount,
    }


@router.post("/terminal/connection-token")
async def create_terminal_connection_token(
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Create a short-lived connection token for the Stripe Terminal JS SDK."""
    _require_stripe_configured()
    try:
        token = await asyncio.to_thread(stripe.terminal.ConnectionToken.create)
        return {"secret": token.secret}
    except stripe.StripeError as e:
        logger.error("Terminal connection token error: %s", e)
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/quick-sale/terminal")
async def create_quick_sale_terminal(
    req: QuickSaleRequest,
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Create a PaymentIntent for Stripe Terminal (card_present / tap)."""
    _require_stripe_configured()

    amount_cents = int(round(req.amount * 100))
    _require_chargeable_amount(amount_cents)

    order_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    order_number = _new_pos_order_number()

    try:
        intent = await asyncio.to_thread(
            stripe.PaymentIntent.create,
            amount=amount_cents,
            currency="usd",
            payment_method_types=["card_present"],
            capture_method="automatic",
            metadata={
                "order_id": order_id,
                "order_number": order_number,
                "customer_name": req.customerName,
                "source": "pos_terminal",
            },
            description=f"POS Terminal {order_number} - {req.customerName} - {req.description or 'Venta'}",
            idempotency_key=f"pos-terminal-sale:{order_id}",
        )
    except stripe.StripeError as e:
        logger.error("Terminal quick-sale error: %s", e)
        raise HTTPException(status_code=400, detail=str(e))

    order_doc = {
        "id": order_id,
        "order_number": order_number,
        "customer_name": req.customerName,
        "customer_phone": req.customerPhone or "",
        "customer_email": req.customerEmail or "",
        "items": [{"product_name": req.description or "Venta en tienda", "price": req.amount, "quantity": 1}],
        "total": req.amount,
        "subtotal": round(req.amount * 0.9225, 2),
        "shipping_fee": 0,
        "fulfillment_type": "in-store",
        "payment_status": "pending",
        "payment_method": "card_present",
        "stripe_payment_intent_id": intent.id,
        "status": "pending",
        "source": "pos_terminal",
        "created_by": current_user.get("id", ""),
        "created_at": now,
        "updated_at": now,
    }
    await db.store_orders.insert_one(order_doc)

    return {
        "clientSecret": intent.client_secret,
        "paymentIntentId": intent.id,
        "orderId": order_id,
        "orderNumber": order_number,
    }
