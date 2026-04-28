"""Customer Authentication endpoints — extracted from server_core.py"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime, timezone, timedelta
import uuid
import hashlib
import secrets
import logging

from database import db
from auth import hash_password, verify_password, create_customer_token, get_current_customer
from utils import create_audit_log

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["Customer Auth"])


class CustomerRegister(BaseModel):
    name: str
    email: EmailStr
    password: str
    phone: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    zip_code: Optional[str] = None


class CustomerLogin(BaseModel):
    email: EmailStr
    password: str


class CustomerAuthResponse(BaseModel):
    access_token: str
    token_type: str
    customer: dict


@router.post("/customer/auth/register", response_model=CustomerAuthResponse)
async def customer_register(data: CustomerRegister):
    """Register a new customer account"""
    # Build address string from parts
    addr_parts = [p for p in [data.address, data.city, data.state, data.zip_code] if p]
    full_address = ", ".join(addr_parts) if addr_parts else None

    existing = await db.customers.find_one({"email": data.email.lower()})
    if existing:
        if existing.get("password_hash"):
            raise HTTPException(status_code=400, detail="Email already registered. Please login.")
        update_fields = {
            "password_hash": hash_password(data.password),
            "name": data.name,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        if data.phone:
            update_fields["phone"] = data.phone
        if full_address:
            update_fields["address"] = full_address
        if data.city:
            update_fields["city"] = data.city
        if data.state:
            update_fields["state"] = data.state
        if data.zip_code:
            update_fields["zip_code"] = data.zip_code
        await db.customers.update_one(
            {"email": data.email.lower()},
            {"$set": update_fields},
        )
        customer = await db.customers.find_one({"email": data.email.lower()}, {"_id": 0, "password_hash": 0})
    else:
        customer_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()
        customer = {
            "id": customer_id,
            "name": data.name,
            "email": data.email.lower(),
            "phone": data.phone,
            "address": full_address,
            "city": data.city,
            "state": data.state,
            "zip_code": data.zip_code,
            "preferred_contact": "email",
            "notes": None,
            "status": "active",
            "total_orders": 0,
            "password_hash": hash_password(data.password),
            "created_at": now,
            "updated_at": now,
        }
        await db.customers.insert_one(customer)
        await create_audit_log("CUSTOMER_REGISTERED", "customer", customer_id, None, {"source": "portal"})
        customer = {k: v for k, v in customer.items() if k not in ["password_hash", "_id"]}

    token = create_customer_token(customer["id"], customer["email"])

    # Backfill customer_email on orders that belong to this customer (by any linked ID)
    email_lower = data.email.lower()
    linked = await db.customers.find(
        {"email": {"$regex": f"^{email_lower}$", "$options": "i"}},
        {"_id": 0, "id": 1},
    ).to_list(20)
    linked_ids = [c["id"] for c in linked if c.get("id")]
    if linked_ids:
        await db.orders.update_many(
            {"customer_id": {"$in": linked_ids}, "$or": [{"customer_email": {"$exists": False}}, {"customer_email": ""}, {"customer_email": None}]},
            {"$set": {"customer_email": email_lower}},
        )

    return CustomerAuthResponse(access_token=token, token_type="bearer", customer=customer)


@router.post("/customer/auth/login", response_model=CustomerAuthResponse)
async def customer_login(data: CustomerLogin):
    """Customer login"""
    customer = await db.customers.find_one({"email": data.email.lower()})
    if not customer:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not customer.get("password_hash"):
        raise HTTPException(status_code=401, detail="Please register an account first")
    if not verify_password(data.password, customer["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    customer_data = {k: v for k, v in customer.items() if k not in ["_id", "password_hash"]}
    token = create_customer_token(customer["id"], customer["email"])

    # Backfill customer_email on orders missing it
    email_lower = data.email.lower()
    linked = await db.customers.find(
        {"email": {"$regex": f"^{email_lower}$", "$options": "i"}},
        {"_id": 0, "id": 1},
    ).to_list(20)
    linked_ids = [c["id"] for c in linked if c.get("id")]
    if linked_ids:
        await db.orders.update_many(
            {"customer_id": {"$in": linked_ids}, "$or": [{"customer_email": {"$exists": False}}, {"customer_email": ""}, {"customer_email": None}]},
            {"$set": {"customer_email": email_lower}},
        )

    return CustomerAuthResponse(access_token=token, token_type="bearer", customer=customer_data)


# NOTE: /customer/me and /customer/orders are defined in routes/customer.py
# with better cross-ID/email matching logic. Do NOT duplicate here.


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    password: str


@router.post("/customer/auth/forgot-password")
async def forgot_password(data: ForgotPasswordRequest):
    """Send password reset link via email."""
    import os
    customer = await db.customers.find_one({"email": data.email.lower()})
    if not customer:
        # Don't reveal if email exists
        return {"ok": True, "detail": "If the email exists, a reset link has been sent."}

    # Generate secure token
    raw_token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
    expires = (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()

    await db.password_resets.delete_many({"email": data.email.lower()})
    await db.password_resets.insert_one({
        "email": data.email.lower(),
        "token_hash": token_hash,
        "expires_at": expires,
        "used": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })

    # Build reset URL
    frontend_url = os.environ.get("FRONTEND_URL") or os.environ.get("REACT_APP_BACKEND_URL") or os.environ.get("BUSINESS_WEBSITE", "")
    reset_url = f"{frontend_url}/account/login?reset={raw_token}"

    # Send email via SendGrid
    try:
        from notifications import send_email
        customer_name = customer.get("name", "").split(" ")[0] or "Cliente"
        html = f"""
        <div style="font-family:system-ui,-apple-system,sans-serif;max-width:480px;margin:0 auto;padding:24px;">
            <div style="background:linear-gradient(135deg,#0284c7,#0ea5e9);border-radius:16px 16px 0 0;padding:28px 24px;text-align:center;">
                <h1 style="color:white;font-size:22px;margin:0;">Ventura Fresh Laundry</h1>
                <p style="color:rgba(255,255,255,0.75);font-size:13px;margin:6px 0 0;">Recuperación de contraseña</p>
            </div>
            <div style="background:#ffffff;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 16px 16px;padding:28px 24px;">
                <p style="color:#334155;font-size:15px;line-height:1.6;">Hola <strong>{customer_name}</strong>,</p>
                <p style="color:#64748b;font-size:14px;line-height:1.6;">
                    Recibimos una solicitud para restablecer tu contraseña. Haz clic en el botón de abajo para crear una nueva:
                </p>
                <div style="text-align:center;margin:24px 0;">
                    <a href="{reset_url}" style="display:inline-block;background:#0284c7;color:white;padding:14px 32px;border-radius:12px;text-decoration:none;font-weight:bold;font-size:14px;">
                        Restablecer contraseña
                    </a>
                </div>
                <p style="color:#94a3b8;font-size:12px;line-height:1.5;">
                    Este enlace expira en 1 hora. Si no solicitaste este cambio, puedes ignorar este correo.
                </p>
            </div>
        </div>
        """
        sent = await send_email(
            data.email.lower(),
            "Restablecer contraseña — Ventura Fresh Laundry",
            f"Hola {customer_name}, usa este enlace para restablecer tu contraseña: {reset_url} (expira en 1 hora)",
            html,
        )
        if not sent:
            logger.warning(f"Password reset email failed to {data.email}")
    except Exception as exc:
        logger.error(f"Password reset email error: {exc}")

    return {"ok": True, "detail": "If the email exists, a reset link has been sent."}


@router.post("/customer/auth/reset-password")
async def reset_password(data: ResetPasswordRequest):
    """Reset password using the token from the email link."""
    token_hash = hashlib.sha256(data.token.encode()).hexdigest()
    record = await db.password_resets.find_one({
        "token_hash": token_hash,
        "used": False,
    })
    if not record:
        raise HTTPException(status_code=400, detail="Invalid or expired reset link")

    if record.get("expires_at", "") < datetime.now(timezone.utc).isoformat():
        raise HTTPException(status_code=400, detail="Reset link has expired")

    if len(data.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")

    email = record["email"]
    new_hash = hash_password(data.password)

    # Update password on ALL customer records with this email
    result = await db.customers.update_many(
        {"email": {"$regex": f"^{email}$", "$options": "i"}},
        {"$set": {"password_hash": new_hash, "updated_at": datetime.now(timezone.utc).isoformat()}},
    )

    # Mark token as used
    await db.password_resets.update_one(
        {"token_hash": token_hash},
        {"$set": {"used": True, "used_at": datetime.now(timezone.utc).isoformat()}},
    )

    logger.info(f"Password reset for {email}: {result.modified_count} records updated")
    return {"ok": True, "detail": "Password has been reset successfully"}
