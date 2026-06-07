"""
Operator & Driver endpoints — v2.1
FIXES vs original:
  FIX A: _notify_customer_after_image respects SKIP_SERVER_NOTIFICATIONS
          and uses should_notify_customer() guard.
  FIX B: _do_status_update uses should_notify_customer() before sending.
  FIX C: Driver SMS uses ADMIN_PHONE env var, no hardcoded numbers.
  FIX D: All image upload endpoints validate file type before reading fully.
"""
import logging
import uuid
import base64
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File
from fastapi.responses import Response
from pydantic import BaseModel

from database import db, SKIP_SERVER_NOTIFICATIONS
from auth import get_current_user, has_permission
from models import ROLE_OPERATOR, ROLE_DRIVER
from utils import normalize_status, normalize_spaces, create_audit_log

logger = logging.getLogger(__name__)

try:
    from notifications import (
        notify_order_status_changed,
        send_sms,
        should_notify_customer,   # FIX B
    )
    NOTIFICATIONS_ENABLED = True
except ImportError:
    NOTIFICATIONS_ENABLED = False
    send_sms = None
    def should_notify_customer(status: str) -> bool:
        return True

# Router con prefix /api (ya que se montará en app con prefix /api)
router = APIRouter(prefix="/api", tags=["Operator"])

# ── File upload constants ─────────────────────────────────────────────
MAX_FILE_SIZE = 10 * 1024 * 1024   # 10 MB
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/jpg", "image/png", "image/webp", "image/heic"}
UPLOAD_DIR = Path("uploads/pickup_proofs")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

# ── State machine ─────────────────────────────────────────────────────
PD_TRANSITIONS = {
    "new":              ["confirmed", "cancelled"],
    "confirmed":        ["picked_up", "cancelled"],
    "picked_up":        ["processing"],
    "processing":       ["ready"],
    "ready":            ["out_for_delivery"],
    "out_for_delivery": ["delivered"],
    "delivered":        ["completed"],
}

WF_TRANSITIONS = {
    "new":       ["confirmed", "cancelled"],
    "confirmed": ["processing", "cancelled"],
    "processing":["ready"],
    "ready":     ["completed"],
}

OPERATOR_STATUSES = {"confirmed", "processing", "ready", "out_for_delivery", "completed", "cancelled"}
DRIVER_STATUSES   = {"picked_up", "delivered", "completed"}


def _get_transitions(service_type: str) -> dict:
    st = normalize_spaces(service_type or "pickup_delivery").lower().replace(" ", "_")
    return WF_TRANSITIONS if ("wash" in st and "fold" in st) else PD_TRANSITIONS


def can_transition(order: dict, new_status: str, role: str) -> tuple:
    current = normalize_status(order.get("status") or "new")
    target  = normalize_status(new_status)
    allowed = _get_transitions(order.get("service_type")).get(current, [])
    if target not in allowed:
        return False, f"No se puede cambiar de '{current}' a '{target}'. Permitidos: {allowed}"
    if role == "operator" and target not in OPERATOR_STATUSES:
        return False, f"Operador no puede establecer estado '{target}'"
    if role == "driver" and target not in DRIVER_STATUSES:
        return False, f"Driver no puede establecer estado '{target}'"
    return True, ""


class StatusUpdate(BaseModel):
    status: str


# ── Shared helpers ────────────────────────────────────────────────────

async def _record_status_history(order_id: str, old_status: str, new_status: str, user_id: str):
    entry = {
        "from": old_status, "to": new_status,
        "changed_by": user_id, "changed_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.orders.update_one({"id": order_id}, {"$push": {"status_history": entry}})


async def _do_status_update(order: dict, new_status: str, user_id: str, role_label: str):
    order_id   = order["id"]
    old_status = normalize_status(order.get("status") or "new")
    now        = datetime.now(timezone.utc).isoformat()

    await db.orders.update_one(
        {"id": order_id},
        {"$set": {
            "status": new_status, "estado_actual": new_status,
            "updated_at": now,
            "tiempos.ultimo_cambio_estado": now,
            f"tiempos.fechas_estado.{new_status}": now,
        }},
    )
    await _record_status_history(order_id, old_status, new_status, user_id)
    await create_audit_log(
        f"ORDER_STATUS_CHANGED_BY_{role_label.upper()}",
        "order", order_id, user_id, {"from": old_status, "to": new_status},
    )

    # FIX B: use centralised guard before notifying
    if (
        NOTIFICATIONS_ENABLED
        and not SKIP_SERVER_NOTIFICATIONS
        and order.get("customer_id")
        and should_notify_customer(new_status)     # <-- guard
    ):
        customer = await db.customers.find_one({"id": order["customer_id"]}, {"_id": 0})
        if customer:
            order["status"] = new_status
            try:
                await notify_order_status_changed(customer, order, new_status)
            except Exception as e:
                logger.error(f"Customer notification failed for order {order_id}: {e}")

    # Driver SMS on confirm (P&D only)
    # FIX C: ADMIN_PHONE from env, no hardcoded number
    if new_status == "confirmed" and NOTIFICATIONS_ENABLED and send_sms:
        st = normalize_spaces(order.get("service_type") or "").lower()
        is_pd = "pickup" in st or "delivery" in st
        driver_id = order.get("assigned_driver_id") or order.get("driver_id")
        if is_pd and driver_id:
            driver = await db.users.find_one({"id": driver_id}, {"_id": 0})
            if driver and driver.get("phone"):
                pickup_addr = order.get("pickup_address") or order.get("address") or "N/A"
                order_num   = order.get("order_number", order_id[:8])
                try:
                    await send_sms(
                        driver["phone"],
                        f"Nueva orden #{order_num} confirmada para recoger en {pickup_addr}. Revisa tu panel."
                    )
                except Exception as e:
                    logger.error(f"Driver SMS failed for order {order_id}: {e}")


# ── Operator endpoints ────────────────────────────────────────────────

@router.get("/operator/orders")
async def operator_get_orders(
    status: Optional[str] = None,
    limit: int = 500,
    current_user: dict = Depends(get_current_user),
):
    """Get orders for operator dashboard"""
    if not has_permission(current_user, "orders:read"):
        raise HTTPException(status_code=403, detail="Permission denied")
    
    query = {}
    if status:
        query["status"] = status
    
    orders = await db.orders.find(query, {"_id": 0}).sort("created_at", -1).to_list(limit)
    return orders


@router.patch("/operator/orders/{order_id}/status")
async def operator_update_order_status(
    order_id: str,
    body: StatusUpdate,
    current_user: dict = Depends(get_current_user),
):
    """Update order status (operator only)"""
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


# ── Driver endpoints ──────────────────────────────────────────────────

@router.get("/driver/orders")
async def driver_get_orders(
    current_user: dict = Depends(get_current_user)
):
    """Get orders assigned to driver"""
    role = current_user.get("role", "")
    if role not in ("admin", "driver", "operator"):
        raise HTTPException(status_code=403, detail="Permission denied")
    
    user_id = current_user["id"]
    query = {} if role in ("admin", "operator") else {
        "$or": [{"assigned_driver_id": user_id}, {"driver_id": user_id}]
    }
    orders = await db.orders.find(query, {"_id": 0}).sort("created_at", -1).to_list(200)
    return orders


@router.patch("/driver/orders/{order_id}/status")
async def driver_update_order_status(
    order_id: str,
    body: StatusUpdate,
    current_user: dict = Depends(get_current_user),
):
    """Update order status (driver only)"""
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


# ── Debug ─────────────────────────────────────────────────────────────

@router.get("/debug/order-lookup/{identifier}")
async def debug_order_lookup(identifier: str):
    """Debug endpoint to lookup order by ID or number"""
    order = await db.orders.find_one({
        "$or": [{"id": identifier}, {"order_id": identifier}, {"order_number": identifier}]
    }, {"_id": 0})
    if order:
        return {
            "found": True, 
            "id": order.get("id"), 
            "order_number": order.get("order_number"), 
            "status": order.get("status")
        }
    return {"found": False, "searched_for": identifier}


# ── Image helpers ─────────────────────────────────────────────────────

async def _find_order(order_id: str) -> Optional[dict]:
    """Find order by ID or order number"""
    return await db.orders.find_one({
        "$or": [{"id": order_id}, {"order_id": order_id}, {"order_number": order_id}]
    }, {"_id": 0})


async def _save_image_to_disk(data: bytes, filename: str) -> Optional[Path]:
    """Save image to disk and return path"""
    file_path = UPLOAD_DIR / filename
    try:
        with open(file_path, "wb") as f:
            f.write(data)
        logger.info(f"Image saved: {file_path}")
        return file_path
    except Exception as e:
        logger.warning(f"Could not save to disk: {e}")
        return None


async def _notify_customer_after_image(order: dict, real_order_id: str, event_label: str):
    """
    FIX A: respects SKIP_SERVER_NOTIFICATIONS and should_notify_customer().
    Uses the current order status — only sends if that status has a
    customer-facing meaning (e.g. 'picked_up' is internal → skipped).
    """
    if not NOTIFICATIONS_ENABLED or SKIP_SERVER_NOTIFICATIONS:
        logger.debug(f"Skipping post-image notification ({event_label}): notifications disabled")
        return

    current_status = order.get("status", "confirmed")

    # FIX A: guard — don't spam customers for every image upload
    if not should_notify_customer(current_status):
        logger.debug(
            f"Skipping post-image notification ({event_label}): "
            f"status '{current_status}' is not customer-facing"
        )
        return

    try:
        customer_id = order.get("customer_id")
        if not customer_id:
            return
        customer = await db.customers.find_one({"id": customer_id}, {"_id": 0})
        if not customer:
            return
        await notify_order_status_changed(customer, order, current_status)
        logger.info(
            f"Customer notified after {event_label} on order {real_order_id} "
            f"(status={current_status})"
        )
    except Exception as e:
        logger.error(f"Error notifying customer after {event_label}: {e}")


def _validate_upload(file: UploadFile) -> str:
    """Validate content-type early (before reading full body). Returns content-type."""
    ct = (file.content_type or "application/octet-stream").lower().split(";")[0].strip()
    if ct not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Tipo de archivo no permitido: {ct}. Permitidos: {sorted(ALLOWED_IMAGE_TYPES)}"
        )
    return ct


# ── Pickup image ──────────────────────────────────────────────────────

@router.post("/driver/orders/{order_id}/pickup-image")
async def upload_pickup_image(
    order_id: str,
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    """Upload pickup proof image"""
    role = current_user.get("role", "")
    if role not in ("admin", "driver", "operator"):
        raise HTTPException(status_code=403, detail="Permiso denegado")

    # FIX D: validate type before reading body
    ct = _validate_upload(file)

    order = await _find_order(order_id)
    if not order:
        raise HTTPException(status_code=404, detail=f"Orden no encontrada: {order_id}")
    real_order_id = order.get("id") or order_id

    user_id = current_user["id"]
    if role == "driver":
        assigned = order.get("assigned_driver_id") or order.get("driver_id")
        if assigned and assigned != user_id:
            raise HTTPException(status_code=403, detail="No estás asignado a esta orden")

    try:
        data = await file.read()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error leyendo archivo: {e}")

    if len(data) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="Imagen demasiado grande (máx 10 MB)")

    ext      = (file.filename or "image.jpg").rsplit(".", 1)[-1].lower() if "." in (file.filename or "") else "jpg"
    uid      = str(uuid.uuid4())
    filename = f"pickup_{real_order_id}_{uid}.{ext}"
    file_path = await _save_image_to_disk(data, filename)

    data_b64 = base64.b64encode(data).decode("utf-8")
    now = datetime.now(timezone.utc).isoformat()

    record = {
        "id": uid, "order_id": real_order_id, "type": "pickup_proof",
        "storage_path": str(file_path) if file_path else None,
        "original_filename": file.filename, "content_type": ct,
        "size": len(data), "data_base64": data_b64,
        "uploaded_by": user_id, "uploader_role": role, "created_at": now,
    }
    try:
        await db.pickup_images.insert_one(record)
    except Exception as e:
        logger.error(f"Error saving pickup_image to DB: {e}")
        raise HTTPException(status_code=500, detail="Error al guardar imagen")

    update_data = {
        "pickup_image_id": uid, "pickup_image_data": data_b64,
        "pickup_image_url": f"/api/driver/orders/{real_order_id}/pickup-image/view",
        "pickup_image_uploaded_at": now,
        "pickup_image_filename": file.filename,
        "updated_at": now,
    }
    await db.orders.update_one({"id": real_order_id}, {"$set": update_data})

    try:
        await _record_status_history(
            real_order_id, order.get("status", "confirmed"),
            order.get("status", "confirmed"),
            f"{role}:{user_id} (pickup_image_uploaded)",
        )
    except Exception as e:
        logger.warning(f"Could not record status history: {e}")

    await create_audit_log("PICKUP_IMAGE_UPLOADED", "order", real_order_id, user_id, {"file_id": uid})
    await _notify_customer_after_image(order, real_order_id, "pickup_image")

    return {
        "message": "Imagen de recolección guardada correctamente",
        "id": uid, "image_id": uid,
        "filename": file.filename, "order_id": real_order_id,
        "size": len(data), "uploaded_at": now,
        "url": f"/api/driver/orders/{real_order_id}/pickup-image/view",
    }


@router.get("/driver/orders/{order_id}/pickup-image/view")
async def get_pickup_image(order_id: str, current_user: dict = Depends(get_current_user)):
    """Get pickup image as file"""
    role = current_user.get("role", "")
    if role not in ("admin", "driver", "operator"):
        raise HTTPException(status_code=403, detail="Permiso denegado")

    order = await _find_order(order_id)
    real_order_id = order.get("id") or order_id if order else order_id

    if order and order.get("pickup_image_data"):
        data  = base64.b64decode(order["pickup_image_data"])
        fname = order.get("pickup_image_filename", f"pickup_{real_order_id}.jpg")
        return Response(
            content=data, media_type="image/jpeg",
            headers={"Content-Disposition": f'inline; filename="{fname}"',
                     "Cache-Control": "private, max-age=86400"},
        )

    record = await db.pickup_images.find_one(
        {"order_id": real_order_id}, {"_id": 0}, sort=[("created_at", -1)]
    )
    if not record and order and order.get("pickup_image_id"):
        record = await db.pickup_images.find_one({"id": order["pickup_image_id"]}, {"_id": 0})

    if not record:
        raise HTTPException(status_code=404, detail="No hay imagen de recolección")

    if record.get("data_base64"):
        data = base64.b64decode(record["data_base64"])
        return Response(
            content=data, media_type=record.get("content_type", "image/jpeg"),
            headers={
                "Content-Disposition": f'inline; filename="{record.get("original_filename", "pickup.jpg")}"',
                "Cache-Control": "private, max-age=86400",
            },
        )

    storage_path = record.get("storage_path")
    if storage_path:
        try:
            with open(storage_path, "rb") as f:
                data = f.read()
            return Response(
                content=data, media_type=record.get("content_type", "image/jpeg"),
                headers={"Content-Disposition": f'inline; filename="{record.get("original_filename", "pickup.jpg")}"',
                         "Cache-Control": "private, max-age=86400"},
            )
        except FileNotFoundError:
            raise HTTPException(status_code=404, detail="Archivo no encontrado en disco")

    raise HTTPException(status_code=404, detail="Imagen no disponible")


@router.get("/driver/orders/{order_id}/pickup-image")
async def get_pickup_image_info(order_id: str, current_user: dict = Depends(get_current_user)):
    """Get pickup image metadata"""
    role = current_user.get("role", "")
    if role not in ("admin", "driver", "operator"):
        raise HTTPException(status_code=403, detail="Permiso denegado")

    order = await _find_order(order_id)
    real_order_id = order.get("id") or order_id if order else order_id

    record = await db.pickup_images.find_one(
        {"order_id": real_order_id}, {"_id": 0, "data_base64": 0}, sort=[("created_at", -1)]
    )
    if not record:
        if order and order.get("pickup_image_id"):
            return {
                "exists": True, "image_id": order["pickup_image_id"],
                "url": order.get("pickup_image_url", f"/api/driver/orders/{real_order_id}/pickup-image/view"),
            }
        return {"exists": False, "order_id": real_order_id}

    return {
        "exists": True, "image_id": record["id"],
        "filename": record.get("original_filename"),
        "uploaded_at": record.get("created_at"),
        "size": record.get("size"),
        "url": f"/api/driver/orders/{real_order_id}/pickup-image/view",
    }


# ── Delivery image ────────────────────────────────────────────────────

@router.post("/driver/orders/{order_id}/delivery-image")
async def upload_delivery_image(
    order_id: str,
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    """Upload delivery proof image"""
    role = current_user.get("role", "")
    if role not in ("admin", "driver", "operator"):
        raise HTTPException(status_code=403, detail="Permiso denegado")

    ct = _validate_upload(file)

    order = await _find_order(order_id)
    if not order:
        raise HTTPException(status_code=404, detail=f"Orden no encontrada: {order_id}")
    real_order_id = order.get("id") or order_id

    user_id = current_user["id"]
    if role == "driver":
        assigned = order.get("assigned_driver_id") or order.get("driver_id")
        if assigned and assigned != user_id:
            raise HTTPException(status_code=403, detail="No estás asignado a esta orden")

    try:
        data = await file.read()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error leyendo archivo: {e}")

    if len(data) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="Imagen demasiado grande (máx 10 MB)")

    ext      = (file.filename or "image.jpg").rsplit(".", 1)[-1].lower() if "." in (file.filename or "") else "jpg"
    uid      = str(uuid.uuid4())
    filename = f"delivery_{real_order_id}_{uid}.{ext}"
    file_path = await _save_image_to_disk(data, filename)

    data_b64 = base64.b64encode(data).decode("utf-8")
    now = datetime.now(timezone.utc).isoformat()

    record = {
        "id": uid, "order_id": real_order_id, "type": "delivery_proof",
        "storage_path": str(file_path) if file_path else None,
        "original_filename": file.filename, "content_type": ct,
        "size": len(data), "data_base64": data_b64,
        "uploaded_by": user_id, "uploader_role": role, "created_at": now,
    }
    try:
        await db.delivery_images.insert_one(record)
    except Exception as e:
        logger.error(f"Error saving delivery_image to DB: {e}")
        raise HTTPException(status_code=500, detail="Error al guardar imagen")

    update_data = {
        "delivery_image_id": uid, "delivery_image_data": data_b64,
        "delivery_image_url": f"/api/driver/orders/{real_order_id}/delivery-image/view",
        "delivery_image_uploaded_at": now,
        "delivery_image_filename": file.filename,
        "updated_at": now,
    }
    await db.orders.update_one({"id": real_order_id}, {"$set": update_data})

    await create_audit_log("DELIVERY_IMAGE_UPLOADED", "order", real_order_id, user_id, {"file_id": uid})
    await _notify_customer_after_image(order, real_order_id, "delivery_image")

    return {
        "message": "Imagen de entrega guardada correctamente",
        "id": uid, "image_id": uid,
        "filename": file.filename, "order_id": real_order_id,
        "size": len(data), "uploaded_at": now,
        "url": f"/api/driver/orders/{real_order_id}/delivery-image/view",
    }


@router.get("/driver/orders/{order_id}/delivery-image/view")
async def get_delivery_image(order_id: str, current_user: dict = Depends(get_current_user)):
    """Get delivery image as file"""
    role = current_user.get("role", "")
    if role not in ("admin", "driver", "operator"):
        raise HTTPException(status_code=403, detail="Permiso denegado")

    order = await _find_order(order_id)
    real_order_id = order.get("id") or order_id if order else order_id

    if order and order.get("delivery_image_data"):
        data  = base64.b64decode(order["delivery_image_data"])
        fname = order.get("delivery_image_filename", f"delivery_{real_order_id}.jpg")
        return Response(
            content=data, media_type="image/jpeg",
            headers={"Content-Disposition": f'inline; filename="{fname}"',
                     "Cache-Control": "private, max-age=86400"},
        )

    record = await db.delivery_images.find_one(
        {"order_id": real_order_id}, {"_id": 0}, sort=[("created_at", -1)]
    )
    if not record:
        raise HTTPException(status_code=404, detail="No hay imagen de entrega")

    if record.get("data_base64"):
        data = base64.b64decode(record["data_base64"])
        return Response(
            content=data, media_type=record.get("content_type", "image/jpeg"),
            headers={
                "Content-Disposition": f'inline; filename="{record.get("original_filename", "delivery.jpg")}"',
                "Cache-Control": "private, max-age=86400",
            },
        )

    storage_path = record.get("storage_path")
    if storage_path:
        try:
            with open(storage_path, "rb") as f:
                data = f.read()
            return Response(
                content=data, media_type=record.get("content_type", "image/jpeg"),
                headers={"Content-Disposition": f'inline; filename="{record.get("original_filename", "delivery.jpg")}"',
                         "Cache-Control": "private, max-age=86400"},
            )
        except FileNotFoundError:
            raise HTTPException(status_code=404, detail="Archivo no encontrado en disco")

    raise HTTPException(status_code=404, detail="Imagen no disponible")


@router.get("/driver/orders/{order_id}/delivery-image")
async def get_delivery_image_info(order_id: str, current_user: dict = Depends(get_current_user)):
    """Get delivery image metadata"""
    role = current_user.get("role", "")
    if role not in ("admin", "driver", "operator"):
        raise HTTPException(status_code=403, detail="Permiso denegado")

    order = await _find_order(order_id)
    real_order_id = order.get("id") or order_id if order else order_id

    record = await db.delivery_images.find_one(
        {"order_id": real_order_id}, {"_id": 0, "data_base64": 0}, sort=[("created_at", -1)]
    )
    if not record:
        if order and order.get("delivery_image_id"):
            return {
                "exists": True, "image_id": order["delivery_image_id"],
                "url": order.get("delivery_image_url", f"/api/driver/orders/{real_order_id}/delivery-image/view"),
            }
        return {"exists": False, "order_id": real_order_id}

    return {
        "exists": True, "image_id": record["id"],
        "filename": record.get("original_filename"),
        "uploaded_at": record.get("created_at"),
        "size": record.get("size"),
        "url": f"/api/driver/orders/{real_order_id}/delivery-image/view",
    }


@router.post("/driver/orders/{order_id}/delivery-image/link")
async def link_delivery_image(
    order_id: str,
    body: dict,
    current_user: dict = Depends(get_current_user),
):
    """Link an existing pickup image as delivery proof"""
    role = current_user.get("role", "")
    if role not in ("admin", "driver", "operator"):
        raise HTTPException(status_code=403, detail="Permiso denegado")

    image_id = body.get("image_id")
    if not image_id:
        raise HTTPException(status_code=400, detail="image_id requerido")

    order = await _find_order(order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Orden no encontrada")
    real_order_id = order.get("id") or order_id
    now = datetime.now(timezone.utc).isoformat()

    pickup_img = await db.pickup_images.find_one({"id": image_id}, {"_id": 0})
    if pickup_img:
        delivery_record = {
            **pickup_img,
            "id": str(uuid.uuid4()), "type": "delivery_proof",
            "order_id": real_order_id, "created_at": now,
            "linked_from_pickup_image_id": image_id,
        }
        await db.delivery_images.insert_one(delivery_record)
        await db.orders.update_one(
            {"id": real_order_id},
            {"$set": {
                "delivery_image_id": delivery_record["id"],
                "delivery_image_data": pickup_img.get("data_base64"),
                "delivery_image_url": f"/api/driver/orders/{real_order_id}/delivery-image/view",
                "delivery_image_uploaded_at": now,
                "updated_at": now,
            }},
        )

    return {"ok": True, "linked": bool(pickup_img)}


# ── Weight image ──────────────────────────────────────────────────────

@router.post("/driver/orders/{order_id}/weight-image")
async def upload_weight_image(
    order_id: str,
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    """Upload weight proof image (shows the scale/weight)"""
    role = current_user.get("role", "")
    if role not in ("admin", "operator", "driver"):
        raise HTTPException(status_code=403, detail="Permiso denegado")

    ct = _validate_upload(file)

    order = await _find_order(order_id)
    if not order:
        raise HTTPException(status_code=404, detail=f"Orden no encontrada: {order_id}")
    real_order_id = order.get("id") or order_id

    user_id = current_user["id"]
    # Drivers pueden subir weight si están asignados, pero normalmente solo operadores
    if role == "driver":
        assigned = order.get("assigned_driver_id") or order.get("driver_id")
        if assigned and assigned != user_id:
            raise HTTPException(status_code=403, detail="No estás asignado a esta orden")

    try:
        data = await file.read()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error leyendo archivo: {e}")

    if len(data) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="Imagen demasiado grande (máx 10 MB)")

    ext      = (file.filename or "image.jpg").rsplit(".", 1)[-1].lower() if "." in (file.filename or "") else "jpg"
    uid      = str(uuid.uuid4())
    filename = f"weight_{real_order_id}_{uid}.{ext}"
    file_path = await _save_image_to_disk(data, filename)

    data_b64 = base64.b64encode(data).decode("utf-8")
    now = datetime.now(timezone.utc).isoformat()

    record = {
        "id": uid, "order_id": real_order_id, "type": "weight_proof",
        "storage_path": str(file_path) if file_path else None,
        "original_filename": file.filename, "content_type": ct,
        "size": len(data), "data_base64": data_b64,
        "uploaded_by": user_id, "uploader_role": role, "created_at": now,
    }
    try:
        # Usamos la colección weight_images (asegúrate de crearla)
        await db.weight_images.insert_one(record)
    except Exception as e:
        logger.error(f"Error saving weight_image to DB: {e}")
        raise HTTPException(status_code=500, detail="Error al guardar imagen")

    update_data = {
        "weight_image_id": uid, "weight_image_data": data_b64,
        "weight_image_url": f"/api/driver/orders/{real_order_id}/weight-image/view",
        "weight_image_uploaded_at": now,
        "weight_image_filename": file.filename,
        "updated_at": now,
    }
    await db.orders.update_one({"id": real_order_id}, {"$set": update_data})

    await create_audit_log("WEIGHT_IMAGE_UPLOADED", "order", real_order_id, user_id, {"file_id": uid})
    # NO notificamos al cliente por una foto de peso (es solo evidencia interna)

    return {
        "message": "Imagen de peso guardada correctamente",
        "id": uid, "image_id": uid,
        "filename": file.filename, "order_id": real_order_id,
        "size": len(data), "uploaded_at": now,
        "url": f"/api/driver/orders/{real_order_id}/weight-image/view",
    }


@router.get("/driver/orders/{order_id}/weight-image/view")
async def get_weight_image(order_id: str, current_user: dict = Depends(get_current_user)):
    """Get weight image as file"""
    role = current_user.get("role", "")
    if role not in ("admin", "driver", "operator"):
        raise HTTPException(status_code=403, detail="Permiso denegado")

    order = await _find_order(order_id)
    real_order_id = order.get("id") or order_id if order else order_id

    if order and order.get("weight_image_data"):
        data  = base64.b64decode(order["weight_image_data"])
        fname = order.get("weight_image_filename", f"weight_{real_order_id}.jpg")
        return Response(
            content=data, media_type="image/jpeg",
            headers={"Content-Disposition": f'inline; filename="{fname}"',
                     "Cache-Control": "private, max-age=86400"},
        )

    record = await db.weight_images.find_one(
        {"order_id": real_order_id}, {"_id": 0}, sort=[("created_at", -1)]
    )
    if not record:
        raise HTTPException(status_code=404, detail="No hay imagen de peso")

    if record.get("data_base64"):
        data = base64.b64decode(record["data_base64"])
        return Response(
            content=data, media_type=record.get("content_type", "image/jpeg"),
            headers={
                "Content-Disposition": f'inline; filename="{record.get("original_filename", "weight.jpg")}"',
                "Cache-Control": "private, max-age=86400",
            },
        )

    storage_path = record.get("storage_path")
    if storage_path:
        try:
            with open(storage_path, "rb") as f:
                data = f.read()
            return Response(
                content=data, media_type=record.get("content_type", "image/jpeg"),
                headers={"Content-Disposition": f'inline; filename="{record.get("original_filename", "weight.jpg")}"',
                         "Cache-Control": "private, max-age=86400"},
            )
        except FileNotFoundError:
            raise HTTPException(status_code=404, detail="Archivo no encontrado en disco")

    raise HTTPException(status_code=404, detail="Imagen no disponible")


@router.get("/driver/orders/{order_id}/weight-image")
async def get_weight_image_info(order_id: str, current_user: dict = Depends(get_current_user)):
    """Get weight image metadata"""
    role = current_user.get("role", "")
    if role not in ("admin", "driver", "operator"):
        raise HTTPException(status_code=403, detail="Permiso denegado")

    order = await _find_order(order_id)
    real_order_id = order.get("id") or order_id if order else order_id

    record = await db.weight_images.find_one(
        {"order_id": real_order_id}, {"_id": 0, "data_base64": 0}, sort=[("created_at", -1)]
    )
    if not record:
        if order and order.get("weight_image_id"):
            return {
                "exists": True, "image_id": order["weight_image_id"],
                "url": order.get("weight_image_url", f"/api/driver/orders/{real_order_id}/weight-image/view"),
            }
        return {"exists": False, "order_id": real_order_id}

    return {
        "exists": True, "image_id": record["id"],
        "filename": record.get("original_filename"),
        "uploaded_at": record.get("created_at"),
        "size": record.get("size"),
        "url": f"/api/driver/orders/{real_order_id}/weight-image/view",
    }

@router.get("/operator/orders/{order_id}")
async def get_operator_order_by_id(
    order_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Get full order details (including images) for operator view"""
    if not has_permission(current_user, "orders:read"):
        raise HTTPException(status_code=403, detail="Permission denied")

    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    # ── Enrich with customer data if missing ──────────────────────────────
    customer_id = order.get("customer_id")
    if customer_id and (not order.get("customer_phone") or not order.get("customer_email")):
        customer = await db.customers.find_one({"id": customer_id}, {"_id": 0})
        if customer:
            # Only fill in fields missing from the order document
            for field in ("customer_phone", "customer_email", "preferred_contact",
                          "membership_plan", "membership_status", "stripe_customer_id",
                          "card_last4", "card_brand", "distance_miles"):
                if not order.get(field) and customer.get(field):
                    order[field] = customer[field]
            # customer_name fallback
            if not order.get("customer_name") and customer.get("name"):
                order["customer_name"] = customer["name"]

    return order

@router.post("/driver/orders/{order_id}/weight-image/link")
async def link_weight_image(
    order_id: str,
    body: dict,
    current_user: dict = Depends(get_current_user),
):
    """Link an existing pickup image as weight proof"""
    role = current_user.get("role", "")
    if role not in ("admin", "driver", "operator"):
        raise HTTPException(status_code=403, detail="Permiso denegado")

    image_id = body.get("image_id")
    if not image_id:
        raise HTTPException(status_code=400, detail="image_id requerido")

    order = await _find_order(order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Orden no encontrada")
    real_order_id = order.get("id") or order_id
    now = datetime.now(timezone.utc).isoformat()

    # Buscar la imagen en pickup_images
    source_img = await db.pickup_images.find_one({"id": image_id}, {"_id": 0})
    if source_img:
        weight_record = {
            **source_img,
            "id": str(uuid.uuid4()),
            "type": "weight_proof",
            "order_id": real_order_id,
            "created_at": now,
            "linked_from_pickup_image_id": image_id,
        }
        await db.weight_images.insert_one(weight_record)
        await db.orders.update_one(
            {"id": real_order_id},
            {"$set": {
                "weight_image_id": weight_record["id"],
                "weight_image_data": source_img.get("data_base64"),
                "weight_image_url": f"/api/driver/orders/{real_order_id}/weight-image/view",
                "weight_image_uploaded_at": now,
                "updated_at": now,
            }},
        )

    return {"ok": True, "linked": bool(source_img)}