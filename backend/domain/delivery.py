"""Pure delivery-fee business logic.

Centralizes the distance-based delivery fee calculation that used to be
duplicated — with subtly different behavior in each copy — across
utils.py, delivery_config.py, routes/delivery_config.py, and
routes/delivery_rules.py. One of those copies (routes/delivery_rules.py)
called another with an argument it didn't accept and crashed with a
TypeError whenever it ran; that class of bug is exactly what this
consolidation is meant to prevent.

Reading DELIVERY_TIERS / MAX_SERVICE_MILES / FREE_MILES_LIMIT from the
environment is the one deliberate exception to "no I/O in domain" here —
it's static process configuration resolved once, not a runtime side
effect, and every function still accepts an explicit override so tests
never have to touch the environment.
"""

import math
import os
from typing import Any, Dict, List, Optional


def _get_env_float(key: str, default: float) -> float:
    try:
        return float(os.environ.get(key, default))
    except (TypeError, ValueError):
        return default


DEFAULT_FREE_MILES_LIMIT: float = 3.0
DEFAULT_MAX_SERVICE_MILES: float = 15.0

DEFAULT_DELIVERY_FEE_TIERS: List[Dict[str, Any]] = [
    {"max_miles": 3,  "fee": 0.00, "label": "FREE",  "description": "0–3 miles"},
    {"max_miles": 5,  "fee": 1.99, "label": "$1.99", "description": "3–5 miles"},
    {"max_miles": 8,  "fee": 2.99, "label": "$2.99", "description": "5–8 miles"},
    {"max_miles": 12, "fee": 4.99, "label": "$4.99", "description": "8–12 miles"},
    {"max_miles": 15, "fee": 8.99, "label": "$8.99", "description": "12–15 miles"},
]


def parse_tiers_from_string(tiers_str: Optional[str]) -> Optional[List[Dict[str, Any]]]:
    """Parses the DELIVERY_TIERS env format: "3:0,5:1.99,8:2.99,12:4.99,15:8.99".
    Returns None (so the caller falls back to the default table) if the
    string is empty or nothing in it parses."""
    if not tiers_str:
        return None
    tiers = []
    prev = 0.0
    for part in tiers_str.split(","):
        part = part.strip()
        if ":" not in part:
            continue
        miles_str, fee_str = part.split(":", 1)
        try:
            miles = float(miles_str)
            fee = float(fee_str)
        except ValueError:
            continue
        tiers.append({
            "max_miles": miles,
            "fee": fee,
            "label": f"${fee:.2f}" if fee > 0 else "FREE",
            "description": f"{int(prev)}–{int(miles)} miles",
        })
        prev = miles
    return tiers or None


def get_delivery_fee_tiers() -> List[Dict[str, Any]]:
    """The tier table actually in effect: DELIVERY_TIERS from the
    environment if set and valid, otherwise the hardcoded default."""
    return parse_tiers_from_string(os.environ.get("DELIVERY_TIERS", "")) or DEFAULT_DELIVERY_FEE_TIERS


def get_free_miles_limit() -> float:
    return _get_env_float("FREE_MILES_LIMIT", DEFAULT_FREE_MILES_LIMIT)


def get_max_service_miles() -> float:
    return _get_env_float("MAX_SERVICE_MILES", DEFAULT_MAX_SERVICE_MILES)


def haversine_miles(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Great-circle distance between two coordinates, in miles."""
    R = 3958.8
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def calculate_delivery_fee(
    distance_miles: Optional[float],
    tiers: Optional[List[Dict[str, Any]]] = None,
) -> float:
    """Distance-based delivery fee. Any distance beyond the last tier is
    charged that tier's flat fee — there is no open-ended linear
    extrapolation. Callers should check get_max_service_miles() /
    get_delivery_info()'s "allowed" flag before charging at all; this
    function alone doesn't reject out-of-range distances."""
    if distance_miles is None:
        return 0.0
    try:
        distance = float(distance_miles)
    except (TypeError, ValueError):
        return 0.0
    active_tiers = tiers if tiers is not None else get_delivery_fee_tiers()
    for tier in active_tiers:
        if distance <= tier["max_miles"]:
            return tier["fee"]
    return active_tiers[-1]["fee"]


def get_delivery_info(
    distance_miles: Optional[float],
    tiers: Optional[List[Dict[str, Any]]] = None,
    max_service_miles: Optional[float] = None,
) -> Dict[str, Any]:
    """Fee plus the surrounding context (tier, whether it's free, whether
    the distance is within the service area) for a given distance."""
    active_tiers = tiers if tiers is not None else get_delivery_fee_tiers()
    limit = max_service_miles if max_service_miles is not None else get_max_service_miles()
    fee = calculate_delivery_fee(distance_miles, tiers=active_tiers)

    current_tier = None
    if distance_miles is not None:
        for tier in active_tiers:
            if distance_miles <= tier["max_miles"]:
                current_tier = tier
                break

    return {
        "fee": fee,
        "distance_miles": round(distance_miles, 2) if distance_miles is not None else None,
        "is_free": fee == 0,
        "tier": current_tier,
        "allowed": distance_miles is not None and distance_miles <= limit,
        "max_service_miles": limit,
        "free_miles_limit": get_free_miles_limit(),
    }
