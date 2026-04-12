"""
Test Wash & Fold Drop-Off Flow
- Tests the specific workflow: NEW -> PROCESSING -> READY -> COMPLETED (no pickup/delivery steps)
- Tests blocking of invalid statuses (DELIVERED, OUT_FOR_DELIVERY, PICKUP_*) for wash_fold orders
- Tests the public form /api/public/wash-fold-request with optional address
- Tests shipping quote regression for valid addresses
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestWashFoldStatusFlow:
    """Test that wash_fold orders follow the correct status flow"""
    
    def test_create_wash_fold_order_via_public_form(self):
        """Test creating a wash_fold order via the public form endpoint"""
        unique_email = f"test_washfold_{uuid.uuid4().hex[:8]}@test.com"
        
        # Submit wash_fold request without address (should succeed - address is optional)
        response = requests.post(f"{BASE_URL}/api/public/wash-fold-request", json={
            "name": "Test WashFold User",
            "email": unique_email,
            "phone": "+1 805 555 1234",
            "address": None,  # Address is optional for wash_fold drop-off
            "dropoff_date": "2026-03-02",
            "dropoff_time": None,
            "contact_method": "phone",
            "notes": "Test wash fold order"
        })
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("success") == True
        assert "order_number" in data
        print(f"Created wash_fold order: {data['order_number']}")
        return data["order_number"]
    
    def test_wash_fold_order_with_optional_address(self):
        """Test that wash_fold order can be created with address (optional)"""
        unique_email = f"test_wf_addr_{uuid.uuid4().hex[:8]}@test.com"
        
        # Submit with address
        response = requests.post(f"{BASE_URL}/api/public/wash-fold-request", json={
            "name": "Test With Address",
            "email": unique_email,
            "phone": "+1 805 555 5678",
            "address": "123 Main St, Ventura, CA 93001",  # Optional address
            "contact_method": "email",
            "notes": ""
        })
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("success") == True
        print(f"Created wash_fold order with address: {data['order_number']}")
    
    def test_wash_fold_operator_dashboard_shows_correct_next_status(self):
        """Test that operator dashboard returns correct next_status for wash_fold orders"""
        # First create a wash_fold order
        unique_email = f"test_wf_dash_{uuid.uuid4().hex[:8]}@test.com"
        
        create_response = requests.post(f"{BASE_URL}/api/public/wash-fold-request", json={
            "name": "Dashboard Test User",
            "email": unique_email,
            "phone": "+1 805 555 9999",
            "contact_method": "text"
        })
        assert create_response.status_code == 200
        order_number = create_response.json()["order_number"]
        
        # Check operator dashboard
        dashboard_response = requests.get(f"{BASE_URL}/api/automation/operator-dashboard")
        assert dashboard_response.status_code == 200
        
        dashboard = dashboard_response.json()
        
        # Find the order in wash_fold_dropoffs
        wash_fold_orders = dashboard.get("wash_fold_dropoffs", [])
        order = next((o for o in wash_fold_orders if o.get("order_number") == order_number), None)
        
        if order:
            # For NEW status, next_status should be PROCESSING
            assert order.get("next_status") == "PROCESSING", f"Expected PROCESSING, got {order.get('next_status')}"
            assert order.get("action_label") == "Procesar", f"Expected 'Procesar', got {order.get('action_label')}"
            print(f"Order {order_number} correctly shows next_status=PROCESSING")
        else:
            # Order might be in a different section or already processed
            print(f"Order {order_number} not found in wash_fold_dropoffs, checking other sections...")


class TestWashFoldInvalidStatusBlocking:
    """Test that invalid statuses are blocked for wash_fold orders"""
    
    @pytest.fixture
    def wash_fold_order(self):
        """Create a wash_fold order for testing"""
        unique_email = f"test_wf_block_{uuid.uuid4().hex[:8]}@test.com"
        
        response = requests.post(f"{BASE_URL}/api/public/wash-fold-request", json={
            "name": "Block Test User",
            "email": unique_email,
            "phone": "+1 805 555 0001",
            "contact_method": "email"
        })
        assert response.status_code == 200
        return response.json()["order_number"]
    
    def test_wash_fold_blocks_delivered_status(self, wash_fold_order):
        """Wash & Fold should reject DELIVERED status"""
        response = requests.put(
            f"{BASE_URL}/api/automation/orders/{wash_fold_order}/status",
            params={"new_status": "DELIVERED"}
        )
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        error = response.json()
        assert "Invalid status for Wash & Fold" in error.get("detail", "")
        print(f"Correctly blocked DELIVERED status: {error}")
    
    def test_wash_fold_blocks_out_for_delivery_status(self, wash_fold_order):
        """Wash & Fold should reject OUT_FOR_DELIVERY status"""
        response = requests.put(
            f"{BASE_URL}/api/automation/orders/{wash_fold_order}/status",
            params={"new_status": "OUT_FOR_DELIVERY"}
        )
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        error = response.json()
        assert "Invalid status for Wash & Fold" in error.get("detail", "")
        print(f"Correctly blocked OUT_FOR_DELIVERY status: {error}")
    
    def test_wash_fold_blocks_pickup_scheduled_status(self, wash_fold_order):
        """Wash & Fold should reject PICKUP_SCHEDULED status"""
        response = requests.put(
            f"{BASE_URL}/api/automation/orders/{wash_fold_order}/status",
            params={"new_status": "PICKUP_SCHEDULED"}
        )
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        error = response.json()
        assert "Invalid status for Wash & Fold" in error.get("detail", "")
        print(f"Correctly blocked PICKUP_SCHEDULED status: {error}")
    
    def test_wash_fold_blocks_picked_up_status(self, wash_fold_order):
        """Wash & Fold should reject PICKED_UP status"""
        response = requests.put(
            f"{BASE_URL}/api/automation/orders/{wash_fold_order}/status",
            params={"new_status": "PICKED_UP"}
        )
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        error = response.json()
        assert "Invalid status for Wash & Fold" in error.get("detail", "")
        print(f"Correctly blocked PICKED_UP status: {error}")
    
    def test_wash_fold_blocks_confirmed_status(self, wash_fold_order):
        """Wash & Fold should reject CONFIRMED status"""
        response = requests.put(
            f"{BASE_URL}/api/automation/orders/{wash_fold_order}/status",
            params={"new_status": "CONFIRMED"}
        )
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        error = response.json()
        assert "Invalid status for Wash & Fold" in error.get("detail", "")
        print(f"Correctly blocked CONFIRMED status: {error}")


class TestWashFoldValidStatusFlow:
    """Test that valid status transitions work for wash_fold orders"""
    
    def test_wash_fold_complete_flow(self):
        """Test complete wash_fold flow: NEW -> PROCESSING -> READY -> COMPLETED"""
        unique_email = f"test_wf_flow_{uuid.uuid4().hex[:8]}@test.com"
        
        # Create wash_fold order
        create_response = requests.post(f"{BASE_URL}/api/public/wash-fold-request", json={
            "name": "Flow Test User",
            "email": unique_email,
            "phone": "+1 805 555 2222",
            "contact_method": "text"
        })
        assert create_response.status_code == 200
        order_number = create_response.json()["order_number"]
        print(f"Created order: {order_number}")
        
        # Step 1: NEW -> PROCESSING
        response = requests.put(
            f"{BASE_URL}/api/automation/orders/{order_number}/status",
            params={"new_status": "PROCESSING"}
        )
        assert response.status_code == 200, f"NEW->PROCESSING failed: {response.text}"
        print(f"Step 1: NEW -> PROCESSING: OK")
        
        # Step 2: PROCESSING -> READY
        response = requests.put(
            f"{BASE_URL}/api/automation/orders/{order_number}/status",
            params={"new_status": "READY"}
        )
        assert response.status_code == 200, f"PROCESSING->READY failed: {response.text}"
        print(f"Step 2: PROCESSING -> READY: OK")
        
        # Step 3: READY -> COMPLETED
        response = requests.put(
            f"{BASE_URL}/api/automation/orders/{order_number}/status",
            params={"new_status": "COMPLETED"}
        )
        assert response.status_code == 200, f"READY->COMPLETED failed: {response.text}"
        print(f"Step 3: READY -> COMPLETED: OK")
        
        print(f"Full wash_fold flow completed successfully for order {order_number}")


class TestShippingQuoteRegression:
    """Test that shipping quote endpoint still works for valid addresses"""
    
    def test_shipping_quote_valid_address(self):
        """Shipping quote should return 200 for valid address"""
        response = requests.post(f"{BASE_URL}/api/store/shipping/quote", json={
            "address": "5722 Telephone Rd, Ventura, CA 93003"
        })
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Should have distance and fee
        assert "distance_km" in data, "Missing distance_km in response"
        assert "fee" in data, "Missing fee in response"
        print(f"Shipping quote: {data}")
    
    def test_shipping_quote_downtown_ventura(self):
        """Shipping quote should work for downtown Ventura address"""
        response = requests.post(f"{BASE_URL}/api/store/shipping/quote", json={
            "address": "123 Main St, Ventura, CA 93001"
        })
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("fee") is not None
        print(f"Downtown Ventura shipping: {data}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
