"""
Inventory module — Stock tracking, Purchase Orders, Stock Movements.
"""
import uuid
import logging
from datetime import datetime, timezone
from typing import Optional, List
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field

from database import db
from auth import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/inventory", tags=["inventory"])


# ── Models ────────────────────────────────────────────────────────────

class PurchaseOrderCreate(BaseModel):
    supplier_id: str
    supplier_name: Optional[str] = ""
    items: List[dict]          # [{name, quantity, unit_price}]
    total: float
    notes: Optional[str] = ""
    expected_date: Optional[str] = ""
    status: Optional[str] = "pending"


class StockMovement(BaseModel):
    product_name: str
    category: Optional[str] = ""
    quantity: float
    movement_type: str         # in | out | adjustment
    reason: Optional[str] = ""
    reference: Optional[str] = ""


class MinStockUpdate(BaseModel):
    product_name: str
    min_stock: float = Field(..., ge=0)


# ── Stock ─────────────────────────────────────────────────────────────

@router.get("/stock")
async def get_stock(
    category: Optional[str] = None,
    user: dict = Depends(get_current_user),
):
    query = {}
    if category:
        query["category"] = category
    items = (
        await db.inventory.find(query, {"_id": 0}).sort("name", 1).to_list(500)
    )
    return items


@router.put("/stock/min-stock")
async def update_min_stock(
    data: MinStockUpdate,
    user: dict = Depends(get_current_user),
):
    """Update the minimum stock threshold for an existing product."""
    result = await db.inventory.update_one(
        {"name": data.product_name},
        {"$set": {"min_stock": data.min_stock, "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Product not found in inventory")
    return {"ok": True, "product_name": data.product_name, "min_stock": data.min_stock}


@router.post("/stock/movement")
async def record_movement(
    data: StockMovement,
    user: dict = Depends(get_current_user),
):
    now = datetime.now(timezone.utc).isoformat()

    # Compute delta
    if data.movement_type == "in":
        delta = data.quantity
    elif data.movement_type == "out":
        delta = -data.quantity
    else:
        delta = data.quantity   # adjustment sets the value directly

    existing = await db.inventory.find_one({"name": data.product_name}, {"_id": 0})
    if existing:
        if data.movement_type == "adjustment":
            new_qty = max(0, data.quantity)
        else:
            new_qty = max(0, existing.get("quantity", 0) + delta)
        await db.inventory.update_one(
            {"name": data.product_name},
            {"$set": {"quantity": new_qty, "updated_at": now}},
        )
    else:
        new_qty = max(0, delta)
        await db.inventory.insert_one({
            "id": str(uuid.uuid4()),
            "name": data.product_name,
            "category": data.category,
            "quantity": new_qty,
            "unit": "unit",
            "min_stock": 5,
            "created_at": now,
            "updated_at": now,
        })

    # Log the movement
    movement_doc = {
        "id": str(uuid.uuid4()),
        **data.dict(),
        "created_by": user.get("id", ""),
        "created_at": now,
    }
    await db.stock_movements.insert_one(movement_doc)
    movement_doc.pop("_id", None)
    return movement_doc


@router.get("/stock/movements")
async def list_movements(
    product_name: Optional[str] = None,
    movement_type: Optional[str] = None,
    limit: int = 200,
    user: dict = Depends(get_current_user),
):
    query: dict = {}
    if product_name:
        query["product_name"] = {"$regex": product_name, "$options": "i"}
    if movement_type and movement_type != "all":
        query["movement_type"] = movement_type
    movements = (
        await db.stock_movements.find(query, {"_id": 0})
        .sort("created_at", -1)
        .to_list(min(limit, 500))
    )
    return movements


@router.get("/low-stock")
async def get_low_stock(user: dict = Depends(get_current_user)):
    """
    Returns items whose quantity is at or below their min_stock threshold.
    Uses a server-side expression so it works correctly for every item's
    individual threshold (instead of hardcoding a global value).
    """
    items = await db.inventory.find(
        {"$expr": {"$lte": ["$quantity", {"$ifNull": ["$min_stock", 5]}]}},
        {"_id": 0},
    ).to_list(500)
    return items


# ── Purchase Orders ───────────────────────────────────────────────────

@router.post("/purchase-orders")
async def create_purchase_order(
    data: PurchaseOrderCreate,
    user: dict = Depends(get_current_user),
):
    now = datetime.now(timezone.utc).isoformat()
    po_number = (
        f"PO-{datetime.now(timezone.utc).strftime('%Y%m%d')}-"
        f"{uuid.uuid4().hex[:6].upper()}"
    )
    doc = {
        "id": str(uuid.uuid4()),
        "po_number": po_number,
        **data.dict(),
        "created_by": user.get("id", ""),
        "created_at": now,
        "updated_at": now,
    }
    await db.purchase_orders.insert_one(doc)
    # Update supplier aggregate stats
    await db.suppliers.update_one(
        {"id": data.supplier_id},
        {"$inc": {"total_orders": 1, "total_spent": data.total}},
    )
    doc.pop("_id", None)
    return doc


@router.get("/purchase-orders")
async def list_purchase_orders(
    status: Optional[str] = None,
    supplier_id: Optional[str] = None,
    user: dict = Depends(get_current_user),
):
    query: dict = {}
    if status and status != "all":
        query["status"] = status
    if supplier_id:
        query["supplier_id"] = supplier_id
    orders = (
        await db.purchase_orders.find(query, {"_id": 0})
        .sort("created_at", -1)
        .to_list(200)
    )
    return orders


@router.put("/purchase-orders/{po_id}/status")
async def update_po_status(
    po_id: str,
    payload: dict,
    user: dict = Depends(get_current_user),
):
    new_status = payload.get("status", "")
    if new_status not in {"pending", "approved", "ordered", "received", "cancelled"}:
        raise HTTPException(status_code=400, detail=f"Invalid status: {new_status}")

    result = await db.purchase_orders.update_one(
        {"id": po_id},
        {"$set": {"status": new_status, "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Purchase order not found")

    # Auto-add stock when order is received
    if new_status == "received":
        po = await db.purchase_orders.find_one({"id": po_id}, {"_id": 0})
        if po:
            for item in po.get("items", []):
                name = item.get("name", "").strip()
                qty = item.get("quantity", 0)
                if not name or qty <= 0:
                    continue
                movement = StockMovement(
                    product_name=name,
                    quantity=qty,
                    movement_type="in",
                    reason="Purchase order received",
                    reference=po.get("po_number", ""),
                )
                await record_movement(movement, user)

    return {"ok": True}