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


async def send_email(to_email: str, subject: str, body: str) -> bool:
    """Send email - placeholder for future implementation"""
    logger.info(f"Email would be sent to {to_email}: {subject}")
    return True


async def notify_order_created(customer: dict, order: dict) -> bool:
    """Notify customer when order is created"""
    phone = customer.get('phone')
    if not phone:
        logger.warning("No phone number for customer")
        return False
    
    order_number = order.get('order_number', order.get('id', 'N/A'))
    message = f"Your order #{order_number} has been received! We'll notify you when it's ready. Thank you for choosing us!"
    
    return await send_sms(phone, message)


async def notify_order_status_changed(customer: dict, order: dict, new_status: str) -> bool:
    """Notify customer when order status changes to ready or out_for_delivery"""
    phone = customer.get('phone')
    if not phone:
        logger.warning(f"No phone number for customer in order status notification")
        return False
    
    order_number = order.get('order_number', order.get('id', 'N/A'))
    
    # Normalize status to lowercase for comparison
    status_lower = new_status.lower()
    
    # Only notify for specific statuses
    if status_lower == 'ready':
        message = f"Great news! Your order #{order_number} is READY for pickup! Visit us at your convenience."
    elif status_lower in ['out_for_delivery', 'out for delivery']:
        message = f"Your order #{order_number} is OUT FOR DELIVERY! Our driver is on the way. Please be ready to receive it."
    elif status_lower == 'delivered':
        message = f"Your order #{order_number} has been DELIVERED! Thank you for choosing {BUSINESS_NAME}!"
    else:
        logger.info(f"Status {new_status} does not require notification")
        return False
    
    logger.info(f"Sending notification for status {new_status} to {phone}")
    return await send_sms(phone, message)
