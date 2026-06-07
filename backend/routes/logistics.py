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
from fastapi import APIRouter, HTTPException, Depends, Query

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

# ==================== CACHE FOR FUEL API ====================
fuel_cache = {}
CACHE_TTL = 1800  # 30 minutos


# ==================== FUEL STATIONS (único en logistics) ====================
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


# ==================== GAS STATIONS (FuelAPI) ====================
@router.get("/gas-stations")
async def get_gas_stations_nearby(
    lat: float,
    lng: float,
    radius_km: float = 5.0,
    current_user: dict = Depends(get_current_user)
):
    """Obtiene gasolineras cercanas con precios reales de FuelAPI"""
    stations = await fetch_fuel_stations(lat, lng, radius_km)
    return {"stations": stations, "count": len(stations)}


@router.post("/gas-stations/prices")
async def get_gas_stations_prices(
    stations: List[dict],
    current_user: dict = Depends(get_current_user)
):
    """Enriquece una lista de gasolineras con precios reales (batch)"""
    if not FUEL_API_KEY:
        from delivery_config import DEFAULT_FUEL_PRICE_PER_GALLON
        return {
            "stations": [
                {**s, "price": DEFAULT_FUEL_PRICE_PER_GALLON, "price_source": "regional", "currency": "USD"}
                for s in stations
            ],
            "currency": "USD",
            "last_updated": datetime.now(timezone.utc).isoformat()
        }

    unique_coords = {}
    for s in stations:
        lat = s.get("lat")
        lng = s.get("lng")
        if lat and lng:
            key = f"{lat:.4f},{lng:.4f}"
            unique_coords[key] = (lat, lng)

    price_map = {}
    for key, (slat, slng) in unique_coords.items():
        fetched = await fetch_fuel_stations(slat, slng, radius_km=0.5)
        for f in fetched:
            target_name = next(
                (s.get("name") for s in stations 
                 if abs(s.get("lat", 0)-slat) < 0.001 and abs(s.get("lng", 0)-slng) < 0.001),
                ""
            )
            if target_name and f["name"].lower() in target_name.lower():
                price_map[key] = f["price"]
                break
        if key not in price_map and fetched:
            price_map[key] = min(f["price"] for f in fetched)

    from delivery_config import DEFAULT_FUEL_PRICE_PER_GALLON
    
    enriched = []
    for s in stations:
        lat = s.get("lat")
        lng = s.get("lng")
        price = None
        if lat and lng:
            key = f"{lat:.4f},{lng:.4f}"
            price = price_map.get(key)
        enriched.append({
            **s,
            "price": price if price is not None else DEFAULT_FUEL_PRICE_PER_GALLON,
            "price_source": "fuelapi" if price is not None else "fallback",
            "currency": "USD"
        })

    return {
        "stations": enriched,
        "currency": "USD",
        "last_updated": datetime.now(timezone.utc).isoformat()
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
@router.get("/orders")
async def get_logistics_orders(
    status: Optional[str] = None,
    date: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Obtiene órdenes para la vista de logística/despacho"""
    query = {}
    if status:
        query["status"] = status
    else:
        query["status"] = {"$in": ["pending", "confirmed", "ready", "out_for_delivery"]}
    if date:
        query["$or"] = [
            {"pickup_date": date},
            {"delivery_date": date}
        ]

    orders = await db.orders.find(query, {"_id": 0}).to_list(100)

    result = []
    for order in orders:
        # Usar geocode de delivery_config si es necesario
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
            "orderNumber": order.get("order_number", f"ORD-{order.get('id', '')[:8]}"),
            "type": "pickup-delivery",
            "status": order.get("status", "pending"),
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
                "pickupTime": order.get("pickup_time", "09:00-12:00"),
                "deliveryDate": order.get("delivery_date", ""),
                "deliveryTime": order.get("delivery_time", "12:00-15:00")
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
            "actualLbs": order.get("actual_lbs", 0)
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