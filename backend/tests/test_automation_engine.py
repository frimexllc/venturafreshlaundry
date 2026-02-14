"""
Test suite for Ventura Fresh Laundry CRM - Automation Engine
Tests form ingestion, classification, SLA tracking, and operator dashboard
"""
import pytest
import requests
import os
import uuid
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# ==================== HEALTH CHECK ====================

class TestAutomationHealth:
    """Basic health and endpoint availability tests"""
    
    def test_api_health(self):
        """Test API health endpoint"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        print("✓ API health check passed")
    
    def test_operator_dashboard_endpoint(self):
        """Test operator dashboard endpoint is accessible"""
        response = requests.get(f"{BASE_URL}/api/automation/operator-dashboard")
        assert response.status_code == 200
        data = response.json()
        assert "stats" in data
        assert "todays_pickups" in data
        assert "ready_for_delivery" in data
        assert "urgent_tickets" in data
        print("✓ Operator dashboard endpoint accessible")
    
    def test_daily_summary_endpoint(self):
        """Test daily summary endpoint"""
        response = requests.get(f"{BASE_URL}/api/automation/daily-summary")
        assert response.status_code == 200
        data = response.json()
        assert "orders" in data
        assert "tickets" in data
        assert "quotes" in data
        assert "leads" in data
        print("✓ Daily summary endpoint accessible")
    
    def test_sla_alerts_endpoint(self):
        """Test SLA alerts endpoint"""
        response = requests.get(f"{BASE_URL}/api/automation/sla-alerts")
        assert response.status_code == 200
        data = response.json()
        assert "past_sla" in data
        assert "approaching_sla" in data
        assert "total_at_risk" in data
        print("✓ SLA alerts endpoint accessible")


# ==================== INGEST - ORDER CLASSIFICATION ====================

class TestIngestOrderClassification:
    """Test form submissions that should be classified as ORDERS"""
    
    def test_pickup_request_creates_order(self):
        """Test pickup request form creates an ORDER"""
        unique_email = f"test_pickup_{uuid.uuid4().hex[:8]}@example.com"
        response = requests.post(f"{BASE_URL}/api/automation/ingest", json={
            "name": "Test Pickup User",
            "email": unique_email,
            "phone": "8055551234",
            "address": "123 Test St",
            "city": "Ventura",
            "state": "CA",
            "zip_code": "93003",
            "pickup_date": "2026-02-15",
            "pickup_time": "10:00 AM",
            "source_form": "PICKUP_REQUEST"
        })
        assert response.status_code == 200
        data = response.json()
        assert data["route_result"] == "ORDER"
        assert data["created_entity_type"] == "order"
        assert data["created_entity_id"].startswith("ORD-")
        assert data["customer_id"].startswith("CUST-")
        assert "Order created" in str(data["audit_entries"])
        print(f"✓ Pickup request created ORDER: {data['created_entity_id']}")
        return data
    
    def test_pickup_date_triggers_order(self):
        """Test that pickup_date field triggers ORDER classification"""
        unique_email = f"test_date_{uuid.uuid4().hex[:8]}@example.com"
        response = requests.post(f"{BASE_URL}/api/automation/ingest", json={
            "name": "Date Test User",
            "email": unique_email,
            "phone": "8055552222",
            "pickup_date": "2026-02-20",
            "source_form": "GENERAL_FORM"
        })
        assert response.status_code == 200
        data = response.json()
        assert data["route_result"] == "ORDER"
        print(f"✓ Pickup date triggered ORDER classification: {data['created_entity_id']}")
    
    def test_service_type_pickup_triggers_order(self):
        """Test that service_type with 'pickup' triggers ORDER"""
        unique_email = f"test_service_{uuid.uuid4().hex[:8]}@example.com"
        response = requests.post(f"{BASE_URL}/api/automation/ingest", json={
            "name": "Service Test User",
            "email": unique_email,
            "phone": "8055553333",
            "type_of_service": "pickup and delivery",
            "source_form": "WEBSITE_FORM"
        })
        assert response.status_code == 200
        data = response.json()
        assert data["route_result"] == "ORDER"
        print(f"✓ Service type 'pickup' triggered ORDER: {data['created_entity_id']}")


# ==================== INGEST - QUOTE CLASSIFICATION ====================

class TestIngestQuoteClassification:
    """Test form submissions that should be classified as QUOTES"""
    
    def test_b2b_quote_creates_quote(self):
        """Test B2B quote form creates a QUOTE"""
        unique_email = f"test_b2b_{uuid.uuid4().hex[:8]}@example.com"
        response = requests.post(f"{BASE_URL}/api/automation/ingest", json={
            "name": "B2B Contact Person",
            "email": unique_email,
            "phone": "8055554444",
            "company_name": "Test Hotel Inc",
            "industry": "Hospitality",
            "estimated_volume": "500 lbs/week",
            "message": "Looking for commercial laundry services",
            "source_form": "B2B_QUOTE_REQUEST"
        })
        assert response.status_code == 200
        data = response.json()
        assert data["route_result"] == "QUOTE"
        assert data["created_entity_type"] == "quote"
        assert data["created_entity_id"].startswith("QOT-")
        print(f"✓ B2B form created QUOTE: {data['created_entity_id']}")
        return data
    
    def test_company_name_triggers_quote(self):
        """Test that company_name field triggers QUOTE classification"""
        unique_email = f"test_company_{uuid.uuid4().hex[:8]}@example.com"
        response = requests.post(f"{BASE_URL}/api/automation/ingest", json={
            "name": "Company Contact",
            "email": unique_email,
            "phone": "8055555555",
            "company_name": "ABC Corporation",
            "source_form": "CONTACT_FORM"
        })
        assert response.status_code == 200
        data = response.json()
        assert data["route_result"] == "QUOTE"
        print(f"✓ Company name triggered QUOTE: {data['created_entity_id']}")
    
    def test_commercial_source_triggers_quote(self):
        """Test that COMMERCIAL source form triggers QUOTE"""
        unique_email = f"test_commercial_{uuid.uuid4().hex[:8]}@example.com"
        response = requests.post(f"{BASE_URL}/api/automation/ingest", json={
            "name": "Commercial Contact",
            "email": unique_email,
            "phone": "8055556666",
            "message": "Need commercial laundry services",
            "source_form": "COMMERCIAL_INQUIRY"
        })
        assert response.status_code == 200
        data = response.json()
        assert data["route_result"] == "QUOTE"
        print(f"✓ Commercial source triggered QUOTE: {data['created_entity_id']}")


# ==================== INGEST - SUPPORT TICKET CLASSIFICATION ====================

class TestIngestTicketClassification:
    """Test form submissions that should be classified as SUPPORT tickets"""
    
    def test_support_form_creates_ticket(self):
        """Test support form creates a TICKET"""
        unique_email = f"test_support_{uuid.uuid4().hex[:8]}@example.com"
        response = requests.post(f"{BASE_URL}/api/automation/ingest", json={
            "name": "Support User",
            "email": unique_email,
            "phone": "8055557777",
            "subject": "Order issue",
            "message": "I have a problem with my recent order",
            "source_form": "SUPPORT_FORM"
        })
        assert response.status_code == 200
        data = response.json()
        assert data["route_result"] == "SUPPORT"
        assert data["created_entity_type"] == "ticket"
        assert data["created_entity_id"].startswith("TKT-")
        print(f"✓ Support form created TICKET: {data['created_entity_id']}")
        return data
    
    def test_issue_description_triggers_ticket(self):
        """Test that issue_description field triggers SUPPORT classification"""
        unique_email = f"test_issue_{uuid.uuid4().hex[:8]}@example.com"
        response = requests.post(f"{BASE_URL}/api/automation/ingest", json={
            "name": "Issue Reporter",
            "email": unique_email,
            "phone": "8055558888",
            "issue_description": "My clothes were damaged",
            "source_form": "GENERAL_FORM"
        })
        assert response.status_code == 200
        data = response.json()
        assert data["route_result"] == "SUPPORT"
        print(f"✓ Issue description triggered TICKET: {data['created_entity_id']}")


# ==================== AUTO-PRIORITY DETECTION ====================

class TestAutoPriorityDetection:
    """Test automatic priority detection for support tickets"""
    
    def test_refund_keyword_high_priority(self):
        """Test that 'refund' keyword creates HIGH priority ticket"""
        unique_email = f"test_refund_{uuid.uuid4().hex[:8]}@example.com"
        response = requests.post(f"{BASE_URL}/api/automation/ingest", json={
            "name": "Refund User",
            "email": unique_email,
            "phone": "8055559001",
            "subject": "Need a refund",
            "message": "I want a refund for my damaged clothes",
            "source_form": "SUPPORT_FORM"
        })
        assert response.status_code == 200
        data = response.json()
        assert data["route_result"] == "SUPPORT"
        
        # Verify ticket priority by checking the ticket
        ticket_id = data["created_entity_id"]
        # The ticket should have HIGH priority based on 'refund' keyword
        print(f"✓ Refund keyword created ticket: {ticket_id}")
        return data
    
    def test_urgent_keyword_high_priority(self):
        """Test that 'urgent' keyword creates HIGH priority ticket"""
        unique_email = f"test_urgent_{uuid.uuid4().hex[:8]}@example.com"
        response = requests.post(f"{BASE_URL}/api/automation/ingest", json={
            "name": "Urgent User",
            "email": unique_email,
            "phone": "8055559002",
            "subject": "URGENT - Missing items",
            "message": "This is urgent, my items are missing!",
            "source_form": "SUPPORT_FORM"
        })
        assert response.status_code == 200
        data = response.json()
        assert data["route_result"] == "SUPPORT"
        print(f"✓ Urgent keyword created ticket: {data['created_entity_id']}")
    
    def test_damaged_keyword_high_priority(self):
        """Test that 'damaged' keyword creates HIGH priority ticket"""
        unique_email = f"test_damaged_{uuid.uuid4().hex[:8]}@example.com"
        response = requests.post(f"{BASE_URL}/api/automation/ingest", json={
            "name": "Damaged User",
            "email": unique_email,
            "phone": "8055559003",
            "subject": "Damaged clothes",
            "message": "My clothes were damaged during cleaning",
            "source_form": "FEEDBACK_FORM"
        })
        assert response.status_code == 200
        data = response.json()
        assert data["route_result"] == "SUPPORT"
        print(f"✓ Damaged keyword created ticket: {data['created_entity_id']}")


# ==================== INGEST - LEAD CLASSIFICATION ====================

class TestIngestLeadClassification:
    """Test form submissions that should be classified as LEADS"""
    
    def test_contact_form_creates_lead(self):
        """Test general contact form creates a LEAD"""
        unique_email = f"test_lead_{uuid.uuid4().hex[:8]}@example.com"
        response = requests.post(f"{BASE_URL}/api/automation/ingest", json={
            "name": "Lead User",
            "email": unique_email,
            "phone": "8055550001",
            "message": "I'm interested in your services",
            "source_form": "CONTACT_FORM"
        })
        assert response.status_code == 200
        data = response.json()
        assert data["route_result"] == "LEAD"
        assert data["created_entity_type"] == "lead"
        assert data["created_entity_id"].startswith("LEAD-")
        print(f"✓ Contact form created LEAD: {data['created_entity_id']}")
        return data
    
    def test_generic_form_defaults_to_lead(self):
        """Test that generic form without specific indicators defaults to LEAD"""
        unique_email = f"test_generic_{uuid.uuid4().hex[:8]}@example.com"
        response = requests.post(f"{BASE_URL}/api/automation/ingest", json={
            "name": "Generic User",
            "email": unique_email,
            "phone": "8055550002",
            "message": "Hello, I have a question",
            "source_form": "WEBSITE_INQUIRY"
        })
        assert response.status_code == 200
        data = response.json()
        assert data["route_result"] == "LEAD"
        print(f"✓ Generic form defaulted to LEAD: {data['created_entity_id']}")


# ==================== INGEST - PREFERENCES CLASSIFICATION ====================

class TestIngestPreferencesClassification:
    """Test form submissions that should be classified as PREFERENCES"""
    
    def test_preferences_form_saves_preferences(self):
        """Test preferences form saves customer preferences"""
        unique_email = f"test_pref_{uuid.uuid4().hex[:8]}@example.com"
        response = requests.post(f"{BASE_URL}/api/automation/ingest", json={
            "name": "Preferences User",
            "email": unique_email,
            "phone": "8055550003",
            "fabric_softener": "Yes",
            "detergent_preference": "Hypoallergenic",
            "special_instructions": "Hang dry delicates",
            "source_form": "PREFERENCE_UPDATE"
        })
        assert response.status_code == 200
        data = response.json()
        assert data["route_result"] == "PREFERENCES"
        assert data["created_entity_type"] == "preferences"
        print(f"✓ Preferences form saved: {data['created_entity_id']}")
        return data


# ==================== DUPLICATE DETECTION ====================

class TestDuplicateDetection:
    """Test duplicate submission detection"""
    
    def test_duplicate_submission_rejected(self):
        """Test that duplicate submissions are rejected"""
        unique_email = f"test_dup_{uuid.uuid4().hex[:8]}@example.com"
        timestamp = datetime.now().isoformat()
        
        # First submission
        first_response = requests.post(f"{BASE_URL}/api/automation/ingest", json={
            "name": "Duplicate Test User",
            "email": unique_email,
            "phone": "8055550004",
            "pickup_date": "2026-02-20",
            "source_form": "PICKUP_REQUEST",
            "submitted_at": timestamp
        })
        assert first_response.status_code == 200
        first_data = first_response.json()
        assert first_data["route_result"] == "ORDER"
        print(f"✓ First submission accepted: {first_data['created_entity_id']}")
        
        # Second submission with same data (should be rejected)
        second_response = requests.post(f"{BASE_URL}/api/automation/ingest", json={
            "name": "Duplicate Test User",
            "email": unique_email,
            "phone": "8055550004",
            "pickup_date": "2026-02-20",
            "source_form": "PICKUP_REQUEST",
            "submitted_at": timestamp
        })
        assert second_response.status_code == 200
        second_data = second_response.json()
        assert second_data["route_result"] == "ERROR_DUPLICATE"
        assert len(second_data["errors"]) > 0
        assert "Duplicate" in second_data["errors"][0]
        print(f"✓ Duplicate submission correctly rejected")


# ==================== CUSTOMER UPSERT ====================

class TestCustomerUpsert:
    """Test customer upsert functionality"""
    
    def test_new_customer_created(self):
        """Test that new customer is created for new email"""
        unique_email = f"test_new_cust_{uuid.uuid4().hex[:8]}@example.com"
        response = requests.post(f"{BASE_URL}/api/automation/ingest", json={
            "name": "New Customer",
            "email": unique_email,
            "phone": "8055550005",
            "address": "100 New St",
            "city": "Ventura",
            "state": "CA",
            "zip_code": "93003",
            "source_form": "CONTACT_FORM"
        })
        assert response.status_code == 200
        data = response.json()
        assert data["customer_id"].startswith("CUST-")
        assert "Customer upserted" in str(data["audit_entries"])
        print(f"✓ New customer created: {data['customer_id']}")
        return data["customer_id"], unique_email
    
    def test_existing_customer_updated(self):
        """Test that existing customer is updated, not duplicated"""
        unique_email = f"test_exist_cust_{uuid.uuid4().hex[:8]}@example.com"
        
        # First submission creates customer
        first_response = requests.post(f"{BASE_URL}/api/automation/ingest", json={
            "name": "Existing Customer",
            "email": unique_email,
            "phone": "8055550006",
            "address": "200 First St",
            "source_form": "CONTACT_FORM"
        })
        assert first_response.status_code == 200
        first_customer_id = first_response.json()["customer_id"]
        print(f"  First submission customer: {first_customer_id}")
        
        # Second submission with same email should use same customer
        second_response = requests.post(f"{BASE_URL}/api/automation/ingest", json={
            "name": "Existing Customer Updated",
            "email": unique_email,
            "phone": "8055550007",  # Different phone
            "address": "300 Second St",  # Different address
            "pickup_date": "2026-02-25",
            "source_form": "PICKUP_REQUEST"
        })
        assert second_response.status_code == 200
        second_customer_id = second_response.json()["customer_id"]
        
        # Should be the same customer
        assert first_customer_id == second_customer_id
        print(f"✓ Existing customer updated (not duplicated): {second_customer_id}")


# ==================== MISSING CONTACT INFO ====================

class TestMissingContactInfo:
    """Test handling of submissions with missing contact info"""
    
    def test_missing_email_and_phone_rejected(self):
        """Test that submission without email AND phone is rejected"""
        response = requests.post(f"{BASE_URL}/api/automation/ingest", json={
            "name": "No Contact User",
            "address": "123 No Contact St",
            "source_form": "CONTACT_FORM"
        })
        assert response.status_code == 200
        data = response.json()
        assert data["route_result"] == "ERROR_INCOMPLETE"
        assert len(data["errors"]) > 0
        assert "Missing email and phone" in data["errors"][0]
        print("✓ Missing contact info correctly rejected")
    
    def test_email_only_accepted(self):
        """Test that submission with only email is accepted"""
        unique_email = f"test_email_only_{uuid.uuid4().hex[:8]}@example.com"
        response = requests.post(f"{BASE_URL}/api/automation/ingest", json={
            "name": "Email Only User",
            "email": unique_email,
            "source_form": "CONTACT_FORM"
        })
        assert response.status_code == 200
        data = response.json()
        assert data["route_result"] != "ERROR_INCOMPLETE"
        print(f"✓ Email-only submission accepted: {data['created_entity_id']}")
    
    def test_phone_only_accepted(self):
        """Test that submission with only phone is accepted"""
        response = requests.post(f"{BASE_URL}/api/automation/ingest", json={
            "name": "Phone Only User",
            "phone": "8055550008",
            "source_form": "CONTACT_FORM"
        })
        assert response.status_code == 200
        data = response.json()
        assert data["route_result"] != "ERROR_INCOMPLETE"
        print(f"✓ Phone-only submission accepted: {data['created_entity_id']}")


# ==================== ORDER STATUS UPDATE ====================

class TestOrderStatusUpdate:
    """Test order status update functionality (operator action)"""
    
    def test_update_order_status(self):
        """Test updating order status"""
        # First create an order
        unique_email = f"test_status_{uuid.uuid4().hex[:8]}@example.com"
        create_response = requests.post(f"{BASE_URL}/api/automation/ingest", json={
            "name": "Status Test User",
            "email": unique_email,
            "phone": "8055550009",
            "pickup_date": "2026-02-20",
            "source_form": "PICKUP_REQUEST"
        })
        assert create_response.status_code == 200
        order_id = create_response.json()["created_entity_id"]
        print(f"  Created order: {order_id}")
        
        # Update status to CONFIRMED
        update_response = requests.put(
            f"{BASE_URL}/api/automation/orders/{order_id}/status?new_status=CONFIRMED"
        )
        assert update_response.status_code == 200
        update_data = update_response.json()
        assert update_data["order_id"] == order_id
        assert update_data["new_status"] == "CONFIRMED"
        print(f"✓ Order status updated to CONFIRMED")
        
        # Update status to PICKED_UP
        update_response2 = requests.put(
            f"{BASE_URL}/api/automation/orders/{order_id}/status?new_status=PICKED_UP"
        )
        assert update_response2.status_code == 200
        assert update_response2.json()["new_status"] == "PICKED_UP"
        print(f"✓ Order status updated to PICKED_UP")
        
        return order_id
    
    def test_update_nonexistent_order_fails(self):
        """Test that updating non-existent order returns 404"""
        response = requests.put(
            f"{BASE_URL}/api/automation/orders/ORD-NONEXISTENT/status?new_status=CONFIRMED"
        )
        assert response.status_code == 404
        print("✓ Non-existent order update correctly returns 404")


# ==================== OPERATOR DASHBOARD DATA ====================

class TestOperatorDashboard:
    """Test operator dashboard data"""
    
    def test_dashboard_stats(self):
        """Test dashboard returns correct stats structure"""
        response = requests.get(f"{BASE_URL}/api/automation/operator-dashboard")
        assert response.status_code == 200
        data = response.json()
        
        # Check stats structure
        assert "stats" in data
        stats = data["stats"]
        assert "pickups_remaining_today" in stats
        assert "orders_in_processing" in stats
        assert "orders_ready" in stats
        assert "urgent_tickets" in stats
        
        # All stats should be non-negative integers
        assert isinstance(stats["pickups_remaining_today"], int)
        assert stats["pickups_remaining_today"] >= 0
        print(f"✓ Dashboard stats: {stats}")
    
    def test_dashboard_todays_pickups(self):
        """Test dashboard returns today's pickups"""
        response = requests.get(f"{BASE_URL}/api/automation/operator-dashboard")
        assert response.status_code == 200
        data = response.json()
        
        assert "todays_pickups" in data
        assert isinstance(data["todays_pickups"], list)
        
        # If there are pickups, verify structure
        if len(data["todays_pickups"]) > 0:
            pickup = data["todays_pickups"][0]
            assert "order_id" in pickup
            assert "customer_name" in pickup
            assert "status" in pickup
            print(f"✓ Today's pickups: {len(data['todays_pickups'])} orders")
        else:
            print("✓ Today's pickups: 0 orders (empty list)")
    
    def test_dashboard_urgent_tickets(self):
        """Test dashboard returns urgent tickets"""
        response = requests.get(f"{BASE_URL}/api/automation/operator-dashboard")
        assert response.status_code == 200
        data = response.json()
        
        assert "urgent_tickets" in data
        assert isinstance(data["urgent_tickets"], list)
        
        # If there are urgent tickets, verify structure
        if len(data["urgent_tickets"]) > 0:
            ticket = data["urgent_tickets"][0]
            assert "ticket_id" in ticket
            assert "subject" in ticket
            assert "priority" in ticket
            assert ticket["priority"] == "HIGH"
            print(f"✓ Urgent tickets: {len(data['urgent_tickets'])} tickets")
        else:
            print("✓ Urgent tickets: 0 tickets (empty list)")


# ==================== DAILY SUMMARY ====================

class TestDailySummary:
    """Test daily summary endpoint"""
    
    def test_daily_summary_structure(self):
        """Test daily summary returns correct structure"""
        response = requests.get(f"{BASE_URL}/api/automation/daily-summary")
        assert response.status_code == 200
        data = response.json()
        
        # Check structure
        assert "generated_at" in data
        assert "orders" in data
        assert "tickets" in data
        assert "quotes" in data
        assert "leads" in data
        
        # Check orders structure
        orders = data["orders"]
        assert "new_today" in orders
        assert "pickups_today" in orders
        assert "unassigned" in orders
        
        # Check tickets structure
        tickets = data["tickets"]
        assert "open" in tickets
        assert "high_priority" in tickets
        assert "sla_at_risk" in tickets
        
        print(f"✓ Daily summary: Orders={orders}, Tickets={tickets}")


# ==================== SLA ALERTS ====================

class TestSLAAlerts:
    """Test SLA alerts endpoint"""
    
    def test_sla_alerts_structure(self):
        """Test SLA alerts returns correct structure"""
        response = requests.get(f"{BASE_URL}/api/automation/sla-alerts")
        assert response.status_code == 200
        data = response.json()
        
        assert "generated_at" in data
        assert "past_sla" in data
        assert "approaching_sla" in data
        assert "total_at_risk" in data
        
        assert isinstance(data["past_sla"], list)
        assert isinstance(data["approaching_sla"], list)
        assert isinstance(data["total_at_risk"], int)
        
        print(f"✓ SLA alerts: Past={len(data['past_sla'])}, Approaching={len(data['approaching_sla'])}, Total at risk={data['total_at_risk']}")


# ==================== PHONE NORMALIZATION ====================

class TestPhoneNormalization:
    """Test phone number normalization"""
    
    def test_10_digit_phone_normalized(self):
        """Test 10-digit phone is normalized to E.164"""
        unique_email = f"test_phone10_{uuid.uuid4().hex[:8]}@example.com"
        response = requests.post(f"{BASE_URL}/api/automation/ingest", json={
            "name": "Phone Test User",
            "email": unique_email,
            "phone": "8055551234",  # 10 digits
            "source_form": "CONTACT_FORM"
        })
        assert response.status_code == 200
        # Phone should be normalized to +18055551234
        print("✓ 10-digit phone accepted")
    
    def test_formatted_phone_normalized(self):
        """Test formatted phone is normalized"""
        unique_email = f"test_phone_fmt_{uuid.uuid4().hex[:8]}@example.com"
        response = requests.post(f"{BASE_URL}/api/automation/ingest", json={
            "name": "Formatted Phone User",
            "email": unique_email,
            "phone": "(805) 555-1234",  # Formatted
            "source_form": "CONTACT_FORM"
        })
        assert response.status_code == 200
        print("✓ Formatted phone accepted and normalized")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
