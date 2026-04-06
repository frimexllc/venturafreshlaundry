"""Customer-facing endpoints — public order lookup and Stripe checkout"""
import os
import logging
from fastapi import APIRouter, HTTPException, Request, Depends
from database import db
from auth import get_current_customer

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/customer", tags=["customer"])

STRIPE_SECRET_KEY = os.environ.get("STRIPE_SECRET_KEY", "")
FRONTEND_URL = os.environ.get("FRONTEND_URL", "")


@router.get("/order/{order_id}")
async def get_customer_order(order_id: str):
    """Public endpoint — customer views their order details for payment"""
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    # Only expose safe fields
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

    if not STRIPE_SECRET_KEY:
        raise HTTPException(status_code=503, detail="Payment service not configured")

    try:
        import stripe
        stripe.api_key = STRIPE_SECRET_KEY

        base_url = str(request.base_url).rstrip("/")
        frontend = FRONTEND_URL or base_url

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
    from datetime import datetime, timezone
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    if order.get("payment_status") == "paid":
        return {"ok": True, "detail": "Already paid"}

    now = datetime.now(timezone.utc).isoformat()
    await db.orders.update_one(
        {"id": order_id},
        {"$set": {
            "payment_status": "paid",
            "payment_method": "tarjeta",
            "updated_at": now,
        }, "$push": {
            "status_history": {
                "status": "payment_confirmed",
                "timestamp": now,
                "by": "customer_checkout",
            }
        }}
    )
    return {"ok": True, "detail": "Payment confirmed"}


@router.post("/order/{order_id}/mark-zelle")
async def mark_zelle_payment(order_id: str, current_customer: dict = Depends(get_current_customer)):
    """Customer marks that they sent a Zelle payment — sets status to pending_verification"""
    from datetime import datetime, timezone
    order = await db.orders.find_one({"id": order_id, "customer_id": current_customer["id"]}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.get("payment_status") == "paid":
        return {"ok": True, "detail": "Already paid"}

    now = datetime.now(timezone.utc).isoformat()
    await db.orders.update_one(
        {"id": order_id},
        {"$set": {
            "payment_status": "pending_verification",
            "payment_method": "zelle",
            "updated_at": now,
        }, "$push": {
            "status_history": {
                "status": "zelle_submitted",
                "timestamp": now,
                "by": "customer_portal",
            }
        }}
    )
    return {"ok": True, "detail": "Zelle payment submitted for verification"}


@router.post("/order/{order_id}/checkout-auth")
async def create_authenticated_checkout(order_id: str, request: Request, current_customer: dict = Depends(get_current_customer)):
    """Authenticated checkout — customer pays from their account"""
    order = await db.orders.find_one({"id": order_id, "customer_id": current_customer["id"]}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.get("payment_status") == "paid":
        raise HTTPException(status_code=400, detail="Order already paid")

    total = float(order.get("total_amount") or 0)
    if total <= 0:
        raise HTTPException(status_code=400, detail="Invalid order total")

    if not STRIPE_SECRET_KEY:
        raise HTTPException(status_code=503, detail="Payment service not configured")

    try:
        import stripe
        stripe.api_key = STRIPE_SECRET_KEY
        base_url = str(request.base_url).rstrip("/")
        frontend = FRONTEND_URL or base_url

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
