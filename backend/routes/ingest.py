"""Ingest & Routing endpoints — extracted from server_core.py"""
from fastapi import APIRouter, HTTPException, Depends
from typing import Optional, List
from datetime import datetime, timezone
import uuid
import logging

from database import db
from models import IngestCreate
from auth import get_current_user
from utils import generate_order_number, create_audit_log
from routes.quotes import generate_quote_number
from routes.tickets import generate_ticket_number, determine_priority

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["Ingest"])


@router.post("/ingest")
async def process_ingest(data: IngestCreate, current_user: dict = Depends(get_current_user)):
    """Process incoming form submission and route to appropriate collection"""
    ingest_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()

    ingest_record = {
        "id": ingest_id,
        "source_form": data.source_form,
        "data": data.data,
        "processed_flag": "locked",
        "processed_at": now,
        "route_result": None,
        "error_notes": None,
        "created_at": now,
    }
    await db.ingest.insert_one(ingest_record)
    await create_audit_log("INGEST_LOCKED", "ingest", ingest_id, current_user["id"])

    route_result = "unknown"
    entity_id = None

    try:
        source = data.source_form.lower()
        form_data = data.data

        if any(kw in source for kw in ["pickup", "order", "delivery"]):
            customer = await db.customers.find_one({"email": form_data.get("email", "").lower()}, {"_id": 0})
            if not customer:
                customer_id = str(uuid.uuid4())
                customer = {
                    "id": customer_id,
                    "name": form_data.get("name", "Unknown"),
                    "email": form_data.get("email", "").lower() or None,
                    "phone": form_data.get("phone"),
                    "address": form_data.get("address"),
                    "preferred_contact": "email",
                    "notes": None,
                    "status": "active",
                    "total_orders": 0,
                    "created_at": now,
                    "updated_at": now,
                }
                await db.customers.insert_one(customer)

            order_id = str(uuid.uuid4())
            order_number = await generate_order_number()
            order = {
                "id": order_id,
                "order_number": order_number,
                "customer_id": customer["id"],
                "customer_name": customer["name"],
                "service_type": form_data.get("service_type", "pickup_delivery"),
                "pickup_date": form_data.get("pickup_date"),
                "pickup_time_window": form_data.get("pickup_time"),
                "pickup_address": form_data.get("address"),
                "delivery_address": form_data.get("delivery_address"),
                "estimated_lbs": form_data.get("estimated_lbs"),
                "actual_lbs": None,
                "notes": form_data.get("notes"),
                "gate_code": form_data.get("gate_code"),
                "status": "new",
                "payment_status": "unpaid",
                "total_amount": None,
                "created_at": now,
                "updated_at": now,
            }
            await db.orders.insert_one(order)
            await db.customers.update_one({"id": customer["id"]}, {"$inc": {"total_orders": 1}})
            route_result = "orders"
            entity_id = order_id

        elif any(kw in source for kw in ["quote", "commercial", "b2b", "business"]):
            quote_id = str(uuid.uuid4())
            quote_number = await generate_quote_number()
            quote = {
                "id": quote_id,
                "quote_number": quote_number,
                "company_name": form_data.get("company_name", form_data.get("name", "Unknown")),
                "contact_name": form_data.get("contact_name", form_data.get("name", "")),
                "email": form_data.get("email", "").lower() or None,
                "phone": form_data.get("phone"),
                "industry": form_data.get("industry"),
                "estimated_lbs_per_week": form_data.get("estimated_lbs"),
                "service_needs": form_data.get("service_needs"),
                "notes": form_data.get("notes"),
                "status": "new",
                "assigned_to": None,
                "follow_up_date": None,
                "created_at": now,
                "updated_at": now,
            }
            await db.quotes.insert_one(quote)
            route_result = "quotes"
            entity_id = quote_id

        elif any(kw in source for kw in ["support", "ticket", "issue", "feedback", "complaint"]):
            ticket_id = str(uuid.uuid4())
            ticket_number = await generate_ticket_number()
            subject = form_data.get("subject", form_data.get("regarding", "Support Request"))
            description = form_data.get("description", form_data.get("message", ""))
            priority = determine_priority(subject, description)
            ticket = {
                "id": ticket_id,
                "ticket_number": ticket_number,
                "customer_id": None,
                "customer_name": form_data.get("name"),
                "subject": subject,
                "description": description,
                "category": form_data.get("category", "general"),
                "priority": priority,
                "status": "open",
                "assigned_to": None,
                "resolution": None,
                "created_at": now,
                "updated_at": now,
            }
            await db.tickets.insert_one(ticket)
            route_result = "tickets"
            entity_id = ticket_id

        else:
            lead_id = str(uuid.uuid4())
            lead = {
                "id": lead_id,
                "name": form_data.get("name", "Unknown"),
                "email": form_data.get("email", "").lower() or None,
                "phone": form_data.get("phone"),
                "source": data.source_form,
                "interest_type": form_data.get("interest_type", form_data.get("service_type")),
                "notes": form_data.get("notes", form_data.get("message")),
                "status": "new",
                "converted_to_customer_id": None,
                "created_at": now,
                "updated_at": now,
            }
            await db.leads.insert_one(lead)
            route_result = "leads"
            entity_id = lead_id

        await db.ingest.update_one(
            {"id": ingest_id},
            {"$set": {"processed_flag": "processed", "route_result": route_result, "route_id": entity_id}},
        )
        await create_audit_log("INGEST_ROUTED", "ingest", ingest_id, current_user["id"], {"route": route_result, "entity_id": entity_id})

    except Exception as e:
        await db.ingest.update_one(
            {"id": ingest_id},
            {"$set": {"processed_flag": "error", "error_notes": str(e)}},
        )
        await create_audit_log("INGEST_ERROR", "ingest", ingest_id, current_user["id"], {"error": str(e)})
        raise HTTPException(status_code=500, detail=f"Error processing ingest: {str(e)}")

    return {
        "ingest_id": ingest_id,
        "route_result": route_result,
        "entity_id": entity_id,
        "message": f"Form submission routed to {route_result}",
    }


@router.get("/ingest", response_model=List[dict])
async def get_ingest_records(status: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    query = {}
    if status:
        query["processed_flag"] = status
    records = await db.ingest.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return records
