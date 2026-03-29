"""
Finances module — Expenses, Receipts, Mileage, Vehicles, Vendors, Categories.
Full ERP-lite financial management for Ventura Fresh Laundry.
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
router = APIRouter(prefix="/api/finances", tags=["finances"])


# ── Models ────────────────────────────────────────────────────────────

class ExpenseCreate(BaseModel):
    date: str
    category: str
    description: str
    amount: float
    expense_type: str = "variable"  # fixed, variable, subscription
    vendor: Optional[str] = ""
    payment_method: Optional[str] = "card"
    receipt_url: Optional[str] = ""
    notes: Optional[str] = ""
    recurring: Optional[bool] = False
    recurring_frequency: Optional[str] = ""  # monthly, weekly, yearly


class ExpenseResponse(BaseModel):
    id: str
    date: str
    category: str
    description: str
    amount: float
    expense_type: str = "variable"
    vendor: str = ""
    payment_method: str = "card"
    receipt_url: str = ""
    notes: str = ""
    recurring: bool = False
    recurring_frequency: str = ""
    created_by: str = ""
    created_at: str = ""
    updated_at: str = ""


class MileageCreate(BaseModel):
    date: str
    vehicle_id: Optional[str] = ""
    driver_name: Optional[str] = ""
    start_odometer: float
    end_odometer: float
    purpose: Optional[str] = ""
    notes: Optional[str] = ""


class MileageResponse(BaseModel):
    id: str
    date: str
    vehicle_id: str = ""
    driver_name: str = ""
    start_odometer: float
    end_odometer: float
    miles: float = 0
    reimbursement: float = 0
    purpose: str = ""
    notes: str = ""
    created_at: str = ""


class VehicleCreate(BaseModel):
    name: str
    plate: Optional[str] = ""
    make: Optional[str] = ""
    model: Optional[str] = ""
    year: Optional[int] = None
    status: Optional[str] = "active"


class VehicleResponse(BaseModel):
    id: str
    name: str
    plate: str = ""
    make: str = ""
    model: str = ""
    year: Optional[int] = None
    status: str = "active"
    total_miles: float = 0
    created_at: str = ""


class CategoryCreate(BaseModel):
    name: str
    type: str = "expense"  # expense, income
    color: Optional[str] = "#6b7280"


EXPENSE_CATEGORIES = [
    {"name": "Suministros de Lavado", "type": "expense", "color": "#3b82f6"},
    {"name": "Gasolina", "type": "expense", "color": "#f97316"},
    {"name": "Mantenimiento Vehiculo", "type": "expense", "color": "#ef4444"},
    {"name": "Mantenimiento Equipo", "type": "expense", "color": "#8b5cf6"},
    {"name": "Renta", "type": "expense", "color": "#ec4899"},
    {"name": "Servicios (Agua/Luz/Gas)", "type": "expense", "color": "#14b8a6"},
    {"name": "Nomina", "type": "expense", "color": "#f59e0b"},
    {"name": "Seguros", "type": "expense", "color": "#6366f1"},
    {"name": "Marketing", "type": "expense", "color": "#10b981"},
    {"name": "Empaques", "type": "expense", "color": "#84cc16"},
    {"name": "Software/Tecnologia", "type": "expense", "color": "#06b6d4"},
    {"name": "Impuestos", "type": "expense", "color": "#78716c"},
    {"name": "Otros", "type": "expense", "color": "#6b7280"},
]

IRS_MILEAGE_RATE = 0.70  # 2025/2026 IRS standard mileage rate


# ── Expense Endpoints ────────────────────────────────────────────────

@router.post("/expenses", response_model=ExpenseResponse)
async def create_expense(data: ExpenseCreate, user: dict = Depends(get_current_user)):
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "id": str(uuid.uuid4()),
        **data.dict(),
        "created_by": user.get("id", ""),
        "created_at": now,
        "updated_at": now,
    }
    await db.expenses.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.get("/expenses", response_model=List[ExpenseResponse])
async def list_expenses(
    expense_type: Optional[str] = None,
    category: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    search: Optional[str] = None,
    user: dict = Depends(get_current_user),
):
    query = {}
    if expense_type:
        query["expense_type"] = expense_type
    if category:
        query["category"] = category
    if date_from or date_to:
        date_q = {}
        if date_from:
            date_q["$gte"] = date_from
        if date_to:
            date_q["$lte"] = date_to
        query["date"] = date_q
    if search:
        query["$or"] = [
            {"description": {"$regex": search, "$options": "i"}},
            {"vendor": {"$regex": search, "$options": "i"}},
        ]
    expenses = await db.expenses.find(query, {"_id": 0}).sort("date", -1).to_list(500)
    return expenses


@router.get("/expenses/{expense_id}", response_model=ExpenseResponse)
async def get_expense(expense_id: str, user: dict = Depends(get_current_user)):
    doc = await db.expenses.find_one({"id": expense_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Expense not found")
    return doc


@router.put("/expenses/{expense_id}", response_model=ExpenseResponse)
async def update_expense(expense_id: str, data: ExpenseCreate, user: dict = Depends(get_current_user)):
    now = datetime.now(timezone.utc).isoformat()
    result = await db.expenses.update_one({"id": expense_id}, {"$set": {**data.dict(), "updated_at": now}})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Expense not found")
    doc = await db.expenses.find_one({"id": expense_id}, {"_id": 0})
    return doc


@router.delete("/expenses/{expense_id}")
async def delete_expense(expense_id: str, user: dict = Depends(get_current_user)):
    result = await db.expenses.delete_one({"id": expense_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Expense not found")
    return {"ok": True}


# ── Categories ────────────────────────────────────────────────────────

@router.get("/categories")
async def get_expense_categories(user: dict = Depends(get_current_user)):
    custom = await db.expense_categories.find({}, {"_id": 0}).to_list(50)
    if custom:
        return custom
    return EXPENSE_CATEGORIES


@router.post("/categories")
async def create_category(data: CategoryCreate, user: dict = Depends(get_current_user)):
    doc = {"id": str(uuid.uuid4()), **data.dict(), "created_at": datetime.now(timezone.utc).isoformat()}
    await db.expense_categories.insert_one(doc)
    doc.pop("_id", None)
    return doc


# ── Mileage ──────────────────────────────────────────────────────────

@router.post("/mileage", response_model=MileageResponse)
async def create_mileage(data: MileageCreate, user: dict = Depends(get_current_user)):
    now = datetime.now(timezone.utc).isoformat()
    miles = max(0, data.end_odometer - data.start_odometer)
    doc = {
        "id": str(uuid.uuid4()),
        **data.dict(),
        "miles": round(miles, 1),
        "reimbursement": round(miles * IRS_MILEAGE_RATE, 2),
        "created_at": now,
    }
    await db.mileage_logs.insert_one(doc)
    # Update vehicle total miles
    if data.vehicle_id:
        await db.vehicles.update_one({"id": data.vehicle_id}, {"$inc": {"total_miles": miles}})
    doc.pop("_id", None)
    return doc


@router.get("/mileage", response_model=List[MileageResponse])
async def list_mileage(
    vehicle_id: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    user: dict = Depends(get_current_user),
):
    query = {}
    if vehicle_id:
        query["vehicle_id"] = vehicle_id
    if date_from or date_to:
        date_q = {}
        if date_from:
            date_q["$gte"] = date_from
        if date_to:
            date_q["$lte"] = date_to
        query["date"] = date_q
    logs = await db.mileage_logs.find(query, {"_id": 0}).sort("date", -1).to_list(500)
    return logs


@router.delete("/mileage/{mileage_id}")
async def delete_mileage(mileage_id: str, user: dict = Depends(get_current_user)):
    result = await db.mileage_logs.delete_one({"id": mileage_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Mileage log not found")
    return {"ok": True}


# ── Vehicles ─────────────────────────────────────────────────────────

@router.post("/vehicles", response_model=VehicleResponse)
async def create_vehicle(data: VehicleCreate, user: dict = Depends(get_current_user)):
    now = datetime.now(timezone.utc).isoformat()
    doc = {"id": str(uuid.uuid4()), **data.dict(), "total_miles": 0, "created_at": now}
    await db.vehicles.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.get("/vehicles", response_model=List[VehicleResponse])
async def list_vehicles(user: dict = Depends(get_current_user)):
    return await db.vehicles.find({}, {"_id": 0}).sort("name", 1).to_list(50)


@router.put("/vehicles/{vehicle_id}", response_model=VehicleResponse)
async def update_vehicle(vehicle_id: str, data: VehicleCreate, user: dict = Depends(get_current_user)):
    result = await db.vehicles.update_one({"id": vehicle_id}, {"$set": {**data.dict(), "updated_at": datetime.now(timezone.utc).isoformat()}})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    doc = await db.vehicles.find_one({"id": vehicle_id}, {"_id": 0})
    return doc


@router.delete("/vehicles/{vehicle_id}")
async def delete_vehicle(vehicle_id: str, user: dict = Depends(get_current_user)):
    result = await db.vehicles.delete_one({"id": vehicle_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    return {"ok": True}


# ── Financial Summary ────────────────────────────────────────────────

@router.get("/dashboard")
async def get_financial_dashboard(
    period: str = Query("month", description="day, week, month, year"),
    user: dict = Depends(get_current_user),
):
    now = datetime.now(timezone.utc)
    if period == "day":
        date_from = now.strftime("%Y-%m-%d")
    elif period == "week":
        from datetime import timedelta
        date_from = (now - timedelta(days=7)).strftime("%Y-%m-%d")
    elif period == "year":
        date_from = f"{now.year}-01-01"
    else:
        date_from = now.strftime("%Y-%m-01")

    # Expenses
    expenses = await db.expenses.find({"date": {"$gte": date_from}}, {"_id": 0}).to_list(1000)
    total_expenses = sum(e.get("amount", 0) for e in expenses)
    by_category = {}
    for e in expenses:
        cat = e.get("category", "Otros")
        by_category[cat] = by_category.get(cat, 0) + e.get("amount", 0)
    fixed = sum(e.get("amount", 0) for e in expenses if e.get("expense_type") == "fixed")
    variable = sum(e.get("amount", 0) for e in expenses if e.get("expense_type") == "variable")

    # Revenue (from paid orders)
    revenue_query = {"payment_status": "paid"}
    if period != "year":
        revenue_query["created_at"] = {"$gte": date_from}
    orders = await db.orders.find(revenue_query, {"_id": 0, "total_amount": 1}).to_list(2000)
    store_orders = await db.store_orders.find({"payment_status": "paid"}, {"_id": 0, "total": 1}).to_list(500)
    total_revenue = sum(o.get("total_amount", 0) or 0 for o in orders) + sum(o.get("total", 0) or 0 for o in store_orders)

    # Mileage
    mileage = await db.mileage_logs.find({"date": {"$gte": date_from}}, {"_id": 0}).to_list(500)
    total_miles = sum(m.get("miles", 0) for m in mileage)
    total_reimbursement = sum(m.get("reimbursement", 0) for m in mileage)

    return {
        "period": period,
        "date_from": date_from,
        "revenue": round(total_revenue, 2),
        "total_expenses": round(total_expenses, 2),
        "fixed_expenses": round(fixed, 2),
        "variable_expenses": round(variable, 2),
        "net_income": round(total_revenue - total_expenses, 2),
        "by_category": {k: round(v, 2) for k, v in sorted(by_category.items(), key=lambda x: -x[1])},
        "expense_count": len(expenses),
        "mileage": {
            "total_miles": round(total_miles, 1),
            "total_reimbursement": round(total_reimbursement, 2),
            "entries": len(mileage),
        },
    }
