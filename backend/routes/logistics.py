"""
Logistics endpoint — unified order feed for the Operator Map.
Merges regular CRM orders + store orders, geocodes addresses via Nominatim,
and caches lat/lng in the DB so subsequent calls are instant.
"""
import os
import logging
from fastapi import APIRouter, Depends, Query
from typing import Optional, List
from datetime import datetime, timezone

import httpx

from database import db
from auth import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/logistics", tags=["logistics"])

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
HQ_LAT = 34.2519
HQ_LNG = -119.2290


async def geocode_address(address: str) -> dict:
    """Geocode an address string to lat/lng via Nominatim. Returns None values on failure."""
    if not address or len(address.strip()) < 5:
        return {"lat": None, "lng": None}
    # Check cache first
    cached = await db.geocode_cache.find_one({"address": address}, {"_id": 0})
    if cached and cached.get("lat") is not None:
        return {"lat": cached["lat"], "lng": cached["lng"]}
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(NOMINATIM_URL, params={
                "q": address, "format": "json", "limit": 1, "countrycodes": "us",
            }, headers={"User-Agent": "VenturaFreshLaundry/1.0"})
            if resp.status_code == 200:
                results = resp.json()
                if results:
                    lat = float(results[0]["lat"])
                    lng = float(results[0]["lon"])
                    await db.geocode_cache.update_one(
                        {"address": address},
                        {"$set": {"address": address, "lat": lat, "lng": lng, "cached_at": datetime.now(timezone.utc).isoformat()}},
                        upsert=True,
                    )
                    return {"lat": lat, "lng": lng}
    except Exception as e:
        logger.warning(f"Geocode failed for '{address}': {e}")
    return {"lat": None, "lng": None}


def _status_map_crm(status: str) -> str:
    """Map CRM order status to logistics status."""
    s = (status or "new").lower().replace(" ", "_")
    mapping = {
        "new": "pending", "confirmed": "pending", "pickup_scheduled": "pending",
        "picked_up": "picked-up", "picked-up": "picked-up",
        "in_process": "in-process", "in-process": "in-process", "processing": "in-process", "washing": "in-process",
        "ready": "ready", "ready_for_delivery": "ready",
        "out_for_delivery": "shipping", "shipping": "shipping", "shipped": "shipping",
        "delivered": "delivered", "completed": "delivered",
    }
    return mapping.get(s, "pending")


def _status_map_store(status: str) -> str:
    """Map store order status to logistics status."""
    s = (status or "pending").lower()
    mapping = {
        "pending": "pending", "processing": "in-process",
        "shipped": "shipping", "delivered": "delivered",
        "completed": "delivered", "paid": "pending",
    }
    return mapping.get(s, "pending")


def _type_map(service_type: str) -> str:
    svc = (service_type or "").lower()
    if "wash" in svc and "fold" in svc:
        return "wash-fold"
    if "airbnb" in svc:
        return "airbnb"
    if "b2b" in svc or "commercial" in svc:
        return "b2b"
    if "self" in svc:
        return "self-service"
    return "pickup-delivery"


@router.get("/orders")
async def get_logistics_orders(
    include_delivered: bool = Query(False, description="Include delivered/completed orders"),
    date: Optional[str] = Query(None, description="Filter by pickup_date YYYY-MM-DD"),
    time_window: Optional[str] = Query(None, description="'morning' (8-12) or 'afternoon' (14-18)"),
    current_user: dict = Depends(get_current_user),
):
    """
    Returns a unified list of all orders (CRM + Store) with lat/lng coordinates
    for the logistics map. Addresses are geocoded and cached.
    Supports optional date and time_window filters.
    """
    results = []

    # 1. CRM orders
    crm_query = {} if include_delivered else {"status": {"$nin": ["delivered", "completed", "cancelled"]}}
    if date:
        crm_query["pickup_date"] = date
    if time_window == "morning":
        crm_query["pickup_time_window"] = "8-12"
    elif time_window == "afternoon":
        crm_query["pickup_time_window"] = "14-18"
    crm_orders = await db.orders.find(crm_query, {"_id": 0}).sort("created_at", -1).limit(100).to_list(100)

    for o in crm_orders:
        address = o.get("pickup_address") or o.get("delivery_address") or ""
        geo = await geocode_address(address) if address else {"lat": None, "lng": None}
        lat = geo["lat"] or (HQ_LAT + (hash(o.get("id", "")) % 100 - 50) * 0.0006)
        lng = geo["lng"] or (HQ_LNG + (hash(o.get("id", "")[::-1]) % 100 - 50) * 0.0006)

        # Fetch customer details if needed
        customer_phone = ""
        customer_email = ""
        if o.get("customer_id"):
            cust = await db.customers.find_one({"id": o["customer_id"]}, {"_id": 0, "phone": 1, "email": 1})
            if cust:
                customer_phone = cust.get("phone", "")
                customer_email = cust.get("email", "")

        total = o.get("total_amount") or 0
        results.append({
            "id": o.get("id"),
            "source": "crm",
            "order_number": o.get("order_number", ""),
            "type": _type_map(o.get("service_type", "")),
            "status": _status_map_crm(o.get("status", "new")),
            "customer": {
                "name": o.get("customer_name", "Cliente"),
                "phone": customer_phone or "",
                "email": customer_email or o.get("preferred_contact", ""),
            },
            "location": {
                "address": address,
                "lat": lat,
                "lng": lng,
                "zipCode": "",
            },
            "service": {
                "weight": o.get("estimated_lbs") or o.get("actual_lbs"),
                "preferences": o.get("notes", ""),
            },
            "pricing": {
                "subtotal": round(total * 0.9225, 2),
                "tax": round(total * 0.0775, 2),
                "total": round(total, 2),
            },
            "payment": {
                "method": o.get("payment_method", "card"),
                "status": o.get("payment_status", "pending"),
            },
            "schedule": {
                "pickupDate": o.get("pickup_date", ""),
                "pickupTime": o.get("pickup_time_window", ""),
                "deliveryDate": "",
                "deliveryTime": "",
            },
            "specialInstructions": o.get("notes", ""),
            "createdAt": o.get("created_at", ""),
        })

    # 2. Store orders
    store_query = {} if include_delivered else {"status": {"$nin": ["delivered", "completed", "cancelled"]}}
    store_orders = await db.store_orders.find(store_query, {"_id": 0}).sort("created_at", -1).limit(50).to_list(50)

    for so in store_orders:
        address = ""
        if isinstance(so.get("shipping_address"), dict):
            address = so["shipping_address"].get("address", "")
        elif isinstance(so.get("shipping_address"), str):
            address = so["shipping_address"]

        geo = await geocode_address(address) if address else {"lat": None, "lng": None}
        lat = geo["lat"] or (HQ_LAT + (hash(so.get("id", "")) % 100 - 50) * 0.0006)
        lng = geo["lng"] or (HQ_LNG + (hash(so.get("id", "")[::-1]) % 100 - 50) * 0.0006)

        total = so.get("total") or 0
        items_desc = ", ".join([i.get("product_name", "") for i in (so.get("items") or [])]) or "Productos"

        results.append({
            "id": so.get("id"),
            "source": "store",
            "order_number": so.get("order_number", ""),
            "type": "pickup-delivery",
            "status": _status_map_store(so.get("status", "pending")),
            "customer": {
                "name": so.get("customer_name", "Cliente"),
                "phone": so.get("customer_phone", ""),
                "email": so.get("customer_email", ""),
            },
            "location": {
                "address": address,
                "lat": lat,
                "lng": lng,
                "zipCode": "",
            },
            "service": {
                "weight": None,
                "items": [items_desc],
                "preferences": so.get("notes", ""),
            },
            "pricing": {
                "subtotal": round(so.get("subtotal", total * 0.9225), 2),
                "tax": round(total * 0.0775, 2),
                "total": round(total, 2),
            },
            "payment": {
                "method": so.get("payment_method", "card"),
                "status": so.get("payment_status", "pending"),
            },
            "schedule": {
                "pickupDate": "",
                "pickupTime": "",
                "deliveryDate": "",
                "deliveryTime": "",
            },
            "specialInstructions": so.get("notes") or (so.get("shipping_address", {}).get("instructions") if isinstance(so.get("shipping_address"), dict) else ""),
            "createdAt": so.get("created_at", ""),
        })

    return results


@router.put("/orders/{order_id}/status")
async def update_logistics_order_status(
    order_id: str,
    payload: dict,
    current_user: dict = Depends(get_current_user),
):
    """Update order status from the logistics map. Works for both CRM and store orders."""
    new_status = payload.get("status", "")
    now = datetime.now(timezone.utc).isoformat()

    # Reverse-map logistics status to CRM status
    logistics_to_crm = {
        "pending": "new", "picked-up": "picked_up", "in-process": "in_process",
        "ready": "ready", "shipping": "out_for_delivery", "delivered": "delivered",
    }
    logistics_to_store = {
        "pending": "pending", "picked-up": "processing", "in-process": "processing",
        "ready": "processing", "shipping": "shipped", "delivered": "delivered",
    }

    # Try CRM orders first
    crm_order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if crm_order:
        crm_status = logistics_to_crm.get(new_status, new_status)
        await db.orders.update_one({"id": order_id}, {"$set": {"status": crm_status, "updated_at": now}})
        return {"ok": True, "source": "crm", "status": crm_status}

    # Try store orders
    store_order = await db.store_orders.find_one({"id": order_id}, {"_id": 0})
    if store_order:
        store_status = logistics_to_store.get(new_status, new_status)
        await db.store_orders.update_one({"id": order_id}, {"$set": {"status": store_status, "updated_at": now}})
        return {"ok": True, "source": "store", "status": store_status}

    return {"ok": False, "error": "Order not found"}
