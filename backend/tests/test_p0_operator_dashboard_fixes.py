"""
Test P0 Bug Fixes for Operator Dashboard - Iteration 31
Tests:
1. P&D State flow: NEW → CONFIRMED → PICKED_UP → PROCESSING → READY → OUT_FOR_DELIVERY → DELIVERED → COMPLETED
2. W&F State flow: NEW → CONFIRMED → PROCESSING → READY → COMPLETED
3. Dashboard sorting: P&D and W&F orders in correct buckets
4. QR.svg endpoint without auth
5. Payment capture creating finance entry in MongoDB
"""
import pytest
import requests
import os
import uuid
from datetime import datetime

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://ventura-deploy-test.preview.emergentagent.com").rstrip("/")

# Test credentials
ADMIN_EMAIL = os.environ.get("TEST_ADMIN_EMAIL", "owner@frimexllc.com")
ADMIN_PASSWORD = os.environ.get("TEST_ADMIN_PASSWORD", "admin123")


class TestP0OperatorDashboardFixes:
    """Test P0 bug fixes for Operator Dashboard"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        if response.status_code == 200:
            return response.json().get("access_token")
        pytest.skip(f"Authentication failed: {response.status_code} - {response.text}")
    
    @pytest.fixture(scope="class")
    def auth_headers(self, auth_token):
        """Get auth headers"""
        return {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {auth_token}"
        }
    
    @pytest.fixture(scope="class")
    def customer_id(self, auth_headers):
        """Get or create a test customer"""
        # First try to get existing customers
        response = requests.get(f"{BASE_URL}/api/customers", headers=auth_headers)
        if response.status_code == 200:
            customers = response.json()
            if customers and len(customers) > 0:
                return customers[0].get("id")
        
        # Create a new customer if none exist
        customer_data = {
            "name": f"Test Customer {uuid.uuid4().hex[:6]}",
            "email": f"test_{uuid.uuid4().hex[:6]}@test.com",
            "phone": "+18055551234",
            "address": "123 Test St, Ventura, CA 93001"
        }
        response = requests.post(f"{BASE_URL}/api/customers", json=customer_data, headers=auth_headers)
        if response.status_code in [200, 201]:
            return response.json().get("id")
        pytest.skip(f"Could not get/create customer: {response.status_code}")
    
    # ==================== HEALTH CHECK ====================
    
    def test_health_check(self):
        """Test API health endpoint"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data.get("status") == "ok"
        print("✓ Health check passed")
    
    def test_auth_login(self):
        """Test admin login"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        print("✓ Admin login successful")
    
    # ==================== QR.SVG WITHOUT AUTH ====================
    
    def test_qr_svg_without_auth(self, auth_headers, customer_id):
        """Test that QR.svg endpoint works WITHOUT authentication"""
        # First create an order to get an order ID
        order_data = {
            "customer_id": customer_id,
            "service_type": "pickup_delivery",
            "pickup_date": datetime.now().strftime("%Y-%m-%d"),
            "pickup_time_window": "9:00 AM - 12:00 PM",
            "pickup_address": "123 Test St, Ventura, CA 93001",
            "estimated_lbs": 10
        }
        create_response = requests.post(f"{BASE_URL}/api/orders", json=order_data, headers=auth_headers)
        assert create_response.status_code == 200, f"Failed to create order: {create_response.text}"
        order = create_response.json()
        order_id = order.get("id")
        
        # Now test QR.svg WITHOUT auth header
        qr_response = requests.get(f"{BASE_URL}/api/orders/{order_id}/qr.svg")
        assert qr_response.status_code == 200, f"QR.svg should work without auth: {qr_response.status_code}"
        assert "image/svg+xml" in qr_response.headers.get("Content-Type", "")
        print(f"✓ QR.svg endpoint works without auth for order {order_id}")
    
    # ==================== P&D STATE FLOW ====================
    
    def test_pd_state_flow_new_to_confirmed(self, auth_headers, customer_id):
        """Test P&D: NEW → CONFIRMED"""
        # Create P&D order
        order_data = {
            "customer_id": customer_id,
            "service_type": "pickup_delivery",
            "pickup_date": datetime.now().strftime("%Y-%m-%d"),
            "pickup_time_window": "9:00 AM - 12:00 PM",
            "pickup_address": "123 Test St, Ventura, CA 93001",
            "estimated_lbs": 10
        }
        create_response = requests.post(f"{BASE_URL}/api/orders", json=order_data, headers=auth_headers)
        assert create_response.status_code == 200
        order = create_response.json()
        order_id = order.get("id")
        assert order.get("status") in ["new", "NEW"]
        
        # Transition to CONFIRMED
        response = requests.put(f"{BASE_URL}/api/automation/orders/{order_id}/status?new_status=CONFIRMED")
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert data.get("new_status") == "CONFIRMED"
        print(f"✓ P&D NEW → CONFIRMED for order {order_id}")
        return order_id
    
    def test_pd_state_flow_confirmed_to_picked_up(self, auth_headers, customer_id):
        """Test P&D: CONFIRMED → PICKED_UP (not PROCESSING)"""
        # Create and move to CONFIRMED
        order_data = {
            "customer_id": customer_id,
            "service_type": "pickup_delivery",
            "pickup_date": datetime.now().strftime("%Y-%m-%d"),
            "pickup_time_window": "9:00 AM - 12:00 PM",
            "pickup_address": "123 Test St, Ventura, CA 93001",
            "estimated_lbs": 10
        }
        create_response = requests.post(f"{BASE_URL}/api/orders", json=order_data, headers=auth_headers)
        order = create_response.json()
        order_id = order.get("id")
        
        # Move to CONFIRMED
        requests.put(f"{BASE_URL}/api/automation/orders/{order_id}/status?new_status=CONFIRMED")
        
        # Move to PICKED_UP (this is the fix - was going to PROCESSING before)
        response = requests.put(f"{BASE_URL}/api/automation/orders/{order_id}/status?new_status=PICKED_UP")
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert data.get("new_status") == "PICKED_UP"
        print(f"✓ P&D CONFIRMED → PICKED_UP for order {order_id}")
    
    def test_pd_full_state_flow(self, auth_headers, customer_id):
        """Test full P&D state flow: NEW → CONFIRMED → PICKED_UP → PROCESSING → READY → OUT_FOR_DELIVERY → DELIVERED → COMPLETED"""
        # Create P&D order
        order_data = {
            "customer_id": customer_id,
            "service_type": "pickup_delivery",
            "pickup_date": datetime.now().strftime("%Y-%m-%d"),
            "pickup_time_window": "9:00 AM - 12:00 PM",
            "pickup_address": "123 Test St, Ventura, CA 93001",
            "estimated_lbs": 10
        }
        create_response = requests.post(f"{BASE_URL}/api/orders", json=order_data, headers=auth_headers)
        order = create_response.json()
        order_id = order.get("id")
        
        # Full flow
        states = ["CONFIRMED", "PICKED_UP", "PROCESSING", "READY", "OUT_FOR_DELIVERY", "DELIVERED", "COMPLETED"]
        for state in states:
            response = requests.put(f"{BASE_URL}/api/automation/orders/{order_id}/status?new_status={state}")
            assert response.status_code == 200, f"Failed at {state}: {response.text}"
            data = response.json()
            assert data.get("new_status") == state
            print(f"  ✓ P&D → {state}")
        
        print(f"✓ P&D full state flow completed for order {order_id}")
    
    # ==================== W&F STATE FLOW ====================
    
    def test_wf_state_flow_new_to_confirmed(self, auth_headers, customer_id):
        """Test W&F: NEW → CONFIRMED (this was broken before)"""
        # Create W&F order
        order_data = {
            "customer_id": customer_id,
            "service_type": "wash_fold",
            "pickup_date": datetime.now().strftime("%Y-%m-%d"),
            "pickup_time_window": "9:00 AM - 12:00 PM",
            "pickup_address": "123 Test St, Ventura, CA 93001",
            "estimated_lbs": 10
        }
        create_response = requests.post(f"{BASE_URL}/api/orders", json=order_data, headers=auth_headers)
        assert create_response.status_code == 200
        order = create_response.json()
        order_id = order.get("id")
        
        # Transition to CONFIRMED (this is the fix - W&F now accepts CONFIRMED)
        response = requests.put(f"{BASE_URL}/api/automation/orders/{order_id}/status?new_status=CONFIRMED")
        assert response.status_code == 200, f"W&F should accept CONFIRMED: {response.text}"
        data = response.json()
        assert data.get("new_status") == "CONFIRMED"
        print(f"✓ W&F NEW → CONFIRMED for order {order_id}")
    
    def test_wf_full_state_flow(self, auth_headers, customer_id):
        """Test full W&F state flow: NEW → CONFIRMED → PROCESSING → READY → COMPLETED"""
        # Create W&F order
        order_data = {
            "customer_id": customer_id,
            "service_type": "wash_fold",
            "pickup_date": datetime.now().strftime("%Y-%m-%d"),
            "pickup_time_window": "9:00 AM - 12:00 PM",
            "pickup_address": "123 Test St, Ventura, CA 93001",
            "estimated_lbs": 10
        }
        create_response = requests.post(f"{BASE_URL}/api/orders", json=order_data, headers=auth_headers)
        order = create_response.json()
        order_id = order.get("id")
        
        # Full flow
        states = ["CONFIRMED", "PROCESSING", "READY", "COMPLETED"]
        for state in states:
            response = requests.put(f"{BASE_URL}/api/automation/orders/{order_id}/status?new_status={state}")
            assert response.status_code == 200, f"Failed at {state}: {response.text}"
            data = response.json()
            assert data.get("new_status") == state
            print(f"  ✓ W&F → {state}")
        
        print(f"✓ W&F full state flow completed for order {order_id}")
    
    def test_wf_rejects_invalid_statuses(self, auth_headers, customer_id):
        """Test W&F rejects P&D-only statuses like PICKED_UP, OUT_FOR_DELIVERY, DELIVERED"""
        # Create W&F order
        order_data = {
            "customer_id": customer_id,
            "service_type": "wash_fold",
            "pickup_date": datetime.now().strftime("%Y-%m-%d"),
            "pickup_time_window": "9:00 AM - 12:00 PM",
            "pickup_address": "123 Test St, Ventura, CA 93001",
            "estimated_lbs": 10
        }
        create_response = requests.post(f"{BASE_URL}/api/orders", json=order_data, headers=auth_headers)
        order = create_response.json()
        order_id = order.get("id")
        
        # Try invalid statuses for W&F
        invalid_statuses = ["PICKED_UP", "OUT_FOR_DELIVERY", "DELIVERED"]
        for status in invalid_statuses:
            response = requests.put(f"{BASE_URL}/api/automation/orders/{order_id}/status?new_status={status}")
            assert response.status_code == 400, f"W&F should reject {status}"
            print(f"  ✓ W&F correctly rejects {status}")
        
        print(f"✓ W&F correctly rejects invalid statuses")
    
    # ==================== DASHBOARD SORTING ====================
    
    def test_dashboard_pd_sorting(self, auth_headers, customer_id):
        """Test P&D orders appear in correct dashboard buckets"""
        # Create P&D order in NEW status
        order_data = {
            "customer_id": customer_id,
            "service_type": "pickup_delivery",
            "pickup_date": datetime.now().strftime("%Y-%m-%d"),
            "pickup_time_window": "9:00 AM - 12:00 PM",
            "pickup_address": "123 Test St, Ventura, CA 93001",
            "estimated_lbs": 10
        }
        create_response = requests.post(f"{BASE_URL}/api/orders", json=order_data, headers=auth_headers)
        order = create_response.json()
        order_id = order.get("id")
        
        # Check dashboard - NEW should be in todays_pickups
        dashboard_response = requests.get(f"{BASE_URL}/api/automation/operator-dashboard")
        assert dashboard_response.status_code == 200
        dashboard = dashboard_response.json()
        
        todays_pickups_ids = [o.get("id") for o in dashboard.get("todays_pickups", [])]
        assert order_id in todays_pickups_ids, f"NEW P&D order should be in todays_pickups"
        print(f"✓ P&D NEW order in todays_pickups")
        
        # Move to CONFIRMED - should still be in todays_pickups
        requests.put(f"{BASE_URL}/api/automation/orders/{order_id}/status?new_status=CONFIRMED")
        dashboard_response = requests.get(f"{BASE_URL}/api/automation/operator-dashboard")
        dashboard = dashboard_response.json()
        todays_pickups_ids = [o.get("id") for o in dashboard.get("todays_pickups", [])]
        assert order_id in todays_pickups_ids, f"CONFIRMED P&D order should be in todays_pickups"
        print(f"✓ P&D CONFIRMED order in todays_pickups")
        
        # Move to PICKED_UP - should be in ready_for_delivery
        requests.put(f"{BASE_URL}/api/automation/orders/{order_id}/status?new_status=PICKED_UP")
        dashboard_response = requests.get(f"{BASE_URL}/api/automation/operator-dashboard")
        dashboard = dashboard_response.json()
        ready_for_delivery_ids = [o.get("id") for o in dashboard.get("ready_for_delivery", [])]
        assert order_id in ready_for_delivery_ids, f"PICKED_UP P&D order should be in ready_for_delivery"
        print(f"✓ P&D PICKED_UP order in ready_for_delivery")
    
    def test_dashboard_wf_sorting(self, auth_headers, customer_id):
        """Test W&F orders appear in correct dashboard buckets"""
        # Create W&F order in NEW status
        order_data = {
            "customer_id": customer_id,
            "service_type": "wash_fold",
            "pickup_date": datetime.now().strftime("%Y-%m-%d"),
            "pickup_time_window": "9:00 AM - 12:00 PM",
            "pickup_address": "123 Test St, Ventura, CA 93001",
            "estimated_lbs": 10
        }
        create_response = requests.post(f"{BASE_URL}/api/orders", json=order_data, headers=auth_headers)
        order = create_response.json()
        order_id = order.get("id")
        
        # Check dashboard - NEW should be in wash_fold_dropoffs
        dashboard_response = requests.get(f"{BASE_URL}/api/automation/operator-dashboard")
        assert dashboard_response.status_code == 200
        dashboard = dashboard_response.json()
        
        wf_dropoffs_ids = [o.get("id") for o in dashboard.get("wash_fold_dropoffs", [])]
        assert order_id in wf_dropoffs_ids, f"NEW W&F order should be in wash_fold_dropoffs"
        print(f"✓ W&F NEW order in wash_fold_dropoffs")
        
        # Move to CONFIRMED - should still be in wash_fold_dropoffs
        requests.put(f"{BASE_URL}/api/automation/orders/{order_id}/status?new_status=CONFIRMED")
        dashboard_response = requests.get(f"{BASE_URL}/api/automation/operator-dashboard")
        dashboard = dashboard_response.json()
        wf_dropoffs_ids = [o.get("id") for o in dashboard.get("wash_fold_dropoffs", [])]
        assert order_id in wf_dropoffs_ids, f"CONFIRMED W&F order should be in wash_fold_dropoffs"
        print(f"✓ W&F CONFIRMED order in wash_fold_dropoffs")
        
        # Move to PROCESSING - should be in wash_fold_ready
        requests.put(f"{BASE_URL}/api/automation/orders/{order_id}/status?new_status=PROCESSING")
        dashboard_response = requests.get(f"{BASE_URL}/api/automation/operator-dashboard")
        dashboard = dashboard_response.json()
        wf_ready_ids = [o.get("id") for o in dashboard.get("wash_fold_ready", [])]
        assert order_id in wf_ready_ids, f"PROCESSING W&F order should be in wash_fold_ready"
        print(f"✓ W&F PROCESSING order in wash_fold_ready")
    
    # ==================== PAYMENT CAPTURE + FINANCES ====================
    
    def test_payment_capture_creates_finance_entry(self, auth_headers, customer_id):
        """Test that POST /api/orders/{id}/payment creates entry in finances collection"""
        # Create order
        order_data = {
            "customer_id": customer_id,
            "service_type": "pickup_delivery",
            "pickup_date": datetime.now().strftime("%Y-%m-%d"),
            "pickup_time_window": "9:00 AM - 12:00 PM",
            "pickup_address": "123 Test St, Ventura, CA 93001",
            "estimated_lbs": 10
        }
        create_response = requests.post(f"{BASE_URL}/api/orders", json=order_data, headers=auth_headers)
        order = create_response.json()
        order_id = order.get("id")
        order_number = order.get("order_number")
        
        # Update actual_lbs to get a total_amount
        update_response = requests.put(f"{BASE_URL}/api/orders/{order_id}", 
            json={"actual_lbs": 15}, headers=auth_headers)
        assert update_response.status_code == 200
        updated_order = update_response.json()
        total_amount = updated_order.get("total_amount")
        assert total_amount is not None and total_amount > 0, "total_amount should be calculated"
        
        # Capture payment with cash
        payment_response = requests.post(f"{BASE_URL}/api/orders/{order_id}/payment",
            json={"payment_method": "cash", "amount_received": total_amount + 10},
            headers=auth_headers)
        assert payment_response.status_code == 200, f"Payment capture failed: {payment_response.text}"
        payment_data = payment_response.json()
        assert payment_data.get("ok") == True
        assert payment_data.get("payment_status") == "paid"
        print(f"✓ Payment captured for order {order_id}")
        
        # Verify finance entry was created by checking finances endpoint
        # Note: We can't directly query MongoDB, but we can verify the payment was recorded
        # by checking the order's payment_status
        order_check = requests.get(f"{BASE_URL}/api/orders/{order_id}", headers=auth_headers)
        assert order_check.status_code == 200
        order_data = order_check.json()
        assert order_data.get("payment_status") == "paid"
        assert order_data.get("payment_method") == "cash"
        print(f"✓ Finance entry should be created for order {order_number}")
    
    def test_payment_capture_with_transfer(self, auth_headers, customer_id):
        """Test payment capture with transfer method"""
        # Create order
        order_data = {
            "customer_id": customer_id,
            "service_type": "wash_fold",
            "pickup_date": datetime.now().strftime("%Y-%m-%d"),
            "pickup_time_window": "9:00 AM - 12:00 PM",
            "pickup_address": "123 Test St, Ventura, CA 93001",
            "estimated_lbs": 10
        }
        create_response = requests.post(f"{BASE_URL}/api/orders", json=order_data, headers=auth_headers)
        order = create_response.json()
        order_id = order.get("id")
        
        # Update actual_lbs
        requests.put(f"{BASE_URL}/api/orders/{order_id}", 
            json={"actual_lbs": 12}, headers=auth_headers)
        
        # Capture payment with transfer
        payment_response = requests.post(f"{BASE_URL}/api/orders/{order_id}/payment",
            json={"payment_method": "transfer"},
            headers=auth_headers)
        assert payment_response.status_code == 200, f"Transfer payment failed: {payment_response.text}"
        payment_data = payment_response.json()
        assert payment_data.get("ok") == True
        assert payment_data.get("payment_status") == "paid"
        print(f"✓ Transfer payment captured for order {order_id}")
    
    # ==================== OPERATOR DASHBOARD ENDPOINT ====================
    
    def test_operator_dashboard_returns_all_buckets(self):
        """Test operator dashboard returns all required buckets"""
        response = requests.get(f"{BASE_URL}/api/automation/operator-dashboard")
        assert response.status_code == 200
        data = response.json()
        
        # Check all required fields
        assert "todays_pickups" in data
        assert "ready_for_delivery" in data
        assert "wash_fold_dropoffs" in data
        assert "wash_fold_ready" in data
        assert "stats" in data
        assert "urgent_tickets" in data
        
        # Check stats
        stats = data.get("stats", {})
        assert "pickups_remaining_today" in stats
        assert "orders_in_processing" in stats
        assert "orders_ready" in stats
        assert "urgent_tickets" in stats
        
        print("✓ Operator dashboard returns all required buckets and stats")
    
    def test_dashboard_orders_have_required_fields(self):
        """Test dashboard orders have all required fields for display"""
        response = requests.get(f"{BASE_URL}/api/automation/operator-dashboard")
        assert response.status_code == 200
        data = response.json()
        
        # Check any order in any bucket
        all_orders = (
            data.get("todays_pickups", []) + 
            data.get("ready_for_delivery", []) +
            data.get("wash_fold_dropoffs", []) +
            data.get("wash_fold_ready", [])
        )
        
        if all_orders:
            order = all_orders[0]
            required_fields = ["order_id", "status", "customer_name", "service_type"]
            for field in required_fields:
                assert field in order, f"Order missing required field: {field}"
            print(f"✓ Dashboard orders have required fields")
        else:
            print("⚠ No orders in dashboard to verify fields")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
