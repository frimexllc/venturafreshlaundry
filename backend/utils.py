"""
Shared utility functions: QR generation, ticket formatting, order helpers, membership, etc.
"""
import io
import json
import html
import base64
import uuid
import time
import logging
import os
from typing import Any, Dict, List, Optional
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

import qrcode
from qrcode.image.svg import SvgImage
from fastapi import HTTPException

from database import db
from models import OrderCreate, PreferenceCreate

logger = logging.getLogger(__name__)

# ── Timezone: Ventura, California ────────────────────────────────────
TZ_PACIFIC = ZoneInfo("America/Los_Angeles")

def now_utc():
    return datetime.now(timezone.utc)

def now_pacific():
    return datetime.now(TZ_PACIFIC)

def to_pacific(dt_str):
    if not dt_str:
        return dt_str
    try:
        if isinstance(dt_str, datetime):
            dt = dt_str
        else:
            dt_str = str(dt_str)
            if dt_str.endswith("Z"):
                dt_str = dt_str[:-1] + "+00:00"
            dt = datetime.fromisoformat(dt_str)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(TZ_PACIFIC).isoformat()
    except Exception:
        return dt_str

def now_iso():
    return now_utc().isoformat()

def now_pacific_display():
    dt = now_pacific()
    return dt.strftime("%b %d, %Y %I:%M %p PT")


# ── Normalization helpers ────────────────────────────────────────────
import re as _re

def normalize_spaces(value):
    if not value or not isinstance(value, str):
        return value
    return " ".join(value.split()).strip()

def normalize_email(value):
    if not value or not isinstance(value, str):
        return value
    return value.strip().lower()

def normalize_phone(value):
    if not value or not isinstance(value, str):
        return value
    digits = _re.sub(r"[^\d+]", "", value.strip())
    return digits if digits else value.strip()

def normalize_address(value):
    if not value or not isinstance(value, str):
        return value
    return normalize_spaces(value)

def normalize_preference_dict(data):
    if not data or not isinstance(data, dict):
        return data
    return {k: normalize_spaces(v) if isinstance(v, str) else v for k, v in data.items()}

def normalize_name(value):
    if not value or not isinstance(value, str):
        return value
    return " ".join(value.split()).strip().title()

def normalize_yes_no(value):
    if not value or not isinstance(value, str):
        return value
    v = value.strip().lower()
    if v in ("yes", "si", "sí", "1", "true"):
        return "yes"
    if v in ("no", "0", "false"):
        return "no"
    return value.strip()

def normalize_preference_payload(data: PreferenceCreate) -> Dict[str, Any]:
    """
    Normaliza un PreferenceCreate en un dict limpio listo para persistir.
    Movido aquí desde routes/customers.py para ser compartido con routes/services.py.
    """
    def normalize_list(value):
        if not value:
            return []
        if isinstance(value, list):
            return [normalize_spaces(v) for v in value if normalize_spaces(v)]
        if isinstance(value, str):
            cleaned = normalize_spaces(value)
            return [v for v in (item.strip() for item in cleaned.split(",")) if v]
        return []

    return {
        "detergent_type": normalize_spaces(data.detergent_type) or "standard",
        "water_temperature": normalize_spaces(data.water_temperature),
        "fabric_softener": normalize_spaces(data.fabric_softener),
        "folding_style": normalize_spaces(data.folding_style) or "standard",
        "hanging_instructions": normalize_spaces(data.hanging_instructions),
        "allergies": normalize_spaces(data.allergies),
        "special_instructions": normalize_spaces(data.special_instructions),
        "pickup_time_preference": normalize_spaces(data.pickup_time_preference),
        "gate_code": normalize_spaces(data.gate_code),
        "hang_dry_items": normalize_list(data.hang_dry_items),
        "fragrance_preference": normalize_spaces(data.fragrance_preference) or "light",
    }


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
        "otro": "other", "other": "other",
    }
    return mapping.get(normalized, normalized)

def build_order_times(now_iso_str: str, status_value: str):
    return {
        "creacion": now_iso_str,
        "ultimo_cambio_estado": now_iso_str,
        "fechas_estado": {status_value: now_iso_str},
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

def is_active_member(order: Optional[dict], customer: Optional[dict]) -> bool:
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


# ── Customer ownership helpers (fuente única de verdad) ──────────────

async def get_customer_ids_by_email(email: str) -> set:
    """
    Devuelve todos los customer IDs que comparten el mismo email.
    Maneja registros duplicados de clientes.
    """
    if not email:
        return set()
    customers = await db.customers.find(
        {"email": {"$regex": f"^{email}$", "$options": "i"}},
        {"_id": 0, "id": 1},
    ).to_list(20)
    return {c["id"] for c in customers if c.get("id")}


async def customer_owns_order(order: dict, customer: dict) -> bool:
    """
    Verifica si una orden pertenece al cliente dado.
    Comprueba: ID directo → email directo → IDs vinculados por email.
    """
    if not customer:
        return False
    current_id = customer.get("id", "")
    current_email = (customer.get("email") or "").lower()
    order_cid = order.get("customer_id", "")
    order_email = (order.get("customer_email") or "").lower()

    if order_cid == current_id:
        return True
    if current_email and order_email and order_email == current_email:
        return True
    if order_cid and current_email:
        linked_ids = await get_customer_ids_by_email(current_email)
        if order_cid in linked_ids:
            return True
    return False


# ── Delivery fee (canonical) ─────────────────────────────────────────

def calculate_delivery_fee(distance_miles) -> float:
    """
    CANONICAL delivery fee — single source of truth.

    Rules:
        0 – 3 miles   →  FREE  ($0.00)
        3 – 10 miles  →  $1.50/mile after mile 3, clamped [$2.99, $5.99]
        > 10 miles    →  $5.99  (defensive cap)
        None/unknown  →  $0.00
    """
    if distance_miles is None:
        return 0.0
    try:
        d = float(distance_miles)
    except (TypeError, ValueError):
        return 0.0

    if d <= 3.0:
        return 0.0
    if d > 10.0:
        return 5.99

    raw = (d - 3.0) * 1.50
    return round(max(2.99, min(raw, 5.99)), 2)


# ── Sincronica: calculate_service_amount (sin descuento de membresía) ──

def calculate_service_amount(order: dict, customer) -> Optional[float]:
    """
    Calculate total amount WITHOUT membership discount.
    (Deprecated for final billing – use calculate_final_amount_with_membership async)
    """
    service_type = (order.get("service_type") or "pickup_delivery").strip().lower().replace(" ", "_")
    lbs_value = order.get("actual_lbs")
    if lbs_value is None:
        return None
    try:
        lbs_value = float(lbs_value)
    except (TypeError, ValueError):
        return None
    if lbs_value <= 0:
        return None

    PRICING_PD = {
        "standard": {"member": 2.50, "regular": 2.75},
        "premium":  {"member": 2.75, "regular": 3.00},
        "express":  {"member": 3.00, "regular": 3.25},
    }
    PRICING_WF = {"standard": 2.25, "premium": 2.50, "express": 2.75}

    plan = (order.get("service_plan") or "standard").lower()
    stored_rate = order.get("price_per_lb")

    if stored_rate and float(stored_rate) > 0:
        rate = float(stored_rate)
    elif service_type == "wash_fold":
        rate = PRICING_WF.get(plan, PRICING_WF["standard"])
    else:
        tier = PRICING_PD.get(plan, PRICING_PD["standard"])
        rate = tier["member"] if is_active_member(order, customer) else tier["regular"]

    if service_type == "wash_fold":
        billable_lbs = max(lbs_value, 10)
        amount = billable_lbs * rate
    else:
        amount = max(lbs_value * rate, 40.0)

    amount += calculate_delivery_fee(order.get("distance_miles"))

    for svc in (order.get("addon_services") or []):
        try:
            amount += float(svc.get("price", 0) or 0) * int(svc.get("qty", 1) or 1)
        except (TypeError, ValueError):
            pass

    payment_method = (order.get("payment_method") or "").strip().lower()
    if payment_method in ("card", "stripe"):
        amount += round(amount * 0.03, 2)

    return round(float(amount), 2)


# ── Membership async helpers ─────────────────────────────────────────

def _get_rate(service_type: str, plan: str, is_member: bool, stored_rate: Optional[float] = None) -> float:
    PRICING_PD = {
        "standard": {"member": 2.50, "regular": 2.75},
        "premium":  {"member": 2.75, "regular": 3.00},
        "express":  {"member": 3.00, "regular": 3.25},
    }
    PRICING_WF = {"standard": 2.25, "premium": 2.50, "express": 2.75}

    if stored_rate and stored_rate > 0:
        return stored_rate
    if service_type == "wash_fold":
        return PRICING_WF.get(plan, PRICING_WF["standard"])
    tier = PRICING_PD.get(plan, PRICING_PD["standard"])
    return tier["member"] if is_member else tier["regular"]


async def get_remaining_membership_allowance(customer_id: str, plan_name: str) -> float:
    """
    Retorna las libras restantes en el ciclo actual del cliente.
    Si no hay ciclo activo, retorna el allowance completo del plan.
    """
    usage = await get_customer_cycle_usage(customer_id)
    if not usage:
        plan_lower = plan_name.lower()
        if "elite" in plan_lower:
            return 120.0
        elif "family plus" in plan_lower or "family" in plan_lower:
            return 90.0
        elif "most popular" in plan_lower or "popular" in plan_lower:
            return 60.0
        return 0.0
    return usage.get("lbs_remaining", 0.0)


async def calculate_final_amount_with_membership(order: dict, customer: dict) -> Optional[dict]:
    """
    Calcula el monto final a pagar aplicando descuento de membresía sobre
    las libras cubiertas por el allowance restante.

    Returns dict con claves:
        subtotal, delivery_fee, addons_total, membership_discount,
        processing_fee, total, lbs_covered, lbs_extra
    Returns None si no hay actual_lbs válido.
    """
    lbs = order.get("actual_lbs")
    if lbs is None:
        return None
    try:
        lbs = float(lbs)
    except (TypeError, ValueError):
        return None
    if lbs <= 0:
        return None

    service_type = (order.get("service_type") or "pickup_delivery").strip().lower().replace(" ", "_")
    plan = (order.get("service_plan") or "standard").lower()
    stored_rate = order.get("price_per_lb")
    is_member = is_active_member(order, customer)

    rate = _get_rate(service_type, plan, is_member, stored_rate)

    if service_type == "wash_fold":
        billable_lbs = max(lbs, 10.0)
        subtotal = billable_lbs * rate
    else:
        subtotal = max(lbs * rate, 40.0)

    delivery_fee = calculate_delivery_fee(order.get("distance_miles"))

    addons_total = 0.0
    for addon in order.get("addon_services", []):
        try:
            addons_total += float(addon.get("price", 0)) * int(addon.get("qty", 1))
        except (TypeError, ValueError):
            pass

    # Descuento por membresía + libras cubiertas/extra
    discount = 0.0
    lbs_covered = 0.0
    lbs_extra = lbs
    if is_member and customer and customer.get("membership_plan"):
        remaining = await get_remaining_membership_allowance(
            customer.get("id"), customer.get("membership_plan")
        )
        lbs_covered = min(lbs, remaining)
        lbs_extra = max(0.0, lbs - lbs_covered)
        discount = lbs_covered * rate

    total_before_processing = max(0.0, subtotal + delivery_fee + addons_total - discount)

    payment_method = (order.get("payment_method") or "").strip().lower()
    processing_fee = (
        round(total_before_processing * 0.03, 2)
        if payment_method in ("card", "stripe")
        else 0.0
    )
    final_total = round(total_before_processing + processing_fee, 2)

    return {
        "subtotal": round(subtotal, 2),
        "delivery_fee": round(delivery_fee, 2),
        "addons_total": round(addons_total, 2),
        "membership_discount": round(discount, 2),
        "processing_fee": processing_fee,
        "total": final_total,
        "lbs_covered": round(lbs_covered, 1),
        "lbs_extra": round(lbs_extra, 1),
    }


async def should_skip_payment_notification(order: dict, customer: dict) -> bool:
    """
    Retorna True solo si el cliente NO tiene que pagar NADA extra
    después de aplicar el allowance de membresía.
    """
    if not is_active_member(order, customer):
        return False
    final = await calculate_final_amount_with_membership(order, customer)
    if not final:
        return False
    return final["total"] <= 0.50



def should_notify_order_status(status: str) -> bool:
    """Return True if this status change should trigger a customer notification."""
    _NO_NOTIFY = {"pickup_scheduled"}
    return status not in _NO_NOTIFY


async def get_customer_cycle_usage(customer_id: str) -> Optional[dict]:
    """Get membership cycle usage for a customer."""
    membership = await db.memberships.find_one(
        {"customer_id": customer_id, "status": "active"},
        {"_id": 0},
    )
    if not membership:
        return None

    plan_name = membership.get("plan", "")
    # Map plan to lbs allowance
    PLAN_LBS = {
        "most popular": 60, "family plus": 90, "elite concierge": 120,
        "popular": 60, "family": 90, "elite": 120,
    }
    lbs_allowance = PLAN_LBS.get(plan_name.lower(), 60)

    # Get cycle dates (monthly from membership start)
    from dateutil.relativedelta import relativedelta
    created = membership.get("created_at", "")
    try:
        start_dt = datetime.fromisoformat(created.replace("Z", "+00:00"))
    except Exception:
        start_dt = datetime.now(timezone.utc)

    now = datetime.now(timezone.utc)
    cycle_start = start_dt.replace(day=start_dt.day if start_dt.day <= 28 else 28)
    while cycle_start + relativedelta(months=1) <= now:
        cycle_start += relativedelta(months=1)
    cycle_end = cycle_start + relativedelta(months=1)

    # Sum lbs from orders in current cycle
    customer_ids = list(await get_customer_ids_by_email(
        membership.get("customer_email", "")
    )) if membership.get("customer_email") else [customer_id]

    pipeline = [
        {"$match": {
            "customer_id": {"$in": customer_ids},
            "created_at": {"$gte": cycle_start.isoformat(), "$lt": cycle_end.isoformat()},
            "status": {"$nin": ["cancelled"]},
        }},
        {"$group": {"_id": None, "total_lbs": {"$sum": {"$ifNull": ["$actual_lbs", 0]}}}},
    ]
    result = await db.orders.aggregate(pipeline).to_list(1)
    lbs_used = round(result[0]["total_lbs"], 2) if result and result[0].get("total_lbs") else 0

    lbs_remaining = max(0, round(lbs_allowance - lbs_used, 2))
    pct_used = round((lbs_used / lbs_allowance) * 100, 1) if lbs_allowance > 0 else 0

    return {
        "plan": plan_name,
        "lbs_allowance": lbs_allowance,
        "lbs_used": lbs_used,
        "lbs_remaining": lbs_remaining,
        "pct_used": pct_used,
        "cycle_start": cycle_start.isoformat(),
        "cycle_end": cycle_end.isoformat(),
    }


# ── QR / Ticket helpers ──────────────────────────────────────────────

def build_qr_svg(payload: str):
    img = qrcode.make(payload, image_factory=SvgImage, box_size=10, border=2)
    buffer = io.BytesIO()
    img.save(buffer)
    return buffer.getvalue()

def build_qr_payload(order: dict):
    return json.dumps({
        "order_id": order.get("id"),
        "order_number": order.get("order_number"),
        "qr_token": order.get("qr_token"),
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
        summary,
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
    """Generate professional ticket SVG with QR, price breakdown, weight metrics and add-ons."""
    qr_base64 = build_qr_png_base64(qr_payload)
    customer = customer or {}
    display_id = build_display_order_number(order)
    status = (order.get("status") or "new").upper()
    name = order.get("customer_name") or customer.get("name") or "-"
    phone = customer.get("phone") or order.get("customer_phone") or "-"
    pickup_date = order.get("pickup_date") or "-"
    window = format_time_window(order.get("pickup_time_window") or order.get("pickup_time"))
    address = order.get("pickup_address") or order.get("delivery_address") or customer.get("address") or "-"
    service = order.get("service_type") or "Standard"
    payment_status = (order.get("payment_status") or "pending").upper()
    payment_method = (order.get("payment_method") or "-").upper()

    def safe_float(v, fallback="--"):
        if v is None or v == "":
            return fallback
        try:
            return f"{float(v):.1f}"
        except Exception:
            return str(v)

    def safe_currency(v, fallback="--"):
        if v is None or v == "":
            return fallback
        try:
            return f"${float(v):.2f}"
        except Exception:
            return str(v)

    est_lbs = safe_float(order.get("estimated_lbs"))
    act_lbs = safe_float(order.get("actual_lbs") or order.get("actual_weight"))
    total = safe_currency(order.get("total_amount") or order.get("total"))
    rate = safe_currency(order.get("price_per_lb") or order.get("rate"))
    delivery_fee = safe_currency(order.get("delivery_fee"))
    subtotal = safe_currency(order.get("subtotal"))
    notes = order.get("notes") or order.get("special_instructions") or ""
    if len(notes) > 60:
        notes = notes[:57] + "..."

    W, H = 400, 580
    addon_services = order.get("addon_services", [])
    addon_lines = ""
    current_y = 414
    if addon_services:
        for addon in addon_services:
            addon_name = addon.get("name", "Add-on")
            addon_price = float(addon.get("price") or 0)
            if addon_price > 0:
                addon_lines += (
                    f"\n  <text x='16' y='{current_y}' class='sm'>{html.escape(addon_name)}</text>"
                    f"\n  <text x='{W-16}' y='{current_y}' text-anchor='end' class='val'>${addon_price:.2f}</text>"
                )
                current_y += 18
        if addon_lines:
            addon_lines = (
                f"\n  <line x1='16' y1='{current_y-22}' x2='{W-16}' y2='{current_y-22}'"
                f" stroke='#cbd5e1' stroke-dasharray='2,2'/>"
            ) + addon_lines

    status_colors = {
        "NEW": "#2563eb", "CONFIRMED": "#7c3aed", "PICKED_UP": "#4f46e5",
        "PROCESSING": "#9333ea", "READY": "#0d9488", "OUT_FOR_DELIVERY": "#ea580c",
        "DELIVERED": "#16a34a", "COMPLETED": "#059669", "CANCELLED": "#dc2626",
    }
    sc = status_colors.get(status, "#6b7280")

    svg = f"""<svg xmlns='http://www.w3.org/2000/svg' width='{W}' height='{H}' viewBox='0 0 {W} {H}'>
  <defs>
    <style>
      .hdr {{font-family:'Helvetica Neue',Arial,sans-serif;font-weight:700;fill:#111}}
      .lbl {{font-family:'Helvetica Neue',Arial,sans-serif;font-size:9px;fill:#6b7280;text-transform:uppercase;letter-spacing:0.5px}}
      .val {{font-family:'Helvetica Neue',Arial,sans-serif;font-size:11px;fill:#1e293b;font-weight:600}}
      .sm  {{font-family:'Helvetica Neue',Arial,sans-serif;font-size:10px;fill:#475569}}
    </style>
  </defs>
  <rect width='{W}' height='{H}' rx='8' fill='white' stroke='#e2e8f0' stroke-width='1'/>
  <rect width='{W}' height='52' rx='8' fill='#0f172a'/>
  <rect y='44' width='{W}' height='8' fill='#0f172a'/>
  <text x='16' y='22' class='hdr' font-size='14' fill='white'>VENTURA FRESH LAUNDRY</text>
  <text x='16' y='40' font-size='9' fill='#94a3b8' font-family='Arial'>Order Ticket / Recibo de Orden</text>
  <rect x='{W-90}' y='10' width='74' height='22' rx='4' fill='{sc}'/>
  <text x='{W-53}' y='25' text-anchor='middle' font-size='9' fill='white' font-family='Arial' font-weight='700'>{html.escape(status)}</text>
  <image href='data:image/png;base64,{qr_base64}' x='16' y='64' width='110' height='110'/>
  <text x='140' y='80' class='lbl'>ORDER / ORDEN</text>
  <text x='140' y='96' class='hdr' font-size='16'>{html.escape(display_id)}</text>
  <text x='140' y='114' class='lbl'>SERVICE / SERVICIO</text>
  <text x='140' y='129' class='val'>{html.escape(str(service).replace("_"," ").title())}</text>
  <text x='140' y='147' class='lbl'>DATE / FECHA</text>
  <text x='140' y='162' class='val'>{html.escape(str(pickup_date))} {html.escape(str(window))}</text>
  <line x1='16' y1='184' x2='{W-16}' y2='184' stroke='#e2e8f0' stroke-dasharray='4,3'/>
  <text x='16' y='202' class='lbl'>CUSTOMER / CLIENTE</text>
  <text x='16' y='216' class='val'>{html.escape(name)}</text>
  <text x='16' y='232' class='sm'>{html.escape(phone)}</text>
  <text x='16' y='248' class='sm'>{html.escape(address[:50])}</text>
  <line x1='16' y1='262' x2='{W-16}' y2='262' stroke='#e2e8f0' stroke-dasharray='4,3'/>
  <text x='16' y='280' class='lbl'>WEIGHT METRICS / METRICAS DE PESO</text>
  <rect x='16' y='288' width='115' height='44' rx='6' fill='#f1f5f9'/>
  <text x='73' y='304' text-anchor='middle' class='lbl'>EST. LBS</text>
  <text x='73' y='322' text-anchor='middle' class='hdr' font-size='16'>{html.escape(est_lbs)}</text>
  <rect x='143' y='288' width='115' height='44' rx='6' fill='#f1f5f9'/>
  <text x='200' y='304' text-anchor='middle' class='lbl'>ACTUAL LBS</text>
  <text x='200' y='322' text-anchor='middle' class='hdr' font-size='16'>{html.escape(act_lbs)}</text>
  <rect x='270' y='288' width='115' height='44' rx='6' fill='#f1f5f9'/>
  <text x='327' y='304' text-anchor='middle' class='lbl'>RATE/LB</text>
  <text x='327' y='322' text-anchor='middle' class='hdr' font-size='16'>{html.escape(rate)}</text>
  <line x1='16' y1='346' x2='{W-16}' y2='346' stroke='#e2e8f0' stroke-dasharray='4,3'/>
  <text x='16' y='364' class='lbl'>PRICE BREAKDOWN / DESGLOSE</text>
  <text x='16' y='384' class='sm'>Subtotal</text>
  <text x='{W-16}' y='384' text-anchor='end' class='val'>{html.escape(subtotal)}</text>
  <text x='16' y='402' class='sm'>Delivery Fee / Envio</text>
  <text x='{W-16}' y='402' text-anchor='end' class='val'>{html.escape(delivery_fee)}</text>
  {addon_lines}
  <line x1='16' y1='{current_y-4}' x2='{W-16}' y2='{current_y-4}' stroke='#cbd5e1'/>
  <text x='16' y='{current_y+14}' class='hdr' font-size='13'>TOTAL</text>
  <text x='{W-16}' y='{current_y+14}' text-anchor='end' class='hdr' font-size='16'>{html.escape(total)}</text>
  <rect x='16' y='{current_y+34}' width='{W-32}' height='30' rx='6' fill='{"#dcfce7" if payment_status == "PAID" else "#fef3c7"}'/>
  <text x='{W//2}' y='{current_y+54}' text-anchor='middle' font-size='11' font-weight='700'
        fill='{"#166534" if payment_status == "PAID" else "#92400e"}' font-family='Arial'>
    PAYMENT: {html.escape(payment_status)} | METHOD: {html.escape(payment_method)}
  </text>
  {"" if not notes else f"<text x='16' y='{current_y+86}' class='lbl'>NOTES</text><text x='16' y='{current_y+100}' class='sm'>{html.escape(notes)}</text>"}
  <line x1='16' y1='{H-36}' x2='{W-16}' y2='{H-36}' stroke='#e2e8f0'/>
  <text x='{W//2}' y='{H-18}' text-anchor='middle' font-size='8' fill='#94a3b8' font-family='Arial'>Ventura Fresh Laundry | (820) 234-8181 | venturafreshlaundry.com</text>
</svg>"""
    return svg.encode("utf-8")

def parse_qr_payload(payload: str):
    try:
        data = json.loads(payload)
        if isinstance(data, dict):
            return data
    except Exception:
        pass
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
                    max_tokens=2048,
                )
                return chat_completion.choices[0].message.content.strip()
            except Exception as e:
                last_error = e
                time.sleep(0.6 * (attempt + 1))
                continue
    logger.error(f"Groq API error after retries: {last_error}")
    raise HTTPException(status_code=502, detail=f"AI service error: {str(last_error)}")


# ── Import / mapping helpers ─────────────────────────────────────────

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
        if existing and "id" in existing:
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
        "updated_at": now,
    }
    await db.customers.insert_one(customer)
    return customer_id


# ── Audit log ────────────────────────────────────────────────────────

async def create_audit_log(
    event_type: str,
    entity_type: str,
    entity_id: str,
    user_id: str = None,
    details: dict = None,
):
    log = {
        "id": str(uuid.uuid4()),
        "event_type": event_type,
        "entity_type": entity_type,
        "entity_id": entity_id,
        "user_id": user_id,
        "details": details,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.audit_logs.insert_one(log)


# ── AI index / business rules ────────────────────────────────────────

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
            "self_service": {"notify_status": "ready"},
        },
        "sla_hours": {
            "pickup_delivery": 48,
            "wash_fold": 36,
            "self_service": 24,
        },
        "created_at": now,
        "updated_at": now,
    }
    await db.reglas_negocio.insert_one(rules)
    return rules


# ── Membership plan allowance helpers ────────────────────────────────

def _get_lbs_allowance_from_plan_name(plan_name: str) -> int:
    if not plan_name:
        return 0
    pn = plan_name.lower()
    if "most popular" in pn:
        return 60
    if "family plus" in pn:
        return 90
    if "elite concierge" in pn:
        return 120
    return 0


async def get_customer_cycle_usage(customer_id: str) -> Optional[dict]:
    """
    Calcula el uso del ciclo actual de la membresía del cliente
    basándose en las órdenes completadas/entregadas dentro del periodo
    que tengan actual_lbs > 0 (peso real registrado).
    """
    customer = await db.customers.find_one({"id": customer_id}, {"_id": 0})
    if not customer:
        return None

    membership_status = customer.get("membership_status")
    membership_plan = customer.get("membership_plan")
    if membership_status != "active" or not membership_plan:
        return None

    lbs_allowance = _get_lbs_allowance_from_plan_name(membership_plan)
    if lbs_allowance == 0:
        return None

    start_str = customer.get("membership_start_date") or customer.get("created_at")
    if not start_str:
        return None

    try:
        start_date = datetime.fromisoformat(start_str.replace("Z", "+00:00"))
    except Exception:
        return None

    now = datetime.now(timezone.utc)
    day_of_month = min(start_date.day, 28)
    current_cycle_start = start_date.replace(
        year=now.year, month=now.month, day=day_of_month
    )
    if current_cycle_start > now:
        if current_cycle_start.month == 1:
            current_cycle_start = current_cycle_start.replace(year=now.year - 1, month=12)
        else:
            current_cycle_start = current_cycle_start.replace(
                month=current_cycle_start.month - 1
            )

    if current_cycle_start.month == 12:
        current_cycle_end = current_cycle_start.replace(
            year=current_cycle_start.year + 1, month=1, day=day_of_month
        )
    else:
        current_cycle_end = current_cycle_start.replace(
            month=current_cycle_start.month + 1, day=day_of_month
        )

    pipeline = [
        {
            "$match": {
                "customer_id": customer_id,
                "status": {"$in": ["completed", "delivered"]},
                "actual_lbs": {"$gt": 0},
                "created_at": {
                    "$gte": current_cycle_start.isoformat(),
                    "$lt": current_cycle_end.isoformat(),
                },
            }
        },
        {"$group": {"_id": None, "total_lbs": {"$sum": "$actual_lbs"}}},
    ]
    agg_result = await db.orders.aggregate(pipeline).to_list(1)
    lbs_used = round(agg_result[0]["total_lbs"] if agg_result else 0, 1)
    lbs_remaining = max(0, lbs_allowance - lbs_used)
    pct_used = round((lbs_used / lbs_allowance) * 100, 1) if lbs_allowance > 0 else 0

    return {
        "pct_used": pct_used,
        "lbs_used": lbs_used,
        "lbs_allowance": lbs_allowance,
        "lbs_remaining": lbs_remaining,
        "plan": membership_plan,
        "cycle_start": current_cycle_start.strftime("%Y-%m-%d"),
        "cycle_end": current_cycle_end.strftime("%Y-%m-%d"),
    }