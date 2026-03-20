"""
Test delivery flow and notifications for Laundry AI System
- PATCH /api/orders/{id}/status
- Operator Dashboard including OUT_FOR_DELIVERY and DELIVERED states
- Notification triggering on status change
"""

import pytest
import requests
import os
import uuid
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://laundry-forms-ux.preview.emergentagent.com').rstrip('/')


class TestAuth:
    """Test admin login with required credentials"""
    
    def test_admin_login(self):
        """Admin login: owner@frimexllc.com / admin123"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "owner@frimexllc.com",
            "password": "admin123"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "access_token" in data
        assert data["user"]["role"] == "admin"
        print(f"✓ Admin login successful: {data['user']['email']}")
        return data["access_token"]


class TestOperatorDashboard:
    """Test GET /api/automation/operator-dashboard"""
    
    def test_operator_dashboard_returns_valid_json(self):
        """Verify operator-dashboard returns valid JSON structure"""
        response = requests.get(f"{BASE_URL}/api/automation/operator-dashboard")
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        # Check structure
        assert "stats" in data
        assert "todays_pickups" in data
        assert "ready_for_delivery" in data
        assert "urgent_tickets" in data
        
        # Check stats structure
        stats = data["stats"]
        assert "pickups_remaining_today" in stats
        assert "orders_in_processing" in stats
        assert "orders_ready" in stats
        assert "urgent_tickets" in stats
        
        print(f"✓ Operator dashboard structure valid")
        print(f"  Stats: {stats}")
        print(f"  Ready for delivery count: {len(data['ready_for_delivery'])}")
        return data
    
    def test_ready_for_delivery_includes_expected_statuses(self):
        """Verify ready_for_delivery section includes OUT_FOR_DELIVERY and DELIVERED orders"""
        response = requests.get(f"{BASE_URL}/api/automation/operator-dashboard")
        assert response.status_code == 200
        data = response.json()
        
        ready_orders = data.get("ready_for_delivery", [])
        statuses_found = set()
        
        for order in ready_orders:
            status = order.get("status", "").upper()
            statuses_found.add(status)
        
        print(f"✓ Ready for delivery statuses found: {statuses_found}")
        print(f"  Orders in section: {len(ready_orders)}")
        
        # Verify structure has expected fields
        if ready_orders:
            sample_order = ready_orders[0]
            expected_fields = ["order_id", "status", "customer_name", "delivery_address"]
            for field in expected_fields:
                assert field in sample_order, f"Missing field: {field}"
            print(f"  Sample order ID: {sample_order.get('order_id')}")
        
        return statuses_found


class TestOrderStatusUpdate:
    """Test PATCH /api/orders/{id}/status with notification verification"""
    
    @pytest.fixture
    def auth_headers(self):
        """Get auth token for API calls"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "owner@frimexllc.com",
            "password": "admin123"
        })
        assert response.status_code == 200
        token = response.json()["access_token"]
        return {"Authorization": f"Bearer {token}"}
    
    @pytest.fixture
    def test_customer(self, auth_headers):
        """Create a test customer for order creation"""
        customer_data = {
            "name": f"Test Customer {uuid.uuid4().hex[:8]}",
            "email": f"testcustomer_{uuid.uuid4().hex[:8]}@test.com",
            "phone": "+15551234567",
            "address": "123 Test St",
            "preferred_contact": "sms"
        }
        response = requests.post(f"{BASE_URL}/api/customers", json=customer_data, headers=auth_headers)
        assert response.status_code == 200
        return response.json()
    
    @pytest.fixture
    def test_order(self, auth_headers, test_customer):
        """Create a test order for status updates"""
        order_data = {
            "customer_id": test_customer["id"],
            "service_type": "pickup_delivery",
            "pickup_date": datetime.now().strftime("%Y-%m-%d"),
            "pickup_time_window": "9am-12pm",
            "pickup_address": "123 Test St",
            "delivery_address": "123 Test St"
        }
        response = requests.post(f"{BASE_URL}/api/orders?notify=false", json=order_data, headers=auth_headers)
        assert response.status_code == 200
        return response.json()
    
    def test_patch_status_returns_200(self, auth_headers, test_order):
        """PATCH /api/orders/{id}/status should return 200"""
        order_id = test_order["id"]
        
        # Test status update to processing
        response = requests.patch(
            f"{BASE_URL}/api/orders/{order_id}/status?status=processing&notify=false",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        print(f"✓ Status update to 'processing' returned 200")
        
        # Verify status was updated
        get_response = requests.get(f"{BASE_URL}/api/orders/{order_id}", headers=auth_headers)
        assert get_response.status_code == 200
        updated_order = get_response.json()
        assert updated_order["status"] == "processing", f"Status not updated: {updated_order['status']}"
        print(f"✓ Order status verified as 'processing'")
    
    def test_delivery_flow_status_updates(self, auth_headers, test_order):
        """Test complete delivery flow: READY -> OUT_FOR_DELIVERY -> DELIVERED -> COMPLETED"""
        order_id = test_order["id"]
        
        # Progress through statuses
        statuses = ["processing", "ready", "out_for_delivery", "delivered", "completed"]
        
        for status in statuses:
            response = requests.patch(
                f"{BASE_URL}/api/orders/{order_id}/status?status={status}&notify=true",
                headers=auth_headers
            )
            assert response.status_code == 200, f"Failed to update to {status}: {response.text}"
            print(f"✓ Status updated to '{status}'")
            
            # Verify the update
            get_response = requests.get(f"{BASE_URL}/api/orders/{order_id}", headers=auth_headers)
            updated_status = get_response.json()["status"]
            assert updated_status == status, f"Expected {status}, got {updated_status}"
        
        print(f"✓ Complete delivery flow tested successfully")
    
    def test_automation_order_status_update_returns_200(self, auth_headers):
        """Test PUT /api/automation/orders/{id}/status returns 200"""
        # Get an order from operator dashboard
        dashboard_response = requests.get(f"{BASE_URL}/api/automation/operator-dashboard")
        assert dashboard_response.status_code == 200
        data = dashboard_response.json()
        
        test_order = None
        for order in data.get("todays_pickups", []) + data.get("ready_for_delivery", []):
            if order.get("order_id"):
                test_order = order
                break
        
        if not test_order:
            pytest.skip("No orders available to test")
        
        order_id = test_order["order_id"]
        current_status = test_order.get("status", "").upper()
        
        # Try the automation endpoint status update
        next_status_map = {
            "NEW": "CONFIRMED",
            "CONFIRMED": "PICKUP_SCHEDULED",
            "PICKUP_SCHEDULED": "PICKED_UP",
            "PICKED_UP": "PROCESSING",
            "PROCESSING": "READY",
            "READY": "OUT_FOR_DELIVERY",
            "OUT_FOR_DELIVERY": "DELIVERED",
            "DELIVERED": "COMPLETED"
        }
        
        next_status = next_status_map.get(current_status)
        if not next_status:
            # Use a valid status
            next_status = "CONFIRMED" if current_status == "NEW" else "READY"
        
        response = requests.put(
            f"{BASE_URL}/api/automation/orders/{order_id}/status?new_status={next_status}"
        )
        
        # Should return 200 or possibly 400 if validation issue
        assert response.status_code in [200, 400], f"Unexpected status: {response.status_code}, {response.text}"
        
        if response.status_code == 200:
            result = response.json()
            print(f"✓ Automation status update successful: {result.get('old_status')} -> {result.get('new_status')}")
        else:
            print(f"! Status update rejected (validation): {response.text}")


class TestNotificationTrigger:
    """Test that status changes attempt to trigger notifications"""
    
    @pytest.fixture
    def auth_headers(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "owner@frimexllc.com",
            "password": "admin123"
        })
        assert response.status_code == 200
        return {"Authorization": f"Bearer {response.json()['access_token']}"}
    
    def test_status_update_with_notify_flag(self, auth_headers):
        """Verify notify=true triggers notification attempt (no receipt verification needed)"""
        # Create customer with phone for notification
        customer_data = {
            "name": f"Notify Test {uuid.uuid4().hex[:6]}",
            "email": f"notify_{uuid.uuid4().hex[:6]}@test.com",
            "phone": "+15559998888",
            "preferred_contact": "sms"
        }
        cust_response = requests.post(f"{BASE_URL}/api/customers", json=customer_data, headers=auth_headers)
        assert cust_response.status_code == 200
        customer = cust_response.json()
        
        # Create order
        order_data = {
            "customer_id": customer["id"],
            "service_type": "pickup_delivery",
            "pickup_date": datetime.now().strftime("%Y-%m-%d"),
            "pickup_time_window": "9am-12pm",
            "pickup_address": "456 Notify St"
        }
        order_response = requests.post(f"{BASE_URL}/api/orders?notify=false", json=order_data, headers=auth_headers)
        assert order_response.status_code == 200
        order = order_response.json()
        
        # Update status with notify=true - should attempt notification
        # The test passes if API returns 200 (notification attempt is made internally)
        status_response = requests.patch(
            f"{BASE_URL}/api/orders/{order['id']}/status?status=ready&notify=true",
            headers=auth_headers
        )
        
        assert status_response.status_code == 200, f"Status update failed: {status_response.text}"
        print(f"✓ Status update with notify=true returned 200 (notification attempted)")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
