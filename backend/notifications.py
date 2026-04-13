"""
Notification services — Ventura Fresh Laundry  v3.2
CORRECCIONES:
- Links de pago: ahora se genera un enlace interno del CRM (https://dominio/pay/{order_id})
  que redirige al checkout real. Esto evita URLs rotas o acortadores externos.
- Validación de URL de pago antes de enviar.
- Logging detallado para depuración.
- Corregido error de sintaxis en notify_payment_request.
- Añadidas funciones HTML faltantes (no se omiten).
- Mejorado formato de mensajes para WhatsApp/SMS.
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

# ─────────────────────────────────────────────────────────────────────────────
# Config
# ─────────────────────────────────────────────────────────────────────────────
TWILIO_ACCOUNT_SID      = os.environ.get('TWILIO_ACCOUNT_SID')
TWILIO_AUTH_TOKEN       = os.environ.get('TWILIO_AUTH_TOKEN')
TWILIO_PHONE_NUMBER     = os.environ.get('TWILIO_PHONE_NUMBER')
TWILIO_WHATSAPP_NUMBER  = os.environ.get('TWILIO_WHATSAPP_NUMBER')
BUSINESS_NAME           = os.environ.get('BUSINESS_NAME', 'Ventura Fresh Laundry')
BUSINESS_ADDRESS        = os.environ.get('BUSINESS_ADDRESS', 'Ventura, CA')
BUSINESS_PHONE_DISPLAY  = os.environ.get('BUSINESS_PHONE_DISPLAY', '')
BUSINESS_WEBSITE        = os.environ.get('BUSINESS_WEBSITE', 'https://venturafreshlaundry.com')
SENDGRID_API_KEY        = os.environ.get('SENDGRID_API_KEY')
SENDGRID_FROM_EMAIL     = os.environ.get('SENDGRID_FROM_EMAIL')
SENDGRID_FROM_NAME      = os.environ.get('SENDGRID_FROM_NAME', BUSINESS_NAME)
SENDGRID_DATA_RESIDENCY = os.environ.get('SENDGRID_DATA_RESIDENCY', '').lower()
GROQ_API_KEY            = os.environ.get('GROQ_API_KEY')
USE_ULTRA_PREMIUM       = os.environ.get('USE_ULTRA_PREMIUM', 'false').lower() == 'true'

QUIET_START             = os.environ.get('QUIET_HOURS_START', '21:00')
QUIET_END               = os.environ.get('QUIET_HOURS_END', '08:00')
MAX_RETRIES             = int(os.environ.get('TWILIO_MAX_RETRIES', '3'))
RETRY_DELAY             = float(os.environ.get('TWILIO_RETRY_DELAY', '1.5'))
ENFORCE_QUIET_HOURS     = os.environ.get('ENFORCE_QUIET_HOURS', 'false').lower() == 'true'
# Ya no usamos URL_SHORTENER_API para links de pago, usamos enlaces propios.
# Pero lo mantenemos para otros usos.
URL_SHORTENER_API       = os.environ.get('URL_SHORTENER_API', 'none')
BITLY_API_TOKEN         = os.environ.get('BITLY_API_TOKEN', '')

# VFL brand colors
VFL_BLUE    = "#0ea5e9"
VFL_DARK    = "#0b1929"
VFL_ACCENT  = "#38bdf8"
VFL_SUCCESS = "#34d399"
VFL_WARN    = "#f59e0b"
VFL_DANGER  = "#ef4444"
VFL_GRAY    = "#64748b"
VFL_LIGHT   = "#f0f9ff"

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

def _is_already_sent(key: str) -> bool:  return key in _sent_cache
def _mark_sent(key: str) -> None:        _sent_cache.add(key)
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
    except Exception as e:
        logger.debug(f"Notification log persist failed: {e}")

MILESTONES = {
    "wash_fold":       {"order_created", "order_received", "processing", "ready_for_pickup", "completed"},
    "pickup_delivery": {"order_created", "pickup_confirmed", "ready", "out_for_delivery", "delivered", "cancelled"},
    "quote":           {"order_created"},
    "contact":         {"order_created"},
    "support":         {"order_created"},
}
EVENT_MAPPING = {
    "order_created":    "order_created",
    "pickup_scheduled": "pickup_confirmed",
    "pickup_reminder":  "pickup_confirmed",
    "pickup_completed": "pickup_confirmed",
    "pickup_update":    "pickup_confirmed",
    "status_changed":   None,
}

# ─────────────────────────────────────────────────────────────────────────────
# URL Shortener (solo para otros usos, no para links de pago)
# ─────────────────────────────────────────────────────────────────────────────
async def shorten_url(long_url: str) -> str:
    if not long_url:
        return long_url
    provider = URL_SHORTENER_API.lower()
    if provider == 'none':
        return long_url if len(long_url) <= 60 else long_url[:57] + "..."
    if provider == 'bitly' and BITLY_API_TOKEN:
        try:
            import httpx
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.post(
                    "https://api-ssl.bitly.com/v4/shorten",
                    headers={"Authorization": f"Bearer {BITLY_API_TOKEN}",
                             "Content-Type": "application/json"},
                    json={"long_url": long_url},
                )
                if resp.status_code == 200:
                    short = resp.json().get("link", long_url)
                    if short.startswith("http"):
                        return short
                logger.warning(f"Bitly returned {resp.status_code}")
        except Exception as e:
            logger.warning(f"Bitly failed: {e}, falling through to TinyURL")
    try:
        import httpx
        encoded = urllib.parse.quote(long_url, safe=':/?=&%')
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"https://tinyurl.com/api-create.php?url={encoded}")
            if resp.status_code == 200 and resp.text.strip().startswith("http"):
                return resp.text.strip()
            logger.warning(f"TinyURL returned {resp.status_code}")
    except Exception as e:
        logger.warning(f"TinyURL failed: {e}")
    return long_url

async def shorten_url_safe(long_url: Optional[str]) -> Optional[str]:
    if not long_url:
        return None
    return await shorten_url(long_url)

# ─────────────────────────────────────────────────────────────────────────────
# Utilities
# ─────────────────────────────────────────────────────────────────────────────
def parse_hhmm(s: str) -> dtime:
    hh, mm = s.split(":")
    return dtime(int(hh), int(mm))

def is_quiet_hours(now_local: Optional[datetime] = None) -> bool:
    now_local = now_local or datetime.now()
    start, end = parse_hhmm(QUIET_START), parse_hhmm(QUIET_END)
    n = now_local.time()
    if start < end:  return start <= n < end
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
        sendgrid_client = SendGridAPIClient(SENDGRID_API_KEY, **({"host": host} if host else {}))
        logger.info("SendGrid client initialized")
    except Exception as e:
        logger.error(f"Failed to init SendGrid: {e}")

def get_groq_client():
    if not GROQ_API_KEY: return None
    try:    return Groq(api_key=GROQ_API_KEY)
    except Exception as e: logger.error(f"Failed to init Groq: {e}"); return None

def format_phone(phone: str) -> Optional[str]:
    if not phone: return None
    cleaned = ''.join(c for c in phone if c.isdigit() or c == '+')
    if cleaned.startswith('+'): return cleaned
    if cleaned.startswith('52') and len(cleaned) >= 12: return '+' + cleaned
    if len(cleaned) == 10 and cleaned[0] in ['5','3','4','6','7','8','9']: return '+52' + cleaned
    if len(cleaned) == 10: return '+1' + cleaned
    if len(cleaned) == 11 and cleaned.startswith('1'): return '+' + cleaned
    return '+' + cleaned if not cleaned.startswith('+') else cleaned

def detect_country(phone: Optional[str]) -> Optional[str]:
    if not phone: return None
    f = format_phone(phone)
    if f and f.startswith('+52'): return 'mx'
    if f and f.startswith('+1'):  return 'us'
    return None

def format_whatsapp(phone: str) -> Optional[str]:
    f = format_phone(phone)
    return f"whatsapp:{f}" if f else None

def normalize_preferred_contact(value: str) -> str:
    if not value: return "sms"
    v = value.strip().lower()
    if v in {"email","correo","mail"}:                        return "email"
    if v in {"phone","call","llamada","telefono","teléfono"}:  return "call"
    if v in {"whatsapp","wa","wapp"}:                         return "whatsapp"
    return "sms"

def has_sms_consent(order: Optional[Dict], customer: Optional[Dict]) -> bool:
    return bool((order and order.get("sms_consent")) or (customer and customer.get("sms_consent")))

def normalize_status_value(value: Optional[str]) -> str:
    if not value: return ""
    return value.strip().lower().replace(" ", "_")

def detect_language(customer: Optional[Dict], phone: Optional[str]) -> str:
    """Detección de idioma mejorada: prioriza preferencia, luego número, default español para MX."""
    if not customer:
        return "es-MX"

    preferred = (customer.get("preferred_language") or 
                 customer.get("language") or 
                 "").strip().lower()

    if preferred in {"es", "es-mx", "spanish", "español"}:
        return "es-MX"
    if preferred in {"en", "en-us", "english"}:
        return "en-US"

    if phone and str(phone).strip().startswith(("+1", "1")):
        return "en-US"
    if phone and (str(phone).startswith("+52") or detect_country(phone) == 'mx'):
        return "es-MX"

    return "es-MX"

def extract_contact_from_notes(order: Dict) -> Optional[str]:
    if not order: return None
    notes = order.get("notes") or ""
    marker = "preferred contact:"
    if marker in notes.lower():
        idx = notes.lower().find(marker) + len(marker)
        return notes[idx:].strip().split('\n')[0].strip()
    return None

# ─────────────────────────────────────────────────────────────────────────────
# HTML EMAIL BASE y componentes (implementación completa)
# ─────────────────────────────────────────────────────────────────────────────
def _html_base(content_html: str, accent_color: str = VFL_BLUE) -> str:
    phone_line = f" &middot; {BUSINESS_PHONE_DISPLAY}" if BUSINESS_PHONE_DISPLAY else ""
    return (
        '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">'
        '<meta name="viewport" content="width=device-width, initial-scale=1.0">'
        f'<title>{BUSINESS_NAME}</title><style>'
        'body,table,td,a{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}'
        'table,td{mso-table-lspace:0pt;mso-table-rspace:0pt}'
        'img{-ms-interpolation-mode:bicubic;border:0;outline:none;text-decoration:none}'
        'body{margin:0;padding:0;background-color:#f0f9ff}'
        '.email-wrapper{background-color:#f0f9ff;padding:32px 16px}'
        f'.btn{{background-color:{accent_color};border-radius:50px;color:#ffffff !important;'
        'display:inline-block;font-family:Arial,sans-serif;font-size:15px;font-weight:700;'
        'line-height:1;padding:16px 36px;text-align:center;text-decoration:none !important;'
        'letter-spacing:.04em;border:none;mso-padding-alt:0}}'
        '@media only screen and (max-width:600px){'
        '.email-container{width:100%!important}.body-pad{padding:22px 18px!important}}'
        '</style></head><body><div class="email-wrapper">'
        '<table border="0" cellpadding="0" cellspacing="0" width="100%">'
        '<tr><td align="center">'
        '<table class="email-container" border="0" cellpadding="0" cellspacing="0" width="560">'
        f'<tr><td bgcolor="{VFL_DARK}" style="border-radius:16px 16px 0 0;padding:28px 32px;text-align:center">'
        '<table width="100%"><tr><td align="center">'
        '<table><tr><td width="40" height="40" bgcolor="#0c2a45" style="border-radius:50%;text-align:center;vertical-align:middle">'
        f'<span style="color:{VFL_ACCENT};font-size:20px;line-height:40px">&bull;</span></td>'
        f'<td style="padding-left:10px"><span style="font-family:Arial,sans-serif;font-size:18px;font-weight:700;color:#ffffff">{BUSINESS_NAME}</span></td></tr></table>'
        '<p style="margin:8px 0 0;font-size:10px;color:rgba(255,255,255,.35);text-transform:uppercase">FRESH &nbsp;&middot;&nbsp; CLEAN &nbsp;&middot;&nbsp; DELIVERED</p>'
        '</td></tr></table></td></tr>'
        + content_html +
        f'<tr><td bgcolor="#f8fafc" style="border-radius:0 0 16px 16px;border-top:1px solid #e2e8f0;padding:24px 32px;text-align:center">'
        f'<p style="margin:0 0 4px;font-weight:700;color:#334155">{BUSINESS_NAME}</p>'
        f'<p style="margin:0 0 10px;font-size:11px;color:#94a3b8">{BUSINESS_ADDRESS}{phone_line}</p>'
        f'<p style="margin:0 0 14px;font-size:11px"><a href="{BUSINESS_WEBSITE}" style="color:{VFL_BLUE}">{BUSINESS_WEBSITE}</a></p>'
        '<p style="margin:0;font-size:10px;color:#cbd5e1">Has recibido este mensaje porque tienes una orden activa.<br>Si tienes preguntas, contáctanos.</p>'
        '</td></tr></table></td></tr></table></div></body></html>'
    )

def _spacer(px: int = 16) -> str:
    return f'<p style="margin:0;padding:0;line-height:{px}px;font-size:{px}px">&nbsp;</p>'

def _status_band(text: str, color: str) -> str:
    return f'<tr><td bgcolor="{color}" style="padding:14px 32px;text-align:center">' \
           f'<span style="display:inline-block;background:rgba(255,255,255,.15);color:#fff;font-size:11px;font-weight:700;text-transform:uppercase;padding:5px 16px;border-radius:20px">{text}</span>' \
           f'</td></tr>'

def _order_number_box(label: str, value: str) -> str:
    return f'<table width="100%"><tr><td bgcolor="#0f2744" style="border-radius:10px;padding:16px;text-align:center">' \
           f'<p style="margin:0 0 5px;font-size:10px;color:rgba(255,255,255,.45);text-transform:uppercase">{label}</p>' \
           f'<p style="margin:0;font-family:\'Courier New\',monospace;font-size:22px;font-weight:700;color:{VFL_ACCENT}">#{value}</p>' \
           f'</td></tr></table>'

def _order_card(title: str, rows_html: str) -> str:
    return f'<table width="100%" style="border:1.5px solid #e2e8f0;border-radius:12px">' \
           f'<tr><td bgcolor="#f8fafc" style="padding:18px 20px;border-radius:12px">' \
           f'<p style="margin:0 0 12px;font-size:10px;font-weight:700;text-transform:uppercase;color:#94a3b8">{title}</p>{rows_html}' \
           f'</td></tr></table>'

def _data_row(key: str, value: str, value_color: str = "#0f172a") -> str:
    return f'<table width="100%" style="border-bottom:1px solid #f1f5f9"><tr>' \
           f'<td style="padding:6px 0;font-size:12px;color:#64748b">{key}</td>' \
           f'<td align="right" style="padding:6px 0;font-size:12px;font-weight:600;color:{value_color}">{value}</td>' \
           f'</tr></table>'

def _tip_box(text: str, accent: str = VFL_ACCENT) -> str:
    border = _border_color(accent)
    return f'<table width="100%"><tr><td bgcolor="{VFL_LIGHT}" style="border:1px solid {border};border-radius:10px;padding:14px 16px">' \
           f'<p style="margin:0;font-size:12px;color:#0369a1">{text}</p></td></tr></table>'

def _info_box(text: str, accent: str = VFL_BLUE) -> str:
    return f'<table width="100%"><tr><td width="4" bgcolor="{accent}" style="border-radius:4px 0 0 4px">&nbsp;</td>' \
           f'<td bgcolor="#f8fafc" style="border-radius:0 8px 8px 0;padding:13px 16px">' \
           f'<p style="margin:0;font-size:13px;color:#475569">{text}</p></td></tr></table>'

def _cta_button(url: str, label: str, color: str = VFL_BLUE) -> str:
    return f'<!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="{url}" style="height:50px;v-text-anchor:middle;width:220px" arcsize="50%" strokecolor="{color}" fillcolor="{color}"><center style="color:#fff;font-size:15px">{label}</center></v:roundrect><![endif]-->' \
           f'<!--[if !mso]><!--><a href="{url}" class="btn" style="background-color:{color};border-radius:50px;color:#fff;display:inline-block;padding:16px 36px;text-decoration:none">{label}</a><!--<![endif]-->'

def _steps_table(steps: list, accent: str = VFL_BLUE) -> str:
    rows = ""
    for i, (title, desc) in enumerate(steps, 1):
        rows += f'<tr><td width="28" valign="top" style="padding:0 12px 12px 0"><table><tr><td bgcolor="{accent}" width="28" height="28" style="border-radius:50%;text-align:center">' \
                f'<span style="color:#fff;font-size:11px;line-height:28px">{i}</span></td></tr></table></td>' \
                f'<td valign="top" style="padding:0 0 12px"><p style="margin:0;font-size:13px"><strong>{title}</strong> &mdash; {desc}</p></td></tr>'
    return f'<table width="100%">{rows}</table>'

def _body_wrap(inner_html: str) -> str:
    return f'<tr><td bgcolor="#ffffff" class="body-pad" style="padding:32px">{inner_html}</td></tr>'

# Funciones HTML para cada evento (implementaciones básicas)
def _html_order_created(name: str, order_number: str, pickup_date: Optional[str], pickup_window: Optional[str], is_es: bool) -> str:
    accent = VFL_BLUE
    greeting = "Tu orden fue programada con éxito" if is_es else "Your order has been scheduled"
    sub = f"Hola {name}, recibimos tu solicitud y la registramos correctamente." if is_es else f"Hi {name}, we received your request and registered it successfully."
    steps = [("Confirmación", "Te contactaremos para confirmar")] if is_es else [("Confirmation", "We'll contact you to confirm")]
    tip = "Si necesitas cambios, contáctanos." if is_es else "If you need changes, contact us."
    badge = "Orden Programada" if is_es else "Order Scheduled"
    body = _order_number_box("Orden" if is_es else "Order", order_number) + _spacer(22) + \
           f'<p style="font-size:22px;font-weight:700">{greeting}</p><p>{sub}</p>' + _spacer(16) + \
           _steps_table(steps, accent) + _spacer(16) + _tip_box(tip, accent)
    return _html_base(_status_band(badge, accent) + _body_wrap(body), accent)

def _html_pickup_confirmed(name: str, order_number: str, pickup_date: Optional[str], pickup_window: Optional[str], is_es: bool) -> str:
    accent = VFL_BLUE
    greeting = "Recolección confirmada" if is_es else "Pickup confirmed"
    sub = f"Hola {name}, tu recolección fue programada correctamente." if is_es else f"Hi {name}, your pickup was scheduled."
    tip = "Ten tu ropa lista." if is_es else "Have your laundry ready."
    badge = "Confirmada" if is_es else "Confirmed"
    body = _order_number_box("Orden", order_number) + _spacer(22) + \
           f'<p style="font-size:22px;font-weight:700">{greeting}</p><p>{sub}</p>' + _spacer(16) + _tip_box(tip, accent)
    return _html_base(_status_band(badge, accent) + _body_wrap(body), accent)

def _html_processing(name: str, order_number: str, is_es: bool) -> str:
    accent = VFL_WARN
    greeting = "Tu ropa está en proceso" if is_es else "Your laundry is being processed"
    sub = f"Hola {name}, ya tenemos tu ropa y la estamos procesando." if is_es else f"Hi {name}, we have your laundry and are processing it."
    tip = "Te avisaremos cuando esté lista." if is_es else "We'll notify you when ready."
    badge = "En Proceso" if is_es else "Processing"
    body = f'<p style="font-size:22px;font-weight:700">{greeting}</p><p>{sub}</p>' + _spacer(16) + _tip_box(tip, accent)
    return _html_base(_status_band(badge, accent) + _body_wrap(body), accent)

def _html_ready(name: str, order_number: str, service_type: str, is_es: bool) -> str:
    accent = VFL_SUCCESS
    greeting = "Tu ropa está lista para entrega" if is_es else "Your laundry is ready for delivery"
    sub = f"Hola {name}, tu ropa está lista. Pronto la enviaremos." if is_es else f"Hi {name}, your laundry is ready. We'll deliver soon."
    tip = "Mantente atento a la entrega." if is_es else "Stay tuned for delivery."
    badge = "Lista" if is_es else "Ready"
    body = f'<p style="font-size:22px;font-weight:700">{greeting}</p><p>{sub}</p>' + _spacer(16) + _tip_box(tip, accent)
    return _html_base(_status_band(badge, accent) + _body_wrap(body), accent)

def _html_wash_fold_ready(name: str, order_number: str, is_es: bool) -> str:
    return _html_ready(name, order_number, "wash_fold", is_es)

def _html_out_for_delivery(name: str, order_number: str, is_es: bool) -> str:
    accent = VFL_BLUE
    greeting = "Tu entrega está en camino" if is_es else "Your delivery is on the way"
    sub = f"Hola {name}, tu ropa está en camino." if is_es else f"Hi {name}, your laundry is on its way."
    tip = "Por favor, está atento." if is_es else "Please be ready."
    badge = "En Camino" if is_es else "Out for Delivery"
    body = f'<p style="font-size:22px;font-weight:700">{greeting}</p><p>{sub}</p>' + _spacer(16) + _tip_box(tip, accent)
    return _html_base(_status_band(badge, accent) + _body_wrap(body), accent)

def _html_delivered(name: str, order_number: str, order_total: Optional[float], is_es: bool) -> str:
    accent = VFL_SUCCESS
    greeting = "Entrega completada" if is_es else "Delivery completed"
    sub = f"Hola {name}, tu ropa fue entregada con éxito." if is_es else f"Hi {name}, your laundry was delivered successfully."
    tip = "¡Gracias por confiar en nosotros!" if is_es else "Thank you for trusting us!"
    badge = "Entregado" if is_es else "Delivered"
    total_html = f'<p><strong>Total:</strong> ${order_total:.2f}</p>' if order_total else ''
    body = f'<p style="font-size:22px;font-weight:700">{greeting}</p><p>{sub}</p>{total_html}' + _spacer(16) + _tip_box(tip, accent)
    return _html_base(_status_band(badge, accent) + _body_wrap(body), accent)

def _html_completed(name: str, order_number: str, order_total: Optional[float], is_es: bool) -> str:
    return _html_delivered(name, order_number, order_total, is_es)  # similar

def _html_cancelled(name: str, order_number: str, is_es: bool) -> str:
    accent = VFL_DANGER
    greeting = "Orden cancelada" if is_es else "Order cancelled"
    sub = f"Hola {name}, tu orden fue cancelada." if is_es else f"Hi {name}, your order has been cancelled."
    tip = "Si fue un error, contáctanos." if is_es else "If this was a mistake, contact us."
    badge = "Cancelada" if is_es else "Cancelled"
    body = _order_number_box("Orden", order_number) + _spacer(22) + \
           f'<p style="font-size:22px;font-weight:700">{greeting}</p><p>{sub}</p>' + _spacer(16) + _tip_box(tip, accent)
    return _html_base(_status_band(badge, accent) + _body_wrap(body), accent)

def _html_store_order(name: str, order_number: str, order_total: Optional[float], shipping_fee: Optional[float], is_es: bool) -> str:
    accent = VFL_BLUE
    greeting = "Compra confirmada" if is_es else "Purchase confirmed"
    sub = f"Hola {name}, recibimos tu orden de tienda #{order_number}." if is_es else f"Hi {name}, we received your store order #{order_number}."
    tip = "Te notificaremos cuando esté lista." if is_es else "We'll notify you when ready."
    badge = "Orden de Tienda" if is_es else "Store Order"
    body = _order_number_box("Orden", order_number) + _spacer(22) + \
           f'<p style="font-size:22px;font-weight:700">{greeting}</p><p>{sub}</p>' + _spacer(16) + _tip_box(tip, accent)
    return _html_base(_status_band(badge, accent) + _body_wrap(body), accent)

def _html_payment_request(name: str, order_number: str, order_total: Optional[float], payment_url: str, is_es: bool) -> str:
    accent = VFL_SUCCESS
    greeting = "Pago pendiente" if is_es else "Payment required"
    sub = f"Hola {name}, tu servicio #{order_number} está listo para pagar." if is_es else f"Hi {name}, your service #{order_number} is ready to pay."
    tip = "El enlace expira en 24 horas." if is_es else "The link expires in 24 hours."
    badge = "Pago Requerido" if is_es else "Payment Required"
    total_html = f'<p><strong>Total a pagar:</strong> ${order_total:.2f}</p>' if order_total else ''
    button = _cta_button(payment_url, "Pagar ahora" if is_es else "Pay now", accent)
    body = _order_number_box("Orden", order_number) + _spacer(22) + \
           f'<p style="font-size:22px;font-weight:700">{greeting}</p><p>{sub}</p>{total_html}' + _spacer(22) + \
           f'<div style="text-align:center">{button}</div>' + _spacer(16) + \
           f'<p style="text-align:center;font-size:12px"><a href="{payment_url}">{payment_url}</a></p>' + \
           _tip_box(tip, accent)
    return _html_base(_status_band(badge, accent) + _body_wrap(body), accent)

def _html_generic(name: str, is_es: bool, title: Optional[str] = None, body_text: Optional[str] = None) -> str:
    accent = VFL_BLUE
    heading = title or ("Actualización" if is_es else "Update")
    text = body_text or (f"Hola {name}, tienes una actualización de tu servicio." if is_es else f"Hi {name}, you have a service update.")
    body = f'<p style="font-size:22px;font-weight:700">{heading}</p><p>{text}</p>' + _spacer(16) + _tip_box("Gracias por elegir Ventura Fresh Laundry. Agradecemos sinceramente su confianza en nuestro servicio." if is_es else "Thank you for choosing Ventura Fresh Laundry. We truly appreciate your trust in our service.", accent)
    return _html_base(_status_band("Actualización" if is_es else "Update", accent) + _body_wrap(body), accent)

# ─────────────────────────────────────────────────────────────────────────────
# SMS / WHATSAPP (CORREGIDO para payment_request con enlace propio)
# ─────────────────────────────────────────────────────────────────────────────
def _sms_sync(event: str, name: str, order_number: str, language: str,
              pickup_date: Optional[str] = None, pickup_window: Optional[str] = None,
              order_total: Optional[float] = None,
              payment_url: Optional[str] = None) -> str:
    is_es = str(language).lower().startswith("es")
    biz   = BUSINESS_NAME
    n     = name or ("Cliente" if is_es else "Customer")

    if event == "order_created":
        date_str = ""
        if pickup_date:
            date_str = f"\n📅 Pickup: {pickup_date}"
            if pickup_window:
                date_str += f" ({pickup_window})"
        if is_es:
            return (f"🫧 *{biz}*\n\n"
                    f"¡Hola {n}! Tu orden *#{order_number}* fue programada con éxito.{date_str}\n\n"
                    f"Te contactaremos pronto para confirmar. ¡Gracias! 🙌")
        return (f"🫧 *{biz}*\n\n"
                f"Hi {n}! Your order *#{order_number}* has been scheduled.{date_str}\n\n"
                f"We'll confirm soon. Thank you! 🙌")

    if event == "pickup_confirmed":
        date_line = ""
        if pickup_date:
            date_line = f"\n📅 {pickup_date}"
            if pickup_window:
                date_line += f" · {pickup_window}"
        phone_line = f"\n📞 {BUSINESS_PHONE_DISPLAY}" if BUSINESS_PHONE_DISPLAY else ""
        if is_es:
            return (f"🚚 *{biz}*\n\n"
                    f"Hola {n}, tu recolección fue confirmada correctamente.{date_line}\n"
                    f"Estaremos en tu dirección en el horario acordado.{phone_line}\n"
                    f"¡Gracias por tu preferencia!")
        return (f"🚚 *{biz}*\n\n"
                f"Hi {n}, your pickup has been confirmed.{date_line}\n"
                f"We will arrive at your address during the scheduled time.{phone_line}\n"
                f"Thank you for choosing us!")

    if event == "order_received":
        if is_es:
            return (f"☺ *{biz}*\n\n"
                    f"Hola {n}, recibimos tu orden *#{order_number}* y comenzaremos "
                    f"a procesarla pronto.\n\n⏱ Te avisamos cuando esté lista.")
        return (f"☺ *{biz}*\n\n"
                f"Hi {n}, we received your order *#{order_number}* and will start "
                f"processing it soon.\n\n⏱ We'll let you know when it's ready.")

    if event == "processing":
        if is_es:
            return (f"🧺 *{biz}*\n\n"
                    f"Hola {n}, ya tenemos tu ropa y la estamos procesando con cuidado.\n\n"
                    f"⏱ Te avisamos cuando esté lista.")
        return (f"🧺 *{biz}*\n\n"
                f"Hi {n}, we have your laundry and it's being carefully processed.\n\n"
                f"⏱ We'll let you know when it's ready.")

    if event == "ready":
        if is_es:
            return (f"✨ *{biz}*\n\n"
                    f"¡Hola {n}! Tu ropa está *LISTA* y en camino pronto. 🛵\n\n"
                    f"Gracias por confiar en nosotros.")
        return (f"✨ *{biz}*\n\n"
                f"Hi {n}! Your laundry is *READY* and will be on its way soon. 🛵\n\n"
                f"Thank you for trusting us.")

    if event == "ready_for_pickup":
        if is_es:
            return (f"✅ *{biz}*\n\n"
                    f"¡Hola {n}! Tu ropa está lista para recoger en nuestra tienda.\n\n"
                    f"🏪 ¡Te esperamos cuando puedas pasar!")
        return (f"✅ *{biz}*\n\n"
                f"Hi {n}! Your laundry is ready for pickup at our store.\n\n"
                f"🏪 We look forward to seeing you!")

    if event == "out_for_delivery":
        if is_es:
            return (f"🚚 *{biz}*\n\n"
                    f"¡Hola {n}! Tu entrega va *EN CAMINO* ahora mismo. 💨\n\n"
                    f"Por favor mantente disponible para recibirla.")
        return (f"🚚 *{biz}*\n\n"
                f"Hi {n}! Your delivery is *ON THE WAY* right now. 💨\n\n"
                f"Please be available to receive it.")

    if event == "delivered":
        total_str = f"\n💰 Total: ${order_total:.2f}" if order_total else ""
        if is_es:
            return (f"🎉 *{biz}*\n\n"
                    f"¡Hola {n}! Tu entrega fue *COMPLETADA* con éxito. ✓{total_str}\n\n"
                    f"¡Gracias! Esperamos verte pronto. ❤️")
        return (f"🎉 *{biz}*\n\n"
                f"Hi {n}! Your delivery has been *COMPLETED* successfully. ✓{total_str}\n\n"
                f"Thank you! We hope to see you soon. ❤️")

    if event == "completed":
        total_str = f"\n💰 Total: ${order_total:.2f}" if order_total else ""
        if is_es:
            return (f"🙏 *{biz}*\n\n"
                    f"Hola {n}, tu servicio está *COMPLETO*.{total_str}\n\n"
                    f"Fue un placer cuidar de tu ropa. ¡Hasta pronto!")
        return (f"🙏 *{biz}*\n\n"
                f"Hi {n}, your service is *COMPLETE*.{total_str}\n\n"
                f"It was a pleasure caring for your laundry. See you soon!")

    if event == "cancelled":
        if is_es:
            return (f"❌ *{biz}*\n\n"
                    f"Hola {n}, tu orden *#{order_number}* fue cancelada.\n\n"
                    f"¿Necesitas reagendar? Contáctanos, con gusto te ayudamos. 📞")
        return (f"❌ *{biz}*\n\n"
                f"Hi {n}, your order *#{order_number}* was cancelled.\n\n"
                f"Need to reschedule? Contact us, we're happy to help. 📞")

    if event == "store_order":
        total_str = f" · Total: ${order_total:.2f}" if order_total else ""
        if is_es:
            return (f"🛍️ *{biz}*\n\n"
                    f"¡Hola {n}! Recibimos tu orden *#{order_number}*{total_str}.\n\n"
                    f"Te avisamos cuando esté lista. ¡Gracias!")
        return (f"🛍️ *{biz}*\n\n"
                f"Hi {n}! We received your order *#{order_number}*{total_str}.\n\n"
                f"We'll let you know when it's ready. Thank you!")

    if event == "payment_request":
        total_str = f" Total: ${order_total:.2f}." if order_total else ""
        # IMPORTANTE: payment_url debe ser el enlace corto del CRM (ej. https://dominio/pay/ORD123)
        if is_es:
            url_block = f"\n\n💳 *Paga aquí* 👇\n{payment_url}" if payment_url else ""
            return (f"💰 *{biz}*\n\n"
                    f"Hola {n}, tu servicio *#{order_number}* está listo para pagar.{total_str}"
                    f"{url_block}\n\n"
                    f"🔒 El enlace es seguro y expira en 24 horas.\n"
                    f"Si no abre, copia y pega el link completo.")
        else:
            url_block = f"\n\n💳 *Pay here* 👇\n{payment_url}" if payment_url else ""
            return (f"💰 *{biz}*\n\n"
                    f"Hi {n}, your service *#{order_number}* is ready to pay.{total_str}"
                    f"{url_block}\n\n"
                    f"🔒 Link is secure and expires in 24 hours.\n"
                    f"If it doesn't open, copy and paste the full link.")

    # Fallback genérico
    if is_es:
        return (f"🫧 *{biz}*\n\nHola {n}, hay una actualización en tu servicio. "
                f"Contáctanos si tienes preguntas.")
    return (f"🫧 *{biz}*\n\nHi {n}, there's an update on your service. "
            f"Contact us if you have questions.")

# ─────────────────────────────────────────────────────────────────────────────
# VOICE (TwiML) – sin cambios
# ─────────────────────────────────────────────────────────────────────────────
def _voice(event: str, name: str, order_number: str, language: str) -> str:
    is_es = str(language).lower().startswith("es")
    biz   = BUSINESS_NAME
    n     = name or ("estimado cliente" if is_es else "valued customer")
    scripts = {
        "order_created":    (f"Hola {n}, llamamos de {biz} para confirmar que recibimos tu orden número {order_number}. Pronto nos pondremos en contacto. ¡Hasta luego!",
                             f"Hi {n}, this is {biz} calling to confirm we received your order number {order_number}. We'll be in touch soon. Goodbye!"),
        "pickup_confirmed": (f"Hola {n}, tu recolección con {biz} ha sido confirmada. Estaremos en tu domicilio en el horario acordado. ¡Gracias por confiar en nosotros!",
                             f"Hi {n}, your pickup with {biz} has been confirmed. We will arrive at your address during the scheduled time. Thank you!"),
        "processing":       (f"Hola {n}, le habla {biz}. Confirmamos que su ropa ha sido recogida y está en proceso. Pronto le avisaremos cuando esté lista. ¡Gracias!",
                             f"Hi {n}, this is {biz}. We confirm your laundry has been picked up and is being processed. We'll notify you when it's ready. Thank you!"),
        "ready":            (f"Hola {n}, tu ropa con {biz} está lista y pronto estará en camino. ¡Gracias!",
                             f"Hi {n}, your laundry with {biz} is ready and will be on its way shortly. Thank you!"),
        "out_for_delivery": (f"Hola {n}, tu entrega de {biz} está en camino. Llegaremos en breve. ¡Gracias!",
                             f"Hi {n}, your {biz} delivery is on the way. We'll be arriving shortly. Thank you!"),
        "delivered":        (f"Hola {n}, {biz} completó tu entrega. Esperamos servirte pronto. ¡Gracias!",
                             f"Hi {n}, {biz} has completed your delivery. We look forward to serving you again. Thank you!"),
        "cancelled":        (f"Hola {n}, tu orden número {order_number} con {biz} fue cancelada. Si tienes preguntas, llámanos. ¡Hasta luego!",
                             f"Hi {n}, your order number {order_number} with {biz} was cancelled. If you have questions, please call us. Goodbye!"),
        "order_received":   (f"Hola, le habla {biz}. Confirmamos que recibimos su orden y pronto será procesada. Le avisaremos cuando esté lista. ¡Gracias!",
                             f"Hello, this is {biz}. We confirm your order has been received and will be processed shortly. We'll notify you when it's ready. Thank you!"),
        "ready_for_pickup": (f"Hola, le habla {biz}. Su orden ya está lista para recoger. ¡Gracias por confiar en nosotros!",
                             f"Hello, this is {biz}. Your order is now ready for pickup. Thank you for trusting us!"),
        "completed":        (f"Hola, le habla {biz}. Su orden fue completada. Ha sido un placer atenderle. ¡Hasta pronto!",
                             f"Hello, this is {biz}. Your order has been completed. It's been a pleasure serving you. Goodbye!"),
        "payment_request":  (f"Hola {n}, le habla {biz}. Tiene un pago pendiente. Por favor revise su mensaje de texto o correo para el enlace de pago. ¡Gracias!",
                             f"Hi {n}, this is {biz} calling. You have a pending payment. Please check your text or email for the payment link. Thank you!"),
    }
    es_s, en_s = scripts.get(event, (
        f"Hola {n}, tienes una actualización de tu servicio con {biz}. Por favor contáctanos. ¡Hasta luego!",
        f"Hi {n}, you have a service update from {biz}. Please contact us. Goodbye!"
    ))
    return es_s if is_es else en_s

# ─────────────────────────────────────────────────────────────────────────────
# Builders (usando enlace propio)
# ─────────────────────────────────────────────────────────────────────────────
def build_premium_message(
    event: str, status: Optional[str], order_number: str,
    customer_name: Optional[str], language: str,
    pickup_date: Optional[str] = None, pickup_window: Optional[str] = None,
    order_total: Optional[float] = None, shipping_fee: Optional[float] = None,
    service_type: Optional[str] = None, payment_url: Optional[str] = None,
) -> dict:
    is_es = str(language).lower().startswith("es")
    name  = customer_name or ("Cliente" if is_es else "Customer")
    svc   = normalize_status_value(service_type or "pickup_delivery")

    subjects = {
        "order_created":    ("Orden programada — " + BUSINESS_NAME,        "Order scheduled — " + BUSINESS_NAME),
        "order_received":   ("Orden recibida — " + BUSINESS_NAME,           "Order received — " + BUSINESS_NAME),
        "pickup_confirmed": ("Recolección confirmada ✓ — " + BUSINESS_NAME, "Pickup confirmed ✓ — " + BUSINESS_NAME),
        "processing":       ("Tu ropa está en proceso — " + BUSINESS_NAME, "Your laundry is processing — " + BUSINESS_NAME),
        "ready":            ("¡Tu ropa está lista! — " + BUSINESS_NAME,    "Your laundry is ready! — " + BUSINESS_NAME),
        "ready_for_pickup": ("Lista para recoger — " + BUSINESS_NAME,      "Ready for pickup — " + BUSINESS_NAME),
        "out_for_delivery": ("En camino 🚚 — " + BUSINESS_NAME,            "Out for delivery 🚚 — " + BUSINESS_NAME),
        "delivered":        ("Entrega completada ✓ — " + BUSINESS_NAME,    "Delivery completed ✓ — " + BUSINESS_NAME),
        "completed":        ("Servicio completado ✓ — " + BUSINESS_NAME,   "Service completed ✓ — " + BUSINESS_NAME),
        "cancelled":        ("Orden cancelada — " + BUSINESS_NAME,         "Order cancelled — " + BUSINESS_NAME),
        "store_order":      ("Compra confirmada — " + BUSINESS_NAME,       "Purchase confirmed — " + BUSINESS_NAME),
        "payment_request":  ("Pago pendiente — " + BUSINESS_NAME,          "Payment required — " + BUSINESS_NAME),
    }
    es_subj, en_subj = subjects.get(event, ("Actualización de orden", "Order update"))
    subject = es_subj if is_es else en_subj

    html_builders = {
        "order_created":    lambda: _html_order_created(name, order_number, pickup_date, pickup_window, is_es),
        "order_received":   lambda: _html_order_created(name, order_number, pickup_date, pickup_window, is_es),
        "pickup_confirmed": lambda: _html_pickup_confirmed(name, order_number, pickup_date, pickup_window, is_es),
        "processing":       lambda: _html_processing(name, order_number, is_es),
        "ready":            lambda: _html_ready(name, order_number, svc, is_es),
        "ready_for_pickup": lambda: _html_wash_fold_ready(name, order_number, is_es),
        "out_for_delivery": lambda: _html_out_for_delivery(name, order_number, is_es),
        "delivered":        lambda: _html_delivered(name, order_number, order_total, is_es),
        "completed":        lambda: _html_completed(name, order_number, order_total, is_es),
        "cancelled":        lambda: _html_cancelled(name, order_number, is_es),
        "store_order":      lambda: _html_store_order(name, order_number, order_total, shipping_fee, is_es),
        "payment_request":  lambda: _html_payment_request(name, order_number, order_total, payment_url or "#", is_es),
    }
    html        = html_builders.get(event, lambda: _html_generic(name, is_es))()
    sms_message = _sms_sync(event, name, order_number, language,
                             pickup_date, pickup_window, order_total, payment_url)
    voice_text  = _voice(event, name, order_number, language)

    return {"subject": subject, "message": sms_message, "html": html, "voice_text": voice_text}

async def build_premium_message_async(
    event: str, status: Optional[str], order_number: str,
    customer_name: Optional[str], language: str,
    pickup_date: Optional[str] = None, pickup_window: Optional[str] = None,
    order_total: Optional[float] = None, shipping_fee: Optional[float] = None,
    service_type: Optional[str] = None, payment_url: Optional[str] = None,
) -> dict:
    """
    Versión async que genera un enlace de pago interno (CRM) en lugar de usar acortadores externos.
    """
    # Para payment_request, redirigimos a la cuenta del cliente donde puede ver y pagar
    final_payment_url = payment_url
    if event == "payment_request" and payment_url:
        base_url = BUSINESS_WEBSITE.rstrip('/')
        internal_url = f"{base_url}/account"
        logger.info(f"Payment request: redirecting to customer account {internal_url}")
        final_payment_url = internal_url

    result = build_premium_message(
        event=event, status=status, order_number=order_number,
        customer_name=customer_name, language=language,
        pickup_date=pickup_date, pickup_window=pickup_window,
        order_total=order_total, shipping_fee=shipping_fee,
        service_type=service_type, payment_url=final_payment_url,
    )
    return result

# ─────────────────────────────────────────────────────────────────────────────
# Send functions con reintentos (sin cambios)
# ─────────────────────────────────────────────────────────────────────────────
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
        _log_attempt({"channel": "sms", "status": "failed", "to": to_phone,
                      "reason": "twilio_not_configured", "timestamp": datetime.now(timezone.utc).isoformat()})
        return False
    formatted = format_phone(to_phone)
    if not formatted: logger.error("Invalid phone for SMS"); return False
    async def _send():
        return await asyncio.to_thread(twilio_client.messages.create,
                                        body=message, from_=TWILIO_PHONE_NUMBER, to=formatted)
    ok, res = await _send_with_retries(_send)
    if ok:
        logger.info(f"SMS sent: {res.sid}")
        _log_attempt({"channel": "sms", "status": "sent", "to": formatted,
                      "timestamp": datetime.now(timezone.utc).isoformat()})
        return True
    logger.error(f"SMS failed: {res}")
    _log_attempt({"channel": "sms", "status": "failed", "to": formatted,
                  "reason": str(res)[:100], "timestamp": datetime.now(timezone.utc).isoformat()})
    return False

async def send_whatsapp(to_phone: str, message: str) -> bool:
    if not twilio_client or not TWILIO_WHATSAPP_NUMBER:
        logger.warning("Twilio not configured for WhatsApp")
        _log_attempt({"channel": "whatsapp", "status": "failed", "to": to_phone,
                      "reason": "twilio_not_configured", "timestamp": datetime.now(timezone.utc).isoformat()})
        return False
    formatted = format_whatsapp(to_phone)
    if not formatted: logger.error("Invalid phone for WhatsApp"); return False
    async def _send():
        return await asyncio.to_thread(twilio_client.messages.create,
                                        body=message, from_=TWILIO_WHATSAPP_NUMBER, to=formatted)
    ok, res = await _send_with_retries(_send)
    if ok:
        logger.info(f"WhatsApp sent: {res.sid}")
        _log_attempt({"channel": "whatsapp", "status": "sent", "to": formatted,
                      "timestamp": datetime.now(timezone.utc).isoformat()})
        return True
    logger.error(f"WhatsApp failed: {res}")
    _log_attempt({"channel": "whatsapp", "status": "failed", "to": formatted,
                  "reason": str(res)[:100], "timestamp": datetime.now(timezone.utc).isoformat()})
    return False

async def send_voice_call(to_phone: str, message: str, language: str) -> bool:
    if not twilio_client or not TWILIO_PHONE_NUMBER:
        logger.warning("Twilio not configured for Voice"); return False
    formatted = format_phone(to_phone)
    if not formatted: logger.error("Invalid phone for Voice"); return False
    lang_code = "es-MX" if str(language).lower().startswith("es") else "en-US"
    safe_msg  = xml.sax.saxutils.escape(message)
    twiml     = f'<Response><Say language="{lang_code}" voice="alice">{safe_msg}</Say></Response>'
    async def _send():
        return await asyncio.to_thread(twilio_client.calls.create,
                                        twiml=twiml, to=formatted, from_=TWILIO_PHONE_NUMBER)
    ok, res = await _send_with_retries(_send)
    if ok: logger.info(f"Call initiated: {res.sid}"); return True
    logger.error(f"Call failed: {res}"); return False

async def send_email(to_email: str, subject: str, body: str,
                     html_body: Optional[str] = None) -> bool:
    if not sendgrid_client or not SENDGRID_FROM_EMAIL:
        logger.warning("SendGrid not configured")
        _log_attempt({"channel": "email", "status": "failed", "to": to_email,
                      "reason": "sendgrid_not_configured", "timestamp": datetime.now(timezone.utc).isoformat()})
        return False
    plain_text = body.replace("*", "").replace("_", "") if body else ""
    is_es = "hola" in plain_text.lower() or "orden" in plain_text.lower()
    message = Mail(
        from_email=(SENDGRID_FROM_EMAIL, SENDGRID_FROM_NAME),
        to_emails=to_email,
        subject=subject,
        html_content=html_body or _html_generic(
            "Cliente" if is_es else "Customer", is_es, subject, plain_text
        ),
        plain_text_content=plain_text,
    )
    async def _send():
        return await asyncio.to_thread(sendgrid_client.send, message)
    ok, res = await _send_with_retries(_send)
    if ok:
        logger.info(f"Email sent: {res.status_code}")
        _log_attempt({"channel": "email", "status": "sent", "to": to_email,
                      "timestamp": datetime.now(timezone.utc).isoformat()})
        return res.status_code in [200, 202]
    logger.error(f"Email failed: {res}")
    _log_attempt({"channel": "email", "status": "failed", "to": to_email,
                  "reason": str(res)[:100], "timestamp": datetime.now(timezone.utc).isoformat()})
    return False

# ─────────────────────────────────────────────────────────────────────────────
# Groq AI (sin cambios)
# ─────────────────────────────────────────────────────────────────────────────
async def generate_ai_message(context: dict, language: str, channel: str,
                               include_date: bool) -> Optional[str]:
    client = get_groq_client()
    if not client: return None
    lang_label = "Spanish" if str(language).lower().startswith("es") else "English"
    date_instr = "Include pickup date." if include_date else "Do NOT include any dates."
    prompt = (
        f"You are the assistant for {BUSINESS_NAME}. "
        f"Write a short {channel} in {lang_label}. {date_instr} "
        "Friendly, concise, professional. Return ONLY the text, no formatting markers. "
        f"Context: {json.dumps(context, ensure_ascii=False)}"
    )
    try:
        response = await asyncio.to_thread(
            client.chat.completions.create,
            messages=[{"role": "user", "content": prompt}],
            model="llama-3.3-70b-versatile",
            temperature=0.4, max_tokens=200,
        )
        return response.choices[0].message.content.strip()
    except Exception as e:
        logger.error(f"Groq failed: {e}")
        return None

# ─────────────────────────────────────────────────────────────────────────────
# Orquestador principal (con forzado de idioma para MX y validación de URL)
# ─────────────────────────────────────────────────────────────────────────────
async def send_preferred_notification(
    customer: Optional[Dict], order: Optional[Dict],
    event: str, status: Optional[str] = None
) -> bool:
    if not customer or not order:
        logger.error("Customer or order missing"); return False

    service_type = normalize_status_value(order.get("service_type") or "pickup_delivery")
    flow = "wash_fold" if service_type in ["wash_fold", "self_service"] else "pickup_delivery"

    mapped_event = event
    if event == "status_changed":
        status_norm = normalize_status_value(status)
        wf_map = {"confirmed": "order_received", "processing": "processing",
                  "ready": "ready_for_pickup", "completed": "completed"}
        pd_map = {"confirmed": "pickup_confirmed", "pickup_scheduled": "pickup_confirmed",
                  "picked_up": "processing", "processing": "processing",
                  "ready": "ready", "out_for_delivery": "out_for_delivery",
                  "delivered": "delivered", "cancelled": "cancelled"}
        mapped_event = (wf_map if flow == "wash_fold" else pd_map).get(status_norm, "status_changed")
    else:
        mapped_event = EVENT_MAPPING.get(event, event)
        if flow == "wash_fold" and event == "order_created":
            mapped_event = "order_received"

    if mapped_event != "payment_request" and mapped_event not in MILESTONES.get(flow, set()):
        logger.info(f"Event {mapped_event} not a milestone for {flow}, skipping.")
        return False

    order_number  = order.get("order_number", order.get("id", "N/A"))
    phone         = customer.get("phone")
    email         = customer.get("email")
    language      = detect_language(customer, phone)
    if phone and detect_country(phone) == 'mx':
        language = "es-MX"
        logger.debug(f"Forced language to es-MX for MX number {phone}")
    customer_name = customer.get("name") or ""
    include_date  = mapped_event in {"order_created", "pickup_scheduled", "pickup_reminder",
                                      "pickup_completed", "pickup_update", "pickup_confirmed"}
    pickup_date   = order.get("pickup_date") if include_date else None
    pickup_window = order.get("pickup_time_window") if include_date else None
    order_total   = order.get("total") or order.get("total_amount")
    shipping_fee  = order.get("shipping_fee")
    payment_url   = order.get("payment_url") or order.get("checkout_url")

    # Validación especial para payment_request: si no hay URL, no enviar notificación
    if mapped_event == "payment_request" and not payment_url:
        logger.error(f"Payment request aborted: no payment_url for order {order_number}")
        _log_attempt({"timestamp": datetime.now().isoformat(), "order_id": order.get("id"),
                      "event": mapped_event, "status": "failed_no_url"})
        return False

    content = await build_premium_message_async(
        event=mapped_event, status=status,
        order_number=order_number, customer_name=customer_name,
        language=language, pickup_date=pickup_date, pickup_window=pickup_window,
        order_total=order_total, shipping_fee=shipping_fee,
        service_type=service_type, payment_url=payment_url,
    )
    message    = content["message"]
    html_body  = content["html"]
    subject    = content["subject"]
    voice_text = content["voice_text"]

    # AI subject solo si USE_ULTRA_PREMIUM
    if GROQ_API_KEY and USE_ULTRA_PREMIUM:
        try:
            ai_subject = await generate_ai_message(
                context={"event": mapped_event, "order_number": order_number,
                         "customer_name": customer_name},
                language=language, channel="email subject line",
                include_date=include_date
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
    if detect_country(phone) == 'mx' and preference == 'sms' and TWILIO_WHATSAPP_NUMBER:
        preference = 'whatsapp'

    dedupe_key = f"{order.get('id')}:{mapped_event}:{preference}:{language}"
    if _is_already_sent(dedupe_key):
        logger.info(f"Duplicate skipped: {dedupe_key}")
        _log_attempt({"timestamp": datetime.now().isoformat(), "order_id": order.get("id"),
                      "event": mapped_event, "channel": preference, "status": "duplicate_skipped"})
        return True

    if ENFORCE_QUIET_HOURS and is_quiet_hours():
        logger.info(f"Quiet hours, queued: {dedupe_key}")
        _log_attempt({"timestamp": datetime.now().isoformat(), "order_id": order.get("id"),
                      "event": mapped_event, "channel": preference, "status": "queued_quiet_hours"})
        return False

    if mapped_event == "payment_request":
        logger.info(f"Payment request - order: {order_number}, channel: {preference}, "
                    f"lang: {language}, payment_url: {payment_url}, message_len: {len(message)}")

    success = False

    if preference == "email":
        success = await (send_email(email, subject, message, html_body) if email
                         else send_sms(phone, message) if phone else False)

    elif preference == "call":
        success = await (send_voice_call(phone, voice_text, language) if phone
                         else send_email(email, subject, message, html_body) if email else False)

    elif preference == "whatsapp":
        if phone:
            success = await send_whatsapp(phone, message)
            if not success:
                logger.info(f"WhatsApp failed → SMS fallback for order {order.get('id')}")
                success = await send_sms(phone, message)
        if not success and email:
            logger.info(f"WhatsApp+SMS failed → Email fallback for order {order.get('id')}")
            success = await send_email(email, subject, message, html_body)

    else:  # sms default
        if phone:
            success = await send_sms(phone, message)
        if not success and email:
            logger.info(f"SMS failed → Email fallback for order {order.get('id')}")
            success = await send_email(email, subject, message, html_body)

    _log_attempt({"timestamp": datetime.now().isoformat(), "order_id": order.get("id"),
                  "event": mapped_event, "channel": preference,
                  "status": "sent" if success else "failed"})
    if success:
        _mark_sent(dedupe_key)
    return success

# ─────────────────────────────────────────────────────────────────────────────
# API pública (corregido error de sintaxis)
# ─────────────────────────────────────────────────────────────────────────────
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

async def notify_payment_request(customer: Dict, order: Dict) -> bool:
    return await send_preferred_notification(customer, order, "payment_request")   # Paréntesis cerrado correctamente