"""Geocode / Distance endpoints — using centralized delivery_config"""
import logging
from typing import Optional
from fastapi import APIRouter, HTTPException, Query

# Importar configuración centralizada
from delivery_config import (
    STORE_LAT,
    STORE_LNG,
    MAX_DELIVERY_MILES,
    DELIVERY_FEE_TIERS,
    calculate_distance_async,
    calculate_delivery_fee,
    get_delivery_info,
    geocode_address,
    USE_GOOGLE_MAPS,
    USE_ORS,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/geocode", tags=["geocode"])


@router.get("/distance")
async def get_distance(
    lat: float = Query(..., description="Destination latitude"),
    lng: float = Query(..., description="Destination longitude"),
):
    """Calculate distance and delivery fee using centralized config"""
    # Calculate distance (uses ORS if available)
    from delivery_config import get_distance_ors_sync
    
    ors_result = get_distance_ors_sync(lat, lng)
    
    if ors_result:
        distance_miles = ors_result["distance_miles"]
        delivery_info = get_delivery_info(distance_miles)
        
        return {
            "distance_miles": distance_miles,
            "duration_minutes": ors_result["duration_minutes"],
            "delivery_fee": delivery_info["fee"],
            "allowed": distance_miles <= MAX_DELIVERY_MILES,
            "tier": delivery_info.get("tier"),
            "is_free": delivery_info["is_free"],
            "calculation_method": "ors_driving",
        }
    
    # Fallback to Haversine
    from delivery_config import haversine_miles
    distance_miles = haversine_miles(STORE_LAT, STORE_LNG, lat, lng)
    
    if distance_miles > MAX_DELIVERY_MILES:
        return {
            "distance_miles": round(distance_miles, 2),
            "delivery_fee": None,
            "allowed": False,
            "message": f"Delivery not available beyond {MAX_DELIVERY_MILES} miles",
            "calculation_method": "haversine",
        }
    
    fee = calculate_delivery_fee(distance_miles)
    
    return {
        "distance_miles": round(distance_miles, 2),
        "delivery_fee": fee,
        "allowed": True,
        "is_free": fee == 0,
        "calculation_method": "haversine",
        "tier": next((t for t in DELIVERY_FEE_TIERS if distance_miles <= t["max_miles"]), None),
    }


@router.post("/geocode")
async def geocode(address: str):
    """Geocode an address using centralized config"""
    coords = geocode_address(address)
    
    if not coords:
        raise HTTPException(status_code=400, detail="Could not geocode address")
    
    return {
        "address": address,
        "lat": coords["lat"],
        "lng": coords["lng"],
        "geocoding_source": "google_maps" if USE_GOOGLE_MAPS else "ors",
    }


@router.get("/validate-address")
async def validate_address(address: str, zip_code: Optional[str] = None):
    """Validate if an address is eligible for delivery"""
    from delivery_config import validate_delivery_address
    
    result = validate_delivery_address(address, zip_code)
    return result


@router.get("/config")
async def get_geocode_config():
    """Get geocoding configuration status"""
    return {
        "google_maps_enabled": USE_GOOGLE_MAPS,
        "ors_enabled": USE_ORS,
        "max_delivery_miles": MAX_DELIVERY_MILES,
        "delivery_tiers": DELIVERY_FEE_TIERS,
        "store_location": {"lat": STORE_LAT, "lng": STORE_LNG},
    }