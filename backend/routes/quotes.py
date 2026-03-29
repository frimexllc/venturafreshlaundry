"""Quote endpoints"""
from fastapi import APIRouter, HTTPException, Depends
from typing import List, Optional
from datetime import datetime, timezone
import uuid

from database import db
from models import QuoteCreate, QuoteResponse, LeadResponse
from auth import get_current_user
from utils import normalize_email, normalize_phone, create_audit_log

router = APIRouter(prefix="/api", tags=["Quotes"])


async def generate_quote_number():
    today = datetime.now(timezone.utc).strftime("%Y%m%d")
    count = await db.quotes.count_documents({"quote_number": {"$regex": f"^QT-{today}"}})
    return f"QT-{today}-{str(count + 1).zfill(4)}"


@router.post("/quotes", response_model=QuoteResponse)
async def create_quote(data: QuoteCreate, current_user: dict = Depends(get_current_user)):
    quote_id = str(uuid.uuid4())
    quote_number = await generate_quote_number()
    now = datetime.now(timezone.utc).isoformat()

    quote = {
        "id": quote_id,
        "quote_number": quote_number,
        "company_name": data.company_name,
        "contact_name": data.contact_name,
        "email": data.email.lower() if data.email else None,
        "phone": data.phone,
        "industry": data.industry,
        "estimated_lbs_per_week": data.estimated_lbs_per_week,
        "service_needs": data.service_needs,
        "notes": data.notes,
        "status": "new",
        "assigned_to": None,
        "follow_up_date": None,
        "created_at": now,
        "updated_at": now
    }
    await db.quotes.insert_one(quote)
    await create_audit_log("QUOTE_CREATED", "quote", quote_id, current_user["id"])
    return QuoteResponse(**quote)


@router.get("/quotes", response_model=List[QuoteResponse])
async def get_quotes(
    status: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    query = {}
    if status:
        query["status"] = status
    quotes = await db.quotes.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return [QuoteResponse(**q) for q in quotes]


@router.get("/quotes/{quote_id}", response_model=QuoteResponse)
async def get_quote(quote_id: str, current_user: dict = Depends(get_current_user)):
    quote = await db.quotes.find_one({"id": quote_id}, {"_id": 0})
    if not quote:
        raise HTTPException(status_code=404, detail="Quote not found")
    return QuoteResponse(**quote)


@router.put("/quotes/{quote_id}", response_model=QuoteResponse)
async def update_quote(quote_id: str, data: dict, current_user: dict = Depends(get_current_user)):
    data["updated_at"] = datetime.now(timezone.utc).isoformat()
    result = await db.quotes.update_one({"id": quote_id}, {"$set": data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Quote not found")
    await create_audit_log("QUOTE_UPDATED", "quote", quote_id, current_user["id"])
    quote = await db.quotes.find_one({"id": quote_id}, {"_id": 0})
    return QuoteResponse(**quote)


@router.post("/quotes/{quote_id}/convert-to-lead", response_model=LeadResponse)
async def convert_quote_to_lead(quote_id: str, current_user: dict = Depends(get_current_user)):
    quote = await db.quotes.find_one({"id": quote_id}, {"_id": 0})
    if not quote:
        raise HTTPException(status_code=404, detail="Quote not found")
    if quote.get("converted_lead_id"):
        raise HTTPException(status_code=400, detail="Quote already converted")

    lead_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    lead_name = quote.get("contact_name") or quote.get("company_name") or "B2B Lead"
    lead_notes = "\n".join([
        note for note in [quote.get("service_needs"), quote.get("notes")] if note
    ])

    lead = {
        "id": lead_id,
        "name": lead_name,
        "email": normalize_email(quote.get("email")) if quote.get("email") else None,
        "phone": normalize_phone(quote.get("phone")) if quote.get("phone") else None,
        "source": "b2b_quote",
        "interest_type": "B2B Quote",
        "notes": lead_notes or None,
        "status": "new",
        "converted_to_customer_id": None,
        "created_at": now,
        "updated_at": now
    }
    await db.leads.insert_one(lead)
    await db.quotes.update_one(
        {"id": quote_id},
        {"$set": {"status": "won", "converted_lead_id": lead_id, "updated_at": now}}
    )
    await create_audit_log("QUOTE_CONVERTED_TO_LEAD", "quote", quote_id, current_user["id"], {"lead_id": lead_id})
    return LeadResponse(**lead)
