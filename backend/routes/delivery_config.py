"""
Delivery Configuration - Centralized delivery rules, geocoding, and distance calculation
All delivery-related logic is defined here to avoid duplication across the codebase.

Features:
- Real driving distance calculation (ORS + Google Maps)
- Tiered delivery fee calculation
- Fuel cost calculation
- Route optimization for multiple deliveries
- ETA estimation
- Carbon footprint calculation
- ZIP code validation
- Delivery zones management (circles/polygons)
- Store location configuration
"""

import os
import math
import logging
import httpx
from typing import Dict, List, Optional, Tuple, Any, Union
from functools import lru_cache
from urllib.parse import quote
from datetime import datetime, timedelta
import json
import asyncio
from dataclasses import dataclass, field
from enum import Enum

logger = logging.getLogger(__name__)

# ==================== ENUMS & DATA CLASSES ====================

class DistanceUnit(Enum):
    MILES = "miles"
    KILOMETERS = "km"
    METERS = "meters"

class VehicleType(Enum):
    CAR = "car"
    SUV = "suv"
    TRUCK = "truck"
    VAN = "van"
    ELECTRIC = "electric"

@dataclass
class VehicleSpecs:
    """Fuel consumption specs by vehicle type"""
    fuel_efficiency_mpg: float  # miles per gallon
    co2_per_mile_kg: float      # CO2 emissions per mile in kg
    
VEHICLE_SPECS = {
    VehicleType.CAR: VehicleSpecs(fuel_efficiency_mpg=25.0, co2_per_mile_kg=0.35),
    VehicleType.SUV: VehicleSpecs(fuel_efficiency_mpg=18.0, co2_per_mile_kg=0.48),
    VehicleType.TRUCK: VehicleSpecs(fuel_efficiency_mpg=15.0, co2_per_mile_kg=0.58),
    VehicleType.VAN: VehicleSpecs(fuel_efficiency_mpg=16.0, co2_per_mile_kg=0.52),
    VehicleType.ELECTRIC: VehicleSpecs(fuel_efficiency_mpg=100.0, co2_per_mile_kg=0.08),
}

# ==================== CONFIGURACIÓN DESDE ENTORNO ====================

def _get_env_float(key: str, default: float) -> float:
    try:
        return float(os.environ.get(key, default))
    except (ValueError, TypeError):
        return default

def _get_env_int(key: str, default: int) -> int:
    try:
        return int(os.environ.get(key, default))
    except (ValueError, TypeError):
        return default

def _parse_tiers_from_env() -> Optional[List[Dict]]:
    """Lee los tiers desde la variable DELIVERY_TIERS (formato: '3:0,5:1.99,8:2.99,12:4.99,15:8.99')"""
    tiers_str = os.environ.get("DELIVERY_TIERS", "")
    if not tiers_str:
        return None
    tiers = []
    prev = 0
    for part in tiers_str.split(","):
        part = part.strip()
        if ":" in part:
            miles_str, fee_str = part.split(":", 1)
            try:
                miles = float(miles_str)
                fee = float(fee_str)
                tiers.append({
                    "max_miles": miles,
                    "fee": fee,
                    "label": f"${fee:.2f}" if fee > 0 else "FREE",
                    "description": f"{int(prev)}–{int(miles)} miles" if prev > 0 else f"0–{int(miles)} miles"
                })
                prev = miles
            except ValueError:
                continue
    return tiers if tiers else None

# ==================== TIERED DELIVERY FEES ====================
# Si existe DELIVERY_TIERS en el entorno, usarlo; de lo contrario, valores por defecto
_env_tiers = _parse_tiers_from_env()
if _env_tiers:
    DELIVERY_FEE_TIERS = _env_tiers
else:
    DELIVERY_FEE_TIERS = [
        {"max_miles": 3,   "fee": 0.00,  "label": "FREE",     "description": "0–3 miles"},
        {"max_miles": 5,   "fee": 1.99,  "label": "$1.99",    "description": "3–5 miles"},
        {"max_miles": 8,   "fee": 2.99,  "label": "$2.99",    "description": "5–8 miles"},
        {"max_miles": 12,  "fee": 4.99,  "label": "$4.99",    "description": "8–12 miles"},
        {"max_miles": 15,  "fee": 8.99,  "label": "$8.99",    "description": "12–15 miles"},
    ]

# ==================== DELIVERY LIMITS ====================
MAX_DELIVERY_MILES = _get_env_float("MAX_SERVICE_MILES", 15.0)
FREE_MILES_LIMIT = _get_env_float("FREE_MILES_LIMIT", 3.0)
MIN_DELIVERY_FEE = _get_env_float("SHIPPING_MIN_FEE", 0.00)
MAX_DELIVERY_FEE = _get_env_float("SHIPPING_MAX_FEE", DELIVERY_FEE_TIERS[-1]["fee"])
RATE_PER_MILE_AFTER_FREE = _get_env_float("SHIPPING_RATE_PER_KM", 1.5) * 1.60934  # ~2.41 USD/milla

# ==================== FUEL & COST CONFIGURATION ====================
DEFAULT_FUEL_PRICE_PER_GALLON = _get_env_float("FUEL_PRICE_PER_GALLON", 4.50)
DEFAULT_VEHICLE_TYPE = VehicleType.CAR
DRIVER_HOURLY_RATE = _get_env_float("DRIVER_HOURLY_RATE", 25.00)
LOADING_UNLOADING_TIME_MIN = _get_env_int("LOADING_TIME_MIN", 15)

# ==================== STORE LOCATION ====================
STORE_ADDRESS = os.environ.get("STORE_ADDRESS", "5722 Telephone Rd Suite 5, Ventura CA 93003")
STORE_COORDS = (34.26417467703335, -119.2137144733685)
STORE_LAT = STORE_COORDS[0]
STORE_LNG = STORE_COORDS[1]
METERS_PER_MILE = 1609.344
METERS_PER_KM = 1000

# ==================== AUTHORIZED ZIP CODES ====================
AUTHORIZED_ZIPS = {
    # Ventura
    "93001": {"city": "Ventura", "zone": "core", "free_miles": 3, "base_fee": 0.00},
    "93003": {"city": "Ventura", "zone": "core", "free_miles": 3, "base_fee": 0.00},
    "93004": {"city": "Ventura", "zone": "core", "free_miles": 3, "base_fee": 0.00},
    # Oxnard
    "93030": {"city": "Oxnard", "zone": "extended", "free_miles": 3, "base_fee": 0.00},
    "93033": {"city": "Oxnard", "zone": "extended", "free_miles": 3, "base_fee": 0.00},
    "93035": {"city": "Oxnard", "zone": "extended", "free_miles": 3, "base_fee": 0.00},
    "93036": {"city": "Oxnard", "zone": "extended", "free_miles": 3, "base_fee": 0.00},
    # Port Hueneme
    "93041": {"city": "Port Hueneme", "zone": "extended", "free_miles": 3, "base_fee": 0.00},
    # Camarillo
    "93010": {"city": "Camarillo", "zone": "extended", "free_miles": 3, "base_fee": 0.00},
    "93012": {"city": "Camarillo", "zone": "extended", "free_miles": 3, "base_fee": 0.00},
    # Oak View
    "93022": {"city": "Oak View", "zone": "extended", "free_miles": 3, "base_fee": 0.00},
    # Ojai
    "93023": {"city": "Ojai", "zone": "extended", "free_miles": 3, "base_fee": 0.00},
    # Somis
    "93066": {"city": "Somis", "zone": "extended", "free_miles": 3, "base_fee": 0.00},
}

ZIPS_BY_CITY = {
    "Ventura": ["93001", "93003", "93004"],
    "Oxnard": ["93030", "93033", "93035", "93036"],
    "Port Hueneme": ["93041"],
    "Camarillo": ["93010", "93012"],
    "Oak View": ["93022"],
    "Ojai": ["93023"],
    "Somis": ["93066"],
}

# ==================== API CONFIGURATION ====================
ORS_API_KEY = os.environ.get("ORS_API_KEY", "")
GOOGLE_MAPS_API_KEY = os.environ.get("REACT_APP_GOOGLE_MAPS_API_KEY", "") or os.environ.get("GOOGLE_MAPS_API_KEY", "")
USE_GOOGLE_MAPS = bool(GOOGLE_MAPS_API_KEY)
USE_ORS = bool(ORS_API_KEY)

# ==================== PAYMENT METHODS ====================
ALLOWED_PAYMENT_METHODS = ["card", "zelle", "cash"]

# ==================== DELIVERY ZONES (desde DB) ====================
_delivery_zones_cache = None
_zones_cache_time = None
CACHE_TTL_SECONDS = 300  # 5 minutos


# ==================== DISTANCE CALCULATION HELPERS ====================

def haversine_miles(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate straight-line distance in miles using Haversine formula"""
    R = 3958.8
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def haversine_km(coord1: List[float], coord2: List[float]) -> float:
    """Calculate distance in kilometers using Haversine formula"""
    lon1, lat1 = coord1
    lon2, lat2 = coord2
    r = 6371.0
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return 2 * r * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def miles_to_km(miles: float) -> float:
    """Convert miles to kilometers"""
    return miles * 1.60934


def km_to_miles(km: float) -> float:
    """Convert kilometers to miles"""
    return km / 1.60934


# ==================== GEOCODING FUNCTIONS ====================

def geocode_address_google_maps(address: str) -> Optional[Dict[str, float]]:
    """Geocode address using Google Maps API"""
    if not USE_GOOGLE_MAPS:
        return None
    
    try:
        encoded_address = quote(address)
        url = f"https://maps.googleapis.com/maps/api/geocode/json?address={encoded_address}&key={GOOGLE_MAPS_API_KEY}"
        
        import requests
        response = requests.get(url, timeout=10)
        data = response.json()
        
        if data["status"] == "OK" and data["results"]:
            location = data["results"][0]["geometry"]["location"]
            return {"lat": location["lat"], "lng": location["lng"]}
        
        logger.warning(f"Google Maps geocoding failed for '{address}': {data.get('status')}")
        return None
    except Exception as e:
        logger.error(f"Google Maps geocoding error: {e}")
        return None


def geocode_address_ors(address: str) -> Optional[List[float]]:
    """Geocode address using OpenRouteService API"""
    if not USE_ORS:
        return None
    
    try:
        import requests
        params = {
            "api_key": ORS_API_KEY,
            "text": address,
            "size": 1,
            "boundary.country": "USA"
        }
        response = requests.get(
            "https://api.openrouteservice.org/geocode/search",
            params=params,
            timeout=15
        )
        
        if response.status_code != 200:
            return None
        
        data = response.json()
        features = data.get("features", [])
        if not features:
            return None
        
        coordinates = features[0].get("geometry", {}).get("coordinates")
        if coordinates and len(coordinates) >= 2:
            return coordinates
        
        return None
    except Exception as e:
        logger.error(f"ORS geocoding error: {e}")
        return None


def geocode_address(address: str) -> Optional[Dict[str, float]]:
    """
    Geocode address using available APIs.
    Priority: Google Maps > OpenRouteService
    """
    coords = geocode_address_google_maps(address)
    if coords:
        return coords
    
    ors_coords = geocode_address_ors(address)
    if ors_coords and len(ors_coords) >= 2:
        return {"lat": ors_coords[1], "lng": ors_coords[0]}
    
    return None


# ==================== DRIVING DISTANCE CALCULATION ====================

@lru_cache(maxsize=200)
def get_distance_google_maps(address: str) -> Optional[Dict[str, Any]]:
    """Calculate driving distance using Google Maps Distance Matrix API"""
    if not USE_GOOGLE_MAPS:
        return None
    
    try:
        encoded_dest = quote(address)
        url = f"https://maps.googleapis.com/maps/api/distancematrix/json?origins={STORE_LAT},{STORE_LNG}&destinations={encoded_dest}&units=imperial&key={GOOGLE_MAPS_API_KEY}"
        
        import requests
        response = requests.get(url, timeout=10)
        data = response.json()
        
        if data["status"] == "OK":
            element = data["rows"][0]["elements"][0]
            if element["status"] == "OK":
                distance_meters = element["distance"]["value"]
                duration_seconds = element["duration"]["value"]
                return {
                    "distance_miles": round(distance_meters / METERS_PER_MILE, 2),
                    "duration_minutes": round(duration_seconds / 60, 1),
                    "distance_meters": distance_meters,
                    "source": "google_maps"
                }
        
        logger.warning(f"Google Maps distance matrix failed: {data.get('status')}")
        return None
    except Exception as e:
        logger.error(f"Google Maps distance error: {e}")
        return None


@lru_cache(maxsize=200)
async def get_distance_ors_async(lat: float, lng: float) -> Optional[Dict[str, Any]]:
    """Calculate driving distance using OpenRouteService API (async)"""
    if not USE_ORS:
        return None
    
    try:
        async with httpx.AsyncClient(timeout=15) as client:
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
        
        return {
            "distance_miles": round(distance_m / METERS_PER_MILE, 2),
            "duration_minutes": round(duration_s / 60, 1),
            "distance_meters": distance_m,
            "source": "ors"
        }
    except Exception as e:
        logger.error(f"ORS distance calculation error: {e}")
        return None


def get_distance_ors_sync(lat: float, lng: float) -> Optional[Dict[str, Any]]:
    """Calculate driving distance using OpenRouteService API (sync)"""
    if not USE_ORS:
        return None
    
    try:
        import requests
        resp = requests.get(
            "https://api.openrouteservice.org/v2/directions/driving-car",
            params={
                "api_key": ORS_API_KEY,
                "start": f"{STORE_LNG},{STORE_LAT}",
                "end": f"{lng},{lat}",
            },
            timeout=15
        )
        resp.raise_for_status()
        data = resp.json()
        
        segment = data["features"][0]["properties"]["segments"][0]
        distance_m = segment["distance"]
        duration_s = segment["duration"]
        
        return {
            "distance_miles": round(distance_m / METERS_PER_MILE, 2),
            "duration_minutes": round(duration_s / 60, 1),
            "distance_meters": distance_m,
            "source": "ors"
        }
    except Exception as e:
        logger.error(f"ORS distance calculation error: {e}")
        return None


async def calculate_driving_distance_async(address: str) -> Dict[str, Any]:
    """
    Calculate real driving distance to store using available APIs.
    Priority: Google Maps > OpenRouteService > Haversine (fallback)
    """
    # Try Google Maps first
    result = get_distance_google_maps(address)
    if result:
        return result
    
    # Try geocoding + ORS
    coords = geocode_address(address)
    if coords:
        ors_result = await get_distance_ors_async(coords["lat"], coords["lng"])
        if ors_result:
            return ors_result
        
        # Fallback to Haversine
        haversine_dist = haversine_miles(STORE_LAT, STORE_LNG, coords["lat"], coords["lng"])
        return {
            "distance_miles": round(haversine_dist, 2),
            "duration_minutes": round(haversine_dist / 30 * 60, 1),  # Assume 30 mph avg
            "distance_meters": haversine_dist * METERS_PER_MILE,
            "source": "haversine_estimated",
            "note": "Estimated straight-line distance"
        }
    
    return {
        "distance_miles": None,
        "error": "Could not geocode address. Please provide a complete address."
    }


def calculate_driving_distance_sync(address: str) -> Dict[str, Any]:
    """Synchronous version of calculate_driving_distance_async"""
    result = get_distance_google_maps(address)
    if result:
        return result
    
    coords = geocode_address(address)
    if coords:
        ors_result = get_distance_ors_sync(coords["lat"], coords["lng"])
        if ors_result:
            return ors_result
        
        haversine_dist = haversine_miles(STORE_LAT, STORE_LNG, coords["lat"], coords["lng"])
        return {
            "distance_miles": round(haversine_dist, 2),
            "duration_minutes": round(haversine_dist / 30 * 60, 1),
            "distance_meters": haversine_dist * METERS_PER_MILE,
            "source": "haversine_estimated",
            "note": "Estimated straight-line distance"
        }
    
    return {"distance_miles": None, "error": "Could not geocode address"}


# ==================== FUEL & COST CALCULATION ====================

def calculate_fuel_cost(
    distance_miles: float,
    vehicle_type: VehicleType = DEFAULT_VEHICLE_TYPE,
    fuel_price_per_gallon: float = DEFAULT_FUEL_PRICE_PER_GALLON
) -> Dict[str, float]:
    """
    Calculate fuel cost for a delivery.
    
    Returns:
        Dict with: fuel_cost, gallons_used, cost_per_mile, mpg
    """
    specs = VEHICLE_SPECS.get(vehicle_type, VEHICLE_SPECS[VehicleType.CAR])
    gallons_used = distance_miles / specs.fuel_efficiency_mpg
    fuel_cost = gallons_used * fuel_price_per_gallon
    
    return {
        "fuel_cost": round(fuel_cost, 2),
        "gallons_used": round(gallons_used, 3),
        "cost_per_mile": round(fuel_cost / max(distance_miles, 0.01), 2),
        "mpg": specs.fuel_efficiency_mpg,
        "co2_kg": round(distance_miles * specs.co2_per_mile_kg, 2)
    }


def calculate_driver_cost(duration_minutes: float, hourly_rate: float = DRIVER_HOURLY_RATE) -> float:
    """Calculate driver labor cost based on time"""
    return round((duration_minutes / 60) * hourly_rate, 2)


def calculate_round_trip_cost(
    distance_miles: float,
    duration_minutes: float,
    vehicle_type: VehicleType = DEFAULT_VEHICLE_TYPE,
    include_return_trip: bool = True
) -> Dict[str, float]:
    """
    Calculate complete round trip cost including fuel and driver time.
    """
    total_distance = distance_miles * 2 if include_return_trip else distance_miles
    total_duration = duration_minutes * 2 if include_return_trip else duration_minutes
    
    # Add loading/unloading time
    total_duration += LOADING_UNLOADING_TIME_MIN
    
    fuel = calculate_fuel_cost(total_distance, vehicle_type)
    driver_cost = calculate_driver_cost(total_duration)
    
    return {
        "total_cost": round(fuel["fuel_cost"] + driver_cost, 2),
        "fuel_cost": fuel["fuel_cost"],
        "driver_cost": driver_cost,
        "total_distance_miles": round(total_distance, 2),
        "total_duration_minutes": round(total_duration, 1),
        "co2_kg": fuel["co2_kg"],
        "cost_breakdown": {
            "one_way_miles": round(distance_miles, 2),
            "round_trip_miles": round(total_distance, 2),
            "mpg": fuel["mpg"],
            "gallons_used": fuel["gallons_used"],
            "loading_time_min": LOADING_UNLOADING_TIME_MIN
        }
    }


# ==================== DELIVERY FEE CALCULATION ====================

def calculate_delivery_fee(distance_miles: float, use_tiers: bool = True) -> float:
    """
    Calculate delivery fee based on distance.
    
    Args:
        distance_miles: Distance in miles from store
        use_tiers: If True uses tiered pricing, if False uses linear ($1.50/mile after 3)
    
    Returns:
        Delivery fee in USD
    """
    if distance_miles <= 0:
        return 0.00
    
    if use_tiers:
        for tier in DELIVERY_FEE_TIERS:
            if distance_miles <= tier["max_miles"]:
                return tier["fee"]
        return DELIVERY_FEE_TIERS[-1]["fee"]
    else:
        # Linear calculation (legacy mode)
        adjusted_distance = max(0, distance_miles - FREE_MILES_LIMIT)
        fee = adjusted_distance * RATE_PER_MILE_AFTER_FREE
        return min(fee, MAX_DELIVERY_FEE)


def calculate_delivery_profit_margin(
    delivery_fee: float,
    distance_miles: float,
    duration_minutes: float,
    vehicle_type: VehicleType = DEFAULT_VEHICLE_TYPE
) -> Dict[str, float]:
    """
    Calculate profit margin for a delivery.
    """
    costs = calculate_round_trip_cost(distance_miles, duration_minutes, vehicle_type)
    profit = delivery_fee - costs["total_cost"]
    margin = (profit / delivery_fee * 100) if delivery_fee > 0 else 0
    
    return {
        "delivery_fee": delivery_fee,
        "total_cost": costs["total_cost"],
        "profit": round(profit, 2),
        "profit_margin_percent": round(margin, 1),
        "fuel_cost": costs["fuel_cost"],
        "driver_cost": costs["driver_cost"],
        "co2_kg": costs["co2_kg"]
    }


def get_delivery_info(distance_miles: float) -> Dict:
    """
    Get detailed delivery information including tier and fee.
    """
    fee = calculate_delivery_fee(distance_miles)
    
    current_tier = None
    for tier in DELIVERY_FEE_TIERS:
        if distance_miles <= tier["max_miles"]:
            current_tier = tier
            break
    
    return {
        "fee": fee,
        "distance_miles": round(distance_miles, 2),
        "is_free": fee == 0,
        "tier": current_tier,
        "max_service_miles": MAX_DELIVERY_MILES,
        "free_miles_limit": FREE_MILES_LIMIT,
    }


# ==================== DELIVERY ZONES MANAGEMENT ====================

async def set_delivery_zones_from_db(db_instance) -> None:
    """Load delivery zones from database into cache"""
    global _delivery_zones_cache, _zones_cache_time
    
    if db_instance is None:
        return
    
    try:
        zones = await db_instance.delivery_zones.find({}, {"_id": 0}).to_list(200)
        _delivery_zones_cache = zones
        _zones_cache_time = datetime.now()
        logger.info(f"Loaded {len(zones)} delivery zones from database")
    except Exception as e:
        logger.error(f"Failed to load delivery zones: {e}")


def get_cached_zones() -> List[Dict]:
    """Get cached delivery zones"""
    return _delivery_zones_cache or []


def point_in_polygon(point: List[float], polygon: List[List[float]]) -> bool:
    """Check if a point [lng, lat] is inside a polygon"""
    x, y = point
    inside = False
    n = len(polygon)
    if n < 3:
        return False
    
    p1x, p1y = polygon[0]
    for i in range(n + 1):
        p2x, p2y = polygon[i % n]
        if y > min(p1y, p2y):
            if y <= max(p1y, p2y):
                if x <= max(p1x, p2x):
                    if p1y != p2y:
                        xinters = (y - p1y) * (p2x - p1x) / (p2y - p1y) + p1x
                    else:
                        xinters = p1x
                    if p1x == p2x or x <= xinters:
                        inside = not inside
        p1x, p1y = p2x, p2y
    return inside


def find_matching_zone(
    coordinates: List[float],  # [lng, lat]
    zones: List[Dict]
) -> Optional[Dict]:
    """Find which zone contains the given coordinates"""
    for zone in zones:
        zone_type = zone.get("type")
        if zone_type == "circle":
            center = zone.get("center")
            radius_km = zone.get("radius_km", 0)
            if center and radius_km:
                distance_km = haversine_km(center, coordinates)
                if distance_km <= radius_km:
                    return zone
        elif zone_type == "polygon":
            polygon = zone.get("polygon")
            if polygon and point_in_polygon(coordinates, polygon):
                return zone
    return None


def calculate_zone_based_fee(
    distance_km: float,
    zone: Dict,
    default_rate_per_km: float = 0.93,  # ~$1.50 per mile
    default_min_fee: float = 0,
    default_max_fee: float = MAX_DELIVERY_FEE
) -> float:
    """Calculate fee using zone-specific rates"""
    rate_per_km = float(zone.get("rate_per_km", default_rate_per_km))
    min_fee = float(zone.get("min_fee", default_min_fee))
    max_fee = float(zone.get("max_fee", default_max_fee))
    
    fee = distance_km * rate_per_km
    fee = max(fee, min_fee)
    fee = min(fee, max_fee)
    
    return round(fee, 2)


# ==================== ADDRESS VALIDATION ====================

def validate_delivery_address(
    address: str,
    zip_code: Optional[str] = None,
    zones: Optional[List[Dict]] = None
) -> Dict[str, Any]:
    """
    Validate if an address is eligible for delivery.
    Uses both ZIP code validation and distance calculation.
    """
    # Validate ZIP if provided
    if zip_code and zip_code not in AUTHORIZED_ZIPS:
        return {
            "valid": False,
            "error": f"ZIP code {zip_code} is outside our service area",
            "zip_code": zip_code,
            "authorized_zips": list(AUTHORIZED_ZIPS.keys()),
        }
    
    # Calculate driving distance
    distance_result = calculate_driving_distance_sync(address)
    
    if distance_result.get("distance_miles") is None:
        return {
            "valid": False,
            "error": distance_result.get("error", "Could not validate address"),
            "calculation_method": distance_result.get("source", "failed"),
        }
    
    distance_miles = distance_result["distance_miles"]
    
    # Check max distance
    if distance_miles > MAX_DELIVERY_MILES:
        return {
            "valid": False,
            "error": f"Address is {distance_miles:.1f} miles away. Maximum service distance is {MAX_DELIVERY_MILES} miles.",
            "distance_miles": distance_miles,
            "max_service_miles": MAX_DELIVERY_MILES,
            "calculation_method": distance_result.get("source"),
            "duration_minutes": distance_result.get("duration_minutes"),
        }
    
    # Check zones if provided
    zone_match = None
    if zones:
        coords = geocode_address(address)
        if coords:
            zone_match = find_matching_zone([coords["lng"], coords["lat"]], zones)
    
    # Get delivery info
    delivery_info = get_delivery_info(distance_miles)
    
    # Calculate fuel cost
    fuel_info = calculate_fuel_cost(distance_miles)
    
    return {
        "valid": True,
        "distance_miles": distance_miles,
        "delivery_fee": delivery_info["fee"],
        "is_free_delivery": delivery_info["is_free"],
        "tier": delivery_info.get("tier"),
        "calculation_method": distance_result.get("source"),
        "duration_minutes": distance_result.get("duration_minutes", distance_miles / 30 * 60),
        "max_service_miles": MAX_DELIVERY_MILES,
        "free_miles_limit": FREE_MILES_LIMIT,
        "fuel_cost": fuel_info["fuel_cost"],
        "co2_kg": fuel_info["co2_kg"],
        "zone_match": zone_match.get("name") if zone_match else None,
    }


# ==================== ROUTE OPTIMIZATION ====================

def optimize_route(addresses: List[str]) -> Dict[str, Any]:
    """
    Optimize delivery route order to minimize travel distance.
    Simple nearest-neighbor algorithm.
    """
    if not addresses:
        return {"route": [], "total_distance_miles": 0, "total_duration_minutes": 0}
    
    # Geocode all addresses
    coords_list = []
    valid_addresses = []
    for addr in addresses:
        coords = geocode_address(addr)
        if coords:
            coords_list.append((coords["lat"], coords["lng"]))
            valid_addresses.append(addr)
    
    if not coords_list:
        return {"route": [], "total_distance_miles": 0, "error": "Could not geocode any addresses"}
    
    # Start from store
    current = (STORE_LAT, STORE_LNG)
    remaining = list(range(len(coords_list)))
    route_order = []
    total_distance = 0
    
    while remaining:
        # Find nearest
        nearest_idx = min(remaining, key=lambda i: haversine_miles(
            current[0], current[1],
            coords_list[i][0], coords_list[i][1]
        ))
        dist = haversine_miles(
            current[0], current[1],
            coords_list[nearest_idx][0], coords_list[nearest_idx][1]
        )
        total_distance += dist
        route_order.append(nearest_idx)
        current = coords_list[nearest_idx]
        remaining.remove(nearest_idx)
    
    # Return to store
    total_distance += haversine_miles(
        current[0], current[1],
        STORE_LAT, STORE_LNG
    )
    
    route = [valid_addresses[i] for i in route_order]
    
    return {
        "route": route,
        "total_distance_miles": round(total_distance, 2),
        "total_duration_minutes": round(total_distance / 30 * 60, 1),  # Assume 30 mph avg
        "stops": len(route),
        "route_indices": route_order,
    }


# ==================== BATCH DELIVERY COST ====================

def calculate_batch_delivery_costs(
    addresses: List[str],
    vehicle_type: VehicleType = DEFAULT_VEHICLE_TYPE
) -> Dict[str, Any]:
    """
    Calculate total cost for multiple deliveries on one route.
    """
    route_info = optimize_route(addresses)
    
    if route_info.get("error"):
        return route_info
    
    fuel_cost = calculate_fuel_cost(route_info["total_distance_miles"], vehicle_type)
    driver_cost = calculate_driver_cost(route_info["total_duration_minutes"])
    
    # Add loading time
    total_duration = route_info["total_duration_minutes"] + (LOADING_UNLOADING_TIME_MIN * len(addresses))
    driver_cost_with_loading = calculate_driver_cost(total_duration)
    
    return {
        "total_deliveries": len(addresses),
        "total_distance_miles": route_info["total_distance_miles"],
        "total_duration_minutes": total_duration,
        "fuel_cost": fuel_cost["fuel_cost"],
        "driver_cost": driver_cost_with_loading,
        "total_cost": round(fuel_cost["fuel_cost"] + driver_cost_with_loading, 2),
        "cost_per_delivery": round((fuel_cost["fuel_cost"] + driver_cost_with_loading) / len(addresses), 2),
        "co2_kg": fuel_cost["co2_kg"],
        "optimized_route": route_info["route"],
        "mpg_used": fuel_cost["mpg"]
    }


# ==================== ZIP CODE VALIDATION ====================

def is_zip_authorized(zip_code: str) -> bool:
    """Check if a ZIP code is within service area."""
    return zip_code in AUTHORIZED_ZIPS


def get_zip_info(zip_code: str) -> Dict:
    """Get information about a ZIP code."""
    return AUTHORIZED_ZIPS.get(zip_code, {})


def get_city_from_zip(zip_code: str) -> str:
    """Get city name from ZIP code."""
    info = AUTHORIZED_ZIPS.get(zip_code, {})
    return info.get("city", "Unknown")


def get_all_authorized_zips() -> List[str]:
    """Get list of all authorized ZIP codes."""
    return list(AUTHORIZED_ZIPS.keys())


def get_delivery_tiers() -> List[Dict]:
    """Get all delivery tiers for display in frontend."""
    return DELIVERY_FEE_TIERS.copy()


def get_service_area_summary() -> Dict:
    """Get a summary of the service area configuration."""
    return {
        "max_miles": MAX_DELIVERY_MILES,
        "free_miles": FREE_MILES_LIMIT,
        "tiers": DELIVERY_FEE_TIERS,
        "authorized_zips_count": len(AUTHORIZED_ZIPS),
        "authorized_zips": list(AUTHORIZED_ZIPS.keys()),
        "zips_by_city": ZIPS_BY_CITY,
        "allowed_payment_methods": ALLOWED_PAYMENT_METHODS,
        "store_address": STORE_ADDRESS,
        "store_coords": {"lat": STORE_LAT, "lng": STORE_LNG},
        "geocoding_enabled": USE_GOOGLE_MAPS or USE_ORS,
        "google_maps_enabled": USE_GOOGLE_MAPS,
        "ors_enabled": USE_ORS,
        "fuel_price_per_gallon": DEFAULT_FUEL_PRICE_PER_GALLON,
        "driver_hourly_rate": DRIVER_HOURLY_RATE,
        "vehicle_types": [vt.value for vt in VehicleType],
    }


# ==================== COMPATIBILITY FUNCTIONS (para store.py) ====================

async def calculate_shipping_fee_legacy(address: str, zones: Optional[List[Dict]] = None) -> Dict[str, float]:
    """
    Versión compatible con la función original de store.py.
    Retorna el mismo formato: distance_km, fee, zone_id, zone_name
    """
    # Usar la nueva lógica de validación
    result = validate_delivery_address(address, zones=zones)
    
    if not result.get("valid"):
        raise ValueError(result.get("error", "Address outside delivery area"))
    
    # Convertir millas a kilómetros para compatibilidad
    distance_km = result["distance_miles"] * 1.60934
    
    return {
        "distance_km": round(distance_km, 2),
        "fee": result["delivery_fee"],
        "zone_id": result.get("zone_match") or (zones[0].get("id") if zones else None),
        "zone_name": result.get("zone_match") or (zones[0].get("name") if zones else "Default")
    }


async def calculate_shipping_distance_legacy(address: str) -> Dict:
    """
    Versión compatible con calculate_shipping_distance original.
    """
    try:
        result = validate_delivery_address(address)
        
        if not result.get("valid"):
            return {
                "straight_line_miles": result.get("distance_miles", 0),
                "fee": 0,
                "within_range": False,
                "free_miles": FREE_MILES_LIMIT,
                "rate_per_mile": RATE_PER_MILE_AFTER_FREE,
                "max_fee": MAX_DELIVERY_FEE,
                "max_service_miles": MAX_DELIVERY_MILES,
                "store_location": {"lat": STORE_LAT, "lng": STORE_LNG, "address": STORE_ADDRESS},
                "error": result.get("error")
            }
        
        return {
            "straight_line_miles": result["distance_miles"],
            "fee": result["delivery_fee"],
            "within_range": True,
            "free_miles": FREE_MILES_LIMIT,
            "rate_per_mile": RATE_PER_MILE_AFTER_FREE,
            "max_fee": MAX_DELIVERY_FEE,
            "max_service_miles": MAX_DELIVERY_MILES,
            "store_location": {"lat": STORE_LAT, "lng": STORE_LNG, "address": STORE_ADDRESS},
            "tier": result.get("tier"),
            "calculation_method": result.get("calculation_method"),
            "duration_minutes": result.get("duration_minutes"),
            "fuel_cost": result.get("fuel_cost"),
            "co2_kg": result.get("co2_kg")
        }
        
    except Exception as e:
        logger.error(f"Shipping distance calculation error: {e}")
        raise