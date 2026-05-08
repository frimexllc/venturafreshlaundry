"""Dashboard endpoints: stats, recent activity"""
from fastapi import APIRouter, Depends
from datetime import datetime, timezone, timedelta

from database import db
from auth import get_current_user

router = APIRouter(prefix="/api", tags=["Dashboard"])


@router.get("/dashboard/stats")
async def get_dashboard_stats(current_user: dict = Depends(get_current_user)):
    today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    month_start = datetime.now(timezone.utc).replace(day=1, hour=0, minute=0, second=0, microsecond=0).isoformat()

    # ========== MÉTRICAS BÁSICAS ==========
    total_customers = await db.customers.count_documents({})
    total_orders = await db.orders.count_documents({})
    pending_orders = await db.orders.count_documents({"status": {"$in": ["new", "pending", "processing", "ready"]}})
    open_tickets = await db.tickets.count_documents({"status": {"$in": ["open", "in_progress"]}})
    active_quotes = await db.quotes.count_documents({"status": {"$in": ["new", "sent", "negotiating"]}})
    new_leads = await db.leads.count_documents({"status": "new"})
    orders_today = await db.orders.count_documents({"created_at": {"$gte": today}})

    # ========== MIEMBROS ACTIVOS ==========
    active_members = await db.customers.count_documents({
        "$or": [{"membership_status": "active"}, {"is_member": True}]
    })
    if active_members == 0:
        active_members = await db.membership_signups.count_documents({
            "payment_status": "paid", "status": "converted"
        })

    # ========== INGRESOS ==========
    # Ingresos por órdenes
    order_pipeline = [
        {"$match": {"payment_status": "paid", "$or": [
            {"paid_at": {"$gte": month_start}}, {"created_at": {"$gte": month_start}}
        ]}},
        {"$group": {"_id": None, "total": {"$sum": "$total_amount"}}}
    ]
    order_result = await db.orders.aggregate(order_pipeline).to_list(1)
    order_revenue = order_result[0]["total"] if order_result else 0

    # Ingresos por membresías
    mem_pipeline = [
        {"$match": {"payment_status": "paid", "created_at": {"$gte": month_start}}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
    ]
    mem_result = await db.membership_signups.aggregate(mem_pipeline).to_list(1)
    membership_revenue = mem_result[0]["total"] if mem_result else 0

    # Ingresos por tienda
    store_pipeline = [
        {"$match": {"payment_status": "paid", "created_at": {"$gte": month_start}}},
        {"$group": {"_id": None, "total": {"$sum": "$total"}}}
    ]
    store_result = await db.store_orders.aggregate(store_pipeline).to_list(1)
    store_revenue = store_result[0]["total"] if store_result else 0

    # Ingresos por máquinas
    machine_pipeline = [
        {"$match": {"created_at": {"$gte": month_start}}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
    ]
    machine_result = await db.machine_income.aggregate(machine_pipeline).to_list(1)
    machine_revenue = machine_result[0]["total"] if machine_result else 0

    # ========== GASTOS ==========
    expenses_pipeline = [
        {"$match": {"created_at": {"$gte": month_start}}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
    ]
    expenses_result = await db.expenses.aggregate(expenses_pipeline).to_list(1)
    total_expenses = expenses_result[0]["total"] if expenses_result else 0

    # Gastos por categoría
    by_category = {}
    cat_pipeline = [
        {"$match": {"created_at": {"$gte": month_start}}},
        {"$group": {"_id": "$category", "total": {"$sum": "$amount"}}}
    ]
    cat_results = await db.expenses.aggregate(cat_pipeline).to_list(100)
    for cat in cat_results:
        if cat["_id"]:
            by_category[cat["_id"]] = cat["total"]

    # ========== MILLAS TOTALES ==========
    miles_pipeline = [
        {"$match": {"date": {"$gte": month_start[:10]}}},
        {"$group": {"_id": None, "total": {"$sum": "$total_miles"}}}
    ]
    miles_result = await db.mileage_logs.aggregate(miles_pipeline).to_list(1)
    total_miles = miles_result[0]["total"] if miles_result else 0

    # ========== CÁLCULOS FINALES ==========
    total_revenue = order_revenue + membership_revenue + store_revenue + machine_revenue
    net_income = total_revenue - total_expenses
    avg_order_value = round(total_revenue / total_orders, 2) if total_orders > 0 else 0

    return {
        # Campos básicos (compatibilidad con schema actual)
        "total_customers": total_customers,
        "total_orders": total_orders,
        "pending_orders": pending_orders,
        "open_tickets": open_tickets,
        "active_quotes": active_quotes,
        "new_leads": new_leads,
        "orders_today": orders_today,
        "revenue_this_month": order_revenue,
        # Campos adicionales que el frontend espera
        "active_members": active_members,
        "membership_revenue": membership_revenue,
        "store_revenue": store_revenue,
        "machine_revenue": machine_revenue,
        "total_revenue": total_revenue,
        "total_expenses": total_expenses,
        "net_income": net_income,
        "avg_order_value": avg_order_value,
        "by_category": by_category,
        "total_miles": total_miles
    }


@router.get("/dashboard/recent-activity")
async def get_recent_activity(current_user: dict = Depends(get_current_user)):
    logs = await db.audit_logs.find({}, {"_id": 0}).sort("created_at", -1).limit(20).to_list(20)
    return logs