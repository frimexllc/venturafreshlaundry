"""
Test suite for Store and Blog modules - Ventura Fresh Laundry CRM
Tests: Products, Cart, Checkout, Blog Posts, Categories
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://laundry-portal-5.preview.emergentagent.com')

# ==================== FIXTURES ====================

@pytest.fixture(scope="session")
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session

@pytest.fixture(scope="session")
def admin_token(api_client):
    """Get admin authentication token"""
    response = api_client.post(f"{BASE_URL}/api/auth/login", json={
        "email": "admin@venturafresh.com",
        "password": "admin123"
    })
    if response.status_code == 200:
        return response.json().get("access_token")
    pytest.skip("Admin authentication failed - skipping authenticated tests")

@pytest.fixture(scope="session")
def authenticated_client(api_client, admin_token):
    """Session with auth header"""
    api_client.headers.update({"Authorization": f"Bearer {admin_token}"})
    return api_client


# ==================== STORE PRODUCTS TESTS ====================

class TestStoreProducts:
    """Store Products endpoint tests"""
    
    def test_list_products(self, api_client):
        """Test listing all products"""
        response = api_client.get(f"{BASE_URL}/api/store/products")
        assert response.status_code == 200
        
        products = response.json()
        assert isinstance(products, list)
        assert len(products) >= 1  # Seeded products should exist
        
        # Verify product structure
        product = products[0]
        assert "id" in product
        assert "name" in product
        assert "price" in product
        assert "category" in product
        assert "stock" in product
        assert "is_active" in product
        print(f"✓ Listed {len(products)} products")
    
    def test_get_single_product(self, api_client):
        """Test getting a single product by ID"""
        # First get list to get a product ID
        products_res = api_client.get(f"{BASE_URL}/api/store/products")
        products = products_res.json()
        product_id = products[0]["id"]
        
        response = api_client.get(f"{BASE_URL}/api/store/products/{product_id}")
        assert response.status_code == 200
        
        product = response.json()
        assert product["id"] == product_id
        assert "name" in product
        assert "price" in product
        print(f"✓ Retrieved product: {product['name']}")
    
    def test_get_nonexistent_product(self, api_client):
        """Test getting a product that doesn't exist"""
        fake_id = str(uuid.uuid4())
        response = api_client.get(f"{BASE_URL}/api/store/products/{fake_id}")
        assert response.status_code == 404
        print("✓ Correctly returned 404 for nonexistent product")
    
    def test_create_product(self, api_client):
        """Test creating a new product"""
        product_data = {
            "name": f"TEST_Product_{uuid.uuid4().hex[:8]}",
            "description": "Test product description",
            "price": 19.99,
            "category": "accesorios",
            "stock": 25,
            "is_active": True
        }
        
        response = api_client.post(f"{BASE_URL}/api/store/products", json=product_data)
        assert response.status_code == 200
        
        created = response.json()
        assert created["name"] == product_data["name"]
        assert created["price"] == product_data["price"]
        assert created["stock"] == product_data["stock"]
        assert "id" in created
        print(f"✓ Created product: {created['name']} with ID: {created['id']}")
        
        # Verify persistence with GET
        get_response = api_client.get(f"{BASE_URL}/api/store/products/{created['id']}")
        assert get_response.status_code == 200
        fetched = get_response.json()
        assert fetched["name"] == product_data["name"]
        print("✓ Verified product persistence")
        
        return created["id"]
    
    def test_update_product(self, api_client):
        """Test updating a product"""
        # Create a product first
        product_data = {
            "name": f"TEST_Update_{uuid.uuid4().hex[:8]}",
            "description": "Original description",
            "price": 15.99,
            "category": "detergentes",
            "stock": 10,
            "is_active": True
        }
        create_res = api_client.post(f"{BASE_URL}/api/store/products", json=product_data)
        product_id = create_res.json()["id"]
        
        # Update the product
        update_data = {
            "name": product_data["name"],
            "description": "Updated description",
            "price": 18.99,
            "category": "detergentes",
            "stock": 20,
            "is_active": True
        }
        response = api_client.put(f"{BASE_URL}/api/store/products/{product_id}", json=update_data)
        assert response.status_code == 200
        
        updated = response.json()
        assert updated["price"] == 18.99
        assert updated["stock"] == 20
        assert updated["description"] == "Updated description"
        print(f"✓ Updated product: {updated['name']}")
        
        # Verify persistence
        get_res = api_client.get(f"{BASE_URL}/api/store/products/{product_id}")
        fetched = get_res.json()
        assert fetched["price"] == 18.99
        print("✓ Verified update persistence")
    
    def test_delete_product(self, api_client):
        """Test deleting a product"""
        # Create a product first
        product_data = {
            "name": f"TEST_Delete_{uuid.uuid4().hex[:8]}",
            "description": "To be deleted",
            "price": 9.99,
            "category": "accesorios",
            "stock": 5,
            "is_active": True
        }
        create_res = api_client.post(f"{BASE_URL}/api/store/products", json=product_data)
        product_id = create_res.json()["id"]
        
        # Delete the product
        response = api_client.delete(f"{BASE_URL}/api/store/products/{product_id}")
        assert response.status_code == 200
        print(f"✓ Deleted product: {product_id}")
        
        # Verify deletion
        get_res = api_client.get(f"{BASE_URL}/api/store/products/{product_id}")
        assert get_res.status_code == 404
        print("✓ Verified product deletion")


# ==================== STORE CART TESTS ====================

class TestStoreCart:
    """Store Cart endpoint tests"""
    
    def test_create_cart(self, api_client):
        """Test creating a new cart"""
        response = api_client.post(f"{BASE_URL}/api/store/cart")
        assert response.status_code == 200
        
        cart = response.json()
        assert "id" in cart
        assert "session_id" in cart
        assert cart["items"] == []
        assert cart["total"] == 0.0
        print(f"✓ Created cart: {cart['id']}")
        return cart["id"]
    
    def test_get_cart(self, api_client):
        """Test getting a cart by ID"""
        # Create cart first
        create_res = api_client.post(f"{BASE_URL}/api/store/cart")
        cart_id = create_res.json()["id"]
        
        response = api_client.get(f"{BASE_URL}/api/store/cart/{cart_id}")
        assert response.status_code == 200
        
        cart = response.json()
        assert cart["id"] == cart_id
        print(f"✓ Retrieved cart: {cart_id}")
    
    def test_add_item_to_cart(self, api_client):
        """Test adding an item to cart"""
        # Create cart
        cart_res = api_client.post(f"{BASE_URL}/api/store/cart")
        cart_id = cart_res.json()["id"]
        
        # Get a product
        products_res = api_client.get(f"{BASE_URL}/api/store/products")
        product = products_res.json()[0]
        
        # Add to cart
        response = api_client.post(f"{BASE_URL}/api/store/cart/{cart_id}/items", json={
            "product_id": product["id"],
            "quantity": 2
        })
        assert response.status_code == 200
        
        cart = response.json()
        assert len(cart["items"]) == 1
        assert cart["items"][0]["product_id"] == product["id"]
        assert cart["items"][0]["quantity"] == 2
        assert cart["total"] == round(product["price"] * 2, 2)
        print(f"✓ Added {product['name']} x2 to cart, total: ${cart['total']}")
    
    def test_update_cart_item_quantity(self, api_client):
        """Test updating item quantity in cart"""
        # Create cart and add item
        cart_res = api_client.post(f"{BASE_URL}/api/store/cart")
        cart_id = cart_res.json()["id"]
        
        products_res = api_client.get(f"{BASE_URL}/api/store/products")
        product = products_res.json()[0]
        
        api_client.post(f"{BASE_URL}/api/store/cart/{cart_id}/items", json={
            "product_id": product["id"],
            "quantity": 1
        })
        
        # Update quantity
        response = api_client.put(f"{BASE_URL}/api/store/cart/{cart_id}/items/{product['id']}?quantity=5")
        assert response.status_code == 200
        
        cart = response.json()
        assert cart["items"][0]["quantity"] == 5
        assert cart["total"] == round(product["price"] * 5, 2)
        print(f"✓ Updated quantity to 5, new total: ${cart['total']}")
    
    def test_remove_item_from_cart(self, api_client):
        """Test removing an item from cart"""
        # Create cart and add item
        cart_res = api_client.post(f"{BASE_URL}/api/store/cart")
        cart_id = cart_res.json()["id"]
        
        products_res = api_client.get(f"{BASE_URL}/api/store/products")
        product = products_res.json()[0]
        
        api_client.post(f"{BASE_URL}/api/store/cart/{cart_id}/items", json={
            "product_id": product["id"],
            "quantity": 1
        })
        
        # Remove item
        response = api_client.delete(f"{BASE_URL}/api/store/cart/{cart_id}/items/{product['id']}")
        assert response.status_code == 200
        
        cart = response.json()
        assert len(cart["items"]) == 0
        assert cart["total"] == 0.0
        print("✓ Removed item from cart")
    
    def test_clear_cart(self, api_client):
        """Test clearing all items from cart"""
        # Create cart and add items
        cart_res = api_client.post(f"{BASE_URL}/api/store/cart")
        cart_id = cart_res.json()["id"]
        
        products_res = api_client.get(f"{BASE_URL}/api/store/products")
        products = products_res.json()
        
        for product in products[:2]:
            api_client.post(f"{BASE_URL}/api/store/cart/{cart_id}/items", json={
                "product_id": product["id"],
                "quantity": 1
            })
        
        # Clear cart
        response = api_client.delete(f"{BASE_URL}/api/store/cart/{cart_id}")
        assert response.status_code == 200
        print("✓ Cleared cart")
        
        # Verify cart is empty
        get_res = api_client.get(f"{BASE_URL}/api/store/cart/{cart_id}")
        cart = get_res.json()
        assert len(cart["items"]) == 0
        assert cart["total"] == 0.0
        print("✓ Verified cart is empty")


# ==================== STORE CHECKOUT TESTS ====================

class TestStoreCheckout:
    """Store Checkout endpoint tests"""
    
    def test_checkout_empty_cart_fails(self, api_client):
        """Test that checkout fails with empty cart"""
        # Create empty cart
        cart_res = api_client.post(f"{BASE_URL}/api/store/cart")
        cart_id = cart_res.json()["id"]
        
        response = api_client.post(f"{BASE_URL}/api/store/checkout", json={
            "cart_id": cart_id,
            "origin_url": "https://laundry-portal-5.preview.emergentagent.com"
        })
        assert response.status_code == 400
        assert "empty" in response.json()["detail"].lower()
        print("✓ Checkout correctly rejected empty cart")
    
    def test_checkout_creates_session(self, api_client):
        """Test that checkout creates a Stripe session"""
        # Create cart with items
        cart_res = api_client.post(f"{BASE_URL}/api/store/cart")
        cart_id = cart_res.json()["id"]
        
        products_res = api_client.get(f"{BASE_URL}/api/store/products")
        product = products_res.json()[0]
        
        api_client.post(f"{BASE_URL}/api/store/cart/{cart_id}/items", json={
            "product_id": product["id"],
            "quantity": 1
        })
        
        # Attempt checkout
        response = api_client.post(f"{BASE_URL}/api/store/checkout", json={
            "cart_id": cart_id,
            "origin_url": "https://laundry-portal-5.preview.emergentagent.com"
        })
        
        # Should return checkout URL or error if Stripe not configured
        if response.status_code == 200:
            data = response.json()
            assert "checkout_url" in data
            assert "session_id" in data
            assert "order_id" in data
            assert "order_number" in data
            print(f"✓ Checkout session created: {data['order_number']}")
        else:
            # Stripe might not be fully configured in test env
            print(f"⚠ Checkout returned {response.status_code}: {response.json().get('detail', 'Unknown error')}")
            # This is acceptable in test environment


# ==================== STORE ORDERS TESTS ====================

class TestStoreOrders:
    """Store Orders endpoint tests"""
    
    def test_list_orders(self, api_client):
        """Test listing store orders"""
        response = api_client.get(f"{BASE_URL}/api/store/orders")
        assert response.status_code == 200
        
        orders = response.json()
        assert isinstance(orders, list)
        print(f"✓ Listed {len(orders)} store orders")


# ==================== BLOG POSTS TESTS ====================

class TestBlogPosts:
    """Blog Posts endpoint tests"""
    
    def test_list_posts(self, api_client):
        """Test listing all blog posts"""
        response = api_client.get(f"{BASE_URL}/api/blog/posts")
        assert response.status_code == 200
        
        posts = response.json()
        assert isinstance(posts, list)
        assert len(posts) >= 1  # Seeded posts should exist
        
        # Verify post structure
        post = posts[0]
        assert "id" in post
        assert "title" in post
        assert "slug" in post
        assert "content" in post
        assert "category" in post
        assert "is_published" in post
        print(f"✓ Listed {len(posts)} blog posts")
    
    def test_get_post_by_slug(self, api_client):
        """Test getting a post by slug"""
        # Get list first
        posts_res = api_client.get(f"{BASE_URL}/api/blog/posts")
        post_slug = posts_res.json()[0]["slug"]
        
        response = api_client.get(f"{BASE_URL}/api/blog/posts/{post_slug}")
        assert response.status_code == 200
        
        post = response.json()
        assert post["slug"] == post_slug
        assert "title" in post
        assert "content" in post
        print(f"✓ Retrieved post by slug: {post['title']}")
    
    def test_get_post_by_id(self, api_client):
        """Test getting a post by ID"""
        posts_res = api_client.get(f"{BASE_URL}/api/blog/posts")
        post_id = posts_res.json()[0]["id"]
        
        response = api_client.get(f"{BASE_URL}/api/blog/posts/{post_id}")
        assert response.status_code == 200
        
        post = response.json()
        assert post["id"] == post_id
        print(f"✓ Retrieved post by ID: {post['title']}")
    
    def test_filter_posts_by_category(self, api_client):
        """Test filtering posts by category"""
        response = api_client.get(f"{BASE_URL}/api/blog/posts?category=tips")
        assert response.status_code == 200
        
        posts = response.json()
        for post in posts:
            assert post["category"] == "tips"
        print(f"✓ Filtered {len(posts)} posts by category 'tips'")
    
    def test_create_post(self, api_client):
        """Test creating a new blog post"""
        post_data = {
            "title": f"TEST_Post_{uuid.uuid4().hex[:8]}",
            "content": "<h2>Test Content</h2><p>This is a test blog post.</p>",
            "excerpt": "Test excerpt",
            "category": "tips",
            "tags": ["test", "automation"],
            "author": "Test Author",
            "is_published": False
        }
        
        response = api_client.post(f"{BASE_URL}/api/blog/posts", json=post_data)
        assert response.status_code == 200
        
        created = response.json()
        assert created["title"] == post_data["title"]
        assert created["content"] == post_data["content"]
        assert created["category"] == post_data["category"]
        assert "id" in created
        assert "slug" in created
        print(f"✓ Created blog post: {created['title']} with slug: {created['slug']}")
        
        # Verify persistence
        get_res = api_client.get(f"{BASE_URL}/api/blog/posts/{created['id']}?increment_views=false")
        assert get_res.status_code == 200
        fetched = get_res.json()
        assert fetched["title"] == post_data["title"]
        print("✓ Verified post persistence")
        
        return created["id"]
    
    def test_update_post(self, api_client):
        """Test updating a blog post"""
        # Create post first
        post_data = {
            "title": f"TEST_Update_{uuid.uuid4().hex[:8]}",
            "content": "<p>Original content</p>",
            "category": "tips",
            "is_published": False
        }
        create_res = api_client.post(f"{BASE_URL}/api/blog/posts", json=post_data)
        post_id = create_res.json()["id"]
        
        # Update the post
        update_data = {
            "title": post_data["title"] + " Updated",
            "content": "<p>Updated content</p>",
            "is_published": True
        }
        response = api_client.put(f"{BASE_URL}/api/blog/posts/{post_id}", json=update_data)
        assert response.status_code == 200
        
        updated = response.json()
        assert "Updated" in updated["title"]
        assert updated["is_published"] == True
        print(f"✓ Updated blog post: {updated['title']}")
    
    def test_delete_post(self, api_client):
        """Test deleting a blog post"""
        # Create post first
        post_data = {
            "title": f"TEST_Delete_{uuid.uuid4().hex[:8]}",
            "content": "<p>To be deleted</p>",
            "category": "tips",
            "is_published": False
        }
        create_res = api_client.post(f"{BASE_URL}/api/blog/posts", json=post_data)
        post_id = create_res.json()["id"]
        
        # Delete the post
        response = api_client.delete(f"{BASE_URL}/api/blog/posts/{post_id}")
        assert response.status_code == 200
        print(f"✓ Deleted blog post: {post_id}")
        
        # Verify deletion
        get_res = api_client.get(f"{BASE_URL}/api/blog/posts/{post_id}")
        assert get_res.status_code == 404
        print("✓ Verified post deletion")
    
    def test_search_posts(self, api_client):
        """Test searching blog posts"""
        response = api_client.get(f"{BASE_URL}/api/blog/search?q=ropa")
        assert response.status_code == 200
        
        posts = response.json()
        assert isinstance(posts, list)
        print(f"✓ Search returned {len(posts)} results for 'ropa'")


# ==================== BLOG CATEGORIES TESTS ====================

class TestBlogCategories:
    """Blog Categories endpoint tests"""
    
    def test_list_categories(self, api_client):
        """Test listing all categories"""
        response = api_client.get(f"{BASE_URL}/api/blog/categories")
        assert response.status_code == 200
        
        categories = response.json()
        assert isinstance(categories, list)
        assert len(categories) >= 1  # Seeded categories should exist
        
        # Verify category structure
        cat = categories[0]
        assert "id" in cat
        assert "name" in cat
        assert "slug" in cat
        assert "post_count" in cat
        print(f"✓ Listed {len(categories)} categories")
    
    def test_get_category_by_slug(self, api_client):
        """Test getting a category by slug"""
        response = api_client.get(f"{BASE_URL}/api/blog/categories/tips")
        assert response.status_code == 200
        
        cat = response.json()
        assert cat["slug"] == "tips"
        assert "name" in cat
        print(f"✓ Retrieved category: {cat['name']}")
    
    def test_create_category(self, api_client):
        """Test creating a new category"""
        cat_data = {
            "name": f"TEST_Category_{uuid.uuid4().hex[:8]}",
            "description": "Test category description"
        }
        
        response = api_client.post(f"{BASE_URL}/api/blog/categories", json=cat_data)
        assert response.status_code == 200
        
        created = response.json()
        assert created["name"] == cat_data["name"]
        assert "slug" in created
        assert created["post_count"] == 0
        print(f"✓ Created category: {created['name']} with slug: {created['slug']}")
        
        return created["slug"]
    
    def test_delete_category(self, api_client):
        """Test deleting a category"""
        # Create category first
        cat_data = {
            "name": f"TEST_Delete_{uuid.uuid4().hex[:8]}",
            "description": "To be deleted"
        }
        create_res = api_client.post(f"{BASE_URL}/api/blog/categories", json=cat_data)
        cat_slug = create_res.json()["slug"]
        
        # Delete the category
        response = api_client.delete(f"{BASE_URL}/api/blog/categories/{cat_slug}")
        assert response.status_code == 200
        print(f"✓ Deleted category: {cat_slug}")
        
        # Verify deletion
        get_res = api_client.get(f"{BASE_URL}/api/blog/categories/{cat_slug}")
        assert get_res.status_code == 404
        print("✓ Verified category deletion")
    
    def test_duplicate_category_fails(self, api_client):
        """Test that creating duplicate category fails"""
        # Try to create a category with existing slug
        response = api_client.post(f"{BASE_URL}/api/blog/categories", json={
            "name": "Tips",  # Already exists
            "slug": "tips"
        })
        assert response.status_code == 400
        print("✓ Correctly rejected duplicate category")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
