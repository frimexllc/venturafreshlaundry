"""
Logistics Module - Complete routes for the logistics map
Integrates FuelAPI for real gas prices and OpenRouteService for geocoding/distance.
Uses centralized delivery_config for all distance/fee calculations.
"""
import os
import uuid
import logging
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, HTTPException, Depends, Query, Body

from database import db
from auth import get_current_user

# Importar configuración centralizada
from delivery_config import (
    ORS_API_KEY,
    STORE_LAT,
    STORE_LNG,
    STORE_ADDRESS,
    MAX_DELIVERY_MILES,
    DELIVERY_FEE_TIERS,
    calculate_delivery_fee,
    get_delivery_info,
    geocode_address,
    calculate_driving_distance_async,
    calculate_batch_delivery_costs,
    optimize_route as optimize_delivery_route,
    METERS_PER_MILE,
    haversine_miles,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/logistics", tags=["Logistics"])

# ==================== FUEL API CONFIG ====================
FUEL_API_KEY = os.getenv("FUEL_API_KEY")
FUEL_API_BASE = "https://api.fuelapi.com/v1"

# ==================== GOOGLE PLACES API (New) ====================
# Misma fuente de datos que muestra Google Maps al ver "Gas Stations"
GOOGLE_MAPS_API_KEY = (
    os.environ.get("REACT_APP_GOOGLE_MAPS_API_KEY", "")
    or os.environ.get("GOOGLE_MAPS_API_KEY", "")
)
GOOGLE_PLACES_NEARBY_URL = "https://places.googleapis.com/v1/places:searchNearby"

# Mapeo de tipos de combustible del API a tipos canónicos para el frontend
_FUEL_TYPE_MAP = {
    "REGULAR_UNLEADED": "regular",
    "MIDGRADE": "midgrade",
    "PREMIUM": "premium",
    "DIESEL": "diesel",
    "E85": "e85",
    "E80": "e85",
    "LPG": "lpg",
    "BIO_DIESEL": "diesel",
    "TRUCK_DIESEL": "diesel",
    "SP91": "regular",
    "SP95": "regular",
    "SP98": "premium",
    "SP100": "premium",
    "METHANE": "methane",
}


def _parse_money(money_obj: Optional[dict]) -> Optional[float]:
    """Convierte el objeto Money de Google Places a float USD."""
    if not money_obj:
        return None
    units = money_obj.get("units")
    nanos = money_obj.get("nanos", 0) or 0
    if units is None and nanos == 0:
        return None
    try:
        return round(float(units or 0) + float(nanos) / 1e9, 3)
    except Exception:
        return None


# ==================== CACHE FOR FUEL API ====================
fuel_cache = {}
CACHE_TTL = 1800  # 30 minutos

# Cache separado para Google Places (datos más confiables, TTL más largo)
google_places_cache = {}
GOOGLE_CACHE_TTL = 3600  # 1 hora


# ==================== FUEL STATIONS (único en logistics) ====================
async def fetch_gas_stations_google(
    lat: float,
    lng: float,
    radius_km: float = 5.0,
    max_results: int = 20,
) -> List[dict]:
    """
    Obtiene gasolineras cercanas con precios REALES usando Google Places API (New).
    Es la MISMA fuente de datos que Google Maps muestra al usuario.
    """
    if not GOOGLE_MAPS_API_KEY:
        logger.warning("GOOGLE_MAPS_API_KEY no configurada para Places API")
        return []

    # Google Places usa metros para radius (max 50000m)
    radius_m = min(max(int(radius_km * 1000), 100), 50000)
    cache_key = f"google:{lat:.4f},{lng:.4f},{radius_m}"
    now = datetime.now(timezone.utc)

    if cache_key in google_places_cache:
        cached_time, cached = google_places_cache[cache_key]
        if (now - cached_time).total_seconds() < GOOGLE_CACHE_TTL:
            return cached

    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": GOOGLE_MAPS_API_KEY,
        "X-Goog-FieldMask": (
            "places.id,places.displayName,places.formattedAddress,"
            "places.location,places.primaryType,places.shortFormattedAddress,"
            "places.fuelOptions,places.regularOpeningHours.openNow"
        ),
        # Si la API key tiene restricción de HTTP referer, debemos enviar uno válido
        # cuando llamamos desde el backend.
        "Referer": os.environ.get(
            "GOOGLE_API_REFERER",
            os.environ.get("FRONTEND_PUBLIC_URL", "https://venturafreshlaundry.com"),
        ),
    }
    body = {
        "includedTypes": ["gas_station"],
        "maxResultCount": min(max_results, 20),
        "rankPreference": "DISTANCE",
        "locationRestriction": {
            "circle": {
                "center": {"latitude": lat, "longitude": lng},
                "radius": radius_m,
            }
        },
    }

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(GOOGLE_PLACES_NEARBY_URL, headers=headers, json=body)

        if resp.status_code != 200:
            logger.warning(f"Google Places searchNearby {resp.status_code}: {resp.text[:200]}")
            return []

        data = resp.json()
        out: List[dict] = []
        for p in data.get("places", []):
            loc = p.get("location", {})
            slat = loc.get("latitude")
            slng = loc.get("longitude")
            if slat is None or slng is None:
                continue

            display = p.get("displayName", {}).get("text") or "Gas Station"
            address = p.get("shortFormattedAddress") or p.get("formattedAddress", "")
            distance_miles = haversine_miles(lat, lng, slat, slng)

            # Parsear fuelOptions
            fuel_prices: Dict[str, dict] = {}
            regular_price: Optional[float] = None
            last_update: Optional[str] = None
            fuel_options = p.get("fuelOptions", {})
            for fp in fuel_options.get("fuelPrices", []):
                ftype_raw = fp.get("type", "")
                ftype = _FUEL_TYPE_MAP.get(ftype_raw, ftype_raw.lower())
                price_val = _parse_money(fp.get("price"))
                upd = fp.get("updateTime")
                if price_val is None:
                    continue
                fuel_prices[ftype] = {
                    "price": price_val,
                    "currency": (fp.get("price") or {}).get("currencyCode", "USD"),
                    "updated_at": upd,
                }
                if ftype == "regular" and regular_price is None:
                    regular_price = price_val
                    last_update = upd

            # Si no hay regular, usar el más barato disponible
            if regular_price is None and fuel_prices:
                cheapest = min(fuel_prices.values(), key=lambda v: v["price"])
                regular_price = cheapest["price"]
                last_update = cheapest.get("updated_at")

            brand = ""
            for known in ["chevron", "shell", "76", "arco", "mobil", "exxon",
                          "valero", "costco", "sams", "circle k", "speedway"]:
                if known in display.lower():
                    brand = known.title() if known != "76" else "76"
                    break

            out.append({
                "id": p.get("id", f"gp_{len(out)}"),
                "name": display,
                "brand": brand,
                "lat": slat,
                "lng": slng,
                "address": address,
                "price": regular_price,
                "price_source": "google_places" if regular_price is not None else "google_places_no_price",
                "fuel_prices": fuel_prices,  # estructura completa por tipo
                "last_updated": last_update,
                "distance_miles": round(distance_miles, 2),
                "currency": "USD",
                "open_now": p.get("regularOpeningHours", {}).get("openNow"),
            })

        # Ordenar: primero los que tienen precio (más baratos primero), luego sin precio
        out.sort(key=lambda x: (x["price"] is None, x["price"] or 999, x["distance_miles"]))
        google_places_cache[cache_key] = (now, out)
        logger.info(f"Google Places: {len(out)} stations, {sum(1 for s in out if s['price'])} with prices")
        return out

    except Exception as e:
        logger.error(f"Google Places request failed: {e}")
        return []


# ==================== FUEL STATIONS (FuelAPI fallback) ====================
async def fetch_fuel_stations(lat: float, lng: float, radius_km: float = 5.0) -> List[dict]:
    """Obtiene gasolineras reales desde FuelAPI (con caché y geocodificación ORS)"""
    if not FUEL_API_KEY:
        logger.warning("FUEL_API_KEY no configurada; usando datos simulados")
        return []

    cache_key = f"{lat:.4f},{lng:.4f},{radius_km}"
    now = datetime.now(timezone.utc)

    # Verificar caché
    if cache_key in fuel_cache:
        cached_time, cached_stations = fuel_cache[cache_key]
        if (now - cached_time).total_seconds() < CACHE_TTL:
            return cached_stations

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                f"{FUEL_API_BASE}/stations",
                params={
                    "lat": lat,
                    "lng": lng,
                    "radius": radius_km,
                    "max_results": 20,
                    "include_prices": "true",
                    "api_key": FUEL_API_KEY
                }
            )
        if response.status_code != 200:
            logger.error(f"FuelAPI error: {response.status_code}")
            return []

        data = response.json()
        stations = []
        for station in data.get("stations", []):
            station_lat = station.get("lat")
            station_lng = station.get("lng")

            # Si no tiene coordenadas, geocodificar por dirección (usando delivery_config)
            if not station_lat or not station_lng:
                address = station.get("address")
                if address:
                    coords = geocode_address(address)
                    if coords:
                        station_lat = coords["lat"]
                        station_lng = coords["lng"]

            if not station_lat or not station_lng:
                continue

            # Usar haversine de delivery_config
            from delivery_config import haversine_miles
            distance_miles = haversine_miles(lat, lng, station_lat, station_lng)
            
            price = station.get("regular_price") or station.get("price")
            if price is None:
                continue

            stations.append({
                "id": station.get("id", f"fuel_{len(stations)}"),
                "name": station.get("name", "Gas Station"),
                "brand": station.get("brand", ""),
                "lat": station_lat,
                "lng": station_lng,
                "address": station.get("address", ""),
                "price": float(price),
                "price_source": "fuelapi",
                "distance_miles": round(distance_miles, 2),
                "currency": "USD"
            })

        stations.sort(key=lambda x: x["price"])
        fuel_cache[cache_key] = (now, stations)
        return stations

    except Exception as e:
        logger.error(f"FuelAPI request failed: {e}")
        return []


# ==================== ENDPOINTS ====================

@router.get("/settings")
async def get_logistics_settings(current_user: dict = Depends(get_current_user)):
    """Obtiene la configuración del sistema de logística (usando delivery_config)"""
    from delivery_config import DEFAULT_FUEL_PRICE_PER_GALLON, DRIVER_HOURLY_RATE
    
    return {
        "vehicle_mpg": 12.0,
        "fuel_price_per_gallon": DEFAULT_FUEL_PRICE_PER_GALLON,
        "store_address": "5722 Telephone Rd Suite 5, Ventura CA 93003",
        "store_coords": {"lat": STORE_LAT, "lng": STORE_LNG},
        "reimbursement_rate_per_mile": 0.67,
        "max_delivery_distance_miles": MAX_DELIVERY_MILES,
        "delivery_tiers": DELIVERY_FEE_TIERS,
        "driver_hourly_rate": DRIVER_HOURLY_RATE,
        "working_hours_start": "08:00",
        "working_hours_end": "20:00",
        "timezone": "America/Los_Angeles"
    }


@router.put("/settings")
async def update_logistics_settings(settings: dict, current_user: dict = Depends(get_current_user)):
    """Actualiza la configuración del sistema de logística"""
    # Aquí podrías guardar en DB si es necesario
    return {"message": "Settings updated", "settings": settings}


# ==================== GAS STATIONS ====================
@router.get("/gas-stations")
async def get_gas_stations_nearby(
    lat: float,
    lng: float,
    radius_km: float = 5.0,
    source: str = Query("auto", description="auto|google|fuelapi"),
    current_user: dict = Depends(get_current_user)
):
    """
    Obtiene gasolineras cercanas con precios REALES.
    Prioridad: Google Places API (New) → FuelAPI → vacío.
    Google Places es la misma fuente que usa Google Maps al mostrar precios.
    """
    stations: List[dict] = []
    used_source = "none"

    if source in ("auto", "google"):
        stations = await fetch_gas_stations_google(lat, lng, radius_km)
        if stations:
            used_source = "google_places"

    if not stations and source in ("auto", "fuelapi"):
        stations = await fetch_fuel_stations(lat, lng, radius_km)
        if stations:
            used_source = "fuelapi"

    return {
        "stations": stations,
        "count": len(stations),
        "source": used_source,
        "currency": "USD",
        "fetched_at": datetime.now(timezone.utc).isoformat(),
    }


@router.post("/gas-stations/prices")
async def get_gas_stations_prices(
    payload: Any = Body(...),
    current_user: dict = Depends(get_current_user)
):
    """
    Enriquece gasolineras con precios reales vía Google Places API (New).
    Acepta tres formatos:
      1. Raw list (legacy):       [{lat,lng,name,brand}, ...]
      2. Object con stations:     {"stations": [...]}
      3. Búsqueda directa:        {"lat":N, "lng":N, "radius_km":N}
    """
    # Normalizar payload
    if isinstance(payload, list):
        payload = {"stations": payload}
    elif not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Invalid payload format")

    # Modo búsqueda directa
    if "lat" in payload and "lng" in payload:
        stations = await fetch_gas_stations_google(
            float(payload["lat"]),
            float(payload["lng"]),
            float(payload.get("radius_km", 5.0)),
            int(payload.get("max_results", 20)),
        )
        if not stations:
            stations = await fetch_fuel_stations(
                float(payload["lat"]),
                float(payload["lng"]),
                float(payload.get("radius_km", 5.0)),
            )
        return {
            "stations": stations,
            "count": len(stations),
            "source": "google_places" if stations and stations[0].get("price_source") == "google_places" else ("fuelapi" if stations else "none"),
            "currency": "USD",
            "last_updated": datetime.now(timezone.utc).isoformat(),
        }

    # Modo enriquecimiento batch (legacy)
    incoming = payload.get("stations") or []
    if not isinstance(incoming, list):
        raise HTTPException(status_code=400, detail="payload.stations must be a list")

    from delivery_config import DEFAULT_FUEL_PRICE_PER_GALLON

    # Agrupar por área de búsqueda (≤ 3km) para una sola llamada a Google
    enriched: List[dict] = []
    google_cache_local: Dict[str, List[dict]] = {}

    for s in incoming:
        slat = s.get("lat")
        slng = s.get("lng")
        if not (slat and slng):
            enriched.append({
                **s,
                "price": DEFAULT_FUEL_PRICE_PER_GALLON,
                "price_source": "fallback",
                "currency": "USD",
            })
            continue

        # Buscar en cache local (radio ~3 km del clúster)
        key = f"{round(slat, 2)},{round(slng, 2)}"
        if key not in google_cache_local:
            google_cache_local[key] = await fetch_gas_stations_google(slat, slng, radius_km=3.0)

        nearby = google_cache_local[key]
        # Encontrar match por proximidad (mismo punto ±0.001°)
        match = next(
            (g for g in nearby
             if abs(g["lat"] - slat) < 0.002 and abs(g["lng"] - slng) < 0.002),
            None,
        )
        if match and match.get("price") is not None:
            enriched.append({
                **s,
                "price": match["price"],
                "price_source": "google_places",
                "fuel_prices": match.get("fuel_prices", {}),
                "last_updated": match.get("last_updated"),
                "currency": "USD",
            })
        elif nearby:
            # Sin match exacto: usar el promedio del área (más realista que regional)
            priced = [g for g in nearby if g.get("price")]
            if priced:
                avg = round(sum(g["price"] for g in priced) / len(priced), 3)
                enriched.append({
                    **s,
                    "price": avg,
                    "price_source": "google_places_area_avg",
                    "currency": "USD",
                })
                continue
            enriched.append({
                **s,
                "price": DEFAULT_FUEL_PRICE_PER_GALLON,
                "price_source": "fallback",
                "currency": "USD",
            })
        else:
            enriched.append({
                **s,
                "price": DEFAULT_FUEL_PRICE_PER_GALLON,
                "price_source": "fallback",
                "currency": "USD",
            })

    return {
        "stations": enriched,
        "currency": "USD",
        "source": "google_places",
        "last_updated": datetime.now(timezone.utc).isoformat(),
    }


# ==================== DISTANCE & DELIVERY (usa delivery_config) ====================
@router.get("/distance")
async def get_distance(
    lat: float = Query(..., description="Latitud del destino"),
    lng: float = Query(..., description="Longitud del destino"),
):
    """Calcula distancia, tiempo y tarifa de entrega usando delivery_config"""
    result = await calculate_driving_distance_async(f"POINT({lng} {lat})")
    
    if result.get("distance_miles") is None:
        raise HTTPException(status_code=400, detail="Could not calculate distance")
    
    distance_miles = result["distance_miles"]
    delivery_info = get_delivery_info(distance_miles)
    
    return {
        "distance_miles": distance_miles,
        "duration_minutes": result.get("duration_minutes", distance_miles / 30 * 60),
        "delivery_fee": delivery_info["fee"] if distance_miles <= MAX_DELIVERY_MILES else None,
        "allowed": distance_miles <= MAX_DELIVERY_MILES,
        "label": delivery_info["tier"]["label"] if delivery_info["tier"] else None,
        "calculation_method": result.get("source", "unknown")
    }


# ==================== ROUTE PLANNING (mejorado con delivery_config) ====================
@router.post("/route-plan")
async def calculate_route_plan(
    request: dict,
    current_user: dict = Depends(get_current_user)
):
    """Calcula un plan de ruta óptimo usando delivery_config"""
    addresses = request.get("addresses", [])
    
    if not addresses:
        return {"error": "No addresses provided"}
    
    result = optimize_delivery_route(addresses)
    
    return {
        "original_order": addresses,
        "optimized_order": result["route"],
        "total_distance_miles": result["total_distance_miles"],
        "total_duration_minutes": result["total_duration_minutes"],
        "total_stops": len(addresses)
    }


# ==================== ORDERS ====================
# Servicios de Ventura Fresh Laundry → tipos para el mapa de logística
SERVICE_TYPE_MAP = {
    # Pickup & Delivery (todas las variantes)
    "pickup-delivery": "pickup-delivery",
    "pickup_delivery": "pickup-delivery",
    "pd": "pickup-delivery",
    "delivery": "pickup-delivery",
    # Wash & Fold (drop-off en tienda — no requiere ruta)
    "wash-fold": "wash-fold",
    "wash_fold": "wash-fold",
    "wf": "wash-fold",
    "wash_dry_fold": "wash-fold",
    # Airbnb Specialists
    "airbnb": "airbnb",
    "airbnb-specialist": "airbnb",
    "airbnb_specialist": "airbnb",
    # B2B / Comercial
    "b2b": "b2b",
    "commercial": "b2b",
    "business": "b2b",
    # Self-service (excluido de logística por defecto)
    "self-service": "self-service",
    "self_service": "self-service",
}

# Servicios que se muestran en el mapa de logística (requieren ruta)
LOGISTICS_SERVICE_TYPES = {"pickup-delivery", "airbnb", "b2b"}


def _normalize_service_type(raw: Optional[str]) -> str:
    if not raw:
        return "pickup-delivery"
    key = str(raw).lower().strip().replace(" ", "-")
    return SERVICE_TYPE_MAP.get(key, "pickup-delivery")


def _parse_time_window(window: str):
    """Parse formats like '9:00 AM - 11:00 AM' or '09:00-11:00' into (start_min, end_min)."""
    if not window:
        return None
    import re
    parts = re.split(r"\s*-\s*", str(window).strip())
    if len(parts) < 2:
        return None

    def _to_min(token: str):
        m = re.match(r"(\d{1,2})(?::(\d{2}))?\s*(am|pm)?", token.strip(), re.IGNORECASE)
        if not m:
            return None
        h = int(m.group(1))
        mins = int(m.group(2)) if m.group(2) else 0
        mer = (m.group(3) or "").lower()
        if mer == "pm" and h < 12:
            h += 12
        if mer == "am" and h == 12:
            h = 0
        return h * 60 + mins

    s, e = _to_min(parts[0]), _to_min(parts[1])
    if s is None or e is None:
        return None
    return (s, e)


def _in_time_window(window_str: str, filter_key: str) -> bool:
    """filter_key: 'morning' (06:00-12:00), 'afternoon' (12:00-18:00), 'evening' (18:00-22:00)."""
    parsed = _parse_time_window(window_str)
    if parsed is None:
        return True  # sin info, no filtrar
    s, e = parsed
    ranges = {
        "morning": (6 * 60, 12 * 60),
        "afternoon": (12 * 60, 18 * 60),
        "evening": (18 * 60, 22 * 60),
    }
    r = ranges.get(filter_key)
    if not r:
        return True
    # Solapamiento de intervalos
    return s < r[1] and e > r[0]


@router.get("/orders")
async def get_logistics_orders(
    status: Optional[str] = None,
    date: Optional[str] = None,
    service_type: Optional[str] = Query(None, description="pickup-delivery|wash-fold|airbnb|b2b|all"),
    time_window: Optional[str] = Query(None, description="morning|afternoon|evening"),
    phase: Optional[str] = Query(None, description="pickup|delivery|both"),
    include_wash_fold: bool = Query(True, description="Incluir órdenes drop-off Wash & Fold"),
    auto_today: bool = Query(True, description="Si date no se envía, usar hoy por defecto"),
    current_user: dict = Depends(get_current_user)
):
    """Obtiene órdenes para la vista de logística/despacho con filtros completos."""
    from datetime import date as date_cls

    # ── Fecha por defecto = hoy ───────────────────────────────────────
    target_date = date
    if not target_date and auto_today:
        target_date = date_cls.today().isoformat()  # YYYY-MM-DD

    # ── Construir query Mongo ─────────────────────────────────────────
    query: Dict[str, Any] = {}

    if status:
        query["status"] = status
    else:
        # Estados relevantes para logística (incluye órdenes en proceso aún por entregar)
        query["status"] = {
            "$in": [
                "new", "pending", "confirmed", "pickup_scheduled",
                "picked_up", "picked-up", "in_process", "in-process",
                "ready", "out_for_delivery", "shipping",
            ]
        }

    if target_date:
        phase_norm = (phase or "both").lower()
        if phase_norm == "pickup":
            query["pickup_date"] = target_date
        elif phase_norm == "delivery":
            query["delivery_date"] = target_date
        else:
            query["$or"] = [{"pickup_date": target_date}, {"delivery_date": target_date}]

    orders = await db.orders.find(query, {"_id": 0}).to_list(500)

    # ── Post-filtros (en Python para flexibilidad) ────────────────────
    svc_filter = (service_type or "all").lower()

    result = []
    for order in orders:
        norm_type = _normalize_service_type(order.get("service_type"))

        # Excluir self-service siempre
        if norm_type == "self-service":
            continue

        # Excluir wash-fold si no se incluye
        if norm_type == "wash-fold" and not include_wash_fold:
            continue

        # Filtro de service_type
        if svc_filter not in ("all", ""):
            if norm_type != svc_filter:
                continue

        # Filtro de time_window
        pickup_window = order.get("pickup_time_window") or order.get("pickup_time") or ""
        delivery_window = order.get("delivery_time") or ""
        if time_window:
            tw = time_window.lower()
            # Si fase=delivery, miramos delivery_time; pickup→pickup_window; both→cualquiera
            phase_norm = (phase or "both").lower()
            if phase_norm == "pickup":
                if not _in_time_window(pickup_window, tw):
                    continue
            elif phase_norm == "delivery":
                if not _in_time_window(delivery_window, tw):
                    continue
            else:
                if not (_in_time_window(pickup_window, tw) or _in_time_window(delivery_window, tw)):
                    continue

        # Coordenadas (geocode si faltan)
        lat = order.get("delivery_lat") or order.get("pickup_lat")
        lng = order.get("delivery_lng") or order.get("pickup_lng")
        if not lat or not lng:
            address = order.get("delivery_address") or order.get("pickup_address")
            if address:
                coords = geocode_address(address)
                if coords:
                    lat, lng = coords["lat"], coords["lng"]

        result.append({
            "id": order.get("id"),
            "orderNumber": order.get("order_number") or f"VFL-{(order.get('id') or '')[:8]}",
            "type": norm_type,
            "service_type": norm_type,  # alias para compatibilidad con mapper frontend
            "status": order.get("status", "pending"),
            "service_plan": order.get("service_plan", "standard"),
            "customer": {
                "name": order.get("customer_name", "Cliente"),
                "phone": order.get("customer_phone", ""),
                "email": order.get("customer_email", "")
            },
            "location": {
                "lat": lat or STORE_LAT,
                "lng": lng or STORE_LNG,
                "address": order.get("delivery_address") or order.get("pickup_address") or STORE_ADDRESS,
                "zipCode": order.get("zip_code", "")
            },
            "schedule": {
                "pickupDate": order.get("pickup_date", ""),
                "pickupTime": pickup_window or "09:00 AM - 12:00 PM",
                "deliveryDate": order.get("delivery_date", ""),
                "deliveryTime": delivery_window or "12:00 PM - 03:00 PM",
            },
            "pricing": {
                "subtotal": order.get("subtotal", 0),
                "tax": order.get("tax", 0),
                "total": order.get("total_amount", 0)
            },
            "payment": {
                "method": order.get("payment_method", "card"),
                "status": order.get("payment_status", "pending")
            },
            "specialInstructions": order.get("notes", ""),
            "priority": order.get("priority", "normal"),
            "estimatedLbs": order.get("estimated_lbs", 0),
            "actualLbs": order.get("actual_lbs", 0),
            "deliveryFee": order.get("delivery_fee", 0),
        })

    return result


@router.put("/orders/{order_id}/status")
async def update_logistics_order_status(
    order_id: str,
    status_data: dict,
    current_user: dict = Depends(get_current_user)
):
    """Actualiza el estado de una orden desde logística"""
    new_status = status_data.get("status")
    if not new_status:
        raise HTTPException(status_code=400, detail="Status required")

    await db.orders.update_one(
        {"id": order_id},
        {"$set": {"status": new_status, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    return {"message": f"Order {order_id} status updated to {new_status}"}


# ==================== VEHICLES ====================
@router.get("/vehicles")
async def list_vehicles(current_user: dict = Depends(get_current_user)):
    """Lista todos los vehículos activos"""
    return await db.vehicles.find({"is_active": True}, {"_id": 0}).to_list(100)


@router.get("/vehicles/available")
async def get_available_vehicles(current_user: dict = Depends(get_current_user)):
    """Lista vehículos disponibles (solo id y nombre)"""
    return await db.vehicles.find({"is_active": True}, {"_id": 0, "id": 1, "name": 1}).to_list(50)


# ==================== DRIVERS ====================
@router.get("/drivers")
async def list_drivers(current_user: dict = Depends(get_current_user)):
    """Lista todos los conductores activos"""
    return await db.drivers.find({"is_active": True}, {"_id": 0}).to_list(100)


@router.get("/drivers/available")
async def get_available_drivers(current_user: dict = Depends(get_current_user)):
    """Lista conductores disponibles (solo id y nombre)"""
    return await db.drivers.find({"is_active": True}, {"_id": 0, "id": 1, "name": 1}).to_list(50)


# ==================== DISPATCH ====================
@router.get("/dispatch/queue")
async def get_dispatch_queue(current_user: dict = Depends(get_current_user)):
    """Obtiene la cola de despacho (órdenes pendientes sin asignar)"""
    pending = await db.orders.find(
        {"status": {"$in": ["confirmed", "ready"]}, "assigned_driver_id": {"$exists": False}},
        {"_id": 0}
    ).to_list(50)
    return {"pending_orders": pending, "count": len(pending)}


# ==================== FUEL LOGS ====================
@router.post("/fuel-logs")
async def create_fuel_log(log: dict, current_user: dict = Depends(get_current_user)):
    """Crea un registro de carga de combustible"""
    log["id"] = str(uuid.uuid4())
    log["created_at"] = datetime.now(timezone.utc).isoformat()
    await db.fuel_logs.insert_one(log)
    return log


@router.get("/fuel-logs")
async def list_fuel_logs(vehicle_id: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    """Lista registros de combustible"""
    query = {}
    if vehicle_id:
        query["vehicle_id"] = vehicle_id
    return await db.fuel_logs.find(query, {"_id": 0}).sort("date", -1).to_list(500)


# ==================== MILEAGE LOGS ====================
@router.post("/mileage-logs")
async def create_mileage_log(log: dict, current_user: dict = Depends(get_current_user)):
    """Crea un registro de kilometraje"""
    log["id"] = str(uuid.uuid4())
    log["total_miles"] = log.get("end_odometer", 0) - log.get("start_odometer", 0)
    log["created_at"] = datetime.now(timezone.utc).isoformat()
    await db.mileage_logs.insert_one(log)
    return log


@router.get("/mileage-logs")
async def list_mileage_logs(vehicle_id: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    """Lista registros de kilometraje"""
    query = {}
    if vehicle_id:
        query["vehicle_id"] = vehicle_id
    return await db.mileage_logs.find(query, {"_id": 0}).sort("date", -1).to_list(500)


# ==================== PING ====================
@router.get("/ping")
async def ping(current_user: dict = Depends(get_current_user)):
    """Endpoint de prueba para verificar autenticación y conexión"""
    return {"message": "pong", "timestamp": datetime.now(timezone.utc).isoformat()}