"""
Phase 3 Features Test Suite - Iteration 41
Tests for:
1. Delivery Zone Rules with OpenRouteService distance API
2. Logistics Map Filters (date picker + morning/afternoon)
3. PWA Service Worker and Manifest
4. Backend health endpoint
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestDeliveryZoneRules:
    """Test delivery zone distance API with OpenRouteService integration"""
    
    def test_distance_close_location_free_delivery(self):
        """Test location < 3 miles returns free delivery"""
        # Coordinates close to store (34.283, -119.293)
        response = requests.get(f"{BASE_URL}/api/geocode/distance", params={
            "lat": 34.28,
            "lng": -119.28
        })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "distance_miles" in data
        assert "delivery_fee" in data
        assert "allowed" in data
        
        # Should be < 3 miles and free
        assert data["distance_miles"] < 3, f"Expected < 3 miles, got {data['distance_miles']}"
        assert data["delivery_fee"] == 0.0, f"Expected free delivery, got {data['delivery_fee']}"
        assert data["allowed"] == True
        assert data.get("label") == "Free delivery"
        print(f"✓ Close location: {data['distance_miles']} miles, fee: ${data['delivery_fee']}, allowed: {data['allowed']}")
    
    def test_distance_medium_location_fee_delivery(self):
        """Test location 3-10 miles returns $2.99 delivery fee"""
        # Coordinates ~5-6 miles from store
        response = requests.get(f"{BASE_URL}/api/geocode/distance", params={
            "lat": 34.25,
            "lng": -119.23
        })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "distance_miles" in data
        assert "delivery_fee" in data
        assert "allowed" in data
        
        # Should be 3-10 miles with $2.99 fee
        assert 3 <= data["distance_miles"] <= 10, f"Expected 3-10 miles, got {data['distance_miles']}"
        assert data["delivery_fee"] == 2.99, f"Expected $2.99 fee, got {data['delivery_fee']}"
        assert data["allowed"] == True
        assert data.get("label") == "$2.99 delivery fee"
        print(f"✓ Medium location: {data['distance_miles']} miles, fee: ${data['delivery_fee']}, allowed: {data['allowed']}")
    
    def test_distance_far_location_not_allowed(self):
        """Test location > 10 miles returns not allowed"""
        # Coordinates far from store (>10 miles)
        response = requests.get(f"{BASE_URL}/api/geocode/distance", params={
            "lat": 34.15,
            "lng": -119.18
        })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "distance_miles" in data
        assert "allowed" in data
        
        # Should be > 10 miles and not allowed
        assert data["distance_miles"] > 10, f"Expected > 10 miles, got {data['distance_miles']}"
        assert data["allowed"] == False
        assert data.get("delivery_fee") is None
        assert "message" in data
        print(f"✓ Far location: {data['distance_miles']} miles, allowed: {data['allowed']}, message: {data.get('message')}")
    
    def test_distance_missing_params(self):
        """Test distance endpoint with missing parameters"""
        response = requests.get(f"{BASE_URL}/api/geocode/distance")
        # Should return 422 for missing required params
        assert response.status_code == 422, f"Expected 422 for missing params, got {response.status_code}"
        print("✓ Missing params returns 422 validation error")


class TestLogisticsMapFilters:
    """Test logistics orders endpoint with date and time_window filters"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token for authenticated requests"""
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "owner@frimexllc.com",
            "password": "admin123"
        })
        if login_response.status_code == 200:
            self.token = login_response.json().get("access_token")
            self.headers = {"Authorization": f"Bearer {self.token}"}
        else:
            pytest.skip("Authentication failed - skipping logistics tests")
    
    def test_logistics_orders_no_filter(self):
        """Test logistics orders endpoint without filters"""
        response = requests.get(f"{BASE_URL}/api/logistics/orders", headers=self.headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert isinstance(data, list), "Expected list of orders"
        print(f"✓ Logistics orders (no filter): {len(data)} orders returned")
    
    def test_logistics_orders_date_filter(self):
        """Test logistics orders with date filter"""
        response = requests.get(f"{BASE_URL}/api/logistics/orders", 
                               params={"date": "2026-03-29"},
                               headers=self.headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert isinstance(data, list), "Expected list of orders"
        # Verify orders have the correct pickup_date
        for order in data[:5]:  # Check first 5
            schedule = order.get("schedule", {})
            pickup_date = schedule.get("pickupDate", "")
            if pickup_date:
                assert pickup_date == "2026-03-29", f"Expected date 2026-03-29, got {pickup_date}"
        print(f"✓ Logistics orders (date=2026-03-29): {len(data)} orders returned")
    
    def test_logistics_orders_morning_filter(self):
        """Test logistics orders with time_window=morning filter"""
        response = requests.get(f"{BASE_URL}/api/logistics/orders", 
                               params={"time_window": "morning"},
                               headers=self.headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert isinstance(data, list), "Expected list of orders"
        print(f"✓ Logistics orders (time_window=morning): {len(data)} orders returned")
    
    def test_logistics_orders_afternoon_filter(self):
        """Test logistics orders with time_window=afternoon filter"""
        response = requests.get(f"{BASE_URL}/api/logistics/orders", 
                               params={"time_window": "afternoon"},
                               headers=self.headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert isinstance(data, list), "Expected list of orders"
        print(f"✓ Logistics orders (time_window=afternoon): {len(data)} orders returned")
    
    def test_logistics_orders_combined_filters(self):
        """Test logistics orders with both date and time_window filters"""
        response = requests.get(f"{BASE_URL}/api/logistics/orders", 
                               params={"date": "2026-03-29", "time_window": "morning"},
                               headers=self.headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert isinstance(data, list), "Expected list of orders"
        print(f"✓ Logistics orders (date + morning): {len(data)} orders returned")


class TestPWAAssets:
    """Test PWA Service Worker and Manifest accessibility"""
    
    def test_service_worker_accessible(self):
        """Test /sw.js is accessible and returns valid JavaScript"""
        response = requests.get(f"{BASE_URL}/sw.js")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        content = response.text
        # Verify it's valid JavaScript with expected content
        assert "self.addEventListener" in content, "Service worker should have event listeners"
        assert "push" in content, "Service worker should handle push events"
        assert "notificationclick" in content, "Service worker should handle notification clicks"
        print("✓ Service Worker /sw.js is accessible and contains push notification handlers")
    
    def test_manifest_valid(self):
        """Test manifest.json is valid and references icons"""
        response = requests.get(f"{BASE_URL}/manifest.json")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "name" in data, "Manifest should have name"
        assert "icons" in data, "Manifest should have icons"
        assert isinstance(data["icons"], list), "Icons should be a list"
        assert len(data["icons"]) > 0, "Should have at least one icon"
        
        # Verify icon structure
        for icon in data["icons"]:
            assert "src" in icon, "Icon should have src"
            assert "sizes" in icon, "Icon should have sizes"
        
        print(f"✓ Manifest.json is valid: name='{data.get('name')}', {len(data['icons'])} icons")


class TestBackendHealth:
    """Test backend health endpoint"""
    
    def test_health_endpoint(self):
        """Test /api/health returns ok"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert data.get("status") == "ok", f"Expected status 'ok', got {data.get('status')}"
        print("✓ Backend health check: status=ok")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
