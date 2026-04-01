"""
Test suite for Enterprise Modules: Suppliers, Catalog, Inventory, Finances
Tests CRUD operations and API endpoints for the new enterprise features.
"""
import pytest
import requests
import os
import uuid
from datetime import datetime

ADMIN_EMAIL = os.environ.get("TEST_ADMIN_EMAIL", "owner@frimexllc.com")
ADMIN_PASSWORD = os.environ.get("TEST_ADMIN_PASSWORD", "admin123")

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://ventura-deploy-test.preview.emergentagent.com')

# Test credentials
TEST_EMAIL = os.environ.get("TEST_ADMIN_EMAIL", "owner@frimexllc.com")
TEST_PASSWORD = "Fr!m3x##$$"


class TestAuth:
    """Authentication tests"""
    
    def test_login_success(self):
        """Test admin login with valid credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "access_token" in data
        assert data["user"]["email"] == TEST_EMAIL
        assert data["user"]["role"] == "admin"
        print(f"✓ Login successful for {TEST_EMAIL}")


@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token for tests"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": TEST_EMAIL,
        "password": TEST_PASSWORD
    })
    if response.status_code == 200:
        return response.json().get("access_token")
    pytest.skip("Authentication failed")


@pytest.fixture
def auth_headers(auth_token):
    """Headers with auth token"""
    return {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {auth_token}"
    }


# ── Catalog Tests (Public endpoint) ──────────────────────────────────

class TestCatalog:
    """Catalog API tests - authorized product catalog"""
    
    def test_get_catalog_public(self):
        """Test GET /api/catalog - public endpoint"""
        response = requests.get(f"{BASE_URL}/api/catalog")
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        assert len(data) > 0, "Catalog should have items"
        # Check for expected products
        names = [item["name"] for item in data]
        assert "Tide" in names, "Tide should be in catalog"
        assert "Gain" in names, "Gain should be in catalog"
        print(f"✓ Catalog has {len(data)} products")
    
    def test_get_catalog_by_category(self):
        """Test GET /api/catalog?category=detergent"""
        response = requests.get(f"{BASE_URL}/api/catalog?category=detergent")
        assert response.status_code == 200
        data = response.json()
        assert all(item["category"] == "detergent" for item in data)
        print(f"✓ Filtered catalog: {len(data)} detergents")
    
    def test_get_catalog_grouped(self):
        """Test GET /api/catalog/grouped"""
        response = requests.get(f"{BASE_URL}/api/catalog/grouped")
        assert response.status_code == 200
        data = response.json()
        assert "detergent" in data
        assert "softener" in data
        assert "bleach" in data
        print(f"✓ Grouped catalog has {len(data)} categories")
    
    def test_add_catalog_item(self, auth_headers):
        """Test POST /api/catalog - add new product"""
        test_name = f"TEST_Product_{uuid.uuid4().hex[:6]}"
        response = requests.post(f"{BASE_URL}/api/catalog", headers=auth_headers, json={
            "name": test_name,
            "category": "detergent",
            "brand": "Test Brand",
            "price": 9.99,
            "in_stock": True
        })
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert data["name"] == test_name
        assert data["category"] == "detergent"
        print(f"✓ Created catalog item: {test_name}")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/catalog/{data['id']}", headers=auth_headers)
    
    def test_seed_catalog(self, auth_headers):
        """Test POST /api/catalog/seed - reset to defaults"""
        response = requests.post(f"{BASE_URL}/api/catalog/seed", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["ok"] == True
        assert data["count"] > 0
        print(f"✓ Catalog seeded with {data['count']} items")


# ── Suppliers Tests ──────────────────────────────────────────────────

class TestSuppliers:
    """Suppliers API tests - vendor management"""
    
    def test_get_suppliers(self, auth_headers):
        """Test GET /api/suppliers"""
        response = requests.get(f"{BASE_URL}/api/suppliers", headers=auth_headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Got {len(data)} suppliers")
    
    def test_get_supplier_categories(self, auth_headers):
        """Test GET /api/suppliers/categories"""
        response = requests.get(f"{BASE_URL}/api/suppliers/categories", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert "categories" in data
        assert "chemicals" in data["categories"]
        assert "packaging" in data["categories"]
        print(f"✓ Got {len(data['categories'])} supplier categories")
    
    def test_create_supplier(self, auth_headers):
        """Test POST /api/suppliers - create new supplier"""
        test_name = f"TEST_Supplier_{uuid.uuid4().hex[:6]}"
        response = requests.post(f"{BASE_URL}/api/suppliers", headers=auth_headers, json={
            "name": test_name,
            "contact_name": "Test Contact",
            "email": "test@supplier.com",
            "phone": "555-1234",
            "category": "chemicals",
            "products_services": ["Detergent", "Softener"]
        })
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert data["name"] == test_name
        assert data["category"] == "chemicals"
        supplier_id = data["id"]
        print(f"✓ Created supplier: {test_name}")
        
        # Verify GET by ID
        get_response = requests.get(f"{BASE_URL}/api/suppliers/{supplier_id}", headers=auth_headers)
        assert get_response.status_code == 200
        assert get_response.json()["name"] == test_name
        print(f"✓ Verified supplier GET by ID")
        
        # Update supplier
        update_response = requests.put(f"{BASE_URL}/api/suppliers/{supplier_id}", headers=auth_headers, json={
            "name": test_name,
            "contact_name": "Updated Contact",
            "email": "updated@supplier.com",
            "phone": "555-5678",
            "category": "packaging"
        })
        assert update_response.status_code == 200
        assert update_response.json()["contact_name"] == "Updated Contact"
        print(f"✓ Updated supplier")
        
        # Delete supplier
        del_response = requests.delete(f"{BASE_URL}/api/suppliers/{supplier_id}", headers=auth_headers)
        assert del_response.status_code == 200
        print(f"✓ Deleted supplier")
    
    def test_search_suppliers(self, auth_headers):
        """Test GET /api/suppliers?search=..."""
        # Create a supplier first
        test_name = f"TEST_SearchSupplier_{uuid.uuid4().hex[:6]}"
        create_resp = requests.post(f"{BASE_URL}/api/suppliers", headers=auth_headers, json={
            "name": test_name,
            "category": "general"
        })
        supplier_id = create_resp.json()["id"]
        
        # Search for it
        search_resp = requests.get(f"{BASE_URL}/api/suppliers?search={test_name[:10]}", headers=auth_headers)
        assert search_resp.status_code == 200
        results = search_resp.json()
        assert any(s["name"] == test_name for s in results)
        print(f"✓ Search found supplier")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/suppliers/{supplier_id}", headers=auth_headers)


# ── Inventory Tests ──────────────────────────────────────────────────

class TestInventory:
    """Inventory API tests - stock tracking"""
    
    def test_get_stock(self, auth_headers):
        """Test GET /api/inventory/stock"""
        response = requests.get(f"{BASE_URL}/api/inventory/stock", headers=auth_headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Got {len(data)} stock items")
    
    def test_get_low_stock(self, auth_headers):
        """Test GET /api/inventory/low-stock"""
        response = requests.get(f"{BASE_URL}/api/inventory/low-stock", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Got {len(data)} low stock items")
    
    def test_create_stock_movement(self, auth_headers):
        """Test POST /api/inventory/stock/movement"""
        test_product = f"TEST_Product_{uuid.uuid4().hex[:6]}"
        response = requests.post(f"{BASE_URL}/api/inventory/stock/movement", headers=auth_headers, json={
            "product_name": test_product,
            "category": "detergent",
            "quantity": 10,
            "movement_type": "in",
            "reason": "Test purchase"
        })
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert data["product_name"] == test_product
        assert data["quantity"] == 10
        assert data["movement_type"] == "in"
        print(f"✓ Created stock movement for {test_product}")
        
        # Verify stock was updated
        stock_resp = requests.get(f"{BASE_URL}/api/inventory/stock", headers=auth_headers)
        stock_items = stock_resp.json()
        test_item = next((i for i in stock_items if i["name"] == test_product), None)
        assert test_item is not None, "Stock item should exist"
        assert test_item["quantity"] == 10
        print(f"✓ Verified stock quantity")
    
    def test_get_stock_movements(self, auth_headers):
        """Test GET /api/inventory/stock/movements"""
        response = requests.get(f"{BASE_URL}/api/inventory/stock/movements", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Got {len(data)} stock movements")
    
    def test_create_purchase_order(self, auth_headers):
        """Test POST /api/inventory/purchase-orders"""
        # First create a supplier
        supplier_name = f"TEST_POSupplier_{uuid.uuid4().hex[:6]}"
        supplier_resp = requests.post(f"{BASE_URL}/api/suppliers", headers=auth_headers, json={
            "name": supplier_name,
            "category": "chemicals"
        })
        supplier_id = supplier_resp.json()["id"]
        
        # Create purchase order
        response = requests.post(f"{BASE_URL}/api/inventory/purchase-orders", headers=auth_headers, json={
            "supplier_id": supplier_id,
            "supplier_name": supplier_name,
            "items": [
                {"name": "Tide", "quantity": 10, "unit_price": 15.99},
                {"name": "Gain", "quantity": 5, "unit_price": 12.99}
            ],
            "total": 224.85,
            "notes": "Test order"
        })
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert "po_number" in data
        assert data["supplier_id"] == supplier_id
        po_id = data["id"]
        print(f"✓ Created purchase order: {data['po_number']}")
        
        # Update PO status
        status_resp = requests.put(f"{BASE_URL}/api/inventory/purchase-orders/{po_id}/status", 
                                   headers=auth_headers, json={"status": "approved"})
        assert status_resp.status_code == 200
        print(f"✓ Updated PO status to approved")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/suppliers/{supplier_id}", headers=auth_headers)
    
    def test_get_purchase_orders(self, auth_headers):
        """Test GET /api/inventory/purchase-orders"""
        response = requests.get(f"{BASE_URL}/api/inventory/purchase-orders", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Got {len(data)} purchase orders")


# ── Finances Tests ───────────────────────────────────────────────────

class TestFinances:
    """Finances API tests - expenses, mileage, vehicles"""
    
    def test_get_dashboard(self, auth_headers):
        """Test GET /api/finances/dashboard"""
        response = requests.get(f"{BASE_URL}/api/finances/dashboard?period=month", headers=auth_headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert "revenue" in data
        assert "total_expenses" in data
        assert "net_income" in data
        assert "mileage" in data
        print(f"✓ Dashboard: Revenue=${data['revenue']}, Expenses=${data['total_expenses']}, Net=${data['net_income']}")
    
    def test_get_expense_categories(self, auth_headers):
        """Test GET /api/finances/categories"""
        response = requests.get(f"{BASE_URL}/api/finances/categories", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) > 0
        print(f"✓ Got {len(data)} expense categories")
    
    def test_create_expense(self, auth_headers):
        """Test POST /api/finances/expenses"""
        response = requests.post(f"{BASE_URL}/api/finances/expenses", headers=auth_headers, json={
            "date": datetime.now().strftime("%Y-%m-%d"),
            "category": "Suministros de Lavado",
            "description": f"TEST_Expense_{uuid.uuid4().hex[:6]}",
            "amount": 99.99,
            "expense_type": "variable",
            "vendor": "Test Vendor",
            "payment_method": "card"
        })
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert data["amount"] == 99.99
        expense_id = data["id"]
        print(f"✓ Created expense: ${data['amount']}")
        
        # Verify GET
        get_resp = requests.get(f"{BASE_URL}/api/finances/expenses/{expense_id}", headers=auth_headers)
        assert get_resp.status_code == 200
        print(f"✓ Verified expense GET")
        
        # Update expense
        update_resp = requests.put(f"{BASE_URL}/api/finances/expenses/{expense_id}", headers=auth_headers, json={
            "date": datetime.now().strftime("%Y-%m-%d"),
            "category": "Suministros de Lavado",
            "description": "Updated Test Expense",
            "amount": 149.99,
            "expense_type": "fixed",
            "vendor": "Updated Vendor",
            "payment_method": "cash"
        })
        assert update_resp.status_code == 200
        assert update_resp.json()["amount"] == 149.99
        print(f"✓ Updated expense")
        
        # Delete expense
        del_resp = requests.delete(f"{BASE_URL}/api/finances/expenses/{expense_id}", headers=auth_headers)
        assert del_resp.status_code == 200
        print(f"✓ Deleted expense")
    
    def test_get_expenses(self, auth_headers):
        """Test GET /api/finances/expenses"""
        response = requests.get(f"{BASE_URL}/api/finances/expenses", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Got {len(data)} expenses")
    
    def test_create_vehicle(self, auth_headers):
        """Test POST /api/finances/vehicles"""
        test_name = f"TEST_Vehicle_{uuid.uuid4().hex[:6]}"
        response = requests.post(f"{BASE_URL}/api/finances/vehicles", headers=auth_headers, json={
            "name": test_name,
            "plate": "TEST123",
            "make": "Ford",
            "model": "Transit",
            "year": 2024,
            "status": "active"
        })
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert data["name"] == test_name
        vehicle_id = data["id"]
        print(f"✓ Created vehicle: {test_name}")
        
        # Delete vehicle
        del_resp = requests.delete(f"{BASE_URL}/api/finances/vehicles/{vehicle_id}", headers=auth_headers)
        assert del_resp.status_code == 200
        print(f"✓ Deleted vehicle")
    
    def test_get_vehicles(self, auth_headers):
        """Test GET /api/finances/vehicles"""
        response = requests.get(f"{BASE_URL}/api/finances/vehicles", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Got {len(data)} vehicles")
    
    def test_create_mileage(self, auth_headers):
        """Test POST /api/finances/mileage"""
        response = requests.post(f"{BASE_URL}/api/finances/mileage", headers=auth_headers, json={
            "date": datetime.now().strftime("%Y-%m-%d"),
            "driver_name": "Test Driver",
            "start_odometer": 10000,
            "end_odometer": 10050,
            "purpose": "Test deliveries"
        })
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert data["miles"] == 50
        assert data["reimbursement"] == 35.0  # 50 * 0.70 IRS rate
        print(f"✓ Created mileage: {data['miles']} miles, ${data['reimbursement']} reimbursement")
    
    def test_get_mileage(self, auth_headers):
        """Test GET /api/finances/mileage"""
        response = requests.get(f"{BASE_URL}/api/finances/mileage", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Got {len(data)} mileage records")


# ── FAQ Page Test (Public) ───────────────────────────────────────────

class TestFAQPage:
    """Test FAQ page loads (public)"""
    
    def test_faq_page_accessible(self):
        """Test /faq page is accessible"""
        response = requests.get(f"{BASE_URL.replace('/api', '')}/faq")
        # Should return HTML
        assert response.status_code == 200
        print(f"✓ FAQ page accessible")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
