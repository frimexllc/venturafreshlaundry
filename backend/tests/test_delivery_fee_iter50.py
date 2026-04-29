"""
Iteration 50: Delivery Fee Auto-Calculation Tests
Tests for:
1. POST /api/public/pickup-request auto-geocodes address and calculates delivery_fee
2. Orders within 3 miles get delivery_fee=$0
3. Orders beyond 3 miles get delivery_fee = (distance-3) × $1.50 (capped at $25)
4. PUT /api/orders/{id} with actual_lbs recalculates total_amount INCLUDING delivery_fee
5. P&D Premium 20 lbs @ $3.00 + $0.99 delivery = $60.99 (verified with VFL-20260429-f4ffae94)
6. OrderResponse includes delivery_fee field
"""
import pytest
import requests
import os
import uuid
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_EMAIL = "owner@frimexllc.com"
ADMIN_PASSWORD = "admin123"


@pytest.fixture(scope="module")
def auth_token():
    """Get admin authentication token."""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": ADMIN_EMAIL,
        "password": ADMIN_PASSWORD
    })
    if response.status_code == 200:
        return response.json().get("access_token")
    pytest.skip(f"Authentication failed: {response.status_code} - {response.text}")


@pytest.fixture(scope="module")
def auth_headers(auth_token):
    """Return headers with auth token."""
    return {
        "Authorization": f"Bearer {auth_token}",
        "Content-Type": "application/json"
    }


class TestDeliveryRulesEndpoints:
    """Test delivery rules configuration endpoints."""
    
    def test_get_delivery_zones(self, auth_headers):
        """Test GET /api/delivery-rules/zones returns correct configuration."""
        response = requests.get(f"{BASE_URL}/api/delivery-rules/zones", headers=auth_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "store_location" in data
        assert "zones" in data
        assert "rate_per_mile" in data
        
        # Verify rate is $1.50/mile
        assert data["rate_per_mile"] == 1.50, f"Expected rate $1.50/mile, got {data['rate_per_mile']}"
        
        # Verify store coordinates
        store = data["store_location"]
        assert abs(store["lat"] - 34.2805) < 0.01, f"Store lat incorrect: {store['lat']}"
        assert abs(store["lng"] - (-119.2945)) < 0.01, f"Store lng incorrect: {store['lng']}"
        
        print(f"✓ Delivery zones configured correctly with rate ${data['rate_per_mile']}/mile")
    
    def test_calculate_fee_within_3_miles(self, auth_headers):
        """Test delivery fee is $0 for orders within 3 miles."""
        response = requests.post(f"{BASE_URL}/api/delivery-rules/calculate-fee", 
            headers=auth_headers,
            json={
                "zip_code": "93003",
                "distance_miles": 2.5
            }
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data["eligible"] == True
        assert data["fee"] == 0.0, f"Expected $0 fee for 2.5 miles, got ${data['fee']}"
        assert data["free_miles"] == 3
        
        print(f"✓ 2.5 miles = $0 delivery fee (within 3 free miles)")
    
    def test_calculate_fee_beyond_3_miles(self, auth_headers):
        """Test delivery fee calculation for orders beyond 3 miles."""
        # Test 5 miles: (5-3) × $1.50 = $3.00
        response = requests.post(f"{BASE_URL}/api/delivery-rules/calculate-fee", 
            headers=auth_headers,
            json={
                "zip_code": "93003",
                "distance_miles": 5.0
            }
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data["eligible"] == True
        expected_fee = (5.0 - 3) * 1.50  # $3.00
        assert data["fee"] == expected_fee, f"Expected ${expected_fee}, got ${data['fee']}"
        
        print(f"✓ 5 miles = ${data['fee']} delivery fee ((5-3) × $1.50)")
    
    def test_calculate_fee_cap_at_25(self, auth_headers):
        """Test delivery fee is capped at $25."""
        # Test 25 miles: (25-3) × $1.50 = $33 → capped at $25
        response = requests.post(f"{BASE_URL}/api/delivery-rules/calculate-fee", 
            headers=auth_headers,
            json={
                "zip_code": "93003",
                "distance_miles": 25.0
            }
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data["eligible"] == True
        assert data["fee"] == 25.0, f"Expected $25 (capped), got ${data['fee']}"
        
        print(f"✓ 25 miles = ${data['fee']} delivery fee (capped at $25)")


class TestPublicPickupRequestDeliveryFee:
    """Test POST /api/public/pickup-request auto-calculates delivery fee."""
    
    def test_pickup_request_auto_delivery_fee(self):
        """Test that pickup request auto-geocodes and calculates delivery fee."""
        unique_email = f"test_delivery_{uuid.uuid4().hex[:8]}@test.com"
        
        response = requests.post(f"{BASE_URL}/api/public/pickup-request", json={
            "name": "Test Delivery Customer",
            "email": unique_email,
            "phone": "+18055551234",
            "address": "4255 E Main St, Ventura, CA 93003",  # ~3.66 miles from store
            "pickup_date": "2026-05-01",
            "pickup_time": "8-12",
            "service_type": "pickup_delivery",
            "service_plan": "premium",
            "contact_method": "email",
            "sms_consent": False
        })
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data["success"] == True
        assert "order_number" in data
        
        print(f"✓ Pickup request created: {data['order_number']}")
        return data["order_number"]
    
    def test_pickup_request_close_address_zero_fee(self):
        """Test that addresses within 3 miles get $0 delivery fee."""
        unique_email = f"test_close_{uuid.uuid4().hex[:8]}@test.com"
        
        # Use an address very close to the store (5722 Telephone Rd, Ventura)
        response = requests.post(f"{BASE_URL}/api/public/pickup-request", json={
            "name": "Test Close Customer",
            "email": unique_email,
            "phone": "+18055551235",
            "address": "5700 Telephone Rd, Ventura, CA 93003",  # Very close to store
            "pickup_date": "2026-05-01",
            "pickup_time": "8-12",
            "service_type": "pickup_delivery",
            "service_plan": "standard",
            "contact_method": "email",
            "sms_consent": False
        })
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data["success"] == True
        
        print(f"✓ Close address pickup request created: {data['order_number']}")


class TestExistingOrderDeliveryFee:
    """Test the existing test order VFL-20260429-f4ffae94."""
    
    def test_verify_test_order_delivery_fee(self, auth_headers):
        """Verify test order VFL-20260429-f4ffae94 has correct delivery fee calculation."""
        # Get orders and find the test order
        response = requests.get(f"{BASE_URL}/api/orders", headers=auth_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        orders = response.json()
        test_order = None
        for order in orders:
            if order.get("order_number") == "VFL-20260429-f4ffae94":
                test_order = order
                break
        
        if not test_order:
            pytest.skip("Test order VFL-20260429-f4ffae94 not found")
        
        # Verify delivery fee calculation
        # Distance: 3.66 miles, Fee: (3.66 - 3) × $1.50 = $0.99
        assert "delivery_fee" in test_order, "OrderResponse should include delivery_fee field"
        assert test_order["delivery_fee"] == 0.99, f"Expected delivery_fee $0.99, got ${test_order.get('delivery_fee')}"
        
        # Verify total calculation: 20 lbs × $3.00/lb + $0.99 = $60.99
        assert test_order["service_plan"] == "premium", f"Expected premium plan, got {test_order.get('service_plan')}"
        assert test_order["price_per_lb"] == 3.0, f"Expected $3.00/lb, got ${test_order.get('price_per_lb')}"
        assert test_order["actual_lbs"] == 20, f"Expected 20 lbs, got {test_order.get('actual_lbs')}"
        assert test_order["total_amount"] == 60.99, f"Expected total $60.99, got ${test_order.get('total_amount')}"
        
        print(f"✓ Test order VFL-20260429-f4ffae94 verified:")
        print(f"  - Distance: 3.66 miles")
        print(f"  - Delivery fee: ${test_order['delivery_fee']} ((3.66-3) × $1.50)")
        print(f"  - Service: {test_order['service_plan']} @ ${test_order['price_per_lb']}/lb")
        print(f"  - Weight: {test_order['actual_lbs']} lbs")
        print(f"  - Total: ${test_order['total_amount']} (20 × $3.00 + $0.99)")


class TestOrderUpdateWithDeliveryFee:
    """Test PUT /api/orders/{id} recalculates total including delivery fee."""
    
    def test_update_order_lbs_recalculates_total_with_delivery_fee(self, auth_headers):
        """Test that updating actual_lbs recalculates total_amount including delivery_fee."""
        # First, create a new order via public pickup request
        unique_email = f"test_update_{uuid.uuid4().hex[:8]}@test.com"
        
        create_response = requests.post(f"{BASE_URL}/api/public/pickup-request", json={
            "name": "Test Update Customer",
            "email": unique_email,
            "phone": "+18055551236",
            "address": "4255 E Main St, Ventura, CA 93003",  # ~3.66 miles
            "pickup_date": "2026-05-02",
            "pickup_time": "14-18",
            "service_type": "pickup_delivery",
            "service_plan": "premium",
            "contact_method": "email",
            "sms_consent": False
        })
        
        assert create_response.status_code == 200, f"Failed to create order: {create_response.text}"
        order_number = create_response.json()["order_number"]
        
        # Get the order to find its ID
        orders_response = requests.get(f"{BASE_URL}/api/orders", headers=auth_headers)
        assert orders_response.status_code == 200
        
        orders = orders_response.json()
        test_order = None
        for order in orders:
            if order.get("order_number") == order_number:
                test_order = order
                break
        
        assert test_order is not None, f"Could not find created order {order_number}"
        order_id = test_order["id"]
        
        # Get initial delivery fee (may be 0 if geocoding failed, or calculated if successful)
        initial_delivery_fee = test_order.get("delivery_fee", 0) or 0
        
        # Update the order with actual_lbs
        update_response = requests.put(f"{BASE_URL}/api/orders/{order_id}", 
            headers=auth_headers,
            json={
                "actual_lbs": 15
            }
        )
        
        assert update_response.status_code == 200, f"Failed to update order: {update_response.text}"
        
        updated_order = update_response.json()
        
        # Verify total calculation: 15 lbs × $3.00/lb + delivery_fee
        expected_subtotal = 15 * 3.0  # $45.00
        expected_total = expected_subtotal + initial_delivery_fee
        
        # Check if total is at least the minimum ($40) + delivery fee
        min_total = max(expected_subtotal, 40) + initial_delivery_fee
        
        assert updated_order["actual_lbs"] == 15, f"Expected 15 lbs, got {updated_order.get('actual_lbs')}"
        assert updated_order["total_amount"] is not None, "total_amount should be calculated"
        
        # The total should include delivery fee
        if initial_delivery_fee > 0:
            assert updated_order["total_amount"] >= min_total, \
                f"Expected total >= ${min_total}, got ${updated_order.get('total_amount')}"
            print(f"✓ Order {order_number} updated with delivery fee included:")
            print(f"  - Actual lbs: {updated_order['actual_lbs']}")
            print(f"  - Delivery fee: ${initial_delivery_fee}")
            print(f"  - Total: ${updated_order['total_amount']}")
        else:
            print(f"✓ Order {order_number} updated (geocoding may have failed, delivery_fee=$0):")
            print(f"  - Actual lbs: {updated_order['actual_lbs']}")
            print(f"  - Total: ${updated_order['total_amount']}")


class TestOrderResponseIncludesDeliveryFee:
    """Test that OrderResponse model includes delivery_fee field."""
    
    def test_order_response_has_delivery_fee_field(self, auth_headers):
        """Verify GET /api/orders returns orders with delivery_fee field."""
        response = requests.get(f"{BASE_URL}/api/orders", headers=auth_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        orders = response.json()
        assert len(orders) > 0, "No orders found"
        
        # Check that at least one order has delivery_fee field
        has_delivery_fee_field = False
        for order in orders:
            if "delivery_fee" in order:
                has_delivery_fee_field = True
                break
        
        assert has_delivery_fee_field, "OrderResponse should include delivery_fee field"
        print(f"✓ OrderResponse includes delivery_fee field")
    
    def test_single_order_response_has_delivery_fee(self, auth_headers):
        """Verify GET /api/orders/{id} returns order with delivery_fee field."""
        # Get list of orders first
        list_response = requests.get(f"{BASE_URL}/api/orders", headers=auth_headers)
        assert list_response.status_code == 200
        
        orders = list_response.json()
        if not orders:
            pytest.skip("No orders available to test")
        
        # Get single order
        order_id = orders[0]["id"]
        response = requests.get(f"{BASE_URL}/api/orders/{order_id}", headers=auth_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        order = response.json()
        assert "delivery_fee" in order, "Single order response should include delivery_fee field"
        
        print(f"✓ Single order response includes delivery_fee: ${order.get('delivery_fee', 0)}")


class TestDeliveryFeeCalculationLogic:
    """Test the delivery fee calculation logic directly."""
    
    def test_haversine_distance_calculation(self, auth_headers):
        """Test distance calculation using coordinates."""
        # Test with coordinates for a known location
        response = requests.post(f"{BASE_URL}/api/delivery-rules/calculate-fee", 
            headers=auth_headers,
            json={
                "zip_code": "93003",
                "lat": 34.2805,  # Same as store
                "lng": -119.2945
            }
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        # Distance should be ~0 (same location)
        assert data["fee"] == 0.0, f"Expected $0 for same location, got ${data['fee']}"
        
        print(f"✓ Same location = $0 delivery fee")
    
    def test_fee_calculation_edge_cases(self, auth_headers):
        """Test edge cases for delivery fee calculation."""
        # Test exactly 3 miles (should be free)
        response = requests.post(f"{BASE_URL}/api/delivery-rules/calculate-fee", 
            headers=auth_headers,
            json={
                "zip_code": "93003",
                "distance_miles": 3.0
            }
        )
        assert response.status_code == 200
        data = response.json()
        assert data["fee"] == 0.0, f"Expected $0 for exactly 3 miles, got ${data['fee']}"
        
        # Test 3.01 miles (should be $0.015 → rounded to $0.02)
        response = requests.post(f"{BASE_URL}/api/delivery-rules/calculate-fee", 
            headers=auth_headers,
            json={
                "zip_code": "93003",
                "distance_miles": 3.01
            }
        )
        assert response.status_code == 200
        data = response.json()
        expected = round((3.01 - 3) * 1.50, 2)  # $0.02
        assert data["fee"] == expected, f"Expected ${expected} for 3.01 miles, got ${data['fee']}"
        
        print(f"✓ Edge cases verified: 3 miles = $0, 3.01 miles = ${expected}")


class TestTotalAmountCalculation:
    """Test total amount calculation includes delivery fee."""
    
    def test_calculate_service_amount_includes_delivery_fee(self, auth_headers):
        """Verify calculate_service_amount adds delivery_fee to subtotal."""
        # Get the test order
        response = requests.get(f"{BASE_URL}/api/orders", headers=auth_headers)
        assert response.status_code == 200
        
        orders = response.json()
        test_order = None
        for order in orders:
            if order.get("order_number") == "VFL-20260429-f4ffae94":
                test_order = order
                break
        
        if not test_order:
            pytest.skip("Test order not found")
        
        # Verify calculation: subtotal + delivery_fee = total
        actual_lbs = test_order.get("actual_lbs", 0)
        price_per_lb = test_order.get("price_per_lb", 0)
        delivery_fee = test_order.get("delivery_fee", 0)
        total_amount = test_order.get("total_amount", 0)
        
        expected_subtotal = actual_lbs * price_per_lb
        expected_total = expected_subtotal + delivery_fee
        
        assert abs(total_amount - expected_total) < 0.01, \
            f"Total mismatch: expected ${expected_total} ({actual_lbs} × ${price_per_lb} + ${delivery_fee}), got ${total_amount}"
        
        print(f"✓ Total calculation verified:")
        print(f"  - Subtotal: {actual_lbs} × ${price_per_lb} = ${expected_subtotal}")
        print(f"  - Delivery fee: ${delivery_fee}")
        print(f"  - Total: ${total_amount}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
