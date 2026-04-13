"""
Test Customer Registration 2-Step Flow and Auto-fill Features - Iteration 45

Tests:
1. Customer registration with extended fields (phone, address, city, state, zip_code)
2. Customer login (unchanged flow)
3. /api/orders endpoint (restored)
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials from test_credentials.md
ADMIN_EMAIL = "owner@frimexllc.com"
ADMIN_PASSWORD = "admin123"
TEST_CUSTOMER_EMAIL = "testcustomer@example.com"
TEST_CUSTOMER_PASSWORD = "test123456"


class TestHealthCheck:
    """Basic health check to ensure API is running"""
    
    def test_health_endpoint(self):
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data.get("status") == "ok"
        print("✓ Health check passed")


class TestCustomerRegistration:
    """Test 2-step customer registration with extended fields"""
    
    def test_register_with_all_fields(self):
        """Test registration with all new fields: phone, address, city, state, zip_code"""
        unique_id = str(uuid.uuid4())[:8]
        test_email = f"reg_test_{unique_id}@test.com"
        
        payload = {
            "name": "Test Registration User",
            "email": test_email,
            "password": "testpass123",
            "phone": "(805) 555-1234",
            "address": "123 Test Street",
            "city": "Ventura",
            "state": "CA",
            "zip_code": "93003"
        }
        
        response = requests.post(f"{BASE_URL}/api/customer/auth/register", json=payload)
        assert response.status_code == 200, f"Registration failed: {response.text}"
        
        data = response.json()
        
        # Verify response structure
        assert "access_token" in data, "Missing access_token in response"
        assert "customer" in data, "Missing customer in response"
        
        customer = data["customer"]
        
        # Verify customer data
        assert customer["email"] == test_email.lower()
        assert customer["name"] == "Test Registration User"
        assert customer.get("phone") == "(805) 555-1234"
        assert customer.get("city") == "Ventura"
        assert customer.get("state") == "CA"
        assert customer.get("zip_code") == "93003"
        
        # Address should be combined
        assert "123 Test Street" in customer.get("address", "")
        
        print(f"✓ Registration with all fields passed for {test_email}")
        print(f"  - Phone: {customer.get('phone')}")
        print(f"  - City: {customer.get('city')}")
        print(f"  - State: {customer.get('state')}")
        print(f"  - Zip: {customer.get('zip_code')}")
        
        return data["access_token"], customer
    
    def test_register_minimal_fields(self):
        """Test registration with only required fields (name, email, password)"""
        unique_id = str(uuid.uuid4())[:8]
        test_email = f"reg_minimal_{unique_id}@test.com"
        
        payload = {
            "name": "Minimal User",
            "email": test_email,
            "password": "testpass123"
        }
        
        response = requests.post(f"{BASE_URL}/api/customer/auth/register", json=payload)
        assert response.status_code == 200, f"Minimal registration failed: {response.text}"
        
        data = response.json()
        assert "access_token" in data
        assert data["customer"]["email"] == test_email.lower()
        
        print(f"✓ Minimal registration passed for {test_email}")
    
    def test_register_duplicate_email_fails(self):
        """Test that registering with existing email fails"""
        payload = {
            "name": "Duplicate User",
            "email": TEST_CUSTOMER_EMAIL,  # Existing customer
            "password": "newpassword123"
        }
        
        response = requests.post(f"{BASE_URL}/api/customer/auth/register", json=payload)
        # Should fail with 400 since email already registered with password
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        
        data = response.json()
        assert "already registered" in data.get("detail", "").lower() or "login" in data.get("detail", "").lower()
        
        print("✓ Duplicate email registration correctly rejected")


class TestCustomerLogin:
    """Test customer login (unchanged flow - no step 2)"""
    
    def test_login_existing_customer(self):
        """Test login with existing test customer"""
        payload = {
            "email": TEST_CUSTOMER_EMAIL,
            "password": TEST_CUSTOMER_PASSWORD
        }
        
        response = requests.post(f"{BASE_URL}/api/customer/auth/login", json=payload)
        assert response.status_code == 200, f"Login failed: {response.text}"
        
        data = response.json()
        
        # Verify response structure
        assert "access_token" in data
        assert "customer" in data
        
        customer = data["customer"]
        assert customer["email"] == TEST_CUSTOMER_EMAIL
        
        print(f"✓ Customer login passed for {TEST_CUSTOMER_EMAIL}")
        print(f"  - Customer ID: {customer.get('id')}")
        print(f"  - Name: {customer.get('name')}")
        
        return data["access_token"], customer
    
    def test_login_invalid_credentials(self):
        """Test login with wrong password"""
        payload = {
            "email": TEST_CUSTOMER_EMAIL,
            "password": "wrongpassword"
        }
        
        response = requests.post(f"{BASE_URL}/api/customer/auth/login", json=payload)
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        
        print("✓ Invalid credentials correctly rejected")
    
    def test_login_nonexistent_email(self):
        """Test login with non-existent email"""
        payload = {
            "email": "nonexistent@test.com",
            "password": "anypassword"
        }
        
        response = requests.post(f"{BASE_URL}/api/customer/auth/login", json=payload)
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        
        print("✓ Non-existent email correctly rejected")


class TestOrdersEndpoint:
    """Test /api/orders endpoint (was broken, now restored)"""
    
    def test_orders_requires_auth(self):
        """Test that /api/orders requires authentication"""
        response = requests.get(f"{BASE_URL}/api/orders")
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        
        print("✓ /api/orders correctly requires authentication")
    
    def test_orders_with_admin_auth(self):
        """Test /api/orders with admin authentication"""
        # Login as admin
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        
        if login_response.status_code != 200:
            pytest.skip(f"Admin login failed: {login_response.text}")
        
        token = login_response.json().get("access_token")
        
        # Get orders with auth
        headers = {"Authorization": f"Bearer {token}"}
        response = requests.get(f"{BASE_URL}/api/orders", headers=headers)
        
        assert response.status_code == 200, f"Orders endpoint failed: {response.text}"
        
        data = response.json()
        # Should return a list of orders
        assert isinstance(data, list), f"Expected list, got {type(data)}"
        
        print(f"✓ /api/orders returned {len(data)} orders")


class TestCustomerDataPersistence:
    """Test that customer data is properly stored and retrievable"""
    
    def test_register_and_verify_data(self):
        """Register a customer and verify all fields are stored"""
        unique_id = str(uuid.uuid4())[:8]
        test_email = f"persist_test_{unique_id}@test.com"
        
        # Register
        register_payload = {
            "name": "Persistence Test User",
            "email": test_email,
            "password": "testpass123",
            "phone": "(805) 999-8888",
            "address": "456 Persistence Ave",
            "city": "Oxnard",
            "state": "CA",
            "zip_code": "93030"
        }
        
        reg_response = requests.post(f"{BASE_URL}/api/customer/auth/register", json=register_payload)
        assert reg_response.status_code == 200
        
        token = reg_response.json()["access_token"]
        
        # Login again to verify data persisted
        login_payload = {
            "email": test_email,
            "password": "testpass123"
        }
        
        login_response = requests.post(f"{BASE_URL}/api/customer/auth/login", json=login_payload)
        assert login_response.status_code == 200
        
        customer = login_response.json()["customer"]
        
        # Verify all fields persisted
        assert customer["name"] == "Persistence Test User"
        assert customer["email"] == test_email.lower()
        assert customer.get("phone") == "(805) 999-8888"
        assert customer.get("city") == "Oxnard"
        assert customer.get("state") == "CA"
        assert customer.get("zip_code") == "93030"
        
        print(f"✓ Customer data persistence verified for {test_email}")


class TestCustomerMeEndpoint:
    """Test /api/customer/me endpoint returns customer data"""
    
    def test_customer_me_with_auth(self):
        """Test /api/customer/me returns customer data"""
        # Login first
        login_response = requests.post(f"{BASE_URL}/api/customer/auth/login", json={
            "email": TEST_CUSTOMER_EMAIL,
            "password": TEST_CUSTOMER_PASSWORD
        })
        
        if login_response.status_code != 200:
            pytest.skip(f"Customer login failed: {login_response.text}")
        
        token = login_response.json()["access_token"]
        
        # Get customer profile
        headers = {"Authorization": f"Bearer {token}"}
        response = requests.get(f"{BASE_URL}/api/customer/me", headers=headers)
        
        assert response.status_code == 200, f"Customer me failed: {response.text}"
        
        data = response.json()
        assert data.get("email") == TEST_CUSTOMER_EMAIL
        
        print(f"✓ /api/customer/me returned customer data")
        print(f"  - Email: {data.get('email')}")
        print(f"  - Name: {data.get('name')}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
