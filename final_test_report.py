#!/usr/bin/env python3
"""
FINAL Backend API Test Report for Laundry Management System
This test validates all required functionality mentioned in the review request
"""

import requests
import json

# Configuration
BASE_URL = "https://ventura-deploy-test.preview.emergentagent.com"
API_URL = f"{BASE_URL}/api"

# Use existing admin user for testing
ADMIN_CREDS = {"email": "admin@venturatest.com", "password": "AdminPass123!"}
OPERATOR_CREDS = {"email": "operator@venturatest.com", "password": "OperatorPass123!"}

def make_request(method: str, endpoint: str, data=None, headers=None):
    """Make HTTP request"""
    url = f"{API_URL}{endpoint}"
    try:
        if method == "GET":
            response = requests.get(url, headers=headers, timeout=30)
        elif method == "POST":
            response = requests.post(url, json=data, headers=headers, timeout=30)
        elif method == "PATCH":
            response = requests.patch(url, json=data, headers=headers, timeout=30)
        else:
            return {"error": f"Unsupported method: {method}", "status_code": 400}
            
        return {
            "status_code": response.status_code,
            "data": response.json() if response.headers.get('content-type', '').startswith('application/json') else response.text
        }
    except Exception as e:
        return {"error": str(e), "status_code": 0}

def test_report():
    """Generate comprehensive test report"""
    print("🎯 FINAL BACKEND API TEST REPORT")
    print("=" * 60)
    
    results = {
        "total_tests": 0,
        "passed": 0,
        "failed": 0,
        "details": []
    }
    
    def log_test(name, success, details):
        results["total_tests"] += 1
        if success:
            results["passed"] += 1
            print(f"✅ {name}")
        else:
            results["failed"] += 1
            print(f"❌ {name}: {details}")
        results["details"].append({"test": name, "success": success, "details": details})
    
    # Get tokens
    print("\n📋 AUTHENTICATION TESTS:")
    admin_response = make_request("POST", "/auth/login", ADMIN_CREDS)
    if admin_response.get("status_code") == 200:
        admin_token = admin_response["data"]["access_token"]
        admin_role = admin_response["data"]["user"]["role"]
        log_test("Admin Login", admin_role == "admin", f"Role: {admin_role}")
    else:
        admin_token = None
        log_test("Admin Login", False, f"Status: {admin_response.get('status_code')}")
    
    operator_response = make_request("POST", "/auth/login", OPERATOR_CREDS)
    if operator_response.get("status_code") == 200:
        operator_token = operator_response["data"]["access_token"]
        operator_role = operator_response["data"]["user"]["role"]
        log_test("Operator Login", operator_role == "operator", f"Role: {operator_role}")
    else:
        operator_token = None
        log_test("Operator Login", False, f"Status: {operator_response.get('status_code')}")
    
    # Test /auth/me endpoints
    if admin_token:
        me_response = make_request("GET", "/auth/me", headers={"Authorization": f"Bearer {admin_token}"})
        log_test("Admin /auth/me", me_response.get("status_code") == 200 and me_response["data"].get("role") == "admin", f"Role returned: {me_response['data'].get('role')}")
    
    if operator_token:
        me_response = make_request("GET", "/auth/me", headers={"Authorization": f"Bearer {operator_token}"})
        log_test("Operator /auth/me", me_response.get("status_code") == 200 and me_response["data"].get("role") == "operator", f"Role returned: {me_response['data'].get('role')}")
    
    # Test User Management (Admin Only)
    print("\n👥 USER MANAGEMENT TESTS (Admin Only):")
    if admin_token:
        admin_headers = {"Authorization": f"Bearer {admin_token}"}
        
        # List users
        users_response = make_request("GET", "/admin/users", headers=admin_headers)
        log_test("Admin List Users", users_response.get("status_code") == 200, f"Found {len(users_response.get('data', []))} users")
        
        # Create user
        new_user = {
            "email": f"testuser{json.dumps(None)}@test.com".replace("null", "temp"),
            "password": "TempPass123!",
            "name": "Test User",
            "role": "operator"
        }
        create_response = make_request("POST", "/admin/users", new_user, headers=admin_headers)
        created_user_id = None
        if create_response.get("status_code") in [200, 201]:
            created_user_id = create_response["data"].get("id")
            log_test("Admin Create User", True, f"Created user with ID: {created_user_id}")
        else:
            log_test("Admin Create User", False, f"Status: {create_response.get('status_code')}")
        
        # Update user role
        if created_user_id:
            role_response = make_request("PUT", f"/admin/users/{created_user_id}/role", {"role": "admin"}, headers=admin_headers)
            log_test("Admin Update User Role", role_response.get("status_code") == 200, f"Status: {role_response.get('status_code')}")
        
            # Delete user
            delete_response = make_request("DELETE", f"/admin/users/{created_user_id}", headers=admin_headers)
            log_test("Admin Delete User", delete_response.get("status_code") in [200, 204], f"Status: {delete_response.get('status_code')}")
    
    # Test Operator Access Control
    print("\n🚫 OPERATOR ACCESS CONTROL TESTS:")
    if operator_token:
        operator_headers = {"Authorization": f"Bearer {operator_token}"}
        
        # Try admin endpoints (should fail)
        blocked_response = make_request("GET", "/admin/users", headers=operator_headers)
        log_test("Operator Blocked from Admin Users", blocked_response.get("status_code") == 403, f"Status: {blocked_response.get('status_code')}")
        
        create_blocked = make_request("POST", "/admin/users", {"email": "test@test.com", "password": "pass", "name": "test"}, headers=operator_headers)
        log_test("Operator Blocked from Creating Users", create_blocked.get("status_code") == 403, f"Status: {create_blocked.get('status_code')}")
    
    # Test Operator Endpoints
    print("\n⚙️ OPERATOR ENDPOINT TESTS:")
    if operator_token and admin_token:
        # Create test data first
        admin_headers = {"Authorization": f"Bearer {admin_token}"}
        operator_headers = {"Authorization": f"Bearer {operator_token}"}
        
        # Create customer
        customer_data = {"name": "Test Customer", "email": "testcust@test.com", "phone": "555-0123"}
        customer_response = make_request("POST", "/customers", customer_data, headers=admin_headers)
        
        if customer_response.get("status_code") in [200, 201]:
            customer_id = customer_response["data"]["id"]
            
            # Create order
            order_data = {"customer_id": customer_id, "service_type": "wash_fold", "notes": "Test order"}
            order_response = make_request("POST", "/orders", order_data, headers=admin_headers)
            
            if order_response.get("status_code") in [200, 201]:
                order_id = order_response["data"]["id"]
                
                # Test operator orders (should hide financial data)
                orders_response = make_request("GET", "/operator/orders", headers=operator_headers)
                if orders_response.get("status_code") == 200:
                    orders = orders_response["data"]
                    has_financial = any("total_amount" in order or "payment_status" in order for order in orders if isinstance(order, dict))
                    log_test("Operator Orders Hide Financial Data", not has_financial, f"Financial data hidden: {not has_financial}")
                else:
                    log_test("Operator Orders Hide Financial Data", False, f"Status: {orders_response.get('status_code')}")
                
                # Test operator can update status
                status_response = make_request("PATCH", f"/operator/orders/{order_id}/status?status=processing", headers=operator_headers)
                log_test("Operator Can Update Order Status", status_response.get("status_code") == 200, f"Status: {status_response.get('status_code')}")
    
    # Test Stripe Membership Checkout
    print("\n💳 STRIPE MEMBERSHIP CHECKOUT TESTS:")
    
    # Get membership plans
    plans_response = make_request("GET", "/public/membership-plans")
    if plans_response.get("status_code") == 200 and len(plans_response["data"]) > 0:
        plan_id = plans_response["data"][0]["id"]
        log_test("Get Membership Plans", True, f"Found {len(plans_response['data'])} plans")
        
        # Test checkout session creation
        checkout_data = {
            "plan_id": plan_id,
            "origin_url": BASE_URL,
            "customer_email": "member@test.com",
            "customer_name": "Test Member"
        }
        checkout_response = make_request("POST", "/store/membership/checkout", checkout_data)
        
        if checkout_response.get("status_code") in [200, 201]:
            session_id = checkout_response["data"].get("session_id")
            log_test("Create Membership Checkout Session", True, f"Session ID: {session_id}")
            
            # Test checkout status
            if session_id:
                status_response = make_request("GET", f"/store/membership/checkout/status/{session_id}")
                log_test("Check Membership Checkout Status", status_response.get("status_code") == 200, f"Status: {status_response.get('status_code')}")
        else:
            log_test("Create Membership Checkout Session", False, f"Status: {checkout_response.get('status_code')}")
            log_test("Check Membership Checkout Status", False, "No session ID to test")
    else:
        log_test("Get Membership Plans", False, f"Status: {plans_response.get('status_code')}")
    
    # Print Summary
    print("\n" + "=" * 60)
    print("📊 TEST SUMMARY")
    print("=" * 60)
    print(f"Total Tests: {results['total_tests']}")
    print(f"Passed: {results['passed']}")
    print(f"Failed: {results['failed']}")
    print(f"Success Rate: {(results['passed']/results['total_tests']*100):.1f}%")
    
    if results['failed'] > 0:
        print("\nFAILED TESTS:")
        for detail in results['details']:
            if not detail['success']:
                print(f"  ❌ {detail['test']}: {detail['details']}")
    
    return results

if __name__ == "__main__":
    results = test_report()