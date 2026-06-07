# routes/orders_legacy.py
from fastapi import APIRouter, Depends, HTTPException
from typing import Optional
from database import db
from auth import get_current_user

router = APIRouter(prefix="/api/orders", tags=["Orders (legacy)"])

@router.get("/{order_id}")
async def get_order_legacy(order_id: str, current_user = Depends(get_current_user)):
    # Reutiliza la lógica de store
    from store import get_store_order
    return await get_store_order(order_id, current_user)

