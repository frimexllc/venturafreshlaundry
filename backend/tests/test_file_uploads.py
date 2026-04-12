"""
Test File Upload System - Iteration 23
Tests: File upload, download, list by context, soft delete
Also verifies delivery rules, KPIs, and refactored endpoints still work
"""
import pytest
import requests
import os
import io

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_EMAIL = os.environ.get("TEST_ADMIN_EMAIL", "owner@frimexllc.com")
ADMIN_PASSWORD = os.environ.get("TEST_ADMIN_PASSWORD", "admin123")


class TestAuth:
    """Authentication - get token for subsequent tests"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Login and get auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD,
            "terms_accepted": True
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "access_token" in data, "No access_token in response"
        return data["access_token"]
    
    def test_login_returns_token(self, auth_token):
        """Verify login returns valid token"""
        assert auth_token is not None
        assert len(auth_token) > 20
        print(f"✓ Login successful, token length: {len(auth_token)}")


class TestFileUpload:
    """File Upload API Tests"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Login and get auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD,
            "terms_accepted": True
        })
        assert response.status_code == 200
        return response.json()["access_token"]
    
    @pytest.fixture(scope="class")
    def headers(self, auth_token):
        """Auth headers"""
        return {"Authorization": f"Bearer {auth_token}"}
    
    def test_upload_image_file(self, headers):
        """POST /api/files/upload - upload an image file"""
        # Create a simple test image (1x1 PNG)
        png_data = bytes([
            0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,  # PNG signature
            0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,  # IHDR chunk
            0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,  # 1x1 dimensions
            0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
            0xDE, 0x00, 0x00, 0x00, 0x0C, 0x49, 0x44, 0x41,
            0x54, 0x08, 0xD7, 0x63, 0xF8, 0xFF, 0xFF, 0x3F,
            0x00, 0x05, 0xFE, 0x02, 0xFE, 0xDC, 0xCC, 0x59,
            0xE7, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E,
            0x44, 0xAE, 0x42, 0x60, 0x82
        ])
        
        files = {"file": ("test_receipt.png", io.BytesIO(png_data), "image/png")}
        response = requests.post(
            f"{BASE_URL}/api/files/upload?context=expense:TEST_EXPENSE_001",
            headers=headers,
            files=files
        )
        
        assert response.status_code == 200, f"Upload failed: {response.text}"
        data = response.json()
        assert "id" in data, "No id in response"
        assert "url" in data, "No url in response"
        assert data["filename"] == "test_receipt.png"
        assert data["content_type"] == "image/png"
        print(f"✓ File uploaded: id={data['id']}, url={data['url']}")
        return data["id"]
    
    def test_upload_pdf_file(self, headers):
        """POST /api/files/upload - upload a PDF file"""
        # Minimal PDF content
        pdf_data = b"%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R>>endobj\nxref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000052 00000 n \n0000000101 00000 n \ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n178\n%%EOF"
        
        files = {"file": ("invoice.pdf", io.BytesIO(pdf_data), "application/pdf")}
        response = requests.post(
            f"{BASE_URL}/api/files/upload?context=expense:TEST_EXPENSE_002",
            headers=headers,
            files=files
        )
        
        assert response.status_code == 200, f"Upload failed: {response.text}"
        data = response.json()
        assert data["content_type"] == "application/pdf"
        print(f"✓ PDF uploaded: id={data['id']}")
        return data["id"]
    
    def test_upload_text_file(self, headers):
        """POST /api/files/upload - upload a text file"""
        text_data = b"Test receipt content\nAmount: $50.00\nDate: 2024-01-15"
        
        files = {"file": ("receipt.txt", io.BytesIO(text_data), "text/plain")}
        response = requests.post(
            f"{BASE_URL}/api/files/upload?context=expense:TEST_EXPENSE_003",
            headers=headers,
            files=files
        )
        
        assert response.status_code == 200, f"Upload failed: {response.text}"
        data = response.json()
        assert data["content_type"] == "text/plain"
        print(f"✓ Text file uploaded: id={data['id']}")
        return data["id"]
    
    def test_upload_without_context(self, headers):
        """POST /api/files/upload - upload without context parameter"""
        text_data = b"No context file"
        
        files = {"file": ("no_context.txt", io.BytesIO(text_data), "text/plain")}
        response = requests.post(
            f"{BASE_URL}/api/files/upload",
            headers=headers,
            files=files
        )
        
        assert response.status_code == 200, f"Upload failed: {response.text}"
        data = response.json()
        assert "id" in data
        print(f"✓ File uploaded without context: id={data['id']}")
    
    def test_upload_requires_auth(self):
        """POST /api/files/upload - requires authentication"""
        text_data = b"Unauthorized upload"
        files = {"file": ("test.txt", io.BytesIO(text_data), "text/plain")}
        
        response = requests.post(f"{BASE_URL}/api/files/upload", files=files)
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print("✓ Upload requires authentication")


class TestFileDownload:
    """File Download API Tests"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Login and get auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD,
            "terms_accepted": True
        })
        return response.json()["access_token"]
    
    @pytest.fixture(scope="class")
    def headers(self, auth_token):
        return {"Authorization": f"Bearer {auth_token}"}
    
    @pytest.fixture(scope="class")
    def uploaded_file_id(self, headers):
        """Upload a file and return its ID for download tests"""
        text_data = b"Download test content"
        files = {"file": ("download_test.txt", io.BytesIO(text_data), "text/plain")}
        response = requests.post(
            f"{BASE_URL}/api/files/upload?context=expense:TEST_DOWNLOAD",
            headers=headers,
            files=files
        )
        return response.json()["id"]
    
    def test_download_with_header_auth(self, headers, uploaded_file_id):
        """GET /api/files/{id}/download - download with Authorization header"""
        response = requests.get(
            f"{BASE_URL}/api/files/{uploaded_file_id}/download",
            headers=headers
        )
        
        assert response.status_code == 200, f"Download failed: {response.text}"
        assert len(response.content) > 0
        print(f"✓ Downloaded file with header auth, size: {len(response.content)} bytes")
    
    def test_download_with_query_param_auth(self, auth_token, uploaded_file_id):
        """GET /api/files/{id}/download?auth=token - download with query param auth"""
        response = requests.get(
            f"{BASE_URL}/api/files/{uploaded_file_id}/download?auth={auth_token}"
        )
        
        assert response.status_code == 200, f"Download failed: {response.text}"
        assert len(response.content) > 0
        print(f"✓ Downloaded file with query param auth, size: {len(response.content)} bytes")
    
    def test_download_requires_auth(self, uploaded_file_id):
        """GET /api/files/{id}/download - requires authentication"""
        response = requests.get(f"{BASE_URL}/api/files/{uploaded_file_id}/download")
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("✓ Download requires authentication")
    
    def test_download_nonexistent_file(self, headers):
        """GET /api/files/{id}/download - 404 for nonexistent file"""
        response = requests.get(
            f"{BASE_URL}/api/files/nonexistent-file-id/download",
            headers=headers
        )
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("✓ Nonexistent file returns 404")


class TestFileListByContext:
    """File List by Context API Tests"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD,
            "terms_accepted": True
        })
        return response.json()["access_token"]
    
    @pytest.fixture(scope="class")
    def headers(self, auth_token):
        return {"Authorization": f"Bearer {auth_token}"}
    
    @pytest.fixture(scope="class")
    def context_expense_id(self, headers):
        """Upload multiple files with same context"""
        expense_id = "TEST_CONTEXT_LIST_001"
        
        # Upload 2 files with same context
        for i in range(2):
            text_data = f"Context test file {i}".encode()
            files = {"file": (f"context_file_{i}.txt", io.BytesIO(text_data), "text/plain")}
            requests.post(
                f"{BASE_URL}/api/files/upload?context=expense:{expense_id}",
                headers=headers,
                files=files
            )
        
        return expense_id
    
    def test_list_files_by_context(self, headers, context_expense_id):
        """GET /api/files/by-context/expense/{id} - list files for expense"""
        response = requests.get(
            f"{BASE_URL}/api/files/by-context/expense/{context_expense_id}",
            headers=headers
        )
        
        assert response.status_code == 200, f"List failed: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        assert len(data) >= 2, f"Expected at least 2 files, got {len(data)}"
        
        # Verify file structure
        for f in data:
            assert "id" in f
            assert "url" in f
            assert "original_filename" in f
        
        print(f"✓ Listed {len(data)} files for context expense:{context_expense_id}")
    
    def test_list_files_empty_context(self, headers):
        """GET /api/files/by-context/expense/{id} - empty list for unknown context"""
        response = requests.get(
            f"{BASE_URL}/api/files/by-context/expense/NONEXISTENT_EXPENSE",
            headers=headers
        )
        
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) == 0
        print("✓ Empty context returns empty list")


class TestFileSoftDelete:
    """File Soft Delete API Tests"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD,
            "terms_accepted": True
        })
        return response.json()["access_token"]
    
    @pytest.fixture(scope="class")
    def headers(self, auth_token):
        return {"Authorization": f"Bearer {auth_token}"}
    
    def test_soft_delete_file(self, headers):
        """DELETE /api/files/{id} - soft delete a file"""
        # First upload a file
        text_data = b"File to delete"
        files = {"file": ("delete_me.txt", io.BytesIO(text_data), "text/plain")}
        upload_response = requests.post(
            f"{BASE_URL}/api/files/upload?context=expense:TEST_DELETE",
            headers=headers,
            files=files
        )
        file_id = upload_response.json()["id"]
        
        # Delete the file
        delete_response = requests.delete(
            f"{BASE_URL}/api/files/{file_id}",
            headers=headers
        )
        
        assert delete_response.status_code == 200, f"Delete failed: {delete_response.text}"
        data = delete_response.json()
        assert data.get("ok") == True
        print(f"✓ File {file_id} soft deleted")
        
        # Verify file is no longer downloadable
        download_response = requests.get(
            f"{BASE_URL}/api/files/{file_id}/download",
            headers=headers
        )
        assert download_response.status_code == 404, "Deleted file should return 404"
        print("✓ Deleted file returns 404 on download")
    
    def test_delete_nonexistent_file(self, headers):
        """DELETE /api/files/{id} - 404 for nonexistent file"""
        response = requests.delete(
            f"{BASE_URL}/api/files/nonexistent-file-id",
            headers=headers
        )
        assert response.status_code == 404
        print("✓ Delete nonexistent file returns 404")


class TestDeliveryRulesStillWork:
    """Verify delivery rules endpoints still work after refactoring"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD,
            "terms_accepted": True
        })
        return response.json()["access_token"]
    
    @pytest.fixture(scope="class")
    def headers(self, auth_token):
        return {"Authorization": f"Bearer {auth_token}"}
    
    def test_get_zones(self, headers):
        """GET /api/delivery-rules/zones - returns 7 zones"""
        response = requests.get(f"{BASE_URL}/api/delivery-rules/zones", headers=headers)
        assert response.status_code == 200
        data = response.json()
        zones = data.get("zones", [])
        assert len(zones) == 7, f"Expected 7 zones, got {len(zones)}"
        print(f"✓ Delivery zones: {len(zones)} zones returned")
    
    def test_validate_zip(self, headers):
        """POST /api/delivery-rules/validate-zip - validates ZIP codes"""
        # Valid ZIP
        response = requests.post(
            f"{BASE_URL}/api/delivery-rules/validate-zip",
            headers={"Content-Type": "application/json", **headers},
            json={"zip_code": "93001"}
        )
        assert response.status_code == 200
        assert response.json().get("valid") == True
        
        # Invalid ZIP
        response = requests.post(
            f"{BASE_URL}/api/delivery-rules/validate-zip",
            headers={"Content-Type": "application/json", **headers},
            json={"zip_code": "00000"}
        )
        assert response.status_code == 200
        assert response.json().get("valid") == False
        print("✓ ZIP validation works")


class TestKPIsStillWork:
    """Verify KPIs endpoint still works"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD,
            "terms_accepted": True
        })
        return response.json()["access_token"]
    
    @pytest.fixture(scope="class")
    def headers(self, auth_token):
        return {"Authorization": f"Bearer {auth_token}"}
    
    def test_get_operational_kpis(self, headers):
        """GET /api/kpis/operational - returns all KPI sections"""
        response = requests.get(f"{BASE_URL}/api/kpis/operational", headers=headers)
        assert response.status_code == 200
        data = response.json()
        
        # Verify all sections exist
        expected_sections = ["orders", "revenue", "expenses", "inventory", "mileage", "customers", "support"]
        for section in expected_sections:
            assert section in data, f"Missing section: {section}"
        
        print(f"✓ KPIs operational: all {len(expected_sections)} sections present")


class TestRefactoredEndpointsStillWork:
    """Verify refactored endpoints still work"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD,
            "terms_accepted": True
        })
        return response.json()["access_token"]
    
    @pytest.fixture(scope="class")
    def headers(self, auth_token):
        return {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}
    
    def test_dashboard_stats(self, headers):
        """GET /api/dashboard/stats"""
        response = requests.get(f"{BASE_URL}/api/dashboard/stats", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert "total_customers" in data
        assert "total_orders" in data
        print("✓ Dashboard stats works")
    
    def test_customers_list(self, headers):
        """GET /api/customers"""
        response = requests.get(f"{BASE_URL}/api/customers", headers=headers)
        assert response.status_code == 200
        assert isinstance(response.json(), list)
        print("✓ Customers list works")
    
    def test_quotes_list(self, headers):
        """GET /api/quotes"""
        response = requests.get(f"{BASE_URL}/api/quotes", headers=headers)
        assert response.status_code == 200
        assert isinstance(response.json(), list)
        print("✓ Quotes list works")
    
    def test_leads_list(self, headers):
        """GET /api/leads"""
        response = requests.get(f"{BASE_URL}/api/leads", headers=headers)
        assert response.status_code == 200
        assert isinstance(response.json(), list)
        print("✓ Leads list works")
    
    def test_tickets_list(self, headers):
        """GET /api/tickets"""
        response = requests.get(f"{BASE_URL}/api/tickets", headers=headers)
        assert response.status_code == 200
        assert isinstance(response.json(), list)
        print("✓ Tickets list works")


class TestExpenseCreationFlow:
    """Test full expense creation flow"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD,
            "terms_accepted": True
        })
        return response.json()["access_token"]
    
    @pytest.fixture(scope="class")
    def headers(self, auth_token):
        return {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}
    
    def test_create_expense_and_attach_file(self, headers, auth_token):
        """Create expense, then attach file to it"""
        # Create expense
        expense_data = {
            "date": "2024-01-15",
            "category": "Supplies",
            "description": "TEST_FileUpload_Expense",
            "amount": 99.99,
            "expense_type": "variable",
            "vendor": "Test Vendor",
            "payment_method": "card",
            "notes": "Test expense for file upload testing"
        }
        
        create_response = requests.post(
            f"{BASE_URL}/api/finances/expenses",
            headers=headers,
            json=expense_data
        )
        
        assert create_response.status_code in [200, 201], f"Create expense failed: {create_response.text}"
        expense = create_response.json()
        expense_id = expense.get("id")
        assert expense_id, "No expense ID returned"
        print(f"✓ Created expense: {expense_id}")
        
        # Attach file to expense
        text_data = b"Receipt for expense"
        files = {"file": ("expense_receipt.txt", io.BytesIO(text_data), "text/plain")}
        upload_headers = {"Authorization": f"Bearer {auth_token}"}
        
        upload_response = requests.post(
            f"{BASE_URL}/api/files/upload?context=expense:{expense_id}",
            headers=upload_headers,
            files=files
        )
        
        assert upload_response.status_code == 200, f"Upload failed: {upload_response.text}"
        file_data = upload_response.json()
        print(f"✓ Attached file to expense: {file_data['id']}")
        
        # Verify file is listed for expense
        list_response = requests.get(
            f"{BASE_URL}/api/files/by-context/expense/{expense_id}",
            headers=upload_headers
        )
        
        assert list_response.status_code == 200
        files_list = list_response.json()
        assert len(files_list) >= 1
        print(f"✓ Verified file attached to expense: {len(files_list)} files")
        
        # Cleanup - delete expense
        requests.delete(f"{BASE_URL}/api/finances/expenses/{expense_id}", headers=headers)


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
