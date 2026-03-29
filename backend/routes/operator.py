"""Operator-Only endpoints — extracted from server_core.py"""
import logging
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends

from database import db, SKIP_SERVER_NOTIFICATIONS
from auth import get_current_user, has_permission
from utils import normalize_status, normalize_spaces, create_audit_log, should_notify_order_status

logger = logging.getLogger(__name__)

try:
    from notifications import notify_order_status_changed
    NOTIFICATIONS_ENABLED = True
except ImportError:
    NOTIFICATIONS_ENABLED = False

router = APIRouter(prefix="/api", tags=["Operator"])


@router.get("/operator/orders")
async def operator_get_orders(status: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    """Get orders for operator (limited view - no financial data)"""
    if not has_permission(current_user, "orders:read"):
        raise HTTPException(status_code=403, detail="Permission denied")
    query = {}
    if status:
        query["status"] = status
    orders = await db.orders.find(query, {
        "_id": 0,
        "total_amount": 0,
        "payment_status": 0,
    }).sort("created_at", -1).to_list(500)
    return orders


@router.patch("/operator/orders/{order_id}/status")
async def operator_update_order_status(order_id: str, status: str, current_user: dict = Depends(get_current_user)):
    """Update order status (operator allowed)"""
    if not has_permission(current_user, "orders:update_status"):
        raise HTTPException(status_code=403, detail="Permission denied")

    valid_statuses = [
        "new", "confirmed", "pickup_scheduled", "picked_up",
        "processing", "ready", "out_for_delivery", "delivered",
        "completed", "cancelled",
    ]
    status_normalized = normalize_status(status)
    if status_normalized not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {valid_statuses}")

    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    current_status = normalize_status(order.get("status"))
    service_type = normalize_spaces(order.get("service_type") or "pickup_delivery").lower().replace(" ", "_")
    if status_normalized == "completed":
        if service_type in ["wash_fold", "wash_fold_dropoff", "self_service"]:
            if current_status not in ["ready", "completed"]:
                raise HTTPException(status_code=400, detail="Wash & Fold must be ready before it can be completed")
        elif current_status not in ["delivered", "completed", "out_for_delivery"]:
            raise HTTPException(status_code=400, detail="Order must be delivered before it can be completed")

    now = datetime.now(timezone.utc).isoformat()
    await db.orders.update_one(
        {"id": order_id},
        {
            "$set": {
                "status": status_normalized,
                "estado_actual": status_normalized,
                "updated_at": now,
                "tiempos.ultimo_cambio_estado": now,
                f"tiempos.fechas_estado.{status_normalized}": now,
            }
        },
    )

    await create_audit_log("ORDER_STATUS_CHANGED_BY_OPERATOR", "order", order_id, current_user["id"], {"new_status": status_normalized})

    if NOTIFICATIONS_ENABLED and not SKIP_SERVER_NOTIFICATIONS and order.get("customer_id"):
        customer = await db.customers.find_one({"id": order["customer_id"]}, {"_id": 0})
        if customer and should_notify_order_status(order, status_normalized):
            order["status"] = status_normalized
            try:
                await notify_order_status_changed(customer, order, status_normalized)
            except Exception as e:
                logger.error(f"Notification failed: {e}")

    return {"message": f"Order status updated to {status_normalized}"}
