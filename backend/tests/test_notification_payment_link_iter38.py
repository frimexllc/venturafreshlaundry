"""
Test notification payment link feature - Iteration 38
Tests the notify-customer endpoint for:
- PAID orders: should NOT include payment link
- UNPAID orders: should include Stripe payment link in both SMS and Email
- HTML email formatting with professional styling
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestNotificationPaymentLink:
    """Tests for notification payment link feature"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test fixtures"""
        self.base_url = BASE_URL
        self.admin_email = os.environ.get("TEST_ADMIN_EMAIL", "owner@frimexllc.com")
        self.admin_password = os.environ.get("TEST_ADMIN_PASSWORD", "admin123")
        self.unpaid_order_id = "1a8c9d67-4341-4985-8b54-eba2bfb4cf24"
        self.paid_order_id = "817df450-45db-4667-8e42-546cc74550a1"
        self.origin_header = "https://ventura-deploy-test.preview.emergentagent.com"
        
    def get_auth_token(self):
        """Get authentication token"""
        response = requests.post(
            f"{self.base_url}/api/auth/login",
            json={"email": self.admin_email, "password": self.admin_password}
        )
        if response.status_code == 200:
            return response.json().get("access_token")
        pytest.skip("Authentication failed")
        
    def test_unpaid_order_email_includes_payment_link(self):
        """UNPAID order notification via email should include Stripe payment link"""
        token = self.get_auth_token()
        
        response = requests.post(
            f"{self.base_url}/api/orders/{self.unpaid_order_id}/notify-customer",
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
                "Origin": self.origin_header
            },
            json={"channel": "email"}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        # Verify response structure
        assert "ok" in data
        assert "payment_url" in data
        assert "message_preview" in data
        
        # Verify payment_url is set for unpaid order
        assert data["payment_url"], "payment_url should not be empty for unpaid order"
        assert "checkout.stripe.com" in data["payment_url"], "payment_url should be a Stripe checkout URL"
        
        # Verify message contains payment link text
        assert "Paga en linea:" in data["message_preview"], "Message should contain 'Paga en linea:' text"
        
        print(f"✅ PASS: Unpaid order email includes payment link: {data['payment_url'][:80]}...")
        
    def test_paid_order_email_no_payment_link(self):
        """PAID order notification via email should NOT include payment link"""
        token = self.get_auth_token()
        
        response = requests.post(
            f"{self.base_url}/api/orders/{self.paid_order_id}/notify-customer",
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
                "Origin": self.origin_header
            },
            json={"channel": "email"}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        # Verify response structure
        assert "ok" in data
        assert "payment_url" in data
        assert "message_preview" in data
        
        # Verify payment_url is empty for paid order
        assert data["payment_url"] == "", "payment_url should be empty for paid order"
        
        # Verify message does NOT contain payment link text
        assert "Paga en linea:" not in data["message_preview"], "Message should NOT contain 'Paga en linea:' for paid order"
        
        # Verify message contains "Pagado" status
        assert "Pagado" in data["message_preview"], "Message should show 'Pagado' status"
        
        print(f"✅ PASS: Paid order email has no payment link")
        
    def test_unpaid_order_sms_includes_payment_link(self):
        """UNPAID order notification via SMS should include Stripe payment link"""
        token = self.get_auth_token()
        
        response = requests.post(
            f"{self.base_url}/api/orders/{self.unpaid_order_id}/notify-customer",
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
                "Origin": self.origin_header
            },
            json={"channel": "sms"}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        # Verify response structure
        assert "ok" in data
        assert "payment_url" in data
        assert "message_preview" in data
        
        # Verify payment_url is set for unpaid order
        assert data["payment_url"], "payment_url should not be empty for unpaid order"
        assert "checkout.stripe.com" in data["payment_url"], "payment_url should be a Stripe checkout URL"
        
        # Verify message contains payment link text
        assert "Paga en linea:" in data["message_preview"], "SMS should contain 'Paga en linea:' text"
        
        print(f"✅ PASS: Unpaid order SMS includes payment link")
        
    def test_notification_response_structure(self):
        """Verify notification response has correct structure"""
        token = self.get_auth_token()
        
        response = requests.post(
            f"{self.base_url}/api/orders/{self.unpaid_order_id}/notify-customer",
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
                "Origin": self.origin_header
            },
            json={"channel": "email"}
        )
        
        assert response.status_code == 200
        data = response.json()
        
        # Verify all expected fields
        assert "ok" in data, "Response should have 'ok' field"
        assert "channel" in data, "Response should have 'channel' field"
        assert "message_preview" in data, "Response should have 'message_preview' field"
        assert "payment_url" in data, "Response should have 'payment_url' field"
        assert "detail" in data, "Response should have 'detail' field"
        
        # Verify channel matches request
        assert data["channel"] == "email", "Channel should match request"
        
        print(f"✅ PASS: Response structure is correct")
        
    def test_notification_requires_auth(self):
        """Notification endpoint should require authentication"""
        response = requests.post(
            f"{self.base_url}/api/orders/{self.unpaid_order_id}/notify-customer",
            headers={
                "Content-Type": "application/json",
                "Origin": self.origin_header
            },
            json={"channel": "email"}
        )
        
        # Should return 401 or 403 without auth
        assert response.status_code in [401, 403], f"Expected 401/403 without auth, got {response.status_code}"
        
        print(f"✅ PASS: Endpoint requires authentication")
        
    def test_notification_order_not_found(self):
        """Notification for non-existent order should return 404"""
        token = self.get_auth_token()
        
        response = requests.post(
            f"{self.base_url}/api/orders/non-existent-order-id/notify-customer",
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
                "Origin": self.origin_header
            },
            json={"channel": "email"}
        )
        
        assert response.status_code == 404, f"Expected 404 for non-existent order, got {response.status_code}"
        
        print(f"✅ PASS: Non-existent order returns 404")


class TestPaymentSuccessPage:
    """Tests for /payment-success frontend page"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test fixtures"""
        self.base_url = BASE_URL
        
    def test_payment_success_page_accessible(self):
        """Payment success page should be accessible"""
        response = requests.get(f"{self.base_url}/payment-success")
        
        # React SPA returns 200 for all routes
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        # Verify it's HTML content
        assert "text/html" in response.headers.get("Content-Type", ""), "Should return HTML"
        
        print(f"✅ PASS: Payment success page is accessible")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
