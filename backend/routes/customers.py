"""Customer & Preference endpoints"""
from fastapi import APIRouter, HTTPException, Depends, Query
from fastapi.responses import Response
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone
import uuid
import base64

from database import db
from models import (
    CustomerCreate, CustomerResponse,
    PreferenceCreate, CustomerPreferenceUpdate, PreferenceResponse,
)
from auth import get_current_user, get_current_customer
from utils import (
    normalize_email, normalize_phone, normalize_address, normalize_spaces,
    normalize_name, normalize_preference_dict, create_audit_log,
)

router = APIRouter(prefix="/api", tags=["Customers"])


# ══════════════════════════════════════════════════════════════════════
# Helper functions
# ══════════════════════════════════════════════════════════════════════

async def _get_customer_ids_by_email(email: str) -> set:
    """Get all customer IDs that share the same email — handles duplicate customer records."""
    if not email:
        return set()
    customers = await db.customers.find(
        {"email": {"$regex": f"^{email}$", "$options": "i"}},
        {"_id": 0, "id": 1},
    ).to_list(20)
    return {c["id"] for c in customers if c.get("id")}


def normalize_preference_payload(data: PreferenceCreate) -> Dict[str, Any]:
    def normalize_list(value):
        if not value:
            return []
        if isinstance(value, list):
            return [normalize_spaces(v) for v in value if normalize_spaces(v)]
        if isinstance(value, str):
            cleaned = normalize_spaces(value)
            return [v for v in (item.strip() for item in cleaned.split(",")) if v]
        return []

    return {
        "detergent_type": normalize_spaces(data.detergent_type) or "standard",
        "water_temperature": normalize_spaces(data.water_temperature),
        "fabric_softener": normalize_spaces(data.fabric_softener),
        "folding_style": normalize_spaces(data.folding_style) or "standard",
        "hanging_instructions": normalize_spaces(data.hanging_instructions),
        "allergies": normalize_spaces(data.allergies),
        "special_instructions": normalize_spaces(data.special_instructions),
        "pickup_time_preference": normalize_spaces(data.pickup_time_preference),
        "gate_code": normalize_spaces(data.gate_code),
        "hang_dry_items": normalize_list(data.hang_dry_items),
        "fragrance_preference": normalize_spaces(data.fragrance_preference) or "light"
    }


# ── Customers ────────────────────────────────────────────────────────

@router.post("/customers", response_model=CustomerResponse)
async def create_customer(data: CustomerCreate, current_user: dict = Depends(get_current_user)):
    customer_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    normalized_name = normalize_name(data.name)
    normalized_email = normalize_email(data.email) if data.email else ""
    normalized_phone = normalize_phone(data.phone)
    normalized_address = normalize_address(data.address)
    customer = {
        "id": customer_id,
        "name": normalized_name or data.name,
        "email": normalized_email or (data.email.lower() if data.email else None),
        "phone": normalized_phone or data.phone,
        "address": normalized_address or data.address,
        "preferred_contact": normalize_spaces(data.preferred_contact) or data.preferred_contact,
        "notes": normalize_spaces(data.notes),
        "status": "active",
        "total_orders": 0,
        "membership_plan": normalize_spaces(data.membership_plan),
        "membership_status": normalize_spaces(data.membership_status),
        "membership_start_date": data.membership_start_date,
        "preferences_id": data.preferences_id,
        "created_at": now,
        "updated_at": now
    }
    await db.customers.insert_one(customer)
    await create_audit_log("CUSTOMER_CREATED", "customer", customer_id, current_user["id"])
    customer.pop("_id", None)
    return CustomerResponse(**customer)


@router.get("/customers", response_model=List[CustomerResponse])
async def get_customers(
    search: Optional[str] = None,
    status: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    current_user: dict = Depends(get_current_user)
):
    query = {}
    if search:
        query["$or"] = [
            {"name": {"$regex": search, "$options": "i"}},
            {"email": {"$regex": search, "$options": "i"}},
            {"phone": {"$regex": search, "$options": "i"}}
        ]
    if status:
        query["status"] = status

    skip = (page - 1) * page_size
    customers = await db.customers.find(query, {"_id": 0}).sort("created_at", -1).skip(skip).limit(page_size).to_list(page_size)
    return [CustomerResponse(**c) for c in customers]


@router.get("/customers/{customer_id}", response_model=CustomerResponse)
async def get_customer(customer_id: str, current_user: dict = Depends(get_current_user)):
    customer = await db.customers.find_one({"id": customer_id}, {"_id": 0})
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    return CustomerResponse(**customer)


@router.put("/customers/{customer_id}", response_model=CustomerResponse)
async def update_customer(customer_id: str, data: CustomerCreate, current_user: dict = Depends(get_current_user)):
    update_data = data.model_dump(exclude_unset=True)
    if "name" in update_data:
        update_data["name"] = normalize_name(update_data["name"]) or update_data["name"]
    if "email" in update_data and update_data["email"]:
        ne = normalize_email(update_data["email"])
        update_data["email"] = ne or update_data["email"].lower()
    if "phone" in update_data:
        np = normalize_phone(update_data["phone"])
        update_data["phone"] = np or update_data["phone"]
    if "address" in update_data:
        update_data["address"] = normalize_address(update_data["address"]) or update_data["address"]
    if "preferred_contact" in update_data:
        update_data["preferred_contact"] = normalize_spaces(update_data["preferred_contact"]) or update_data["preferred_contact"]
    if "notes" in update_data:
        update_data["notes"] = normalize_spaces(update_data["notes"])
    if "membership_plan" in update_data:
        update_data["membership_plan"] = normalize_spaces(update_data["membership_plan"])
    if "membership_status" in update_data:
        update_data["membership_status"] = normalize_spaces(update_data["membership_status"])

    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    result = await db.customers.update_one({"id": customer_id}, {"$set": update_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Customer not found")

    await create_audit_log("CUSTOMER_UPDATED", "customer", customer_id, current_user["id"])
    customer = await db.customers.find_one({"id": customer_id}, {"_id": 0})
    return CustomerResponse(**customer)


@router.delete("/customers/{customer_id}")
async def delete_customer(customer_id: str, current_user: dict = Depends(get_current_user)):
    result = await db.customers.delete_one({"id": customer_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Customer not found")
    await create_audit_log("CUSTOMER_DELETED", "customer", customer_id, current_user["id"])
    return {"message": "Customer deleted"}


# ── Preferences ──────────────────────────────────────────────────────

@router.post("/preferences", response_model=PreferenceResponse)
async def create_preference(data: PreferenceCreate, current_user: dict = Depends(get_current_user)):
    existing = await db.preferences.find_one({"customer_id": data.customer_id}, sort=[("version", -1)], projection={"_id": 0, "version": 1})
    version = ((existing or {}).get("version", 0) + 1)

    pref_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    normalized = normalize_preference_payload(data)
    pref = {
        "id": pref_id,
        "customer_id": data.customer_id,
        **normalized,
        "version": version,
        "created_at": now,
        "updated_at": now
    }
    await db.preferences.insert_one(pref)
    await db.customers.update_one({"id": data.customer_id}, {"$set": {"preferences_id": pref_id, "updated_at": now}})
    await create_audit_log("PREFERENCE_CREATED", "preference", pref_id, current_user["id"])
    return PreferenceResponse(**pref)


@router.get("/preferences/customer/{customer_id}", response_model=PreferenceResponse)
async def get_customer_preference(customer_id: str, current_user: dict = Depends(get_current_user)):
    pref = await db.preferences.find({"customer_id": customer_id}, {"_id": 0}).sort("version", -1).limit(1).to_list(1)
    if not pref:
        raise HTTPException(status_code=404, detail="Preferences not found")
    return PreferenceResponse(**pref[0])


# ══════════════════════════════════════════════════════════════════════
# Pickup Image para Clientes
# ══════════════════════════════════════════════════════════════════════

@router.get("/order/{order_id}/pickup-image/view")
async def get_customer_pickup_image(
    order_id: str,
    current_customer: dict = Depends(get_current_customer)
):
    """
    Permite al cliente ver la imagen de recolección de su orden.
    """
    # Buscar la orden por múltiples campos
    order = await db.orders.find_one({
        "$or": [
            {"id": order_id},
            {"order_id": order_id},
            {"order_number": order_id}
        ]
    }, {"_id": 0})
    
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    # Verificar que la orden pertenece al cliente
    customer_id = current_customer["id"]
    customer_email = current_customer.get("email", "").lower()
    order_customer_id = order.get("customer_id", "")
    order_email = (order.get("customer_email") or "").lower()
    
    # Verificar propiedad por ID o email
    authorized = False
    if order_customer_id == customer_id or order_email == customer_email:
        authorized = True
    else:
        linked_ids = await _get_customer_ids_by_email(customer_email) if customer_email else set()
        if order_customer_id in linked_ids:
            authorized = True
    
    if not authorized:
        raise HTTPException(status_code=403, detail="Not your order")
    
    real_order_id = order.get("id") or order.get("order_id") or order_id
    
    # Buscar imagen en la colección pickup_images
    image_record = await db.pickup_images.find_one(
        {"order_id": real_order_id},
        {"_id": 0},
        sort=[("created_at", -1)]
    )
    
    # Si no hay en colección, buscar en la orden directamente
    if not image_record and order.get("pickup_image_data"):
        data = base64.b64decode(order["pickup_image_data"])
        return Response(
            content=data,
            media_type="image/jpeg",
            headers={
                "Content-Disposition": f'inline; filename="pickup_{real_order_id}.jpg"',
                "Cache-Control": "private, max-age=86400",
            }
        )
    
    if not image_record:
        raise HTTPException(status_code=404, detail="No pickup image found for this order")
    
    # ✅ CORREGIDO: definir data_b64 antes de usarla
    data_b64 = image_record.get("data_base64")
    if not data_b64:
        raise HTTPException(status_code=404, detail="No image data available")
    
    data = base64.b64decode(data_b64)
    filename = image_record.get('original_filename') or f"pickup_{real_order_id}.jpg"
    
    return Response(
        content=data,
        media_type=image_record.get("content_type", "image/jpeg"),
        headers={
            "Content-Disposition": f'inline; filename="{filename}"',
            "Cache-Control": "private, max-age=86400",
        }
    )


@router.get("/order/{order_id}/pickup-image")
async def get_customer_pickup_image_info(
    order_id: str,
    current_customer: dict = Depends(get_current_customer)
):
    """
    Obtiene información/metadatos de la imagen de recolección.
    """
    order = await db.orders.find_one({
        "$or": [
            {"id": order_id},
            {"order_id": order_id},
            {"order_number": order_id}
        ]
    }, {"_id": 0})
    
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    customer_id = current_customer["id"]
    customer_email = current_customer.get("email", "").lower()
    order_customer_id = order.get("customer_id", "")
    order_email = (order.get("customer_email") or "").lower()
    
    authorized = False
    if order_customer_id == customer_id or order_email == customer_email:
        authorized = True
    else:
        linked_ids = await _get_customer_ids_by_email(customer_email) if customer_email else set()
        if order_customer_id in linked_ids:
            authorized = True
    
    if not authorized:
        raise HTTPException(status_code=403, detail="Not your order")
    
    real_order_id = order.get("id") or order.get("order_id") or order_id
    
    image_record = await db.pickup_images.find_one(
        {"order_id": real_order_id},
        {"_id": 0, "data_base64": 0},
        sort=[("created_at", -1)]
    )
    
    if image_record:
        return {
            "exists": True,
            "image_id": image_record["id"],
            "filename": image_record.get("original_filename"),
            "uploaded_at": image_record.get("created_at"),
            "size": image_record.get("size"),
            "url": f"/api/order/{real_order_id}/pickup-image/view"
        }
    
    if order.get("pickup_image_data") or order.get("pickup_image_id"):
        return {
            "exists": True,
            "url": f"/api/order/{real_order_id}/pickup-image/view"
        }
    
    return {"exists": False}


# ══════════════════════════════════════════════════════════════════════
# Delivery Image para Clientes
# ══════════════════════════════════════════════════════════════════════

@router.get("/order/{order_id}/delivery-image/view")
async def get_customer_delivery_image(
    order_id: str,
    current_customer: dict = Depends(get_current_customer)
):
    """
    Permite al cliente ver la imagen de entrega de su orden.
    """
    order = await db.orders.find_one({
        "$or": [
            {"id": order_id},
            {"order_id": order_id},
            {"order_number": order_id}
        ]
    }, {"_id": 0})

    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    # Verificar propiedad
    customer_id = current_customer["id"]
    customer_email = current_customer.get("email", "").lower()
    order_customer_id = order.get("customer_id", "")
    order_email = (order.get("customer_email") or "").lower()

    authorized = False
    if order_customer_id == customer_id or order_email == customer_email:
        authorized = True
    else:
        linked_ids = await _get_customer_ids_by_email(customer_email) if customer_email else set()
        if order_customer_id in linked_ids:
            authorized = True

    if not authorized:
        raise HTTPException(status_code=403, detail="Not your order")

    real_order_id = order.get("id") or order.get("order_id") or order_id

    # Buscar imagen en delivery_images
    image_record = await db.delivery_images.find_one(
        {"order_id": real_order_id},
        {"_id": 0},
        sort=[("created_at", -1)]
    )

    # Si no hay en colección, buscar en la orden directamente
    if not image_record and order.get("delivery_image_data"):
        data = base64.b64decode(order["delivery_image_data"])
        return Response(
            content=data,
            media_type="image/jpeg",
            headers={
                "Content-Disposition": f'inline; filename="delivery_{real_order_id}.jpg"',
                "Cache-Control": "private, max-age=86400",
            }
        )

    if not image_record:
        raise HTTPException(status_code=404, detail="No delivery image found for this order")

    data_b64 = image_record.get("data_base64")
    if not data_b64:
        raise HTTPException(status_code=404, detail="Imagen no disponible")

    data = base64.b64decode(data_b64)
    filename = image_record.get('original_filename') or f"delivery_{real_order_id}.jpg"

    return Response(
        content=data,
        media_type=image_record.get("content_type", "image/jpeg"),
        headers={
            "Content-Disposition": f'inline; filename="{filename}"',
            "Cache-Control": "private, max-age=86400",
        }
    )


@router.get("/order/{order_id}/delivery-image")
async def get_customer_delivery_image_info(
    order_id: str,
    current_customer: dict = Depends(get_current_customer)
):
    """
    Metadatos de la imagen de entrega para el cliente.
    """
    order = await db.orders.find_one({
        "$or": [
            {"id": order_id},
            {"order_id": order_id},
            {"order_number": order_id}
        ]
    }, {"_id": 0})

    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    customer_id = current_customer["id"]
    customer_email = current_customer.get("email", "").lower()
    order_customer_id = order.get("customer_id", "")
    order_email = (order.get("customer_email") or "").lower()

    authorized = False
    if order_customer_id == customer_id or order_email == customer_email:
        authorized = True
    else:
        linked_ids = await _get_customer_ids_by_email(customer_email) if customer_email else set()
        if order_customer_id in linked_ids:
            authorized = True

    if not authorized:
        raise HTTPException(status_code=403, detail="Not your order")

    real_order_id = order.get("id") or order.get("order_id") or order_id

    image_record = await db.delivery_images.find_one(
        {"order_id": real_order_id},
        {"_id": 0, "data_base64": 0},
        sort=[("created_at", -1)]
    )

    if image_record:
        return {
            "exists": True,
            "image_id": image_record["id"],
            "filename": image_record.get("original_filename"),
            "uploaded_at": image_record.get("created_at"),
            "size": image_record.get("size"),
            "url": f"/api/order/{real_order_id}/delivery-image/view"
        }

    if order.get("delivery_image_data") or order.get("delivery_image_id"):
        return {
            "exists": True,
            "url": f"/api/order/{real_order_id}/delivery-image/view"
        }

    return {"exists": False}