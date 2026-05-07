# routes/dashboard.py
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

    # Ingresos mensuales (desde órdenes y membresías)
    revenue_orders = 0
    revenue_memberships = 0
    # Podrías usar el agregado de finances, pero para simplificar:
    pipeline_orders = [
        {"$match": {"payment_status": "paid", "$or": [
            {"paid_at": {"$gte": month_start}}, {"created_at": {"$gte": month_start}}
        ]}},
        {"$group": {"_id": None, "total": {"$sum": "$total_amount"}}}
    ]
    order_total = await db.orders.aggregate(pipeline_orders).to_list(1)
    revenue_orders = order_total[0]["total"] if order_total else 0

    pipeline_memberships = [
        {"$match": {"payment_status": "paid", "created_at": {"$gte": month_start}}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
    ]
    member_total = await db.membership_signups.aggregate(pipeline_memberships).to_list(1)
    revenue_memberships = member_total[0]["total"] if member_total else 0

    return DashboardStats(
        total_customers=total_customers,
        total_orders=total_orders,
        pending_orders=pending_orders,
        open_tickets=open_tickets,
        active_quotes=active_quotes,
        new_leads=new_leads,
        orders_today=orders_today,
        revenue_this_month=revenue_orders,
        membership_revenue=revenue_memberships,
        total_revenue=revenue_orders + revenue_memberships
    )