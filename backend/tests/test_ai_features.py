"""
Test AI Metrics and Quick Approval features
- GET /api/ai/metrics - AI Agent Metrics dashboard data
- GET /api/ai/pending-actions - List pending critical actions
- POST /api/ai/pending-actions/{id}/approve - Approve an action
- POST /api/ai/pending-actions/{id}/reject - Reject an action
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://laundry-forms-ux.preview.emergentagent.com')

# Test credentials
ADMIN_EMAIL = "owner@frimexllc.com"
ADMIN_PASSWORD = "admin123"


@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token for admin user"""
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
    )
    assert response.status_code == 200, f"Login failed: {response.text}"
    data = response.json()
    assert "access_token" in data, "No access_token in response"
    return data["access_token"]


@pytest.fixture(scope="module")
def auth_headers(auth_token):
    """Get authorization headers"""
    return {"Authorization": f"Bearer {auth_token}"}


class TestAIMetrics:
    """Test AI Metrics endpoint"""
    
    def test_ai_metrics_returns_200(self, auth_headers):
        """Test that AI metrics endpoint returns 200"""
        response = requests.get(
            f"{BASE_URL}/api/ai/metrics?days=30",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
    
    def test_ai_metrics_has_required_fields(self, auth_headers):
        """Test that AI metrics response has required fields"""
        response = requests.get(
            f"{BASE_URL}/api/ai/metrics?days=30",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        
        # Check required fields exist
        required_fields = [
            "total_interactions",
            "total_sessions",
            "executed_commands",
            "critical_actions_requested",
            "success_rate"
        ]
        for field in required_fields:
            assert field in data, f"Missing field: {field}"
    
    def test_ai_metrics_7_days_filter(self, auth_headers):
        """Test AI metrics with 7 days filter"""
        response = requests.get(
            f"{BASE_URL}/api/ai/metrics?days=7",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert "total_interactions" in data
    
    def test_ai_metrics_90_days_filter(self, auth_headers):
        """Test AI metrics with 90 days filter"""
        response = requests.get(
            f"{BASE_URL}/api/ai/metrics?days=90",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert "total_interactions" in data
    
    def test_ai_metrics_has_action_breakdown(self, auth_headers):
        """Test that AI metrics includes action breakdown"""
        response = requests.get(
            f"{BASE_URL}/api/ai/metrics?days=30",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        
        # action_breakdown should be a list
        assert "action_breakdown" in data
        assert isinstance(data["action_breakdown"], list)
    
    def test_ai_metrics_has_recent_logs(self, auth_headers):
        """Test that AI metrics includes recent logs"""
        response = requests.get(
            f"{BASE_URL}/api/ai/metrics?days=30",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        
        # recent_logs should be a list
        assert "recent_logs" in data
        assert isinstance(data["recent_logs"], list)


class TestPendingActions:
    """Test Pending Actions endpoints"""
    
    def test_pending_actions_returns_200(self, auth_headers):
        """Test that pending actions endpoint returns 200"""
        response = requests.get(
            f"{BASE_URL}/api/ai/pending-actions",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
    
    def test_pending_actions_has_list(self, auth_headers):
        """Test that pending actions response has pending_actions list"""
        response = requests.get(
            f"{BASE_URL}/api/ai/pending-actions",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        
        assert "pending_actions" in data
        assert isinstance(data["pending_actions"], list)
    
    def test_pending_actions_structure(self, auth_headers):
        """Test pending action structure if any exist"""
        response = requests.get(
            f"{BASE_URL}/api/ai/pending-actions",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        
        pending = data.get("pending_actions", [])
        if len(pending) > 0:
            action = pending[0]
            # Check expected fields
            assert "id" in action, "Pending action missing 'id'"
            assert "session_id" in action, "Pending action missing 'session_id'"
            assert "status" in action, "Pending action missing 'status'"
            print(f"Found {len(pending)} pending actions")
            print(f"First action: {action}")
    
    def test_reject_nonexistent_action(self, auth_headers):
        """Test rejecting a non-existent action returns 404"""
        response = requests.post(
            f"{BASE_URL}/api/ai/pending-actions/nonexistent-id-12345/reject",
            headers=auth_headers
        )
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
    
    def test_approve_nonexistent_action(self, auth_headers):
        """Test approving a non-existent action returns 404"""
        response = requests.post(
            f"{BASE_URL}/api/ai/pending-actions/nonexistent-id-12345/approve",
            headers=auth_headers
        )
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"


class TestRejectPendingAction:
    """Test rejecting a real pending action"""
    
    def test_reject_real_pending_action(self, auth_headers):
        """Test rejecting a real pending action if one exists"""
        # First get pending actions
        response = requests.get(
            f"{BASE_URL}/api/ai/pending-actions",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        
        pending = data.get("pending_actions", [])
        if len(pending) == 0:
            pytest.skip("No pending actions to test rejection")
        
        # Get the first pending action
        action = pending[0]
        action_id = action.get("id")
        print(f"Rejecting action: {action_id}")
        
        # Reject it
        reject_response = requests.post(
            f"{BASE_URL}/api/ai/pending-actions/{action_id}/reject",
            headers=auth_headers
        )
        assert reject_response.status_code == 200, f"Reject failed: {reject_response.text}"
        
        # Verify it's no longer in pending list
        verify_response = requests.get(
            f"{BASE_URL}/api/ai/pending-actions",
            headers=auth_headers
        )
        assert verify_response.status_code == 200
        verify_data = verify_response.json()
        
        remaining_ids = [a.get("id") for a in verify_data.get("pending_actions", [])]
        assert action_id not in remaining_ids, "Rejected action still in pending list"
        print(f"Successfully rejected action {action_id}")


class TestOperatorDashboard:
    """Test Operator Dashboard API"""
    
    def test_operator_dashboard_returns_200(self, auth_headers):
        """Test that operator dashboard endpoint returns 200"""
        response = requests.get(
            f"{BASE_URL}/api/automation/operator-dashboard",
            headers=auth_headers
        )
        # This endpoint may not require auth
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
    
    def test_operator_dashboard_has_stats(self, auth_headers):
        """Test that operator dashboard has stats"""
        response = requests.get(
            f"{BASE_URL}/api/automation/operator-dashboard",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        
        assert "stats" in data, "Missing 'stats' in dashboard response"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
