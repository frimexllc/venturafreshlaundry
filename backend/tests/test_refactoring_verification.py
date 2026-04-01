"""
Test suite to verify the refactoring didn't break core functionality.
Tests: Health check, Auth, Dashboard, AI endpoints, Services, Orders, Customers.
"""
import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
if not BASE_URL:

# Test credentials
ADMIN_EMAIL = os.environ.get("TEST_ADMIN_EMAIL", "owner@frimexllc.com")
ADMIN_PASSWORD = os.environ.get("TEST_ADMIN_PASSWORD", "admin123")


class TestHealthCheck:
    """Verify health endpoint responds instantly (P0 fix verification)"""
    
    def test_health_endpoint_responds(self):
        """GET /api/health should respond with status ok"""
        start_time = time.time()
        response = requests.get(f"{BASE_URL}/api/health", timeout=5)
        elapsed = time.time() - start_time
        
        assert response.status_code == 200, f"Health check failed: {response.text}"
        data = response.json()
        assert data.get("status") == "ok", f"Unexpected health response: {data}"
        print(f"Health check passed in {elapsed:.3f}s")


class TestAuthentication:
    """Verify auth endpoints work after refactoring"""
    
    def test_login_with_admin_credentials(self):
        """POST /api/auth/login with admin credentials"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
            timeout=10
        )
        
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "access_token" in data, "Missing access_token in response"
        assert "user" in data, "Missing user in response"
        assert data["user"]["email"] == ADMIN_EMAIL, "Email mismatch"
        assert data["user"]["role"] == "admin", "Expected admin role"
        print(f"Login successful for {ADMIN_EMAIL}")
    
    def test_login_with_invalid_credentials(self):
        """POST /api/auth/login with wrong password should return 401"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": ADMIN_EMAIL, "password": "wrongpassword"},
            timeout=10
        )
        
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("Invalid credentials correctly rejected")


@pytest.fixture(scope="class")
def auth_token():
    """Get auth token for authenticated tests"""
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=10
    )
    if response.status_code == 200:
        return response.json().get("access_token")
    pytest.skip("Authentication failed - skipping authenticated tests")


class TestDashboard:
    """Verify dashboard endpoints work after refactoring"""
    
    def test_dashboard_stats(self, auth_token):
        """GET /api/dashboard/stats returns valid dashboard data"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(
            f"{BASE_URL}/api/dashboard/stats",
            headers=headers,
            timeout=10
        )
        
        assert response.status_code == 200, f"Dashboard stats failed: {response.text}"
        data = response.json()
        
        # Verify all expected fields are present
        expected_fields = [
            "total_customers", "total_orders", "pending_orders",
            "open_tickets", "active_quotes", "new_leads",
            "orders_today", "revenue_this_month"
        ]
        for field in expected_fields:
            assert field in data, f"Missing field: {field}"
        
        print(f"Dashboard stats: {data['total_customers']} customers, {data['total_orders']} orders")


class TestAIEndpoints:
    """Verify AI endpoints work after refactoring"""
    
    def test_ai_metrics(self, auth_token):
        """GET /api/ai/metrics returns AI metrics data"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(
            f"{BASE_URL}/api/ai/metrics",
            headers=headers,
            timeout=10
        )
        
        assert response.status_code == 200, f"AI metrics failed: {response.text}"
        data = response.json()
        
        # Verify expected fields
        expected_fields = [
            "total_interactions", "total_sessions", "executed_commands",
            "critical_actions_requested", "success_rate"
        ]
        for field in expected_fields:
            assert field in data, f"Missing field: {field}"
        
        print(f"AI metrics: {data['total_interactions']} interactions, {data['success_rate']}% success rate")
    
    def test_ai_pending_actions(self, auth_token):
        """GET /api/ai/pending-actions returns pending actions array"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(
            f"{BASE_URL}/api/ai/pending-actions",
            headers=headers,
            timeout=10
        )
        
        assert response.status_code == 200, f"AI pending actions failed: {response.text}"
        data = response.json()
        
        # Should return a list (may be empty)
        assert "pending_actions" in data, "Missing pending_actions field"
        assert isinstance(data["pending_actions"], list), "pending_actions should be a list"
        print(f"AI pending actions: {len(data['pending_actions'])} pending")


class TestServices:
    """Verify services endpoints work after refactoring"""
    
    def test_get_services(self, auth_token):
        """GET /api/services returns services array"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(
            f"{BASE_URL}/api/services",
            headers=headers,
            timeout=10
        )
        
        assert response.status_code == 200, f"Get services failed: {response.text}"
        data = response.json()
        
        assert isinstance(data, list), "Services should be a list"
        print(f"Services: {len(data)} services found")
        
        # Verify service structure if any exist
        if data:
            service = data[0]
            assert "id" in service, "Service missing id"
            assert "name" in service, "Service missing name"
    
    def test_get_public_services(self):
        """GET /api/public/services returns services without auth"""
        response = requests.get(
            f"{BASE_URL}/api/public/services",
            timeout=10
        )
        
        assert response.status_code == 200, f"Public services failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Public services should be a list"
        print(f"Public services: {len(data)} services found")


class TestCustomers:
    """Verify customers endpoints work after refactoring"""
    
    def test_get_customers(self, auth_token):
        """GET /api/customers returns customers list"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(
            f"{BASE_URL}/api/customers",
            headers=headers,
            timeout=10
        )
        
        assert response.status_code == 200, f"Get customers failed: {response.text}"
        data = response.json()
        
        assert isinstance(data, list), "Customers should be a list"
        print(f"Customers: {len(data)} customers found")
        
        # Verify customer structure if any exist
        if data:
            customer = data[0]
            assert "id" in customer, "Customer missing id"
            assert "name" in customer, "Customer missing name"


class TestOrders:
    """Verify orders endpoints work after refactoring"""
    
    def test_get_orders(self, auth_token):
        """GET /api/orders returns orders list"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(
            f"{BASE_URL}/api/orders",
            headers=headers,
            timeout=10
        )
        
        assert response.status_code == 200, f"Get orders failed: {response.text}"
        data = response.json()
        
        assert isinstance(data, list), "Orders should be a list"
        print(f"Orders: {len(data)} orders found")
        
        # Verify order structure if any exist
        if data:
            order = data[0]
            assert "id" in order, "Order missing id"
            assert "status" in order, "Order missing status"
    
    def test_create_order_requires_customer(self, auth_token):
        """POST /api/orders with invalid customer_id should fail"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.post(
            f"{BASE_URL}/api/orders",
            headers=headers,
            json={
                "customer_id": "nonexistent-customer-id",
                "service_type": "pickup_delivery"
            },
            timeout=10
        )
        
        # Should return 404 for nonexistent customer
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("Order creation correctly validates customer existence")


class TestSharedModulesIntegration:
    """Verify shared modules (database.py, models.py, auth.py, utils.py) work correctly"""
    
    def test_auth_me_endpoint(self, auth_token):
        """GET /api/auth/me verifies auth module integration"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(
            f"{BASE_URL}/api/auth/me",
            headers=headers,
            timeout=10
        )
        
        assert response.status_code == 200, f"Auth me failed: {response.text}"
        data = response.json()
        
        assert data["email"] == ADMIN_EMAIL, "Email mismatch"
        assert data["role"] == "admin", "Role mismatch"
        print(f"Auth me: {data['name']} ({data['role']})")
    
    def test_dashboard_recent_activity(self, auth_token):
        """GET /api/dashboard/recent-activity verifies audit log integration"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(
            f"{BASE_URL}/api/dashboard/recent-activity",
            headers=headers,
            timeout=10
        )
        
        assert response.status_code == 200, f"Recent activity failed: {response.text}"
        data = response.json()
        
        assert isinstance(data, list), "Recent activity should be a list"
        print(f"Recent activity: {len(data)} entries")


class TestPublicEndpoints:
    """Verify public endpoints work without authentication"""
    
    def test_public_membership_plans(self):
        """GET /api/public/membership-plans works without auth"""
        response = requests.get(
            f"{BASE_URL}/api/public/membership-plans",
            timeout=10
        )
        
        assert response.status_code == 200, f"Public membership plans failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Membership plans should be a list"
        print(f"Public membership plans: {len(data)} plans")
    
    def test_public_membership_section(self):
        """GET /api/public/membership-section works without auth"""
        response = requests.get(
            f"{BASE_URL}/api/public/membership-section",
            timeout=10
        )
        
        assert response.status_code == 200, f"Public membership section failed: {response.text}"
        data = response.json()
        assert "heading" in data, "Missing heading field"
        print(f"Public membership section: {data.get('heading', 'N/A')}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
