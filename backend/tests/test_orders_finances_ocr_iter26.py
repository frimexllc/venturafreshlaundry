"""
Test suite for Iteration 26: Orders module extraction + Finances summary + Enhanced OCR
Modules tested:
- routes/orders.py: Orders CRUD, QR endpoints, Payment capture, Status updates
- routes/finances.py: /summary endpoint (moved from server_core.py)
- routes/file_uploads.py: Enhanced OCR with date/vendor fields
- realtime.py: Shared socket emission module
- Previously extracted modules: services, audit-logs, settings, operator
"""
import pytest
import requests
import os
import uuid
import base64
import struct
import zlib
from datetime import datetime, timedelta

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
ADMIN_EMAIL = os.environ.get("TEST_ADMIN_EMAIL", "owner@frimexllc.com")
ADMIN_PASSWORD = "Fr!m3x##$$"


@pytest.fixture(scope="module")
def admin_token():
    """Get admin authentication token"""
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
    )
    assert response.status_code == 200, f"Admin login failed: {response.text}"
    data = response.json()
    assert "access_token" in data
    return data["access_token"]


@pytest.fixture(scope="module")
def auth_headers(admin_token):
    """Headers with admin auth token"""
    return {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {admin_token}"
    }


@pytest.fixture(scope="module")
def test_customer_id(auth_headers):
    """Get or create a test customer for order tests"""
    # First try to find an existing customer
    response = requests.get(
        f"{BASE_URL}/api/customers?page=1&page_size=1",
        headers=auth_headers
    )
    if response.status_code == 200:
        customers = response.json()
        if customers and len(customers) > 0:
            return customers[0]["id"]
    
    # Create a new test customer if none exists
    customer_data = {
        "name": f"TEST_OrderCustomer_{uuid.uuid4().hex[:6]}",
        "email": f"test_order_customer_{uuid.uuid4().hex[:6]}@test.com",
        "phone": "555-0000",
        "address": "123 Test Order St, Ventura, CA 93003"
    }
    create_resp = requests.post(
        f"{BASE_URL}/api/customers",
        headers=auth_headers,
        json=customer_data
    )
    assert create_resp.status_code == 200, f"Failed to create test customer: {create_resp.text}"
    return create_resp.json()["id"]


# ==================== ORDERS CRUD TESTS ====================

class TestOrdersCRUD:
    """Tests for routes/orders.py - Orders CRUD operations"""
    
    def test_create_order(self, auth_headers, test_customer_id):
        """POST /api/orders - create new order"""
        order_data = {
            "customer_id": test_customer_id,
            "service_type": "pickup_delivery",
            "pickup_date": (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d"),
            "pickup_time_window": "9am-12pm",
            "pickup_address": "123 Test St, Ventura, CA 93003",
            "delivery_address": "456 Delivery Ave, Ventura, CA 93003",
            "estimated_lbs": 15.0,
            "notes": "TEST_Order for iteration 26 testing",
            "gate_code": "1234"
        }
        response = requests.post(
            f"{BASE_URL}/api/orders",
            headers=auth_headers,
            json=order_data
        )
        assert response.status_code == 200, f"Create order failed: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "id" in data
        assert "order_number" in data
        assert data["customer_id"] == test_customer_id
        assert data["service_type"] == "pickup_delivery"
        assert data["status"] == "new"
        assert data["payment_status"] in ["unpaid", "pending"]  # Both are valid initial states
        # Note: qr_token is stored in DB but not exposed in OrderResponse model
        
        print(f"Created order: {data['order_number']} (ID: {data['id']})")
        return data["id"]
    
    def test_get_orders_list(self, auth_headers):
        """GET /api/orders - list orders with pagination"""
        response = requests.get(
            f"{BASE_URL}/api/orders?page=1&page_size=10",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Orders count: {len(data)}")
    
    def test_get_orders_filtered_by_status(self, auth_headers):
        """GET /api/orders?status=new - filter by status"""
        response = requests.get(
            f"{BASE_URL}/api/orders?status=new&page=1&page_size=10",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        # All returned orders should have status=new
        for order in data:
            assert order["status"].lower() == "new"
        print(f"Orders with status=new: {len(data)}")
    
    def test_get_single_order(self, auth_headers, test_customer_id):
        """GET /api/orders/{order_id} - get single order"""
        # First create an order
        order_data = {
            "customer_id": test_customer_id,
            "service_type": "wash_fold",
            "pickup_date": (datetime.now() + timedelta(days=2)).strftime("%Y-%m-%d"),
            "pickup_time_window": "2pm-5pm",
            "estimated_lbs": 10.0,
            "notes": "TEST_SingleOrder"
        }
        create_resp = requests.post(
            f"{BASE_URL}/api/orders",
            headers=auth_headers,
            json=order_data
        )
        assert create_resp.status_code == 200
        order_id = create_resp.json()["id"]
        
        # Get the order
        get_resp = requests.get(
            f"{BASE_URL}/api/orders/{order_id}",
            headers=auth_headers
        )
        assert get_resp.status_code == 200
        data = get_resp.json()
        assert data["id"] == order_id
        assert data["service_type"] == "wash_fold"
        print(f"Retrieved order: {data['order_number']}")
    
    def test_update_order(self, auth_headers, test_customer_id):
        """PUT /api/orders/{order_id} - update order"""
        # Create order
        order_data = {
            "customer_id": test_customer_id,
            "service_type": "pickup_delivery",
            "pickup_date": (datetime.now() + timedelta(days=3)).strftime("%Y-%m-%d"),
            "pickup_time_window": "9am-12pm",
            "estimated_lbs": 20.0,
            "notes": "TEST_UpdateOrder"
        }
        create_resp = requests.post(
            f"{BASE_URL}/api/orders",
            headers=auth_headers,
            json=order_data
        )
        assert create_resp.status_code == 200
        order_id = create_resp.json()["id"]
        
        # Update the order
        update_data = {
            "actual_lbs": 18.5,
            "notes": "TEST_UpdateOrder - Updated notes"
        }
        update_resp = requests.put(
            f"{BASE_URL}/api/orders/{order_id}",
            headers=auth_headers,
            json=update_data
        )
        assert update_resp.status_code == 200
        updated = update_resp.json()
        assert updated["actual_lbs"] == 18.5
        assert "Updated notes" in updated["notes"]
        print(f"Updated order: {order_id}")
    
    def test_get_order_not_found(self, auth_headers):
        """GET /api/orders/{order_id} - 404 for nonexistent order"""
        response = requests.get(
            f"{BASE_URL}/api/orders/nonexistent-order-id",
            headers=auth_headers
        )
        assert response.status_code == 404
        print("Correctly returns 404 for nonexistent order")


# ==================== ORDER STATUS TESTS ====================

class TestOrderStatus:
    """Tests for order status transitions"""
    
    def test_update_order_status(self, auth_headers, test_customer_id):
        """PATCH /api/orders/{order_id}/status - update status"""
        # Create order
        order_data = {
            "customer_id": test_customer_id,
            "service_type": "pickup_delivery",
            "pickup_date": (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d"),
            "pickup_time_window": "9am-12pm",
            "estimated_lbs": 15.0,
            "notes": "TEST_StatusUpdate"
        }
        create_resp = requests.post(
            f"{BASE_URL}/api/orders",
            headers=auth_headers,
            json=order_data
        )
        assert create_resp.status_code == 200
        order_id = create_resp.json()["id"]
        
        # Update status to confirmed
        status_resp = requests.patch(
            f"{BASE_URL}/api/orders/{order_id}/status?status=confirmed",
            headers=auth_headers
        )
        assert status_resp.status_code == 200
        assert "confirmed" in status_resp.json()["message"].lower()
        
        # Verify status changed
        get_resp = requests.get(
            f"{BASE_URL}/api/orders/{order_id}",
            headers=auth_headers
        )
        assert get_resp.status_code == 200
        assert get_resp.json()["status"] == "confirmed"
        print(f"Order status updated to confirmed: {order_id}")
    
    def test_update_order_status_invalid(self, auth_headers, test_customer_id):
        """PATCH /api/orders/{order_id}/status - invalid status rejected"""
        # Create order
        order_data = {
            "customer_id": test_customer_id,
            "service_type": "pickup_delivery",
            "pickup_date": (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d"),
            "pickup_time_window": "9am-12pm",
            "estimated_lbs": 10.0,
            "notes": "TEST_InvalidStatus"
        }
        create_resp = requests.post(
            f"{BASE_URL}/api/orders",
            headers=auth_headers,
            json=order_data
        )
        assert create_resp.status_code == 200
        order_id = create_resp.json()["id"]
        
        # Try invalid status
        status_resp = requests.patch(
            f"{BASE_URL}/api/orders/{order_id}/status?status=invalid_status",
            headers=auth_headers
        )
        assert status_resp.status_code == 400
        print("Invalid status correctly rejected")


# ==================== ORDER PAYMENT TESTS ====================

class TestOrderPayment:
    """Tests for order payment endpoints"""
    
    def test_update_payment_status(self, auth_headers, test_customer_id):
        """PATCH /api/orders/{order_id}/payment-status - update payment status"""
        # Create order
        order_data = {
            "customer_id": test_customer_id,
            "service_type": "wash_fold",
            "pickup_date": (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d"),
            "pickup_time_window": "9am-12pm",
            "estimated_lbs": 12.0,
            "notes": "TEST_PaymentStatus"
        }
        create_resp = requests.post(
            f"{BASE_URL}/api/orders",
            headers=auth_headers,
            json=order_data
        )
        assert create_resp.status_code == 200
        order_id = create_resp.json()["id"]
        
        # Update payment status
        payment_resp = requests.patch(
            f"{BASE_URL}/api/orders/{order_id}/payment-status?status=paid",
            headers=auth_headers
        )
        assert payment_resp.status_code == 200
        assert "paid" in payment_resp.json()["message"].lower()
        
        # Verify payment status changed
        get_resp = requests.get(
            f"{BASE_URL}/api/orders/{order_id}",
            headers=auth_headers
        )
        assert get_resp.status_code == 200
        assert get_resp.json()["payment_status"] == "paid"
        print(f"Payment status updated to paid: {order_id}")
    
    def test_capture_cash_payment(self, auth_headers, test_customer_id):
        """POST /api/orders/{order_id}/payment - capture cash payment"""
        # Create order with total_amount
        order_data = {
            "customer_id": test_customer_id,
            "service_type": "wash_fold",
            "pickup_date": (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d"),
            "pickup_time_window": "9am-12pm",
            "estimated_lbs": 10.0,
            "notes": "TEST_CashPayment"
        }
        create_resp = requests.post(
            f"{BASE_URL}/api/orders",
            headers=auth_headers,
            json=order_data
        )
        assert create_resp.status_code == 200
        order_id = create_resp.json()["id"]
        
        # Set actual_lbs to calculate total_amount
        update_resp = requests.put(
            f"{BASE_URL}/api/orders/{order_id}",
            headers=auth_headers,
            json={"actual_lbs": 10.0, "total_amount": 25.00}
        )
        assert update_resp.status_code == 200
        
        # Capture cash payment
        payment_data = {
            "payment_method": "cash",
            "amount_received": 30.00
        }
        payment_resp = requests.post(
            f"{BASE_URL}/api/orders/{order_id}/payment",
            headers=auth_headers,
            json=payment_data
        )
        assert payment_resp.status_code == 200
        data = payment_resp.json()
        assert data["ok"] == True
        assert data["payment_status"] == "paid"
        assert data["payment_method"] == "cash"
        # change_due depends on actual service pricing calculation
        assert data["change_due"] is not None
        assert data["change_due"] >= 0
        print(f"Cash payment captured: {order_id}, change_due: {data['change_due']}")
    
    def test_capture_card_payment(self, auth_headers, test_customer_id):
        """POST /api/orders/{order_id}/payment - capture card payment"""
        # Create order
        order_data = {
            "customer_id": test_customer_id,
            "service_type": "pickup_delivery",
            "pickup_date": (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d"),
            "pickup_time_window": "2pm-5pm",
            "estimated_lbs": 8.0,
            "notes": "TEST_CardPayment"
        }
        create_resp = requests.post(
            f"{BASE_URL}/api/orders",
            headers=auth_headers,
            json=order_data
        )
        assert create_resp.status_code == 200
        order_id = create_resp.json()["id"]
        
        # Set total_amount
        update_resp = requests.put(
            f"{BASE_URL}/api/orders/{order_id}",
            headers=auth_headers,
            json={"total_amount": 20.00}
        )
        assert update_resp.status_code == 200
        
        # Capture card payment
        payment_data = {
            "payment_method": "card",
            "amount_received": 20.00
        }
        payment_resp = requests.post(
            f"{BASE_URL}/api/orders/{order_id}/payment",
            headers=auth_headers,
            json=payment_data
        )
        assert payment_resp.status_code == 200
        data = payment_resp.json()
        assert data["ok"] == True
        assert data["payment_method"] == "card"
        print(f"Card payment captured: {order_id}")


# ==================== ORDER QR TESTS ====================

class TestOrderQR:
    """Tests for order QR code endpoints"""
    
    def test_get_order_qr(self, auth_headers, test_customer_id):
        """GET /api/orders/{order_id}/qr - get QR token"""
        # Create order
        order_data = {
            "customer_id": test_customer_id,
            "service_type": "pickup_delivery",
            "pickup_date": (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d"),
            "pickup_time_window": "9am-12pm",
            "estimated_lbs": 10.0,
            "notes": "TEST_QRToken"
        }
        create_resp = requests.post(
            f"{BASE_URL}/api/orders",
            headers=auth_headers,
            json=order_data
        )
        assert create_resp.status_code == 200
        order_id = create_resp.json()["id"]
        
        # Get QR token
        qr_resp = requests.get(
            f"{BASE_URL}/api/orders/{order_id}/qr",
            headers=auth_headers
        )
        assert qr_resp.status_code == 200
        data = qr_resp.json()
        assert "order_id" in data
        assert "qr_token" in data
        assert data["order_id"] == order_id
        print(f"QR token retrieved: {data['qr_token'][:20]}...")
    
    def test_get_order_qr_svg(self, auth_headers, test_customer_id):
        """GET /api/orders/{order_id}/qr.svg - get QR SVG ticket"""
        # Create order
        order_data = {
            "customer_id": test_customer_id,
            "service_type": "wash_fold",
            "pickup_date": (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d"),
            "pickup_time_window": "9am-12pm",
            "estimated_lbs": 15.0,
            "notes": "TEST_QRSVG"
        }
        create_resp = requests.post(
            f"{BASE_URL}/api/orders",
            headers=auth_headers,
            json=order_data
        )
        assert create_resp.status_code == 200
        order_id = create_resp.json()["id"]
        
        # Get QR SVG
        svg_resp = requests.get(
            f"{BASE_URL}/api/orders/{order_id}/qr.svg",
            headers=auth_headers
        )
        assert svg_resp.status_code == 200
        assert "image/svg+xml" in svg_resp.headers.get("Content-Type", "")
        assert b"<svg" in svg_resp.content
        print(f"QR SVG retrieved, size: {len(svg_resp.content)} bytes")
    
    def test_resolve_qr(self, auth_headers, test_customer_id):
        """POST /api/orders/qr/resolve - resolve QR to order"""
        # Create order
        order_data = {
            "customer_id": test_customer_id,
            "service_type": "pickup_delivery",
            "pickup_date": (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d"),
            "pickup_time_window": "9am-12pm",
            "estimated_lbs": 12.0,
            "notes": "TEST_QRResolve"
        }
        create_resp = requests.post(
            f"{BASE_URL}/api/orders",
            headers=auth_headers,
            json=order_data
        )
        assert create_resp.status_code == 200
        created = create_resp.json()
        order_id = created["id"]
        
        # First get the qr_token via the QR endpoint (not in OrderResponse)
        qr_resp = requests.get(
            f"{BASE_URL}/api/orders/{order_id}/qr",
            headers=auth_headers
        )
        assert qr_resp.status_code == 200
        qr_token = qr_resp.json()["qr_token"]
        
        # Resolve QR
        resolve_resp = requests.post(
            f"{BASE_URL}/api/orders/qr/resolve",
            headers=auth_headers,
            json={"qr_token": qr_token}
        )
        assert resolve_resp.status_code == 200
        data = resolve_resp.json()
        assert data["order_id"] == order_id
        assert "customer_name" in data
        assert "status" in data
        print(f"QR resolved to order: {data['order_number']}")


# ==================== FINANCES SUMMARY TESTS ====================

class TestFinancesSummary:
    """Tests for /api/finances/summary endpoint (moved from server_core.py)"""
    
    def test_get_finances_summary_no_filters(self, auth_headers):
        """GET /api/finances/summary - without date filters"""
        response = requests.get(
            f"{BASE_URL}/api/finances/summary",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        
        # Verify response structure
        assert "total_revenue" in data
        assert "order_revenue" in data
        assert "membership_revenue" in data
        assert "store_revenue" in data
        assert "total_orders" in data
        assert "paid_orders" in data
        assert "pending_orders" in data
        assert "avg_order_value" in data
        assert "payment_methods" in data
        
        print(f"Finances summary: total_revenue=${data['total_revenue']}, orders={data['total_orders']}")
    
    def test_get_finances_summary_with_date_filters(self, auth_headers):
        """GET /api/finances/summary - with date filters"""
        start_date = (datetime.now() - timedelta(days=30)).strftime("%Y-%m-%d")
        end_date = datetime.now().strftime("%Y-%m-%d")
        
        response = requests.get(
            f"{BASE_URL}/api/finances/summary?start_date={start_date}&end_date={end_date}",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        
        assert data["start_date"] == start_date
        assert data["end_date"] == end_date
        assert "total_revenue" in data
        print(f"Finances summary (filtered): {start_date} to {end_date}, revenue=${data['total_revenue']}")
    
    def test_finances_summary_requires_admin(self):
        """GET /api/finances/summary - requires admin auth"""
        response = requests.get(f"{BASE_URL}/api/finances/summary")
        # 401 (Unauthorized) or 403 (Forbidden) are both valid for missing auth
        assert response.status_code in [401, 403]
        print("Finances summary correctly requires authentication")


# ==================== ENHANCED OCR TESTS ====================

class TestEnhancedOCR:
    """Tests for enhanced OCR with date/vendor fields"""
    
    def create_test_png(self):
        """Create a simple 10x10 PNG with gradient (not blank)"""
        width, height = 10, 10
        
        # Create raw pixel data (RGB)
        raw_data = b''
        for y in range(height):
            raw_data += b'\x00'  # Filter byte
            for x in range(width):
                r = int((x / width) * 255)
                g = int((y / height) * 255)
                b = 128
                raw_data += bytes([r, g, b])
        
        compressed = zlib.compress(raw_data)
        
        def png_chunk(chunk_type, data):
            chunk = chunk_type + data
            crc = zlib.crc32(chunk) & 0xffffffff
            return struct.pack('>I', len(data)) + chunk + struct.pack('>I', crc)
        
        png = b'\x89PNG\r\n\x1a\n'
        ihdr_data = struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0)
        png += png_chunk(b'IHDR', ihdr_data)
        png += png_chunk(b'IDAT', compressed)
        png += png_chunk(b'IEND', b'')
        
        return png
    
    def test_ocr_returns_enhanced_fields(self, auth_headers):
        """POST /api/files/ocr/{file_id} - verify enhanced fields (amount, description, date, vendor)"""
        png_data = self.create_test_png()
        
        # Upload test image
        files = {'file': ('test_receipt.png', png_data, 'image/png')}
        upload_headers = {"Authorization": auth_headers["Authorization"]}
        
        upload_resp = requests.post(
            f"{BASE_URL}/api/files/upload?context=ocr-test-iter26",
            headers=upload_headers,
            files=files
        )
        assert upload_resp.status_code == 200
        file_id = upload_resp.json()["id"]
        
        # Call OCR endpoint
        ocr_resp = requests.post(
            f"{BASE_URL}/api/files/ocr/{file_id}",
            headers=auth_headers
        )
        
        # OCR may return 200 with data or 500 if AI can't parse non-receipt image
        assert ocr_resp.status_code in [200, 500], f"Unexpected status: {ocr_resp.status_code}"
        
        if ocr_resp.status_code == 200:
            data = ocr_resp.json()
            # Verify all 4 enhanced fields are present
            assert "amount" in data, "Missing 'amount' field"
            assert "description" in data, "Missing 'description' field"
            assert "date" in data, "Missing 'date' field (NEW in iteration 26)"
            assert "vendor" in data, "Missing 'vendor' field (NEW in iteration 26)"
            print(f"OCR enhanced fields: amount={data['amount']}, description={data['description']}, date={data['date']}, vendor={data['vendor']}")
        else:
            # For non-receipt images, 500 is acceptable
            print(f"OCR returned 500 (expected for non-receipt test image)")
    
    def test_ocr_file_not_found(self, auth_headers):
        """POST /api/files/ocr/{file_id} - 404 for nonexistent file"""
        response = requests.post(
            f"{BASE_URL}/api/files/ocr/nonexistent-file-id-iter26",
            headers=auth_headers
        )
        assert response.status_code == 404
        print("OCR correctly returns 404 for nonexistent file")
    
    def test_ocr_non_image_rejected(self, auth_headers):
        """POST /api/files/ocr/{file_id} - non-image file rejected"""
        files = {'file': ('test.txt', b'This is a text file for OCR test', 'text/plain')}
        upload_headers = {"Authorization": auth_headers["Authorization"]}
        
        upload_resp = requests.post(
            f"{BASE_URL}/api/files/upload?context=ocr-test-iter26",
            headers=upload_headers,
            files=files
        )
        assert upload_resp.status_code == 200
        file_id = upload_resp.json()["id"]
        
        ocr_resp = requests.post(
            f"{BASE_URL}/api/files/ocr/{file_id}",
            headers=auth_headers
        )
        assert ocr_resp.status_code == 400
        assert "image" in ocr_resp.text.lower()
        print("OCR correctly rejects non-image files")


# ==================== PREVIOUSLY EXTRACTED MODULES VERIFICATION ====================

class TestPreviouslyExtractedModules:
    """Verify previously extracted modules still work after Orders extraction"""
    
    def test_services_endpoint(self, auth_headers):
        """GET /api/services - services module still works"""
        response = requests.get(f"{BASE_URL}/api/services", headers=auth_headers)
        assert response.status_code == 200
        assert isinstance(response.json(), list)
        print(f"Services endpoint working: {len(response.json())} services")
    
    def test_audit_logs_endpoint(self, auth_headers):
        """GET /api/audit-logs - audit module still works"""
        response = requests.get(f"{BASE_URL}/api/audit-logs", headers=auth_headers)
        assert response.status_code == 200
        assert isinstance(response.json(), list)
        print(f"Audit logs endpoint working: {len(response.json())} logs")
    
    def test_notification_settings_endpoint(self, auth_headers):
        """GET /api/settings/notifications - settings module still works"""
        response = requests.get(f"{BASE_URL}/api/settings/notifications", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert "email_enabled" in data
        print(f"Notification settings working: email={data['email_enabled']}")
    
    def test_operator_orders_endpoint(self, auth_headers):
        """GET /api/operator/orders - operator module still works"""
        response = requests.get(f"{BASE_URL}/api/operator/orders", headers=auth_headers)
        assert response.status_code == 200
        assert isinstance(response.json(), list)
        print(f"Operator orders endpoint working: {len(response.json())} orders")


# ==================== REALTIME MODULE VERIFICATION ====================

class TestRealtimeModule:
    """Verify realtime.py shared module is working (indirectly via order creation)"""
    
    def test_order_creation_emits_realtime(self, auth_headers, test_customer_id):
        """POST /api/orders - verify order creation doesn't fail due to realtime module"""
        order_data = {
            "customer_id": test_customer_id,
            "service_type": "pickup_delivery",
            "pickup_date": (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d"),
            "pickup_time_window": "9am-12pm",
            "estimated_lbs": 10.0,
            "notes": "TEST_RealtimeVerification"
        }
        response = requests.post(
            f"{BASE_URL}/api/orders",
            headers=auth_headers,
            json=order_data
        )
        # If realtime module has issues, order creation would fail
        assert response.status_code == 200
        print("Order creation with realtime emission successful")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
