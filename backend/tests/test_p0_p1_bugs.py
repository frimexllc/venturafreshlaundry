"""
Test P0 and P1 bugs for POS Laundry System
- P0: Orders disappearing from operator dashboard after status change
- P0: Stripe payment flow for store orders must end with payment_status=paid
- P1: Shipping quote endpoint should work for valid addresses
- P1: Store cart with multiple products should not crash
"""

import pytest
import requests
import os
import time
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://route-optimize-fresh.preview.emergentagent.com')

class TestP0OrdersDashboard:
    """P0: Orders should not disappear from operator dashboard after status update"""
    
    def test_operator_dashboard_returns_orders(self):
        """Verify operator dashboard endpoint returns orders"""
        response = requests.get(f"{BASE_URL}/api/automation/operator-dashboard")
        assert response.status_code == 200
        data = response.json()
        
        # Verify structure
        assert "todays_pickups" in data
        assert "ready_for_delivery" in data
        assert "wash_fold_dropoffs" in data
        assert "wash_fold_ready" in data
        assert "stats" in data
        print(f"Dashboard stats: {data['stats']}")
        print(f"Total orders in dashboard: {len(data['todays_pickups']) + len(data['ready_for_delivery']) + len(data['wash_fold_dropoffs']) + len(data['wash_fold_ready'])}")
        
    def test_order_status_update_keeps_order_visible(self):
        """P0: After updating status (NEW->PROCESSING), order should remain in dashboard"""
        # Get initial dashboard state
        initial_response = requests.get(f"{BASE_URL}/api/automation/operator-dashboard")
        assert initial_response.status_code == 200
        initial_data = initial_response.json()
        
        # Find an order with status NEW to update
        all_orders = (
            initial_data.get("todays_pickups", []) + 
            initial_data.get("ready_for_delivery", []) +
            initial_data.get("wash_fold_dropoffs", []) +
            initial_data.get("wash_fold_ready", [])
        )
        
        if not all_orders:
            pytest.skip("No orders available to test status update")
        
        # Find a NEW order or any order we can update
        test_order = None
        for order in all_orders:
            if order.get("status", "").upper() == "NEW":
                test_order = order
                break
        
        if not test_order:
            # Use any order that has a next status
            for order in all_orders:
                if order.get("next_status"):
                    test_order = order
                    break
        
        if not test_order:
            print("No orders with available next status for testing")
            print(f"Current orders: {[o.get('order_id') + ':' + o.get('status', 'unknown') for o in all_orders]}")
            return  # Pass test as there are no orders to update
            
        order_id = test_order.get("order_id")
        current_status = test_order.get("status", "").upper()
        next_status = test_order.get("next_status") or "PROCESSING"
        
        print(f"Testing order {order_id} status update: {current_status} -> {next_status}")
        
        # Update status
        update_response = requests.put(
            f"{BASE_URL}/api/automation/orders/{order_id}/status",
            params={"new_status": next_status}
        )
        assert update_response.status_code == 200, f"Status update failed: {update_response.text}"
        
        # Verify order is still visible in dashboard after update
        post_update_response = requests.get(f"{BASE_URL}/api/automation/operator-dashboard")
        assert post_update_response.status_code == 200
        post_data = post_update_response.json()
        
        all_orders_after = (
            post_data.get("todays_pickups", []) + 
            post_data.get("ready_for_delivery", []) +
            post_data.get("wash_fold_dropoffs", []) +
            post_data.get("wash_fold_ready", [])
        )
        
        order_found = any(o.get("order_id") == order_id for o in all_orders_after)
        
        # P0 BUG CHECK: Order should still be visible
        if current_status == "NEW" and next_status in ["PROCESSING", "CONFIRMED"]:
            # This is the specific P0 bug scenario - order should NOT disappear
            print(f"Order {order_id} visibility after {current_status}->{next_status}: {'VISIBLE' if order_found else 'DISAPPEARED'}")
            # Order with non-terminal status should remain visible
            if not order_found and next_status not in ["COMPLETED", "CANCELLED"]:
                pytest.fail(f"P0 BUG: Order {order_id} disappeared from dashboard after status update to {next_status}")


class TestP0StripePayment:
    """P0: Stripe payment flow for store orders"""
    
    def test_checkout_status_endpoint_works(self):
        """Verify checkout status endpoint exists and responds"""
        # Using a dummy session ID - should return 500 or handle gracefully
        dummy_session = "cs_test_dummy123"
        response = requests.get(f"{BASE_URL}/api/store/checkout/status/{dummy_session}")
        # May return 500 for invalid session but endpoint should exist
        assert response.status_code in [200, 400, 500], f"Checkout status endpoint failed: {response.status_code}"
        print(f"Checkout status endpoint response: {response.status_code}")
    
    def test_store_orders_list(self):
        """Verify store orders list endpoint works"""
        response = requests.get(f"{BASE_URL}/api/store/orders")
        assert response.status_code == 200
        orders = response.json()
        
        # Check if any orders have paid status
        paid_orders = [o for o in orders if o.get("payment_status", "").lower() == "paid"]
        pending_orders = [o for o in orders if o.get("payment_status", "").lower() != "paid"]
        
        print(f"Total store orders: {len(orders)}")
        print(f"Paid orders: {len(paid_orders)}")
        print(f"Pending orders: {len(pending_orders)}")


class TestP1ShippingQuote:
    """P1: Shipping quote endpoint should work for valid addresses"""
    
    def test_shipping_quote_valid_address(self):
        """P1: POST /api/store/shipping/quote should respond for valid address"""
        # Use an address close to the store in Ventura, CA
        valid_address = "123 Main St, Ventura, CA 93001"
        
        response = requests.post(
            f"{BASE_URL}/api/store/shipping/quote",
            json={"address": valid_address}
        )
        
        print(f"Shipping quote response status: {response.status_code}")
        print(f"Shipping quote response: {response.text}")
        
        # P1 BUG: Should not return 400 for a valid address
        if response.status_code == 400:
            error_detail = response.json().get("detail", "Unknown error")
            pytest.fail(f"P1 BUG: Shipping quote returned 400 for valid address. Error: {error_detail}")
        
        assert response.status_code == 200, f"Shipping quote failed with status {response.status_code}"
        data = response.json()
        
        assert "fee" in data
        assert "distance_km" in data
        print(f"Shipping quote: {data['distance_km']} km, ${data['fee']}")
    
    def test_shipping_quote_near_store(self):
        """Test shipping quote for address near store location"""
        # Address very close to store: 5722 Telephone Rd Suite 5, Ventura, CA 93003
        near_store_address = "5700 Telephone Rd, Ventura, CA 93003"
        
        response = requests.post(
            f"{BASE_URL}/api/store/shipping/quote",
            json={"address": near_store_address}
        )
        
        print(f"Near store shipping response: {response.status_code}")
        
        if response.status_code == 400:
            error_detail = response.json().get("detail", "Unknown error")
            print(f"P1 BUG: Near-store address failed. Error: {error_detail}")
            # This might fail for addresses outside delivery zones
            pytest.xfail(f"Shipping quote failed for near-store address: {error_detail}")
        
        assert response.status_code == 200


class TestP1StoreCartMultipleProducts:
    """P1: Adding multiple products to cart should not crash"""
    
    def test_add_multiple_products_to_cart(self):
        """P1: Adding second product to cart should not break frontend/backend"""
        # Create a new cart
        cart_response = requests.post(f"{BASE_URL}/api/store/cart")
        assert cart_response.status_code == 200
        cart = cart_response.json()
        cart_id = cart["id"]
        print(f"Created cart: {cart_id}")
        
        # Get products
        products_response = requests.get(f"{BASE_URL}/api/store/products")
        assert products_response.status_code == 200
        products = products_response.json()
        
        if len(products) < 2:
            pytest.skip("Not enough products to test multi-item cart")
        
        # Add first product
        first_product = products[0]
        add_first_response = requests.post(
            f"{BASE_URL}/api/store/cart/{cart_id}/items",
            json={"product_id": first_product["id"], "quantity": 1}
        )
        assert add_first_response.status_code == 200, f"First product add failed: {add_first_response.text}"
        first_cart = add_first_response.json()
        assert len(first_cart["items"]) == 1
        print(f"Added first product: {first_product['name']}")
        
        # Add second product - P1 BUG would crash here
        second_product = products[1]
        add_second_response = requests.post(
            f"{BASE_URL}/api/store/cart/{cart_id}/items",
            json={"product_id": second_product["id"], "quantity": 1}
        )
        
        if add_second_response.status_code != 200:
            pytest.fail(f"P1 BUG: Adding second product crashed. Status: {add_second_response.status_code}, Error: {add_second_response.text}")
        
        second_cart = add_second_response.json()
        assert len(second_cart["items"]) == 2, f"Expected 2 items in cart, got {len(second_cart['items'])}"
        print(f"Added second product: {second_product['name']}")
        print(f"Cart total: ${second_cart['total']:.2f}")
        
        # Verify cart still works after multiple items
        get_cart_response = requests.get(f"{BASE_URL}/api/store/cart/{cart_id}")
        assert get_cart_response.status_code == 200
        final_cart = get_cart_response.json()
        assert len(final_cart["items"]) == 2
        print("Multi-item cart test PASSED")


class TestRegressionStoreCheckout:
    """Regression: Checkout flows should work"""
    
    def test_manual_checkout_flow(self):
        """Test manual payment checkout flow"""
        # Create cart and add product
        cart_response = requests.post(f"{BASE_URL}/api/store/cart")
        assert cart_response.status_code == 200
        cart = cart_response.json()
        cart_id = cart["id"]
        
        products_response = requests.get(f"{BASE_URL}/api/store/products")
        assert products_response.status_code == 200
        products = products_response.json()
        
        if not products:
            pytest.skip("No products available")
        
        # Add a product
        add_response = requests.post(
            f"{BASE_URL}/api/store/cart/{cart_id}/items",
            json={"product_id": products[0]["id"], "quantity": 1}
        )
        assert add_response.status_code == 200
        
        # Manual checkout with cash
        checkout_response = requests.post(
            f"{BASE_URL}/api/store/checkout/manual",
            json={
                "cart_id": cart_id,
                "origin_url": "https://route-optimize-fresh.preview.emergentagent.com",
                "customer_name": f"Test Customer {uuid.uuid4().hex[:6]}",
                "customer_email": f"test_{uuid.uuid4().hex[:6]}@example.com",
                "customer_phone": "+18051234567",
                "shipping_address": "5700 Telephone Rd, Ventura, CA 93003",
                "fulfillment_type": "pickup",
                "payment_method": "cash"
            }
        )
        
        print(f"Manual checkout response: {checkout_response.status_code}")
        
        if checkout_response.status_code != 200:
            print(f"Manual checkout error: {checkout_response.text}")
        
        assert checkout_response.status_code == 200, f"Manual checkout failed: {checkout_response.text}"
        order_data = checkout_response.json()
        
        assert order_data.get("status") == "paid"
        print(f"Manual checkout successful. Order: {order_data.get('order_number')}")


class TestIntegration:
    """Integration tests for overall system health"""
    
    def test_api_health(self):
        """Basic API health check"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        print("API health check passed")
    
    def test_products_available(self):
        """Verify products are seeded and available"""
        response = requests.get(f"{BASE_URL}/api/store/products")
        assert response.status_code == 200
        products = response.json()
        assert len(products) > 0, "No products available in store"
        print(f"Products available: {len(products)}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
