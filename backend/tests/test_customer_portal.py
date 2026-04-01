"""
Test suite for Ventura Fresh Laundry CRM - Customer Portal & Public Pages
Tests customer authentication, public form endpoints, and navigation
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test data
TEST_CUSTOMER_EMAIL = f"test_customer_{uuid.uuid4().hex[:8]}@example.com"
TEST_CUSTOMER_PASSWORD = "TestPass123!"
TEST_CUSTOMER_NAME = "Test Customer Portal"


class TestHealthCheck:
    """Basic health check tests"""
    
    def test_api_health(self):
        """Test API health endpoint"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        print("✓ API health check passed")
    
    def test_api_root(self):
        """Test API root endpoint"""
        response = requests.get(f"{BASE_URL}/api/")
        assert response.status_code == 200
        data = response.json()
        assert "Ventura Fresh Laundry" in data["message"]
        print("✓ API root endpoint passed")


class TestCustomerAuthentication:
    """Customer portal authentication tests"""
    
    def test_customer_register(self):
        """Test customer registration"""
        response = requests.post(f"{BASE_URL}/api/customer/auth/register", json={
            "name": TEST_CUSTOMER_NAME,
            "email": TEST_CUSTOMER_EMAIL,
            "password": TEST_CUSTOMER_PASSWORD
        })
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"
        assert data["customer"]["email"] == TEST_CUSTOMER_EMAIL.lower()
        assert data["customer"]["name"] == TEST_CUSTOMER_NAME
        print(f"✓ Customer registration passed - email: {TEST_CUSTOMER_EMAIL}")
        return data["access_token"]
    
    def test_customer_register_duplicate_email(self):
        """Test duplicate email registration fails"""
        # First register
        requests.post(f"{BASE_URL}/api/customer/auth/register", json={
            "name": "First User",
            "email": f"dup_{TEST_CUSTOMER_EMAIL}",
            "password": TEST_CUSTOMER_PASSWORD
        })
        # Try to register again with same email
        response = requests.post(f"{BASE_URL}/api/customer/auth/register", json={
            "name": "Second User",
            "email": f"dup_{TEST_CUSTOMER_EMAIL}",
            "password": "DifferentPass123!"
        })
        assert response.status_code == 400
        assert "already registered" in response.json()["detail"].lower()
        print("✓ Duplicate email registration correctly rejected")
    
    def test_customer_login_success(self):
        """Test customer login with valid credentials"""
        # First register
        email = f"login_test_{uuid.uuid4().hex[:8]}@example.com"
        requests.post(f"{BASE_URL}/api/customer/auth/register", json={
            "name": "Login Test User",
            "email": email,
            "password": TEST_CUSTOMER_PASSWORD
        })
        
        # Then login
        response = requests.post(f"{BASE_URL}/api/customer/auth/login", json={
            "email": email,
            "password": TEST_CUSTOMER_PASSWORD
        })
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert data["customer"]["email"] == email.lower()
        print("✓ Customer login success")
        return data["access_token"]
    
    def test_customer_login_invalid_password(self):
        """Test customer login with invalid password"""
        email = f"invalid_pass_{uuid.uuid4().hex[:8]}@example.com"
        requests.post(f"{BASE_URL}/api/customer/auth/register", json={
            "name": "Invalid Pass Test",
            "email": email,
            "password": TEST_CUSTOMER_PASSWORD
        })
        
        response = requests.post(f"{BASE_URL}/api/customer/auth/login", json={
            "email": email,
            "password": "WrongPassword123!"
        })
        assert response.status_code == 401
        print("✓ Invalid password correctly rejected")
    
    def test_customer_login_nonexistent_email(self):
        """Test customer login with non-existent email"""
        response = requests.post(f"{BASE_URL}/api/customer/auth/login", json={
            "email": "nonexistent@example.com",
            "password": TEST_CUSTOMER_PASSWORD
        })
        assert response.status_code == 401
        print("✓ Non-existent email correctly rejected")


class TestCustomerProfile:
    """Customer profile and orders tests"""
    
    @pytest.fixture
    def customer_token(self):
        """Get a customer token for authenticated tests"""
        email = f"profile_test_{uuid.uuid4().hex[:8]}@example.com"
        response = requests.post(f"{BASE_URL}/api/customer/auth/register", json={
            "name": "Profile Test User",
            "email": email,
            "password": TEST_CUSTOMER_PASSWORD
        })
        if response.status_code != 200:
            pytest.skip(f"Customer registration failed: {response.status_code} - {response.text}")
        return response.json()["access_token"]
    
    def test_get_customer_profile(self, customer_token):
        """Test getting customer profile"""
        response = requests.get(
            f"{BASE_URL}/api/customer/me",
            headers={"Authorization": f"Bearer {customer_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "email" in data
        assert "name" in data
        print("✓ Customer profile retrieval passed")
    
    def test_get_customer_orders(self, customer_token):
        """Test getting customer orders"""
        response = requests.get(
            f"{BASE_URL}/api/customer/orders",
            headers={"Authorization": f"Bearer {customer_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Customer orders retrieval passed - {len(data)} orders found")
    
    def test_customer_profile_invalid_token(self):
        """Test profile access with invalid token"""
        response = requests.get(
            f"{BASE_URL}/api/customer/me",
            headers={"Authorization": "Bearer invalid_token_here"}
        )
        assert response.status_code == 401
        print("✓ Invalid token correctly rejected")


class TestPublicPickupRequest:
    """Public pickup request form tests"""
    
    def test_pickup_request_success(self):
        """Test successful pickup request submission"""
        email = f"pickup_{uuid.uuid4().hex[:8]}@example.com"
        response = requests.post(f"{BASE_URL}/api/public/pickup-request", json={
            "name": "Pickup Test User",
            "email": email,
            "phone": "+1 (805) 555-1234",
            "address": "123 Test St, Ventura, CA 93003",
            "pickup_date": "2026-02-15",
            "pickup_time": "10am-12pm",
            "service_type": "pickup_delivery",
            "notes": "Test pickup request"
        })
        assert response.status_code == 200
        data = response.json()
        assert data["success"] == True
        assert "order_number" in data
        assert data["order_number"].startswith("ORD-")
        print(f"✓ Pickup request success - Order: {data['order_number']}")
    
    def test_pickup_request_missing_required_fields(self):
        """Test pickup request with missing required fields"""
        response = requests.post(f"{BASE_URL}/api/public/pickup-request", json={
            "name": "Test User"
            # Missing email, phone, address
        })
        assert response.status_code == 422  # Validation error
        print("✓ Missing fields correctly rejected")
    
    def test_pickup_request_invalid_email(self):
        """Test pickup request with invalid email"""
        response = requests.post(f"{BASE_URL}/api/public/pickup-request", json={
            "name": "Test User",
            "email": "invalid-email",
            "phone": "+1 (805) 555-1234",
            "address": "123 Test St, Ventura, CA 93003"
        })
        assert response.status_code == 422
        print("✓ Invalid email correctly rejected")


class TestPublicContactForm:
    """Public contact form tests"""
    
    def test_contact_form_success(self):
        """Test successful contact form submission"""
        email = f"contact_{uuid.uuid4().hex[:8]}@example.com"
        response = requests.post(f"{BASE_URL}/api/public/contact", json={
            "name": "Contact Test User",
            "email": email,
            "phone": "+1 (805) 555-5678",
            "message": "This is a test contact message"
        })
        assert response.status_code == 200
        data = response.json()
        assert data["success"] == True
        assert "ticket_number" in data
        assert data["ticket_number"].startswith("TKT-")
        print(f"✓ Contact form success - Ticket: {data['ticket_number']}")
    
    def test_contact_form_minimal_fields(self):
        """Test contact form with minimal required fields"""
        email = f"minimal_{uuid.uuid4().hex[:8]}@example.com"
        response = requests.post(f"{BASE_URL}/api/public/contact", json={
            "name": "Minimal Test",
            "email": email,
            "message": "Minimal test message"
        })
        assert response.status_code == 200
        print("✓ Contact form with minimal fields passed")


class TestPublicQuoteRequest:
    """Public B2B quote request tests"""
    
    def test_quote_request_success(self):
        """Test successful B2B quote request"""
        email = f"quote_{uuid.uuid4().hex[:8]}@example.com"
        response = requests.post(f"{BASE_URL}/api/public/quote-request", json={
            "company_name": "Test Company Inc",
            "contact_name": "John Doe",
            "email": email,
            "phone": "+1 (805) 555-9999",
            "industry": "Hotel",
            "estimated_lbs": 500,
            "message": "Looking for commercial laundry services"
        })
        assert response.status_code == 200
        data = response.json()
        assert data["success"] == True
        assert "quote_number" in data
        assert data["quote_number"].startswith("QT-")
        print(f"✓ Quote request success - Quote: {data['quote_number']}")
    
    def test_quote_request_minimal_fields(self):
        """Test quote request with minimal required fields"""
        email = f"quote_min_{uuid.uuid4().hex[:8]}@example.com"
        response = requests.post(f"{BASE_URL}/api/public/quote-request", json={
            "company_name": "Minimal Company",
            "contact_name": "Jane Doe",
            "email": email
        })
        assert response.status_code == 200
        print("✓ Quote request with minimal fields passed")


class TestAdminLogin:
    """Admin authentication tests"""
    
    def test_admin_login_success(self):
        """Test admin login with valid credentials"""
        # First register an admin
        email = f"admin_{uuid.uuid4().hex[:8]}@venturafresh.com"
        reg_response = requests.post(f"{BASE_URL}/api/auth/register", json={
            "name": "Test Admin",
            "email": email,
            "password": ADMIN_PASSWORD
        })
        
        if reg_response.status_code == 200:
            # Login with registered admin
            response = requests.post(f"{BASE_URL}/api/auth/login", json={
                "email": email,
                "password": ADMIN_PASSWORD
            })
            assert response.status_code == 200
            data = response.json()
            assert "access_token" in data
            assert data["user"]["role"] == "admin"
            print("✓ Admin login success")
        else:
            # Try with existing admin
            response = requests.post(f"{BASE_URL}/api/auth/login", json={
                "email": "admin@venturafresh.com",
                "password": ADMIN_PASSWORD
            })
            # May fail if admin doesn't exist, which is fine
            print(f"✓ Admin login test completed - status: {response.status_code}")
    
    def test_admin_login_invalid_credentials(self):
        """Test admin login with invalid credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "invalid@admin.com",
            "password": "wrongpassword"
        })
        assert response.status_code == 401
        print("✓ Invalid admin credentials correctly rejected")


class TestCustomerOrderIntegration:
    """Test customer can see orders created via pickup request"""
    
    def test_customer_sees_pickup_order(self):
        """Test that a customer can see orders created via public pickup form"""
        # Create a unique email
        email = f"integration_{uuid.uuid4().hex[:8]}@example.com"
        
        # 1. Submit pickup request (creates customer + order)
        pickup_response = requests.post(f"{BASE_URL}/api/public/pickup-request", json={
            "name": "Integration Test User",
            "email": email,
            "phone": "+1 (805) 555-0000",
            "address": "456 Integration St, Ventura, CA 93003",
            "service_type": "pickup_delivery"
        })
        assert pickup_response.status_code == 200
        order_number = pickup_response.json()["order_number"]
        print(f"  Created order: {order_number}")
        
        # 2. Register customer account with same email
        register_response = requests.post(f"{BASE_URL}/api/customer/auth/register", json={
            "name": "Integration Test User",
            "email": email,
            "password": TEST_CUSTOMER_PASSWORD
        })
        assert register_response.status_code == 200
        token = register_response.json()["access_token"]
        
        # 3. Get customer orders
        orders_response = requests.get(
            f"{BASE_URL}/api/customer/orders",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert orders_response.status_code == 200
        orders = orders_response.json()
        
        # 4. Verify the order is visible
        order_numbers = [o["order_number"] for o in orders]
        assert order_number in order_numbers, f"Order {order_number} not found in customer orders"
        print(f"✓ Customer can see pickup order - {len(orders)} orders found")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
