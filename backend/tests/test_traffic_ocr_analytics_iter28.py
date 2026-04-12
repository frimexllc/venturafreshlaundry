"""
Iteration 28 Tests: TomTom Traffic API + OCR Analytics Dashboard
Tests the two new features:
1. Real-time TomTom Traffic API integration (/api/traffic/incidents)
2. OCR Analytics Dashboard (/api/files/ocr-analytics)
"""
import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_EMAIL = os.environ.get("TEST_ADMIN_EMAIL", "owner@frimexllc.com")
ADMIN_PASSWORD = os.environ.get("TEST_ADMIN_PASSWORD", "admin123")


class TestHealthAndAuth:
    """Basic health and authentication tests"""
    
    def test_health_check(self):
        """GET /api/health should return status ok"""
        response = requests.get(f"{BASE_URL}/api/health", timeout=10)
        assert response.status_code == 200, f"Health check failed: {response.text}"
        data = response.json()
        assert data.get("status") == "ok", f"Unexpected health status: {data}"
        print(f"✓ Health check passed: {data}")
    
    def test_admin_login(self):
        """POST /api/auth/login should return access_token for admin"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
            timeout=10
        )
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "access_token" in data, f"No access_token in response: {data}"
        print(f"✓ Admin login successful, token received")
        return data["access_token"]


@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token for tests"""
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=10
    )
    if response.status_code != 200:
        pytest.skip(f"Authentication failed: {response.text}")
    return response.json()["access_token"]


@pytest.fixture
def auth_headers(auth_token):
    """Headers with auth token"""
    return {
        "Authorization": f"Bearer {auth_token}",
        "Content-Type": "application/json"
    }


class TestTomTomTrafficAPI:
    """Tests for the TomTom Traffic Incidents endpoint"""
    
    def test_traffic_incidents_returns_200(self, auth_headers):
        """GET /api/traffic/incidents should return 200"""
        response = requests.get(
            f"{BASE_URL}/api/traffic/incidents",
            headers=auth_headers,
            timeout=20
        )
        assert response.status_code == 200, f"Traffic incidents failed: {response.text}"
        print(f"✓ Traffic incidents endpoint returned 200")
    
    def test_traffic_incidents_structure(self, auth_headers):
        """Traffic response should have events array, source='tomtom', cached boolean"""
        response = requests.get(
            f"{BASE_URL}/api/traffic/incidents",
            headers=auth_headers,
            timeout=20
        )
        assert response.status_code == 200
        data = response.json()
        
        # Check required fields
        assert "events" in data, f"Missing 'events' field: {data}"
        assert "source" in data, f"Missing 'source' field: {data}"
        assert "cached" in data, f"Missing 'cached' field: {data}"
        
        # Validate types
        assert isinstance(data["events"], list), f"events should be a list: {type(data['events'])}"
        assert data["source"] == "tomtom", f"source should be 'tomtom': {data['source']}"
        assert isinstance(data["cached"], bool), f"cached should be boolean: {type(data['cached'])}"
        
        print(f"✓ Traffic response structure valid: {len(data['events'])} events, source={data['source']}, cached={data['cached']}")
    
    def test_traffic_event_format(self, auth_headers):
        """If events exist, they should have correct format"""
        response = requests.get(
            f"{BASE_URL}/api/traffic/incidents",
            headers=auth_headers,
            timeout=20
        )
        assert response.status_code == 200
        data = response.json()
        
        events = data.get("events", [])
        if len(events) == 0:
            print("✓ No traffic events currently (this is valid - area may be clear)")
            return
        
        # Check first event structure
        event = events[0]
        required_fields = ["id", "road", "description", "lat", "lng", "severity", "delayMinutes", "source"]
        for field in required_fields:
            assert field in event, f"Event missing '{field}': {event}"
        
        # Validate severity values
        valid_severities = ["light", "moderate", "heavy"]
        assert event["severity"] in valid_severities, f"Invalid severity: {event['severity']}"
        
        # Validate source
        assert event["source"] == "tomtom", f"Event source should be 'tomtom': {event['source']}"
        
        # Validate coordinates are numbers
        assert isinstance(event["lat"], (int, float)), f"lat should be number: {type(event['lat'])}"
        assert isinstance(event["lng"], (int, float)), f"lng should be number: {type(event['lng'])}"
        
        # Validate delayMinutes is positive integer
        assert isinstance(event["delayMinutes"], int), f"delayMinutes should be int: {type(event['delayMinutes'])}"
        assert event["delayMinutes"] >= 1, f"delayMinutes should be >= 1: {event['delayMinutes']}"
        
        print(f"✓ Traffic event format valid: {event['road']} - {event['severity']} - +{event['delayMinutes']}min")
    
    def test_traffic_cache_works(self, auth_headers):
        """Second call within 5 minutes should return cached=true"""
        # First call
        response1 = requests.get(
            f"{BASE_URL}/api/traffic/incidents",
            headers=auth_headers,
            timeout=20
        )
        assert response1.status_code == 200
        data1 = response1.json()
        
        # Small delay
        time.sleep(1)
        
        # Second call should be cached
        response2 = requests.get(
            f"{BASE_URL}/api/traffic/incidents",
            headers=auth_headers,
            timeout=20
        )
        assert response2.status_code == 200
        data2 = response2.json()
        
        # Second call should return cached=true
        assert data2["cached"] == True, f"Second call should be cached: {data2['cached']}"
        print(f"✓ Traffic cache working: first call cached={data1['cached']}, second call cached={data2['cached']}")
    
    def test_traffic_requires_auth(self):
        """Traffic endpoint should require authentication"""
        response = requests.get(
            f"{BASE_URL}/api/traffic/incidents",
            timeout=10
        )
        assert response.status_code in [401, 403], f"Should require auth: {response.status_code}"
        print(f"✓ Traffic endpoint requires authentication (status {response.status_code})")


class TestOCRAnalyticsAPI:
    """Tests for the OCR Analytics endpoint"""
    
    def test_ocr_analytics_returns_200(self, auth_headers):
        """GET /api/files/ocr-analytics should return 200"""
        response = requests.get(
            f"{BASE_URL}/api/files/ocr-analytics",
            headers=auth_headers,
            timeout=10
        )
        assert response.status_code == 200, f"OCR analytics failed: {response.text}"
        print(f"✓ OCR analytics endpoint returned 200")
    
    def test_ocr_analytics_structure(self, auth_headers):
        """OCR analytics should have all required fields"""
        response = requests.get(
            f"{BASE_URL}/api/files/ocr-analytics",
            headers=auth_headers,
            timeout=10
        )
        assert response.status_code == 200
        data = response.json()
        
        # Check required top-level fields
        required_fields = [
            "total_scans", "successful", "failed", "success_rate",
            "field_rates", "total_amount_captured", "recent_scans", "top_vendors"
        ]
        for field in required_fields:
            assert field in data, f"Missing '{field}' in OCR analytics: {data.keys()}"
        
        # Validate types
        assert isinstance(data["total_scans"], int), f"total_scans should be int"
        assert isinstance(data["successful"], int), f"successful should be int"
        assert isinstance(data["failed"], int), f"failed should be int"
        assert isinstance(data["success_rate"], (int, float)), f"success_rate should be number"
        assert isinstance(data["field_rates"], dict), f"field_rates should be dict"
        assert isinstance(data["total_amount_captured"], (int, float)), f"total_amount_captured should be number"
        assert isinstance(data["recent_scans"], list), f"recent_scans should be list"
        assert isinstance(data["top_vendors"], list), f"top_vendors should be list"
        
        print(f"✓ OCR analytics structure valid: {data['total_scans']} total scans, {data['success_rate']}% success rate")
    
    def test_ocr_analytics_field_rates(self, auth_headers):
        """field_rates should have amount, vendor, date percentages"""
        response = requests.get(
            f"{BASE_URL}/api/files/ocr-analytics",
            headers=auth_headers,
            timeout=10
        )
        assert response.status_code == 200
        data = response.json()
        
        field_rates = data.get("field_rates", {})
        required_rate_fields = ["amount", "vendor", "date"]
        for field in required_rate_fields:
            assert field in field_rates, f"Missing '{field}' in field_rates: {field_rates}"
            assert isinstance(field_rates[field], (int, float)), f"{field} rate should be number"
            assert 0 <= field_rates[field] <= 100, f"{field} rate should be 0-100: {field_rates[field]}"
        
        print(f"✓ Field rates valid: amount={field_rates['amount']}%, vendor={field_rates['vendor']}%, date={field_rates['date']}%")
    
    def test_ocr_analytics_empty_data_valid(self, auth_headers):
        """OCR analytics with 0 scans should still return valid structure"""
        response = requests.get(
            f"{BASE_URL}/api/files/ocr-analytics",
            headers=auth_headers,
            timeout=10
        )
        assert response.status_code == 200
        data = response.json()
        
        # Even with 0 scans, structure should be valid
        if data["total_scans"] == 0:
            assert data["successful"] == 0
            assert data["failed"] == 0
            assert data["success_rate"] == 0
            assert data["total_amount_captured"] == 0
            assert len(data["recent_scans"]) == 0
            assert len(data["top_vendors"]) == 0
            print(f"✓ OCR analytics with 0 scans returns valid empty structure")
        else:
            print(f"✓ OCR analytics has {data['total_scans']} scans - data exists")
    
    def test_ocr_analytics_requires_auth(self):
        """OCR analytics endpoint should require authentication"""
        response = requests.get(
            f"{BASE_URL}/api/files/ocr-analytics",
            timeout=10
        )
        assert response.status_code in [401, 403], f"Should require auth: {response.status_code}"
        print(f"✓ OCR analytics endpoint requires authentication (status {response.status_code})")


class TestDashboardAndExistingEndpoints:
    """Verify existing endpoints still work"""
    
    def test_dashboard_loads(self, auth_headers):
        """GET /api/dashboard/stats should still work"""
        response = requests.get(
            f"{BASE_URL}/api/dashboard/stats",
            headers=auth_headers,
            timeout=10
        )
        assert response.status_code == 200, f"Dashboard stats failed: {response.text}"
        print(f"✓ Dashboard stats endpoint working")
    
    def test_orders_endpoint(self, auth_headers):
        """GET /api/orders should still work"""
        response = requests.get(
            f"{BASE_URL}/api/orders",
            headers=auth_headers,
            timeout=10
        )
        assert response.status_code == 200, f"Orders endpoint failed: {response.text}"
        print(f"✓ Orders endpoint working")
    
    def test_customers_endpoint(self, auth_headers):
        """GET /api/customers should still work"""
        response = requests.get(
            f"{BASE_URL}/api/customers",
            headers=auth_headers,
            timeout=10
        )
        assert response.status_code == 200, f"Customers endpoint failed: {response.text}"
        print(f"✓ Customers endpoint working")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
