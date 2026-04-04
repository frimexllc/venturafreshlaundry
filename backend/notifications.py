"""
Notification services using Twilio for SMS, WhatsApp and Voice calls,
and SendGrid for email. Premium visual templates for Ventura Fresh Laundry.

CAMBIOS EN ESTA VERSIÓN:
- Emails HTML premium con diseño completo en TODOS los eventos (incluyendo
  payment_request, store_order con pago, welcome, y fallback genérico)
- Email HTML compatible con Outlook/Gmail usando tablas en lugar de flexbox
- SMS/WhatsApp con links de pago acortados (TinyURL, con fallback truncado)
- Plantilla HTML para payment_request con botón de pago prominente
- Fix: caso order_received en _sms ya no cae al fallback genérico
- Fix: email fallback usa texto limpio, no el mensaje SMS con asteriscos
- Fix: f-string anidado inválido en _html_base corregido
"""

import os
import logging
import json
import asyncio
import time
import xml.sax.saxutils
from datetime import datetime, time as dtime, timezone
from typing import Optional, Dict, Any, Set, Tuple
from dataclasses import dataclass

from twilio.rest import Client
from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail
from groq import Groq

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────────────
# Config
# ─────────────────────────────────────────────────────────────────────────────
TWILIO_ACCOUNT_SID       = os.environ.get('TWILIO_ACCOUNT_SID')
TWILIO_AUTH_TOKEN        = os.environ.get('TWILIO_AUTH_TOKEN')
TWILIO_PHONE_NUMBER      = os.environ.get('TWILIO_PHONE_NUMBER')
TWILIO_WHATSAPP_NUMBER   = os.environ.get('TWILIO_WHATSAPP_NUMBER')
BUSINESS_NAME            = os.environ.get('BUSINESS_NAME', 'Ventura Fresh Laundry')
BUSINESS_ADDRESS         = os.environ.get('BUSINESS_ADDRESS', 'Ventura, CA')
BUSINESS_PHONE_DISPLAY   = os.environ.get('BUSINESS_PHONE_DISPLAY', '')
BUSINESS_WEBSITE         = os.environ.get('BUSINESS_WEBSITE', 'https://venturafreshlaundry.com')
SENDGRID_API_KEY         = os.environ.get('SENDGRID_API_KEY')
SENDGRID_FROM_EMAIL      = os.environ.get('SENDGRID_FROM_EMAIL')
SENDGRID_FROM_NAME       = os.environ.get('SENDGRID_FROM_NAME', BUSINESS_NAME)
SENDGRID_DATA_RESIDENCY  = os.environ.get('SENDGRID_DATA_RESIDENCY', '').lower()
GROQ_API_KEY             = os.environ.get('GROQ_API_KEY')
USE_ULTRA_PREMIUM        = os.environ.get('USE_ULTRA_PREMIUM', 'false').lower() == 'true'

QUIET_START              = os.environ.get('QUIET_HOURS_START', '21:00')
QUIET_END                = os.environ.get('QUIET_HOURS_END', '08:00')
USE_PREMIUM_TEMPLATES    = os.environ.get('USE_PREMIUM_TEMPLATES', 'true').lower() == 'true'
MAX_RETRIES              = int(os.environ.get('TWILIO_MAX_RETRIES', '3'))
RETRY_DELAY              = float(os.environ.get('TWILIO_RETRY_DELAY', '1.5'))
ENFORCE_QUIET_HOURS      = os.environ.get('ENFORCE_QUIET_HOURS', 'false').lower() == 'true'

# Servicio de acortado de URLs (se puede cambiar a Bitly, etc.)
URL_SHORTENER_API        = os.environ.get('URL_SHORTENER_API', 'tinyurl')  # 'tinyurl' | 'bitly' | 'none'
BITLY_API_TOKEN          = os.environ.get('BITLY_API_TOKEN', '')

# VFL brand colors
VFL_BLUE    = "#0ea5e9"
VFL_DARK    = "#0b1929"
VFL_ACCENT  = "#38bdf8"
VFL_SUCCESS = "#34d399"
VFL_WARN    = "#f59e0b"
VFL_DANGER  = "#ef4444"
VFL_GRAY    = "#64748b"
VFL_LIGHT   = "#f0f9ff"

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
    "pickup_delivery": {"order_created", "pickup_confirmed", "processing",
                        "ready", "out_for_delivery", "delivered", "cancelled"},
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
# URL Shortener
# ─────────────────────────────────────────────────────────────────────────────

async def shorten_url(long_url: str) -> str:
    """
    Acorta una URL usando TinyURL o Bitly según configuración.
    Si falla o está deshabilitado, retorna la URL original truncada a 60 chars
    para que el SMS no sea demasiado largo.

    TinyURL: no requiere API key, funciona inmediatamente.
    Bitly:   requiere BITLY_API_TOKEN en variables de entorno.
    """
    if not long_url:
        return long_url

    provider = URL_SHORTENER_API.lower()

    if provider == 'none':
        # Truncar a 60 chars si es muy larga, sin acortar
        return long_url if len(long_url) <= 60 else long_url[:57] + "..."

    if provider == 'bitly' and BITLY_API_TOKEN:
        try:
            import httpx
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.post(
                    "https://api-ssl.bitly.com/v4/shorten",
                    headers={
                        "Authorization": f"Bearer {BITLY_API_TOKEN}",
                        "Content-Type": "application/json",
                    },
                    json={"long_url": long_url},
                )
                if resp.status_code == 200:
                    data = resp.json()
                    return data.get("link", long_url)
                logger.warning(f"Bitly returned {resp.status_code}, falling through to TinyURL")
        except Exception as e:
            logger.warning(f"Bitly shortening failed: {e}, falling through to TinyURL")

    # TinyURL (default y fallback de Bitly)
    try:
        import httpx
        encoded = long_url.replace("&", "%26")
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(
                f"https://tinyurl.com/api-create.php?url={encoded}"
            )
            if resp.status_code == 200 and resp.text.startswith("http"):
                return resp.text.strip()
            logger.warning(f"TinyURL returned unexpected response: {resp.status_code}")
    except Exception as e:
        logger.warning(f"TinyURL shortening failed: {e}")

    # Último fallback: URL original
    return long_url


async def shorten_url_safe(long_url: Optional[str]) -> Optional[str]:
    """Versión segura que retorna None si la URL es None o vacía."""
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
    if v in {"email","correo","mail"}:                       return "email"
    if v in {"phone","call","llamada","telefono","teléfono"}: return "call"
    if v in {"whatsapp","wa","wapp"}:                        return "whatsapp"
    return "sms"

def has_sms_consent(order: Optional[Dict], customer: Optional[Dict]) -> bool:
    return bool((order and order.get("sms_consent")) or (customer and customer.get("sms_consent")))

def normalize_status_value(value: Optional[str]) -> str:
    if not value: return ""
    return value.strip().lower().replace(" ", "_")

def detect_language(customer: Optional[Dict], phone: Optional[str]) -> str:
    if not customer: return "es-MX"
    preferred = customer.get("preferred_language") or customer.get("language")
    if preferred: return preferred
    if phone and phone.strip().startswith("+1"): return "en-US"
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
# HTML EMAIL BASE
# Compatible con Outlook, Gmail y Apple Mail — usa tablas en lugar de flexbox
# ─────────────────────────────────────────────────────────────────────────────

def _html_base(content_html: str, accent_color: str = VFL_BLUE) -> str:
    """
    Wrapper base para todos los emails HTML de VFL.
    Usa tablas HTML para máxima compatibilidad con clientes de email
    (Outlook 2007-2021, Gmail, Apple Mail, Yahoo Mail).
    FIX: eliminado f-string anidado inválido con la meta tag.
    """
    year = datetime.now().year
    phone_line = f" &middot; {BUSINESS_PHONE_DISPLAY}" if BUSINESS_PHONE_DISPLAY else ""

    return (
        '<!DOCTYPE html>'
        '<html lang="en">'
        '<head>'
        '<meta charset="UTF-8">'
        '<meta name="viewport" content="width=device-width, initial-scale=1.0">'
        '<meta http-equiv="X-UA-Compatible" content="IE=edge">'
        f'<title>{BUSINESS_NAME}</title>'
        '<!--[if mso]><noscript><xml><o:OfficeDocumentSettings>'
        '<o:PixelsPerInch>96</o:PixelsPerInch>'
        '</o:OfficeDocumentSettings></xml></noscript><![endif]-->'
        '<style>'
        'body,table,td,a{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}'
        'table,td{mso-table-lspace:0pt;mso-table-rspace:0pt}'
        'img{-ms-interpolation-mode:bicubic;border:0;outline:none;text-decoration:none}'
        'body{margin:0;padding:0;background-color:#f0f9ff}'
        '.email-wrapper{background-color:#f0f9ff;padding:32px 16px}'
        f'.btn-primary{{background-color:{accent_color};border-radius:50px;'
        'color:#ffffff;display:inline-block;font-family:Arial,sans-serif;'
        'font-size:14px;font-weight:700;line-height:1;padding:14px 32px;'
        'text-align:center;text-decoration:none;letter-spacing:.04em}}'
        '@media only screen and (max-width:600px){'
        '.email-container{width:100%!important}'
        '.stack-col{display:block!important;width:100%!important}'
        '.body-pad{padding:22px 18px!important}'
        '}'
        '</style>'
        '</head>'
        '<body>'
        '<div class="email-wrapper">'
        '<!-- Container -->'
        '<table border="0" cellpadding="0" cellspacing="0" width="100%">'
        '<tr><td align="center">'
        '<table class="email-container" border="0" cellpadding="0" cellspacing="0"'
        ' width="560" style="max-width:560px">'

        # ── Header
        '<tr>'
        f'<td bgcolor="{VFL_DARK}" style="border-radius:16px 16px 0 0;padding:28px 32px;text-align:center">'
        '<table border="0" cellpadding="0" cellspacing="0" width="100%"><tr>'
        '<td align="center">'
        # Logo row usando tabla en lugar de flexbox
        '<table border="0" cellpadding="0" cellspacing="0"><tr>'
        f'<td width="40" style="background:rgba(14,165,233,.2);border-radius:50%;'
        f'width:40px;height:40px;text-align:center;vertical-align:middle">'
        f'<span style="color:{VFL_ACCENT};font-size:20px;line-height:40px">&#9676;</span>'
        '</td>'
        f'<td style="padding-left:10px;vertical-align:middle">'
        f'<span style="font-family:Arial,sans-serif;font-size:18px;font-weight:700;'
        f'color:#ffffff;letter-spacing:-.3px">{BUSINESS_NAME}</span>'
        '</td>'
        '</tr></table>'
        f'<p style="margin:6px 0 0;font-family:Arial,sans-serif;font-size:11px;'
        f'color:rgba(255,255,255,.4);letter-spacing:.08em;text-transform:uppercase">'
        'FRESH &middot; CLEAN &middot; DELIVERED</p>'
        '</td></tr></table>'
        '</td>'
        '</tr>'

        # ── Dynamic content
        + content_html +

        # ── Footer
        '<tr>'
        '<td bgcolor="#f8fafc" style="border-radius:0 0 16px 16px;border-top:1px solid #e2e8f0;'
        'padding:24px 32px;text-align:center">'
        f'<p style="margin:0 0 4px;font-family:Arial,sans-serif;font-size:13px;'
        f'font-weight:700;color:#334155">{BUSINESS_NAME}</p>'
        f'<p style="margin:0 0 10px;font-family:Arial,sans-serif;font-size:11px;'
        f'color:#94a3b8;line-height:1.5">{BUSINESS_ADDRESS}{phone_line}</p>'
        f'<p style="margin:0;font-family:Arial,sans-serif;font-size:11px;color:#94a3b8">'
        f'<a href="{BUSINESS_WEBSITE}" style="color:{VFL_BLUE};text-decoration:none">'
        f'{BUSINESS_WEBSITE}</a></p>'
        '<table border="0" cellpadding="0" cellspacing="0" width="100%">'
        '<tr><td style="border-top:1px solid #e2e8f0;padding-top:14px;margin-top:14px">'
        '<p style="margin:0;font-family:Arial,sans-serif;font-size:10px;color:#cbd5e1;line-height:1.5">'
        f'Has recibido este mensaje porque tienes una orden activa con {BUSINESS_NAME}.<br>'
        'Si tienes preguntas, cont&aacute;ctanos directamente.'
        '</p></td></tr></table>'
        '</td>'
        '</tr>'

        '</table>'  # email-container
        '</td></tr>'
        '</table>'  # outer
        '</div>'
        '</body>'
        '</html>'
    )


# ─────────────────────────────────────────────────────────────────────────────
# Componentes HTML reutilizables (tablas, compatibles con Outlook)
# ─────────────────────────────────────────────────────────────────────────────

def _status_band(text: str, color: str) -> str:
    """Banda de color con badge de estado."""
    return (
        f'<tr><td bgcolor="{color}" style="padding:14px 32px;text-align:center">'
        f'<span style="display:inline-block;background:rgba(255,255,255,.18);'
        f'color:#ffffff;font-family:Arial,sans-serif;font-size:11px;font-weight:700;'
        f'text-transform:uppercase;letter-spacing:.14em;padding:4px 14px;border-radius:20px">'
        f'{text}</span>'
        f'</td></tr>'
    )

def _order_number_box(label: str, value: str) -> str:
    """Caja destacada con número de orden."""
    return (
        f'<table border="0" cellpadding="0" cellspacing="0" width="100%">'
        f'<tr><td bgcolor="{VFL_DARK}" style="border-radius:10px;padding:14px;text-align:center;'
        f'background:linear-gradient(135deg,{VFL_DARK} 0%,#1e3a5f 100%)">'
        f'<p style="margin:0 0 4px;font-family:Arial,sans-serif;font-size:10px;'
        f'color:rgba(255,255,255,.5);text-transform:uppercase;letter-spacing:.12em">{label}</p>'
        f'<p style="margin:0;font-family:\'Courier New\',monospace;font-size:20px;'
        f'font-weight:700;color:{VFL_ACCENT};letter-spacing:.04em">#{value}</p>'
        f'</td></tr></table>'
    )

def _order_card(title: str, rows_html: str) -> str:
    """Card con filas de datos de la orden."""
    return (
        f'<table border="0" cellpadding="0" cellspacing="0" width="100%"'
        f' style="background:#f8fafc;border:1.5px solid #e2e8f0;border-radius:12px;margin-bottom:0">'
        f'<tr><td style="padding:18px 20px">'
        f'<p style="margin:0 0 12px;font-family:Arial,sans-serif;font-size:10px;font-weight:700;'
        f'text-transform:uppercase;letter-spacing:.12em;color:#94a3b8">{title}</p>'
        f'{rows_html}'
        f'</td></tr></table>'
    )

def _data_row(key: str, value: str, value_color: str = "#0f172a") -> str:
    """Fila de datos dentro de un order-card."""
    return (
        f'<table border="0" cellpadding="0" cellspacing="0" width="100%"'
        f' style="border-bottom:1px solid #f1f5f9">'
        f'<tr>'
        f'<td style="padding:5px 0;font-family:Arial,sans-serif;font-size:12px;color:#64748b">{key}</td>'
        f'<td align="right" style="padding:5px 0;font-family:Arial,sans-serif;font-size:12px;'
        f'font-weight:600;color:{value_color}">{value}</td>'
        f'</tr></table>'
    )

def _tip_box(text: str, accent: str = VFL_ACCENT) -> str:
    """Caja informativa con acento de color."""
    return (
        f'<table border="0" cellpadding="0" cellspacing="0" width="100%">'
        f'<tr><td bgcolor="{VFL_LIGHT}" style="border:1px solid {accent}30;border-radius:10px;'
        f'padding:14px 16px">'
        f'<p style="margin:0;font-family:Arial,sans-serif;font-size:12px;'
        f'color:#0369a1;line-height:1.6">{text}</p>'
        f'</td></tr></table>'
    )

def _info_box(text: str, accent: str = VFL_BLUE) -> str:
    """Caja con borde lateral de acento."""
    return (
        f'<table border="0" cellpadding="0" cellspacing="0" width="100%">'
        f'<tr>'
        f'<td width="3" bgcolor="{accent}" style="border-radius:3px 0 0 3px">&nbsp;</td>'
        f'<td bgcolor="#f8fafc" style="border-radius:0 8px 8px 0;padding:12px 16px">'
        f'<p style="margin:0;font-family:Arial,sans-serif;font-size:13px;'
        f'color:#475569;line-height:1.6">{text}</p>'
        f'</td>'
        f'</tr></table>'
    )

def _cta_button(url: str, label: str, color: str = VFL_BLUE) -> str:
    """Botón de llamada a la acción compatible con Outlook."""
    return (
        f'<!--[if mso]>'
        f'<v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" '
        f'xmlns:w="urn:schemas-microsoft-com:office:word" '
        f'href="{url}" style="height:46px;v-text-anchor:middle;width:200px;" '
        f'arcsize="50%" strokecolor="{color}" fillcolor="{color}">'
        f'<w:anchorlock/>'
        f'<center style="color:#ffffff;font-family:Arial,sans-serif;font-size:14px;'
        f'font-weight:700;">{label}</center>'
        f'</v:roundrect>'
        f'<![endif]-->'
        f'<!--[if !mso]><!-->'
        f'<a href="{url}" class="btn-primary" '
        f'style="background-color:{color};border-radius:50px;color:#ffffff;'
        f'display:inline-block;font-family:Arial,sans-serif;font-size:14px;'
        f'font-weight:700;line-height:1;padding:14px 32px;text-align:center;'
        f'text-decoration:none;letter-spacing:.04em">{label}</a>'
        f'<!--<![endif]-->'
    )

def _steps_table(steps: list, accent: str = VFL_BLUE) -> str:
    """Tabla de pasos numerados."""
    rows = ""
    for i, (title, desc) in enumerate(steps, 1):
        rows += (
            f'<tr>'
            f'<td width="26" valign="top" style="padding:0 12px 10px 0">'
            f'<table border="0" cellpadding="0" cellspacing="0">'
            f'<tr><td bgcolor="{accent}" style="border-radius:50%;width:26px;height:26px;'
            f'text-align:center;vertical-align:middle">'
            f'<span style="font-family:Arial,sans-serif;font-size:11px;font-weight:700;'
            f'color:#ffffff;line-height:26px;display:block">{i}</span>'
            f'</td></tr></table>'
            f'</td>'
            f'<td valign="top" style="padding:0 0 10px">'
            f'<p style="margin:0;font-family:Arial,sans-serif;font-size:13px;color:#334155;line-height:1.55">'
            f'<strong>{title}</strong> &mdash; {desc}'
            f'</p>'
            f'</td>'
            f'</tr>'
        )
    return (
        f'<table border="0" cellpadding="0" cellspacing="0" width="100%">'
        f'{rows}'
        f'</table>'
    )

def _body_wrap(inner_html: str) -> str:
    """Envuelve el contenido del body en una celda blanca con padding."""
    return (
        '<tr>'
        '<td bgcolor="#ffffff" class="body-pad" style="padding:32px">'
        + inner_html +
        '</td>'
        '</tr>'
    )


# ─────────────────────────────────────────────────────────────────────────────
# Builders HTML por evento — todos usan tablas para compatibilidad total
# ─────────────────────────────────────────────────────────────────────────────

def _html_order_created(name: str, order_number: str, pickup_date: Optional[str],
                         pickup_window: Optional[str], is_es: bool) -> str:
    accent = VFL_BLUE
    if is_es:
        greeting   = "¡Tu orden fue programada!"
        sub        = (f"Hola {name}, recibimos tu solicitud y la hemos registrado con éxito. "
                      f"Pronto nos pondremos en contacto para confirmar tu pickup.")
        steps      = [
            ("Confirmación",    "Te contactaremos para confirmar el horario de pickup."),
            ("Recogida",        "Pasamos por tu ropa en la fecha acordada."),
            ("Lavado premium",  "Procesamos tu ropa con el cuidado que merece."),
            ("Entrega",         "Te devolvemos todo limpio y fresco."),
        ]
        tip        = "&#128161; Si necesitas hacer algún cambio, contáctanos lo antes posible."
        badge      = "Orden Programada"
        ord_label  = "Orden"; date_label = "Fecha de pickup"; status_label = "Estado"
        status_val = "Programada &#10003;"
    else:
        greeting   = "Your order has been scheduled!"
        sub        = (f"Hi {name}, we received your request and registered it successfully. "
                      f"We'll reach out shortly to confirm your pickup.")
        steps      = [
            ("Confirmation",    "We'll contact you to confirm the pickup schedule."),
            ("Pickup",          "We'll collect your laundry on the agreed date."),
            ("Premium wash",    "We process your clothes with care."),
            ("Delivery",        "We return everything clean and fresh."),
        ]
        tip        = "&#128161; If you need to make changes to your order, contact us as soon as possible."
        badge      = "Order Scheduled"
        ord_label  = "Order"; date_label = "Pickup date"; status_label = "Status"
        status_val = "Scheduled &#10003;"

    date_row = ""
    if pickup_date:
        window_str = f" &middot; {pickup_window}" if pickup_window else ""
        date_row = _data_row(date_label, f"{pickup_date}{window_str}")

    body = (
        _order_number_box("Número de orden" if is_es else "Order number", order_number)
        + '<p style="margin:24px 0 6px;font-family:Arial,sans-serif;font-size:22px;'
        + f'font-weight:700;color:#0f172a;line-height:1.3">{greeting}</p>'
        + f'<p style="margin:0 0 24px;font-family:Arial,sans-serif;font-size:14px;'
        + f'color:#475569;line-height:1.7">{sub}</p>'
        + _order_card(
            "Detalle de la orden" if is_es else "Order details",
            _data_row(ord_label, f"#{order_number}")
            + date_row
            + _data_row(status_label, status_val, accent)
          )
        + '<p style="margin:20px 0 12px"></p>'
        + _steps_table(steps, accent)
        + '<p style="margin:16px 0 8px"></p>'
        + _tip_box(tip, accent)
    )

    content = _status_band(badge, accent) + _body_wrap(body)
    return _html_base(content, accent)


def _html_pickup_confirmed(name: str, order_number: str, pickup_date: Optional[str],
                            pickup_window: Optional[str], is_es: bool) -> str:
    accent = VFL_BLUE
    if is_es:
        date_str   = f" para el {pickup_date}" if pickup_date else ""
        phone_line = (f"<br>Si tienes preguntas, llámanos al {BUSINESS_PHONE_DISPLAY}."
                      if BUSINESS_PHONE_DISPLAY else "")
        greeting   = "¡Tu recolección ha sido programada! &#128666;"
        sub        = (f"Hola {name}, tu recolección ha sido programada correctamente{date_str}."
                      f"<br>Estaremos llegando a tu dirección en el horario programado."
                      f"{phone_line}<br>¡Gracias por tu preferencia!")
        tip        = "&#128276; Asegúrate de tener tu ropa lista en bolsas antes de nuestra llegada."
        badge      = "Recolección Programada"
        date_label = "Fecha de pickup"; window_label = "Ventana de tiempo"
        status_label = "Estado"; confirmed_val = "Confirmado &#10003;"
    else:
        date_str   = f" for {pickup_date}" if pickup_date else ""
        phone_line = (f"<br>If you have questions, call us at {BUSINESS_PHONE_DISPLAY}."
                      if BUSINESS_PHONE_DISPLAY else "")
        greeting   = "Your pickup has been successfully scheduled! &#128666;"
        sub        = (f"Hi {name}, your pickup has been successfully scheduled{date_str}."
                      f"<br>We will arrive at your address during the scheduled time."
                      f"{phone_line}<br>Thank you for choosing us!")
        tip        = "&#128276; Make sure your laundry is ready in bags before our arrival."
        badge      = "Pickup Scheduled"
        date_label = "Pickup date"; window_label = "Time window"
        status_label = "Status"; confirmed_val = "Confirmed &#10003;"

    rows = ""
    if pickup_date:
        rows += _data_row(date_label, pickup_date)
    if pickup_window:
        rows += _data_row(window_label, pickup_window)
    rows += _data_row(status_label, confirmed_val, accent)

    body = (
        f'<p style="margin:0 0 6px;font-family:Arial,sans-serif;font-size:22px;'
        f'font-weight:700;color:#0f172a;line-height:1.3">{greeting}</p>'
        f'<p style="margin:0 0 24px;font-family:Arial,sans-serif;font-size:14px;'
        f'color:#475569;line-height:1.7">{sub}</p>'
        + _order_card("Detalle" if is_es else "Details", rows)
        + '<p style="margin:16px 0 8px"></p>'
        + _tip_box(tip, accent)
    )

    content = _status_band(badge, accent) + _body_wrap(body)
    return _html_base(content, accent)


def _html_processing(name: str, order_number: str, is_es: bool) -> str:
    accent = VFL_WARN
    if is_es:
        greeting  = "Tu ropa está en proceso &#9786;"
        sub       = (f"Hola {name}, ya tenemos tu ropa y la estamos procesando "
                     f"con todo el cuidado que merece.")
        info      = ("&#128300; Separamos, verificamos y procesamos cada prenda "
                     "siguiendo las instrucciones de cuidado.")
        tip       = "&#9201; El tiempo promedio de proceso es de 24-48 horas. Te notificaremos cuando esté lista."
        badge     = "En Proceso"
    else:
        greeting  = "Your laundry is being processed &#9786;"
        sub       = (f"Hi {name}, we have your laundry and we're processing it "
                     f"with all the care it deserves.")
        info      = ("&#128300; We sort, inspect, and process each garment "
                     "following care instructions.")
        tip       = "&#9201; Average processing time is 24-48 hours. We'll notify you when it's ready."
        badge     = "Processing"

    body = (
        f'<p style="margin:0 0 6px;font-family:Arial,sans-serif;font-size:22px;'
        f'font-weight:700;color:#0f172a;line-height:1.3">{greeting}</p>'
        f'<p style="margin:0 0 24px;font-family:Arial,sans-serif;font-size:14px;'
        f'color:#475569;line-height:1.7">{sub}</p>'
        + _info_box(info, accent)
        + '<p style="margin:16px 0 8px"></p>'
        + _tip_box(tip, accent)
    )

    content = _status_band(badge, accent) + _body_wrap(body)
    return _html_base(content, accent)


def _html_ready(name: str, order_number: str, service_type: str, is_es: bool) -> str:
    accent = VFL_SUCCESS
    is_pickup_delivery = "pickup" in service_type or "delivery" in service_type

    if is_es:
        if is_pickup_delivery:
            greeting = "¡Tu ropa está lista para entrega! &#10024;"
            sub      = f"Hola {name}, tu ropa está lista. Pronto la enviaremos a tu dirección."
            tip      = "&#128230; Tu entrega será asignada a un conductor en breve."
        else:
            greeting = "¡Tu ropa está lista para recoger! &#10024;"
            sub      = f"Hola {name}, tu ropa está lista y te esperamos. Pasa cuando gustes."
            tip      = "&#127978; Tenemos tu ropa lista. Preséntate en nuestra tienda para recogerla."
        badge    = "¡Lista!"
        info_txt = ("&#10003; Toda tu ropa fue lavada, secada y doblada/colgada "
                    "según tus preferencias.")
    else:
        if is_pickup_delivery:
            greeting = "Your laundry is ready for delivery! &#10024;"
            sub      = f"Hi {name}, your laundry is ready. We'll deliver it to your address soon."
            tip      = "&#128230; Your delivery will be assigned to a driver shortly."
        else:
            greeting = "Your laundry is ready for pickup! &#10024;"
            sub      = f"Hi {name}, your laundry is ready and waiting for you. Stop by whenever."
            tip      = "&#127978; Your laundry is ready. Come to our store to pick it up."
        badge    = "Ready!"
        info_txt = ("&#10003; All your garments have been washed, dried, and "
                    "folded/hung per your preferences.")

    body = (
        f'<p style="margin:0 0 6px;font-family:Arial,sans-serif;font-size:22px;'
        f'font-weight:700;color:#0f172a;line-height:1.3">{greeting}</p>'
        f'<p style="margin:0 0 24px;font-family:Arial,sans-serif;font-size:14px;'
        f'color:#475569;line-height:1.7">{sub}</p>'
        + _info_box(info_txt, accent)
        + '<p style="margin:16px 0 8px"></p>'
        + _tip_box(tip, accent)
    )

    content = _status_band(badge, accent) + _body_wrap(body)
    return _html_base(content, accent)


def _html_out_for_delivery(name: str, order_number: str, is_es: bool) -> str:
    accent = VFL_BLUE
    if is_es:
        greeting  = "¡Tu entrega está en camino! &#128666;&#128168;"
        sub       = (f"Hola {name}, tu ropa está en camino. "
                     f"Asegúrate de estar disponible para recibirla.")
        info      = "&#128506; Tu conductor está en ruta. Por favor ten listo el acceso a tu dirección."
        tip       = "&#128241; Si necesitas reajustar el horario, contáctanos de inmediato."
        badge     = "En Camino"
    else:
        greeting  = "Your delivery is on the way! &#128666;&#128168;"
        sub       = (f"Hi {name}, your laundry is on its way. "
                     f"Make sure you're available to receive it.")
        info      = "&#128506; Your driver is en route. Please ensure access to your address is clear."
        tip       = "&#128241; If you need to adjust the delivery time, contact us immediately."
        badge     = "Out for Delivery"

    body = (
        f'<p style="margin:0 0 6px;font-family:Arial,sans-serif;font-size:22px;'
        f'font-weight:700;color:#0f172a;line-height:1.3">{greeting}</p>'
        f'<p style="margin:0 0 24px;font-family:Arial,sans-serif;font-size:14px;'
        f'color:#475569;line-height:1.7">{sub}</p>'
        + _info_box(info, accent)
        + '<p style="margin:16px 0 8px"></p>'
        + _tip_box(tip, accent)
    )

    content = _status_band(badge, accent) + _body_wrap(body)
    return _html_base(content, accent)


def _html_delivered(name: str, order_number: str, order_total: Optional[float], is_es: bool) -> str:
    accent = VFL_SUCCESS
    if is_es:
        greeting  = "¡Entrega completada! &#127881;"
        sub       = (f"Hola {name}, tu ropa fue entregada con éxito. "
                     f"Esperamos que estés satisfecho con nuestro servicio.")
        tip       = "&#11088; ¿Te gustó el servicio? ¡Comparte tu experiencia con amigos y familia!"
        badge     = "Entregado"
        total_lbl = "Total del servicio"
    else:
        greeting  = "Delivery completed! &#127881;"
        sub       = (f"Hi {name}, your laundry has been successfully delivered. "
                     f"We hope you're happy with our service.")
        tip       = "&#11088; Did you enjoy the service? Share your experience with friends and family!"
        badge     = "Delivered"
        total_lbl = "Service total"

    card_html = ""
    if order_total:
        card_html = (
            '<p style="margin:0 0 16px"></p>'
            + _order_card(
                "Resumen" if is_es else "Summary",
                _data_row(total_lbl, f"${order_total:.2f}", accent)
              )
        )

    body = (
        f'<p style="margin:0 0 6px;font-family:Arial,sans-serif;font-size:22px;'
        f'font-weight:700;color:#0f172a;line-height:1.3">{greeting}</p>'
        f'<p style="margin:0 0 24px;font-family:Arial,sans-serif;font-size:14px;'
        f'color:#475569;line-height:1.7">{sub}</p>'
        + card_html
        + '<p style="margin:16px 0 8px"></p>'
        + _tip_box(tip, accent)
    )

    content = _status_band(badge, accent) + _body_wrap(body)
    return _html_base(content, accent)


def _html_cancelled(name: str, order_number: str, is_es: bool) -> str:
    accent = VFL_DANGER
    if is_es:
        greeting  = "Tu orden fue cancelada"
        # FIX: eliminada la redundancia — el número ya aparece en el order-number-box
        sub       = (f"Hola {name}, tu orden ha sido cancelada. "
                     f"Si fue un error o necesitas reagendar, contáctanos.")
        tip       = "&#128222; Estamos aquí para ayudarte a reagendar cuando lo necesites."
        badge     = "Cancelada"
    else:
        greeting  = "Your order has been cancelled"
        sub       = (f"Hi {name}, your order has been cancelled. "
                     f"If this was a mistake or you'd like to reschedule, please contact us.")
        tip       = "&#128222; We're here to help you reschedule whenever you're ready."
        badge     = "Cancelled"

    body = (
        _order_number_box("Número de orden" if is_es else "Order number", order_number)
        + f'<p style="margin:24px 0 6px;font-family:Arial,sans-serif;font-size:22px;'
        + f'font-weight:700;color:#0f172a;line-height:1.3">{greeting}</p>'
        + f'<p style="margin:0 0 24px;font-family:Arial,sans-serif;font-size:14px;'
        + f'color:#475569;line-height:1.7">{sub}</p>'
        + _tip_box(tip, accent)
    )

    content = _status_band(badge, accent) + _body_wrap(body)
    return _html_base(content, accent)


def _html_store_order(name: str, order_number: str, order_total: Optional[float],
                       shipping_fee: Optional[float], is_es: bool) -> str:
    accent = VFL_BLUE
    if is_es:
        greeting  = "¡Compra confirmada! &#128717;"
        sub       = (f"Hola {name}, recibimos tu orden de tienda #{order_number} "
                     f"y ya la estamos preparando.")
        tip       = "&#128230; Te notificaremos cuando tu pedido esté listo para recoger o en camino."
        badge     = "Orden de Tienda"
        ship_lbl  = "Costo de envío"
        total_lbl = "Total"
    else:
        greeting  = "Store order confirmed! &#128717;"
        sub       = (f"Hi {name}, we received your store order #{order_number} "
                     f"and we're getting it ready.")
        tip       = "&#128230; We'll notify you when your order is ready for pickup or on its way."
        badge     = "Store Order"
        ship_lbl  = "Shipping fee"
        total_lbl = "Total"

    rows = ""
    if shipping_fee:
        rows += _data_row(ship_lbl, f"${shipping_fee:.2f}")
    if order_total:
        rows += _data_row(total_lbl, f"${order_total:.2f}", accent)

    card_html = ""
    if rows:
        card_html = (
            '<p style="margin:0 0 16px"></p>'
            + _order_card("Resumen de compra" if is_es else "Purchase summary", rows)
        )

    body = (
        _order_number_box("Número de orden" if is_es else "Order number", order_number)
        + f'<p style="margin:24px 0 6px;font-family:Arial,sans-serif;font-size:22px;'
        + f'font-weight:700;color:#0f172a;line-height:1.3">{greeting}</p>'
        + f'<p style="margin:0 0 24px;font-family:Arial,sans-serif;font-size:14px;'
        + f'color:#475569;line-height:1.7">{sub}</p>'
        + card_html
        + '<p style="margin:16px 0 8px"></p>'
        + _tip_box(tip, accent)
    )

    content = _status_band(badge, accent) + _body_wrap(body)
    return _html_base(content, accent)


def _html_payment_request(name: str, order_number: str, order_total: Optional[float],
                            payment_url: str, is_es: bool) -> str:
    """
    Plantilla HTML para solicitud de pago con botón CTA prominente.
    Totalmente nueva — no existía en la versión anterior.
    Compatible con Outlook/Gmail usando tablas y VML button.
    """
    accent = VFL_SUCCESS
    if is_es:
        greeting  = "Tu pago está listo &#128179;"
        sub       = (f"Hola {name}, tu servicio #{order_number} está completo. "
                     f"Por favor realiza el pago para finalizar.")
        btn_label = "Pagar ahora"
        tip       = ("&#128274; Este enlace de pago es seguro y exclusivo para tu orden. "
                     "Expira en 24 horas.")
        badge     = "Pago Requerido"
        total_lbl = "Total a pagar"
        secure_note = ("&#128274; Pago procesado de forma segura. "
                       "Tu información está protegida.")
    else:
        greeting  = "Your payment is ready &#128179;"
        sub       = (f"Hi {name}, your service #{order_number} is complete. "
                     f"Please complete the payment to finalize.")
        btn_label = "Pay now"
        tip       = ("&#128274; This payment link is secure and exclusive to your order. "
                     "It expires in 24 hours.")
        badge     = "Payment Required"
        total_lbl = "Amount due"
        secure_note = ("&#128274; Payment processed securely. "
                       "Your information is protected.")

    total_block = ""
    if order_total:
        total_block = (
            '<p style="margin:0 0 16px"></p>'
            + _order_card(
                "Resumen" if is_es else "Summary",
                _data_row(total_lbl,
                          f'<strong style="font-size:16px;color:{accent}">${order_total:.2f}</strong>')
              )
        )

    body = (
        _order_number_box("Número de orden" if is_es else "Order number", order_number)
        + f'<p style="margin:24px 0 6px;font-family:Arial,sans-serif;font-size:22px;'
        + f'font-weight:700;color:#0f172a;line-height:1.3">{greeting}</p>'
        + f'<p style="margin:0 0 24px;font-family:Arial,sans-serif;font-size:14px;'
        + f'color:#475569;line-height:1.7">{sub}</p>'
        + total_block
        # Botón CTA centrado
        + '<p style="margin:24px 0;text-align:center">'
        + _cta_button(payment_url, btn_label, accent)
        + '</p>'
        # URL como texto por si el botón no carga
        + f'<p style="margin:0 0 20px;text-align:center;font-family:Arial,sans-serif;'
        + f'font-size:11px;color:#94a3b8">O copia este enlace: '
        + f'<a href="{payment_url}" style="color:{VFL_BLUE};word-break:break-all">'
        + f'{payment_url}</a></p>'
        + _info_box(secure_note, accent)
        + '<p style="margin:12px 0 8px"></p>'
        + _tip_box(tip, accent)
    )

    content = _status_band(badge, accent) + _body_wrap(body)
    return _html_base(content, accent)


def _html_wash_fold_ready(name: str, order_number: str, is_es: bool) -> str:
    return _html_ready(name, order_number, "wash_fold", is_es)


def _html_completed(name: str, order_number: str, order_total: Optional[float], is_es: bool) -> str:
    accent = VFL_SUCCESS
    if is_es:
        greeting  = "Servicio completado — ¡Gracias! &#128591;"
        sub       = (f"Hola {name}, tu servicio está completo. "
                     f"Fue un placer cuidar de tu ropa.")
        tip       = "&#10084; Esperamos verte de nuevo. ¡Recomiéndanos con familia y amigos!"
        badge     = "Completado"
        total_lbl = "Total del servicio"
    else:
        greeting  = "Service completed — Thank you! &#128591;"
        sub       = (f"Hi {name}, your service is complete. "
                     f"It was a pleasure taking care of your laundry.")
        tip       = "&#10084; We hope to see you again. Recommend us to family and friends!"
        badge     = "Completed"
        total_lbl = "Service total"

    card_html = ""
    if order_total:
        card_html = (
            '<p style="margin:0 0 16px"></p>'
            + _order_card(
                "Resumen" if is_es else "Summary",
                _data_row(total_lbl, f"${order_total:.2f}", accent)
              )
        )

    body = (
        f'<p style="margin:0 0 6px;font-family:Arial,sans-serif;font-size:22px;'
        f'font-weight:700;color:#0f172a;line-height:1.3">{greeting}</p>'
        f'<p style="margin:0 0 24px;font-family:Arial,sans-serif;font-size:14px;'
        f'color:#475569;line-height:1.7">{sub}</p>'
        + card_html
        + '<p style="margin:16px 0 8px"></p>'
        + _tip_box(tip, accent)
    )

    content = _status_band(badge, accent) + _body_wrap(body)
    return _html_base(content, accent)


def _html_generic(name: str, is_es: bool, title: Optional[str] = None,
                   body_text: Optional[str] = None) -> str:
    """
    Fallback HTML genérico para eventos sin plantilla específica.
    Evita que el email fallback muestre el texto SMS con asteriscos markdown.
    """
    accent  = VFL_BLUE
    heading = title or ("Actualización de tu servicio" if is_es else "Service update")
    text    = body_text or (
        f"Hola {name}, tienes una actualización de tu servicio con {BUSINESS_NAME}. "
        f"Contáctanos si tienes preguntas."
        if is_es else
        f"Hi {name}, you have a service update from {BUSINESS_NAME}. "
        f"Please contact us if you have questions."
    )

    body = (
        f'<p style="margin:0 0 6px;font-family:Arial,sans-serif;font-size:22px;'
        f'font-weight:700;color:#0f172a;line-height:1.3">{heading}</p>'
        f'<p style="margin:0 0 24px;font-family:Arial,sans-serif;font-size:14px;'
        f'color:#475569;line-height:1.7">{text}</p>'
        + _tip_box(
            (f"&#128222; ¿Tienes dudas? Escríbenos a {BUSINESS_WEBSITE}"
             if is_es else
             f"&#128222; Questions? Reach us at {BUSINESS_WEBSITE}"),
            accent
          )
    )

    content = _status_band("Update" if not is_es else "Actualización", accent) + _body_wrap(body)
    return _html_base(content, accent)


# ─────────────────────────────────────────────────────────────────────────────
# SMS / WHATSAPP  — con acortado de links de pago
# ─────────────────────────────────────────────────────────────────────────────

def _sms_sync(event: str, name: str, order_number: str, language: str,
              pickup_date: Optional[str] = None, pickup_window: Optional[str] = None,
              order_total: Optional[float] = None,
              payment_url: Optional[str] = None) -> str:
    """
    Versión síncrona de _sms para uso en build_premium_message.
    El acortado de URL se hace en la versión async _sms_with_short_url.
    FIX: caso order_received ahora tiene respuesta propia, no cae al fallback.
    """
    is_es = str(language).lower().startswith("es")
    biz   = BUSINESS_NAME
    n     = name or ("Cliente" if is_es else "Customer")

    if event == "order_created":
        date_str = (f"\n&#128197; Pickup: {pickup_date}"
                    + (f" ({pickup_window})" if pickup_window else "")
                    if pickup_date else "")
        if is_es:
            return (f"&#129403; {biz}\n\n"
                    f"¡Hola {n}! Tu orden *#{order_number}* fue programada.{date_str}\n\n"
                    f"Te contactaremos para confirmar. ¡Gracias! &#128588;")
        return (f"&#129403; {biz}\n\n"
                f"Hi {n}! Your order *#{order_number}* has been scheduled.{date_str}\n\n"
                f"We'll confirm soon. Thank you! &#128588;")

    if event == "pickup_confirmed":
        date_line  = (f"\n&#128197; {pickup_date}"
                      + (f" · {pickup_window}" if pickup_window else "")
                      if pickup_date else "")
        phone_line = f"\n&#128222; {BUSINESS_PHONE_DISPLAY}" if BUSINESS_PHONE_DISPLAY else ""
        if is_es:
            return (f"&#128666; {biz}\n\n"
                    f"Hola {n}, tu recolección ha sido programada correctamente{date_line}.\n"
                    f"Estaremos llegando a tu dirección en el horario programado.{phone_line}\n"
                    f"¡Gracias por tu preferencia!")
        return (f"&#128666; {biz}\n\n"
                f"Hi {n}, your pickup has been successfully scheduled{date_line}.\n"
                f"We will arrive at your address during the scheduled time.{phone_line}\n"
                f"Thank you for choosing us!")

    # FIX: order_received ahora tiene su propio mensaje, no cae al fallback
    if event == "order_received":
        if is_es:
            return (f"&#9786; {biz}\n\n"
                    f"Hola {n}, recibimos tu orden *#{order_number}* en nuestra tienda "
                    f"y comenzaremos a procesarla pronto.\n\n"
                    f"&#9201; Te avisamos cuando esté lista.")
        return (f"&#9786; {biz}\n\n"
                f"Hi {n}, we received your order *#{order_number}* at our store "
                f"and will start processing it soon.\n\n"
                f"&#9201; We'll let you know when it's ready.")

    if event == "processing":
        if is_es:
            return (f"&#9786; {biz}\n\n"
                    f"Hola {n}, ya tenemos tu ropa y la estamos procesando con cuidado.\n\n"
                    f"&#9201; Te avisamos cuando esté lista.")
        return (f"&#9786; {biz}\n\n"
                f"Hi {n}, we have your laundry and it's being carefully processed.\n\n"
                f"&#9201; We'll let you know when it's ready.")

    if event == "ready":
        if is_es:
            return (f"&#10024; {biz}\n\n"
                    f"¡Hola {n}! Tu ropa está *LISTA* y en camino pronto. &#128693;\n\n"
                    f"Gracias por confiar en nosotros.")
        return (f"&#10024; {biz}\n\n"
                f"Hi {n}! Your laundry is *READY* and will be on its way soon. &#128693;\n\n"
                f"Thank you for trusting us.")

    if event == "ready_for_pickup":
        if is_es:
            return (f"&#9989; {biz}\n\n"
                    f"¡Hola {n}! Tu ropa está lista para recoger en nuestra tienda.\n\n"
                    f"&#127978; ¡Te esperamos cuando puedas pasar!")
        return (f"&#9989; {biz}\n\n"
                f"Hi {n}! Your laundry is ready for pickup at our store.\n\n"
                f"&#127978; We look forward to seeing you!")

    if event == "out_for_delivery":
        if is_es:
            return (f"&#128666; {biz}\n\n"
                    f"¡Hola {n}! Tu entrega va *EN CAMINO* ahora mismo. &#128168;\n\n"
                    f"Por favor mantente disponible para recibirla.")
        return (f"&#128666; {biz}\n\n"
                f"Hi {n}! Your delivery is *ON THE WAY* right now. &#128168;\n\n"
                f"Please be available to receive it.")

    if event == "delivered":
        total_str = f"\n&#128176; Total: ${order_total:.2f}" if order_total else ""
        if is_es:
            return (f"&#127881; {biz}\n\n"
                    f"¡Hola {n}! Tu entrega fue *COMPLETADA* con éxito. ✓{total_str}\n\n"
                    f"¡Gracias! Esperamos verte pronto. &#10084;")
        return (f"&#127881; {biz}\n\n"
                f"Hi {n}! Your delivery has been *COMPLETED* successfully. ✓{total_str}\n\n"
                f"Thank you! We hope to see you soon. &#10084;")

    if event == "completed":
        total_str = f"\n&#128176; Total: ${order_total:.2f}" if order_total else ""
        if is_es:
            return (f"&#128591; {biz}\n\n"
                    f"Hola {n}, tu servicio está *COMPLETO*.{total_str}\n\n"
                    f"Fue un placer cuidar de tu ropa. ¡Hasta pronto!")
        return (f"&#128591; {biz}\n\n"
                f"Hi {n}, your service is *COMPLETE*.{total_str}\n\n"
                f"It was a pleasure caring for your laundry. See you soon!")

    if event == "cancelled":
        if is_es:
            return (f"&#10060; {biz}\n\n"
                    f"Hola {n}, tu orden *#{order_number}* fue cancelada.\n\n"
                    f"¿Necesitas reagendar? Contáctanos, con gusto te ayudamos. &#128222;")
        return (f"&#10060; {biz}\n\n"
                f"Hi {n}, your order *#{order_number}* was cancelled.\n\n"
                f"Need to reschedule? Contact us, we're happy to help. &#128222;")

    if event == "store_order":
        total_str = f" · Total: ${order_total:.2f}" if order_total else ""
        if is_es:
            return (f"&#128717; {biz}\n\n"
                    f"¡Hola {n}! Recibimos tu orden *#{order_number}*{total_str}.\n\n"
                    f"Te avisamos cuando esté lista. ¡Gracias!")
        return (f"&#128717; {biz}\n\n"
                f"Hi {n}! We received your order *#{order_number}*{total_str}.\n\n"
                f"We'll let you know when it's ready. Thank you!")

    if event == "payment_request":
        # El URL ya viene acortado cuando se llama desde build_premium_message_async
        url_str = f"\n&#128279; {payment_url}" if payment_url else ""
        total_str = f" Total: ${order_total:.2f}." if order_total else ""
        if is_es:
            return (f"&#128179; {biz}\n\n"
                    f"Hola {n}, tu servicio *#{order_number}* está listo para pagar.{total_str}\n"
                    f"Haz clic para pagar de forma segura:{url_str}\n\n"
                    f"&#128274; Enlace válido por 24 horas.")
        return (f"&#128179; {biz}\n\n"
                f"Hi {n}, your service *#{order_number}* is ready to pay.{total_str}\n"
                f"Click to pay securely:{url_str}\n\n"
                f"&#128274; Link valid for 24 hours.")

    # Fallback genérico — limpio, sin asteriscos problemáticos
    if is_es:
        return (f"&#129403; {biz}\n\n"
                f"Hola {n}, hay una actualización en tu servicio. "
                f"Contáctanos si tienes preguntas.")
    return (f"&#129403; {biz}\n\n"
            f"Hi {n}, there's an update on your service. "
            f"Contact us if you have questions.")


async def _sms_with_short_url(event: str, name: str, order_number: str, language: str,
                               pickup_date: Optional[str] = None,
                               pickup_window: Optional[str] = None,
                               order_total: Optional[float] = None,
                               payment_url: Optional[str] = None) -> str:
    """
    Versión async que acorta el payment_url antes de construir el SMS.
    Solo para eventos que incluyen un link de pago (payment_request, store_order con URL).
    """
    short_url = await shorten_url_safe(payment_url) if payment_url else None
    return _sms_sync(event, name, order_number, language,
                     pickup_date, pickup_window, order_total, short_url)


# ─────────────────────────────────────────────────────────────────────────────
# VOICE (TwiML)
# ─────────────────────────────────────────────────────────────────────────────

def _voice(event: str, name: str, order_number: str, language: str) -> str:
    is_es = str(language).lower().startswith("es")
    biz   = BUSINESS_NAME
    n     = name or ("estimado cliente" if is_es else "valued customer")

    scripts = {
        "order_created": (
            f"Hola {n}, llamamos de {biz} para confirmar que recibimos tu orden número {order_number}. Pronto nos pondremos en contacto. ¡Hasta luego!",
            f"Hi {n}, this is {biz} calling to confirm we received your order number {order_number}. We'll be in touch soon. Goodbye!"
        ),
        "pickup_confirmed": (
            f"Hola {n}, tu recolección con {biz} ha sido programada correctamente. Estaremos en tu domicilio en el horario acordado. Te recomendamos tener tu ropa lista para agilizar el servicio. ¡Gracias por confiar en nosotros, hasta pronto!",
            f"Hi {n}, your pickup with {biz} has been successfully scheduled. We will arrive at your address during the scheduled time. We recommend having your laundry ready to ensure a smooth service. Thank you for choosing us, Goodbye!"
        ),
        "ready": (
            f"Hola {n}, tu ropa con {biz} está lista. Pronto estará en camino hacia tu domicilio. ¡Gracias por confiar en nosotros!",
            f"Hi {n}, your laundry with {biz} is ready. It will be on its way to your address shortly. Thank you for trusting us!"
        ),
        "out_for_delivery": (
            f"Hola {n}, tu entrega de {biz} está en camino en este momento. Llegaremos a tu domicilio en breve. ¡Agradecemos tu preferencia!",
            f"Hi {n}, your {biz} delivery is on the way right now. We will be arriving shortly. We truly appreciate your preference!"
        ),
        "delivered": (
            f"Hola {n}, {biz} completó tu entrega exitosamente. Esperamos servirte pronto nuevamente. ¡Gracias por tu preferencia!",
            f"Hi {n}, {biz} has completed your delivery successfully. We look forward to serving you again soon. Thank you for your business!"
        ),
        "cancelled": (
            f"Hola {n}, tu orden número {order_number} con {biz} fue cancelada. Si tienes preguntas, llámanos. ¡Hasta luego!",
            f"Hi {n}, your order number {order_number} with {biz} was cancelled. If you have questions, please call us. Goodbye!"
        ),
        "order_received": (
            f"Hola, le habla {biz}. Solo para confirmarle que hemos recibido su orden y pronto será procesada con el máximo cuidado. Le avisaremos en cuanto esté lista. Gracias por confiar en nosotros.",
            f"Hello, this is {biz}. We're calling to confirm that your order has been received and will be processed shortly with the utmost care. We'll notify you as soon as it's ready. Thank you for trusting us."
        ),
        "ready_for_pickup": (
            f"Hola, le habla {biz}. Nos complace informarle que su orden ya está lista. Gracias por permitirnos cuidar de su ropa, estamos para servirle.",
            f"Hello, this is {biz}. We're pleased to let you know that your order is now ready. Thank you for allowing us to care for your garments, we're here for you."
        ),
        "completed": (
            f"Hola, le habla {biz}. Le confirmamos que su orden ha sido completada exitosamente. Ha sido un placer atenderle, esperamos verle nuevamente muy pronto.",
            f"Hello, this is {biz}. We're calling to confirm that your order has been completed successfully. It's been a pleasure serving you, we look forward to seeing you again soon."
        ),
        "payment_request": (
            f"Hola {n}, le habla {biz}. Le llamamos para informarle que su servicio está listo y tiene un pago pendiente. Por favor revise su correo o mensaje de texto para el enlace de pago. ¡Gracias!",
            f"Hi {n}, this is {biz} calling. We're reaching out to let you know your service is complete and you have a payment pending. Please check your email or text message for the payment link. Thank you!"
        ),
    }
    es_script, en_script = scripts.get(event, (
        f"Hola {n}, tienes una actualización de tu servicio con {biz}. Por favor contáctanos. ¡Hasta luego!",
        f"Hi {n}, you have a service update from {biz}. Please contact us. Goodbye!"
    ))
    return es_script if is_es else en_script


# ─────────────────────────────────────────────────────────────────────────────
# BUILDER PRINCIPAL — síncrono (sin acortado de URL)
# ─────────────────────────────────────────────────────────────────────────────

def build_premium_message(
    event: str,
    status: Optional[str],
    order_number: str,
    customer_name: Optional[str],
    language: str,
    pickup_date: Optional[str] = None,
    pickup_window: Optional[str] = None,
    order_total: Optional[float] = None,
    shipping_fee: Optional[float] = None,
    service_type: Optional[str] = None,
    payment_url: Optional[str] = None,
) -> dict:
    """
    Retorna dict con subject, message (SMS/plain), html, voice_text.
    FIX: html fallback usa _html_generic en lugar del SMS con asteriscos.
    """
    is_es = str(language).lower().startswith("es")
    name  = customer_name or ("Cliente" if is_es else "Customer")
    svc   = normalize_status_value(service_type or "pickup_delivery")

    subjects = {
        "order_created":    ("Orden programada — " + BUSINESS_NAME,            "Order scheduled — " + BUSINESS_NAME),
        "order_received":   ("Orden recibida — " + BUSINESS_NAME,               "Order received — " + BUSINESS_NAME),
        "pickup_confirmed": ("Recolección programada ✓ — " + BUSINESS_NAME,     "Pickup scheduled ✓ — " + BUSINESS_NAME),
        "processing":       ("Tu ropa está en proceso — " + BUSINESS_NAME,      "Your laundry is processing — " + BUSINESS_NAME),
        "ready":            ("¡Tu ropa está lista! — " + BUSINESS_NAME,         "Your laundry is ready! — " + BUSINESS_NAME),
        "ready_for_pickup": ("Lista para recoger — " + BUSINESS_NAME,           "Ready for pickup — " + BUSINESS_NAME),
        "out_for_delivery": ("En camino 🚚 — " + BUSINESS_NAME,                 "Out for delivery 🚚 — " + BUSINESS_NAME),
        "delivered":        ("Entrega completada ✓ — " + BUSINESS_NAME,         "Delivery completed ✓ — " + BUSINESS_NAME),
        "completed":        ("Servicio completado ✓ — " + BUSINESS_NAME,        "Service completed ✓ — " + BUSINESS_NAME),
        "cancelled":        ("Orden cancelada — " + BUSINESS_NAME,              "Order cancelled — " + BUSINESS_NAME),
        "store_order":      ("Compra confirmada 🛍️ — " + BUSINESS_NAME,         "Purchase confirmed 🛍️ — " + BUSINESS_NAME),
        "payment_request":  ("Pago pendiente 💳 — " + BUSINESS_NAME,            "Payment required 💳 — " + BUSINESS_NAME),
    }
    es_subj, en_subj = subjects.get(event, ("Actualización de orden", "Order update"))
    subject = es_subj if is_es else en_subj

    # Builders HTML — TODOS los eventos tienen plantilla dedicada ahora
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
    # FIX: fallback usa HTML genérico, no el string SMS con asteriscos markdown
    html = html_builders.get(event, lambda: _html_generic(name, is_es))()

    # SMS síncrono (sin acortado de URL — usar build_premium_message_async para eso)
    sms_message = _sms_sync(event, name, order_number, language,
                             pickup_date, pickup_window, order_total, payment_url)

    voice_text = _voice(event, name, order_number, language)

    return {
        "subject":    subject,
        "message":    sms_message,
        "html":       html,
        "voice_text": voice_text,
    }


async def build_premium_message_async(
    event: str,
    status: Optional[str],
    order_number: str,
    customer_name: Optional[str],
    language: str,
    pickup_date: Optional[str] = None,
    pickup_window: Optional[str] = None,
    order_total: Optional[float] = None,
    shipping_fee: Optional[float] = None,
    service_type: Optional[str] = None,
    payment_url: Optional[str] = None,
) -> dict:
    """
    Versión async del builder — aorta URLs de pago en SMS/WhatsApp.
    Usar esta versión en send_preferred_notification para que el SMS
    tenga el link acortado.
    """
    # Acortar URL si el evento la necesita
    short_url = None
    if payment_url and event in {"payment_request", "store_order"}:
        short_url = await shorten_url_safe(payment_url)

    result = build_premium_message(
        event=event, status=status, order_number=order_number,
        customer_name=customer_name, language=language,
        pickup_date=pickup_date, pickup_window=pickup_window,
        order_total=order_total, shipping_fee=shipping_fee,
        service_type=service_type,
        payment_url=short_url or payment_url,
    )

    # Reconstruir el SMS con la URL ya acortada
    is_es = str(language).lower().startswith("es")
    name  = customer_name or ("Cliente" if is_es else "Customer")
    result["message"] = _sms_sync(
        event, name, order_number, language,
        pickup_date, pickup_window, order_total,
        short_url or payment_url,
    )
    # El HTML de payment_request también usa la URL acortada para el texto fallback
    if event == "payment_request" and short_url:
        result["html"] = _html_payment_request(
            name, order_number, order_total, short_url, is_es
        )

    return result


# ─────────────────────────────────────────────────────────────────────────────
# Send functions con reintentos
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
        _log_attempt({"channel": "sms", "event": "direct_sms", "status": "failed",
                      "to": to_phone, "reason": "twilio_not_configured",
                      "timestamp": datetime.now(timezone.utc).isoformat()})
        return False
    formatted = format_phone(to_phone)
    if not formatted: logger.error("Invalid phone"); return False
    async def _send():
        return await asyncio.to_thread(twilio_client.messages.create,
                                        body=message, from_=TWILIO_PHONE_NUMBER, to=formatted)
    ok, res = await _send_with_retries(_send)
    if ok:
        logger.info(f"SMS sent: {res.sid}")
        _log_attempt({"channel": "sms", "event": "direct_sms", "status": "sent",
                      "to": formatted, "timestamp": datetime.now(timezone.utc).isoformat()})
        return True
    logger.error(f"SMS failed: {res}")
    _log_attempt({"channel": "sms", "event": "direct_sms", "status": "failed",
                  "to": formatted, "reason": str(res)[:100],
                  "timestamp": datetime.now(timezone.utc).isoformat()})
    return False

async def send_whatsapp(to_phone: str, message: str) -> bool:
    if not twilio_client or not TWILIO_WHATSAPP_NUMBER:
        logger.warning("Twilio not configured for WhatsApp")
        _log_attempt({"channel": "whatsapp", "event": "direct_whatsapp", "status": "failed",
                      "to": to_phone, "reason": "twilio_not_configured",
                      "timestamp": datetime.now(timezone.utc).isoformat()})
        return False
    formatted = format_whatsapp(to_phone)
    if not formatted: logger.error("Invalid phone"); return False
    async def _send():
        return await asyncio.to_thread(twilio_client.messages.create,
                                        body=message, from_=TWILIO_WHATSAPP_NUMBER, to=formatted)
    ok, res = await _send_with_retries(_send)
    if ok:
        logger.info(f"WhatsApp sent: {res.sid}")
        _log_attempt({"channel": "whatsapp", "event": "direct_whatsapp", "status": "sent",
                      "to": formatted, "timestamp": datetime.now(timezone.utc).isoformat()})
        return True
    logger.error(f"WhatsApp failed: {res}")
    _log_attempt({"channel": "whatsapp", "event": "direct_whatsapp", "status": "failed",
                  "to": formatted, "reason": str(res)[:100],
                  "timestamp": datetime.now(timezone.utc).isoformat()})
    return False

async def send_voice_call(to_phone: str, message: str, language: str) -> bool:
    if not twilio_client or not TWILIO_PHONE_NUMBER:
        logger.warning("Twilio not configured for Voice"); return False
    formatted = format_phone(to_phone)
    if not formatted: logger.error("Invalid phone"); return False
    lang_code = "es-MX" if str(language).lower().startswith("es") else "en-US"
    safe_msg  = xml.sax.saxutils.escape(message)
    twiml     = f'<Response><Say language="{lang_code}" voice="alice">{safe_msg}</Say></Response>'
    async def _send():
        return await asyncio.to_thread(twilio_client.calls.create,
                                        twiml=twiml, to=formatted, from_=TWILIO_PHONE_NUMBER)
    ok, res = await _send_with_retries(_send)
    if ok: logger.info(f"Call initiated: {res.sid}"); return True
    logger.error(f"Call failed: {res}"); return False

async def send_email(to_email: str, subject: str, body: str, html_body: Optional[str] = None) -> bool:
    if not sendgrid_client or not SENDGRID_FROM_EMAIL:
        logger.warning("SendGrid not configured")
        _log_attempt({"channel": "email", "event": "direct_email", "status": "failed",
                      "to": to_email, "reason": "sendgrid_not_configured",
                      "timestamp": datetime.now(timezone.utc).isoformat()})
        return False
    # FIX: el html_body siempre viene del builder HTML; el plain_text_content
    # es el cuerpo limpio sin asteriscos markdown de WhatsApp
    plain_text = (body.replace("*", "").replace("_", "").replace("\n\n", "\n")
                  if body else "")
    message = Mail(
        from_email=(SENDGRID_FROM_EMAIL, SENDGRID_FROM_NAME),
        to_emails=to_email,
        subject=subject,
        html_content=html_body or _html_generic(
            "Cliente", True, subject, plain_text
        ),
        plain_text_content=plain_text,
    )
    async def _send():
        return await asyncio.to_thread(sendgrid_client.send, message)
    ok, res = await _send_with_retries(_send)
    if ok:
        logger.info(f"Email sent: {res.status_code}")
        _log_attempt({"channel": "email", "event": "direct_email", "status": "sent",
                      "to": to_email, "timestamp": datetime.now(timezone.utc).isoformat()})
        return res.status_code in [200, 202]
    logger.error(f"Email failed: {res}")
    _log_attempt({"channel": "email", "event": "direct_email", "status": "failed",
                  "to": to_email, "reason": str(res)[:100],
                  "timestamp": datetime.now(timezone.utc).isoformat()})
    return False


# ─────────────────────────────────────────────────────────────────────────────
# Orquestador principal
# ─────────────────────────────────────────────────────────────────────────────

async def send_preferred_notification(
    customer: Optional[Dict],
    order: Optional[Dict],
    event: str,
    status: Optional[str] = None
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

    # payment_request es siempre un milestone válido
    if mapped_event != "payment_request" and mapped_event not in MILESTONES.get(flow, set()):
        logger.info(f"Event {mapped_event} not a milestone for {flow}, skipping.")
        return False

    order_number  = order.get("order_number", order.get("id", "N/A"))
    phone         = customer.get("phone")
    email         = customer.get("email")
    language      = detect_language(customer, phone)
    customer_name = customer.get("name") or ""
    include_date  = mapped_event in {"order_created", "pickup_scheduled", "pickup_reminder",
                                      "pickup_completed", "pickup_update", "pickup_confirmed"}
    pickup_date   = order.get("pickup_date") if include_date else None
    pickup_window = order.get("pickup_time_window") if include_date else None
    order_total   = order.get("total") or order.get("total_amount")
    shipping_fee  = order.get("shipping_fee")
    payment_url   = order.get("payment_url") or order.get("checkout_url")

    # Build messages con acortado async de URL
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

    # Optional Groq override
    if GROQ_API_KEY and USE_ULTRA_PREMIUM:
        try:
            ai_msg = await generate_ai_message(
                context={"event": mapped_event, "status": status, "order_number": order_number,
                         "customer_name": customer_name, "pickup_date": pickup_date,
                         "order_total": order_total, "shipping_fee": shipping_fee},
                language=language, channel="sms", include_date=include_date
            )
            if ai_msg:
                message = ai_msg
        except Exception as e:
            logger.warning(f"AI message generation failed: {e}")

    preference = normalize_preferred_contact(
        (order or {}).get("preferred_contact")
        or extract_contact_from_notes(order)
        or (customer or {}).get("preferred_contact")
    )
    sms_ok = has_sms_consent(order, customer)
    if preference in {"sms","whatsapp"} and not sms_ok:
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

    success = False
    if preference == "email":
        success = await (send_email(email, subject, message, html_body) if email
                         else send_sms(phone, message))
    elif preference == "call":
        success = await (send_voice_call(phone, voice_text, language) if phone
                         else (send_email(email, subject, message, html_body) if email else False))
    elif preference == "whatsapp":
        success = await send_whatsapp(phone, message) if phone else False
        if not success and phone:
            success = await send_sms(phone, message)
    else:  # sms default
        if phone:
            success = await send_sms(phone, message)
        elif email:
            success = await send_email(email, subject, message, html_body)

    _log_attempt({"timestamp": datetime.now().isoformat(), "order_id": order.get("id"),
                  "event": mapped_event, "channel": preference,
                  "status": "sent" if success else "failed"})
    if success:
        _mark_sent(dedupe_key)
    return success


# ─────────────────────────────────────────────────────────────────────────────
# API pública
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
    """
    Nueva función pública para enviar solicitud de pago con link acortado.
    El link de pago se toma de order['payment_url'] o order['checkout_url'].
    """
    return await send_preferred_notification(customer, order, "payment_request")


# ─────────────────────────────────────────────────────────────────────────────
# Groq AI override
# ─────────────────────────────────────────────────────────────────────────────

async def generate_ai_message(context: dict, language: str, channel: str,
                               include_date: bool) -> Optional[str]:
    client = get_groq_client()
    if not client: return None
    lang_label = "Spanish" if str(language).lower().startswith("es") else "English"
    date_instr = "Include pickup date." if include_date else "Do NOT include any dates."
    prompt = (
        f"You are the customer communications assistant for {BUSINESS_NAME}, a premium laundry service. "
        f"Write a short {channel} notification in {lang_label}. {date_instr} "
        "Friendly, concise, professional. Return ONLY the message text. "
        f"Context: {json.dumps(context, ensure_ascii=False)}"
    )
    try:
        response = await asyncio.to_thread(
            client.chat.completions.create,
            messages=[{"role": "user", "content": prompt}],
            model="llama-3.3-70b-versatile",
            temperature=0.4, max_tokens=200
        )
        return response.choices[0].message.content.strip()
    except Exception as e:
        logger.error(f"Groq failed: {e}"); return None