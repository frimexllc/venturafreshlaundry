"""
Test suite for Delivery Rules, KPIs, and Refactored Endpoints
- Delivery Rules: ZIP validation, fee calculation, payment methods
- KPIs: Operational dashboard metrics
- Refactored endpoints: Auth, Dashboard, Customers, Quotes, Leads, Tickets
"""
import pytest
import requests
import os

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")

# Test credentials
ADMIN_EMAIL = "owner@frimexllc.com"
ADMIN_PASSWORD = "Fr!m3x##$$"


class TestAuthEndpoints:
    """Auth endpoints: login, me"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "access_token" in data, "Response missing access_token"
        return data["access_token"]
    
    def test_login_success(self):
        """POST /api/auth/login returns access_token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert "user" in data
        assert data["user"]["email"] == ADMIN_EMAIL
        print(f"Login successful, token type: {data.get('token_type')}")
    
    def test_login_invalid_credentials(self):
        """POST /api/auth/login with wrong password returns 401"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": "wrongpassword"
        })
        assert response.status_code == 401
    
    def test_auth_me(self, auth_token):
        """GET /api/auth/me returns user email and role"""
        response = requests.get(f"{BASE_URL}/api/auth/me", headers={
            "Authorization": f"Bearer {auth_token}"
        })
        assert response.status_code == 200
        data = response.json()
        assert "email" in data
        assert "role" in data
        assert data["email"] == ADMIN_EMAIL
        print(f"Auth me: email={data['email']}, role={data['role']}")


class TestDashboardEndpoints:
    """Dashboard endpoints: stats, recent-activity"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        return response.json()["access_token"]
    
    def test_dashboard_stats(self, auth_token):
        """GET /api/dashboard/stats returns total_customers, total_orders, revenue_this_month"""
        response = requests.get(f"{BASE_URL}/api/dashboard/stats", headers={
            "Authorization": f"Bearer {auth_token}"
        })
        assert response.status_code == 200
        data = response.json()
        assert "total_customers" in data
        assert "total_orders" in data
        assert "revenue_this_month" in data
        print(f"Dashboard stats: customers={data['total_customers']}, orders={data['total_orders']}, revenue=${data['revenue_this_month']}")
    
    def test_dashboard_recent_activity(self, auth_token):
        """GET /api/dashboard/recent-activity returns array of audit logs"""
        response = requests.get(f"{BASE_URL}/api/dashboard/recent-activity", headers={
            "Authorization": f"Bearer {auth_token}"
        })
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Recent activity: {len(data)} logs")


class TestDeliveryRules:
    """Delivery Rules: zones, ZIP validation, fee calculation, payment methods"""
    
    def test_get_delivery_zones(self):
        """GET /api/delivery-rules/zones returns 7 ZIP codes"""
        response = requests.get(f"{BASE_URL}/api/delivery-rules/zones")
        assert response.status_code == 200
        data = response.json()
        assert "zones" in data
        assert len(data["zones"]) == 7
        assert "allowed_payment_methods" in data
        zip_codes = [z["zip_code"] for z in data["zones"]]
        expected_zips = ["93001", "93003", "93004", "93010", "93030", "93035", "93036"]
        for zc in expected_zips:
            assert zc in zip_codes, f"Missing ZIP code: {zc}"
        print(f"Delivery zones: {len(data['zones'])} zones, ZIPs: {zip_codes}")
    
    def test_validate_zip_valid(self):
        """POST /api/delivery-rules/validate-zip with 93001 returns valid:true"""
        response = requests.post(f"{BASE_URL}/api/delivery-rules/validate-zip", json={
            "zip_code": "93001"
        })
        assert response.status_code == 200
        data = response.json()
        assert data["valid"] is True
        assert data["zip_code"] == "93001"
        assert "city" in data
        print(f"ZIP 93001 valid: city={data['city']}, zone={data.get('zone')}")
    
    def test_validate_zip_invalid(self):
        """POST /api/delivery-rules/validate-zip with 90210 returns valid:false"""
        response = requests.post(f"{BASE_URL}/api/delivery-rules/validate-zip", json={
            "zip_code": "90210"
        })
        assert response.status_code == 200
        data = response.json()
        assert data["valid"] is False
        assert "message" in data
        print(f"ZIP 90210 invalid: {data['message']}")
    
    def test_calculate_fee_within_free_zone(self):
        """POST /api/delivery-rules/calculate-fee within 3 miles returns fee:0"""
        response = requests.post(f"{BASE_URL}/api/delivery-rules/calculate-fee", json={
            "zip_code": "93001",
            "distance_miles": 2
        })
        assert response.status_code == 200
        data = response.json()
        assert data["eligible"] is True
        assert data["fee"] == 0
        assert data["free_miles"] == 3
        print(f"Fee for 2 miles in 93001: ${data['fee']} (free within {data['free_miles']} miles)")
    
    def test_calculate_fee_beyond_free_zone(self):
        """POST /api/delivery-rules/calculate-fee beyond 3 miles returns fee:3.0"""
        response = requests.post(f"{BASE_URL}/api/delivery-rules/calculate-fee", json={
            "zip_code": "93003",
            "distance_miles": 5
        })
        assert response.status_code == 200
        data = response.json()
        assert data["eligible"] is True
        # 5 miles - 3 free = 2 extra miles * $1.50 = $3.00
        assert data["fee"] == 3.0
        print(f"Fee for 5 miles in 93003: ${data['fee']} (extra miles: {data.get('extra_miles')})")
    
    def test_calculate_fee_invalid_zip(self):
        """POST /api/delivery-rules/calculate-fee with invalid ZIP returns 400"""
        response = requests.post(f"{BASE_URL}/api/delivery-rules/calculate-fee", json={
            "zip_code": "90210",
            "distance_miles": 5
        })
        assert response.status_code == 400
    
    def test_get_payment_methods(self):
        """GET /api/delivery-rules/payment-methods returns 3 methods"""
        response = requests.get(f"{BASE_URL}/api/delivery-rules/payment-methods")
        assert response.status_code == 200
        data = response.json()
        assert "methods" in data
        assert len(data["methods"]) == 3
        method_ids = [m["id"] for m in data["methods"]]
        assert "card" in method_ids
        assert "zelle" in method_ids
        assert "cash" in method_ids
        print(f"Payment methods: {method_ids}")
    
    def test_validate_payment_valid(self):
        """POST /api/delivery-rules/validate-payment with card returns valid:true"""
        response = requests.post(f"{BASE_URL}/api/delivery-rules/validate-payment", json={
            "payment_method": "card",
            "amount": 50
        })
        assert response.status_code == 200
        data = response.json()
        assert data["valid"] is True
        assert data["method"] == "card"
        print(f"Payment card valid: {data}")
    
    def test_validate_payment_invalid(self):
        """POST /api/delivery-rules/validate-payment with bitcoin returns valid:false"""
        response = requests.post(f"{BASE_URL}/api/delivery-rules/validate-payment", json={
            "payment_method": "bitcoin",
            "amount": 50
        })
        assert response.status_code == 200
        data = response.json()
        assert data["valid"] is False
        assert "message" in data
        print(f"Payment bitcoin invalid: {data['message']}")


class TestKPIsEndpoint:
    """KPIs Operational Dashboard"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        return response.json()["access_token"]
    
    def test_operational_kpis(self, auth_token):
        """GET /api/kpis/operational returns all KPI sections"""
        response = requests.get(f"{BASE_URL}/api/kpis/operational", headers={
            "Authorization": f"Bearer {auth_token}"
        })
        assert response.status_code == 200
        data = response.json()
        
        # Verify all required sections
        assert "orders" in data
        assert "revenue" in data
        assert "expenses" in data
        assert "inventory" in data
        assert "mileage" in data
        assert "customers" in data
        assert "support" in data
        
        # Verify orders section
        orders = data["orders"]
        assert "total" in orders
        assert "today" in orders
        assert "this_week" in orders
        assert "active" in orders
        assert "completed" in orders
        
        # Verify revenue section
        revenue = data["revenue"]
        assert "monthly" in revenue
        assert "paid_orders" in revenue
        assert "avg_ticket" in revenue
        
        # Verify expenses section
        expenses = data["expenses"]
        assert "monthly" in expenses
        assert "net_income" in expenses
        
        # Verify mileage section
        mileage = data["mileage"]
        assert "monthly_miles" in mileage
        assert "irs_deduction" in mileage
        
        # Verify inventory section
        inventory = data["inventory"]
        assert "total_items" in inventory
        assert "low_stock_alerts" in inventory
        assert "pending_purchase_orders" in inventory
        
        # Verify customers section
        customers = data["customers"]
        assert "total" in customers
        assert "new_this_month" in customers
        
        # Verify support section
        support = data["support"]
        assert "open_tickets" in support
        assert "new_leads" in support
        
        print(f"KPIs: orders={orders['total']}, revenue=${revenue['monthly']}, customers={customers['total']}")


class TestCustomersEndpoints:
    """Customers CRUD endpoints"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        return response.json()["access_token"]
    
    def test_get_customers(self, auth_token):
        """GET /api/customers returns list of customers"""
        response = requests.get(f"{BASE_URL}/api/customers", headers={
            "Authorization": f"Bearer {auth_token}"
        })
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Customers: {len(data)} found")
    
    def test_create_customer(self, auth_token):
        """POST /api/customers creates a new customer"""
        response = requests.post(f"{BASE_URL}/api/customers", json={
            "name": "TEST_DeliveryRules_Customer",
            "email": "test_delivery@example.com",
            "phone": "8055551234",
            "address": "123 Test St, Ventura, CA 93001",
            "preferred_contact": "phone"
        }, headers={
            "Authorization": f"Bearer {auth_token}"
        })
        assert response.status_code == 200
        data = response.json()
        assert "id" in data
        assert "name" in data
        print(f"Created customer: {data['id']}, name: {data['name']}")
        return data["id"]
    
    def test_get_customer_by_id(self, auth_token):
        """GET /api/customers/{id} returns customer details"""
        # First create a customer
        create_resp = requests.post(f"{BASE_URL}/api/customers", json={
            "name": "TEST_GetById_Customer",
            "email": "test_getbyid@example.com",
            "phone": "8055551235"
        }, headers={
            "Authorization": f"Bearer {auth_token}"
        })
        customer_id = create_resp.json()["id"]
        
        # Then get by ID
        response = requests.get(f"{BASE_URL}/api/customers/{customer_id}", headers={
            "Authorization": f"Bearer {auth_token}"
        })
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == customer_id
        print(f"Got customer by ID: {data['name']}")


class TestQuotesEndpoints:
    """Quotes CRUD endpoints"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        return response.json()["access_token"]
    
    def test_get_quotes(self, auth_token):
        """GET /api/quotes returns list of quotes"""
        response = requests.get(f"{BASE_URL}/api/quotes", headers={
            "Authorization": f"Bearer {auth_token}"
        })
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Quotes: {len(data)} found")
    
    def test_create_quote(self, auth_token):
        """POST /api/quotes creates a new quote"""
        response = requests.post(f"{BASE_URL}/api/quotes", json={
            "company_name": "TEST_B2B_Company",
            "contact_name": "John Doe",
            "email": "test_b2b@example.com",
            "phone": "8055551236",
            "industry": "hospitality",
            "estimated_lbs_per_week": 500,
            "service_needs": "Weekly pickup and delivery",
            "notes": "Test quote for delivery rules testing"
        }, headers={
            "Authorization": f"Bearer {auth_token}"
        })
        assert response.status_code == 200
        data = response.json()
        assert "quote_number" in data
        assert data["company_name"] == "TEST_B2B_Company"
        print(f"Created quote: {data['quote_number']}")


class TestLeadsEndpoints:
    """Leads CRUD endpoints"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        return response.json()["access_token"]
    
    def test_get_leads(self, auth_token):
        """GET /api/leads returns list of leads"""
        response = requests.get(f"{BASE_URL}/api/leads", headers={
            "Authorization": f"Bearer {auth_token}"
        })
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Leads: {len(data)} found")
    
    def test_create_lead(self, auth_token):
        """POST /api/leads creates a new lead"""
        response = requests.post(f"{BASE_URL}/api/leads", json={
            "name": "TEST_Lead_Person",
            "email": "test_lead@example.com",
            "phone": "8055551237",
            "source": "website",
            "interest_type": "residential",
            "notes": "Test lead for delivery rules testing"
        }, headers={
            "Authorization": f"Bearer {auth_token}"
        })
        assert response.status_code == 200
        data = response.json()
        assert "id" in data
        assert data["name"] == "TEST_Lead_Person"
        print(f"Created lead: {data['id']}")


class TestTicketsEndpoints:
    """Tickets CRUD endpoints"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        return response.json()["access_token"]
    
    def test_get_tickets(self, auth_token):
        """GET /api/tickets returns list of tickets"""
        response = requests.get(f"{BASE_URL}/api/tickets", headers={
            "Authorization": f"Bearer {auth_token}"
        })
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Tickets: {len(data)} found")
    
    def test_create_ticket(self, auth_token):
        """POST /api/tickets creates a new ticket"""
        response = requests.post(f"{BASE_URL}/api/tickets", json={
            "subject": "TEST_Ticket_Subject",
            "description": "Test ticket for delivery rules testing",
            "category": "general"
        }, headers={
            "Authorization": f"Bearer {auth_token}"
        })
        assert response.status_code == 200
        data = response.json()
        assert "ticket_number" in data
        assert data["subject"] == "TEST_Ticket_Subject"
        print(f"Created ticket: {data['ticket_number']}")


class TestTicketSVG:
    """Ticket SVG endpoint"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        return response.json()["access_token"]
    
    def test_get_order_qr_svg(self, auth_token):
        """GET /api/orders/{order_id}/qr.svg returns SVG with price breakdown"""
        # First get an existing order
        orders_resp = requests.get(f"{BASE_URL}/api/orders", headers={
            "Authorization": f"Bearer {auth_token}"
        })
        assert orders_resp.status_code == 200
        orders = orders_resp.json()
        
        if not orders:
            pytest.skip("No orders available to test SVG generation")
        
        order_id = orders[0]["id"]
        
        # Get the SVG
        response = requests.get(f"{BASE_URL}/api/orders/{order_id}/qr.svg", headers={
            "Authorization": f"Bearer {auth_token}"
        })
        assert response.status_code == 200
        assert response.headers.get("content-type") == "image/svg+xml"
        assert "Content-Disposition" in response.headers
        
        # Verify SVG content
        svg_content = response.text
        assert "<svg" in svg_content
        assert "VENTURA FRESH LAUNDRY" in svg_content
        assert "WEIGHT METRICS" in svg_content or "METRICAS DE PESO" in svg_content
        assert "PRICE BREAKDOWN" in svg_content or "DESGLOSE" in svg_content
        
        print(f"SVG generated for order {order_id}, size: {len(svg_content)} bytes")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
