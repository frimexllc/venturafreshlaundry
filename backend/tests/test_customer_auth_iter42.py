"""
Iteration 42: Customer Auth & Account Portal Tests
Tests for:
- Auth guard redirects for protected routes
- Customer login/register with redirect param
- Customer Account page features (pending payments, membership check, payment status badges)
- Customer API endpoints (membership-status, pending-payments, preferences, mark-zelle)
- Pre-fill customer data in service forms
"""
import pytest
import requests
import os

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://route-optimize-fresh.preview.emergentagent.com")

# Test credentials from review request
TEST_CUSTOMER = {"email": "test_customer@test.com", "password": "test123"}
TEST_CUSTOMER_ID = "c719267c-0360-461c-9e26-9df57d8b8fba"
TEST_ORDER_ID = "3d28dae9-5423-488c-b7b4-5c64460b59f9"
TEST_ORDER_NUMBER = "VFL-TEST-001"


class TestCustomerAuth:
    """Customer authentication endpoint tests"""
    
    def test_customer_login_success(self):
        """Test customer login with valid credentials"""
        response = requests.post(
            f"{BASE_URL}/api/customer/auth/login",
            json=TEST_CUSTOMER
        )
        print(f"Login response status: {response.status_code}")
        print(f"Login response: {response.json()}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "access_token" in data, "Response should contain access_token"
        assert "customer" in data, "Response should contain customer data"
        assert data["token_type"] == "bearer", "Token type should be bearer"
        assert data["customer"]["email"] == TEST_CUSTOMER["email"], "Customer email should match"
        
    def test_customer_login_invalid_credentials(self):
        """Test customer login with invalid credentials"""
        response = requests.post(
            f"{BASE_URL}/api/customer/auth/login",
            json={"email": "wrong@example.com", "password": "wrongpass"}
        )
        print(f"Invalid login response: {response.status_code}")
        
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        
    def test_customer_register_existing_email(self):
        """Test registration with existing email returns error"""
        response = requests.post(
            f"{BASE_URL}/api/customer/auth/register",
            json={"name": "Test User", "email": TEST_CUSTOMER["email"], "password": "newpass123"}
        )
        print(f"Register existing email response: {response.status_code}")
        
        # Should return 400 since email already registered with password
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"


class TestCustomerMembershipStatus:
    """Tests for /api/customer/membership-status endpoint"""
    
    @pytest.fixture
    def customer_token(self):
        """Get customer auth token"""
        response = requests.post(
            f"{BASE_URL}/api/customer/auth/login",
            json=TEST_CUSTOMER
        )
        if response.status_code == 200:
            return response.json()["access_token"]
        pytest.skip("Customer login failed")
        
    def test_membership_status_returns_false_for_non_member(self, customer_token):
        """Test that membership-status returns has_membership: false for non-members"""
        response = requests.get(
            f"{BASE_URL}/api/customer/membership-status",
            headers={"Authorization": f"Bearer {customer_token}"}
        )
        print(f"Membership status response: {response.status_code}")
        print(f"Membership status data: {response.json()}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "has_membership" in data, "Response should contain has_membership"
        assert data["has_membership"] == False, "Test customer should not have active membership"
        
    def test_membership_status_requires_auth(self):
        """Test that membership-status requires authentication"""
        response = requests.get(f"{BASE_URL}/api/customer/membership-status")
        print(f"Unauthenticated membership status: {response.status_code}")
        
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"


class TestCustomerPendingPayments:
    """Tests for /api/customer/pending-payments endpoint"""
    
    @pytest.fixture
    def customer_token(self):
        """Get customer auth token"""
        response = requests.post(
            f"{BASE_URL}/api/customer/auth/login",
            json=TEST_CUSTOMER
        )
        if response.status_code == 200:
            return response.json()["access_token"]
        pytest.skip("Customer login failed")
        
    def test_pending_payments_returns_unpaid_orders(self, customer_token):
        """Test that pending-payments returns unpaid orders for the customer"""
        response = requests.get(
            f"{BASE_URL}/api/customer/pending-payments",
            headers={"Authorization": f"Bearer {customer_token}"}
        )
        print(f"Pending payments response: {response.status_code}")
        print(f"Pending payments data: {response.json()}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        
        # Check if test order is in the list (if it exists and is unpaid)
        if len(data) > 0:
            order = data[0]
            assert "id" in order, "Order should have id"
            assert "order_number" in order, "Order should have order_number"
            assert "payment_status" in order, "Order should have payment_status"
            assert "total_amount" in order, "Order should have total_amount"
            
    def test_pending_payments_requires_auth(self):
        """Test that pending-payments requires authentication"""
        response = requests.get(f"{BASE_URL}/api/customer/pending-payments")
        print(f"Unauthenticated pending payments: {response.status_code}")
        
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"


class TestCustomerPreferences:
    """Tests for /api/customer/preferences endpoint"""
    
    @pytest.fixture
    def customer_token(self):
        """Get customer auth token"""
        response = requests.post(
            f"{BASE_URL}/api/customer/auth/login",
            json=TEST_CUSTOMER
        )
        if response.status_code == 200:
            return response.json()["access_token"]
        pytest.skip("Customer login failed")
        
    def test_preferences_returns_403_for_non_member(self, customer_token):
        """Test that preferences returns 403 for customers without active membership"""
        response = requests.get(
            f"{BASE_URL}/api/customer/preferences",
            headers={"Authorization": f"Bearer {customer_token}"}
        )
        print(f"Preferences response: {response.status_code}")
        print(f"Preferences data: {response.text}")
        
        # Should return 403 since test customer has no active membership
        assert response.status_code == 403, f"Expected 403, got {response.status_code}"
        
    def test_preferences_requires_auth(self):
        """Test that preferences requires authentication"""
        response = requests.get(f"{BASE_URL}/api/customer/preferences")
        print(f"Unauthenticated preferences: {response.status_code}")
        
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"


class TestMarkZellePayment:
    """Tests for /api/customer/order/{id}/mark-zelle endpoint"""
    
    @pytest.fixture
    def customer_token(self):
        """Get customer auth token"""
        response = requests.post(
            f"{BASE_URL}/api/customer/auth/login",
            json=TEST_CUSTOMER
        )
        if response.status_code == 200:
            return response.json()["access_token"]
        pytest.skip("Customer login failed")
        
    def test_mark_zelle_requires_auth(self):
        """Test that mark-zelle requires authentication"""
        response = requests.post(f"{BASE_URL}/api/customer/order/{TEST_ORDER_ID}/mark-zelle")
        print(f"Unauthenticated mark-zelle: {response.status_code}")
        
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        
    def test_mark_zelle_with_valid_order(self, customer_token):
        """Test marking an order as Zelle payment pending verification"""
        response = requests.post(
            f"{BASE_URL}/api/customer/order/{TEST_ORDER_ID}/mark-zelle",
            headers={"Authorization": f"Bearer {customer_token}"}
        )
        print(f"Mark Zelle response: {response.status_code}")
        print(f"Mark Zelle data: {response.text}")
        
        # Could be 200 (success) or 404 (order not found/not owned by customer)
        assert response.status_code in [200, 404], f"Expected 200 or 404, got {response.status_code}"
        
    def test_mark_zelle_invalid_order(self, customer_token):
        """Test marking a non-existent order as Zelle payment"""
        response = requests.post(
            f"{BASE_URL}/api/customer/order/invalid-order-id/mark-zelle",
            headers={"Authorization": f"Bearer {customer_token}"}
        )
        print(f"Mark Zelle invalid order: {response.status_code}")
        
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"


class TestCustomerOrders:
    """Tests for /api/customer/orders endpoint"""
    
    @pytest.fixture
    def customer_token(self):
        """Get customer auth token"""
        response = requests.post(
            f"{BASE_URL}/api/customer/auth/login",
            json=TEST_CUSTOMER
        )
        if response.status_code == 200:
            return response.json()["access_token"]
        pytest.skip("Customer login failed")
        
    def test_customer_orders_returns_list(self, customer_token):
        """Test that customer orders endpoint returns a list"""
        response = requests.get(
            f"{BASE_URL}/api/customer/orders",
            headers={"Authorization": f"Bearer {customer_token}"}
        )
        print(f"Customer orders response: {response.status_code}")
        print(f"Customer orders count: {len(response.json()) if response.status_code == 200 else 'N/A'}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        
    def test_customer_orders_requires_auth(self):
        """Test that customer orders requires authentication"""
        response = requests.get(f"{BASE_URL}/api/customer/orders")
        print(f"Unauthenticated customer orders: {response.status_code}")
        
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"


class TestCustomerMe:
    """Tests for /api/customer/me endpoint"""
    
    @pytest.fixture
    def customer_token(self):
        """Get customer auth token"""
        response = requests.post(
            f"{BASE_URL}/api/customer/auth/login",
            json=TEST_CUSTOMER
        )
        if response.status_code == 200:
            return response.json()["access_token"]
        pytest.skip("Customer login failed")
        
    def test_customer_me_returns_profile(self, customer_token):
        """Test that /customer/me returns customer profile"""
        response = requests.get(
            f"{BASE_URL}/api/customer/me",
            headers={"Authorization": f"Bearer {customer_token}"}
        )
        print(f"Customer me response: {response.status_code}")
        print(f"Customer me data: {response.json()}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "id" in data, "Response should contain id"
        assert "email" in data, "Response should contain email"
        assert data["email"] == TEST_CUSTOMER["email"], "Email should match"


class TestCheckoutAuth:
    """Tests for /api/customer/order/{id}/checkout-auth endpoint"""
    
    @pytest.fixture
    def customer_token(self):
        """Get customer auth token"""
        response = requests.post(
            f"{BASE_URL}/api/customer/auth/login",
            json=TEST_CUSTOMER
        )
        if response.status_code == 200:
            return response.json()["access_token"]
        pytest.skip("Customer login failed")
        
    def test_checkout_auth_requires_auth(self):
        """Test that checkout-auth requires authentication"""
        response = requests.post(f"{BASE_URL}/api/customer/order/{TEST_ORDER_ID}/checkout-auth")
        print(f"Unauthenticated checkout-auth: {response.status_code}")
        
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"


class TestHealthCheck:
    """Basic health check"""
    
    def test_api_health(self):
        """Test API health endpoint"""
        response = requests.get(f"{BASE_URL}/api/health")
        print(f"Health check: {response.status_code}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
