"""
TomTom Traffic Incidents — real-time traffic for the Ventura delivery area.
Fetches from TomTom Traffic Incidents API v5 and caches for 5 minutes.
"""
import os
import logging
import time
from fastapi import APIRouter, Depends
from typing import Optional

import httpx

from auth import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/traffic", tags=["Traffic"])

TOMTOM_KEY = os.environ.get("TOMTOM_API_KEY", "")
TOMTOM_INCIDENTS_URL = "https://api.tomtom.com/traffic/services/5/incidentDetails"

# Bounding box for Ventura / Oxnard area (minLon, minLat, maxLon, maxLat)
VENTURA_BBOX = "-119.40,34.15,-119.05,34.35"

# Simple in-memory cache
_cache: dict = {"events": [], "ts": 0}
CACHE_TTL = 300  # 5 minutes

SEVERITY_MAP = {
    0: "unknown",
    1: "minor",
    2: "moderate",
    3: "major",
    4: "undefined",
}

ICON_CATEGORY_MAP = {
    0: "Unknown",
    1: "Accidente",
    2: "Niebla",
    3: "Peligro",
    4: "Lluvia",
    5: "Hielo",
    6: "Congestion",
    7: "Carril cerrado",
    8: "Carretera cerrada",
    9: "Obras",
    10: "Viento",
    11: "Inundacion",
    14: "Camion averiado",
}


def _tomtom_severity_to_local(magnitude: int) -> str:
    """Convert TomTom magnitude (0-4) to our local severity labels."""
    if magnitude <= 1:
        return "light"
    if magnitude == 2:
        return "moderate"
    return "heavy"


def _estimate_delay(magnitude: int, length_meters: int) -> int:
    """Estimate delay in minutes based on severity and incident length."""
    base = {0: 2, 1: 4, 2: 8, 3: 15, 4: 20}
    km = max(length_meters / 1000, 0.1)
    return max(1, int(base.get(magnitude, 5) * min(km, 5)))


async def _fetch_tomtom_incidents() -> list:
    """Fetch real-time incidents from TomTom API."""
    if not TOMTOM_KEY:
        logger.warning("TOMTOM_API_KEY not set — returning empty traffic")
        return []

    fields = (
        "{incidents{type,geometry{type,coordinates},"
        "properties{id,iconCategory,magnitudeOfDelay,events{description},"
        "startTime,endTime,from,to,length,delay,roadNumbers}}}"
    )

    params = {
        "key": TOMTOM_KEY,
        "bbox": VENTURA_BBOX,
        "fields": fields,
        "language": "es-ES",
        "timeValidityFilter": "present",
    }

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(TOMTOM_INCIDENTS_URL, params=params)
            resp.raise_for_status()
            data = resp.json()
    except Exception as e:
        logger.error(f"TomTom API error: {e}")
        return []

    incidents = data.get("incidents", [])
    events = []

    for inc in incidents:
        props = inc.get("properties", {})
        geom = inc.get("geometry", {})
        coords = geom.get("coordinates", [])

        # Get center point from geometry
        if geom.get("type") == "Point" and len(coords) >= 2:
            lng, lat = coords[0], coords[1]
        elif geom.get("type") == "LineString" and coords:
            mid = coords[len(coords) // 2]
            lng, lat = mid[0], mid[1]
        else:
            continue

        magnitude = props.get("magnitudeOfDelay") or 0
        icon_cat = props.get("iconCategory") or 0
        length_m = props.get("length") or 500
        delay_sec = props.get("delay") or 0

        event_descriptions = []
        for ev in props.get("events", []):
            desc = ev.get("description", "")
            if desc:
                event_descriptions.append(desc)

        road_from = props.get("from", "")
        road_to = props.get("to", "")
        road_nums = props.get("roadNumbers", [])
        road_name = " / ".join(road_nums) if road_nums else road_from

        description = " ".join(event_descriptions) if event_descriptions else ICON_CATEGORY_MAP.get(icon_cat, "Incidente")
        if road_from and road_to:
            description += f" — de {road_from} a {road_to}"

        delay_min = delay_sec // 60 if delay_sec > 60 else _estimate_delay(magnitude, length_m)

        events.append({
            "id": props.get("id", f"tt-{lat}-{lng}"),
            "road": road_name or f"Ruta ({lat:.3f}, {lng:.3f})",
            "description": description,
            "lat": lat,
            "lng": lng,
            "severity": _tomtom_severity_to_local(magnitude),
            "delayMinutes": max(1, delay_min),
            "source": "tomtom",
            "iconCategory": ICON_CATEGORY_MAP.get(icon_cat, "Desconocido"),
        })

    logger.info(f"TomTom: {len(events)} incidents in Ventura area")
    return events


@router.get("/incidents")
async def get_traffic_incidents(current_user: dict = Depends(get_current_user)):
    """Return real-time traffic incidents for the delivery area. Cached 5 min."""
    now = time.time()

    if now - _cache["ts"] < CACHE_TTL and _cache["events"] is not None:
        return {"events": _cache["events"], "cached": True, "source": "tomtom"}

    events = await _fetch_tomtom_incidents()
    _cache["events"] = events
    _cache["ts"] = now

    return {"events": events, "cached": False, "source": "tomtom"}
