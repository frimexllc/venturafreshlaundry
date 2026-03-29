"""Customer Authentication endpoints — extracted from server_core.py"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, EmailStr
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
    existing = await db.customers.find_one({"email": data.email.lower()})
    if existing:
        if existing.get("password_hash"):
            raise HTTPException(status_code=400, detail="Email already registered. Please login.")
        await db.customers.update_one(
            {"email": data.email.lower()},
            {"$set": {
                "password_hash": hash_password(data.password),
                "name": data.name,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }},
        )
        customer = await db.customers.find_one({"email": data.email.lower()}, {"_id": 0, "password_hash": 0})
    else:
        customer_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()
        customer = {
            "id": customer_id,
            "name": data.name,
            "email": data.email.lower(),
            "phone": None,
            "address": None,
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


@router.get("/customer/me")
async def get_customer_profile(current_customer: dict = Depends(get_current_customer)):
    """Get current customer profile"""
    return current_customer


@router.get("/customer/orders")
async def get_customer_orders(current_customer: dict = Depends(get_current_customer)):
    """Get orders for the logged-in customer"""
    orders = await db.orders.find(
        {"customer_id": current_customer["id"]},
        {"_id": 0},
    ).sort("created_at", -1).to_list(100)
    return orders
