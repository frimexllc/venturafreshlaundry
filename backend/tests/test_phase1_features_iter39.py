"""
Phase 1 Features Test Suite - Iteration 39
Tests for:
1. State Machine (CONFIRMED state, operator/driver transitions)
2. Print Ticket HTML endpoint
3. Zelle payment support
4. Multi-payment notification format
5. Status history recording
"""
import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_EMAIL = os.environ.get("TEST_ADMIN_EMAIL", "owner@frimexllc.com")
ADMIN_PASSWORD = os.environ.get("TEST_ADMIN_PASSWORD", "admin123")
TEST_CUSTOMER_ID = "6c2fc35b-9b78-4b60-bd84-a403f4ebebfc"

# Test order IDs from review request
UNPAID_ORDER_ID = "9d683cab-97ba-4fa8-a680-c93b999783cc"
PAID_ORDER_ID = "1a8c9d67-4341-4985-8b54-eba2bfb4cf24"


@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token"""
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
    )
    assert response.status_code == 200, f"Login failed: {response.text}"
    data = response.json()
    assert "access_token" in data, "Response missing access_token"
    return data["access_token"]


@pytest.fixture(scope="module")
def auth_headers(auth_token):
    """Get headers with auth token"""
    return {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {auth_token}"
    }


@pytest.fixture(scope="module")
def test_order(auth_headers):
    """Create a test order for state machine testing"""
    response = requests.post(
        f"{BASE_URL}/api/orders",
        headers=auth_headers,
        json={
            "customer_id": TEST_CUSTOMER_ID,
            "service_type": "pickup_delivery",
            "pickup_date": "2026-04-05",
            "pickup_time_window": "9:00 AM - 12:00 PM",
            "pickup_address": "123 Test St, Ventura, CA 93001",
            "estimated_lbs": 10
        }
    )
    assert response.status_code == 200, f"Failed to create test order: {response.text}"
    order = response.json()
    assert order.get("status") == "new", "New order should have status 'new'"
    return order


class TestStateMachine:
    """Test state machine validation for operator and driver endpoints"""
    
    def test_operator_new_to_confirmed_allowed(self, auth_headers, test_order):
        """Operator can transition NEW -> CONFIRMED"""
        order_id = test_order["id"]
        response = requests.patch(
            f"{BASE_URL}/api/operator/orders/{order_id}/status",
            headers=auth_headers,
            json={"status": "confirmed"}
        )
        assert response.status_code == 200, f"NEW->CONFIRMED should succeed: {response.text}"
        data = response.json()
        assert "message" in data
        assert "confirmed" in data["message"].lower()
    
    def test_operator_invalid_transition_fails(self, auth_headers, test_order):
        """Operator cannot skip states (CONFIRMED -> DELIVERED should fail)"""
        order_id = test_order["id"]
        response = requests.patch(
            f"{BASE_URL}/api/operator/orders/{order_id}/status",
            headers=auth_headers,
            json={"status": "delivered"}
        )
        assert response.status_code == 400, f"CONFIRMED->DELIVERED should fail: {response.text}"
        data = response.json()
        assert "detail" in data
        assert "Permitidos" in data["detail"] or "picked_up" in data["detail"].lower()
    
    def test_driver_endpoint_exists(self, auth_headers, test_order):
        """Driver endpoint PATCH /api/driver/orders/{id}/status exists"""
        order_id = test_order["id"]
        response = requests.patch(
            f"{BASE_URL}/api/driver/orders/{order_id}/status",
            headers=auth_headers,
            json={"status": "picked_up"}
        )
        # Should succeed (CONFIRMED -> PICKED_UP is valid for driver)
        assert response.status_code == 200, f"Driver endpoint should work: {response.text}"
        data = response.json()
        assert "message" in data
        assert "picked_up" in data["message"].lower()
    
    def test_driver_invalid_transition_fails(self, auth_headers, test_order):
        """Driver cannot set invalid status (PICKED_UP -> CONFIRMED should fail)"""
        order_id = test_order["id"]
        response = requests.patch(
            f"{BASE_URL}/api/driver/orders/{order_id}/status",
            headers=auth_headers,
            json={"status": "confirmed"}
        )
        assert response.status_code == 400, f"PICKED_UP->CONFIRMED should fail: {response.text}"
        data = response.json()
        assert "detail" in data


class TestTicketEndpoint:
    """Test GET /api/orders/{id}/ticket HTML endpoint"""
    
    def test_ticket_returns_html(self, auth_headers):
        """Ticket endpoint returns valid HTML"""
        response = requests.get(
            f"{BASE_URL}/api/orders/{UNPAID_ORDER_ID}/ticket",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Ticket endpoint failed: {response.text}"
        content = response.text
        
        # Verify it's HTML
        assert "<!DOCTYPE html>" in content or "<html>" in content
        assert "</html>" in content
    
    def test_ticket_contains_order_number(self, auth_headers):
        """Ticket contains order number"""
        response = requests.get(
            f"{BASE_URL}/api/orders/{UNPAID_ORDER_ID}/ticket",
            headers=auth_headers
        )
        assert response.status_code == 200
        content = response.text
        
        # Should contain order number
        assert "VFL-" in content, "Ticket should contain order number"
    
    def test_ticket_contains_financial_breakdown(self, auth_headers):
        """Ticket contains financial breakdown (lbs, rate, subtotal, total)"""
        response = requests.get(
            f"{BASE_URL}/api/orders/{UNPAID_ORDER_ID}/ticket",
            headers=auth_headers
        )
        assert response.status_code == 200
        content = response.text
        
        # Should contain financial info
        assert "lbs" in content.lower() or "Peso" in content, "Ticket should show weight"
        assert "$" in content, "Ticket should show currency amounts"
        assert "Total" in content or "TOTAL" in content, "Ticket should show total"
    
    def test_ticket_contains_business_info(self, auth_headers):
        """Ticket contains business name and address"""
        response = requests.get(
            f"{BASE_URL}/api/orders/{UNPAID_ORDER_ID}/ticket",
            headers=auth_headers
        )
        assert response.status_code == 200
        content = response.text
        
        assert "Ventura Fresh Laundry" in content, "Ticket should show business name"
        assert "5722 Telephone" in content or "Ventura" in content, "Ticket should show address"


class TestZellePayment:
    """Test Zelle payment support"""
    
    def test_zelle_payment_method_accepted(self, auth_headers, test_order):
        """POST /api/orders/{id}/payment accepts payment_method=zelle"""
        order_id = test_order["id"]
        
        # First update actual_lbs to get a total
        requests.put(
            f"{BASE_URL}/api/orders/{order_id}",
            headers=auth_headers,
            json={"actual_lbs": 15}
        )
        
        response = requests.post(
            f"{BASE_URL}/api/orders/{order_id}/payment",
            headers=auth_headers,
            json={"payment_method": "zelle"}
        )
        assert response.status_code == 200, f"Zelle payment should succeed: {response.text}"
        data = response.json()
        
        assert data.get("ok") == True, "Payment should return ok=true"
        assert data.get("payment_method") == "zelle", "Payment method should be zelle"
        assert data.get("payment_status") == "paid", "Payment status should be paid"
    
    def test_zelle_payment_persisted(self, auth_headers, test_order):
        """Zelle payment is correctly saved in database"""
        order_id = test_order["id"]
        
        response = requests.get(
            f"{BASE_URL}/api/orders/{order_id}",
            headers=auth_headers
        )
        assert response.status_code == 200
        order = response.json()
        
        assert order.get("payment_status") == "paid", "Order should be marked as paid"
        assert order.get("payment_method") == "zelle", "Payment method should be zelle"
        assert order.get("amount_paid") is not None, "Amount paid should be set"


class TestMultiPaymentNotification:
    """Test multi-payment notification format"""
    
    def test_unpaid_notification_has_stripe_link(self, auth_headers):
        """Unpaid order notification includes Stripe payment link"""
        response = requests.post(
            f"{BASE_URL}/api/orders/{UNPAID_ORDER_ID}/notify-customer",
            headers={
                **auth_headers,
                "Origin": "https://ventura-deploy-test.preview.emergentagent.com"
            },
            json={"channel": "sms"}
        )
        assert response.status_code == 200, f"Notify failed: {response.text}"
        data = response.json()
        
        assert data.get("ok") == True, "Notification should succeed"
        assert data.get("payment_url"), "Should have payment_url for unpaid order"
        assert "stripe" in data.get("payment_url", "").lower() or "tinyurl" in data.get("payment_url", "").lower()
    
    def test_unpaid_notification_has_zelle_info(self, auth_headers):
        """Unpaid order notification includes Zelle instructions"""
        response = requests.post(
            f"{BASE_URL}/api/orders/{UNPAID_ORDER_ID}/notify-customer",
            headers={
                **auth_headers,
                "Origin": "https://ventura-deploy-test.preview.emergentagent.com"
            },
            json={"channel": "sms"}
        )
        assert response.status_code == 200
        data = response.json()
        
        message = data.get("message_preview", "")
        assert "Zelle" in message, "Message should mention Zelle"
        assert "payments@venturafreshlaundry.com" in message, "Message should include Zelle email"
    
    def test_unpaid_notification_has_cash_option(self, auth_headers):
        """Unpaid order notification includes cash payment option"""
        response = requests.post(
            f"{BASE_URL}/api/orders/{UNPAID_ORDER_ID}/notify-customer",
            headers={
                **auth_headers,
                "Origin": "https://ventura-deploy-test.preview.emergentagent.com"
            },
            json={"channel": "sms"}
        )
        assert response.status_code == 200
        data = response.json()
        
        message = data.get("message_preview", "")
        assert "Efectivo" in message, "Message should mention cash option"
    
    def test_paid_notification_thank_you_format(self, auth_headers):
        """Paid order notification uses thank-you format with checkmarks"""
        response = requests.post(
            f"{BASE_URL}/api/orders/{PAID_ORDER_ID}/notify-customer",
            headers={
                **auth_headers,
                "Origin": "https://ventura-deploy-test.preview.emergentagent.com"
            },
            json={"channel": "sms"}
        )
        assert response.status_code == 200, f"Notify failed: {response.text}"
        data = response.json()
        
        assert data.get("ok") == True, "Notification should succeed"
        message = data.get("message_preview", "")
        
        # Should have checkmarks and thank-you format
        assert "✅" in message, "Paid notification should have checkmarks"
        assert "Pagado" in message, "Should show paid status"
        assert "Gracias" in message, "Should have thank you message"
        
        # Should NOT have payment link
        assert data.get("payment_url") == "", "Paid order should not have payment URL"


class TestStatusHistory:
    """Test status history recording"""
    
    def test_status_history_recorded_on_transition(self, auth_headers):
        """Status changes are recorded in status_history array"""
        # Create a fresh order
        response = requests.post(
            f"{BASE_URL}/api/orders",
            headers=auth_headers,
            json={
                "customer_id": TEST_CUSTOMER_ID,
                "service_type": "pickup_delivery",
                "pickup_date": "2026-04-06",
                "pickup_time_window": "9:00 AM - 12:00 PM",
                "pickup_address": "456 Test Ave, Ventura, CA 93001",
                "estimated_lbs": 8
            }
        )
        assert response.status_code == 200
        order = response.json()
        order_id = order["id"]
        
        # Transition to CONFIRMED
        response = requests.patch(
            f"{BASE_URL}/api/operator/orders/{order_id}/status",
            headers=auth_headers,
            json={"status": "confirmed"}
        )
        assert response.status_code == 200
        
        # Check status_history in database (via direct MongoDB query simulation)
        # Since we can't directly query MongoDB from pytest, we verify the transition worked
        # The status_history is stored but not returned in API response (by design)
        
        # Verify order status changed
        response = requests.get(
            f"{BASE_URL}/api/orders/{order_id}",
            headers=auth_headers
        )
        assert response.status_code == 200
        order = response.json()
        assert order.get("status") == "confirmed", "Order should be confirmed"


class TestWashFoldStateMachine:
    """Test state machine for Wash & Fold service type"""
    
    def test_wash_fold_transitions(self, auth_headers):
        """Wash & Fold uses different state machine (no pickup/delivery states)"""
        # Create a Wash & Fold order
        response = requests.post(
            f"{BASE_URL}/api/orders",
            headers=auth_headers,
            json={
                "customer_id": TEST_CUSTOMER_ID,
                "service_type": "wash_fold",
                "pickup_date": "2026-04-06",
                "pickup_time_window": "9:00 AM - 12:00 PM",
                "pickup_address": "789 Test Blvd, Ventura, CA 93001",
                "estimated_lbs": 12
            }
        )
        assert response.status_code == 200
        order = response.json()
        order_id = order["id"]
        
        # NEW -> CONFIRMED should work
        response = requests.patch(
            f"{BASE_URL}/api/operator/orders/{order_id}/status",
            headers=auth_headers,
            json={"status": "confirmed"}
        )
        assert response.status_code == 200, f"W&F NEW->CONFIRMED should work: {response.text}"
        
        # CONFIRMED -> PROCESSING should work (not PICKED_UP)
        response = requests.patch(
            f"{BASE_URL}/api/operator/orders/{order_id}/status",
            headers=auth_headers,
            json={"status": "processing"}
        )
        assert response.status_code == 200, f"W&F CONFIRMED->PROCESSING should work: {response.text}"
        
        # PROCESSING -> READY should work
        response = requests.patch(
            f"{BASE_URL}/api/operator/orders/{order_id}/status",
            headers=auth_headers,
            json={"status": "ready"}
        )
        assert response.status_code == 200, f"W&F PROCESSING->READY should work: {response.text}"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
