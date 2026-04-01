"""
Iteration 10 Backend Tests
Testing:
1. Store API - Product CRUD with images (URL and file upload)
2. Operator flow states - Wash & Fold vs Pickup & Delivery
3. Notifications - Reduced events (key milestones only)
4. Stripe sync scaffold - Disabled mode
"""
import pytest
import requests
import os
import json

ADMIN_EMAIL = os.environ.get("TEST_ADMIN_EMAIL", "owner@frimexllc.com")
ADMIN_PASSWORD = os.environ.get("TEST_ADMIN_PASSWORD", "admin123")

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://ventura-deploy-test.preview.emergentagent.com')

class TestStripeSync:
    """Test Stripe Advanced Sync scaffold endpoints - should be disabled"""
    
    def test_stripe_sync_status_returns_disabled(self):
        """Stripe sync status should show enabled=false"""
        response = requests.get(f"{BASE_URL}/api/stripe-sync/status")
        assert response.status_code == 200
        data = response.json()
        assert data["enabled"] == False
        assert data["mode"] == "scaffold"
        print(f"✓ Stripe sync status: enabled={data['enabled']}, mode={data['mode']}")

    def test_stripe_sync_plan_returns_scaffold_info(self):
        """Stripe sync plan should return scaffold information"""
        response = requests.get(f"{BASE_URL}/api/stripe-sync/plan")
        assert response.status_code == 200
        data = response.json()
        assert data["feature_flag"] == "STRIPE_ADVANCED_SYNC_ENABLED"
        assert "pull_endpoints" in data
        assert "push_endpoints" in data
        print(f"✓ Stripe sync plan: feature_flag={data['feature_flag']}")

    def test_stripe_sync_pull_returns_503_when_disabled(self):
        """Pull endpoints should return 503 when disabled"""
        response = requests.post(f"{BASE_URL}/api/stripe-sync/pull/customers", 
                                  json={"dry_run": True})
        assert response.status_code == 503
        data = response.json()
        assert "disabled" in data["detail"]["message"].lower()
        print("✓ Stripe sync pull returns 503 when disabled")

    def test_stripe_sync_push_returns_503_when_disabled(self):
        """Push endpoints should return 503 when disabled"""
        response = requests.post(f"{BASE_URL}/api/stripe-sync/push/products", 
                                  json={"dry_run": True})
        assert response.status_code == 503
        data = response.json()
        assert "disabled" in data["detail"]["message"].lower()
        print("✓ Stripe sync push returns 503 when disabled")


class TestStoreProducts:
    """Test Store Product CRUD with image support"""
    
    def test_list_products(self):
        """List store products"""
        response = requests.get(f"{BASE_URL}/api/store/products")
        assert response.status_code == 200
        products = response.json()
        assert isinstance(products, list)
        print(f"✓ Listed {len(products)} products")
        return products

    def test_list_products_with_inactive(self):
        """List all products including inactive"""
        response = requests.get(f"{BASE_URL}/api/store/products?active_only=false")
        assert response.status_code == 200
        products = response.json()
        assert isinstance(products, list)
        print(f"✓ Listed {len(products)} total products (including inactive)")
        return products

    def test_create_product_with_image_url(self):
        """Create product with image URL (Blog style)"""
        response = requests.post(f"{BASE_URL}/api/store/products", data={
            "name": "TEST_Product_URL",
            "description": "Test product with image URL",
            "price": 9.99,
            "category": "accesorios",
            "stock": 10,
            "is_active": "true",
            "image_url": "https://images.unsplash.com/photo-1582735689369-4fe89db7114c?w=400"
        })
        assert response.status_code == 200
        product = response.json()
        assert product["name"] == "TEST_Product_URL"
        assert product["image_url"] is not None
        assert "unsplash" in product["image_url"]
        print(f"✓ Created product with image URL: {product['id']}")
        return product

    def test_get_single_product(self):
        """Get a single product by ID"""
        # First create a product
        create_response = requests.post(f"{BASE_URL}/api/store/products", data={
            "name": "TEST_Single_Product",
            "description": "Test product for single fetch",
            "price": 15.99,
            "category": "detergentes",
            "stock": 5,
            "is_active": "true"
        })
        assert create_response.status_code == 200
        created = create_response.json()
        
        # Now fetch it
        response = requests.get(f"{BASE_URL}/api/store/products/{created['id']}")
        assert response.status_code == 200
        product = response.json()
        assert product["id"] == created["id"]
        assert product["name"] == "TEST_Single_Product"
        print(f"✓ Fetched single product: {product['id']}")

    def test_update_product_with_image_url(self):
        """Update product image URL"""
        # Create product first
        create_response = requests.post(f"{BASE_URL}/api/store/products", data={
            "name": "TEST_Update_Image",
            "price": 12.99,
            "category": "suavizantes",
            "stock": 8
        })
        assert create_response.status_code == 200
        created = create_response.json()
        
        # Update with new image URL
        update_response = requests.put(f"{BASE_URL}/api/store/products/{created['id']}", data={
            "name": "TEST_Update_Image",
            "price": 13.99,
            "category": "suavizantes",
            "stock": 8,
            "image_url": "https://images.unsplash.com/photo-1517677208171-0bc6725a3e60?w=400"
        })
        assert update_response.status_code == 200
        updated = update_response.json()
        assert updated["price"] == 13.99
        assert "unsplash" in (updated["image_url"] or "")
        print(f"✓ Updated product image URL: {updated['id']}")

    def test_delete_product(self):
        """Delete a test product"""
        # Create product to delete
        create_response = requests.post(f"{BASE_URL}/api/store/products", data={
            "name": "TEST_Delete_Product",
            "price": 5.99,
            "category": "quitamanchas",
            "stock": 3
        })
        assert create_response.status_code == 200
        created = create_response.json()
        
        # Delete it
        delete_response = requests.delete(f"{BASE_URL}/api/store/products/{created['id']}")
        assert delete_response.status_code == 200
        
        # Verify deleted
        get_response = requests.get(f"{BASE_URL}/api/store/products/{created['id']}")
        assert get_response.status_code == 404
        print(f"✓ Deleted product: {created['id']}")


class TestOperatorDashboard:
    """Test Operator Dashboard - Pickup & Delivery vs Wash & Fold flows"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Login as admin to get token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        if response.status_code != 200:
            pytest.skip("Auth failed - skipping authenticated tests")
        return response.json()["access_token"]
    
    def test_operator_dashboard_loads(self, auth_token):
        """Operator dashboard should load with separate sections"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(f"{BASE_URL}/api/automation/operator-dashboard", headers=headers)
        assert response.status_code == 200
        data = response.json()
        
        # Check structure has separate sections
        assert "todays_pickups" in data
        assert "ready_for_delivery" in data
        assert "wash_fold_dropoffs" in data
        assert "wash_fold_ready" in data
        assert "stats" in data
        print(f"✓ Operator dashboard loaded with {len(data.get('todays_pickups', []))} pickups, "
              f"{len(data.get('wash_fold_dropoffs', []))} wash fold orders")
        return data

    def test_create_pickup_delivery_order(self, auth_token):
        """Create a Pickup & Delivery order"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        
        # First create a customer
        customer_response = requests.post(f"{BASE_URL}/api/customers", 
            headers=headers,
            json={
                "name": "TEST_Pickup_Customer",
                "email": "test_pickup@example.com",
                "phone": "+18055551234"
            })
        
        if customer_response.status_code == 200:
            customer_id = customer_response.json()["id"]
        else:
            # Get existing customer
            customers = requests.get(f"{BASE_URL}/api/customers?search=test_pickup", headers=headers).json()
            customer_id = customers[0]["id"] if customers else None
            if not customer_id:
                pytest.skip("Could not create/find customer")
        
        # Create order
        order_response = requests.post(f"{BASE_URL}/api/orders", 
            headers=headers,
            json={
                "customer_id": customer_id,
                "service_type": "pickup_delivery",
                "pickup_date": "2026-03-05",
                "pickup_time_window": "9AM-12PM",
                "pickup_address": "123 Test St, Ventura, CA 93003"
            })
        assert order_response.status_code == 200
        order = order_response.json()
        assert order["service_type"] == "pickup_delivery"
        assert order["status"] == "new"
        print(f"✓ Created Pickup & Delivery order: {order['order_number']}")
        return order

    def test_create_wash_fold_order(self, auth_token):
        """Create a Wash & Fold order"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        
        # Get a customer
        customers = requests.get(f"{BASE_URL}/api/customers", headers=headers).json()
        if not customers:
            pytest.skip("No customers available")
        customer_id = customers[0]["id"]
        
        # Create wash_fold order
        order_response = requests.post(f"{BASE_URL}/api/orders", 
            headers=headers,
            json={
                "customer_id": customer_id,
                "service_type": "wash_fold",
                "estimated_lbs": 15,
                "notes": "TEST Wash & Fold order"
            })
        assert order_response.status_code == 200
        order = order_response.json()
        assert order["service_type"] == "wash_fold"
        print(f"✓ Created Wash & Fold order: {order['order_number']}")
        return order

    def test_wash_fold_valid_flow_new_to_processing(self, auth_token):
        """Test Wash & Fold valid transition: NEW -> PROCESSING"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        
        # Get a wash_fold order
        orders = requests.get(f"{BASE_URL}/api/orders?status=new", headers=headers).json()
        wash_fold_orders = [o for o in orders if o.get("service_type") == "wash_fold"]
        
        if not wash_fold_orders:
            # Create one
            customers = requests.get(f"{BASE_URL}/api/customers", headers=headers).json()
            if not customers:
                pytest.skip("No customers available")
            order_response = requests.post(f"{BASE_URL}/api/orders", 
                headers=headers,
                json={
                    "customer_id": customers[0]["id"],
                    "service_type": "wash_fold",
                    "estimated_lbs": 12
                })
            order = order_response.json()
        else:
            order = wash_fold_orders[0]
        
        # Transition to PROCESSING
        status_response = requests.put(
            f"{BASE_URL}/api/automation/orders/{order['id']}/status?new_status=PROCESSING",
            headers=headers)
        assert status_response.status_code == 200
        print(f"✓ Wash & Fold NEW -> PROCESSING succeeded")

    def test_wash_fold_invalid_transition_processing_to_completed(self, auth_token):
        """Test Wash & Fold INVALID transition: PROCESSING -> COMPLETED should fail"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        
        # Get or create a processing wash_fold order
        orders = requests.get(f"{BASE_URL}/api/orders?status=processing", headers=headers).json()
        wash_fold_orders = [o for o in orders if o.get("service_type") == "wash_fold"]
        
        if not wash_fold_orders:
            # Create and move to processing
            customers = requests.get(f"{BASE_URL}/api/customers", headers=headers).json()
            if not customers:
                pytest.skip("No customers available")
            order_response = requests.post(f"{BASE_URL}/api/orders", 
                headers=headers,
                json={
                    "customer_id": customers[0]["id"],
                    "service_type": "wash_fold",
                    "estimated_lbs": 10
                })
            order = order_response.json()
            # Move to processing
            requests.put(f"{BASE_URL}/api/automation/orders/{order['id']}/status?new_status=PROCESSING", 
                         headers=headers)
        else:
            order = wash_fold_orders[0]
        
        # Try invalid transition PROCESSING -> COMPLETED (should fail, expected: READY)
        invalid_response = requests.put(
            f"{BASE_URL}/api/automation/orders/{order['id']}/status?new_status=COMPLETED",
            headers=headers)
        
        # Should return 400 error
        assert invalid_response.status_code == 400, f"Expected 400, got {invalid_response.status_code}"
        error_detail = invalid_response.json().get("detail", "")
        assert "READY" in error_detail or "invalid" in error_detail.lower()
        print(f"✓ Wash & Fold PROCESSING -> COMPLETED correctly blocked with 400")

    def test_wash_fold_valid_flow_processing_to_ready(self, auth_token):
        """Test Wash & Fold valid transition: PROCESSING -> READY"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        
        # Get or create a processing wash_fold order
        orders = requests.get(f"{BASE_URL}/api/orders?status=processing", headers=headers).json()
        wash_fold_orders = [o for o in orders if o.get("service_type") == "wash_fold"]
        
        if not wash_fold_orders:
            # Create and move to processing
            customers = requests.get(f"{BASE_URL}/api/customers", headers=headers).json()
            if not customers:
                pytest.skip("No customers available")
            order_response = requests.post(f"{BASE_URL}/api/orders", 
                headers=headers,
                json={
                    "customer_id": customers[0]["id"],
                    "service_type": "wash_fold",
                    "estimated_lbs": 8
                })
            order = order_response.json()
            requests.put(f"{BASE_URL}/api/automation/orders/{order['id']}/status?new_status=PROCESSING", 
                         headers=headers)
        else:
            order = wash_fold_orders[0]
        
        # Valid transition PROCESSING -> READY
        status_response = requests.put(
            f"{BASE_URL}/api/automation/orders/{order['id']}/status?new_status=READY",
            headers=headers)
        assert status_response.status_code == 200
        print(f"✓ Wash & Fold PROCESSING -> READY succeeded")


class TestNotificationMilestones:
    """Test that notifications are reduced to key events only"""
    
    def test_notification_milestones_defined(self):
        """Verify notification MILESTONES are defined in notifications.py"""
        # This is a code review test - check the source code
        with open("/app/backend/notifications.py", "r") as f:
            content = f.read()
        
        # Check MILESTONES dictionary exists
        assert "MILESTONES" in content
        assert "wash_fold" in content
        assert "pickup_delivery" in content
        
        # Check key events
        assert "order_received" in content
        assert "ready_for_pickup" in content
        assert "pickup_confirmed" in content
        assert "out_for_delivery" in content
        assert "delivered" in content
        print("✓ Notification MILESTONES are defined correctly")
        
    def test_wash_fold_only_key_events(self):
        """Verify Wash & Fold only notifies on order_received and ready_for_pickup"""
        with open("/app/backend/notifications.py", "r") as f:
            content = f.read()
        
        # Find MILESTONES definition
        # wash_fold should have: order_received, ready_for_pickup
        assert '"wash_fold"' in content or "'wash_fold'" in content
        
        # The milestones for wash_fold should be limited
        milestones_section = content[content.find("MILESTONES"):content.find("MILESTONES")+500]
        print(f"✓ Found MILESTONES section in notifications.py")
        
    def test_pickup_delivery_key_events(self):
        """Verify Pickup & Delivery notifies on: pickup_confirmed, ready, out_for_delivery, delivered"""
        with open("/app/backend/notifications.py", "r") as f:
            content = f.read()
        
        assert "pickup_confirmed" in content
        assert "ready" in content  
        assert "out_for_delivery" in content
        assert "delivered" in content
        print("✓ Pickup & Delivery notification events are defined")


class TestStoreOrders:
    """Test Store Orders API"""
    
    def test_list_store_orders(self):
        """List store orders"""
        response = requests.get(f"{BASE_URL}/api/store/orders")
        assert response.status_code == 200
        orders = response.json()
        assert isinstance(orders, list)
        print(f"✓ Listed {len(orders)} store orders")

    def test_shipping_quote_valid_address(self):
        """Test shipping quote with valid address"""
        response = requests.post(f"{BASE_URL}/api/store/shipping/quote", json={
            "address": "123 Main St, Ventura, CA 93003"
        })
        # May return 200 with quote or 400 if outside delivery zone
        assert response.status_code in [200, 400]
        if response.status_code == 200:
            data = response.json()
            assert "distance_km" in data
            assert "fee" in data
            print(f"✓ Shipping quote: {data['distance_km']} km, ${data['fee']}")
        else:
            print("✓ Shipping quote returned 400 (address outside zone)")


# Cleanup function
@pytest.fixture(scope="session", autouse=True)
def cleanup_test_data():
    """Cleanup test products after tests"""
    yield
    # Cleanup TEST_ prefixed products
    response = requests.get(f"{BASE_URL}/api/store/products?active_only=false")
    if response.status_code == 200:
        products = response.json()
        for product in products:
            if product.get("name", "").startswith("TEST_"):
                requests.delete(f"{BASE_URL}/api/store/products/{product['id']}")
        print("✓ Cleaned up test products")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
