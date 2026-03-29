"""Support Ticket endpoints"""
from fastapi import APIRouter, HTTPException, Depends
from typing import List, Optional
from datetime import datetime, timezone
import uuid

from database import db
from models import TicketCreate, TicketResponse
from auth import get_current_user
from utils import create_audit_log

router = APIRouter(prefix="/api", tags=["Tickets"])


async def generate_ticket_number():
    count = await db.tickets.count_documents({})
    return f"TKT-{str(count + 1).zfill(5)}"


def determine_priority(subject: str, description: str) -> str:
    text = (subject + " " + description).lower()
    high_keywords = ["refund", "damaged", "missing", "complaint", "urgent", "broken", "lost"]
    if any(kw in text for kw in high_keywords):
        return "high"
    medium_keywords = ["issue", "problem", "error", "wrong"]
    if any(kw in text for kw in medium_keywords):
        return "medium"
    return "low"


@router.post("/tickets", response_model=TicketResponse)
async def create_ticket(data: TicketCreate, current_user: dict = Depends(get_current_user)):
    customer_name = None
    if data.customer_id:
        customer = await db.customers.find_one({"id": data.customer_id}, {"_id": 0})
        customer_name = customer["name"] if customer else None

    ticket_id = str(uuid.uuid4())
    ticket_number = await generate_ticket_number()
    priority = determine_priority(data.subject, data.description)
    now = datetime.now(timezone.utc).isoformat()

    ticket = {
        "id": ticket_id,
        "ticket_number": ticket_number,
        "customer_id": data.customer_id,
        "customer_name": customer_name,
        "subject": data.subject,
        "description": data.description,
        "category": data.category,
        "priority": priority,
        "status": "open",
        "assigned_to": None,
        "resolution": None,
        "created_at": now,
        "updated_at": now
    }
    await db.tickets.insert_one(ticket)
    await create_audit_log("TICKET_CREATED", "ticket", ticket_id, current_user["id"])
    return TicketResponse(**ticket)


@router.get("/tickets", response_model=List[TicketResponse])
async def get_tickets(
    status: Optional[str] = None,
    priority: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    query = {}
    if status:
        query["status"] = status
    if priority:
        query["priority"] = priority
    tickets = await db.tickets.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return [TicketResponse(**t) for t in tickets]


@router.get("/tickets/{ticket_id}", response_model=TicketResponse)
async def get_ticket(ticket_id: str, current_user: dict = Depends(get_current_user)):
    ticket = await db.tickets.find_one({"id": ticket_id}, {"_id": 0})
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    return TicketResponse(**ticket)


@router.put("/tickets/{ticket_id}", response_model=TicketResponse)
async def update_ticket(ticket_id: str, data: dict, current_user: dict = Depends(get_current_user)):
    data["updated_at"] = datetime.now(timezone.utc).isoformat()
    result = await db.tickets.update_one({"id": ticket_id}, {"$set": data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Ticket not found")

    await create_audit_log("TICKET_UPDATED", "ticket", ticket_id, current_user["id"])
    ticket = await db.tickets.find_one({"id": ticket_id}, {"_id": 0})
    return TicketResponse(**ticket)
