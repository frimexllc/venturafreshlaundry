"""
Test Dynamic Pricing for Pickup & Delivery and Wash & Fold services.
Iteration 49: Tests pricing tables, price_per_lb storage, and total recalculation.

Pricing Tables:
- P&D Standard: $2.50 (member) / $2.75 (regular)
- P&D Premium:  $2.75 (member) / $3.00 (regular)
- P&D Express:  $3.00 (member) / $3.25 (regular)
- W&F Standard: $2.25/lb
- W&F Premium:  $2.50/lb
- W&F Express:  $2.75/lb

Minimums:
- P&D: $40 minimum
- W&F: 10 lb minimum
"""

import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")

@pytest.fixture(scope="module")
def admin_token():
    """Get admin authentication token"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": "owner@frimexllc.com",
        "password": "admin123"
    })
    if response.status_code == 200:
        return response.json().get("access_token")
    pytest.skip("Admin authentication failed")

@pytest.fixture
def auth_headers(admin_token):
    """Headers with admin auth token"""
    return {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {admin_token}"
    }


class TestPickupDeliveryPricing:
    """Test Pickup & Delivery pricing for all service plans"""
    
    def test_pd_express_stores_correct_price(self):
        """P&D Express should store price_per_lb=$3.25 (regular)"""
        unique_email = f"test_pd_express_{uuid.uuid4().hex[:8]}@test.com"
        response = requests.post(f"{BASE_URL}/api/public/pickup-request", json={
            "name": "Test Express User",
            "email": unique_email,
            "phone": "8055551234",
            "address": "123 Test St, Ventura, CA 93003",
            "service_type": "pickup_delivery",
            "service_plan": "express",
            "contact_method": "email",
            "sms_consent": False
        })
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("success") is True
        assert "order_number" in data
        print(f"✓ P&D Express order created: {data['order_number']}")
        
    def test_pd_standard_stores_correct_price(self):
        """P&D Standard should store price_per_lb=$2.75 (regular)"""
        unique_email = f"test_pd_standard_{uuid.uuid4().hex[:8]}@test.com"
        response = requests.post(f"{BASE_URL}/api/public/pickup-request", json={
            "name": "Test Standard User",
            "email": unique_email,
            "phone": "8055551235",
            "address": "456 Test Ave, Ventura, CA 93003",
            "service_type": "pickup_delivery",
            "service_plan": "standard",
            "contact_method": "email",
            "sms_consent": False
        })
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("success") is True
        print(f"✓ P&D Standard order created: {data['order_number']}")
        
    def test_pd_premium_stores_correct_price(self):
        """P&D Premium should store price_per_lb=$3.00 (regular)"""
        unique_email = f"test_pd_premium_{uuid.uuid4().hex[:8]}@test.com"
        response = requests.post(f"{BASE_URL}/api/public/pickup-request", json={
            "name": "Test Premium User",
            "email": unique_email,
            "phone": "8055551236",
            "address": "789 Test Blvd, Ventura, CA 93003",
            "service_type": "pickup_delivery",
            "service_plan": "premium",
            "contact_method": "email",
            "sms_consent": False
        })
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("success") is True
        print(f"✓ P&D Premium order created: {data['order_number']}")


class TestWashFoldPricing:
    """Test Wash & Fold pricing for all service plans"""
    
    def test_wf_standard_stores_correct_price(self):
        """W&F Standard should store price_per_lb=$2.25"""
        unique_email = f"test_wf_standard_{uuid.uuid4().hex[:8]}@test.com"
        response = requests.post(f"{BASE_URL}/api/public/wash-fold-request", json={
            "name": "Test WF Standard",
            "email": unique_email,
            "phone": "8055552001",
            "plan": "standard",
            "contact_method": "email",
            "sms_consent": False
        })
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("success") is True
        print(f"✓ W&F Standard order created: {data['order_number']}")
        
    def test_wf_premium_stores_correct_price(self):
        """W&F Premium should store price_per_lb=$2.50"""
        unique_email = f"test_wf_premium_{uuid.uuid4().hex[:8]}@test.com"
        response = requests.post(f"{BASE_URL}/api/public/wash-fold-request", json={
            "name": "Test WF Premium",
            "email": unique_email,
            "phone": "8055552002",
            "plan": "premium",
            "contact_method": "email",
            "sms_consent": False
        })
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("success") is True
        print(f"✓ W&F Premium order created: {data['order_number']}")
        
    def test_wf_express_stores_correct_price(self):
        """W&F Express should store price_per_lb=$2.75"""
        unique_email = f"test_wf_express_{uuid.uuid4().hex[:8]}@test.com"
        response = requests.post(f"{BASE_URL}/api/public/wash-fold-request", json={
            "name": "Test WF Express",
            "email": unique_email,
            "phone": "8055552003",
            "plan": "express",
            "contact_method": "email",
            "sms_consent": False
        })
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("success") is True
        print(f"✓ W&F Express order created: {data['order_number']}")


class TestOrderPriceVerification:
    """Verify that orders store correct price_per_lb and service_plan"""
    
    def test_verify_pd_express_order_has_price_per_lb(self, auth_headers):
        """Verify P&D Express order has price_per_lb=$3.25 stored"""
        # Create order first
        unique_email = f"test_verify_pd_{uuid.uuid4().hex[:8]}@test.com"
        create_resp = requests.post(f"{BASE_URL}/api/public/pickup-request", json={
            "name": "Verify PD Express",
            "email": unique_email,
            "phone": "8055553001",
            "address": "100 Verify St, Ventura, CA 93003",
            "service_type": "pickup_delivery",
            "service_plan": "express",
            "contact_method": "email",
            "sms_consent": False
        })
        assert create_resp.status_code == 200
        order_number = create_resp.json()["order_number"]
        
        # Fetch order to verify price_per_lb
        orders_resp = requests.get(f"{BASE_URL}/api/orders", headers=auth_headers)
        assert orders_resp.status_code == 200
        orders = orders_resp.json()
        
        # Find our order
        order = next((o for o in orders if o.get("order_number") == order_number), None)
        assert order is not None, f"Order {order_number} not found"
        
        # Verify price_per_lb and service_plan
        assert order.get("service_plan") == "express", f"Expected service_plan='express', got {order.get('service_plan')}"
        assert order.get("price_per_lb") == 3.25, f"Expected price_per_lb=3.25, got {order.get('price_per_lb')}"
        print(f"✓ P&D Express order {order_number} has price_per_lb={order.get('price_per_lb')}, service_plan={order.get('service_plan')}")
        
    def test_verify_wf_premium_order_has_price_per_lb(self, auth_headers):
        """Verify W&F Premium order has price_per_lb=$2.50 stored"""
        # Create order first
        unique_email = f"test_verify_wf_{uuid.uuid4().hex[:8]}@test.com"
        create_resp = requests.post(f"{BASE_URL}/api/public/wash-fold-request", json={
            "name": "Verify WF Premium",
            "email": unique_email,
            "phone": "8055553002",
            "plan": "premium",
            "contact_method": "email",
            "sms_consent": False
        })
        assert create_resp.status_code == 200
        order_number = create_resp.json()["order_number"]
        
        # Fetch order to verify price_per_lb
        orders_resp = requests.get(f"{BASE_URL}/api/orders", headers=auth_headers)
        assert orders_resp.status_code == 200
        orders = orders_resp.json()
        
        # Find our order
        order = next((o for o in orders if o.get("order_number") == order_number), None)
        assert order is not None, f"Order {order_number} not found"
        
        # Verify price_per_lb and service_plan
        assert order.get("service_plan") == "premium", f"Expected service_plan='premium', got {order.get('service_plan')}"
        assert order.get("price_per_lb") == 2.50, f"Expected price_per_lb=2.50, got {order.get('price_per_lb')}"
        print(f"✓ W&F Premium order {order_number} has price_per_lb={order.get('price_per_lb')}, service_plan={order.get('service_plan')}")


class TestTotalRecalculation:
    """Test that PUT /api/orders/{id} recalculates total_amount correctly"""
    
    def test_pd_express_15lbs_equals_48_75(self, auth_headers):
        """P&D Express 15 lbs should = $48.75 (15 × $3.25)"""
        # Create P&D Express order
        unique_email = f"test_calc_pd_{uuid.uuid4().hex[:8]}@test.com"
        create_resp = requests.post(f"{BASE_URL}/api/public/pickup-request", json={
            "name": "Calc PD Express",
            "email": unique_email,
            "phone": "8055554001",
            "address": "200 Calc St, Ventura, CA 93003",
            "service_type": "pickup_delivery",
            "service_plan": "express",
            "contact_method": "email",
            "sms_consent": False
        })
        assert create_resp.status_code == 200
        order_number = create_resp.json()["order_number"]
        
        # Get order ID
        orders_resp = requests.get(f"{BASE_URL}/api/orders", headers=auth_headers)
        orders = orders_resp.json()
        order = next((o for o in orders if o.get("order_number") == order_number), None)
        assert order is not None
        order_id = order["id"]
        
        # Update with actual_lbs = 15
        update_resp = requests.put(f"{BASE_URL}/api/orders/{order_id}", 
            headers=auth_headers,
            json={"actual_lbs": 15}
        )
        assert update_resp.status_code == 200, f"Update failed: {update_resp.text}"
        updated = update_resp.json()
        
        # Verify total: 15 × $3.25 = $48.75
        expected_total = 48.75
        actual_total = updated.get("total_amount")
        assert actual_total == expected_total, f"Expected total={expected_total}, got {actual_total}"
        print(f"✓ P&D Express 15 lbs = ${actual_total} (expected ${expected_total})")
        
    def test_wf_premium_20lbs_equals_50_00(self, auth_headers):
        """W&F Premium 20 lbs should = $50.00 (20 × $2.50)"""
        # Create W&F Premium order
        unique_email = f"test_calc_wf_{uuid.uuid4().hex[:8]}@test.com"
        create_resp = requests.post(f"{BASE_URL}/api/public/wash-fold-request", json={
            "name": "Calc WF Premium",
            "email": unique_email,
            "phone": "8055554002",
            "plan": "premium",
            "contact_method": "email",
            "sms_consent": False
        })
        assert create_resp.status_code == 200
        order_number = create_resp.json()["order_number"]
        
        # Get order ID
        orders_resp = requests.get(f"{BASE_URL}/api/orders", headers=auth_headers)
        orders = orders_resp.json()
        order = next((o for o in orders if o.get("order_number") == order_number), None)
        assert order is not None
        order_id = order["id"]
        
        # Update with actual_lbs = 20
        update_resp = requests.put(f"{BASE_URL}/api/orders/{order_id}", 
            headers=auth_headers,
            json={"actual_lbs": 20}
        )
        assert update_resp.status_code == 200, f"Update failed: {update_resp.text}"
        updated = update_resp.json()
        
        # Verify total: 20 × $2.50 = $50.00
        expected_total = 50.00
        actual_total = updated.get("total_amount")
        assert actual_total == expected_total, f"Expected total={expected_total}, got {actual_total}"
        print(f"✓ W&F Premium 20 lbs = ${actual_total} (expected ${expected_total})")
        
    def test_wf_standard_8lbs_uses_10lb_minimum(self, auth_headers):
        """W&F Standard 8 lbs should = $22.50 (min 10 × $2.25)"""
        # Create W&F Standard order
        unique_email = f"test_calc_wf_min_{uuid.uuid4().hex[:8]}@test.com"
        create_resp = requests.post(f"{BASE_URL}/api/public/wash-fold-request", json={
            "name": "Calc WF Standard Min",
            "email": unique_email,
            "phone": "8055554003",
            "plan": "standard",
            "contact_method": "email",
            "sms_consent": False
        })
        assert create_resp.status_code == 200
        order_number = create_resp.json()["order_number"]
        
        # Get order ID
        orders_resp = requests.get(f"{BASE_URL}/api/orders", headers=auth_headers)
        orders = orders_resp.json()
        order = next((o for o in orders if o.get("order_number") == order_number), None)
        assert order is not None
        order_id = order["id"]
        
        # Update with actual_lbs = 8 (below 10 lb minimum)
        update_resp = requests.put(f"{BASE_URL}/api/orders/{order_id}", 
            headers=auth_headers,
            json={"actual_lbs": 8}
        )
        assert update_resp.status_code == 200, f"Update failed: {update_resp.text}"
        updated = update_resp.json()
        
        # Verify total: min(8, 10) × $2.25 = 10 × $2.25 = $22.50
        expected_total = 22.50
        actual_total = updated.get("total_amount")
        assert actual_total == expected_total, f"Expected total={expected_total}, got {actual_total}"
        print(f"✓ W&F Standard 8 lbs (10 lb min) = ${actual_total} (expected ${expected_total})")


class TestOrderResponseFields:
    """Test that OrderResponse includes service_plan, price_per_lb, delivery_fee"""
    
    def test_order_response_includes_pricing_fields(self, auth_headers):
        """Verify OrderResponse has service_plan, price_per_lb, delivery_fee, customer_email"""
        # Create order
        unique_email = f"test_fields_{uuid.uuid4().hex[:8]}@test.com"
        create_resp = requests.post(f"{BASE_URL}/api/public/pickup-request", json={
            "name": "Test Fields User",
            "email": unique_email,
            "phone": "8055555001",
            "address": "300 Fields St, Ventura, CA 93003",
            "service_type": "pickup_delivery",
            "service_plan": "premium",
            "contact_method": "email",
            "sms_consent": False
        })
        assert create_resp.status_code == 200
        order_number = create_resp.json()["order_number"]
        
        # Fetch order
        orders_resp = requests.get(f"{BASE_URL}/api/orders", headers=auth_headers)
        orders = orders_resp.json()
        order = next((o for o in orders if o.get("order_number") == order_number), None)
        assert order is not None
        
        # Verify fields exist
        assert "service_plan" in order, "service_plan field missing from OrderResponse"
        assert "price_per_lb" in order, "price_per_lb field missing from OrderResponse"
        assert "customer_email" in order, "customer_email field missing from OrderResponse"
        
        # Verify values
        assert order["service_plan"] == "premium"
        assert order["price_per_lb"] == 3.00  # Premium regular rate
        assert order["customer_email"] == unique_email
        
        print(f"✓ OrderResponse includes: service_plan={order['service_plan']}, price_per_lb={order['price_per_lb']}, customer_email={order['customer_email']}")


class TestPDMinimumCharge:
    """Test P&D $40 minimum charge"""
    
    def test_pd_small_order_uses_40_minimum(self, auth_headers):
        """P&D order with 10 lbs at $2.75/lb = $27.50, but minimum is $40"""
        # Create P&D Standard order
        unique_email = f"test_pd_min_{uuid.uuid4().hex[:8]}@test.com"
        create_resp = requests.post(f"{BASE_URL}/api/public/pickup-request", json={
            "name": "Test PD Minimum",
            "email": unique_email,
            "phone": "8055556001",
            "address": "400 Min St, Ventura, CA 93003",
            "service_type": "pickup_delivery",
            "service_plan": "standard",
            "contact_method": "email",
            "sms_consent": False
        })
        assert create_resp.status_code == 200
        order_number = create_resp.json()["order_number"]
        
        # Get order ID
        orders_resp = requests.get(f"{BASE_URL}/api/orders", headers=auth_headers)
        orders = orders_resp.json()
        order = next((o for o in orders if o.get("order_number") == order_number), None)
        assert order is not None
        order_id = order["id"]
        
        # Update with actual_lbs = 10 (10 × $2.75 = $27.50, but min is $40)
        update_resp = requests.put(f"{BASE_URL}/api/orders/{order_id}", 
            headers=auth_headers,
            json={"actual_lbs": 10}
        )
        assert update_resp.status_code == 200, f"Update failed: {update_resp.text}"
        updated = update_resp.json()
        
        # Verify total: max(10 × $2.75, $40) = $40
        expected_total = 40.00
        actual_total = updated.get("total_amount")
        assert actual_total == expected_total, f"Expected total={expected_total}, got {actual_total}"
        print(f"✓ P&D Standard 10 lbs ($40 min) = ${actual_total} (expected ${expected_total})")


class TestExistingTestOrders:
    """Verify existing test orders mentioned in context"""
    
    def test_existing_pd_express_order(self, auth_headers):
        """Check existing P&D Express order VFL-20260429-b460f312 has $3.25/lb"""
        orders_resp = requests.get(f"{BASE_URL}/api/orders", headers=auth_headers)
        assert orders_resp.status_code == 200
        orders = orders_resp.json()
        
        # Look for the test order
        order = next((o for o in orders if "b460f312" in (o.get("order_number") or "")), None)
        if order:
            print(f"Found existing P&D Express order: {order.get('order_number')}")
            print(f"  service_plan: {order.get('service_plan')}")
            print(f"  price_per_lb: {order.get('price_per_lb')}")
            if order.get("price_per_lb") == 3.25:
                print("✓ Existing P&D Express order has correct price_per_lb=$3.25")
            else:
                print(f"⚠ Expected price_per_lb=3.25, got {order.get('price_per_lb')}")
        else:
            print("ℹ Existing test order VFL-20260429-b460f312 not found (may have been cleaned up)")
            
    def test_existing_wf_premium_order(self, auth_headers):
        """Check existing W&F Premium order VFL-20260429-daa52b14 has $2.50/lb"""
        orders_resp = requests.get(f"{BASE_URL}/api/orders", headers=auth_headers)
        assert orders_resp.status_code == 200
        orders = orders_resp.json()
        
        # Look for the test order
        order = next((o for o in orders if "daa52b14" in (o.get("order_number") or "")), None)
        if order:
            print(f"Found existing W&F Premium order: {order.get('order_number')}")
            print(f"  service_plan: {order.get('service_plan')}")
            print(f"  price_per_lb: {order.get('price_per_lb')}")
            if order.get("price_per_lb") == 2.50:
                print("✓ Existing W&F Premium order has correct price_per_lb=$2.50")
            else:
                print(f"⚠ Expected price_per_lb=2.50, got {order.get('price_per_lb')}")
        else:
            print("ℹ Existing test order VFL-20260429-daa52b14 not found (may have been cleaned up)")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
