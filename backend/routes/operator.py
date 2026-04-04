"""Operator & Driver endpoints — state machine, status transitions, driver routes."""
import logging
import uuid
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

from database import db, SKIP_SERVER_NOTIFICATIONS
from auth import get_current_user, has_permission, require_role
from models import ROLE_OPERATOR, ROLE_DRIVER
from utils import normalize_status, normalize_spaces, create_audit_log, should_notify_order_status

logger = logging.getLogger(__name__)

try:
    from notifications import notify_order_status_changed, send_sms
    NOTIFICATIONS_ENABLED = True
except ImportError:
    NOTIFICATIONS_ENABLED = False
    send_sms = None

router = APIRouter(prefix="/api", tags=["Operator"])


# ══════════════════════════════════════════════════════════════════════
# State Machine
# ══════════════════════════════════════════════════════════════════════
PD_TRANSITIONS = {
    "new": ["confirmed", "cancelled"],
    "confirmed": ["picked_up", "cancelled"],
    "picked_up": ["processing"],
    "processing": ["ready"],
    "ready": ["out_for_delivery"],
    "out_for_delivery": ["delivered"],
    "delivered": ["completed"],
}

WF_TRANSITIONS = {
    "new": ["confirmed", "cancelled"],
    "confirmed": ["processing", "cancelled"],
    "processing": ["ready"],
    "ready": ["completed"],
}

OPERATOR_STATUSES = {"confirmed", "processing", "ready", "out_for_delivery", "completed", "cancelled"}
DRIVER_STATUSES = {"picked_up", "delivered", "completed"}


def _get_transitions(service_type: str) -> dict:
    st = normalize_spaces(service_type or "pickup_delivery").lower().replace(" ", "_")
    if "wash" in st and "fold" in st:
        return WF_TRANSITIONS
    return PD_TRANSITIONS


def can_transition(order: dict, new_status: str, role: str) -> tuple:
    """Validate if a status transition is allowed for the given role.
    Returns (allowed: bool, error_message: str)."""
    current = normalize_status(order.get("status") or "new")
    target = normalize_status(new_status)
    transitions = _get_transitions(order.get("service_type"))

    allowed_next = transitions.get(current, [])
    if target not in allowed_next:
        return False, f"No se puede cambiar de '{current}' a '{target}'. Permitidos: {allowed_next}"

    if role == "operator" and target not in OPERATOR_STATUSES:
        return False, f"Operador no puede establecer estado '{target}'"
    if role == "driver" and target not in DRIVER_STATUSES:
        return False, f"Driver no puede establecer estado '{target}'"

    return True, ""


class StatusUpdate(BaseModel):
    status: str


# ══════════════════════════════════════════════════════════════════════
# Shared helpers
# ══════════════════════════════════════════════════════════════════════
async def _record_status_history(order_id: str, old_status: str, new_status: str, user_id: str):
    """Push a status change record into the order's status_history array."""
    entry = {
        "from": old_status,
        "to": new_status,
        "changed_by": user_id,
        "changed_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.orders.update_one(
        {"id": order_id},
        {"$push": {"status_history": entry}},
    )


async def _do_status_update(order: dict, new_status: str, user_id: str, role_label: str):
    """Apply status update, record history, audit, and notify."""
    order_id = order["id"]
    old_status = normalize_status(order.get("status") or "new")
    now = datetime.now(timezone.utc).isoformat()

    await db.orders.update_one(
        {"id": order_id},
        {"$set": {
            "status": new_status,
            "estado_actual": new_status,
            "updated_at": now,
            "tiempos.ultimo_cambio_estado": now,
            f"tiempos.fechas_estado.{new_status}": now,
        }},
    )

    await _record_status_history(order_id, old_status, new_status, user_id)
    await create_audit_log(f"ORDER_STATUS_CHANGED_BY_{role_label.upper()}", "order", order_id, user_id, {"from": old_status, "to": new_status})

    # Notifications
    if NOTIFICATIONS_ENABLED and not SKIP_SERVER_NOTIFICATIONS and order.get("customer_id"):
        customer = await db.customers.find_one({"id": order["customer_id"]}, {"_id": 0})
        if customer and should_notify_order_status(order, new_status):
            order["status"] = new_status
            try:
                await notify_order_status_changed(customer, order, new_status)
            except Exception as e:
                logger.error(f"Customer notification failed: {e}")

    # On confirmed → also notify assigned driver (P&D only)
    if new_status == "confirmed" and NOTIFICATIONS_ENABLED and send_sms:
        st = normalize_spaces(order.get("service_type") or "").lower()
        is_pd = "pickup" in st or "delivery" in st
        driver_id = order.get("assigned_driver_id") or order.get("driver_id")
        if is_pd and driver_id:
            driver = await db.users.find_one({"id": driver_id}, {"_id": 0})
            if driver and driver.get("phone"):
                pickup_addr = order.get("pickup_address") or order.get("address") or "N/A"
                order_num = order.get("order_number", order_id[:8])
                try:
                    await send_sms(
                        driver["phone"],
                        f"Nueva orden #{order_num} confirmada para recoger en {pickup_addr}. Revisa tu panel."
                    )
                except Exception as e:
                    logger.error(f"Driver SMS notification failed: {e}")


# ══════════════════════════════════════════════════════════════════════
# Operator endpoints
# ══════════════════════════════════════════════════════════════════════
@router.get("/operator/orders")
async def operator_get_orders(status: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    """Get orders for operator."""
    if not has_permission(current_user, "orders:read"):
        raise HTTPException(status_code=403, detail="Permission denied")
    query = {}
    if status:
        query["status"] = status
    orders = await db.orders.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    return orders


@router.patch("/operator/orders/{order_id}/status")
async def operator_update_order_status(order_id: str, body: StatusUpdate, current_user: dict = Depends(get_current_user)):
    """Update order status (operator role). Validates state machine transitions."""
    if not has_permission(current_user, "orders:update_status"):
        raise HTTPException(status_code=403, detail="Permission denied")

    status_normalized = normalize_status(body.status)
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    ok, err = can_transition(order, status_normalized, "operator")
    if not ok:
        raise HTTPException(status_code=400, detail=err)

    await _do_status_update(order, status_normalized, current_user["id"], "operator")
    return {"message": f"Order status updated to {status_normalized}"}


# ══════════════════════════════════════════════════════════════════════
# Driver endpoints
# ══════════════════════════════════════════════════════════════════════
@router.get("/driver/orders")
async def driver_get_orders(current_user: dict = Depends(get_current_user)):
    """Get orders assigned to this driver."""
    user_id = current_user["id"]
    role = current_user.get("role", "")
    if role not in ("admin", "driver"):
        raise HTTPException(status_code=403, detail="Permission denied")

    query = {"$or": [{"assigned_driver_id": user_id}, {"driver_id": user_id}]}
    if role == "admin":
        query = {}
    orders = await db.orders.find(query, {"_id": 0}).sort("created_at", -1).to_list(200)
    return orders


@router.patch("/driver/orders/{order_id}/status")
async def driver_update_order_status(order_id: str, body: StatusUpdate, current_user: dict = Depends(get_current_user)):
    """Update order status (driver role). Only allows picked_up, delivered, completed on P&D orders."""
    role = current_user.get("role", "")
    if role not in ("admin", "driver"):
        raise HTTPException(status_code=403, detail="Solo drivers pueden usar este endpoint")

    status_normalized = normalize_status(body.status)
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    ok, err = can_transition(order, status_normalized, "driver")
    if not ok:
        raise HTTPException(status_code=400, detail=err)

    await _do_status_update(order, status_normalized, current_user["id"], "driver")
    return {"message": f"Order status updated to {status_normalized}"}
