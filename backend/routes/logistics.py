"""
Logistics endpoint — unified order feed for the Operator Map.
Fixes:
  - Nominatim rate-limit 502: geocoding is fire-and-forget; orders return
    immediately with fallback coords and are geocoded in the background.
  - N+1 customer queries: single bulk $in lookup.
  - Frontend camelCase: orderNumber field added alongside order_number.
  - Added GET /settings to provide vehicle MPG and fuel price to frontend.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import Optional

import httpx
from fastapi import APIRouter, BackgroundTasks, Depends, Query
from pydantic import BaseModel

from auth import get_current_user
from database import db

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/logistics", tags=["logistics"])

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
HQ_LAT = 34.2519
HQ_LNG = -119.2290

# ── In-process memory cache (survives within one process lifetime) ────
_mem_cache: dict = {}

# ========== MODELO PARA /settings ==========
class LogisticsSettingsResponse(BaseModel):
    vehicle_mpg: float
    fuel_price_per_gallon: float
    last_updated: Optional[str] = None


async def get_cached_coords(address: str) -> dict | None:
    """Check memory cache, then DB cache. Returns None if not cached."""
    key = address.strip().lower()
    if key in _mem_cache:
        return _mem_cache[key]
    row = await db.geocode_cache.find_one({"address": key}, {"_id": 0, "lat": 1, "lng": 1})
    if row and row.get("lat") is not None:
        result = {"lat": row["lat"], "lng": row["lng"]}
        _mem_cache[key] = result
        return result
    return None


async def geocode_and_cache(address: str) -> None:
    """
    Background task: geocode via Nominatim and persist to DB + memory.
    Never raises — failures are logged silently.
    """
    key = address.strip().lower()
    if not address or len(key) < 5:
        return
    # Don't re-geocode if already cached
    if key in _mem_cache:
        return
    existing = await db.geocode_cache.find_one({"address": key}, {"_id": 0, "lat": 1})
    if existing and existing.get("lat") is not None:
        return
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                NOMINATIM_URL,
                params={"q": address, "format": "json", "limit": 1, "countrycodes": "us"},
                headers={"User-Agent": "VenturaFreshLaundry/1.0"},
            )
            if resp.status_code == 200:
                results = resp.json()
                if results:
                    lat = float(results[0]["lat"])
                    lng = float(results[0]["lon"])
                    result = {"lat": lat, "lng": lng}
                    _mem_cache[key] = result
                    await db.geocode_cache.update_one(
                        {"address": key},
                        {"$set": {"address": key, "lat": lat, "lng": lng,
                                  "cached_at": datetime.now(timezone.utc).isoformat()}},
                        upsert=True,
                    )
                    logger.info(f"Geocoded '{address}' → {lat},{lng}")
    except Exception as exc:
        logger.warning(f"Geocode failed for '{address}': {exc}")


def _fallback(seed: str) -> tuple:
    return (
        HQ_LAT + (hash(seed) % 100 - 50) * 0.0006,
        HQ_LNG + (hash(seed[::-1]) % 100 - 50) * 0.0006,
    )


def _crm_status(s: str) -> str:
    return {
        "new": "pending", "confirmed": "pending", "pickup_scheduled": "pending",
        "picked_up": "picked-up", "picked-up": "picked-up",
        "in_process": "in-process", "in-process": "in-process",
        "processing": "in-process", "washing": "in-process",
        "ready": "ready", "ready_for_delivery": "ready",
        "out_for_delivery": "shipping", "shipping": "shipping",
        "delivered": "delivered", "completed": "delivered",
    }.get((s or "new").lower().replace(" ", "_"), "pending")


def _store_status(s: str) -> str:
    return {
        "pending": "pending", "processing": "in-process",
        "shipped": "shipping", "delivered": "delivered",
        "completed": "delivered", "paid": "pending",
    }.get((s or "pending").lower(), "pending")


def _type_map(svc: str) -> str:
    s = (svc or "").lower()
    if "wash" in s and "fold" in s: return "wash-fold"
    if "airbnb" in s: return "airbnb"
    if "b2b" in s or "commercial" in s: return "b2b"
    if "self" in s: return "self-service"
    return "pickup-delivery"


@router.get("/orders")
async def get_logistics_orders(
    background_tasks: BackgroundTasks,
    include_delivered: bool = Query(False),
    date: Optional[str] = Query(None),
    time_window: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_user),
):
    results = []

    # ── CRM orders ───────────────────────────────────────────────────
    crm_q: dict = {} if include_delivered else {
        "status": {"$nin": ["delivered", "completed", "cancelled"]}
    }
    if date:
        crm_q["pickup_date"] = date
    if time_window == "morning":
        crm_q["pickup_time_window"] = {"$regex": "^(8am|8:00|9:00|8-12)", "$options": "i"}
    elif time_window == "afternoon":
        crm_q["pickup_time_window"] = {"$regex": "^(2pm|2:00|14|14-18)", "$options": "i"}

    crm_orders = await db.orders.find(crm_q, {"_id": 0}).sort("created_at", -1).limit(100).to_list(100)

    # Bulk customer lookup — single query, not N+1
    cust_ids = list({o["customer_id"] for o in crm_orders if o.get("customer_id")})
    cust_map: dict = {}
    if cust_ids:
        docs = await db.customers.find(
            {"id": {"$in": cust_ids}},
            {"_id": 0, "id": 1, "phone": 1, "email": 1},
        ).to_list(len(cust_ids))
        cust_map = {d["id"]: d for d in docs}

    for o in crm_orders:
        address = o.get("pickup_address") or o.get("delivery_address") or ""
        oid = o.get("id", "")

        # Use cached coords if available; otherwise fallback + schedule background geocoding
        cached = await get_cached_coords(address) if address else None
        if cached:
            lat, lng = cached["lat"], cached["lng"]
        else:
            lat, lng = _fallback(oid)
            if address:
                background_tasks.add_task(geocode_and_cache, address)

        cust = cust_map.get(o.get("customer_id", ""), {})
        total = float(o.get("total_amount") or 0)
        order_num = o.get("order_number", "")

        results.append({
            "id": oid,
            "source": "crm",
            # Both camelCase (frontend) and snake_case (legacy) provided
            "orderNumber": order_num,
            "order_number": order_num,
            "type": _type_map(o.get("service_type", "")),
            "status": _crm_status(o.get("status", "new")),
            "customer": {
                "name": o.get("customer_name", "Cliente"),
                "phone": cust.get("phone", ""),
                "email": cust.get("email", o.get("preferred_contact", "")),
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

    # ── Store orders ─────────────────────────────────────────────────
    store_q: dict = {} if include_delivered else {
        "status": {"$nin": ["delivered", "completed", "cancelled"]}
    }
    store_orders = await db.store_orders.find(store_q, {"_id": 0}).sort("created_at", -1).limit(50).to_list(50)

    for so in store_orders:
        addr = ""
        if isinstance(so.get("shipping_address"), dict):
            addr = so["shipping_address"].get("address", "")
        elif isinstance(so.get("shipping_address"), str):
            addr = so["shipping_address"]

        sid = so.get("id", "")
        cached = await get_cached_coords(addr) if addr else None
        if cached:
            lat, lng = cached["lat"], cached["lng"]
        else:
            lat, lng = _fallback(sid)
            if addr:
                background_tasks.add_task(geocode_and_cache, addr)

        total = float(so.get("total") or 0)
        items_desc = ", ".join(i.get("product_name", "") for i in (so.get("items") or [])) or "Productos"
        instructions = ""
        if isinstance(so.get("shipping_address"), dict):
            instructions = so["shipping_address"].get("instructions", "")
        so_num = so.get("order_number", "")

        results.append({
            "id": sid,
            "source": "store",
            "orderNumber": so_num,
            "order_number": so_num,
            "type": "pickup-delivery",
            "status": _store_status(so.get("status", "pending")),
            "customer": {
                "name": so.get("customer_name", "Cliente"),
                "phone": so.get("customer_phone", ""),
                "email": so.get("customer_email", ""),
            },
            "location": {"address": addr, "lat": lat, "lng": lng, "zipCode": ""},
            "service": {"weight": None, "items": [items_desc], "preferences": so.get("notes", "")},
            "pricing": {
                "subtotal": round(so.get("subtotal", total * 0.9225), 2),
                "tax": round(total * 0.0775, 2),
                "total": round(total, 2),
            },
            "payment": {
                "method": so.get("payment_method", "card"),
                "status": so.get("payment_status", "pending"),
            },
            "schedule": {"pickupDate": "", "pickupTime": "", "deliveryDate": "", "deliveryTime": ""},
            "specialInstructions": so.get("notes") or instructions,
            "createdAt": so.get("created_at", ""),
        })

    return results


@router.put("/orders/{order_id}/status")
async def update_logistics_order_status(
    order_id: str,
    payload: dict,
    current_user: dict = Depends(get_current_user),
):
    new_status = payload.get("status", "")
    now = datetime.now(timezone.utc).isoformat()
    to_crm = {
        "pending": "new", "picked-up": "picked_up", "in-process": "in_process",
        "ready": "ready", "shipping": "out_for_delivery", "delivered": "delivered",
    }
    to_store = {
        "pending": "pending", "picked-up": "processing", "in-process": "processing",
        "ready": "processing", "shipping": "shipped", "delivered": "delivered",
    }
    if await db.orders.find_one({"id": order_id}, {"_id": 0, "id": 1}):
        crm_s = to_crm.get(new_status, new_status)
        await db.orders.update_one({"id": order_id}, {"$set": {"status": crm_s, "updated_at": now}})
        return {"ok": True, "source": "crm", "status": crm_s}
    if await db.store_orders.find_one({"id": order_id}, {"_id": 0, "id": 1}):
        store_s = to_store.get(new_status, new_status)
        await db.store_orders.update_one({"id": order_id}, {"$set": {"status": store_s, "updated_at": now}})
        return {"ok": True, "source": "store", "status": store_s}
    return {"ok": False, "error": "Order not found"}


# ========== ENDPOINT PARA CONFIGURACIÓN LOGÍSTICA (MPG y precio combustible) ==========
@router.get("/settings", response_model=LogisticsSettingsResponse)
async def get_logistics_settings(current_user: dict = Depends(get_current_user)):
    """
    Devuelve la eficiencia del vehículo (MPG) y el precio actual del combustible
    para que el frontend calcule costes reales.
    Los valores se leen de:
      - Perfil del usuario (vehicle_mpg) o valor por defecto 12
      - Configuración global "logistics" (fuel_price_per_gallon) o por defecto 4.89
    """
    user_id = current_user["id"]
    user = await db.users.find_one({"_id": user_id}, {"_id": 0, "vehicle_mpg": 1})
    vehicle_mpg = user.get("vehicle_mpg", 12.0) if user else 12.0

    config = await db.config.find_one({"_id": "logistics"}, {"_id": 0, "fuel_price_per_gallon": 1})
    fuel_price = config.get("fuel_price_per_gallon", 4.89) if config else 4.89

    return LogisticsSettingsResponse(
        vehicle_mpg=vehicle_mpg,
        fuel_price_per_gallon=fuel_price,
        last_updated=datetime.now(timezone.utc).isoformat()
    )