"""Orders endpoints — extracted from server_core.py"""
import io
import os
import uuid
import zipfile
import logging
from datetime import datetime, timezone
from typing import Dict, List, Optional
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import HTMLResponse, StreamingResponse
from pydantic import BaseModel

from auth import get_current_user, require_admin, require_role
from database import SKIP_SERVER_NOTIFICATIONS, db
from models import (
    ROLE_OPERATOR,
    OrderCreate,
    OrderPaymentUpdate,
    OrderResponse,
    OrderStripeCheckoutRequest,
    OrderStripeCheckoutResponse,
    QrResolveRequest,
)
from realtime import emit_realtime
from utils import (
    build_address_parts,
    build_display_order_number,
    build_order_times,
    build_qr_payload,
    build_ticket_svg,
    calculate_service_amount,
    create_audit_log,
    generate_order_number,
    normalize_address,
    normalize_payment_method,
    normalize_spaces,
    normalize_status,
    parse_qr_payload,
    should_notify_order_status,
    validate_order_payload,
)

PT_TZ = ZoneInfo("America/Los_Angeles")
logger = logging.getLogger(__name__)

# ── Notifications (optional) ─────────────────────────────────────────
try:
    from notifications import notify_order_created, notify_order_status_changed

    NOTIFICATIONS_ENABLED = True
except ImportError:
    NOTIFICATIONS_ENABLED = False

# ── Stripe Checkout (optional) ───────────────────────────────────────
try:
    from emergentintegrations.payments.stripe.checkout import (
        CheckoutSessionRequest,
        CheckoutSessionResponse,
        CheckoutStatusResponse,
        StripeCheckout,
    )

    STRIPE_CHECKOUT_AVAILABLE = True
except ImportError:
    STRIPE_CHECKOUT_AVAILABLE = False

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
        def __init__(self, api_key: str, webhook_url: str) -> None:
            pass

        async def create_checkout_session(self, request):
            raise RuntimeError("Stripe not available")

        async def get_checkout_status(self, sid):
            raise RuntimeError("Stripe not available")


router = APIRouter(prefix="/api", tags=["Orders"])


# ==================== ORDERS CRUD ====================


@router.post("/orders", response_model=OrderResponse)
async def create_order(
    data: OrderCreate,
    notify: bool = True,
    current_user: dict = Depends(get_current_user),
) -> OrderResponse:
    """Create a new order."""
    customer = await db.customers.find_one({"id": data.customer_id}, {"_id": 0})
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    # ── Validaciones obligatorias ─────────────────────────────────
    if not data.pickup_date:
        raise HTTPException(status_code=400, detail="pickup_date es obligatorio")

    if data.pickup_time_window and data.pickup_time_window not in ("8-12", "14-18"):
        raise HTTPException(
            status_code=400,
            detail="time_window debe ser '8-12' o '14-18'"
        )

    if data.estimated_lbs is not None and data.estimated_lbs <= 0:
        raise HTTPException(
            status_code=400,
            detail="estimated_lbs debe ser positivo"
        )

    order_id = str(uuid.uuid4())
    order_number = await generate_order_number()
    now = datetime.now(timezone.utc).isoformat()
    errors = validate_order_payload(data)

    normalized_pickup_address = normalize_address(
        data.pickup_address or customer.get("address")
    )
    normalized_delivery_address = normalize_address(data.delivery_address)
    normalized_notes = normalize_spaces(data.notes)
    normalized_gate_code = normalize_spaces(data.gate_code)
    normalized_service_type = (
        normalize_spaces(data.service_type).lower().replace(" ", "_")
    )

    pref = await db.preferences.find(
        {"customer_id": data.customer_id}, {"_id": 0}
    ).sort("version", -1).limit(1).to_list(1)
    preference_id = pref[0].get("id") if pref else None
    preference_snapshot = None
    if pref:
        preference_snapshot = {
            k: v for k, v in pref[0].items()
            if k not in ["_id", "customer_id"]
        }

    order = {
        "id": order_id,
        "order_number": order_number,
        "customer_id": data.customer_id,
        "customer_name": customer["name"],
        "service_type": normalized_service_type,
        "pickup_date": data.pickup_date,
        "pickup_time_window": data.pickup_time_window,
        "pickup_address": normalized_pickup_address,
        "delivery_address": normalized_delivery_address,
        "estimated_lbs": data.estimated_lbs,
        "actual_lbs": None,
        "notes": normalized_notes,
        "gate_code": normalized_gate_code,
        "preferences_id": preference_id,
        "preferences_snapshot": preference_snapshot,
        "status": "new",
        "estado_actual": "new",
        "payment_status": "unpaid",
        "total_amount": None,
        "tiempos": build_order_times(now, "new"),
        "errores_validacion": [
            {**error, "mensaje": error["codigo"], "timestamp": now}
            for error in errors
        ],
        "secciones": [
            {
                "nombre": "ingesta",
                "estado": "done",
                "inicio": now,
                "fin": now,
                "errores": [],
            },
            {
                "nombre": "procesamiento",
                "estado": "pending",
                "inicio": None,
                "fin": None,
                "errores": [],
            },
        ],
        "importada": False,
        "origen": "crm",
        "qr_token": str(uuid.uuid4()),
        "created_at": now,
        "updated_at": now,
    }
    await db.orders.insert_one(order)
    await db.customers.update_one(
        {"id": data.customer_id},
        {"$inc": {"total_orders": 1}}
    )
    await db.eventos_automation.insert_one({
        "id": str(uuid.uuid4()),
        "tipo": "ORDER_CREATED",
        "entity_id": order_id,
        "payload": {
            "order_number": order_number,
            "service_type": data.service_type,
        },
        "created_at": now,
    })
    await create_audit_log("ORDER_CREATED", "order", order_id, current_user["id"])
    await emit_realtime("notification", {
        "type": "order_created",
        "order_id": order_id,
        "status": "new",
        "order_number": order_number,
    })

    if (
        notify
        and NOTIFICATIONS_ENABLED
        and not SKIP_SERVER_NOTIFICATIONS
    ):
        try:
            await notify_order_created(customer, order)
        except Exception as e:
            logger.error(f"Notification failed: {e}")

    return OrderResponse(**order)


@router.get("/orders", response_model=List[OrderResponse])
async def get_orders(
    status: Optional[str] = None,
    customer_id: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    current_user: dict = Depends(get_current_user),
) -> List[OrderResponse]:
    """Get orders with pagination and filters."""
    query = {}
    if status:
        normalized = normalize_status(status)
        query["status"] = {"$in": [normalized, normalized.upper(), status]}
    if customer_id:
        query["customer_id"] = customer_id
    if date_from:
        query["created_at"] = {"$gte": date_from}
    if date_to:
        query.setdefault("created_at", {})["$lte"] = date_to

    skip = (page - 1) * page_size
    orders = await db.orders.find(
        query, {"_id": 0}
    ).sort("created_at", -1).skip(skip).limit(page_size).to_list(page_size)

    return [OrderResponse(**order) for order in orders]


@router.get("/orders/{order_id}", response_model=OrderResponse)
async def get_order(
    order_id: str,
    current_user: dict = Depends(get_current_user),
) -> OrderResponse:
    """Get a single order by ID."""
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    return OrderResponse(**order)


@router.get("/orders/{order_id}/qr")
async def get_order_qr(
    order_id: str,
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Get QR code data for an order."""
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    qr_token = order.get("qr_token") or str(uuid.uuid4())
    if not order.get("qr_token"):
        await db.orders.update_one(
            {"id": order_id},
            {"$set": {"qr_token": qr_token}}
        )

    return {
        "order_id": order_id,
        "order_number": order.get("order_number"),
        "qr_token": qr_token,
    }


@router.get("/orders/{order_id}/qr.svg")
async def get_order_qr_svg(order_id: str) -> StreamingResponse:
    """Generate SVG ticket with QR code."""
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        order = await db.orders.find_one(
            {"order_number": order_id},
            {"_id": 0}
        )
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    qr_token = order.get("qr_token") or str(uuid.uuid4())
    if not order.get("qr_token"):
        await db.orders.update_one(
            {"id": order.get("id")},
            {"$set": {"qr_token": qr_token}}
        )

    customer = None
    if order.get("customer_id"):
        customer = await db.customers.find_one(
            {"id": order.get("customer_id")},
            {"_id": 0}
        )

    payload = build_qr_payload({
        "id": order.get("id"),
        "order_number": order.get("order_number"),
        "qr_token": qr_token,
    })
    ticket_svg = build_ticket_svg(order, customer, payload)
    display_id = build_display_order_number(order)
    filename = f"ticket-{display_id}.svg"

    return StreamingResponse(
        io.BytesIO(ticket_svg),
        media_type="image/svg+xml",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.get("/orders/qr/export")
async def export_qr_batch(
    start_date: str = Query(..., description="Start date YYYY-MM-DD"),
    end_date: str = Query(..., description="End date YYYY-MM-DD"),
    status: Optional[str] = None,
    service_type: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
) -> StreamingResponse:
    """Export QR tickets as ZIP archive."""
    query = {"pickup_date": {"$gte": start_date, "$lte": end_date}}
    if status:
        query["status"] = status
    if service_type:
        query["service_type"] = service_type

    export_limit = 500
    orders = await db.orders.find(
        query, {"_id": 0}
    ).sort("pickup_date", 1).limit(export_limit + 1).to_list(export_limit + 1)

    if len(orders) > export_limit:
        raise HTTPException(
            status_code=400,
            detail=f"Export limit exceeded. Please narrow to {export_limit} orders or fewer."
        )

    customer_ids = {o.get("customer_id") for o in orders if o.get("customer_id")}
    customer_map = {}
    if customer_ids:
        customers = await db.customers.find(
            {"id": {"$in": list(customer_ids)}},
            {"_id": 0}
        ).to_list(len(customer_ids))
        customer_map = {c.get("id"): c for c in customers}

    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
        for order in orders:
            qr_token = order.get("qr_token") or str(uuid.uuid4())
            if not order.get("qr_token"):
                await db.orders.update_one(
                    {"id": order["id"]},
                    {"$set": {"qr_token": qr_token}}
                )
            payload = build_qr_payload({
                "id": order["id"],
                "order_number": order.get("order_number"),
                "qr_token": qr_token,
            })
            customer = customer_map.get(order.get("customer_id"))
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
    data: QrResolveRequest,
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Resolve QR payload and return order details."""
    payload_data = {}
    if data.payload:
        payload_data = parse_qr_payload(data.payload)

    qr_token = data.qr_token or payload_data.get("qr_token")
    order_id = payload_data.get("order_id")
    order_number = payload_data.get("order_number")

    if not qr_token and not order_id and not order_number:
        raise HTTPException(
            status_code=400,
            detail="QR sin datos validos"
        )

    order = None
    if qr_token:
        order = await db.orders.find_one({"qr_token": qr_token}, {"_id": 0})
    if not order and order_id:
        order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order and order_number:
        order = await db.orders.find_one(
            {"order_number": order_number},
            {"_id": 0}
        )

    if not order:
        raise HTTPException(status_code=404, detail="Orden no encontrada")

    if qr_token and order.get("qr_token") and order.get("qr_token") != qr_token:
        raise HTTPException(
            status_code=400,
            detail="QR no coincide con la orden"
        )

    customer_name = order.get("customer_name")
    customer = None
    if not customer_name and order.get("customer_id"):
        customer = await db.customers.find_one(
            {"id": order.get("customer_id")},
            {"_id": 0}
        )
        customer_name = customer.get("name") if customer else None

    delivery_address = order.get("delivery_address") or order.get("pickup_address")
    address_parts = build_address_parts(delivery_address)

    return {
        "order_id": order.get("id"),
        "order_number": order.get("order_number"),
        "service_type": order.get("service_type"),
        "customer_name": customer_name,
        "address": address_parts,
        "request_datetime": order.get("created_at"),
        "status": order.get("status"),
        "items": (
            order.get("items")
            or order.get("services_included")
            or order.get("products")
            or []
        ),
        "total_amount": order.get("total_amount"),
        "special_instructions": (
            order.get("notes") or order.get("special_instructions")
        ),
        "pickup_date": order.get("pickup_date"),
        "pickup_time_window": order.get("pickup_time_window"),
        "payment_status": order.get("payment_status"),
    }


@router.put("/orders/{order_id}", response_model=OrderResponse)
async def update_order(
    order_id: str,
    data: dict,
    current_user: dict = Depends(get_current_user),
) -> OrderResponse:
    """Update an order."""
    data["updated_at"] = datetime.now(timezone.utc).isoformat()

    if "actual_lbs" in data:
        order_snapshot = await db.orders.find_one({"id": order_id}, {"_id": 0})
        if order_snapshot:
            customer_snapshot = None
            if order_snapshot.get("customer_id"):
                customer_snapshot = await db.customers.find_one(
                    {"id": order_snapshot.get("customer_id")},
                    {"_id": 0}
                )
            temp_order = {**order_snapshot, **data}
            total_amount = calculate_service_amount(temp_order, customer_snapshot)
            if total_amount is not None:
                data["total_amount"] = total_amount

    result = await db.orders.update_one({"id": order_id}, {"$set": data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Order not found")

    await create_audit_log(
        "ORDER_UPDATED",
        "order",
        order_id,
        current_user["id"],
        {"changes": list(data.keys())}
    )
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})

    return OrderResponse(**order)


@router.patch("/orders/{order_id}/status")
async def update_order_status(
    order_id: str,
    status: str,
    notify: bool = True,
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Update order status with validation and deduplication."""
    valid_statuses = [
        "new", "confirmed", "pickup_scheduled", "picked_up",
        "processing", "ready", "out_for_delivery", "delivered",
        "completed", "cancelled"
    ]
    normalized_status = status.strip().lower()

    if normalized_status not in valid_statuses:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid status. Must be one of: {valid_statuses}"
        )

    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    current_status = (order.get("status") or "").strip().lower()
    service_type = normalize_spaces(
        order.get("service_type") or "pickup_delivery"
    ).lower().replace(" ", "_")

    # Validate status transition
    if normalized_status == "completed":
        if service_type in ["wash_fold", "wash_fold_dropoff", "self_service"]:
            if current_status not in ["ready", "completed"]:
                raise HTTPException(
                    status_code=400,
                    detail="Wash & Fold must be ready before it can be completed"
                )
        elif current_status not in ["delivered", "completed", "out_for_delivery"]:
            raise HTTPException(
                status_code=400,
                detail="Order must be delivered before it can be completed"
            )

    now = datetime.now(timezone.utc).isoformat()
    await db.orders.update_one(
        {"id": order_id},
        {
            "$set": {
                "status": normalized_status,
                "estado_actual": normalized_status,
                "updated_at": now,
                "tiempos.ultimo_cambio_estado": now,
                f"tiempos.fechas_estado.{normalized_status}": now,
            }
        },
    )

    await create_audit_log(
        "ORDER_STATUS_CHANGED",
        "order",
        order_id,
        current_user["id"],
        {"new_status": normalized_status}
    )
    await db.eventos_automation.insert_one({
        "id": str(uuid.uuid4()),
        "tipo": "ORDER_STATUS_CHANGED",
        "entity_id": order_id,
        "payload": {"status": normalized_status},
        "created_at": now,
    })

    # Send notification with deduplication
    should_send_notification = (
        notify
        and NOTIFICATIONS_ENABLED
        and not SKIP_SERVER_NOTIFICATIONS
        and order.get("customer_id")
        and should_notify_order_status(order, normalized_status)
    )

    if should_send_notification:
        dedupe_field = f"notified_status.{normalized_status}"
        already_notified = await db.orders.find_one(
            {"id": order_id, dedupe_field: {"$exists": True}},
            {"_id": 0, "id": 1},
        )

        if not already_notified:
            customer = await db.customers.find_one(
                {"id": order["customer_id"]},
                {"_id": 0}
            )
            if customer:
                order["status"] = normalized_status
                try:
                    await notify_order_status_changed(
                        customer, order, normalized_status
                    )
                    now_notif = datetime.now(timezone.utc).isoformat()
                    await db.orders.update_one(
                        {"id": order_id},
                        {"$set": {dedupe_field: now_notif}},
                    )
                except Exception as e:
                    logger.error(f"Notification failed: {e}")
        else:
            logger.info(
                f"Notificación omitida (ya enviada por operator): "
                f"orden {order_id} → {normalized_status}"
            )

    return {"message": f"Status updated to {normalized_status}"}


@router.patch("/orders/{order_id}/payment-status")
async def update_order_payment_status(
    order_id: str,
    status: str,
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Update payment status."""
    valid_statuses = ["pending", "paid", "refunded", "failed"]
    if status not in valid_statuses:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid payment status. Must be one of: {valid_statuses}"
        )

    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    await db.orders.update_one(
        {"id": order_id},
        {
            "$set": {
                "payment_status": status,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
        },
    )

    await create_audit_log(
        "ORDER_PAYMENT_STATUS_CHANGED",
        "order",
        order_id,
        current_user["id"],
        {"payment_status": status}
    )
    await emit_realtime("notification", {
        "type": "order_payment",
        "order_id": order_id,
        "status": status,
    })

    return {"message": f"Payment status updated to {status}"}


@router.post("/orders/{order_id}/payment")
async def capture_order_payment(
    order_id: str,
    data: OrderPaymentUpdate,
    current_user: dict = Depends(require_role([ROLE_OPERATOR])),
) -> dict:
    """Capture payment for an order."""
    method = normalize_payment_method(data.payment_method)
    allowed = ["cash", "card", "transfer", "zelle", "other"]

    if method not in allowed:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid payment method. Must be one of: {allowed}"
        )

    order = await db.orders.find_one(
        {"$or": [{"id": order_id}, {"order_number": order_id}]},
        {"_id": 0}
    )
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    total_amount = order.get("total_amount")
    amount_received = data.amount_received

    if method == "cash" and amount_received is None:
        raise HTTPException(
            status_code=400,
            detail="Amount received is required for cash payments"
        )

    if amount_received is None:
        amount_received = total_amount

    if total_amount is not None and amount_received is not None:
        try:
            total_amount = float(total_amount)
            amount_received = float(amount_received)
        except Exception:
            raise HTTPException(
                status_code=400,
                detail="Invalid amount values"
            )

        if amount_received < total_amount:
            raise HTTPException(
                status_code=400,
                detail="Amount received cannot be less than total"
            )

    change_due = None
    if method == "cash" and total_amount is not None and amount_received is not None:
        change_due = round(amount_received - total_amount, 2)

    # Processing fee: 3% for card/stripe payments
    processing_fee = 0.0
    if method in ("card", "stripe") and total_amount is not None:
        processing_fee = round(float(total_amount) * 0.03, 2)

    now = datetime.now(timezone.utc).isoformat()
    update_data = {
        "payment_status": "paid",
        "payment_method": method,
        "amount_paid": amount_received,
        "processing_fee": processing_fee,
        "change_due": change_due,
        "paid_at": now,
        "updated_at": now,
    }

    await db.orders.update_one(
        {"id": order.get("id")},
        {"$set": update_data}
    )
    await create_audit_log(
        "ORDER_PAYMENT_CAPTURED",
        "order",
        order.get("id"),
        current_user["id"],
        update_data
    )

    # Create finance ledger entry
    finance_entry = {
        "id": str(uuid.uuid4()),
        "type": "income",
        "category": "service_payment",
        "description": (
            f"Pago orden {order.get('order_number', order_id)} - "
            f"{order.get('service_type', 'service')}"
        ),
        "amount": float(amount_received or total_amount or 0),
        "payment_method": method,
        "order_id": order.get("id"),
        "order_number": order.get("order_number"),
        "customer_id": order.get("customer_id"),
        "customer_name": order.get("customer_name"),
        "date": now[:10],
        "created_at": now,
        "updated_at": now,
    }
    await db.finances.insert_one(finance_entry)

    await emit_realtime("notification", {
        "type": "order_payment",
        "order_id": order.get("id"),
        "status": "paid",
        "method": method,
    })

    return {"ok": True, "order_id": order.get("id"), **update_data}


# ==================== STRIPE CHECKOUT ====================


@router.post("/orders/{order_id}/stripe-checkout", response_model=OrderStripeCheckoutResponse)
async def create_order_stripe_checkout(
    order_id: str,
    data: OrderStripeCheckoutRequest,
    request: Request,
    current_user: dict = Depends(require_role([ROLE_OPERATOR])),
) -> OrderStripeCheckoutResponse:
    """Create Stripe checkout session for order payment."""
    if not STRIPE_CHECKOUT_AVAILABLE:
        raise HTTPException(
            status_code=503,
            detail="Stripe integration not available"
        )

    order = await db.orders.find_one(
        {"$or": [{"id": order_id}, {"order_number": order_id}]},
        {"_id": 0}
    )
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    customer = None
    if order.get("customer_id"):
        customer = await db.customers.find_one(
            {"id": order.get("customer_id")},
            {"_id": 0}
        )

    amount = calculate_service_amount(order, customer)
    if amount is None:
        raise HTTPException(
            status_code=400,
            detail="Actual lbs required to calculate payment"
        )

    stripe_api_key = os.environ.get("STRIPE_API_KEY")
    if not stripe_api_key:
        raise HTTPException(
            status_code=500,
            detail="Payment configuration error"
        )

    host_url = str(request.base_url).rstrip("/")
    webhook_url = f"{host_url}/api/webhook/stripe"
    success_url = (
        f"{data.origin_url}/admin/operator?session_id={{CHECKOUT_SESSION_ID}}"
        f"&order_id={order.get('id')}"
    )
    cancel_url = (
        f"{data.origin_url}/admin/operator?order_id={order.get('id')}"
        "&status=cancelled"
    )

    stripe_checkout = StripeCheckout(api_key=stripe_api_key, webhook_url=webhook_url)
    session_request = CheckoutSessionRequest(
        amount=amount,
        currency="usd",
        success_url=success_url,
        cancel_url=cancel_url,
        metadata={
            "order_id": order.get("id"),
            "order_number": order.get("order_number") or "",
            "type": "service_order",
        },
    )
    session: CheckoutSessionResponse = await stripe_checkout.create_checkout_session(
        session_request
    )

    now = datetime.now(timezone.utc).isoformat()
    payment_doc = {
        "id": str(uuid.uuid4()),
        "session_id": session.session_id,
        "order_id": order.get("id"),
        "entity_type": "service_order",
        "amount": amount,
        "currency": "usd",
        "status": "initiated",
        "payment_status": "pending",
        "metadata": session_request.metadata,
        "created_at": now,
        "updated_at": now,
    }
    await db.payment_transactions.insert_one(payment_doc)

    await db.orders.update_one(
        {"id": order.get("id")},
        {
            "$set": {
                "total_amount": amount,
                "payment_status": "pending",
                "payment_method": "card",
                "updated_at": now,
            }
        },
    )

    return OrderStripeCheckoutResponse(
        session_id=session.session_id,
        url=session.url,
        amount=amount,
        currency="usd"
    )


@router.get("/orders/stripe/status/{session_id}")
async def get_order_stripe_status(
    session_id: str,
    request: Request,
    current_user: dict = Depends(require_role([ROLE_OPERATOR])),
) -> dict:
    """Get Stripe checkout session status."""
    if not STRIPE_CHECKOUT_AVAILABLE:
        raise HTTPException(
            status_code=503,
            detail="Stripe integration not available"
        )

    stripe_api_key = os.environ.get("STRIPE_API_KEY")
    if not stripe_api_key:
        raise HTTPException(
            status_code=500,
            detail="Payment configuration error"
        )

    host_url = str(request.base_url).rstrip("/")
    webhook_url = f"{host_url}/api/webhook/stripe"
    stripe_checkout = StripeCheckout(api_key=stripe_api_key, webhook_url=webhook_url)
    status_resp: CheckoutStatusResponse = await stripe_checkout.get_checkout_status(
        session_id
    )

    transaction = await db.payment_transactions.find_one(
        {"session_id": session_id},
        {"_id": 0}
    )
    if not transaction:
        raise HTTPException(status_code=404, detail="Payment session not found")

    update_fields = {
        "status": status_resp.status,
        "payment_status": status_resp.payment_status,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.payment_transactions.update_one(
        {"session_id": session_id},
        {"$set": update_fields}
    )

    if (
        status_resp.payment_status == "paid"
        and transaction.get("payment_status") != "paid"
    ):
        order_id = transaction.get("order_id") or status_resp.metadata.get("order_id")
        if order_id:
            now_str = datetime.now(timezone.utc).isoformat()
            await db.orders.update_one(
                {"id": order_id},
                {
                    "$set": {
                        "payment_status": "paid",
                        "payment_method": "card",
                        "amount_paid": transaction.get("amount"),
                        "change_due": 0,
                        "paid_at": now_str,
                        "updated_at": now_str,
                    }
                },
            )

            # Create finance ledger entry for Stripe payment
            order_doc = await db.orders.find_one({"id": order_id}, {"_id": 0})
            finance_entry = {
                "id": str(uuid.uuid4()),
                "type": "income",
                "category": "service_payment",
                "description": (
                    f"Pago Stripe orden "
                    f"{(order_doc or {}).get('order_number', order_id)}"
                ),
                "amount": float(transaction.get("amount") or 0),
                "payment_method": "card",
                "order_id": order_id,
                "order_number": (order_doc or {}).get("order_number"),
                "customer_id": (order_doc or {}).get("customer_id"),
                "customer_name": (order_doc or {}).get("customer_name"),
                "date": now_str[:10],
                "created_at": now_str,
                "updated_at": now_str,
            }
            await db.finances.insert_one(finance_entry)

    return {
        "status": status_resp.status,
        "payment_status": status_resp.payment_status,
        "amount_total": status_resp.amount_total,
        "currency": status_resp.currency,
        "metadata": status_resp.metadata,
    }


# ── Utility ───────────────────────────────────────────────────────────


async def notify_last_completed_order(
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Notify customer of last completed order."""
    require_admin(current_user)

    last_order = await db.orders.find(
        {"status": "completed"}, {"_id": 0}
    ).sort("updated_at", -1).limit(1).to_list(1)

    if not last_order:
        raise HTTPException(
            status_code=404,
            detail="No completed orders found"
        )

    order = last_order[0]
    customer_id = order.get("customer_id")
    if not customer_id:
        raise HTTPException(
            status_code=400,
            detail="Order missing customer"
        )

    customer = await db.customers.find_one({"id": customer_id}, {"_id": 0})
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    if NOTIFICATIONS_ENABLED and not SKIP_SERVER_NOTIFICATIONS:
        await notify_order_status_changed(customer, order, "completed")

    await create_audit_log(
        "ORDER_COMPLETED_NOTIFICATION_SENT",
        "order",
        order["id"],
        current_user["id"]
    )

    return {
        "ok": True,
        "order_id": order["id"],
        "order_number": order.get("order_number"),
    }


class NotifyCustomerRequest(BaseModel):
    channel: str = "sms"  # sms | email | whatsapp
    message: Optional[str] = None


async def _shorten_url(url: str) -> str:
    """No acorta — devuelve la URL directamente."""
    return url


async def _generate_payment_url(order: dict, request: Request) -> str:
    """
    Devuelve la URL de la cuenta del cliente (/account) para que el cliente
    vea y procese su pago desde ahí. Sin acortadores externos.
    """
    total = float(order.get("total_amount") or order.get("total") or 0)
    pay_status = (order.get("payment_status") or "pending").lower()

    if pay_status == "paid" or total < 0.50:
        return ""

    # URL directa a la cuenta — el cliente ve todas sus órdenes y puede pagar
    origin = request.headers.get("origin") or str(request.base_url).rstrip("/")

    return f"{origin}/account"


# ══════════════════════════════════════════════════════════════════════
# PRINT TICKET — Full HTML receipt
# ══════════════════════════════════════════════════════════════════════


@router.get("/orders/{order_id}/ticket")
async def get_order_ticket(
    order_id: str,
    current_user: dict = Depends(get_current_user),
) -> HTMLResponse:
    """Generate a printable HTML ticket/receipt for the order."""
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    order_num = order.get("order_number", order_id[:8])
    name = order.get("customer_name") or "Cliente"
    phone = order.get("customer_phone") or ""
    pickup_addr = order.get("pickup_address") or order.get("address") or ""
    delivery_addr = order.get("delivery_address") or ""

    created_raw = order.get("created_at", "")
    try:
        dt = datetime.fromisoformat(created_raw.replace("Z", "+00:00"))
        created = dt.astimezone(PT_TZ).strftime("%m/%d/%Y %I:%M %p PT")
    except Exception:
        created = created_raw[:10] if created_raw else ""

    service = order.get("service_type") or "wash_fold"

    lbs = float(order.get("actual_lbs") or order.get("estimated_lbs") or 0)
    rate = float(order.get("price_per_lb") or order.get("rate") or 2.75)
    subtotal = round(lbs * rate, 2) if lbs > 0 else float(order.get("total_amount") or 0)
    delivery_fee = float(order.get("delivery_fee") or 0)
    payment_method = (order.get("payment_method") or "").lower()
    processing_fee = (
        round((subtotal + delivery_fee) * 0.03, 2)
        if payment_method in ("card", "stripe", "tarjeta")
        else 0
    )
    total = order.get("total_amount") or (subtotal + delivery_fee + processing_fee)
    total = float(total)

    pay_status = (order.get("payment_status") or "pending").lower()
    pay_label = "PAGADO" if pay_status == "paid" else "PENDIENTE"
    method_label = {
        "cash": "Efectivo",
        "card": "Tarjeta",
        "stripe": "Tarjeta",
        "zelle": "Zelle",
        "transfer": "Transferencia",
    }.get(payment_method, payment_method.capitalize() or "-")

    # Build rows
    items_html = ""
    if lbs > 0:
        items_html += (
            f'<tr><td>Peso</td><td class="r">{lbs} lbs</td></tr>'
            f'<tr><td>Rate</td><td class="r">${rate:.2f}/lb</td></tr>'
            f'<tr><td>Subtotal</td><td class="r">${subtotal:.2f}</td></tr>'
        )
    if delivery_fee > 0:
        items_html += f'<tr><td>Delivery Fee</td><td class="r">${delivery_fee:.2f}</td></tr>'
    if processing_fee > 0:
        items_html += f'<tr><td>Processing Fee (3%)</td><td class="r">${processing_fee:.2f}</td></tr>'

    addr_html = ""
    if pickup_addr:
        addr_html += (
            f'<tr><td>Pickup</td><td class="r" style="font-size:10px;">'
            f'{pickup_addr[:50]}</td></tr>'
        )
    if delivery_addr and delivery_addr != pickup_addr:
        addr_html += (
            f'<tr><td>Entrega</td><td class="r" style="font-size:10px;">'
            f'{delivery_addr[:50]}</td></tr>'
        )

    phone_html = f'<tr><td>Tel</td><td class="r">{phone}</td></tr>' if phone else ""

    html = f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Ticket {order_num}</title>
<style>
*{{margin:0;padding:0;box-sizing:border-box}}
body{{font-family:'Courier New',monospace;width:80mm;margin:0 auto;padding:4mm;font-size:12px;color:#111}}
.center{{text-align:center}}
h1{{font-size:15px;font-weight:700}}
.sub{{font-size:9px;color:#666;margin-top:2px}}
.order-num{{font-size:16px;font-weight:900;text-align:center;margin:8px 0;letter-spacing:1px}}
hr{{border:none;border-top:1px dashed #999;margin:6px 0}}
table{{width:100%;border-collapse:collapse}}
td{{padding:3px 0;font-size:11px;vertical-align:top}}
.r{{text-align:right;font-weight:600}}
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
  <tr><td>Servicio</td><td class="r">{"Wash & Fold" if "wash" in service.lower() else "Pickup & Delivery"}</td></tr>
  {addr_html}
</table>
<hr>
<table>
  {items_html}
  <tr class="total-row"><td>TOTAL</td><td class="r">${total:.2f}</td></tr>
</table>
<hr>
<table>
  <tr><td>Pago</td><td class="r"><span class="badge {'badge-paid' if pay_status=='paid' else 'badge-pending'}">{pay_label}</span></td></tr>
  <tr><td>Metodo</td><td class="r">{method_label}</td></tr>
</table>
<hr>
<div class="footer">
  <p>Gracias por su preferencia!</p>
  <p>venturafreshlaundry.com</p>
</div>
<script>window.onload=function(){{window.print();}}</script>
</body></html>"""

    return HTMLResponse(content=html)


# ══════════════════════════════════════════════════════════════════════
# NOTIFICACIÓN AL CLIENTE (con mensajes profesionales)
# ══════════════════════════════════════════════════════════════════════


@router.post("/orders/{order_id}/notify-customer")
async def notify_customer_direct(
    order_id: str,
    payload: NotifyCustomerRequest,
    request: Request,
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Send a professional multi-payment notification."""
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    customer_id = order.get("customer_id")
    customer = (
        await db.customers.find_one({"id": customer_id}, {"_id": 0})
        if customer_id
        else None
    )

    phone = (customer or {}).get("phone") or order.get("customer_phone") or ""
    email_addr = (customer or {}).get("email") or order.get("customer_email") or ""
    name = (customer or {}).get("name") or order.get("customer_name") or "Cliente"

    order_num = order.get("order_number", order_id)
    total = float(order.get("total_amount") or order.get("total") or 0)
    pay_status = (order.get("payment_status") or "pending").lower()
    actual_lbs = order.get("actual_lbs")
    estimated_lbs = order.get("estimated_lbs")
    rate = float(order.get("price_per_lb") or order.get("rate") or 2.75)
    delivery_fee = float(order.get("delivery_fee") or 0)
    lbs = float(actual_lbs or estimated_lbs or 0)
    subtotal = round(lbs * rate, 2) if lbs > 0 else total
    total_text = f"${total:.2f}" if total else ""

    # Generate payment link (no shortener)
    payment_url = await _generate_payment_url(order, request)
    short_url = payment_url  # Direct URL, no shortening

    # Build message based on payment status
    if pay_status == "paid":
        method_name = (order.get("payment_method") or "").capitalize() or "Tarjeta"
        msg = (
            f"\U0001f9fc Ventura Fresh Laundry\n\n"
            f"Hola {name} \U0001f44b\n"
            f"Confirmamos el pago de tu orden #{order_num}.\n\n"
            f"\u2705 Total: {total_text}\n"
            f"\u2705 Metodo: {method_name}\n"
            f"\u2705 Estado: Pagado\n\n"
            f"Gracias por confiar en Ventura Fresh Laundry \U0001f9fc\u2728"
        )
    elif payload.message:
        msg = payload.message
        if short_url and short_url not in msg:
            msg += f"\n\nPaga aqui: {short_url}"
    else:
        breakdown = ""
        if lbs > 0:
            breakdown = (
                f"\n\U0001f522 Desglose:\n"
                f"\u2022 {lbs} lbs x ${rate:.2f}/lb = ${subtotal:.2f}\n"
            )
            if delivery_fee > 0:
                breakdown += f"\u2022 Delivery: ${delivery_fee:.2f}\n"
            breakdown += f"\u2022 Total: {total_text}\n"

        msg = (
            f"\U0001f9fc Ventura Fresh Laundry\n\n"
            f"Hi {name} \U0001f44b\n"
            f"Your order #{order_num} is ready for payment.\n"
            f"{breakdown}\n\n"
            f"\U0001f4b3 Complete your payment securely through your customer portal\n"
            f"\U0001f449 Please click the link below to access your account:\n"
            f"{short_url or 'Link not available'}\n\n"
            f"\u26a1 Fast, secure, and easy process\n\n"
            f"If you have any questions, feel free to contact us at (805) 234-8181\n\n"
            f"Thank you for choosing Ventura Fresh Laundry \U0001f9fc\u2728"
        )

    # Build HTML email
    if pay_status == "paid":
        email_html = _build_paid_email_html(
            name, order_num, total_text, order.get("payment_method")
        )
    else:
        email_html = _build_unpaid_email_html(
            name, order_num, lbs, rate, subtotal,
            delivery_fee, total, total_text, payment_url
        )

    if not NOTIFICATIONS_ENABLED:
        return {
            "ok": False,
            "detail": "Notifications not configured",
            "message_preview": msg,
            "payment_url": payment_url,
        }

    from notifications import send_email, send_sms, send_whatsapp

    channel = payload.channel.lower()
    sent = False
    error_detail = ""

    try:
        if channel == "email" and email_addr:
            subject = (
                f"{'Pago Confirmado' if pay_status == 'paid' else 'Pago Pendiente'} - "
                f"Orden {order_num}"
            )
            sent = await send_email(email_addr, subject, msg, email_html)
        elif channel == "whatsapp" and phone:
            sent = await send_whatsapp(phone, msg)
        elif channel == "sms" and phone:
            sent = await send_sms(phone, msg)
        else:
            available = []
            if phone:
                available.append("sms")
            if email_addr:
                available.append("email")
            if not available:
                error_detail = "No phone or email on file for this customer"
            else:
                error_detail = (
                    f"Channel '{channel}' not available. "
                    f"Try: {', '.join(available)}"
                )
    except Exception as e:
        error_detail = str(e)

    if sent:
        await create_audit_log(
            "CUSTOMER_NOTIFIED_DIRECT",
            "order",
            order_id,
            current_user["id"],
            {
                "channel": channel,
                "message": msg[:200],
                "payment_url": payment_url[:200] if payment_url else "",
            }
        )

    return {
        "ok": sent,
        "channel": channel,
        "message_preview": msg[:500],
        "payment_url": payment_url,
        "detail": error_detail if not sent else f"Sent via {channel}",
    }


def _build_paid_email_html(
    name: str,
    order_num: str,
    total_text: str,
    method: str,
) -> str:
    """Build HTML email for paid order confirmation."""
    method_name = (method or "").capitalize() or "Card"

    return f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:30px 0;">
  <tr><td align="center">
<table width="100%" style="max-width:520px;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.06);" cellpadding="0" cellspacing="0">
  <tr><td style="background:linear-gradient(135deg,#059669,#10b981);padding:28px 30px;text-align:center;">
    <h1 style="margin:0;color:#fff;font-size:20px;">Ventura Fresh Laundry</h1>
    <p style="margin:6px 0 0;color:rgba(255,255,255,.85);font-size:14px;">Payment Confirmed</p>
   </td></tr>
  <tr><td style="padding:30px;text-align:center;">
    <div style="width:64px;height:64px;background:#dcfce7;border-radius:50%;margin:0 auto 16px;line-height:64px;font-size:32px;">&#10003;</div>
    <p style="margin:0;font-size:15px;color:#334155;">Hello <strong>{name}</strong>,</p>
    <p style="margin:10px 0 0;font-size:14px;color:#64748b;">We confirm payment for your order.</p>
    <table style="margin:20px auto;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;" cellpadding="12" cellspacing="0">
      <tr><td style="font-size:13px;color:#64748b;border-bottom:1px solid #e2e8f0;">Order</td>
       <td style="font-weight:700;color:#0f172a;border-bottom:1px solid #e2e8f0;">{order_num}</td></tr>
      <tr><td style="font-size:13px;color:#64748b;border-bottom:1px solid #e2e8f0;">Total</td>
       <td style="font-weight:800;font-size:18px;color:#059669;border-bottom:1px solid #e2e8f0;">{total_text}</td></tr>
      <tr><td style="font-size:13px;color:#64748b;">Method</td>
       <td style="font-weight:600;color:#0f172a;">{method_name}</td></tr>
    </table>
    <p style="margin:20px 0 0;font-size:13px;color:#64748b;">Thank you for trusting us!</p>
   </td></tr>
  <tr><td style="padding:0 30px 28px;">
    <hr style="border:none;border-top:1px solid #e2e8f0;margin:0 0 16px;">
    <p style="margin:0;font-size:11px;color:#94a3b8;text-align:center;">Ventura Fresh Laundry &middot; 5722 Telephone Rd Suite 5, Ventura CA 93003 &middot; (805) 515-4030</p>
   </td></tr>
</table>
   </td></tr>
</table>
</body></html>"""


def _build_unpaid_email_html(
    name: str,
    order_num: str,
    lbs: float,
    rate: float,
    subtotal: float,
    delivery_fee: float,
    total: float,
    total_text: str,
    payment_url: str,
) -> str:
    """Build HTML email for unpaid order with payment options."""
    breakdown_rows = ""
    if lbs > 0:
        breakdown_rows = f"""
      <tr><td style="font-size:13px;color:#64748b;padding:10px 16px;border-bottom:1px solid #e2e8f0;">Weight</td>
       <td style="font-weight:600;color:#0f172a;padding:10px 16px;border-bottom:1px solid #e2e8f0;text-align:right;">{lbs} lbs × ${rate:.2f}/lb</td></tr>
      <tr><td style="font-size:13px;color:#64748b;padding:10px 16px;border-bottom:1px solid #e2e8f0;">Subtotal</td>
       <td style="font-weight:600;color:#0f172a;padding:10px 16px;border-bottom:1px solid #e2e8f0;text-align:right;">${subtotal:.2f}</td></tr>"""
        if delivery_fee > 0:
            breakdown_rows += f"""
      <tr><td style="font-size:13px;color:#64748b;padding:10px 16px;border-bottom:1px solid #e2e8f0;">Delivery</td>
       <td style="font-weight:600;color:#0f172a;padding:10px 16px;border-bottom:1px solid #e2e8f0;text-align:right;">${delivery_fee:.2f}</td></tr>"""

    pay_btn = ""
    if payment_url:
        pay_btn = f"""
  <tr><td style="padding:24px 30px 0;text-align:center;">
    <a href="{payment_url}" style="display:inline-block;padding:16px 48px;background:#0891b2;color:#fff;text-decoration:none;font-weight:700;font-size:16px;border-radius:12px;">Pay {total_text} Now</a>
    <p style="margin:10px 0 0;font-size:11px;color:#94a3b8;">Secure link &middot; Card, Apple Pay, Google Pay</p>
   </td></tr>"""

    return f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:30px 0;">
  <tr><td align="center">
<table width="100%" style="max-width:520px;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.06);" cellpadding="0" cellspacing="0">
  <tr><td style="background:linear-gradient(135deg,#0e7490,#0891b2);padding:28px 30px;">
    <h1 style="margin:0;color:#fff;font-size:20px;">Ventura Fresh Laundry</h1>
    <p style="margin:4px 0 0;color:rgba(255,255,255,.8);font-size:13px;">Your order is ready for payment</p>
   </td></tr>
  <tr><td style="padding:28px 30px 0;">
    <p style="margin:0;font-size:15px;color:#334155;">Hello <strong>{name}</strong>,</p>
    <p style="margin:8px 0 0;font-size:14px;color:#64748b;">Your order <strong>#{order_num}</strong> is ready. Here are your payment options:</p>
   </td></tr>
  <!-- Breakdown -->
  <tr><td style="padding:20px 30px 0;">
    <table width="100%" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;" cellpadding="0" cellspacing="0">
      {breakdown_rows}
      <tr><td style="font-size:14px;font-weight:700;color:#0f172a;padding:14px 16px;background:#f0f9ff;">TOTAL</td>
       <td style="font-size:20px;font-weight:800;color:#0891b2;padding:14px 16px;background:#f0f9ff;text-align:right;">{total_text}</td></tr>
    </table>
   </td></tr>
  {pay_btn}
  <!-- Other payment methods -->
  <tr><td style="padding:20px 30px 0;">
    <table width="100%" style="border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;" cellpadding="0" cellspacing="0">
      <tr><td style="padding:14px 16px;border-bottom:1px solid #e2e8f0;background:#fefce8;">
        <p style="margin:0;font-size:13px;font-weight:700;color:#854d0e;">Zelle / Venmo / Cash App</p>
        <p style="margin:4px 0 0;font-size:12px;color:#713f12;">Zelle: <strong>VFLaundry</strong></p>
        <p style="margin:2px 0 0;font-size:12px;color:#713f12;">Venmo: <strong>@VFLaundry</strong></p>
        <p style="margin:2px 0 0;font-size:12px;color:#713f12;">Cash App: <strong>$@VFLaundry</strong></p>
        <p style="margin:4px 0 0;font-size:11px;color:#a16207;">Note: Please include your order number {order_num}</p>
       </td></tr>
      <tr><td style="padding:14px 16px;background:#f0fdf4;">
        <p style="margin:0;font-size:13px;font-weight:700;color:#166534;">Cash</p>
        <p style="margin:4px 0 0;font-size:12px;color:#15803d;">Pay upon pickup or delivery</p>
       </td></tr>
    </table>
   </td></tr>
  <tr><td style="padding:24px 30px;">
    <p style="margin:0;font-size:13px;color:#64748b;">Once payment is completed, your order will continue processing.</p>
    <p style="margin:6px 0 0;font-size:13px;color:#64748b;">Thank you for trusting Ventura Fresh Laundry!</p>
    <hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0;">
    <p style="margin:0;font-size:11px;color:#94a3b8;text-align:center;">Ventura Fresh Laundry &middot; 5722 Telephone Rd Suite 5, Ventura CA 93003 &middot; (805) 515-4030</p>
   </td></tr>
</table>
   </td></tr>
</table>
</body></html>"""