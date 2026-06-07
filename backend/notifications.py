"""
Notification services — Ventura Fresh Laundry  v4.1
FIXES:
  - Expanded WASH_FOLD_TYPES set to match all possible service_type values stored in DB
  - normalize_status_value now strips and lowercases before lookup (consistent)
  - EVENT_MAPPING covers wash_fold statuses in both uppercase and lowercase
  - Added debug logging for flow detection to ease future troubleshooting
  - payment_request flow preserved, milestones check preserved
"""

import os
import logging
import json
import asyncio
import urllib.parse
import xml.sax.saxutils
from datetime import datetime, time as dtime, timezone
from typing import Optional, Dict, Any, Set, Tuple

from twilio.rest import Client
from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail
from groq import Groq

logger = logging.getLogger(__name__)

# ── Config ────────────────────────────────────────────────────────────
TWILIO_ACCOUNT_SID      = os.environ.get("TWILIO_ACCOUNT_SID")
TWILIO_AUTH_TOKEN       = os.environ.get("TWILIO_AUTH_TOKEN")
TWILIO_PHONE_NUMBER     = os.environ.get("TWILIO_PHONE_NUMBER")
TWILIO_WHATSAPP_NUMBER  = os.environ.get("TWILIO_WHATSAPP_NUMBER")

FRONTEND_URL = os.environ.get("FRONTEND_URL") or os.environ.get("DEPLOY_URL") or "https://route-optimize-fresh.preview.emergentagent.com"

BUSINESS_NAME           = os.environ.get("BUSINESS_NAME", "Ventura Fresh Laundry")
BUSINESS_ADDRESS        = os.environ.get("BUSINESS_ADDRESS", "Ventura, CA")
BUSINESS_PHONE_DISPLAY  = os.environ.get("BUSINESS_PHONE_DISPLAY", "")
BUSINESS_WEBSITE        = os.environ.get("BUSINESS_WEBSITE", "https://venturafreshlaundry.com")
SENDGRID_API_KEY        = os.environ.get("SENDGRID_API_KEY")
SENDGRID_FROM_EMAIL     = os.environ.get("SENDGRID_FROM_EMAIL")
SENDGRID_FROM_NAME      = os.environ.get("SENDGRID_FROM_NAME", BUSINESS_NAME)
SENDGRID_DATA_RESIDENCY = os.environ.get("SENDGRID_DATA_RESIDENCY", "").lower()
GROQ_API_KEY            = os.environ.get("GROQ_API_KEY")
USE_ULTRA_PREMIUM       = os.environ.get("USE_ULTRA_PREMIUM", "false").lower() == "true"
ADMIN_PHONE             = os.environ.get("ADMIN_PHONE", "")
DEFAULT_LANGUAGE        = os.environ.get("DEFAULT_LANGUAGE", "en-US").lower()

# ── Footer (monolingüe según idioma) ─────────────────────────────────
def _support_footer(is_es: bool = False):
    if is_es:
        return (
            "\n\n---\nEste es un mensaje automatizado de Ventura Fresh Laundry. "
            "Por favor, no responda a este mensaje. Para soporte o asistencia, "
            "llame o envíe un mensaje de texto al: (820) 234-8181 o envíe un correo "
            "electrónico a: info@venturafreshlaundry.com"
        )
    return (
        "\n\n---\nThis is an automated message from Ventura Fresh Laundry. "
        "Please do not reply to this message. For customer support or assistance, "
        "call or text: (820) 234-8181 or e-mail to: info@venturafreshlaundry.com"
    )

# ── Otros settings ────────────────────────────────────────────────────
QUIET_START             = os.environ.get("QUIET_HOURS_START", "21:00")
QUIET_END               = os.environ.get("QUIET_HOURS_END", "08:00")
MAX_RETRIES             = int(os.environ.get("TWILIO_MAX_RETRIES", "3"))
RETRY_DELAY             = float(os.environ.get("TWILIO_RETRY_DELAY", "1.5"))
ENFORCE_QUIET_HOURS     = os.environ.get("ENFORCE_QUIET_HOURS", "false").lower() == "true"
URL_SHORTENER_API       = os.environ.get("URL_SHORTENER_API", "none")
BITLY_API_TOKEN         = os.environ.get("BITLY_API_TOKEN", "")

# Brand colors
VFL_BLUE    = "#0ea5e9"
VFL_DARK    = "#0b1929"
VFL_NAVY    = "#0f2744"
VFL_ACCENT  = "#38bdf8"
VFL_SUCCESS = "#10b981"
VFL_WARN    = "#f59e0b"
VFL_DANGER  = "#ef4444"
VFL_GRAY    = "#64748b"
VFL_LIGHT   = "#f0f9ff"
VFL_BORDER  = "#e2e8f0"

_BORDER_COLORS = {
    VFL_ACCENT:  "#bae6fd",
    VFL_BLUE:    "#7dd3fc",
    VFL_SUCCESS: "#6ee7b7",
    VFL_WARN:    "#fcd34d",
    VFL_DANGER:  "#fca5a5",
}

def _border_color(accent: str) -> str:
    return _BORDER_COLORS.get(accent, "#bae6fd")

_sent_cache: Set[str] = set()
_audit_log: list = []

# ── FIX: Conjunto ampliado de tipos Wash & Fold ───────────────────────
# Todos los valores posibles que pueden llegar en order.service_type
WASH_FOLD_TYPES: Set[str] = {
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

async def _is_already_sent_db(key: str) -> bool:
    try:
        from database import db as _db
        doc = await _db.notification_dedupe.find_one({"key": key})
        return doc is not None
    except Exception:
        return key in _sent_cache

async def _mark_sent_db(key: str) -> None:
    _sent_cache.add(key)
    try:
        from database import db as _db
        await _db.notification_dedupe.update_one(
            {"key": key},
            {"$setOnInsert": {"key": key, "created_at": datetime.now(timezone.utc).isoformat()}},
            upsert=True,
        )
    except Exception:
        pass

def _log_attempt(entry: dict) -> None:
    _audit_log.append(entry)
    logger.debug(f"Audit: {entry}")
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            loop.create_task(_persist_log(entry))
    except Exception:
        pass

async def _persist_log(entry: dict):
    try:
        from database import db as _db
        entry["_persisted"] = True
        await _db.notification_logs.insert_one(entry)
    except Exception:
        pass

MILESTONES = {
    "wash_fold":       {"order_created", "order_received", "processing",
                        "ready_for_pickup", "completed"},
    "pickup_delivery": {"order_created", "pickup_confirmed", "processing",
                        "ready", "out_for_delivery", "delivered", "cancelled"},
    "quote":           {"order_created"},
    "contact":         {"order_created"},
    "support":         {"order_created"},
}

_NO_NOTIFY_STATUSES = {"pickup_scheduled"}

EVENT_MAPPING = {
    "order_created":    "order_created",
    "pickup_scheduled": "pickup_confirmed",
    "pickup_reminder":  "pickup_confirmed",
    "pickup_completed": "pickup_confirmed",
    "pickup_update":    "pickup_confirmed",
    "status_changed":   None,
}

# ── FIX: Mapas de status → evento para cada flujo ────────────────────
# Soportan tanto MAYÚSCULAS (automation_engine) como minúsculas (orders.py)
_WF_STATUS_MAP = {
    # minúsculas
    "confirmed":  "order_received",
    "processing": "processing",
    "ready":      "ready_for_pickup",
    "completed":  "completed",
    "cancelled":  "cancelled",
    # MAYÚSCULAS
    "CONFIRMED":  "order_received",
    "PROCESSING": "processing",
    "READY":      "ready_for_pickup",
    "COMPLETED":  "completed",
    "CANCELLED":  "cancelled",
}

_PD_STATUS_MAP = {
    # minúsculas
    "confirmed":        "pickup_confirmed",
    "pickup_scheduled": "pickup_confirmed",
    "picked_up":        "processing",
    "processing":       "processing",
    "ready":            "ready",
    "out_for_delivery": "out_for_delivery",
    "delivered":        "delivered",
    "cancelled":        "cancelled",
    "completed":        "completed",
    # MAYÚSCULAS
    "CONFIRMED":        "pickup_confirmed",
    "PICKUP_SCHEDULED": "pickup_confirmed",
    "PICKED_UP":        "processing",
    "PROCESSING":       "processing",
    "READY":            "ready",
    "OUT_FOR_DELIVERY": "out_for_delivery",
    "DELIVERED":        "delivered",
    "CANCELLED":        "cancelled",
    "COMPLETED":        "completed",
}

# ── Utilities ─────────────────────────────────────────────────────────
def parse_hhmm(s: str) -> dtime:
    hh, mm = s.split(":")
    return dtime(int(hh), int(mm))

def is_quiet_hours(now_local: Optional[datetime] = None) -> bool:
    now_local = now_local or datetime.now()
    start, end = parse_hhmm(QUIET_START), parse_hhmm(QUIET_END)
    n = now_local.time()
    if start < end:
        return start <= n < end
    return (n >= start) or (n < end)

twilio_client = None
if TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN:
    try:
        twilio_client = Client(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
        logger.info("Twilio client initialized")
    except Exception as e:
        logger.error(f"Failed to init Twilio: {e}")

sendgrid_client = None
if SENDGRID_API_KEY:
    try:
        host = "https://api.eu.sendgrid.com" if SENDGRID_DATA_RESIDENCY == "eu" else None
        sendgrid_client = SendGridAPIClient(
            SENDGRID_API_KEY,
            **({"host": host} if host else {})
        )
        logger.info("SendGrid client initialized")
    except Exception as e:
        logger.error(f"Failed to init SendGrid: {e}")

def get_groq_client():
    if not GROQ_API_KEY:
        return None
    try:
        return Groq(api_key=GROQ_API_KEY)
    except Exception as e:
        logger.error(f"Failed to init Groq: {e}")
        return None

def format_phone(phone: str) -> Optional[str]:
    if not phone:
        return None
    cleaned = "".join(c for c in phone if c.isdigit() or c == "+")
    if cleaned.startswith("+"):
        return cleaned
    if len(cleaned) == 11 and cleaned.startswith("1"):
        return "+" + cleaned
    if len(cleaned) == 10:
        return "+1" + cleaned
    if cleaned.startswith("52") and len(cleaned) >= 12:
        return "+" + cleaned
    return "+" + cleaned if not cleaned.startswith("+") else cleaned

def detect_country(phone: Optional[str]) -> Optional[str]:
    if not phone:
        return None
    f = format_phone(phone)
    if f and f.startswith("+52"):
        return "mx"
    if f and f.startswith("+1"):
        return "us"
    return None

def format_whatsapp(phone: str) -> Optional[str]:
    f = format_phone(phone)
    return f"whatsapp:{f}" if f else None

def normalize_preferred_contact(value: str) -> str:
    if not value:
        return "sms"
    v = value.strip().lower()
    if v in {"email", "correo", "mail"}:
        return "email"
    if v in {"phone", "call", "llamada", "telefono", "teléfono"}:
        return "call"
    if v in {"whatsapp", "wa", "wapp"}:
        return "whatsapp"
    return "sms"

def has_sms_consent(order: Optional[Dict], customer: Optional[Dict]) -> bool:
    return bool(
        (order and order.get("sms_consent"))
        or (customer and customer.get("sms_consent"))
    )

def normalize_status_value(value: Optional[str]) -> str:
    """Normaliza status a minúsculas con guiones bajos para comparación interna."""
    if not value:
        return ""
    return value.strip().lower().replace(" ", "_")

def should_notify_customer(status: str) -> bool:
    return normalize_status_value(status) not in _NO_NOTIFY_STATUSES

def detect_language(customer: Optional[Dict], phone: Optional[str]) -> str:
    if customer:
        preferred = (
            customer.get("preferred_language") or customer.get("language") or ""
        ).strip().lower()
        if preferred in {"es", "es-mx", "spanish", "español"}:
            return "es-MX"
        if preferred in {"en", "en-us", "english"}:
            return "en-US"

    resolved = phone or (customer.get("phone") if customer else None)
    if resolved:
        country = detect_country(resolved)
        if country == "mx":
            return "es-MX"
        if country == "us":
            return "en-US"

    if DEFAULT_LANGUAGE.startswith("es"):
        return "es-MX"
    return "en-US"

def extract_contact_from_notes(order: Dict) -> Optional[str]:
    if not order:
        return None
    notes = order.get("notes") or ""
    marker = "preferred contact:"
    if marker in notes.lower():
        idx = notes.lower().find(marker) + len(marker)
        return notes[idx:].strip().split("\n")[0].strip()
    return None

def _generate_internal_payment_url(order: Dict, base_url: str = "") -> str:
    origin = (base_url or FRONTEND_URL).rstrip("/")
    order_id = order.get("id") or order.get("order_number", "")
    pay_status = (order.get("payment_status") or "pending").lower()
    total = float(order.get("total_amount") or order.get("total") or 0)

    if pay_status == "paid" or total < 0.50:
        return ""

    checkout_url = order.get("checkout_url") or order.get("payment_url") or ""
    if checkout_url and checkout_url.startswith("http"):
        return checkout_url

    if not order_id:
        return f"{origin}/account"

    return f"{origin}/account?order={order_id}"

# ── FIX: Helper central para detectar el flujo de la orden ───────────
def _detect_order_flow(service_type: Optional[str]) -> str:
    """
    Retorna 'wash_fold' o 'pickup_delivery' basado en el service_type.
    Normaliza el valor antes de comparar para cubrir todos los formatos
    posibles guardados en la base de datos.
    """
    if not service_type:
        return "pickup_delivery"
    normalized = service_type.strip().lower().replace("-", "_").replace(" ", "_").replace("&", "and")
    if normalized in WASH_FOLD_TYPES or "wash" in normalized or "fold" in normalized or "dropoff" in normalized or "drop_off" in normalized:
        return "wash_fold"
    return "pickup_delivery"

# ── HTML helpers (email) ─────────────────────────────────────────────
_EMAIL_CSS = """
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');
  * { box-sizing: border-box; }
  body { margin: 0; padding: 0; background-color: #f1f5f9; font-family: 'DM Sans', Arial, sans-serif; }
  .wrapper { background: #f1f5f9; padding: 40px 16px; }
  .card { background: #ffffff; border-radius: 20px; max-width: 560px; margin: 0 auto; overflow: hidden; box-shadow: 0 4px 24px rgba(11,25,41,0.10); }
  .header { background: linear-gradient(135deg, #0b1929 0%, #0f2744 100%); padding: 32px; text-align: center; }
  .header-logo { color: #38bdf8; font-size: 11px; font-weight: 700; letter-spacing: 3px; text-transform: uppercase; margin: 0 0 6px; }
  .header-name { color: #ffffff; font-size: 22px; font-weight: 700; margin: 0; }
  .status-bar { padding: 12px 32px; text-align: center; }
  .status-bar span { font-size: 11px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; color: #fff; }
  .body { padding: 36px 32px; }
  .order-chip { background: #0f2744; border-radius: 12px; padding: 18px 24px; text-align: center; margin-bottom: 28px; }
  .order-chip .label { color: rgba(255,255,255,0.45); font-size: 10px; letter-spacing: 2px; text-transform: uppercase; margin: 0 0 6px; }
  .order-chip .value { color: #38bdf8; font-family: 'Courier New', monospace; font-size: 24px; font-weight: 700; margin: 0; }
  .heading { color: #0b1929; font-size: 24px; font-weight: 700; margin: 0 0 10px; line-height: 1.25; }
  .subtext { color: #475569; font-size: 15px; line-height: 1.6; margin: 0 0 24px; }
  .total-row { background: #f8fafc; border-radius: 10px; padding: 14px 18px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
  .total-row .t-label { color: #64748b; font-size: 13px; font-weight: 500; }
  .total-row .t-value { color: #0b1929; font-size: 18px; font-weight: 700; }
  .breakdown { background: #f8fafc; border-radius: 10px; padding: 14px 18px; margin-bottom: 24px; font-size: 14px; }
  .breakdown p { margin: 6px 0; }
  .cta { display: block; text-align: center; margin: 0 0 16px; }
  .btn { display: inline-block; padding: 16px 40px; border-radius: 50px; font-size: 15px; font-weight: 700; text-decoration: none; letter-spacing: 0.3px; }
  .tip { border-radius: 12px; padding: 14px 18px; margin-top: 8px; }
  .tip p { margin: 0; font-size: 13px; line-height: 1.55; }
  .pay-link { text-align: center; margin-top: 12px; }
  .pay-link a { font-size: 11px; color: #94a3b8; word-break: break-all; }
  .footer { background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 24px 32px; text-align: center; }
  .footer .biz { color: #334155; font-size: 13px; font-weight: 700; margin: 0 0 4px; }
  .footer .addr { color: #94a3b8; font-size: 11px; margin: 0 0 10px; }
  .footer .web { font-size: 11px; }
  .footer .web a { color: #0ea5e9; text-decoration: none; }
"""

def _html_base(content_html: str, accent_color: str = VFL_BLUE, status_label: str = "", lang: str = "es") -> str:
    phone_line = f" &middot; {BUSINESS_PHONE_DISPLAY}" if BUSINESS_PHONE_DISPLAY else ""
    status_bar = (
        f'<div class="status-bar" style="background:{accent_color}">'
        f'<span>{status_label}</span></div>'
    ) if status_label else ""

    footer_html = (
        '<div class="footer">'
        f'<p class="biz">{BUSINESS_NAME}</p>'
        f'<p class="addr">{BUSINESS_ADDRESS}{phone_line}</p>'
        f'<p class="web"><a href="{BUSINESS_WEBSITE}">{BUSINESS_WEBSITE}</a></p>'
        '<hr style="border:none;border-top:1px solid #e2e8f0;margin:14px 0 10px">'
        '<p style="font-size:10px;color:#94a3b8;margin:0">'
        'Automated Message — Ventura Fresh Laundry<br>'
        'For support or assistance, reply to this message or call (820) 234-8181.</p>'
        '<p style="font-size:10px;color:#94a3b8;margin:6px 0 0">'
        'Mensaje Automático — Ventura Fresh Laundry<br>'
        'Para soporte o asistencia, responda a este mensaje o llame al (820) 234-8181.</p>'
        '</div>'
    )

    return (
        f'<!DOCTYPE html><html lang="{lang}"><head>'
        '<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
        f'<title>{BUSINESS_NAME}</title>'
        f'<style>{_EMAIL_CSS}</style>'
        '</head><body><div class="wrapper">'
        '<div class="card">'
        '<div class="header">'
        f'<p class="header-logo">Laundry &amp; Delivery</p>'
        f'<p class="header-name">{BUSINESS_NAME}</p>'
        '</div>'
        f'{status_bar}'
        f'{content_html}'
        f'{footer_html}'
        '</div></div></body></html>'
    )

def _order_chip(order_number: str, is_es: bool) -> str:
    label = "Número de Orden" if is_es else "Order Number"
    return (
        f'<div class="order-chip">'
        f'<p class="label">{label}</p>'
        f'<p class="value">#{order_number}</p>'
        '</div>'
    )

def _tip_box(text: str, accent: str = VFL_ACCENT) -> str:
    border = _border_color(accent)
    bg = {"#10b981": "#ecfdf5", "#f59e0b": "#fffbeb", "#ef4444": "#fef2f2"}.get(accent, "#f0f9ff")
    text_color = {"#10b981": "#065f46", "#f59e0b": "#78350f", "#ef4444": "#7f1d1d"}.get(accent, "#0369a1")
    return (
        f'<div class="tip" style="background:{bg};border:1px solid {border}">'
        f'<p style="color:{text_color}">{text}</p></div>'
    )

def _cta_button(url: str, label: str, color: str = VFL_BLUE) -> str:
    return (
        f'<div class="cta"><a class="btn" href="{url}" '
        f'style="background:{color};color:#ffffff">{label}</a></div>'
    )

def _total_row(order_total: Optional[float], is_es: bool) -> str:
    if not order_total:
        return ""
    label = "Total a pagar" if is_es else "Amount due"
    return (
        f'<div class="total-row">'
        f'<span class="t-label">{label}</span>'
        f'<span class="t-value">${order_total:.2f}</span>'
        '</div>'
    )

def _breakdown_block(lbs: float, rate: float, subtotal: float, total: float, is_es: bool) -> str:
    lines = []
    if is_es:
        lines.append(f"<p>• {lbs} lbs × ${rate:.2f}/lb = ${subtotal:.2f}</p>")
        lines.append(f"<p><strong>Total: ${total:.2f}</strong></p>")
    else:
        lines.append(f"<p>• {lbs} lbs × ${rate:.2f}/lb = ${subtotal:.2f}</p>")
        lines.append(f"<p><strong>Total: ${total:.2f}</strong></p>")
    return f'<div class="breakdown">{"".join(lines)}</div>'

# ── HTML per-event builders ───────────────────────────────────────────
def _html_order_created(name, order_number, pickup_date, pickup_window, is_es):
    accent = VFL_BLUE
    lang = "es" if is_es else "en"
    heading = f"¡Hola, {name}! 👋" if is_es else f"Hi {name}! 👋"
    subtext = (
        f"Tu orden <strong>#{order_number}</strong> fue programada con éxito. "
        "Te avisamos en cada paso del camino."
        if is_es else
        f"Your order <strong>#{order_number}</strong> has been scheduled. "
        "We'll keep you updated every step of the way."
    )
    pickup_html = ""
    if pickup_date:
        pickup_html = (
            f'<div class="tip" style="background:#f0f9ff;border:1px solid #bae6fd;margin-bottom:20px">'
            f'<p style="color:#0369a1">📅 {"Recolección" if is_es else "Pickup"}: <strong>{pickup_date}'
            + (f' · {pickup_window}' if pickup_window else '') +
            '</strong></p></div>'
        )
    tip = "Si necesitas cambios, escríbenos." if is_es else "Need changes? Just reach out."
    status_label = "Orden Programada" if is_es else "Order Scheduled"
    body = (
        '<div class="body">'
        + _order_chip(order_number, is_es)
        + f'<h2 class="heading">{heading}</h2>'
        + f'<p class="subtext">{subtext}</p>'
        + pickup_html
        + _tip_box(tip, accent)
        + '</div>'
    )
    return _html_base(body, accent, status_label, lang)

def _html_order_received(name, order_number, pickup_date, pickup_window, is_es):
    accent = VFL_BLUE
    lang = "es" if is_es else "en"
    heading = f"¡Recibimos tu ropa, {name}! 🧺" if is_es else f"We received your laundry, {name}! 🧺"
    subtext = (
        f"Tu orden <strong>#{order_number}</strong> fue ingresada al sistema. "
        "La procesamos con cuidado y te avisamos cuando esté lista."
        if is_es else
        f"Your order <strong>#{order_number}</strong> has been logged. "
        "We'll process it with care and let you know when it's ready."
    )
    tip = "👕 Tiempo estimado: 24–48 horas." if is_es else "👕 Estimated turnaround: 24–48 hours."
    status_label = "Orden Recibida" if is_es else "Order Received"
    body = (
        '<div class="body">'
        + _order_chip(order_number, is_es)
        + f'<h2 class="heading">{heading}</h2>'
        + f'<p class="subtext">{subtext}</p>'
        + _tip_box(tip, accent)
        + '</div>'
    )
    return _html_base(body, accent, status_label, lang)

def _html_pickup_confirmed(name, order_number, pickup_date, pickup_window, pickup_address, is_es):
    accent = VFL_BLUE
    lang = "es" if is_es else "en"
    heading = "Recolección confirmada ✓" if is_es else "Pickup confirmed ✓"
    subtext = (
        f"Hola <strong>{name}</strong>, tu recolección fue confirmada. "
        "Ten tu ropa lista y un mensajero estará contigo en el horario acordado."
        if is_es else
        f"Hi <strong>{name}</strong>, your pickup is confirmed. "
        "Have your laundry ready and we'll be there at the scheduled time."
    )
    info_html = ""
    if pickup_date:
        info_html = (
            f'<div class="tip" style="background:#f0f9ff;border:1px solid #bae6fd;margin-bottom:20px">'
            f'<p style="color:#0369a1">📅 <strong>{pickup_date}</strong>'
            + (f' · {pickup_window}' if pickup_window else '') + '</p>'
            + (f'<p style="color:#0369a1">📍 {pickup_address}</p>' if pickup_address else '')
            + '</div>'
        )
    tip = "🧺 Ten tu ropa lista en una bolsa." if is_es else "🧺 Have your laundry in a bag ready to hand off."
    status_label = "Recolección Confirmada" if is_es else "Pickup Confirmed"
    body = (
        '<div class="body">'
        + _order_chip(order_number, is_es)
        + f'<h2 class="heading">{heading}</h2>'
        + f'<p class="subtext">{subtext}</p>'
        + info_html
        + _tip_box(tip, accent)
        + '</div>'
    )
    return _html_base(body, accent, status_label, lang)

def _html_processing(name, order_number, is_es):
    accent = VFL_WARN
    lang = "es" if is_es else "en"
    heading = "Tu ropa está en proceso 🧺" if is_es else "Your laundry is being processed 🧺"
    subtext = (
        f"Hola <strong>{name}</strong>, ya tenemos tu ropa y la estamos procesando con cuidado. "
        "Te avisamos cuando esté lista."
        if is_es else
        f"Hi <strong>{name}</strong>, we have your laundry and it's being carefully processed. "
        "We'll notify you as soon as it's ready."
    )
    tip = "⏱ Tiempo estimado: 24–48 horas." if is_es else "⏱ Estimated time: 24–48 hours."
    status_label = "En Proceso" if is_es else "Processing"
    body = (
        '<div class="body">'
        + _order_chip(order_number, is_es)
        + f'<h2 class="heading">{heading}</h2>'
        + f'<p class="subtext">{subtext}</p>'
        + _tip_box(tip, accent)
        + '</div>'
    )
    return _html_base(body, accent, status_label, lang)

def _html_ready(name, order_number, service_type, is_es):
    accent = VFL_SUCCESS
    lang = "es" if is_es else "en"
    heading = "¡Tu ropa está lista! ✨" if is_es else "Your laundry is ready! ✨"
    subtext = (
        f"Hola <strong>{name}</strong>, tu ropa está lista y limpia. "
        "Pronto estará en camino a tu domicilio."
        if is_es else
        f"Hi <strong>{name}</strong>, your laundry is fresh and clean. "
        "It will be on its way to you shortly."
    )
    tip = "🚚 Mantente disponible para recibir tu entrega." if is_es else "🚚 Stay available to receive your delivery."
    status_label = "Lista" if is_es else "Ready"
    body = (
        '<div class="body">'
        + _order_chip(order_number, is_es)
        + f'<h2 class="heading">{heading}</h2>'
        + f'<p class="subtext">{subtext}</p>'
        + _tip_box(tip, accent)
        + '</div>'
    )
    return _html_base(body, accent, status_label, lang)

def _html_ready_for_pickup(name, order_number, is_es):
    accent = VFL_SUCCESS
    lang = "es" if is_es else "en"
    heading = "¡Tu ropa está lista para recoger! 🧺" if is_es else "Your laundry is ready for pickup! 🧺"
    subtext = (
        f"Hola <strong>{name}</strong>, tu ropa está lista y puedes pasar a recogerla en nuestra tienda."
        if is_es else
        f"Hi <strong>{name}</strong>, your laundry is ready and you can pick it up at our store."
    )
    tip = "🏪 ¡Te esperamos!" if is_es else "🏪 We look forward to seeing you!"
    status_label = "Lista para Recoger" if is_es else "Ready for Pickup"
    body = (
        '<div class="body">'
        + _order_chip(order_number, is_es)
        + f'<h2 class="heading">{heading}</h2>'
        + f'<p class="subtext">{subtext}</p>'
        + _tip_box(tip, accent)
        + '</div>'
    )
    return _html_base(body, accent, status_label, lang)

def _html_out_for_delivery(name, order_number, is_es):
    accent = VFL_BLUE
    lang = "es" if is_es else "en"
    heading = "Tu entrega va en camino 🚚" if is_es else "Your delivery is on the way 🚚"
    subtext = (
        f"Hola <strong>{name}</strong>, tu ropa limpia está en camino. "
        "El mensajero llegará en breve."
        if is_es else
        f"Hi <strong>{name}</strong>, your clean laundry is on its way. "
        "Your delivery driver will arrive shortly."
    )
    tip = "📱 Por favor, mantente disponible para recibir tu entrega." if is_es else "📱 Please be available to receive your delivery."
    status_label = "En Camino" if is_es else "Out for Delivery"
    body = (
        '<div class="body">'
        + _order_chip(order_number, is_es)
        + f'<h2 class="heading">{heading}</h2>'
        + f'<p class="subtext">{subtext}</p>'
        + _tip_box(tip, accent)
        + '</div>'
    )
    return _html_base(body, accent, status_label, lang)

def _html_delivered(name, order_number, order_total, is_es):
    accent = VFL_SUCCESS
    lang = "es" if is_es else "en"
    heading = "¡Entrega completada! 🎉" if is_es else "Delivery completed! 🎉"
    subtext = (
        f"Hola <strong>{name}</strong>, tu ropa fue entregada. "
        "Esperamos que estés muy satisfecho con el servicio."
        if is_es else
        f"Hi <strong>{name}</strong>, your laundry has been delivered. "
        "We hope you're happy with the service."
    )
    tip = "❤️ ¡Gracias por confiar en nosotros! Estaremos aquí para tu próxima carga." if is_es else "❤️ Thank you for trusting us! We'll be here for your next load."
    status_label = "Entregado" if is_es else "Delivered"
    body = (
        '<div class="body">'
        + _order_chip(order_number, is_es)
        + f'<h2 class="heading">{heading}</h2>'
        + f'<p class="subtext">{subtext}</p>'
        + _total_row(order_total, is_es)
        + _tip_box(tip, accent)
        + '</div>'
    )
    return _html_base(body, accent, status_label, lang)

def _html_completed(name, order_number, order_total, is_es):
    return _html_delivered(name, order_number, order_total, is_es)

def _html_cancelled(name, order_number, is_es):
    accent = VFL_DANGER
    lang = "es" if is_es else "en"
    heading = "Orden cancelada" if is_es else "Order cancelled"
    subtext = (
        f"Hola <strong>{name}</strong>, tu orden <strong>#{order_number}</strong> fue cancelada. "
        "Si fue un error o deseas reagendar, contáctanos."
        if is_es else
        f"Hi <strong>{name}</strong>, your order <strong>#{order_number}</strong> was cancelled. "
        "If this was a mistake or you'd like to reschedule, please reach out."
    )
    tip = "📞 Estamos para ayudarte." if is_es else "📞 We're here to help."
    status_label = "Cancelada" if is_es else "Cancelled"
    body = (
        '<div class="body">'
        + _order_chip(order_number, is_es)
        + f'<h2 class="heading">{heading}</h2>'
        + f'<p class="subtext">{subtext}</p>'
        + _tip_box(tip, accent)
        + '</div>'
    )
    return _html_base(body, accent, status_label, lang)

def _html_store_order(name, order_number, order_total, shipping_fee, is_es):
    accent = VFL_BLUE
    lang = "es" if is_es else "en"
    heading = f"¡Compra confirmada, {name}! 🛍️" if is_es else f"Purchase confirmed, {name}! 🛍️"
    subtext = (
        f"Recibimos tu orden <strong>#{order_number}</strong>. "
        "Te avisaremos cuando esté lista para envío."
        if is_es else
        f"We received your order <strong>#{order_number}</strong>. "
        "You'll hear from us when it's ready to ship."
    )
    tip = "📦 Preparando tu pedido con cuidado." if is_es else "📦 Preparing your order with care."
    status_label = "Orden de Tienda" if is_es else "Store Order"
    body = (
        '<div class="body">'
        + _order_chip(order_number, is_es)
        + f'<h2 class="heading">{heading}</h2>'
        + f'<p class="subtext">{subtext}</p>'
        + _total_row(order_total, is_es)
        + _tip_box(tip, accent)
        + '</div>'
    )
    return _html_base(body, accent, status_label, lang)

def _html_payment_request(name, order_number, order_total, payment_url, lbs, rate, subtotal, is_es):
    accent = VFL_SUCCESS
    lang = "es" if is_es else "en"
    heading = "Tienes un pago pendiente 💳" if is_es else "Payment required 💳"
    subtext = (
        f"Hola <strong>{name}</strong>, tu servicio <strong>#{order_number}</strong> está listo. "
        "Completa tu pago de forma segura a través del siguiente enlace."
        if is_es else
        f"Hi <strong>{name}</strong>, your service <strong>#{order_number}</strong> is complete. "
        "Securely complete your payment using the button below."
    )
    btn_label = "Pagar ahora" if is_es else "Pay now"
    warning = (
        "⚠️ <strong>Nota:</strong> Tu orden no comenzará a procesarse hasta que se complete el pago. "
        "Por favor realiza tu pago lo antes posible para evitar demoras."
        if is_es else
        "⚠️ <strong>Note:</strong> Your order will not begin processing until payment has been completed. "
        "Please submit your payment as soon as possible to avoid delays with your order."
    )
    body = (
        '<div class="body">'
        + _order_chip(order_number, is_es)
        + f'<h2 class="heading">{heading}</h2>'
        + f'<p class="subtext">{subtext}</p>'
        + _breakdown_block(lbs, rate, subtotal, order_total, is_es)
        + _cta_button(payment_url, btn_label, accent)
        + f'<div class="tip" style="background:#fff4e5;border:1px solid #ffedd5;"><p>{warning}</p></div>'
        + f'<div class="pay-link"><a href="{payment_url}">{payment_url}</a></div>'
        + '</div>'
    )
    return _html_base(body, accent, "Pago Pendiente" if is_es else "Payment Required", lang)

def _html_generic(name, is_es, title=None, body_text=None):
    accent = VFL_BLUE
    lang = "es" if is_es else "en"
    heading = title or ("Actualización de servicio" if is_es else "Service update")
    subtext = body_text or (
        f"Hola {name}, tienes una actualización en tu servicio."
        if is_es else
        f"Hi {name}, you have an update on your service."
    )
    tip = "Gracias por elegir Ventura Fresh Laundry." if is_es else "Thank you for choosing Ventura Fresh Laundry."
    body = (
        '<div class="body">'
        + f'<h2 class="heading">{heading}</h2>'
        + f'<p class="subtext">{subtext}</p>'
        + _tip_box(tip, accent)
        + '</div>'
    )
    return _html_base(body, accent, heading, lang)

# ── SMS copy ──────────────────────────────────────────────────────────
def _sms_sync(
    event: str, name: str, order_number: str, language: str,
    pickup_date: Optional[str] = None, pickup_window: Optional[str] = None,
    order_total: Optional[float] = None, payment_url: Optional[str] = None,
    pickup_address: Optional[str] = None,
    lbs: Optional[float] = None, rate: Optional[float] = None
) -> str:
    is_es = str(language).lower().startswith("es")
    biz = BUSINESS_NAME
    n = name or ("Cliente" if is_es else "Customer")

    def breakdown_block():
        if lbs is not None and rate is not None and lbs > 0:
            subtotal = lbs * rate
            total = order_total if order_total is not None else subtotal
            if is_es:
                return (
                    f"\n📊 Desglose:\n"
                    f"• {lbs} lbs × ${rate:.2f}/lb = ${subtotal:.2f}\n"
                    f"• Total: ${total:.2f}"
                )
            else:
                return (
                    f"\n📊 Breakdown:\n"
                    f"• {lbs} lbs × ${rate:.2f}/lb = ${subtotal:.2f}\n"
                    f"• Total: ${total:.2f}"
                )
        return ""

    warning_block = (
        "\n\n⚠️ NOTA: Tu orden no comenzará a procesarse hasta que se complete el pago. "
        "Por favor realiza tu pago lo antes posible para evitar demoras."
        if is_es else
        "\n\n⚠️ NOTE: Your order will not begin processing until payment has been completed. "
        "Please submit your payment as soon as possible to avoid delays with your order."
    )

    templates = {
        "order_created": (
            f"🧼 *{biz}*\n\nHola {n} 👋\n"
            f"Tu orden #{order_number} ha sido programada.\n"
            f"📅 Fecha: {pickup_date or 'por confirmar'}\n"
            f"⏰ Horario: {pickup_window or 'por definir'}\n\n"
            f"Te mantendremos informado. ¡Gracias por confiar en nosotros!",
            f"🧼 *{biz}*\n\nHi {n} 👋\n"
            f"Your order #{order_number} has been scheduled.\n"
            f"📅 Date: {pickup_date or 'to be confirmed'}\n"
            f"⏰ Time: {pickup_window or 'to be defined'}\n\n"
            f"We'll keep you updated. Thank you for trusting us!"
        ),
        "order_received": (
            f"🧼 *{biz}*\n\nHola {n} 👋\n"
            f"¡Recibimos tu orden #{order_number}!\n"
            f"📅 Fecha de entrega: {'por confirmar'}\n\n"
            f"Procesaremos tu ropa con cuidado y te avisaremos cuando esté lista para recoger.",
            f"🧼 *{biz}*\n\nHi {n} 👋\n"
            f"We received your order #{order_number}!\n"
            f"📅 Ready date: {'to be confirmed'}\n\n"
            f"We'll process your laundry with care and notify you when it's ready for pickup."
        ),
        "pickup_confirmed": (
            f"🚚 *{biz}*\n\n"
            f"Hola {n},\n"
            f"✅ Tu recolección fue confirmada para el **{pickup_date or 'fecha a confirmar'}**\n"
            f"⏰ Horario: {pickup_window or 'a convenir'}\n"
            f"📍 Dirección: {pickup_address or 'la registrada'}\n\n"
            f"¡Gracias por preferirnos! 🙌",
            f"🚚 *{biz}*\n\n"
            f"Hi {n},\n"
            f"✅ Your pickup has been confirmed for **{pickup_date or 'date to be confirmed'}**\n"
            f"⏰ Time window: {pickup_window or 'to be arranged'}\n"
            f"📍 Address: {pickup_address or 'the one registered'}\n\n"
            f"Thank you for choosing us! 🙌"
        ),
        "processing": (
            f"🧺 *{biz}*\n\nHola {n} 👋\n"
            f"Tu orden #{order_number} está en proceso de lavado.\n"
            f"🧼 Cuidamos tu ropa con los mejores productos.\n\n"
            f"Te avisaremos cuando esté lista.",
            f"🧺 *{biz}*\n\nHi {n} 👋\n"
            f"Your order #{order_number} is being processed.\n"
            f"🧼 We take care of your clothes with the best products.\n\n"
            f"We'll notify you when it's ready."
        ),
        "ready": (
            f"✨ *{biz}*\n\n"
            f"Hola {n} 👋\n"
            f"¡Tu orden #{order_number} está LISTA! ✅\n\n"
            f"🚚 Estamos preparando tu entrega y estaremos en camino en breve.\n\n"
            f"Gracias por confiar en {biz}. 💙",
            f"✨ *{biz}*\n\n"
            f"Hi {n} 👋\n"
            f"Your order #{order_number} is READY! ✅\n\n"
            f"🚚 We are preparing to start your delivery and will be on our way shortly.\n\n"
            f"Thank you for trusting {biz}. 💙"
        ),
        "ready_for_pickup": (
            f"✅ *{biz}*\n\nHola {n} 👋\n"
            f"Tu orden #{order_number} está LISTA para recoger en nuestra tienda. 🧺\n\n"
            f"🏪 ¡Te esperamos! Cualquier duda al (820) 234-8181.",
            f"✅ *{biz}*\n\nHi {n} 👋\n"
            f"Your order #{order_number} is READY for pickup at our store. 🧺\n\n"
            f"🏪 We look forward to seeing you!"
        ),
        "out_for_delivery": (
            f"🚚 *{biz}*\n\n"
            f"Hola {n} 👋\n"
            f"¡Tu orden #{order_number} está EN CAMINO! ✅\n\n"
            f"💨 Nuestro conductor se dirige a tu ubicación y tu orden llegará en breve.\n\n"
            f"Gracias por confiar en {biz}. 💙",
            f"🚚 *{biz}*\n\n"
            f"Hi {n} 👋\n"
            f"Your order #{order_number} is ON THE WAY! ✅\n\n"
            f"💨 Our driver is heading to your location and your order will arrive shortly.\n\n"
            f"Thank you for trusting {biz}. 💙"
        ),
        "delivered": (
            f"🎉 *{biz}*\n\nHola {n} 👋\n"
            f"¡Tu orden #{order_number} ha sido ENTREGADA! ✓"
            + (f"\n💰 Total: ${order_total:.2f}" if order_total else "")
            + f"\n\n¡Gracias por confiar en nosotros! ❤️",
            f"🎉 *{biz}*\n\nHi {n} 👋\n"
            f"Your order #{order_number} has been DELIVERED! ✓"
            + (f"\n💰 Total: ${order_total:.2f}" if order_total else "")
            + f"\n\nThank you for trusting us! ❤️"
        ),
        "completed": (
            f"🙏 *{biz}*\n\nHola {n} 👋\n"
            f"Tu servicio #{order_number} está COMPLETO. ✓"
            + (f"\n💰 Total: ${order_total:.2f}" if order_total else "")
            + f"\n\n¡Hasta pronto! ¡Gracias por preferirnos! 🧺",
            f"🙏 *{biz}*\n\nHi {n} 👋\n"
            f"Your service #{order_number} is COMPLETE. ✓"
            + (f"\n💰 Total: ${order_total:.2f}" if order_total else "")
            + f"\n\nSee you soon! Thank you for choosing us! 🧺"
        ),
        "cancelled": (
            f"❌ *{biz}*\n\nHola {n} 👋\n"
            f"Tu orden #{order_number} fue cancelada.\n\n"
            f"¿Necesitas reagendar? Contáctanos al (820) 234-8181",
            f"❌ *{biz}*\n\nHi {n} 👋\n"
            f"Your order #{order_number} was cancelled.\n\n"
            f"Need to reschedule? Contact us at (820) 234-8181"
        ),
        "store_order": (
            f"🛍️ *{biz}*\n\nHola {n} 👋\n"
            f"¡Recibimos tu orden de tienda #{order_number}!"
            + (f"\n💰 Total: ${order_total:.2f}" if order_total else "")
            + f"\n\nTe avisaremos cuando esté lista para envío.\n\n¡Gracias por tu compra!",
            f"🛍️ *{biz}*\n\nHi {n} 👋\n"
            f"We received your store order #{order_number}!"
            + (f"\n💰 Total: ${order_total:.2f}" if order_total else "")
            + f"\n\nWe'll notify you when it's ready to ship.\n\nThank you for your purchase!"
        ),
        "payment_request": (
            f"🧼 *{biz}*\n\n"
            f"Hola {n} 👋\n"
            f"Tu orden #{order_number} está lista para pago."
            + breakdown_block()
            + f"\n\n💳 Completa tu pago de forma segura a través de tu portal de cliente\n"
            f"👉 Por favor, haz clic en el siguiente enlace para acceder a tu cuenta:\n"
            f"{payment_url or 'Enlace no disponible'}\n"
            + warning_block
            + f"\n\n⚡ Proceso rápido, seguro y fácil\n\n"
            f"Si tienes alguna pregunta, no dudes en contactarnos al (820) 234-8181",
            f"🧼 *{biz}*\n\n"
            f"Hi {n} 👋\n"
            f"Your order #{order_number} is ready for payment."
            + breakdown_block()
            + f"\n\n💳 Complete your payment securely through your customer portal\n"
            f"👉 Please click the link below to access your account:\n"
            f"{payment_url or 'Link not available'}\n"
            + warning_block
            + f"\n\n⚡ Fast, secure, and easy process\n\n"
            f"If you have any questions, feel free to contact us at (820) 234-8181"
        ),
    }

    es_msg, en_msg = templates.get(event, (
        f"🫧 *{biz}*\n\nHola {n}, hay una actualización en tu servicio.\n\nPor favor revisa tu correo electrónico o portal de cliente para más detalles.",
        f"🫧 *{biz}*\n\nHi {n}, there's an update on your service.\n\nPlease check your email or customer portal for details."
    ))
    base = es_msg if is_es else en_msg
    return base + _support_footer(is_es)

# ── Voice TwiML ──────────────────────────────────────────────────────
def _voice(event: str, name: str, order_number: str, language: str) -> str:
    is_es = str(language).lower().startswith("es")
    biz = BUSINESS_NAME
    n = name or ("estimado cliente" if is_es else "valued customer")

    scripts = {
        "order_created": (
            f"Hola {n}, llamamos de {biz} para confirmar que recibimos tu solicitud. "
            "Te avisaremos sobre cada actualización. ¡Hasta pronto!",
            f"Hi {n}, this is {biz} calling to confirm we received your request. "
            "We'll keep you updated. Goodbye!"
        ),
        "order_received": (
            f"Hola {n}, de {biz}. Recibimos tu ropa y ya la estamos procesando. "
            "Te avisamos cuando esté lista para recoger. ¡Gracias!",
            f"Hi {n}, this is {biz}. We received your laundry and are processing it now. "
            "We'll let you know when it's ready for pickup. Thank you!"
        ),
        "pickup_confirmed": (
            f"Hola {n}, te llamamos de {biz}. Tu recolección fue confirmada. "
            "Estaremos en tu domicilio en el horario acordado. ¡Gracias!",
            f"Hi {n}, this is {biz}. Your pickup has been confirmed. "
            "We'll be there at the scheduled time. Thank you!"
        ),
        "processing": (
            f"Hola {n}, de {biz}. Ya tenemos tu ropa y la estamos procesando. "
            "Te avisamos cuando esté lista. ¡Gracias!",
            f"Hi {n}, this is {biz}. We have your laundry and it's being processed. "
            "We'll let you know when it's ready. Thank you!"
        ),
        "ready": (
            f"Hola {n}, de {biz}. Tu ropa está lista y pronto estará en camino. "
            "Por favor mantente disponible. ¡Gracias!",
            f"Hi {n}, this is {biz}. Your laundry is ready and will be on its way shortly. "
            "Please be available to receive it. Thank you!"
        ),
        "ready_for_pickup": (
            f"Hola {n}, de {biz}. Tu ropa está lista para recoger en nuestra tienda. "
            "¡Te esperamos! ¡Hasta luego!",
            f"Hi {n}, this is {biz}. Your laundry is ready for pickup at our store. "
            "We look forward to seeing you. Goodbye!"
        ),
        "out_for_delivery": (
            f"Hola {n}, de {biz}. Tu entrega está en camino ahora mismo. "
            "Por favor, estate atento. ¡Gracias!",
            f"Hi {n}, this is {biz}. Your delivery is on the way right now. "
            "Please be ready to receive it. Thank you!"
        ),
        "delivered": (
            f"Hola {n}, de {biz}. Tu entrega fue completada con éxito. "
            "¡Gracias por confiar en nosotros y hasta la próxima!",
            f"Hi {n}, this is {biz}. Your delivery has been completed. "
            "Thank you for choosing us, and we hope to see you again soon!"
        ),
        "completed": (
            f"Hola {n}, de {biz}. Tu servicio ha sido completado. "
            "¡Fue un placer atenderte! ¡Hasta pronto!",
            f"Hi {n}, this is {biz}. Your service has been completed. "
            "It was a pleasure serving you. Goodbye!"
        ),
        "cancelled": (
            f"Hola {n}, de {biz}. Te informamos que tu orden fue cancelada. "
            "Si tienes preguntas o deseas reagendar, llámanos. ¡Hasta luego!",
            f"Hi {n}, this is {biz}. We're letting you know your order was cancelled. "
            "If you have questions or would like to reschedule, please call us. Goodbye!"
        ),
        "payment_request": (
            f"Hola {n}, de {biz}. Tienes un pago pendiente por tu servicio. "
            "Por favor, revisa el mensaje de texto o el correo electrónico que te enviamos "
            "para completar tu pago. Tu orden no comenzará hasta que se realice el pago. ¡Gracias!",
            f"Hi {n}, this is {biz}. You have a pending payment for your service. "
            "Please check the text message or email we sent you to complete your payment. "
            "Your order will not start until payment is made. Thank you!"
        ),
    }

    es_s, en_s = scripts.get(event, (
        f"Hola {n}, de {biz}. Tienes una actualización en tu servicio. "
        "Revisa tu mensaje de texto para más detalles. ¡Hasta luego!",
        f"Hi {n}, this is {biz}. You have a service update. "
        "Please check your text message for details. Goodbye!"
    ))
    return es_s if is_es else en_s

# ── Construcción premium ──────────────────────────────────────────────
def build_premium_message(
    event: str, status: Optional[str], order_number: str,
    customer_name: Optional[str], language: str,
    pickup_date: Optional[str] = None, pickup_window: Optional[str] = None,
    order_total: Optional[float] = None, shipping_fee: Optional[float] = None,
    service_type: Optional[str] = None, payment_url: Optional[str] = None,
    pickup_address: Optional[str] = None,
    lbs: Optional[float] = None, rate: Optional[float] = None
) -> dict:
    is_es = str(language).lower().startswith("es")
    name = customer_name or ("Cliente" if is_es else "Customer")

    subjects = {
        "order_created":    ("Orden programada — " + BUSINESS_NAME, "Order scheduled — " + BUSINESS_NAME),
        "order_received":   ("Orden recibida — " + BUSINESS_NAME, "Order received — " + BUSINESS_NAME),
        "pickup_confirmed": ("Recolección confirmada ✓ — " + BUSINESS_NAME, "Pickup confirmed ✓ — " + BUSINESS_NAME),
        "processing":       ("Tu ropa está en proceso — " + BUSINESS_NAME, "Your laundry is processing — " + BUSINESS_NAME),
        "ready":            ("¡Tu ropa está lista! — " + BUSINESS_NAME, "Your laundry is ready! — " + BUSINESS_NAME),
        "ready_for_pickup": ("Lista para recoger — " + BUSINESS_NAME, "Ready for pickup — " + BUSINESS_NAME),
        "out_for_delivery": ("En camino 🚚 — " + BUSINESS_NAME, "Out for delivery 🚚 — " + BUSINESS_NAME),
        "delivered":        ("Entrega completada ✓ — " + BUSINESS_NAME, "Delivery completed ✓ — " + BUSINESS_NAME),
        "completed":        ("Servicio completado ✓ — " + BUSINESS_NAME, "Service completed ✓ — " + BUSINESS_NAME),
        "cancelled":        ("Orden cancelada — " + BUSINESS_NAME, "Order cancelled — " + BUSINESS_NAME),
        "store_order":      ("Compra confirmada — " + BUSINESS_NAME, "Purchase confirmed — " + BUSINESS_NAME),
        "payment_request":  ("Pago pendiente — " + BUSINESS_NAME, "Payment required — " + BUSINESS_NAME),
    }
    es_subj, en_subj = subjects.get(event, ("Actualización de orden", "Order update"))
    subject = es_subj if is_es else en_subj

    html_builders = {
        "order_created":    lambda: _html_order_created(name, order_number, pickup_date, pickup_window, is_es),
        "order_received":   lambda: _html_order_received(name, order_number, pickup_date, pickup_window, is_es),
        "pickup_confirmed": lambda: _html_pickup_confirmed(name, order_number, pickup_date, pickup_window, pickup_address, is_es),
        "processing":       lambda: _html_processing(name, order_number, is_es),
        "ready":            lambda: _html_ready(name, order_number, service_type or "", is_es),
        "ready_for_pickup": lambda: _html_ready_for_pickup(name, order_number, is_es),
        "out_for_delivery": lambda: _html_out_for_delivery(name, order_number, is_es),
        "delivered":        lambda: _html_delivered(name, order_number, order_total, is_es),
        "completed":        lambda: _html_completed(name, order_number, order_total, is_es),
        "cancelled":        lambda: _html_cancelled(name, order_number, is_es),
        "store_order":      lambda: _html_store_order(name, order_number, order_total, shipping_fee, is_es),
        "payment_request":  lambda: _html_payment_request(
            name, order_number, order_total or 0, payment_url or "#",
            lbs or 0, rate or 2.75, (lbs or 0) * (rate or 2.75), is_es
        ),
    }

    html = html_builders.get(event, lambda: _html_generic(name, is_es))()
    sms_message = _sms_sync(
        event, name, order_number, language,
        pickup_date, pickup_window, order_total, payment_url,
        pickup_address, lbs, rate
    )
    voice_text = _voice(event, name, order_number, language)
    return {"subject": subject, "message": sms_message, "html": html, "voice_text": voice_text}

async def build_premium_message_async(
    event: str, status: Optional[str], order_number: str,
    customer_name: Optional[str], language: str,
    pickup_date: Optional[str] = None, pickup_window: Optional[str] = None,
    order_total: Optional[float] = None, shipping_fee: Optional[float] = None,
    service_type: Optional[str] = None, payment_url: Optional[str] = None,
    order: Optional[Dict] = None,
    pickup_address: Optional[str] = None
) -> dict:
    final_payment_url = payment_url
    if event == "payment_request":
        if not final_payment_url and order:
            final_payment_url = _generate_internal_payment_url(order)
        if not final_payment_url:
            final_payment_url = f"{FRONTEND_URL.rstrip('/')}/account"

    lbs = None
    rate = None
    if order:
        lbs = order.get("actual_lbs") or order.get("estimated_lbs") or 0
        rate = order.get("price_per_lb") or order.get("rate") or 2.75

    return build_premium_message(
        event=event, status=status, order_number=order_number,
        customer_name=customer_name, language=language,
        pickup_date=pickup_date, pickup_window=pickup_window,
        order_total=order_total, shipping_fee=shipping_fee,
        service_type=service_type, payment_url=final_payment_url,
        pickup_address=pickup_address,
        lbs=lbs, rate=rate
    )

# ── Funciones de envío ────────────────────────────────────────────────
async def _send_with_retries(send_func, *args, **kwargs) -> Tuple[bool, Any]:
    last_exc = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            result = await send_func(*args, **kwargs)
            return True, result
        except Exception as e:
            last_exc = e
            logger.warning(f"Attempt {attempt} failed for {send_func.__name__}: {e}")
            if attempt < MAX_RETRIES:
                await asyncio.sleep(RETRY_DELAY * attempt)
    return False, last_exc

async def send_sms(to_phone: str, message: str) -> bool:
    if not twilio_client or not TWILIO_PHONE_NUMBER:
        logger.warning("Twilio not configured for SMS")
        return False
    formatted = format_phone(to_phone)
    if not formatted:
        logger.error(f"Invalid phone for SMS: {to_phone!r}")
        return False

    async def _send():
        return await asyncio.to_thread(
            twilio_client.messages.create,
            body=message, from_=TWILIO_PHONE_NUMBER, to=formatted
        )

    ok, res = await _send_with_retries(_send)
    if ok:
        logger.info(f"SMS sent to {formatted}: {res.sid}")
        _log_attempt({"channel": "sms", "status": "sent", "to": formatted,
                      "timestamp": datetime.now(timezone.utc).isoformat()})
        return True
    logger.error(f"SMS failed to {formatted}: {res}")
    _log_attempt({"channel": "sms", "status": "failed", "to": formatted,
                  "reason": str(res)[:100], "timestamp": datetime.now(timezone.utc).isoformat()})
    return False

async def send_whatsapp(to_phone: str, message: str) -> bool:
    if not twilio_client or not TWILIO_WHATSAPP_NUMBER:
        logger.warning("Twilio not configured for WhatsApp")
        return False
    formatted = format_whatsapp(to_phone)
    if not formatted:
        logger.error(f"Invalid phone for WhatsApp: {to_phone!r}")
        return False

    async def _send():
        return await asyncio.to_thread(
            twilio_client.messages.create,
            body=message, from_=TWILIO_WHATSAPP_NUMBER, to=formatted
        )

    ok, res = await _send_with_retries(_send)
    if ok:
        logger.info(f"WhatsApp sent to {formatted}: {res.sid}")
        _log_attempt({"channel": "whatsapp", "status": "sent", "to": formatted,
                      "timestamp": datetime.now(timezone.utc).isoformat()})
        return True
    logger.error(f"WhatsApp failed to {formatted}: {res}")
    _log_attempt({"channel": "whatsapp", "status": "failed", "to": formatted,
                  "reason": str(res)[:100], "timestamp": datetime.now(timezone.utc).isoformat()})
    return False

async def send_voice_call(to_phone: str, message: str, language: str) -> bool:
    if not twilio_client or not TWILIO_PHONE_NUMBER:
        logger.warning("Twilio not configured for Voice")
        return False
    formatted = format_phone(to_phone)
    if not formatted:
        return False
    lang_code = "es-MX" if str(language).lower().startswith("es") else "en-US"
    safe_msg = xml.sax.saxutils.escape(message)
    twiml = (
        f'<Response>'
        f'<Say language="{lang_code}" voice="alice" rate="90%">{safe_msg}</Say>'
        f'<Pause length="1"/>'
        f'</Response>'
    )

    async def _send():
        return await asyncio.to_thread(
            twilio_client.calls.create,
            twiml=twiml, to=formatted, from_=TWILIO_PHONE_NUMBER
        )

    ok, res = await _send_with_retries(_send)
    if ok:
        logger.info(f"Call initiated to {formatted}: {res.sid}")
        return True
    logger.error(f"Call failed to {formatted}: {res}")
    return False

async def send_email(
    to_email: str, subject: str, body: str, html_body: Optional[str] = None
) -> bool:
    if not sendgrid_client or not SENDGRID_FROM_EMAIL:
        logger.warning("SendGrid not configured")
        return False
    plain_text = body.replace("*", "").replace("_", "") if body else ""
    message = Mail(
        from_email=(SENDGRID_FROM_EMAIL, SENDGRID_FROM_NAME),
        to_emails=to_email,
        subject=subject,
        html_content=html_body or body,
        plain_text_content=plain_text,
    )

    async def _send():
        return await asyncio.to_thread(sendgrid_client.send, message)

    ok, res = await _send_with_retries(_send)
    if ok:
        logger.info(f"Email sent to {to_email}: {res.status_code}")
        _log_attempt({"channel": "email", "status": "sent", "to": to_email,
                      "timestamp": datetime.now(timezone.utc).isoformat()})
        return res.status_code in [200, 202]
    logger.error(f"Email failed to {to_email}: {res}")
    _log_attempt({"channel": "email", "status": "failed", "to": to_email,
                  "reason": str(res)[:100], "timestamp": datetime.now(timezone.utc).isoformat()})
    return False

# ── AI Groq (opcional) ────────────────────────────────────────────────
async def generate_ai_message(
    context: dict, language: str, channel: str, include_date: bool
) -> Optional[str]:
    client = get_groq_client()
    if not client:
        return None
    lang_label = "Spanish" if str(language).lower().startswith("es") else "English"
    date_instr = "Include pickup date." if include_date else "Do NOT include any dates."
    prompt = (
        f"You are the assistant for {BUSINESS_NAME}. "
        f"Write a short {channel} in {lang_label}. {date_instr} "
        "Friendly, concise, professional. Return ONLY the text. "
        f"Context: {json.dumps(context, ensure_ascii=False)}"
    )
    try:
        response = await asyncio.to_thread(
            client.chat.completions.create,
            messages=[{"role": "user", "content": prompt}],
            model="llama-3.3-70b-versatile",
            temperature=0.4,
            max_tokens=200,
        )
        return response.choices[0].message.content.strip()
    except Exception as e:
        logger.error(f"Groq failed: {e}")
        return None

# ── Membership payment skip helper ────────────────────────────────────
async def _should_skip_payment_notification(order: dict, customer: dict) -> bool:
    membership_status = (customer or {}).get("membership_status", "")
    if membership_status.lower() not in ("active", "activo"):
        return False

    membership_plan = (customer or {}).get("membership_plan") or (order or {}).get("membership_plan_applied") or ""
    if not membership_plan:
        return False

    order_lbs = float(order.get("actual_lbs") or order.get("estimated_lbs") or 0)
    if order_lbs <= 0:
        return False

    plan_lower = membership_plan.lower()
    if "elite" in plan_lower:
        lbs_allowance = 120
    elif "family plus" in plan_lower or "family" in plan_lower:
        lbs_allowance = 90
    elif "most popular" in plan_lower or "popular" in plan_lower:
        lbs_allowance = 60
    else:
        return False

    customer_id = (customer or {}).get("id")
    if not customer_id:
        return False

    try:
        from database import db as _db
        from utils import get_customer_cycle_usage

        usage = await get_customer_cycle_usage(customer_id)
        if not usage:
            return False

        lbs_remaining = usage.get("lbs_remaining", 0)
        if order_lbs <= lbs_remaining:
            return True
        return False
    except Exception as e:
        logger.warning(f"Could not determine membership usage for payment skip check: {e}")
        return False

# ── Orquestador principal (FIX central) ──────────────────────────────
async def send_preferred_notification(
    customer: Optional[Dict], order: Optional[Dict],
    event: str, status: Optional[str] = None
) -> bool:
    if not customer or not order:
        logger.error("Customer or order missing for notification")
        return False

    raw_service_type = order.get("service_type") or "pickup_delivery"

    # FIX: usar _detect_order_flow para una detección robusta y consistente
    flow = _detect_order_flow(raw_service_type)
    service_type_normalized = normalize_status_value(raw_service_type)

    logger.info(
        f"[notification] order={order.get('order_number')} "
        f"service_type='{raw_service_type}' flow='{flow}' "
        f"event='{event}' status='{status}'"
    )

    # ── Mapear evento al nombre canónico ──────────────────────────────
    mapped_event = event

    if event == "status_changed":
        # FIX: usar los mapas que soportan MAYÚSCULAS y minúsculas
        status_key = (status or "").strip()
        if flow == "wash_fold":
            mapped_event = _WF_STATUS_MAP.get(status_key) or _WF_STATUS_MAP.get(status_key.lower(), "")
        else:
            mapped_event = _PD_STATUS_MAP.get(status_key) or _PD_STATUS_MAP.get(status_key.lower(), "")

        if not mapped_event:
            logger.info(f"[notification] Status '{status}' has no mapped event for flow '{flow}', skipping.")
            return False

    elif event == "order_created":
        # Wash & Fold: order_created → order_received
        if flow == "wash_fold":
            mapped_event = "order_received"
        else:
            mapped_event = EVENT_MAPPING.get(event, event)
    else:
        mapped_event = EVENT_MAPPING.get(event, event)

    # Verificar que el evento sea un milestone válido para el flujo
    if mapped_event != "payment_request" and mapped_event not in MILESTONES.get(flow, set()):
        logger.info(f"[notification] Event '{mapped_event}' not a milestone for flow '{flow}', skipping.")
        return False

    if mapped_event == "status_changed" or not mapped_event:
        logger.info(f"[notification] No valid mapped_event, skipping.")
        return False

    # Verificar skip de pago por membresía
    if mapped_event == "payment_request":
        skip = await _should_skip_payment_notification(order, customer)
        if skip:
            logger.info(f"[notification] Payment skipped — membership covers order {order.get('order_number')}")
            return True

    order_number = order.get("order_number", order.get("id", "N/A"))
    phone = customer.get("phone")
    email = customer.get("email")

    language = detect_language(customer, phone)
    logger.debug(f"[notification] language={language} order={order_number}")

    customer_name = customer.get("name") or ""
    include_date = mapped_event in {
        "order_created", "order_received", "pickup_scheduled", "pickup_reminder",
        "pickup_completed", "pickup_update", "pickup_confirmed"
    }
    pickup_date    = order.get("pickup_date") if include_date else None
    pickup_window  = order.get("pickup_time_window") if include_date else None
    order_total    = order.get("total") or order.get("total_amount")
    shipping_fee   = order.get("shipping_fee")
    payment_url    = order.get("payment_url") or order.get("checkout_url")
    pickup_address = order.get("pickup_address") if include_date else None

    if mapped_event == "payment_request" and not payment_url:
        payment_url = _generate_internal_payment_url(order)
        if not payment_url:
            logger.error(f"[notification] payment_request aborted: no URL for order {order_number}")
            _log_attempt({
                "timestamp": datetime.now().isoformat(),
                "order_id": order.get("id"), "event": mapped_event,
                "status": "failed_no_url"
            })
            return False

    content = await build_premium_message_async(
        event=mapped_event, status=status,
        order_number=order_number, customer_name=customer_name,
        language=language, pickup_date=pickup_date, pickup_window=pickup_window,
        order_total=order_total, shipping_fee=shipping_fee,
        service_type=service_type_normalized, payment_url=payment_url,
        order=order,
        pickup_address=pickup_address,
    )
    message    = content["message"]
    html_body  = content["html"]
    subject    = content["subject"]
    voice_text = content["voice_text"]

    if GROQ_API_KEY and USE_ULTRA_PREMIUM:
        try:
            ai_subject = await generate_ai_message(
                context={"event": mapped_event, "order_number": order_number, "customer_name": customer_name},
                language=language, channel="email subject line", include_date=include_date
            )
            if ai_subject and len(ai_subject.strip()) < 80:
                subject = ai_subject.strip()
        except Exception as e:
            logger.warning(f"AI subject generation failed: {e}")

    preference = normalize_preferred_contact(
        (order or {}).get("preferred_contact")
        or extract_contact_from_notes(order)
        or (customer or {}).get("preferred_contact")
    )
    sms_ok = has_sms_consent(order, customer)
    if preference in {"sms", "whatsapp"} and not sms_ok:
        preference = "email" if email else "call"

    if detect_country(phone) == "mx" and preference == "sms" and TWILIO_WHATSAPP_NUMBER:
        preference = "whatsapp"

    dedupe_key = f"{order.get('id')}:{mapped_event}:{preference}:{language}"
    if await _is_already_sent_db(dedupe_key):
        logger.info(f"[notification] Duplicate skipped: {dedupe_key}")
        _log_attempt({
            "timestamp": datetime.now().isoformat(),
            "order_id": order.get("id"), "event": mapped_event,
            "channel": preference, "status": "duplicate_skipped"
        })
        return True

    if ENFORCE_QUIET_HOURS and is_quiet_hours():
        logger.info(f"[notification] Quiet hours active, queued: {dedupe_key}")
        _log_attempt({
            "timestamp": datetime.now().isoformat(),
            "order_id": order.get("id"), "event": mapped_event,
            "channel": preference, "status": "queued_quiet_hours"
        })
        return False

    logger.info(
        f"[notification] Sending: order={order_number} event={mapped_event} "
        f"channel={preference} lang={language}"
    )

    success = False
    if preference == "email":
        success = await send_email(email, subject, message, html_body) if email else await send_sms(phone, message) if phone else False
    elif preference == "call":
        success = await send_voice_call(phone, voice_text, language) if phone else await send_email(email, subject, message, html_body) if email else False
    elif preference == "whatsapp":
        if phone:
            success = await send_whatsapp(phone, message)
            if not success:
                logger.info(f"[notification] WhatsApp failed → SMS fallback for order {order.get('id')}")
                success = await send_sms(phone, message)
        if not success and email:
            logger.info(f"[notification] WhatsApp+SMS failed → Email fallback for order {order.get('id')}")
            success = await send_email(email, subject, message, html_body)
    else:  # sms default
        if phone:
            success = await send_sms(phone, message)
        if not success and email:
            logger.info(f"[notification] SMS failed → Email fallback for order {order.get('id')}")
            success = await send_email(email, subject, message, html_body)

    _log_attempt({
        "timestamp": datetime.now().isoformat(),
        "order_id": order.get("id"), "event": mapped_event,
        "channel": preference, "status": "sent" if success else "failed"
    })
    if success:
        await _mark_sent_db(dedupe_key)

    return success

# ── Funciones públicas de entrada ─────────────────────────────────────
async def notify_order_created(customer: Dict, order: Dict) -> bool:
    return await send_preferred_notification(customer, order, "order_created")

async def notify_store_order(customer: Dict, order: Dict) -> bool:
    return await send_preferred_notification(customer, order, "store_order")

async def notify_order_status_changed(customer: Dict, order: Dict, new_status: str) -> bool:
    return await send_preferred_notification(customer, order, "status_changed", new_status)

async def notify_pickup_scheduled(customer: Dict, order: Dict) -> bool:
    return await send_preferred_notification(customer, order, "pickup_scheduled")

async def notify_pickup_reminder(customer: Dict, order: Dict) -> bool:
    return await send_preferred_notification(customer, order, "pickup_reminder")

async def notify_pickup_completed(customer: Dict, order: Dict) -> bool:
    return await send_preferred_notification(customer, order, "pickup_completed")

async def notify_pickup_update(customer: Dict, order: Dict) -> bool:
    return await send_preferred_notification(customer, order, "pickup_update")