"""
Stripe Payment Intents — Tap-to-Pay, Apple Pay, Google Pay, Card.
Provides publishable key + PaymentIntent creation for inline payments.
"""
import os
import logging
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone
import uuid

import stripe

from database import db
from auth import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/stripe", tags=["stripe-payments"])

STRIPE_API_KEY = os.environ.get("STRIPE_API_KEY", "")
STRIPE_PUBLISHABLE_KEY = os.environ.get("STRIPE_PUBLISHABLE_KEY", "")

stripe.api_key = STRIPE_API_KEY


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


@router.get("/publishable-key")
async def get_publishable_key():
    if not STRIPE_PUBLISHABLE_KEY:
        raise HTTPException(status_code=503, detail="Stripe not configured")
    return {"publishableKey": STRIPE_PUBLISHABLE_KEY}


@router.post("/create-payment-intent")
async def create_payment_intent(req: PaymentIntentRequest):
    if not STRIPE_API_KEY:
        raise HTTPException(status_code=503, detail="Stripe not configured")

    amount_cents = int(round(req.amount * 100))
    if amount_cents < 50:
        raise HTTPException(status_code=400, detail="Amount must be at least $0.50")

    metadata = {}
    if req.orderId:
        metadata["order_id"] = req.orderId
    if req.orderNumber:
        metadata["order_number"] = req.orderNumber
    if req.customerName:
        metadata["customer_name"] = req.customerName

    desc = req.description or "Ventura Fresh Laundry"
    if req.orderNumber:
        desc = f"Orden {req.orderNumber} - {req.customerName or 'Cliente'}"

    try:
        intent = stripe.PaymentIntent.create(
            amount=amount_cents,
            currency=req.currency,
            payment_method_types=["card"],
            metadata=metadata,
            description=desc,
        )
        return {"clientSecret": intent.client_secret, "paymentIntentId": intent.id}
    except stripe.error.StripeError as e:
        logger.error(f"Stripe PaymentIntent error: {e}")
        raise HTTPException(status_code=400, detail=str(e.user_message or e))


@router.post("/quick-sale")
async def create_quick_sale(
    req: QuickSaleRequest,
    current_user: dict = Depends(get_current_user),
):
    """Create a quick POS sale and return a PaymentIntent for Stripe tap/card payment."""
    if not STRIPE_API_KEY:
        raise HTTPException(status_code=503, detail="Stripe not configured")

    amount_cents = int(round(req.amount * 100))
    if amount_cents < 50:
        raise HTTPException(status_code=400, detail="Amount must be at least $0.50")

    order_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    order_number = f"POS-{datetime.now(timezone.utc).strftime('%Y%m%d')}-{uuid.uuid4().hex[:6].upper()}"

    try:
        intent = stripe.PaymentIntent.create(
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
        )
    except stripe.error.StripeError as e:
        logger.error(f"Stripe quick-sale error: {e}")
        raise HTTPException(status_code=400, detail=str(e.user_message or e))

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
):
    """Called by the frontend after successful payment to update the order."""
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

    # Create finance ledger entry
    if order_doc:
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
