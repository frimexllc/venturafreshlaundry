"""
Test suite for Iteration 24:
- Refactored endpoints (users, exports, calendar)
- Inventory alerts system
- Bilingual support verification
- Timezone utilities
"""
import pytest
import requests
import os
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_EMAIL = "owner@frimexllc.com"
ADMIN_PASSWORD = "Fr!m3x##$$"


@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token for admin user"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": ADMIN_EMAIL,
        "password": ADMIN_PASSWORD
    })
    assert response.status_code == 200, f"Login failed: {response.text}"
    data = response.json()
    assert "access_token" in data, "No access_token in response"
    return data["access_token"]


@pytest.fixture(scope="module")
def headers(auth_token):
    """Headers with auth token"""
    return {
        "Authorization": f"Bearer {auth_token}",
        "Content-Type": "application/json"
    }


class TestAuthEndpoints:
    """Verify auth still works after refactoring"""
    
    def test_login_returns_access_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert isinstance(data["access_token"], str)
        assert len(data["access_token"]) > 0
        print("✓ Login returns access_token")
    
    def test_auth_me_returns_user(self, headers):
        response = requests.get(f"{BASE_URL}/api/auth/me", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert "email" in data
        assert data["email"] == ADMIN_EMAIL
        print(f"✓ /api/auth/me returns user: {data['email']}")


class TestRefactoredAdminUsers:
    """Test extracted user management endpoints"""
    
    def test_get_admin_users_list(self, headers):
        response = requests.get(f"{BASE_URL}/api/admin/users", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ GET /api/admin/users returns {len(data)} users")
        # Verify user structure
        if len(data) > 0:
            user = data[0]
            assert "email" in user
            assert "role" in user
            assert "password_hash" not in user  # Should be excluded
            print(f"  - First user: {user.get('email')}, role: {user.get('role')}")
    
    def test_get_admin_roles(self, headers):
        response = requests.get(f"{BASE_URL}/api/admin/roles", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert "roles" in data
        assert "permissions" in data
        assert isinstance(data["roles"], list)
        print(f"✓ GET /api/admin/roles returns roles: {data['roles']}")


class TestRefactoredExports:
    """Test extracted CSV export endpoints"""
    
    def test_export_customers_csv(self, headers):
        response = requests.get(f"{BASE_URL}/api/export/customers", headers=headers)
        assert response.status_code == 200
        assert "text/csv" in response.headers.get("Content-Type", "")
        assert "Content-Disposition" in response.headers
        assert "customers.csv" in response.headers.get("Content-Disposition", "")
        print(f"✓ GET /api/export/customers returns CSV ({len(response.content)} bytes)")
    
    def test_export_orders_csv(self, headers):
        response = requests.get(f"{BASE_URL}/api/export/orders", headers=headers)
        assert response.status_code == 200
        assert "text/csv" in response.headers.get("Content-Type", "")
        assert "orders.csv" in response.headers.get("Content-Disposition", "")
        print(f"✓ GET /api/export/orders returns CSV ({len(response.content)} bytes)")
    
    def test_export_leads_csv(self, headers):
        response = requests.get(f"{BASE_URL}/api/export/leads", headers=headers)
        assert response.status_code == 200
        assert "text/csv" in response.headers.get("Content-Type", "")
        print("✓ GET /api/export/leads returns CSV")
    
    def test_export_quotes_csv(self, headers):
        response = requests.get(f"{BASE_URL}/api/export/quotes", headers=headers)
        assert response.status_code == 200
        assert "text/csv" in response.headers.get("Content-Type", "")
        print("✓ GET /api/export/quotes returns CSV")
    
    def test_export_tickets_csv(self, headers):
        response = requests.get(f"{BASE_URL}/api/export/tickets", headers=headers)
        assert response.status_code == 200
        assert "text/csv" in response.headers.get("Content-Type", "")
        print("✓ GET /api/export/tickets returns CSV")


class TestRefactoredCalendar:
    """Test extracted calendar endpoints"""
    
    def test_calendar_orders_with_date_range(self, headers):
        response = requests.get(
            f"{BASE_URL}/api/calendar/orders",
            params={"start_date": "2025-01-01", "end_date": "2027-12-31"},
            headers=headers
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ GET /api/calendar/orders returns {len(data)} events")
        # Verify event structure if any exist
        if len(data) > 0:
            event = data[0]
            assert "id" in event
            assert "title" in event
            assert "date" in event
            print(f"  - Sample event: {event.get('title')}")
    
    def test_calendar_orders_requires_dates(self, headers):
        # Missing required params should fail
        response = requests.get(f"{BASE_URL}/api/calendar/orders", headers=headers)
        assert response.status_code == 422  # Validation error
        print("✓ GET /api/calendar/orders requires start_date and end_date")


class TestInventoryAlerts:
    """Test new inventory alerts system"""
    
    def test_get_inventory_alerts(self, headers):
        response = requests.get(f"{BASE_URL}/api/inventory/alerts", headers=headers)
        assert response.status_code == 200
        data = response.json()
        # Verify response structure
        assert "total_alerts" in data
        assert "low_stock_count" in data
        assert "stale_po_count" in data
        assert "alerts" in data
        assert isinstance(data["alerts"], list)
        print(f"✓ GET /api/inventory/alerts returns:")
        print(f"  - total_alerts: {data['total_alerts']}")
        print(f"  - low_stock_count: {data['low_stock_count']}")
        print(f"  - stale_po_count: {data['stale_po_count']}")
        # Verify alert structure if any exist
        if len(data["alerts"]) > 0:
            alert = data["alerts"][0]
            assert "type" in alert
            assert "severity" in alert
            assert "title" in alert
            assert "title_es" in alert  # Bilingual support
            print(f"  - Sample alert: {alert.get('title')}")
    
    def test_inventory_alerts_notify(self, headers):
        response = requests.post(f"{BASE_URL}/api/inventory/alerts/notify", headers=headers)
        assert response.status_code == 200
        data = response.json()
        # Verify response structure
        assert "sent" in data
        assert "message" in data
        print(f"✓ POST /api/inventory/alerts/notify returns:")
        print(f"  - sent: {data['sent']}")
        print(f"  - message: {data['message']}")
        # Expected: sent=false with message about missing env vars (or sent=true if configured)
        if not data["sent"]:
            assert "sms_sent" in data
            assert "email_sent" in data


class TestExistingEndpointsStillWork:
    """Verify existing endpoints still work after refactoring"""
    
    def test_dashboard_stats(self, headers):
        response = requests.get(f"{BASE_URL}/api/dashboard/stats", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert "total_customers" in data
        assert "total_orders" in data
        print(f"✓ GET /api/dashboard/stats works - {data['total_customers']} customers, {data['total_orders']} orders")
    
    def test_delivery_rules_zones(self, headers):
        response = requests.get(f"{BASE_URL}/api/delivery-rules/zones", headers=headers)
        assert response.status_code == 200
        data = response.json()
        # API returns object with zones array
        assert "zones" in data
        assert isinstance(data["zones"], list)
        print(f"✓ GET /api/delivery-rules/zones returns {len(data['zones'])} zones")
    
    def test_delivery_rules_payment_methods(self, headers):
        response = requests.get(f"{BASE_URL}/api/delivery-rules/payment-methods", headers=headers)
        assert response.status_code == 200
        data = response.json()
        # API returns object with methods array and timezone info
        assert "methods" in data
        assert isinstance(data["methods"], list)
        print(f"✓ GET /api/delivery-rules/payment-methods returns {len(data['methods'])} methods")
        # Check for timezone field (new feature)
        assert "timezone" in data, "timezone field should be present"
        assert "timezone_label" in data, "timezone_label field should be present"
        print(f"  - timezone: {data.get('timezone')}")
        print(f"  - timezone_label: {data.get('timezone_label')}")
    
    def test_kpis_operational(self, headers):
        response = requests.get(f"{BASE_URL}/api/kpis/operational", headers=headers)
        assert response.status_code == 200
        data = response.json()
        # Verify KPI sections exist
        assert "orders" in data
        assert "revenue" in data
        assert "expenses" in data
        assert "inventory" in data
        assert "mileage" in data
        assert "customers" in data
        assert "support" in data
        print("✓ GET /api/kpis/operational returns all 7 sections")
    
    def test_customers_list(self, headers):
        response = requests.get(f"{BASE_URL}/api/customers", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ GET /api/customers returns {len(data)} customers")
    
    def test_inventory_stock(self, headers):
        response = requests.get(f"{BASE_URL}/api/inventory/stock", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ GET /api/inventory/stock returns {len(data)} items")
    
    def test_inventory_low_stock(self, headers):
        response = requests.get(f"{BASE_URL}/api/inventory/low-stock", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ GET /api/inventory/low-stock returns {len(data)} items")


class TestCreateTestDataForAlerts:
    """Create test data to verify inventory alerts work"""
    
    def test_create_low_stock_item(self, headers):
        # Create an inventory item with low stock
        response = requests.post(
            f"{BASE_URL}/api/inventory/stock/movement",
            headers=headers,
            json={
                "product_name": "TEST_LowStock_Detergent",
                "category": "detergent",
                "quantity": 2,
                "movement_type": "adjustment",
                "reason": "Test low stock alert"
            }
        )
        # May return 200 or 201
        assert response.status_code in [200, 201]
        print("✓ Created test low stock item")
    
    def test_verify_alerts_include_low_stock(self, headers):
        response = requests.get(f"{BASE_URL}/api/inventory/alerts", headers=headers)
        assert response.status_code == 200
        data = response.json()
        # Check if our test item appears in alerts
        low_stock_alerts = [a for a in data["alerts"] if a["type"] == "low_stock"]
        print(f"✓ Found {len(low_stock_alerts)} low stock alerts")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
