# routes/public_forms.py
import os
import uuid
import asyncio
import logging
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, HTTPException, Request, Depends
from pydantic import BaseModel, EmailStr

from auth import get_current_user, require_admin
from utils import (
    normalize_phone,
    normalize_spaces,
    normalize_email,
    normalize_name,
    normalize_address,
    normalize_yes_no,
    generate_order_number,
    create_audit_log,
)
from notifications import send_sms, send_email, send_whatsapp, send_voice_call, normalize_preferred_contact, detect_language
from ai_assistant import get_groq_client

logger = logging.getLogger(__name__)

# ─── Helper para detectar país (si no existe en notifications) ───
def detect_country(phone: str) -> Optional[str]:
    if not phone:
        return None
    cleaned = ''.join(c for c in phone if c.isdigit() or c == '+')
    if cleaned.startswith('+52'):
        return 'mx'
    if cleaned.startswith('+1'):
        return 'us'
    if cleaned.startswith('52'):
        return 'mx'
    if cleaned.startswith('1') and len(cleaned) == 11:
        return 'us'
    return None

# =============================================================================
# PYDANTIC MODELS (públicos)
# =============================================================================
class PublicPickupRequest(BaseModel):
    name: str
    email: EmailStr
    phone: str
    address: str
    pickup_date: Optional[str] = None
    pickup_time: Optional[str] = None
    service_type: Optional[str] = "pickup_delivery"
    service_plan: Optional[str] = "standard"
    contact_method: Optional[str] = None
    sms_consent: Optional[bool] = False
    notes: Optional[str] = None
    gate_code: Optional[str] = None
    addon_services: Optional[List[Dict[str, Any]]] = []
    recurrence: Optional[str] = "once"
    recurrence_end_date: Optional[str] = None

class PublicWashFoldRequest(BaseModel):
    name: str
    email: EmailStr
    phone: str
    address: Optional[str] = None
    dropoff_date: Optional[str] = None
    dropoff_time: Optional[str] = None
    notes: Optional[str] = None
    contact_method: Optional[str] = None
    sms_consent: Optional[bool] = False
    plan: Optional[str] = "standard"

class PublicContactRequest(BaseModel):
    name: str
    email: EmailStr
    phone: Optional[str] = None
    message: str
    subject: Optional[str] = "Contact Request"
    contact_method: Optional[str] = None
    sms_consent: Optional[bool] = False

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
    sms_consent: Optional[bool] = False
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
    sms_consent: Optional[bool] = False
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

class PublicVoiceAssistantChatRequest(BaseModel):
    message: str
    session_id: Optional[str] = None
    locale: Optional[str] = "en"

class PublicSuggestionCreate(BaseModel):
    date: str
    types: List[str]
    suggestion: str
    improve: List[str]
    name: Optional[str] = None
    phone: Optional[str] = None
    acceptPromotions: bool = False

class PublicRefundCreate(BaseModel):
    date: str
    time: Optional[str] = None
    machine_number: str
    amount: float
    reasons: List[str]
    comment: Optional[str] = None
    name: Optional[str] = None
    phone: Optional[str] = None

# =============================================================================
# PRICING HELPERS (copiados del original)
# =============================================================================
PRICING_PD = {
    "standard": {"member": 2.50, "regular": 2.75},
    "premium":  {"member": 2.75, "regular": 3.00},
    "express":  {"member": 3.00, "regular": 3.25},
}
PRICING_WF = {
    "standard": 2.25,
    "premium":  2.50,
    "express":  2.75,
}

def get_price_per_lb(service_type: str, plan: str, has_membership: bool = False) -> float:
    plan = (plan or "standard").lower()
    if service_type in ("pickup_delivery", "airbnb_host", "commercial"):
        tier = PRICING_PD.get(plan, PRICING_PD["standard"])
        return tier["member"] if has_membership else tier["regular"]
    return PRICING_WF.get(plan, PRICING_WF["standard"])

async def calculate_auto_delivery_fee(address: str) -> dict:
    if not address or len(address.strip()) < 5:
        return {"distance_miles": None, "delivery_fee": 0, "coords": None}
    try:
        from routes.logistics import geocode_address
        from routes.delivery_rules import haversine_miles, STORE_COORDS
        coords = await geocode_address(address)
        if not coords.get("lat") or not coords.get("lng"):
            return {"distance_miles": None, "delivery_fee": 0, "coords": None}
        distance = haversine_miles(
            STORE_COORDS[0], STORE_COORDS[1],
            coords["lat"], coords["lng"]
        )
        if distance > 10:
            return {"distance_miles": round(distance, 2), "delivery_fee": 0, "coords": coords, "rejected": True}
        from utils import calculate_delivery_fee
        fee = calculate_delivery_fee(distance)
        return {"distance_miles": round(distance, 2), "delivery_fee": fee, "coords": coords}
    except Exception as e:
        logger.warning(f"Auto delivery fee calculation failed: {e}")
        return {"distance_miles": None, "delivery_fee": 0, "coords": None}

def calculate_addon_amount(addon_services: Optional[List[Dict[str, Any]]]) -> float:
    if not addon_services:
        return 0.0
    total = 0.0
    for svc in addon_services:
        price = svc.get("price")
        if price is not None:
            try:
                total += float(price)
            except (TypeError, ValueError):
                pass
    return round(total, 2)

def build_addon_notes(addon_services: Optional[List[Dict[str, Any]]]) -> str:
    if not addon_services:
        return ""
    UNIT_LABELS = {"per_lb": "/ lb", "per_order": "/ order", "per_month": "/ month", "per_item": "/ item"}
    lines = ["Add-on services:"]
    total = 0.0
    for svc in addon_services:
        name = svc.get("name", "Unknown")
        price = svc.get("price")
        price_unit = svc.get("price_unit", "")
        unit_label = UNIT_LABELS.get(price_unit, "")
        if price is not None:
            try:
                price_f = float(price)
                total += price_f
                price_str = f"${price_f:.2f}"
                if unit_label:
                    price_str += f" {unit_label}"
                lines.append(f"  • {name} ({price_str})")
            except (TypeError, ValueError):
                lines.append(f"  • {name}")
        else:
            lines.append(f"  • {name}")
    if total > 0:
        lines.append(f"Add-on subtotal: ${total:.2f}")
    return "\n".join(lines)

def validate_sms_consent(contact_method: Optional[str], sms_consent: Optional[bool]):
    normalized_contact = normalize_preferred_contact(contact_method) if contact_method else None
    if normalized_contact in {"sms", "whatsapp"} and not bool(sms_consent):
        raise HTTPException(status_code=400, detail="SMS consent is required for text or WhatsApp notifications")

# =============================================================================
# ROUTER FACTORY (FUNCIÓN PRINCIPAL)
# =============================================================================
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

    # ── Helper para membresía activa (consulta la colección memberships) ─────
    async def get_active_membership(customer_id: str) -> Optional[dict]:
        """Devuelve la membresía activa del cliente o None."""
        now = datetime.now(timezone.utc).isoformat()
        membership = await db.memberships.find_one(
            {
                "customer_id": customer_id,
                "status": "active",
                "$or": [
                    {"expires_at": {"$exists": False}},
                    {"expires_at": {"$gt": now}},
                ],
            },
            {"_id": 0},
        )
        return membership

    # =========================================================================
    # 1. PICKUP REQUEST (CON VALIDACIÓN DE MEMBRESÍA ACTIVA)
    # =========================================================================
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
        validate_sms_consent(preferred_contact, data.sms_consent)
        sms_consent = bool(data.sms_consent)

        addon_services = data.addon_services or []
        clean_addons = []
        for svc in addon_services:
            if not isinstance(svc, dict):
                continue
            clean_addons.append({
                "id": str(svc.get("id", "")),
                "name": str(svc.get("name", "Unknown"))[:120],
                "price": float(svc["price"]) if svc.get("price") is not None else None,
                "price_unit": str(svc.get("price_unit", "")) if svc.get("price_unit") else None,
                "category": str(svc.get("category", "")) if svc.get("category") else None,
            })

        addon_amount = calculate_addon_amount(clean_addons)
        addon_notes_text = build_addon_notes(clean_addons)

        notes_parts = []
        if normalized_notes:
            notes_parts.append(normalized_notes)
        if addon_notes_text:
            notes_parts.append(addon_notes_text)
        final_notes = "\n\n".join(notes_parts) if notes_parts else None

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
                "sms_consent": sms_consent,
                "sms_consent_at": now if sms_consent else None,
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
                    **({"sms_consent": True, "sms_consent_at": now} if sms_consent else {}),
                    "updated_at": now
                }}
            )
            customer = {
                **customer,
                "name": normalized_name or customer.get("name"),
                "phone": normalized_phone or customer.get("phone"),
                "address": normalized_address or customer.get("address"),
                **({"preferred_contact": preferred_contact} if preferred_contact else {}),
                **({"sms_consent": True, "sms_consent_at": now} if sms_consent else {})
            }

        # ── Obtener preferencias guardadas (CORREGIDO) ──────────────────────────
        pref = await db.preferences.find({"customer_id": customer["id"]}, {"_id": 0}).sort("version", -1).limit(1).to_list(1)
        preference_id = pref[0].get("id") if pref else None
        preference_snapshot = None
        if pref:
            preference_snapshot = {k: v for k, v in pref[0].items() if k not in ["_id", "customer_id"]}

        # Determinar membresía activa
        active_membership = await get_active_membership(customer["id"])
        has_membership = active_membership is not None
        membership_plan_name = active_membership.get("plan") if active_membership else None

        # Sincronizar el flag 'has_membership'
        if customer.get("has_membership") != has_membership:
            await db.customers.update_one(
                {"id": customer["id"]},
                {"$set": {"has_membership": has_membership, "updated_at": now}}
            )

        service_plan = (data.service_plan or "standard").lower()
        price_lb = get_price_per_lb(normalized_service_type, service_plan, has_membership)

        delivery_info = await calculate_auto_delivery_fee(normalized_address)
        if delivery_info.get("rejected"):
            dist = delivery_info.get("distance_miles", 0)
            raise HTTPException(status_code=400, detail=f"Lo sentimos, solo atendemos direcciones dentro de 10 millas. Tu dirección está a {dist:.1f} millas de distancia.")
        delivery_fee = delivery_info.get("delivery_fee", 0)
        distance_miles = delivery_info.get("distance_miles")
        coords = delivery_info.get("coords")

        valid_recurrences = {"once", "weekly", "biweekly", "twice_week"}
        raw_recurrence = (data.recurrence or "once").strip().lower()
        recurrence = raw_recurrence if raw_recurrence in valid_recurrences else "once"
        if normalized_service_type not in ("airbnb_host", "commercial"):
            recurrence = "once"

        recurrence_end_date = None
        if recurrence != "once" and data.recurrence_end_date:
            try:
                datetime.strptime(data.recurrence_end_date, "%Y-%m-%d")
                recurrence_end_date = data.recurrence_end_date
            except ValueError:
                pass

        if recurrence != "once":
            recurrence_labels = {"once": "One time", "weekly": "Every week", "biweekly": "Every 2 weeks", "twice_week": "Twice a week"}
            recurrence_note = f"Recurrence: {recurrence_labels.get(recurrence, recurrence)}"
            if recurrence_end_date:
                recurrence_note += f" until {recurrence_end_date}"
            if final_notes:
                final_notes = final_notes + "\n\n" + recurrence_note
            else:
                final_notes = recurrence_note

        order_id = str(uuid.uuid4())
        order_number = await generate_order_number()

        order = {
            "id": order_id,
            "order_number": order_number,
            "customer_id": customer["id"],
            "customer_name": customer["name"],
            "customer_email": normalized_email,
            "service_type": normalized_service_type,
            "service_plan": service_plan,
            "membership_plan_applied": membership_plan_name,
            "price_per_lb": price_lb,
            "delivery_fee": delivery_fee,
            "distance_miles": distance_miles,
            "coords": coords,
            "pickup_date": data.pickup_date,
            "pickup_time_window": data.pickup_time,
            "pickup_address": normalized_address,
            "delivery_address": normalized_address,
            "estimated_lbs": None,
            "actual_lbs": None,
            "notes": final_notes,
            "gate_code": normalized_gate_code,
            "preferred_contact": preferred_contact,
            "sms_consent": sms_consent,
            "sms_consent_at": now if sms_consent else None,
            "preferences_id": preference_id,               # ← AHORA SÍ EXISTE
            "preferences_snapshot": preference_snapshot,   # ← AHORA SÍ EXISTE
            "status": "new",
            "estado_actual": "new",
            "payment_status": "unpaid",
            "total_amount": None,
            "addon_services": clean_addons,
            "addon_amount": addon_amount,
            "origen": "pickup_request",
            "created_at": now,
            "updated_at": now,
            "recurrence": recurrence,
            "recurrence_end_date": recurrence_end_date,
            "recurrence_parent_id": None,
            "is_recurring": recurrence != "once",
        }

        await db.orders.insert_one(order)
        await db.customers.update_one({"id": customer["id"]}, {"$inc": {"total_orders": 1}})
        await create_audit_log("ORDER_CREATED", "order", order_id, None, {"source": "public_form"})
        await emit_realtime("notification", {"type": "order_created", "order_id": order_id, "status": "new", "order_number": order_number})

        if notifications_enabled:
            try:
                from notifications import notify_order_created
                await notify_order_created(customer, order)
            except Exception as e:
                logger.error(f"Notification failed: {e}")

        return {
            "success": True,
            "order_number": order_number,
            "message": "¡Gracias! Tu solicitud de pickup ha sido recibida. Te contactaremos pronto.",
            "addons": {"selected": clean_addons, "total": addon_amount} if clean_addons else None
        }

    # =========================================================================
    # 2. WASH & FOLD REQUEST (CON VALIDACIÓN DE MEMBRESÍA ACTIVA)
    # =========================================================================
    @router.post("/public/wash-fold-request")
    async def public_wash_fold_request(data: PublicWashFoldRequest):
        now = datetime.now(timezone.utc).isoformat()

        normalized_name = normalize_name(data.name)
        normalized_email = normalize_email(data.email) or data.email.lower()
        normalized_phone = normalize_phone(data.phone)
        normalized_address = normalize_address(data.address)
        normalized_notes = normalize_spaces(data.notes)
        normalized_contact = normalize_spaces(data.contact_method)
        preferred_contact = normalize_preferred_contact(normalized_contact) if normalized_contact else None
        validate_sms_consent(preferred_contact, data.sms_consent)
        sms_consent = bool(data.sms_consent)

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
                "preferred_contact": preferred_contact or "email",
                "sms_consent": sms_consent,
                "sms_consent_at": now if sms_consent else None,
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
                    "preferred_contact": preferred_contact or customer.get("preferred_contact"),
                    **({"sms_consent": True, "sms_consent_at": now} if sms_consent else {}),
                    "updated_at": now
                }}
            )

        # ── Obtener preferencias guardadas ─────────────────────────────────────
        pref = await db.preferences.find({"customer_id": customer["id"]}, {"_id": 0}).sort("version", -1).limit(1).to_list(1)
        preference_id = pref[0].get("id") if pref else None
        preference_snapshot = None
        if pref:
            preference_snapshot = {k: v for k, v in pref[0].items() if k not in ["_id", "customer_id"]}

        # Verificar membresía activa
        active_membership = await get_active_membership(customer["id"])
        has_membership = active_membership is not None
        membership_plan_name = active_membership.get("plan") if active_membership else None

        if customer.get("has_membership") != has_membership:
            await db.customers.update_one(
                {"id": customer["id"]},
                {"$set": {"has_membership": has_membership, "updated_at": now}}
            )

        wf_plan = (data.plan or "standard").lower()
        price_lb = get_price_per_lb("wash_fold", wf_plan, has_membership)

        order_id = str(uuid.uuid4())
        order_number = await generate_order_number()
        order = {
            "id": order_id,
            "order_number": order_number,
            "customer_id": customer["id"],
            "customer_name": customer["name"],
            "customer_email": normalized_email,
            "service_type": "wash_fold",
            "service_plan": wf_plan,
            "membership_plan_applied": membership_plan_name,
            "price_per_lb": price_lb,
            "preferred_contact": preferred_contact or customer.get("preferred_contact") or "email",
            "sms_consent": sms_consent,
            "sms_consent_at": now if sms_consent else None,
            "pickup_date": data.dropoff_date,
            "pickup_time_window": data.dropoff_time,
            "pickup_address": None,
            "delivery_address": None,
            "contact_address": normalized_address,
            "estimated_lbs": None,
            "actual_lbs": None,
            "notes": notes_payload,
            "gate_code": None,
            "preferences_id": preference_id,               # ← AHORA SÍ EXISTE
            "preferences_snapshot": preference_snapshot,   # ← AHORA SÍ EXISTE
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
        await emit_realtime("notification", {"type": "order_created", "order_id": order_id, "status": "new", "order_number": order_number})

        if notifications_enabled:
            try:
                from notifications import notify_order_created
                await notify_order_created(customer, order)
            except Exception as e:
                logger.error(f"Notification failed: {e}")

        return {
            "success": True,
            "order_number": order_number,
            "message": "¡Gracias! Tu solicitud de Wash & Fold ha sido recibida."
        }

      # =========================================================================
    # 3. CONTACT FORM (SIN CAMBIOS)
    # =========================================================================
    @router.post("/public/contact")
    async def public_contact(data: PublicContactRequest):
        now = datetime.now(timezone.utc).isoformat()

        normalized_name = normalize_name(data.name)
        normalized_email = normalize_email(data.email) or data.email.lower()
        normalized_phone = normalize_phone(data.phone)
        normalized_message = normalize_spaces(data.message)
        normalized_subject = normalize_spaces(data.subject) or "Contact Request"
        normalized_contact_method = normalize_spaces(data.contact_method)
        preferred_contact = normalize_preferred_contact(normalized_contact_method) if normalized_contact_method else None
        validate_sms_consent(preferred_contact, data.sms_consent)

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
            "description": f"Nombre: {normalized_name or data.name}\nEmail: {normalized_email}\nTeléfono: {normalized_phone or 'N/A'}\n\nMensaje:\n{normalized_message}",
            "category": "general",
            "contact_method": preferred_contact,
            "sms_consent": bool(data.sms_consent),
            "sms_consent_at": now if bool(data.sms_consent) else None,
            "priority": "medium",
            "status": "open",
            "assigned_to": None,
            "resolution": None,
            "created_at": now,
            "updated_at": now
        }
        await db.tickets.insert_one(ticket)
        await create_audit_log("TICKET_CREATED", "ticket", ticket_id, None, {"source": "public_form"})

        try:
            # Notificación al cliente
            is_es = detect_language(customer, normalized_phone) if customer else False
            if is_es:
                msg = (f"Hola {customer_name}, gracias por contactar a Ventura Fresh Laundry. "
                       f"Tu mensaje ha sido recibido y será revisado por nuestro equipo. "
                       f"Te responderemos pronto.")
                call_msg = ("Hola, gracias por contactar a Ventura Fresh Laundry. "
                            "Hemos recibido tu mensaje y un miembro de nuestro equipo se comunicará contigo en breve. "
                            "Que tengas un buen día.")
            else:
                msg = (f"Hello {customer_name}, thank you for contacting Ventura Fresh Laundry. "
                       f"Your message has been received and will be reviewed by our team. "
                       f"We will get back to you shortly.")
                call_msg = ("Hello, thank you for contacting Ventura Fresh Laundry. "
                            "We have received your message, and a member of our team will be reaching out to you shortly. "
                            "Have a great day.")
            subj = "Solicitud recibida" if is_es else "Request received"

            if preferred_contact == "email" and normalized_email:
                await send_email(normalized_email, subj, msg)
            elif preferred_contact in ("whatsapp",) and normalized_phone:
                await send_whatsapp(normalized_phone, msg)
            elif preferred_contact in ("sms", "text") and normalized_phone:
                await send_sms(normalized_phone, msg)
            elif preferred_contact == "call" and normalized_phone:
                voice_lang = "es-MX" if is_es else "en-US"
                await send_voice_call(normalized_phone, call_msg, voice_lang)
            elif normalized_email:
                await send_email(normalized_email, subj, msg)
            elif normalized_phone:
                await send_sms(normalized_phone, msg)
            else:
                logger.warning("No contact method available for notification")
        except Exception as e:
            logger.error(f"Contact notification failed: {e}")

        return {
            "success": True,
            "ticket_number": ticket_number,
            "message": "¡Gracias por contactarnos! Te responderemos pronto."
        }

    # =========================================================================
    # 4. QUOTE REQUEST (SIN CAMBIOS)
    # =========================================================================
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

        try:
            msg = f"Hola {normalized_contact or data.contact_name}, hemos recibido tu solicitud de cotización ({quote_number}). Te contactaremos pronto. — Ventura Fresh Laundry"
            subj = "Cotización recibida"
            if normalized_email:
                await send_email(normalized_email, subj, msg)
            if normalized_phone:
                await send_sms(normalized_phone, msg)
        except Exception as e:
            logger.error(f"Quote notification failed: {e}")

        return {
            "success": True,
            "quote_number": quote_number,
            "message": "¡Gracias! Hemos recibido tu solicitud de cotización comercial."
        }

    # =========================================================================
    # 5. MEMBERSHIP SIGNUP (SIN CAMBIOS)
    # =========================================================================
    @router.post("/public/membership-signup")
    async def public_membership_signup(data: PublicMembershipSignup):
        now = datetime.now(timezone.utc).isoformat()
        signup_id = str(uuid.uuid4())

        normalized_first = normalize_name(data.first_name)
        normalized_last = normalize_name(data.last_name)
        normalized_email = normalize_email(data.email) or data.email.lower()
        normalized_phone = normalize_phone(data.phone)
        normalized_contact = normalize_spaces(data.contact_method)
        preferred_contact = normalize_preferred_contact(normalized_contact) if normalized_contact else None
        validate_sms_consent(preferred_contact, data.sms_consent)
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

        signup = {
            "id": signup_id,
            "first_name": normalized_first or data.first_name,
            "last_name": normalized_last or data.last_name,
            "email": normalized_email,
            "phone": normalized_phone or data.phone,
            "contact_method": preferred_contact or data.contact_method,
            "sms_consent": bool(data.sms_consent),
            "sms_consent_at": now if bool(data.sms_consent) else None,
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

        if normalized_phone:
            try:
                is_es = detect_country(normalized_phone) == "mx"
                name = f"{normalized_first or data.first_name} {normalized_last or data.last_name}".strip()
                if is_es:
                    msg = f"Hola {name}, hemos recibido tu solicitud de membresía. Pronto te contactaremos para confirmar tu plan. ¡Gracias!"
                else:
                    msg = f"Hi {name}, we've received your membership request. We'll contact you shortly to confirm your plan. Thank you!"
                await send_sms(normalized_phone, msg)
            except Exception as e:
                logger.error(f"Membership signup SMS failed: {e}")

        return {
            "success": True,
            "message": "¡Gracias! Tu solicitud de membresía fue recibida. Te contactaremos para confirmar tu plan."
        }

    # =========================================================================
    # 6. B2B QUOTE (SIN CAMBIOS)
    # =========================================================================
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
        preferred_contact = normalize_preferred_contact(normalized_contact_method) if normalized_contact_method else None
        validate_sms_consent(preferred_contact, data.sms_consent)
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
            "contact_method": preferred_contact or data.contact_method,
            "sms_consent": bool(data.sms_consent),
            "sms_consent_at": now if bool(data.sms_consent) else None,
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

        if normalized_phone:
            try:
                country = detect_country(normalized_phone)
                is_es = (country == "mx")
                name = f"{normalized_first or data.first_name} {normalized_last or data.last_name}".strip()
                if is_es:
                    msg = f"Hola {name}, recibimos tu cotización comercial #{quote_number}. Nuestro equipo te contactará en 24-48 horas. ¡Gracias!"
                else:
                    msg = f"Hi {name}, we've received your commercial quote request #{quote_number}. Our team will contact you within 24-48 hours. Thank you!"
                await send_sms(normalized_phone, msg)
            except Exception as e:
                logger.error(f"B2B quote client SMS failed: {e}")

        if notifications_enabled and not skip_server_notifications:
            try:
                admin_phone = os.environ.get("ADMIN_PHONE", "+18055154030")
                admin_msg = (f"📋 NUEVA COTIZACIÓN B2B\n"
                             f"📄 #{quote_number}\n"
                             f"🏢 {data.company_legal_name or data.dba_name or f'{data.first_name} {data.last_name}'}\n"
                             f"🏭 {data.business_type}\n"
                             f"📦 {data.estimated_lbs} lbs / {data.laundry_frequency}\n"
                             f"📧 {normalized_email}\n"
                             f"📞 {normalized_phone or 'N/A'}")
                await send_sms(admin_phone, admin_msg)
            except Exception as e:
                logger.error(f"B2B quote admin notification failed: {e}")

        return {
            "message": "Thank you! Your quote request has been received. Our team will contact you within 24-48 hours.",
            "quote_number": quote_number
        }

    # =========================================================================
    # 7. VOICE ASSISTANT (SIN CAMBIOS)
    # =========================================================================
    VOICE_ASSISTANT_SYSTEM_PROMPT = """You are Ventura, a friendly and enthusiastic AI sales assistant for Ventura Fresh Laundry, a premium laundry service in Ventura County, California. Your goal is to warmly engage visitors, answer their questions, and help them choose the right service.

SERVICES YOU OFFER:
1. Pickup & Delivery
   - Member recurring: $2.50/lb (minimum $40)
   - As-needed: $2.75/lb (minimum $40)

2. Wash Dry Fold (drop-off)
   - $2.25/lb
   - 10 lb minimum

3. Self-Service Laundry
   - Open 6:00 AM - 10:00 PM, 7 days a week

4. Membership Plans
   - FAMILY PLUS: $199/month up to 90 lb
   - MOST POPULAR: $139/month up to 60 lb
   - ELITE CONCIERGE: $299/month up to 120 lb
   - NEW MEMBER SPECIAL: $10 OFF first month

5. Airbnb and B2B programs are available with custom quotes.

PERSONALITY GUIDELINES:
- Warm, conversational, and concise.
- Keep responses under 60 words.
- No markdown or bullet formatting.
- End with a gentle question.
- Use the same language as the customer (English or Spanish).
"""

    def assistant_fallback_reply(locale: Optional[str]) -> str:
        if str(locale or "en").lower().startswith("es"):
            return ("¡Hola! Soy Ventura, tu concierge de lavandería. Podemos ayudarte con pickup y delivery, wash and fold, "
                    "membresías o servicios para Airbnb y negocios. ¿Qué servicio te interesa hoy?")
        return ("Hi! I'm Ventura, your laundry concierge. I can help with pickup and delivery, wash and fold, memberships, "
                "or Airbnb and business service. What would you like to set up today?")

    async def get_or_create_voice_session(session_id: Optional[str], locale: Optional[str]) -> Dict[str, Any]:
        now = datetime.now(timezone.utc).isoformat()
        normalized_locale = "es" if str(locale or "en").lower().startswith("es") else "en"
        target_session_id = session_id or str(uuid.uuid4())
        session = await db.voice_assistant_sessions.find_one({"session_id": target_session_id}, {"_id": 0})
        if session:
            return session
        new_session = {
            "session_id": target_session_id,
            "locale": normalized_locale,
            "messages": [],
            "created_at": now,
            "updated_at": now
        }
        await db.voice_assistant_sessions.insert_one(new_session)
        return new_session

    @router.get("/public/voice-assistant/session/{session_id}")
    async def get_voice_assistant_session(session_id: str):
        session = await db.voice_assistant_sessions.find_one({"session_id": session_id}, {"_id": 0})
        if not session:
            return {"session_id": session_id, "locale": "en", "messages": []}
        messages = session.get("messages", [])[-30:]
        return {
            "session_id": session.get("session_id"),
            "locale": session.get("locale", "en"),
            "messages": messages
        }

    @router.post("/public/voice-assistant/chat")
    async def public_voice_assistant_chat(data: PublicVoiceAssistantChatRequest, request: Request):
        message = normalize_spaces(data.message)
        if not message:
            raise HTTPException(status_code=400, detail="Message is required")
        if len(message) > 1200:
            raise HTTPException(status_code=400, detail="Message too long")

        locale = "es" if str(data.locale or "en").lower().startswith("es") else "en"
        session = await get_or_create_voice_session(data.session_id, locale)
        session_id = session.get("session_id")
        now = datetime.now(timezone.utc).isoformat()

        stored_messages = session.get("messages", [])
        stored_messages.append({"role": "user", "content": message, "created_at": now})

        convo_messages = []
        for item in stored_messages[-14:]:
            role = item.get("role")
            content = item.get("content")
            if role in {"user", "assistant"} and content:
                convo_messages.append({"role": role, "content": content})

        client = get_groq_client()
        reply = assistant_fallback_reply(locale)

        if client:
            try:
                completion = await asyncio.to_thread(
                    client.chat.completions.create,
                    model="llama-3.3-70b-versatile",
                    temperature=0.5,
                    max_tokens=220,
                    messages=[
                        {"role": "system", "content": VOICE_ASSISTANT_SYSTEM_PROMPT},
                        *convo_messages
                    ]
                )
                content = completion.choices[0].message.content.strip() if completion and completion.choices else ""
                if content:
                    reply = content
            except Exception as exc:
                logger.error(f"Public voice assistant error: {exc}")

        stored_messages.append({
            "role": "assistant",
            "content": reply,
            "created_at": datetime.now(timezone.utc).isoformat()
        })
        stored_messages = stored_messages[-40:]

        await db.voice_assistant_sessions.update_one(
            {"session_id": session_id},
            {
                "$set": {
                    "locale": locale,
                    "messages": stored_messages,
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                    "last_user_agent": request.headers.get("user-agent")
                }
            },
            upsert=True
        )

        return {
            "session_id": session_id,
            "locale": locale,
            "reply": reply,
            "messages": stored_messages[-30:]
        }

    # =========================================================================
    # 8. SUGGESTION (SIN CAMBIOS)
    # =========================================================================
    @router.post("/public/suggestion")
    async def public_suggestion(data: PublicSuggestionCreate):
        now = datetime.now(timezone.utc).isoformat()
        doc_id = str(uuid.uuid4())

        suggestion_doc = {
            "id": doc_id,
            **data.dict(),
            "created_at": now,
            "updated_at": now
        }
        await db.suggestions.insert_one(suggestion_doc)
        await create_audit_log("SUGGESTION_CREATED", "suggestion", doc_id, None, {"source": "public_suggestion"})

        customer_phone = normalize_phone(data.phone) if data.phone else None
        if customer_phone and len(customer_phone) >= 10:
            try:
                country = detect_country(customer_phone)
                is_es = (country == "mx")
                name = data.name or ("cliente" if is_es else "customer")
                if is_es:
                    msg = (f"¡Gracias por tu sugerencia, {name}! 👏\n"
                           f"Hemos recibido tu idea en Ventura Fresh Laundry.\n"
                           f"La revisaremos pronto. ¡Gracias por ayudarnos a mejorar!")
                else:
                    msg = (f"Thank you for your suggestion, {name}! 👏\n"
                           f"We've received your idea at Ventura Fresh Laundry.\n"
                           f"We'll review it soon. Thanks for helping us improve!")
                await send_sms(customer_phone, msg)
                logger.info(f"SMS sent to {customer_phone} for suggestion {doc_id}")
            except Exception as e:
                logger.error(f"Customer SMS for suggestion {doc_id} failed: {e}")

        if notifications_enabled and not skip_server_notifications:
            try:
                admin_phone = os.environ.get("ADMIN_PHONE", "+18055154030")
                admin_msg = (f"📝 NUEVA SUGERENCIA\n"
                             f"📅 {data.date}\n"
                             f"💡 {data.suggestion[:100]}...\n"
                             f"👤 {data.name or 'Anónimo'}")
                await send_sms(admin_phone, admin_msg)
            except Exception as e:
                logger.error(f"Admin notification for suggestion failed: {e}")

        return {
            "success": True,
            "message": "¡Gracias por tu sugerencia! La hemos recibido y la revisaremos pronto."
        }

    # =========================================================================
    # 9. REFUND (SIN CAMBIOS)
    # =========================================================================
    @router.post("/public/refund")
    async def public_refund(data: PublicRefundCreate):
        now = datetime.now(timezone.utc).isoformat()
        doc_id = str(uuid.uuid4())

        refund_doc = {
            "id": doc_id,
            **data.dict(),
            "created_at": now,
            "updated_at": now
        }
        await db.refunds.insert_one(refund_doc)
        await create_audit_log("REFUND_CREATED", "refund", doc_id, None, {"source": "public_refund"})

        customer_phone = normalize_phone(data.phone) if data.phone else None
        if customer_phone and len(customer_phone) >= 10:
            try:
                country = detect_country(customer_phone)
                is_es = (country == "mx")
                name = data.name or ("cliente" if is_es else "customer")
                if is_es:
                    msg = (f"Hola {name}, hemos recibido tu solicitud de reembolso.\n"
                           f"Monto: ${data.amount:.2f} | Máquina: {data.machine_number}\n"
                           f"Nuestro equipo la revisará y te contactará pronto.")
                else:
                    msg = (f"Hi {name}, we've received your refund request.\n"
                           f"Amount: ${data.amount:.2f} | Machine: {data.machine_number}\n"
                           f"Our team will review it and get back to you shortly.")
                await send_sms(customer_phone, msg)
                logger.info(f"SMS sent to {customer_phone} for refund {doc_id}")
            except Exception as e:
                logger.error(f"Customer SMS for refund {doc_id} failed: {e}")

        if notifications_enabled and not skip_server_notifications:
            try:
                admin_phone = os.environ.get("ADMIN_PHONE", "+18055154030")
                admin_msg = (f"💰 NUEVA SOLICITUD DE REEMBOLSO\n"
                             f"🖨️ Máquina: {data.machine_number}\n"
                             f"💵 Monto: ${data.amount:.2f}\n"
                             f"📝 Razones: {', '.join(data.reasons)}\n"
                             f"👤 {data.name or 'Anónimo'}")
                await send_sms(admin_phone, admin_msg)
            except Exception as e:
                logger.error(f"Admin notification for refund failed: {e}")

        return {
            "success": True,
            "message": "Solicitud de reembolso recibida. Pronto nos pondremos en contacto contigo."
        }

    # =========================================================================
    # 10. ADMIN GET ENDPOINTS (SIN CAMBIOS)
    # =========================================================================
    @router.get("/admin/suggestions")
    async def list_suggestions(user: dict = Depends(get_current_user)):
        require_admin(user)
        suggestions = await db.suggestions.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
        return suggestions

    @router.get("/admin/refunds")
    async def list_refunds(user: dict = Depends(get_current_user)):
        require_admin(user)
        refunds = await db.refunds.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
        return refunds

    @router.put("/admin/suggestions/{suggestion_id}")
    async def update_suggestion(
        suggestion_id: str,
        update_data: dict,
        user: dict = Depends(get_current_user)
    ):
        require_admin(user)
        allowed_fields = {"staff_status", "internal_comment"}
        update_payload = {k: v for k, v in update_data.items() if k in allowed_fields}
        if not update_payload:
            raise HTTPException(status_code=400, detail="No valid fields to update")
        update_payload["updated_at"] = datetime.now(timezone.utc).isoformat()
        result = await db.suggestions.update_one(
            {"id": suggestion_id},
            {"$set": update_payload}
        )
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Suggestion not found")
        return {"success": True}

    @router.put("/admin/refunds/{refund_id}")
    async def update_refund(
        refund_id: str,
        update_data: dict,
        user: dict = Depends(get_current_user)
    ):
        require_admin(user)
        allowed_fields = {"staff_status", "internal_comment", "refund_amount"}
        update_payload = {k: v for k, v in update_data.items() if k in allowed_fields}
        if not update_payload:
            raise HTTPException(status_code=400, detail="No valid fields to update")
        update_payload["updated_at"] = datetime.now(timezone.utc).isoformat()
        result = await db.refunds.update_one(
            {"id": refund_id},
            {"$set": update_payload}
        )
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Refund not found")
        return {"success": True}

    return router