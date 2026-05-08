import math
from typing import Optional, Tuple

def calculate_mpg(start_odometer: float, end_odometer: float, gallons: float) -> Optional[float]:
    """Calcula millas por galón."""
    miles = end_odometer - start_odometer
    if miles <= 0 or gallons <= 0:
        return None
    return round(miles / gallons, 2)


def calculate_fuel_cost(miles: float, avg_mpg: float, price_per_gallon: float) -> float:
    """Calcula costo estimado de combustible."""
    if avg_mpg <= 0 or price_per_gallon <= 0:
        return 0.0
    gallons_needed = miles / avg_mpg
    return round(gallons_needed * price_per_gallon, 2)


def calculate_route_fuel_consumption(distance_miles: float, vehicle_mpg: float) -> Tuple[float, float]:
    """
    Calcula galones necesarios y costo estimado.
    Retorna (gallons_needed, cost)
    """
    if distance_miles <= 0 or vehicle_mpg <= 0:
        return (0.0, 0.0)
    
    gallons = distance_miles / vehicle_mpg
    
    # Precio promedio por galón (se puede obtener de API externa)
    avg_price_per_gallon = 3.50
    
    cost = gallons * avg_price_per_gallon
    return (round(gallons, 2), round(cost, 2))


def calculate_vehicle_efficiency_trend(fuel_logs: list) -> dict:
    """Calcula tendencia de eficiencia del vehículo."""
    if not fuel_logs or len(fuel_logs) < 2:
        return {"trend": "insufficient_data", "avg_mpg": 0, "best_mpg": 0, "worst_mpg": 0}
    
    mpgs = [log.get("calculated_mpg", 0) for log in fuel_logs if log.get("calculated_mpg", 0) > 0]
    if not mpgs:
        return {"trend": "no_data", "avg_mpg": 0, "best_mpg": 0, "worst_mpg": 0}
    
    recent_avg = sum(mpgs[-3:]) / min(3, len(mpgs))
    overall_avg = sum(mpgs) / len(mpgs)
    
    return {
        "trend": "improving" if recent_avg > overall_avg else "declining" if recent_avg < overall_avg else "stable",
        "avg_mpg": round(overall_avg, 2),
        "best_mpg": round(max(mpgs), 2),
        "worst_mpg": round(min(mpgs), 2),
        "recent_mpg": round(recent_avg, 2)
    }