"""
Notification services using Twilio for SMS, WhatsApp and Voice calls, and SendGrid for email.
Includes async handling and premium messages for Ventura Fresh Laundry.
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
import xml.sax.saxutils
from typing import Optional, Dict, Any

from twilio.rest import Client
from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail
from groq import Groq

logger = logging.getLogger(__name__)

# Twilio configuration
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

# Initialize Twilio client (synchronous, will be run in threads)
twilio_client = None
if TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN:
    try:
        twilio_client = Client(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
        logger.info("Twilio client initialized successfully")
    except Exception as e:
        logger.error(f"Failed to initialize Twilio client: {e}")

# Initialize SendGrid client (synchronous)
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
        if cleaned[:3] in ['551', '552', '553', '554', '555', '556', '557', '558', '559',
                           '331', '332', '333', '334', '335', '336', '337', '338', '339',
                           '811', '812', '813', '814', '815', '816', '817', '818', '819',
                           '722', '723', '724', '725', '726', '727', '728', '729', '721',
                           '442', '443', '444', '445', '446', '447', '448', '449',
                           '222', '223', '224', '225', '226', '227', '228', '229']:
            return '+52' + cleaned
    if len(cleaned) == 10:
        return '+1' + cleaned
    if len(cleaned) == 11 and cleaned.startswith('1'):
        return '+' + cleaned
    return '+' + cleaned if not cleaned.startswith('+') else cleaned


def detect_country(phone: Optional[str]) -> Optional[str]:
    """
    Detect country based on formatted phone number.
    Returns 'mx' for Mexico (+52), 'us' for USA (+1), or None if unknown.
    """
    if not phone:
        return None
    formatted = format_phone(phone)
    if formatted and formatted.startswith('+52'):
        return 'mx'
    if formatted and formatted.startswith('+1'):
        return 'us'
    return None


async def send_sms(to_phone: str, message: str) -> bool:
    """Send SMS via Twilio (runs in thread to avoid blocking)"""
    if not twilio_client or not TWILIO_PHONE_NUMBER:
        logger.warning("Twilio not configured for SMS")
        return False
    try:
        formatted_phone = format_phone(to_phone)
        if not formatted_phone:
            logger.error("Invalid phone number")
            return False
        logger.info(f"Sending SMS to: {formatted_phone}")
        msg = await asyncio.to_thread(
            twilio_client.messages.create,
            body=f"{BUSINESS_NAME}: {message}",
            from_=TWILIO_PHONE_NUMBER,
            to=formatted_phone
        )
        logger.info(f"SMS sent successfully: {msg.sid}")
        return True
    except Exception as e:
        logger.error(f"Failed to send SMS: {e}")
        return False


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


def build_default_message(
    event: str,
    status: Optional[str],
    order_number: str,
    language: str,
    pickup_date: Optional[str] = None,
    pickup_window: Optional[str] = None,
    order_total: Optional[float] = None,
    shipping_fee: Optional[float] = None
) -> dict:
    """
    Build default message subject and body using premium Ventura Fresh Laundry templates.
    Only includes pickup date for events that require it.
    """
    is_spanish = str(language).lower().startswith("es")
    signature = f"\n\n{BUSINESS_NAME}"
    if USE_ULTRA_PREMIUM:
        signature += "\nBecause you have better things to do."

    # --- Eventos de recogida (siempre incluyen fecha) ---
    if event == "pickup_scheduled":
        subject = (
            f"Confirmación de recogida — Orden {order_number}"
            if is_spanish
            else f"Pickup Confirmation — Order {order_number}"
        )
        if is_spanish:
            message = (
                f"Tu recogida para la orden {order_number} ha sido confirmada para el día {pickup_date}.\n\n"
                "Nuestro equipo pasará en la fecha programada."
            )
        else:
            message = (
                f"Your pickup for order {order_number} has been confirmed for {pickup_date}.\n\n"
                "Our team will arrive on the scheduled date."
            )
        return {"subject": subject, "message": message + signature}

    if event == "pickup_reminder":
        subject = (
            f"Recordatorio de recogida — Orden {order_number}"
            if is_spanish
            else f"Pickup Reminder — Order {order_number}"
        )
        if is_spanish:
            message = f"Este es un recordatorio de que tu recogida para la orden {order_number} está confirmada para el día {pickup_date}."
        else:
            message = f"This is a reminder that your pickup for order {order_number} is confirmed for {pickup_date}."
        return {"subject": subject, "message": message + signature}

    if event == "pickup_completed":
        subject = (
            f"Recogida confirmada — Orden {order_number}"
            if is_spanish
            else f"Pickup Confirmed — Order {order_number}"
        )
        if is_spanish:
            message = (
                f"La recogida de tu orden {order_number} fue confirmada el día {pickup_date}.\n\n"
                "Tu orden está ahora en proceso."
            )
        else:
            message = (
                f"The pickup for your order {order_number} was confirmed on {pickup_date}.\n\n"
                "Your order is now in process."
            )
        return {"subject": subject, "message": message + signature}

    if event == "pickup_update":
        subject = (
            f"Actualización de recogida — Orden {order_number}"
            if is_spanish
            else f"Pickup Update — Order {order_number}"
        )
        if is_spanish:
            message = f"La recogida de tu orden {order_number} está confirmada para el día {pickup_date}."
        else:
            message = f"The pickup for your order {order_number} is confirmed for {pickup_date}."
        return {"subject": subject, "message": message + signature}

    # --- Evento de creación de orden (similar a pickup_scheduled pero más genérico) ---
    if event == "order_created":
        date_str = f" para el {pickup_date}" if pickup_date and is_spanish else f" for {pickup_date}" if pickup_date else ""
        subject = f"Orden {order_number} recibida" if is_spanish else f"Order {order_number} received"
        if is_spanish:
            message = f"¡Gracias! Tu orden {order_number} fue recibida{date_str}. Te avisaremos cuando esté lista."
        else:
            message = f"Thanks! Your order {order_number} was received{date_str}. We'll notify you when it's ready."
        return {"subject": subject, "message": message + signature}

    if event == "store_order":
        total_label = f"${order_total:.2f}" if order_total is not None else ""
        shipping_label = f" (envío ${shipping_fee:.2f})" if shipping_fee is not None else ""
        subject = (
            f"Orden de tienda confirmada — {order_number}"
            if is_spanish
            else f"Store order confirmed — {order_number}"
        )
        if is_spanish:
            message = (
                f"¡Gracias por tu compra! Tu orden {order_number} está confirmada. "
                f"Total: {total_label}{shipping_label}. Te avisaremos cuando esté lista."
            )
        else:
            message = (
                f"Thanks for your purchase! Your order {order_number} is confirmed. "
                f"Total: {total_label}{shipping_label}. We'll notify you when it's ready."
            )
        return {"subject": subject, "message": message + signature}

    # --- Cambios de estado (sin fecha) ---
    status_lower = (status or "").lower().strip()
    # Mapeo de posibles valores a claves internas
    status_key = None
    if status_lower in ["procesando", "processing"]:
        status_key = "processing"
    elif status_lower in ["lista", "listo", "ready"]:
        status_key = "ready"
    elif status_lower in ["en camino", "out for delivery", "out_for_delivery"]:
        status_key = "out_for_delivery"
    elif status_lower in ["entregada", "delivered"]:
        status_key = "delivered"
    elif status_lower in ["completada", "completed"]:
        status_key = "completed"
    elif status_lower in ["cancelada", "cancelled"]:
        status_key = "cancelled"
    else:
        status_key = status_lower

    if status_key == "processing":
        subject = f"Orden {order_number} en proceso" if is_spanish else f"Order {order_number} processing"
        if is_spanish:
            message = f"Tu orden {order_number} está siendo procesada. Te avisaremos cuando esté lista."
        else:
            message = f"Your order {order_number} is being processed. We'll notify you when it's ready."
    elif status_key == "ready":
        subject = f"Orden {order_number} lista" if is_spanish else f"Order {order_number} ready"
        if is_spanish:
            message = f"¡Buenas noticias! Tu orden {order_number} está lista para recoger."
        else:
            message = f"Good news! Your order {order_number} is ready for pickup."
    elif status_key == "out_for_delivery":
        subject = f"Orden {order_number} en camino" if is_spanish else f"Order {order_number} out for delivery"
        if is_spanish:
            message = f"Tu orden {order_number} va en camino. Por favor prepárate para recibirla."
        else:
            message = f"Your order {order_number} is out for delivery. Please be ready to receive it."
    elif status_key == "delivered":
        subject = f"Orden {order_number} entregada" if is_spanish else f"Order {order_number} delivered"
        if is_spanish:
            message = f"Tu orden {order_number} fue entregada. ¡Gracias por elegir {BUSINESS_NAME}!"
        else:
            message = f"Your order {order_number} has been delivered. Thank you for choosing {BUSINESS_NAME}!"
    elif status_key == "completed":
        subject = f"Orden {order_number} completada" if is_spanish else f"Order {order_number} completed"
        if is_spanish:
            message = f"La orden {order_number} fue completada. ¡Gracias por tu preferencia!"
        else:
            message = f"Order {order_number} has been completed. Thank you for your business!"
    elif status_key == "cancelled":
        subject = f"Orden {order_number} cancelada" if is_spanish else f"Order {order_number} cancelled"
        if is_spanish:
            message = f"Lo sentimos, tu orden {order_number} ha sido cancelada. Contáctanos para más información."
        else:
            message = f"Sorry, your order {order_number} has been cancelled. Contact us for more information."
    else:
        subject = f"Actualización de orden {order_number}" if is_spanish else f"Order {order_number} update"
        if is_spanish:
            message = f"Tu orden {order_number} cambió de estado a {status_lower}."
        else:
            message = f"Your order {order_number} status changed to {status_lower}."

    return {"subject": subject, "message": message + signature}


async def generate_ai_message(context: dict, language: str, channel: str, include_date: bool) -> Optional[str]:
    """Generate a message using Groq (optional)."""
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


async def send_whatsapp(to_phone: str, message: str) -> bool:
    """Send WhatsApp via Twilio (runs in thread)"""
    if not twilio_client or not TWILIO_WHATSAPP_NUMBER:
        logger.warning("Twilio not configured for WhatsApp")
        return False
    try:
        formatted = format_whatsapp(to_phone)
        if not formatted:
            logger.error("Invalid phone number for WhatsApp")
            return False
        msg = await asyncio.to_thread(
            twilio_client.messages.create,
            body=f"{BUSINESS_NAME}: {message}",
            from_=TWILIO_WHATSAPP_NUMBER,
            to=formatted
        )
        logger.info(f"WhatsApp sent successfully: {msg.sid}")
        return True
    except Exception as e:
        logger.error(f"Failed to send WhatsApp: {e}")
        return False


async def send_voice_call(to_phone: str, message: str, language: str) -> bool:
    """Make a voice call via Twilio with escaped message (runs in thread)"""
    if not twilio_client or not TWILIO_PHONE_NUMBER:
        logger.warning("Twilio not configured for Voice")
        return False
    try:
        formatted_phone = format_phone(to_phone)
        if not formatted_phone:
            logger.error("Invalid phone number for call")
            return False
        voice_language = "es-MX" if str(language).lower().startswith("es") else "en-US"
        safe_message = xml.sax.saxutils.escape(message)
        twiml = f"<Response><Say language=\"{voice_language}\" voice=\"alice\">{safe_message}</Say></Response>"
        call = await asyncio.to_thread(
            twilio_client.calls.create,
            twiml=twiml,
            to=formatted_phone,
            from_=TWILIO_PHONE_NUMBER
        )
        logger.info(f"Voice call initiated: {call.sid}")
        return True
    except Exception as e:
        logger.error(f"Failed to make voice call: {e}")
        return False


async def send_email(to_email: str, subject: str, body: str) -> bool:
    """Send email via SendGrid (runs in thread)"""
    if not sendgrid_client or not SENDGRID_FROM_EMAIL:
        logger.warning("SendGrid not configured for email")
        return False
    try:
        message = Mail(
            from_email=SENDGRID_FROM_EMAIL,
            to_emails=to_email,
            subject=subject,
            html_content=f"<div style='font-family:Arial,sans-serif;line-height:1.6'>{body}</div>",
            plain_text_content=body
        )
        response = await asyncio.to_thread(sendgrid_client.send, message)
        logger.info(f"Email sent: {response.status_code}")
        return response.status_code in [200, 202]
    except Exception as e:
        logger.error(f"Failed to send email: {e}")
        return False


async def build_notification_content(
    customer: Optional[Dict],
    order: Optional[Dict],
    event: str,
    status: Optional[str] = None,
    channel: str = "customer"
) -> dict:
    """
    Build notification content (message, subject, language).
    Determines whether to include date based on event.
    """
    if not customer or not order:
        logger.error("Customer or order is None, cannot build notification")
        raise ValueError("Customer and order are required")

    order_number = order.get("order_number", order.get("id", "N/A"))
    phone = customer.get("phone")
    language = detect_language(customer, phone)

    # La fecha de recogida solo se incluye en eventos de recogida o creación
    include_date_events = {"pickup_scheduled", "pickup_reminder", "pickup_completed", "pickup_update", "order_created"}
    pickup_date = order.get("pickup_date") if event in include_date_events else None
    pickup_window = order.get("pickup_time_window") if event in include_date_events else None

    order_total = order.get("total") or order.get("total_amount")
    shipping_fee = order.get("shipping_fee")

    base = build_default_message(
        event, status, order_number, language,
        pickup_date=pickup_date, pickup_window=pickup_window,
        order_total=order_total, shipping_fee=shipping_fee
    )

    context = {
        "event": event,
        "status": status,
        "order_number": order_number,
        "customer_name": customer.get("name"),
        "business_name": BUSINESS_NAME
    }
    if event in include_date_events:
        if pickup_date:
            context["pickup_date"] = pickup_date
        if pickup_window:
            context["pickup_window"] = pickup_window

    include_date = (event in include_date_events)
    ai_message = await generate_ai_message(context, language, channel, include_date)
    message = ai_message or base["message"]
    subject = base["subject"]

    return {"message": message, "subject": subject, "language": language}


def extract_contact_from_notes(order: Dict) -> Optional[str]:
    """Extract preferred contact from order notes (case‑insensitive)"""
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


async def send_preferred_notification(
    customer: Optional[Dict],
    order: Optional[Dict],
    event: str,
    status: Optional[str] = None
) -> bool:
    """
    Send notification using the customer's preferred contact method,
    with cost optimization: Mexican numbers use WhatsApp instead of SMS when possible.
    Implements fallbacks if the primary method fails or lacks data.
    """
    if not customer or not order:
        logger.error("Customer or order missing")
        return False

    preference = normalize_preferred_contact(
        (order or {}).get("preferred_contact")
        or extract_contact_from_notes(order)
        or (customer or {}).get("preferred_contact")
    )

    # --- Cost optimization: Mexican numbers use WhatsApp instead of SMS ---
    country = detect_country(customer.get("phone"))
    if country == 'mx' and preference == 'sms' and TWILIO_WHATSAPP_NUMBER:
        logger.info("Mexican number detected, switching from SMS to WhatsApp for cost savings")
        preference = 'whatsapp'
    # ---------------------------------------------------------------------

    content = await build_notification_content(customer, order, event, status, channel=preference)
    message = content["message"]
    subject = content["subject"]
    language = content["language"]

    if preference == "email":
        email = customer.get("email")
        if not email:
            logger.warning("Customer prefers email but no email found; falling back to SMS")
            return await send_sms(customer.get("phone"), message)
        return await send_email(email, subject, message)

    if preference == "call":
        phone = customer.get("phone")
        if not phone:
            logger.warning("Customer prefers call but no phone found; falling back to email")
            if customer.get("email"):
                return await send_email(customer.get("email"), subject, message)
            return False
        return await send_voice_call(phone, message, language)

    if preference == "whatsapp":
        phone = customer.get("phone")
        if not phone:
            logger.warning("Customer prefers WhatsApp but no phone found; falling back to SMS")
            if customer.get("email"):
                return await send_email(customer.get("email"), subject, message)
            return False
        success = await send_whatsapp(phone, message)
        if not success:
            logger.warning("WhatsApp failed, falling back to SMS")
            return await send_sms(phone, message)
        return success

    # Default SMS
    phone = customer.get("phone")
    if not phone:
        logger.warning("No phone number for SMS; falling back to email")
        if customer.get("email"):
            return await send_email(customer.get("email"), subject, message)
        return False
    return await send_sms(phone, message)


# ====================== Funciones públicas de notificación ======================

async def notify_order_created(customer: Dict, order: Dict) -> bool:
    """Notify customer when order is created (includes pickup date)"""
    return await send_preferred_notification(customer, order, "order_created")

async def notify_order_status_changed(customer: Dict, order: Dict, new_status: str) -> bool:
    """Notify customer when order status changes (no dates)"""
    status_normalized = normalize_status_value(new_status)
    if not status_normalized or status_normalized == "new":
        logger.info("Empty status, no notification needed")
        return False

    service_type = normalize_status_value(order.get("service_type") or "pickup_delivery")
    if service_type in ["wash_fold", "self_service"]:
        if status_normalized != "ready":
            return False
    else:
        if status_normalized not in ["ready", "out_for_delivery", "delivered"]:
            return False

    return await send_preferred_notification(customer, order, "status_changed", new_status)

async def notify_pickup_scheduled(customer: Dict, order: Dict) -> bool:
    """Confirmación de recogida programada (incluye fecha)"""
    return await send_preferred_notification(customer, order, "pickup_scheduled")

async def notify_pickup_reminder(customer: Dict, order: Dict) -> bool:
    """Recordatorio de recogida (incluye fecha)"""
    return await send_preferred_notification(customer, order, "pickup_reminder")

async def notify_pickup_completed(customer: Dict, order: Dict) -> bool:
    """Recogida completada (la orden pasa a proceso, incluye fecha)"""
    return await send_preferred_notification(customer, order, "pickup_completed")

async def notify_pickup_update(customer: Dict, order: Dict) -> bool:
    """Actualización genérica de recogida (incluye fecha)"""
    return await send_preferred_notification(customer, order, "pickup_update")