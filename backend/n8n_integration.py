"""
n8n Integration Module for Ventura Fresh Laundry CRM
Provides webhooks and API endpoints for n8n automation workflows

Workflows supported:
01. Gatekeeper - Lock and track new ingest records
02. Normalize - Standardize data formats
03. Router - Route records to correct destinations
04. Customers Upsert - Create/update customers
05. Preferences Upsert - Version customer preferences
06. Order Create - Create orders with status tracking
07. Calendar Events - Integration ready
08. Notifications - Email/SMS triggers
09. Support Tickets - With auto-priority
10. B2B Quotes - Pipeline management
11. Document Management - Audit trail
12. Daily Summary - Reporting endpoints
"""

import os
import re
import uuid
import hmac
import hashlib
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any, List
from pydantic import BaseModel, Field, EmailStr
from fastapi import APIRouter, HTTPException, Header, Request, BackgroundTasks
import logging

logger = logging.getLogger(__name__)

# n8n Webhook secret for verification (set in .env)
N8N_WEBHOOK_SECRET = os.environ.get('N8N_WEBHOOK_SECRET', 'vfl-n8n-secret-2024')

# Create router for n8n endpoints
n8n_router = APIRouter(prefix="/n8n", tags=["n8n Integration"])

# ==================== MODELS ====================

class IngestRecord(BaseModel):
    """Raw ingest record from any source (Squarespace, forms, etc.)"""
    source_form: str = Field(..., description="Form source identifier")
    submitted_at: Optional[str] = None
    
    # Contact info
    name: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    
    # Address
    address: Optional[str] = None
    street: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    zip_code: Optional[str] = None
    
    # Service info
    service_type: Optional[str] = None
    pickup_date: Optional[str] = None
    pickup_time: Optional[str] = None
    delivery_date: Optional[str] = None
    estimated_lbs: Optional[float] = None
    
    # Business/B2B
    company_name: Optional[str] = None
    industry: Optional[str] = None
    
    # Support
    subject: Optional[str] = None
    message: Optional[str] = None
    issue_type: Optional[str] = None
    
    # Preferences
    detergent_preference: Optional[str] = None
    folding_style: Optional[str] = None
    special_instructions: Optional[str] = None
    
    # Meta
    raw_data: Optional[Dict[str, Any]] = None

class NormalizedRecord(BaseModel):
    """Normalized record after data cleaning"""
    ingest_id: str
    source_form: str
    submitted_at: str
    
    # Normalized contact
    primary_name: str
    primary_email: Optional[str] = None
    primary_phone: Optional[str] = None
    
    # Normalized address
    full_address: Optional[str] = None
    
    # Classification
    route_result: str  # ORDER, QUOTE, LEAD, SUPPORT, PREFERENCE, ERROR
    route_reason: Optional[str] = None
    
    # Linked IDs
    customer_id: Optional[str] = None
    order_id: Optional[str] = None
    quote_id: Optional[str] = None
    ticket_id: Optional[str] = None
    lead_id: Optional[str] = None

class CustomerUpsertRequest(BaseModel):
    """Request to create or update a customer"""
    email: Optional[str] = None
    phone: Optional[str] = None
    name: str
    address: Optional[str] = None
    preferred_contact: Optional[str] = "email"
    source: Optional[str] = "n8n"

class OrderCreateRequest(BaseModel):
    """Request to create an order"""
    customer_id: str
    service_type: str = "pickup_delivery"
    pickup_date: Optional[str] = None
    pickup_time_window: Optional[str] = None
    pickup_address: Optional[str] = None
    delivery_address: Optional[str] = None
    estimated_lbs: Optional[float] = None
    special_instructions: Optional[str] = None
    source: Optional[str] = "n8n"

class TicketCreateRequest(BaseModel):
    """Request to create a support ticket"""
    customer_id: Optional[str] = None
    customer_email: Optional[str] = None
    customer_name: Optional[str] = None
    subject: str
    description: str
    priority: Optional[str] = None  # Will be auto-calculated if not provided
    source: Optional[str] = "n8n"

class QuoteCreateRequest(BaseModel):
    """Request to create a B2B quote"""
    company_name: str
    contact_name: str
    email: str
    phone: Optional[str] = None
    industry: Optional[str] = None
    estimated_lbs: Optional[float] = None
    service_frequency: Optional[str] = None
    notes: Optional[str] = None
    source: Optional[str] = "n8n"

class LeadCreateRequest(BaseModel):
    """Request to create a lead"""
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    source_form: Optional[str] = None
    interest: Optional[str] = None
    notes: Optional[str] = None

class WebhookPayload(BaseModel):
    """Generic webhook payload from n8n"""
    event_type: str
    data: Dict[str, Any]
    timestamp: Optional[str] = None
    workflow_id: Optional[str] = None

# ==================== HELPER FUNCTIONS ====================

def normalize_email(email: str) -> str:
    """Normalize email to lowercase, trimmed"""
    if not email:
        return ""
    return email.lower().strip()

def normalize_phone(phone: str) -> str:
    """Normalize phone to digits only, E.164 format for US"""
    if not phone:
        return ""
    digits = re.sub(r'\D', '', phone)
    if len(digits) == 10:
        return f"+1{digits}"
    elif len(digits) == 11 and digits.startswith('1'):
        return f"+{digits}"
    return digits

def normalize_name(name: str = None, first: str = None, last: str = None) -> str:
    """Normalize name from various inputs"""
    if name:
        return name.strip().title()
    parts = []
    if first:
        parts.append(first.strip())
    if last:
        parts.append(last.strip())
    return ' '.join(parts).title() if parts else "Unknown"

def generate_dedup_key(email: str, phone: str, source: str, timestamp: str) -> str:
    """Generate deduplication key"""
    key_parts = [
        normalize_email(email) or "",
        normalize_phone(phone) or "",
        source or "",
        timestamp[:16] if timestamp else ""  # Use date+hour for dedup window
    ]
    return hashlib.md5("|".join(key_parts).encode()).hexdigest()

def classify_route(record: IngestRecord) -> tuple:
    """Classify record to determine routing destination"""
    source = (record.source_form or "").upper()
    service = (record.service_type or "").upper()
    subject = (record.subject or "").lower()
    message = (record.message or "").lower()
    
    # Order indicators
    order_keywords = ['pickup', 'delivery', 'wash', 'fold', 'laundry', 'order']
    if any(kw in source.lower() for kw in order_keywords):
        return "ORDER", "Source form indicates order request"
    if record.pickup_date or record.pickup_time:
        return "ORDER", "Has pickup date/time"
    if any(kw in service.lower() for kw in order_keywords):
        return "ORDER", "Service type indicates order"
    
    # Quote indicators
    quote_keywords = ['quote', 'b2b', 'commercial', 'business', 'corporate']
    if any(kw in source.lower() for kw in quote_keywords):
        return "QUOTE", "Source form indicates quote request"
    if record.company_name or record.industry:
        return "QUOTE", "Has business information"
    if record.estimated_lbs and record.estimated_lbs > 50:
        return "QUOTE", "Large volume indicates commercial"
    
    # Support indicators
    support_keywords = ['issue', 'problem', 'complaint', 'feedback', 'help', 'support', 'refund', 'damaged', 'missing']
    if any(kw in source.lower() for kw in support_keywords):
        return "SUPPORT", "Source form indicates support request"
    if any(kw in subject for kw in support_keywords):
        return "SUPPORT", "Subject indicates support request"
    if any(kw in message for kw in support_keywords):
        return "SUPPORT", "Message content indicates support request"
    
    # Preference indicators
    pref_keywords = ['preference', 'setting', 'detergent', 'folding']
    if any(kw in source.lower() for kw in pref_keywords):
        return "PREFERENCE", "Source form indicates preferences"
    if record.detergent_preference or record.folding_style:
        return "PREFERENCE", "Has preference data"
    
    # Default to Lead
    if record.email or record.phone:
        return "LEAD", "Contact info without specific service request"
    
    return "ERROR_INCOMPLETE", "Missing required data"

def calculate_ticket_priority(subject: str, description: str) -> str:
    """Auto-calculate ticket priority based on content"""
    text = f"{subject} {description}".lower()
    
    high_keywords = ['urgent', 'refund', 'damaged', 'missing', 'lost', 'complaint', 'lawsuit', 'lawyer', 'angry', 'furious']
    medium_keywords = ['issue', 'problem', 'wrong', 'incorrect', 'delay', 'late', 'waiting']
    
    if any(kw in text for kw in high_keywords):
        return "HIGH"
    if any(kw in text for kw in medium_keywords):
        return "MEDIUM"
    return "LOW"

def verify_n8n_signature(payload: bytes, signature: str) -> bool:
    """Verify webhook signature from n8n"""
    if not signature:
        return False
    expected = hmac.new(
        N8N_WEBHOOK_SECRET.encode(),
        payload,
        hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(signature, expected)

# ==================== Database reference (set in server.py) ====================
db = None

def set_database(database):
    """Set database reference from main server"""
    global db
    db = database

# ==================== WEBHOOK ENDPOINTS ====================

@n8n_router.post("/webhook/ingest")
async def webhook_ingest(record: IngestRecord, background_tasks: BackgroundTasks):
    """
    Webhook endpoint for new ingest records from Google Sheets/Squarespace
    This is the entry point for workflow 01_Gatekeeper
    """
    if not db:
        raise HTTPException(status_code=500, detail="Database not initialized")
    
    now = datetime.now(timezone.utc).isoformat()
    
    # Generate IDs
    ingest_id = str(uuid.uuid4())
    dedup_key = generate_dedup_key(
        record.email or "",
        record.phone or "",
        record.source_form,
        record.submitted_at or now
    )
    
    # Check for duplicates
    existing = await db.ingest_log.find_one({"dedup_key": dedup_key})
    if existing:
        return {
            "status": "duplicate",
            "ingest_id": existing.get("ingest_id"),
            "message": "Record already processed"
        }
    
    # Create ingest record with LOCKED status
    ingest_record = {
        "ingest_id": ingest_id,
        "dedup_key": dedup_key,
        "source_form": record.source_form,
        "submitted_at": record.submitted_at or now,
        "processed_flag": "LOCKED",
        "processed_at": now,
        "raw_data": record.dict(),
        "route_result": None,
        "route_id": None,
        "error_notes": None
    }
    
    await db.ingest_log.insert_one(ingest_record)
    
    # Log to audit
    await db.audit_log.insert_one({
        "id": str(uuid.uuid4()),
        "event_type": "INGEST_LOCKED",
        "entity_type": "ingest",
        "entity_id": ingest_id,
        "details": {"source_form": record.source_form, "dedup_key": dedup_key},
        "timestamp": now
    })
    
    return {
        "status": "locked",
        "ingest_id": ingest_id,
        "dedup_key": dedup_key,
        "message": "Record locked for processing"
    }

@n8n_router.post("/webhook/normalize")
async def webhook_normalize(ingest_id: str):
    """
    Normalize an ingest record
    Workflow 02_Normalize
    """
    if not db:
        raise HTTPException(status_code=500, detail="Database not initialized")
    
    record = await db.ingest_log.find_one({"ingest_id": ingest_id})
    if not record:
        raise HTTPException(status_code=404, detail="Ingest record not found")
    
    raw = record.get("raw_data", {})
    now = datetime.now(timezone.utc).isoformat()
    
    # Normalize data
    normalized = {
        "ingest_id": ingest_id,
        "source_form": record.get("source_form"),
        "submitted_at": record.get("submitted_at"),
        "primary_name": normalize_name(
            raw.get("name"),
            raw.get("first_name"),
            raw.get("last_name")
        ),
        "primary_email": normalize_email(raw.get("email", "")),
        "primary_phone": normalize_phone(raw.get("phone", "")),
        "full_address": raw.get("address") or f"{raw.get('street', '')} {raw.get('city', '')} {raw.get('state', '')} {raw.get('zip_code', '')}".strip(),
        "normalized_at": now
    }
    
    # Update ingest record
    await db.ingest_log.update_one(
        {"ingest_id": ingest_id},
        {"$set": {
            "normalized_data": normalized,
            "processed_flag": "NORMALIZED"
        }}
    )
    
    return {
        "status": "normalized",
        "ingest_id": ingest_id,
        "normalized": normalized
    }

@n8n_router.post("/webhook/route")
async def webhook_route(ingest_id: str):
    """
    Route an ingest record to the appropriate destination
    Workflow 03_Router
    """
    if not db:
        raise HTTPException(status_code=500, detail="Database not initialized")
    
    record = await db.ingest_log.find_one({"ingest_id": ingest_id})
    if not record:
        raise HTTPException(status_code=404, detail="Ingest record not found")
    
    raw = record.get("raw_data", {})
    now = datetime.now(timezone.utc).isoformat()
    
    # Create IngestRecord for classification
    ingest = IngestRecord(**raw)
    route_result, route_reason = classify_route(ingest)
    
    # Update with routing result
    await db.ingest_log.update_one(
        {"ingest_id": ingest_id},
        {"$set": {
            "route_result": route_result,
            "route_reason": route_reason,
            "routed_at": now,
            "processed_flag": "ROUTED"
        }}
    )
    
    # Log routing
    await db.audit_log.insert_one({
        "id": str(uuid.uuid4()),
        "event_type": "INGEST_ROUTED",
        "entity_type": "ingest",
        "entity_id": ingest_id,
        "details": {"route_result": route_result, "route_reason": route_reason},
        "timestamp": now
    })
    
    return {
        "status": "routed",
        "ingest_id": ingest_id,
        "route_result": route_result,
        "route_reason": route_reason
    }

# ==================== CRUD ENDPOINTS FOR N8N ====================

@n8n_router.post("/customers/upsert")
async def upsert_customer(request: CustomerUpsertRequest):
    """
    Create or update customer
    Workflow 04_Customers_Upsert
    """
    if not db:
        raise HTTPException(status_code=500, detail="Database not initialized")
    
    now = datetime.now(timezone.utc).isoformat()
    email = normalize_email(request.email) if request.email else None
    phone = normalize_phone(request.phone) if request.phone else None
    
    # Find existing customer
    existing = None
    if email:
        existing = await db.customers.find_one({"email": email})
    if not existing and phone:
        existing = await db.customers.find_one({"phone": phone})
    
    if existing:
        # Update existing
        update_data = {
            "name": request.name,
            "updated_at": now,
            "last_activity": now
        }
        if request.address:
            update_data["address"] = request.address
        if request.preferred_contact:
            update_data["preferred_contact"] = request.preferred_contact
        
        await db.customers.update_one(
            {"id": existing["id"]},
            {"$set": update_data}
        )
        
        return {
            "status": "updated",
            "customer_id": existing["id"],
            "is_new": False
        }
    else:
        # Create new
        customer_count = await db.customers.count_documents({})
        customer_id = f"CUST-{str(customer_count + 1).zfill(6)}"
        
        customer = {
            "id": customer_id,
            "name": request.name,
            "email": email,
            "phone": phone,
            "address": request.address,
            "preferred_contact": request.preferred_contact or "email",
            "status": "active",
            "total_orders": 0,
            "source": request.source,
            "created_at": now,
            "updated_at": now
        }
        
        await db.customers.insert_one(customer)
        
        # Audit log
        await db.audit_log.insert_one({
            "id": str(uuid.uuid4()),
            "event_type": "CUSTOMER_CREATED",
            "entity_type": "customer",
            "entity_id": customer_id,
            "details": {"source": request.source, "name": request.name},
            "timestamp": now
        })
        
        return {
            "status": "created",
            "customer_id": customer_id,
            "is_new": True
        }

@n8n_router.post("/orders/create")
async def create_order(request: OrderCreateRequest):
    """
    Create a new order
    Workflow 06_Order_Create
    """
    if not db:
        raise HTTPException(status_code=500, detail="Database not initialized")
    
    now = datetime.now(timezone.utc)
    
    # Generate order number
    date_str = now.strftime("%Y%m%d")
    today_count = await db.orders.count_documents({
        "created_at": {"$regex": f"^{now.strftime('%Y-%m-%d')}"}
    })
    order_number = f"ORD-{date_str}-{str(today_count + 1).zfill(4)}"
    order_id = str(uuid.uuid4())
    
    order = {
        "id": order_id,
        "order_number": order_number,
        "customer_id": request.customer_id,
        "service_type": request.service_type,
        "status": "new",
        "pickup_date": request.pickup_date,
        "pickup_time_window": request.pickup_time_window,
        "pickup_address": request.pickup_address,
        "delivery_address": request.delivery_address,
        "estimated_lbs": request.estimated_lbs,
        "actual_lbs": None,
        "total_amount": None,
        "payment_status": "unpaid",
        "special_instructions": request.special_instructions,
        "source": request.source,
        "created_at": now.isoformat(),
        "updated_at": now.isoformat()
    }
    
    await db.orders.insert_one(order)
    
    # Update customer order count
    await db.customers.update_one(
        {"id": request.customer_id},
        {
            "$inc": {"total_orders": 1},
            "$set": {"last_order_date": now.isoformat()}
        }
    )
    
    # Audit log
    await db.audit_log.insert_one({
        "id": str(uuid.uuid4()),
        "event_type": "ORDER_CREATED",
        "entity_type": "order",
        "entity_id": order_id,
        "details": {
            "order_number": order_number,
            "customer_id": request.customer_id,
            "service_type": request.service_type,
            "source": request.source
        },
        "timestamp": now.isoformat()
    })
    
    return {
        "status": "created",
        "order_id": order_id,
        "order_number": order_number
    }

@n8n_router.post("/tickets/create")
async def create_ticket(request: TicketCreateRequest):
    """
    Create a support ticket with auto-priority
    Workflow 09_Support_Ticket_Create
    """
    if not db:
        raise HTTPException(status_code=500, detail="Database not initialized")
    
    now = datetime.now(timezone.utc)
    
    # Auto-calculate priority if not provided
    priority = request.priority or calculate_ticket_priority(request.subject, request.description)
    
    # Generate ticket number
    ticket_count = await db.tickets.count_documents({})
    ticket_id = f"TKT-{str(ticket_count + 1).zfill(6)}"
    
    # Calculate SLA based on priority
    sla_hours = {"HIGH": 4, "MEDIUM": 24, "LOW": 72}.get(priority, 24)
    sla_due = (now + timedelta(hours=sla_hours)).isoformat()
    
    ticket = {
        "id": ticket_id,
        "ticket_number": ticket_id,
        "customer_id": request.customer_id,
        "customer_email": request.customer_email,
        "customer_name": request.customer_name,
        "subject": request.subject,
        "description": request.description,
        "status": "open",
        "priority": priority,
        "sla_due": sla_due,
        "assigned_to": None,
        "source": request.source,
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
        "details": {
            "subject": request.subject,
            "priority": priority,
            "sla_due": sla_due,
            "source": request.source
        },
        "timestamp": now.isoformat()
    })
    
    return {
        "status": "created",
        "ticket_id": ticket_id,
        "priority": priority,
        "sla_due": sla_due
    }

@n8n_router.post("/quotes/create")
async def create_quote(request: QuoteCreateRequest):
    """
    Create a B2B quote
    Workflow 10_B2B_Quote_Pipeline
    """
    if not db:
        raise HTTPException(status_code=500, detail="Database not initialized")
    
    now = datetime.now(timezone.utc)
    
    # Generate quote number
    quote_count = await db.quotes.count_documents({})
    quote_id = f"QTE-{str(quote_count + 1).zfill(6)}"
    
    # Calculate follow-up date (3 business days)
    follow_up = (now + timedelta(days=3)).isoformat()
    
    quote = {
        "id": quote_id,
        "quote_number": quote_id,
        "company_name": request.company_name,
        "contact_name": request.contact_name,
        "email": normalize_email(request.email),
        "phone": normalize_phone(request.phone) if request.phone else None,
        "industry": request.industry,
        "estimated_lbs": request.estimated_lbs,
        "service_frequency": request.service_frequency,
        "status": "new",
        "follow_up_date": follow_up,
        "assigned_to": None,
        "notes": request.notes,
        "source": request.source,
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
        "details": {
            "company_name": request.company_name,
            "industry": request.industry,
            "follow_up_date": follow_up,
            "source": request.source
        },
        "timestamp": now.isoformat()
    })
    
    return {
        "status": "created",
        "quote_id": quote_id,
        "follow_up_date": follow_up
    }

@n8n_router.post("/leads/create")
async def create_lead(request: LeadCreateRequest):
    """
    Create a lead
    Workflow 03_Router (for LEAD classification)
    """
    if not db:
        raise HTTPException(status_code=500, detail="Database not initialized")
    
    now = datetime.now(timezone.utc)
    
    # Generate lead ID
    lead_count = await db.leads.count_documents({})
    lead_id = f"LEAD-{str(lead_count + 1).zfill(6)}"
    
    lead = {
        "id": lead_id,
        "name": request.name,
        "email": normalize_email(request.email) if request.email else None,
        "phone": normalize_phone(request.phone) if request.phone else None,
        "source": request.source_form or "website",
        "status": "new",
        "interest": request.interest,
        "notes": request.notes,
        "created_at": now.isoformat(),
        "updated_at": now.isoformat()
    }
    
    await db.leads.insert_one(lead)
    
    return {
        "status": "created",
        "lead_id": lead_id
    }

# ==================== REPORTING ENDPOINTS ====================

@n8n_router.get("/reports/daily-summary")
async def get_daily_summary():
    """
    Get daily operations summary
    Workflow 12_Daily_Summary
    """
    if not db:
        raise HTTPException(status_code=500, detail="Database not initialized")
    
    now = datetime.now(timezone.utc)
    today = now.strftime("%Y-%m-%d")
    
    # Count orders
    orders_today = await db.orders.count_documents({
        "created_at": {"$regex": f"^{today}"}
    })
    orders_new = await db.orders.count_documents({"status": "new"})
    orders_processing = await db.orders.count_documents({"status": "processing"})
    
    # Count pickups today
    pickups_today = await db.orders.count_documents({
        "pickup_date": today,
        "status": {"$in": ["new", "confirmed"]}
    })
    
    # Count tickets
    tickets_open = await db.tickets.count_documents({"status": "open"})
    tickets_high = await db.tickets.count_documents({"status": "open", "priority": "HIGH"})
    
    # Count quotes needing follow-up
    quotes_pending = await db.quotes.count_documents({
        "status": "new",
        "follow_up_date": {"$lte": now.isoformat()}
    })
    
    # Count leads
    leads_new = await db.leads.count_documents({"status": "new"})
    
    return {
        "date": today,
        "generated_at": now.isoformat(),
        "orders": {
            "created_today": orders_today,
            "status_new": orders_new,
            "status_processing": orders_processing
        },
        "pickups": {
            "scheduled_today": pickups_today
        },
        "tickets": {
            "open_total": tickets_open,
            "high_priority": tickets_high
        },
        "quotes": {
            "needing_followup": quotes_pending
        },
        "leads": {
            "new": leads_new
        }
    }

@n8n_router.get("/reports/sla-alerts")
async def get_sla_alerts():
    """
    Get tickets approaching or past SLA
    Workflow 09_Support_Ticket_Create (SLA reminders)
    """
    if not db:
        raise HTTPException(status_code=500, detail="Database not initialized")
    
    now = datetime.now(timezone.utc).isoformat()
    soon = (datetime.now(timezone.utc) + timedelta(hours=2)).isoformat()
    
    # Past SLA
    past_sla = await db.tickets.find(
        {"status": "open", "sla_due": {"$lt": now}},
        {"_id": 0}
    ).to_list(50)
    
    # Approaching SLA (within 2 hours)
    approaching_sla = await db.tickets.find(
        {"status": "open", "sla_due": {"$gte": now, "$lte": soon}},
        {"_id": 0}
    ).to_list(50)
    
    return {
        "checked_at": now,
        "past_sla": past_sla,
        "approaching_sla": approaching_sla,
        "past_sla_count": len(past_sla),
        "approaching_sla_count": len(approaching_sla)
    }

@n8n_router.get("/reports/quote-followups")
async def get_quote_followups():
    """
    Get quotes needing follow-up
    Workflow 10_B2B_Quote_Pipeline
    """
    if not db:
        raise HTTPException(status_code=500, detail="Database not initialized")
    
    now = datetime.now(timezone.utc).isoformat()
    
    quotes_due = await db.quotes.find(
        {"status": "new", "follow_up_date": {"$lte": now}},
        {"_id": 0}
    ).to_list(50)
    
    return {
        "checked_at": now,
        "quotes_needing_followup": quotes_due,
        "count": len(quotes_due)
    }

# ==================== NOTIFICATION TRIGGERS ====================

@n8n_router.post("/notifications/trigger")
async def trigger_notification(
    event_type: str,
    entity_type: str,
    entity_id: str,
    recipient_email: Optional[str] = None,
    recipient_phone: Optional[str] = None
):
    """
    Trigger a notification (for n8n to call external email/SMS services)
    Workflow 08_Notifications
    """
    if not db:
        raise HTTPException(status_code=500, detail="Database not initialized")
    
    now = datetime.now(timezone.utc).isoformat()
    
    # Get entity data
    entity_data = None
    if entity_type == "order":
        entity_data = await db.orders.find_one({"id": entity_id}, {"_id": 0})
    elif entity_type == "ticket":
        entity_data = await db.tickets.find_one({"id": entity_id}, {"_id": 0})
    elif entity_type == "quote":
        entity_data = await db.quotes.find_one({"id": entity_id}, {"_id": 0})
    
    # Log notification request
    notification_log = {
        "id": str(uuid.uuid4()),
        "event_type": event_type,
        "entity_type": entity_type,
        "entity_id": entity_id,
        "recipient_email": recipient_email,
        "recipient_phone": recipient_phone,
        "status": "pending",
        "created_at": now
    }
    
    await db.notification_log.insert_one(notification_log)
    
    return {
        "status": "queued",
        "notification_id": notification_log["id"],
        "event_type": event_type,
        "entity_data": entity_data
    }

# ==================== CALENDAR INTEGRATION ====================

@n8n_router.get("/calendar/events")
async def get_calendar_events(
    start_date: str,
    end_date: str
):
    """
    Get orders for calendar integration
    Workflow 07_Calendar_Create
    """
    if not db:
        raise HTTPException(status_code=500, detail="Database not initialized")
    
    orders = await db.orders.find(
        {
            "pickup_date": {"$gte": start_date, "$lte": end_date},
            "status": {"$in": ["new", "confirmed", "processing"]}
        },
        {"_id": 0}
    ).to_list(100)
    
    # Format for calendar
    events = []
    for order in orders:
        # Get customer info
        customer = await db.customers.find_one({"id": order.get("customer_id")}, {"_id": 0})
        
        events.append({
            "id": order.get("id"),
            "title": f"Pickup - {order.get('order_number')} - {customer.get('name', 'Unknown') if customer else 'Unknown'}",
            "date": order.get("pickup_date"),
            "time": order.get("pickup_time_window"),
            "location": order.get("pickup_address"),
            "description": order.get("special_instructions"),
            "order_number": order.get("order_number"),
            "customer_name": customer.get("name") if customer else None,
            "customer_phone": customer.get("phone") if customer else None,
            "status": order.get("status")
        })
    
    return {
        "start_date": start_date,
        "end_date": end_date,
        "events": events,
        "count": len(events)
    }

# ==================== PROCESS FULL INGEST (ALL IN ONE) ====================

@n8n_router.post("/process/full")
async def process_full_ingest(record: IngestRecord):
    """
    Process a full ingest record through all steps:
    1. Gatekeeper (lock)
    2. Normalize
    3. Route
    4. Create entity (customer, order, quote, ticket, or lead)
    
    This is a convenience endpoint that runs the full pipeline
    """
    if not db:
        raise HTTPException(status_code=500, detail="Database not initialized")
    
    now = datetime.now(timezone.utc)
    results = {"steps": []}
    
    # Step 1: Gatekeeper
    ingest_id = str(uuid.uuid4())
    dedup_key = generate_dedup_key(
        record.email or "",
        record.phone or "",
        record.source_form,
        record.submitted_at or now.isoformat()
    )
    
    # Check duplicates
    existing = await db.ingest_log.find_one({"dedup_key": dedup_key})
    if existing:
        return {
            "status": "duplicate",
            "ingest_id": existing.get("ingest_id"),
            "message": "Record already processed"
        }
    
    await db.ingest_log.insert_one({
        "ingest_id": ingest_id,
        "dedup_key": dedup_key,
        "source_form": record.source_form,
        "submitted_at": record.submitted_at or now.isoformat(),
        "processed_flag": "LOCKED",
        "processed_at": now.isoformat(),
        "raw_data": record.dict()
    })
    results["steps"].append({"step": "gatekeeper", "status": "locked", "ingest_id": ingest_id})
    
    # Step 2: Normalize
    normalized_name = normalize_name(record.name, record.first_name, record.last_name)
    normalized_email = normalize_email(record.email or "")
    normalized_phone = normalize_phone(record.phone or "")
    full_address = record.address or f"{record.street or ''} {record.city or ''} {record.state or ''} {record.zip_code or ''}".strip()
    
    results["steps"].append({
        "step": "normalize",
        "status": "done",
        "name": normalized_name,
        "email": normalized_email,
        "phone": normalized_phone
    })
    
    # Step 3: Route
    route_result, route_reason = classify_route(record)
    
    await db.ingest_log.update_one(
        {"ingest_id": ingest_id},
        {"$set": {
            "route_result": route_result,
            "route_reason": route_reason,
            "processed_flag": "ROUTED"
        }}
    )
    results["steps"].append({"step": "route", "result": route_result, "reason": route_reason})
    
    # Step 4: Create appropriate entity
    entity_result = None
    
    if route_result == "ORDER":
        # Upsert customer first
        customer_result = await upsert_customer(CustomerUpsertRequest(
            email=normalized_email or None,
            phone=normalized_phone or None,
            name=normalized_name,
            address=full_address or None,
            source="n8n-auto"
        ))
        
        # Create order
        order_result = await create_order(OrderCreateRequest(
            customer_id=customer_result["customer_id"],
            service_type=record.service_type or "pickup_delivery",
            pickup_date=record.pickup_date,
            pickup_time_window=record.pickup_time,
            pickup_address=full_address,
            estimated_lbs=record.estimated_lbs,
            special_instructions=record.special_instructions or record.message,
            source="n8n-auto"
        ))
        entity_result = {"type": "order", **order_result, "customer": customer_result}
        
    elif route_result == "QUOTE":
        quote_result = await create_quote(QuoteCreateRequest(
            company_name=record.company_name or normalized_name,
            contact_name=normalized_name,
            email=normalized_email,
            phone=normalized_phone,
            industry=record.industry,
            estimated_lbs=record.estimated_lbs,
            notes=record.message,
            source="n8n-auto"
        ))
        entity_result = {"type": "quote", **quote_result}
        
    elif route_result == "SUPPORT":
        ticket_result = await create_ticket(TicketCreateRequest(
            customer_email=normalized_email,
            customer_name=normalized_name,
            subject=record.subject or "Support Request",
            description=record.message or record.issue_type or "No description provided",
            source="n8n-auto"
        ))
        entity_result = {"type": "ticket", **ticket_result}
        
    elif route_result == "LEAD":
        lead_result = await create_lead(LeadCreateRequest(
            name=normalized_name,
            email=normalized_email or None,
            phone=normalized_phone or None,
            source_form=record.source_form,
            interest=record.service_type,
            notes=record.message
        ))
        entity_result = {"type": "lead", **lead_result}
    
    results["steps"].append({"step": "create_entity", **entity_result} if entity_result else {"step": "create_entity", "status": "skipped"})
    
    # Update ingest with final result
    await db.ingest_log.update_one(
        {"ingest_id": ingest_id},
        {"$set": {
            "processed_flag": "COMPLETED",
            "route_id": entity_result.get("order_id") or entity_result.get("quote_id") or entity_result.get("ticket_id") or entity_result.get("lead_id") if entity_result else None,
            "completed_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    return {
        "status": "completed",
        "ingest_id": ingest_id,
        "route_result": route_result,
        "entity": entity_result,
        "steps": results["steps"]
    }
