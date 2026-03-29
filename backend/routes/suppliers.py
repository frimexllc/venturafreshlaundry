"""
Suppliers CRUD — Vendor/Supplier management for Ventura Fresh Laundry.
"""
import uuid
import logging
from datetime import datetime, timezone
from typing import Optional, List
from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel

from database import db
from auth import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/suppliers", tags=["suppliers"])


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
    total_spent: float = 0
    created_at: str = ""
    updated_at: str = ""


SUPPLIER_CATEGORIES = [
    "chemicals", "packaging", "equipment", "uniforms",
    "maintenance", "delivery", "general", "other"
]


@router.post("", response_model=SupplierResponse)
async def create_supplier(data: SupplierCreate, user: dict = Depends(get_current_user)):
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "id": str(uuid.uuid4()),
        **data.dict(),
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
    query = {}
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
    suppliers = await db.suppliers.find(query, {"_id": 0}).sort("name", 1).to_list(200)
    return suppliers


@router.get("/categories")
async def get_categories(user: dict = Depends(get_current_user)):
    return {"categories": SUPPLIER_CATEGORIES}


@router.get("/{supplier_id}", response_model=SupplierResponse)
async def get_supplier(supplier_id: str, user: dict = Depends(get_current_user)):
    doc = await db.suppliers.find_one({"id": supplier_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Supplier not found")
    return doc


@router.put("/{supplier_id}", response_model=SupplierResponse)
async def update_supplier(supplier_id: str, data: SupplierCreate, user: dict = Depends(get_current_user)):
    now = datetime.now(timezone.utc).isoformat()
    update = {**data.dict(), "updated_at": now}
    result = await db.suppliers.update_one({"id": supplier_id}, {"$set": update})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Supplier not found")
    doc = await db.suppliers.find_one({"id": supplier_id}, {"_id": 0})
    return doc


@router.delete("/{supplier_id}")
async def delete_supplier(supplier_id: str, user: dict = Depends(get_current_user)):
    result = await db.suppliers.delete_one({"id": supplier_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Supplier not found")
    return {"ok": True}
