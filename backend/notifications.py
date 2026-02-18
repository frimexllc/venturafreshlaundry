"""
Notification services using Twilio for SMS and WhatsApp
"""
import os
import logging
from twilio.rest import Client

logger = logging.getLogger(__name__)

# Twilio configuration
TWILIO_ACCOUNT_SID = os.environ.get('TWILIO_ACCOUNT_SID')
TWILIO_AUTH_TOKEN = os.environ.get('TWILIO_AUTH_TOKEN')
TWILIO_PHONE_NUMBER = os.environ.get('TWILIO_PHONE_NUMBER')
TWILIO_WHATSAPP_NUMBER = os.environ.get('TWILIO_WHATSAPP_NUMBER', 'whatsapp:+18055154030')
BUSINESS_NAME = os.environ.get('BUSINESS_NAME', 'Ventura Fresh Laundromat')

# Initialize Twilio client
twilio_client = None
if TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN:
    try:
        twilio_client = Client(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
        logger.info("Twilio client initialized successfully")
    except Exception as e:
        logger.error(f"Failed to initialize Twilio client: {e}")


def format_phone(phone: str) -> str:
    """Format phone number for Twilio"""
    if not phone:
        return None
    # Remove spaces, dashes, parentheses
    cleaned = ''.join(c for c in phone if c.isdigit() or c == '+')
    # Add +1 if missing country code
    if not cleaned.startswith('+'):
        if cleaned.startswith('1') and len(cleaned) == 11:
            cleaned = '+' + cleaned
        elif len(cleaned) == 10:
            cleaned = '+1' + cleaned
    return cleaned


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


async def send_whatsapp(to_phone: str, message: str) -> bool:
    """Send WhatsApp message via Twilio"""
    if not twilio_client:
        logger.warning("Twilio not configured for WhatsApp")
        return False
    
    try:
        formatted_phone = format_phone(to_phone)
        if not formatted_phone:
            logger.error("Invalid phone number")
            return False
        
        msg = twilio_client.messages.create(
            body=f"{BUSINESS_NAME}: {message}",
            from_=TWILIO_WHATSAPP_NUMBER,
            to=f"whatsapp:{formatted_phone}"
        )
        logger.info(f"WhatsApp sent successfully: {msg.sid}")
        return True
    except Exception as e:
        logger.error(f"Failed to send WhatsApp: {e}")
        return False


async def send_email(to_email: str, subject: str, body: str) -> bool:
    """Send email - placeholder for future implementation"""
    logger.info(f"Email would be sent to {to_email}: {subject}")
    return True


async def notify_order_created(customer: dict, order: dict) -> bool:
    """Notify customer when order is created"""
    phone = customer.get('phone')
    if not phone:
        return False
    
    order_number = order.get('order_number', order.get('id', 'N/A'))
    message = f"Your order #{order_number} has been received! We'll notify you when it's ready. Thank you for choosing us!"
    
    # Try WhatsApp first, fall back to SMS
    sent = await send_whatsapp(phone, message)
    if not sent:
        sent = await send_sms(phone, message)
    return sent


async def notify_order_status_changed(customer: dict, order: dict, new_status: str) -> bool:
    """Notify customer when order status changes to ready or out_for_delivery"""
    phone = customer.get('phone')
    if not phone:
        return False
    
    order_number = order.get('order_number', order.get('id', 'N/A'))
    
    # Only notify for specific statuses
    if new_status == 'ready':
        message = f"Great news! Your order #{order_number} is READY for pickup! Visit us at your convenience."
    elif new_status == 'out_for_delivery':
        message = f"Your order #{order_number} is OUT FOR DELIVERY! Our driver is on the way. Please be ready to receive it."
    elif new_status == 'delivered':
        message = f"Your order #{order_number} has been DELIVERED! Thank you for choosing {BUSINESS_NAME}!"
    else:
        return False  # Don't notify for other statuses
    
    # Try WhatsApp first, fall back to SMS
    sent = await send_whatsapp(phone, message)
    if not sent:
        sent = await send_sms(phone, message)
    return sent
