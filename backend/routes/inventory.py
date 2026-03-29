"""
Inventory module — Stock tracking, Purchase Orders, Stock Movements.
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
router = APIRouter(prefix="/api/inventory", tags=["inventory"])


class PurchaseOrderCreate(BaseModel):
    supplier_id: str
    supplier_name: Optional[str] = ""
    items: List[dict]  # [{name, quantity, unit_price}]
    total: float
    notes: Optional[str] = ""
    expected_date: Optional[str] = ""
    status: Optional[str] = "pending"


class StockMovement(BaseModel):
    product_name: str
    category: Optional[str] = ""
    quantity: float
    movement_type: str  # in, out, adjustment
    reason: Optional[str] = ""
    reference: Optional[str] = ""


@router.get("/stock")
async def get_stock(category: Optional[str] = None, user: dict = Depends(get_current_user)):
    query = {}
    if category:
        query["category"] = category
    items = await db.inventory.find(query, {"_id": 0}).sort("name", 1).to_list(500)
    return items


@router.post("/stock/movement")
async def record_movement(data: StockMovement, user: dict = Depends(get_current_user)):
    now = datetime.now(timezone.utc).isoformat()
    # Update or create inventory item
    existing = await db.inventory.find_one({"name": data.product_name}, {"_id": 0})
    delta = data.quantity if data.movement_type == "in" else -data.quantity if data.movement_type == "out" else data.quantity
    if existing:
        new_qty = max(0, existing.get("quantity", 0) + delta)
        await db.inventory.update_one({"name": data.product_name}, {"$set": {"quantity": new_qty, "updated_at": now}})
    else:
        await db.inventory.insert_one({
            "id": str(uuid.uuid4()), "name": data.product_name, "category": data.category,
            "quantity": max(0, delta), "unit": "unit", "min_stock": 5, "created_at": now, "updated_at": now,
        })
    # Log movement
    movement_doc = {
        "id": str(uuid.uuid4()), **data.dict(),
        "created_by": user.get("id", ""), "created_at": now,
    }
    await db.stock_movements.insert_one(movement_doc)
    movement_doc.pop("_id", None)
    return movement_doc


@router.get("/stock/movements")
async def list_movements(
    product_name: Optional[str] = None,
    movement_type: Optional[str] = None,
    user: dict = Depends(get_current_user),
):
    query = {}
    if product_name:
        query["product_name"] = {"$regex": product_name, "$options": "i"}
    if movement_type:
        query["movement_type"] = movement_type
    movements = await db.stock_movements.find(query, {"_id": 0}).sort("created_at", -1).to_list(200)
    return movements


@router.get("/low-stock")
async def get_low_stock(user: dict = Depends(get_current_user)):
    items = await db.inventory.find({}, {"_id": 0}).to_list(500)
    low = [i for i in items if i.get("quantity", 0) <= i.get("min_stock", 5)]
    return low


# ── Purchase Orders ──────────────────────────────────────────────────

@router.post("/purchase-orders")
async def create_purchase_order(data: PurchaseOrderCreate, user: dict = Depends(get_current_user)):
    now = datetime.now(timezone.utc).isoformat()
    po_number = f"PO-{datetime.now(timezone.utc).strftime('%Y%m%d')}-{uuid.uuid4().hex[:6].upper()}"
    doc = {
        "id": str(uuid.uuid4()), "po_number": po_number, **data.dict(),
        "created_by": user.get("id", ""), "created_at": now, "updated_at": now,
    }
    await db.purchase_orders.insert_one(doc)
    # Update supplier stats
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
    query = {}
    if status:
        query["status"] = status
    if supplier_id:
        query["supplier_id"] = supplier_id
    orders = await db.purchase_orders.find(query, {"_id": 0}).sort("created_at", -1).to_list(200)
    return orders


@router.put("/purchase-orders/{po_id}/status")
async def update_po_status(po_id: str, payload: dict, user: dict = Depends(get_current_user)):
    new_status = payload.get("status", "")
    result = await db.purchase_orders.update_one(
        {"id": po_id},
        {"$set": {"status": new_status, "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Purchase order not found")
    # If received, auto-add stock
    if new_status == "received":
        po = await db.purchase_orders.find_one({"id": po_id}, {"_id": 0})
        if po:
            for item in po.get("items", []):
                movement = StockMovement(
                    product_name=item.get("name", ""),
                    quantity=item.get("quantity", 0),
                    movement_type="in",
                    reason="Purchase order received",
                    reference=po.get("po_number", ""),
                )
                await record_movement(movement, user)
    return {"ok": True}
