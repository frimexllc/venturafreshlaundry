"""Lead endpoints"""
from fastapi import APIRouter, HTTPException, Depends, Query
from typing import List, Optional
from datetime import datetime, timezone
import uuid

from database import db
from models import LeadCreate, LeadResponse, CustomerResponse
from auth import get_current_user
from utils import create_audit_log

router = APIRouter(prefix="/api", tags=["Leads"])


@router.post("/leads", response_model=LeadResponse)
async def create_lead(data: LeadCreate, current_user: dict = Depends(get_current_user)):
    lead_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()

    lead = {
        "id": lead_id,
        "name": data.name,
        "email": data.email.lower() if data.email else None,
        "phone": data.phone,
        "source": data.source,
        "interest_type": data.interest_type,
        "notes": data.notes,
        "status": "new",
        "converted_to_customer_id": None,
        "created_at": now,
        "updated_at": now
    }
    await db.leads.insert_one(lead)
    await create_audit_log("LEAD_CREATED", "lead", lead_id, current_user["id"])
    return LeadResponse(**lead)


@router.get("/leads", response_model=List[LeadResponse])
async def get_leads(
    status: Optional[str] = None,
    source: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    current_user: dict = Depends(get_current_user)
):
    query = {}
    if status:
        query["status"] = status
    if source:
        query["source"] = source

    skip = (page - 1) * page_size
    leads = await db.leads.find(query, {"_id": 0}).sort("created_at", -1).skip(skip).limit(page_size).to_list(page_size)
    return [LeadResponse(**l) for l in leads]


@router.get("/leads/{lead_id}", response_model=LeadResponse)
async def get_lead(lead_id: str, current_user: dict = Depends(get_current_user)):
    lead = await db.leads.find_one({"id": lead_id}, {"_id": 0})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    return LeadResponse(**lead)


@router.put("/leads/{lead_id}", response_model=LeadResponse)
async def update_lead(lead_id: str, data: dict, current_user: dict = Depends(get_current_user)):
    data["updated_at"] = datetime.now(timezone.utc).isoformat()
    result = await db.leads.update_one({"id": lead_id}, {"$set": data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Lead not found")

    await create_audit_log("LEAD_UPDATED", "lead", lead_id, current_user["id"])
    lead = await db.leads.find_one({"id": lead_id}, {"_id": 0})
    return LeadResponse(**lead)


@router.post("/leads/{lead_id}/convert", response_model=CustomerResponse)
async def convert_lead_to_customer(lead_id: str, current_user: dict = Depends(get_current_user)):
    lead = await db.leads.find_one({"id": lead_id}, {"_id": 0})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    if lead["status"] == "converted":
        raise HTTPException(status_code=400, detail="Lead already converted")

    customer_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    customer = {
        "id": customer_id,
        "name": lead["name"],
        "email": lead["email"],
        "phone": lead["phone"],
        "address": None,
        "preferred_contact": "email",
        "notes": lead.get("notes"),
        "status": "active",
        "total_orders": 0,
        "created_at": now,
        "updated_at": now
    }
    await db.customers.insert_one(customer)
    await db.leads.update_one(
        {"id": lead_id},
        {"$set": {"status": "converted", "converted_to_customer_id": customer_id, "updated_at": now}}
    )
    await create_audit_log("LEAD_CONVERTED", "lead", lead_id, current_user["id"], {"customer_id": customer_id})
    return CustomerResponse(**customer)
