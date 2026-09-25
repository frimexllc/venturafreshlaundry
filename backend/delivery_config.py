"""
Centralized delivery configuration — coordinates, fees, geocoding, distance.
Used by: routes/logistics.py, routes/geocode.py, routes/delivery_rules.py
"""
import os
import logging
from typing import Optional, Dict, Any, List

import httpx

import domain.delivery as domain_delivery

logger = logging.getLogger(__name__)

# ── API keys ──────────────────────────────────────────────────────────────────
ORS_API_KEY = os.environ.get("ORS_API_KEY", "")
GOOGLE_MAPS_API_KEY = os.environ.get("REACT_APP_GOOGLE_MAPS_API_KEY", "")

USE_ORS = bool(ORS_API_KEY)
USE_GOOGLE_MAPS = bool(GOOGLE_MAPS_API_KEY)

# ── Store location ────────────────────────────────────────────────────────────
STORE_LAT = 34.264309
STORE_LNG = -119.213742
STORE_ADDRESS = "5722 Telephone Rd Suite 5, Ventura CA 93003"

# ── Delivery constants ────────────────────────────────────────────────────────
# Tier table, fee math and haversine distance now live in domain/delivery.py
# (the single source of truth also used by utils.py, routes/delivery_config.py
# and routes/delivery_rules.py). These names are kept for the modules that
# still import them directly from here (routes/geocode.py, routes/logistics.py,
# routes/delivery_rules.py).
MAX_DELIVERY_MILES = domain_delivery.get_max_service_miles()
FREE_MILES_LIMIT = domain_delivery.get_free_miles_limit()
METERS_PER_MILE = 1609.34
DEFAULT_FUEL_PRICE_PER_GALLON = 4.89
DRIVER_HOURLY_RATE = 18.0

DELIVERY_FEE_TIERS = domain_delivery.get_delivery_fee_tiers()

haversine_miles = domain_delivery.haversine_miles


# ── Delivery fee calculation ──────────────────────────────────────────────────
def calculate_delivery_fee(distance_miles: float) -> float:
    return domain_delivery.calculate_delivery_fee(distance_miles)


def get_delivery_info(distance_miles: float) -> dict:
    return domain_delivery.get_delivery_info(
        distance_miles, tiers=DELIVERY_FEE_TIERS, max_service_miles=MAX_DELIVERY_MILES
    )


# ── Geocoding ─────────────────────────────────────────────────────────────────
def geocode_address(address: str) -> Optional[Dict[str, float]]:
    if not address:
        return None

    if ORS_API_KEY:
        try:
            with httpx.Client(timeout=10) as client:
                resp = client.get(
                    "https://api.openrouteservice.org/geocode/search",
                    params={"text": address, "size": 1, "boundary.country": "US"},
                    headers={"Authorization": ORS_API_KEY},
                )
                if resp.status_code == 200:
                    features = resp.json().get("features", [])
                    if features:
                        coords = features[0]["geometry"]["coordinates"]
                        return {"lat": coords[1], "lng": coords[0]}
        except Exception as e:
            logger.warning(f"ORS geocode error: {e}")

    if GOOGLE_MAPS_API_KEY:
        try:
            with httpx.Client(timeout=10) as client:
                resp = client.get(
                    "https://maps.googleapis.com/maps/api/geocode/json",
                    params={"address": address, "key": GOOGLE_MAPS_API_KEY},
                )
                if resp.status_code == 200:
                    results = resp.json().get("results", [])
                    if results:
                        loc = results[0]["geometry"]["location"]
                        return {"lat": loc["lat"], "lng": loc["lng"]}
        except Exception as e:
            logger.warning(f"Google geocode error: {e}")

    return None


# ── ORS driving distance (sync) ──────────────────────────────────────────────
def get_distance_ors_sync(lat: float, lng: float) -> Optional[dict]:
    if not ORS_API_KEY:
        return None
    try:
        with httpx.Client(timeout=12) as client:
            resp = client.post(
                "https://api.openrouteservice.org/v2/directions/driving-car/json",
                headers={"Authorization": ORS_API_KEY, "Content-Type": "application/json"},
                json={"coordinates": [[STORE_LNG, STORE_LAT], [lng, lat]]},
            )
            if resp.status_code == 200:
                routes = resp.json().get("routes", [])
                if routes:
                    summary = routes[0].get("summary", {})
                    return {
                        "distance_miles": round(summary.get("distance", 0) / METERS_PER_MILE, 2),
                        "duration_minutes": round(summary.get("duration", 0) / 60, 1),
                        "source": "ors_driving",
                    }
    except Exception as e:
        logger.warning(f"ORS distance error: {e}")
    return None


# ── Async driving distance ────────────────────────────────────────────────────
async def calculate_driving_distance_async(destination: str) -> dict:
    if ORS_API_KEY:
        try:
            parts = destination.replace("POINT(", "").replace(")", "").split()
            d_lng, d_lat = float(parts[0]), float(parts[1])
            async with httpx.AsyncClient(timeout=12) as client:
                resp = await client.post(
                    "https://api.openrouteservice.org/v2/directions/driving-car/json",
                    headers={"Authorization": ORS_API_KEY, "Content-Type": "application/json"},
                    json={"coordinates": [[STORE_LNG, STORE_LAT], [d_lng, d_lat]]},
                )
                if resp.status_code == 200:
                    routes = resp.json().get("routes", [])
                    if routes:
                        summary = routes[0].get("summary", {})
                        return {
                            "distance_miles": round(summary.get("distance", 0) / METERS_PER_MILE, 2),
                            "duration_minutes": round(summary.get("duration", 0) / 60, 1),
                            "source": "ors_driving",
                        }
        except Exception as e:
            logger.warning(f"Async ORS distance error: {e}")

    return {"distance_miles": None, "duration_minutes": None, "source": "failed"}


# alias
calculate_distance_async = calculate_driving_distance_async


# ── Validate delivery address ─────────────────────────────────────────────────
def validate_delivery_address(address: str, zip_code: Optional[str] = None) -> dict:
    coords = geocode_address(address)
    if not coords:
        return {"valid": False, "error": "Could not geocode address", "allowed": False}

    distance = haversine_miles(STORE_LAT, STORE_LNG, coords["lat"], coords["lng"])
    allowed = distance <= MAX_DELIVERY_MILES
    info = get_delivery_info(distance)

    return {
        "valid": True,
        "allowed": allowed,
        "lat": coords["lat"],
        "lng": coords["lng"],
        "distance_miles": round(distance, 2),
        "delivery_fee": info["fee"] if allowed else None,
        "is_free_delivery": info["is_free"] if allowed else False,
        "tier": info["tier"],
        "message": None if allowed else f"Delivery not available beyond {MAX_DELIVERY_MILES} miles",
    }


# ── Batch delivery costs ─────────────────────────────────────────────────────
def calculate_batch_delivery_costs(addresses: List[str]) -> List[dict]:
    results = []
    for addr in addresses:
        coords = geocode_address(addr)
        if not coords:
            results.append({"address": addr, "error": "geocode_failed"})
            continue
        dist = haversine_miles(STORE_LAT, STORE_LNG, coords["lat"], coords["lng"])
        info = get_delivery_info(dist)
        results.append({
            "address": addr,
            "lat": coords["lat"],
            "lng": coords["lng"],
            "distance_miles": round(dist, 2),
            "delivery_fee": info["fee"],
            "allowed": info["allowed"],
        })
    return results


# ── Route optimization (simple nearest-neighbor) ─────────────────────────────
def optimize_route(addresses: List[str]) -> dict:
    points = []
    for addr in addresses:
        coords = geocode_address(addr)
        if coords:
            points.append({"address": addr, **coords})
        else:
            points.append({"address": addr, "lat": STORE_LAT, "lng": STORE_LNG})

    if not points:
        return {"route": [], "total_distance_miles": 0, "total_duration_minutes": 0}

    # Nearest-neighbor from store
    remaining = list(range(len(points)))
    route = []
    cur_lat, cur_lng = STORE_LAT, STORE_LNG
    total_dist = 0.0

    while remaining:
        nearest_idx = min(
            remaining,
            key=lambda i: haversine_miles(cur_lat, cur_lng, points[i]["lat"], points[i]["lng"]),
        )
        d = haversine_miles(cur_lat, cur_lng, points[nearest_idx]["lat"], points[nearest_idx]["lng"])
        total_dist += d
        cur_lat = points[nearest_idx]["lat"]
        cur_lng = points[nearest_idx]["lng"]
        route.append(points[nearest_idx])
        remaining.remove(nearest_idx)

    # Return leg
    total_dist += haversine_miles(cur_lat, cur_lng, STORE_LAT, STORE_LNG)

    return {
        "route": route,
        "total_distance_miles": round(total_dist, 2),
        "total_duration_minutes": round(total_dist / 30 * 60, 1),
    }
