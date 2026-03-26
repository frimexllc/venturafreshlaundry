"""
Notification services using Twilio for SMS, WhatsApp and Voice calls,
and SendGrid for email. Premium visual templates for Ventura Fresh Laundry.

CAMBIOS EN ESTA VERSIÓN:
- Emails HTML premium con diseño completo (header, cards, footer, colores VFL)
- SMS/WhatsApp con formato rico usando emojis y estructura clara
- Plantillas bilinguales ES/EN en todos los eventos
- Plantillas específicas por evento: creación, confirmación, proceso,
  listo, en camino, entregado, cancelado, tienda, wash&fold
"""

import os
import logging
import json
import asyncio
import time
import xml.sax.saxutils
from datetime import datetime, time as dtime
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
def _log_attempt(entry: dict) -> None:   _audit_log.append(entry); logger.debug(f"Audit: {entry}")

MILESTONES = {
    "wash_fold":        {"order_received", "ready_for_pickup", "completed"},
    "pickup_delivery":  {"order_created", "pickup_confirmed", "ready",
                         "out_for_delivery", "delivered", "cancelled"},
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
# Utilities (iguales a versión original)
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
    if v in {"email","correo","mail"}:                   return "email"
    if v in {"phone","call","llamada","telefono","teléfono"}: return "call"
    if v in {"whatsapp","wa","wapp"}:                    return "whatsapp"
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
# ██████╗ ██████╗ ███████╗███╗   ███╗██╗██╗   ██╗███╗   ███╗  EMAIL  HTML
# ─────────────────────────────────────────────────────────────────────────────

def _html_base(content_html: str, accent_color: str = VFL_BLUE, preview_text: str = "") -> str:
    """
    Wrapper base para todos los emails HTML de VFL.
    Incluye: header con logo, contenido, footer con contacto y unsubscribe.
    Diseño responsivo compatible con Gmail, Outlook, Apple Mail.
    """
    year = datetime.now().year
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>{BUSINESS_NAME}</title>
  {f'<meta name="x-apple-disable-message-reformatting">' }
  <!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
    * {{ margin:0; padding:0; box-sizing:border-box; }}
    body {{ background:#f0f9ff; font-family:'Inter',Arial,sans-serif; color:#1e293b; -webkit-font-smoothing:antialiased; }}
    .email-wrapper {{ background:#f0f9ff; padding:32px 16px; }}
    .email-container {{ max-width:560px; margin:0 auto; }}

    /* ── Header ── */
    .header {{ background:{VFL_DARK}; border-radius:16px 16px 0 0; padding:28px 32px; text-align:center; }}
    .header-logo {{ display:inline-flex; align-items:center; gap:10px; margin-bottom:6px; }}
    .header-icon {{ width:40px; height:40px; background:rgba(14,165,233,.2); border-radius:50%; display:inline-flex; align-items:center; justify-content:center; }}
    .header-name {{ font-size:18px; font-weight:700; color:#ffffff; letter-spacing:-.3px; }}
    .header-tagline {{ font-size:11px; color:rgba(255,255,255,.4); letter-spacing:.08em; text-transform:uppercase; }}

    /* ── Status badge ── */
    .status-band {{ background:{accent_color}; padding:14px 32px; text-align:center; }}
    .status-badge {{ display:inline-block; background:rgba(255,255,255,.18); color:#ffffff; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.14em; padding:4px 14px; border-radius:20px; }}

    /* ── Body ── */
    .body {{ background:#ffffff; padding:32px; }}
    .greeting {{ font-size:22px; font-weight:700; color:#0f172a; margin-bottom:6px; line-height:1.3; }}
    .subtext {{ font-size:14px; color:#475569; line-height:1.7; margin-bottom:24px; }}

    /* ── Order card ── */
    .order-card {{ background:#f8fafc; border:1.5px solid #e2e8f0; border-radius:12px; padding:18px 20px; margin-bottom:24px; }}
    .order-card-title {{ font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.12em; color:#94a3b8; margin-bottom:12px; }}
    .order-row {{ display:flex; justify-content:space-between; align-items:flex-start; padding:5px 0; border-bottom:1px solid #f1f5f9; }}
    .order-row:last-child {{ border-bottom:none; padding-bottom:0; }}
    .order-key {{ font-size:12px; color:#64748b; }}
    .order-val {{ font-size:12px; font-weight:600; color:#0f172a; text-align:right; max-width:55%; }}

    /* ── Highlight number ── */
    .order-number-big {{ text-align:center; background:linear-gradient(135deg,{VFL_DARK} 0%,#1e3a5f 100%); border-radius:10px; padding:14px; margin-bottom:20px; }}
    .order-number-label {{ font-size:10px; color:rgba(255,255,255,.5); text-transform:uppercase; letter-spacing:.12em; margin-bottom:4px; }}
    .order-number-value {{ font-size:20px; font-weight:700; color:{VFL_ACCENT}; font-family:monospace; letter-spacing:.04em; }}

    /* ── CTA Button ── */
    .cta-wrap {{ text-align:center; margin:24px 0 20px; }}
    .cta-btn {{ display:inline-block; background:{accent_color}; color:#ffffff !important; text-decoration:none; font-size:13px; font-weight:700; padding:13px 28px; border-radius:50px; letter-spacing:.04em; }}

    /* ── Info boxes ── */
    .info-box {{ border-left:3px solid {accent_color}; background:#f8fafc; padding:12px 16px; border-radius:0 8px 8px 0; margin-bottom:18px; font-size:13px; color:#475569; line-height:1.6; }}
    .tip-box {{ background:{VFL_LIGHT}; border:1px solid {VFL_ACCENT}30; border-radius:10px; padding:14px 16px; margin-bottom:18px; font-size:12px; color:#0369a1; line-height:1.6; }}

    /* ── Steps ── */
    .steps {{ display:flex; flex-direction:column; gap:10px; margin-bottom:24px; }}
    .step {{ display:flex; align-items:flex-start; gap:12px; }}
    .step-num {{ width:26px; height:26px; min-width:26px; background:{accent_color}; color:#fff; border-radius:50%; font-size:11px; font-weight:700; display:flex; align-items:center; justify-content:center; margin-top:1px; }}
    .step-text {{ font-size:13px; color:#334155; line-height:1.55; }}

    /* ── Footer ── */
    .footer {{ background:#f8fafc; border-radius:0 0 16px 16px; border-top:1px solid #e2e8f0; padding:24px 32px; text-align:center; }}
    .footer-name {{ font-size:13px; font-weight:700; color:#334155; margin-bottom:4px; }}
    .footer-address {{ font-size:11px; color:#94a3b8; margin-bottom:10px; line-height:1.5; }}
    .footer-links {{ font-size:11px; color:#94a3b8; }}
    .footer-links a {{ color:{VFL_BLUE}; text-decoration:none; }}
    .footer-divider {{ height:1px; background:#e2e8f0; margin:14px 0; }}
    .footer-legal {{ font-size:10px; color:#cbd5e1; line-height:1.5; }}

    /* ── Responsive ── */
    @media (max-width:600px) {{
      .body {{ padding:22px 18px; }}
      .header {{ padding:22px 18px; }}
      .footer {{ padding:18px; }}
      .greeting {{ font-size:18px; }}
    }}
  </style>
</head>
<body>
  <div class="email-wrapper">
    <div class="email-container">

      <!-- Header -->
      <div class="header">
        <div class="header-logo">
          <div class="header-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M3 3h18v18H3V3z" rx="3" stroke="{VFL_ACCENT}" stroke-width="1.5" fill="none"/>
              <circle cx="12" cy="12" r="5" stroke="{VFL_ACCENT}" stroke-width="1.5" fill="none"/>
              <circle cx="12" cy="12" r="2" fill="{VFL_ACCENT}"/>
            </svg>
          </div>
          <span class="header-name">{BUSINESS_NAME}</span>
        </div>
        <div class="header-tagline">Fresh · Clean · Delivered</div>
      </div>

      {content_html}

      <!-- Footer -->
      <div class="footer">
        <div class="footer-name">{BUSINESS_NAME}</div>
        <div class="footer-address">{BUSINESS_ADDRESS}{(' · ' + BUSINESS_PHONE_DISPLAY) if BUSINESS_PHONE_DISPLAY else ''}</div>
        <div class="footer-links">
          <a href="{BUSINESS_WEBSITE}">{BUSINESS_WEBSITE}</a>
        </div>
        <div class="footer-divider"></div>
        <div class="footer-legal">
          Has recibido este mensaje porque tienes una orden activa con {BUSINESS_NAME}.<br>
          Si tienes preguntas, contáctanos directamente.
        </div>
      </div>

    </div>
  </div>
</body>
</html>"""


# ─────────────────────────────────────────────────────────────────────────────
# Builders HTML por evento
# ─────────────────────────────────────────────────────────────────────────────

def _html_order_created(name: str, order_number: str, pickup_date: Optional[str],
                         pickup_window: Optional[str], is_es: bool) -> str:
    if is_es:
        greeting   = f"¡Tu orden fue programada!"
        sub        = f"Hola {name}, recibimos tu solicitud y la hemos registrado con éxito. Pronto nos pondremos en contacto para confirmar tu pickup."
        steps_html = """
        <div class="steps">
          <div class="step"><div class="step-num">1</div><div class="step-text"><strong>Confirmación</strong> — Te contactaremos para confirmar el horario de pickup.</div></div>
          <div class="step"><div class="step-num">2</div><div class="step-text"><strong>Recogida</strong> — Pasamos por tu ropa en la fecha acordada.</div></div>
          <div class="step"><div class="step-num">3</div><div class="step-text"><strong>Lavado premium</strong> — Procesamos tu ropa con cuidado.</div></div>
          <div class="step"><div class="step-num">4</div><div class="step-text"><strong>Entrega</strong> — Te devolvemos todo limpio y fresco.</div></div>
        </div>"""
        tip        = "💡 Si necesitas hacer algún cambio en tu orden, contáctanos lo antes posible."
        badge_txt  = "Orden Programada"
        accent     = VFL_BLUE
    else:
        greeting   = "Your order has been scheduled!"
        sub        = f"Hi {name}, we received your request and registered it successfully. We'll reach out shortly to confirm your pickup."
        steps_html = """
        <div class="steps">
          <div class="step"><div class="step-num">1</div><div class="step-text"><strong>Confirmation</strong> — We'll contact you to confirm the pickup schedule.</div></div>
          <div class="step"><div class="step-num">2</div><div class="step-text"><strong>Pickup</strong> — We'll collect your laundry on the agreed date.</div></div>
          <div class="step"><div class="step-num">3</div><div class="step-text"><strong>Premium wash</strong> — We process your clothes with care.</div></div>
          <div class="step"><div class="step-num">4</div><div class="step-text"><strong>Delivery</strong> — We return everything clean and fresh.</div></div>
        </div>"""
        tip        = "💡 If you need to make changes to your order, please contact us as soon as possible."
        badge_txt  = "Order Scheduled"
        accent     = VFL_BLUE

    date_row = ""
    if pickup_date:
        label = "Fecha de pickup" if is_es else "Pickup date"
        date_row = f'<div class="order-row"><span class="order-key">{label}</span><span class="order-val">{pickup_date}{(" · " + pickup_window) if pickup_window else ""}</span></div>'

    content = f"""
      <div class="status-band" style="background:{accent}">
        <span class="status-badge">{badge_txt}</span>
      </div>
      <div class="body">
        <div class="order-number-big">
          <div class="order-number-label">{'Número de orden' if is_es else 'Order number'}</div>
          <div class="order-number-value">#{order_number}</div>
        </div>
        <div class="greeting">{greeting}</div>
        <p class="subtext">{sub}</p>
        <div class="order-card">
          <div class="order-card-title">{'Detalle de la orden' if is_es else 'Order details'}</div>
          <div class="order-row">
            <span class="order-key">{'Orden' if is_es else 'Order'}</span>
            <span class="order-val">#{order_number}</span>
          </div>
          {date_row}
          <div class="order-row">
            <span class="order-key">{'Estado' if is_es else 'Status'}</span>
            <span class="order-val" style="color:{accent}">{'Programada ✓' if is_es else 'Scheduled ✓'}</span>
          </div>
        </div>
        {steps_html}
        <div class="tip-box">{tip}</div>
      </div>"""
    return _html_base(content, accent)


# ── UPDATED: _html_pickup_confirmed ──────────────────────────────────────────
def _html_pickup_confirmed(name: str, order_number: str, pickup_date: Optional[str],
                            pickup_window: Optional[str], is_es: bool) -> str:
    accent = VFL_BLUE
    if is_es:
        greeting    = "¡Tu recolección ha sido programada! 🚚"
        _date_str   = f" para el {pickup_date}" if pickup_date else ""
        _phone_line = (f"<br>Si tienes alguna pregunta o necesitas hacer algún cambio, "
                       f"puedes contactarnos al {BUSINESS_PHONE_DISPLAY}.") if BUSINESS_PHONE_DISPLAY else ""
        sub         = (f"Hola {name}, tu recolección ha sido programada correctamente{_date_str}."
                       f"<br>Estaremos llegando a tu dirección en el horario programado."
                       f"{_phone_line}"
                       f"<br>¡Gracias por tu preferencia!")
        tip         = "🔔 Asegúrate de tener tu ropa lista en bolsas antes de nuestra llegada."
        badge_txt   = "Recolección Programada"
        date_label  = "Fecha de pickup"; window_label = "Ventana de tiempo"
        status_label = "Estado"; confirmed_label = "Confirmado ✓"
    else:
        greeting    = "Your pickup has been successfully scheduled! 🚚"
        _date_str   = f" for {pickup_date}" if pickup_date else ""
        _phone_line = (f"<br>If you have any questions or need to make changes, "
                       f"feel free to contact us at {BUSINESS_PHONE_DISPLAY}.") if BUSINESS_PHONE_DISPLAY else ""
        sub         = (f"Hi {name}, your pickup has been successfully scheduled{_date_str}."
                       f"<br>We will arrive at your address during the scheduled time."
                       f"{_phone_line}"
                       f"<br>Thank you for choosing us!")
        tip         = "🔔 Make sure your laundry is ready in bags before our arrival."
        badge_txt   = "Pickup Scheduled"
        date_label  = "Pickup date"; window_label = "Time window"
        status_label = "Status"; confirmed_label = "Confirmed ✓"

    date_rows = ""
    if pickup_date:
        date_rows += f'<div class="order-row"><span class="order-key">{date_label}</span><span class="order-val">{pickup_date}</span></div>'
    if pickup_window:
        date_rows += f'<div class="order-row"><span class="order-key">{window_label}</span><span class="order-val">{pickup_window}</span></div>'

    content = f"""
      <div class="status-band" style="background:{accent}">
        <span class="status-badge">{badge_txt}</span>
      </div>
      <div class="body">
        <div class="greeting">{greeting}</div>
        <p class="subtext">{sub}</p>
        <div class="order-card">
          <div class="order-card-title">{'Detalle' if is_es else 'Details'}</div>
          {date_rows}
          <div class="order-row">
            <span class="order-key">{status_label}</span>
            <span class="order-val" style="color:{accent}">{confirmed_label}</span>
          </div>
        </div>
        <div class="tip-box">{tip}</div>
      </div>"""
    return _html_base(content, accent)


def _html_processing(name: str, order_number: str, is_es: bool) -> str:
    accent = VFL_WARN
    if is_es:
        greeting  = "Tu ropa está en proceso 🧺"
        sub       = f"Hola {name}, ya tenemos tu ropa y la estamos procesando con todo el cuidado que merece."
        tip       = "⏱ El tiempo promedio de proceso es de 24-48 horas. Te notificaremos cuando esté lista."
        badge_txt = "En Proceso"
    else:
        greeting  = "Your laundry is being processed 🧺"
        sub       = f"Hi {name}, we have your laundry and we're processing it with all the care it deserves."
        tip       = "⏱ Average processing time is 24-48 hours. We'll notify you when it's ready."
        badge_txt = "Processing"

    content = f"""
      <div class="status-band" style="background:{accent}">
        <span class="status-badge">{badge_txt}</span>
      </div>
      <div class="body">
        <div class="greeting">{greeting}</div>
        <p class="subtext">{sub}</p>
        <div class="info-box" style="border-left-color:{accent}">
          {'🔬 Separamos, verificamos y procesamos cada prenda siguiendo las instrucciones de cuidado.' if is_es else '🔬 We sort, inspect, and process each garment following care instructions.'}
        </div>
        <div class="tip-box">{tip}</div>
      </div>"""
    return _html_base(content, accent)


def _html_ready(name: str, order_number: str, service_type: str, is_es: bool) -> str:
    accent = VFL_SUCCESS
    is_pickup_delivery = "pickup" in service_type or "delivery" in service_type

    if is_es:
        if is_pickup_delivery:
            greeting = "¡Tu ropa está lista para entrega! ✨"
            sub      = f"Hola {name}, tu ropa está lista. Pronto la enviaremos a tu dirección."
            tip      = "📦 Tu entrega será asignada a un conductor en breve."
        else:
            greeting = "¡Tu ropa está lista para recoger! ✨"
            sub      = f"Hola {name}, tu ropa está lista y te esperamos. Pasa cuando gustes."
            tip      = "🏪 Tenemos tu ropa lista. Preséntate en nuestra tienda para recogerla."
        badge_txt = "¡Lista!"
    else:
        if is_pickup_delivery:
            greeting = "Your laundry is ready for delivery! ✨"
            sub      = f"Hi {name}, your laundry is ready. We'll deliver it to your address soon."
            tip      = "📦 Your delivery will be assigned to a driver shortly."
        else:
            greeting = "Your laundry is ready for pickup! ✨"
            sub      = f"Hi {name}, your laundry is ready and waiting for you. Stop by whenever you'd like."
            tip      = "🏪 Your laundry is ready. Come to our store to pick it up."
        badge_txt = "Ready!"

    content = f"""
      <div class="status-band" style="background:{accent}">
        <span class="status-badge">{badge_txt}</span>
      </div>
      <div class="body">
        <div class="greeting">{greeting}</div>
        <p class="subtext">{sub}</p>
        <div class="info-box" style="border-left-color:{accent}">
          {'✅ Toda tu ropa fue lavada, secada y doblada/colgada según tus preferencias.' if is_es else '✅ All your garments have been washed, dried, and folded/hung per your preferences.'}
        </div>
        <div class="tip-box">{tip}</div>
      </div>"""
    return _html_base(content, accent)


def _html_out_for_delivery(name: str, order_number: str, is_es: bool) -> str:
    accent = VFL_BLUE
    if is_es:
        greeting  = "¡Tu entrega está en camino! 🚚💨"
        sub       = f"Hola {name}, tu ropa está en camino. Asegúrate de estar disponible para recibirla."
        tip       = "📱 Si necesitas reajustar el horario, contáctanos de inmediato."
        badge_txt = "En Camino"
    else:
        greeting  = "Your delivery is on the way! 🚚💨"
        sub       = f"Hi {name}, your laundry is on its way. Make sure you're available to receive it."
        tip       = "📱 If you need to adjust the delivery time, contact us immediately."
        badge_txt = "Out for Delivery"

    content = f"""
      <div class="status-band" style="background:{accent}">
        <span class="status-badge">{badge_txt}</span>
      </div>
      <div class="body">
        <div class="greeting">{greeting}</div>
        <p class="subtext">{sub}</p>
        <div class="info-box" style="border-left-color:{accent}">
          {'🗺️ Tu conductor está en ruta. Por favor ten listo el acceso a tu dirección.' if is_es else '🗺️ Your driver is en route. Please ensure access to your address is clear.'}
        </div>
        <div class="tip-box">{tip}</div>
      </div>"""
    return _html_base(content, accent)


def _html_delivered(name: str, order_number: str, order_total: Optional[float], is_es: bool) -> str:
    accent = VFL_SUCCESS
    total_row = ""
    if order_total:
        label = "Total del servicio" if is_es else "Service total"
        total_row = f'<div class="order-row"><span class="order-key">{label}</span><span class="order-val">${order_total:.2f}</span></div>'

    if is_es:
        greeting  = "¡Entrega completada! 🎉"
        sub       = f"Hola {name}, tu ropa fue entregada con éxito. Esperamos que estés satisfecho con nuestro servicio."
        tip       = "⭐ ¿Te gustó el servicio? ¡Comparte tu experiencia con amigos y familia!"
        badge_txt = "Entregado"
    else:
        greeting  = "Delivery completed! 🎉"
        sub       = f"Hi {name}, your laundry has been successfully delivered. We hope you're happy with our service."
        tip       = "⭐ Did you enjoy the service? Share your experience with friends and family!"
        badge_txt = "Delivered"

    content = f"""
      <div class="status-band" style="background:{accent}">
        <span class="status-badge">{badge_txt}</span>
      </div>
      <div class="body">
        <div class="greeting">{greeting}</div>
        <p class="subtext">{sub}</p>
        {'<div class="order-card"><div class="order-card-title">Resumen</div>' + total_row + '</div>' if total_row else ''}
        <div class="tip-box">{tip}</div>
      </div>"""
    return _html_base(content, accent)


def _html_cancelled(name: str, order_number: str, is_es: bool) -> str:
    accent = VFL_DANGER
    if is_es:
        greeting  = "Tu orden fue cancelada"
        sub       = f"Hola {name}, tu orden #{order_number} ha sido cancelada. Si fue un error o necesitas reagendar, contáctanos."
        tip       = "📞 Estamos aquí para ayudarte a reagendar cuando lo necesites."
        badge_txt = "Cancelada"
    else:
        greeting  = "Your order has been cancelled"
        sub       = f"Hi {name}, your order #{order_number} has been cancelled. If this was a mistake or you'd like to reschedule, please contact us."
        tip       = "📞 We're here to help you reschedule whenever you're ready."
        badge_txt = "Cancelled"

    content = f"""
      <div class="status-band" style="background:{accent}">
        <span class="status-badge">{badge_txt}</span>
      </div>
      <div class="body">
        <div class="order-number-big">
          <div class="order-number-label">{'Número de orden' if is_es else 'Order number'}</div>
          <div class="order-number-value">#{order_number}</div>
        </div>
        <div class="greeting">{greeting}</div>
        <p class="subtext">{sub}</p>
        <div class="tip-box">{tip}</div>
      </div>"""
    return _html_base(content, accent)


def _html_store_order(name: str, order_number: str, order_total: Optional[float],
                       shipping_fee: Optional[float], is_es: bool) -> str:
    accent = VFL_BLUE
    total_row = shipping_row = ""
    if shipping_fee:
        label = "Costo de envío" if is_es else "Shipping fee"
        shipping_row = f'<div class="order-row"><span class="order-key">{label}</span><span class="order-val">${shipping_fee:.2f}</span></div>'
    if order_total:
        label = "Total" if is_es else "Total"
        total_row = f'<div class="order-row"><span class="order-key" style="font-weight:700">{label}</span><span class="order-val" style="font-weight:700;color:{accent}">${order_total:.2f}</span></div>'

    if is_es:
        greeting  = f"¡Compra confirmada! 🛍️"
        sub       = f"Hola {name}, recibimos tu orden de tienda #{order_number} y ya la estamos preparando."
        tip       = "📦 Te notificaremos cuando tu pedido esté listo para recoger o en camino."
        badge_txt = "Orden de Tienda"
    else:
        greeting  = f"Store order confirmed! 🛍️"
        sub       = f"Hi {name}, we received your store order #{order_number} and we're getting it ready."
        tip       = "📦 We'll notify you when your order is ready for pickup or on its way."
        badge_txt = "Store Order"

    content = f"""
      <div class="status-band" style="background:{accent}">
        <span class="status-badge">{badge_txt}</span>
      </div>
      <div class="body">
        <div class="order-number-big">
          <div class="order-number-label">{'Número de orden' if is_es else 'Order number'}</div>
          <div class="order-number-value">#{order_number}</div>
        </div>
        <div class="greeting">{greeting}</div>
        <p class="subtext">{sub}</p>
        {'<div class="order-card"><div class="order-card-title">Resumen de compra</div>' + shipping_row + total_row + '</div>' if (shipping_row or total_row) else ''}
        <div class="tip-box">{tip}</div>
      </div>"""
    return _html_base(content, accent)


def _html_wash_fold_ready(name: str, order_number: str, is_es: bool) -> str:
    return _html_ready(name, order_number, "wash_fold", is_es)


def _html_completed(name: str, order_number: str, order_total: Optional[float], is_es: bool) -> str:
    accent = VFL_SUCCESS
    total_row = ""
    if order_total:
        label = "Total del servicio" if is_es else "Service total"
        total_row = f'<div class="order-row"><span class="order-key" style="font-weight:700">{label}</span><span class="order-val" style="font-weight:700;color:{accent}">${order_total:.2f}</span></div>'

    if is_es:
        greeting  = "Servicio completado — ¡Gracias! 🙏"
        sub       = f"Hola {name}, tu servicio está completo. Fue un placer cuidar de tu ropa."
        tip       = "❤️ Esperamos verte de nuevo. ¡Recomiéndanos con familia y amigos!"
        badge_txt = "Completado"
    else:
        greeting  = "Service completed — Thank you! 🙏"
        sub       = f"Hi {name}, your service is complete. It was a pleasure taking care of your laundry."
        tip       = "❤️ We hope to see you again. Recommend us to family and friends!"
        badge_txt = "Completed"

    content = f"""
      <div class="status-band" style="background:{accent}">
        <span class="status-badge">{badge_txt}</span>
      </div>
      <div class="body">
        <div class="greeting">{greeting}</div>
        <p class="subtext">{sub}</p>
        {'<div class="order-card"><div class="order-card-title">Resumen</div>' + total_row + '</div>' if total_row else ''}
        <div class="tip-box">{tip}</div>
      </div>"""
    return _html_base(content, accent)


# ─────────────────────────────────────────────────────────────────────────────
# ███████╗███╗   ███╗███████╗    SMS / WHATSAPP
# ─────────────────────────────────────────────────────────────────────────────

def _sms(event: str, name: str, order_number: str, language: str,
         pickup_date: Optional[str] = None, pickup_window: Optional[str] = None,
         order_total: Optional[float] = None) -> str:
    """
    Mensajes SMS/WhatsApp ricos con emojis, estructura clara y tono cálido.
    Sin exceder ~320 caracteres para evitar fragmentación en algunos carriers.
    """
    is_es = str(language).lower().startswith("es")
    biz = BUSINESS_NAME
    n = name or ("Cliente" if is_es else "Customer")

    # Cada rama retorna directamente el string del mensaje
    if event == "order_created":
        if is_es:
            date_str = f"\n📅 Pickup: {pickup_date}" + (f" ({pickup_window})" if pickup_window else "") if pickup_date else ""
            return f"🫧 *{biz}*\n\n¡Hola {n}! Tu orden *#{order_number}* fue programada.{date_str}\n\nTe contactaremos para confirmar. ¡Gracias! 🙌"
        else:
            date_str = f"\n📅 Pickup: {pickup_date}" + (f" ({pickup_window})" if pickup_window else "") if pickup_date else ""
            return f"🫧 *{biz}*\n\nHi {n}! Your order *#{order_number}* has been scheduled.{date_str}\n\nWe'll confirm soon. Thank you! 🙌"

    # ── UPDATED: pickup_confirmed ─────────────────────────────────────────────
    if event == "pickup_confirmed":
        if is_es:
            _date_line  = f"\n📅 {pickup_date}" + (f" · {pickup_window}" if pickup_window else "") if pickup_date else ""
            _phone_line = f"\n📞 {BUSINESS_PHONE_DISPLAY}" if BUSINESS_PHONE_DISPLAY else ""
            return (f"🚚 *{biz}*\n\n"
                    f"Hola {n}, tu recolección ha sido programada correctamente{_date_line}.\n"
                    f"Estaremos llegando a tu dirección en el horario programado.{_phone_line}\n"
                    f"¡Gracias por tu preferencia!")
        else:
            _date_line  = f"\n📅 {pickup_date}" + (f" · {pickup_window}" if pickup_window else "") if pickup_date else ""
            _phone_line = f"\n📞 {BUSINESS_PHONE_DISPLAY}" if BUSINESS_PHONE_DISPLAY else ""
            return (f"🚚 *{biz}*\n\n"
                    f"Hi {n}, your pickup has been successfully scheduled{_date_line}.\n"
                    f"We will arrive at your address during the scheduled time.{_phone_line}\n"
                    f"Thank you for choosing us!")

    if event in {"order_received", "processing"}:
        if is_es:
            return f"🧺 *{biz}*\n\nHola {n}, ya tenemos tu ropa y la estamos procesando con cuidado.\n\n⏱ Te avisamos cuando esté lista."
        return f"🧺 *{biz}*\n\nHi {n}, we have your laundry and it's being carefully processed.\n\n⏱ We'll let you know when it's ready."

    if event == "ready":
        if is_es:
            return f"✨ *{biz}*\n\n¡Hola {n}! Tu ropa está *LISTA* y en camino pronto. 🛵\n\nGracias por confiar en nosotros."
        return f"✨ *{biz}*\n\nHi {n}! Your laundry is *READY* and will be on its way soon. 🛵\n\nThank you for trusting us."

    if event == "ready_for_pickup":
        if is_es:
            return f"✅ *{biz}*\n\n¡Hola {n}! Tu ropa está lista para recoger en nuestra tienda.\n\n🏪 ¡Te esperamos cuando puedas pasar!"
        return f"✅ *{biz}*\n\nHi {n}! Your laundry is ready for pickup at our store.\n\n🏪 We look forward to seeing you!"

    if event == "out_for_delivery":
        if is_es:
            return f"🚚 *{biz}*\n\n¡Hola {n}! Tu entrega va *EN CAMINO* ahora mismo. 💨\n\nPor favor mantente disponible para recibirla."
        return f"🚚 *{biz}*\n\nHi {n}! Your delivery is *ON THE WAY* right now. 💨\n\nPlease be available to receive it."

    if event == "delivered":
        total_str = f"\n💰 Total: ${order_total:.2f}" if order_total else ""
        if is_es:
            return f"🎉 *{biz}*\n\n¡Hola {n}! Tu entrega fue *COMPLETADA* con éxito. ✓{total_str}\n\n¡Gracias! Esperamos verte pronto. ❤️"
        return f"🎉 *{biz}*\n\nHi {n}! Your delivery has been *COMPLETED* successfully. ✓{total_str}\n\nThank you! We hope to see you soon. ❤️"

    if event == "completed":
        total_str = f"\n💰 Total: ${order_total:.2f}" if order_total else ""
        if is_es:
            return f"🙏 *{biz}*\n\nHola {n}, tu servicio está *COMPLETO*.{total_str}\n\nFue un placer cuidar de tu ropa. ¡Hasta pronto!"
        return f"🙏 *{biz}*\n\nHi {n}, your service is *COMPLETE*.{total_str}\n\nIt was a pleasure caring for your laundry. See you soon!"

    if event == "cancelled":
        if is_es:
            return f"❌ *{biz}*\n\nHola {n}, tu orden *#{order_number}* fue cancelada.\n\n¿Necesitas reagendar? Contáctanos, con gusto te ayudamos. 📞"
        return f"❌ *{biz}*\n\nHi {n}, your order *#{order_number}* was cancelled.\n\nNeed to reschedule? Contact us, we're happy to help. 📞"

    if event == "store_order":
        total_str = f" · Total: ${order_total:.2f}" if order_total else ""
        if is_es:
            return f"🛍️ *{biz}*\n\n¡Hola {n}! Recibimos tu orden *#{order_number}*{total_str}.\n\nTe avisamos cuando esté lista. ¡Gracias!"
        return f"🛍️ *{biz}*\n\nHi {n}! We received your order *#{order_number}*{total_str}.\n\nWe'll let you know when it's ready. Thank you!"

    # Fallback genérico
    if is_es:
        return f"🫧 *{biz}*\n\nHola {n}, hay una actualización en tu servicio. Contáctanos si tienes preguntas."
    return f"🫧 *{biz}*\n\nHi {n}, there's an update on your service. Contact us if you have questions."


# ─────────────────────────────────────────────────────────────────────────────
# VOICE (TwiML)
# ─────────────────────────────────────────────────────────────────────────────

def _voice(event: str, name: str, order_number: str, language: str) -> str:
    """Mensaje de voz natural para llamadas TwiML."""
    is_es = str(language).lower().startswith("es")
    biz   = BUSINESS_NAME
    n     = name or ("estimado cliente" if is_es else "valued customer")

    scripts = {
        "order_created": (
            f"Hola {n}, llamamos de {biz} para confirmar que recibimos tu orden número {order_number}. Pronto nos pondremos en contacto. ¡Hasta luego!",
            f"Hi {n}, this is {biz} calling to confirm we received your order number {order_number}. We'll be in touch soon. Goodbye!"
        ),
        "pickup_confirmed": (
            f"Hola {n}, tu recolección con {biz} ha sido programada correctamente. Estaremos en tu domicilio en el horario acordado. Te recomendamos tener tu ropa lista para agilizar el servicio. ¡ Gracias por confiar en nosotros, hasta pronto!",
            f"Hi {n}, your pickup with {biz} has been successfully scheduled.  We will arrive at your address during the scheduled time. We recommend having your laundry ready to ensure a smooth service. Thank you for choosing us, Goodbye!"
        ),
        "ready": (
            f"Hola {n}, tu ropa con {biz} está lista pronto estará en camino hacia tu domicilio. Gracias por confiar en nosotros!",
            f"Hi {n}, your laundry with {biz} is ready It will be on its way to your address shortly. Thank you for trusting us!"
        ),
        "out_for_delivery": (
            f"Hola {n}, tu entrega de {biz} está en camino en este momento. Llegaremos a tu domicilio en breve.  Agradecemos tu preferencia!",
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
        # ── Nuevas entradas para wash & fold ──
        "order_received": (
            "Hola, le habla Ventura Fresh Laundry. Solo para confirmarle que hemos recibido su orden y pronto será procesada con el máximo cuidado. Le avisaremos en cuanto esté lista. Gracias por confiar en nosotros.",
            "Hello, this is Ventura Fresh Laundry. We’re calling to confirm that your order has been received and will be processed shortly with the utmost care. We’ll notify you as soon as it’s ready. Thank you for trusting us."
        ),
        "ready_for_pickup": (
            "Hola, le habla Ventura Fresh Laundry. Nos complace informarle que su orden ya está lista. Gracias por permitirnos cuidar de su ropa — estamos para servirle.",
            "Hello, this is Ventura Fresh Laundry. We’re pleased to let you know that your order is now ready. Thank you for allowing us to care for your garments — we’re here for you."
        ),
        "completed": (
            "Hola, le habla Ventura Fresh Laundry. Le confirmamos que su orden ha sido completada exitosamente. Ha sido un placer atenderle — esperamos verle nuevamente muy pronto.",
            "Hello, this is Ventura Fresh Laundry. We’re calling to confirm that your order has been completed successfully. It’s been a pleasure serving you — we look forward to seeing you again soon."
        ),
    }
    es_script, en_script = scripts.get(event, (
        f"Hola {n}, tienes una actualización de tu servicio con {biz}. Por favor contáctanos. ¡Hasta luego!",
        f"Hi {n}, you have a service update from {biz}. Please contact us. Goodbye!"
    ))
    return es_script if is_es else en_script

# ─────────────────────────────────────────────────────────────────────────────
# BUILDER PRINCIPAL — retorna subject, html, sms, voice_text
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
) -> dict:
    """
    Retorna un dict con:
      - subject:    asunto del email
      - message:    texto plano (SMS / WhatsApp / fallback)
      - html:       HTML completo para email
      - voice_text: texto para llamada de voz
    """
    is_es = str(language).lower().startswith("es")
    name  = customer_name or ("Cliente" if is_es else "Customer")
    svc   = normalize_status_value(service_type or "pickup_delivery")

    # Subjects ES/EN por evento
    subjects = {
        "order_created":    ("Orden programada — " + BUSINESS_NAME,           "Order scheduled — " + BUSINESS_NAME),
        "order_received":   ("Orden recibida — " + BUSINESS_NAME,              "Order received — " + BUSINESS_NAME),
        "pickup_confirmed": ("Recolección programada ✓ — " + BUSINESS_NAME,    "Pickup scheduled ✓ — " + BUSINESS_NAME),
        "processing":       ("Tu ropa está en proceso — " + BUSINESS_NAME,     "Your laundry is processing — " + BUSINESS_NAME),
        "ready":            ("¡Tu ropa está lista! — " + BUSINESS_NAME,        "Your laundry is ready! — " + BUSINESS_NAME),
        "ready_for_pickup": ("Lista para recoger — " + BUSINESS_NAME,          "Ready for pickup — " + BUSINESS_NAME),
        "out_for_delivery": ("En camino 🚚 — " + BUSINESS_NAME,                "Out for delivery 🚚 — " + BUSINESS_NAME),
        "delivered":        ("Entrega completada ✓ — " + BUSINESS_NAME,        "Delivery completed ✓ — " + BUSINESS_NAME),
        "completed":        ("Servicio completado ✓ — " + BUSINESS_NAME,       "Service completed ✓ — " + BUSINESS_NAME),
        "cancelled":        ("Orden cancelada — " + BUSINESS_NAME,             "Order cancelled — " + BUSINESS_NAME),
        "store_order":      ("Compra confirmada 🛍️ — " + BUSINESS_NAME,        "Purchase confirmed 🛍️ — " + BUSINESS_NAME),
    }
    es_subj, en_subj = subjects.get(event, ("Actualización de orden", "Order update"))
    subject = es_subj if is_es else en_subj

    # Build HTML
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
    }
    html = html_builders.get(event, lambda: _html_base(
        f'<div class="status-band" style="background:{VFL_BLUE}"><span class="status-badge">Update</span></div>'
        f'<div class="body"><div class="greeting">{"Actualización" if is_es else "Update"}</div>'
        f'<p class="subtext">{"Hola " + name + ", tienes una actualización de tu servicio." if is_es else "Hi " + name + ", you have a service update."}</p></div>',
        VFL_BLUE
    ))()

    # Build SMS/WhatsApp message
    sms_message = _sms(event, name, order_number, language, pickup_date, pickup_window, order_total)

    # Build voice script
    voice_text = _voice(event, name, order_number, language)

    return {
        "subject":    subject,
        "message":    sms_message,      # usado en SMS, WhatsApp, llamada (texto plano)
        "html":       html,             # usado en email
        "voice_text": voice_text,       # usado en llamada de voz
    }


# ─────────────────────────────────────────────────────────────────────────────
# Send functions con reintentos (idénticas a la versión original)
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
        logger.warning("Twilio not configured for SMS"); return False
    formatted = format_phone(to_phone)
    if not formatted: logger.error("Invalid phone"); return False
    async def _send():
        return await asyncio.to_thread(twilio_client.messages.create,
                                        body=message, from_=TWILIO_PHONE_NUMBER, to=formatted)
    ok, res = await _send_with_retries(_send)
    if ok: logger.info(f"SMS sent: {res.sid}"); return True
    logger.error(f"SMS failed: {res}"); return False

async def send_whatsapp(to_phone: str, message: str) -> bool:
    if not twilio_client or not TWILIO_WHATSAPP_NUMBER:
        logger.warning("Twilio not configured for WhatsApp"); return False
    formatted = format_whatsapp(to_phone)
    if not formatted: logger.error("Invalid phone"); return False
    async def _send():
        return await asyncio.to_thread(twilio_client.messages.create,
                                        body=message, from_=TWILIO_WHATSAPP_NUMBER, to=formatted)
    ok, res = await _send_with_retries(_send)
    if ok: logger.info(f"WhatsApp sent: {res.sid}"); return True
    logger.error(f"WhatsApp failed: {res}"); return False

async def send_voice_call(to_phone: str, message: str, language: str) -> bool:
    if not twilio_client or not TWILIO_PHONE_NUMBER:
        logger.warning("Twilio not configured for Voice"); return False
    formatted = format_phone(to_phone)
    if not formatted: logger.error("Invalid phone"); return False
    lang_code = "es-MX" if str(language).lower().startswith("es") else "en-US"
    safe_msg = xml.sax.saxutils.escape(message)
    twiml = f'<Response><Say language="{lang_code}" voice="alice">{safe_msg}</Say></Response>'
    async def _send():
        return await asyncio.to_thread(twilio_client.calls.create,
                                        twiml=twiml, to=formatted, from_=TWILIO_PHONE_NUMBER)
    ok, res = await _send_with_retries(_send)
    if ok: logger.info(f"Call initiated: {res.sid}"); return True
    logger.error(f"Call failed: {res}"); return False

async def send_email(to_email: str, subject: str, body: str, html_body: Optional[str] = None) -> bool:
    if not sendgrid_client or not SENDGRID_FROM_EMAIL:
        logger.warning("SendGrid not configured"); return False
    message = Mail(
        from_email=(SENDGRID_FROM_EMAIL, SENDGRID_FROM_NAME),
        to_emails=to_email,
        subject=subject,
        html_content=html_body or f"<div style='font-family:Arial,sans-serif'>{body}</div>",
        plain_text_content=body,
    )
    async def _send():
        return await asyncio.to_thread(sendgrid_client.send, message)
    ok, res = await _send_with_retries(_send)
    if ok: logger.info(f"Email sent: {res.status_code}"); return res.status_code in [200, 202]
    logger.error(f"Email failed: {res}"); return False


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

    # Mapear evento a hito
    mapped_event = event
    if event == "status_changed":
        status_norm = normalize_status_value(status)
        wf_map = {"ready": "ready_for_pickup", "completed": "completed"}
        pd_map = {"confirmed": "pickup_confirmed", "pickup_scheduled": "pickup_confirmed",
                  "ready": "ready", "out_for_delivery": "out_for_delivery",
                  "delivered": "delivered", "cancelled": "cancelled"}
        mapped_event = (wf_map if flow == "wash_fold" else pd_map).get(status_norm, "status_changed")
    else:
        mapped_event = EVENT_MAPPING.get(event, event)
        if flow == "wash_fold" and event == "order_created":
            mapped_event = "order_received"

    if mapped_event not in MILESTONES.get(flow, set()):
        logger.info(f"Event {mapped_event} not a milestone for {flow}, skipping.")
        return False

    # Datos comunes
    order_number  = order.get("order_number", order.get("id", "N/A"))
    phone         = customer.get("phone")
    email         = customer.get("email")
    language      = detect_language(customer, phone)
    customer_name = customer.get("name") or ""
    include_date  = mapped_event in {"order_created","pickup_scheduled","pickup_reminder",
                                      "pickup_completed","pickup_update","pickup_confirmed"}
    pickup_date   = order.get("pickup_date") if include_date else None
    pickup_window = order.get("pickup_time_window") if include_date else None
    order_total   = order.get("total") or order.get("total_amount")
    shipping_fee  = order.get("shipping_fee")

    # Build messages
    content = build_premium_message(
        event=mapped_event, status=status,
        order_number=order_number, customer_name=customer_name,
        language=language, pickup_date=pickup_date, pickup_window=pickup_window,
        order_total=order_total, shipping_fee=shipping_fee, service_type=service_type,
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

    # Canal
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

    # Idempotencia
    dedupe_key = f"{order.get('id')}:{mapped_event}:{preference}:{language}"
    if _is_already_sent(dedupe_key):
        logger.info(f"Duplicate skipped: {dedupe_key}")
        _log_attempt({"timestamp": datetime.now().isoformat(), "order_id": order.get("id"),
                      "event": mapped_event, "channel": preference, "status": "duplicate_skipped"})
        return True

    # Quiet hours
    if ENFORCE_QUIET_HOURS and is_quiet_hours():
        logger.info(f"Quiet hours, queued: {dedupe_key}")
        _log_attempt({"timestamp": datetime.now().isoformat(), "order_id": order.get("id"),
                      "event": mapped_event, "channel": preference, "status": "queued_quiet_hours"})
        return False

    # Enviar
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

    # Auditoría
    _log_attempt({"timestamp": datetime.now().isoformat(), "order_id": order.get("id"),
                  "event": mapped_event, "channel": preference,
                  "status": "sent" if success else "failed"})
    if success:
        _mark_sent(dedupe_key)
    return success


# ─────────────────────────────────────────────────────────────────────────────
# API pública (misma interfaz que versión original)
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


# ─────────────────────────────────────────────────────────────────────────────
# Groq AI override (igual que versión original)
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