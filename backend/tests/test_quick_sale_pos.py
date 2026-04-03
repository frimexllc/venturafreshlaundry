"""
Quick Sale POS Backend Tests - Iteration 37
Tests for the 3 payment methods in Quick Sale modal:
1. Cash (Efectivo)
2. Card on Screen (Tarjeta en Pantalla) - Stripe Elements
3. Tap to Pay - Stripe Terminal
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_EMAIL = "owner@frimexllc.com"
ADMIN_PASSWORD = "admin123"


@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token for admin user"""
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
    )
    assert response.status_code == 200, f"Login failed: {response.text}"
    data = response.json()
    assert "access_token" in data, "No access_token in login response"
    return data["access_token"]


@pytest.fixture
def auth_headers(auth_token):
    """Headers with auth token"""
    return {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {auth_token}"
    }


class TestStripePublishableKey:
    """Test Stripe publishable key endpoint"""
    
    def test_get_publishable_key(self):
        """GET /api/stripe/publishable-key returns publishable key"""
        response = requests.get(f"{BASE_URL}/api/stripe/publishable-key")
        assert response.status_code == 200
        data = response.json()
        assert "publishableKey" in data
        assert data["publishableKey"].startswith("pk_test_")


class TestCashPayment:
    """Tests for Cash (Efectivo) payment flow"""
    
    def test_cash_sale_success(self, auth_headers):
        """POST /api/stripe/quick-sale/cash creates order and finance entry"""
        payload = {
            "customerName": "TEST_Cash Customer",
            "amount": 25.00,
            "description": "Lavado express",
            "customerPhone": "8055551234"
        }
        response = requests.post(
            f"{BASE_URL}/api/stripe/quick-sale/cash",
            json=payload,
            headers=auth_headers
        )
        assert response.status_code == 200, f"Cash sale failed: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "orderId" in data
        assert "orderNumber" in data
        assert "status" in data
        assert "amount" in data
        
        # Verify values
        assert data["status"] == "completed"
        assert data["amount"] == 25.00
        assert data["orderNumber"].startswith("POS-")
    
    def test_cash_sale_requires_auth(self):
        """POST /api/stripe/quick-sale/cash requires authentication"""
        payload = {
            "customerName": "Test",
            "amount": 25.00
        }
        response = requests.post(
            f"{BASE_URL}/api/stripe/quick-sale/cash",
            json=payload,
            headers={"Content-Type": "application/json"}
        )
        assert response.status_code in [401, 403]  # Either unauthorized or forbidden
    
    def test_cash_sale_requires_customer_name(self, auth_headers):
        """POST /api/stripe/quick-sale/cash requires customerName"""
        payload = {
            "amount": 25.00,
            "description": "Test"
        }
        response = requests.post(
            f"{BASE_URL}/api/stripe/quick-sale/cash",
            json=payload,
            headers=auth_headers
        )
        assert response.status_code == 422  # Validation error


class TestCardOnScreenPayment:
    """Tests for Card on Screen (Tarjeta en Pantalla) payment flow"""
    
    def test_card_sale_creates_payment_intent(self, auth_headers):
        """POST /api/stripe/quick-sale creates PaymentIntent for card payment"""
        payload = {
            "customerName": "TEST_Card Customer",
            "amount": 50.00,
            "description": "Lavado completo",
            "customerPhone": "8055555678"
        }
        response = requests.post(
            f"{BASE_URL}/api/stripe/quick-sale",
            json=payload,
            headers=auth_headers
        )
        assert response.status_code == 200, f"Card sale failed: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "clientSecret" in data
        assert "paymentIntentId" in data
        assert "orderId" in data
        assert "orderNumber" in data
        
        # Verify values
        assert data["clientSecret"].startswith("pi_")
        assert data["paymentIntentId"].startswith("pi_")
        assert data["orderNumber"].startswith("POS-")
    
    def test_card_sale_minimum_amount(self, auth_headers):
        """POST /api/stripe/quick-sale requires minimum $0.50"""
        payload = {
            "customerName": "Test",
            "amount": 0.25,
            "description": "Test"
        }
        response = requests.post(
            f"{BASE_URL}/api/stripe/quick-sale",
            json=payload,
            headers=auth_headers
        )
        assert response.status_code == 400
        data = response.json()
        assert "0.50" in data.get("detail", "")
    
    def test_card_sale_requires_auth(self):
        """POST /api/stripe/quick-sale requires authentication"""
        payload = {
            "customerName": "Test",
            "amount": 25.00
        }
        response = requests.post(
            f"{BASE_URL}/api/stripe/quick-sale",
            json=payload,
            headers={"Content-Type": "application/json"}
        )
        assert response.status_code in [401, 403]  # Either unauthorized or forbidden


class TestTerminalTapPayment:
    """Tests for Tap to Pay (Terminal) payment flow"""
    
    def test_terminal_connection_token(self, auth_headers):
        """POST /api/stripe/terminal/connection-token returns secret"""
        response = requests.post(
            f"{BASE_URL}/api/stripe/terminal/connection-token",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Connection token failed: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "secret" in data
        assert data["secret"].startswith("pst_test_")
    
    def test_terminal_connection_token_requires_auth(self):
        """POST /api/stripe/terminal/connection-token requires authentication"""
        response = requests.post(
            f"{BASE_URL}/api/stripe/terminal/connection-token",
            headers={"Content-Type": "application/json"}
        )
        assert response.status_code in [401, 403]  # Either unauthorized or forbidden
    
    def test_terminal_sale_creates_payment_intent(self, auth_headers):
        """POST /api/stripe/quick-sale/terminal creates PaymentIntent for card_present"""
        payload = {
            "customerName": "TEST_Terminal Customer",
            "amount": 35.00,
            "description": "Planchado",
            "customerPhone": "8055559012"
        }
        response = requests.post(
            f"{BASE_URL}/api/stripe/quick-sale/terminal",
            json=payload,
            headers=auth_headers
        )
        assert response.status_code == 200, f"Terminal sale failed: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "clientSecret" in data
        assert "paymentIntentId" in data
        assert "orderId" in data
        assert "orderNumber" in data
        
        # Verify values
        assert data["clientSecret"].startswith("pi_")
        assert data["paymentIntentId"].startswith("pi_")
        assert data["orderNumber"].startswith("POS-")
    
    def test_terminal_sale_minimum_amount(self, auth_headers):
        """POST /api/stripe/quick-sale/terminal requires minimum $0.50"""
        payload = {
            "customerName": "Test",
            "amount": 0.25,
            "description": "Test"
        }
        response = requests.post(
            f"{BASE_URL}/api/stripe/quick-sale/terminal",
            json=payload,
            headers=auth_headers
        )
        assert response.status_code == 400
        data = response.json()
        assert "0.50" in data.get("detail", "")
    
    def test_terminal_sale_requires_auth(self):
        """POST /api/stripe/quick-sale/terminal requires authentication"""
        payload = {
            "customerName": "Test",
            "amount": 25.00
        }
        response = requests.post(
            f"{BASE_URL}/api/stripe/quick-sale/terminal",
            json=payload,
            headers={"Content-Type": "application/json"}
        )
        assert response.status_code in [401, 403]  # Either unauthorized or forbidden


class TestConfirmPayment:
    """Tests for payment confirmation endpoint"""
    
    def test_confirm_payment_endpoint_exists(self, auth_headers):
        """POST /api/stripe/confirm-payment endpoint responds"""
        payload = {
            "paymentIntentId": "pi_test_123",
            "orderId": "test-order-id"
        }
        response = requests.post(
            f"{BASE_URL}/api/stripe/confirm-payment",
            json=payload,
            headers=auth_headers
        )
        # Should return 200 even if order not found (graceful handling)
        assert response.status_code == 200
        data = response.json()
        assert data.get("ok") == True
