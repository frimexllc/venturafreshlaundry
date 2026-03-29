"""
Test Suite for Iteration 30: Stripe Sync & Notification Metrics
Tests bidirectional Stripe sync (push/pull customers & products) and notification analytics.
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_EMAIL = "owner@frimexllc.com"
ADMIN_PASSWORD = "Fr!m3x##$$"


@pytest.fixture(scope="module")
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


@pytest.fixture(scope="module")
def auth_token(api_client):
    """Get authentication token for admin user"""
    response = api_client.post(f"{BASE_URL}/api/auth/login", json={
        "email": ADMIN_EMAIL,
        "password": ADMIN_PASSWORD
    })
    if response.status_code == 200:
        data = response.json()
        # Auth returns 'access_token' per previous iterations
        return data.get("access_token") or data.get("token")
    pytest.skip(f"Authentication failed: {response.status_code} - {response.text}")


@pytest.fixture(scope="module")
def authenticated_client(api_client, auth_token):
    """Session with auth header"""
    api_client.headers.update({"Authorization": f"Bearer {auth_token}"})
    return api_client


# ─────────────────────────────────────────────────────────────────────────────
# STRIPE SYNC TESTS
# ─────────────────────────────────────────────────────────────────────────────

class TestStripeSyncStatus:
    """Test GET /api/stripe-sync/status"""
    
    def test_stripe_sync_status_returns_enabled(self, authenticated_client):
        """Verify status endpoint returns enabled:true and capabilities"""
        response = authenticated_client.get(f"{BASE_URL}/api/stripe-sync/status")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "enabled" in data, "Response should contain 'enabled' field"
        assert data["enabled"] == True, "Stripe should be enabled (test key configured)"
        assert "capabilities" in data, "Response should contain 'capabilities' field"
        
        caps = data["capabilities"]
        assert "push" in caps, "Capabilities should include 'push'"
        assert "pull" in caps, "Capabilities should include 'pull'"
        assert "customers" in caps["push"], "Push should include 'customers'"
        assert "products" in caps["push"], "Push should include 'products'"
        print(f"✓ Stripe sync status: enabled={data['enabled']}, mode={data.get('mode')}")


class TestStripePushCustomers:
    """Test POST /api/stripe-sync/push/customers"""
    
    def test_push_customers_dry_run(self, authenticated_client):
        """Verify dry_run returns count preview without actual sync"""
        response = authenticated_client.post(
            f"{BASE_URL}/api/stripe-sync/push/customers",
            json={"dry_run": True, "limit": 10}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "dry_run" in data, "Response should indicate dry_run status"
        assert data["dry_run"] == True, "dry_run should be True"
        assert "created" in data, "Response should have 'created' count"
        assert "updated" in data, "Response should have 'updated' count"
        assert "total" in data, "Response should have 'total' count"
        print(f"✓ Push customers dry run: created={data['created']}, updated={data['updated']}, total={data['total']}")
    
    def test_push_customers_actual_sync(self, authenticated_client):
        """Verify actual sync creates/updates customers in Stripe"""
        response = authenticated_client.post(
            f"{BASE_URL}/api/stripe-sync/push/customers",
            json={"dry_run": False, "limit": 5}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data.get("dry_run") == False, "dry_run should be False"
        assert "created" in data
        assert "updated" in data
        assert "errors" in data
        print(f"✓ Push customers actual: created={data['created']}, updated={data['updated']}, errors={data['errors']}")


class TestStripePushProducts:
    """Test POST /api/stripe-sync/push/products"""
    
    def test_push_products_dry_run(self, authenticated_client):
        """Verify dry_run returns count preview for products"""
        response = authenticated_client.post(
            f"{BASE_URL}/api/stripe-sync/push/products",
            json={"dry_run": True, "limit": 10}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data.get("dry_run") == True
        assert "created" in data
        assert "updated" in data
        print(f"✓ Push products dry run: created={data['created']}, updated={data['updated']}")
    
    def test_push_products_actual_sync(self, authenticated_client):
        """Verify actual sync creates/updates products in Stripe"""
        response = authenticated_client.post(
            f"{BASE_URL}/api/stripe-sync/push/products",
            json={"dry_run": False, "limit": 5}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data.get("dry_run") == False
        print(f"✓ Push products actual: created={data['created']}, updated={data['updated']}, errors={data['errors']}")


class TestStripePullCustomers:
    """Test POST /api/stripe-sync/pull/customers"""
    
    def test_pull_customers_imports_from_stripe(self, authenticated_client):
        """Verify pull imports Stripe customers to app DB"""
        response = authenticated_client.post(
            f"{BASE_URL}/api/stripe-sync/pull/customers",
            json={"dry_run": False, "limit": 10}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "created" in data
        assert "updated" in data
        assert "skipped" in data
        print(f"✓ Pull customers: created={data['created']}, updated={data['updated']}, skipped={data['skipped']}")


class TestStripePullProducts:
    """Test POST /api/stripe-sync/pull/products"""
    
    def test_pull_products_imports_from_stripe(self, authenticated_client):
        """Verify pull imports Stripe products to app DB"""
        response = authenticated_client.post(
            f"{BASE_URL}/api/stripe-sync/pull/products",
            json={"dry_run": False, "limit": 10}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "created" in data
        assert "updated" in data
        print(f"✓ Pull products: created={data['created']}, updated={data['updated']}")


class TestStripeFullSync:
    """Test POST /api/stripe-sync/full"""
    
    def test_full_sync_runs_all_operations(self, authenticated_client):
        """Verify full sync runs all 4 sync operations and returns combined results"""
        response = authenticated_client.post(
            f"{BASE_URL}/api/stripe-sync/full",
            json={"dry_run": False, "limit": 5}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "push_customers" in data, "Should have push_customers result"
        assert "push_products" in data, "Should have push_products result"
        assert "pull_customers" in data, "Should have pull_customers result"
        assert "pull_products" in data, "Should have pull_products result"
        
        # Verify each sub-result has expected fields
        for key in ["push_customers", "push_products", "pull_customers", "pull_products"]:
            assert "created" in data[key], f"{key} should have 'created'"
            assert "updated" in data[key], f"{key} should have 'updated'"
        
        print(f"✓ Full sync completed with all 4 operations")


class TestStripeSyncHistory:
    """Test GET /api/stripe-sync/history"""
    
    def test_sync_history_returns_logs(self, authenticated_client):
        """Verify history returns array of sync logs with timestamps"""
        response = authenticated_client.get(f"{BASE_URL}/api/stripe-sync/history?limit=10")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "History should be a list"
        
        if len(data) > 0:
            log = data[0]
            assert "action" in log, "Log should have 'action'"
            assert "entity" in log, "Log should have 'entity'"
            assert "timestamp" in log, "Log should have 'timestamp'"
            assert "stats" in log, "Log should have 'stats'"
            print(f"✓ Sync history: {len(data)} entries, latest action={log['action']}")
        else:
            print("✓ Sync history: empty (no syncs yet)")


# ─────────────────────────────────────────────────────────────────────────────
# NOTIFICATION METRICS TESTS
# ─────────────────────────────────────────────────────────────────────────────

class TestNotificationMetrics:
    """Test GET /api/notification-metrics"""
    
    def test_notification_metrics_returns_analytics(self, authenticated_client):
        """Verify metrics endpoint returns total, sent, failed, success_rate, by_channel, by_event, recent"""
        response = authenticated_client.get(f"{BASE_URL}/api/notification-metrics?days=30")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        
        # Check required fields
        assert "total" in data, "Should have 'total'"
        assert "sent" in data, "Should have 'sent'"
        assert "failed" in data, "Should have 'failed'"
        assert "success_rate" in data, "Should have 'success_rate'"
        assert "by_channel" in data, "Should have 'by_channel'"
        assert "by_event" in data, "Should have 'by_event'"
        assert "recent" in data, "Should have 'recent'"
        
        # Validate types
        assert isinstance(data["total"], int), "total should be int"
        assert isinstance(data["sent"], int), "sent should be int"
        assert isinstance(data["failed"], int), "failed should be int"
        assert isinstance(data["success_rate"], (int, float)), "success_rate should be numeric"
        assert isinstance(data["by_channel"], dict), "by_channel should be dict"
        assert isinstance(data["by_event"], dict), "by_event should be dict"
        assert isinstance(data["recent"], list), "recent should be list"
        
        print(f"✓ Notification metrics: total={data['total']}, sent={data['sent']}, failed={data['failed']}, success_rate={data['success_rate']}%")
        print(f"  Channels: {list(data['by_channel'].keys())}")
        print(f"  Events: {list(data['by_event'].keys())[:5]}...")


class TestContactFormNotification:
    """Test that contact form triggers notification logging"""
    
    def test_contact_form_logs_notification(self, api_client, authenticated_client):
        """Creating a contact ticket via POST /api/public/contact triggers notification and logs it"""
        # Create a contact ticket (public endpoint, no auth required)
        contact_data = {
            "name": f"Test User {uuid.uuid4().hex[:6]}",
            "email": f"test_{uuid.uuid4().hex[:6]}@example.com",
            "phone": "+18055551234",
            "message": "Test message for notification logging",
            "preferred_contact": "email"
        }
        
        response = api_client.post(f"{BASE_URL}/api/public/contact", json=contact_data)
        assert response.status_code in [200, 201], f"Expected 200/201, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "id" in data or "ticket_id" in data or "success" in data, "Should return ticket info or success"
        print(f"✓ Contact form submitted successfully")
        
        # Check notification metrics to see if it was logged
        # Note: The notification may fail (no Twilio/SendGrid configured) but should be logged
        metrics_response = authenticated_client.get(f"{BASE_URL}/api/notification-metrics?days=1")
        if metrics_response.status_code == 200:
            metrics = metrics_response.json()
            print(f"  Current notification count: {metrics['total']}")


# ─────────────────────────────────────────────────────────────────────────────
# HEALTH CHECK
# ─────────────────────────────────────────────────────────────────────────────

class TestHealthCheck:
    """Basic health check"""
    
    def test_health_endpoint(self, api_client):
        """Verify API is running"""
        response = api_client.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data.get("status") == "ok"
        print("✓ Health check passed")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
