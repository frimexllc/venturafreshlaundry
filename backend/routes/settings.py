"""Notification Settings & Test endpoints — extracted from server_core.py"""
import os
import logging
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Depends
from pydantic import EmailStr

from database import db
from models import RulesUpdateRequest
from auth import get_current_user, require_admin
from utils import create_audit_log, get_or_seed_business_rules

logger = logging.getLogger(__name__)

try:
    from notifications import send_email, send_sms
    NOTIFICATIONS_ENABLED = True
except ImportError:
    NOTIFICATIONS_ENABLED = False
    logger.warning("Notification services not available for settings module")

router = APIRouter(prefix="/api", tags=["Settings"])


@router.get("/settings/notifications")
async def get_notification_settings(current_user: dict = Depends(get_current_user)):
    """Get notification service status"""
    return {
        "email_enabled": bool(os.environ.get('SENDGRID_API_KEY') and os.environ.get('SENDGRID_FROM_EMAIL')),
        "sms_enabled": bool(os.environ.get('TWILIO_ACCOUNT_SID') and os.environ.get('TWILIO_AUTH_TOKEN')),
        "voice_enabled": bool(os.environ.get('TWILIO_ACCOUNT_SID') and os.environ.get('TWILIO_AUTH_TOKEN') and os.environ.get('TWILIO_PHONE_NUMBER')),
        "notifications_available": NOTIFICATIONS_ENABLED,
    }


@router.get("/settings/rules")
async def get_business_rules(current_user: dict = Depends(get_current_user)):
    try:
        require_admin(current_user)
        rules = await get_or_seed_business_rules()
        return rules
    except Exception as e:
        logger.error(f"Error getting business rules: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/settings/rules")
async def update_business_rules(data: RulesUpdateRequest, current_user: dict = Depends(get_current_user)):
    require_admin(current_user)
    rules = data.rules or {}
    now = datetime.now(timezone.utc).isoformat()
    rules["updated_at"] = now
    rules.setdefault("id", "order_rules_v1")
    await db.reglas_negocio.update_one({"id": rules["id"]}, {"$set": rules}, upsert=True)
    await create_audit_log("RULES_UPDATED", "reglas_negocio", rules["id"], current_user["id"])
    return rules


@router.post("/test/email")
async def test_email_notification(to_email: EmailStr, current_user: dict = Depends(get_current_user)):
    """Test email notification"""
    if not NOTIFICATIONS_ENABLED:
        raise HTTPException(status_code=400, detail="Notifications not configured")
    result = await send_email(
        to_email,
        "Test - Ventura Fresh Laundry CRM",
        "<h1>Test Email</h1><p>Este es un correo de prueba del CRM.</p>",
    )
    return result


@router.post("/test/sms")
async def test_sms_notification(to_phone: str, current_user: dict = Depends(get_current_user)):
    """Test SMS notification"""
    if not NOTIFICATIONS_ENABLED:
        raise HTTPException(status_code=400, detail="Notifications not configured")
    result = await send_sms(to_phone, "Test: Este es un mensaje de prueba del CRM de Ventura Fresh Laundry.")
    return result
