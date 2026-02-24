"""
Notification services using Twilio for SMS and WhatsApp
"""
import os
import logging
import json
from datetime import datetime
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
BUSINESS_NAME = os.environ.get('BUSINESS_NAME', 'Ventura Fresh Laundromat')
SENDGRID_API_KEY = os.environ.get('SENDGRID_API_KEY')
SENDGRID_FROM_EMAIL = os.environ.get('SENDGRID_FROM_EMAIL')
SENDGRID_DATA_RESIDENCY = os.environ.get('SENDGRID_DATA_RESIDENCY', '').lower()
GROQ_API_KEY = os.environ.get('GROQ_API_KEY')

# Initialize Twilio client
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


def format_phone(phone: str) -> str:
    """Format phone number for Twilio - handles US and international numbers"""
    if not phone:
        return None
    # Remove spaces, dashes, parentheses, dots
    cleaned = ''.join(c for c in phone if c.isdigit() or c == '+')
    
    # If already has +, return as is
    if cleaned.startswith('+'):
        return cleaned
    
    # Check if it's a Mexican number (starts with 52 and has 12 digits total or 10 digits)
    if cleaned.startswith('52') and len(cleaned) >= 12:
        return '+' + cleaned
    
    # Check if it looks like a Mexican mobile (10 digits starting with common prefixes)
    if len(cleaned) == 10 and cleaned[0] in ['5', '3', '4', '6', '7', '8', '9']:
        # Could be Mexican, let's check common area codes
        if cleaned[:3] in ['551', '552', '553', '554', '555', '556', '557', '558', '559',  # CDMX
                           '331', '332', '333', '334', '335', '336', '337', '338', '339',  # Guadalajara
                           '811', '812', '813', '814', '815', '816', '817', '818', '819',  # Monterrey
                           '722', '723', '724', '725', '726', '727', '728', '729', '721',  # Toluca area
                           '442', '443', '444', '445', '446', '447', '448', '449',  # Querétaro
                           '222', '223', '224', '225', '226', '227', '228', '229']:  # Puebla
            return '+52' + cleaned
    
    # Default to US if 10 digits
    if len(cleaned) == 10:
        return '+1' + cleaned
    
    # If 11 digits starting with 1, assume US
    if len(cleaned) == 11 and cleaned.startswith('1'):
        return '+' + cleaned
    
    # Return with + prefix for any other case
    return '+' + cleaned if not cleaned.startswith('+') else cleaned


async def send_sms(to_phone: str, message: str) -> bool:
    """Send SMS via Twilio"""
    if not twilio_client or not TWILIO_PHONE_NUMBER:
        logger.warning("Twilio not configured for SMS")
        return False

    try:
        formatted_phone = format_phone(to_phone)
        if not formatted_phone:
            logger.error("Invalid phone number")
            return False

        logger.info(f"Sending SMS to: {formatted_phone}")

        msg = twilio_client.messages.create(
            body=f"{BUSINESS_NAME}: {message}",
            from_=TWILIO_PHONE_NUMBER,
            to=formatted_phone
        )
        logger.info(f"SMS sent successfully: {msg.sid}")
        return True
    except Exception as e:
        logger.error(f"Failed to send SMS: {e}")
        return False


def format_whatsapp(phone: str) -> str:
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


def detect_language(customer: dict, phone: str) -> str:
    preferred = (customer or {}).get("preferred_language") or (customer or {}).get("language")
    if preferred:
        return preferred
    if phone and phone.strip().startswith("+1"):
        return "en-US"
    return "es-MX"


def build_default_message(event: str, status: str, order_number: str, language: str) -> dict:
    is_spanish = str(language).lower().startswith("es")
    if event == "order_created":
        subject = f"Orden {order_number} recibida" if is_spanish else f"Order {order_number} received"
        message = (
            f"¡Gracias! Tu orden {order_number} fue recibida. Te avisaremos cuando esté lista."
            if is_spanish
            else f"Thanks! Your order {order_number} was received. We'll notify you when it's ready."
        )
        return {"subject": subject, "message": message}

    status_lower = (status or "").lower()
    if status_lower == "ready":
        subject = f"Orden {order_number} lista" if is_spanish else f"Order {order_number} ready"
        message = (
            f"¡Buenas noticias! Tu orden {order_number} está lista para recoger."
            if is_spanish
            else f"Good news! Your order {order_number} is ready for pickup."
        )
    elif status_lower in ["out_for_delivery", "out for delivery"]:
        subject = f"Orden {order_number} en camino" if is_spanish else f"Order {order_number} out for delivery"
        message = (
            f"Tu orden {order_number} va en camino. Por favor prepárate para recibirla."
            if is_spanish
            else f"Your order {order_number} is out for delivery. Please be ready to receive it."
        )
    elif status_lower == "delivered":
        subject = f"Orden {order_number} entregada" if is_spanish else f"Order {order_number} delivered"
        message = (
            f"Tu orden {order_number} fue entregada. ¡Gracias por elegir {BUSINESS_NAME}!"
            if is_spanish
            else f"Your order {order_number} has been delivered. Thank you for choosing {BUSINESS_NAME}!"
        )
    elif status_lower == "completed":
        subject = f"Orden {order_number} completada" if is_spanish else f"Order {order_number} completed"
        message = (
            f"La orden {order_number} fue completada. ¡Gracias por tu preferencia!"
            if is_spanish
            else f"Order {order_number} has been completed. Thank you for your business!"
        )
    else:
        subject = f"Actualización de orden {order_number}" if is_spanish else f"Order {order_number} update"
        message = (
            f"Tu orden {order_number} cambió de estado a {status_lower}."
            if is_spanish
            else f"Your order {order_number} status changed to {status_lower}."
        )
    return {"subject": subject, "message": message}


def generate_ai_message(context: dict, language: str, channel: str) -> str:
    client = get_groq_client()
    if not client:
        return None
    language_label = "Spanish" if str(language).lower().startswith("es") else "English"
    prompt = (
        "You are the customer communications assistant for a premium laundry service. "
        f"Write a short {channel} notification in {language_label}. "
        "Keep it friendly, concise, and professional. "
        "Return ONLY the message text. "
        f"Context: {json.dumps(context, ensure_ascii=False)}"
    )
    try:
        response = client.chat.completions.create(
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
    if not twilio_client or not TWILIO_WHATSAPP_NUMBER:
        logger.warning("Twilio not configured for WhatsApp")
        return False
    try:
        formatted = format_whatsapp(to_phone)
        if not formatted:
            logger.error("Invalid phone number for WhatsApp")
            return False
        msg = twilio_client.messages.create(
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
    if not twilio_client or not TWILIO_PHONE_NUMBER:
        logger.warning("Twilio not configured for Voice")
        return False
    try:
        formatted_phone = format_phone(to_phone)
        if not formatted_phone:
            logger.error("Invalid phone number for call")
            return False
        voice_language = "es-MX" if str(language).lower().startswith("es") else "en-US"
        twiml = f"<Response><Say language=\"{voice_language}\" voice=\"alice\">{message}</Say></Response>"
        call = twilio_client.calls.create(
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
    """Send email via SendGrid"""
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
        response = sendgrid_client.send(message)
        logger.info(f"Email sent: {response.status_code}")
        return response.status_code in [200, 202]
    except Exception as e:
        logger.error(f"Failed to send email: {e}")
        return False


async def build_notification_content(customer: dict, order: dict, event: str, status: str = None) -> dict:
    order_number = order.get("order_number", order.get("id", "N/A"))
    phone = customer.get("phone")
    language = detect_language(customer, phone)

    base = build_default_message(event, status, order_number, language)
    context = {
        "event": event,
        "status": status,
        "order_number": order_number,
        "customer_name": customer.get("name"),
        "pickup_date": order.get("pickup_date"),
        "pickup_window": order.get("pickup_time_window"),
        "business_name": BUSINESS_NAME
    }
    ai_message = generate_ai_message(context, language, "customer")
    message = ai_message or base["message"]
    subject = base["subject"]

    return {
        "message": message,
        "subject": subject,
        "language": language
    }


def extract_contact_from_notes(order: dict) -> str:
    if not order:
        return None
    notes = order.get("notes") or ""
    marker = "Preferred contact:"
    if marker.lower() in notes.lower():
        parts = notes.split(marker)
        if len(parts) > 1:
            value = parts[1].split("\n")[0].strip()
            return value
    return None


def send_preferred_notification(customer: dict, order: dict, event: str, status: str = None) -> bool:
    preference = normalize_preferred_contact(
        (customer or {}).get("preferred_contact")
        or (order or {}).get("preferred_contact")
        or extract_contact_from_notes(order)
    )
    content = await build_notification_content(customer, order, event, status)
    message = content["message"]
    subject = content["subject"]
    language = content["language"]

    if preference == "email":
        if not customer.get("email"):
            logger.warning("Customer prefers email but no email found; falling back to SMS")
            return await send_sms(customer.get("phone"), message)
        return await send_email(customer.get("email"), subject, message)

    if preference == "call":
        if not customer.get("phone"):
            logger.warning("Customer prefers call but no phone found; falling back to email")
            if customer.get("email"):
                return await send_email(customer.get("email"), subject, message)
            return False
        return await send_voice_call(customer.get("phone"), message, language)

    if preference == "whatsapp":
        return await send_whatsapp(customer.get("phone"), message)

    return await send_sms(customer.get("phone"), message)


async def notify_order_created(customer: dict, order: dict) -> bool:
    """Notify customer when order is created"""
    return await send_preferred_notification(customer, order, "order_created")


async def notify_order_status_changed(customer: dict, order: dict, new_status: str) -> bool:
    """Notify customer when order status changes"""
    status_lower = (new_status or "").lower()
    if status_lower not in ["ready", "out_for_delivery", "out for delivery", "delivered", "completed"]:
        logger.info(f"Status {new_status} does not require notification")
        return False
    return await send_preferred_notification(customer, order, "status_changed", new_status)
