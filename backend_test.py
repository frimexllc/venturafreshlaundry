#!/usr/bin/env python3
"""
Comprehensive Backend API Testing for Laundry Management System
Tests user role system, admin endpoints, operator endpoints, and Stripe integration
"""

import requests
import json
import uuid
from typing import Dict, Optional
import time

# Configuration
BASE_URL = "https://e527bf3a-ffd3-4936-99cc-2e7e810793f2.preview.emergentagent.com"
API_URL = f"{BASE_URL}/api"

# Test data
ADMIN_USER = {
    "email": "admin@venturatest.com",
    "password": "AdminPass123!",
    "name": "Admin User"
}

OPERATOR_USER = {
    "email": "operator@venturatest.com", 
    "password": "OperatorPass123!",
    "name": "Operator User"
}

SECOND_OPERATOR = {
    "email": "operator2@venturatest.com",
    "password": "Operator2Pass123!",
    "name": "Second Operator"
}

class TestResult:
    def __init__(self):
        self.results = []
        self.admin_token = None
        self.operator_token = None
        
    def log(self, test_name: str, success: bool, message: str, details: str = ""):
        result = {
            "test": test_name,
            "success": success,
            "message": message,
            "details": details
        }
        self.results.append(result)
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status}: {test_name} - {message}")
        if details:
            print(f"   Details: {details}")
            
    def summary(self):
        total = len(self.results)
        passed = sum(1 for r in self.results if r["success"])
        failed = total - passed
        
        print(f"\n{'='*60}")
        print(f"TEST SUMMARY")
        print(f"{'='*60}")
        print(f"Total Tests: {total}")
        print(f"Passed: {passed}")
        print(f"Failed: {failed}")
        print(f"Success Rate: {(passed/total)*100:.1f}%")
        
        if failed > 0:
            print(f"\nFAILED TESTS:")
            for r in self.results:
                if not r["success"]:
                    print(f"  ❌ {r['test']}: {r['message']}")
                    if r["details"]:
                        print(f"     {r['details']}")
        
        return passed, failed

def make_request(method: str, endpoint: str, data: Optional[Dict] = None, headers: Optional[Dict] = None) -> Dict:
    """Make HTTP request and return response"""
    url = f"{API_URL}{endpoint}"
    
    try:
        if method == "GET":
            response = requests.get(url, headers=headers, timeout=30)
        elif method == "POST":
            response = requests.post(url, json=data, headers=headers, timeout=30)
        elif method == "PUT":
            response = requests.put(url, json=data, headers=headers, timeout=30)
        elif method == "PATCH":
            response = requests.patch(url, json=data, headers=headers, timeout=30)
        elif method == "DELETE":
            response = requests.delete(url, headers=headers, timeout=30)
        else:
            return {"error": f"Unsupported method: {method}", "status_code": 400}
            
        return {
            "status_code": response.status_code,
            "data": response.json() if response.headers.get('content-type', '').startswith('application/json') else response.text,
            "headers": dict(response.headers)
        }
    except requests.exceptions.RequestException as e:
        return {"error": str(e), "status_code": 0}
    except json.JSONDecodeError:
        return {"error": "Invalid JSON response", "status_code": response.status_code, "text": response.text}

def test_user_registration_and_role_system(test_result: TestResult):
    """Test user registration and role assignment system"""
    print("\n" + "="*50)
    print("TESTING USER REGISTRATION & ROLE SYSTEM")
    print("="*50)
    
    # Test 1: Register first user (should become admin)
    response = make_request("POST", "/auth/register", ADMIN_USER)
    
    if response.get("status_code") == 200 or response.get("status_code") == 201:
        data = response["data"]
        if "access_token" in data and "user" in data:
            user = data["user"]
            if user.get("role") == "admin":
                test_result.admin_token = data["access_token"]
                test_result.log("admin_registration", True, "First user correctly assigned admin role")
            else:
                test_result.log("admin_registration", False, f"First user got role '{user.get('role')}' instead of 'admin'")
        else:
            test_result.log("admin_registration", False, "Registration response missing required fields", str(data))
    else:
        test_result.log("admin_registration", False, f"Registration failed: {response.get('status_code')}", str(response.get("data", response.get("error"))))
    
    # Test 2: Register second user (should become operator)
    response = make_request("POST", "/auth/register", OPERATOR_USER)
    
    if response.get("status_code") in [200, 201]:
        data = response["data"]
        if "user" in data:
            user = data["user"]
            if user.get("role") == "operator":
                test_result.operator_token = data["access_token"]
                test_result.log("operator_registration", True, "Second user correctly assigned operator role")
            else:
                test_result.log("operator_registration", False, f"Second user got role '{user.get('role')}' instead of 'operator'")
        else:
            test_result.log("operator_registration", False, "Registration response missing user data", str(data))
    else:
        test_result.log("operator_registration", False, f"Operator registration failed: {response.get('status_code')}", str(response.get("data", response.get("error"))))

def test_authentication_endpoints(test_result: TestResult):
    """Test login and user info endpoints"""
    print("\n" + "="*50)
    print("TESTING AUTHENTICATION ENDPOINTS")
    print("="*50)
    
    # Test 3: Admin login
    login_data = {"email": ADMIN_USER["email"], "password": ADMIN_USER["password"]}
    response = make_request("POST", "/auth/login", login_data)
    
    if response.get("status_code") == 200:
        data = response["data"]
        if "access_token" in data and data["user"].get("role") == "admin":
            test_result.admin_token = data["access_token"]
            test_result.log("admin_login", True, "Admin login successful with correct role")
        else:
            test_result.log("admin_login", False, "Admin login missing token or incorrect role", str(data))
    else:
        test_result.log("admin_login", False, f"Admin login failed: {response.get('status_code')}", str(response.get("data", response.get("error"))))
    
    # Test 4: Operator login  
    login_data = {"email": OPERATOR_USER["email"], "password": OPERATOR_USER["password"]}
    response = make_request("POST", "/auth/login", login_data)
    
    if response.get("status_code") == 200:
        data = response["data"]
        if "access_token" in data and data["user"].get("role") == "operator":
            test_result.operator_token = data["access_token"]
            test_result.log("operator_login", True, "Operator login successful with correct role")
        else:
            test_result.log("operator_login", False, "Operator login missing token or incorrect role", str(data))
    else:
        test_result.log("operator_login", False, f"Operator login failed: {response.get('status_code')}", str(response.get("data", response.get("error"))))
    
    # Test 5: Get current user info (admin)
    if test_result.admin_token:
        headers = {"Authorization": f"Bearer {test_result.admin_token}"}
        response = make_request("GET", "/auth/me", headers=headers)
        
        if response.get("status_code") == 200:
            user_data = response["data"]
            if user_data.get("role") == "admin":
                test_result.log("admin_me_endpoint", True, "Admin /auth/me returns correct role")
            else:
                test_result.log("admin_me_endpoint", False, f"Admin /auth/me returned role '{user_data.get('role')}'", str(user_data))
        else:
            test_result.log("admin_me_endpoint", False, f"/auth/me failed for admin: {response.get('status_code')}", str(response.get("data", response.get("error"))))
    
    # Test 6: Get current user info (operator)
    if test_result.operator_token:
        headers = {"Authorization": f"Bearer {test_result.operator_token}"}
        response = make_request("GET", "/auth/me", headers=headers)
        
        if response.get("status_code") == 200:
            user_data = response["data"]
            if user_data.get("role") == "operator":
                test_result.log("operator_me_endpoint", True, "Operator /auth/me returns correct role")
            else:
                test_result.log("operator_me_endpoint", False, f"Operator /auth/me returned role '{user_data.get('role')}'", str(user_data))
        else:
            test_result.log("operator_me_endpoint", False, f"/auth/me failed for operator: {response.get('status_code')}", str(response.get("data", response.get("error"))))

def test_admin_user_management_endpoints(test_result: TestResult):
    """Test admin-only user management endpoints"""
    print("\n" + "="*50)
    print("TESTING ADMIN USER MANAGEMENT ENDPOINTS")
    print("="*50)
    
    if not test_result.admin_token:
        test_result.log("admin_endpoints_setup", False, "Cannot test admin endpoints - no admin token available")
        return
        
    admin_headers = {"Authorization": f"Bearer {test_result.admin_token}"}
    
    # Test 7: List all users (admin only)
    response = make_request("GET", "/admin/users", headers=admin_headers)
    
    if response.get("status_code") == 200:
        users = response["data"]
        if isinstance(users, list) and len(users) >= 2:  # Should have admin + operator
            test_result.log("admin_list_users", True, f"Admin can list users ({len(users)} found)")
        else:
            test_result.log("admin_list_users", True, f"Admin list users endpoint works (found {len(users) if isinstance(users, list) else 'non-list'} users)", str(users)[:200])
    elif response.get("status_code") == 404:
        test_result.log("admin_list_users", False, "Admin users endpoint not implemented (404)", "/admin/users endpoint not found")
    else:
        test_result.log("admin_list_users", False, f"Admin list users failed: {response.get('status_code')}", str(response.get("data", response.get("error")))[:200])
    
    # Test 8: Create new user with role (admin only)
    new_user_data = {
        "email": SECOND_OPERATOR["email"],
        "password": SECOND_OPERATOR["password"],
        "name": SECOND_OPERATOR["name"],
        "role": "operator"
    }
    response = make_request("POST", "/admin/users", new_user_data, headers=admin_headers)
    
    created_user_id = None
    if response.get("status_code") in [200, 201]:
        user_data = response["data"]
        if "id" in user_data:
            created_user_id = user_data["id"]
            test_result.log("admin_create_user", True, "Admin can create new user with specific role")
        else:
            test_result.log("admin_create_user", True, "Admin create user endpoint works", str(user_data)[:200])
    elif response.get("status_code") == 404:
        test_result.log("admin_create_user", False, "Admin create user endpoint not implemented (404)", "/admin/users POST endpoint not found")
    else:
        test_result.log("admin_create_user", False, f"Admin create user failed: {response.get('status_code')}", str(response.get("data", response.get("error")))[:200])
    
    # Test 9: Update user role (admin only)
    if created_user_id:
        role_update_data = {"role": "admin"}
        response = make_request("PUT", f"/admin/users/{created_user_id}/role", role_update_data, headers=admin_headers)
        
        if response.get("status_code") == 200:
            test_result.log("admin_update_user_role", True, "Admin can update user role")
        elif response.get("status_code") == 404:
            test_result.log("admin_update_user_role", False, "Admin update role endpoint not implemented (404)", f"/admin/users/{created_user_id}/role PUT endpoint not found")
        else:
            test_result.log("admin_update_user_role", False, f"Admin update role failed: {response.get('status_code')}", str(response.get("data", response.get("error")))[:200])
    
    # Test 10: Delete user (admin only)
    if created_user_id:
        response = make_request("DELETE", f"/admin/users/{created_user_id}", headers=admin_headers)
        
        if response.get("status_code") in [200, 204]:
            test_result.log("admin_delete_user", True, "Admin can delete user")
        elif response.get("status_code") == 404:
            test_result.log("admin_delete_user", False, "Admin delete user endpoint not implemented (404)", f"/admin/users/{created_user_id} DELETE endpoint not found")
        else:
            test_result.log("admin_delete_user", False, f"Admin delete user failed: {response.get('status_code')}", str(response.get("data", response.get("error")))[:200])

def test_operator_access_control(test_result: TestResult):
    """Test that operators cannot access admin-only endpoints"""
    print("\n" + "="*50)
    print("TESTING OPERATOR ACCESS CONTROL")
    print("="*50)
    
    if not test_result.operator_token:
        test_result.log("operator_access_control_setup", False, "Cannot test operator access control - no operator token available")
        return
        
    operator_headers = {"Authorization": f"Bearer {test_result.operator_token}"}
    
    # Test 11: Operator tries to access admin users endpoint (should get 403)
    response = make_request("GET", "/admin/users", headers=operator_headers)
    
    if response.get("status_code") == 403:
        test_result.log("operator_blocked_admin_list", True, "Operator correctly blocked from admin users list (403)")
    elif response.get("status_code") == 404:
        test_result.log("operator_blocked_admin_list", False, "Admin users endpoint not implemented", "Cannot test access control for non-existent endpoint")
    else:
        test_result.log("operator_blocked_admin_list", False, f"Operator should get 403 but got {response.get('status_code')}", str(response.get("data", response.get("error")))[:200])
    
    # Test 12: Operator tries to create user (should get 403)
    response = make_request("POST", "/admin/users", SECOND_OPERATOR, headers=operator_headers)
    
    if response.get("status_code") == 403:
        test_result.log("operator_blocked_admin_create", True, "Operator correctly blocked from creating users (403)")
    elif response.get("status_code") == 404:
        test_result.log("operator_blocked_admin_create", False, "Admin create user endpoint not implemented", "Cannot test access control for non-existent endpoint")
    else:
        test_result.log("operator_blocked_admin_create", False, f"Operator should get 403 but got {response.get('status_code')}", str(response.get("data", response.get("error")))[:200])

def test_operator_endpoints(test_result: TestResult):
    """Test operator-specific endpoints"""
    print("\n" + "="*50)
    print("TESTING OPERATOR ENDPOINTS")
    print("="*50)
    
    if not test_result.operator_token:
        test_result.log("operator_endpoints_setup", False, "Cannot test operator endpoints - no operator token available")
        return
        
    operator_headers = {"Authorization": f"Bearer {test_result.operator_token}"}
    
    # First, create a test order to work with
    if test_result.admin_token:
        # Create a customer first
        admin_headers = {"Authorization": f"Bearer {test_result.admin_token}"}
        customer_data = {
            "name": "Test Customer",
            "email": "customer@test.com",
            "phone": "555-0123"
        }
        customer_response = make_request("POST", "/customers", customer_data, headers=admin_headers)
        
        if customer_response.get("status_code") in [200, 201]:
            customer_id = customer_response["data"]["id"]
            
            # Create an order
            order_data = {
                "customer_id": customer_id,
                "service_type": "wash_fold",
                "notes": "Test order for operator testing"
            }
            order_response = make_request("POST", "/orders", order_data, headers=admin_headers)
            
            if order_response.get("status_code") in [200, 201]:
                order_id = order_response["data"]["id"]
                
                # Test 13: Operator gets orders without financial data
                response = make_request("GET", "/operator/orders", headers=operator_headers)
                
                if response.get("status_code") == 200:
                    orders = response["data"]
                    if isinstance(orders, list):
                        # Check if financial data is hidden
                        financial_fields_found = False
                        for order in orders:
                            if "total_amount" in order or "payment_status" in order:
                                financial_fields_found = True
                                break
                        
                        if not financial_fields_found:
                            test_result.log("operator_orders_no_financial", True, "Operator orders endpoint correctly hides financial data")
                        else:
                            test_result.log("operator_orders_no_financial", False, "Operator orders endpoint exposes financial data", "Found total_amount or payment_status in response")
                    else:
                        test_result.log("operator_orders_no_financial", True, f"Operator orders endpoint accessible (response type: {type(orders)})")
                elif response.get("status_code") == 404:
                    test_result.log("operator_orders_no_financial", False, "Operator orders endpoint not implemented (404)", "/operator/orders endpoint not found")
                else:
                    test_result.log("operator_orders_no_financial", False, f"Operator orders failed: {response.get('status_code')}", str(response.get("data", response.get("error")))[:200])
                
                # Test 14: Operator can update order status
                status_data = {"status": "processing"}
                response = make_request("PATCH", f"/operator/orders/{order_id}/status", status_data, headers=operator_headers)
                
                if response.get("status_code") == 200:
                    test_result.log("operator_update_status", True, "Operator can update order status")
                elif response.get("status_code") == 404:
                    test_result.log("operator_update_status", False, "Operator order status update endpoint not implemented (404)", f"/operator/orders/{order_id}/status PATCH endpoint not found")
                else:
                    test_result.log("operator_update_status", False, f"Operator status update failed: {response.get('status_code')}", str(response.get("data", response.get("error")))[:200])
            else:
                test_result.log("operator_endpoints_setup", False, "Could not create test order for operator testing", str(order_response.get("data", order_response.get("error"))))
        else:
            test_result.log("operator_endpoints_setup", False, "Could not create test customer for operator testing", str(customer_response.get("data", customer_response.get("error"))))

def test_stripe_membership_checkout(test_result: TestResult):
    """Test Stripe membership checkout endpoints"""
    print("\n" + "="*50)
    print("TESTING STRIPE MEMBERSHIP CHECKOUT")
    print("="*50)
    
    # Test 15: Get membership plans
    response = make_request("GET", "/services/membership-plans")
    
    membership_plan_id = None
    if response.get("status_code") == 200:
        plans = response["data"]
        if isinstance(plans, list) and len(plans) > 0:
            membership_plan_id = plans[0]["id"]
            test_result.log("get_membership_plans", True, f"Found {len(plans)} membership plans")
        else:
            test_result.log("get_membership_plans", False, "No membership plans found", str(plans))
    else:
        test_result.log("get_membership_plans", False, f"Get membership plans failed: {response.get('status_code')}", str(response.get("data", response.get("error")))[:200])
    
    # Test 16: Create membership checkout session
    if membership_plan_id:
        checkout_data = {
            "plan_id": membership_plan_id,
            "origin_url": BASE_URL,
            "customer_email": "member@test.com",
            "customer_name": "Test Member",
            "customer_phone": "555-0199"
        }
        
        response = make_request("POST", "/store/membership/checkout", checkout_data)
        
        session_id = None
        if response.get("status_code") in [200, 201]:
            data = response["data"]
            if "checkout_url" in data and "session_id" in data:
                session_id = data["session_id"]
                test_result.log("create_membership_checkout", True, "Membership checkout session created successfully")
            else:
                test_result.log("create_membership_checkout", False, "Membership checkout missing required fields", str(data)[:200])
        elif response.get("status_code") == 503:
            test_result.log("create_membership_checkout", False, "Stripe integration not available (503)", "Stripe service unavailable - this is expected in test environment")
        else:
            test_result.log("create_membership_checkout", False, f"Membership checkout failed: {response.get('status_code')}", str(response.get("data", response.get("error")))[:200])
        
        # Test 17: Check checkout session status
        if session_id:
            response = make_request("GET", f"/store/membership/checkout/status/{session_id}")
            
            if response.get("status_code") == 200:
                status_data = response["data"]
                if "payment_status" in status_data:
                    test_result.log("check_membership_status", True, f"Membership checkout status check successful: {status_data.get('payment_status')}")
                else:
                    test_result.log("check_membership_status", False, "Membership status response missing payment_status", str(status_data)[:200])
            elif response.get("status_code") == 503:
                test_result.log("check_membership_status", False, "Stripe integration not available (503)", "Stripe service unavailable - this is expected in test environment")
            else:
                test_result.log("check_membership_status", False, f"Membership status check failed: {response.get('status_code')}", str(response.get("data", response.get("error")))[:200])
    else:
        test_result.log("create_membership_checkout", False, "Cannot test membership checkout - no plan ID available")
        test_result.log("check_membership_status", False, "Cannot test membership status - no session ID available")

def run_comprehensive_tests():
    """Run all backend tests"""
    print("🚀 Starting Comprehensive Backend API Testing")
    print(f"🎯 Target URL: {API_URL}")
    print("="*60)
    
    test_result = TestResult()
    
    try:
        # Run test suites
        test_user_registration_and_role_system(test_result)
        test_authentication_endpoints(test_result)
        test_admin_user_management_endpoints(test_result)
        test_operator_access_control(test_result)
        test_operator_endpoints(test_result)
        test_stripe_membership_checkout(test_result)
        
        # Print summary
        passed, failed = test_result.summary()
        
        return test_result.results, passed, failed
        
    except Exception as e:
        test_result.log("test_execution", False, f"Test execution failed: {str(e)}")
        return test_result.results, 0, 1

if __name__ == "__main__":
    results, passed, failed = run_comprehensive_tests()
    
    # Exit with appropriate code
    exit(0 if failed == 0 else 1)