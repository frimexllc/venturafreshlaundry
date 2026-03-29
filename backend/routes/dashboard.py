"""Dashboard endpoints: stats, recent activity"""
from fastapi import APIRouter, Depends
from datetime import datetime, timezone

from database import db
from models import DashboardStats
from auth import get_current_user

router = APIRouter(prefix="/api", tags=["Dashboard"])


@router.get("/dashboard/stats", response_model=DashboardStats)
async def get_dashboard_stats(current_user: dict = Depends(get_current_user)):
    today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    month_start = datetime.now(timezone.utc).replace(day=1, hour=0, minute=0, second=0, microsecond=0).isoformat()

    total_customers = await db.customers.count_documents({})
    total_orders = await db.orders.count_documents({})
    pending_orders = await db.orders.count_documents({"status": {"$in": ["new", "processing", "ready"]}})
    open_tickets = await db.tickets.count_documents({"status": {"$in": ["open", "in_progress"]}})
    active_quotes = await db.quotes.count_documents({"status": {"$in": ["new", "sent", "negotiating"]}})
    new_leads = await db.leads.count_documents({"status": "new"})
    orders_today = await db.orders.count_documents({"created_at": {"$gte": today}})

    pipeline = [
        {"$match": {"created_at": {"$gte": month_start}, "payment_status": "paid"}},
        {"$group": {"_id": None, "total": {"$sum": "$total_amount"}}}
    ]
    revenue_result = await db.orders.aggregate(pipeline).to_list(1)
    revenue = revenue_result[0]["total"] if revenue_result else 0

    return DashboardStats(
        total_customers=total_customers,
        total_orders=total_orders,
        pending_orders=pending_orders,
        open_tickets=open_tickets,
        active_quotes=active_quotes,
        new_leads=new_leads,
        orders_today=orders_today,
        revenue_this_month=revenue or 0
    )


@router.get("/dashboard/recent-activity")
async def get_recent_activity(current_user: dict = Depends(get_current_user)):
    logs = await db.audit_logs.find({}, {"_id": 0}).sort("created_at", -1).limit(20).to_list(20)
    return logs
