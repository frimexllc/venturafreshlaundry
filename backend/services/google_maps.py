"""
Google Maps Integration Service
- Distance Matrix API for route calculations
- Places API for nearby gas stations
- Geocoding for address to coordinates
"""
import os
import logging
import aiohttp
from typing import Optional, List, Dict, Tuple
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

GOOGLE_MAPS_API_KEY = os.environ.get("GOOGLE_MAPS_API_KEY")
DEFAULT_MPG = float(os.environ.get("VEHICLE_MPG_DEFAULT", 18.5))
FUEL_PRICE_FALLBACK = float(os.environ.get("FUEL_PRICE_FALLBACK", 3.50))


class GoogleMapsService:
    """Service for Google Maps API integration"""
    
    def __init__(self, api_key: str = None):
        self.api_key = api_key or GOOGLE_MAPS_API_KEY
        self.base_url = "https://maps.googleapis.com/maps/api"
        
    async def geocode_address(self, address: str) -> Optional[Tuple[float, float]]:
        """Convert address to lat/lng coordinates"""
        if not self.api_key:
            logger.warning("Google Maps API key not configured")
            return None
            
        url = f"{self.base_url}/geocode/json"
        params = {
            "address": address,
            "key": self.api_key
        }
        
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(url, params=params) as response:
                    data = await response.json()
                    
                    if data.get("status") == "OK" and data.get("results"):
                        location = data["results"][0]["geometry"]["location"]
                        return (location["lat"], location["lng"])
                    else:
                        logger.warning(f"Geocoding failed for {address}: {data.get('status')}")
                        return None
        except Exception as e:
            logger.error(f"Geocoding error: {e}")
            return None
    
    async def get_distance_matrix(
        self,
        origins: List[str],
        destinations: List[str],
        mode: str = "driving"
    ) -> Optional[Dict]:
        """Get distance and duration between points"""
        if not self.api_key:
            logger.warning("Google Maps API key not configured")
            return None
            
        url = f"{self.base_url}/distancematrix/json"
        params = {
            "origins": "|".join(origins),
            "destinations": "|".join(destinations),
            "mode": mode,
            "units": "imperial",
            "key": self.api_key
        }
        
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(url, params=params) as response:
                    data = await response.json()
                    
                    if data.get("status") == "OK":
                        return data
                    else:
                        logger.warning(f"Distance Matrix failed: {data.get('status')}")
                        return None
        except Exception as e:
            logger.error(f"Distance Matrix error: {e}")
            return None
    
    async def calculate_route_distance(
        self,
        origin: str,
        destination: str,
        mode: str = "driving"
    ) -> Optional[Dict]:
        """Calculate distance in miles and duration for a single route"""
        result = await self.get_distance_matrix([origin], [destination], mode)
        
        if result and result.get("rows"):
            element = result["rows"][0]["elements"][0]
            if element.get("status") == "OK":
                return {
                    "distance_miles": round(element["distance"]["value"] * 0.000621371, 2),
                    "distance_text": element["distance"]["text"],
                    "duration_minutes": round(element["duration"]["value"] / 60, 2),
                    "duration_text": element["duration"]["text"]
                }
        
        return None
    
    async def find_nearby_gas_stations(
        self,
        lat: float,
        lng: float,
        radius_meters: int = 5000,
        max_results: int = 10
    ) -> List[Dict]:
        """Find gas stations near a location"""
        if not self.api_key:
            logger.warning("Google Maps API key not configured")
            return []
            
        url = f"{self.base_url}/place/nearbysearch/json"
        params = {
            "location": f"{lat},{lng}",
            "radius": radius_meters,
            "type": "gas_station",
            "key": self.api_key
        }
        
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(url, params=params) as response:
                    data = await response.json()
                    
                    if data.get("status") in ["OK", "ZERO_RESULTS"]:
                        stations = []
                        for place in data.get("results", [])[:max_results]:
                            # Get price if available from place details
                            price_info = await self.get_gas_station_price(place["place_id"])
                            
                            stations.append({
                                "place_id": place["place_id"],
                                "name": place.get("name"),
                                "address": place.get("vicinity"),
                                "location": place["geometry"]["location"],
                                "rating": place.get("rating"),
                                "price": price_info.get("price"),
                                "price_last_updated": price_info.get("last_updated"),
                                "distance_meters": place.get("distance")
                            })
                        return stations
                    else:
                        logger.warning(f"Places API failed: {data.get('status')}")
                        return []
        except Exception as e:
            logger.error(f"Gas stations search error: {e}")
            return []
    
    async def get_gas_station_price(self, place_id: str) -> Dict:
        """
        Get fuel price from gas station (if available via Price API or scraping)
        Note: Google Places API doesn't directly provide fuel prices.
        Alternative: Integrate with GasBuddy API or similar.
        """
        # Fallback: return None - prices need external API
        # For now, return an estimate based on regional average
        return {
            "price": None,
            "last_updated": None,
            "source": "estimate"
        }
    
    async def calculate_fuel_cost_for_route(
        self,
        origin: str,
        destination: str,
        vehicle_mpg: float = DEFAULT_MPG,
        fuel_price_per_gallon: float = FUEL_PRICE_FALLBACK
    ) -> Optional[Dict]:
        """
        Calculate fuel cost for a route based on distance and vehicle efficiency
        """
        route = await self.calculate_route_distance(origin, destination)
        
        if not route:
            return None
        
        distance_miles = route["distance_miles"]
        
        # Calculate gallons needed
        gallons_needed = distance_miles / vehicle_mpg if vehicle_mpg > 0 else 0
        
        # Calculate fuel cost
        fuel_cost = gallons_needed * fuel_price_per_gallon
        
        return {
            "distance_miles": distance_miles,
            "distance_text": route["distance_text"],
            "duration_minutes": route["duration_minutes"],
            "duration_text": route["duration_text"],
            "vehicle_mpg": vehicle_mpg,
            "gallons_needed": round(gallons_needed, 2),
            "fuel_price_per_gallon": fuel_price_per_gallon,
            "estimated_fuel_cost": round(fuel_cost, 2)
        }


# Singleton instance
_google_maps_service = None

def get_google_maps_service() -> GoogleMapsService:
    global _google_maps_service
    if _google_maps_service is None:
        _google_maps_service = GoogleMapsService()
    return _google_maps_service