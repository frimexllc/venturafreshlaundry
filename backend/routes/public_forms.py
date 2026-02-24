from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime, timezone
import uuid
import os

from normalization import (
    normalize_name,
    normalize_email,
    normalize_phone,
    normalize_address,
    normalize_spaces,
    normalize_preference_dict,
    normalize_yes_no
)
from notifications import notify_order_created, send_sms, normalize_preferred_contact


class PublicPickupRequest(BaseModel):
    name: str
    email: EmailStr
    phone: str
    address: str
    pickup_date: Optional[str] = None
    pickup_time: Optional[str] = None
    service_type: Optional[str] = "pickup_delivery"
    contact_method: Optional[str] = None
    notes: Optional[str] = None
    gate_code: Optional[str] = None


class PublicWashFoldRequest(BaseModel):
    name: str
    email: EmailStr
    phone: str
    address: str
    dropoff_date: Optional[str] = None
    dropoff_time: Optional[str] = None
    notes: Optional[str] = None
    contact_method: Optional[str] = None


class PublicContactRequest(BaseModel):
    name: str
    email: EmailStr
    phone: Optional[str] = None
    message: str
    subject: Optional[str] = "Contact Request"


class PublicQuoteRequest(BaseModel):
    company_name: str
    contact_name: str
    email: EmailStr
    phone: Optional[str] = None
    industry: Optional[str] = None
    estimated_lbs: Optional[float] = None
    message: Optional[str] = None


class PublicMembershipSignup(BaseModel):
    first_name: str
    last_name: str
    email: EmailStr
    phone: str
    contact_method: str
    address_line1: str
    address_line2: Optional[str] = None
    city: str
    state: str
    zip_code: str
    membership_plan: str
    laundry_frequency: str
    estimated_lbs: float
    detergent_type: Optional[str] = None
    water_temperature: Optional[str] = None
    fabric_softener: Optional[str] = None
    folding_style: Optional[str] = None
    hanging_instructions: Optional[str] = None
    allergies: Optional[str] = None
    special_instructions: Optional[str] = None
    pickup_time_preference: Optional[str] = None
    gate_code: Optional[str] = None


class B2BQuoteRequest(BaseModel):
    first_name: str
    last_name: str
    email: EmailStr
    phone: str
    contact_method: Optional[str] = None
    address_line1: str
    address_line2: Optional[str] = None
    city: str
    state: str
    zip_code: str
    job_title: Optional[str] = None
    service_type: str
    has_membership: str
    company_legal_name: Optional[str] = None
    dba_name: Optional[str] = None
    business_type: str
    laundry_frequency: str
    estimated_lbs: float
    best_date: str
    best_time: str
    additional_notes: Optional[str] = None
    subscribe_newsletter: Optional[bool] = False


def get_public_forms_router(
    db,
    generate_order_number,
    create_audit_log,
    emit_realtime,
    notifications_enabled: bool,
    skip_server_notifications: bool,
    logger
):
    router = APIRouter()

    @router.post("/public/pickup-request")
    async def public_pickup_request(data: PublicPickupRequest):
        now = datetime.now(timezone.utc).isoformat()

        normalized_name = normalize_name(data.name)
        normalized_email = normalize_email(data.email) or data.email.lower()
        normalized_phone = normalize_phone(data.phone)
        normalized_address = normalize_address(data.address)
        normalized_notes = normalize_spaces(data.notes)
        normalized_gate_code = normalize_spaces(data.gate_code)
        normalized_service_type = normalize_spaces(data.service_type).lower().replace(" ", "_") or "pickup_delivery"
        normalized_contact_raw = normalize_spaces(data.contact_method)
        preferred_contact = normalize_preferred_contact(normalized_contact_raw) if normalized_contact_raw else None

        customer = await db.customers.find_one({"email": normalized_email}, {"_id": 0})
        if not customer:
            customer_id = str(uuid.uuid4())
            customer = {
                "id": customer_id,
                "name": normalized_name or data.name,
                "email": normalized_email,
                "phone": normalized_phone or data.phone,
                "address": normalized_address or data.address,
                "preferred_contact": preferred_contact or "email",
                "notes": None,
                "status": "active",
                "total_orders": 0,
                "created_at": now,
                "updated_at": now
            }
            await db.customers.insert_one(customer)
            await create_audit_log("CUSTOMER_CREATED", "customer", customer_id, None, {"source": "public_form"})
        else:
            await db.customers.update_one(
                {"id": customer["id"]},
                {"$set": {
                    "name": normalized_name or customer.get("name"),
                    "phone": normalized_phone or customer.get("phone"),
                    "address": normalized_address or customer.get("address"),
                    **({"preferred_contact": preferred_contact} if preferred_contact else {}),
                    "updated_at": now
                }}
            )
            customer = {
                **customer,
                "name": normalized_name or customer.get("name"),
                "phone": normalized_phone or customer.get("phone"),
                "address": normalized_address or customer.get("address"),
                **({"preferred_contact": preferred_contact} if preferred_contact else {})
            }

        pref = await db.preferences.find({"customer_id": customer["id"]}, {"_id": 0}).sort("version", -1).limit(1).to_list(1)
        preference_id = pref[0].get("id") if pref else None
        preference_snapshot = None
        if pref:
            preference_snapshot = {k: v for k, v in pref[0].items() if k not in ["_id", "customer_id"]}

        order_id = str(uuid.uuid4())
        order_number = await generate_order_number()
        order = {
            "id": order_id,
            "order_number": order_number,
            "customer_id": customer["id"],
            "customer_name": customer["name"],
            "service_type": normalized_service_type,
            "pickup_date": data.pickup_date,
            "pickup_time_window": data.pickup_time,
            "pickup_address": normalized_address,
            "delivery_address": normalized_address,
            "estimated_lbs": None,
            "actual_lbs": None,
            "notes": normalized_notes,
            "gate_code": normalized_gate_code,
            "preferred_contact": preferred_contact,
            "preferences_id": preference_id,
            "preferences_snapshot": preference_snapshot,
            "status": "new",
            "estado_actual": "new",
            "payment_status": "unpaid",
            "total_amount": None,
            "origen": "pickup_request",
            "created_at": now,
            "updated_at": now
        }
        await db.orders.insert_one(order)
        await db.customers.update_one({"id": customer["id"]}, {"$inc": {"total_orders": 1}})
        await create_audit_log("ORDER_CREATED", "order", order_id, None, {"source": "public_form"})
        await emit_realtime("notification", {
            "type": "order_created",
            "order_id": order_id,
            "status": "new",
            "order_number": order_number
        })

        if notifications_enabled:
            try:
                await notify_order_created(customer, order)
            except Exception as e:
                logger.error(f"Notification failed: {e}")

        return {
            "success": True,
            "order_number": order_number,
            "message": "¡Gracias! Tu solicitud de pickup ha sido recibida. Te contactaremos pronto."
        }

    @router.post("/public/wash-fold-request")
    async def public_wash_fold_request(data: PublicWashFoldRequest):
        now = datetime.now(timezone.utc).isoformat()

        normalized_name = normalize_name(data.name)
        normalized_email = normalize_email(data.email) or data.email.lower()
        normalized_phone = normalize_phone(data.phone)
        normalized_address = normalize_address(data.address)
        normalized_notes = normalize_spaces(data.notes)
        normalized_contact = normalize_spaces(data.contact_method)

        notes_payload = normalized_notes or ""
        if normalized_contact:
            notes_payload = f"Preferred contact: {normalized_contact}\n{notes_payload}".strip()

        customer = await db.customers.find_one({"email": normalized_email}, {"_id": 0})
        if not customer:
            customer_id = str(uuid.uuid4())
            customer = {
                "id": customer_id,
                "name": normalized_name or data.name,
                "email": normalized_email,
                "phone": normalized_phone or data.phone,
                "address": normalized_address or data.address,
                "preferred_contact": normalized_contact or "email",
                "notes": None,
                "status": "active",
                "total_orders": 0,
                "created_at": now,
                "updated_at": now
            }
            await db.customers.insert_one(customer)
            await create_audit_log("CUSTOMER_CREATED", "customer", customer_id, None, {"source": "wash_fold_form"})
        else:
            await db.customers.update_one(
                {"id": customer["id"]},
                {"$set": {
                    "name": normalized_name or customer.get("name"),
                    "phone": normalized_phone or customer.get("phone"),
                    "address": normalized_address or customer.get("address"),
                    "preferred_contact": normalized_contact or customer.get("preferred_contact"),
                    "updated_at": now
                }}
            )

        pref = await db.preferences.find({"customer_id": customer["id"]}, {"_id": 0}).sort("version", -1).limit(1).to_list(1)
        preference_id = pref[0].get("id") if pref else None
        preference_snapshot = None
        if pref:
            preference_snapshot = {k: v for k, v in pref[0].items() if k not in ["_id", "customer_id"]}

        order_id = str(uuid.uuid4())
        order_number = await generate_order_number()
        order = {
            "id": order_id,
            "order_number": order_number,
            "customer_id": customer["id"],
            "customer_name": customer["name"],
            "service_type": "wash_fold",
            "pickup_date": data.dropoff_date,
            "pickup_time_window": data.dropoff_time,
            "pickup_address": normalized_address,
            "delivery_address": normalized_address,
            "estimated_lbs": None,
            "actual_lbs": None,
            "notes": notes_payload,
            "gate_code": None,
            "preferences_id": preference_id,
            "preferences_snapshot": preference_snapshot,
            "status": "new",
            "estado_actual": "new",
            "payment_status": "unpaid",
            "total_amount": None,
            "origen": "wash_fold_request",
            "created_at": now,
            "updated_at": now
        }
        await db.orders.insert_one(order)
        await db.customers.update_one({"id": customer["id"]}, {"$inc": {"total_orders": 1}})
        await create_audit_log("ORDER_CREATED", "order", order_id, None, {"source": "wash_fold_form"})
        await emit_realtime("notification", {
            "type": "order_created",
            "order_id": order_id,
            "status": "new",
            "order_number": order_number
        })

        if notifications_enabled:
            try:
                await notify_order_created(customer, order)
            except Exception as e:
                logger.error(f"Notification failed: {e}")

        return {
            "success": True,
            "order_number": order_number,
            "message": "¡Gracias! Tu solicitud de Wash & Fold ha sido recibida."
        }

    @router.post("/public/contact")
    async def public_contact(data: PublicContactRequest):
        now = datetime.now(timezone.utc).isoformat()

        normalized_name = normalize_name(data.name)
        normalized_email = normalize_email(data.email) or data.email.lower()
        normalized_phone = normalize_phone(data.phone)
        normalized_message = normalize_spaces(data.message)
        normalized_subject = normalize_spaces(data.subject) or "Contact Request"

        customer = await db.customers.find_one({"email": normalized_email}, {"_id": 0})
        customer_id = customer["id"] if customer else None
        customer_name = customer["name"] if customer else (normalized_name or data.name)

        ticket_id = str(uuid.uuid4())
        count = await db.tickets.count_documents({})
        ticket_number = f"TKT-{str(count + 1).zfill(5)}"

        ticket = {
            "id": ticket_id,
            "ticket_number": ticket_number,
            "customer_id": customer_id,
            "customer_name": customer_name,
            "subject": normalized_subject,
            "description": f"Nombre: {normalized_name or data.name}
Email: {normalized_email}
Teléfono: {normalized_phone or 'N/A'}

Mensaje:
{normalized_message}",
            "category": "general",
            "priority": "medium",
            "status": "open",
            "assigned_to": None,
            "resolution": None,
            "created_at": now,
            "updated_at": now
        }
        await db.tickets.insert_one(ticket)
        await create_audit_log("TICKET_CREATED", "ticket", ticket_id, None, {"source": "public_form"})

        return {
            "success": True,
            "ticket_number": ticket_number,
            "message": "¡Gracias por contactarnos! Te responderemos pronto."
        }

    @router.post("/public/quote-request")
    async def public_quote_request(data: PublicQuoteRequest):
        now = datetime.now(timezone.utc).isoformat()

        normalized_company = normalize_spaces(data.company_name)
        normalized_contact = normalize_name(data.contact_name)
        normalized_email = normalize_email(data.email) or data.email.lower()
        normalized_phone = normalize_phone(data.phone)
        normalized_industry = normalize_spaces(data.industry)
        normalized_message = normalize_spaces(data.message)

        quote_id = str(uuid.uuid4())
        today = datetime.now(timezone.utc).strftime("%Y%m%d")
        count = await db.quotes.count_documents({"quote_number": {"$regex": f"^QT-{today}"}})
        quote_number = f"QT-{today}-{str(count + 1).zfill(4)}"

        quote = {
            "id": quote_id,
            "quote_number": quote_number,
            "company_name": normalized_company or data.company_name,
            "contact_name": normalized_contact or data.contact_name,
            "email": normalized_email,
            "phone": normalized_phone or data.phone,
            "industry": normalized_industry,
            "estimated_lbs_per_week": data.estimated_lbs,
            "service_needs": normalized_message,
            "notes": None,
            "status": "new",
            "assigned_to": None,
            "follow_up_date": None,
            "created_at": now,
            "updated_at": now
        }
        await db.quotes.insert_one(quote)
        await create_audit_log("QUOTE_CREATED", "quote", quote_id, None, {"source": "public_form"})

        return {
            "success": True,
            "quote_number": quote_number,
            "message": "¡Gracias! Hemos recibido tu solicitud de cotización comercial."
        }

    @router.post("/public/membership-signup")
    async def public_membership_signup(data: PublicMembershipSignup):
        now = datetime.now(timezone.utc).isoformat()
        signup_id = str(uuid.uuid4())

        normalized_first = normalize_name(data.first_name)
        normalized_last = normalize_name(data.last_name)
        normalized_email = normalize_email(data.email) or data.email.lower()
        normalized_phone = normalize_phone(data.phone)
        normalized_contact = normalize_spaces(data.contact_method)
        normalized_address1 = normalize_address(data.address_line1)
        normalized_address2 = normalize_address(data.address_line2)
        normalized_city = normalize_spaces(data.city)
        normalized_state = normalize_spaces(data.state)
        normalized_zip = normalize_spaces(data.zip_code)
        normalized_plan = normalize_spaces(data.membership_plan)
        normalized_frequency = normalize_spaces(data.laundry_frequency)

        preferences = {
            "detergent_type": normalize_spaces(data.detergent_type),
            "water_temperature": normalize_spaces(data.water_temperature),
            "fabric_softener": normalize_spaces(data.fabric_softener),
            "folding_style": normalize_spaces(data.folding_style),
            "hanging_instructions": normalize_spaces(data.hanging_instructions),
            "allergies": normalize_spaces(data.allergies),
            "special_instructions": normalize_spaces(data.special_instructions),
            "pickup_time_preference": normalize_spaces(data.pickup_time_preference),
            "gate_code": normalize_spaces(data.gate_code)
        }
        preferences = normalize_preference_dict(preferences)

        signup = {
            "id": signup_id,
            "first_name": normalized_first or data.first_name,
            "last_name": normalized_last or data.last_name,
            "email": normalized_email,
            "phone": normalized_phone or data.phone,
            "contact_method": normalized_contact or data.contact_method,
            "address_line1": normalized_address1 or data.address_line1,
            "address_line2": normalized_address2 or data.address_line2,
            "city": normalized_city or data.city,
            "state": normalized_state or data.state,
            "zip_code": normalized_zip or data.zip_code,
            "membership_plan": normalized_plan or data.membership_plan,
            "laundry_frequency": normalized_frequency or data.laundry_frequency,
            "estimated_lbs": data.estimated_lbs,
            "preferences": preferences,
            "status": "new",
            "customer_id": None,
            "created_at": now,
            "updated_at": now
        }
        await db.membership_signups.insert_one(signup)
        await create_audit_log("MEMBERSHIP_SIGNUP_CREATED", "membership_signup", signup_id, None, {"source": "public_form"})
        return {
            "success": True,
            "message": "¡Gracias! Tu solicitud de membresía fue recibida. Te contactaremos para confirmar tu plan."
        }

    @router.post("/public/b2b-quote")
    async def create_b2b_quote(data: B2BQuoteRequest):
        now = datetime.now(timezone.utc).isoformat()
        quote_id = str(uuid.uuid4())
        quote_number = f"B2B-{datetime.now().strftime('%Y%m%d')}-{str(uuid.uuid4())[:6].upper()}"

        normalized_first = normalize_name(data.first_name)
        normalized_last = normalize_name(data.last_name)
        normalized_email = normalize_email(data.email) or data.email.lower()
        normalized_phone = normalize_phone(data.phone)
        normalized_contact_method = normalize_spaces(data.contact_method)
        normalized_address1 = normalize_address(data.address_line1)
        normalized_address2 = normalize_address(data.address_line2)
        normalized_city = normalize_spaces(data.city)
        normalized_state = normalize_spaces(data.state)
        normalized_zip = normalize_spaces(data.zip_code)
        normalized_job_title = normalize_spaces(data.job_title)
        normalized_service_type = normalize_spaces(data.service_type).lower().replace(" ", "_")
        normalized_has_membership = normalize_yes_no(data.has_membership)
        normalized_company_legal = normalize_spaces(data.company_legal_name)
        normalized_dba = normalize_spaces(data.dba_name)
        normalized_business_type = normalize_spaces(data.business_type)
        normalized_frequency = normalize_spaces(data.laundry_frequency)
        normalized_best_date = normalize_spaces(data.best_date)
        normalized_best_time = normalize_spaces(data.best_time)
        normalized_notes = normalize_spaces(data.additional_notes)

        quote_doc = {
            "id": quote_id,
            "quote_number": quote_number,
            "source": "website_b2b_form",
            "status": "new",
            "first_name": normalized_first or data.first_name,
            "last_name": normalized_last or data.last_name,
            "contact_name": f"{normalized_first or data.first_name} {normalized_last or data.last_name}".strip(),
            "email": normalized_email,
            "phone": normalized_phone or data.phone,
            "contact_method": normalized_contact_method or data.contact_method,
            "job_title": normalized_job_title or data.job_title,
            "address_line1": normalized_address1 or data.address_line1,
            "address_line2": normalized_address2 or data.address_line2,
            "city": normalized_city or data.city,
            "state": normalized_state or data.state,
            "zip_code": normalized_zip or data.zip_code,
            "full_address": f"{normalized_address1 or data.address_line1}, {normalized_city or data.city}, {normalized_state or data.state} {normalized_zip or data.zip_code}",
            "company_legal_name": normalized_company_legal,
            "company_name": normalized_company_legal or normalized_dba,
            "dba_name": normalized_dba,
            "business_type": normalized_business_type,
            "has_membership": normalized_has_membership or data.has_membership,
            "service_type": normalized_service_type or data.service_type,
            "laundry_frequency": normalized_frequency or data.laundry_frequency,
            "estimated_lbs_per_pickup": data.estimated_lbs,
            "estimated_lbs_per_week": data.estimated_lbs * (7 if normalized_frequency == "daily" else 2 if normalized_frequency == "twice_week" else 1),
            "best_contact_date": normalized_best_date or data.best_date,
            "best_contact_time": normalized_best_time or data.best_time,
            "additional_notes": normalized_notes,
            "subscribe_newsletter": data.subscribe_newsletter,
            "created_at": now,
            "updated_at": now
        }

        await db.quotes.insert_one(quote_doc)
        await create_audit_log("B2B_QUOTE_CREATED", "quote", quote_id, "public", {"company": data.company_legal_name, "business_type": data.business_type})

        if notifications_enabled and not skip_server_notifications:
            try:
                await send_sms(
                    os.environ.get("ADMIN_PHONE", "+18055154030"),
                    f"New B2B Quote Request: {data.company_legal_name or data.first_name} ({data.business_type}) - {data.estimated_lbs} lbs/{data.laundry_frequency}"
                )
            except Exception:
                pass

        return {
            "message": "Thank you! Your quote request has been received. Our team will contact you within 24-48 hours.",
            "quote_number": quote_number
        }

    return router
