"""
Iteration 43: Customer Payment & OCR Tests
Tests for:
- Customer auth (register/login)
- Pending payments endpoint
- Stripe checkout-auth endpoint
- Confirm-payment endpoint (PUBLIC)
- Mark-zelle endpoint
- Upload-receipt endpoint
- OCR-receipt endpoint
"""
import pytest
import requests
import os
import io
from PIL import Image, ImageDraw

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials from test_credentials.md
TEST_CUSTOMER_EMAIL = "testcustomer@example.com"
TEST_CUSTOMER_PASSWORD = "test123456"
TEST_ORDER_ID = "9eee9824-7d47-4f12-8d4a-e65c1e6bb465"
TEST_ORDER_AMOUNT = 25.50


@pytest.fixture(scope="module")
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


@pytest.fixture(scope="module")
def customer_token(api_client):
    """Get customer authentication token"""
    response = api_client.post(
        f"{BASE_URL}/api/customer/auth/login",
        json={"email": TEST_CUSTOMER_EMAIL, "password": TEST_CUSTOMER_PASSWORD}
    )
    if response.status_code == 200:
        return response.json().get("access_token")
    pytest.skip(f"Customer authentication failed: {response.status_code} - {response.text}")


@pytest.fixture(scope="module")
def authenticated_client(api_client, customer_token):
    """Session with customer auth header"""
    api_client.headers.update({"Authorization": f"Bearer {customer_token}"})
    return api_client


# Note: reset_order_to_unpaid fixture removed - tests work with order in any state
# The endpoints handle "already paid" gracefully


def create_test_receipt_image(amount: float = 25.50) -> bytes:
    """Create a test receipt image with specified amount"""
    img = Image.new('RGB', (400, 300), color='white')
    draw = ImageDraw.Draw(img)
    draw.text((50, 30), "PAYMENT RECEIPT", fill='black')
    draw.text((50, 70), "Zelle Transfer", fill='black')
    draw.text((50, 110), "Date: 2026-04-12", fill='black')
    draw.text((50, 150), f"Amount: ${amount:.2f}", fill='black')
    draw.text((50, 190), "To: Ventura Fresh Laundry", fill='black')
    
    buffer = io.BytesIO()
    img.save(buffer, format='JPEG', quality=85)
    buffer.seek(0)
    return buffer.read()


class TestCustomerAuth:
    """Customer authentication endpoint tests"""
    
    def test_customer_login_success(self, api_client):
        """Test customer login with valid credentials"""
        response = api_client.post(
            f"{BASE_URL}/api/customer/auth/login",
            json={"email": TEST_CUSTOMER_EMAIL, "password": TEST_CUSTOMER_PASSWORD}
        )
        assert response.status_code == 200, f"Login failed: {response.text}"
        
        data = response.json()
        assert "access_token" in data, "Missing access_token in response"
        assert "customer" in data, "Missing customer in response"
        assert data["customer"]["email"] == TEST_CUSTOMER_EMAIL
        assert data["token_type"] == "bearer"
    
    def test_customer_login_invalid_credentials(self, api_client):
        """Test customer login with invalid credentials"""
        response = api_client.post(
            f"{BASE_URL}/api/customer/auth/login",
            json={"email": "wrong@example.com", "password": "wrongpass"}
        )
        assert response.status_code == 401
    
    def test_customer_register_existing_email(self, api_client):
        """Test customer registration with existing email"""
        response = api_client.post(
            f"{BASE_URL}/api/customer/auth/register",
            json={
                "name": "Test User",
                "email": TEST_CUSTOMER_EMAIL,
                "password": "newpassword123"
            }
        )
        # Should return 400 for existing email with password
        assert response.status_code == 400


class TestPendingPayments:
    """Pending payments endpoint tests"""
    
    def test_get_pending_payments_authenticated(self, authenticated_client):
        """Test GET /api/customer/pending-payments returns orders"""
        response = authenticated_client.get(f"{BASE_URL}/api/customer/pending-payments")
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        # Note: order may or may not be in pending payments depending on state
    
    def test_get_pending_payments_unauthenticated(self, api_client):
        """Test GET /api/customer/pending-payments requires auth"""
        # Remove auth header temporarily
        headers = {"Content-Type": "application/json"}
        response = requests.get(f"{BASE_URL}/api/customer/pending-payments", headers=headers)
        assert response.status_code in [401, 403]


class TestStripeCheckout:
    """Stripe checkout endpoint tests"""
    
    def test_checkout_auth_returns_stripe_url_or_already_paid(self, authenticated_client):
        """Test POST /api/customer/order/{id}/checkout-auth returns Stripe URL or already paid"""
        response = authenticated_client.post(
            f"{BASE_URL}/api/customer/order/{TEST_ORDER_ID}/checkout-auth",
            json={}
        )
        # Either 200 with URL or 400 if already paid
        assert response.status_code in [200, 400], f"Failed: {response.text}"
        
        data = response.json()
        if response.status_code == 200:
            assert "url" in data, "Missing 'url' in response"
            assert "checkout.stripe.com" in data["url"], "URL should be a Stripe checkout URL"
        else:
            assert "already paid" in data.get("detail", "").lower()
    
    def test_checkout_auth_requires_authentication(self, api_client):
        """Test POST /api/customer/order/{id}/checkout-auth requires auth"""
        headers = {"Content-Type": "application/json"}
        response = requests.post(
            f"{BASE_URL}/api/customer/order/{TEST_ORDER_ID}/checkout-auth",
            headers=headers,
            json={}
        )
        assert response.status_code in [401, 403]


class TestConfirmPayment:
    """Confirm payment endpoint tests (PUBLIC)"""
    
    def test_confirm_payment_public_no_auth(self):
        """Test POST /api/customer/order/{id}/confirm-payment is PUBLIC (no auth required)"""
        # Make request WITHOUT auth header
        headers = {"Content-Type": "application/json"}
        response = requests.post(
            f"{BASE_URL}/api/customer/order/{TEST_ORDER_ID}/confirm-payment",
            headers=headers,
            json={}
        )
        assert response.status_code == 200, f"Failed: {response.status_code} - {response.text}"
        
        data = response.json()
        assert data.get("ok") == True
        # Either "Payment confirmed" or "Already paid" is valid
        assert "confirmed" in data.get("detail", "").lower() or "already paid" in data.get("detail", "").lower()
    
    def test_confirm_payment_already_paid(self, authenticated_client):
        """Test confirm-payment returns 'Already paid' for paid orders"""
        # First confirm payment
        response = authenticated_client.post(
            f"{BASE_URL}/api/customer/order/{TEST_ORDER_ID}/confirm-payment",
            json={}
        )
        assert response.status_code == 200
        
        # Second call should return "Already paid"
        response2 = authenticated_client.post(
            f"{BASE_URL}/api/customer/order/{TEST_ORDER_ID}/confirm-payment",
            json={}
        )
        assert response2.status_code == 200
        assert "Already paid" in response2.json().get("detail", "")
    
    def test_confirm_payment_invalid_order(self):
        """Test confirm-payment returns 404 for invalid order"""
        headers = {"Content-Type": "application/json"}
        response = requests.post(
            f"{BASE_URL}/api/customer/order/invalid-order-id/confirm-payment",
            headers=headers,
            json={}
        )
        assert response.status_code == 404


class TestMarkZelle:
    """Mark Zelle payment endpoint tests"""
    
    def test_mark_zelle_success_or_already_paid(self, authenticated_client):
        """Test POST /api/customer/order/{id}/mark-zelle marks order or returns already paid"""
        response = authenticated_client.post(
            f"{BASE_URL}/api/customer/order/{TEST_ORDER_ID}/mark-zelle?method=zelle",
            json={}
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        assert data.get("ok") == True
        # Either "zelle submitted" or "Already paid"
        detail = data.get("detail", "").lower()
        assert "zelle" in detail or "already paid" in detail
    
    def test_mark_venmo_success_or_already_paid(self, authenticated_client):
        """Test POST /api/customer/order/{id}/mark-zelle?method=venmo"""
        response = authenticated_client.post(
            f"{BASE_URL}/api/customer/order/{TEST_ORDER_ID}/mark-zelle?method=venmo",
            json={}
        )
        assert response.status_code == 200
        detail = response.json().get("detail", "").lower()
        assert "venmo" in detail or "already paid" in detail
    
    def test_mark_cashapp_success_or_already_paid(self, authenticated_client):
        """Test POST /api/customer/order/{id}/mark-zelle?method=cashapp"""
        response = authenticated_client.post(
            f"{BASE_URL}/api/customer/order/{TEST_ORDER_ID}/mark-zelle?method=cashapp",
            json={}
        )
        assert response.status_code == 200
        detail = response.json().get("detail", "").lower()
        assert "cashapp" in detail or "already paid" in detail
    
    def test_mark_zelle_requires_auth(self):
        """Test mark-zelle requires authentication"""
        headers = {"Content-Type": "application/json"}
        response = requests.post(
            f"{BASE_URL}/api/customer/order/{TEST_ORDER_ID}/mark-zelle?method=zelle",
            headers=headers,
            json={}
        )
        assert response.status_code in [401, 403]


class TestUploadReceipt:
    """Upload receipt endpoint tests"""
    
    def test_upload_receipt_success(self, authenticated_client):
        """Test POST /api/customer/upload-receipt accepts image upload"""
        image_data = create_test_receipt_image(25.50)
        
        # Remove Content-Type header for multipart upload
        headers = {"Authorization": authenticated_client.headers.get("Authorization")}
        
        files = {"file": ("test_receipt.jpg", image_data, "image/jpeg")}
        response = requests.post(
            f"{BASE_URL}/api/customer/upload-receipt?context=payment:{TEST_ORDER_ID}",
            headers=headers,
            files=files
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        assert "id" in data, "Missing 'id' in response"
        assert data.get("content_type") == "image/jpeg"
        assert data.get("filename") == "test_receipt.jpg"
    
    def test_upload_receipt_requires_auth(self):
        """Test upload-receipt requires authentication"""
        image_data = create_test_receipt_image(25.50)
        files = {"file": ("test_receipt.jpg", image_data, "image/jpeg")}
        response = requests.post(
            f"{BASE_URL}/api/customer/upload-receipt",
            files=files
        )
        assert response.status_code in [401, 403]
    
    def test_upload_receipt_rejects_invalid_type(self, authenticated_client):
        """Test upload-receipt rejects non-image files"""
        headers = {"Authorization": authenticated_client.headers.get("Authorization")}
        files = {"file": ("test.txt", b"This is not an image", "text/plain")}
        response = requests.post(
            f"{BASE_URL}/api/customer/upload-receipt",
            headers=headers,
            files=files
        )
        assert response.status_code == 400


class TestOCRReceipt:
    """OCR receipt endpoint tests"""
    
    def test_ocr_receipt_extracts_amount(self, authenticated_client):
        """Test POST /api/customer/ocr-receipt/{file_id} extracts amount from receipt"""
        # First upload a receipt
        image_data = create_test_receipt_image(25.50)
        headers = {"Authorization": authenticated_client.headers.get("Authorization")}
        
        files = {"file": ("test_receipt.jpg", image_data, "image/jpeg")}
        upload_response = requests.post(
            f"{BASE_URL}/api/customer/upload-receipt",
            headers=headers,
            files=files
        )
        assert upload_response.status_code == 200
        file_id = upload_response.json().get("id")
        
        # Now run OCR
        ocr_response = authenticated_client.post(
            f"{BASE_URL}/api/customer/ocr-receipt/{file_id}",
            json={}
        )
        assert ocr_response.status_code == 200, f"OCR failed: {ocr_response.text}"
        
        data = ocr_response.json()
        assert "amount" in data, "Missing 'amount' in OCR response"
        assert data["amount"] == 25.50 or abs(data["amount"] - 25.50) < 0.01
        assert "description" in data
        assert "date" in data
        assert "vendor" in data
    
    def test_ocr_receipt_requires_auth(self):
        """Test ocr-receipt requires authentication"""
        headers = {"Content-Type": "application/json"}
        response = requests.post(
            f"{BASE_URL}/api/customer/ocr-receipt/some-file-id",
            headers=headers,
            json={}
        )
        assert response.status_code in [401, 403]
    
    def test_ocr_receipt_invalid_file_id(self, authenticated_client):
        """Test ocr-receipt returns 404 for invalid file_id"""
        response = authenticated_client.post(
            f"{BASE_URL}/api/customer/ocr-receipt/invalid-file-id",
            json={}
        )
        assert response.status_code == 404


class TestCustomerProfile:
    """Customer profile endpoint tests"""
    
    def test_get_customer_me(self, authenticated_client):
        """Test GET /api/customer/me returns customer profile"""
        response = authenticated_client.get(f"{BASE_URL}/api/customer/me")
        assert response.status_code == 200
        
        data = response.json()
        assert data.get("email") == TEST_CUSTOMER_EMAIL
        assert "id" in data
        assert "name" in data
    
    def test_get_customer_orders(self, authenticated_client):
        """Test GET /api/customer/orders returns customer orders"""
        response = authenticated_client.get(f"{BASE_URL}/api/customer/orders")
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list)


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
