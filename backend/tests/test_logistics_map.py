"""
Test suite for Logistics Map features - TIM assistant, health endpoint, and store orders
Tests the new logistics map panel at /admin/operator
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestHealthEndpoint:
    """Health endpoint tests - P0 lazy loading verification"""
    
    def test_health_endpoint_returns_ok(self):
        """GET /api/health should return status ok"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data.get("status") == "ok"
        print("PASS: Health endpoint returns ok")


class TestTimChatEndpoint:
    """TIM (Transportation Intelligence Module) chat endpoint tests"""
    
    def test_tim_chat_basic_message(self):
        """POST /api/tim/chat should return AI response"""
        payload = {
            "messages": [{"role": "user", "content": "Hola TIM"}],
            "max_tokens": 100,
            "temperature": 0.75
        }
        response = requests.post(
            f"{BASE_URL}/api/tim/chat",
            json=payload,
            headers={"Content-Type": "application/json"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "content" in data
        assert len(data["content"]) > 0
        print(f"PASS: TIM responded with: {data['content'][:100]}...")
    
    def test_tim_chat_route_question(self):
        """POST /api/tim/chat with route question"""
        payload = {
            "messages": [
                {"role": "system", "content": "Eres TIM, copiloto de despacho IA."},
                {"role": "user", "content": "Como va la ruta?"}
            ],
            "max_tokens": 150,
            "temperature": 0.75
        }
        response = requests.post(
            f"{BASE_URL}/api/tim/chat",
            json=payload,
            headers={"Content-Type": "application/json"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "content" in data
        assert len(data["content"]) > 0
        print(f"PASS: TIM route response: {data['content'][:100]}...")
    
    def test_tim_chat_traffic_question(self):
        """POST /api/tim/chat with traffic question"""
        payload = {
            "messages": [
                {"role": "system", "content": "Eres TIM, copiloto de despacho IA para Ventura Fresh Laundry."},
                {"role": "user", "content": "Hay trafico?"}
            ],
            "max_tokens": 150,
            "temperature": 0.75
        }
        response = requests.post(
            f"{BASE_URL}/api/tim/chat",
            json=payload,
            headers={"Content-Type": "application/json"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "content" in data
        print(f"PASS: TIM traffic response: {data['content'][:100]}...")
    
    def test_tim_chat_empty_messages_fails(self):
        """POST /api/tim/chat with empty messages should fail"""
        payload = {
            "messages": [],
            "max_tokens": 100
        }
        response = requests.post(
            f"{BASE_URL}/api/tim/chat",
            json=payload,
            headers={"Content-Type": "application/json"}
        )
        # Should either fail validation or return error from Groq
        # Status 422 (validation) or 400/500 (API error) are acceptable
        assert response.status_code in [400, 422, 500]
        print(f"PASS: Empty messages rejected with status {response.status_code}")


class TestAuthAndStoreOrders:
    """Authentication and store orders tests for logistics map data"""
    
    @pytest.fixture
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={
                "email": "owner@frimexllc.com",
                "password": "Fr!m3x##$$"
            }
        )
        if response.status_code == 200:
            data = response.json()
            # API returns access_token, not token
            return data.get("access_token") or data.get("token")
        pytest.skip("Authentication failed - skipping authenticated tests")
    
    def test_auth_login_success(self):
        """POST /api/auth/login with valid credentials"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={
                "email": "owner@frimexllc.com",
                "password": "Fr!m3x##$$"
            }
        )
        assert response.status_code == 200
        data = response.json()
        # API returns access_token, not token
        assert "access_token" in data or "token" in data
        assert "user" in data
        print(f"PASS: Login successful for {data['user'].get('email', 'unknown')}")
    
    def test_auth_login_invalid_password(self):
        """POST /api/auth/login with invalid password"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={
                "email": "owner@frimexllc.com",
                "password": "wrongpassword"
            }
        )
        assert response.status_code == 401
        print("PASS: Invalid password rejected with 401")
    
    def test_store_orders_endpoint(self, auth_token):
        """GET /api/store/orders returns orders for logistics map"""
        response = requests.get(
            f"{BASE_URL}/api/store/orders",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        # Can be array or object with orders key
        orders = data if isinstance(data, list) else data.get("orders", [])
        print(f"PASS: Store orders endpoint returned {len(orders)} orders")
    
    def test_store_orders_without_auth(self):
        """GET /api/store/orders without auth - may be public or protected"""
        response = requests.get(f"{BASE_URL}/api/store/orders")
        # Store orders endpoint may be public (200) or protected (401/403)
        assert response.status_code in [200, 401, 403]
        print(f"PASS: Store orders without auth returned {response.status_code}")


class TestDashboardEndpoints:
    """Dashboard endpoints used by logistics map"""
    
    @pytest.fixture
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={
                "email": "owner@frimexllc.com",
                "password": "Fr!m3x##$$"
            }
        )
        if response.status_code == 200:
            data = response.json()
            return data.get("access_token") or data.get("token")
        pytest.skip("Authentication failed")
    
    def test_dashboard_stats(self, auth_token):
        """GET /api/dashboard/stats returns statistics"""
        response = requests.get(
            f"{BASE_URL}/api/dashboard/stats",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        # Check for expected fields
        expected_fields = ["total_customers", "total_orders"]
        for field in expected_fields:
            assert field in data, f"Missing field: {field}"
        print(f"PASS: Dashboard stats returned with {len(data)} fields")
    
    def test_auth_me_endpoint(self, auth_token):
        """GET /api/auth/me returns current user"""
        response = requests.get(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "email" in data
        print(f"PASS: Auth me returned user: {data.get('email')}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
