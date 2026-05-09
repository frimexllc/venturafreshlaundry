"""Customer & Preference endpoints — admin/operator facing"""
from fastapi import APIRouter, HTTPException, Depends, Query
from typing import List, Optional
from datetime import datetime, timezone
import uuid

from database import db
from models import (
    CustomerCreate, CustomerResponse,
    PreferenceCreate,
    PreferenceResponse,
    CustomerPreferenceUpdate,
)
from auth import get_current_user
from utils import (
    normalize_email, normalize_phone, normalize_address, normalize_spaces,
    normalize_name, normalize_preference_dict, normalize_preference_payload,
    create_audit_log,
)

router = APIRouter(prefix="/api", tags=["Customers"])


# ── Customers ────────────────────────────────────────────────────────

@router.post("/customers", response_model=CustomerResponse)
async def create_customer(data: CustomerCreate, current_user: dict = Depends(get_current_user)):
    customer_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    customer = {
        "id": customer_id,
        "name": normalize_name(data.name) or data.name,
        "email": normalize_email(data.email) if data.email else None,
        "phone": normalize_phone(data.phone) or data.phone,
        "address": normalize_address(data.address) or data.address,
        "preferred_contact": normalize_spaces(data.preferred_contact) or data.preferred_contact,
        "notes": normalize_spaces(data.notes),
        "status": "active",
        "total_orders": 0,
        "membership_plan": normalize_spaces(data.membership_plan),
        "membership_status": normalize_spaces(data.membership_status),
        "membership_start_date": data.membership_start_date,
        "preferences_id": data.preferences_id,
        "created_at": now,
        "updated_at": now,
    }
    await db.customers.insert_one(customer)
    await create_audit_log("CUSTOMER_CREATED", "customer", customer_id, current_user["id"])
    customer.pop("_id", None)
    return CustomerResponse(**customer)


@router.get("/customers", response_model=List[CustomerResponse])
async def get_customers(
    search: Optional[str] = None,
    status: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    current_user: dict = Depends(get_current_user),
):
    query = {}
    if search:
        query["$or"] = [
            {"name": {"$regex": search, "$options": "i"}},
            {"email": {"$regex": search, "$options": "i"}},
            {"phone": {"$regex": search, "$options": "i"}},
        ]
    if status:
        query["status"] = status

    skip = (page - 1) * page_size
    customers = (
        await db.customers.find(query, {"_id": 0})
        .sort("created_at", -1)
        .skip(skip)
        .limit(page_size)
        .to_list(page_size)
    )
    return [CustomerResponse(**c) for c in customers]


@router.get("/customers/{customer_id}", response_model=CustomerResponse)
async def get_customer(customer_id: str, current_user: dict = Depends(get_current_user)):
    customer = await db.customers.find_one({"id": customer_id}, {"_id": 0})
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    return CustomerResponse(**customer)


@router.put("/customers/{customer_id}", response_model=CustomerResponse)
async def update_customer(
    customer_id: str,
    data: CustomerCreate,
    current_user: dict = Depends(get_current_user),
):
    update_data = data.model_dump(exclude_unset=True)
    if "name" in update_data:
        update_data["name"] = normalize_name(update_data["name"]) or update_data["name"]
    if "email" in update_data and update_data["email"]:
        update_data["email"] = normalize_email(update_data["email"]) or update_data["email"].lower()
    if "phone" in update_data:
        update_data["phone"] = normalize_phone(update_data["phone"]) or update_data["phone"]
    if "address" in update_data:
        update_data["address"] = normalize_address(update_data["address"]) or update_data["address"]
    if "preferred_contact" in update_data:
        update_data["preferred_contact"] = (
            normalize_spaces(update_data["preferred_contact"]) or update_data["preferred_contact"]
        )
    if "notes" in update_data:
        update_data["notes"] = normalize_spaces(update_data["notes"])
    if "membership_plan" in update_data:
        update_data["membership_plan"] = normalize_spaces(update_data["membership_plan"])
    if "membership_status" in update_data:
        update_data["membership_status"] = normalize_spaces(update_data["membership_status"])

    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    result = await db.customers.update_one({"id": customer_id}, {"$set": update_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Customer not found")

    await create_audit_log("CUSTOMER_UPDATED", "customer", customer_id, current_user["id"])
    customer = await db.customers.find_one({"id": customer_id}, {"_id": 0})
    return CustomerResponse(**customer)


@router.delete("/customers/{customer_id}")
async def delete_customer(customer_id: str, current_user: dict = Depends(get_current_user)):
    result = await db.customers.delete_one({"id": customer_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Customer not found")
    await create_audit_log("CUSTOMER_DELETED", "customer", customer_id, current_user["id"])
    return {"message": "Customer deleted"}


# ── Preferences ──────────────────────────────────────────────────────

@router.post("/preferences", response_model=PreferenceResponse)
async def create_preference(data: PreferenceCreate, current_user: dict = Depends(get_current_user)):
    existing = await db.preferences.find_one(
        {"customer_id": data.customer_id},
        sort=[("version", -1)],
        projection={"_id": 0, "version": 1},
    )
    version = ((existing or {}).get("version", 0) + 1)

    pref_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    normalized = normalize_preference_payload(data)
    pref = {
        "id": pref_id,
        "customer_id": data.customer_id,
        **normalized,
        "version": version,
        "created_at": now,
        "updated_at": now,
    }
    await db.preferences.insert_one(pref)
    await db.customers.update_one(
        {"id": data.customer_id},
        {"$set": {"preferences_id": pref_id, "updated_at": now}},
    )
    await create_audit_log("PREFERENCE_CREATED", "preference", pref_id, current_user["id"])
    return PreferenceResponse(**pref)


@router.get("/preferences/customer/{customer_id}", response_model=PreferenceResponse)
async def get_customer_preference(customer_id: str, current_user: dict = Depends(get_current_user)):
    pref = (
        await db.preferences.find({"customer_id": customer_id}, {"_id": 0})
        .sort("version", -1)
        .limit(1)
        .to_list(1)
    )
    if not pref:
        raise HTTPException(status_code=404, detail="Preferences not found")
    return PreferenceResponse(**pref[0])