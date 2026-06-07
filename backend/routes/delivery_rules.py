"""
Delivery Rules — Wrapper around centralized delivery configuration.
This module provides the same async interface expected by store.py,
but delegates all logic to delivery_config.py.

All delivery fees, distance calculations, geocoding, and validation
are centralized in delivery_config.py.
"""

import logging
from typing import Dict, Optional, List, Any

# Import everything from the central configuration
from delivery_config import (
    # Core functions
    haversine_miles,
    geocode_address as _geocode_address_sync,
    calculate_delivery_fee as _calculate_fee_sync,
    validate_delivery_address as _validate_address_sync,
    get_delivery_info,
    # Constants
    STORE_LAT,
    STORE_LNG,
    MAX_DELIVERY_MILES,
    FREE_MILES_LIMIT,
    DELIVERY_FEE_TIERS,
    # Async distance calculator (if needed)
    calculate_driving_distance_async,
)

# Re-export store location for compatibility
STORE_COORDS = (STORE_LAT, STORE_LNG)

# API keys (already read by delivery_config, but we re-export for clarity)
import os
ORS_API_KEY = os.environ.get("ORS_API_KEY", "")
GOOGLE_MAPS_API_KEY = os.environ.get("REACT_APP_GOOGLE_MAPS_API_KEY", "") or os.environ.get("GOOGLE_MAPS_API_KEY", "")

logger = logging.getLogger(__name__)

# ==================== GEOCODING (Async wrappers) ====================

async def geocode_address_ors(address: str, ors_api_key: str) -> Optional[Dict[str, float]]:
    """Geocode address using OpenRouteService API (async wrapper)"""
    # Delegate to the sync geocoder (which uses ORS if available)
    result = _geocode_address_sync(address)
    if result and "lat" in result:
        return result
    return None

async def geocode_address_gmaps(address: str, google_maps_api_key: str) -> Optional[Dict[str, float]]:
    """Geocode address using Google Maps API (async wrapper)"""
    result = _geocode_address_sync(address)
    if result and "lat" in result:
        return result
    return None

async def geocode_address(address: str, ors_api_key: str, google_maps_api_key: str) -> Optional[Dict[str, float]]:
    """
    Geocode address using available APIs (async, but uses sync from config).
    Priority: Google Maps > ORS (both handled inside delivery_config.geocode_address)
    """
    return _geocode_address_sync(address)

# ==================== DELIVERY FEE CALCULATION ====================

def calculate_delivery_fee(distance_miles: float) -> float:
    """Calculate delivery fee based on tiered pricing (sync)"""
    return _calculate_fee_sync(distance_miles, use_tiers=True)

def get_delivery_tier(distance_miles: float) -> Optional[Dict]:
    """Get delivery tier information"""
    info = get_delivery_info(distance_miles)
    return info.get("tier")

# ==================== MAIN VALIDATION FUNCTION (Async) ====================

async def validate_delivery_address(
    address: str,
    ors_api_key: str,
    google_maps_api_key: str
) -> Dict[str, Any]:
    """
    Validate delivery address and calculate distance and fee.
    Uses the sync validation from delivery_config (which handles geocoding and distance).
    """
    if not address or len(address.strip()) < 5:
        return {
            "valid": False,
            "error": "Address is required and must be at least 5 characters",
            "distance_miles": None,
            "delivery_fee": None,
            "within_range": False
        }

    # Use the unified validator from delivery_config
    result = _validate_address_sync(address)

    if not result.get("valid"):
        # Map the error structure to the expected format
        return {
            "valid": False,
            "error": result.get("error", "Could not validate address"),
            "distance_miles": result.get("distance_miles"),
            "delivery_fee": None,
            "within_range": False,
            "max_service_miles": MAX_DELIVERY_MILES,
        }

    return {
        "valid": True,
        "distance_miles": result["distance_miles"],
        "delivery_fee": result["delivery_fee"],
        "tier": result.get("tier"),
        "is_free": result["is_free_delivery"],
        "within_range": True,
        "coords": result.get("coords"),  # may be None if geocoding failed
        "max_service_miles": MAX_DELIVERY_MILES,
    }

# ==================== COMPATIBILITY FUNCTION (para store.py) ====================

async def calculate_auto_delivery_fee(address: str, ors_api_key: str, google_maps_api_key: str) -> dict:
    """
    Compatibilidad con store.py - retorna el formato esperado.
    """
    result = await validate_delivery_address(address, ors_api_key, google_maps_api_key)

    if not result.get("valid"):
        return {
            "distance_miles": result.get("distance_miles"),
            "delivery_fee": 0,
            "coords": None,
            "rejected": True,
            "error": result.get("error")
        }

    return {
        "distance_miles": result["distance_miles"],
        "delivery_fee": result["delivery_fee"],
        "coords": result.get("coords"),
        "rejected": False,
        "tier": result.get("tier")
    }

# ==================== HELPER PARA FRONTEND ====================

def get_delivery_tiers_for_frontend() -> List[Dict]:
    """Return delivery tiers formatted for frontend display"""
    return DELIVERY_FEE_TIERS.copy()

def get_service_area_info() -> Dict:
    """Return service area information"""
    return {
        "max_service_miles": MAX_DELIVERY_MILES,
        "tiers": DELIVERY_FEE_TIERS,
        "free_miles_limit": FREE_MILES_LIMIT,
        "store_coords": {"lat": STORE_LAT, "lng": STORE_LNG}
    }

# ==================== ADDITIONAL UTILITIES (optional) ====================

async def calculate_driving_distance_async_wrapper(address: str) -> Dict[str, Any]:
    """
    Async wrapper for driving distance calculation (uses real routing if APIs available).
    """
    return await calculate_driving_distance_async(address)