"""
Notification Services for Ventura Fresh Laundry CRM
Handles Email (Resend) and SMS (Twilio) notifications
"""
import os
import asyncio
import logging
from typing import Optional

logger = logging.getLogger(__name__)

# ==================== EMAIL SERVICE (RESEND) ====================

RESEND_API_KEY = os.environ.get('RESEND_API_KEY')
SENDER_EMAIL = os.environ.get('SENDER_EMAIL', 'onboarding@resend.dev')

async def send_email(to_email: str, subject: str, html_content: str) -> dict:
    """Send email using Resend API"""
    if not RESEND_API_KEY:
        logger.warning("RESEND_API_KEY not configured, skipping email")
        return {"status": "skipped", "message": "Email service not configured"}
    
    try:
        import resend
        resend.api_key = RESEND_API_KEY
        
        params = {
            "from": SENDER_EMAIL,
            "to": [to_email],
            "subject": subject,
            "html": html_content
        }
        
        email = await asyncio.to_thread(resend.Emails.send, params)
        logger.info(f"Email sent to {to_email}")
        return {"status": "success", "email_id": email.get("id")}
    except Exception as e:
        logger.error(f"Failed to send email: {str(e)}")
        return {"status": "error", "message": str(e)}

# ==================== SMS SERVICE (TWILIO) ====================

TWILIO_ACCOUNT_SID = os.environ.get('TWILIO_ACCOUNT_SID')
TWILIO_AUTH_TOKEN = os.environ.get('TWILIO_AUTH_TOKEN')
TWILIO_PHONE_NUMBER = os.environ.get('TWILIO_PHONE_NUMBER')

async def send_sms(to_phone: str, message: str) -> dict:
    """Send SMS using Twilio API"""
    if not all([TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER]):
        logger.warning("Twilio not configured, skipping SMS")
        return {"status": "skipped", "message": "SMS service not configured"}
    
    try:
        from twilio.rest import Client
        client = Client(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
        
        # Format phone number to E.164 if needed
        if not to_phone.startswith('+'):
            to_phone = f"+1{to_phone}"  # Default to US
        
        sms = await asyncio.to_thread(
            client.messages.create,
            body=message,
            from_=TWILIO_PHONE_NUMBER,
            to=to_phone
        )
        logger.info(f"SMS sent to {to_phone}")
        return {"status": "success", "sms_sid": sms.sid}
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
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f8fafc;">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
            <tr>
                <td style="padding: 30px 40px; background-color: #0ea5e9;">
                    <h1 style="margin: 0; color: #ffffff; font-size: 24px;">Ventura Fresh Laundry</h1>
                </td>
            </tr>
            <tr>
                <td style="padding: 40px;">
                    <h2 style="margin: 0 0 20px; color: #1e293b; font-size: 20px;">
                        ¡Hola {customer_name}!
                    </h2>
                    <p style="margin: 0 0 20px; color: #475569; font-size: 16px; line-height: 1.6;">
                        Tu orden <strong>{order_number}</strong> ha sido actualizada:
                    </p>
                    <div style="background-color: #f1f5f9; border-radius: 12px; padding: 20px; text-align: center; margin: 20px 0;">
                        <p style="margin: 0 0 10px; color: #64748b; font-size: 14px;">Estado actual</p>
                        <p style="margin: 0; color: {color}; font-size: 24px; font-weight: bold;">
                            {status_label}
                        </p>
                    </div>
                    <p style="margin: 20px 0 0; color: #475569; font-size: 14px; line-height: 1.6;">
                        Si tienes alguna pregunta, no dudes en contactarnos al (805) 836-8872.
                    </p>
                </td>
            </tr>
            <tr>
                <td style="padding: 20px 40px; background-color: #f8fafc; border-top: 1px solid #e2e8f0;">
                    <p style="margin: 0; color: #94a3b8; font-size: 12px; text-align: center;">
                        © 2026 Ventura Fresh Laundry. 5722 Telephone Rd #5, Ventura, CA 93003
                    </p>
                </td>
            </tr>
        </table>
    </body>
    </html>
    """

def get_order_status_sms(customer_name: str, order_number: str, status_label: str) -> str:
    """Generate order status update SMS"""
    return f"Hola {customer_name}! Tu orden {order_number} de Ventura Fresh Laundry está ahora: {status_label}. Preguntas? (805) 836-8872"

def get_order_confirmation_email(customer_name: str, order_number: str, pickup_date: str, pickup_time: str, address: str) -> str:
    """Generate order confirmation email HTML"""
    return f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f8fafc;">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
            <tr>
                <td style="padding: 30px 40px; background-color: #0ea5e9;">
                    <h1 style="margin: 0; color: #ffffff; font-size: 24px;">Ventura Fresh Laundry</h1>
                </td>
            </tr>
            <tr>
                <td style="padding: 40px;">
                    <h2 style="margin: 0 0 20px; color: #1e293b; font-size: 20px;">
                        ¡Gracias {customer_name}!
                    </h2>
                    <p style="margin: 0 0 20px; color: #475569; font-size: 16px; line-height: 1.6;">
                        Hemos recibido tu orden. Aquí están los detalles:
                    </p>
                    <div style="background-color: #f1f5f9; border-radius: 12px; padding: 20px; margin: 20px 0;">
                        <table width="100%" cellpadding="5" cellspacing="0">
                            <tr>
                                <td style="color: #64748b; font-size: 14px;">Número de Orden:</td>
                                <td style="color: #1e293b; font-size: 14px; font-weight: bold;">{order_number}</td>
                            </tr>
                            <tr>
                                <td style="color: #64748b; font-size: 14px;">Fecha de Pickup:</td>
                                <td style="color: #1e293b; font-size: 14px; font-weight: bold;">{pickup_date or 'Por confirmar'}</td>
                            </tr>
                            <tr>
                                <td style="color: #64748b; font-size: 14px;">Horario:</td>
                                <td style="color: #1e293b; font-size: 14px; font-weight: bold;">{pickup_time or 'Por confirmar'}</td>
                            </tr>
                            <tr>
                                <td style="color: #64748b; font-size: 14px;">Dirección:</td>
                                <td style="color: #1e293b; font-size: 14px;">{address or 'Por confirmar'}</td>
                            </tr>
                        </table>
                    </div>
                    <p style="margin: 20px 0 0; color: #475569; font-size: 14px; line-height: 1.6;">
                        Te notificaremos cuando recojamos tu ropa y cuando esté lista para entrega.
                    </p>
                </td>
            </tr>
            <tr>
                <td style="padding: 20px 40px; background-color: #f8fafc; border-top: 1px solid #e2e8f0;">
                    <p style="margin: 0; color: #94a3b8; font-size: 12px; text-align: center;">
                        © 2026 Ventura Fresh Laundry. 5722 Telephone Rd #5, Ventura, CA 93003
                    </p>
                </td>
            </tr>
        </table>
    </body>
    </html>
    """

def get_order_confirmation_sms(customer_name: str, order_number: str, pickup_date: str) -> str:
    """Generate order confirmation SMS"""
    date_text = f" para el {pickup_date}" if pickup_date else ""
    return f"Hola {customer_name}! Tu orden {order_number} ha sido recibida{date_text}. Te avisaremos cuando recojamos tu ropa. Ventura Fresh Laundry"

# ==================== NOTIFICATION DISPATCHER ====================

async def notify_order_created(customer: dict, order: dict):
    """Send notifications when order is created"""
    customer_name = customer.get("name", "Cliente")
    order_number = order.get("order_number", "")
    pickup_date = order.get("pickup_date", "")
    pickup_time = order.get("pickup_time_window", "")
    address = order.get("pickup_address", "")
    
    tasks = []
    
    # Email notification
    if customer.get("email"):
        email_html = get_order_confirmation_email(customer_name, order_number, pickup_date, pickup_time, address)
        tasks.append(send_email(
            customer["email"],
            f"Confirmación de Orden {order_number} - Ventura Fresh Laundry",
            email_html
        ))
    
    # SMS notification
    if customer.get("phone"):
        sms_text = get_order_confirmation_sms(customer_name, order_number, pickup_date)
        tasks.append(send_sms(customer["phone"], sms_text))
    
    if tasks:
        await asyncio.gather(*tasks, return_exceptions=True)

async def notify_order_status_changed(customer: dict, order: dict, new_status: str):
    """Send notifications when order status changes"""
    status_labels = {
        "new": "Nueva",
        "processing": "Procesando",
        "ready": "Lista para entrega",
        "out_for_delivery": "En camino",
        "delivered": "Entregada",
        "completed": "Completada",
        "cancelled": "Cancelada"
    }
    
    customer_name = customer.get("name", "Cliente")
    order_number = order.get("order_number", "")
    status_label = status_labels.get(new_status, new_status)
    
    tasks = []
    
    # Email notification
    if customer.get("email"):
        email_html = get_order_status_email(customer_name, order_number, new_status, status_label)
        tasks.append(send_email(
            customer["email"],
            f"Actualización de Orden {order_number} - {status_label}",
            email_html
        ))
    
    # SMS notification
    if customer.get("phone"):
        sms_text = get_order_status_sms(customer_name, order_number, status_label)
        tasks.append(send_sms(customer["phone"], sms_text))
    
    if tasks:
        await asyncio.gather(*tasks, return_exceptions=True)
