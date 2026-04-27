"""
Authorized Product Catalog — Detergents, Softeners, Dryer Sheets, Bleach.
Ensures consistency across forms, CRM, orders, and inventory.

Added endpoint:
  GET /api/catalog/categories  — returns unique category strings for InventoryPage combobox
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
router = APIRouter(prefix="/api/catalog", tags=["catalog"])


# ── Models ────────────────────────────────────────────────────────────

class CatalogItem(BaseModel):
    name: str
    category: str       # detergent, softener, dryer_sheet, bleach
    brand: Optional[str] = ""
    price: Optional[float] = None
    unit: Optional[str] = "unit"
    in_stock: Optional[bool] = True
    default: Optional[bool] = False


class CatalogItemResponse(BaseModel):
    id: str
    name: str
    category: str
    brand: str = ""
    price: Optional[float] = None
    unit: str = "unit"
    in_stock: bool = True
    default: bool = False
    created_at: str = ""


# ── Default catalog ───────────────────────────────────────────────────

DEFAULT_CATALOG = [
    # Detergents
   
]

# Derived once at import time — used by /categories endpoint
_CATALOG_CATEGORIES = sorted({item["category"] for item in DEFAULT_CATALOG})


# ── Helpers ───────────────────────────────────────────────────────────

async def _ensure_seeded():
    """Seed default catalog on first access if collection is empty."""
    count = await db.catalog.count_documents({})
    if count == 0:
        now = datetime.now(timezone.utc).isoformat()
        for item in DEFAULT_CATALOG:
            doc = {
                "id": str(uuid.uuid4()),
                **item,
                "in_stock": True,
                "price": None,
                "unit": "unit",
                "created_at": now,
            }
            await db.catalog.insert_one(doc)


# ── Endpoints ─────────────────────────────────────────────────────────

@router.get("/categories")
async def get_catalog_categories():
    """
    Returns the unique category names in the catalog.
    Called by InventoryPage to pre-populate the CreatableCombobox
    even before any stock movement has been recorded.
    Public (no auth) — same as GET /api/catalog.
    """
    await _ensure_seeded()
    # Pull live categories from DB so user-added items are included
    pipeline = [
        {"$group": {"_id": "$category"}},
        {"$sort": {"_id": 1}},
    ]
    results = await db.catalog.aggregate(pipeline).to_list(100)
    categories = [r["_id"] for r in results if r.get("_id")]
    return {"categories": categories}


@router.get("/grouped")
async def get_catalog_grouped():
    """Returns catalog grouped by category for dropdown population."""
    await _ensure_seeded()
    items = await db.catalog.find({}, {"_id": 0}).sort("category", 1).to_list(200)
    grouped: dict = {}
    for item in items:
        cat = item.get("category", "other")
        grouped.setdefault(cat, []).append(item)
    return grouped


@router.get("")
async def get_catalog(category: Optional[str] = None):
    """Public endpoint — returns the authorized product catalog."""
    await _ensure_seeded()
    query = {}
    if category:
        query["category"] = category
    items = await db.catalog.find(query, {"_id": 0}).sort("category", 1).to_list(200)
    return items


@router.post("", response_model=CatalogItemResponse)
async def add_catalog_item(data: CatalogItem, user: dict = Depends(get_current_user)):
    existing = await db.catalog.find_one(
        {"name": data.name, "category": data.category}, {"_id": 0}
    )
    if existing:
        raise HTTPException(status_code=400, detail=f"'{data.name}' already exists in {data.category}")
    doc = {
        "id": str(uuid.uuid4()),
        **data.dict(),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.catalog.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.put("/{item_id}", response_model=CatalogItemResponse)
async def update_catalog_item(
    item_id: str, data: CatalogItem, user: dict = Depends(get_current_user)
):
    result = await db.catalog.update_one({"id": item_id}, {"$set": data.dict()})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Catalog item not found")
    return await db.catalog.find_one({"id": item_id}, {"_id": 0})


@router.delete("/{item_id}")
async def delete_catalog_item(item_id: str, user: dict = Depends(get_current_user)):
    result = await db.catalog.delete_one({"id": item_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Catalog item not found")
    return {"ok": True}


@router.post("/seed")
async def seed_catalog(user: dict = Depends(get_current_user)):
    """Reset catalog to authorized defaults."""
    await db.catalog.delete_many({})
    now = datetime.now(timezone.utc).isoformat()
    for item in DEFAULT_CATALOG:
        doc = {
            "id": str(uuid.uuid4()),
            **item,
            "in_stock": True,
            "price": None,
            "unit": "unit",
            "created_at": now,
        }
        await db.catalog.insert_one(doc)
    return {"ok": True, "count": len(DEFAULT_CATALOG)}