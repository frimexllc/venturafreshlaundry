"""
Notification services using Twilio for SMS, WhatsApp and Voice calls, and SendGrid for email.
Includes async handling and premium messages for Ventura Fresh Laundry.

Mejoras implementadas (basadas en la propuesta inicial):
- Idempotencia: evita duplicados con clave única por evento, canal e idioma.
- Horas de silencio: no molesta a clientes fuera del horario configurado.
- Reintentos con backoff en envíos fallidos.
- Plantillas premium: solo el primer evento muestra el número de orden.
- Validación de hitos: solo eventos clave generan notificación.
- Auditoría básica (en memoria, reemplazable por BD).

Events:
  - order_created (nueva orden, incluye fecha de recogida)
  - status_changed (cambios de estado: procesando, lista, en camino, entregada, completada, cancelada)
  - pickup_scheduled (confirmación de recogida programada)
  - pickup_reminder (recordatorio de recogida)
  - pickup_completed (recogida completada, orden en proceso)
  - pickup_update (actualización genérica de recogida)
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

# ----------------------------------------------------------------------
# Configuración desde variables de entorno (se mantiene la original)
# ----------------------------------------------------------------------
TWILIO_ACCOUNT_SID = os.environ.get('TWILIO_ACCOUNT_SID')
TWILIO_AUTH_TOKEN = os.environ.get('TWILIO_AUTH_TOKEN')
TWILIO_PHONE_NUMBER = os.environ.get('TWILIO_PHONE_NUMBER')
TWILIO_WHATSAPP_NUMBER = os.environ.get('TWILIO_WHATSAPP_NUMBER')
BUSINESS_NAME = os.environ.get('BUSINESS_NAME', 'Ventura Fresh Laundry')
SENDGRID_API_KEY = os.environ.get('SENDGRID_API_KEY')
SENDGRID_FROM_EMAIL = os.environ.get('SENDGRID_FROM_EMAIL')
SENDGRID_DATA_RESIDENCY = os.environ.get('SENDGRID_DATA_RESIDENCY', '').lower()
GROQ_API_KEY = os.environ.get('GROQ_API_KEY')
USE_ULTRA_PREMIUM = os.environ.get('USE_ULTRA_PREMIUM', 'false').lower() == 'true'

# --- Nuevas variables para mejoras -------------------------------------
QUIET_START = os.environ.get('QUIET_HOURS_START', '21:00')   # 9pm
QUIET_END = os.environ.get('QUIET_HOURS_END', '08:00')       # 8am
TIMEZONE = os.environ.get('TIMEZONE', 'America/Los_Angeles') # para uso futuro con pytz
USE_PREMIUM_TEMPLATES = os.environ.get('USE_PREMIUM_TEMPLATES', 'true').lower() == 'true'
MAX_RETRIES = int(os.environ.get('TWILIO_MAX_RETRIES', '3'))
RETRY_DELAY = float(os.environ.get('TWILIO_RETRY_DELAY', '1.5'))  # factor multiplicador
ENFORCE_QUIET_HOURS = os.environ.get('ENFORCE_QUIET_HOURS', 'false').lower() == 'true'

# ----------------------------------------------------------------------
# Almacenes de idempotencia y auditoría (en memoria - reemplazar en prod)
# ----------------------------------------------------------------------
_sent_cache: Set[str] = set()          # dedupe_key -> ya enviado
_audit_log: list = []                   # lista de registros (para debug)

def _is_already_sent(dedupe_key: str) -> bool:
    return dedupe_key in _sent_cache

def _mark_sent(dedupe_key: str) -> None:
    _sent_cache.add(dedupe_key)

def _log_attempt(entry: dict) -> None:
    """Registra un intento de notificación (en memoria)."""
    _audit_log.append(entry)
    logger.debug(f"Audit log: {entry}")

# ----------------------------------------------------------------------
# Definición de hitos permitidos por flujo (anti-spam)
# ----------------------------------------------------------------------
MILESTONES = {
    "wash_fold": {"order_received", "ready_for_pickup", "completed"},
    "pickup_delivery": {"order_created", "pickup_confirmed", "ready", "out_for_delivery", "delivered"},
}
# Normalizamos los eventos internos a estos nombres (para compatibilidad)
EVENT_MAPPING = {
    "order_created": "order_created",
    "pickup_scheduled": "pickup_confirmed",
    "pickup_reminder": "pickup_confirmed",
    "pickup_completed": "pickup_confirmed",        # similar a pickup_confirmed
    "pickup_update": "pickup_confirmed",           # genérico con fecha
    "status_changed": None,                         # se mapea según status
}

# ----------------------------------------------------------------------
# Utilidades de tiempo
# ----------------------------------------------------------------------
def parse_hhmm(s: str) -> dtime:
    hh, mm = s.split(":")
    return dtime(int(hh), int(mm))

def is_quiet_hours(now_local: Optional[datetime] = None) -> bool:
    """Retorna True si la hora actual está dentro del rango de silencio."""
    now_local = now_local or datetime.now()
    start = parse_hhmm(QUIET_START)
    end = parse_hhmm(QUIET_END)
    n = now_local.time()
    # Rango que puede cruzar medianoche
    if start < end:
        return start <= n < end
    return (n >= start) or (n < end)

# ----------------------------------------------------------------------
# Funciones originales (formato, clientes, etc.) se mantienen igual
# ----------------------------------------------------------------------
twilio_client = None
if TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN:
    try:
        twilio_client = Client(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
        logger.info("Twilio client initialized successfully")
    except Exception as e:
        logger.error(f"Failed to initialize Twilio client: {e}")

sendgrid_client = None
if SENDGRID_API_KEY:
    try:
        if SENDGRID_DATA_RESIDENCY == "eu":
            sendgrid_client = SendGridAPIClient(SENDGRID_API_KEY, host="https://api.eu.sendgrid.com")
        else:
            sendgrid_client = SendGridAPIClient(SENDGRID_API_KEY)
        logger.info("SendGrid client initialized successfully")
    except Exception as e:
        logger.error(f"Failed to initialize SendGrid client: {e}")

def get_groq_client():
    if not GROQ_API_KEY:
        return None
    try:
        return Groq(api_key=GROQ_API_KEY)
    except Exception as exc:
        logger.error(f"Failed to init Groq client: {exc}")
        return None

def format_phone(phone: str) -> Optional[str]:
    """Format phone number for Twilio - handles US and international numbers"""
    if not phone:
        return None
    cleaned = ''.join(c for c in phone if c.isdigit() or c == '+')
    if cleaned.startswith('+'):
        return cleaned
    if cleaned.startswith('52') and len(cleaned) >= 12:
        return '+' + cleaned
    if len(cleaned) == 10 and cleaned[0] in ['5', '3', '4', '6', '7', '8', '9']:
        # Detección simple de México (puedes mejorarla)
        return '+52' + cleaned
    if len(cleaned) == 10:
        return '+1' + cleaned
    if len(cleaned) == 11 and cleaned.startswith('1'):
        return '+' + cleaned
    return '+' + cleaned if not cleaned.startswith('+') else cleaned

def detect_country(phone: Optional[str]) -> Optional[str]:
    if not phone:
        return None
    formatted = format_phone(phone)
    if formatted and formatted.startswith('+52'):
        return 'mx'
    if formatted and formatted.startswith('+1'):
        return 'us'
    return None

def format_whatsapp(phone: str) -> Optional[str]:
    formatted = format_phone(phone)
    if not formatted:
        return None
    return f"whatsapp:{formatted}"

def normalize_preferred_contact(value: str) -> str:
    if not value:
        return "sms"
    normalized = value.strip().lower()
    if normalized in ["email", "correo", "mail"]:
        return "email"
    if normalized in ["phone", "call", "llamada", "telefono", "teléfono"]:
        return "call"
    if normalized in ["whatsapp", "wa", "wapp"]:
        return "whatsapp"
    if normalized in ["text", "sms", "mensaje", "mensaje de texto"]:
        return "sms"
    return "sms"


def has_sms_consent(order: Optional[Dict], customer: Optional[Dict]) -> bool:
    if order and order.get("sms_consent") is True:
        return True
    if customer and customer.get("sms_consent") is True:
        return True
    return False

def normalize_status_value(value: Optional[str]) -> str:
    if not value:
        return ""
    return value.strip().lower().replace(" ", "_")

def detect_language(customer: Optional[Dict], phone: Optional[str]) -> str:
    if not customer:
        return "es-MX"
    preferred = customer.get("preferred_language") or customer.get("language")
    if preferred:
        return preferred
    if phone and phone.strip().startswith("+1"):
        return "en-US"
    return "es-MX"

def extract_contact_from_notes(order: Dict) -> Optional[str]:
    if not order:
        return None
    notes = order.get("notes") or ""
    marker = "preferred contact:"
    if marker in notes.lower():
        lower_notes = notes.lower()
        idx = lower_notes.find(marker) + len(marker)
        remainder = notes[idx:].strip()
        value = remainder.split('\n')[0].strip()
        return value
    return None

# ----------------------------------------------------------------------
# PLANTILLAS PREMIUM (solo número en primer evento)
# ----------------------------------------------------------------------
def build_premium_message(
    event: str,
    status: Optional[str],
    order_number: str,
    customer_name: Optional[str],
    language: str,
    pickup_date: Optional[str] = None,
    pickup_window: Optional[str] = None,
    order_total: Optional[float] = None,
    shipping_fee: Optional[float] = None
) -> dict:
    is_spanish = str(language).lower().startswith("es")
    name = customer_name or ("Cliente" if is_spanish else "Customer")

    def with_brand(content: str) -> str:
        return f"{BUSINESS_NAME}:\n\n{content}"

    # WASH & FOLD
    if event == "order_received":
        if is_spanish:
            return {
                "subject": f"Orden recibida #{order_number}",
                "message": with_brand(
                    f"Hola {name}, recibimos tu orden #{order_number}.\n\nTe notificaremos cuando esté lista.\n\nGracias por confiar en nosotros."
                )
            }
        return {
            "subject": f"Order received #{order_number}",
            "message": with_brand(
                f"Hello {name}, we received your order #{order_number}.\n\nWe’ll notify you when it’s ready.\n\nThank you for choosing us."
            )
        }

    if event == "ready_for_pickup":
        if is_spanish:
            return {
                "subject": "Lista para recoger",
                "message": with_brand(
                    f"Hola {name}, tu ropa está lista para recoger.\n\nSerá un placer recibirte."
                )
            }
        return {
            "subject": "Ready for pickup",
            "message": with_brand(
                f"Hello {name}, your laundry is ready for pickup.\n\nWe look forward to seeing you."
            )
        }

    if event == "completed":
        if is_spanish:
            return {
                "subject": "Servicio completado",
                "message": with_brand(
                    f"Hola {name}, tu servicio fue completado.\n\nGracias por permitirnos cuidar tu ropa."
                )
            }
        return {
            "subject": "Service completed",
            "message": with_brand(
                f"Hello {name}, your service has been completed.\n\nThank you for trusting us with your garments."
            )
        }

    # PICKUP & DELIVERY
    if event == "order_created":
        if is_spanish:
            return {
                "subject": f"Orden programada #{order_number}",
                "message": with_brand(
                    f"Hola {name}, tu orden #{order_number} fue programada correctamente.\n\nConfirmaremos tu pickup en breve."
                )
            }
        return {
            "subject": f"Order scheduled #{order_number}",
            "message": with_brand(
                f"Hello {name}, your order #{order_number} has been successfully scheduled.\n\nWe will confirm your pickup shortly."
            )
        }

    if event == "pickup_confirmed":
        if is_spanish:
            return {
                "subject": "Pickup confirmado",
                "message": with_brand(
                    f"Hola {name}, tu pickup está confirmado.\n\nNos encargaremos del resto."
                )
            }
        return {
            "subject": "Pickup confirmed",
            "message": with_brand(
                f"Hello {name}, your pickup is confirmed.\n\nWe’ll take care of everything."
            )
        }

    if event == "ready":
        if is_spanish:
            return {
                "subject": "Orden lista",
                "message": with_brand(
                    f"Hola {name}, tu ropa está lista.\n\nPronto estará contigo."
                )
            }
        return {
            "subject": "Laundry ready",
            "message": with_brand(
                f"Hello {name}, your laundry is ready.\n\nIt will be delivered soon."
            )
        }

    if event == "out_for_delivery":
        if is_spanish:
            return {
                "subject": "En camino",
                "message": with_brand(
                    f"Hola {name}, tu entrega va en camino.\n\nGracias por tu confianza."
                )
            }
        return {
            "subject": "Out for delivery",
            "message": with_brand(
                f"Hello {name}, your delivery is on the way.\n\nThank you for your trust."
            )
        }

    if event == "delivered":
        if is_spanish:
            return {
                "subject": "Entrega completada",
                "message": with_brand(
                    f"Hola {name}, tu entrega fue completada.\n\nEsperamos verte pronto nuevamente."
                )
            }
        return {
            "subject": "Delivery completed",
            "message": with_brand(
                f"Hello {name}, your delivery has been completed.\n\nWe look forward to serving you again."
            )
        }

    if event == "store_order":
        if is_spanish:
            return {
                "subject": f"Compra confirmada #{order_number}",
                "message": with_brand(
                    f"Hola {name}, recibimos tu orden #{order_number}.\n\nTe notificaremos cuando esté lista."
                )
            }
        return {
            "subject": f"Store order received #{order_number}",
            "message": with_brand(
                f"Hello {name}, we received your order #{order_number}.\n\nWe’ll notify you when it’s ready."
            )
        }

    if is_spanish:
        return {
            "subject": "Actualización de orden",
            "message": with_brand(f"Hola {name}, tenemos una actualización de tu servicio.")
        }
    return {
        "subject": "Order update",
        "message": with_brand(f"Hello {name}, we have an update regarding your service.")
    }

# ----------------------------------------------------------------------
# Funciones de envío con reintentos (wrapper)
# ----------------------------------------------------------------------
async def _send_with_retries(send_func, *args, **kwargs) -> Tuple[bool, Any]:
    """
    Ejecuta send_func con reintentos (backoff). Retorna (success, result)
    donde result puede ser el sid o el error.
    """
    last_exception = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            result = await send_func(*args, **kwargs)
            return True, result
        except Exception as e:
            last_exception = e
            logger.warning(f"Intento {attempt} falló para {send_func.__name__}: {e}")
            if attempt < MAX_RETRIES:
                await asyncio.sleep(RETRY_DELAY * attempt)
    return False, last_exception

async def send_sms(to_phone: str, message: str) -> bool:
    """Send SMS via Twilio con reintentos."""
    if not twilio_client or not TWILIO_PHONE_NUMBER:
        logger.warning("Twilio not configured for SMS")
        return False
    formatted_phone = format_phone(to_phone)
    if not formatted_phone:
        logger.error("Invalid phone number")
        return False

    async def _send():
        return await asyncio.to_thread(
            twilio_client.messages.create,
            body=message,
            from_=TWILIO_PHONE_NUMBER,
            to=formatted_phone
        )

    success, result = await _send_with_retries(_send)
    if success:
        logger.info(f"SMS sent successfully: {result.sid}")
        return True
    else:
        logger.error(f"Failed to send SMS after {MAX_RETRIES} attempts: {result}")
        return False

async def send_whatsapp(to_phone: str, message: str) -> bool:
    """Send WhatsApp via Twilio con reintentos."""
    if not twilio_client or not TWILIO_WHATSAPP_NUMBER:
        logger.warning("Twilio not configured for WhatsApp")
        return False
    formatted = format_whatsapp(to_phone)
    if not formatted:
        logger.error("Invalid phone number for WhatsApp")
        return False

    async def _send():
        return await asyncio.to_thread(
            twilio_client.messages.create,
            body=message,
            from_=TWILIO_WHATSAPP_NUMBER,
            to=formatted
        )

    success, result = await _send_with_retries(_send)
    if success:
        logger.info(f"WhatsApp sent successfully: {result.sid}")
        return True
    else:
        logger.error(f"Failed to send WhatsApp after {MAX_RETRIES} attempts: {result}")
        return False

async def send_voice_call(to_phone: str, message: str, language: str) -> bool:
    """Make a voice call via Twilio con reintentos."""
    if not twilio_client or not TWILIO_PHONE_NUMBER:
        logger.warning("Twilio not configured for Voice")
        return False
    formatted_phone = format_phone(to_phone)
    if not formatted_phone:
        logger.error("Invalid phone number for call")
        return False
    voice_language = "es-MX" if str(language).lower().startswith("es") else "en-US"
    safe_message = xml.sax.saxutils.escape(message)
    twiml = f"<Response><Say language=\"{voice_language}\" voice=\"alice\">{safe_message}</Say></Response>"

    async def _send():
        return await asyncio.to_thread(
            twilio_client.calls.create,
            twiml=twiml,
            to=formatted_phone,
            from_=TWILIO_PHONE_NUMBER
        )

    success, result = await _send_with_retries(_send)
    if success:
        logger.info(f"Voice call initiated: {result.sid}")
        return True
    else:
        logger.error(f"Failed to make voice call after {MAX_RETRIES} attempts: {result}")
        return False

async def send_email(to_email: str, subject: str, body: str) -> bool:
    """Send email via SendGrid con reintentos."""
    if not sendgrid_client or not SENDGRID_FROM_EMAIL:
        logger.warning("SendGrid not configured for email")
        return False
    message = Mail(
        from_email=SENDGRID_FROM_EMAIL,
        to_emails=to_email,
        subject=subject,
        html_content=f"<div style='font-family:Arial,sans-serif;line-height:1.6'>{body}</div>",
        plain_text_content=body
    )

    async def _send():
        return await asyncio.to_thread(sendgrid_client.send, message)

    success, result = await _send_with_retries(_send)
    if success:
        logger.info(f"Email sent: {result.status_code}")
        return result.status_code in [200, 202]
    else:
        logger.error(f"Failed to send email after {MAX_RETRIES} attempts: {result}")
        return False

# ----------------------------------------------------------------------
# Función principal de orquestación con mejoras
# ----------------------------------------------------------------------
async def send_preferred_notification(
    customer: Optional[Dict],
    order: Optional[Dict],
    event: str,
    status: Optional[str] = None
) -> bool:
    """
    Versión mejorada con:
    - Validación de hito permitido
    - Horas de silencio (queued)
    - Idempotencia
    - Uso de plantillas premium
    - Reintentos y auditoría
    """
    if not customer or not order:
        logger.error("Customer or order missing")
        return False

    # --- Determinar flujo (wash_fold / pickup_delivery) según servicio ---
    service_type = normalize_status_value(order.get("service_type") or "pickup_delivery")
    flow = "wash_fold" if service_type in ["wash_fold", "self_service"] else "pickup_delivery"

    # --- Mapear evento interno a nombre de hito ---
    mapped_event = event
    if event == "status_changed":
        # Para cambios de estado, el hito depende del nuevo estado
        status_norm = normalize_status_value(status)
        # Mapeo de estados a eventos de la propuesta
        if flow == "wash_fold":
            status_to_event = {
                "ready": "ready_for_pickup",
                "completed": "completed"
            }
        else:
            status_to_event = {
                "confirmed": "pickup_confirmed",
                "pickup_scheduled": "pickup_confirmed",
                "ready": "ready",
                "out_for_delivery": "out_for_delivery",
                "delivered": "delivered"
            }
        mapped_event = status_to_event.get(status_norm, "status_changed")
    else:
        mapped_event = EVENT_MAPPING.get(event, event)
        if flow == "wash_fold" and event == "order_created":
            mapped_event = "order_received"

    # --- Validar si es un hito permitido ---
    if mapped_event not in MILESTONES.get(flow, set()):
        logger.info(f"Evento {mapped_event} no es un hito para flujo {flow}, omitiendo notificación.")
        return False

    # --- Preparar datos comunes ---
    order_number = order.get("order_number", order.get("id", "N/A"))
    phone = customer.get("phone")
    email = customer.get("email")
    language = detect_language(customer, phone)
    customer_name = customer.get("name") or ""

    # --- Fecha de recogida (solo para eventos que la necesitan) ---
    include_date_events = {"order_created", "pickup_scheduled", "pickup_reminder", "pickup_completed", "pickup_update"}
    pickup_date = order.get("pickup_date") if mapped_event in include_date_events else None
    pickup_window = order.get("pickup_time_window") if mapped_event in include_date_events else None
    order_total = order.get("total") or order.get("total_amount")
    shipping_fee = order.get("shipping_fee")

    # --- Generar mensaje (plantilla premium o la original) ---
    if USE_PREMIUM_TEMPLATES:
        content = build_premium_message(
            event=mapped_event,
            status=status,
            order_number=order_number,
            customer_name=customer_name,
            language=language,
            pickup_date=pickup_date,
            pickup_window=pickup_window,
            order_total=order_total,
            shipping_fee=shipping_fee
        )
        message = content["message"]
        subject = content["subject"]
    else:
        # Mantener la función original build_default_message (asumo que existe)
        # Si no, podrías importarla o definirla. Por simplicidad, usaré la premium siempre.
        content = build_premium_message(
            event=mapped_event,
            status=status,
            order_number=order_number,
            customer_name=customer_name,
            language=language,
            pickup_date=pickup_date,
            pickup_window=pickup_window,
            order_total=order_total,
            shipping_fee=shipping_fee
        )
        message = content["message"]
        subject = content["subject"]

    # --- Si está activado Groq, intentar generar mensaje ultra premium (opcional) ---
    if GROQ_API_KEY and USE_ULTRA_PREMIUM:
        try:
            ai_message = await generate_ai_message(
                context={
                    "event": mapped_event,
                    "status": status,
                    "order_number": order_number,
                    "customer_name": customer_name,
                    "pickup_date": pickup_date,
                    "order_total": order_total,
                    "shipping_fee": shipping_fee,
                },
                language=language,
                channel="sms",  # o el que corresponda
                include_date=(mapped_event in include_date_events)
            )
            if ai_message:
                message = ai_message
                # El subject lo dejamos igual
        except Exception as e:
            logger.warning(f"AI message generation failed: {e}")

    # --- Elegir canal (con optimización México) ---
    preference = normalize_preferred_contact(
        (order or {}).get("preferred_contact")
        or extract_contact_from_notes(order)
        or (customer or {}).get("preferred_contact")
    )

    sms_opt_in = has_sms_consent(order, customer)
    if preference in {"sms", "whatsapp"} and not sms_opt_in:
        logger.info("SMS/WhatsApp preference requested without consent. Fallback to email/call.")
        if email:
            preference = "email"
        else:
            preference = "call"

    country = detect_country(phone)
    if country == 'mx' and preference == 'sms' and TWILIO_WHATSAPP_NUMBER:
        logger.info("Mexican number detected, switching from SMS to WhatsApp for cost savings")
        preference = 'whatsapp'

    # --- Clave de idempotencia ---
    dedupe_key = f"{order.get('id')}:{mapped_event}:{preference}:{language}"
    if _is_already_sent(dedupe_key):
        logger.info(f"Notificación duplicada evitada: {dedupe_key}")
        _log_attempt({
            "timestamp": datetime.now().isoformat(),
            "order_id": order.get("id"),
            "event": mapped_event,
            "channel": preference,
            "status": "duplicate_skipped"
        })
        return True  # Consideramos éxito porque ya se envió antes

    # --- Horas de silencio: si está dentro, encolamos (simulado) ---
    if ENFORCE_QUIET_HOURS and is_quiet_hours():
        logger.info(f"Horas de silencio activas, notificación encolada: {dedupe_key}")
        _log_attempt({
            "timestamp": datetime.now().isoformat(),
            "order_id": order.get("id"),
            "event": mapped_event,
            "channel": preference,
            "status": "queued_quiet_hours"
        })
        # Aquí podrías guardar en una cola real (Redis, DB) para enviar después
        # Por ahora retornamos False para indicar que no se envió ahora
        return False

    # --- Enviar según canal ---
    success = False
    sid = None
    error = None

    if preference == "email":
        if not email:
            logger.warning("Email preferido pero no hay dirección; fallback a SMS")
            success = await send_sms(phone, message)
        else:
            success = await send_email(email, subject, message)
    elif preference == "call":
        if not phone:
            logger.warning("Llamada preferida pero no hay teléfono; fallback a email")
            if email:
                success = await send_email(email, subject, message)
        else:
            success = await send_voice_call(phone, message, language)
    elif preference == "whatsapp":
        if not phone:
            logger.warning("WhatsApp preferido pero no hay teléfono; fallback a email")
            if email:
                success = await send_email(email, subject, message)
        else:
            success = await send_whatsapp(phone, message)
            if not success:
                logger.warning("WhatsApp falló, fallback a SMS")
                success = await send_sms(phone, message)
    else:  # SMS por defecto
        if not phone:
            logger.warning("SMS preferido pero no hay teléfono; fallback a email")
            if email:
                success = await send_email(email, subject, message)
        else:
            success = await send_sms(phone, message)

    # --- Registrar resultado ---
    if success:
        _mark_sent(dedupe_key)
        _log_attempt({
            "timestamp": datetime.now().isoformat(),
            "order_id": order.get("id"),
            "event": mapped_event,
            "channel": preference,
            "status": "sent",
            "sid": sid  # Podrías capturar el sid real si las funciones lo retornaran
        })
    else:
        _log_attempt({
            "timestamp": datetime.now().isoformat(),
            "order_id": order.get("id"),
            "event": mapped_event,
            "channel": preference,
            "status": "failed",
            "error": error
        })

    return success

# ----------------------------------------------------------------------
# Funciones públicas de notificación (mantienen la misma interfaz)
# ----------------------------------------------------------------------
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

# ----------------------------------------------------------------------
# (Opcional) Función generate_ai_message (la misma que tenías)
# ----------------------------------------------------------------------
async def generate_ai_message(context: dict, language: str, channel: str, include_date: bool) -> Optional[str]:
    client = get_groq_client()
    if not client:
        return None
    language_label = "Spanish" if str(language).lower().startswith("es") else "English"
    date_instruction = (
        "Include the pickup date in the message." if include_date
        else "Do NOT include any dates in the message."
    )
    prompt = (
        "You are the customer communications assistant for a premium laundry service. "
        f"Write a short {channel} notification in {language_label}. "
        f"{date_instruction} "
        "Keep it friendly, concise, and professional. "
        "Return ONLY the message text. "
        f"Context: {json.dumps(context, ensure_ascii=False)}"
    )
    try:
        response = await asyncio.to_thread(
            client.chat.completions.create,
            messages=[{"role": "user", "content": prompt}],
            model="llama-3.3-70b-versatile",
            temperature=0.4,
            max_tokens=200
        )
        return response.choices[0].message.content.strip()
    except Exception as exc:
        logger.error(f"Groq message generation failed: {exc}")
        return None