"""
LogisticaPro — standalone, high-performance logistics module.

Separate from the existing /api/logistics map: its own driver-location
collection and realtime channel, so it can evolve (3D tracking, advanced
multi-vehicle routing, voice assistant) without touching the stable
logistics map operators already rely on.

Phase 1: real-time multi-driver GPS tracking for a full-screen 3D map
view. A driver's phone posts its position every few seconds while
sharing is active; every connected dispatcher sees it move live via the
same Socket.IO channel the rest of the app uses for notifications.

Phase 2: multi-vehicle route optimization (VRP) — splits a set of
orders across several drivers and orders each driver's stops, using
Google OR-Tools (see vrp_solver.py).
"""
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from auth import get_current_user
from database import db
from delivery_config import STORE_LAT, STORE_LNG
from realtime import emit_realtime
from vrp_solver import solve_vrp

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/logistics-pro", tags=["LogisticaPro"])

MAX_VEHICLES = 10

# A driver who hasn't reported a position in this long is treated as
# offline and dropped from the active list, rather than leaving a stale
# marker frozen on the map indefinitely.
ACTIVE_WINDOW_MINUTES = 5


class DriverLocationUpdate(BaseModel):
    lat: float = Field(..., ge=-90, le=90)
    lng: float = Field(..., ge=-180, le=180)
    heading: Optional[float] = Field(None, ge=0, le=360)
    speed: Optional[float] = None
    accuracy: Optional[float] = None


@router.post("/driver-location")
async def report_driver_location(
    data: DriverLocationUpdate,
    current_user: dict = Depends(get_current_user),
) -> dict:
    now = datetime.now(timezone.utc).isoformat()
    record = {
        "user_id": current_user["id"],
        "name": current_user.get("name") or "Conductor",
        "lat": data.lat,
        "lng": data.lng,
        "heading": data.heading,
        "speed": data.speed,
        "accuracy": data.accuracy,
        "updated_at": now,
    }
    await db.logisticapro_driver_locations.update_one(
        {"user_id": current_user["id"]},
        {"$set": record},
        upsert=True,
    )

    await emit_realtime("notification", {
        "type": "logisticapro_driver_location",
        **record,
    })

    return {"ok": True}


@router.get("/driver-locations")
async def list_driver_locations(
    current_user: dict = Depends(get_current_user),
) -> List[dict]:
    cutoff = (datetime.now(timezone.utc) - timedelta(minutes=ACTIVE_WINDOW_MINUTES)).isoformat()
    docs = await db.logisticapro_driver_locations.find(
        {"updated_at": {"$gte": cutoff}}, {"_id": 0}
    ).to_list(200)
    return docs


@router.post("/driver-location/stop")
async def stop_sharing_location(
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Explicit stop (e.g. the driver ends navigation) so the marker
    disappears immediately instead of waiting out the active window."""
    await db.logisticapro_driver_locations.delete_one({"user_id": current_user["id"]})
    await emit_realtime("notification", {
        "type": "logisticapro_driver_offline",
        "user_id": current_user["id"],
    })
    return {"ok": True}


class OptimizeRoutesRequest(BaseModel):
    order_ids: List[str] = Field(..., min_items=1)
    num_vehicles: int = Field(..., ge=1, le=MAX_VEHICLES)


@router.post("/optimize-routes")
async def optimize_routes(
    data: OptimizeRoutesRequest,
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Splits the given orders across `num_vehicles` drivers and orders
    each driver's stops to minimize (and balance) driving distance.
    Looks up each order's stored coordinates server-side rather than
    trusting whatever the client sends, consistent with how the rest of
    the logistics endpoints handle order data."""
    orders = await db.orders.find(
        {"id": {"$in": data.order_ids}}, {"_id": 0, "id": 1, "location": 1}
    ).to_list(len(data.order_ids))
    orders_by_id = {o["id"]: o for o in orders}

    stops = []
    skipped: List[str] = []
    for order_id in data.order_ids:
        order = orders_by_id.get(order_id)
        location = order.get("location") if order else None
        lat, lng = (location or {}).get("lat"), (location or {}).get("lng")
        if lat is None or lng is None:
            skipped.append(order_id)
            continue
        stops.append({"id": order_id, "lat": lat, "lng": lng})

    if not stops:
        raise HTTPException(status_code=400, detail="None of the given orders have usable coordinates")

    depot = {"id": "__depot__", "lat": STORE_LAT, "lng": STORE_LNG}
    result = solve_vrp(depot, stops, num_vehicles=data.num_vehicles)

    await create_audit_log_safe(current_user.get("id"), len(stops), data.num_vehicles)

    return {
        "routes": result["routes"],
        "unassigned": result["unassigned"],
        "skipped_no_coordinates": skipped,
    }


async def create_audit_log_safe(user_id: Optional[str], num_stops: int, num_vehicles: int) -> None:
    """Best-effort audit entry — optimizing routes shouldn't fail just
    because logging it did."""
    try:
        from utils import create_audit_log
        await create_audit_log(
            "LOGISTICAPRO_ROUTES_OPTIMIZED", "logistics_pro", "", user_id,
            {"num_stops": num_stops, "num_vehicles": num_vehicles},
        )
    except Exception as e:
        logger.warning(f"Audit log failed for route optimization: {e}")
