"""
Iteration 51: Test logistics endpoints after delivery_config.py module creation.
Verifies the P0 fix - that /api/logistics/* endpoints no longer 404.
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://route-optimize-fresh.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = "owner@frimexllc.com"
ADMIN_PASSWORD = "admin123"


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
                      timeout=15)
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    data = r.json()
    assert "access_token" in data
    return data["access_token"]


@pytest.fixture(scope="module")
def auth_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


# -------- Logistics Settings --------
class TestLogisticsSettings:
    def test_get_settings_returns_config(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/logistics/settings", headers=auth_headers, timeout=15)
        assert r.status_code == 200, f"Unexpected: {r.status_code} {r.text}"
        data = r.json()
        # Required fields per problem statement
        assert "vehicle_mpg" in data
        assert "fuel_price_per_gallon" in data
        assert "store_coords" in data
        assert "delivery_tiers" in data
        assert isinstance(data["delivery_tiers"], list)
        assert len(data["delivery_tiers"]) >= 1
        assert "lat" in data["store_coords"] and "lng" in data["store_coords"]
        # Check store coords approx Ventura
        assert abs(data["store_coords"]["lat"] - 34.264309) < 0.01
        assert abs(data["store_coords"]["lng"] - (-119.213742)) < 0.01

    def test_settings_requires_auth(self):
        r = requests.get(f"{BASE_URL}/api/logistics/settings", timeout=15)
        assert r.status_code in (401, 403)


# -------- Logistics Orders --------
class TestLogisticsOrders:
    def test_get_orders_returns_list(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/logistics/orders", headers=auth_headers, timeout=20)
        assert r.status_code == 200, f"Unexpected: {r.status_code} {r.text}"
        data = r.json()
        assert isinstance(data, list)
        # If non-empty, validate structure
        if data:
            o = data[0]
            assert "id" in o
            assert "location" in o
            assert "lat" in o["location"]
            assert "lng" in o["location"]


# -------- Gas Stations Prices (batch enrich) --------
class TestGasStationsPrices:
    def test_post_prices_returns_enriched(self, auth_headers):
        payload = [
            {"id": "s1", "name": "Shell", "lat": 34.27, "lng": -119.22},
            {"id": "s2", "name": "Chevron", "lat": 34.28, "lng": -119.21},
        ]
        r = requests.post(f"{BASE_URL}/api/logistics/gas-stations/prices",
                          headers=auth_headers, json=payload, timeout=15)
        assert r.status_code == 200, f"Unexpected: {r.status_code} {r.text}"
        data = r.json()
        assert "stations" in data
        assert isinstance(data["stations"], list)
        assert len(data["stations"]) == 2
        for s in data["stations"]:
            assert "price" in s
            assert "price_source" in s
            assert "currency" in s
            assert isinstance(s["price"], (int, float))
            assert s["price"] > 0

    def test_post_prices_empty_list(self, auth_headers):
        r = requests.post(f"{BASE_URL}/api/logistics/gas-stations/prices",
                          headers=auth_headers, json=[], timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert data["stations"] == []


# -------- Gas Stations Nearby --------
class TestGasStationsNearby:
    def test_get_nearby_returns_structure(self, auth_headers):
        params = {"lat": 34.264, "lng": -119.213, "radius_km": 5}
        r = requests.get(f"{BASE_URL}/api/logistics/gas-stations",
                         headers=auth_headers, params=params, timeout=20)
        assert r.status_code == 200, f"Unexpected: {r.status_code} {r.text}"
        data = r.json()
        assert "stations" in data
        assert "count" in data
        assert isinstance(data["stations"], list)
        # Without FUEL_API_KEY it returns empty list (per route logic). Either acceptable.

    def test_nearby_requires_auth(self):
        r = requests.get(f"{BASE_URL}/api/logistics/gas-stations",
                         params={"lat": 34.264, "lng": -119.213}, timeout=15)
        assert r.status_code in (401, 403)


# -------- delivery_config module import sanity --------
class TestDeliveryConfigImport:
    def test_module_imports(self):
        import sys
        sys.path.insert(0, "/app/backend")
        from delivery_config import (
            STORE_LAT, STORE_LNG, MAX_DELIVERY_MILES, DELIVERY_FEE_TIERS,
            haversine_miles, calculate_delivery_fee, get_delivery_info,
            geocode_address, calculate_driving_distance_async,
            calculate_batch_delivery_costs, optimize_route,
            METERS_PER_MILE, DEFAULT_FUEL_PRICE_PER_GALLON, DRIVER_HOURLY_RATE,
        )
        assert STORE_LAT == 34.264309
        assert STORE_LNG == -119.213742
        assert MAX_DELIVERY_MILES == 10.0
        assert calculate_delivery_fee(2.0) == 0.0
        assert calculate_delivery_fee(4.0) == 3.0
        assert calculate_delivery_fee(6.0) == 6.0
        d = haversine_miles(STORE_LAT, STORE_LNG, STORE_LAT, STORE_LNG)
        assert d == 0.0
