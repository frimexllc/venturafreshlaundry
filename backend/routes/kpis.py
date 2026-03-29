"""Operational KPIs Dashboard - Consolidated metrics from all modules"""
from fastapi import APIRouter, Depends
from datetime import datetime, timezone, timedelta

from database import db
from auth import get_current_user

router = APIRouter(prefix="/api/kpis", tags=["KPIs"])


@router.get("/operational")
async def get_operational_kpis(current_user: dict = Depends(get_current_user)):
    now = datetime.now(timezone.utc)
    today = now.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0).isoformat()
    week_ago = (now - timedelta(days=7)).isoformat()

    # Orders
    total_orders = await db.orders.count_documents({})
    orders_today = await db.orders.count_documents({"created_at": {"$gte": today}})
    orders_this_week = await db.orders.count_documents({"created_at": {"$gte": week_ago}})
    active_orders = await db.orders.count_documents({"status": {"$in": ["new", "confirmed", "processing", "ready", "out_for_delivery"]}})
    completed_orders = await db.orders.count_documents({"status": "completed"})

    # Revenue
    rev_pipeline = [
        {"$match": {"created_at": {"$gte": month_start}, "payment_status": "paid"}},
        {"$group": {"_id": None, "total": {"$sum": "$total_amount"}, "count": {"$sum": 1}}}
    ]
    rev = await db.orders.aggregate(rev_pipeline).to_list(1)
    monthly_revenue = rev[0]["total"] if rev else 0
    paid_orders_count = rev[0]["count"] if rev else 0

    # Expenses
    exp_pipeline = [
        {"$match": {"date": {"$gte": month_start}}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
    ]
    exp = await db.expenses.aggregate(exp_pipeline).to_list(1)
    monthly_expenses = exp[0]["total"] if exp else 0

    # Mileage (IRS rate $0.70/mi)
    mil_pipeline = [
        {"$match": {"date": {"$gte": month_start}}},
        {"$group": {"_id": None, "total_miles": {"$sum": "$miles"}, "count": {"$sum": 1}}}
    ]
    mil = await db.mileage_logs.aggregate(mil_pipeline).to_list(1)
    monthly_miles = mil[0]["total_miles"] if mil else 0
    mileage_deduction = round(monthly_miles * 0.70, 2)

    # Inventory alerts
    low_stock_items = await db.inventory.count_documents({
        "$expr": {"$lte": ["$quantity", "$min_stock"]}
    })
    total_stock_items = await db.inventory.count_documents({})

    # Purchase orders
    pending_pos = await db.purchase_orders.count_documents({"status": {"$in": ["pending", "approved"]}})

    # Customers
    total_customers = await db.customers.count_documents({})
    new_customers_month = await db.customers.count_documents({"created_at": {"$gte": month_start}})

    # Tickets
    open_tickets = await db.tickets.count_documents({"status": {"$in": ["open", "in_progress"]}})

    # Leads
    new_leads = await db.leads.count_documents({"status": "new"})

    net_income = round((monthly_revenue or 0) - (monthly_expenses or 0), 2)

    return {
        "period": {"month_start": month_start, "today": today},
        "orders": {
            "total": total_orders,
            "today": orders_today,
            "this_week": orders_this_week,
            "active": active_orders,
            "completed": completed_orders,
        },
        "revenue": {
            "monthly": round(monthly_revenue or 0, 2),
            "paid_orders": paid_orders_count,
            "avg_ticket": round((monthly_revenue / paid_orders_count) if paid_orders_count else 0, 2),
        },
        "expenses": {
            "monthly": round(monthly_expenses or 0, 2),
            "net_income": net_income,
        },
        "mileage": {
            "monthly_miles": round(monthly_miles, 1),
            "irs_deduction": mileage_deduction,
        },
        "inventory": {
            "total_items": total_stock_items,
            "low_stock_alerts": low_stock_items,
            "pending_purchase_orders": pending_pos,
        },
        "customers": {
            "total": total_customers,
            "new_this_month": new_customers_month,
        },
        "support": {
            "open_tickets": open_tickets,
            "new_leads": new_leads,
        },
    }
