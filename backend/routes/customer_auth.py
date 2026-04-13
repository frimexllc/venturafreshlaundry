"""Customer Authentication endpoints — extracted from server_core.py"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime, timezone
import uuid

from database import db
from auth import hash_password, verify_password, create_customer_token, get_current_customer
from utils import create_audit_log

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
    return CustomerAuthResponse(access_token=token, token_type="bearer", customer=customer_data)


# NOTE: /customer/me and /customer/orders are defined in routes/customer.py
# with better cross-ID/email matching logic. Do NOT duplicate here.
