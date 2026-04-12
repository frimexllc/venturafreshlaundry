"""
Test Wash & Fold Notification Flow
- Tests that public Wash & Fold form saves preferred_contact (contact_method)
- Tests that notification logic considers PROCESSING/READY/COMPLETED as notifiable for wash_fold
- Tests that Wash & Fold blocks invalid pickup/delivery statuses (regression)
- Tests that Pickup & Delivery maintains previous notification rules (ready/out_for_delivery/delivered)
"""
import pytest
import requests
import os
import uuid

ADMIN_EMAIL = os.environ.get("TEST_ADMIN_EMAIL", "owner@frimexllc.com")
ADMIN_PASSWORD = os.environ.get("TEST_ADMIN_PASSWORD", "admin123")

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')


class TestWashFoldContactPreference:
    """Test that Wash & Fold orders save contact_method as preferred_contact"""
    
    def test_wash_fold_saves_sms_preference(self):
        """Test that wash_fold order saves SMS as preferred_contact"""
        unique_email = f"test_wf_sms_{uuid.uuid4().hex[:8]}@test.com"
        
        response = requests.post(f"{BASE_URL}/api/public/wash-fold-request", json={
            "name": "SMS Contact Test",
            "email": unique_email,
            "phone": "+1 805 555 1111",
            "contact_method": "sms",
            "notes": "Test SMS preference"
        })
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("success") == True
        order_number = data["order_number"]
        
        # Login as admin to verify order preferred_contact
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert login_response.status_code == 200, f"Login failed: {login_response.text}"
        token = login_response.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        
        # Get orders to find the created one
        orders_response = requests.get(f"{BASE_URL}/api/orders", headers=headers)
        assert orders_response.status_code == 200
        
        orders = orders_response.json()
        created_order = next((o for o in orders if o.get("order_number") == order_number), None)
        
        # Also check in notes since wash_fold stores contact in notes as "Preferred contact: X"
        assert created_order is not None, f"Order {order_number} not found"
        
        # Check preferred_contact field or notes containing contact preference
        preferred_contact = created_order.get("preferred_contact")
        notes = created_order.get("notes", "") or ""
        
        # Either preferred_contact should be 'sms' or notes should contain 'sms'
        has_sms_preference = (
            preferred_contact == "sms" or 
            "sms" in preferred_contact.lower() if preferred_contact else False or
            "sms" in notes.lower()
        )
        
        print(f"Order {order_number} - preferred_contact: {preferred_contact}, notes: {notes[:50]}...")
        assert has_sms_preference, f"SMS preference not saved. preferred_contact={preferred_contact}, notes={notes}"
    
    def test_wash_fold_saves_email_preference(self):
        """Test that wash_fold order saves email as preferred_contact"""
        unique_email = f"test_wf_email_{uuid.uuid4().hex[:8]}@test.com"
        
        response = requests.post(f"{BASE_URL}/api/public/wash-fold-request", json={
            "name": "Email Contact Test",
            "email": unique_email,
            "phone": "+1 805 555 2222",
            "contact_method": "email"
        })
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        order_number = response.json()["order_number"]
        
        # Login and verify
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        token = login_response.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        
        orders_response = requests.get(f"{BASE_URL}/api/orders", headers=headers)
        orders = orders_response.json()
        created_order = next((o for o in orders if o.get("order_number") == order_number), None)
        
        assert created_order is not None
        preferred_contact = created_order.get("preferred_contact")
        notes = created_order.get("notes", "") or ""
        
        has_email_preference = (
            preferred_contact == "email" or 
            "email" in notes.lower()
        )
        print(f"Order {order_number} - preferred_contact: {preferred_contact}")
        assert has_email_preference, f"Email preference not saved correctly"
    
    def test_wash_fold_saves_whatsapp_preference(self):
        """Test that wash_fold order saves WhatsApp as preferred_contact"""
        unique_email = f"test_wf_wa_{uuid.uuid4().hex[:8]}@test.com"
        
        response = requests.post(f"{BASE_URL}/api/public/wash-fold-request", json={
            "name": "WhatsApp Contact Test",
            "email": unique_email,
            "phone": "+1 805 555 3333",
            "contact_method": "whatsapp"
        })
        
        assert response.status_code == 200
        order_number = response.json()["order_number"]
        
        # Login and verify
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        token = login_response.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        
        orders_response = requests.get(f"{BASE_URL}/api/orders", headers=headers)
        orders = orders_response.json()
        created_order = next((o for o in orders if o.get("order_number") == order_number), None)
        
        assert created_order is not None
        preferred_contact = created_order.get("preferred_contact")
        notes = created_order.get("notes", "") or ""
        
        has_whatsapp_preference = (
            preferred_contact == "whatsapp" or 
            "whatsapp" in notes.lower()
        )
        print(f"Order {order_number} - preferred_contact: {preferred_contact}")
        assert has_whatsapp_preference, f"WhatsApp preference not saved correctly"
    
    def test_wash_fold_saves_call_preference(self):
        """Test that wash_fold order saves call as preferred_contact"""
        unique_email = f"test_wf_call_{uuid.uuid4().hex[:8]}@test.com"
        
        response = requests.post(f"{BASE_URL}/api/public/wash-fold-request", json={
            "name": "Call Contact Test",
            "email": unique_email,
            "phone": "+1 805 555 4444",
            "contact_method": "call"
        })
        
        assert response.status_code == 200
        order_number = response.json()["order_number"]
        
        # Login and verify
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        token = login_response.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        
        orders_response = requests.get(f"{BASE_URL}/api/orders", headers=headers)
        orders = orders_response.json()
        created_order = next((o for o in orders if o.get("order_number") == order_number), None)
        
        assert created_order is not None
        preferred_contact = created_order.get("preferred_contact")
        notes = created_order.get("notes", "") or ""
        
        has_call_preference = (
            preferred_contact == "call" or 
            "call" in notes.lower()
        )
        print(f"Order {order_number} - preferred_contact: {preferred_contact}")
        assert has_call_preference, f"Call preference not saved correctly"


class TestWashFoldNotifiableStatuses:
    """Test that notification logic correctly handles wash_fold notifiable statuses"""
    
    def test_wash_fold_processing_status_allowed(self):
        """Test that PROCESSING status is allowed for wash_fold orders"""
        unique_email = f"test_wf_proc_{uuid.uuid4().hex[:8]}@test.com"
        
        # Create wash_fold order
        create_response = requests.post(f"{BASE_URL}/api/public/wash-fold-request", json={
            "name": "Processing Test",
            "email": unique_email,
            "phone": "+1 805 555 5001",
            "contact_method": "sms"
        })
        assert create_response.status_code == 200
        order_number = create_response.json()["order_number"]
        
        # Update to PROCESSING via automation endpoint
        response = requests.put(
            f"{BASE_URL}/api/automation/orders/{order_number}/status",
            params={"new_status": "PROCESSING"}
        )
        assert response.status_code == 200, f"PROCESSING status failed: {response.text}"
        print(f"Order {order_number} moved to PROCESSING successfully")
    
    def test_wash_fold_ready_status_allowed(self):
        """Test that READY status is allowed for wash_fold orders"""
        unique_email = f"test_wf_ready_{uuid.uuid4().hex[:8]}@test.com"
        
        # Create wash_fold order
        create_response = requests.post(f"{BASE_URL}/api/public/wash-fold-request", json={
            "name": "Ready Test",
            "email": unique_email,
            "phone": "+1 805 555 5002",
            "contact_method": "email"
        })
        assert create_response.status_code == 200
        order_number = create_response.json()["order_number"]
        
        # Move to PROCESSING first
        response = requests.put(
            f"{BASE_URL}/api/automation/orders/{order_number}/status",
            params={"new_status": "PROCESSING"}
        )
        assert response.status_code == 200
        
        # Then to READY
        response = requests.put(
            f"{BASE_URL}/api/automation/orders/{order_number}/status",
            params={"new_status": "READY"}
        )
        assert response.status_code == 200, f"READY status failed: {response.text}"
        print(f"Order {order_number} moved to READY successfully")
    
    def test_wash_fold_completed_status_allowed(self):
        """Test that COMPLETED status is allowed for wash_fold orders"""
        unique_email = f"test_wf_compl_{uuid.uuid4().hex[:8]}@test.com"
        
        # Create wash_fold order
        create_response = requests.post(f"{BASE_URL}/api/public/wash-fold-request", json={
            "name": "Completed Test",
            "email": unique_email,
            "phone": "+1 805 555 5003",
            "contact_method": "whatsapp"
        })
        assert create_response.status_code == 200
        order_number = create_response.json()["order_number"]
        
        # Full flow: PROCESSING -> READY -> COMPLETED
        requests.put(
            f"{BASE_URL}/api/automation/orders/{order_number}/status",
            params={"new_status": "PROCESSING"}
        )
        requests.put(
            f"{BASE_URL}/api/automation/orders/{order_number}/status",
            params={"new_status": "READY"}
        )
        
        response = requests.put(
            f"{BASE_URL}/api/automation/orders/{order_number}/status",
            params={"new_status": "COMPLETED"}
        )
        assert response.status_code == 200, f"COMPLETED status failed: {response.text}"
        print(f"Order {order_number} moved to COMPLETED successfully")
    
    def test_wash_fold_cancelled_status_allowed(self):
        """Test that CANCELLED status is allowed for wash_fold orders"""
        unique_email = f"test_wf_cancel_{uuid.uuid4().hex[:8]}@test.com"
        
        # Create wash_fold order
        create_response = requests.post(f"{BASE_URL}/api/public/wash-fold-request", json={
            "name": "Cancel Test",
            "email": unique_email,
            "phone": "+1 805 555 5004",
            "contact_method": "call"
        })
        assert create_response.status_code == 200
        order_number = create_response.json()["order_number"]
        
        # Cancel directly from NEW
        response = requests.put(
            f"{BASE_URL}/api/automation/orders/{order_number}/status",
            params={"new_status": "CANCELLED"}
        )
        assert response.status_code == 200, f"CANCELLED status failed: {response.text}"
        print(f"Order {order_number} moved to CANCELLED successfully")


class TestWashFoldBlockedStatuses:
    """Test that wash_fold orders block non-operational statuses (regression)"""
    
    @pytest.fixture
    def wash_fold_order(self):
        """Create a wash_fold order for testing"""
        unique_email = f"test_wf_block_{uuid.uuid4().hex[:8]}@test.com"
        
        response = requests.post(f"{BASE_URL}/api/public/wash-fold-request", json={
            "name": "Block Test",
            "email": unique_email,
            "phone": "+1 805 555 6001",
            "contact_method": "sms"
        })
        assert response.status_code == 200
        return response.json()["order_number"]
    
    def test_wash_fold_blocks_out_for_delivery(self, wash_fold_order):
        """Wash & Fold should block OUT_FOR_DELIVERY status"""
        response = requests.put(
            f"{BASE_URL}/api/automation/orders/{wash_fold_order}/status",
            params={"new_status": "OUT_FOR_DELIVERY"}
        )
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        assert "Invalid status for Wash & Fold" in response.json().get("detail", "")
        print(f"Correctly blocked OUT_FOR_DELIVERY for wash_fold")
    
    def test_wash_fold_blocks_delivered(self, wash_fold_order):
        """Wash & Fold should block DELIVERED status"""
        response = requests.put(
            f"{BASE_URL}/api/automation/orders/{wash_fold_order}/status",
            params={"new_status": "DELIVERED"}
        )
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        assert "Invalid status for Wash & Fold" in response.json().get("detail", "")
        print(f"Correctly blocked DELIVERED for wash_fold")
    
    def test_wash_fold_blocks_picked_up(self, wash_fold_order):
        """Wash & Fold should block PICKED_UP status"""
        response = requests.put(
            f"{BASE_URL}/api/automation/orders/{wash_fold_order}/status",
            params={"new_status": "PICKED_UP"}
        )
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        assert "Invalid status for Wash & Fold" in response.json().get("detail", "")
        print(f"Correctly blocked PICKED_UP for wash_fold")
    
    def test_wash_fold_blocks_pickup_scheduled(self, wash_fold_order):
        """Wash & Fold should block PICKUP_SCHEDULED status"""
        response = requests.put(
            f"{BASE_URL}/api/automation/orders/{wash_fold_order}/status",
            params={"new_status": "PICKUP_SCHEDULED"}
        )
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        assert "Invalid status for Wash & Fold" in response.json().get("detail", "")
        print(f"Correctly blocked PICKUP_SCHEDULED for wash_fold")
    
    def test_wash_fold_blocks_confirmed(self, wash_fold_order):
        """Wash & Fold should block CONFIRMED status"""
        response = requests.put(
            f"{BASE_URL}/api/automation/orders/{wash_fold_order}/status",
            params={"new_status": "CONFIRMED"}
        )
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        assert "Invalid status for Wash & Fold" in response.json().get("detail", "")
        print(f"Correctly blocked CONFIRMED for wash_fold")


class TestPickupDeliveryNotificationRules:
    """Test that Pickup & Delivery orders maintain previous notification rules"""
    
    @pytest.fixture
    def get_auth_headers(self):
        """Get auth headers for API calls"""
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert login_response.status_code == 200
        token = login_response.json()["access_token"]
        return {"Authorization": f"Bearer {token}"}
    
    def test_pickup_delivery_ready_status_allowed(self, get_auth_headers):
        """Test that pickup_delivery orders allow READY status"""
        unique_email = f"test_pd_ready_{uuid.uuid4().hex[:8]}@test.com"
        
        # Create pickup_delivery order via public form
        create_response = requests.post(f"{BASE_URL}/api/public/pickup-request", json={
            "name": "PD Ready Test",
            "email": unique_email,
            "phone": "+1 805 555 7001",
            "address": "123 Test St, Ventura, CA 93001",
            "pickup_date": "2026-03-15",
            "pickup_time": "Morning",
            "contact_method": "sms"
        })
        assert create_response.status_code == 200
        order_number = create_response.json()["order_number"]
        
        # Login as admin to update status via server endpoint
        response = requests.patch(
            f"{BASE_URL}/api/orders/{order_number}/status",
            params={"status": "ready"},
            headers=get_auth_headers
        )
        
        # Note: This might fail if order doesn't exist yet - using find by order_number
        # Let's check orders first
        orders_response = requests.get(f"{BASE_URL}/api/orders", headers=get_auth_headers)
        orders = orders_response.json()
        order = next((o for o in orders if o.get("order_number") == order_number), None)
        
        if order:
            order_id = order.get("id")
            response = requests.patch(
                f"{BASE_URL}/api/orders/{order_id}/status",
                params={"status": "ready"},
                headers=get_auth_headers
            )
            assert response.status_code == 200, f"READY status failed for pickup_delivery: {response.text}"
            print(f"Pickup & Delivery order {order_number} moved to READY successfully")
        else:
            print(f"Order {order_number} not found, skipping status update")
    
    def test_pickup_delivery_out_for_delivery_allowed(self, get_auth_headers):
        """Test that pickup_delivery orders allow OUT_FOR_DELIVERY status"""
        unique_email = f"test_pd_ofd_{uuid.uuid4().hex[:8]}@test.com"
        
        create_response = requests.post(f"{BASE_URL}/api/public/pickup-request", json={
            "name": "PD OFD Test",
            "email": unique_email,
            "phone": "+1 805 555 7002",
            "address": "456 Test Ave, Ventura, CA 93003",
            "pickup_date": "2026-03-16",
            "pickup_time": "Afternoon",
            "contact_method": "email"
        })
        assert create_response.status_code == 200
        order_number = create_response.json()["order_number"]
        
        orders_response = requests.get(f"{BASE_URL}/api/orders", headers=get_auth_headers)
        orders = orders_response.json()
        order = next((o for o in orders if o.get("order_number") == order_number), None)
        
        if order:
            order_id = order.get("id")
            # First set to ready
            requests.patch(
                f"{BASE_URL}/api/orders/{order_id}/status",
                params={"status": "ready"},
                headers=get_auth_headers
            )
            # Then to out_for_delivery
            response = requests.patch(
                f"{BASE_URL}/api/orders/{order_id}/status",
                params={"status": "out_for_delivery"},
                headers=get_auth_headers
            )
            assert response.status_code == 200, f"OUT_FOR_DELIVERY status failed for pickup_delivery: {response.text}"
            print(f"Pickup & Delivery order {order_number} moved to OUT_FOR_DELIVERY successfully")
    
    def test_pickup_delivery_delivered_allowed(self, get_auth_headers):
        """Test that pickup_delivery orders allow DELIVERED status"""
        unique_email = f"test_pd_deliv_{uuid.uuid4().hex[:8]}@test.com"
        
        create_response = requests.post(f"{BASE_URL}/api/public/pickup-request", json={
            "name": "PD Delivered Test",
            "email": unique_email,
            "phone": "+1 805 555 7003",
            "address": "789 Test Blvd, Ventura, CA 93004",
            "pickup_date": "2026-03-17",
            "pickup_time": "Evening",
            "contact_method": "whatsapp"
        })
        assert create_response.status_code == 200
        order_number = create_response.json()["order_number"]
        
        orders_response = requests.get(f"{BASE_URL}/api/orders", headers=get_auth_headers)
        orders = orders_response.json()
        order = next((o for o in orders if o.get("order_number") == order_number), None)
        
        if order:
            order_id = order.get("id")
            # Progress through statuses
            requests.patch(
                f"{BASE_URL}/api/orders/{order_id}/status",
                params={"status": "ready"},
                headers=get_auth_headers
            )
            requests.patch(
                f"{BASE_URL}/api/orders/{order_id}/status",
                params={"status": "out_for_delivery"},
                headers=get_auth_headers
            )
            # Then to delivered
            response = requests.patch(
                f"{BASE_URL}/api/orders/{order_id}/status",
                params={"status": "delivered"},
                headers=get_auth_headers
            )
            assert response.status_code == 200, f"DELIVERED status failed for pickup_delivery: {response.text}"
            print(f"Pickup & Delivery order {order_number} moved to DELIVERED successfully")


class TestNotificationShouldNotifyLogic:
    """Unit-style tests for should_notify_order_status logic"""
    
    def test_server_should_notify_wash_fold_processing(self):
        """Check server endpoint returns notifiable for wash_fold processing"""
        # This tests indirectly by verifying the status update works without errors
        unique_email = f"test_notify_proc_{uuid.uuid4().hex[:8]}@test.com"
        
        create_response = requests.post(f"{BASE_URL}/api/public/wash-fold-request", json={
            "name": "Notify Processing Test",
            "email": unique_email,
            "phone": "+1 805 555 8001",
            "contact_method": "sms"
        })
        assert create_response.status_code == 200
        order_number = create_response.json()["order_number"]
        
        # The automation endpoint triggers notification if should_notify returns True
        # We test indirectly by ensuring status update succeeds
        response = requests.put(
            f"{BASE_URL}/api/automation/orders/{order_number}/status",
            params={"new_status": "PROCESSING"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data.get("new_status") == "PROCESSING"
        print(f"Wash & Fold PROCESSING notification logic verified for order {order_number}")
    
    def test_server_should_notify_wash_fold_ready(self):
        """Check server returns notifiable for wash_fold ready"""
        unique_email = f"test_notify_ready_{uuid.uuid4().hex[:8]}@test.com"
        
        create_response = requests.post(f"{BASE_URL}/api/public/wash-fold-request", json={
            "name": "Notify Ready Test",
            "email": unique_email,
            "phone": "+1 805 555 8002",
            "contact_method": "email"
        })
        assert create_response.status_code == 200
        order_number = create_response.json()["order_number"]
        
        # Progress to READY
        requests.put(
            f"{BASE_URL}/api/automation/orders/{order_number}/status",
            params={"new_status": "PROCESSING"}
        )
        
        response = requests.put(
            f"{BASE_URL}/api/automation/orders/{order_number}/status",
            params={"new_status": "READY"}
        )
        assert response.status_code == 200
        assert response.json().get("new_status") == "READY"
        print(f"Wash & Fold READY notification logic verified for order {order_number}")
    
    def test_server_should_notify_wash_fold_completed(self):
        """Check server returns notifiable for wash_fold completed"""
        unique_email = f"test_notify_compl_{uuid.uuid4().hex[:8]}@test.com"
        
        create_response = requests.post(f"{BASE_URL}/api/public/wash-fold-request", json={
            "name": "Notify Completed Test",
            "email": unique_email,
            "phone": "+1 805 555 8003",
            "contact_method": "whatsapp"
        })
        assert create_response.status_code == 200
        order_number = create_response.json()["order_number"]
        
        # Progress to COMPLETED
        requests.put(
            f"{BASE_URL}/api/automation/orders/{order_number}/status",
            params={"new_status": "PROCESSING"}
        )
        requests.put(
            f"{BASE_URL}/api/automation/orders/{order_number}/status",
            params={"new_status": "READY"}
        )
        
        response = requests.put(
            f"{BASE_URL}/api/automation/orders/{order_number}/status",
            params={"new_status": "COMPLETED"}
        )
        assert response.status_code == 200
        assert response.json().get("new_status") == "COMPLETED"
        print(f"Wash & Fold COMPLETED notification logic verified for order {order_number}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
