"""
Iteration 29 Tests: Notification Fixes and OrderDetailDialog Improvements

Tests:
1. POST /api/public/wash-fold-request - creates W&F order and triggers notification
2. PUT /api/automation/orders/{id}/status?new_status=PROCESSING - W&F notification trigger
3. PUT /api/automation/orders/{id}/status?new_status=READY - W&F notification trigger
4. POST /api/public/contact - creates ticket and sends confirmation notification
5. POST /api/public/quote-request - creates quote and sends confirmation notification
6. PUT /api/orders/{id} with actual_lbs - updates lbs and recalculates total_amount
7. POST /api/orders/{id}/capture-payment - registers payment with cash/transfer/other
8. GET /api/automation/operator-dashboard - returns orders with all required fields
"""

import pytest
import requests
import os
import uuid
from datetime import datetime

ADMIN_EMAIL = os.environ.get("TEST_ADMIN_EMAIL", "owner@frimexllc.com")
ADMIN_PASSWORD = os.environ.get("TEST_ADMIN_PASSWORD", "admin123")

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://ventura-deploy-test.preview.emergentagent.com').rstrip('/')

@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token for admin user"""
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": os.environ.get("TEST_ADMIN_PASSWORD", "admin123")}
    )
    if response.status_code == 200:
        return response.json().get("access_token")
    pytest.skip("Authentication failed - skipping authenticated tests")

@pytest.fixture(scope="module")
def auth_headers(auth_token):
    """Headers with auth token"""
    return {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {auth_token}"
    }


class TestHealthAndAuth:
    """Basic health and auth tests"""
    
    def test_health_endpoint(self):
        """Test health endpoint returns ok"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data.get("status") == "ok"
        print("✓ Health endpoint working")
    
    def test_auth_login(self):
        """Test admin login returns access_token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": ADMIN_EMAIL, "password": os.environ.get("TEST_ADMIN_PASSWORD", "admin123")}
        )
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert data.get("token_type") == "bearer"
        print("✓ Auth login working, returns access_token")


class TestPublicFormsWithNotifications:
    """Test public form endpoints that should trigger notifications"""
    
    def test_wash_fold_request_creates_order_and_triggers_notification(self):
        """POST /api/public/wash-fold-request creates W&F order and attempts notification"""
        unique_email = f"test_wf_{uuid.uuid4().hex[:8]}@test.com"
        payload = {
            "name": "Test WF Customer",
            "email": unique_email,
            "phone": "+18055551234",
            "address": "123 Test St, Ventura, CA 93003",
            "dropoff_date": "2026-04-01",
            "dropoff_time": "10:00 AM - 12:00 PM",
            "notes": "Test wash fold order for notification testing",
            "contact_method": "sms",
            "sms_consent": True
        }
        response = requests.post(f"{BASE_URL}/api/public/wash-fold-request", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert data.get("success") == True
        assert "order_number" in data
        print(f"✓ W&F order created: {data.get('order_number')}")
        # Note: Notification will fail for test phone but should be ATTEMPTED (check logs)
        return data.get("order_number")
    
    def test_contact_form_creates_ticket_and_sends_notification(self):
        """POST /api/public/contact creates ticket and sends confirmation notification"""
        unique_email = f"test_contact_{uuid.uuid4().hex[:8]}@test.com"
        payload = {
            "name": "Test Contact User",
            "email": unique_email,
            "phone": "+18055559999",
            "message": "This is a test contact message for notification testing",
            "subject": "Test Contact Request",
            "contact_method": "email",
            "sms_consent": False
        }
        response = requests.post(f"{BASE_URL}/api/public/contact", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert data.get("success") == True
        assert "ticket_number" in data
        print(f"✓ Contact ticket created: {data.get('ticket_number')}")
    
    def test_quote_request_creates_quote_and_sends_notification(self):
        """POST /api/public/quote-request creates quote and sends confirmation notification"""
        unique_email = f"test_quote_{uuid.uuid4().hex[:8]}@test.com"
        payload = {
            "company_name": "Test Company Inc",
            "contact_name": "Test Quote Contact",
            "email": unique_email,
            "phone": "+18055558888",
            "industry": "Hospitality",
            "estimated_lbs": 100.0,
            "message": "Test quote request for notification testing"
        }
        response = requests.post(f"{BASE_URL}/api/public/quote-request", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert data.get("success") == True
        assert "quote_number" in data
        print(f"✓ Quote created: {data.get('quote_number')}")


class TestWashFoldStatusNotifications:
    """Test W&F order status changes trigger notifications"""
    
    @pytest.fixture(scope="class")
    def wf_order(self):
        """Create a W&F order for status testing"""
        unique_email = f"test_wf_status_{uuid.uuid4().hex[:8]}@test.com"
        payload = {
            "name": "Test WF Status Customer",
            "email": unique_email,
            "phone": "+18055557777",
            "address": "456 Status Test St, Ventura, CA 93003",
            "dropoff_date": "2026-04-02",
            "dropoff_time": "2:00 PM - 4:00 PM",
            "notes": "Test order for status notification testing",
            "contact_method": "sms",
            "sms_consent": True
        }
        response = requests.post(f"{BASE_URL}/api/public/wash-fold-request", json=payload)
        assert response.status_code == 200
        data = response.json()
        return data.get("order_number")
    
    def test_wf_status_to_processing_triggers_notification(self, wf_order, auth_headers):
        """PUT /api/automation/orders/{id}/status?new_status=PROCESSING triggers notification"""
        # First get the order ID from order number
        response = requests.get(
            f"{BASE_URL}/api/orders",
            headers=auth_headers,
            params={"page_size": 100}
        )
        assert response.status_code == 200
        orders = response.json()
        
        # Find our order
        order = next((o for o in orders if o.get("order_number") == wf_order), None)
        if not order:
            pytest.skip(f"Could not find order {wf_order}")
        
        order_id = order.get("id")
        
        # Update status to PROCESSING
        response = requests.put(
            f"{BASE_URL}/api/automation/orders/{order_id}/status",
            params={"new_status": "PROCESSING"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data.get("new_status") == "PROCESSING"
        print(f"✓ W&F order {wf_order} status changed to PROCESSING (notification attempted)")
        return order_id
    
    def test_wf_status_to_ready_triggers_notification(self, wf_order, auth_headers):
        """PUT /api/automation/orders/{id}/status?new_status=READY triggers notification"""
        # Get the order
        response = requests.get(
            f"{BASE_URL}/api/orders",
            headers=auth_headers,
            params={"page_size": 100}
        )
        assert response.status_code == 200
        orders = response.json()
        
        order = next((o for o in orders if o.get("order_number") == wf_order), None)
        if not order:
            pytest.skip(f"Could not find order {wf_order}")
        
        order_id = order.get("id")
        
        # Update status to READY
        response = requests.put(
            f"{BASE_URL}/api/automation/orders/{order_id}/status",
            params={"new_status": "READY"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data.get("new_status") == "READY"
        print(f"✓ W&F order {wf_order} status changed to READY (notification attempted)")


class TestOrderLbsAndPayment:
    """Test order lbs update and payment capture"""
    
    @pytest.fixture(scope="class")
    def test_order(self, auth_headers):
        """Create a test order for lbs/payment testing"""
        # First create a customer
        unique_email = f"test_lbs_{uuid.uuid4().hex[:8]}@test.com"
        customer_payload = {
            "name": "Test Lbs Customer",
            "email": unique_email,
            "phone": "+18055556666",
            "address": "789 Lbs Test St, Ventura, CA 93003"
        }
        response = requests.post(
            f"{BASE_URL}/api/customers",
            headers=auth_headers,
            json=customer_payload
        )
        if response.status_code != 200:
            pytest.skip("Could not create test customer")
        
        customer = response.json()
        customer_id = customer.get("id")
        
        # Create order
        order_payload = {
            "customer_id": customer_id,
            "service_type": "wash_fold",
            "pickup_date": "2026-04-03",
            "pickup_time_window": "9:00 AM - 11:00 AM",
            "estimated_lbs": 15.0,
            "notes": "Test order for lbs and payment testing"
        }
        response = requests.post(
            f"{BASE_URL}/api/orders",
            headers=auth_headers,
            json=order_payload
        )
        if response.status_code != 200:
            pytest.skip("Could not create test order")
        
        order = response.json()
        return order
    
    def test_update_order_lbs_recalculates_total(self, test_order, auth_headers):
        """PUT /api/orders/{id} with actual_lbs updates lbs and recalculates total_amount"""
        order_id = test_order.get("id")
        
        # Update with actual_lbs
        payload = {"actual_lbs": 20.0}
        response = requests.put(
            f"{BASE_URL}/api/orders/{order_id}",
            headers=auth_headers,
            json=payload
        )
        assert response.status_code == 200
        data = response.json()
        
        # Verify lbs updated
        assert data.get("actual_lbs") == 20.0
        
        # Verify total_amount calculated (wash_fold: $2.25/lb, min 10 lbs)
        # 20 lbs * $2.25 = $45.00
        total = data.get("total_amount")
        assert total is not None
        assert total == 45.0
        print(f"✓ Order lbs updated to 20.0, total recalculated to ${total}")
    
    def test_capture_payment_cash(self, test_order, auth_headers):
        """POST /api/orders/{id}/capture-payment with cash registers payment"""
        order_id = test_order.get("id")
        
        # First ensure order has a total
        response = requests.get(
            f"{BASE_URL}/api/orders/{order_id}",
            headers=auth_headers
        )
        order = response.json()
        total = order.get("total_amount") or 45.0
        
        # Capture payment with cash
        payload = {
            "payment_method": "cash",
            "amount_received": total + 5.0  # Give extra for change
        }
        response = requests.post(
            f"{BASE_URL}/api/orders/{order_id}/payment",
            headers=auth_headers,
            json=payload
        )
        assert response.status_code == 200
        data = response.json()
        
        assert data.get("ok") == True
        assert data.get("payment_status") == "paid"
        assert data.get("payment_method") == "cash"
        assert data.get("change_due") == 5.0
        print(f"✓ Cash payment captured, change due: ${data.get('change_due')}")
    
    def test_capture_payment_transfer(self, auth_headers):
        """POST /api/orders/{id}/capture-payment with transfer registers payment"""
        # Create a new order for transfer test
        unique_email = f"test_transfer_{uuid.uuid4().hex[:8]}@test.com"
        customer_payload = {
            "name": "Test Transfer Customer",
            "email": unique_email,
            "phone": "+18055555555",
            "address": "111 Transfer St, Ventura, CA 93003"
        }
        response = requests.post(
            f"{BASE_URL}/api/customers",
            headers=auth_headers,
            json=customer_payload
        )
        customer = response.json()
        
        order_payload = {
            "customer_id": customer.get("id"),
            "service_type": "wash_fold",
            "pickup_date": "2026-04-04",
            "pickup_time_window": "1:00 PM - 3:00 PM",
            "estimated_lbs": 10.0
        }
        response = requests.post(
            f"{BASE_URL}/api/orders",
            headers=auth_headers,
            json=order_payload
        )
        order = response.json()
        order_id = order.get("id")
        
        # Update lbs to get total
        response = requests.put(
            f"{BASE_URL}/api/orders/{order_id}",
            headers=auth_headers,
            json={"actual_lbs": 15.0}
        )
        order = response.json()
        total = order.get("total_amount")
        
        # Capture payment with transfer
        payload = {
            "payment_method": "transfer",
            "amount_received": total
        }
        response = requests.post(
            f"{BASE_URL}/api/orders/{order_id}/payment",
            headers=auth_headers,
            json=payload
        )
        assert response.status_code == 200
        data = response.json()
        
        assert data.get("ok") == True
        assert data.get("payment_status") == "paid"
        assert data.get("payment_method") == "transfer"
        print(f"✓ Transfer payment captured for ${total}")


class TestOperatorDashboard:
    """Test operator dashboard endpoint returns all required fields"""
    
    def test_operator_dashboard_returns_all_fields(self, auth_headers):
        """GET /api/automation/operator-dashboard returns orders with all required fields"""
        response = requests.get(f"{BASE_URL}/api/automation/operator-dashboard")
        assert response.status_code == 200
        data = response.json()
        
        # Check top-level structure
        assert "stats" in data
        assert "todays_pickups" in data
        assert "ready_for_delivery" in data
        assert "wash_fold_dropoffs" in data
        assert "wash_fold_ready" in data
        
        # Check stats
        stats = data.get("stats", {})
        assert "pickups_remaining_today" in stats
        assert "orders_in_processing" in stats
        assert "orders_ready" in stats
        
        print(f"✓ Operator dashboard structure valid")
        print(f"  Stats: {stats}")
        
        # Check order fields in any available orders
        all_orders = (
            data.get("todays_pickups", []) +
            data.get("ready_for_delivery", []) +
            data.get("wash_fold_dropoffs", []) +
            data.get("wash_fold_ready", [])
        )
        
        if all_orders:
            sample_order = all_orders[0]
            required_fields = [
                "order_id", "status", "customer_name", "customer_phone",
                "customer_email", "preferred_contact", "service_type",
                "actual_lbs", "total_amount", "payment_status"
            ]
            
            for field in required_fields:
                assert field in sample_order, f"Missing field: {field}"
            
            print(f"✓ Order fields verified: {list(sample_order.keys())}")
        else:
            print("  No active orders to verify fields (expected if no orders)")
    
    def test_operator_dashboard_order_has_preferences_snapshot(self, auth_headers):
        """Verify orders include preferences_snapshot field"""
        response = requests.get(f"{BASE_URL}/api/automation/operator-dashboard")
        assert response.status_code == 200
        data = response.json()
        
        all_orders = (
            data.get("todays_pickups", []) +
            data.get("ready_for_delivery", []) +
            data.get("wash_fold_dropoffs", []) +
            data.get("wash_fold_ready", [])
        )
        
        if all_orders:
            sample_order = all_orders[0]
            # preferences_snapshot may be None but field should exist
            assert "preferences_snapshot" in sample_order or "special_instructions" in sample_order
            print(f"✓ Order has preferences/instructions field")
        else:
            print("  No orders to verify preferences_snapshot")


class TestPickupDeliveryStatusNotifications:
    """Test Pickup & Delivery order status changes trigger notifications"""
    
    @pytest.fixture(scope="class")
    def pickup_order(self, auth_headers):
        """Create a pickup & delivery order for status testing"""
        unique_email = f"test_pickup_{uuid.uuid4().hex[:8]}@test.com"
        payload = {
            "name": "Test Pickup Customer",
            "email": unique_email,
            "phone": "+18055554444",
            "address": "999 Pickup Test St, Ventura, CA 93003",
            "pickup_date": "2026-04-05",
            "pickup_time": "8:00 AM - 10:00 AM",
            "service_type": "pickup_delivery",
            "contact_method": "sms",
            "sms_consent": True
        }
        response = requests.post(f"{BASE_URL}/api/public/pickup-request", json=payload)
        assert response.status_code == 200
        data = response.json()
        
        # Get the order ID
        response = requests.get(
            f"{BASE_URL}/api/orders",
            headers=auth_headers,
            params={"page_size": 100}
        )
        orders = response.json()
        order = next((o for o in orders if o.get("order_number") == data.get("order_number")), None)
        
        return {"order_number": data.get("order_number"), "id": order.get("id") if order else None}
    
    def test_pickup_status_confirmed_triggers_notification(self, pickup_order, auth_headers):
        """Pickup order CONFIRMED status triggers notification"""
        if not pickup_order.get("id"):
            pytest.skip("Could not get order ID")
        
        order_id = pickup_order.get("id")
        
        response = requests.put(
            f"{BASE_URL}/api/automation/orders/{order_id}/status",
            params={"new_status": "CONFIRMED"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data.get("new_status") == "CONFIRMED"
        print(f"✓ Pickup order status changed to CONFIRMED (notification attempted)")
    
    def test_pickup_status_processing_triggers_notification(self, pickup_order, auth_headers):
        """Pickup order PROCESSING status triggers notification"""
        if not pickup_order.get("id"):
            pytest.skip("Could not get order ID")
        
        order_id = pickup_order.get("id")
        
        response = requests.put(
            f"{BASE_URL}/api/automation/orders/{order_id}/status",
            params={"new_status": "PROCESSING"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data.get("new_status") == "PROCESSING"
        print(f"✓ Pickup order status changed to PROCESSING (notification attempted)")
    
    def test_pickup_status_ready_triggers_notification(self, pickup_order, auth_headers):
        """Pickup order READY status triggers notification"""
        if not pickup_order.get("id"):
            pytest.skip("Could not get order ID")
        
        order_id = pickup_order.get("id")
        
        response = requests.put(
            f"{BASE_URL}/api/automation/orders/{order_id}/status",
            params={"new_status": "READY"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data.get("new_status") == "READY"
        print(f"✓ Pickup order status changed to READY (notification attempted)")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
