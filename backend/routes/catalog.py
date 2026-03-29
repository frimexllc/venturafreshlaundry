"""
Authorized Product Catalog — Detergents, Softeners, Dryer Sheets, Bleach.
Ensures consistency across forms, CRM, orders, and inventory.
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


class CatalogItem(BaseModel):
    name: str
    category: str  # detergent, softener, dryer_sheet, bleach
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


# Default authorized catalog per user requirement
DEFAULT_CATALOG = [
    # Detergents
    {"name": "Tide", "category": "detergent", "brand": "P&G", "default": True},
    {"name": "Tide + Oxi", "category": "detergent", "brand": "P&G"},
    {"name": "Tide Simply", "category": "detergent", "brand": "P&G"},
    {"name": "Gain", "category": "detergent", "brand": "P&G"},
    {"name": "Foca Liquid", "category": "detergent", "brand": "Foca"},
    {"name": "Foca Powder", "category": "detergent", "brand": "Foca"},
    {"name": "Roma", "category": "detergent", "brand": "Roma"},
    {"name": "Ariel", "category": "detergent", "brand": "P&G"},
    {"name": "Arm & Hammer Pods", "category": "detergent", "brand": "Church & Dwight"},
    {"name": "OxiClean Pods", "category": "detergent", "brand": "Church & Dwight"},
    # Softeners
    {"name": "Suavitel Field Flowers", "category": "softener", "brand": "Colgate-Palmolive", "default": True},
    {"name": "Suavitel Morning Sun", "category": "softener", "brand": "Colgate-Palmolive"},
    {"name": "Downy", "category": "softener", "brand": "P&G"},
    {"name": "Downy Ultra", "category": "softener", "brand": "P&G"},
    {"name": "Snuggle", "category": "softener", "brand": "Henkel"},
    # Dryer Sheets
    {"name": "Bounce", "category": "dryer_sheet", "brand": "P&G", "default": True},
    {"name": "Gain Sheets", "category": "dryer_sheet", "brand": "P&G"},
    {"name": "Suavitel Sheets", "category": "dryer_sheet", "brand": "Colgate-Palmolive"},
    {"name": "Snuggle Sheets", "category": "dryer_sheet", "brand": "Henkel"},
    # Bleach
    {"name": "Clorox", "category": "bleach", "brand": "Clorox", "default": True},
    {"name": "Cloralen", "category": "bleach", "brand": "Cloralen"},
]


@router.get("")
async def get_catalog(category: Optional[str] = None):
    """Public endpoint — returns the authorized product catalog."""
    query = {}
    if category:
        query["category"] = category
    items = await db.catalog.find(query, {"_id": 0}).sort("category", 1).to_list(200)
    if not items:
        # Seed defaults on first access
        for item in DEFAULT_CATALOG:
            doc = {"id": str(uuid.uuid4()), **item, "in_stock": True, "price": None, "unit": "unit", "created_at": datetime.now(timezone.utc).isoformat()}
            await db.catalog.insert_one(doc)
        items = await db.catalog.find(query, {"_id": 0}).sort("category", 1).to_list(200)
    return items


@router.get("/grouped")
async def get_catalog_grouped():
    """Returns catalog grouped by category for dropdown population."""
    items = await get_catalog()
    grouped = {}
    for item in items:
        cat = item.get("category", "other")
        if cat not in grouped:
            grouped[cat] = []
        grouped[cat].append(item)
    return grouped


@router.post("", response_model=CatalogItemResponse)
async def add_catalog_item(data: CatalogItem, user: dict = Depends(get_current_user)):
    # Check for duplicates
    existing = await db.catalog.find_one({"name": data.name, "category": data.category}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail=f"'{data.name}' already exists in {data.category}")
    doc = {"id": str(uuid.uuid4()), **data.dict(), "created_at": datetime.now(timezone.utc).isoformat()}
    await db.catalog.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.put("/{item_id}", response_model=CatalogItemResponse)
async def update_catalog_item(item_id: str, data: CatalogItem, user: dict = Depends(get_current_user)):
    result = await db.catalog.update_one({"id": item_id}, {"$set": data.dict()})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Catalog item not found")
    doc = await db.catalog.find_one({"id": item_id}, {"_id": 0})
    return doc


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
    for item in DEFAULT_CATALOG:
        doc = {"id": str(uuid.uuid4()), **item, "in_stock": True, "price": None, "unit": "unit", "created_at": datetime.now(timezone.utc).isoformat()}
        await db.catalog.insert_one(doc)
    return {"ok": True, "count": len(DEFAULT_CATALOG)}
