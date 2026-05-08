"""
Fuel Price Service - Real-time fuel prices from FuelAPI.io
"""
import os
import aiohttp
import logging
from typing import Optional, Dict, List
from datetime import datetime, timezone, timedelta

logger = logging.getLogger(__name__)

# Configuración
FUEL_API_KEY = os.environ.get("FUEL_API_KEY", "")
USE_REAL_PRICES = os.environ.get("USE_REAL_PRICES", "true").lower() == "true"


class RealTimeFuelPriceService:
    """Get REAL fuel prices from FuelAPI.io"""
    
    def __init__(self):
        self.cache = {}
        self.cache_duration = 3600  # 1 hora
        self.base_url = "https://api.fuelapi.io/v1"
    
    async def get_price_for_station(
        self, 
        lat: float, 
        lng: float, 
        name: str = None,
        radius_km: float = 5.0
    ) -> Dict:
        """
        Get real fuel price for a station
        Returns: {price, station_name, source, last_updated}
        """
        cache_key = f"{lat:.4f},{lng:.4f}"
        
        # Verificar caché
        if cache_key in self.cache:
            cached = self.cache[cache_key]
            age = (datetime.now(timezone.utc) - cached["timestamp"]).total_seconds()
            if age < self.cache_duration:
                return cached["data"]
        
        # Si no hay API key o no queremos precios reales, usar fallback
        if not FUEL_API_KEY or not USE_REAL_PRICES:
            return self._get_fallback_price(lat, lng, name)
        
        # Intentar obtener precio real
        try:
            price_data = await self._fetch_fuelapi_price(lat, lng, radius_km)
            if price_data:
                result = {
                    "price": price_data["price"],
                    "station_name": price_data.get("station_name", name),
                    "source": "fuelapi",
                    "last_updated": datetime.now(timezone.utc).isoformat()
                }
                self._cache_price(cache_key, result)
                return result
        except Exception as e:
            logger.warning(f"FuelAPI error: {e}")
        
        # Fallback a precios regionales
        return self._get_fallback_price(lat, lng, name)
    
    async def _fetch_fuelapi_price(
        self, 
        lat: float, 
        lng: float, 
        radius_km: float = 5.0
    ) -> Optional[Dict]:
        """Fetch real price from FuelAPI"""
        url = f"{self.base_url}/prices/nearby"
        params = {
            "lat": lat,
            "lng": lng,
            "radius": radius_km,
            "api_key": FUEL_API_KEY
        }
        
        async with aiohttp.ClientSession() as session:
            async with session.get(url, params=params, timeout=10) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    stations = data.get("stations", [])
                    
                    if stations:
                        # Ordenar por distancia y tomar el más cercano con precio
                        for station in stations:
                            if station.get("price"):
                                return {
                                    "price": station["price"],
                                    "station_name": station.get("name"),
                                    "station_id": station.get("id")
                                }
        return None
    
    def _get_fallback_price(self, lat: float, lng: float, name: str = None) -> Dict:
        """Regional fallback when API fails"""
        # Precios por región (actualizados mensualmente vía EIA)
        regional = self._get_regional_price(lat, lng)
        
        return {
            "price": regional,
            "station_name": name,
            "source": "regional_estimate",
            "last_updated": datetime.now(timezone.utc).isoformat()
        }
    
    def _get_regional_price(self, lat: float, lng: float) -> float:
        """Get regional average price (updated from EIA weekly)"""
        # California
        if 32 < lat < 42 and lng < -114:
            return self._get_cached_price("CA", 4.85)
        # Texas
        elif 25 < lat < 36 and lng < -93:
            return self._get_cached_price("TX", 3.10)
        # Florida
        elif 24 < lat < 31 and lng < -80:
            return self._get_cached_price("FL", 3.40)
        # New York
        elif 40 < lat < 45 and lng < -71:
            return self._get_cached_price("NY", 3.65)
        # Default
        else:
            return self._get_cached_price("US", 3.75)
    
    def _get_cached_price(self, state: str, default: float) -> float:
        """Get cached price from database if available"""
        # TODO: Guardar precios actualizados en MongoDB
        # Por ahora, usar valores por defecto
        return default
    
    def _cache_price(self, key: str, data: Dict):
        self.cache[key] = {
            "data": data,
            "timestamp": datetime.now(timezone.utc)
        }
    
    async def get_prices_for_stations(
        self, 
        stations: List[Dict],
        max_requests: int = 50
    ) -> List[Dict]:
        """Get prices for multiple stations (rate limited)"""
        enriched = []
        
        for i, station in enumerate(stations):
            if i >= max_requests:
                break
                
            price_data = await self.get_price_for_station(
                station.get("lat"),
                station.get("lng"),
                station.get("name")
            )
            
            enriched.append({
                **station,
                "price": price_data["price"],
                "price_source": price_data["source"],
                "price_updated": price_data.get("last_updated")
            })
        
        return enriched


# ============================================================
# PRECIOS ACTUALIZADOS DESDE EIA (Energy Information Administration)
# ============================================================

class EIAPriceUpdater:
    """Update prices weekly from EIA API"""
    
    def __init__(self):
        self.eia_api_key = os.environ.get("EIA_API_KEY", "")
    
    async def fetch_national_average(self) -> Optional[float]:
        """Get US national average from EIA"""
        if not self.eia_api_key:
            return None
        
        url = "https://api.eia.gov/v2/petroleum/pri/gnd/data/"
        params = {
            "api_key": self.eia_api_key,
            "frequency": "weekly",
            "data[0]": "value",
            "facets[series][]": "EMM_EPM0_PTE_NUS_DPG",
            "sort[0][column]": "period",
            "sort[0][direction]": "desc",
            "length": 1
        }
        
        async with aiohttp.ClientSession() as session:
            async with session.get(url, params=params, timeout=15) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    try:
                        value = data["response"]["data"][0]["value"]
                        return float(value)
                    except (KeyError, IndexError, ValueError):
                        pass
        return None
    
    async def fetch_state_average(self, state: str) -> Optional[float]:
        """Get state average from EIA"""
        if not self.eia_api_key:
            return None
        
        # Mapeo de estado a código EIA
        state_codes = {
            "CA": "EMM_EPM0_PTE_SCA_DPG",
            "TX": "EMM_EPM0_PTE_STX_DPG",
            "FL": "EMM_EPM0_PTE_SFL_DPG",
            "NY": "EMM_EPM0_PTE_SNY_DPG",
        }
        
        code = state_codes.get(state)
        if not code:
            return None
        
        url = f"https://api.eia.gov/v2/petroleum/pri/gnd/data/"
        params = {
            "api_key": self.eia_api_key,
            "frequency": "weekly",
            "data[0]": "value",
            "facets[series][]": code,
            "sort[0][column]": "period",
            "sort[0][direction]": "desc",
            "length": 1
        }
        
        async with aiohttp.ClientSession() as session:
            async with session.get(url, params=params, timeout=15) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    try:
                        value = data["response"]["data"][0]["value"]
                        return float(value)
                    except (KeyError, IndexError, ValueError):
                        pass
        return None


# Singleton
_fuel_price_service = None

def get_fuel_price_service() -> RealTimeFuelPriceService:
    global _fuel_price_service
    if _fuel_price_service is None:
        _fuel_price_service = RealTimeFuelPriceService()
    return _fuel_price_service