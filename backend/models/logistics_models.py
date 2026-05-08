from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime


# ==================== VEHICLES ====================
class VehicleCreate(BaseModel):
    name: str
    license_plate: str
    vehicle_type: str = "van"  # van, truck, car, motorcycle
    year: Optional[int] = None
    make: Optional[str] = None
    model: Optional[str] = None
    fuel_type: str = "gasoline"  # gasoline, diesel, electric, hybrid
    avg_mpg: float = Field(..., gt=0, le=50, description="Real MPG")
    fuel_tank_capacity: Optional[float] = None  # gallons
    current_odometer: float = 0
    last_maintenance_miles: Optional[float] = None
    maintenance_interval: int = 5000  # miles
    is_active: bool = True
    assigned_driver_id: Optional[str] = None


class VehicleResponse(VehicleCreate):
    id: str
    total_miles_driven: float = 0
    total_fuel_consumed: float = 0
    total_fuel_cost: float = 0
    last_fuel_up_date: Optional[str] = None
    maintenance_status: str = "ok"  # ok, due_soon, overdue
    created_at: str
    updated_at: str


# ==================== FUEL LOGS ====================
class FuelLogCreate(BaseModel):
    vehicle_id: str
    date: str
    odometer: float = Field(..., gt=0)
    gallons: float = Field(..., gt=0, le=200)
    price_per_gallon: float = Field(..., gt=0)
    total_cost: float = Field(..., gt=0)
    station_name: Optional[str] = None
    station_location: Optional[str] = None
    fuel_type: str = "gasoline"
    payment_method: str = "card"
    receipt_image_url: Optional[str] = None
    notes: Optional[str] = None


class FuelLogResponse(FuelLogCreate):
    id: str
    miles_since_last_fuel: Optional[float] = None
    calculated_mpg: Optional[float] = None
    created_at: str


# ==================== MILEAGE LOGS ====================
class MileageLogCreate(BaseModel):
    vehicle_id: str
    driver_id: Optional[str] = None
    driver_name: str
    date: str
    start_odometer: float
    end_odometer: float
    purpose: str
    order_id: Optional[str] = None
    route_data: Optional[dict] = None  # JSON con pasos, distancia, duración
    notes: Optional[str] = None


class MileageLogResponse(MileageLogCreate):
    id: str
    total_miles: float
    estimated_fuel_cost: Optional[float] = None
    estimated_fuel_gallons: Optional[float] = None
    reimbursement_amount: float
    created_at: str
    updated_at: str


# ==================== DRIVERS ====================
class DriverCreate(BaseModel):
    name: str
    email: Optional[str] = None
    phone: str
    license_number: str
    license_expiry: str
    vehicle_id: Optional[str] = None
    employee_id: str
    hourly_rate: Optional[float] = None
    is_active: bool = True


class DriverResponse(DriverCreate):
    id: str
    total_miles_driven: float = 0
    total_trips: int = 0
    total_reimbursement: float = 0
    created_at: str
    updated_at: str


# ==================== FUEL EFFICIENCY REPORT ====================
class FuelEfficiencyReport(BaseModel):
    vehicle_id: str
    vehicle_name: str
    period_start: str
    period_end: str
    total_miles: float
    total_gallons: float
    average_mpg: float
    total_fuel_cost: float
    cost_per_mile: float
    trips_count: int


# ==================== REAL-TIME FUEL PRICE ====================
class RealTimeFuelPrice(BaseModel):
    price: float
    station_name: str
    station_address: str
    distance_km: float
    last_updated: str

class FuelPriceRequest(BaseModel):
    lat: float
    lng: float
    radius_km: float = 5.0
    fuel_type: str = "regular"  # regular, midgrade, premium, diesel


class FuelPriceResponse(BaseModel):
    station_name: str
    station_address: str
    distance_km: float
    price_regular: Optional[float] = None
    price_midgrade: Optional[float] = None
    price_premium: Optional[float] = None
    price_diesel: Optional[float] = None
    last_updated: str
    source: str = "google_places"


class RouteCostRequest(BaseModel):
    origin_address: str
    destination_address: str
    vehicle_id: Optional[str] = None
    fuel_price_per_gallon: Optional[float] = None


class RouteCostResponse(BaseModel):
    distance_miles: float
    distance_text: str
    duration_minutes: float
    duration_text: str
    vehicle_mpg: float
    gallons_needed: float
    fuel_price_per_gallon: float
    estimated_fuel_cost: float
    co2_emissions_lbs: Optional[float] = None