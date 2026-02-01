import requests
import sys
import json
from datetime import datetime

class VenturaFreshCRMTester:
    def __init__(self, base_url="https://crm-without-n8n.preview.emergentagent.com/api"):
        self.base_url = base_url
        self.token = None
        self.user_id = None
        self.tests_run = 0
        self.tests_passed = 0
        self.created_entities = {
            'customers': [],
            'orders': [],
            'quotes': [],
            'leads': [],
            'tickets': []
        }

    def run_test(self, name, method, endpoint, expected_status, data=None, headers=None):
        """Run a single API test"""
        url = f"{self.base_url}/{endpoint}"
        test_headers = {'Content-Type': 'application/json'}
        
        if self.token:
            test_headers['Authorization'] = f'Bearer {self.token}'
        
        if headers:
            test_headers.update(headers)

        self.tests_run += 1
        print(f"\n🔍 Testing {name}...")
        print(f"   URL: {url}")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=test_headers, timeout=30)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=test_headers, timeout=30)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=test_headers, timeout=30)
            elif method == 'DELETE':
                response = requests.delete(url, headers=test_headers, timeout=30)
            elif method == 'PATCH':
                response = requests.patch(url, json=data, headers=test_headers, timeout=30)

            print(f"   Status: {response.status_code}")
            
            success = response.status_code == expected_status
            if success:
                self.tests_passed += 1
                print(f"✅ Passed - Status: {response.status_code}")
                try:
                    return success, response.json() if response.content else {}
                except:
                    return success, {}
            else:
                print(f"❌ Failed - Expected {expected_status}, got {response.status_code}")
                try:
                    error_detail = response.json()
                    print(f"   Error: {error_detail}")
                except:
                    print(f"   Response: {response.text[:200]}")
                return False, {}

        except Exception as e:
            print(f"❌ Failed - Error: {str(e)}")
            return False, {}

    def test_health_check(self):
        """Test health endpoints"""
        print("\n=== HEALTH CHECK TESTS ===")
        
        # Test root endpoint
        success, _ = self.run_test("Root endpoint", "GET", "", 200)
        
        # Test health endpoint
        success, _ = self.run_test("Health check", "GET", "health", 200)
        
        return success

    def test_authentication(self):
        """Test authentication endpoints"""
        print("\n=== AUTHENTICATION TESTS ===")
        
        # Test login with provided credentials
        login_data = {
            "email": "admin@venturafresh.com",
            "password": "admin123"
        }
        
        success, response = self.run_test("Login", "POST", "auth/login", 200, data=login_data)
        
        if success and 'access_token' in response:
            self.token = response['access_token']
            self.user_id = response.get('user', {}).get('id')
            print(f"   Token obtained: {self.token[:20]}...")
            
            # Test get current user
            success, user_data = self.run_test("Get current user", "GET", "auth/me", 200)
            if success:
                print(f"   User: {user_data.get('name')} ({user_data.get('email')})")
            
            return True
        else:
            print("❌ Login failed - cannot proceed with authenticated tests")
            return False

    def test_dashboard(self):
        """Test dashboard endpoints"""
        print("\n=== DASHBOARD TESTS ===")
        
        # Test dashboard stats
        success, stats = self.run_test("Dashboard stats", "GET", "dashboard/stats", 200)
        if success:
            print(f"   Stats: {stats}")
        
        # Test recent activity
        success, activity = self.run_test("Recent activity", "GET", "dashboard/recent-activity", 200)
        if success:
            print(f"   Activity items: {len(activity)}")
        
        return success

    def test_customers(self):
        """Test customer management"""
        print("\n=== CUSTOMER TESTS ===")
        
        # Test get customers
        success, customers = self.run_test("Get customers", "GET", "customers", 200)
        if success:
            print(f"   Existing customers: {len(customers)}")
        
        # Test create customer
        customer_data = {
            "name": f"Test Customer {datetime.now().strftime('%H%M%S')}",
            "email": f"test{datetime.now().strftime('%H%M%S')}@test.com",
            "phone": "+1234567890",
            "address": "123 Test Street",
            "preferred_contact": "email",
            "notes": "Test customer for API testing"
        }
        
        success, customer = self.run_test("Create customer", "POST", "customers", 200, data=customer_data)
        if success and 'id' in customer:
            customer_id = customer['id']
            self.created_entities['customers'].append(customer_id)
            print(f"   Created customer ID: {customer_id}")
            
            # Test get specific customer
            success, _ = self.run_test("Get customer by ID", "GET", f"customers/{customer_id}", 200)
            
            # Test update customer
            update_data = {"name": "Updated Test Customer", "notes": "Updated notes"}
            success, _ = self.run_test("Update customer", "PUT", f"customers/{customer_id}", 200, data=update_data)
            
            return True
        
        return False

    def test_orders(self):
        """Test order management"""
        print("\n=== ORDER TESTS ===")
        
        # Need a customer first
        if not self.created_entities['customers']:
            print("❌ No customers available for order testing")
            return False
        
        customer_id = self.created_entities['customers'][0]
        
        # Test get orders
        success, orders = self.run_test("Get orders", "GET", "orders", 200)
        if success:
            print(f"   Existing orders: {len(orders)}")
        
        # Test create order
        order_data = {
            "customer_id": customer_id,
            "service_type": "pickup_delivery",
            "pickup_date": "2024-12-20",
            "pickup_time_window": "10am-12pm",
            "pickup_address": "123 Test Street",
            "delivery_address": "456 Delivery Ave",
            "estimated_lbs": 15.5,
            "notes": "Test order",
            "gate_code": "1234"
        }
        
        success, order = self.run_test("Create order", "POST", "orders", 200, data=order_data)
        if success and 'id' in order:
            order_id = order['id']
            self.created_entities['orders'].append(order_id)
            print(f"   Created order ID: {order_id}")
            print(f"   Order number: {order.get('order_number')}")
            
            # Test get specific order
            success, _ = self.run_test("Get order by ID", "GET", f"orders/{order_id}", 200)
            
            # Test update order status
            success, _ = self.run_test("Update order status", "PATCH", f"orders/{order_id}/status?status=processing", 200)
            
            return True
        
        return False

    def test_quotes(self):
        """Test quote management"""
        print("\n=== QUOTE TESTS ===")
        
        # Test get quotes
        success, quotes = self.run_test("Get quotes", "GET", "quotes", 200)
        if success:
            print(f"   Existing quotes: {len(quotes)}")
        
        # Test create quote
        quote_data = {
            "company_name": f"Test Company {datetime.now().strftime('%H%M%S')}",
            "contact_name": "John Doe",
            "email": f"john{datetime.now().strftime('%H%M%S')}@testcompany.com",
            "phone": "+1234567890",
            "industry": "Hospitality",
            "estimated_lbs_per_week": 100.0,
            "service_needs": "Weekly pickup and delivery for hotel linens",
            "notes": "Test B2B quote"
        }
        
        success, quote = self.run_test("Create quote", "POST", "quotes", 200, data=quote_data)
        if success and 'id' in quote:
            quote_id = quote['id']
            self.created_entities['quotes'].append(quote_id)
            print(f"   Created quote ID: {quote_id}")
            print(f"   Quote number: {quote.get('quote_number')}")
            
            # Test get specific quote
            success, _ = self.run_test("Get quote by ID", "GET", f"quotes/{quote_id}", 200)
            
            # Test update quote
            update_data = {"status": "sent"}
            success, _ = self.run_test("Update quote", "PUT", f"quotes/{quote_id}", 200, data=update_data)
            
            return True
        
        return False

    def test_leads(self):
        """Test lead management"""
        print("\n=== LEAD TESTS ===")
        
        # Test get leads
        success, leads = self.run_test("Get leads", "GET", "leads", 200)
        if success:
            print(f"   Existing leads: {len(leads)}")
        
        # Test create lead
        lead_data = {
            "name": f"Test Lead {datetime.now().strftime('%H%M%S')}",
            "email": f"lead{datetime.now().strftime('%H%M%S')}@test.com",
            "phone": "+1234567890",
            "source": "website",
            "interest_type": "pickup_delivery",
            "notes": "Interested in weekly service"
        }
        
        success, lead = self.run_test("Create lead", "POST", "leads", 200, data=lead_data)
        if success and 'id' in lead:
            lead_id = lead['id']
            self.created_entities['leads'].append(lead_id)
            print(f"   Created lead ID: {lead_id}")
            
            # Test get specific lead
            success, _ = self.run_test("Get lead by ID", "GET", f"leads/{lead_id}", 200)
            
            # Test update lead status
            update_data = {"status": "contacted"}
            success, _ = self.run_test("Update lead", "PUT", f"leads/{lead_id}", 200, data=update_data)
            
            # Test convert lead to customer
            success, customer = self.run_test("Convert lead to customer", "POST", f"leads/{lead_id}/convert", 200)
            if success and 'id' in customer:
                print(f"   Converted to customer ID: {customer['id']}")
            
            return True
        
        return False

    def test_tickets(self):
        """Test support ticket management"""
        print("\n=== TICKET TESTS ===")
        
        # Test get tickets
        success, tickets = self.run_test("Get tickets", "GET", "tickets", 200)
        if success:
            print(f"   Existing tickets: {len(tickets)}")
        
        # Test create ticket
        ticket_data = {
            "customer_id": self.created_entities['customers'][0] if self.created_entities['customers'] else None,
            "subject": "Test Support Issue",
            "description": "This is a test support ticket for API testing",
            "category": "issue"
        }
        
        success, ticket = self.run_test("Create ticket", "POST", "tickets", 200, data=ticket_data)
        if success and 'id' in ticket:
            ticket_id = ticket['id']
            self.created_entities['tickets'].append(ticket_id)
            print(f"   Created ticket ID: {ticket_id}")
            print(f"   Ticket number: {ticket.get('ticket_number')}")
            print(f"   Priority: {ticket.get('priority')}")
            
            # Test get specific ticket
            success, _ = self.run_test("Get ticket by ID", "GET", f"tickets/{ticket_id}", 200)
            
            # Test update ticket status
            update_data = {"status": "in_progress"}
            success, _ = self.run_test("Update ticket", "PUT", f"tickets/{ticket_id}", 200, data=update_data)
            
            return True
        
        return False

    def test_audit_log(self):
        """Test audit log"""
        print("\n=== AUDIT LOG TESTS ===")
        
        # Test get audit logs
        success, logs = self.run_test("Get audit logs", "GET", "audit-logs", 200)
        if success:
            print(f"   Audit log entries: {len(logs)}")
            if logs:
                print(f"   Latest event: {logs[0].get('event_type')} on {logs[0].get('entity_type')}")
        
        # Test filtered audit logs
        success, customer_logs = self.run_test("Get customer audit logs", "GET", "audit-logs?entity_type=customer", 200)
        if success:
            print(f"   Customer audit entries: {len(customer_logs)}")
        
        return success

    def test_public_endpoints(self):
        """Test public form endpoints (no auth required)"""
        print("\n=== PUBLIC ENDPOINTS TESTS ===")
        
        # Temporarily remove token for public endpoints
        original_token = self.token
        self.token = None
        
        # Test public pickup request
        pickup_data = {
            "name": f"Public Test User {datetime.now().strftime('%H%M%S')}",
            "email": f"public{datetime.now().strftime('%H%M%S')}@test.com",
            "phone": "+1234567890",
            "address": "123 Public Test Street",
            "pickup_date": "2024-12-25",
            "pickup_time": "10am-12pm",
            "service_type": "pickup_delivery",
            "notes": "Test public pickup request",
            "gate_code": "5678"
        }
        
        success, response = self.run_test("Public pickup request", "POST", "public/pickup-request", 200, data=pickup_data)
        if success:
            print(f"   Order number: {response.get('order_number')}")
            print(f"   Message: {response.get('message')}")
        
        # Test public contact form
        contact_data = {
            "name": f"Contact Test {datetime.now().strftime('%H%M%S')}",
            "email": f"contact{datetime.now().strftime('%H%M%S')}@test.com",
            "phone": "+1234567890",
            "message": "This is a test contact message from the public form",
            "subject": "Test Contact"
        }
        
        success, response = self.run_test("Public contact form", "POST", "public/contact", 200, data=contact_data)
        if success:
            print(f"   Ticket number: {response.get('ticket_number')}")
            print(f"   Message: {response.get('message')}")
        
        # Test public quote request
        quote_data = {
            "company_name": f"Public Test Company {datetime.now().strftime('%H%M%S')}",
            "contact_name": "Jane Doe",
            "email": f"quote{datetime.now().strftime('%H%M%S')}@testcompany.com",
            "phone": "+1234567890",
            "industry": "Restaurant",
            "estimated_lbs": 50.0,
            "message": "We need weekly commercial laundry service for our restaurant"
        }
        
        success, response = self.run_test("Public quote request", "POST", "public/quote-request", 200, data=quote_data)
        if success:
            print(f"   Quote number: {response.get('quote_number')}")
            print(f"   Message: {response.get('message')}")
        
        # Restore token
        self.token = original_token
        return success

    def test_calendar_endpoints(self):
        """Test calendar functionality"""
        print("\n=== CALENDAR TESTS ===")
        
        # Test calendar orders endpoint
        success, events = self.run_test("Get calendar orders", "GET", "calendar/orders?start_date=2024-12-01&end_date=2024-12-31", 200)
        if success:
            print(f"   Calendar events: {len(events)}")
            if events:
                print(f"   Sample event: {events[0].get('title')} on {events[0].get('date')}")
        
        return success

    def test_settings_endpoints(self):
        """Test settings and export functionality"""
        print("\n=== SETTINGS TESTS ===")
        
        # Test notification settings
        success, settings = self.run_test("Get notification settings", "GET", "settings/notifications", 200)
        if success:
            print(f"   Email enabled: {settings.get('email_enabled')}")
            print(f"   SMS enabled: {settings.get('sms_enabled')}")
            print(f"   Notifications available: {settings.get('notifications_available')}")
        
        # Test CSV exports
        export_types = ["customers", "orders", "quotes", "leads", "tickets"]
        
        for export_type in export_types:
            success, _ = self.run_test(f"Export {export_type} CSV", "GET", f"export/{export_type}", 200)
            if success:
                print(f"   {export_type}.csv export successful")
        
        return success

    def cleanup_test_data(self):
        """Clean up created test data"""
        print("\n=== CLEANUP ===")
        
        # Delete created customers (this will cascade to related data)
        for customer_id in self.created_entities['customers']:
            try:
                success, _ = self.run_test(f"Delete customer {customer_id[:8]}", "DELETE", f"customers/{customer_id}", 200)
            except:
                pass

def main():
    print("🧪 Starting Ventura Fresh Laundry CRM API Tests")
    print("=" * 60)
    
    tester = VenturaFreshCRMTester()
    
    # Run all tests
    try:
        # Basic connectivity
        if not tester.test_health_check():
            print("❌ Health check failed - stopping tests")
            return 1
        
        # Authentication
        if not tester.test_authentication():
            print("❌ Authentication failed - stopping tests")
            return 1
        
        # Core functionality tests
        tester.test_dashboard()
        tester.test_customers()
        tester.test_orders()
        tester.test_quotes()
        tester.test_leads()
        tester.test_tickets()
        tester.test_audit_log()
        
        # Cleanup
        tester.cleanup_test_data()
        
    except KeyboardInterrupt:
        print("\n⚠️ Tests interrupted by user")
        return 1
    except Exception as e:
        print(f"\n💥 Unexpected error: {str(e)}")
        return 1
    
    # Print results
    print("\n" + "=" * 60)
    print(f"📊 Test Results: {tester.tests_passed}/{tester.tests_run} passed")
    
    success_rate = (tester.tests_passed / tester.tests_run * 100) if tester.tests_run > 0 else 0
    print(f"📈 Success Rate: {success_rate:.1f}%")
    
    if success_rate >= 80:
        print("✅ Backend API tests PASSED")
        return 0
    else:
        print("❌ Backend API tests FAILED")
        return 1

if __name__ == "__main__":
    sys.exit(main())