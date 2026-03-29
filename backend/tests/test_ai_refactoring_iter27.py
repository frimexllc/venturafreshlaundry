"""
Test AI Module Refactoring - Iteration 27
Tests the extraction of AI code from server_core.py into 5 modular route files:
- ai_assistant.py: AI briefing, suggestions, chat, operations, sessions
- ai_metrics.py: AI metrics and pending actions endpoints
- ai_admin.py: Admin AI and insights endpoints
- ai_patterns.py: AI patterns scan and proposals
- admin_import.py: CSV/Excel admin import

server_core.py reduced from 2196 lines to 531 lines.
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_EMAIL = "owner@frimexllc.com"
ADMIN_PASSWORD = "Fr!m3x##$$"


class TestHealthAndAuth:
    """Basic health check and authentication tests"""
    
    def test_health_endpoint(self):
        """GET /api/health returns healthy status"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200, f"Health check failed: {response.text}"
        data = response.json()
        # Accept both "ok" and "healthy" status values
        assert data.get("status") in ["ok", "healthy"], f"Unexpected status: {data}"
        print(f"✓ Health check passed: {data}")
    
    def test_admin_login(self):
        """POST /api/auth/login returns access_token for admin user"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "access_token" in data, f"No access_token in response: {data}"
        assert len(data["access_token"]) > 0
        print(f"✓ Admin login successful, token received")
        return data["access_token"]


@pytest.fixture(scope="module")
def admin_token():
    """Get admin authentication token"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": ADMIN_EMAIL,
        "password": ADMIN_PASSWORD
    })
    if response.status_code == 200:
        return response.json().get("access_token")
    pytest.skip("Admin authentication failed")


@pytest.fixture
def auth_headers(admin_token):
    """Headers with admin auth token"""
    return {"Authorization": f"Bearer {admin_token}"}


class TestAIMetricsModule:
    """Tests for routes/ai_metrics.py endpoints"""
    
    def test_ai_metrics_endpoint(self, auth_headers):
        """GET /api/ai/metrics?days=7 returns AI metrics data"""
        response = requests.get(f"{BASE_URL}/api/ai/metrics?days=7", headers=auth_headers)
        assert response.status_code == 200, f"AI metrics failed: {response.text}"
        data = response.json()
        # Verify expected fields
        assert "period_days" in data, f"Missing period_days: {data}"
        assert "total_interactions" in data, f"Missing total_interactions: {data}"
        assert data["period_days"] == 7
        print(f"✓ AI metrics returned: period_days={data['period_days']}, total_interactions={data['total_interactions']}")
    
    def test_ai_pending_actions(self, auth_headers):
        """GET /api/ai/pending-actions returns pending_actions array"""
        response = requests.get(f"{BASE_URL}/api/ai/pending-actions", headers=auth_headers)
        assert response.status_code == 200, f"Pending actions failed: {response.text}"
        data = response.json()
        assert "pending_actions" in data, f"Missing pending_actions: {data}"
        assert isinstance(data["pending_actions"], list)
        print(f"✓ Pending actions returned: {len(data['pending_actions'])} actions")


class TestAIAdminModule:
    """Tests for routes/ai_admin.py endpoints"""
    
    def test_admin_ai_endpoint(self, auth_headers):
        """POST /api/admin/ai with message returns reply field"""
        response = requests.post(f"{BASE_URL}/api/admin/ai", 
            headers=auth_headers,
            json={"message": "What is the current order status summary?", "execute": False}
        )
        assert response.status_code == 200, f"Admin AI failed: {response.text}"
        data = response.json()
        assert "reply" in data, f"Missing reply field: {data}"
        print(f"✓ Admin AI returned reply: {data['reply'][:100]}...")
    
    def test_admin_ai_insights(self, auth_headers):
        """POST /api/admin/ai/insights with type=summary returns reply and snapshot"""
        response = requests.post(f"{BASE_URL}/api/admin/ai/insights",
            headers=auth_headers,
            json={"type": "summary"}
        )
        assert response.status_code == 200, f"Admin AI insights failed: {response.text}"
        data = response.json()
        assert "reply" in data, f"Missing reply: {data}"
        assert "snapshot" in data, f"Missing snapshot: {data}"
        # Verify snapshot structure
        snapshot = data["snapshot"]
        assert "generated_at" in snapshot
        assert "orders_today" in snapshot
        print(f"✓ Admin AI insights returned: reply length={len(data['reply'])}, snapshot keys={list(snapshot.keys())[:5]}")


class TestAIPatternsModule:
    """Tests for routes/ai_patterns.py endpoints"""
    
    def test_ai_propuestas_list(self, auth_headers):
        """GET /api/ai/propuestas returns array of proposals"""
        response = requests.get(f"{BASE_URL}/api/ai/propuestas", headers=auth_headers)
        assert response.status_code == 200, f"AI propuestas failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), f"Expected list, got: {type(data)}"
        print(f"✓ AI propuestas returned: {len(data)} proposals")
    
    def test_ai_patrones_scan(self, auth_headers):
        """POST /api/ai/patrones/scan returns ok and patrones_creados count"""
        response = requests.post(f"{BASE_URL}/api/ai/patrones/scan",
            headers=auth_headers,
            json={}
        )
        assert response.status_code == 200, f"AI patrones scan failed: {response.text}"
        data = response.json()
        assert "ok" in data, f"Missing ok field: {data}"
        assert "patrones_creados" in data, f"Missing patrones_creados: {data}"
        print(f"✓ AI patrones scan: ok={data['ok']}, patrones_creados={data['patrones_creados']}")
    
    def test_ai_propuestas_generar(self, auth_headers):
        """POST /api/ai/propuestas/generar returns ok and propuestas_creadas"""
        response = requests.post(f"{BASE_URL}/api/ai/propuestas/generar",
            headers=auth_headers,
            json={}
        )
        assert response.status_code == 200, f"AI propuestas generar failed: {response.text}"
        data = response.json()
        assert "ok" in data, f"Missing ok field: {data}"
        assert "propuestas_creadas" in data, f"Missing propuestas_creadas: {data}"
        print(f"✓ AI propuestas generar: ok={data['ok']}, propuestas_creadas={data['propuestas_creadas']}")


class TestAIAssistantModule:
    """Tests for routes/ai_assistant.py endpoints"""
    
    def test_ai_briefing(self, auth_headers):
        """GET /api/ai/briefing returns briefing or 503 if AI not enabled"""
        response = requests.get(f"{BASE_URL}/api/ai/briefing", headers=auth_headers)
        # Accept 200 (success) or 503 (AI not available)
        assert response.status_code in [200, 503], f"Unexpected status: {response.status_code}, {response.text}"
        if response.status_code == 200:
            data = response.json()
            print(f"✓ AI briefing returned: {list(data.keys())[:5]}")
        else:
            print(f"✓ AI briefing returned 503 (AI Assistant not available) - expected behavior")
    
    def test_ai_suggestions(self, auth_headers):
        """GET /api/ai/suggestions returns suggestions or 503"""
        response = requests.get(f"{BASE_URL}/api/ai/suggestions", headers=auth_headers)
        assert response.status_code in [200, 503], f"Unexpected status: {response.status_code}, {response.text}"
        if response.status_code == 200:
            data = response.json()
            assert "suggestions" in data, f"Missing suggestions: {data}"
            print(f"✓ AI suggestions returned: {len(data.get('suggestions', []))} suggestions")
        else:
            print(f"✓ AI suggestions returned 503 (AI Assistant not available) - expected behavior")
    
    def test_ai_operations(self, auth_headers):
        """POST /api/ai/operations with message returns session_id and reply"""
        response = requests.post(f"{BASE_URL}/api/ai/operations",
            headers=auth_headers,
            json={"message": "Show me today's orders summary", "execute": False}
        )
        assert response.status_code in [200, 503], f"Unexpected status: {response.status_code}, {response.text}"
        if response.status_code == 200:
            data = response.json()
            assert "session_id" in data, f"Missing session_id: {data}"
            assert "reply" in data, f"Missing reply: {data}"
            print(f"✓ AI operations returned: session_id={data['session_id'][:8]}..., reply length={len(data['reply'])}")
        else:
            print(f"✓ AI operations returned 503 (AI Assistant not available) - expected behavior")


class TestCoreEndpoints:
    """Tests for core endpoints that should still work after refactoring"""
    
    def test_orders_list(self, auth_headers):
        """GET /api/orders returns orders list"""
        response = requests.get(f"{BASE_URL}/api/orders", headers=auth_headers)
        assert response.status_code == 200, f"Orders list failed: {response.text}"
        data = response.json()
        assert "orders" in data or isinstance(data, list), f"Unexpected response: {data}"
        orders = data.get("orders", data) if isinstance(data, dict) else data
        print(f"✓ Orders list returned: {len(orders)} orders")
    
    def test_customers_list(self, auth_headers):
        """GET /api/customers returns customers list"""
        response = requests.get(f"{BASE_URL}/api/customers", headers=auth_headers)
        assert response.status_code == 200, f"Customers list failed: {response.text}"
        data = response.json()
        assert "customers" in data or isinstance(data, list), f"Unexpected response: {data}"
        customers = data.get("customers", data) if isinstance(data, dict) else data
        print(f"✓ Customers list returned: {len(customers)} customers")
    
    def test_finances_expenses(self, auth_headers):
        """GET /api/finances/expenses returns expenses data"""
        response = requests.get(f"{BASE_URL}/api/finances/expenses", headers=auth_headers)
        assert response.status_code == 200, f"Finances expenses failed: {response.text}"
        data = response.json()
        assert "expenses" in data or isinstance(data, list), f"Unexpected response: {data}"
        expenses = data.get("expenses", data) if isinstance(data, dict) else data
        print(f"✓ Finances expenses returned: {len(expenses)} expenses")
    
    def test_dashboard_stats(self, auth_headers):
        """GET /api/dashboard/stats returns dashboard stats"""
        response = requests.get(f"{BASE_URL}/api/dashboard/stats", headers=auth_headers)
        assert response.status_code == 200, f"Dashboard stats failed: {response.text}"
        data = response.json()
        # Dashboard should have various stats
        print(f"✓ Dashboard stats returned: {list(data.keys())[:5]}")


class TestAIMetricsDetails:
    """Additional tests for AI metrics endpoint details"""
    
    def test_ai_metrics_with_different_days(self, auth_headers):
        """Test AI metrics with different day ranges"""
        for days in [7, 30]:
            response = requests.get(f"{BASE_URL}/api/ai/metrics?days={days}", headers=auth_headers)
            assert response.status_code == 200, f"AI metrics failed for days={days}: {response.text}"
            data = response.json()
            assert data["period_days"] == days
            # Verify all expected fields
            expected_fields = ["period_days", "total_interactions", "total_sessions", 
                             "executed_commands", "critical_actions_requested", 
                             "action_success_total", "action_success_ok", "success_rate",
                             "action_breakdown", "daily_summaries", "recent_logs"]
            for field in expected_fields:
                assert field in data, f"Missing field {field} in AI metrics"
        print(f"✓ AI metrics structure verified with all expected fields")


class TestAIAdminInsightsTypes:
    """Test different insight types"""
    
    def test_insights_risks(self, auth_headers):
        """Test AI insights with type=risks"""
        response = requests.post(f"{BASE_URL}/api/admin/ai/insights",
            headers=auth_headers,
            json={"type": "risks"}
        )
        assert response.status_code == 200, f"AI insights risks failed: {response.text}"
        data = response.json()
        assert "reply" in data
        assert "snapshot" in data
        print(f"✓ AI insights (risks) returned successfully")
    
    def test_insights_forecast(self, auth_headers):
        """Test AI insights with type=forecast"""
        response = requests.post(f"{BASE_URL}/api/admin/ai/insights",
            headers=auth_headers,
            json={"type": "forecast"}
        )
        assert response.status_code == 200, f"AI insights forecast failed: {response.text}"
        data = response.json()
        assert "reply" in data
        assert "snapshot" in data
        print(f"✓ AI insights (forecast) returned successfully")
    
    def test_insights_invalid_type(self, auth_headers):
        """Test AI insights with invalid type returns 400"""
        response = requests.post(f"{BASE_URL}/api/admin/ai/insights",
            headers=auth_headers,
            json={"type": "invalid_type"}
        )
        assert response.status_code == 400, f"Expected 400 for invalid type, got: {response.status_code}"
        print(f"✓ AI insights correctly rejects invalid type with 400")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
