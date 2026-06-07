"""
Automation Engine - Core workflow logic for Ventura Fresh Laundry
FIXES:
  - _clone_order_for_next_pickup: status guardado en minúsculas (consistente con orders.py)
  - normalize_status: siempre devuelve MAYÚSCULAS (correcto para automation_engine)
  - get_next_status / get_action_label: soportan MAYÚSCULAS y minúsculas
  - _categorize_orders: normaliza status antes de comparar
  - operator dashboard: doble definición de _categorize_orders y get_operator_dashboard eliminada
  - update_order_status: notificación usa status en MAYÚSCULAS (correcto para automation_engine)
"""
import asyncio
import logging
import os
import re
import uuid
from datetime import datetime, timezone, timedelta
from enum import Enum
from typing import Optional, Dict, List, Any

from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel

automation_router = APIRouter(prefix="/automation", tags=["Automation Engine"])
logger = logging.getLogger(__name__)

try:
    from notifications import notify_order_status_changed, normalize_preferred_contact
    NOTIFICATIONS_ENABLED = True
except ImportError:
    NOTIFICATIONS_ENABLED = False
    normalize_preferred_contact = None
    logger.warning("Notification services not available")

SKIP_SERVER_NOTIFICATIONS = os.environ.get("SKIP_SERVER_NOTIFICATIONS", "false").lower() == "true"
FRONTEND_URL = os.environ.get("FRONTEND_URL", "https://venturafreshlaundry.com")

db = None

def set_database(database):
    global db
    db = database

realtime_emitter = None

def set_realtime_emitter(emitter):
    global realtime_emitter
    realtime_emitter = emitter

async def emit_realtime(event: str, payload: dict):
    if not realtime_emitter:
        return
    try:
        await realtime_emitter(event, payload)
    except Exception as exc:
        logger.warning(f"Realtime emit failed: {exc}")


# ==================== ENUMS ====================

class RouteResult(str, Enum):
    ORDER = "ORDER"
    QUOTE = "QUOTE"
    LEAD = "LEAD"
    SUPPORT = "SUPPORT"
    PREFERENCES = "PREFERENCES"
    ERROR_INCOMPLETE = "ERROR_INCOMPLETE"
    ERROR_DUPLICATE = "ERROR_DUPLICATE"

class TicketPriority(str, Enum):
    HIGH = "HIGH"
    MEDIUM = "MEDIUM"
    LOW = "LOW"

class OrderStatus(str, Enum):
    NEW = "NEW"
    CONFIRMED = "CONFIRMED"
    PICKUP_SCHEDULED = "PICKUP_SCHEDULED"
    PICKED_UP = "PICKED_UP"
    PROCESSING = "PROCESSING"
    READY = "READY"
    OUT_FOR_DELIVERY = "OUT_FOR_DELIVERY"
    DELIVERED = "DELIVERED"
    COMPLETED = "COMPLETED"
    CANCELLED = "CANCELLED"

PICKUP_NEXT_STATUS_BY_STATUS = {
    "NEW": "CONFIRMED",
    "CONFIRMED": "PICKED_UP",
    "PICKUP_SCHEDULED": "PICKED_UP",
    "PICKED_UP": "PROCESSING",
    "PROCESSING": "READY",
    "READY": "OUT_FOR_DELIVERY",
    "OUT_FOR_DELIVERY": "DELIVERED",
    "DELIVERED": "COMPLETED",
}

PICKUP_ACTION_LABELS = {
    "NEW": "Confirmar",
    "CONFIRMED": "Recolectar",
    "PICKUP_SCHEDULED": "Recolectar",
    "PICKED_UP": "En proceso",
    "PROCESSING": "Marcar listo",
    "READY": "Salir a entregar",
    "OUT_FOR_DELIVERY": "Marcar entregado",
    "DELIVERED": "Completar",
}

WASH_FOLD_SERVICE_TYPES = {
    "wash_fold",
    "wash_fold_dropoff",
    "wash-fold",
    "wash fold",
    "wash_and_fold",
    "wash&fold",
    "washfold",
    "self_service",
    "dropoff",
    "drop_off",
    "wash_dry_fold",
}

WASH_FOLD_NEXT_STATUS_BY_STATUS = {
    "NEW": "CONFIRMED",
    "CONFIRMED": "PROCESSING",
    "PROCESSING": "READY",
    "READY": "COMPLETED",
}

WASH_FOLD_ACTION_LABELS = {
    "NEW": "Confirmar",
    "CONFIRMED": "Procesar",
    "PROCESSING": "Listo p/ recoger",
    "READY": "Completar",
}

# Días de semana → número Python (lunes=0)
WEEKDAY_MAP = {
    "Monday": 0, "Tuesday": 1, "Wednesday": 2,
    "Thursday": 3, "Friday": 4, "Saturday": 5, "Sunday": 6,
}


# ==================== SERVICE TYPE HELPERS ====================

def normalize_service_type(service_type: Optional[str]) -> str:
    if not service_type:
        return "pickup_delivery"
    # FIX: normalizar guiones, espacios y & para comparación robusta
    return str(service_type).strip().lower().replace("-", "_").replace(" ", "_").replace("&", "and")

def is_wash_fold_service(service_type: Optional[str]) -> bool:
    normalized = normalize_service_type(service_type)
    # Verificar en el set ampliado, y también buscar "wash" o "fold" en el string
    return (
        normalized in WASH_FOLD_SERVICE_TYPES
        or "wash" in normalized
        or "fold" in normalized
        or "dropoff" in normalized
        or "drop_off" in normalized
    )

def normalize_status(value: Optional[str]) -> Optional[str]:
    """
    Normaliza el status a MAYÚSCULAS para consistencia en automation_engine.
    Soporta valores en español e inglés, mayúsculas y minúsculas.
    """
    if not value:
        return None

    normalized = str(value).strip().lower()

    status_map = {
        "new": "NEW",
        "nueva": "NEW",
        "nuevo": "NEW",
        "confirmed": "CONFIRMED",
        "confirmada": "CONFIRMED",
        "confirmado": "CONFIRMED",
        "pickup_scheduled": "PICKUP_SCHEDULED",
        "pickup scheduled": "PICKUP_SCHEDULED",
        "programado": "PICKUP_SCHEDULED",
        "picked_up": "PICKED_UP",
        "picked up": "PICKED_UP",
        "recolectada": "PICKED_UP",
        "recolectado": "PICKED_UP",
        "processing": "PROCESSING",
        "procesando": "PROCESSING",
        "ready": "READY",
        "lista": "READY",
        "listo": "READY",
        "out_for_delivery": "OUT_FOR_DELIVERY",
        "out for delivery": "OUT_FOR_DELIVERY",
        "en camino": "OUT_FOR_DELIVERY",
        "delivered": "DELIVERED",
        "entregada": "DELIVERED",
        "entregado": "DELIVERED",
        "completed": "COMPLETED",
        "completada": "COMPLETED",
        "completado": "COMPLETED",
        "cancelled": "CANCELLED",
        "cancelada": "CANCELLED",
        "cancelado": "CANCELLED",
    }

    return status_map.get(normalized, normalized.upper())

def get_next_status(value: Optional[str], service_type: Optional[str] = None):
    if not value:
        return None
    # FIX: normalizar a MAYÚSCULAS antes de buscar en el mapa
    value_upper = normalize_status(value)
    if is_wash_fold_service(service_type):
        return WASH_FOLD_NEXT_STATUS_BY_STATUS.get(value_upper)
    return PICKUP_NEXT_STATUS_BY_STATUS.get(value_upper)

def get_action_label(status: Optional[str], service_type: Optional[str] = None):
    # FIX: normalizar a MAYÚSCULAS antes de buscar en el mapa
    normalized_status = normalize_status(status)
    if not normalized_status:
        return None
    if is_wash_fold_service(service_type):
        return WASH_FOLD_ACTION_LABELS.get(normalized_status)
    return PICKUP_ACTION_LABELS.get(normalized_status)

def resolve_notification_channel(customer: Dict, order: Dict) -> str:
    raw_value = (order or {}).get("preferred_contact") or (customer or {}).get("preferred_contact") or "sms"
    if normalize_preferred_contact:
        return normalize_preferred_contact(raw_value)
    normalized = str(raw_value).strip().lower()
    if normalized in {"email", "call", "whatsapp", "sms"}:
        return normalized
    return "sms"

def build_status_notification_key(status: str, channel: str) -> str:
    status_normalized = (status or "").strip().lower()
    channel_normalized = (channel or "sms").strip().lower()
    return f"status_changed:{status_normalized}:{channel_normalized}"

async def enrich_orders_with_customers(orders: List[Dict]):
    customer_ids = {o.get("customer_id") for o in orders if o.get("customer_id")}
    if not customer_ids:
        return orders
    customers = await db.customers.find(
        {"$or": [{"id": {"$in": list(customer_ids)}}, {"customer_id": {"$in": list(customer_ids)}}]},
        {"_id": 0},
    ).to_list(2000)
    customer_map = {c.get("id"): c for c in customers}
    customer_map.update({c.get("customer_id"): c for c in customers if c.get("customer_id")})
    for order in orders:
        customer = customer_map.get(order.get("customer_id"))
        if customer:
            order.setdefault("customer_name", customer.get("name"))
            order.setdefault("customer_phone", customer.get("phone"))
            order.setdefault("customer_email", customer.get("email"))
            order.setdefault("preferred_contact", customer.get("preferred_contact"))
            order.setdefault("membership_plan", customer.get("membership_plan"))
            order.setdefault("delivery_address", customer.get("address"))
    return orders


# ==================== MODELS ====================

class IngestData(BaseModel):
    name: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    street_address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    zip_code: Optional[str] = None
    service_type: Optional[str] = None
    type_of_service: Optional[str] = None
    pickup_date: Optional[str] = None
    pickup_time: Optional[str] = None
    dropoff_date: Optional[str] = None
    estimated_lbs: Optional[float] = None
    company_name: Optional[str] = None
    company_legal_name: Optional[str] = None
    industry: Optional[str] = None
    estimated_volume: Optional[str] = None
    subject: Optional[str] = None
    message: Optional[str] = None
    issue_description: Optional[str] = None
    what_is_this_regarding: Optional[str] = None
    fabric_softener: Optional[str] = None
    detergent_preference: Optional[str] = None
    special_instructions: Optional[str] = None
    gate_code: Optional[str] = None
    source_form: Optional[str] = None
    submitted_at: Optional[str] = None
    raw_data: Optional[Dict[str, Any]] = None

class ProcessedResult(BaseModel):
    ingest_id: str
    route_result: RouteResult
    created_entity_id: Optional[str] = None
    created_entity_type: Optional[str] = None
    customer_id: Optional[str] = None
    notifications_sent: List[str] = []
    audit_entries: List[str] = []
    errors: List[str] = []


# ==================== HELPER FUNCTIONS ====================

def normalize_email(email: Optional[str]) -> Optional[str]:
    if not email:
        return None
    return email.lower().strip()

def normalize_phone(phone: Optional[str]) -> Optional[str]:
    if not phone:
        return None
    digits = re.sub(r"\D", "", phone)
    if len(digits) == 10:
        return f"+1{digits}"
    elif len(digits) == 11 and digits.startswith("1"):
        return f"+{digits}"
    return digits

def normalize_name(name: Optional[str], first: Optional[str] = None, last: Optional[str] = None) -> str:
    if name:
        return name.strip().title()
    if first and last:
        return f"{first.strip().title()} {last.strip().title()}"
    if first:
        return first.strip().title()
    if last:
        return last.strip().title()
    return "Unknown"

def generate_dedup_key(email, phone, source, timestamp) -> str:
    parts = []
    if email:
        parts.append(normalize_email(email))
    elif phone:
        parts.append(normalize_phone(phone))
    parts.append(source or "unknown")
    parts.append(timestamp or datetime.now(timezone.utc).isoformat()[:19])
    return "|".join(parts)

def detect_route(data: IngestData) -> RouteResult:
    source = (data.source_form or "").upper()
    if any([
        "PICKUP" in source,
        data.pickup_date,
        data.pickup_time,
        data.type_of_service and "pickup" in data.type_of_service.lower(),
        data.service_type and "pickup" in data.service_type.lower(),
    ]):
        return RouteResult.ORDER
    if any([
        "QUOTE" in source or "B2B" in source or "COMMERCIAL" in source,
        data.company_name,
        data.company_legal_name,
        data.industry,
        data.type_of_service and "comercial" in data.type_of_service.lower(),
    ]):
        return RouteResult.QUOTE
    if any([
        "SUPPORT" in source or "FEEDBACK" in source or "ISSUE" in source,
        data.issue_description,
        data.what_is_this_regarding and any(
            kw in data.what_is_this_regarding.lower()
            for kw in ["issue", "problem", "complaint", "feedback"]
        ),
    ]):
        return RouteResult.SUPPORT
    if any(["PREFERENCE" in source, data.fabric_softener, data.detergent_preference]):
        return RouteResult.PREFERENCES
    return RouteResult.LEAD

def detect_ticket_priority(text: str) -> TicketPriority:
    text_lower = text.lower()
    high_kw = ["urgent", "refund", "damaged", "missing", "complaint", "lost", "stolen", "ruined", "asap", "immediately"]
    medium_kw = ["issue", "problem", "delay", "late", "wrong", "error", "incorrect"]
    if any(kw in text_lower for kw in high_kw):
        return TicketPriority.HIGH
    if any(kw in text_lower for kw in medium_kw):
        return TicketPriority.MEDIUM
    return TicketPriority.LOW

def get_sla_deadline(priority: TicketPriority) -> datetime:
    now = datetime.now(timezone.utc)
    if priority == TicketPriority.HIGH:
        return now + timedelta(hours=4)
    elif priority == TicketPriority.MEDIUM:
        return now + timedelta(hours=24)
    return now + timedelta(hours=72)


# ==================== WORKFLOW 1: GATEKEEPER ====================

@automation_router.post("/ingest", response_model=ProcessedResult)
async def process_ingest(data: IngestData, background_tasks: BackgroundTasks):
    now = datetime.now(timezone.utc)
    result = ProcessedResult(
        ingest_id=str(uuid.uuid4()),
        route_result=RouteResult.LEAD,
        notifications_sent=[],
        audit_entries=[],
        errors=[],
    )
    try:
        normalized_email = normalize_email(data.email)
        normalized_phone = normalize_phone(data.phone)
        normalized_name = normalize_name(data.name, data.first_name, data.last_name)
        dedup_key = generate_dedup_key(normalized_email, normalized_phone, data.source_form, data.submitted_at)
        existing = await db.ingest_log.find_one({"dedup_key": dedup_key})
        if existing:
            result.route_result = RouteResult.ERROR_DUPLICATE
            result.errors.append(f"Duplicate submission: {existing.get('ingest_id')}")
            return result
        if not normalized_email and not normalized_phone:
            result.route_result = RouteResult.ERROR_INCOMPLETE
            result.errors.append("Missing email and phone")
            await db.ingest_log.insert_one({
                "ingest_id": result.ingest_id, "dedup_key": dedup_key,
                "route_result": result.route_result.value, "processed_flag": "ERROR",
                "error_notes": "Missing contact info", "raw_data": data.model_dump(),
                "created_at": now.isoformat(),
            })
            return result
        result.route_result = detect_route(data)
        customer = await upsert_customer(normalized_email, normalized_phone, normalized_name, data)
        result.customer_id = customer["customer_id"]
        result.audit_entries.append(f"Customer upserted: {customer['customer_id']}")
        if result.route_result == RouteResult.ORDER:
            entity = await create_order(data, customer, result.ingest_id)
            result.created_entity_id = entity["order_id"]
            result.created_entity_type = "order"
            if data.pickup_date:
                background_tasks.add_task(create_calendar_event, entity)
        elif result.route_result == RouteResult.QUOTE:
            entity = await create_quote(data, customer, result.ingest_id)
            result.created_entity_id = entity["quote_id"]
            result.created_entity_type = "quote"
        elif result.route_result == RouteResult.SUPPORT:
            entity = await create_ticket(data, customer, result.ingest_id)
            result.created_entity_id = entity["ticket_id"]
            result.created_entity_type = "ticket"
        elif result.route_result == RouteResult.PREFERENCES:
            entity = await save_preferences(data, customer, result.ingest_id)
            result.created_entity_id = entity["preferences_id"]
            result.created_entity_type = "preferences"
        else:
            entity = await create_lead(data, customer, result.ingest_id)
            result.created_entity_id = entity["lead_id"]
            result.created_entity_type = "lead"
        result.audit_entries.append(f"{result.created_entity_type} created: {result.created_entity_id}")
        await db.ingest_log.insert_one({
            "ingest_id": result.ingest_id, "dedup_key": dedup_key,
            "route_result": result.route_result.value, "processed_flag": "PROCESSED",
            "processed_at": now.isoformat(), "customer_id": result.customer_id,
            "created_entity_type": result.created_entity_type,
            "created_entity_id": result.created_entity_id,
            "normalized_email": normalized_email, "normalized_phone": normalized_phone,
            "normalized_name": normalized_name, "raw_data": data.model_dump(),
            "created_at": now.isoformat(),
        })
        await db.audit_log.insert_one({
            "id": str(uuid.uuid4()), "event_type": "INGEST_PROCESSED",
            "entity_type": result.created_entity_type, "entity_id": result.created_entity_id,
            "details": {"ingest_id": result.ingest_id, "route_result": result.route_result.value,
                        "customer_id": result.customer_id},
            "user": "automation", "timestamp": now.isoformat(),
        })
        background_tasks.add_task(send_notifications, result, data, customer)
        return result
    except Exception as e:
        logger.error(f"Error processing ingest: {e}")
        result.errors.append(str(e))
        return result


# ==================== WORKFLOW 4: CUSTOMER UPSERT ====================

async def upsert_customer(email, phone, name, data: IngestData) -> Dict:
    now = datetime.now(timezone.utc).isoformat()
    query = []
    if email:
        query.append({"email": email})
    if phone:
        query.append({"phone": phone})
    existing = None
    if query:
        existing = await db.customers.find_one({"$or": query})
    if existing:
        update_data = {"last_contact_at": now, "updated_at": now}
        if data.address or data.street_address:
            update_data["default_address"] = data.address or data.street_address
        if data.city:
            update_data["city"] = data.city
        if data.state:
            update_data["state"] = data.state
        if data.zip_code:
            update_data["zip_code"] = data.zip_code
        await db.customers.update_one(
            {"id": existing["id"]},
            {"$set": update_data, "$inc": {"total_submissions": 1}},
        )
        return {"customer_id": existing["id"], "is_new": False, **existing}
    customer_count = await db.customers.count_documents({})
    customer_id = f"CUST-{str(customer_count + 1).zfill(6)}"
    new_customer = {
        "id": customer_id, "customer_id": customer_id, "name": name,
        "email": email, "phone": phone,
        "default_address": data.address or data.street_address,
        "city": data.city, "state": data.state, "zip_code": data.zip_code,
        "status": "ACTIVE", "total_submissions": 1, "total_orders": 0,
        "created_at": now, "updated_at": now, "last_contact_at": now,
    }
    await db.customers.insert_one(new_customer)
    return {"customer_id": customer_id, "is_new": True, **new_customer}


# ==================== WORKFLOW 6: ORDER CREATE ====================

async def create_order(data: IngestData, customer: Dict, ingest_id: str) -> Dict:
    now = datetime.now(timezone.utc)
    date_str = now.strftime("%Y%m%d")
    today_count = await db.orders.count_documents({"order_id": {"$regex": f"^ORD-{date_str}"}})
    order_id = f"ORD-{date_str}-{str(today_count + 1).zfill(4)}"
    address_parts = [data.address or data.street_address]
    if data.city:
        address_parts.append(data.city)
    if data.state:
        address_parts.append(data.state)
    if data.zip_code:
        address_parts.append(data.zip_code)
    full_address = ", ".join(filter(None, address_parts))
    order = {
        "id": str(uuid.uuid4()), "order_id": order_id, "order_number": order_id,
        "customer_id": customer["customer_id"], "customer_name": customer.get("name", "Unknown"),
        "customer_email": customer.get("email"), "customer_phone": customer.get("phone"),
        "ingest_id": ingest_id,
        "service_type": data.service_type or data.type_of_service or "Standard",
        "estimated_lbs": data.estimated_lbs, "pickup_address": full_address,
        "delivery_address": full_address, "pickup_date": data.pickup_date,
        "pickup_time": data.pickup_time, "dropoff_date": data.dropoff_date,
        "special_instructions": data.special_instructions, "gate_code": data.gate_code,
        # FIX: status en MAYÚSCULAS para automation_engine (consistente con PICKUP_NEXT_STATUS_BY_STATUS)
        "status": OrderStatus.NEW.value,
        "estado_actual": OrderStatus.NEW.value,
        "payment_status": "UNPAID",
        "tiempos": {
            "creacion": now.isoformat(),
            "ultimo_cambio_estado": now.isoformat(),
            "fechas_estado": {OrderStatus.NEW.value: now.isoformat()},
        },
        "errores_validacion": [], "secciones": [], "importada": False,
        "origen": "automation", "qr_token": str(uuid.uuid4()),
        "created_at": now.isoformat(), "updated_at": now.isoformat(),
    }
    await db.orders.insert_one(order)
    await db.customers.update_one(
        {"id": customer["customer_id"]},
        {"$inc": {"total_orders": 1}, "$set": {"last_order_date": now.isoformat()}},
    )
    await db.audit_log.insert_one({
        "id": str(uuid.uuid4()), "event_type": "ORDER_CREATED", "entity_type": "order",
        "entity_id": order_id,
        "details": {"customer_id": customer["customer_id"], "pickup_date": data.pickup_date},
        "user": "automation", "timestamp": now.isoformat(),
    })
    await db.eventos_automation.insert_one({
        "id": str(uuid.uuid4()), "tipo": "ORDER_CREATED", "entity_id": order["id"],
        "payload": {"order_number": order_id, "service_type": order["service_type"]},
        "created_at": now.isoformat(),
    })
    return order


# ==================== WORKFLOW 10: QUOTE CREATE ====================

async def create_quote(data: IngestData, customer: Dict, ingest_id: str) -> Dict:
    now = datetime.now(timezone.utc)
    date_str = now.strftime("%Y%m%d")
    today_count = await db.quotes.count_documents({"quote_id": {"$regex": f"^QOT-{date_str}"}})
    quote_id = f"QOT-{date_str}-{str(today_count + 1).zfill(4)}"
    quote = {
        "id": str(uuid.uuid4()), "quote_id": quote_id,
        "customer_id": customer["customer_id"], "ingest_id": ingest_id,
        "company_name": data.company_name or data.company_legal_name,
        "contact_name": customer.get("name"), "contact_email": customer.get("email"),
        "contact_phone": customer.get("phone"), "industry": data.industry,
        "estimated_volume": data.estimated_volume,
        "service_type": data.service_type or data.type_of_service,
        "message": data.message, "status": "NEW",
        "follow_up_date": (now + timedelta(days=2)).isoformat(),
        "created_at": now.isoformat(), "updated_at": now.isoformat(),
    }
    await db.quotes.insert_one(quote)
    await db.audit_log.insert_one({
        "id": str(uuid.uuid4()), "event_type": "QUOTE_CREATED", "entity_type": "quote",
        "entity_id": quote_id,
        "details": {"company": data.company_name, "customer_id": customer["customer_id"]},
        "user": "automation", "timestamp": now.isoformat(),
    })
    return quote


# ==================== WORKFLOW 9: TICKET CREATE ====================

async def create_ticket(data: IngestData, customer: Dict, ingest_id: str) -> Dict:
    now = datetime.now(timezone.utc)
    date_str = now.strftime("%Y%m%d")
    today_count = await db.tickets.count_documents({"ticket_id": {"$regex": f"^TKT-{date_str}"}})
    ticket_id = f"TKT-{date_str}-{str(today_count + 1).zfill(4)}"
    content = " ".join(filter(None, [data.subject, data.message, data.issue_description, data.what_is_this_regarding]))
    priority = detect_ticket_priority(content)
    sla_deadline = get_sla_deadline(priority)
    ticket = {
        "id": str(uuid.uuid4()), "ticket_id": ticket_id,
        "customer_id": customer["customer_id"], "customer_name": customer.get("name"),
        "customer_email": customer.get("email"), "customer_phone": customer.get("phone"),
        "ingest_id": ingest_id,
        "subject": data.subject or data.what_is_this_regarding or "Support Request",
        "description": data.message or data.issue_description,
        "category": data.what_is_this_regarding, "priority": priority.value,
        "status": "OPEN", "sla_deadline": sla_deadline.isoformat(),
        "created_at": now.isoformat(), "updated_at": now.isoformat(),
    }
    await db.tickets.insert_one(ticket)
    await db.audit_log.insert_one({
        "id": str(uuid.uuid4()), "event_type": "TICKET_CREATED", "entity_type": "ticket",
        "entity_id": ticket_id,
        "details": {"priority": priority.value, "sla_deadline": sla_deadline.isoformat()},
        "user": "automation", "timestamp": now.isoformat(),
    })
    return ticket


# ==================== WORKFLOW 5: PREFERENCES ====================

async def save_preferences(data: IngestData, customer: Dict, ingest_id: str) -> Dict:
    now = datetime.now(timezone.utc).isoformat()
    existing_count = await db.customer_preferences.count_documents({"customer_id": customer["customer_id"]})
    version = f"v{existing_count + 1}"
    preferences = {
        "id": str(uuid.uuid4()),
        "preferences_id": f"PREF-{customer['customer_id']}-{version}",
        "customer_id": customer["customer_id"], "ingest_id": ingest_id,
        "version": version, "fabric_softener": data.fabric_softener,
        "detergent_preference": data.detergent_preference,
        "special_instructions": data.special_instructions,
        "gate_code": data.gate_code, "is_current": True, "created_at": now,
    }
    await db.customer_preferences.update_many(
        {"customer_id": customer["customer_id"]}, {"$set": {"is_current": False}}
    )
    await db.customer_preferences.insert_one(preferences)
    return preferences


# ==================== LEAD CREATE ====================

async def create_lead(data: IngestData, customer: Dict, ingest_id: str) -> Dict:
    now = datetime.now(timezone.utc)
    date_str = now.strftime("%Y%m%d")
    today_count = await db.leads.count_documents({"lead_id": {"$regex": f"^LEAD-{date_str}"}})
    lead_id = f"LEAD-{date_str}-{str(today_count + 1).zfill(4)}"
    lead = {
        "id": str(uuid.uuid4()), "lead_id": lead_id,
        "customer_id": customer["customer_id"], "ingest_id": ingest_id,
        "name": customer.get("name"), "email": customer.get("email"),
        "phone": customer.get("phone"), "source": data.source_form or "Website",
        "interest_type": data.type_of_service, "message": data.message,
        "status": "NEW", "created_at": now.isoformat(), "updated_at": now.isoformat(),
    }
    await db.leads.insert_one(lead)
    return lead


# ==================== WORKFLOW 7: CALENDAR ====================

async def create_calendar_event(order: Dict):
    now = datetime.now(timezone.utc)
    event = {
        "id": str(uuid.uuid4()), "order_id": order["order_id"],
        "title": f"Pickup - {order['order_id']} - {order.get('customer_name', 'Customer')}",
        "event_type": "PICKUP", "date": order.get("pickup_date"),
        "time": order.get("pickup_time"), "location": order.get("pickup_address"),
        "notes": order.get("special_instructions"), "gate_code": order.get("gate_code"),
        "customer_phone": order.get("customer_phone"),
        "status": "SCHEDULED", "created_at": now.isoformat(),
    }
    await db.calendar_events.insert_one(event)
    return event


# ==================== WORKFLOW 8: NOTIFICATIONS ====================

async def send_notifications(result: ProcessedResult, data: IngestData, customer: Dict):
    now = datetime.now(timezone.utc)
    notifications = []
    if customer.get("email"):
        notifications.append({
            "id": str(uuid.uuid4()), "type": "EMAIL",
            "recipient": customer["email"], "recipient_name": customer.get("name"),
            "subject": get_notification_subject(result.route_result, result.created_entity_id),
            "template": result.route_result.value.lower(),
            "entity_type": result.created_entity_type,
            "entity_id": result.created_entity_id,
            "status": "PENDING", "created_at": now.isoformat(),
        })
    notifications.append({
        "id": str(uuid.uuid4()), "type": "INTERNAL",
        "recipient": "operations@venturafreshlaundry.com",
        "subject": f"New {result.created_entity_type}: {result.created_entity_id}",
        "template": "internal_alert",
        "entity_type": result.created_entity_type, "entity_id": result.created_entity_id,
        "status": "PENDING", "created_at": now.isoformat(),
    })
    if notifications:
        await db.notification_queue.insert_many(notifications)
    result.notifications_sent = [n["id"] for n in notifications]

def get_notification_subject(route: RouteResult, entity_id: str) -> str:
    subjects = {
        RouteResult.ORDER: f"Pickup Request Received - {entity_id}",
        RouteResult.QUOTE: f"Quote Request Received - {entity_id}",
        RouteResult.SUPPORT: f"Support Request Received - {entity_id}",
        RouteResult.LEAD: "Thank you for contacting Ventura Fresh Laundry",
        RouteResult.PREFERENCES: "Your preferences have been saved",
    }
    return subjects.get(route, "Thank you for contacting us")


# ==================== WORKFLOW 12: DAILY SUMMARY ====================

@automation_router.get("/daily-summary")
async def get_daily_summary():
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    new_orders_today = await db.orders.count_documents({"created_at": {"$gte": today_start.isoformat()}})
    pickups_today = await db.orders.count_documents({"pickup_date": now.strftime("%Y-%m-%d")})
    unassigned_orders = await db.orders.count_documents({"status": {"$in": ["NEW", "new"]}})
    open_tickets = await db.tickets.count_documents({"status": {"$in": ["OPEN", "open"]}})
    high_priority_tickets = await db.tickets.count_documents({"status": {"$in": ["OPEN", "open"]}, "priority": {"$in": ["HIGH", "high"]}})
    sla_at_risk = await db.tickets.count_documents({
        "status": {"$in": ["OPEN", "open"]},
        "sla_deadline": {"$lte": (now + timedelta(hours=2)).isoformat()},
    })
    quotes_pending_followup = await db.quotes.count_documents({
        "status": {"$in": ["NEW", "new"]},
        "follow_up_date": {"$lte": now.isoformat()},
    })
    new_leads_today = await db.leads.count_documents({"created_at": {"$gte": today_start.isoformat()}})
    return {
        "generated_at": now.isoformat(),
        "orders": {"new_today": new_orders_today, "pickups_today": pickups_today, "unassigned": unassigned_orders},
        "tickets": {"open": open_tickets, "high_priority": high_priority_tickets, "sla_at_risk": sla_at_risk},
        "quotes": {"pending_followup": quotes_pending_followup},
        "leads": {"new_today": new_leads_today},
    }


# ==================== SLA MONITOR ====================

@automation_router.get("/sla-alerts")
async def get_sla_alerts():
    now = datetime.now(timezone.utc)
    past_sla = await db.tickets.find({
        "status": {"$in": ["OPEN", "open"]},
        "sla_deadline": {"$lt": now.isoformat()},
    }, {"_id": 0}).to_list(50)
    approaching = await db.tickets.find({
        "status": {"$in": ["OPEN", "open"]},
        "sla_deadline": {"$gte": now.isoformat(), "$lte": (now + timedelta(hours=2)).isoformat()},
    }, {"_id": 0}).to_list(50)
    return {
        "generated_at": now.isoformat(),
        "past_sla": past_sla,
        "approaching_sla": approaching,
        "total_at_risk": len(past_sla) + len(approaching),
    }


# ==================== OPERATOR DASHBOARD ====================

def _normalize_order_for_dashboard(order: Dict) -> Dict:
    status = normalize_status(order.get("status") or order.get("estado_actual"))
    service_type = order.get("service_type")
    return {
        "order_id": order.get("order_id") or order.get("order_number") or order.get("id"),
        "id": order.get("id"),
        "order_number": order.get("order_number") or order.get("order_id"),
        "status": status,
        "next_status": get_next_status(status, service_type),
        "action_label": get_action_label(status, service_type),
        "customer_name": order.get("customer_name"),
        "customer_phone": order.get("customer_phone"),
        "customer_email": order.get("customer_email"),
        "preferred_contact": order.get("preferred_contact"),
        "membership_plan": order.get("membership_plan"),
        "membership_status": order.get("membership_status"),
        "service_type": service_type,
        "pickup_date": order.get("pickup_date"),
        "pickup_time": order.get("pickup_time") or order.get("pickup_time_window"),
        "pickup_address": order.get("pickup_address"),
        "delivery_address": order.get("delivery_address") or order.get("pickup_address"),
        "gate_code": order.get("gate_code"),
        "preferences_id": order.get("preferences_id"),
        "preferences_snapshot": order.get("preferences_snapshot"),
        "special_instructions": order.get("special_instructions") or order.get("notes"),
        "estimated_lbs": order.get("estimated_lbs"),
        "actual_lbs": order.get("actual_lbs"),
        "total_amount": order.get("total_amount"),
        "payment_status": order.get("payment_status"),
        "payment_method": order.get("payment_method"),
        "amount_paid": order.get("amount_paid"),
        "change_due": order.get("change_due"),
        "recurrence": order.get("recurrence", "once"),
        "is_recurring": order.get("is_recurring", False),
        "recurrence_days": order.get("recurrence_days"),
        "recurrence_end_date": order.get("recurrence_end_date"),
        "recurrence_parent_id": order.get("recurrence_parent_id"),
        "created_at": order.get("created_at"),
    }

def _categorize_orders(normalized_orders: list, today: str) -> Dict:
    """
    Categoriza las órdenes normalizadas en diferentes listas para el dashboard.
    FIX: normaliza status a MAYÚSCULAS antes de comparar, y usa is_wash_fold_service
         para detectar el tipo de servicio correctamente.
    """
    PD_ACTIVE = {"PICKED_UP", "PROCESSING", "READY", "OUT_FOR_DELIVERY", "DELIVERED"}
    WF_READY = {"PROCESSING", "READY"}

    todays_pickups = []
    ready_for_delivery = []
    wash_fold_dropoffs = []
    wash_fold_ready = []

    for order in normalized_orders:
        # FIX: normalize_status ya devuelve MAYÚSCULAS
        status = normalize_status(order.get("status")) or "NEW"
        # FIX: usar is_wash_fold_service para detección robusta
        is_wf = is_wash_fold_service(order.get("service_type"))

        if is_wf:
            if status in WF_READY:
                wash_fold_ready.append(order)
            else:
                wash_fold_dropoffs.append(order)
        else:
            if status in PD_ACTIVE:
                ready_for_delivery.append(order)
            else:
                todays_pickups.append(order)

    pickups_remaining = sum(
        1 for o in normalized_orders
        if not is_wash_fold_service(o.get("service_type"))
        and o.get("pickup_date") == today
        and normalize_status(o.get("status")) not in {"PICKED_UP", "COMPLETED", "CANCELLED"}
    )
    processing_count = sum(
        1 for o in normalized_orders
        if normalize_status(o.get("status")) == "PROCESSING"
    )

    return {
        "todays_pickups": todays_pickups,
        "ready_for_delivery": ready_for_delivery,
        "wash_fold_dropoffs": wash_fold_dropoffs,
        "wash_fold_ready": wash_fold_ready,
        "pickups_remaining": pickups_remaining,
        "processing_count": processing_count,
    }

@automation_router.get("/operator-dashboard")
async def get_operator_dashboard():
    now = datetime.now(timezone.utc)
    today = now.strftime("%Y-%m-%d")
    # FIX: buscar en MAYÚSCULAS y minúsculas para compatibilidad con ambos endpoints
    active_orders = await db.orders.find(
        {"status": {"$nin": ["COMPLETED", "CANCELLED", "completed", "cancelled"]}}, {"_id": 0}
    ).sort("updated_at", -1).to_list(500)
    urgent_tickets = await db.tickets.find(
        {"status": {"$in": ["OPEN", "open"]}, "priority": {"$in": ["HIGH", "high"]}}, {"_id": 0}
    ).to_list(20)
    active_orders = await enrich_orders_with_customers(active_orders)
    normalized = [_normalize_order_for_dashboard(o) for o in active_orders]
    cats = _categorize_orders(normalized, today)
    return {
        "generated_at": now.isoformat(),
        "stats": {
            "pickups_remaining_today": cats["pickups_remaining"],
            "orders_in_processing": cats["processing_count"],
            "orders_ready": len(cats["ready_for_delivery"]),
            "urgent_tickets": len(urgent_tickets),
        },
        "todays_pickups": cats["todays_pickups"],
        "ready_for_delivery": cats["ready_for_delivery"],
        "wash_fold_dropoffs": cats["wash_fold_dropoffs"],
        "wash_fold_ready": cats["wash_fold_ready"],
        "urgent_tickets": urgent_tickets,
    }


# ==================== ORDER STATUS UPDATE (OPERATOR ACTION) ====================

@automation_router.put("/orders/{order_id}/status")
async def update_order_status(order_id: str, new_status: str, notes: Optional[str] = None):
    now = datetime.now(timezone.utc)
    status_value = normalize_status(new_status)  # MAYÚSCULAS

    valid_statuses = {s.value for s in OrderStatus}
    if status_value not in valid_statuses:
        raise HTTPException(status_code=400, detail="Invalid status")

    order = await db.orders.find_one(
        {"$or": [{"order_id": order_id}, {"id": order_id}, {"order_number": order_id}]}
    )
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    if is_wash_fold_service(order.get("service_type")):
        disallowed = {"PICKUP_SCHEDULED", "PICKED_UP", "OUT_FOR_DELIVERY", "DELIVERED"}
        if status_value in disallowed:
            raise HTTPException(status_code=400, detail="Invalid status for Wash & Fold")

    old_status = order.get("status")
    old_status_normalized = normalize_status(old_status) or "NEW"

    if status_value != old_status_normalized:
        if is_wash_fold_service(order.get("service_type")):
            expected_next = WASH_FOLD_NEXT_STATUS_BY_STATUS.get(old_status_normalized)
            if expected_next and status_value != expected_next:
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid Wash & Fold transition: {old_status_normalized} -> {status_value}. Expected: {expected_next}",
                )
        else:
            expected_next = PICKUP_NEXT_STATUS_BY_STATUS.get(old_status_normalized)
            if old_status_normalized == "DELIVERED" and status_value == "COMPLETED":
                expected_next = "COMPLETED"
            if expected_next and status_value != expected_next:
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid Pickup transition: {old_status_normalized} -> {status_value}. Expected: {expected_next}",
                )

    update_data = {
        "status": status_value,
        "estado_actual": status_value,
        "updated_at": now.isoformat(),
        "tiempos.ultimo_cambio_estado": now.isoformat(),
        f"tiempos.fechas_estado.{status_value}": now.isoformat(),
    }

    if status_value == OrderStatus.PICKED_UP.value:
        update_data["picked_up_at"] = now.isoformat()
    elif status_value == OrderStatus.DELIVERED.value:
        update_data["delivered_at"] = now.isoformat()
    elif status_value == OrderStatus.COMPLETED.value:
        update_data["completed_at"] = now.isoformat()

    await db.orders.update_one({"id": order.get("id")}, {"$set": update_data})

    await db.audit_log.insert_one({
        "id": str(uuid.uuid4()),
        "event_type": "ORDER_STATUS_CHANGED",
        "entity_type": "order",
        "entity_id": order_id,
        "details": {"old_status": old_status, "new_status": status_value, "notes": notes},
        "user": "operator",
        "timestamp": now.isoformat(),
    })

    await db.eventos_automation.insert_one({
        "id": str(uuid.uuid4()),
        "tipo": "ORDER_STATUS_CHANGED",
        "entity_id": order.get("id") or order_id,
        "payload": {"status": status_value, "source": "operator"},
        "created_at": now.isoformat(),
    })

    status_changed = old_status_normalized != status_value
    if status_changed:
        await db.orders.update_one(
            {"id": order.get("id")},
            {"$push": {"status_history": {
                "from": old_status_normalized,
                "to": status_value,
                "changed_by": "operator",
                "changed_at": now.isoformat(),
            }}},
        )

    if status_changed and NOTIFICATIONS_ENABLED and not SKIP_SERVER_NOTIFICATIONS and order.get("customer_id"):
        try:
            customer = await db.customers.find_one({"id": order.get("customer_id")}, {"_id": 0})
            if customer:
                order_for_notify = {
                    **order,
                    "status": status_value,
                    "preferred_contact": order.get("preferred_contact") or customer.get("preferred_contact"),
                }
                channel = resolve_notification_channel(customer, order_for_notify)
                notification_key = build_status_notification_key(status_value, channel)
                existing_keys = order.get("notification_events") or []
                if notification_key not in existing_keys:
                    sent = await notify_order_status_changed(customer, order_for_notify, status_value)
                    if sent:
                        await db.orders.update_one(
                            {"id": order.get("id")},
                            {"$addToSet": {"notification_events": notification_key}},
                        )
        except Exception as exc:
            logger.error(f"Operator notification failed: {exc}")

    await emit_realtime("notification", {
        "type": "order_status",
        "order_id": order.get("id") or order_id,
        "status": status_value,
    })
    await emit_realtime("dashboard", {
        "source": "operator",
        "order_id": order.get("id") or order_id,
    })

    if status_value in [OrderStatus.PICKED_UP.value, OrderStatus.CANCELLED.value]:
        await db.calendar_events.update_one(
            {"order_id": order_id},
            {"$set": {"status": "COMPLETED" if status_value == OrderStatus.PICKED_UP.value else "CANCELLED"}},
        )

    if order.get("customer_email"):
        await db.notification_queue.insert_one({
            "id": str(uuid.uuid4()),
            "type": "EMAIL",
            "recipient": order["customer_email"],
            "subject": f"Order Update - {order_id}",
            "template": f"order_{status_value.lower()}",
            "entity_type": "order",
            "entity_id": order_id,
            "status": "PENDING",
            "created_at": now.isoformat(),
        })

    if status_value in (OrderStatus.DELIVERED.value, OrderStatus.COMPLETED.value):
        order_id_str = order.get("id") or order_id
        try:
            asyncio.create_task(maybe_send_survey_after_delivery(order_id_str))
        except Exception as e:
            logger.error(f"Survey task failed for order {order_id_str}: {e}")
        try:
            asyncio.create_task(maybe_create_next_recurring_order(order_id_str))
        except Exception as e:
            logger.error(f"Recurrence task failed for order {order_id_str}: {e}")

    return {
        "order_id": order_id,
        "old_status": old_status,
        "new_status": status_value,
        "updated_at": now.isoformat(),
    }


# ==================== RECURRENCE AUTOMATION ====================

def _get_next_weekday_dates(from_date, weekday_names: List[str]) -> List:
    target_nums = sorted(set(WEEKDAY_MAP.get(d, 0) for d in weekday_names if d in WEEKDAY_MAP))
    results = []
    check = from_date + timedelta(days=1)
    for _ in range(21):
        if check.weekday() in target_nums and check not in results:
            results.append(check)
        if len(results) == len(target_nums):
            break
        check += timedelta(days=1)
    return results


async def _clone_order_for_next_pickup(parent_order: Dict, customer: Dict, next_date) -> Optional[Dict]:
    try:
        from utils import generate_order_number, create_audit_log
    except ImportError:
        logger.warning("utils not available for generate_order_number; using fallback")
        generate_order_number = None

    order_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()

    if generate_order_number:
        order_number = await generate_order_number()
    else:
        count = await db.orders.count_documents({})
        order_number = f"VFL-{str(count + 1).zfill(5)}"

    EXCLUDED = {
        "_id", "id", "order_number", "order_id",
        "created_at", "updated_at",
        "status", "estado_actual",
        "payment_status", "actual_lbs", "total_amount",
        "paid_at", "payment_method", "amount_paid",
        "change_due", "stripe_payment_intent_id",
        "delivered_at", "completed_at", "picked_up_at",
        "status_history", "notification_events",
        "tiempos", "secciones", "errores_validacion",
        "recurrence_parent_id",
    }

    new_order = {k: v for k, v in parent_order.items() if k not in EXCLUDED}

    # FIX: determinar el formato de status correcto según el origen de la orden padre
    # Si la orden padre viene de orders.py usa minúsculas; si viene de automation_engine usa MAYÚSCULAS.
    # Para consistencia usamos minúsculas (compatible con orders.py que es el endpoint principal).
    new_order.update({
        "id": order_id,
        "order_number": order_number,
        "order_id": order_number,
        "pickup_date": next_date.strftime("%Y-%m-%d"),
        "status": "new",
        "estado_actual": "new",
        "payment_status": "unpaid",
        "actual_lbs": None,
        "total_amount": None,
        "recurrence_parent_id": parent_order.get("id"),
        "is_recurring": True,
        "origen": "auto_recurrence",
        "tiempos": {
            "creacion": now,
            "ultimo_cambio_estado": now,
            "fechas_estado": {"new": now},
        },
        "secciones": [],
        "errores_validacion": [],
        "notification_events": [],
        "status_history": [],
        "created_at": now,
        "updated_at": now,
    })

    await db.orders.insert_one(new_order)
    await db.customers.update_one({"id": customer["id"]}, {"$inc": {"total_orders": 1}})
    await db.audit_log.insert_one({
        "id": str(uuid.uuid4()),
        "event_type": "ORDER_AUTO_CREATED",
        "entity_type": "order",
        "entity_id": order_id,
        "details": {
            "parent_order_id": parent_order.get("id"),
            "recurrence": parent_order.get("recurrence"),
            "pickup_date": next_date.strftime("%Y-%m-%d"),
        },
        "user": "automation",
        "timestamp": now,
    })
    await db.eventos_automation.insert_one({
        "id": str(uuid.uuid4()),
        "tipo": "ORDER_AUTO_CREATED",
        "entity_id": order_id,
        "payload": {
            "order_number": order_number,
            "parent_order_id": parent_order.get("id"),
            "recurrence": parent_order.get("recurrence"),
            "pickup_date": next_date.strftime("%Y-%m-%d"),
        },
        "created_at": now,
    })

    logger.info(
        f"✅ Auto-created recurring order {order_number} "
        f"for {next_date} (parent: {parent_order.get('order_number')})"
    )
    return new_order


async def _notify_next_pickup_scheduled(customer: Dict, new_order: Dict):
    try:
        from notifications import send_sms, send_email, detect_language
    except ImportError:
        logger.warning("notifications module not available")
        return

    name = customer.get("name", "")
    phone = customer.get("phone", "")
    email = customer.get("email", "")
    order_num = new_order.get("order_number", "")
    pickup_date = new_order.get("pickup_date", "")
    pickup_time = new_order.get("pickup_time_window") or new_order.get("pickup_time") or ""

    lang = detect_language(customer, phone)
    is_es = lang.lower().startswith("es")

    if is_es:
        msg = (
            f"🔄 ¡Hola {name}!\n\n"
            f"Tu próximo pickup fue agendado automáticamente:\n"
            f"📦 Orden: #{order_num}\n"
            f"📅 Fecha: {pickup_date}\n"
            f"⏰ Horario: {pickup_time or 'por confirmar'}\n\n"
            f"Ten tu ropa lista en bolsas. Escríbenos al (820) 234-8181 si necesitas cambios.\n\n"
            f"— Ventura Fresh Laundry"
        )
        subject = "Tu próximo pickup está agendado"
    else:
        msg = (
            f"🔄 Hi {name}!\n\n"
            f"Your next pickup has been automatically scheduled:\n"
            f"📦 Order: #{order_num}\n"
            f"📅 Date: {pickup_date}\n"
            f"⏰ Window: {pickup_time or 'to be confirmed'}\n\n"
            f"Please have your laundry in bags and ready to go. "
            f"Text us at (820) 234-8181 if you need any changes.\n\n"
            f"— Ventura Fresh Laundry"
        )
        subject = "Your next pickup is scheduled"

    preferred = customer.get("preferred_contact", "sms")
    try:
        if preferred == "email" and email:
            await send_email(email, subject, msg)
        elif preferred == "whatsapp" and phone:
            from notifications import send_whatsapp
            await send_whatsapp(phone, msg)
        elif phone:
            await send_sms(phone, msg)
        elif email:
            await send_email(email, subject, msg)
    except Exception as e:
        logger.error(f"Failed to notify customer {customer.get('id')} about next pickup: {e}")


async def _notify_recurrence_ended(customer: Dict, parent_order: Dict):
    try:
        from notifications import send_sms, send_email, detect_language
    except ImportError:
        return

    name = customer.get("name", "")
    phone = customer.get("phone", "")
    email = customer.get("email", "")
    pickup_url = f"{FRONTEND_URL}/schedule-pickup"
    lang = detect_language(customer, phone)
    is_es = lang.lower().startswith("es")

    if is_es:
        msg = (
            f"👋 ¡Hola {name}!\n\n"
            f"Tu programa de pickups recurrentes ha llegado a su fecha de fin. "
            f"¡Gracias por confiar en nosotros! 🧺\n\n"
            f"Si deseas continuar, agenda tu próximo pickup aquí:\n"
            f"👉 {pickup_url}\n\n"
            f"— Ventura Fresh Laundry"
        )
        subject = "Tu programa de pickups recurrentes ha finalizado"
    else:
        msg = (
            f"👋 Hi {name}!\n\n"
            f"Your recurring pickup schedule has reached its end date. "
            f"Thank you for being with us! 🧺\n\n"
            f"Ready to book again? Schedule your next pickup here:\n"
            f"👉 {pickup_url}\n\n"
            f"— Ventura Fresh Laundry"
        )
        subject = "Your recurring pickup schedule has ended"

    try:
        preferred = customer.get("preferred_contact", "sms")
        if preferred == "email" and email:
            await send_email(email, subject, msg)
        elif phone:
            await send_sms(phone, msg)
        elif email:
            await send_email(email, subject, msg)
    except Exception as e:
        logger.error(f"Failed to notify recurrence end for customer {customer.get('id')}: {e}")


async def _send_reschedule_reminder(customer: Dict, order: Dict):
    await asyncio.sleep(48 * 3600)

    recent_order = await db.orders.find_one({
        "customer_id": customer.get("id"),
        "status": {"$in": ["new", "confirmed", "pickup_scheduled", "NEW", "CONFIRMED", "PICKUP_SCHEDULED"]},
        "created_at": {"$gte": datetime.now(timezone.utc).isoformat()[:10]},
    })
    if recent_order:
        logger.info(f"Customer {customer.get('id')} already has a new order; skipping reschedule reminder.")
        return

    try:
        from notifications import send_sms, send_email, detect_language
    except ImportError:
        return

    name = customer.get("name", "")
    phone = customer.get("phone", "")
    email = customer.get("email", "")
    order_num = order.get("order_number", "")
    pickup_url = f"{FRONTEND_URL}/schedule-pickup"
    washfold_url = f"{FRONTEND_URL}/wash-fold"
    lang = detect_language(customer, phone)
    is_es = lang.lower().startswith("es")

    if is_es:
        msg = (
            f"👋 ¡Hola {name}!\n\n"
            f"Esperamos que hayas quedado satisfecho con tu servicio #{order_num}. "
            f"¿Ya se te acumuló la ropa? ¡Nosotros la lavamos por ti! 🧺✨\n\n"
            f"📅 Agenda tu próximo Pickup & Delivery:\n{pickup_url}\n\n"
            f"🏪 O trae tu ropa a la tienda (Wash & Fold):\n{washfold_url}\n\n"
            f"💡 ¿Sabías que con nuestra membresía desde $139/mes tienes pickups "
            f"recurrentes incluidos?\n\n"
            f"— Ventura Fresh Laundry · (820) 234-8181"
        )
        subject = "¿Listo para tu próximo servicio de lavandería?"
    else:
        msg = (
            f"👋 Hi {name}!\n\n"
            f"Hope you loved your last service #{order_num}! "
            f"Laundry piling up again? Let us handle it for you! 🧺✨\n\n"
            f"📅 Schedule your next Pickup & Delivery:\n{pickup_url}\n\n"
            f"🏪 Or drop off at our store (Wash & Fold):\n{washfold_url}\n\n"
            f"💡 Did you know? Our membership plans start at $139/month "
            f"and include recurring pickups!\n\n"
            f"— Ventura Fresh Laundry · (820) 234-8181"
        )
        subject = "Ready for your next laundry service?"

    try:
        preferred = customer.get("preferred_contact", "sms")
        if preferred == "email" and email:
            await send_email(email, subject, msg)
        elif preferred == "whatsapp" and phone:
            from notifications import send_whatsapp
            await send_whatsapp(phone, msg)
        elif phone:
            await send_sms(phone, msg)
        elif email:
            await send_email(email, subject, msg)
        logger.info(f"📨 Reschedule reminder sent to customer {customer.get('id')}")
    except Exception as e:
        logger.error(f"Failed to send reschedule reminder to {customer.get('id')}: {e}")


async def maybe_create_next_recurring_order(order_id: str):
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        logger.warning(f"maybe_create_next_recurring_order: order {order_id} not found")
        return

    # FIX: normalizar status para comparación sin importar mayúsculas/minúsculas
    status = normalize_status(order.get("status") or "") or ""
    if status not in ("DELIVERED", "COMPLETED"):
        return

    recurrence = (order.get("recurrence") or "once").strip().lower()
    customer_id = order.get("customer_id")
    if not customer_id:
        return

    customer = await db.customers.find_one({"id": customer_id}, {"_id": 0})
    if not customer:
        logger.warning(f"Customer {customer_id} not found for recurrence automation")
        return

    if recurrence == "once":
        logger.info(f"Order {order_id} is one-time; scheduling reschedule reminder.")
        asyncio.create_task(_send_reschedule_reminder(customer, order))
        return

    pickup_date_str = order.get("pickup_date")
    if not pickup_date_str:
        logger.warning(f"Order {order_id} has no pickup_date; cannot create recurring order.")
        return

    try:
        pickup_date = datetime.strptime(pickup_date_str, "%Y-%m-%d").date()
    except ValueError:
        logger.error(f"Invalid pickup_date format for order {order_id}: {pickup_date_str}")
        return

    next_dates = []

    if recurrence == "weekly":
        next_dates = [pickup_date + timedelta(days=7)]
    elif recurrence == "biweekly":
        next_dates = [pickup_date + timedelta(days=14)]
    elif recurrence == "twice_week":
        recurrence_days = order.get("recurrence_days") or []
        if len(recurrence_days) != 2:
            logger.error(f"Order {order_id} has twice_week but recurrence_days={recurrence_days}; skipping.")
            return
        next_dates = _get_next_weekday_dates(pickup_date, recurrence_days)
    else:
        logger.warning(f"Unknown recurrence type '{recurrence}' for order {order_id}; skipping.")
        return

    recurrence_end = order.get("recurrence_end_date")
    if recurrence_end:
        try:
            end_date = datetime.strptime(recurrence_end, "%Y-%m-%d").date()
            next_dates = [d for d in next_dates if d <= end_date]
        except ValueError:
            logger.warning(f"Invalid recurrence_end_date for order {order_id}: {recurrence_end}")

    if not next_dates:
        logger.info(f"Recurrence cycle ended for order {order_id}; notifying customer.")
        await _notify_recurrence_ended(customer, order)
        return

    for next_date in next_dates:
        next_date_str = next_date.strftime("%Y-%m-%d")
        existing = await db.orders.find_one({
            "recurrence_parent_id": order.get("id"),
            "pickup_date": next_date_str,
            "status": {"$nin": ["cancelled", "CANCELLED"]},
        })
        if existing:
            logger.info(f"Recurring order for {next_date_str} already exists (parent {order.get('id')}); skipping.")
            continue

        new_order = await _clone_order_for_next_pickup(order, customer, next_date)
        if new_order:
            await _notify_next_pickup_scheduled(customer, new_order)

    await _notify_admin_recurrence_created(customer, order, next_dates)


async def _notify_admin_recurrence_created(customer: Dict, parent_order: Dict, new_dates: List):
    try:
        from notifications import send_sms
        admin_phones = [
            os.environ.get("ADMIN_PHONE_1", "+18056262524"),
            os.environ.get("ADMIN_PHONE_2", "+18202348181"),
        ]
        recurrence = parent_order.get("recurrence", "")
        recurrence_label = {
            "weekly": "semanal", "biweekly": "quincenal", "twice_week": "2x semana"
        }.get(recurrence, recurrence)

        dates_str = ", ".join(d.strftime("%Y-%m-%d") for d in new_dates)
        msg = (
            f"🔄 AUTO-RECURRENCIA\n"
            f"👤 {customer.get('name', 'N/A')}\n"
            f"📞 {customer.get('phone', 'N/A')}\n"
            f"📋 Plan: {recurrence_label}\n"
            f"📅 Nuevas fechas: {dates_str}\n"
            f"📦 Orden padre: #{parent_order.get('order_number', 'N/A')}"
        )
        for phone in admin_phones:
            if phone and len(phone) >= 10:
                try:
                    await send_sms(phone, msg)
                except Exception as e:
                    logger.error(f"Admin recurrence SMS failed to {phone}: {e}")
    except Exception as e:
        logger.error(f"_notify_admin_recurrence_created failed: {e}")


# ==================== DAILY SCHEDULER: PICKUP REMINDERS ====================

async def send_upcoming_pickup_reminders():
    try:
        from notifications import send_sms, send_email, detect_language
    except ImportError:
        logger.warning("notifications not available for pickup reminders")
        return

    tomorrow = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")
    orders = await db.orders.find(
        {"pickup_date": tomorrow, "status": {"$in": [
            "new", "confirmed", "pickup_scheduled",
            "NEW", "CONFIRMED", "PICKUP_SCHEDULED",
        ]}},
        {"_id": 0},
    ).to_list(500)

    logger.info(f"📅 Sending pickup reminders for {tomorrow}: {len(orders)} orders")

    for order in orders:
        dedupe_key = f"pickup_reminder:{order.get('id')}:{tomorrow}"
        already_sent = await db.notification_dedupe.find_one({"key": dedupe_key})
        if already_sent:
            continue

        customer_id = order.get("customer_id")
        if not customer_id:
            continue
        customer = await db.customers.find_one({"id": customer_id}, {"_id": 0})
        if not customer:
            continue

        name = customer.get("name", "")
        phone = customer.get("phone", "")
        email = customer.get("email", "")
        order_num = order.get("order_number", "")
        pickup_time = order.get("pickup_time_window") or order.get("pickup_time") or ""
        pickup_address = order.get("pickup_address", "")
        recurrence = order.get("recurrence", "once")
        lang = detect_language(customer, phone)
        is_es = lang.lower().startswith("es")

        recurrence_note = ""
        if recurrence != "once":
            recurrence_labels = {
                "weekly": "semanal 🔄", "biweekly": "quincenal 🔄", "twice_week": "2x semana 🔄"
            }
            if is_es:
                recurrence_note = f"\n🔄 Este es tu servicio {recurrence_labels.get(recurrence, recurrence)}."
            else:
                recurrence_labels_en = {
                    "weekly": "weekly 🔄", "biweekly": "biweekly 🔄", "twice_week": "twice-a-week 🔄"
                }
                recurrence_note = f"\n🔄 This is your {recurrence_labels_en.get(recurrence, recurrence)} service."

        if is_es:
            msg = (
                f"🧺 ¡Mañana es tu día, {name}!\n\n"
                f"Tu pickup está programado para:\n"
                f"📦 Orden: #{order_num}\n"
                f"📅 Fecha: {tomorrow}\n"
                f"⏰ Horario: {pickup_time or 'por confirmar'}\n"
                f"📍 Dirección: {pickup_address or 'la registrada'}"
                f"{recurrence_note}\n\n"
                f"Por favor ten tu ropa lista en bolsas. "
                f"Escríbenos al (820) 234-8181 si necesitas cambios.\n\n"
                f"— Ventura Fresh Laundry"
            )
            subject = f"Recordatorio: tu pickup es mañana #{order_num}"
        else:
            msg = (
                f"🧺 Tomorrow is laundry day, {name}!\n\n"
                f"Your pickup is scheduled for:\n"
                f"📦 Order: #{order_num}\n"
                f"📅 Date: {tomorrow}\n"
                f"⏰ Window: {pickup_time or 'to be confirmed'}\n"
                f"📍 Address: {pickup_address or 'your registered address'}"
                f"{recurrence_note}\n\n"
                f"Please have your laundry ready in bags. "
                f"Text us at (820) 234-8181 if you need any changes.\n\n"
                f"— Ventura Fresh Laundry"
            )
            subject = f"Reminder: Your pickup is tomorrow #{order_num}"

        try:
            preferred = customer.get("preferred_contact", "sms")
            sent = False
            if preferred == "email" and email:
                sent = await send_email(email, subject, msg)
            elif preferred == "whatsapp" and phone:
                from notifications import send_whatsapp
                sent = await send_whatsapp(phone, msg)
            elif phone:
                sent = await send_sms(phone, msg)
            elif email:
                sent = await send_email(email, subject, msg)

            if sent:
                await db.notification_dedupe.update_one(
                    {"key": dedupe_key},
                    {"$setOnInsert": {"key": dedupe_key, "created_at": datetime.now(timezone.utc).isoformat()}},
                    upsert=True,
                )
                logger.info(f"📨 Pickup reminder sent to {name} for order {order_num}")
        except Exception as e:
            logger.error(f"Failed to send pickup reminder for order {order.get('id')}: {e}")


# ==================== DAILY SCHEDULER RUNNER ====================

async def run_daily_scheduler():
    logger.info("🕐 Daily scheduler started")
    try:
        await send_upcoming_pickup_reminders()
    except Exception as e:
        logger.error(f"send_upcoming_pickup_reminders failed: {e}")
    logger.info("✅ Daily scheduler completed")


async def daily_scheduler_loop():
    while True:
        try:
            await run_daily_scheduler()
        except Exception as e:
            logger.error(f"Daily scheduler loop error: {e}")
        await asyncio.sleep(86400)


# ==================== SURVEY AUTOMATION ====================

async def _send_survey_message(customer: dict, survey_link: str, orders_count: int):
    try:
        from notifications import send_sms, send_email
    except ImportError:
        return

    name = customer.get("name", "Cliente")
    phone = customer.get("phone")
    email = customer.get("email")
    preferred = customer.get("preferred_contact", "sms")

    msg = (
        f"🧼 Hola {name},\n\n"
        f"Ya has completado {orders_count} servicios con Ventura Fresh Laundry. "
        f"Tu opinión es muy valiosa para nosotros. ¿Podrías tomarte 2 minutos "
        f"para responder esta breve encuesta?\n\n"
        f"👉 {survey_link}\n\n"
        f"¡Gracias por confiar en nosotros!"
    )

    if preferred == "sms" and phone:
        await send_sms(phone, msg)
    elif preferred == "email" and email:
        await send_email(email, "Cuéntanos tu experiencia", msg)
    else:
        if phone:
            await send_sms(phone, msg)


async def maybe_send_survey_after_delivery(order_id: str):
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        return

    # FIX: normalizar status antes de comparar
    status = normalize_status(order.get("status") or "") or ""
    if status not in ("DELIVERED", "COMPLETED"):
        return

    customer_id = order.get("customer_id")
    if not customer_id:
        return

    customer = await db.customers.find_one({"id": customer_id}, {"_id": 0})
    if not customer:
        return

    completed_orders = await db.orders.count_documents({
        "customer_id": customer_id,
        "status": {"$in": ["delivered", "completed", "DELIVERED", "COMPLETED"]},
    })

    if completed_orders % 3 != 0:
        return

    survey = await db.customer_surveys.find_one({
        "customer_id": customer_id,
        "orders_count_at_send": completed_orders,
    })
    if survey:
        return

    survey_link = f"{FRONTEND_URL}/survey?cid={customer_id}&ordercount={completed_orders}"
    now = datetime.now(timezone.utc)
    survey_doc = {
        "id": str(uuid.uuid4()),
        "customer_id": customer_id,
        "orders_count_at_send": completed_orders,
        "status": "pending",
        "survey_link": survey_link,
        "created_at": now.isoformat(),
        "scheduled_at": (now + timedelta(hours=24)).isoformat(),
    }
    await db.customer_surveys.insert_one(survey_doc)
    asyncio.create_task(_delayed_survey_send(survey_doc, customer))


async def _delayed_survey_send(survey_doc: dict, customer: dict):
    scheduled_at = datetime.fromisoformat(survey_doc["scheduled_at"])
    now = datetime.now(timezone.utc)
    if scheduled_at > now:
        wait_seconds = (scheduled_at - now).total_seconds()
        await asyncio.sleep(wait_seconds)

    await _send_survey_message(customer, survey_doc["survey_link"], survey_doc["orders_count_at_send"])

    await db.customer_surveys.update_one(
        {"id": survey_doc["id"]},
        {"$set": {"status": "sent", "sent_at": datetime.now(timezone.utc).isoformat()}},
    )


async def survey_reminder_scheduler():
    while True:
        try:
            now = datetime.now(timezone.utc)
            seven_days_ago = now - timedelta(days=7)
            pending = await db.customer_surveys.find({
                "status": "sent",
                "sent_at": {"$lt": seven_days_ago.isoformat()},
                "reminded": {"$ne": True},
            }).to_list(100)
            for survey in pending:
                customer = await db.customers.find_one({"id": survey["customer_id"]})
                if customer:
                    await _send_survey_message(
                        customer, survey["survey_link"], survey["orders_count_at_send"]
                    )
                    await db.customer_surveys.update_one(
                        {"id": survey["id"]},
                        {"$set": {"reminded": True, "reminded_at": now.isoformat()}},
                    )
        except Exception as e:
            logger.error(f"survey_reminder_scheduler error: {e}")
        await asyncio.sleep(86400)
   
        