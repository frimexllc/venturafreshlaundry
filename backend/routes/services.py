"""Services & Memberships endpoints — extracted from server_core.py"""
from fastapi import APIRouter, HTTPException, Depends
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone
import uuid
import logging

from database import db
from models import (
    ServiceCreate, ServiceResponse,
    MembershipSectionUpdate, MembershipSectionResponse,
    MembershipPlanCreate, MembershipPlanResponse,
    MembershipSignupResponse, MembershipSignupUpdate,
    MembershipCustomerUpdate, CustomerResponse,
    PreferenceCreate,
)
from auth import get_current_user, require_admin
from utils import create_audit_log
from routes.customers import normalize_preference_payload

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["Services"])


# ==================== SERVICES ====================

@router.post("/services", response_model=ServiceResponse)
async def create_service(data: ServiceCreate, current_user: dict = Depends(get_current_user)):
    service_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    service = {
        "id": service_id,
        "name": data.name,
        "category": data.category,
        "description": data.description,
        "price": data.price,
        "price_unit": data.price_unit,
        "is_active": data.is_active,
        "sort_order": data.sort_order or 0,
        "created_at": now,
        "updated_at": now,
    }
    await db.services.insert_one(service)
    await create_audit_log("SERVICE_CREATED", "service", service_id, current_user["id"])
    return ServiceResponse(**service)


@router.get("/services", response_model=List[ServiceResponse])
async def get_services(
    active_only: bool = True,
    search: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    query = {}
    if active_only:
        query["is_active"] = True
    if search:
        query["$or"] = [
            {"name": {"$regex": search, "$options": "i"}},
            {"category": {"$regex": search, "$options": "i"}},
        ]
    services = await db.services.find(query, {"_id": 0}).sort([("sort_order", 1), ("created_at", -1)]).to_list(1000)
    return [ServiceResponse(**s) for s in services]


@router.get("/services/{service_id}", response_model=ServiceResponse)
async def get_service(service_id: str, current_user: dict = Depends(get_current_user)):
    service = await db.services.find_one({"id": service_id}, {"_id": 0})
    if not service:
        raise HTTPException(status_code=404, detail="Service not found")
    return ServiceResponse(**service)


@router.put("/services/{service_id}", response_model=ServiceResponse)
async def update_service(service_id: str, data: ServiceCreate, current_user: dict = Depends(get_current_user)):
    update_data = data.model_dump(exclude_unset=True)
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    update_data["sort_order"] = update_data.get("sort_order", 0) or 0
    result = await db.services.update_one({"id": service_id}, {"$set": update_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Service not found")
    await create_audit_log("SERVICE_UPDATED", "service", service_id, current_user["id"])
    service = await db.services.find_one({"id": service_id}, {"_id": 0})
    return ServiceResponse(**service)


@router.delete("/services/{service_id}")
async def delete_service(service_id: str, current_user: dict = Depends(get_current_user)):
    result = await db.services.delete_one({"id": service_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Service not found")
    await create_audit_log("SERVICE_DELETED", "service", service_id, current_user["id"])
    return {"message": "Service deleted"}


@router.get("/public/services", response_model=List[ServiceResponse])
async def get_public_services(active_only: bool = True):
    query = {}
    if active_only:
        query["is_active"] = True
    services = await db.services.find(query, {"_id": 0}).sort([("sort_order", 1), ("created_at", -1)]).to_list(1000)
    return [ServiceResponse(**s) for s in services]


# ==================== MEMBERSHIP SECTION (services/membership-*) ====================

@router.get("/services/membership-section", response_model=MembershipSectionResponse)
async def get_membership_section(current_user: dict = Depends(get_current_user)):
    section = await db.membership_section.find_one({"id": "default"}, {"_id": 0})
    if not section:
        section = _default_membership_section()
        await db.membership_section.insert_one(section)
    return MembershipSectionResponse(**section)


@router.put("/services/membership-section", response_model=MembershipSectionResponse)
async def update_membership_section(data: MembershipSectionUpdate, current_user: dict = Depends(get_current_user)):
    now = datetime.now(timezone.utc).isoformat()
    update_data = data.model_dump(exclude_unset=True)
    update_data["updated_at"] = now
    await db.membership_section.update_one(
        {"id": "default"},
        {"$set": update_data, "$setOnInsert": {"id": "default", "created_at": now}},
        upsert=True,
    )
    section = await db.membership_section.find_one({"id": "default"}, {"_id": 0})
    await create_audit_log("MEMBERSHIP_SECTION_UPDATED", "membership_section", "default", current_user["id"])
    return MembershipSectionResponse(**section)


@router.post("/services/membership-plans", response_model=MembershipPlanResponse)
async def create_membership_plan(data: MembershipPlanCreate, current_user: dict = Depends(get_current_user)):
    plan_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    plan = {
        "id": plan_id,
        "name": data.name,
        "price": data.price,
        "image_url": data.image_url,
        "features": data.features,
        "is_popular": data.is_popular,
        "is_active": data.is_active,
        "sort_order": data.sort_order or 0,
        "created_at": now,
        "updated_at": now,
    }
    await db.membership_plans.insert_one(plan)
    await create_audit_log("MEMBERSHIP_PLAN_CREATED", "membership_plan", plan_id, current_user["id"])
    return MembershipPlanResponse(**plan)


@router.get("/services/membership-plans", response_model=List[MembershipPlanResponse])
async def get_membership_plans(active_only: bool = True, current_user: dict = Depends(get_current_user)):
    query = {}
    if active_only:
        query["is_active"] = True
    plans = await db.membership_plans.find(query, {"_id": 0}).sort([("sort_order", 1), ("created_at", -1)]).to_list(200)
    if len(plans) == 0:
        plans = _seed_membership_plans()
        await db.membership_plans.insert_many(plans)
    return [MembershipPlanResponse(**p) for p in plans]


@router.put("/services/membership-plans/{plan_id}", response_model=MembershipPlanResponse)
async def update_membership_plan(plan_id: str, data: MembershipPlanCreate, current_user: dict = Depends(get_current_user)):
    update_data = data.model_dump(exclude_unset=True)
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    update_data["sort_order"] = update_data.get("sort_order", 0) or 0
    result = await db.membership_plans.update_one({"id": plan_id}, {"$set": update_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Plan not found")
    await create_audit_log("MEMBERSHIP_PLAN_UPDATED", "membership_plan", plan_id, current_user["id"])
    plan = await db.membership_plans.find_one({"id": plan_id}, {"_id": 0})
    return MembershipPlanResponse(**plan)


@router.delete("/services/membership-plans/{plan_id}")
async def delete_membership_plan(plan_id: str, current_user: dict = Depends(get_current_user)):
    result = await db.membership_plans.delete_one({"id": plan_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Plan not found")
    await create_audit_log("MEMBERSHIP_PLAN_DELETED", "membership_plan", plan_id, current_user["id"])
    return {"message": "Plan deleted"}


# ==================== MEMBERSHIPS ADMIN (/memberships/*) ====================

@router.get("/memberships/section", response_model=MembershipSectionResponse)
async def get_membership_section_admin(current_user: dict = Depends(get_current_user)):
    section = await db.membership_section.find_one({"id": "default"}, {"_id": 0})
    if not section:
        section = _default_membership_section()
        await db.membership_section.insert_one(section)
    return MembershipSectionResponse(**section)


@router.put("/memberships/section", response_model=MembershipSectionResponse)
async def update_membership_section_admin(data: MembershipSectionUpdate, current_user: dict = Depends(get_current_user)):
    now = datetime.now(timezone.utc).isoformat()
    update_data = data.model_dump(exclude_unset=True)
    update_data["updated_at"] = now
    await db.membership_section.update_one(
        {"id": "default"},
        {"$set": update_data, "$setOnInsert": {"id": "default", "created_at": now}},
        upsert=True,
    )
    section = await db.membership_section.find_one({"id": "default"}, {"_id": 0})
    await create_audit_log("MEMBERSHIP_SECTION_UPDATED", "membership_section", "default", current_user["id"])
    return MembershipSectionResponse(**section)


@router.post("/memberships/plans", response_model=MembershipPlanResponse)
async def create_membership_plan_admin(data: MembershipPlanCreate, current_user: dict = Depends(get_current_user)):
    plan_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    plan = {
        "id": plan_id,
        "name": data.name,
        "price": data.price,
        "image_url": data.image_url,
        "features": data.features,
        "is_popular": data.is_popular,
        "is_active": data.is_active,
        "sort_order": data.sort_order or 0,
        "created_at": now,
        "updated_at": now,
    }
    await db.membership_plans.insert_one(plan)
    await create_audit_log("MEMBERSHIP_PLAN_CREATED", "membership_plan", plan_id, current_user["id"])
    return MembershipPlanResponse(**plan)


@router.get("/memberships/plans", response_model=List[MembershipPlanResponse])
async def get_membership_plans_admin(active_only: bool = True, current_user: dict = Depends(get_current_user)):
    query = {}
    if active_only:
        query["is_active"] = True
    plans = await db.membership_plans.find(query, {"_id": 0}).sort([("sort_order", 1), ("created_at", -1)]).to_list(200)
    if len(plans) == 0:
        plans = _seed_membership_plans()
        await db.membership_plans.insert_many(plans)
    return [MembershipPlanResponse(**p) for p in plans]


@router.put("/memberships/plans/{plan_id}", response_model=MembershipPlanResponse)
async def update_membership_plan_admin(plan_id: str, data: MembershipPlanCreate, current_user: dict = Depends(get_current_user)):
    update_data = data.model_dump(exclude_unset=True)
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    update_data["sort_order"] = update_data.get("sort_order", 0) or 0
    result = await db.membership_plans.update_one({"id": plan_id}, {"$set": update_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Plan not found")
    await create_audit_log("MEMBERSHIP_PLAN_UPDATED", "membership_plan", plan_id, current_user["id"])
    plan = await db.membership_plans.find_one({"id": plan_id}, {"_id": 0})
    return MembershipPlanResponse(**plan)


@router.delete("/memberships/plans/{plan_id}")
async def delete_membership_plan_admin(plan_id: str, current_user: dict = Depends(get_current_user)):
    result = await db.membership_plans.delete_one({"id": plan_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Plan not found")
    await create_audit_log("MEMBERSHIP_PLAN_DELETED", "membership_plan", plan_id, current_user["id"])
    return {"message": "Plan deleted"}


@router.get("/memberships/signups", response_model=List[MembershipSignupResponse])
async def get_membership_signups(status: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    require_admin(current_user)
    query = {}
    if status:
        query["status"] = status
    signups = await db.membership_signups.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    result = []
    for s in signups:
        try:
            signup_data = {
                "id": s.get("id", ""),
                "first_name": s.get("first_name", ""),
                "last_name": s.get("last_name", ""),
                "email": s.get("email", s.get("customer_email", "")),
                "phone": s.get("phone", s.get("customer_phone", "")),
                "contact_method": s.get("contact_method", ""),
                "address_line1": s.get("address_line1", ""),
                "address_line2": s.get("address_line2"),
                "city": s.get("city", ""),
                "state": s.get("state", ""),
                "zip_code": s.get("zip_code", ""),
                "membership_plan": s.get("membership_plan", s.get("plan_name", "")),
                "plan_name": s.get("plan_name"),
                "plan_id": s.get("plan_id"),
                "laundry_frequency": s.get("laundry_frequency", ""),
                "estimated_lbs": s.get("estimated_lbs", 0) or 0,
                "amount": s.get("amount"),
                "payment_status": s.get("payment_status"),
                "status": s.get("status", "pending"),
                "customer_id": s.get("customer_id"),
                "customer_name": s.get("customer_name"),
                "customer_email": s.get("customer_email"),
                "customer_phone": s.get("customer_phone"),
                "stripe_session_id": s.get("stripe_session_id"),
                "preferences": s.get("preferences"),
                "created_at": s.get("created_at", ""),
                "updated_at": s.get("updated_at", ""),
            }
            result.append(MembershipSignupResponse(**signup_data))
        except Exception as e:
            logger.error(f"Error processing signup {s.get('id')}: {e}")
            continue
    return result


@router.put("/memberships/signups/{signup_id}", response_model=MembershipSignupResponse)
async def update_membership_signup(signup_id: str, data: MembershipSignupUpdate, current_user: dict = Depends(get_current_user)):
    require_admin(current_user)
    update_data = data.model_dump(exclude_unset=True)
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    result = await db.membership_signups.update_one({"id": signup_id}, {"$set": update_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Signup not found")
    await create_audit_log("MEMBERSHIP_SIGNUP_UPDATED", "membership_signup", signup_id, current_user["id"])
    signup = await db.membership_signups.find_one({"id": signup_id}, {"_id": 0})
    return MembershipSignupResponse(**signup)


@router.post("/memberships/signups/{signup_id}/convert", response_model=CustomerResponse)
async def convert_membership_signup(signup_id: str, current_user: dict = Depends(get_current_user)):
    require_admin(current_user)
    signup = await db.membership_signups.find_one({"id": signup_id}, {"_id": 0})
    if not signup:
        raise HTTPException(status_code=404, detail="Signup not found")
    now = datetime.now(timezone.utc).isoformat()
    customer = await db.customers.find_one({"email": signup["email"]}, {"_id": 0})
    if customer:
        update_data = {
            "membership_plan": signup["membership_plan"],
            "membership_status": "active",
            "membership_start_date": now,
            "updated_at": now,
        }
        await db.customers.update_one({"id": customer["id"]}, {"$set": update_data})
        customer = await db.customers.find_one({"id": customer["id"]}, {"_id": 0})
    else:
        customer_id = str(uuid.uuid4())
        customer = {
            "id": customer_id,
            "name": f"{signup['first_name']} {signup['last_name']}",
            "email": signup["email"].lower(),
            "phone": signup["phone"],
            "address": f"{signup['address_line1']}{', ' + signup['address_line2'] if signup.get('address_line2') else ''}, {signup['city']}, {signup['state']} {signup['zip_code']}",
            "preferred_contact": signup["contact_method"],
            "notes": None,
            "status": "active",
            "total_orders": 0,
            "membership_plan": signup["membership_plan"],
            "membership_status": "active",
            "membership_start_date": now,
            "created_at": now,
            "updated_at": now,
        }
        await db.customers.insert_one(customer)
        await create_audit_log("CUSTOMER_CREATED", "customer", customer_id, current_user["id"])

    preferences = signup.get("preferences")
    if preferences:
        existing_pref = await db.preferences.find({"customer_id": customer["id"]}).sort("version", -1).limit(1).to_list(1)
        version = (existing_pref[0]["version"] + 1) if existing_pref else 1
        pref_id = str(uuid.uuid4())
        normalized = normalize_preference_payload(PreferenceCreate(customer_id=customer["id"], **preferences))
        pref_doc = {
            "id": pref_id,
            "customer_id": customer["id"],
            **normalized,
            "version": version,
            "created_at": now,
            "updated_at": now,
        }
        await db.preferences.insert_one(pref_doc)
        await db.customers.update_one({"id": customer["id"]}, {"$set": {"preferences_id": pref_id, "updated_at": now}})
    await db.membership_signups.update_one(
        {"id": signup_id},
        {"$set": {"status": "converted", "customer_id": customer["id"], "updated_at": now}},
    )
    await create_audit_log("MEMBERSHIP_SIGNUP_CONVERTED", "membership_signup", signup_id, current_user["id"], {"customer_id": customer["id"]})
    return CustomerResponse(**customer)


@router.get("/memberships/customers", response_model=List[CustomerResponse])
async def get_membership_customers(search: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    require_admin(current_user)
    query: Dict[str, Any] = {"membership_plan": {"$ne": None}}
    if search:
        query["$or"] = [
            {"name": {"$regex": search, "$options": "i"}},
            {"email": {"$regex": search, "$options": "i"}},
            {"phone": {"$regex": search, "$options": "i"}},
        ]
    customers = await db.customers.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return [CustomerResponse(**c) for c in customers]


@router.put("/memberships/customers/{customer_id}", response_model=CustomerResponse)
async def update_membership_customer(customer_id: str, data: MembershipCustomerUpdate, current_user: dict = Depends(get_current_user)):
    require_admin(current_user)
    update_data = data.model_dump(exclude_unset=True)
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    result = await db.customers.update_one({"id": customer_id}, {"$set": update_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Customer not found")
    await create_audit_log("CUSTOMER_MEMBERSHIP_UPDATED", "customer", customer_id, current_user["id"])
    customer = await db.customers.find_one({"id": customer_id}, {"_id": 0})
    return CustomerResponse(**customer)


# ==================== PUBLIC MEMBERSHIP ROUTES ====================

@router.get("/public/membership-section", response_model=MembershipSectionResponse)
async def get_public_membership_section():
    section = await db.membership_section.find_one({"id": "default"}, {"_id": 0})
    if not section:
        section = _default_membership_section()
        await db.membership_section.insert_one(section)
    return MembershipSectionResponse(**section)


@router.get("/public/membership-plans", response_model=List[MembershipPlanResponse])
async def get_public_membership_plans():
    query = {"is_active": True}
    plans = await db.membership_plans.find(query, {"_id": 0}).sort([("sort_order", 1), ("created_at", -1)]).to_list(200)
    if len(plans) == 0:
        plans = _seed_membership_plans()
        await db.membership_plans.insert_many(plans)
    return [MembershipPlanResponse(**p) for p in plans]


# ── Helpers ───────────────────────────────────────────────────────────

def _default_membership_section() -> dict:
    now = datetime.now(timezone.utc).isoformat()
    return {
        "id": "default",
        "heading": "Flexible Plans for Every Home",
        "subheading": None,
        "special_title": "New Member Special",
        "special_text": "$10 OFF your first month on any membership. Ask when you call or text.",
        "cta_title": "Need help choosing?",
        "cta_text": "Just call, text, or email us at (805) 836-8872 and we'll recommend the perfect plan based on your weekly laundry.",
        "cta_button_label": "BECOME A MEMBER",
        "cta_button_url": "/membership",
        "contact_phone": "(805) 836-8872",
        "is_active": True,
        "created_at": now,
        "updated_at": now,
    }


def _seed_membership_plans() -> list:
    now = datetime.now(timezone.utc).isoformat()
    return [
        {
            "id": str(uuid.uuid4()),
            "name": "MOST POPULAR",
            "price": "$139 / month",
            "image_url": "https://images.squarespace-cdn.com/content/v1/696c559a4b2b9b1b0febf8d7/4a2815a1-54c1-45fb-8320-244dce8b83c8/MOST+POPULAR.png",
            "features": ["Up to 60 lb/ month", "Basic Preferences saved (folding notes)", "Best value for most families"],
            "is_popular": True,
            "is_active": True,
            "sort_order": 1,
            "created_at": now,
            "updated_at": now,
        },
        {
            "id": str(uuid.uuid4()),
            "name": "FAMILY PLUS",
            "price": "$199 / month",
            "image_url": "https://images.squarespace-cdn.com/content/v1/696c559a4b2b9b1b0febf8d7/f262a5b8-0043-4977-9d32-d6b343be3e70/FAMILY+PLUS.png",
            "features": ["Up to 90 lb/ month", "Priority scheduling", "Great for larger households or rentals"],
            "is_popular": False,
            "is_active": True,
            "sort_order": 2,
            "created_at": now,
            "updated_at": now,
        },
        {
            "id": str(uuid.uuid4()),
            "name": "ELITE CONCIERGE",
            "price": "$299 / month",
            "image_url": "https://images.squarespace-cdn.com/content/v1/696c559a4b2b9b1b0febf8d7/13a4c501-7792-4f72-bf5c-072f95b5f995/ELITE+CONCIERGE.png",
            "features": ["Up to 120 lb/ month", "Priority turnaround (when possible)", "Premium packaging", "Saved preferences", "1 emergency pickup included"],
            "is_popular": False,
            "is_active": True,
            "sort_order": 3,
            "created_at": now,
            "updated_at": now,
        },
    ]
