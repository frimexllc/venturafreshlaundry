"""
Delivery Rules & Business Logic
- Authorized ZIP codes for Ventura Fresh Laundry service area
- Pricing: First 3 miles free, dynamic rate after
- Payment validation: Card/Zelle/Cash only, no delivery without payment
- Max service distance: 10 miles from store
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime, timezone
import math
import logging

# ── Configuración de logging silenciosa (solo errores) ────────────────
logger = logging.getLogger(__name__)
logger.setLevel(logging.ERROR)

delivery_rules_router = APIRouter()

# ── Authorized ZIP Codes ──────────────────────────────────────────────
AUTHORIZED_ZIPS = {
    "93001": {"city": "Ventura", "zone": "core", "base_miles_free": 3},
    "93003": {"city": "Ventura", "zone": "core", "base_miles_free": 3},
    "93004": {"city": "Ventura", "zone": "core", "base_miles_free": 3},
    "93010": {"city": "Camarillo", "zone": "extended", "base_miles_free": 3},
    "93030": {"city": "Oxnard", "zone": "extended", "base_miles_free": 3},
    "93035": {"city": "Oxnard", "zone": "extended", "base_miles_free": 3},
    "93036": {"city": "Oxnard", "zone": "extended", "base_miles_free": 3},
}

# ── Pricing Config ────────────────────────────────────────────────────
RATE_PER_MILE_AFTER_FREE = 1.50   # USD per mile after free miles
MIN_DELIVERY_FEE = 0.00            # Minimum fee (0 because first 3 miles are free)
MAX_DELIVERY_FEE = 25.00           # Cap
MAX_DELIVERY_MILES = 10.0          # Límite máximo de distancia para servicio de recogida y entrega
STORE_COORDS = (34.2805, -119.2945)  # Ventura Fresh Laundry approx

# ── Allowed Payment Methods ──────────────────────────────────────────
ALLOWED_PAYMENT_METHODS = ["card", "zelle", "cash"]


class ZipValidationRequest(BaseModel):
    zip_code: str


class DeliveryFeeRequest(BaseModel):
    zip_code: str
    distance_miles: Optional[float] = None
    lat: Optional[float] = None
    lng: Optional[float] = None


class PaymentValidationRequest(BaseModel):
    payment_method: str
    amount: float = Field(gt=0)
    order_type: Optional[str] = "delivery"


def haversine_miles(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 3958.8
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def calculate_delivery_fee(distance_miles: float, zip_code: str) -> dict:
    zip_info = AUTHORIZED_ZIPS.get(zip_code)
    if not zip_info:
        return {"eligible": False, "fee": 0, "reason": f"ZIP {zip_code} is outside our service area"}

    # ── Nuevo: validar distancia máxima ──────────────────────────────────────
    if distance_miles > MAX_DELIVERY_MILES:
        return {
            "eligible": False,
            "fee": 0,
            "distance_miles": round(distance_miles, 2),
            "max_miles": MAX_DELIVERY_MILES,
            "reason": f"Distance {distance_miles:.1f} miles exceeds maximum service range of {MAX_DELIVERY_MILES} miles"
        }

    free_miles = zip_info["base_miles_free"]
    if distance_miles <= free_miles:
        return {
            "eligible": True,
            "fee": 0.00,
            "distance_miles": round(distance_miles, 2),
            "free_miles": free_miles,
            "reason": f"Free delivery (within {free_miles} miles)"
        }

    extra_miles = distance_miles - free_miles
    fee = round(extra_miles * RATE_PER_MILE_AFTER_FREE, 2)
    fee = min(fee, MAX_DELIVERY_FEE)
    fee = max(fee, MIN_DELIVERY_FEE)

    return {
        "eligible": True,
        "fee": fee,
        "distance_miles": round(distance_miles, 2),
        "free_miles": free_miles,
        "extra_miles": round(extra_miles, 2),
        "rate_per_mile": RATE_PER_MILE_AFTER_FREE,
        "reason": f"${fee:.2f} for {extra_miles:.1f} miles beyond free zone"
    }


@delivery_rules_router.get("/zones")
async def get_delivery_zones():
    zones = []
    for zc, info in AUTHORIZED_ZIPS.items():
        zones.append({
            "zip_code": zc,
            "city": info["city"],
            "zone": info["zone"],
            "free_miles": info["base_miles_free"],
            "rate_after_free": RATE_PER_MILE_AFTER_FREE,
            "max_fee": MAX_DELIVERY_FEE,
            "max_miles": MAX_DELIVERY_MILES,
        })
    return {
        "store_location": {"lat": STORE_COORDS[0], "lng": STORE_COORDS[1]},
        "zones": zones,
        "allowed_payment_methods": ALLOWED_PAYMENT_METHODS,
        "rate_per_mile": RATE_PER_MILE_AFTER_FREE,
        "max_delivery_miles": MAX_DELIVERY_MILES,
    }


@delivery_rules_router.post("/validate-zip")
async def validate_zip(req: ZipValidationRequest):
    zc = req.zip_code.strip()[:5]
    info = AUTHORIZED_ZIPS.get(zc)
    if not info:
        return {
            "valid": False,
            "zip_code": zc,
            "message": f"ZIP code {zc} is outside our delivery area. We serve: {', '.join(sorted(AUTHORIZED_ZIPS.keys()))}"
        }
    return {
        "valid": True,
        "zip_code": zc,
        "city": info["city"],
        "zone": info["zone"],
        "free_miles": info["base_miles_free"],
        "max_miles": MAX_DELIVERY_MILES,
    }


@delivery_rules_router.post("/calculate-fee")
async def calculate_fee(req: DeliveryFeeRequest):
    zc = req.zip_code.strip()[:5]
    if zc not in AUTHORIZED_ZIPS:
        raise HTTPException(status_code=400, detail=f"ZIP {zc} not in service area")

    if req.distance_miles is not None:
        dist = req.distance_miles
    elif req.lat is not None and req.lng is not None:
        dist = haversine_miles(STORE_COORDS[0], STORE_COORDS[1], req.lat, req.lng)
    else:
        dist = 2.0  # default estimate within core zone

    result = calculate_delivery_fee(dist, zc)
    if not result["eligible"]:
        raise HTTPException(status_code=400, detail=result["reason"])
    return result


@delivery_rules_router.post("/validate-payment")
async def validate_payment(req: PaymentValidationRequest):
    method = req.payment_method.lower().strip()
    if method not in ALLOWED_PAYMENT_METHODS:
        return {
            "valid": False,
            "method": method,
            "message": f"Payment method '{method}' not accepted. We accept: {', '.join(ALLOWED_PAYMENT_METHODS)}"
        }
    rules = {}
    if method == "cash":
        rules["note"] = "Cash must be collected at pickup or delivery. Exact change preferred."
    elif method == "zelle":
        rules["note"] = "Zelle payment must be confirmed before dispatch."
        rules["zelle_info"] = "Send to business Zelle account"
    elif method == "card":
        rules["note"] = "Card payments processed via Stripe."

    if req.order_type == "delivery":
        rules["delivery_rule"] = "Payment must be confirmed before delivery dispatch. No COD for delivery orders."

    return {
        "valid": True,
        "method": method,
        "amount": req.amount,
        **rules,
    }


@delivery_rules_router.get("/payment-methods")
async def get_payment_methods():
    return {
        "methods": [
            {"id": "card", "name": "Credit/Debit Card", "name_es": "Tarjeta", "icon": "credit-card", "online": True},
            {"id": "zelle", "name": "Zelle", "name_es": "Zelle", "icon": "banknote", "online": True},
            {"id": "cash", "name": "Cash", "name_es": "Efectivo", "icon": "wallet", "online": False},
        ],
        "rules": {
            "delivery_requires_payment": True,
            "message": "All delivery orders require payment confirmation before dispatch.",
            "message_es": "Todos los pedidos de delivery requieren confirmacion de pago antes del despacho."
        },
        "timezone": "America/Los_Angeles",
        "timezone_label": "Pacific Time (PT)"
    }