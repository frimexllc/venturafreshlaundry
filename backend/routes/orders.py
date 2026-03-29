"""Orders endpoints — extracted from server_core.py"""
import os
import io
import uuid
import zipfile
import logging
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from pydantic import BaseModel

from fastapi import APIRouter, HTTPException, Depends, Query, Request
from fastapi.responses import StreamingResponse

from database import db, SKIP_SERVER_NOTIFICATIONS
from models import (
    OrderCreate, OrderResponse, OrderPaymentUpdate,
    QrResolveRequest, OrderStripeCheckoutRequest, OrderStripeCheckoutResponse,
    ROLE_OPERATOR,
)
from auth import get_current_user, require_admin, require_role
from utils import (
    normalize_status, normalize_spaces, normalize_address,
    normalize_payment_method, create_audit_log, should_notify_order_status,
    generate_order_number, validate_order_payload, build_order_times,
    build_qr_payload, build_ticket_svg, build_display_order_number,
    parse_qr_payload, build_address_parts, calculate_service_amount,
)
from realtime import emit_realtime

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
        StripeCheckout,
        CheckoutSessionResponse,
        CheckoutStatusResponse,
        CheckoutSessionRequest,
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
        def __init__(self, api_key: str, webhook_url: str):
            pass
        async def create_checkout_session(self, request):
            raise RuntimeError("Stripe not available")
        async def get_checkout_status(self, sid):
            raise RuntimeError("Stripe not available")


router = APIRouter(prefix="/api", tags=["Orders"])


# ==================== ORDERS CRUD ====================

@router.post("/orders", response_model=OrderResponse)
async def create_order(data: OrderCreate, notify: bool = True, current_user: dict = Depends(get_current_user)):
    customer = await db.customers.find_one({"id": data.customer_id}, {"_id": 0})
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    order_id = str(uuid.uuid4())
    order_number = await generate_order_number()
    now = datetime.now(timezone.utc).isoformat()
    errors = validate_order_payload(data)

    normalized_pickup_address = normalize_address(data.pickup_address or customer.get("address"))
    normalized_delivery_address = normalize_address(data.delivery_address)
    normalized_notes = normalize_spaces(data.notes)
    normalized_gate_code = normalize_spaces(data.gate_code)
    normalized_service_type = normalize_spaces(data.service_type).lower().replace(" ", "_")

    pref = await db.preferences.find({"customer_id": data.customer_id}, {"_id": 0}).sort("version", -1).limit(1).to_list(1)
    preference_id = pref[0].get("id") if pref else None
    preference_snapshot = None
    if pref:
        preference_snapshot = {k: v for k, v in pref[0].items() if k not in ["_id", "customer_id"]}

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
            {"nombre": "ingesta", "estado": "done", "inicio": now, "fin": now, "errores": []},
            {"nombre": "procesamiento", "estado": "pending", "inicio": None, "fin": None, "errores": []}
        ],
        "importada": False,
        "origen": "crm",
        "qr_token": str(uuid.uuid4()),
        "created_at": now,
        "updated_at": now,
    }
    await db.orders.insert_one(order)
    await db.customers.update_one({"id": data.customer_id}, {"$inc": {"total_orders": 1}})
    await db.eventos_automation.insert_one({
        "id": str(uuid.uuid4()),
        "tipo": "ORDER_CREATED",
        "entity_id": order_id,
        "payload": {"order_number": order_number, "service_type": data.service_type},
        "created_at": now,
    })
    await create_audit_log("ORDER_CREATED", "order", order_id, current_user["id"])
    await emit_realtime("notification", {
        "type": "order_created",
        "order_id": order_id,
        "status": "new",
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
    status: Optional[str] = None,
    customer_id: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    current_user: dict = Depends(get_current_user),
):
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
    orders = await db.orders.find(query, {"_id": 0}).sort("created_at", -1).skip(skip).limit(page_size).to_list(page_size)
    return [OrderResponse(**o) for o in orders]


@router.get("/orders/{order_id}", response_model=OrderResponse)
async def get_order(order_id: str, current_user: dict = Depends(get_current_user)):
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    return OrderResponse(**order)


@router.get("/orders/{order_id}/qr")
async def get_order_qr(order_id: str, current_user: dict = Depends(get_current_user)):
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    qr_token = order.get("qr_token") or str(uuid.uuid4())
    if not order.get("qr_token"):
        await db.orders.update_one({"id": order_id}, {"$set": {"qr_token": qr_token}})
    return {"order_id": order_id, "order_number": order.get("order_number"), "qr_token": qr_token}


@router.get("/orders/{order_id}/qr.svg")
async def get_order_qr_svg(order_id: str):
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

    payload = build_qr_payload({"id": order.get("id"), "order_number": order.get("order_number"), "qr_token": qr_token})
    ticket_svg = build_ticket_svg(order, customer, payload)
    display_id = build_display_order_number(order)
    filename = f"ticket-{display_id}.svg"
    return StreamingResponse(io.BytesIO(ticket_svg), media_type="image/svg+xml", headers={"Content-Disposition": f"attachment; filename={filename}"})


@router.get("/orders/qr/export")
async def export_qr_batch(
    start_date: str = Query(..., description="Start date YYYY-MM-DD"),
    end_date: str = Query(..., description="End date YYYY-MM-DD"),
    status: Optional[str] = None,
    service_type: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    query = {"pickup_date": {"$gte": start_date, "$lte": end_date}}
    if status:
        query["status"] = status
    if service_type:
        query["service_type"] = service_type
    export_limit = 500
    orders = await db.orders.find(query, {"_id": 0}).sort("pickup_date", 1).limit(export_limit + 1).to_list(export_limit + 1)
    if len(orders) > export_limit:
        raise HTTPException(status_code=400, detail=f"Export limit exceeded. Please narrow to {export_limit} orders or fewer.")

    customer_ids = {o.get("customer_id") for o in orders if o.get("customer_id")}
    customer_map = {}
    if customer_ids:
        customers = await db.customers.find({"id": {"$in": list(customer_ids)}}, {"_id": 0}).to_list(len(customer_ids))
        customer_map = {c.get("id"): c for c in customers}

    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
        for order in orders:
            qr_token = order.get("qr_token") or str(uuid.uuid4())
            if not order.get("qr_token"):
                await db.orders.update_one({"id": order["id"]}, {"$set": {"qr_token": qr_token}})
            payload = build_qr_payload({"id": order["id"], "order_number": order.get("order_number"), "qr_token": qr_token})
            customer = customer_map.get(order.get("customer_id"))
            ticket_svg = build_ticket_svg(order, customer, payload)
            display_id = build_display_order_number(order)
            zip_file.writestr(f"ticket-{display_id}.svg", ticket_svg)
    buffer.seek(0)
    fname = f"qr-export-{start_date}-to-{end_date}.zip"
    return StreamingResponse(buffer, media_type="application/zip", headers={"Content-Disposition": f"attachment; filename={fname}"})


@router.post("/orders/qr/resolve")
async def resolve_qr(data: QrResolveRequest, current_user: dict = Depends(get_current_user)):
    payload_data = {}
    if data.payload:
        payload_data = parse_qr_payload(data.payload)
    qr_token = data.qr_token or payload_data.get("qr_token")
    order_id = payload_data.get("order_id")
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
    customer = None
    if not customer_name and order.get("customer_id"):
        customer = await db.customers.find_one({"id": order.get("customer_id")}, {"_id": 0})
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
        "items": order.get("items") or order.get("services_included") or order.get("products") or [],
        "total_amount": order.get("total_amount"),
        "special_instructions": order.get("notes") or order.get("special_instructions"),
        "pickup_date": order.get("pickup_date"),
        "pickup_time_window": order.get("pickup_time_window"),
        "payment_status": order.get("payment_status"),
    }


@router.put("/orders/{order_id}", response_model=OrderResponse)
async def update_order(order_id: str, data: dict, current_user: dict = Depends(get_current_user)):
    data["updated_at"] = datetime.now(timezone.utc).isoformat()
    if "actual_lbs" in data:
        order_snapshot = await db.orders.find_one({"id": order_id}, {"_id": 0})
        if order_snapshot:
            customer_snapshot = None
            if order_snapshot.get("customer_id"):
                customer_snapshot = await db.customers.find_one({"id": order_snapshot.get("customer_id")}, {"_id": 0})
            temp_order = {**order_snapshot, **data}
            total_amount = calculate_service_amount(temp_order, customer_snapshot)
            if total_amount is not None:
                data["total_amount"] = total_amount
    result = await db.orders.update_one({"id": order_id}, {"$set": data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Order not found")

    await create_audit_log("ORDER_UPDATED", "order", order_id, current_user["id"], {"changes": list(data.keys())})
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    return OrderResponse(**order)


@router.patch("/orders/{order_id}/status")
async def update_order_status(order_id: str, status: str, notify: bool = True, current_user: dict = Depends(get_current_user)):
    valid_statuses = ["new", "confirmed", "pickup_scheduled", "picked_up", "processing", "ready", "out_for_delivery", "delivered", "completed", "cancelled"]
    normalized_status = status.strip().lower()
    if normalized_status not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {valid_statuses}")

    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    current_status = (order.get("status") or "").strip().lower()
    service_type = normalize_spaces(order.get("service_type") or "pickup_delivery").lower().replace(" ", "_")
    if normalized_status == "completed":
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
                "status": normalized_status,
                "estado_actual": normalized_status,
                "updated_at": now,
                "tiempos.ultimo_cambio_estado": now,
                f"tiempos.fechas_estado.{normalized_status}": now,
            }
        },
    )

    await create_audit_log("ORDER_STATUS_CHANGED", "order", order_id, current_user["id"], {"new_status": normalized_status})
    await db.eventos_automation.insert_one({
        "id": str(uuid.uuid4()),
        "tipo": "ORDER_STATUS_CHANGED",
        "entity_id": order_id,
        "payload": {"status": normalized_status},
        "created_at": now,
    })

    if notify and NOTIFICATIONS_ENABLED and not SKIP_SERVER_NOTIFICATIONS and order.get("customer_id") and should_notify_order_status(order, normalized_status):
        customer = await db.customers.find_one({"id": order["customer_id"]}, {"_id": 0})
        if customer:
            order["status"] = normalized_status
            try:
                await notify_order_status_changed(customer, order, normalized_status)
            except Exception as e:
                logger.error(f"Notification failed: {e}")

    await emit_realtime("notification", {
        "type": "order_status",
        "order_id": order_id,
        "status": normalized_status,
    })

    return {"message": f"Order status updated to {normalized_status}"}


@router.patch("/orders/{order_id}/payment-status")
async def update_order_payment_status(order_id: str, status: str, current_user: dict = Depends(get_current_user)):
    valid_statuses = ["pending", "paid", "refunded", "failed"]
    if status not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"Invalid payment status. Must be one of: {valid_statuses}")

    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    await db.orders.update_one(
        {"id": order_id},
        {"$set": {"payment_status": status, "updated_at": datetime.now(timezone.utc).isoformat()}},
    )

    await create_audit_log("ORDER_PAYMENT_STATUS_CHANGED", "order", order_id, current_user["id"], {"payment_status": status})
    await emit_realtime("notification", {"type": "order_payment", "order_id": order_id, "status": status})
    return {"message": f"Payment status updated to {status}"}


@router.post("/orders/{order_id}/payment")
async def capture_order_payment(
    order_id: str,
    data: OrderPaymentUpdate,
    current_user: dict = Depends(require_role([ROLE_OPERATOR])),
):
    method = normalize_payment_method(data.payment_method)
    allowed = ["cash", "card", "transfer", "other"]
    if method not in allowed:
        raise HTTPException(status_code=400, detail=f"Invalid payment method. Must be one of: {allowed}")

    order = await db.orders.find_one({"$or": [{"id": order_id}, {"order_number": order_id}]}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    total_amount = order.get("total_amount")
    amount_received = data.amount_received

    if method == "cash" and amount_received is None:
        raise HTTPException(status_code=400, detail="Amount received is required for cash payments")
    if amount_received is None:
        amount_received = total_amount
    if total_amount is not None and amount_received is not None:
        try:
            total_amount = float(total_amount)
            amount_received = float(amount_received)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid amount values")
        if amount_received < total_amount:
            raise HTTPException(status_code=400, detail="Amount received cannot be less than total")

    change_due = None
    if method == "cash" and total_amount is not None and amount_received is not None:
        change_due = round(amount_received - total_amount, 2)

    now = datetime.now(timezone.utc).isoformat()
    update_data = {
        "payment_status": "paid",
        "payment_method": method,
        "amount_paid": amount_received,
        "change_due": change_due,
        "paid_at": now,
        "updated_at": now,
    }

    await db.orders.update_one({"id": order.get("id")}, {"$set": update_data})
    await create_audit_log("ORDER_PAYMENT_CAPTURED", "order", order.get("id"), current_user["id"], update_data)

    # Create finance ledger entry
    finance_entry = {
        "id": str(uuid.uuid4()),
        "type": "income",
        "category": "service_payment",
        "description": f"Pago orden {order.get('order_number', order_id)} - {order.get('service_type', 'service')}",
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

    await emit_realtime("notification", {"type": "order_payment", "order_id": order.get("id"), "status": "paid", "method": method})
    return {"ok": True, "order_id": order.get("id"), **update_data}


# ==================== STRIPE CHECKOUT ====================

@router.post("/orders/{order_id}/stripe-checkout", response_model=OrderStripeCheckoutResponse)
async def create_order_stripe_checkout(
    order_id: str,
    data: OrderStripeCheckoutRequest,
    request: Request,
    current_user: dict = Depends(require_role([ROLE_OPERATOR])),
):
    if not STRIPE_CHECKOUT_AVAILABLE:
        raise HTTPException(status_code=503, detail="Stripe integration not available")
    order = await db.orders.find_one({"$or": [{"id": order_id}, {"order_number": order_id}]}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    customer = None
    if order.get("customer_id"):
        customer = await db.customers.find_one({"id": order.get("customer_id")}, {"_id": 0})

    amount = calculate_service_amount(order, customer)
    if amount is None:
        raise HTTPException(status_code=400, detail="Actual lbs required to calculate payment")

    stripe_api_key = os.environ.get("STRIPE_API_KEY")
    if not stripe_api_key:
        raise HTTPException(status_code=500, detail="Payment configuration error")

    host_url = str(request.base_url).rstrip("/")
    webhook_url = f"{host_url}/api/webhook/stripe"
    success_url = f"{data.origin_url}/admin/operator?session_id={{CHECKOUT_SESSION_ID}}&order_id={order.get('id')}"
    cancel_url = f"{data.origin_url}/admin/operator?order_id={order.get('id')}&status=cancelled"

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
    session: CheckoutSessionResponse = await stripe_checkout.create_checkout_session(session_request)

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
        {"$set": {"total_amount": amount, "payment_status": "pending", "payment_method": "card", "updated_at": now}},
    )

    return OrderStripeCheckoutResponse(session_id=session.session_id, url=session.url, amount=amount, currency="usd")


@router.get("/orders/stripe/status/{session_id}")
async def get_order_stripe_status(
    session_id: str,
    request: Request,
    current_user: dict = Depends(require_role([ROLE_OPERATOR])),
):
    if not STRIPE_CHECKOUT_AVAILABLE:
        raise HTTPException(status_code=503, detail="Stripe integration not available")
    stripe_api_key = os.environ.get("STRIPE_API_KEY")
    if not stripe_api_key:
        raise HTTPException(status_code=500, detail="Payment configuration error")

    host_url = str(request.base_url).rstrip("/")
    webhook_url = f"{host_url}/api/webhook/stripe"
    stripe_checkout = StripeCheckout(api_key=stripe_api_key, webhook_url=webhook_url)
    status_resp: CheckoutStatusResponse = await stripe_checkout.get_checkout_status(session_id)

    transaction = await db.payment_transactions.find_one({"session_id": session_id}, {"_id": 0})
    if not transaction:
        raise HTTPException(status_code=404, detail="Payment session not found")

    update_fields = {
        "status": status_resp.status,
        "payment_status": status_resp.payment_status,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.payment_transactions.update_one({"session_id": session_id}, {"$set": update_fields})

    if status_resp.payment_status == "paid" and transaction.get("payment_status") != "paid":
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
                "description": f"Pago Stripe orden {(order_doc or {}).get('order_number', order_id)}",
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

async def notify_last_completed_order(current_user: dict = Depends(get_current_user)):
    require_admin(current_user)
    last_order = await db.orders.find({"status": "completed"}, {"_id": 0}).sort("updated_at", -1).limit(1).to_list(1)
    if not last_order:
        raise HTTPException(status_code=404, detail="No completed orders found")
    order = last_order[0]
    customer_id = order.get("customer_id")
    if not customer_id:
        raise HTTPException(status_code=400, detail="Order missing customer")
    customer = await db.customers.find_one({"id": customer_id}, {"_id": 0})
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    if NOTIFICATIONS_ENABLED and not SKIP_SERVER_NOTIFICATIONS:
        await notify_order_status_changed(customer, order, "completed")
    await create_audit_log("ORDER_COMPLETED_NOTIFICATION_SENT", "order", order["id"], current_user["id"])
    return {"ok": True, "order_id": order["id"], "order_number": order.get("order_number")}
