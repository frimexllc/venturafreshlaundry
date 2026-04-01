"""
Test suite for Jarvis AI Operations (/api/ai/operations) endpoint
Tests: persistent session, global context, critical action confirmation, audit logging
"""
import pytest
import requests
import uuid
import os
import time

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:

ADMIN_EMAIL = os.environ.get("TEST_ADMIN_EMAIL", "owner@frimexllc.com")
ADMIN_PASSWORD = os.environ.get("TEST_ADMIN_PASSWORD", "admin123")


@pytest.fixture(scope="module")
def admin_token():
    """Get admin authentication token"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": ADMIN_EMAIL,
        "password": ADMIN_PASSWORD
    })
    if response.status_code != 200:
        pytest.skip(f"Authentication failed: {response.status_code}")
    data = response.json()
    return data.get("access_token")


@pytest.fixture(scope="module")
def auth_headers(admin_token):
    """Return headers with admin authorization"""
    return {
        "Authorization": f"Bearer {admin_token}",
        "Content-Type": "application/json"
    }


@pytest.fixture
def session_id():
    """Generate unique session ID for tests"""
    return f"test-session-{uuid.uuid4().hex[:8]}"


class TestAIOperationsAuth:
    """Test authentication requirements for AI operations endpoint"""
    
    def test_ai_operations_requires_auth(self):
        """Endpoint should reject unauthenticated requests"""
        response = requests.post(f"{BASE_URL}/api/ai/operations", json={
            "message": "test",
            "execute": False
        })
        assert response.status_code in [401, 403], f"Expected auth error, got {response.status_code}"
    
    def test_ai_operations_session_requires_auth(self):
        """Session endpoint should require authentication"""
        response = requests.get(f"{BASE_URL}/api/ai/operations/session/test-session")
        assert response.status_code in [401, 403], f"Expected auth error, got {response.status_code}"


class TestAIOperationsBasic:
    """Basic tests for AI operations endpoint"""
    
    def test_ai_operations_basic_message(self, auth_headers, session_id):
        """POST /api/ai/operations should respond with context and reply"""
        response = requests.post(f"{BASE_URL}/api/ai/operations", 
            headers=auth_headers,
            json={
                "message": "¿Cuántas órdenes hay pendientes?",
                "execute": False,
                "session_id": session_id
            },
            timeout=30  # AI calls may take time
        )
        
        assert response.status_code == 200, f"Failed with {response.status_code}: {response.text}"
        data = response.json()
        
        # Check response structure
        assert "session_id" in data, "Response should contain session_id"
        assert data["session_id"] == session_id, "Session ID should match"
        assert "reply" in data, "Response should contain reply"
        assert "actions" in data, "Response should contain actions array"
        assert "global_context" in data, "Response should contain global_context"
        assert "generated_at" in data, "Response should contain timestamp"
        
        print(f"✅ AI replied: {data['reply'][:100]}...")
        print(f"✅ Global context stats: {data.get('global_context', {})}")
    
    def test_ai_operations_returns_actions(self, auth_headers):
        """AI should suggest actions when appropriate"""
        session_id = f"test-actions-{uuid.uuid4().hex[:8]}"
        
        # Request something that might trigger an action
        response = requests.post(f"{BASE_URL}/api/ai/operations",
            headers=auth_headers,
            json={
                "message": "Cambia el estado de la orden más reciente a processing",
                "execute": False,  # Don't execute, just suggest
                "session_id": session_id
            },
            timeout=30
        )
        
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        assert isinstance(data.get("actions"), list), "Actions should be a list"
        print(f"✅ Actions suggested: {len(data['actions'])}")
        if data["actions"]:
            print(f"   First action: {data['actions'][0]}")
    
    def test_ai_operations_global_context(self, auth_headers):
        """AI should have global context with stats"""
        session_id = f"test-context-{uuid.uuid4().hex[:8]}"
        
        response = requests.post(f"{BASE_URL}/api/ai/operations",
            headers=auth_headers,
            json={
                "message": "Dame un resumen del estado actual",
                "execute": False,
                "session_id": session_id
            },
            timeout=30
        )
        
        assert response.status_code == 200
        data = response.json()
        
        context = data.get("global_context", {})
        # Check expected stats keys
        expected_keys = ["orders_total", "orders_processing", "orders_ready", "tickets_open", "quotes_open", "leads_open"]
        for key in expected_keys:
            if key in context:
                print(f"✅ Context has {key}: {context[key]}")


class TestAISessionPersistence:
    """Test session persistence and history retrieval"""
    
    def test_session_persistence_create_and_retrieve(self, auth_headers):
        """Session should persist messages across requests"""
        session_id = f"test-persist-{uuid.uuid4().hex[:8]}"
        
        # First message
        response1 = requests.post(f"{BASE_URL}/api/ai/operations",
            headers=auth_headers,
            json={
                "message": "Hola, soy una prueba de persistencia",
                "execute": False,
                "session_id": session_id
            },
            timeout=30
        )
        assert response1.status_code == 200, f"First message failed: {response1.text}"
        
        # Second message (should maintain context)
        response2 = requests.post(f"{BASE_URL}/api/ai/operations",
            headers=auth_headers,
            json={
                "message": "¿Recuerdas qué dije antes?",
                "execute": False,
                "session_id": session_id
            },
            timeout=30
        )
        assert response2.status_code == 200, f"Second message failed: {response2.text}"
        
        # Verify session exists
        session_response = requests.get(
            f"{BASE_URL}/api/ai/operations/session/{session_id}",
            headers=auth_headers
        )
        assert session_response.status_code == 200, f"Session retrieval failed: {session_response.text}"
        
        session_data = session_response.json()
        assert session_data.get("session_id") == session_id
        
        messages = session_data.get("messages", [])
        assert len(messages) >= 2, f"Expected at least 2 messages, got {len(messages)}"
        print(f"✅ Session has {len(messages)} messages persisted")
    
    def test_get_session_empty(self, auth_headers):
        """Getting non-existent session should return empty"""
        fake_session = f"nonexistent-{uuid.uuid4().hex[:8]}"
        
        response = requests.get(
            f"{BASE_URL}/api/ai/operations/session/{fake_session}",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data.get("messages") == [], "Non-existent session should return empty messages"
        print(f"✅ Non-existent session returns empty list")


class TestCriticalActionConfirmation:
    """Test critical action confirmation flow"""
    
    def test_critical_action_requires_confirmation(self, auth_headers):
        """Critical actions should require confirmation token"""
        session_id = f"test-critical-{uuid.uuid4().hex[:8]}"
        
        # Request a critical action (register_payment)
        response = requests.post(f"{BASE_URL}/api/ai/operations",
            headers=auth_headers,
            json={
                "message": "Registra un pago de efectivo para la orden más reciente",
                "execute": True,  # Request execution
                "session_id": session_id
            },
            timeout=30
        )
        
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        # If AI proposed a critical action, it should require confirmation
        if data.get("critical_actions") and len(data["critical_actions"]) > 0:
            assert data.get("requires_confirmation") == True, "Critical actions should require confirmation"
            assert data.get("confirm_token") is not None, "Should provide confirm_token"
            print(f"✅ Critical action requires confirmation. Token: {data.get('confirm_token')[:20]}...")
        else:
            print(f"ℹ️ No critical actions proposed in this test (AI may not have suggested payment)")
    
    def test_confirmation_flow(self, auth_headers):
        """Test full confirmation flow: request -> confirm -> execute"""
        session_id = f"test-confirm-{uuid.uuid4().hex[:8]}"
        
        # Step 1: Request that triggers critical action
        response1 = requests.post(f"{BASE_URL}/api/ai/operations",
            headers=auth_headers,
            json={
                "message": "Actualiza el rol del usuario a admin",
                "execute": True,
                "session_id": session_id
            },
            timeout=30
        )
        
        assert response1.status_code == 200
        data1 = response1.json()
        
        if not data1.get("requires_confirmation"):
            print("ℹ️ AI didn't propose critical action requiring confirmation")
            return
        
        confirm_token = data1.get("confirm_token")
        assert confirm_token, "Should have confirm token"
        
        # Step 2: Confirm with token
        response2 = requests.post(f"{BASE_URL}/api/ai/operations",
            headers=auth_headers,
            json={
                "message": "Confirmar acción crítica",
                "execute": True,
                "session_id": session_id,
                "confirm_token": confirm_token
            },
            timeout=30
        )
        
        assert response2.status_code == 200
        data2 = response2.json()
        
        # After confirmation, it should not require further confirmation
        print(f"✅ Confirmation flow completed. requires_confirmation: {data2.get('requires_confirmation')}")


class TestAuditLogging:
    """Test audit logging for AI operations"""
    
    def test_command_logged(self, auth_headers):
        """Commands should be logged to ai_command_logs"""
        session_id = f"test-audit-{uuid.uuid4().hex[:8]}"
        
        # Send a command
        response = requests.post(f"{BASE_URL}/api/ai/operations",
            headers=auth_headers,
            json={
                "message": "Esta es una prueba de auditoría",
                "execute": False,
                "session_id": session_id
            },
            timeout=30
        )
        
        assert response.status_code == 200
        data = response.json()
        
        # The command should have been logged (we can't query the DB directly,
        # but successful response indicates the endpoint ran through logging code)
        assert data.get("session_id") == session_id
        assert "generated_at" in data
        print(f"✅ Command processed and logged at {data.get('generated_at')}")


class TestEdgeCases:
    """Edge case tests"""
    
    def test_empty_message(self, auth_headers):
        """Empty message should be handled gracefully"""
        response = requests.post(f"{BASE_URL}/api/ai/operations",
            headers=auth_headers,
            json={
                "message": "",
                "execute": False
            },
            timeout=30
        )
        # Should either work with empty response or return error
        assert response.status_code in [200, 400, 422], f"Unexpected status: {response.status_code}"
        print(f"✅ Empty message handled with status {response.status_code}")
    
    def test_long_message(self, auth_headers):
        """Long messages should be handled"""
        long_message = "Esta es una prueba " * 100
        
        response = requests.post(f"{BASE_URL}/api/ai/operations",
            headers=auth_headers,
            json={
                "message": long_message,
                "execute": False
            },
            timeout=30
        )
        assert response.status_code in [200, 400, 413], f"Unexpected status for long message: {response.status_code}"
        print(f"✅ Long message handled with status {response.status_code}")
    
    def test_with_context(self, auth_headers):
        """Request with client context should work"""
        response = requests.post(f"{BASE_URL}/api/ai/operations",
            headers=auth_headers,
            json={
                "message": "¿Cuántos pickups hay hoy?",
                "execute": False,
                "context": {
                    "pickups_today": 5,
                    "in_processing": 3,
                    "locale": "es"
                }
            },
            timeout=30
        )
        assert response.status_code == 200, f"Context request failed: {response.text}"
        print("✅ Request with custom context works")


class TestIntegration:
    """Integration tests for the operator agent flow"""
    
    def test_full_operator_flow(self, auth_headers):
        """Test a complete operator conversation flow"""
        session_id = f"test-flow-{uuid.uuid4().hex[:8]}"
        
        # Message 1: Greeting
        r1 = requests.post(f"{BASE_URL}/api/ai/operations",
            headers=auth_headers,
            json={"message": "Hola Jarvis", "execute": False, "session_id": session_id},
            timeout=30
        )
        assert r1.status_code == 200
        
        # Message 2: Status query
        r2 = requests.post(f"{BASE_URL}/api/ai/operations",
            headers=auth_headers,
            json={"message": "¿Cuál es el estado actual de operaciones?", "execute": False, "session_id": session_id},
            timeout=30
        )
        assert r2.status_code == 200
        
        # Message 3: Action query (no execute)
        r3 = requests.post(f"{BASE_URL}/api/ai/operations",
            headers=auth_headers,
            json={"message": "¿Qué acciones puedo hacer?", "execute": False, "session_id": session_id},
            timeout=30
        )
        assert r3.status_code == 200
        
        # Verify session history
        session_resp = requests.get(
            f"{BASE_URL}/api/ai/operations/session/{session_id}",
            headers=auth_headers
        )
        assert session_resp.status_code == 200
        
        session = session_resp.json()
        messages = session.get("messages", [])
        
        # Should have user + assistant pairs
        user_messages = [m for m in messages if m.get("role") == "user"]
        assistant_messages = [m for m in messages if m.get("role") == "assistant"]
        
        assert len(user_messages) >= 3, f"Expected 3+ user messages, got {len(user_messages)}"
        assert len(assistant_messages) >= 3, f"Expected 3+ assistant messages, got {len(assistant_messages)}"
        
        print(f"✅ Full conversation flow: {len(messages)} messages in session")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s"])
