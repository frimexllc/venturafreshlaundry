"""
Customer Authentication endpoints — with email verification BEFORE account creation
"""
from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks
from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime, timezone, timedelta
import uuid
import hashlib
import secrets
import logging
import random
import string
import os

from database import db
from auth import hash_password, verify_password, create_customer_token, get_current_customer
from utils import create_audit_log

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["Customer Auth"])


# ==================== Pydantic Models ====================

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


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    password: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


# ─── Email Verification Models ─────────────────────────────────────────────────

class InitiateRegistrationRequest(BaseModel):
    name: str
    email: EmailStr
    password: str
    phone: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    zip_code: Optional[str] = None


class InitiateRegistrationResponse(BaseModel):
    temp_token: str
    user_data: dict
    message: str


class VerifyEmailRegistrationRequest(BaseModel):
    email: str
    code: str
    temp_token: str


class SendVerificationRequest(BaseModel):
    email: str


class VerifyEmailRequest(BaseModel):
    email: str
    code: str


# ==================== Helper Functions ====================

def _generate_verification_code(length: int = 6) -> str:
    """Generate a numeric verification code."""
    return "".join(random.choices(string.digits, k=length))


def _generate_temp_token() -> str:
    """Generate a temporary token for pending registration."""
    return secrets.token_urlsafe(32)


async def _send_verification_email(email: str, code: str, customer_name: str = "") -> bool:
    """Send verification email using the notifications module."""
    try:
        from notifications import send_email
        first_name = customer_name.split()[0] if customer_name else "there"
        subject = f"Your Ventura Fresh Laundry verification code: {code}"
        body = f"""Hi {first_name}!

Welcome to Ventura Fresh Laundry 🧺

Your email verification code is:

    ┌─────────────┐
    │   {code}   │
    └─────────────┘

This code expires in 15 minutes.

If you didn't create an account, you can safely ignore this email.

— The Ventura Fresh Laundry team
  venturafreshlaundry.com · (820) 234-8181
"""
        return await send_email(email, subject, body)
    except Exception as e:
        logger.error(f"Verification email failed for {email}: {e}")
        return False


# ==================== Core registration logic (shared) ====================

async def _initiate_registration_logic(
    data: InitiateRegistrationRequest,
    background_tasks: BackgroundTasks,
) -> dict:
    """
    Shared logic for initiate-registration and the /register alias.
    Creates a PENDING (not yet active) registration and sends a verification code.
    Returns the dict that both endpoints serialize.
    """
    email = data.email.lower().strip()

    # ── Check: email already verified ────────────────────────────────────────
    existing = await db.customers.find_one({"email": email, "email_verified": True})
    if existing and existing.get("password_hash"):
        raise HTTPException(
            status_code=400,
            detail="Email already registered and verified. Please login.",
        )

    # ── Check: existing pending registration ──────────────────────────────────
    pending = await db.pending_registrations.find_one({"email": email})
    if pending:
        created_at = pending.get("created_at", "")
        try:
            created_dt = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
            if datetime.now(timezone.utc) - created_dt > timedelta(hours=1):
                # Expired — clean it up and proceed
                await db.pending_registrations.delete_one({"email": email})
                await db.email_verifications.delete_many({"email": email})
            else:
                raise HTTPException(
                    status_code=429,
                    detail="A verification is already pending for this email. Please check your inbox or wait 1 hour.",
                )
        except ValueError:
            await db.pending_registrations.delete_one({"email": email})
            await db.email_verifications.delete_many({"email": email})

    # ── Build full address WITHOUT duplication ─────────────────────────────────
    street = data.address or ""
    city = data.city or ""
    state = data.state or ""
    zip_code = data.zip_code or ""

    # Si la dirección ya contiene ciudad, estado o zip, no los vuelvas a concatenar
    address_parts = []
    if street:
        address_parts.append(street)
    # Solo agregar ciudad/estado/zip si no están ya incluidos en 'street'
    street_lower = street.lower()
    for component, value in [("city", city), ("state", state), ("zip", zip_code)]:
        if value and value.lower() not in street_lower:
            address_parts.append(value)
    full_address = ", ".join(address_parts) if address_parts else None

    # ── Create temp token ─────────────────────────────────────────────────────
    temp_token = _generate_temp_token()
    token_hash = hashlib.sha256(temp_token.encode()).hexdigest()

    # ── Insert pending registration ───────────────────────────────────────────
    now = datetime.now(timezone.utc).isoformat()
    code = _generate_verification_code()
    code_expires_at = (datetime.now(timezone.utc) + timedelta(minutes=15)).isoformat()

    pending_registration = {
        "id": str(uuid.uuid4()),
        "email": email,
        "temp_token_hash": token_hash,
        "name": data.name,
        "password_hash": hash_password(data.password),
        "phone": data.phone,
        "address": full_address,
        "city": city,
        "state": state,
        "zip_code": zip_code,
        "created_at": now,
        "expires_at": (datetime.now(timezone.utc) + timedelta(hours=24)).isoformat(),
        "verified": False,
        "verification_code": code,
        "code_expires_at": code_expires_at,
    }
    await db.pending_registrations.insert_one(pending_registration)

    # ── Insert verification code record ───────────────────────────────────────
    await db.email_verifications.insert_one({
        "id": str(uuid.uuid4()),
        "email": email,
        "code": code,
        "used": False,
        "invalidated": False,
        "pending_registration_id": pending_registration["id"],
        "created_at": now,
        "expires_at": code_expires_at,
    })

    # ── Send email in background ──────────────────────────────────────────────
    background_tasks.add_task(_send_verification_email, email, code, data.name)

    user_data = {
        "name": data.name,
        "email": email,
        "phone": data.phone,
        "address": full_address,
        "city": city,
        "state": state,
        "zip_code": zip_code,
    }

    return {
        "temp_token": temp_token,
        "user_data": user_data,
        "message": "Verification code sent. Please verify your email to complete registration.",
    }


# ==================== Registration endpoints ====================

@router.post("/customer/auth/initiate-registration", response_model=InitiateRegistrationResponse)
async def initiate_registration(
    data: InitiateRegistrationRequest,
    background_tasks: BackgroundTasks,
):
    """
    STEP 1: Start registration.
    Creates a PENDING record (not an active account yet).
    The user must verify their email before the account is created.
    """
    result = await _initiate_registration_logic(data, background_tasks)
    return InitiateRegistrationResponse(**result)


@router.post("/customer/auth/register", response_model=InitiateRegistrationResponse)
async def register_alias(
    data: InitiateRegistrationRequest,
    background_tasks: BackgroundTasks,
):
    """
    ALIAS for /initiate-registration — kept for backwards compatibility.
    """
    result = await _initiate_registration_logic(data, background_tasks)
    return InitiateRegistrationResponse(**result)


@router.post("/customer/auth/verify-email-registration")
async def verify_email_registration(data: VerifyEmailRegistrationRequest):
    """STEP 2: Verify email and CREATE the real customer account."""
    email = data.email.lower().strip()
    code = data.code.strip()
    temp_token = data.temp_token

    if not email or not code or not temp_token:
        raise HTTPException(status_code=400, detail="Email, code and temp token are required")

    token_hash = hashlib.sha256(temp_token.encode()).hexdigest()
    pending = await db.pending_registrations.find_one({
        "email": email,
        "temp_token_hash": token_hash,
        "verified": False,
    })
    if not pending:
        raise HTTPException(
            status_code=400,
            detail="Invalid or expired registration session. Please start over.",
        )

    expires_at = pending.get("expires_at", "")
    if expires_at:
        try:
            exp_dt = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
            if datetime.now(timezone.utc) > exp_dt:
                await db.pending_registrations.delete_one({"id": pending["id"]})
                raise HTTPException(
                    status_code=400,
                    detail="Registration session expired. Please start over.",
                )
        except ValueError:
            pass

    verification = await db.email_verifications.find_one({
        "email": email,
        "code": code,
        "used": False,
        "invalidated": False,
        "pending_registration_id": pending["id"],
    })
    if not verification:
        raise HTTPException(
            status_code=400,
            detail="Invalid verification code. Please request a new one.",
        )

    code_expires_at = verification.get("expires_at", "")
    if code_expires_at:
        try:
            exp_dt = datetime.fromisoformat(code_expires_at.replace("Z", "+00:00"))
            if datetime.now(timezone.utc) > exp_dt:
                raise HTTPException(
                    status_code=400,
                    detail="Verification code expired. Please request a new one.",
                )
        except ValueError:
            pass

    now = datetime.now(timezone.utc).isoformat()
    await db.email_verifications.update_one(
        {"id": verification["id"]},
        {"$set": {"used": True, "verified_at": now}},
    )

    customer_id = str(uuid.uuid4())
    customer = {
        "id": customer_id,
        "name": pending["name"],
        "email": email,
        "phone": pending.get("phone"),
        "address": pending.get("address"),
        "city": pending.get("city"),
        "state": pending.get("state"),
        "zip_code": pending.get("zip_code"),
        "preferred_contact": "email",
        "notes": None,
        "status": "active",
        "total_orders": 0,
        "password_hash": pending["password_hash"],
        "email_verified": True,
        "email_verified_at": now,
        "created_at": now,
        "updated_at": now,
    }
    await db.customers.insert_one(customer)
    await create_audit_log(
        "CUSTOMER_REGISTERED_AND_VERIFIED", "customer", customer_id, None, {"source": "portal"}
    )

    await db.pending_registrations.update_one(
        {"id": pending["id"]},
        {"$set": {"verified": True, "verified_at": now, "customer_id": customer_id}},
    )

    token = create_customer_token(customer_id, email)
    customer_data = {k: v for k, v in customer.items() if k not in ["password_hash", "_id"]}

    return {
        "access_token": token,
        "token_type": "bearer",
        "customer": customer_data,
        "message": "Email verified and account created successfully!",
    }


@router.post("/customer/auth/send-verification")
async def send_verification(data: SendVerificationRequest, background_tasks: BackgroundTasks):
    """Resend verification code for a pending registration."""
    email = data.email.lower().strip()
    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="Invalid email")

    pending = await db.pending_registrations.find_one({"email": email, "verified": False})
    if not pending:
        raise HTTPException(
            status_code=404,
            detail="No pending registration found for this email. Please start over.",
        )

    expires_at = pending.get("expires_at", "")
    if expires_at:
        try:
            exp_dt = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
            if datetime.now(timezone.utc) > exp_dt:
                await db.pending_registrations.delete_one({"id": pending["id"]})
                raise HTTPException(
                    status_code=400,
                    detail="Registration session expired. Please start over.",
                )
        except ValueError:
            pass

    existing = await db.email_verifications.find_one(
        {"email": email, "used": False, "invalidated": False, "pending_registration_id": pending["id"]},
        sort=[("created_at", -1)],
    )
    if existing:
        created_at = existing.get("created_at", "")
        try:
            dt = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
            elapsed = (datetime.now(timezone.utc) - dt).total_seconds()
            if elapsed < 60:
                raise HTTPException(
                    status_code=429,
                    detail=f"Please wait {int(60 - elapsed)} seconds before requesting a new code.",
                )
        except ValueError:
            pass

    await db.email_verifications.update_many(
        {"email": email, "pending_registration_id": pending["id"], "used": False},
        {"$set": {"used": True, "invalidated": True}},
    )

    code = _generate_verification_code()
    now = datetime.now(timezone.utc).isoformat()
    code_expires_at = (datetime.now(timezone.utc) + timedelta(minutes=15)).isoformat()

    await db.email_verifications.insert_one({
        "id": str(uuid.uuid4()),
        "email": email,
        "code": code,
        "used": False,
        "invalidated": False,
        "pending_registration_id": pending["id"],
        "created_at": now,
        "expires_at": code_expires_at,
    })

    await db.pending_registrations.update_one(
        {"id": pending["id"]},
        {"$set": {"verification_code": code, "code_expires_at": code_expires_at}},
    )

    background_tasks.add_task(_send_verification_email, email, code, pending.get("name", ""))

    return {"ok": True, "message": "Verification code sent", "expires_in_seconds": 900}


@router.post("/customer/auth/resend-verification")
async def resend_verification(data: SendVerificationRequest, background_tasks: BackgroundTasks):
    """Alias for /send-verification"""
    return await send_verification(data, background_tasks)


# ==================== Login ====================

@router.post("/customer/auth/login", response_model=CustomerAuthResponse)
async def customer_login(data: CustomerLogin):
    """Customer login — only verified accounts can access."""
    customer = await db.customers.find_one({"email": data.email.lower()})
    if not customer:
        raise HTTPException(status_code=401, detail="Invalid email or password")

    if not customer.get("email_verified", False):
        pending = await db.pending_registrations.find_one({"email": data.email.lower()})
        if pending:
            raise HTTPException(
                status_code=401,
                detail="Please verify your email first. Check your inbox for the verification code.",
            )
        else:
            raise HTTPException(
                status_code=401,
                detail="Account not verified. Please register again.",
            )

    if not customer.get("password_hash"):
        raise HTTPException(status_code=401, detail="Please register an account first")

    if not verify_password(data.password, customer["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    customer_data = {k: v for k, v in customer.items() if k not in ["_id", "password_hash"]}
    token = create_customer_token(customer["id"], customer["email"])

    return CustomerAuthResponse(access_token=token, token_type="bearer", customer=customer_data)


# ==================== Password Management ====================

@router.post("/customer/auth/forgot-password")
async def forgot_password(data: ForgotPasswordRequest):
    """Send password reset link via email."""
    customer = await db.customers.find_one({"email": data.email.lower()})
    if not customer or not customer.get("email_verified", False):
        return {"ok": True, "detail": "If the email exists, a reset link has been sent."}

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

    frontend_url = (
        os.environ.get("FRONTEND_URL")
        or os.environ.get("REACT_APP_BACKEND_URL")
        or os.environ.get("BUSINESS_WEBSITE", "")
    )
    reset_url = f"{frontend_url}/account/login?reset={raw_token}"

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
        await send_email(
            data.email.lower(),
            "Restablecer contraseña — Ventura Fresh Laundry",
            f"Hola {customer_name}, usa este enlace para restablecer tu contraseña: {reset_url} (expira en 1 hora)",
            html,
        )
    except Exception as exc:
        logger.error(f"Password reset email error: {exc}")

    return {"ok": True, "detail": "If the email exists, a reset link has been sent."}


@router.post("/customer/auth/reset-password")
async def reset_password(data: ResetPasswordRequest):
    """Reset password using the token from the email link."""
    token_hash = hashlib.sha256(data.token.encode()).hexdigest()
    record = await db.password_resets.find_one({"token_hash": token_hash, "used": False})
    if not record:
        raise HTTPException(status_code=400, detail="Invalid or expired reset link")

    if record.get("expires_at", "") < datetime.now(timezone.utc).isoformat():
        raise HTTPException(status_code=400, detail="Reset link has expired")

    if len(data.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")

    email = record["email"]
    new_hash = hash_password(data.password)

    result = await db.customers.update_many(
        {"email": {"$regex": f"^{email}$", "$options": "i"}},
        {"$set": {"password_hash": new_hash, "updated_at": datetime.now(timezone.utc).isoformat()}},
    )

    await db.password_resets.update_one(
        {"token_hash": token_hash},
        {"$set": {"used": True, "used_at": datetime.now(timezone.utc).isoformat()}},
    )

    logger.info(f"Password reset for {email}: {result.modified_count} records updated")
    return {"ok": True, "detail": "Password has been reset successfully"}


@router.post("/customer/auth/change-password")
async def change_password(
    data: ChangePasswordRequest,
    current_customer: dict = Depends(get_current_customer),
):
    """Authenticated customer changes their own password."""
    if len(data.new_password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")

    customer_doc = await db.customers.find_one({"id": current_customer["id"]})
    if not customer_doc:
        raise HTTPException(status_code=404, detail="Customer not found")

    if not customer_doc.get("password_hash"):
        raise HTTPException(
            status_code=400,
            detail="No password set. Use 'Forgot Password' to create one.",
        )

    if not verify_password(data.current_password, customer_doc["password_hash"]):
        raise HTTPException(status_code=401, detail="Current password is incorrect")

    new_hash = hash_password(data.new_password)
    now = datetime.now(timezone.utc).isoformat()

    await db.customers.update_many(
        {"email": {"$regex": f"^{current_customer['email']}$", "$options": "i"}},
        {"$set": {"password_hash": new_hash, "updated_at": now}},
    )

    return {"ok": True, "detail": "Password changed successfully"}


# ==================== Scheduled cleanup ====================

async def cleanup_expired_pending_registrations():
    """Delete expired pending registrations and their verification codes."""
    now = datetime.now(timezone.utc).isoformat()
    deleted_regs = await db.pending_registrations.delete_many({
        "expires_at": {"$lt": now},
        "verified": False,
    })
    deleted_codes = await db.email_verifications.delete_many({
        "expires_at": {"$lt": now},
        "used": False,
    })
    logger.info(
        f"Cleanup: removed {deleted_regs.deleted_count} pending registrations "
        f"and {deleted_codes.deleted_count} expired codes"
    )