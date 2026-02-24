"""
Automation Engine - Core workflow logic for Ventura Fresh Laundry
This module implements all the automation logic that n8n will trigger via webhooks.
The operator only needs to update order status - everything else is automatic.
"""
from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel, Field
from typing import Optional, Dict, List, Any
from datetime import datetime, timezone, timedelta
from enum import Enum
import uuid
import re
import logging
import os

automation_router = APIRouter(prefix="/automation", tags=["Automation Engine"])
logger = logging.getLogger(__name__)

try:
    from notifications import notify_order_status_changed
    NOTIFICATIONS_ENABLED = True
except ImportError:
    NOTIFICATIONS_ENABLED = False
    logger.warning("Notification services not available")

SKIP_SERVER_NOTIFICATIONS = os.environ.get('SKIP_SERVER_NOTIFICATIONS', 'false').lower() == 'true'

# Database reference
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

STATUS_FLOW = [
    "NEW",
    "CONFIRMED",
    "PICKUP_SCHEDULED",
    "PICKED_UP",
    "PROCESSING",
    "READY",
    "OUT_FOR_DELIVERY",
    "DELIVERED",
    "COMPLETED"
]

STATUS_ACTION_LABELS = {
    "NEW": "Confirmar",
    "CONFIRMED": "Programar Pickup",
    "PICKUP_SCHEDULED": "Recogido",
    "PICKED_UP": "Procesar",
    "PROCESSING": "Listo",
    "READY": "Salir a Entregar",
    "OUT_FOR_DELIVERY": "Entregado",
    "DELIVERED": "Completar"
}

def normalize_status(value: Optional[str]):
    if not value:
        return None
    return value.upper()

def get_next_status(value: Optional[str]):
    if not value:
        return None
    value = normalize_status(value)
    if value not in STATUS_FLOW:
        return None
    index = STATUS_FLOW.index(value)
    if index < len(STATUS_FLOW) - 1:
        return STATUS_FLOW[index + 1]
    return None

async def enrich_orders_with_customers(orders: List[Dict]):
    customer_ids = {o.get("customer_id") for o in orders if o.get("customer_id")}
    if not customer_ids:
        return orders
    customers = await db.customers.find(
        {"$or": [{"id": {"$in": list(customer_ids)}}, {"customer_id": {"$in": list(customer_ids)}}]},
        {"_id": 0}
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
    """Raw form submission data from any source (Squarespace, website, etc.)"""
    # Identity fields
    name: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    
    # Address fields
    address: Optional[str] = None
    street_address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    zip_code: Optional[str] = None
    
    # Service fields
    service_type: Optional[str] = None
    type_of_service: Optional[str] = None
    pickup_date: Optional[str] = None
    pickup_time: Optional[str] = None
    dropoff_date: Optional[str] = None
    estimated_lbs: Optional[float] = None
    
    # B2B fields
    company_name: Optional[str] = None
    company_legal_name: Optional[str] = None
    industry: Optional[str] = None
    estimated_volume: Optional[str] = None
    
    # Support fields
    subject: Optional[str] = None
    message: Optional[str] = None
    issue_description: Optional[str] = None
    what_is_this_regarding: Optional[str] = None
    
    # Preferences fields
    fabric_softener: Optional[str] = None
    detergent_preference: Optional[str] = None
    special_instructions: Optional[str] = None
    gate_code: Optional[str] = None
    
    # Source tracking
    source_form: Optional[str] = None
    submitted_at: Optional[str] = None
    
    # Raw data for anything not mapped
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
    """Normalize email to lowercase and trim"""
    if not email:
        return None
    return email.lower().strip()

def normalize_phone(phone: Optional[str]) -> Optional[str]:
    """Normalize phone to E.164 format (US)"""
    if not phone:
        return None
    # Remove all non-digits
    digits = re.sub(r'\D', '', phone)
    # If 10 digits, add US country code
    if len(digits) == 10:
        return f"+1{digits}"
    elif len(digits) == 11 and digits.startswith('1'):
        return f"+{digits}"
    return digits

def normalize_name(name: Optional[str], first: Optional[str] = None, last: Optional[str] = None) -> str:
    """Normalize name from various inputs"""
    if name:
        return name.strip().title()
    if first and last:
        return f"{first.strip().title()} {last.strip().title()}"
    if first:
        return first.strip().title()
    if last:
        return last.strip().title()
    return "Unknown"

def generate_dedup_key(email: Optional[str], phone: Optional[str], source: Optional[str], timestamp: Optional[str]) -> str:
    """Generate deduplication key"""
    parts = []
    if email:
        parts.append(normalize_email(email))
    elif phone:
        parts.append(normalize_phone(phone))
    parts.append(source or "unknown")
    parts.append(timestamp or datetime.now(timezone.utc).isoformat()[:19])
    return "|".join(parts)

def detect_route(data: IngestData) -> RouteResult:
    """Auto-classify the submission into the appropriate route"""
    source = (data.source_form or "").upper()
    
    # Check for pickup request indicators
    if any([
        "PICKUP" in source,
        data.pickup_date,
        data.pickup_time,
        data.type_of_service and "pickup" in data.type_of_service.lower(),
        data.service_type and "pickup" in data.service_type.lower()
    ]):
        return RouteResult.ORDER
    
    # Check for B2B/Quote indicators
    if any([
        "QUOTE" in source or "B2B" in source or "COMMERCIAL" in source,
        data.company_name,
        data.company_legal_name,
        data.industry,
        data.type_of_service and "comercial" in data.type_of_service.lower()
    ]):
        return RouteResult.QUOTE
    
    # Check for support ticket indicators
    if any([
        "SUPPORT" in source or "FEEDBACK" in source or "ISSUE" in source,
        data.issue_description,
        data.what_is_this_regarding and any(kw in data.what_is_this_regarding.lower() for kw in ['issue', 'problem', 'complaint', 'feedback'])
    ]):
        return RouteResult.SUPPORT
    
    # Check for preferences
    if any([
        "PREFERENCE" in source,
        data.fabric_softener,
        data.detergent_preference
    ]):
        return RouteResult.PREFERENCES
    
    # Default to lead
    return RouteResult.LEAD

def detect_ticket_priority(text: str) -> TicketPriority:
    """Auto-detect ticket priority based on content"""
    text_lower = text.lower()
    
    high_keywords = ['urgent', 'refund', 'damaged', 'missing', 'complaint', 'lost', 'stolen', 'ruined', 'asap', 'immediately']
    medium_keywords = ['issue', 'problem', 'delay', 'late', 'wrong', 'error', 'incorrect']
    
    if any(kw in text_lower for kw in high_keywords):
        return TicketPriority.HIGH
    if any(kw in text_lower for kw in medium_keywords):
        return TicketPriority.MEDIUM
    return TicketPriority.LOW

def get_sla_deadline(priority: TicketPriority) -> datetime:
    """Get SLA deadline based on priority"""
    now = datetime.now(timezone.utc)
    if priority == TicketPriority.HIGH:
        return now + timedelta(hours=4)
    elif priority == TicketPriority.MEDIUM:
        return now + timedelta(hours=24)
    else:
        return now + timedelta(hours=72)


# ==================== WORKFLOW 1: GATEKEEPER ====================

@automation_router.post("/ingest", response_model=ProcessedResult)
async def process_ingest(data: IngestData, background_tasks: BackgroundTasks):
    """
    WORKFLOW 01: Gatekeeper - Main entry point for all form submissions.
    This is the single entry point that processes everything automatically.
    """
    now = datetime.now(timezone.utc)
    result = ProcessedResult(
        ingest_id=str(uuid.uuid4()),
        route_result=RouteResult.LEAD,
        notifications_sent=[],
        audit_entries=[],
        errors=[]
    )
    
    try:
        # Step 1: Normalize data
        normalized_email = normalize_email(data.email)
        normalized_phone = normalize_phone(data.phone)
        normalized_name = normalize_name(data.name, data.first_name, data.last_name)
        
        # Step 2: Generate dedup key and check for duplicates
        dedup_key = generate_dedup_key(normalized_email, normalized_phone, data.source_form, data.submitted_at)
        
        existing = await db.ingest_log.find_one({"dedup_key": dedup_key})
        if existing:
            result.route_result = RouteResult.ERROR_DUPLICATE
            result.errors.append(f"Duplicate submission detected: {existing.get('ingest_id')}")
            return result
        
        # Step 3: Validate required fields
        if not normalized_email and not normalized_phone:
            result.route_result = RouteResult.ERROR_INCOMPLETE
            result.errors.append("Missing email and phone - cannot process")
            # Still log it for review
            await db.ingest_log.insert_one({
                "ingest_id": result.ingest_id,
                "dedup_key": dedup_key,
                "route_result": result.route_result.value,
                "processed_flag": "ERROR",
                "error_notes": "Missing contact info",
                "raw_data": data.model_dump(),
                "created_at": now.isoformat()
            })
            return result
        
        # Step 4: Auto-classify route
        result.route_result = detect_route(data)
        
        # Step 5: Upsert customer
        customer = await upsert_customer(normalized_email, normalized_phone, normalized_name, data)
        result.customer_id = customer["customer_id"]
        result.audit_entries.append(f"Customer upserted: {customer['customer_id']}")
        
        # Step 6: Route to appropriate handler
        if result.route_result == RouteResult.ORDER:
            entity = await create_order(data, customer, result.ingest_id)
            result.created_entity_id = entity["order_id"]
            result.created_entity_type = "order"
            result.audit_entries.append(f"Order created: {entity['order_id']}")
            
            # Create calendar event
            if data.pickup_date:
                background_tasks.add_task(create_calendar_event, entity)
            
        elif result.route_result == RouteResult.QUOTE:
            entity = await create_quote(data, customer, result.ingest_id)
            result.created_entity_id = entity["quote_id"]
            result.created_entity_type = "quote"
            result.audit_entries.append(f"Quote created: {entity['quote_id']}")
            
        elif result.route_result == RouteResult.SUPPORT:
            entity = await create_ticket(data, customer, result.ingest_id)
            result.created_entity_id = entity["ticket_id"]
            result.created_entity_type = "ticket"
            result.audit_entries.append(f"Ticket created: {entity['ticket_id']}")
            
        elif result.route_result == RouteResult.PREFERENCES:
            entity = await save_preferences(data, customer, result.ingest_id)
            result.created_entity_id = entity["preferences_id"]
            result.created_entity_type = "preferences"
            result.audit_entries.append(f"Preferences saved: {entity['preferences_id']}")
            
        else:  # LEAD
            entity = await create_lead(data, customer, result.ingest_id)
            result.created_entity_id = entity["lead_id"]
            result.created_entity_type = "lead"
            result.audit_entries.append(f"Lead created: {entity['lead_id']}")
        
        # Step 7: Log to ingest_log
        await db.ingest_log.insert_one({
            "ingest_id": result.ingest_id,
            "dedup_key": dedup_key,
            "route_result": result.route_result.value,
            "processed_flag": "PROCESSED",
            "processed_at": now.isoformat(),
            "customer_id": result.customer_id,
            "created_entity_type": result.created_entity_type,
            "created_entity_id": result.created_entity_id,
            "normalized_email": normalized_email,
            "normalized_phone": normalized_phone,
            "normalized_name": normalized_name,
            "raw_data": data.model_dump(),
            "created_at": now.isoformat()
        })
        
        # Step 8: Audit log
        await db.audit_log.insert_one({
            "id": str(uuid.uuid4()),
            "event_type": "INGEST_PROCESSED",
            "entity_type": result.created_entity_type,
            "entity_id": result.created_entity_id,
            "details": {
                "ingest_id": result.ingest_id,
                "route_result": result.route_result.value,
                "customer_id": result.customer_id
            },
            "user": "automation",
            "timestamp": now.isoformat()
        })
        
        # Step 9: Queue notifications
        background_tasks.add_task(send_notifications, result, data, customer)
        
        return result
        
    except Exception as e:
        logger.error(f"Error processing ingest: {e}")
        result.errors.append(str(e))
        return result


# ==================== WORKFLOW 4: CUSTOMER UPSERT ====================

async def upsert_customer(email: Optional[str], phone: Optional[str], name: str, data: IngestData) -> Dict:
    """Upsert customer - create if not exists, update if exists"""
    now = datetime.now(timezone.utc).isoformat()
    
    # Find existing customer
    query = []
    if email:
        query.append({"email": email})
    if phone:
        query.append({"phone": phone})
    
    existing = None
    if query:
        existing = await db.customers.find_one({"$or": query})
    
    if existing:
        # Update existing customer
        update_data = {
            "last_contact_at": now,
            "updated_at": now
        }
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
            {"$set": update_data, "$inc": {"total_submissions": 1}}
        )
        return {"customer_id": existing["id"], "is_new": False, **existing}
    
    # Create new customer
    customer_count = await db.customers.count_documents({})
    customer_id = f"CUST-{str(customer_count + 1).zfill(6)}"
    
    new_customer = {
        "id": customer_id,
        "customer_id": customer_id,
        "name": name,
        "email": email,
        "phone": phone,
        "default_address": data.address or data.street_address,
        "city": data.city,
        "state": data.state,
        "zip_code": data.zip_code,
        "status": "ACTIVE",
        "total_submissions": 1,
        "total_orders": 0,
        "created_at": now,
        "updated_at": now,
        "last_contact_at": now
    }
    
    await db.customers.insert_one(new_customer)
    return {"customer_id": customer_id, "is_new": True, **new_customer}


# ==================== WORKFLOW 6: ORDER CREATE ====================

async def create_order(data: IngestData, customer: Dict, ingest_id: str) -> Dict:
    """Create a new order from ingest data"""
    now = datetime.now(timezone.utc)
    
    # Generate order ID
    date_str = now.strftime("%Y%m%d")
    today_count = await db.orders.count_documents({"order_id": {"$regex": f"^ORD-{date_str}"}})
    order_id = f"ORD-{date_str}-{str(today_count + 1).zfill(4)}"
    
    # Build full address
    address_parts = [data.address or data.street_address]
    if data.city:
        address_parts.append(data.city)
    if data.state:
        address_parts.append(data.state)
    if data.zip_code:
        address_parts.append(data.zip_code)
    full_address = ", ".join(filter(None, address_parts))
    
    order = {
        "id": str(uuid.uuid4()),
        "order_id": order_id,
        "order_number": order_id,
        "customer_id": customer["customer_id"],
        "customer_name": customer.get("name", "Unknown"),
        "customer_email": customer.get("email"),
        "customer_phone": customer.get("phone"),
        "ingest_id": ingest_id,
        "service_type": data.service_type or data.type_of_service or "Standard",
        "estimated_lbs": data.estimated_lbs,
        "pickup_address": full_address,
        "delivery_address": full_address,
        "pickup_date": data.pickup_date,
        "pickup_time": data.pickup_time,
        "dropoff_date": data.dropoff_date,
        "special_instructions": data.special_instructions,
        "gate_code": data.gate_code,
        "status": OrderStatus.NEW.value,
        "estado_actual": OrderStatus.NEW.value,
        "payment_status": "UNPAID",
        "tiempos": {
            "creacion": now.isoformat(),
            "ultimo_cambio_estado": now.isoformat(),
            "fechas_estado": {OrderStatus.NEW.value: now.isoformat()}
        },
        "errores_validacion": [],
        "secciones": [],
        "importada": False,
        "origen": "automation",
        "qr_token": str(uuid.uuid4()),
        "created_at": now.isoformat(),
        "updated_at": now.isoformat()
    }
    
    await db.orders.insert_one(order)
    
    # Update customer order count
    await db.customers.update_one(
        {"id": customer["customer_id"]},
        {"$inc": {"total_orders": 1}, "$set": {"last_order_date": now.isoformat()}}
    )
    
    # Audit log
    await db.audit_log.insert_one({
        "id": str(uuid.uuid4()),
        "event_type": "ORDER_CREATED",
        "entity_type": "order",
        "entity_id": order_id,
        "details": {"customer_id": customer["customer_id"], "pickup_date": data.pickup_date},
        "user": "automation",
        "timestamp": now.isoformat()
    })
    await db.eventos_automation.insert_one({
        "id": str(uuid.uuid4()),
        "tipo": "ORDER_CREATED",
        "entity_id": order["id"],
        "payload": {"order_number": order_id, "service_type": order["service_type"]},
        "created_at": now.isoformat()
    })
    
    return order


# ==================== WORKFLOW 10: QUOTE CREATE ====================

async def create_quote(data: IngestData, customer: Dict, ingest_id: str) -> Dict:
    """Create a B2B quote from ingest data"""
    now = datetime.now(timezone.utc)
    
    # Generate quote ID
    date_str = now.strftime("%Y%m%d")
    today_count = await db.quotes.count_documents({"quote_id": {"$regex": f"^QOT-{date_str}"}})
    quote_id = f"QOT-{date_str}-{str(today_count + 1).zfill(4)}"
    
    quote = {
        "id": str(uuid.uuid4()),
        "quote_id": quote_id,
        "customer_id": customer["customer_id"],
        "ingest_id": ingest_id,
        "company_name": data.company_name or data.company_legal_name,
        "contact_name": customer.get("name"),
        "contact_email": customer.get("email"),
        "contact_phone": customer.get("phone"),
        "industry": data.industry,
        "estimated_volume": data.estimated_volume,
        "service_type": data.service_type or data.type_of_service,
        "message": data.message,
        "status": "NEW",
        "follow_up_date": (now + timedelta(days=2)).isoformat(),
        "created_at": now.isoformat(),
        "updated_at": now.isoformat()
    }
    
    await db.quotes.insert_one(quote)
    
    # Audit log
    await db.audit_log.insert_one({
        "id": str(uuid.uuid4()),
        "event_type": "QUOTE_CREATED",
        "entity_type": "quote",
        "entity_id": quote_id,
        "details": {"company": data.company_name, "customer_id": customer["customer_id"]},
        "user": "automation",
        "timestamp": now.isoformat()
    })
    
    return quote


# ==================== WORKFLOW 9: TICKET CREATE ====================

async def create_ticket(data: IngestData, customer: Dict, ingest_id: str) -> Dict:
    """Create a support ticket from ingest data"""
    now = datetime.now(timezone.utc)
    
    # Generate ticket ID
    date_str = now.strftime("%Y%m%d")
    today_count = await db.tickets.count_documents({"ticket_id": {"$regex": f"^TKT-{date_str}"}})
    ticket_id = f"TKT-{date_str}-{str(today_count + 1).zfill(4)}"
    
    # Detect priority from content
    content = " ".join(filter(None, [data.subject, data.message, data.issue_description, data.what_is_this_regarding]))
    priority = detect_ticket_priority(content)
    sla_deadline = get_sla_deadline(priority)
    
    ticket = {
        "id": str(uuid.uuid4()),
        "ticket_id": ticket_id,
        "customer_id": customer["customer_id"],
        "customer_name": customer.get("name"),
        "customer_email": customer.get("email"),
        "customer_phone": customer.get("phone"),
        "ingest_id": ingest_id,
        "subject": data.subject or data.what_is_this_regarding or "Support Request",
        "description": data.message or data.issue_description,
        "category": data.what_is_this_regarding,
        "priority": priority.value,
        "status": "OPEN",
        "sla_deadline": sla_deadline.isoformat(),
        "created_at": now.isoformat(),
        "updated_at": now.isoformat()
    }
    
    await db.tickets.insert_one(ticket)
    
    # Audit log
    await db.audit_log.insert_one({
        "id": str(uuid.uuid4()),
        "event_type": "TICKET_CREATED",
        "entity_type": "ticket",
        "entity_id": ticket_id,
        "details": {"priority": priority.value, "sla_deadline": sla_deadline.isoformat()},
        "user": "automation",
        "timestamp": now.isoformat()
    })
    
    return ticket


# ==================== WORKFLOW 5: PREFERENCES ====================

async def save_preferences(data: IngestData, customer: Dict, ingest_id: str) -> Dict:
    """Save customer preferences"""
    now = datetime.now(timezone.utc)
    
    # Get version number
    existing_count = await db.customer_preferences.count_documents({"customer_id": customer["customer_id"]})
    version = f"v{existing_count + 1}"
    
    preferences = {
        "id": str(uuid.uuid4()),
        "preferences_id": f"PREF-{customer['customer_id']}-{version}",
        "customer_id": customer["customer_id"],
        "ingest_id": ingest_id,
        "version": version,
        "fabric_softener": data.fabric_softener,
        "detergent_preference": data.detergent_preference,
        "special_instructions": data.special_instructions,
        "gate_code": data.gate_code,
        "is_current": True,
        "created_at": now.isoformat()
    }
    
    # Mark previous versions as not current
    await db.customer_preferences.update_many(
        {"customer_id": customer["customer_id"]},
        {"$set": {"is_current": False}}
    )
    
    await db.customer_preferences.insert_one(preferences)
    
    return preferences


# ==================== LEAD CREATE ====================

async def create_lead(data: IngestData, customer: Dict, ingest_id: str) -> Dict:
    """Create a lead from ingest data"""
    now = datetime.now(timezone.utc)
    
    # Generate lead ID
    date_str = now.strftime("%Y%m%d")
    today_count = await db.leads.count_documents({"lead_id": {"$regex": f"^LEAD-{date_str}"}})
    lead_id = f"LEAD-{date_str}-{str(today_count + 1).zfill(4)}"
    
    lead = {
        "id": str(uuid.uuid4()),
        "lead_id": lead_id,
        "customer_id": customer["customer_id"],
        "ingest_id": ingest_id,
        "name": customer.get("name"),
        "email": customer.get("email"),
        "phone": customer.get("phone"),
        "source": data.source_form or "Website",
        "interest_type": data.type_of_service,
        "message": data.message,
        "status": "NEW",
        "created_at": now.isoformat(),
        "updated_at": now.isoformat()
    }
    
    await db.leads.insert_one(lead)
    
    return lead


# ==================== WORKFLOW 7: CALENDAR ====================

async def create_calendar_event(order: Dict):
    """Create calendar event for pickup (to be connected to Google Calendar)"""
    now = datetime.now(timezone.utc)
    
    event = {
        "id": str(uuid.uuid4()),
        "order_id": order["order_id"],
        "title": f"Pickup - {order['order_id']} - {order.get('customer_name', 'Customer')}",
        "event_type": "PICKUP",
        "date": order.get("pickup_date"),
        "time": order.get("pickup_time"),
        "location": order.get("pickup_address"),
        "notes": order.get("special_instructions"),
        "gate_code": order.get("gate_code"),
        "customer_phone": order.get("customer_phone"),
        "status": "SCHEDULED",
        "created_at": now.isoformat()
    }
    
    await db.calendar_events.insert_one(event)
    
    return event


# ==================== WORKFLOW 8: NOTIFICATIONS ====================

async def send_notifications(result: ProcessedResult, data: IngestData, customer: Dict):
    """Queue notifications to be sent"""
    now = datetime.now(timezone.utc)
    
    notifications = []
    
    # Customer confirmation email
    if customer.get("email"):
        notifications.append({
            "id": str(uuid.uuid4()),
            "type": "EMAIL",
            "recipient": customer["email"],
            "recipient_name": customer.get("name"),
            "subject": get_notification_subject(result.route_result, result.created_entity_id),
            "template": result.route_result.value.lower(),
            "entity_type": result.created_entity_type,
            "entity_id": result.created_entity_id,
            "status": "PENDING",
            "created_at": now.isoformat()
        })
    
    # Internal notification
    notifications.append({
        "id": str(uuid.uuid4()),
        "type": "INTERNAL",
        "recipient": "operations@venturafreshlaundry.com",
        "subject": f"New {result.created_entity_type}: {result.created_entity_id}",
        "template": "internal_alert",
        "entity_type": result.created_entity_type,
        "entity_id": result.created_entity_id,
        "status": "PENDING",
        "created_at": now.isoformat()
    })
    
    if notifications:
        await db.notification_queue.insert_many(notifications)
    
    result.notifications_sent = [n["id"] for n in notifications]

def get_notification_subject(route: RouteResult, entity_id: str) -> str:
    """Get email subject based on route type"""
    subjects = {
        RouteResult.ORDER: f"Pickup Request Received - {entity_id}",
        RouteResult.QUOTE: f"Quote Request Received - {entity_id}",
        RouteResult.SUPPORT: f"Support Request Received - {entity_id}",
        RouteResult.LEAD: "Thank you for contacting Ventura Fresh Laundry",
        RouteResult.PREFERENCES: "Your preferences have been saved"
    }
    return subjects.get(route, "Thank you for contacting us")


# ==================== WORKFLOW 12: DAILY SUMMARY ====================

@automation_router.get("/daily-summary")
async def get_daily_summary():
    """Generate daily operations summary"""
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    
    # Count orders
    new_orders_today = await db.orders.count_documents({
        "created_at": {"$gte": today_start.isoformat()}
    })
    
    pickups_today = await db.orders.count_documents({
        "pickup_date": now.strftime("%Y-%m-%d")
    })
    
    unassigned_orders = await db.orders.count_documents({
        "status": "NEW"
    })
    
    # Count tickets
    open_tickets = await db.tickets.count_documents({
        "status": "OPEN"
    })
    
    high_priority_tickets = await db.tickets.count_documents({
        "status": "OPEN",
        "priority": "HIGH"
    })
    
    sla_at_risk = await db.tickets.count_documents({
        "status": "OPEN",
        "sla_deadline": {"$lte": (now + timedelta(hours=2)).isoformat()}
    })
    
    # Count quotes
    quotes_pending_followup = await db.quotes.count_documents({
        "status": "NEW",
        "follow_up_date": {"$lte": now.isoformat()}
    })
    
    # Count leads
    new_leads_today = await db.leads.count_documents({
        "created_at": {"$gte": today_start.isoformat()}
    })
    
    return {
        "generated_at": now.isoformat(),
        "orders": {
            "new_today": new_orders_today,
            "pickups_today": pickups_today,
            "unassigned": unassigned_orders
        },
        "tickets": {
            "open": open_tickets,
            "high_priority": high_priority_tickets,
            "sla_at_risk": sla_at_risk
        },
        "quotes": {
            "pending_followup": quotes_pending_followup
        },
        "leads": {
            "new_today": new_leads_today
        }
    }


# ==================== SLA MONITOR ====================

@automation_router.get("/sla-alerts")
async def get_sla_alerts():
    """Get tickets that are approaching or past their SLA deadline"""
    now = datetime.now(timezone.utc)
    
    # Past SLA
    past_sla = await db.tickets.find({
        "status": "OPEN",
        "sla_deadline": {"$lt": now.isoformat()}
    }, {"_id": 0}).to_list(50)
    
    # Approaching SLA (within 2 hours)
    approaching = await db.tickets.find({
        "status": "OPEN",
        "sla_deadline": {
            "$gte": now.isoformat(),
            "$lte": (now + timedelta(hours=2)).isoformat()
        }
    }, {"_id": 0}).to_list(50)
    
    return {
        "generated_at": now.isoformat(),
        "past_sla": past_sla,
        "approaching_sla": approaching,
        "total_at_risk": len(past_sla) + len(approaching)
    }


# ==================== OPERATOR DASHBOARD ====================

@automation_router.get("/operator-dashboard")
async def get_operator_dashboard():
    """
    Dashboard for operator - shows only what they need to act on.
    The operator only needs to update order status.
    """
    now = datetime.now(timezone.utc)
    today = now.strftime("%Y-%m-%d")
    pickup_statuses = ["NEW", "CONFIRMED", "PICKUP_SCHEDULED", "PICKED_UP", "new", "confirmed", "pickup_scheduled", "picked_up"]
    ready_statuses = ["READY", "ready", "OUT_FOR_DELIVERY", "out_for_delivery", "DELIVERED", "delivered"]
    processing_statuses = ["PROCESSING", "processing"]
    
    todays_pickups = await db.orders.find({
        "pickup_date": today,
        "status": {"$in": pickup_statuses}
    }, {"_id": 0}).sort("pickup_time", 1).to_list(50)
    
    ready_for_delivery = await db.orders.find({
        "status": {"$in": ready_statuses}
    }, {"_id": 0}).to_list(50)
    
    urgent_tickets = await db.tickets.find({
        "status": {"$in": ["OPEN", "open"]},
        "priority": {"$in": ["HIGH", "high"]}
    }, {"_id": 0}).to_list(20)

    todays_pickups = await enrich_orders_with_customers(todays_pickups)
    ready_for_delivery = await enrich_orders_with_customers(ready_for_delivery)

    def normalize_order(order: Dict):
        status = normalize_status(order.get("status") or order.get("estado_actual"))
        order_id = order.get("order_id") or order.get("order_number") or order.get("id")
        pickup_time = order.get("pickup_time") or order.get("pickup_time_window")
        delivery_address = order.get("delivery_address") or order.get("pickup_address")
        return {
            "order_id": order_id,
            "id": order.get("id"),
            "order_number": order.get("order_number") or order.get("order_id"),
            "status": status,
            "next_status": get_next_status(status),
            "action_label": STATUS_ACTION_LABELS.get(status),
            "customer_name": order.get("customer_name"),
            "customer_phone": order.get("customer_phone"),
            "customer_email": order.get("customer_email"),
            "preferred_contact": order.get("preferred_contact"),
            "membership_plan": order.get("membership_plan"),
            "service_type": order.get("service_type"),
            "pickup_date": order.get("pickup_date"),
            "pickup_time": pickup_time,
            "pickup_address": order.get("pickup_address"),
            "delivery_address": delivery_address,
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
            "created_at": order.get("created_at")
        }

    todays_pickups = [normalize_order(order) for order in todays_pickups]
    ready_for_delivery = [normalize_order(order) for order in ready_for_delivery]
    
    stats = {
        "pickups_remaining_today": len([o for o in todays_pickups if o.get("status") != "PICKED_UP"]),
        "orders_in_processing": await db.orders.count_documents({"status": {"$in": processing_statuses}}),
        "orders_ready": len(ready_for_delivery),
        "urgent_tickets": len(urgent_tickets)
    }
    
    return {
        "generated_at": now.isoformat(),
        "stats": stats,
        "todays_pickups": todays_pickups,
        "ready_for_delivery": ready_for_delivery,
        "urgent_tickets": urgent_tickets
    }


# ==================== ORDER STATUS UPDATE (OPERATOR ACTION) ====================

@automation_router.put("/orders/{order_id}/status")
async def update_order_status(order_id: str, new_status: str, notes: Optional[str] = None):
    """
    Update order status - THIS IS THE ONLY THING THE OPERATOR NEEDS TO DO.
    The system handles everything else automatically.
    """
    now = datetime.now(timezone.utc)
    
    status_value = normalize_status(new_status)
    status_db = status_value.lower() if status_value else status_value
    valid_statuses = {s.value for s in OrderStatus}
    if status_value not in valid_statuses:
        raise HTTPException(status_code=400, detail="Invalid status")
    order = await db.orders.find_one({"$or": [{"order_id": order_id}, {"id": order_id}, {"order_number": order_id}]})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    old_status = order.get("status")
    
    update_data = {
        "status": status_db,
        "estado_actual": status_db,
        "updated_at": now.isoformat(),
        "tiempos.ultimo_cambio_estado": now.isoformat(),
        f"tiempos.fechas_estado.{status_db}": now.isoformat()
    }
    
    if status_value == OrderStatus.PICKED_UP.value:
        update_data["picked_up_at"] = now.isoformat()
    elif status_value == OrderStatus.DELIVERED.value:
        update_data["delivered_at"] = now.isoformat()
    elif status_value == OrderStatus.COMPLETED.value:
        update_data["completed_at"] = now.isoformat()
    
    await db.orders.update_one(
        {"id": order.get("id")},
        {"$set": update_data}
    )
    
    await db.audit_log.insert_one({
        "id": str(uuid.uuid4()),
        "event_type": "ORDER_STATUS_CHANGED",
        "entity_type": "order",
        "entity_id": order_id,
        "details": {
            "old_status": old_status,
            "new_status": status_value,
            "notes": notes
        },
        "user": "operator",
        "timestamp": now.isoformat()
    })
    await db.eventos_automation.insert_one({
        "id": str(uuid.uuid4()),
        "tipo": "ORDER_STATUS_CHANGED",
        "entity_id": order.get("id") or order_id,
        "payload": {"status": status_value, "source": "operator"},
        "created_at": now.isoformat()
    })

    if NOTIFICATIONS_ENABLED and not SKIP_SERVER_NOTIFICATIONS and order.get("customer_id"):
        try:
            customer = await db.customers.find_one({"id": order.get("customer_id")}, {"_id": 0})
            if customer:
                await notify_order_status_changed(customer, order, status_db)
        except Exception as exc:
            logger.error(f"Operator notification failed: {exc}")

    await emit_realtime("notification", {
        "type": "order_status",
        "order_id": order.get("id") or order_id,
        "status": status_db
    })
    await emit_realtime("dashboard", {"source": "operator", "order_id": order.get("id") or order_id})
    
    if status_value in [OrderStatus.PICKED_UP.value, OrderStatus.CANCELLED.value]:
        await db.calendar_events.update_one(
            {"order_id": order_id},
            {"$set": {"status": "COMPLETED" if status_value == OrderStatus.PICKED_UP.value else "CANCELLED"}}
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
            "created_at": now.isoformat()
        })

    if status_value == OrderStatus.OUT_FOR_DELIVERY.value and NOTIFICATIONS_ENABLED:
        customer = None
        customer_id = order.get("customer_id")
        if customer_id:
            customer = await db.customers.find_one(
                {"$or": [{"id": customer_id}, {"customer_id": customer_id}]},
                {"_id": 0}
            )
        if customer:
            order_for_notify = {
                **order,
                "order_number": order.get("order_number") or order.get("order_id"),
                "status": status_value.lower()
            }
            try:
                await notify_order_status_changed(customer, order_for_notify, status_value.lower())
            except Exception as e:
                logger.error(f"Notification failed: {e}")
    
    return {
        "order_id": order_id,
        "old_status": old_status,
        "new_status": status_value,
        "updated_at": now.isoformat()
    }
