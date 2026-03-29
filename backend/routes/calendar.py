"""Calendar endpoints"""
from fastapi import APIRouter, Depends, Query

from database import db
from auth import get_current_user

router = APIRouter(prefix="/api", tags=["Calendar"])


@router.get("/calendar/orders")
async def get_calendar_orders(
    start_date: str = Query(..., description="Start date YYYY-MM-DD"),
    end_date: str = Query(..., description="End date YYYY-MM-DD"),
    current_user: dict = Depends(get_current_user)
):
    orders = await db.orders.find({
        "pickup_date": {"$gte": start_date, "$lte": end_date}
    }, {"_id": 0}).to_list(1000)

    events = []
    for order in orders:
        events.append({
            "id": order["id"],
            "title": f"{order.get('order_number','')} - {order.get('customer_name','')}",
            "date": order.get("pickup_date"),
            "time": order.get("pickup_time_window"),
            "status": order.get("status"),
            "service_type": order.get("service_type"),
            "address": order.get("pickup_address"),
            "customer_name": order.get("customer_name"),
            "order_number": order.get("order_number")
        })
    return events
