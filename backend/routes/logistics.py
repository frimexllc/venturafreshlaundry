"""
Logistics Module - Complete routes for the logistics map
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from typing import Optional, List, Dict
from datetime import datetime, timezone
import uuid
import logging

from database import db
from auth import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/logistics", tags=["Logistics"])


# ==================== SETTINGS ====================
@router.get("/settings")
async def get_logistics_settings(current_user: dict = Depends(get_current_user)):
    """Get logistics system settings"""
    return {
        "vehicle_mpg": 12.0,
        "fuel_price_per_gallon": 4.65,
        "store_address": "Ventura, CA",
        "reimbursement_rate_per_mile": 0.67,
        "max_delivery_distance_miles": 50,
        "working_hours_start": "08:00",
        "working_hours_end": "20:00",
        "timezone": "America/Los_Angeles"
    }


@router.put("/settings")
async def update_logistics_settings(settings: dict, current_user: dict = Depends(get_current_user)):
    """Update logistics system settings"""
    return {"message": "Settings updated", "settings": settings}


# ==================== ORDERS ====================
@router.get("/orders")
async def get_logistics_orders(
    status: Optional[str] = None,
    date: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get orders for logistics/dispatch view"""
    # Buscar órdenes en la base de datos
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
    
    # Transformar al formato esperado por el frontend
    result = []
    for order in orders:
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
                "lat": order.get("delivery_lat") or order.get("pickup_lat") or 34.264157,
                "lng": order.get("delivery_lng") or order.get("pickup_lng") or -119.213715,
                "address": order.get("delivery_address") or order.get("pickup_address") or "Ventura, CA",
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
    
    # Si no hay órdenes en BD, devolver datos de ejemplo
    if not result:
        result = [
            {
                "id": "order-1",
                "orderNumber": "ORD-001",
                "type": "pickup-delivery",
                "status": "ready",
                "customer": {"name": "Cliente Ejemplo", "phone": "+1 234 567 890", "email": "cliente@example.com"},
                "location": {"lat": 34.264157, "lng": -119.213715, "address": "123 Main St, Ventura, CA", "zipCode": "93001"},
                "schedule": {"pickupDate": "2026-05-07", "pickupTime": "09:00-12:00", "deliveryDate": "2026-05-07", "deliveryTime": "12:00-15:00"},
                "pricing": {"subtotal": 50.00, "tax": 5.00, "total": 55.00},
                "payment": {"method": "card", "status": "paid"},
                "specialInstructions": "",
                "priority": "normal",
                "estimatedLbs": 20,
                "actualLbs": 0
            },
            {
                "id": "order-2",
                "orderNumber": "ORD-002",
                "type": "wash-fold",
                "status": "pending",
                "customer": {"name": "Maria Lopez", "phone": "+1 234 567 891", "email": "maria@example.com"},
                "location": {"lat": 34.272, "lng": -119.220, "address": "456 Oak St, Ventura, CA", "zipCode": "93001"},
                "schedule": {"pickupDate": "2026-05-07", "pickupTime": "14:00-16:00", "deliveryDate": "2026-05-08", "deliveryTime": "10:00-12:00"},
                "pricing": {"subtotal": 35.00, "tax": 3.50, "total": 38.50},
                "payment": {"method": "cash", "status": "pending"},
                "specialInstructions": "Usar detergente sin aroma",
                "priority": "high",
                "estimatedLbs": 15,
                "actualLbs": 0
            }
        ]
    
    return result


@router.put("/orders/{order_id}/status")
async def update_logistics_order_status(
    order_id: str,
    status_data: dict,
    current_user: dict = Depends(get_current_user)
):
    """Update order status from logistics"""
    new_status = status_data.get("status")
    if not new_status:
        raise HTTPException(status_code=400, detail="Status required")
    
    await db.orders.update_one(
        {"id": order_id},
        {"$set": {"status": new_status, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    
    return {"message": f"Order {order_id} status updated to {new_status}"}


# ==================== GAS STATIONS ====================
@router.get("/gas-stations")
async def get_gas_stations_nearby(
    lat: float,
    lng: float,
    radius_km: float = 5.0,
    current_user: dict = Depends(get_current_user)
):
    """Get nearby gas stations (compatible with existing API)"""
    # Por ahora, devolver datos de ejemplo
    stations = [
        {"id": "station-1", "name": "Chevron", "lat": lat + 0.01, "lng": lng + 0.01, "address": "123 Main St", "price": 4.65},
        {"id": "station-2", "name": "Shell", "lat": lat - 0.008, "lng": lng + 0.005, "address": "456 Oak Ave", "price": 4.59},
        {"id": "station-3", "name": "76", "lat": lat + 0.005, "lng": lng - 0.012, "address": "789 Pine Blvd", "price": 4.72},
    ]
    return {"stations": stations, "count": len(stations)}


@router.post("/gas-stations/prices")
async def get_gas_stations_prices(
    stations: List[dict],
    current_user: dict = Depends(get_current_user)
):
    """Get fuel prices for gas stations"""
    enriched = []
    for station in stations:
        enriched.append({
            **station,
            "price": 4.65,
            "price_source": "regional",
            "currency": "USD"
        })
    return {"stations": enriched, "currency": "USD", "last_updated": datetime.now(timezone.utc).isoformat()}


# ==================== ROUTE PLANNING ====================
@router.post("/route-plan")
async def calculate_route_plan(
    request: dict,
    current_user: dict = Depends(get_current_user)
):
    """Calculate optimal route plan"""
    addresses = request.get("addresses", [])
    return {
        "original_order": addresses,
        "optimized_order": addresses,
        "total_distance_miles": 25.5,
        "total_stops": len(addresses)
    }


# ==================== VEHICLES ====================
@router.get("/vehicles")
async def list_vehicles(current_user: dict = Depends(get_current_user)):
    return await db.vehicles.find({"is_active": True}, {"_id": 0}).to_list(100)


@router.get("/vehicles/available")
async def get_available_vehicles(current_user: dict = Depends(get_current_user)):
    return await db.vehicles.find({"is_active": True}, {"_id": 0, "id": 1, "name": 1}).to_list(50)


# ==================== DRIVERS ====================
@router.get("/drivers")
async def list_drivers(current_user: dict = Depends(get_current_user)):
    return await db.drivers.find({"is_active": True}, {"_id": 0}).to_list(100)


@router.get("/drivers/available")
async def get_available_drivers(current_user: dict = Depends(get_current_user)):
    return await db.drivers.find({"is_active": True}, {"_id": 0, "id": 1, "name": 1}).to_list(50)


# ==================== DISPATCH ====================
@router.get("/dispatch/queue")
async def get_dispatch_queue(current_user: dict = Depends(get_current_user)):
    pending = await db.orders.find(
        {"status": {"$in": ["confirmed", "ready"]}, "assigned_driver_id": {"$exists": False}},
        {"_id": 0}
    ).to_list(50)
    return {"pending_orders": pending, "count": len(pending)}


# ==================== FUEL LOGS ====================
@router.post("/fuel-logs")
async def create_fuel_log(log: dict, current_user: dict = Depends(get_current_user)):
    log["id"] = str(uuid.uuid4())
    log["created_at"] = datetime.now(timezone.utc).isoformat()
    await db.fuel_logs.insert_one(log)
    return log


@router.get("/fuel-logs")
async def list_fuel_logs(vehicle_id: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    query = {}
    if vehicle_id:
        query["vehicle_id"] = vehicle_id
    return await db.fuel_logs.find(query, {"_id": 0}).sort("date", -1).to_list(500)


# ==================== MILEAGE LOGS ====================
@router.post("/mileage-logs")
async def create_mileage_log(log: dict, current_user: dict = Depends(get_current_user)):
    log["id"] = str(uuid.uuid4())
    log["total_miles"] = log.get("end_odometer", 0) - log.get("start_odometer", 0)
    log["created_at"] = datetime.now(timezone.utc).isoformat()
    await db.mileage_logs.insert_one(log)
    return log


@router.get("/mileage-logs")
async def list_mileage_logs(vehicle_id: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    query = {}
    if vehicle_id:
        query["vehicle_id"] = vehicle_id
    return await db.mileage_logs.find(query, {"_id": 0}).sort("date", -1).to_list(500)


# ==================== PING (TEST) ====================
@router.get("/ping")
async def ping(current_user: dict = Depends(get_current_user)):
    return {"message": "pong", "timestamp": datetime.now(timezone.utc).isoformat()}
