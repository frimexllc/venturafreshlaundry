"""
Iteration 40: Phase 2 Features Testing
- Backend health endpoint
- Order ticket endpoint (HTML)
- Operator dashboard API
- Store orders API
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestHealthEndpoint:
    """Test /api/health endpoint"""
    
    def test_health_returns_ok(self):
        """Backend health check should return ok status"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200, f"Health check failed: {response.status_code}"
        data = response.json()
        assert data.get("status") == "ok", f"Expected status 'ok', got: {data}"
        print("✓ Health endpoint returns ok")


class TestOperatorDashboard:
    """Test operator dashboard API"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get auth token"""
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "owner@frimexllc.com",
            "password": "admin123"
        })
        if login_response.status_code == 200:
            self.token = login_response.json().get("token")
            self.headers = {"Authorization": f"Bearer {self.token}"}
        else:
            pytest.skip("Could not authenticate - skipping operator tests")
    
    def test_operator_dashboard_loads(self):
        """Operator dashboard API should return data"""
        response = requests.get(f"{BASE_URL}/api/automation/operator-dashboard", headers=self.headers)
        assert response.status_code == 200, f"Dashboard failed: {response.status_code}"
        data = response.json()
        # Check expected fields exist
        assert "todays_pickups" in data or "stats" in data, f"Missing expected fields: {data.keys()}"
        print(f"✓ Operator dashboard returns data with keys: {list(data.keys())}")


class TestStoreOrders:
    """Test store orders API"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get auth token"""
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "owner@frimexllc.com",
            "password": "admin123"
        })
        if login_response.status_code == 200:
            self.token = login_response.json().get("token")
            self.headers = {"Authorization": f"Bearer {self.token}"}
        else:
            pytest.skip("Could not authenticate - skipping store tests")
    
    def test_store_orders_endpoint(self):
        """Store orders endpoint should return list"""
        response = requests.get(f"{BASE_URL}/api/store/orders", headers=self.headers)
        assert response.status_code == 200, f"Store orders failed: {response.status_code}"
        data = response.json()
        assert isinstance(data, list), f"Expected list, got: {type(data)}"
        print(f"✓ Store orders returns list with {len(data)} items")


class TestOrderTicket:
    """Test order ticket HTML endpoint"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get auth token, find an order to test"""
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "owner@frimexllc.com",
            "password": "admin123"
        })
        if login_response.status_code == 200:
            self.token = login_response.json().get("token")
            self.headers = {"Authorization": f"Bearer {self.token}"}
        else:
            pytest.skip("Could not authenticate - skipping ticket tests")
        
        # Get an order to test with
        orders_response = requests.get(f"{BASE_URL}/api/orders", headers=self.headers)
        if orders_response.status_code == 200:
            orders = orders_response.json()
            if isinstance(orders, dict) and "orders" in orders:
                orders = orders["orders"]
            if orders and len(orders) > 0:
                self.test_order_id = orders[0].get("id") or orders[0].get("order_id")
            else:
                self.test_order_id = None
        else:
            self.test_order_id = None
    
    def test_ticket_endpoint_returns_html(self):
        """GET /api/orders/{id}/ticket should return HTML"""
        if not self.test_order_id:
            pytest.skip("No orders available to test ticket endpoint")
        
        response = requests.get(f"{BASE_URL}/api/orders/{self.test_order_id}/ticket", headers=self.headers)
        assert response.status_code == 200, f"Ticket endpoint failed: {response.status_code}"
        
        content_type = response.headers.get("content-type", "")
        assert "text/html" in content_type, f"Expected HTML, got: {content_type}"
        
        html_content = response.text
        assert "<html" in html_content.lower() or "<!doctype" in html_content.lower() or "<div" in html_content.lower(), \
            f"Response doesn't look like HTML: {html_content[:200]}"
        
        # Check for expected content in ticket
        assert "VFL-" in html_content or "Ventura" in html_content, \
            f"Ticket missing expected content (order number or business name)"
        
        print(f"✓ Ticket endpoint returns valid HTML for order {self.test_order_id}")


class TestStoreProducts:
    """Test store products API for POS"""
    
    def test_store_products_endpoint(self):
        """Store products endpoint should return list"""
        response = requests.get(f"{BASE_URL}/api/store/products")
        assert response.status_code == 200, f"Store products failed: {response.status_code}"
        data = response.json()
        assert isinstance(data, list), f"Expected list, got: {type(data)}"
        print(f"✓ Store products returns list with {len(data)} items")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
