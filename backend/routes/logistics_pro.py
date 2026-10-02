"""
LogisticaPro — standalone, high-performance logistics module (phase 1).

Separate from the existing /api/logistics map: its own driver-location
collection and realtime channel, so it can evolve (3D tracking, advanced
multi-vehicle routing, voice assistant) without touching the stable
logistics map operators already rely on.

Phase 1 scope: real-time multi-driver GPS tracking for a full-screen 3D
map view. A driver's phone posts its position every few seconds while
sharing is active; every connected dispatcher sees it move live via the
same Socket.IO channel the rest of the app uses for notifications.
"""
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional, List

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from auth import get_current_user
from database import db
from realtime import emit_realtime

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/logistics-pro", tags=["LogisticaPro"])

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
