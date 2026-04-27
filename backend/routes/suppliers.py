"""
Suppliers CRUD — Vendor/Supplier management.
Supports inline creation from Inventory page (QuickSupplierForm).
No structural changes needed vs original; this version adds:
  - GET /api/suppliers/search  (quick lookup for combobox)
  - Validation: duplicate name check on create
"""
import uuid
import logging
from datetime import datetime, timezone
from typing import Optional, List
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

from database import db
from auth import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/suppliers", tags=["suppliers"])


# ── Models ────────────────────────────────────────────────────────────

class SupplierCreate(BaseModel):
    name: str
    contact_name: Optional[str] = ""
    email: Optional[str] = ""
    phone: Optional[str] = ""
    address: Optional[str] = ""
    website: Optional[str] = ""
    category: Optional[str] = "general"
    products_services: Optional[List[str]] = []
    payment_terms: Optional[str] = ""
    notes: Optional[str] = ""
    status: Optional[str] = "active"


class SupplierResponse(BaseModel):
    id: str
    name: str
    contact_name: str = ""
    email: str = ""
    phone: str = ""
    address: str = ""
    website: str = ""
    category: str = "general"
    products_services: List[str] = []
    payment_terms: str = ""
    notes: str = ""
    status: str = "active"
    total_orders: int = 0
    total_spent: float = 0.0
    created_at: str = ""
    updated_at: str = ""


SUPPLIER_CATEGORIES = [
    "chemicals", "packaging", "equipment", "uniforms",
    "maintenance", "delivery", "general", "other",
]


# ── Endpoints ─────────────────────────────────────────────────────────

@router.get("/categories")
async def get_categories(user: dict = Depends(get_current_user)):
    """Static list of valid supplier categories."""
    return {"categories": SUPPLIER_CATEGORIES}


@router.get("/search")
async def search_suppliers(
    q: str = "",
    user: dict = Depends(get_current_user),
):
    """
    Lightweight search for the CreatableCombobox in InventoryPage.
    Returns id + name + category only (no heavy fields).
    """
    query: dict = {"status": "active"}
    if q:
        query["$or"] = [
            {"name": {"$regex": q, "$options": "i"}},
            {"contact_name": {"$regex": q, "$options": "i"}},
        ]
    docs = (
        await db.suppliers.find(query, {"_id": 0, "id": 1, "name": 1, "category": 1})
        .sort("name", 1)
        .to_list(50)
    )
    return docs


@router.post("", response_model=SupplierResponse)
async def create_supplier(
    data: SupplierCreate,
    user: dict = Depends(get_current_user),
):
    """
    Creates a supplier. Called from:
      - Suppliers management page (full form)
      - InventoryPage QuickSupplierForm (minimal fields: name, contact, phone, email, category)
    Duplicate name check prevents accidental duplicates when created inline.
    """
    # Soft duplicate check (case-insensitive)
    existing = await db.suppliers.find_one(
        {"name": {"$regex": f"^{data.name.strip()}$", "$options": "i"}},
        {"_id": 0, "id": 1, "name": 1},
    )
    if existing:
        # Return existing supplier instead of raising — lets the UI select it gracefully
        full = await db.suppliers.find_one({"id": existing["id"]}, {"_id": 0})
        return full

    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "id": str(uuid.uuid4()),
        **data.dict(),
        "name": data.name.strip(),
        "total_orders": 0,
        "total_spent": 0.0,
        "created_at": now,
        "updated_at": now,
    }
    await db.suppliers.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.get("", response_model=List[SupplierResponse])
async def list_suppliers(
    status: Optional[str] = None,
    category: Optional[str] = None,
    search: Optional[str] = None,
    user: dict = Depends(get_current_user),
):
    query: dict = {}
    if status:
        query["status"] = status
    if category:
        query["category"] = category
    if search:
        query["$or"] = [
            {"name": {"$regex": search, "$options": "i"}},
            {"contact_name": {"$regex": search, "$options": "i"}},
            {"email": {"$regex": search, "$options": "i"}},
        ]
    suppliers = (
        await db.suppliers.find(query, {"_id": 0}).sort("name", 1).to_list(200)
    )
    return suppliers


@router.get("/{supplier_id}", response_model=SupplierResponse)
async def get_supplier(supplier_id: str, user: dict = Depends(get_current_user)):
    doc = await db.suppliers.find_one({"id": supplier_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Supplier not found")
    return doc


@router.put("/{supplier_id}", response_model=SupplierResponse)
async def update_supplier(
    supplier_id: str,
    data: SupplierCreate,
    user: dict = Depends(get_current_user),
):
    now = datetime.now(timezone.utc).isoformat()
    result = await db.suppliers.update_one(
        {"id": supplier_id},
        {"$set": {**data.dict(), "updated_at": now}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Supplier not found")
    return await db.suppliers.find_one({"id": supplier_id}, {"_id": 0})


@router.delete("/{supplier_id}")
async def delete_supplier(supplier_id: str, user: dict = Depends(get_current_user)):
    # Check if supplier has associated purchase orders before deleting
    po_count = await db.purchase_orders.count_documents({"supplier_id": supplier_id})
    if po_count > 0:
        raise HTTPException(
            status_code=409,
            detail=f"Cannot delete: supplier has {po_count} purchase order(s). Deactivate instead.",
        )
    result = await db.suppliers.delete_one({"id": supplier_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Supplier not found")
    return {"ok": True}


@router.patch("/{supplier_id}/deactivate")
async def deactivate_supplier(supplier_id: str, user: dict = Depends(get_current_user)):
    """Safe alternative to delete when supplier has purchase orders."""
    result = await db.suppliers.update_one(
        {"id": supplier_id},
        {"$set": {"status": "inactive", "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Supplier not found")
    return {"ok": True}