"""Geocode / Distance endpoints — OpenRouteService integration"""
import os
import logging
import httpx
from fastapi import APIRouter, HTTPException, Query

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/geocode", tags=["geocode"])

ORS_API_KEY = os.environ.get("ORS_API_KEY", "")
STORE_LAT = 34.283
STORE_LNG = -119.293
METERS_PER_MILE = 1609.344

DELIVERY_RULES = [
    {"max_miles": 3, "fee": 0.0, "label": "Free delivery"},
    {"max_miles": 10, "fee": 2.99, "label": "$2.99 delivery fee"},
]
MAX_DELIVERY_MILES = 10


@router.get("/distance")
async def get_distance(
    lat: float = Query(..., description="Destination latitude"),
    lng: float = Query(..., description="Destination longitude"),
):
    if not ORS_API_KEY:
        raise HTTPException(status_code=503, detail="ORS_API_KEY not configured")

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                "https://api.openrouteservice.org/v2/directions/driving-car",
                params={
                    "api_key": ORS_API_KEY,
                    "start": f"{STORE_LNG},{STORE_LAT}",
                    "end": f"{lng},{lat}",
                },
            )
            resp.raise_for_status()
            data = resp.json()

        segment = data["features"][0]["properties"]["segments"][0]
        distance_m = segment["distance"]
        duration_s = segment["duration"]
        distance_miles = round(distance_m / METERS_PER_MILE, 2)

        if distance_miles > MAX_DELIVERY_MILES:
            return {
                "distance_miles": distance_miles,
                "duration_minutes": round(duration_s / 60, 1),
                "delivery_fee": None,
                "allowed": False,
                "message": f"Delivery not available beyond {MAX_DELIVERY_MILES} miles",
            }

        fee = 0.0
        label = ""
        for rule in DELIVERY_RULES:
            if distance_miles <= rule["max_miles"]:
                fee = rule["fee"]
                label = rule["label"]
                break

        return {
            "distance_miles": distance_miles,
            "duration_minutes": round(duration_s / 60, 1),
            "delivery_fee": fee,
            "allowed": True,
            "label": label,
        }

    except httpx.HTTPStatusError as exc:
        logger.error("ORS API error: %s", exc.response.text)
        raise HTTPException(status_code=502, detail="Distance service error")
    except Exception as exc:
        logger.error("Distance calc failed: %s", exc)
        raise HTTPException(status_code=500, detail="Distance calculation failed")
