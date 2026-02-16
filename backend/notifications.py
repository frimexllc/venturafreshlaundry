"""
Notification Services for Ventura Fresh Laundry CRM
Email via SMTP (no third-party services)
SMS via carrier email-to-SMS gateways (free)
"""
import os
import asyncio
import logging
import smtplib
import requests
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Optional

logger = logging.getLogger(__name__)

# ==================== EMAIL SERVICE (SMTP) ====================

SMTP_HOST = os.environ.get('SMTP_HOST', 'smtp.gmail.com')
SMTP_PORT = int(os.environ.get('SMTP_PORT', '587'))
SMTP_USER = os.environ.get('SMTP_USER')  # Your email address
SMTP_PASSWORD = os.environ.get('SMTP_PASSWORD')  # App password for Gmail
SENDER_NAME = os.environ.get('SENDER_NAME', 'Ventura Fresh Laundry')

async def send_email(to_email: str, subject: str, html_content: str) -> dict:
    """Send email using SMTP (Gmail, Outlook, etc.)"""
    if not SMTP_USER or not SMTP_PASSWORD:
        logger.warning("SMTP not configured, skipping email")
        return {"status": "skipped", "message": "Email service not configured"}
    
    try:
        msg = MIMEMultipart('alternative')
        msg['Subject'] = subject
        msg['From'] = f"{SENDER_NAME} <{SMTP_USER}>"
        msg['To'] = to_email
        
        # Attach HTML content
        html_part = MIMEText(html_content, 'html')
        msg.attach(html_part)
        
        # Send email in thread to not block
        def send_sync():
            with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
                server.starttls()
                server.login(SMTP_USER, SMTP_PASSWORD)
                server.sendmail(SMTP_USER, to_email, msg.as_string())
        
        await asyncio.to_thread(send_sync)
        logger.info(f"Email sent to {to_email}")
        return {"status": "success", "message": f"Email sent to {to_email}"}
    except Exception as e:
        logger.error(f"Failed to send email: {str(e)}")
        return {"status": "error", "message": str(e)}

CARRIER_GATEWAYS = {
    # US Carriers
    "att": "txt.att.net",
    "tmobile": "tmomail.net", 
    "verizon": "vtext.com",
    "sprint": "messaging.sprintpcs.com",
    "boost": "sms.myboostmobile.com",
    "cricket": "sms.cricketwireless.net",
    "uscellular": "email.uscc.net",
    "virgin": "vmobl.com",
    "metro": "mymetropcs.com",
    # Mexico Carriers
    "telcel": "mms.telcel.com",
    "movistar_mx": "movistar.com.mx",
}

DEFAULT_CARRIER = os.environ.get('DEFAULT_SMS_CARRIER', 'att')
SMS_PROVIDER = os.environ.get('SMS_PROVIDER', 'smtp_gateway')
TWILIO_ACCOUNT_SID = os.environ.get('TWILIO_ACCOUNT_SID')
TWILIO_AUTH_TOKEN = os.environ.get('TWILIO_AUTH_TOKEN')
TWILIO_PHONE_NUMBER = os.environ.get('TWILIO_PHONE_NUMBER')
WHATSAPP_ENABLED = os.environ.get('WHATSAPP_ENABLED', 'false').lower() == 'true'
TWILIO_WHATSAPP_NUMBER = os.environ.get('TWILIO_WHATSAPP_NUMBER')

def format_phone_for_sms(phone: str) -> str:
    """Clean phone number to digits only"""
    return ''.join(filter(str.isdigit, phone))[-10:]  # Last 10 digits

def normalize_phone_e164(phone: str) -> str:
    if phone.startswith("+"):
        return phone
    digits = ''.join(filter(str.isdigit, phone))
    if len(digits) == 10:
        return f"+1{digits}"
    return f"+{digits}"

async def send_sms_via_twilio(to_phone: str, message: str) -> dict:
    if not TWILIO_ACCOUNT_SID or not TWILIO_AUTH_TOKEN or not TWILIO_PHONE_NUMBER:
        logger.warning("Twilio not configured, skipping SMS")
        return {"status": "skipped", "message": "Twilio not configured"}
    to_number = normalize_phone_e164(to_phone)
    from_number = normalize_phone_e164(TWILIO_PHONE_NUMBER)

    def send_sync():
        return requests.post(
            f"https://api.twilio.com/2010-04-01/Accounts/{TWILIO_ACCOUNT_SID}/Messages.json",
            data={"To": to_number, "From": from_number, "Body": message},
            auth=(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN),
            timeout=30
        )

    try:
        response = await asyncio.to_thread(send_sync)
        if response.ok:
            logger.info(f"SMS sent to {to_number} via Twilio")
            return {"status": "success", "message": f"SMS sent to {to_number}"}
        logger.error(f"Twilio SMS failed: {response.text}")
        return {"status": "error", "message": response.text}
    except Exception as e:
        logger.error(f"Failed to send SMS via Twilio: {str(e)}")
        return {"status": "error", "message": str(e)}

async def send_whatsapp_via_twilio(to_phone: str, message: str) -> dict:
    if not TWILIO_ACCOUNT_SID or not TWILIO_AUTH_TOKEN or not TWILIO_WHATSAPP_NUMBER:
        logger.warning("Twilio WhatsApp not configured, skipping WhatsApp")
        return {"status": "skipped", "message": "Twilio WhatsApp not configured"}
    to_number = f"whatsapp:{normalize_phone_e164(to_phone)}"
    from_number = TWILIO_WHATSAPP_NUMBER
    if not from_number.startswith("whatsapp:"):
        from_number = f"whatsapp:{normalize_phone_e164(from_number)}"

    def send_sync():
        return requests.post(
            f"https://api.twilio.com/2010-04-01/Accounts/{TWILIO_ACCOUNT_SID}/Messages.json",
            data={"To": to_number, "From": from_number, "Body": message},
            auth=(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN),
            timeout=30
        )

    try:
        response = await asyncio.to_thread(send_sync)
        if response.ok:
            logger.info(f"WhatsApp sent to {to_number} via Twilio")
            return {"status": "success", "message": f"WhatsApp sent to {to_number}"}
        logger.error(f"Twilio WhatsApp failed: {response.text}")
        return {"status": "error", "message": response.text}
    except Exception as e:
        logger.error(f"Failed to send WhatsApp via Twilio: {str(e)}")
        return {"status": "error", "message": str(e)}

async def send_sms(to_phone: str, message: str, carrier: str = None) -> dict:
    if SMS_PROVIDER == "twilio":
        return await send_sms_via_twilio(to_phone, message)

    if not SMTP_USER or not SMTP_PASSWORD:
        logger.warning("SMTP not configured, skipping SMS")
        return {"status": "skipped", "message": "SMS service not configured (needs SMTP)"}

    carrier = carrier or DEFAULT_CARRIER
    gateway = CARRIER_GATEWAYS.get(carrier.lower())

    if not gateway:
        logger.warning(f"Unknown carrier: {carrier}")
        return {"status": "error", "message": f"Unknown carrier: {carrier}"}

    phone_digits = format_phone_for_sms(to_phone)
    sms_email = f"{phone_digits}@{gateway}"

    try:
        msg = MIMEText(message)
        msg['Subject'] = ''
        msg['From'] = SMTP_USER
        msg['To'] = sms_email

        def send_sync():
            with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
                server.starttls()
                server.login(SMTP_USER, SMTP_PASSWORD)
                server.sendmail(SMTP_USER, sms_email, msg.as_string())

        await asyncio.to_thread(send_sync)
        logger.info(f"SMS sent to {to_phone} via {carrier}")
        return {"status": "success", "message": f"SMS sent to {to_phone}"}
    except Exception as e:
        logger.error(f"Failed to send SMS: {str(e)}")
        return {"status": "error", "message": str(e)}

# ==================== NOTIFICATION TEMPLATES ====================

def get_order_status_email(customer_name: str, order_number: str, status: str, status_label: str) -> str:
    """Generate order status update email HTML"""
    status_colors = {
        "new": "#f59e0b",
        "processing": "#0ea5e9",
        "ready": "#0ea5e9",
        "out_for_delivery": "#8b5cf6",
        "delivered": "#10b981",
        "completed": "#10b981",
        "cancelled": "#ef4444"
    }
    color = status_colors.get(status, "#6b7280")
    
    return f"""
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"></head>
    <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f8fafc;">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
            <tr>
                <td style="padding: 30px 40px; background-color: #0ea5e9;">
                    <h1 style="margin: 0; color: #ffffff; font-size: 24px;">Ventura Fresh Laundry</h1>
                </td>
            </tr>
            <tr>
                <td style="padding: 40px;">
                    <h2 style="margin: 0 0 20px; color: #1e293b;">¡Hola {customer_name}!</h2>
                    <p style="margin: 0 0 20px; color: #475569;">
                        Tu orden <strong>{order_number}</strong> ha sido actualizada:
                    </p>
                    <div style="background-color: #f1f5f9; border-radius: 12px; padding: 20px; text-align: center;">
                        <p style="margin: 0 0 10px; color: #64748b;">Estado actual</p>
                        <p style="margin: 0; color: {color}; font-size: 24px; font-weight: bold;">{status_label}</p>
                    </div>
                    <p style="margin: 20px 0 0; color: #475569;">
                        Preguntas? Llámanos al (805) 836-8872
                    </p>
                </td>
            </tr>
            <tr>
                <td style="padding: 20px; background-color: #f8fafc; text-align: center;">
                    <p style="margin: 0; color: #94a3b8; font-size: 12px;">
                        © 2026 Ventura Fresh Laundry
                    </p>
                </td>
            </tr>
        </table>
    </body>
    </html>
    """

def get_order_status_sms(customer_name: str, order_number: str, status_label: str) -> str:
    """Generate order status SMS (max 160 chars)"""
    return f"Hola {customer_name}! Orden {order_number}: {status_label}. Ventura Fresh Laundry (805)836-8872"

def get_order_confirmation_email(customer_name: str, order_number: str, pickup_date: str, pickup_time: str, address: str) -> str:
    """Generate order confirmation email HTML"""
    return f"""
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"></head>
    <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f8fafc;">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
            <tr>
                <td style="padding: 30px 40px; background-color: #0ea5e9;">
                    <h1 style="margin: 0; color: #ffffff; font-size: 24px;">Ventura Fresh Laundry</h1>
                </td>
            </tr>
            <tr>
                <td style="padding: 40px;">
                    <h2 style="margin: 0 0 20px; color: #1e293b;">¡Gracias {customer_name}!</h2>
                    <p style="margin: 0 0 20px; color: #475569;">Hemos recibido tu orden:</p>
                    <div style="background-color: #f1f5f9; border-radius: 12px; padding: 20px;">
                        <table width="100%" cellpadding="8">
                            <tr><td style="color: #64748b;">Orden:</td><td style="color: #1e293b; font-weight: bold;">{order_number}</td></tr>
                            <tr><td style="color: #64748b;">Fecha:</td><td style="color: #1e293b;">{pickup_date or 'Por confirmar'}</td></tr>
                            <tr><td style="color: #64748b;">Horario:</td><td style="color: #1e293b;">{pickup_time or 'Por confirmar'}</td></tr>
                            <tr><td style="color: #64748b;">Dirección:</td><td style="color: #1e293b;">{address or 'Por confirmar'}</td></tr>
                        </table>
                    </div>
                    <p style="margin: 20px 0 0; color: #475569;">Te notificaremos cuando recojamos tu ropa.</p>
                </td>
            </tr>
            <tr>
                <td style="padding: 20px; background-color: #f8fafc; text-align: center;">
                    <p style="margin: 0; color: #94a3b8; font-size: 12px;">© 2026 Ventura Fresh Laundry</p>
                </td>
            </tr>
        </table>
    </body>
    </html>
    """

def get_order_confirmation_sms(customer_name: str, order_number: str, pickup_date: str) -> str:
    """Generate order confirmation SMS"""
    date_text = f" {pickup_date}" if pickup_date else ""
    return f"Orden {order_number} recibida{date_text}. Ventura Fresh Laundry (805)836-8872"

# ==================== NOTIFICATION DISPATCHER ====================

async def notify_order_created(customer: dict, order: dict):
    """Send notifications when order is created"""
    customer_name = customer.get("name", "Cliente")
    order_number = order.get("order_number", "")
    pickup_date = order.get("pickup_date", "")
    pickup_time = order.get("pickup_time_window", "")
    address = order.get("pickup_address", "")
    
    tasks = []
    
    if customer.get("email"):
        email_html = get_order_confirmation_email(customer_name, order_number, pickup_date, pickup_time, address)
        tasks.append(send_email(customer["email"], f"Confirmación de Orden {order_number}", email_html))
    
    if customer.get("phone"):
        sms_text = get_order_confirmation_sms(customer_name, order_number, pickup_date)
        carrier = customer.get("carrier", DEFAULT_CARRIER)
        tasks.append(send_sms(customer["phone"], sms_text, carrier))
        if WHATSAPP_ENABLED:
            tasks.append(send_whatsapp_via_twilio(customer["phone"], sms_text))
    
    if tasks:
        await asyncio.gather(*tasks, return_exceptions=True)

async def notify_order_status_changed(customer: dict, order: dict, new_status: str):
    """Send notifications when order status changes"""
    status_labels = {
        "new": "Nueva",
        "processing": "Procesando", 
        "ready": "Lista",
        "out_for_delivery": "En camino",
        "delivered": "Entregada",
        "completed": "Completada",
        "cancelled": "Cancelada"
    }
    
    customer_name = customer.get("name", "Cliente")
    order_number = order.get("order_number", "")
    status_label = status_labels.get(new_status, new_status)
    
    tasks = []
    
    if customer.get("email"):
        email_html = get_order_status_email(customer_name, order_number, new_status, status_label)
        tasks.append(send_email(customer["email"], f"Orden {order_number} - {status_label}", email_html))
    
    if customer.get("phone"):
        sms_text = get_order_status_sms(customer_name, order_number, status_label)
        carrier = customer.get("carrier", DEFAULT_CARRIER)
        tasks.append(send_sms(customer["phone"], sms_text, carrier))
        if WHATSAPP_ENABLED:
            tasks.append(send_whatsapp_via_twilio(customer["phone"], sms_text))
    
    if tasks:
        await asyncio.gather(*tasks, return_exceptions=True)
