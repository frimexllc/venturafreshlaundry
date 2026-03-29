"""Shared utility functions: QR generation, ticket formatting, order helpers, etc."""
import io
import json
import html
import base64
import uuid
import time
import logging
from typing import List, Optional
from datetime import datetime, timezone

import qrcode
from qrcode.image.svg import SvgImage
from fastapi import HTTPException

from database import db
from models import OrderCreate

logger = logging.getLogger(__name__)

# ── Normalization helpers (merged from normalization.py) ─────────────
import re as _re
import unicodedata as _ud

def normalize_spaces(value):
    if not value or not isinstance(value, str): return value
    return " ".join(value.split()).strip()

def normalize_email(value):
    if not value or not isinstance(value, str): return value
    return value.strip().lower()

def normalize_phone(value):
    if not value or not isinstance(value, str): return value
    digits = _re.sub(r"[^\d+]", "", value.strip())
    return digits if digits else value.strip()

def normalize_address(value):
    if not value or not isinstance(value, str): return value
    return normalize_spaces(value)

def normalize_preference_dict(data):
    if not data or not isinstance(data, dict): return data
    return {k: normalize_spaces(v) if isinstance(v, str) else v for k, v in data.items()}


# ── Order helpers ────────────────────────────────────────────────────

async def generate_order_number():
    today = datetime.now(timezone.utc).strftime("%Y%m%d")
    unique = uuid.uuid4().hex[:8]
    return f"VFL-{today}-{unique}"


def normalize_status(value: Optional[str]) -> str:
    if not value:
        return ""
    return value.strip().lower().replace(" ", "_")


def normalize_payment_method(value: Optional[str]) -> str:
    if not value:
        return ""
    normalized = value.strip().lower()
    mapping = {
        "efectivo": "cash", "cash": "cash",
        "tarjeta": "card", "card": "card",
        "credito": "card", "débito": "card", "debito": "card",
        "transferencia": "transfer", "transfer": "transfer",
        "transferencia_bancaria": "transfer",
        "otro": "other", "other": "other"
    }
    return mapping.get(normalized, normalized)


def build_order_times(now_iso: str, status_value: str):
    return {
        "creacion": now_iso,
        "ultimo_cambio_estado": now_iso,
        "fechas_estado": {status_value: now_iso}
    }


def validate_order_payload(data: OrderCreate):
    errors = []
    if data.service_type == "pickup_delivery":
        if not data.pickup_date:
            errors.append({"codigo": "MISSING_PICKUP_DATE", "campo": "pickup_date"})
        if not data.pickup_time_window:
            errors.append({"codigo": "MISSING_PICKUP_TIME", "campo": "pickup_time_window"})
        if not data.pickup_address:
            errors.append({"codigo": "MISSING_PICKUP_ADDRESS", "campo": "pickup_address"})
    return errors


def is_active_member(order: dict, customer: Optional[dict]) -> bool:
    status_value = ""
    if order:
        status_value = order.get("membership_status") or ""
    if customer:
        status_value = customer.get("membership_status") or status_value
    status_normalized = normalize_spaces(status_value).lower() if status_value else ""
    if status_normalized in ["inactive", "cancelled", "canceled", "expired"]:
        return False
    if status_normalized in ["active", "current", "paid", "yes", "true"]:
        return True
    plan = None
    if order:
        plan = order.get("membership_plan")
    if customer and not plan:
        plan = customer.get("membership_plan")
    return bool(plan)


def calculate_service_amount(order: dict, customer: Optional[dict]) -> Optional[float]:
    service_type = normalize_status(order.get("service_type") or "pickup_delivery")
    lbs_value = order.get("actual_lbs")
    if lbs_value is None:
        return None
    try:
        lbs_value = float(lbs_value)
    except Exception:
        return None
    if lbs_value <= 0:
        return None
    if service_type == "wash_fold":
        billable_lbs = max(lbs_value, 10)
        amount = billable_lbs * 2.25
    else:
        rate = 2.50 if is_active_member(order, customer) else 2.75
        amount = max(lbs_value * rate, 40)
    return round(float(amount), 2)


def should_notify_order_status(order: dict, status_value: str) -> bool:
    status_normalized = normalize_status(status_value)
    if not status_normalized or status_normalized == "new":
        return False
    service_type = normalize_status(order.get("service_type") or "pickup_delivery")
    if service_type in ["wash_fold", "self_service"]:
        return status_normalized == "ready"
    return status_normalized in ["confirmed", "pickup_scheduled", "ready", "out_for_delivery", "delivered"]


# ── QR / Ticket helpers ─────────────────────────────────────────────

def build_qr_svg(payload: str):
    img = qrcode.make(payload, image_factory=SvgImage, box_size=10, border=2)
    buffer = io.BytesIO()
    img.save(buffer)
    return buffer.getvalue()


def build_qr_payload(order: dict):
    return json.dumps({
        "order_id": order.get("id"),
        "order_number": order.get("order_number"),
        "qr_token": order.get("qr_token")
    })


def build_display_order_number(order: dict) -> str:
    order_number = order.get("order_number")
    if order_number and order_number.startswith("VFL-"):
        return order_number
    created_at = order.get("created_at") or datetime.now(timezone.utc).isoformat()
    date_part = created_at[:10].replace("-", "")
    base_id = order_number or order.get("id") or "00000000"
    short = "".join([c for c in str(base_id) if c.isalnum()]).lower()[:8]
    if len(short) < 8:
        short = (short + "00000000")[:8]
    return f"VFL-{date_part}-{short}"


def format_time_window(window: Optional[str]) -> str:
    if not window:
        return "-"
    cleaned = window.replace(" ", "")
    if "-" in cleaned:
        start, end = cleaned.split("-", 1)
        return f"{start} - {end}"
    return window


def build_ticket_lines(order: dict, customer: Optional[dict]) -> List[str]:
    customer = customer or {}
    display_id = build_display_order_number(order)
    status = normalize_status(order.get("status") or "new").upper()
    name = order.get("customer_name") or customer.get("name") or "-"
    phone = customer.get("phone") or order.get("customer_phone") or "-"
    contact = customer.get("preferred_contact") or order.get("preferred_contact") or "-"
    contact_label = str(contact).capitalize() if contact else "-"
    pickup_date = order.get("pickup_date") or "-"
    window = format_time_window(order.get("pickup_time_window") or order.get("pickup_time"))
    address = order.get("pickup_address") or order.get("delivery_address") or customer.get("address") or "-"
    membership = "yes" if customer.get("membership_plan") or customer.get("membership_status") else "no"
    notes = order.get("notes") or "N/A"

    def format_lbs(value):
        if value is None or value == "":
            return "N/A"
        try:
            return f"{float(value):g}"
        except Exception:
            return str(value)

    est_lbs = format_lbs(order.get("estimated_lbs"))
    act_lbs = format_lbs(order.get("actual_lbs"))
    pref_id = order.get("preferences_id") or "N/A"
    customer_id = order.get("customer_id") or customer.get("id") or "N/A"
    email = customer.get("email") or order.get("customer_email") or ""
    source = order.get("origen") or "crm"
    dedup = f"e:{email}|f:{source}"
    if len(dedup) > 45:
        dedup = dedup[:42] + "..."
    summary = f"{display_id} | {pickup_date} {window} | {name}"
    return [
        "VENTURA FRESH LAUNDRY",
        f"ORDER: {display_id}",
        f"STATUS: {status or 'NEW'}",
        f"NAME: {name}",
        f"PHONE: {phone}    CONTACT: {contact_label}",
        f"PICKUP: {pickup_date}    WINDOW: {window}",
        f"ADDR: {address}",
        f"MEMBERSHIP: {membership}",
        f"NOTES: {notes}",
        f"EST_LBS: {est_lbs}",
        f"ACT_LBS: {act_lbs}",
        f"PREF: {pref_id}",
        f"CUS_ID: {customer_id}",
        f"DEDUP: {dedup}",
        "",
        summary
    ]


def build_qr_png_base64(payload: str) -> str:
    qr = qrcode.QRCode(box_size=6, border=2)
    qr.add_data(payload)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    return base64.b64encode(buffer.getvalue()).decode("utf-8")


def build_ticket_svg(order: dict, customer: Optional[dict], qr_payload: str) -> bytes:
    lines = build_ticket_lines(order, customer)
    qr_base64 = build_qr_png_base64(qr_payload)
    qr_size = 180
    padding = 20
    line_height = 16
    font_size = 12
    text_x = padding + qr_size + 20
    height = max(qr_size + padding * 2, padding * 2 + line_height * len(lines))
    width = 760

    text_lines = []
    for index, line in enumerate(lines):
        dy = line_height if index > 0 else 0
        text_lines.append(
            f"<tspan x='{text_x}' dy='{dy}'>{html.escape(line)}</tspan>"
        )

    svg = f"""
<svg xmlns='http://www.w3.org/2000/svg' width='{width}' height='{height}'>
  <rect width='100%' height='100%' fill='white'/>
  <image href='data:image/png;base64,{qr_base64}' x='{padding}' y='{padding}' width='{qr_size}' height='{qr_size}' />
  <text x='{text_x}' y='{padding + font_size}' font-family='Courier New, monospace' font-size='{font_size}' fill='#111'>
    {''.join(text_lines)}
  </text>
</svg>
"""
    return svg.encode("utf-8")


def parse_qr_payload(payload: str):
    try:
        data = json.loads(payload)
        if isinstance(data, dict):
            return data
    except Exception:
        return {}
    return {}


def build_address_parts(address: Optional[str]):
    if not address:
        return {"full": None, "street": None, "city": None, "postal_code": None}
    parts = [p.strip() for p in address.split(",") if p.strip()]
    street = parts[0] if parts else address
    city = parts[1] if len(parts) > 1 else None
    postal_code = None
    if len(parts) > 2:
        postal_code = parts[-1].split()[-1]
    return {"full": address, "street": street, "city": city, "postal_code": postal_code}


# ── JSON / AI helpers ────────────────────────────────────────────────

def extract_json_payload(text: str):
    cleaned = text.strip()
    if "```" in cleaned:
        start = cleaned.find("```")
        end = cleaned.rfind("```")
        if end > start:
            cleaned = cleaned[start + 3:end].strip()
            if cleaned.startswith("json"):
                cleaned = cleaned[4:].strip()
    return json.loads(cleaned)


def call_ollama(prompt: str):
    """Use Groq API for AI responses."""
    import os
    from groq import Groq

    api_key = os.environ.get("GROQ_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="Groq API key not configured")

    client = Groq(api_key=api_key)
    models = ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"]
    last_error = None

    for model in models:
        for attempt in range(3):
            try:
                chat_completion = client.chat.completions.create(
                    messages=[{"role": "user", "content": prompt}],
                    model=model,
                    temperature=0.65,
                    max_tokens=2048
                )
                return chat_completion.choices[0].message.content.strip()
            except Exception as e:
                last_error = e
                wait_seconds = 0.6 * (attempt + 1)
                logger.warning(f"Groq API retry model={model} attempt={attempt + 1}: {e}")
                time.sleep(wait_seconds)
                continue

    logger.error(f"Groq API error after retries: {last_error}")
    raise HTTPException(status_code=502, detail=f"AI service error: {str(last_error)}")


# ── Import / mapping helpers ────────────────────────────────────────

def normalize_header(value: str):
    return value.strip().lower()


def set_nested_value(target: dict, path: str, value):
    parts = path.split(".")
    current = target
    for key in parts[:-1]:
        if key not in current or not isinstance(current[key], dict):
            current[key] = {}
        current = current[key]
    current[parts[-1]] = value


def suggest_mapping(headers: List[str]):
    mapping = {}
    for header in headers:
        key = normalize_header(header)
        if key in ["issue key", "key", "id", "order_number", "order number"]:
            mapping[header] = "order_number"
        elif key in ["status", "estado", "state"]:
            mapping[header] = "estado_actual"
        elif key in ["created", "created_at", "fecha", "creation date"]:
            mapping[header] = "tiempos.creacion"
        elif key in ["customer", "customer_name", "name", "cliente"]:
            mapping[header] = "customer_name"
        elif key in ["email", "correo", "customer_email"]:
            mapping[header] = "customer_email"
        elif key in ["phone", "telefono", "customer_phone"]:
            mapping[header] = "customer_phone"
        elif key in ["service_type", "service", "tipo servicio"]:
            mapping[header] = "service_type"
        elif key in ["notes", "summary", "descripcion", "description"]:
            mapping[header] = "notes"
    return mapping


async def resolve_or_create_customer_from_row(row: dict):
    email = row.get("customer_email")
    phone = row.get("customer_phone")
    name = row.get("customer_name") or "Legacy"
    query = []
    if email:
        query.append({"email": email.lower()})
    if phone:
        query.append({"phone": phone})
    if query:
        existing = await db.customers.find_one({"$or": query}, {"_id": 0})
        if existing:
            return existing["id"]
    customer_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    customer = {
        "id": customer_id,
        "name": name,
        "email": email.lower() if email else None,
        "phone": phone,
        "address": None,
        "preferred_contact": "email",
        "notes": "Importación legacy",
        "status": "active",
        "total_orders": 0,
        "created_at": now,
        "updated_at": now
    }
    await db.customers.insert_one(customer)
    return customer_id


# ── Audit log ────────────────────────────────────────────────────────

async def create_audit_log(event_type: str, entity_type: str, entity_id: str, user_id: str = None, details: dict = None):
    log = {
        "id": str(uuid.uuid4()),
        "event_type": event_type,
        "entity_type": entity_type,
        "entity_id": entity_id,
        "user_id": user_id,
        "details": details,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.audit_logs.insert_one(log)


# ── AI index / business rules ───────────────────────────────────────

ai_indexes_ready = False


async def ensure_ai_indexes():
    global ai_indexes_ready
    if ai_indexes_ready:
        return
    await db.patrones_detectados.create_index([("fecha_deteccion", -1)])
    await db.propuestas_ia.create_index([("estado", 1), ("fecha_generacion", -1)])
    await db.importaciones_legacy.create_index([("origen", 1), ("fecha_importacion", -1)])
    await db.audit_logs.create_index([("created_at", -1)])
    ai_indexes_ready = True


async def get_or_seed_business_rules():
    rules = await db.reglas_negocio.find_one({"id": "order_rules_v1"}, {"_id": 0})
    if rules:
        return rules
    now = datetime.now(timezone.utc).isoformat()
    rules = {
        "id": "order_rules_v1",
        "type": "order_rules",
        "auto_transitions": {
            "pickup_delivery": {"notify_status": "out_for_delivery"},
            "wash_fold": {"notify_status": "ready"},
            "self_service": {"notify_status": "ready"}
        },
        "sla_hours": {
            "pickup_delivery": 48,
            "wash_fold": 36,
            "self_service": 24
        },
        "created_at": now,
        "updated_at": now
    }
    await db.reglas_negocio.insert_one(rules)
    return rules
