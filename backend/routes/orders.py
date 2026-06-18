import io
import os
import uuid
import zipfile
import logging
import asyncio
from datetime import datetime, timezone, date
from typing import Dict, List, Optional
from zoneinfo import ZoneInfo
import stripe

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import HTMLResponse, StreamingResponse
from pydantic import BaseModel

from auth import get_current_user, require_admin, require_role, get_current_customer
from database import SKIP_SERVER_NOTIFICATIONS, db
from models import (
    ROLE_OPERATOR,
    ROLE_ADMIN,
    OrderCreate,
    OrderPaymentUpdate,
    OrderResponse,
    OrderStripeCheckoutRequest,
    OrderStripeCheckoutResponse,
    QrResolveRequest,
)
from realtime import emit_realtime
from utils import (
    TZ_PACIFIC,
    build_address_parts,
    build_display_order_number,
    build_order_times,
    build_qr_payload,
    build_ticket_svg,
    calculate_delivery_fee,
    calculate_service_amount,
    calculate_final_amount_with_membership,
    should_skip_payment_notification,
    create_audit_log,
    generate_order_number,
    normalize_address,
    normalize_payment_method,
    normalize_spaces,
    normalize_status,
    parse_qr_payload,
    should_notify_order_status,
    validate_order_payload,
    is_active_member,
    get_customer_cycle_usage,
)
from automation_engine import (
    maybe_send_survey_after_delivery,
    maybe_create_next_recurring_order,
)

PT_TZ = ZoneInfo("America/Los_Angeles")
logger = logging.getLogger(__name__)

# ── Notifications (optional) ──────────────────────────────────────────────────
try:
    from notifications import notify_order_created, notify_order_status_changed
    NOTIFICATIONS_ENABLED = True
except ImportError:
    NOTIFICATIONS_ENABLED = False

# ── Stripe Checkout (native) ─────────────────────────────────────────────────
import stripe
from stripe.error import StripeError

class CheckoutSessionRequest(BaseModel):
    amount: float
    currency: str
    success_url: str
    cancel_url: str
    metadata: Optional[Dict[str, str]] = None

class CheckoutSessionResponse(BaseModel):
    url: str = ""
    session_id: str = ""

class CheckoutStatusResponse(BaseModel):
    status: str = ""
    payment_status: str = ""
    amount_total: int = 0
    currency: str = ""
    metadata: Dict[str, str] = {}

class StripeCheckout:
    def __init__(self, api_key: str, webhook_url: str):
        stripe.api_key = api_key
        self.webhook_url = webhook_url

    async def create_checkout_session(self, request):
        session = stripe.checkout.Session.create(
            payment_method_types=["card"],
            line_items=[{
                "price_data": {
                    "currency": request.currency,
                    "product_data": {
                        "name": "Servicio de Lavandería",
                    },
                    "unit_amount": int(request.amount * 100),
                },
                "quantity": 1,
            }],
            mode="payment",
            success_url=request.success_url,
            cancel_url=request.cancel_url,
            metadata=request.metadata or {},
        )
        return CheckoutSessionResponse(
            url=session.url, session_id=session.id)

    async def get_checkout_status(self, sid):
        session = stripe.checkout.Session.retrieve(sid)
        return CheckoutStatusResponse(
            status=session.status,
            payment_status=session.payment_status,
            amount_total=session.amount_total,
            currency=session.currency,
            metadata=session.metadata,
        )

STRIPE_CHECKOUT_AVAILABLE = True


router = APIRouter(prefix="/api", tags=["Orders"])


# ==================== Helper: recalculate total with membership ====================

async def _recalculate_order_total(
    order_id: str,
    order_data: Optional[dict],
    customer_data: Optional[dict],
) -> Optional[Dict]:
    if not order_data:
        order_data = await db.orders.find_one({"id": order_id}, {"_id": 0})
        if not order_data:
            return None

    if not customer_data and order_data.get("customer_id"):
        customer_data = await db.customers.find_one(
            {"id": order_data["customer_id"]}, {"_id": 0}
        )

    if not order_data.get("actual_lbs"):
        return None

    breakdown = await calculate_final_amount_with_membership(order_data, customer_data)
    if not breakdown:
        return None

    new_total = breakdown["total"]
    now_iso   = datetime.now(timezone.utc).isoformat()

    update_fields = {
        "total_amount":        new_total,
        "updated_at":          now_iso,
        "extra_charge":        new_total,
        "lbs_from_allowance":  breakdown["lbs_covered"],
        "extra_lbs_billed":    breakdown["lbs_extra"],
        "membership_discount": breakdown["membership_discount"],
        "price_per_lb":        breakdown["rate_used"],
    }

    if new_total <= 0.50:
        update_fields["payment_status"]  = "paid"
        update_fields["paid_at"]         = now_iso
        update_fields["payment_method"]  = "membership_covered"
        update_fields["amount_paid"]     = 0.0
        update_fields["processing_fee"]  = 0.0
        update_fields["change_due"]      = 0.0
    else:
        if (
            order_data.get("payment_status") == "paid"
            and order_data.get("payment_method") == "membership_covered"
        ):
            update_fields["payment_status"] = "pending"

    await db.orders.update_one({"id": order_id}, {"$set": update_fields})
    return breakdown


# ==================== ORDERS CRUD ====================

@router.post("/orders", response_model=OrderResponse)
async def create_order(
    data: OrderCreate,
    notify: bool = True,
    current_user: dict = Depends(get_current_user),
) -> OrderResponse:
    customer = await db.customers.find_one({"id": data.customer_id}, {"_id": 0})
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    if not data.pickup_date:
        raise HTTPException(status_code=400, detail="pickup_date es obligatorio")

    today_local = datetime.now(TZ_PACIFIC).date()
    try:
        pickup_date_obj = datetime.strptime(data.pickup_date, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=400, detail="pickup_date must be YYYY-MM-DD")

    if current_user.get("role") != "admin" and pickup_date_obj < today_local:
        raise HTTPException(
            status_code=400,
            detail=f"Pickup date cannot be in the past. Today is {today_local.isoformat()}",
        )

    if data.pickup_time_window and data.pickup_time_window not in ("8-12", "14-18"):
        raise HTTPException(status_code=400, detail="time_window debe ser '8-12' o '14-18'")

    if data.estimated_lbs is not None and data.estimated_lbs <= 0:
        raise HTTPException(status_code=400, detail="estimated_lbs debe ser positivo")

    order_id     = str(uuid.uuid4())
    order_number = await generate_order_number()
    now          = datetime.now(timezone.utc).isoformat()
    errors       = validate_order_payload(data)

    normalized_pickup_address   = normalize_address(data.pickup_address or customer.get("address"))
    normalized_delivery_address = normalize_address(data.delivery_address)
    normalized_notes            = normalize_spaces(data.notes)
    normalized_gate_code        = normalize_spaces(data.gate_code)
    normalized_service_type     = normalize_spaces(data.service_type).lower().replace(" ", "_")

    pref = await db.preferences.find(
        {"customer_id": data.customer_id}, {"_id": 0}
    ).sort("version", -1).limit(1).to_list(1)
    preference_id       = pref[0].get("id") if pref else None
    preference_snapshot = None
    if pref:
        preference_snapshot = {
            k: v for k, v in pref[0].items() if k not in ["_id", "customer_id"]
        }

    order = {
        "id":                   order_id,
        "order_number":         order_number,
        "customer_id":          data.customer_id,
        "customer_name":        customer["name"],
        "service_type":         normalized_service_type,
        "service_plan":         data.service_plan,
        "pickup_date":          data.pickup_date,
        "pickup_time_window":   data.pickup_time_window,
        "pickup_address":       normalized_pickup_address,
        "delivery_address":     normalized_delivery_address,
        "estimated_lbs":        data.estimated_lbs,
        "actual_lbs":           None,
        "notes":                normalized_notes,
        "gate_code":            normalized_gate_code,
        "preferences_id":       preference_id,
        "preferences_snapshot": preference_snapshot,
        "status":               "new",
        "estado_actual":        "new",
        "payment_status":       "unpaid",
        "total_amount":         None,
        "tiempos":              build_order_times(now, "new"),
        "errores_validacion": [
            {**error, "mensaje": error["codigo"], "timestamp": now}
            for error in errors
        ],
        "secciones": [
            {"nombre": "ingesta",       "estado": "done",    "inicio": now, "fin": now, "errores": []},
            {"nombre": "procesamiento", "estado": "pending", "inicio": None, "fin": None, "errores": []},
        ],
        "importada":           False,
        "origen":              "crm",
        "qr_token":            str(uuid.uuid4()),
        "created_at":          now,
        "updated_at":          now,
        "extra_charge":        0.0,
        "lbs_from_allowance":  0,
        "extra_lbs_billed":    0,
        "membership_discount": 0.0,
        "recurrence":          "once",
        "recurrence_end_date": None,
        "recurrence_days":     None,
        "recurrence_parent_id": None,
        "is_recurring":        False,
    }
    await db.orders.insert_one(order)
    await db.customers.update_one({"id": data.customer_id}, {"$inc": {"total_orders": 1}})
    await db.eventos_automation.insert_one({
        "id":         str(uuid.uuid4()),
        "tipo":       "ORDER_CREATED",
        "entity_id":  order_id,
        "payload":    {"order_number": order_number, "service_type": data.service_type},
        "created_at": now,
    })
    await create_audit_log("ORDER_CREATED", "order", order_id, current_user["id"])
    await emit_realtime("notification", {
        "type":         "order_created",
        "order_id":     order_id,
        "status":       "new",
        "order_number": order_number,
    })

    if notify and NOTIFICATIONS_ENABLED and not SKIP_SERVER_NOTIFICATIONS:
        try:
            await notify_order_created(customer, order)
        except Exception as e:
            logger.error(f"Notification failed: {e}")

    return OrderResponse(**order)


@router.get("/orders", response_model=List[OrderResponse])
async def get_orders(
    status:       Optional[str] = None,
    customer_id:  Optional[str] = None,
    date_from:    Optional[str] = None,
    date_to:      Optional[str] = None,
    page:         int = Query(1, ge=1),
    page_size:    int = Query(50, ge=1, le=100),
    current_user: dict = Depends(get_current_user),
) -> List[OrderResponse]:
    query = {}
    if status:
        # Cubre TODAS las variantes legacy (UPPERCASE, hyphen, alias)
        from order_status import status_in_query
        query["status"] = status_in_query(status)
    if customer_id:
        query["customer_id"] = customer_id
    if date_from:
        query["created_at"] = {"$gte": date_from}
    if date_to:
        query.setdefault("created_at", {})["$lte"] = date_to

    skip   = (page - 1) * page_size
    orders = await db.orders.find(query, {"_id": 0}).sort(
        "created_at", -1
    ).skip(skip).limit(page_size).to_list(page_size)

    # Normaliza el status canónico de cada orden en la respuesta
    for o in orders:
        if o.get("status"):
            o["status"] = normalize_status(o["status"]) or o["status"]

    return [OrderResponse(**order) for order in orders]


@router.get("/orders/{order_id}", response_model=OrderResponse)
async def get_order(
    order_id:     str,
    current_user: dict = Depends(get_current_user),
) -> OrderResponse:
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        order = await db.orders.find_one({"order_number": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    # Normalizar status canónico
    if order.get("status"):
        order["status"] = normalize_status(order["status"]) or order["status"]
    return OrderResponse(**order)


@router.get("/orders/{order_id}/qr")
async def get_order_qr(
    order_id:     str,
    current_user: dict = Depends(get_current_user),
) -> dict:
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    qr_token = order.get("qr_token") or str(uuid.uuid4())
    if not order.get("qr_token"):
        await db.orders.update_one({"id": order_id}, {"$set": {"qr_token": qr_token}})

    return {
        "order_id":     order_id,
        "order_number": order.get("order_number"),
        "qr_token":     qr_token,
    }


@router.get("/orders/{order_id}/qr.svg")
async def get_order_qr_svg(order_id: str) -> StreamingResponse:
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        order = await db.orders.find_one({"order_number": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    qr_token = order.get("qr_token") or str(uuid.uuid4())
    if not order.get("qr_token"):
        await db.orders.update_one({"id": order.get("id")}, {"$set": {"qr_token": qr_token}})

    customer = None
    if order.get("customer_id"):
        customer = await db.customers.find_one({"id": order.get("customer_id")}, {"_id": 0})

    payload    = build_qr_payload({
        "id": order.get("id"), "order_number": order.get("order_number"), "qr_token": qr_token
    })
    ticket_svg = build_ticket_svg(order, customer, payload)
    display_id = build_display_order_number(order)
    filename   = f"ticket-{display_id}.svg"

    return StreamingResponse(
        io.BytesIO(ticket_svg),
        media_type="image/svg+xml",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.get("/orders/qr/export")
async def export_qr_batch(
    start_date:   str = Query(..., description="Start date YYYY-MM-DD"),
    end_date:     str = Query(..., description="End date YYYY-MM-DD"),
    status:       Optional[str] = None,
    service_type: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
) -> StreamingResponse:
    query = {"pickup_date": {"$gte": start_date, "$lte": end_date}}
    if status:
        query["status"] = status
    if service_type:
        query["service_type"] = service_type

    export_limit = 500
    orders = await db.orders.find(query, {"_id": 0}).sort(
        "pickup_date", 1
    ).limit(export_limit + 1).to_list(export_limit + 1)

    if len(orders) > export_limit:
        raise HTTPException(
            status_code=400,
            detail=f"Export limit exceeded. Please narrow to {export_limit} orders or fewer.",
        )

    customer_ids = {o.get("customer_id") for o in orders if o.get("customer_id")}
    customer_map = {}
    if customer_ids:
        customers = await db.customers.find(
            {"id": {"$in": list(customer_ids)}}, {"_id": 0}
        ).to_list(len(customer_ids))
        customer_map = {c.get("id"): c for c in customers}

    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
        for order in orders:
            qr_token = order.get("qr_token") or str(uuid.uuid4())
            if not order.get("qr_token"):
                await db.orders.update_one(
                    {"id": order["id"]}, {"$set": {"qr_token": qr_token}}
                )
            payload    = build_qr_payload({
                "id": order["id"], "order_number": order.get("order_number"), "qr_token": qr_token
            })
            customer   = customer_map.get(order.get("customer_id"))
            ticket_svg = build_ticket_svg(order, customer, payload)
            display_id = build_display_order_number(order)
            zip_file.writestr(f"ticket-{display_id}.svg", ticket_svg)

    buffer.seek(0)
    fname = f"qr-export-{start_date}-to-{end_date}.zip"
    return StreamingResponse(
        buffer,
        media_type="application/zip",
        headers={"Content-Disposition": f"attachment; filename={fname}"},
    )


@router.post("/orders/qr/resolve")
async def resolve_qr(
    data:         QrResolveRequest,
    current_user: dict = Depends(get_current_user),
) -> dict:
    payload_data = {}
    if data.payload:
        payload_data = parse_qr_payload(data.payload)

    qr_token     = data.qr_token or payload_data.get("qr_token")
    order_id     = payload_data.get("order_id")
    order_number = payload_data.get("order_number")

    if not qr_token and not order_id and not order_number:
        raise HTTPException(status_code=400, detail="QR sin datos validos")

    order = None
    if qr_token:
        order = await db.orders.find_one({"qr_token": qr_token}, {"_id": 0})
    if not order and order_id:
        order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order and order_number:
        order = await db.orders.find_one({"order_number": order_number}, {"_id": 0})

    if not order:
        raise HTTPException(status_code=404, detail="Orden no encontrada")

    if qr_token and order.get("qr_token") and order.get("qr_token") != qr_token:
        raise HTTPException(status_code=400, detail="QR no coincide con la orden")

    customer_name = order.get("customer_name")
    if not customer_name and order.get("customer_id"):
        customer = await db.customers.find_one({"id": order.get("customer_id")}, {"_id": 0})
        customer_name = customer.get("name") if customer else None

    delivery_address = order.get("delivery_address") or order.get("pickup_address")
    address_parts    = build_address_parts(delivery_address)

    return {
        "order_id":             order.get("id"),
        "order_number":         order.get("order_number"),
        "service_type":         order.get("service_type"),
        "customer_name":        customer_name,
        "address":              address_parts,
        "request_datetime":     order.get("created_at"),
        "status":               order.get("status"),
        "items":                order.get("items") or order.get("services_included") or order.get("products") or [],
        "total_amount":         order.get("total_amount"),
        "special_instructions": order.get("notes") or order.get("special_instructions"),
        "pickup_date":          order.get("pickup_date"),
        "pickup_time_window":   order.get("pickup_time_window"),
        "payment_status":       order.get("payment_status"),
    }


@router.put("/orders/{order_id}", response_model=OrderResponse)
async def update_order(
    order_id:     str,
    data:         dict,
    current_user: dict = Depends(get_current_user),
) -> OrderResponse:
    update_data = data.copy()
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()

    if "actual_lbs" in update_data:
        current_order = await db.orders.find_one({"id": order_id}, {"_id": 0})
        if current_order:
            customer = None
            if current_order.get("customer_id"):
                customer = await db.customers.find_one(
                    {"id": current_order["customer_id"]}, {"_id": 0}
                )
            merged    = {**current_order, **update_data}
            breakdown = await calculate_final_amount_with_membership(merged, customer)

            if breakdown:
                new_total = breakdown["total"]
                update_data.update({
                    "total_amount":        new_total,
                    "extra_charge":        new_total,
                    "membership_discount": breakdown["membership_discount"],
                    "price_per_lb":        breakdown["rate_used"],
                    "lbs_from_allowance":  breakdown["lbs_covered"],
                    "extra_lbs_billed":    breakdown["lbs_extra"],
                })

                if new_total <= 0.50:
                    update_data["payment_status"] = "paid"
                    update_data["paid_at"]        = update_data["updated_at"]
                    update_data["payment_method"] = "membership_covered"
                    update_data["amount_paid"]    = 0.0
                elif (
                    current_order.get("payment_status") == "paid"
                    and current_order.get("payment_method") == "membership_covered"
                ):
                    update_data["payment_status"] = "pending"

    result = await db.orders.update_one({"id": order_id}, {"$set": update_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Order not found")

    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    return OrderResponse(**order)


@router.patch("/orders/{order_id}/status")
async def update_order_status(
    order_id:     str,
    status:       str,
    notify:       bool = True,
    current_user: dict = Depends(get_current_user),
) -> dict:
    from order_status import normalize_status, CANONICAL_STATUSES

    # Normaliza alias/legacy/uppercase → canónico
    normalized_status = normalize_status(status)

    if normalized_status not in CANONICAL_STATUSES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid status '{status}'. Valid: {list(CANONICAL_STATUSES)}",
        )

    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    current_status = normalize_status(order.get("status")) or ""
    service_type   = normalize_spaces(
        order.get("service_type") or "pickup_delivery"
    ).lower().replace(" ", "_")

    if normalized_status == "completed":
        if service_type in ("wash_fold", "wash_fold_dropoff", "self_service"):
            if current_status not in ("ready", "completed"):
                raise HTTPException(
                    status_code=400,
                    detail="Wash & Fold must be ready before it can be completed",
                )
        elif current_status not in ("delivered", "completed", "out_for_delivery"):
            raise HTTPException(
                status_code=400,
                detail="Order must be delivered before it can be completed",
            )

    if normalized_status == "cancelled" and current_status in ("completed", "delivered"):
        raise HTTPException(
            status_code=400,
            detail=f"Cannot cancel an order that is already {current_status}",
        )

    now = datetime.now(timezone.utc).isoformat()
    await db.orders.update_one(
        {"id": order_id},
        {
            "$set": {
                "status":                                     normalized_status,
                "estado_actual":                              normalized_status,
                "updated_at":                                 now,
                "tiempos.ultimo_cambio_estado":               now,
                f"tiempos.fechas_estado.{normalized_status}": now,
            }
        },
    )

    await create_audit_log(
        "ORDER_STATUS_CHANGED", "order", order_id, current_user["id"],
        {"new_status": normalized_status},
    )
    await db.eventos_automation.insert_one({
        "id":         str(uuid.uuid4()),
        "tipo":       "ORDER_STATUS_CHANGED",
        "entity_id":  order_id,
        "payload":    {"status": normalized_status},
        "created_at": now,
    })

    should_send_notification = (
        notify
        and NOTIFICATIONS_ENABLED
        and not SKIP_SERVER_NOTIFICATIONS
        and order.get("customer_id")
        and should_notify_order_status(order, normalized_status)
    )

    if should_send_notification:
        dedupe_field     = f"notified_status.{normalized_status}"
        already_notified = await db.orders.find_one(
            {"id": order_id, dedupe_field: {"$exists": True}},
            {"_id": 0, "id": 1},
        )
        if not already_notified:
            customer = await db.customers.find_one(
                {"id": order["customer_id"]}, {"_id": 0}
            )
            if customer:
                order["status"] = normalized_status
                try:
                    await notify_order_status_changed(customer, order, normalized_status)
                    now_notif = datetime.now(timezone.utc).isoformat()
                    await db.orders.update_one(
                        {"id": order_id}, {"$set": {dedupe_field: now_notif}}
                    )
                except Exception as e:
                    logger.error(f"Notification failed: {e}")
        else:
            logger.info(f"Notification skipped (already sent): order {order_id} → {normalized_status}")

    await emit_realtime("notification", {
        "type":         "order_status_changed",
        "order_id":     order_id,
        "status":       normalized_status,
        "order_number": order.get("order_number"),
    })

    # ═══════════════════════════════════════════════════════════════════════
    # 🔥 POST-DELIVERY AUTOMATION: SURVEY + RECURRENCE
    # ═══════════════════════════════════════════════════════════════════════
    if normalized_status in ("delivered", "completed"):
        # Survey automation (every 3 completed orders)
        try:
            asyncio.create_task(maybe_send_survey_after_delivery(order_id))
            logger.info(f"Survey scheduled for order {order_id}")
        except Exception as e:
            logger.error(f"Failed to schedule survey for order {order_id}: {e}")

        # Recurrence automation (weekly/biweekly/twice_week)
        try:
            asyncio.create_task(maybe_create_next_recurring_order(order_id))
            logger.info(f"Recurrence automation scheduled for order {order_id}")
        except Exception as e:
            logger.error(f"Failed to schedule recurrence for order {order_id}: {e}")

    return {"message": f"Status updated to {normalized_status}", "order_id": order_id}


@router.patch("/orders/{order_id}/payment-status")
async def update_order_payment_status(
    order_id:     str,
    status:       str,
    current_user: dict = Depends(get_current_user),
) -> dict:
    valid_statuses = ("pending", "paid", "refunded", "failed")
    if status not in valid_statuses:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid payment status. Must be one of: {list(valid_statuses)}",
        )

    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    await db.orders.update_one(
        {"id": order_id},
        {"$set": {"payment_status": status, "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    await create_audit_log(
        "ORDER_PAYMENT_STATUS_CHANGED", "order", order_id, current_user["id"],
        {"payment_status": status},
    )
    await emit_realtime("notification", {
        "type":     "order_payment",
        "order_id": order_id,
        "status":   status,
    })
    return {"message": f"Payment status updated to {status}"}


@router.post("/orders/{order_id}/payment")
async def capture_order_payment(
    order_id:     str,
    data:         OrderPaymentUpdate,
    current_user: dict = Depends(require_role([ROLE_OPERATOR, ROLE_ADMIN])),
) -> dict:
    method  = normalize_payment_method(data.payment_method)
    allowed = ("cash", "card", "transfer", "zelle", "other")

    if method not in allowed:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid payment method. Must be one of: {list(allowed)}",
        )

    order = await db.orders.find_one(
        {"$or": [{"id": order_id}, {"order_number": order_id}]}, {"_id": 0}
    )
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    if order.get("payment_status") == "paid":
        raise HTTPException(status_code=400, detail="Order is already paid")

    total_amount    = order.get("total_amount")
    amount_received = data.amount_received

    if method == "cash" and amount_received is None:
        raise HTTPException(status_code=400, detail="Amount received is required for cash payments")

    if amount_received is None:
        amount_received = total_amount

    if total_amount is not None and amount_received is not None:
        try:
            total_amount    = float(total_amount)
            amount_received = float(amount_received)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid amount values")

        if amount_received < total_amount:
            raise HTTPException(status_code=400, detail="Amount received cannot be less than total")

    change_due = None
    if method == "cash" and total_amount is not None and amount_received is not None:
        change_due = round(amount_received - total_amount, 2)

    processing_fee = 0.0
    if method in ("card", "stripe") and total_amount is not None:
        processing_fee = round(float(total_amount) * 0.03, 2)

    now = datetime.now(timezone.utc).isoformat()
    update_data = {
        "payment_status":  "paid",
        "payment_method":  method,
        "amount_paid":     amount_received,
        "processing_fee":  processing_fee,
        "change_due":      change_due,
        "paid_at":         now,
        "updated_at":      now,
    }

    await db.orders.update_one({"id": order.get("id")}, {"$set": update_data})
    await create_audit_log(
        "ORDER_PAYMENT_CAPTURED", "order", order.get("id"), current_user["id"], update_data
    )

    finance_entry = {
        "id":             str(uuid.uuid4()),
        "type":           "income",
        "category":       "service_payment",
        "description":    f"Pago orden {order.get('order_number', order_id)} - {order.get('service_type', 'service')}",
        "amount":         float(amount_received or total_amount or 0),
        "payment_method": method,
        "order_id":       order.get("id"),
        "order_number":   order.get("order_number"),
        "customer_id":    order.get("customer_id"),
        "customer_name":  order.get("customer_name"),
        "date":           now[:10],
        "created_at":     now,
        "updated_at":     now,
    }
    await db.finances.insert_one(finance_entry)

    await emit_realtime("notification", {
        "type":     "order_payment",
        "order_id": order.get("id"),
        "status":   "paid",
        "method":   method,
    })

    return {"ok": True, "order_id": order.get("id"), **update_data}


# ==================== DELETE ORDER ====================

@router.delete("/orders/{order_id}")
async def delete_order(
    order_id:     str,
    current_user: dict = Depends(require_role([ROLE_OPERATOR])),
) -> dict:
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    if order.get("status") == "completed":
        raise HTTPException(
            status_code=400,
            detail="Cannot delete completed orders. Please archive instead.",
        )

    result = await db.orders.delete_one({"id": order_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Order not found")

    await create_audit_log(
        "ORDER_DELETED", "order", order_id, current_user["id"],
        {
            "order_number":  order.get("order_number"),
            "customer_name": order.get("customer_name"),
            "service_type":  order.get("service_type"),
            "status":        order.get("status"),
        },
    )
    await emit_realtime("notification", {
        "type":         "order_deleted",
        "order_id":     order_id,
        "order_number": order.get("order_number"),
    })
    return {
        "ok":       True,
        "message":  f"Order {order.get('order_number', order_id)} deleted successfully",
        "order_id": order_id,
    }


@router.delete("/orders/batch-delete")
async def batch_delete_orders(
    order_ids:    List[str],
    current_user: dict = Depends(require_role([ROLE_OPERATOR])),
) -> dict:
    if not order_ids:
        raise HTTPException(status_code=400, detail="No order IDs provided")

    orders = await db.orders.find(
        {"id": {"$in": order_ids}}, {"_id": 0}
    ).to_list(len(order_ids))

    if not orders:
        raise HTTPException(status_code=404, detail="No orders found")

    completed_orders = [o for o in orders if o.get("status") == "completed"]
    if completed_orders:
        completed_ids = [o.get("order_number") for o in completed_orders[:5]]
        raise HTTPException(
            status_code=400,
            detail=f"Cannot delete completed orders. Found {len(completed_orders)}: {', '.join(completed_ids)}",
        )

    result = await db.orders.delete_many({"id": {"$in": order_ids}})

    await create_audit_log(
        "ORDERS_BATCH_DELETED", "orders", ",".join(order_ids[:10]), current_user["id"],
        {"count": result.deleted_count, "order_ids": order_ids[:50]},
    )
    await emit_realtime("notification", {
        "type":  "orders_batch_deleted",
        "count": result.deleted_count,
    })
    return {
        "ok":            True,
        "message":       f"{result.deleted_count} orders deleted successfully",
        "deleted_count": result.deleted_count,
    }


# ==================== STRIPE CHECKOUT ====================

@router.post("/orders/{order_id}/stripe-checkout", response_model=OrderStripeCheckoutResponse)
async def create_order_stripe_checkout(
    order_id:     str,
    data:         OrderStripeCheckoutRequest,
    request:      Request,
    current_user: dict = Depends(require_role([ROLE_OPERATOR])),
) -> OrderStripeCheckoutResponse:
    if not STRIPE_CHECKOUT_AVAILABLE:
        raise HTTPException(status_code=503, detail="Stripe integration not available")

    order = await db.orders.find_one(
        {"$or": [{"id": order_id}, {"order_number": order_id}]}, {"_id": 0}
    )
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    if order.get("payment_status") == "paid":
        raise HTTPException(status_code=400, detail="Order is already paid")

    customer = None
    if order.get("customer_id"):
        customer = await db.customers.find_one({"id": order.get("customer_id")}, {"_id": 0})

    breakdown = await calculate_final_amount_with_membership(order, customer)
    if not breakdown:
        raise HTTPException(
            status_code=400,
            detail="Cannot calculate total (missing weight and no add-ons)"
        )

    amount = breakdown["total"]
    if amount <= 0.50:
        raise HTTPException(status_code=400, detail="Order amount too small for payment")

    stripe_api_key = os.environ.get("STRIPE_API_KEY")
    if not stripe_api_key:
        raise HTTPException(status_code=500, detail="Payment configuration error")

    host_url    = str(request.base_url).rstrip("/")
    webhook_url = f"{host_url}/api/webhook/stripe"
    success_url = f"{data.origin_url}/admin/operator?session_id={{CHECKOUT_SESSION_ID}}&order_id={order.get('id')}"
    cancel_url  = f"{data.origin_url}/admin/operator?order_id={order.get('id')}&status=cancelled"

    stripe_checkout = StripeCheckout(api_key=stripe_api_key, webhook_url=webhook_url)
    session_request = CheckoutSessionRequest(
        amount=amount,
        currency="usd",
        success_url=success_url,
        cancel_url=cancel_url,
        metadata={
            "order_id":     order.get("id"),
            "order_number": order.get("order_number") or "",
            "type":         "service_order",
        },
    )
    session: CheckoutSessionResponse = await stripe_checkout.create_checkout_session(session_request)

    now = datetime.now(timezone.utc).isoformat()
    payment_doc = {
        "id":             str(uuid.uuid4()),
        "session_id":     session.session_id,
        "order_id":       order.get("id"),
        "entity_type":    "service_order",
        "amount":         amount,
        "currency":       "usd",
        "status":         "initiated",
        "payment_status": "pending",
        "metadata":       session_request.metadata,
        "created_at":     now,
        "updated_at":     now,
    }
    await db.payment_transactions.insert_one(payment_doc)
    await db.orders.update_one(
        {"id": order.get("id")},
        {"$set": {
            "total_amount":   amount,
            "payment_status": "pending",
            "payment_method": "card",
            "updated_at":     now,
        }},
    )

    return OrderStripeCheckoutResponse(
        session_id=session.session_id,
        url=session.url,
        amount=amount,
        currency="usd",
    )


@router.get("/orders/stripe/status/{session_id}")
async def get_order_stripe_status(
    session_id:   str,
    request:      Request,
    current_user: dict = Depends(require_role([ROLE_OPERATOR])),
) -> dict:
    if not STRIPE_CHECKOUT_AVAILABLE:
        raise HTTPException(status_code=503, detail="Stripe integration not available")

    stripe_api_key = os.environ.get("STRIPE_API_KEY")
    if not stripe_api_key:
        raise HTTPException(status_code=500, detail="Payment configuration error")

    host_url        = str(request.base_url).rstrip("/")
    webhook_url     = f"{host_url}/api/webhook/stripe"
    stripe_checkout = StripeCheckout(api_key=stripe_api_key, webhook_url=webhook_url)
    status_resp: CheckoutStatusResponse = await stripe_checkout.get_checkout_status(session_id)

    transaction = await db.payment_transactions.find_one({"session_id": session_id}, {"_id": 0})
    if not transaction:
        raise HTTPException(status_code=404, detail="Payment session not found")

    update_fields = {
        "status":         status_resp.status,
        "payment_status": status_resp.payment_status,
        "updated_at":     datetime.now(timezone.utc).isoformat(),
    }
    await db.payment_transactions.update_one(
        {"session_id": session_id}, {"$set": update_fields}
    )

    if status_resp.payment_status == "paid" and transaction.get("payment_status") != "paid":
        order_id = transaction.get("order_id") or status_resp.metadata.get("order_id")
        if order_id:
            now_str = datetime.now(timezone.utc).isoformat()
            await db.orders.update_one(
                {"id": order_id},
                {"$set": {
                    "payment_status": "paid",
                    "payment_method": "card",
                    "amount_paid":    transaction.get("amount"),
                    "change_due":     0,
                    "paid_at":        now_str,
                    "updated_at":     now_str,
                }},
            )
            order_doc = await db.orders.find_one({"id": order_id}, {"_id": 0})
            finance_entry = {
                "id":             str(uuid.uuid4()),
                "type":           "income",
                "category":       "service_payment",
                "description":    f"Pago Stripe orden {(order_doc or {}).get('order_number', order_id)}",
                "amount":         float(transaction.get("amount") or 0),
                "payment_method": "card",
                "order_id":       order_id,
                "order_number":   (order_doc or {}).get("order_number"),
                "customer_id":    (order_doc or {}).get("customer_id"),
                "customer_name":  (order_doc or {}).get("customer_name"),
                "date":           now_str[:10],
                "created_at":     now_str,
                "updated_at":     now_str,
            }
            await db.finances.insert_one(finance_entry)

    return {
        "status":         status_resp.status,
        "payment_status": status_resp.payment_status,
        "amount_total":   status_resp.amount_total,
        "currency":       status_resp.currency,
        "metadata":       status_resp.metadata,
    }


# ==================== APPLY MEMBERSHIP ====================

@router.post("/orders/{order_id}/apply-membership")
async def apply_membership_to_order(
    order_id:     str,
    current_user: dict = Depends(require_role([ROLE_OPERATOR])),
) -> dict:
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    if order.get("payment_status") == "paid":
        raise HTTPException(status_code=400, detail="Order already paid")

    customer = None
    if order.get("customer_id"):
        customer = await db.customers.find_one({"id": order["customer_id"]}, {"_id": 0})
    if not customer:
        raise HTTPException(status_code=400, detail="Customer not found")

    if not is_active_member(order, customer):
        raise HTTPException(status_code=403, detail="Customer has no active membership")

    breakdown = await calculate_final_amount_with_membership(order, customer)
    if not breakdown:
        raise HTTPException(
            status_code=400,
            detail="Cannot calculate membership coverage (actual_lbs required)"
        )

    if breakdown["total"] > 0.50:
        raise HTTPException(
            status_code=400,
            detail=f"Order not fully covered. Extra amount due: ${breakdown['total']:.2f}",
        )

    now_iso     = datetime.now(timezone.utc).isoformat()
    update_data = {
        "payment_status":       "paid",
        "payment_method":       "membership_covered",
        "amount_paid":          0.0,
        "processing_fee":       0.0,
        "change_due":           0.0,
        "paid_at":              now_iso,
        "updated_at":           now_iso,
        "membership_breakdown": breakdown,
        "extra_charge":         breakdown["total"],
        "lbs_from_allowance":   breakdown["lbs_covered"],
        "extra_lbs_billed":     breakdown["lbs_extra"],
        "membership_discount":  breakdown["membership_discount"],
    }
    await db.orders.update_one({"id": order_id}, {"$set": update_data})
    await create_audit_log(
        "MEMBERSHIP_APPLIED_TO_ORDER", "order", order_id, current_user["id"],
        {"order_number": order.get("order_number")},
    )

    return {
        "ok":        True,
        "message":   "Order covered by membership",
        "order_id":  order_id,
        "breakdown": breakdown,
    }


# ==================== RECURRENCE ENDPOINTS ====================

class RecurrenceUpdateRequest(BaseModel):
    recurrence:          str
    recurrence_end_date: Optional[str] = None
    recurrence_days:     Optional[List[str]] = None
    cancel_future:       Optional[bool] = False


async def _order_belongs_to_customer(order: dict, customer: dict) -> bool:
    if not customer:
        return False
    if order.get("customer_id") == customer.get("id"):
        return True
    order_email    = (order.get("customer_email") or "").lower()
    customer_email = (customer.get("email") or "").lower()
    if order_email and customer_email and order_email == customer_email:
        return True
    return False


@router.get("/orders/{order_id}/recurrence")
async def get_order_recurrence(
    order_id:      str,
    admin_user:    Optional[dict] = Depends(get_current_user),
    customer_user: Optional[dict] = Depends(get_current_customer),
) -> dict:
    user = admin_user or customer_user
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")

    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    is_admin = admin_user is not None and admin_user.get("role") in ("admin", "operator")
    if not is_admin:
        if not customer_user:
            raise HTTPException(status_code=401, detail="Not authenticated as customer")
        if not await _order_belongs_to_customer(order, customer_user):
            raise HTTPException(status_code=403, detail="Not your order")

    upcoming = []
    if order.get("is_recurring") and order.get("recurrence") not in (None, "once"):
        child_orders = await db.orders.find(
            {"recurrence_parent_id": order_id, "status": {"$in": ["new", "confirmed"]}},
            {"_id": 0, "id": 1, "order_number": 1, "pickup_date": 1},
        ).sort("pickup_date", 1).to_list(10)
        upcoming = [
            {
                "id":           o["id"],
                "order_number": o.get("order_number"),
                "pickup_date":  o.get("pickup_date"),
            }
            for o in child_orders
        ]

    return {
        "is_recurring":        order.get("is_recurring", False),
        "recurrence":          order.get("recurrence", "once"),
        "recurrence_end_date": order.get("recurrence_end_date"),
        "recurrence_days":     order.get("recurrence_days"),
        "upcoming_pickups":    upcoming,
    }


@router.patch("/orders/{order_id}/recurrence")
async def update_order_recurrence(
    order_id:      str,
    data:          RecurrenceUpdateRequest,
    admin_user:    Optional[dict] = Depends(get_current_user),
    customer_user: Optional[dict] = Depends(get_current_customer),
) -> dict:
    user = admin_user or customer_user
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")

    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    is_admin = admin_user is not None and admin_user.get("role") in ("admin", "operator")
    if not is_admin:
        if not customer_user:
            raise HTTPException(status_code=401, detail="Not authenticated as customer")
        if not await _order_belongs_to_customer(order, customer_user):
            raise HTTPException(status_code=403, detail="Not your order")

    now = datetime.now(timezone.utc).isoformat()
    update_data = {
        "recurrence":          data.recurrence,
        "recurrence_end_date": data.recurrence_end_date,
        "recurrence_days":     data.recurrence_days if data.recurrence == "twice_week" else None,
        "is_recurring":        data.recurrence != "once",
        "updated_at":          now,
    }

    if data.cancel_future:
        deleted = await db.orders.delete_many({
            "recurrence_parent_id": order_id,
            "status":               {"$in": ["new", "confirmed"]},
        })
        logger.info(f"Cancelled {deleted.deleted_count} future recurring orders for parent {order_id}")

    await db.orders.update_one({"id": order_id}, {"$set": update_data})
    return {"ok": True, "updated": update_data}


# ==================== PRINT TICKET ====================

@router.get("/orders/{order_id}/ticket")
async def get_order_ticket(
    order_id:     str,
    current_user: dict = Depends(get_current_user),
) -> HTMLResponse:
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    order_num     = order.get("order_number", order_id[:8])
    name          = order.get("customer_name") or "Cliente"
    phone         = order.get("customer_phone") or ""
    pickup_addr   = order.get("pickup_address") or order.get("address") or ""
    delivery_addr = order.get("delivery_address") or ""

    created_raw = order.get("created_at", "")
    try:
        dt      = datetime.fromisoformat(created_raw.replace("Z", "+00:00"))
        created = dt.astimezone(PT_TZ).strftime("%m/%d/%Y %I:%M %p PT")
    except Exception:
        created = created_raw[:10] if created_raw else ""

    service             = order.get("service_type") or "wash_fold"
    lbs                 = float(order.get("actual_lbs") or order.get("estimated_lbs") or 0)
    rate                = float(order.get("price_per_lb") or 2.75)
    subtotal_lbs        = round(lbs * rate, 2) if lbs > 0 else 0.0
    distance_miles      = order.get("distance_miles")
    delivery_fee        = calculate_delivery_fee(distance_miles)
    addon_services      = order.get("addon_services", [])
    membership_discount = float(order.get("membership_discount") or 0)
    total               = float(order.get("total_amount") or 0)
    pay_status          = (order.get("payment_status") or "pending").lower()
    pay_label           = "PAGADO" if pay_status == "paid" else "PENDIENTE"
    payment_method      = (order.get("payment_method") or "").lower()
    method_label        = {
        "cash":               "Efectivo",
        "card":               "Tarjeta",
        "stripe":             "Tarjeta",
        "card_auto":          "Tarjeta (Auto)",
        "zelle":              "Zelle",
        "transfer":           "Transferencia",
        "membership_covered": "Membresía",
    }.get(payment_method, payment_method.capitalize() or "-")

    items_html = ""
    if lbs > 0:
        items_html += (
            f'<tr><td>Peso</td><td class="r">{lbs:g} lbs</td><tr>'
            f'<tr><td>Rate</td><td class="r">${rate:.2f}/lb</td></tr>'
            f'<tr><td>Subtotal (peso)</td><td class="r">${subtotal_lbs:.2f}</td></tr>'
        )
    if delivery_fee > 0:
        items_html += f'<tr><td>Delivery Fee</td><td class="r">${delivery_fee:.2f}</td></tr>'
    for addon in addon_services:
        addon_name  = addon.get("name", "Add-on")
        addon_price = float(addon.get("price") or 0)
        addon_qty   = int(addon.get("qty") or addon.get("quantity") or 1)
        if addon_price > 0:
            items_html += (
                f'<tr><td>{addon_name} ×{addon_qty}</td>'
                f'<td class="r">${addon_price * addon_qty:.2f}</td></tr>'
            )
    if membership_discount > 0:
        items_html += f'<tr><td>Membership discount</td><td class="r">-${membership_discount:.2f}</td></tr>'

    addr_html  = ""
    if pickup_addr:
        addr_html += f'<tr><td>Pickup</td><td class="r addr">{pickup_addr}</td></tr>'
    if delivery_addr and delivery_addr != pickup_addr:
        addr_html += f'<tr><td>Entrega</td><td class="r addr">{delivery_addr}</td></tr>'
    phone_html = f'<tr><td>Tel</td><td class="r">{phone}</td></tr>' if phone else ""

    html_content = f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Ticket {order_num}</title>
<style>
*{{margin:0;padding:0;box-sizing:border-box}}
body{{font-family:'Courier New',monospace;width:100%;max-width:520px;margin:0 auto;padding:4mm;font-size:12px;color:#111}}
.center{{text-align:center}}
h1{{font-size:15px;font-weight:700}}
.sub{{font-size:9px;color:#666;margin-top:2px}}
.order-num{{font-size:16px;font-weight:900;text-align:center;margin:8px 0;letter-spacing:1px}}
hr{{border:none;border-top:1px dashed #999;margin:6px 0}}
table{{width:100%;border-collapse:collapse;table-layout:fixed}}
td{{padding:3px 0;font-size:11px;vertical-align:top}}
td:first-child{{white-space:normal;width:28mm;padding-right:4px;word-break:break-word}}
.r{{text-align:right;font-weight:600;word-break:break-word;overflow-wrap:anywhere}}
.addr{{font-size:10px;font-weight:500}}
.total-row td{{font-size:14px;font-weight:900;padding:6px 0;border-top:2px solid #111}}
.badge{{display:inline-block;padding:2px 8px;border-radius:4px;font-size:10px;font-weight:700}}
.badge-paid{{background:#dcfce7;color:#166534}}
.badge-pending{{background:#fef3c7;color:#92400e}}
.footer{{font-size:9px;color:#888;text-align:center;margin-top:8px}}
@media print{{body{{margin:0;padding:2mm}}}}
</style></head>
<body>
<div class="center">
  <h1>Ventura Fresh Laundry</h1>
  <p class="sub">5722 Telephone Rd Suite 5, Ventura CA 93003</p>
  <p class="sub">(805) 515-4030</p>
</div>
<hr>
<p class="order-num">#{order_num}</p>
<table>
  <tr><td>Fecha</td><td class="r">{created}</td></tr>
  <tr><td>Cliente</td><td class="r">{name}</td></tr>
  {phone_html}
  <tr><td>Servicio</td><td class="r">{"Wash &amp; Fold" if "wash" in service.lower() else "Pickup &amp; Delivery"}</td></tr>
  {addr_html}
</table>
<hr>
<table>
  {items_html}
  <tr class="total-row"><td>TOTAL</td><td class="r">${total:.2f}</td></tr>
</table>
<hr>
能
  <tr>
    <td>Pago</td>
    <td class="r">
      <span class="badge {'badge-paid' if pay_status == 'paid' else 'badge-pending'}">{pay_label}</span>
    </td>
  </tr>
  <tr><td>Metodo</td><td class="r">{method_label}</td></tr>
能
<hr>
<div class="footer">
  <p>Gracias por su preferencia!</p>
  <p>venturafreshlaundry.com</p>
</div>
<script>window.onload=function(){{window.print();}};</script>
</body></html>"""
    return HTMLResponse(content=html_content)


# ==================== NOTIFY CUSTOMER ====================

class NotifyCustomerRequest(BaseModel):
    channel: str = "sms"
    message: Optional[str] = None


async def _generate_payment_url(order: dict, request: Request) -> str:
    total      = float(order.get("total_amount") or order.get("total") or 0)
    pay_status = (order.get("payment_status") or "pending").lower()
    if pay_status == "paid" or total < 0.50:
        return ""
    frontend_url = os.getenv("FRONTEND_URL")
    if frontend_url:
        return f"{frontend_url.rstrip('/')}/account"
    origin = request.headers.get("origin") or str(request.base_url).rstrip("/")
    return f"{origin}/account"


@router.post("/orders/{order_id}/notify-customer")
async def notify_customer_direct(
    order_id:     str,
    payload:      NotifyCustomerRequest,
    request:      Request,
    current_user: dict = Depends(get_current_user),
) -> dict:
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    customer_id = order.get("customer_id")
    customer    = (
        await db.customers.find_one({"id": customer_id}, {"_id": 0})
        if customer_id
        else None
    )
    if not customer and order.get("customer_email"):
        customer = await db.customers.find_one(
            {"email": {"$regex": f'^{order["customer_email"]}$', "$options": "i"}},
            {"_id": 0},
        )

    from notifications import (
        send_email, send_sms, send_whatsapp, send_voice_call,
        detect_language, _support_footer, _should_skip_payment_notification,
    )

    phone      = (customer or {}).get("phone") or order.get("customer_phone") or ""
    email_addr = (customer or {}).get("email") or order.get("customer_email") or ""
    name       = (customer or {}).get("name") or order.get("customer_name") or "Cliente"
    order_num  = order.get("order_number", order_id)
    total      = float(order.get("total_amount") or order.get("total") or 0)
    pay_status = (order.get("payment_status") or "pending").lower()
    rate       = float(order.get("price_per_lb") or order.get("rate") or 2.75)
    lbs        = float(order.get("actual_lbs") or order.get("estimated_lbs") or 0)
    subtotal   = round(lbs * rate, 2) if lbs > 0 else total
    distance_miles = order.get("distance_miles")
    delivery_fee   = calculate_delivery_fee(distance_miles)
    total_text     = f"${total:.2f}" if total else ""

    payment_url = await _generate_payment_url(order, request)
    short_url   = payment_url
    _lang       = detect_language(customer, phone) if customer else "es-MX"
    _is_es      = _lang.lower().startswith("es")

    if pay_status != "paid" and customer:
        try:
            _skip = await _should_skip_payment_notification(order, customer)
            if _skip:
                return {
                    "ok":                True,
                    "channel":           payload.channel,
                    "detail":            "Payment notification skipped — order covered by membership allowance",
                    "membership_covered": True,
                }
        except Exception as _skip_exc:
            logger.warning(f"Membership skip check failed: {_skip_exc}")

    _footer = _support_footer(_is_es)

    if pay_status == "paid":
        method_name = (order.get("payment_method") or "").replace("_", " ").capitalize() or "Tarjeta"
        if _is_es:
            msg = (
                f"🧼 Ventura Fresh Laundry\n\nHola {name} 👋\n"
                f"Confirmamos el pago de tu orden #{order_num}.\n\n"
                f"✅ Total: {total_text}\n✅ Método: {method_name}\n✅ Estado: Pagado\n\n"
                f"Gracias por confiar en Ventura Fresh Laundry 🧼✨"
            ) + _footer
        else:
            msg = (
                f"🧼 Ventura Fresh Laundry\n\nHi {name} 👋\n"
                f"We confirm payment for your order #{order_num}.\n\n"
                f"✅ Total: {total_text}\n✅ Method: {method_name}\n✅ Status: Paid\n\n"
                f"Thank you for trusting Ventura Fresh Laundry 🧼✨"
            ) + _footer
    elif payload.message:
        msg = payload.message + _footer
    else:
        if _is_es:
            breakdown_txt = f"\n📊 Desglose:\n• {lbs} lbs x ${rate:.2f}/lb = ${subtotal:.2f}"
            if delivery_fee > 0:
                breakdown_txt += f"\n• Entrega: ${delivery_fee:.2f}"
            breakdown_txt += f"\n• Total: {total_text}"
            msg = (
                f"🧼 Ventura Fresh Laundry\n\nHola {name} 👋\n"
                f"Tu orden #{order_num} está lista para el pago.\n{breakdown_txt}\n\n"
                f"💳 Completa tu pago:\n{short_url or 'Enlace no disponible'}\n\n"
                f"Cualquier pregunta al (820) 234-8181"
            ) + _footer
        else:
            breakdown_txt = f"\n📊 Breakdown:\n• {lbs} lbs x ${rate:.2f}/lb = ${subtotal:.2f}"
            if delivery_fee > 0:
                breakdown_txt += f"\n• Delivery: ${delivery_fee:.2f}"
            breakdown_txt += f"\n• Total: {total_text}"
            msg = (
                f"🧼 Ventura Fresh Laundry\n\nHi {name} 👋\n"
                f"Your order #{order_num} is ready for payment.\n{breakdown_txt}\n\n"
                f"💳 Complete your payment:\n{short_url or 'Link not available'}\n\n"
            ) + _footer

    if not NOTIFICATIONS_ENABLED:
        return {
            "ok":              False,
            "detail":          "Notifications not configured",
            "message_preview": msg,
            "payment_url":     payment_url,
        }

    channel      = payload.channel.lower()
    sent         = False
    error_detail = ""

    try:
        if channel == "email" and email_addr:
            subject = (
                f"{'Pago Confirmado' if pay_status == 'paid' else 'Pago Pendiente'} - Orden {order_num}"
                if _is_es else
                f"{'Payment Confirmed' if pay_status == 'paid' else 'Payment Required'} - Order {order_num}"
            )
            sent = await send_email(email_addr, subject, msg)
        elif channel == "whatsapp" and phone:
            sent = await send_whatsapp(phone, msg)
        elif channel == "call" and phone:
            sent = await send_voice_call(phone, msg, "es-MX" if _is_es else "en-US")
        elif channel == "sms" and phone:
            sent = await send_sms(phone, msg)
        else:
            available = []
            if phone:
                available.extend(["sms", "call", "whatsapp"])
            if email_addr:
                available.append("email")
            error_detail = (
                "No phone or email on file for this customer"
                if not available
                else f"Channel '{channel}' not available. Try: {', '.join(available)}"
            )
    except Exception as e:
        error_detail = str(e)

    if sent:
        await create_audit_log(
            "CUSTOMER_NOTIFIED_DIRECT", "order", order_id, current_user["id"],
            {
                "channel":     channel,
                "message":     msg[:200],
                "payment_url": payment_url[:200] if payment_url else "",
            },
        )

    return {
        "ok":              sent,
        "channel":         channel,
        "message_preview": msg[:500],
        "payment_url":     payment_url,
        "detail":          error_detail if not sent else f"Sent via {channel}",
    }


@router.get("/traffic/incidents")
async def get_traffic_incidents(current_user: dict = Depends(get_current_user)):
    return {
        "events": [
            {
                "id":           "traffic-1",
                "road":         "US-101 N",
                "description":  "Accidente en el carril derecho",
                "severity":     "heavy",
                "lat":          34.27,
                "lng":          -119.25,
                "delayMinutes": 15,
            }
        ]
    }


# ==================== AUTO-CHARGE ====================

@router.post("/automation/orders/{order_id}/auto-charge")
async def operator_auto_charge_order(
    order_id:     str,
    current_user: dict = Depends(require_role([ROLE_OPERATOR, ROLE_ADMIN])),
) -> dict:
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    if order.get("payment_status") == "paid":
        return {"success": True, "already_paid": True, "message": "Order already paid", "amount": 0}

    customer = None
    if order.get("customer_id"):
        customer = await db.customers.find_one({"id": order["customer_id"]}, {"_id": 0})
    if not customer and order.get("customer_email"):
        customer = await db.customers.find_one(
            {"email": {"$regex": f"^{order['customer_email']}$", "$options": "i"}}, {"_id": 0}
        )
    if not customer and order.get("customer_phone"):
        customer = await db.customers.find_one({"phone": order["customer_phone"]}, {"_id": 0})

    if not customer:
        return {
            "success":        False,
            "error":          "Customer not found — charge manually",
            "suggest_action": "The order may not be linked to a customer account",
            "amount_due":     float(order.get("total_amount") or 0),
        }

    breakdown  = await calculate_final_amount_with_membership(order, customer)
    amount_due = breakdown["total"] if breakdown else float(order.get("total_amount") or 0)

    result = {
        "success":             False,
        "amount_due":          amount_due,
        "has_membership":      bool(customer.get("membership_plan")),
        "lbs_covered":         breakdown.get("lbs_covered", 0) if breakdown else 0,
        "extra_lbs":           breakdown.get("lbs_extra", 0) if breakdown else 0,
        "membership_discount": breakdown.get("membership_discount", 0) if breakdown else 0,
        "customer_name":       customer.get("name"),
    }

    if amount_due <= 0.50:
        now_iso = datetime.now(timezone.utc).isoformat()
        await db.orders.update_one(
            {"id": order_id},
            {"$set": {
                "payment_status":      "paid",
                "payment_method":      "membership_covered",
                "paid_at":             now_iso,
                "updated_at":          now_iso,
                "lbs_from_allowance":  result["lbs_covered"],
                "membership_discount": result["membership_discount"],
            }}
        )
        result.update({
            "success":               True,
            "covered_by_membership": True,
            "message":               f"Order covered by membership — {result['lbs_covered']} lbs from allowance",
            "amount_charged":        0,
        })
        return result

    stripe_customer_id = customer.get("stripe_customer_id")
    payment_method_id  = customer.get("stripe_payment_method_id")

    if not payment_method_id:
        result.update({
            "error":          "No saved payment method — charge manually",
            "suggest_action": "Customer needs to add a card in their portal",
        })
        return result

    if not stripe_customer_id:
        try:
            stripe_customer    = stripe.Customer.create(
                name=customer.get("name", ""),
                email=customer.get("email", ""),
                phone=customer.get("phone", ""),
                metadata={"internal_id": customer.get("id", "")},
            )
            stripe_customer_id = stripe_customer.id
            await db.customers.update_one(
                {"id": customer["id"]},
                {"$set": {"stripe_customer_id": stripe_customer_id, "updated_at": datetime.now(timezone.utc).isoformat()}},
            )
        except Exception as e:
            result.update({"error": f"Could not create Stripe customer: {e}"})
            return result

    try:
        order_number    = order.get("order_number", order_id[:8].upper())
        payment_intent  = stripe.PaymentIntent.create(
            amount=int(amount_due * 100),
            currency="usd",
            customer=stripe_customer_id,
            payment_method=payment_method_id,
            off_session=True,
            confirm=True,
            description=f"Ventura Fresh Laundry — Order {order_number}",
            metadata={
                "order_id":     order_id,
                "order_number": order_number,
                "operator_id":  current_user.get("id", ""),
                "type":         "operator_auto_charge",
            },
            receipt_email=customer.get("email") or None,
        )

        if payment_intent.status == "succeeded":
            now_iso = datetime.now(timezone.utc).isoformat()
            await db.orders.update_one(
                {"id": order_id},
                {"$set": {
                    "payment_status":           "paid",
                    "payment_method":           "card_auto",
                    "amount_paid":              amount_due,
                    "paid_at":                  now_iso,
                    "updated_at":               now_iso,
                    "stripe_payment_intent_id": payment_intent.id,
                }}
            )
            await db.finances.insert_one({
                "id":                       str(uuid.uuid4()),
                "type":                     "income",
                "category":                 "service_payment_auto",
                "description":              f"Auto-charge order {order_number}",
                "amount":                   amount_due,
                "payment_method":           "card_auto",
                "order_id":                 order_id,
                "order_number":             order_number,
                "customer_name":            customer.get("name"),
                "customer_id":              customer.get("id"),
                "stripe_payment_intent_id": payment_intent.id,
                "date":                     now_iso[:10],
                "created_at":               now_iso,
                "updated_at":               now_iso,
            })
            result.update({
                "success":          True,
                "charged":          True,
                "amount_charged":   amount_due,
                "card_last4":       customer.get("card_last4"),
                "card_brand":       customer.get("card_brand"),
                "payment_intent_id": payment_intent.id,
            })
            return result
        else:
            result.update({
                "error":            f"Payment {payment_intent.status}",
                "payment_intent_id": payment_intent.id,
            })
            return result

    except stripe.error.CardError as e:
        err = e.error
        logger.error(f"Card declined for order {order_id}: {err.code} — {err.message}")
        result.update({
            "error":          err.message,
            "decline_code":   err.code,
            "suggest_action": "Charge manually or ask customer to update card",
        })
        return result
    except stripe.error.InvalidRequestError as e:
        logger.error(f"Stripe InvalidRequest for order {order_id}: {e}")
        result.update({
            "error":          f"Invalid payment method: {str(e.user_message or e)}",
            "suggest_action": "Customer needs to update their card in the portal",
        })
        return result
    except Exception as e:
        logger.error(f"Auto-charge error for order {order_id}: {e}")
        result.update({
            "error":          str(e),
            "suggest_action": "Charge manually",
        })
        return result