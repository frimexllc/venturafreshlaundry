"""
Store module - Products, Cart, and Stripe Payment Integration
"""
from fastapi import APIRouter, HTTPException, Request, Depends
from pydantic import BaseModel, Field
from typing import List, Optional, Dict
from datetime import datetime, timezone
import uuid
import os
import shutil
import secrets
import string
import hashlib
from fastapi import File, UploadFile, Form
from pathlib import Path
import openrouteservice
import requests
from motor.motor_asyncio import AsyncIOMotorClient
from utils import normalize_email, normalize_phone, normalize_spaces, normalize_preference_dict
from notifications import notify_store_order
from auth import get_current_user, require_admin
import logging

logger = logging.getLogger(__name__)

UPLOAD_DIR = Path("uploads/products")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

# Stripe integration
try:
    from emergentintegrations.payments.stripe.checkout import (
        StripeCheckout,
        CheckoutSessionResponse,
        CheckoutStatusResponse,
        CheckoutSessionRequest,
    )
    STRIPE_AVAILABLE = True
except ImportError:
    STRIPE_AVAILABLE = False

    class CheckoutSessionRequest(BaseModel):
        amount: float
        currency: str
        success_url: str
        cancel_url: str
        metadata: Optional[Dict[str, str]] = None

    class CheckoutSessionResponse(BaseModel):
        url: str = ""
        session_id: str = ""

    class CheckoutStatusResponse(BaseModel):
        payment_status: str = ""
        status: str = ""
        amount_total: int = 0
        currency: str = ""
        metadata: Dict[str, str] = {}

    class StripeCheckout:
        def __init__(self, api_key: str, webhook_url: str):
            self.api_key = api_key
            self.webhook_url = webhook_url

        async def create_checkout_session(self, request: CheckoutSessionRequest):
            raise RuntimeError("Stripe integration not available")

        async def get_checkout_status(self, session_id: str):
            raise RuntimeError("Stripe integration not available")

        async def handle_webhook(self, payload: bytes, signature: str):
            raise RuntimeError("Stripe integration not available")

# IMPORTANTE: prefix es "/api/store" completo
store_router = APIRouter(prefix="/api/store", tags=["Store"])

# Database reference
db = None

def set_database(database):
    global db
    db = database


PAID_PAYMENT_STATUSES = {"paid", "succeeded", "complete", "completed"}


def resolve_public_base_url(request: Request) -> str:
    app_url = os.environ.get("APP_URL")
    if app_url:
        return app_url.rstrip("/")

    forwarded_host = request.headers.get("x-forwarded-host")
    if forwarded_host:
        proto = request.headers.get("x-forwarded-proto", "https")
        host = forwarded_host.split(",")[0].strip()
        if host:
            return f"{proto}://{host}"

    return str(request.base_url).rstrip("/")


def normalize_payment_status(payment_status: Optional[str], session_status: Optional[str] = None) -> str:
    raw_payment = (payment_status or "").strip().lower()
    raw_session = (session_status or "").strip().lower()

    if raw_payment in PAID_PAYMENT_STATUSES or raw_session in {"complete", "completed"}:
        return "paid"

    if raw_payment in {"expired", "failed", "canceled", "cancelled"}:
        return raw_payment

    if not raw_payment or raw_payment in {"unpaid", "open", "pending", "processing", "requires_action", "requires_payment_method"}:
        return "pending"

    return raw_payment


def is_paid(payment_status: Optional[str], session_status: Optional[str] = None) -> bool:
    return normalize_payment_status(payment_status, session_status) == "paid"


def get_store_config():
    store_address = os.environ.get("STORE_ADDRESS")
    ors_api_key = os.environ.get("ORS_API_KEY")
    rate_per_km = os.environ.get("SHIPPING_RATE_PER_KM")
    min_fee = os.environ.get("SHIPPING_MIN_FEE")
    max_fee = os.environ.get("SHIPPING_MAX_FEE")
    if not store_address:
        raise HTTPException(status_code=500, detail="Store address not configured")
    if not ors_api_key:
        raise HTTPException(status_code=500, detail="ORS API key not configured")
    if not rate_per_km or not min_fee or not max_fee:
        raise HTTPException(status_code=500, detail="Shipping rates not configured")
    return store_address, ors_api_key, float(rate_per_km), float(min_fee), float(max_fee)


def get_ors_client():
    _, ors_api_key, _, _, _ = get_store_config()
    return openrouteservice.Client(key=ors_api_key)


def geocode_address(address: str):
    _, ors_api_key, _, _, _ = get_store_config()
    normalized_address = normalize_spaces(address)
    if not normalized_address:
        raise HTTPException(status_code=400, detail="Unable to geocode address")

    attempts = [
        {
            "api_key": ors_api_key,
            "text": normalized_address,
            "size": 1,
            "boundary.country": "USA"
        },
        {
            "api_key": ors_api_key,
            "text": normalized_address,
            "size": 1
        }
    ]

    for params in attempts:
        try:
            response = requests.get(
                "https://api.openrouteservice.org/geocode/search",
                params=params,
                timeout=15
            )
        except requests.RequestException:
            continue

        if response.status_code != 200:
            continue

        result = response.json() if response.content else {}
        features = result.get("features", []) if result else []
        if not features:
            continue

        coordinates = features[0].get("geometry", {}).get("coordinates")
        if coordinates and len(coordinates) >= 2:
            return coordinates

    raise HTTPException(status_code=400, detail="Unable to geocode address")


async def calculate_shipping_fee(address: str) -> Dict[str, float]:
    store_address, _, rate_per_km, min_fee, max_fee = get_store_config()
    client = get_ors_client()
    origin_coords = geocode_address(store_address)
    destination_coords = geocode_address(address)
    matrix = client.distance_matrix(
        locations=[origin_coords, destination_coords],
        profile="driving-car",
        metrics=["distance"],
        units="km"
    )
    distances = matrix.get("distances") if matrix else None
    if not distances or distances[0][1] is None:
        raise HTTPException(status_code=400, detail="Unable to calculate distance")
    distance_km = float(distances[0][1])
    if distance_km > 200:
        distance_km = distance_km / 1000

    zones = await get_zones_with_defaults(origin_coords)
    matching = []
    for zone in zones:
        zone_type = zone.get("type")
        if zone_type == "circle":
            radius = float(zone.get("radius_km") or 0)
            if radius and haversine_km(origin_coords, destination_coords) <= radius:
                matching.append(zone)
        elif zone_type == "polygon":
            polygon = zone.get("polygon") or []
            if polygon and point_in_polygon(destination_coords, polygon):
                matching.append(zone)

    if not matching:
        raise HTTPException(status_code=400, detail="Address outside delivery zones")

    best_zone = None
    best_fee = None
    for zone in matching:
        z_rate = float(zone.get("rate_per_km") or rate_per_km)
        z_min = float(zone.get("min_fee") or min_fee)
        z_max = float(zone.get("max_fee") or max_fee)
        fee = distance_km * z_rate
        fee = max(fee, z_min)
        fee = min(fee, z_max)
        if best_fee is None or fee < best_fee:
            best_fee = fee
            best_zone = zone

    return {
        "distance_km": round(distance_km, 2),
        "fee": round(best_fee, 2),
        "zone_id": best_zone.get("id") if best_zone else None,
        "zone_name": best_zone.get("name") if best_zone else None
    }

def haversine_km(coord1: List[float], coord2: List[float]) -> float:
    import math
    lon1, lat1 = coord1
    lon2, lat2 = coord2
    r = 6371.0
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return 2 * r * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def point_in_polygon(point: List[float], polygon: List[List[float]]) -> bool:
    x, y = point
    inside = False
    n = len(polygon)
    if n < 3:
        return False
    p1x, p1y = polygon[0]
    for i in range(n + 1):
        p2x, p2y = polygon[i % n]
        if y > min(p1y, p2y):
            if y <= max(p1y, p2y):
                if x <= max(p1x, p2x):
                    if p1y != p2y:
                        xinters = (y - p1y) * (p2x - p1x) / (p2y - p1y) + p1x
                    else:
                        xinters = p1x
                    if p1x == p2x or x <= xinters:
                        inside = not inside
        p1x, p1y = p2x, p2y
    return inside


async def ensure_default_zone(store_center: List[float]):
    _, _, rate_per_km, min_fee, max_fee = get_store_config()
    now = datetime.now(timezone.utc).isoformat()
    existing = await db.delivery_zones.find_one({"name": "Default 10km"}, {"_id": 0})
    if existing:
        current_center = existing.get("center") or store_center
        if haversine_km(current_center, store_center) > 50:
            await db.delivery_zones.update_one(
                {"id": existing.get("id")},
                {
                    "$set": {
                        "center": store_center,
                        "radius_km": 10,
                        "rate_per_km": rate_per_km,
                        "min_fee": min_fee,
                        "max_fee": max_fee,
                        "updated_at": now
                    }
                }
            )
        return

    zone_doc = {
        "id": str(uuid.uuid4()),
        "name": "Default 10km",
        "type": "circle",
        "radius_km": 10,
        "center": store_center,
        "polygon": None,
        "rate_per_km": rate_per_km,
        "min_fee": min_fee,
        "max_fee": max_fee,
        "created_at": now,
        "updated_at": now
    }
    await db.delivery_zones.insert_one(zone_doc)


async def get_zones_with_defaults(store_center: List[float]) -> List[Dict]:
    await ensure_default_zone(store_center)
    zones = await db.delivery_zones.find({}, {"_id": 0}).sort("created_at", 1).to_list(200)
    return zones


def build_customer_snapshot(payload: dict) -> Dict:
    return {
        "name": payload.get("customer_name"),
        "email": payload.get("customer_email"),
        "phone": payload.get("customer_phone"),
        "preferred_contact": payload.get("preferred_contact")
    }


async def apply_stock_deduction(items: List[Dict]):
    for item in items:
        product_id = item.get("product_id")
        if not product_id:
            continue
        product = await db.products.find_one({"id": product_id}, {"_id": 0})
        if not product:
            continue
        new_stock = max((product.get("stock", 0) - item.get("quantity", 0)), 0)
        update_doc = {"stock": new_stock, "updated_at": datetime.now(timezone.utc).isoformat()}
        if new_stock <= 0:
            update_doc["is_active"] = False
        await db.products.update_one({"id": product_id}, {"$set": update_doc})


# ==================== MODELS ====================

class ProductCreate(BaseModel):
    name: str
    description: Optional[str] = None
    price: float = Field(..., gt=0)
    category: str
    image_url: Optional[str] = None
    stock: int = 0
    is_active: bool = True

class ProductResponse(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    price: float
    category: str
    image_url: Optional[str] = None
    stock: int
    is_active: bool
    created_at: str
    updated_at: str

class CartItem(BaseModel):
    product_id: str
    quantity: int = Field(..., gt=0)

class CartResponse(BaseModel):
    id: str
    customer_id: Optional[str] = None
    session_id: str
    items: List[Dict]
    total: float
    created_at: str
    updated_at: str

class CheckoutRequest(BaseModel):
    cart_id: str
    origin_url: str
    customer_name: Optional[str] = "Venta en tienda"
    customer_email: Optional[str] = None
    customer_phone: Optional[str] = None
    shipping_address: Optional[str] = None
    shipping_apt: Optional[str] = None
    delivery_instructions: Optional[str] = None
    notes: Optional[str] = None
    preferred_contact: Optional[str] = None
    fulfillment_type: Optional[str] = "pickup"

class ManualCheckoutRequest(CheckoutRequest):
    payment_method: str
    amount_received: Optional[float] = None

class ShippingQuoteRequest(BaseModel):
    address: str

class ShippingQuoteResponse(BaseModel):
    distance_km: float
    fee: float
    zone_id: Optional[str] = None
    zone_name: Optional[str] = None

class StorePaymentRequest(BaseModel):
    payment_method: str

class StoreStripeCheckoutRequest(BaseModel):
    origin_url: str

class StoreOrderResponse(BaseModel):
    id: str
    order_number: str
    customer_id: Optional[str] = None
    customer_name: Optional[str] = None
    customer_email: Optional[str] = None
    customer_phone: Optional[str] = None
    preferred_contact: Optional[str] = None
    items: Optional[List[Dict]] = []
    total: float
    subtotal: Optional[float] = 0.0
    shipping_fee: Optional[float] = 0.0
    shipping_distance_km: Optional[float] = 0.0
    delivery_zone_id: Optional[str] = None
    delivery_zone_name: Optional[str] = None
    fulfillment_type: Optional[str] = None
    payment_status: str
    payment_method: Optional[str] = None
    stripe_session_id: Optional[str] = None
    shipping_address: Optional[Dict] = None
    notes: Optional[str] = None
    status: str
    created_at: Optional[str] = ""
    updated_at: Optional[str] = ""


class DeliveryZoneCreate(BaseModel):
    name: str
    type: str
    radius_km: Optional[float] = None
    center: Optional[List[float]] = None
    polygon: Optional[List[List[float]]] = None
    rate_per_km: float
    min_fee: float
    max_fee: float

class DeliveryZoneResponse(BaseModel):
    id: str
    name: str
    type: str
    radius_km: Optional[float] = None
    center: Optional[List[float]] = None
    polygon: Optional[List[List[float]]] = None
    rate_per_km: float
    min_fee: float
    max_fee: float
    created_at: str
    updated_at: str


# ==================== SEED PRODUCTS ====================

async def seed_products():
    count = await db.products.count_documents({})
    if count == 0:
        products = [
            {
                "id": str(uuid.uuid4()),
                "name": "Bolsa de Lavandería Premium",
                "description": "Bolsa de malla resistente para transportar tu ropa",
                "price": 12.99,
                "category": "accesorios",
                "image_url": None,
                "stock": 50,
                "is_active": True,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "updated_at": datetime.now(timezone.utc).isoformat()
            },
            {
                "id": str(uuid.uuid4()),
                "name": "Detergente Ecológico 1L",
                "description": "Detergente biodegradable para pieles sensibles",
                "price": 8.99,
                "category": "detergentes",
                "image_url": None,
                "stock": 100,
                "is_active": True,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "updated_at": datetime.now(timezone.utc).isoformat()
            },
            {
                "id": str(uuid.uuid4()),
                "name": "Suavizante Premium 500ml",
                "description": "Suavizante con aroma a lavanda",
                "price": 6.99,
                "category": "suavizantes",
                "image_url": None,
                "stock": 75,
                "is_active": True,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "updated_at": datetime.now(timezone.utc).isoformat()
            },
            {
                "id": str(uuid.uuid4()),
                "name": "Quitamanchas Profesional",
                "description": "Elimina manchas difíciles de grasa y vino",
                "price": 14.99,
                "category": "quitamanchas",
                "image_url": None,
                "stock": 40,
                "is_active": True,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "updated_at": datetime.now(timezone.utc).isoformat()
            },
            {
                "id": str(uuid.uuid4()),
                "name": "Pack Inicial Lavandería",
                "description": "Incluye: bolsa, detergente y suavizante",
                "price": 24.99,
                "category": "packs",
                "image_url": None,
                "stock": 30,
                "is_active": True,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
        ]
        await db.products.insert_many(products)


# ==================== PRODUCT ENDPOINTS ====================

@store_router.get("/products", response_model=List[ProductResponse])
async def list_products(category: Optional[str] = None, active_only: bool = True):
    await seed_products()
    query = {}
    if active_only:
        query["is_active"] = True
        query["stock"] = {"$gt": 0}
    if category:
        query["category"] = category
    products = await db.products.find(query, {"_id": 0}).to_list(100)
    return products


@store_router.get("/products/{product_id}", response_model=ProductResponse)
async def get_product(product_id: str):
    product = await db.products.find_one({"id": product_id}, {"_id": 0})
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    return product


@store_router.post("/products", response_model=ProductResponse)
async def create_product(
    request: Request,
    name: str = Form(...),
    description: Optional[str] = Form(None),
    price: float = Form(..., gt=0),
    category: str = Form(...),
    stock: int = Form(0),
    is_active: bool = Form(True),
    image_url: Optional[str] = Form(None),
    image: Optional[UploadFile] = File(None)
):
    now = datetime.now(timezone.utc).isoformat()
    final_image_url = normalize_spaces(image_url)
    if image and image.filename:
        ext = Path(image.filename).suffix
        filename = f"{uuid.uuid4()}{ext}"
        file_path = UPLOAD_DIR / filename
        try:
            with open(file_path, "wb") as buffer:
                shutil.copyfileobj(image.file, buffer)
            base_url = resolve_public_base_url(request)
            final_image_url = f"{base_url}/uploads/products/{filename}"
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Error saving image: {str(e)}")
    
    product_doc = {
        "id": str(uuid.uuid4()),
        "name": name,
        "description": description,
        "price": price,
        "category": category,
        "image_url": final_image_url,
        "stock": stock,
        "is_active": is_active if stock > 0 else False,
        "created_at": now,
        "updated_at": now
    }
    await db.products.insert_one(product_doc)
    del product_doc["_id"]
    return product_doc


@store_router.put("/products/{product_id}", response_model=ProductResponse)
async def update_product(
    request: Request,
    product_id: str,
    name: str = Form(...),
    description: Optional[str] = Form(None),
    price: float = Form(..., gt=0),
    category: str = Form(...),
    stock: int = Form(0),
    is_active: bool = Form(True),
    image_url: Optional[str] = Form(None),
    image: Optional[UploadFile] = File(None)
):
    existing = await db.products.find_one({"id": product_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Product not found")
    
    now = datetime.now(timezone.utc).isoformat()
    final_image_url = normalize_spaces(image_url) or existing.get("image_url")
    if image and image.filename:
        if final_image_url and "/uploads/products/" in final_image_url:
            old_filename = Path(final_image_url).name
            old_path = UPLOAD_DIR / old_filename
            if old_path.exists():
                old_path.unlink()
        ext = Path(image.filename).suffix
        filename = f"{uuid.uuid4()}{ext}"
        file_path = UPLOAD_DIR / filename
        try:
            with open(file_path, "wb") as buffer:
                shutil.copyfileobj(image.file, buffer)
            base_url = resolve_public_base_url(request)
            final_image_url = f"{base_url}/uploads/products/{filename}"
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Error saving image: {str(e)}")
    
    update_data = {
        "name": name,
        "description": description,
        "price": price,
        "category": category,
        "image_url": final_image_url,
        "stock": stock,
        "is_active": is_active if stock > 0 else False,
        "updated_at": now
    }
    await db.products.update_one({"id": product_id}, {"$set": update_data})
    updated = await db.products.find_one({"id": product_id}, {"_id": 0})
    return updated


@store_router.delete("/products/{product_id}")
async def delete_product(product_id: str, current_user: dict = Depends(require_admin)):
    result = await db.products.delete_one({"id": product_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Product not found")
    return {"message": "Product deleted successfully"}


# ==================== CART ENDPOINTS ====================

@store_router.post("/cart", response_model=CartResponse)
async def create_cart():
    now = datetime.now(timezone.utc).isoformat()
    cart_doc = {
        "id": str(uuid.uuid4()),
        "customer_id": None,
        "session_id": str(uuid.uuid4()),
        "items": [],
        "total": 0.0,
        "created_at": now,
        "updated_at": now
    }
    await db.carts.insert_one(cart_doc)
    del cart_doc["_id"]
    return cart_doc


@store_router.get("/cart/{cart_id}", response_model=CartResponse)
async def get_cart(cart_id: str):
    cart = await db.carts.find_one({"id": cart_id}, {"_id": 0})
    if not cart:
        raise HTTPException(status_code=404, detail="Cart not found")
    return cart


@store_router.post("/cart/{cart_id}/items", response_model=CartResponse)
async def add_to_cart(cart_id: str, item: CartItem):
    cart = await db.carts.find_one({"id": cart_id})
    if not cart:
        raise HTTPException(status_code=404, detail="Cart not found")
    
    product = await db.products.find_one({"id": item.product_id}, {"_id": 0})
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    if not product.get("is_active") or product.get("stock", 0) <= 0:
        raise HTTPException(status_code=400, detail="Product is out of stock")
    if product["stock"] < item.quantity:
        raise HTTPException(status_code=400, detail="Insufficient stock")
    
    items = cart.get("items", [])
    found = False
    for cart_item in items:
        if cart_item["product_id"] == item.product_id:
            cart_item["quantity"] += item.quantity
            found = True
            break
    
    if not found:
        items.append({
            "product_id": item.product_id,
            "product_name": product["name"],
            "price": product["price"],
            "quantity": item.quantity
        })
    
    total = sum(i["price"] * i["quantity"] for i in items)
    await db.carts.update_one(
        {"id": cart_id},
        {
            "$set": {
                "items": items,
                "total": round(total, 2),
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
        }
    )
    updated_cart = await db.carts.find_one({"id": cart_id}, {"_id": 0})
    return updated_cart


@store_router.put("/cart/{cart_id}/items/{product_id}", response_model=CartResponse)
async def update_cart_item(cart_id: str, product_id: str, quantity: int):
    cart = await db.carts.find_one({"id": cart_id})
    if not cart:
        raise HTTPException(status_code=404, detail="Cart not found")
    
    items = cart.get("items", [])
    if quantity > 0:
        product = await db.products.find_one({"id": product_id}, {"_id": 0})
        if not product:
            raise HTTPException(status_code=404, detail="Product not found")
        if not product.get("is_active") or product.get("stock", 0) <= 0:
            raise HTTPException(status_code=400, detail="Product is out of stock")
        if product.get("stock", 0) < quantity:
            raise HTTPException(status_code=400, detail="Insufficient stock")
    
    if quantity <= 0:
        items = [i for i in items if i["product_id"] != product_id]
    else:
        for item in items:
            if item["product_id"] == product_id:
                item["quantity"] = quantity
                break
    
    total = sum(i["price"] * i["quantity"] for i in items)
    await db.carts.update_one(
        {"id": cart_id},
        {
            "$set": {
                "items": items,
                "total": round(total, 2),
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
        }
    )
    updated_cart = await db.carts.find_one({"id": cart_id}, {"_id": 0})
    return updated_cart


@store_router.delete("/cart/{cart_id}/items/{product_id}", response_model=CartResponse)
async def remove_from_cart(cart_id: str, product_id: str):
    return await update_cart_item(cart_id, product_id, 0)


@store_router.delete("/cart/{cart_id}")
async def clear_cart(cart_id: str):
    result = await db.carts.update_one(
        {"id": cart_id},
        {
            "$set": {
                "items": [],
                "total": 0.0,
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
        }
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Cart not found")
    return {"message": "Cart cleared successfully"}


# ==================== SHIPPING & ADDRESS VALIDATION ====================

@store_router.post("/shipping/quote", response_model=ShippingQuoteResponse)
async def get_shipping_quote(payload: ShippingQuoteRequest):
    if not payload.address:
        raise HTTPException(status_code=400, detail="Address required")
    result = await calculate_shipping_fee(payload.address)
    return result


class AddressCheckRequest(BaseModel):
    address: str

@store_router.post("/check-address")
async def check_address(request: AddressCheckRequest):
    try:
        result = await calculate_shipping_fee(request.address)
        return {
            "valid": True,
            "distance_km": result["distance_km"],
            "zone_id": result["zone_id"],
            "zone_name": result["zone_name"]
        }
    except HTTPException as e:
        return {
            "valid": False,
            "error": e.detail
        }


@store_router.get("/delivery-zones")
async def list_delivery_zones():
    store_address, _, _, _, _ = get_store_config()
    store_center = geocode_address(store_address)
    zones = await get_zones_with_defaults(store_center)
    return {"store_center": store_center, "zones": zones}


@store_router.post("/delivery-zones", response_model=DeliveryZoneResponse)
async def create_delivery_zone(zone: DeliveryZoneCreate, current_user: dict = Depends(require_admin)):
    now = datetime.now(timezone.utc).isoformat()
    if zone.type not in ["circle", "polygon"]:
        raise HTTPException(status_code=400, detail="Invalid zone type")
    if zone.type == "circle":
        if not zone.center or not zone.radius_km:
            raise HTTPException(status_code=400, detail="Circle requires center and radius")
    if zone.type == "polygon":
        if not zone.polygon or len(zone.polygon) < 3:
            raise HTTPException(status_code=400, detail="Polygon requires at least 3 points")

    zone_doc = {
        "id": str(uuid.uuid4()),
        "name": normalize_spaces(zone.name),
        "type": zone.type,
        "radius_km": zone.radius_km,
        "center": zone.center,
        "polygon": zone.polygon,
        "rate_per_km": zone.rate_per_km,
        "min_fee": zone.min_fee,
        "max_fee": zone.max_fee,
        "created_at": now,
        "updated_at": now
    }
    await db.delivery_zones.insert_one(zone_doc)
    return zone_doc


@store_router.put("/delivery-zones/{zone_id}", response_model=DeliveryZoneResponse)
async def update_delivery_zone(zone_id: str, zone: DeliveryZoneCreate, current_user: dict = Depends(require_admin)):
    if zone.type not in ["circle", "polygon"]:
        raise HTTPException(status_code=400, detail="Invalid zone type")
    update_doc = {
        "name": normalize_spaces(zone.name),
        "type": zone.type,
        "radius_km": zone.radius_km,
        "center": zone.center,
        "polygon": zone.polygon,
        "rate_per_km": zone.rate_per_km,
        "min_fee": zone.min_fee,
        "max_fee": zone.max_fee,
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    result = await db.delivery_zones.update_one({"id": zone_id}, {"$set": update_doc})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Zone not found")
    updated = await db.delivery_zones.find_one({"id": zone_id}, {"_id": 0})
    return updated


@store_router.delete("/delivery-zones/{zone_id}")
async def delete_delivery_zone(zone_id: str, current_user: dict = Depends(require_admin)):
    result = await db.delivery_zones.delete_one({"id": zone_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Zone not found")
    return {"message": "Zone deleted"}


# ==================== CHECKOUT & PAYMENT ENDPOINTS ====================

@store_router.post("/checkout")
async def create_checkout_session(checkout: CheckoutRequest, request: Request):
    if not STRIPE_AVAILABLE:
        raise HTTPException(status_code=503, detail="Stripe integration not available")

    cart = await db.carts.find_one({"id": checkout.cart_id})
    if not cart:
        raise HTTPException(status_code=404, detail="Cart not found")
    if not cart.get("items") or len(cart["items"]) == 0:
        raise HTTPException(status_code=400, detail="Cart is empty")

    for item in cart["items"]:
        product = await db.products.find_one({"id": item["product_id"]}, {"_id": 0})
        if not product:
            raise HTTPException(status_code=404, detail="Product not found")
        if not product.get("is_active") or product.get("stock", 0) <= 0:
            raise HTTPException(status_code=400, detail="Product is out of stock")
        if product.get("stock", 0) < item["quantity"]:
            raise HTTPException(status_code=400, detail="Insufficient stock")

    fulfillment_type = (checkout.fulfillment_type or "delivery").lower()
    subtotal = float(cart["total"])
    shipping_fee = 0.0
    shipping_distance_km = 0.0
    delivery_zone_id = None
    delivery_zone_name = None

    if fulfillment_type == "delivery":
        if not checkout.shipping_address:
            raise HTTPException(status_code=400, detail="Shipping address required")
        shipping_quote = await calculate_shipping_fee(checkout.shipping_address)
        shipping_fee = shipping_quote["fee"]
        shipping_distance_km = shipping_quote["distance_km"]
        delivery_zone_id = shipping_quote.get("zone_id")
        delivery_zone_name = shipping_quote.get("zone_name")

    total = round(subtotal + shipping_fee, 2)

    stripe_api_key = os.environ.get("STRIPE_API_KEY")
    if not stripe_api_key:
        raise HTTPException(status_code=500, detail="Payment configuration error")

    host_url = resolve_public_base_url(request)
    webhook_url = f"{host_url}/api/webhook/stripe"
    success_url = f"{checkout.origin_url}/store?session_id={{CHECKOUT_SESSION_ID}}&status=success"
    cancel_url = f"{checkout.origin_url}/store?status=cancelled"

    stripe_checkout = StripeCheckout(api_key=stripe_api_key, webhook_url=webhook_url)

    now = datetime.now(timezone.utc).isoformat()
    order_number = f"SO-{datetime.now().strftime('%Y%m%d')}-{str(uuid.uuid4())[:8].upper()}"
    normalized_email = normalize_email(checkout.customer_email) if checkout.customer_email else None
    normalized_phone = normalize_phone(checkout.customer_phone) if checkout.customer_phone else None

    store_address, _, _, _, _ = get_store_config()
    shipping_address_value = checkout.shipping_address if checkout.shipping_address else store_address
    shipping_address = {
        "address": normalize_spaces(shipping_address_value),
        "apt": normalize_spaces(checkout.shipping_apt) if checkout.shipping_apt else None,
        "instructions": normalize_spaces(checkout.delivery_instructions) if checkout.delivery_instructions else None
    }

    order_doc = {
        "id": str(uuid.uuid4()),
        "order_number": order_number,
        "customer_id": cart.get("customer_id"),
        "customer_name": normalize_spaces(checkout.customer_name) if checkout.customer_name else "Venta en tienda",
        "customer_email": normalized_email,
        "customer_phone": normalized_phone,
        "preferred_contact": checkout.preferred_contact,
        "items": cart["items"],
        "subtotal": subtotal,
        "shipping_fee": shipping_fee,
        "shipping_distance_km": shipping_distance_km,
        "delivery_zone_id": delivery_zone_id,
        "delivery_zone_name": delivery_zone_name,
        "fulfillment_type": fulfillment_type,
        "total": total,
        "payment_status": "pending",
        "payment_method": "card",
        "stripe_session_id": None,
        "shipping_address": shipping_address,
        "notes": normalize_spaces(checkout.notes) if checkout.notes else None,
        "status": "pending",
        "created_at": now,
        "updated_at": now
    }

    try:
        checkout_request = CheckoutSessionRequest(
            amount=float(total),
            currency="usd",
            success_url=success_url,
            cancel_url=cancel_url,
            metadata={
                "order_id": order_doc["id"],
                "order_number": order_number,
                "cart_id": checkout.cart_id,
                "customer_email": normalized_email or ""
            }
        )
        session: CheckoutSessionResponse = await stripe_checkout.create_checkout_session(checkout_request)

        order_doc["stripe_session_id"] = session.session_id
        await db.store_orders.insert_one(order_doc)

        payment_doc = {
            "id": str(uuid.uuid4()),
            "session_id": session.session_id,
            "order_id": order_doc["id"],
            "order_number": order_number,
            "amount": total,
            "currency": "usd",
            "customer_email": normalized_email,
            "payment_status": "initiated",
            "metadata": {
                "cart_id": checkout.cart_id,
                "items_count": len(cart["items"])
            },
            "created_at": now,
            "updated_at": now
        }
        await db.payment_transactions.insert_one(payment_doc)

        return {
            "checkout_url": session.url,
            "session_id": session.session_id,
            "order_id": order_doc["id"],
            "order_number": order_number,
            "shipping_fee": shipping_fee,
            "shipping_distance_km": shipping_distance_km,
            "total": total
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create checkout session: {str(e)}")


@store_router.post("/checkout/manual")
async def create_manual_checkout(checkout: ManualCheckoutRequest):
    cart = await db.carts.find_one({"id": checkout.cart_id})
    if not cart:
        raise HTTPException(status_code=404, detail="Cart not found")
    if not cart.get("items"):
        raise HTTPException(status_code=400, detail="Cart is empty")

    for item in cart["items"]:
        product = await db.products.find_one({"id": item["product_id"]}, {"_id": 0})
        if not product:
            raise HTTPException(status_code=404, detail="Product not found")
        if not product.get("is_active") or product.get("stock", 0) <= 0:
            raise HTTPException(status_code=400, detail="Product is out of stock")
        if product.get("stock", 0) < item["quantity"]:
            raise HTTPException(status_code=400, detail="Insufficient stock")

    fulfillment_type = (checkout.fulfillment_type or "delivery").lower()
    subtotal = float(cart["total"])
    shipping_fee = 0.0
    shipping_distance_km = 0.0
    delivery_zone_id = None
    delivery_zone_name = None

    if fulfillment_type == "delivery":
        if not checkout.shipping_address:
            raise HTTPException(status_code=400, detail="Shipping address required")
        shipping_quote = await calculate_shipping_fee(checkout.shipping_address)
        shipping_fee = shipping_quote["fee"]
        shipping_distance_km = shipping_quote["distance_km"]
        delivery_zone_id = shipping_quote.get("zone_id")
        delivery_zone_name = shipping_quote.get("zone_name")

    total = round(subtotal + shipping_fee, 2)

    payment_method = normalize_spaces(checkout.payment_method).lower()
    if payment_method not in ["cash", "transfer", "other"]:
        raise HTTPException(status_code=400, detail="Invalid payment method")

    now = datetime.now(timezone.utc).isoformat()
    order_number = f"SO-{datetime.now().strftime('%Y%m%d')}-{str(uuid.uuid4())[:8].upper()}"
    normalized_email = normalize_email(checkout.customer_email) if checkout.customer_email else None
    normalized_phone = normalize_phone(checkout.customer_phone) if checkout.customer_phone else None

    store_address, _, _, _, _ = get_store_config()
    shipping_address_value = checkout.shipping_address if checkout.shipping_address else store_address
    shipping_address = {
        "address": normalize_spaces(shipping_address_value),
        "apt": normalize_spaces(checkout.shipping_apt) if checkout.shipping_apt else None,
        "instructions": normalize_spaces(checkout.delivery_instructions) if checkout.delivery_instructions else None
    }

    order_doc = {
        "id": str(uuid.uuid4()),
        "order_number": order_number,
        "customer_id": cart.get("customer_id"),
        "customer_name": normalize_spaces(checkout.customer_name) if checkout.customer_name else "Venta en tienda",
        "customer_email": normalized_email,
        "customer_phone": normalized_phone,
        "preferred_contact": checkout.preferred_contact,
        "items": cart["items"],
        "subtotal": subtotal,
        "shipping_fee": shipping_fee,
        "shipping_distance_km": shipping_distance_km,
        "delivery_zone_id": delivery_zone_id,
        "delivery_zone_name": delivery_zone_name,
        "fulfillment_type": fulfillment_type,
        "total": total,
        "payment_status": "paid",
        "payment_method": payment_method,
        "stripe_session_id": None,
        "shipping_address": shipping_address,
        "notes": normalize_spaces(checkout.notes) if checkout.notes else None,
        "status": "confirmed",
        "created_at": now,
        "updated_at": now
    }

    await db.store_orders.insert_one(order_doc)
    payment_doc = {
        "id": str(uuid.uuid4()),
        "session_id": f"manual-{order_doc['id']}",
        "order_id": order_doc["id"],
        "order_number": order_number,
        "amount": total,
        "currency": "usd",
        "customer_email": normalized_email,
        "payment_status": "paid",
        "metadata": {
            "cart_id": checkout.cart_id,
            "items_count": len(cart["items"]),
            "payment_method": payment_method
        },
        "created_at": now,
        "updated_at": now
    }
    await db.payment_transactions.insert_one(payment_doc)

    finance_entry = {
        "id": str(uuid.uuid4()),
        "type": "income",
        "category": "store_sale",
        "description": f"Venta tienda {order_number}",
        "amount": float(total),
        "payment_method": payment_method,
        "order_id": order_doc["id"],
        "order_number": order_number,
        "customer_name": order_doc.get("customer_name"),
        "date": now[:10],
        "created_at": now,
        "updated_at": now,
    }
    await db.finances.insert_one(finance_entry)

    await apply_stock_deduction(order_doc.get("items", []))
    customer_snapshot = build_customer_snapshot({
        "customer_name": order_doc.get("customer_name"),
        "customer_email": order_doc.get("customer_email"),
        "customer_phone": order_doc.get("customer_phone"),
        "preferred_contact": order_doc.get("preferred_contact")
    })
    await notify_store_order(customer_snapshot, order_doc)

    await db.carts.update_one(
        {"id": checkout.cart_id},
        {
            "$set": {
                "items": [],
                "total": 0.0,
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
        }
    )

    return {
        "order_id": order_doc["id"],
        "order_number": order_number,
        "total": total,
        "shipping_fee": shipping_fee,
        "shipping_distance_km": shipping_distance_km,
        "status": "paid"
    }


@store_router.get("/checkout/status/{session_id}")
async def get_checkout_status(session_id: str):
    if not STRIPE_AVAILABLE:
        raise HTTPException(status_code=503, detail="Stripe integration not available")
    stripe_api_key = os.environ.get("STRIPE_API_KEY")
    if not stripe_api_key:
        raise HTTPException(status_code=500, detail="Payment configuration error")
    
    stripe_checkout = StripeCheckout(api_key=stripe_api_key, webhook_url="")
    
    try:
        status: CheckoutStatusResponse = await stripe_checkout.get_checkout_status(session_id)
        payment_status = normalize_payment_status(status.payment_status, status.status)

        await db.payment_transactions.update_one(
            {"session_id": session_id},
            {
                "$set": {
                    "payment_status": payment_status,
                    "updated_at": datetime.now(timezone.utc).isoformat()
                }
            }
        )

        if payment_status == "paid":
            transaction = await db.payment_transactions.find_one({"session_id": session_id}, {"_id": 0})
            order_id = transaction.get("order_id") if transaction else None
            order = None
            if order_id:
                order = await db.store_orders.find_one({"id": order_id}, {"_id": 0})
            if not order:
                order = await db.store_orders.find_one({"stripe_session_id": session_id}, {"_id": 0})

            if order and (order.get("payment_status") or "").lower() != "paid":
                now = datetime.now(timezone.utc).isoformat()
                await db.store_orders.update_one(
                    {"id": order.get("id")},
                    {
                        "$set": {
                            "payment_status": "paid",
                            "payment_method": "card",
                            "status": "confirmed",
                            "updated_at": now
                        }
                    }
                )
                await apply_stock_deduction(order.get("items", []))
                customer_snapshot = {
                    "name": order.get("customer_name"),
                    "email": order.get("customer_email"),
                    "phone": order.get("customer_phone"),
                    "preferred_contact": order.get("preferred_contact")
                }
                order_for_notify = {
                    **order,
                    "payment_status": "paid",
                    "payment_method": "card",
                    "status": "confirmed"
                }
                await notify_store_order(customer_snapshot, order_for_notify)

        return {
            "status": status.status,
            "payment_status": payment_status,
            "amount_total": status.amount_total / 100,
            "currency": status.currency,
            "metadata": status.metadata
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get checkout status: {str(e)}")


# ==================== STORE ORDERS ENDPOINTS (CORREGIDOS) ====================

# En store.py, reemplaza estos endpoints:

@store_router.get("/orders", response_model=List[StoreOrderResponse])
async def list_store_orders(
    status: Optional[str] = None, 
    limit: int = 50,
    current_user: dict = Depends(get_current_user)   # ← Cambiado
):
    """List store orders - admin y operator"""
    if db is None:
        raise HTTPException(status_code=500, detail="Database not initialized")
    
    # Permitir admin y operator
    if current_user.get("role") not in ["admin", "operator"]:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    query = {}
    if status:
        query["status"] = status
    
    try:
        orders = await db.store_orders.find(query, {"_id": 0}).sort("created_at", -1).to_list(limit)
        return orders
    except Exception as e:
        logger.error(f"Error fetching store orders: {e}")
        raise HTTPException(status_code=500, detail=f"Error fetching orders: {str(e)}")


@store_router.get("/orders/{order_id}", response_model=StoreOrderResponse)
async def get_store_order(order_id: str, current_user: dict = Depends(get_current_user)):
    """Get a store order by ID"""
    if current_user.get("role") not in ["admin", "operator"]:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    order = await db.store_orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    # Si es operator, puede ver cualquier orden (o limitar según negocio)
    return order


@store_router.get("/orders/{order_id}", response_model=StoreOrderResponse)
async def get_store_order(order_id: str, current_user: dict = Depends(get_current_user)):
    order = await db.store_orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    if current_user.get("role") != "admin":
        if order.get("customer_email") != current_user.get("email"):
            raise HTTPException(status_code=403, detail="Not authorized to view this order")
    
    return order


@store_router.get("/orders/by-session/{session_id}", response_model=StoreOrderResponse)
async def get_order_by_session(session_id: str, current_user: dict = Depends(get_current_user)):
    order = await db.store_orders.find_one({"stripe_session_id": session_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    if current_user.get("role") != "admin":
        if order.get("customer_email") != current_user.get("email"):
            raise HTTPException(status_code=403, detail="Not authorized")
    
    return order


@store_router.put("/orders/{order_id}/status")
async def update_order_status(order_id: str, status: str, current_user: dict = Depends(require_admin)):
    valid_statuses = ["pending", "confirmed", "processing", "shipped", "delivered", "cancelled"]
    if status not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {valid_statuses}")
    
    result = await db.store_orders.update_one(
        {"id": order_id},
        {
            "$set": {
                "status": status,
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
        }
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Order not found")
    
    return {"message": f"Order status updated to {status}"}


@store_router.post("/orders/{order_id}/payment")
async def register_store_order_payment(order_id: str, payload: StorePaymentRequest, current_user: dict = Depends(require_admin)):
    order = await db.store_orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if (order.get("payment_status") or "").lower() == "paid":
        raise HTTPException(status_code=400, detail="Order already paid")

    payment_method = normalize_spaces(payload.payment_method).lower()
    if payment_method not in ["cash", "transfer", "other"]:
        raise HTTPException(status_code=400, detail="Invalid payment method")

    now = datetime.now(timezone.utc).isoformat()
    await db.store_orders.update_one(
        {"id": order_id},
        {
            "$set": {
                "payment_status": "paid",
                "payment_method": payment_method,
                "status": "confirmed",
                "updated_at": now
            }
        }
    )

    payment_doc = {
        "id": str(uuid.uuid4()),
        "session_id": f"manual-{order_id}-{str(uuid.uuid4())[:6]}",
        "order_id": order_id,
        "order_number": order.get("order_number"),
        "amount": order.get("total", 0),
        "currency": "usd",
        "customer_email": order.get("customer_email"),
        "payment_status": "paid",
        "metadata": {
            "payment_method": payment_method
        },
        "created_at": now,
        "updated_at": now
    }
    await db.payment_transactions.insert_one(payment_doc)

    finance_entry = {
        "id": str(uuid.uuid4()),
        "type": "income",
        "category": "store_sale",
        "description": f"Pago tienda {order.get('order_number', order_id)}",
        "amount": float(order.get("total", 0)),
        "payment_method": payment_method,
        "order_id": order_id,
        "order_number": order.get("order_number"),
        "customer_name": order.get("customer_name"),
        "date": now[:10],
        "created_at": now,
        "updated_at": now,
    }
    await db.finances.insert_one(finance_entry)

    await apply_stock_deduction(order.get("items", []))
    customer_snapshot = {
        "name": order.get("customer_name"),
        "email": order.get("customer_email"),
        "phone": order.get("customer_phone"),
        "preferred_contact": order.get("preferred_contact")
    }
    order_for_notify = {**order, "payment_method": payment_method, "payment_status": "paid"}
    await notify_store_order(customer_snapshot, order_for_notify)

    return {"message": "Payment registered"}


@store_router.post("/orders/{order_id}/stripe-checkout")
async def create_store_order_checkout(order_id: str, payload: StoreStripeCheckoutRequest, request: Request, current_user: dict = Depends(require_admin)):
    if not STRIPE_AVAILABLE:
        raise HTTPException(status_code=503, detail="Stripe integration not available")
    order = await db.store_orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if (order.get("payment_status") or "").lower() == "paid":
        raise HTTPException(status_code=400, detail="Order already paid")

    stripe_api_key = os.environ.get("STRIPE_API_KEY")
    if not stripe_api_key:
        raise HTTPException(status_code=500, detail="Payment configuration error")

    host_url = resolve_public_base_url(request)
    webhook_url = f"{host_url}/api/webhook/stripe"
    success_url = f"{payload.origin_url}/admin/operator?store_session_id={{CHECKOUT_SESSION_ID}}&order_id={order_id}"
    cancel_url = f"{payload.origin_url}/admin/operator?order_id={order_id}&status=cancelled"

    stripe_checkout = StripeCheckout(api_key=stripe_api_key, webhook_url=webhook_url)
    checkout_request = CheckoutSessionRequest(
        amount=float(order.get("total", 0)),
        currency="usd",
        success_url=success_url,
        cancel_url=cancel_url,
        metadata={
            "order_id": order_id,
            "order_number": order.get("order_number") or ""
        }
    )
    session: CheckoutSessionResponse = await stripe_checkout.create_checkout_session(checkout_request)

    now = datetime.now(timezone.utc).isoformat()
    await db.store_orders.update_one(
        {"id": order_id},
        {
            "$set": {
                "stripe_session_id": session.session_id,
                "payment_status": "pending",
                "payment_method": "card",
                "updated_at": now
            }
        }
    )

    payment_doc = {
        "id": str(uuid.uuid4()),
        "session_id": session.session_id,
        "order_id": order_id,
        "order_number": order.get("order_number"),
        "amount": order.get("total", 0),
        "currency": "usd",
        "customer_email": order.get("customer_email"),
        "payment_status": "initiated",
        "metadata": {
            "payment_method": "card"
        },
        "created_at": now,
        "updated_at": now
    }
    await db.payment_transactions.insert_one(payment_doc)

    return {"session_id": session.session_id, "checkout_url": session.url}


class SendPaymentLinkRequest(BaseModel):
    channel: str
    phone: Optional[str] = None
    email: Optional[str] = None


@store_router.post("/orders/{order_id}/send-payment-link")
async def send_payment_link(order_id: str, payload: SendPaymentLinkRequest, request: Request, current_user: dict = Depends(require_admin)):
    if not STRIPE_AVAILABLE:
        raise HTTPException(status_code=503, detail="Stripe integration not available")
    order = await db.store_orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if (order.get("payment_status") or "").lower() == "paid":
        raise HTTPException(status_code=400, detail="Order already paid")

    channel = payload.channel.lower()
    if channel == "sms" and not payload.phone:
        raise HTTPException(status_code=400, detail="Phone number required for SMS")
    if channel == "email" and not payload.email:
        raise HTTPException(status_code=400, detail="Email required")

    stripe_api_key = os.environ.get("STRIPE_API_KEY")
    if not stripe_api_key:
        raise HTTPException(status_code=500, detail="Payment configuration error")

    host_url = resolve_public_base_url(request)
    webhook_url = f"{host_url}/api/webhook/stripe"
    base_url = host_url.rstrip("/")
    success_url = f"{base_url}/admin/operator?store_session_id={{CHECKOUT_SESSION_ID}}&order_id={order_id}"
    cancel_url = f"{base_url}/admin/operator?order_id={order_id}&status=cancelled"

    stripe_checkout = StripeCheckout(api_key=stripe_api_key, webhook_url=webhook_url)
    checkout_request = CheckoutSessionRequest(
        amount=float(order.get("total", 0)),
        currency="usd",
        success_url=success_url,
        cancel_url=cancel_url,
        metadata={"order_id": order_id, "order_number": order.get("order_number") or ""}
    )
    session: CheckoutSessionResponse = await stripe_checkout.create_checkout_session(checkout_request)

    now = datetime.now(timezone.utc).isoformat()
    await db.store_orders.update_one(
        {"id": order_id},
        {"$set": {"stripe_session_id": session.session_id, "payment_status": "pending", "payment_method": "card", "updated_at": now}}
    )

    payment_doc = {
        "id": str(uuid.uuid4()),
        "session_id": session.session_id,
        "order_id": order_id,
        "order_number": order.get("order_number"),
        "amount": order.get("total", 0),
        "currency": "usd",
        "payment_status": "initiated",
        "metadata": {"payment_method": "card", "link_channel": channel},
        "created_at": now,
        "updated_at": now,
    }
    await db.payment_transactions.insert_one(payment_doc)

    checkout_url = session.url
    order_num = order.get("order_number", "")
    total = order.get("total", 0)

    try:
        if channel == "sms":
            from notifications import send_sms
            msg = f"Ventura Fresh Laundry - Orden {order_num}\nTotal: ${total:.2f}\nPaga aqui: {checkout_url}"
            await send_sms(payload.phone, msg)
            await db.store_orders.update_one({"id": order_id}, {"$set": {"customer_phone": payload.phone}})
        elif channel == "email":
            from notifications import send_email
            subject = f"Link de pago - Orden {order_num}"
            body = f"<h2>Ventura Fresh Laundry</h2><p>Orden: <strong>{order_num}</strong></p><p>Total: <strong>${total:.2f}</strong></p><p><a href='{checkout_url}' style='display:inline-block;padding:12px 24px;background:#0ea5e9;color:white;border-radius:8px;text-decoration:none;font-weight:bold;'>Pagar ahora</a></p>"
            await send_email(payload.email, subject, body)
            await db.store_orders.update_one({"id": order_id}, {"$set": {"customer_email": payload.email}})
    except Exception as e:
        logger.warning(f"Failed to send payment link via {channel}: {e}")
        return {"message": f"Order created but could not send {channel}. Checkout URL: {checkout_url}", "checkout_url": checkout_url, "order_id": order_id}

    return {"message": f"Payment link sent via {channel}", "checkout_url": checkout_url, "order_id": order_id}


@store_router.post("/orders/{order_id}/refund")
async def refund_store_order(order_id: str, current_user: dict = Depends(require_admin)):
    order = await db.store_orders.find_one({"id": order_id})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if (order.get("payment_status") or "").lower() != "paid":
        raise HTTPException(status_code=400, detail="Order is not paid")

    now = datetime.now(timezone.utc).isoformat()
    await db.store_orders.update_one(
        {"id": order_id},
        {
            "$set": {
                "payment_status": "refunded",
                "status": "cancelled",
                "updated_at": now
            }
        }
    )

    refund_doc = {
        "id": str(uuid.uuid4()),
        "session_id": f"refund-{order_id}",
        "order_id": order_id,
        "order_number": order.get("order_number"),
        "amount": -abs(order.get("total", 0)),
        "currency": "usd",
        "customer_email": order.get("customer_email"),
        "payment_status": "refunded",
        "metadata": {"reason": "manual_refund"},
        "created_at": now,
        "updated_at": now
    }
    await db.payment_transactions.insert_one(refund_doc)

    for item in order.get("items", []):
        await db.products.update_one(
            {"id": item.get("product_id")},
            {
                "$inc": {"stock": item.get("quantity", 0)},
                "$set": {"is_active": True, "updated_at": now}
            }
        )

    return {"message": "Order refunded"}


# ==================== WEBHOOK ENDPOINT ====================

async def handle_stripe_webhook(request: Request):
    if not STRIPE_AVAILABLE:
        raise HTTPException(status_code=503, detail="Stripe integration not available")
    stripe_api_key = os.environ.get("STRIPE_API_KEY")
    if not stripe_api_key:
        raise HTTPException(status_code=500, detail="Payment configuration error")
    
    host_url = resolve_public_base_url(request)
    webhook_url = f"{host_url}/api/webhook/stripe"
    stripe_checkout = StripeCheckout(api_key=stripe_api_key, webhook_url=webhook_url)
    
    try:
        body = await request.body()
        signature = request.headers.get("Stripe-Signature")
        
        webhook_response = await stripe_checkout.handle_webhook(body, signature)

        session_id = webhook_response.session_id
        metadata = webhook_response.metadata or {}
        normalized_status = normalize_payment_status(
            webhook_response.payment_status,
            "complete" if "completed" in (webhook_response.event_type or "") else None
        )

        await db.payment_transactions.update_one(
            {"session_id": session_id},
            {
                "$set": {
                    "payment_status": normalized_status,
                    "updated_at": datetime.now(timezone.utc).isoformat()
                }
            }
        )

        if is_paid(normalized_status):
            order_id = metadata.get("order_id")
            order = None
            if order_id:
                order = await db.store_orders.find_one({"id": order_id}, {"_id": 0})
            if not order and session_id:
                order = await db.store_orders.find_one({"stripe_session_id": session_id}, {"_id": 0})

            if order and (order.get("payment_status") or "").lower() != "paid":
                now = datetime.now(timezone.utc).isoformat()
                await db.store_orders.update_one(
                    {"id": order.get("id")},
                    {
                        "$set": {
                            "payment_status": "paid",
                            "payment_method": "card",
                            "status": "confirmed",
                            "updated_at": now
                        }
                    }
                )

                await apply_stock_deduction(order.get("items", []))
                customer_snapshot = {
                    "name": order.get("customer_name"),
                    "email": order.get("customer_email"),
                    "phone": order.get("customer_phone"),
                    "preferred_contact": order.get("preferred_contact")
                }
                order_for_notify = {
                    **order,
                    "payment_status": "paid",
                    "payment_method": "card",
                    "status": "confirmed"
                }
                await notify_store_order(customer_snapshot, order_for_notify)

        return {
            "status": "ok",
            "event_type": webhook_response.event_type,
            "payment_status": normalized_status
        }
        
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Webhook error: {str(e)}")


# ==================== MEMBERSHIP PAYMENT ENDPOINTS ====================

class MembershipCheckoutRequest(BaseModel):
    plan_id: str
    origin_url: str
    customer_email: Optional[str] = None
    customer_name: Optional[str] = None
    customer_phone: Optional[str] = None
    preferences: Optional[dict] = None
    registration_data: Optional[dict] = None

class ServiceCheckoutRequest(BaseModel):
    service_id: str
    origin_url: str
    quantity: int = 1
    customer_email: Optional[str] = None
    estimated_lbs: Optional[float] = None


@store_router.post("/membership/checkout")
async def create_membership_checkout(checkout: MembershipCheckoutRequest, request: Request):
    if not STRIPE_AVAILABLE:
        raise HTTPException(status_code=503, detail="Stripe integration not available")
    
    plan = await db.membership_plans.find_one({"id": checkout.plan_id}, {"_id": 0})
    if not plan:
        raise HTTPException(status_code=404, detail="Membership plan not found")
    
    price_str = plan.get("price", "$0")
    try:
        price = float(price_str.replace("$", "").replace(",", "").split("/")[0].strip())
    except (ValueError, AttributeError):
        raise HTTPException(status_code=500, detail="Invalid plan price configuration")
    
    if price <= 0:
        raise HTTPException(status_code=400, detail="Invalid plan price")
    
    stripe_api_key = os.environ.get("STRIPE_API_KEY")
    if not stripe_api_key:
        raise HTTPException(status_code=500, detail="Payment configuration error")
    
    host_url = resolve_public_base_url(request)
    webhook_url = f"{host_url}/api/webhook/stripe"
    success_url = f"{checkout.origin_url}/membership?session_id={{CHECKOUT_SESSION_ID}}&status=success"
    cancel_url = f"{checkout.origin_url}/membership?status=cancelled"
    
    stripe_checkout = StripeCheckout(api_key=stripe_api_key, webhook_url=webhook_url)
    
    now = datetime.now(timezone.utc).isoformat()
    signup_id = str(uuid.uuid4())
    normalized_email = normalize_email(checkout.customer_email) if checkout.customer_email else ""
    normalized_name = normalize_spaces(checkout.customer_name)
    normalized_phone = normalize_phone(checkout.customer_phone)
    preferences = normalize_preference_dict(checkout.preferences)

    signup_doc = {
        "id": signup_id,
        "plan_id": checkout.plan_id,
        "plan_name": plan.get("name"),
        "customer_email": normalized_email,
        "customer_name": normalized_name or checkout.customer_name,
        "customer_phone": normalized_phone or checkout.customer_phone,
        "preferences": preferences,
        "registration_data": checkout.registration_data or {},
        "amount": price,
        "payment_status": "pending",
        "stripe_session_id": None,
        "status": "pending",
        "completed": False,
        "created_at": now,
        "updated_at": now
    }
    
    try:
        checkout_request = CheckoutSessionRequest(
            amount=float(price),
            currency="usd",
            success_url=success_url,
            cancel_url=cancel_url,
            metadata={
                "signup_id": signup_id,
                "plan_id": checkout.plan_id,
                "plan_name": plan.get("name", ""),
                "customer_email": normalized_email or "",
                "type": "membership"
            }
        )
        
        session: CheckoutSessionResponse = await stripe_checkout.create_checkout_session(checkout_request)
        signup_doc["stripe_session_id"] = session.session_id
        await db.membership_signups.insert_one(signup_doc)
        
        payment_doc = {
            "id": str(uuid.uuid4()),
            "session_id": session.session_id,
            "signup_id": signup_id,
            "amount": price,
            "currency": "usd",
            "customer_email": normalized_email,
            "payment_type": "membership",
            "plan_name": plan.get("name"),
            "payment_status": "initiated",
            "metadata": {
                "plan_id": checkout.plan_id,
                "customer_name": normalized_name or checkout.customer_name
            },
            "created_at": now,
            "updated_at": now
        }
        await db.payment_transactions.insert_one(payment_doc)
        
        return {
            "checkout_url": session.url,
            "session_id": session.session_id,
            "signup_id": signup_id,
            "plan_name": plan.get("name"),
            "amount": price
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create checkout session: {str(e)}")


@store_router.get("/membership/checkout/status/{session_id}")
async def get_membership_checkout_status(session_id: str):
    if not STRIPE_AVAILABLE:
        raise HTTPException(status_code=503, detail="Stripe integration not available")
    
    stripe_api_key = os.environ.get("STRIPE_API_KEY")
    if not stripe_api_key:
        raise HTTPException(status_code=500, detail="Payment configuration error")
    
    stripe_checkout = StripeCheckout(api_key=stripe_api_key, webhook_url="")
    
    try:
        status: CheckoutStatusResponse = await stripe_checkout.get_checkout_status(session_id)
        payment_status = "paid" if status.payment_status == "paid" else status.payment_status
        
        await db.payment_transactions.update_one(
            {"session_id": session_id},
            {
                "$set": {
                    "payment_status": payment_status,
                    "updated_at": datetime.now(timezone.utc).isoformat()
                }
            }
        )
        
        if payment_status == "paid":
            transaction = await db.payment_transactions.find_one({"session_id": session_id})
            if transaction:
                signup_id = transaction.get("signup_id")
                if signup_id:
                    signup = await db.membership_signups.find_one({"id": signup_id})
                    if signup and signup.get("payment_status") != "paid":
                        now = datetime.now(timezone.utc).isoformat()
                        await db.membership_signups.update_one(
                            {"id": signup_id},
                            {
                                "$set": {
                                    "payment_status": "paid",
                                    "status": "converted",
                                    "updated_at": now
                                }
                            }
                        )
                        
                        customer_email = signup.get("customer_email")
                        if customer_email:
                            normalized_email = normalize_email(customer_email) or customer_email.lower()
                            existing_customer = await db.customers.find_one({"email": normalized_email})
                            if existing_customer:
                                await db.customers.update_one(
                                    {"email": normalized_email},
                                    {
                                        "$set": {
                                            "membership_plan": signup.get("plan_name"),
                                            "membership_status": "active",
                                            "membership_start_date": now,
                                            "updated_at": now
                                        }
                                    }
                                )
                            else:
                                customer_id = str(uuid.uuid4())
                                customer_doc = {
                                    "id": customer_id,
                                    "name": signup.get("customer_name") or "Member",
                                    "email": normalized_email,
                                    "phone": normalize_phone(signup.get("customer_phone")),
                                    "address": None,
                                    "preferred_contact": "email",
                                    "notes": f"Membership signup: {signup.get('plan_name')}",
                                    "status": "active",
                                    "total_orders": 0,
                                    "membership_plan": signup.get("plan_name"),
                                    "membership_status": "active",
                                    "membership_start_date": now,
                                    "created_at": now,
                                    "updated_at": now
                                }
                                await db.customers.insert_one(customer_doc)
        
        return {
            "status": status.status,
            "payment_status": payment_status,
            "amount_total": status.amount_total / 100 if status.amount_total else 0,
            "currency": status.currency,
            "metadata": status.metadata
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get checkout status: {str(e)}")


def _generate_temp_password(length: int = 12) -> str:
    alphabet = string.ascii_letters + string.digits + "!@#$"
    return "".join(secrets.choice(alphabet) for _ in range(length))


@store_router.post("/membership/complete-registration/{session_id}")
async def complete_membership_registration(session_id: str):
    if not STRIPE_AVAILABLE:
        raise HTTPException(status_code=503, detail="Stripe integration not available")

    stripe_api_key = os.environ.get("STRIPE_API_KEY")
    if not stripe_api_key:
        raise HTTPException(status_code=500, detail="Payment configuration error")

    stripe_checkout_obj = StripeCheckout(api_key=stripe_api_key, webhook_url="")
    try:
        status = await stripe_checkout_obj.get_checkout_status(session_id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Could not verify payment: {exc}")

    payment_status = normalize_payment_status(status.payment_status, status.status)
    if payment_status != "paid":
        raise HTTPException(status_code=402, detail="Payment not completed")

    signup = await db.membership_signups.find_one(
        {"stripe_session_id": session_id}, {"_id": 0}
    )
    if not signup:
        raise HTTPException(
            status_code=404,
            detail="Registration data not found for this session. Please contact support.",
        )

    if signup.get("completed"):
        cust = await db.customers.find_one(
            {"email": signup.get("customer_email")}, {"_id": 0, "password_hash": 0}
        )
        if cust:
            from auth import create_customer_token
            token = create_customer_token(cust["id"], cust["email"])
            return {"access_token": token, "token_type": "bearer", "customer": cust}
        raise HTTPException(status_code=409, detail="Already processed")

    reg = signup.get("registration_data") or {}
    email = normalize_email(signup.get("customer_email") or reg.get("email") or "")
    if not email:
        raise HTTPException(status_code=400, detail="No email in registration data")

    plan_name = signup.get("plan_name", "Membership")
    plan_id = signup.get("plan_id")
    preferences = normalize_preference_dict(signup.get("preferences") or {})

    first_name = reg.get("first_name") or signup.get("customer_name", "").split(" ")[0]
    last_name = reg.get("last_name") or " ".join(signup.get("customer_name", "").split(" ")[1:])
    full_name = f"{first_name} {last_name}".strip() or signup.get("customer_name", "Member")
    phone = normalize_phone(reg.get("phone") or signup.get("customer_phone"))

    addr_parts = [
        p for p in [
            reg.get("address_line1"), reg.get("address_line2"),
            reg.get("city"), reg.get("state"), reg.get("zip_code"),
        ] if p
    ]
    full_address = ", ".join(addr_parts) if addr_parts else None
    now = datetime.now(timezone.utc).isoformat()

    from auth import hash_password, create_customer_token

    existing = await db.customers.find_one({"email": email})
    temp_password = None

    if existing and existing.get("password_hash"):
        customer_id = existing["id"]
        await db.customers.update_one(
            {"id": customer_id},
            {
                "$set": {
                    "name": full_name or existing.get("name"),
                    "phone": phone or existing.get("phone"),
                    "address": full_address or existing.get("address"),
                    "city": reg.get("city") or existing.get("city"),
                    "state": reg.get("state") or existing.get("state"),
                    "zip_code": reg.get("zip_code") or existing.get("zip_code"),
                    "is_member": True,
                    "membership_plan": plan_name,
                    "membership_status": "active",
                    "updated_at": now,
                }
            },
        )
    else:
        temp_password = _generate_temp_password()
        if existing:
            customer_id = existing["id"]
            await db.customers.update_one(
                {"id": customer_id},
                {
                    "$set": {
                        "name": full_name,
                        "phone": phone,
                        "address": full_address,
                        "city": reg.get("city"),
                        "state": reg.get("state"),
                        "zip_code": reg.get("zip_code"),
                        "password_hash": hash_password(temp_password),
                        "is_member": True,
                        "membership_plan": plan_name,
                        "membership_status": "active",
                        "updated_at": now,
                    }
                },
            )
        else:
            customer_id = str(uuid.uuid4())
            customer_doc = {
                "id": customer_id,
                "name": full_name,
                "email": email,
                "phone": phone,
                "address": full_address,
                "city": reg.get("city"),
                "state": reg.get("state"),
                "zip_code": reg.get("zip_code"),
                "preferred_contact": reg.get("contact_method", "email"),
                "sms_consent": reg.get("sms_consent", False),
                "notes": None,
                "status": "active",
                "is_member": True,
                "membership_plan": plan_name,
                "membership_status": "active",
                "membership_start_date": now,
                "total_orders": 0,
                "password_hash": hash_password(temp_password),
                "created_at": now,
                "updated_at": now,
            }
            await db.customers.insert_one(customer_doc)

    existing_membership = await db.memberships.find_one(
        {"stripe_session_id": session_id}
    )
    if not existing_membership:
        membership_doc = {
            "id": str(uuid.uuid4()),
            "customer_id": customer_id,
            "customer_email": email,
            "plan": plan_name,
            "plan_id": plan_id,
            "stripe_session_id": session_id,
            "status": "active",
            "laundry_frequency": reg.get("laundry_frequency"),
            "estimated_lbs": reg.get("estimated_lbs"),
            "sms_consent": reg.get("sms_consent", False),
            "contact_method": reg.get("contact_method"),
            "preferences": preferences,
            "created_at": now,
            "updated_at": now,
        }
        await db.memberships.insert_one(membership_doc)

    if preferences:
        existing_pref = await db.customer_preferences.find_one(
            {"customer_id": customer_id}
        )
        version = (existing_pref.get("version", 0) + 1) if existing_pref else 1
        pref_doc = {
            **preferences,
            "customer_id": customer_id,
            "updated_at": now,
            "version": version,
        }
        await db.customer_preferences.update_one(
            {"customer_id": customer_id},
            {"$set": pref_doc},
            upsert=True,
        )

    await db.membership_signups.update_one(
        {"stripe_session_id": session_id},
        {
            "$set": {
                "payment_status": "paid",
                "status": "converted",
                "completed": True,
                "customer_id": customer_id,
                "completed_at": now,
                "updated_at": now,
            }
        },
    )

    if temp_password:
        try:
            from notifications import send_email
            frontend_url = (
                os.environ.get("FRONTEND_URL")
                or os.environ.get("REACT_APP_BACKEND_URL")
                or os.environ.get("BUSINESS_WEBSITE", "")
            )
            login_url = f"{frontend_url}/account/login"
            html = f"""
            <div style="font-family:system-ui,-apple-system,sans-serif;max-width:520px;margin:0 auto;padding:24px;">
              <div style="background:linear-gradient(135deg,#0284c7,#0ea5e9);border-radius:16px 16px 0 0;padding:32px 24px;text-align:center;">
                <h1 style="color:white;font-size:24px;margin:0;font-weight:800;">Ventura Fresh Laundry</h1>
                <p style="color:rgba(255,255,255,0.8);font-size:14px;margin:8px 0 0;">¡Tu membresía está activa!</p>
              </div>
              <div style="background:#ffffff;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 16px 16px;padding:32px 24px;">
                <p style="color:#1e293b;font-size:16px;font-weight:600;">Hola {first_name} 👋</p>
                <p style="color:#64748b;font-size:14px;line-height:1.7;">
                  Tu membresía <strong>{plan_name}</strong> está activa. Aquí están tus credenciales:
                </p>
                <div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:12px;padding:20px;margin:20px 0;text-align:center;">
                  <p style="margin:4px 0;color:#1e293b;font-size:15px;"><strong>Correo:</strong> {email}</p>
                  <p style="margin:8px 0 4px;color:#1e293b;font-size:15px;"><strong>Contraseña temporal:</strong></p>
                  <span style="font-family:monospace;background:#e0f2fe;padding:6px 16px;border-radius:8px;font-size:18px;color:#0284c7;font-weight:800;letter-spacing:2px;">
                    {temp_password}
                  </span>
                </div>
                <p style="color:#64748b;font-size:13px;">Te recomendamos cambiar tu contraseña después de iniciar sesión.</p>
                <div style="text-align:center;margin:28px 0 16px;">
                  <a href="{login_url}" style="display:inline-block;background:#0284c7;color:white;padding:14px 36px;border-radius:12px;text-decoration:none;font-weight:700;font-size:15px;">
                    Acceder a mi cuenta →
                  </a>
                </div>
                <p style="color:#94a3b8;font-size:12px;text-align:center;">
                  Como miembro disfrutas de precios especiales en todos tus pedidos.
                </p>
              </div>
            </div>
            """
            await send_email(
                email,
                f"¡Bienvenido a tu membresía {plan_name}! — Ventura Fresh Laundry",
                f"Hola {first_name}, tu membresía {plan_name} está activa. Correo: {email} | Contraseña temporal: {temp_password} | Accede en: {login_url}",
                html,
            )
        except Exception as exc:
            logger.error("Welcome email error: %s", exc)

    customer_data = await db.customers.find_one(
        {"id": customer_id}, {"_id": 0, "password_hash": 0}
    )
    token = create_customer_token(customer_id, email)

    return {
        "access_token": token,
        "token_type": "bearer",
        "customer": customer_data,
    }


@store_router.post("/service/checkout")
async def create_service_checkout(checkout: ServiceCheckoutRequest, request: Request):
    if not STRIPE_AVAILABLE:
        raise HTTPException(status_code=503, detail="Stripe integration not available")
    
    service = await db.services.find_one({"id": checkout.service_id}, {"_id": 0})
    if not service:
        raise HTTPException(status_code=404, detail="Service not found")
    
    if not service.get("is_active"):
        raise HTTPException(status_code=400, detail="Service is not available")
    
    base_price = service.get("price", 0)
    price_unit = service.get("price_unit", "")
    
    total_amount = base_price * checkout.quantity
    if "lb" in price_unit.lower() and checkout.estimated_lbs:
        total_amount = base_price * checkout.estimated_lbs
    
    if total_amount <= 0:
        raise HTTPException(status_code=400, detail="Invalid service price")
    
    stripe_api_key = os.environ.get("STRIPE_API_KEY")
    if not stripe_api_key:
        raise HTTPException(status_code=500, detail="Payment configuration error")
    
    host_url = resolve_public_base_url(request)
    webhook_url = f"{host_url}/api/webhook/stripe"
    success_url = f"{checkout.origin_url}/services?session_id={{CHECKOUT_SESSION_ID}}&status=success"
    cancel_url = f"{checkout.origin_url}/services?status=cancelled"
    
    stripe_checkout = StripeCheckout(api_key=stripe_api_key, webhook_url=webhook_url)
    
    now = datetime.now(timezone.utc).isoformat()
    order_id = str(uuid.uuid4())
    order_number = f"SVC-{datetime.now().strftime('%Y%m%d')}-{str(uuid.uuid4())[:8].upper()}"
    
    order_doc = {
        "id": order_id,
        "order_number": order_number,
        "service_id": checkout.service_id,
        "service_name": service.get("name"),
        "customer_email": checkout.customer_email,
        "quantity": checkout.quantity,
        "estimated_lbs": checkout.estimated_lbs,
        "total_amount": round(total_amount, 2),
        "payment_status": "pending",
        "stripe_session_id": None,
        "status": "pending",
        "created_at": now,
        "updated_at": now
    }
    
    try:
        checkout_request = CheckoutSessionRequest(
            amount=float(round(total_amount, 2)),
            currency="usd",
            success_url=success_url,
            cancel_url=cancel_url,
            metadata={
                "order_id": order_id,
                "order_number": order_number,
                "service_id": checkout.service_id,
                "service_name": service.get("name", ""),
                "customer_email": checkout.customer_email or "",
                "type": "service"
            }
        )
        
        session: CheckoutSessionResponse = await stripe_checkout.create_checkout_session(checkout_request)
        order_doc["stripe_session_id"] = session.session_id
        await db.service_orders.insert_one(order_doc)
        
        payment_doc = {
            "id": str(uuid.uuid4()),
            "session_id": session.session_id,
            "order_id": order_id,
            "order_number": order_number,
            "amount": round(total_amount, 2),
            "currency": "usd",
            "customer_email": checkout.customer_email,
            "payment_type": "service",
            "service_name": service.get("name"),
            "payment_status": "initiated",
            "metadata": {
                "service_id": checkout.service_id,
                "quantity": checkout.quantity,
                "estimated_lbs": checkout.estimated_lbs
            },
            "created_at": now,
            "updated_at": now
        }
        await db.payment_transactions.insert_one(payment_doc)
        
        return {
            "checkout_url": session.url,
            "session_id": session.session_id,
            "order_id": order_id,
            "order_number": order_number,
            "service_name": service.get("name"),
            "amount": round(total_amount, 2)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create checkout session: {str(e)}")


@store_router.get("/transactions")
async def get_transactions(current_user: dict = Depends(get_current_user)):
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    transactions = await db.payment_transactions.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return transactions


@store_router.post("/delivery-rules/calculate-fee")
async def calculate_delivery_fee_legacy(request: Request):
    try:
        body = await request.json()
        address = body.get("address") or body.get("shipping_address")
        if not address:
            raise HTTPException(status_code=400, detail="Address required")
        
        result = await calculate_shipping_fee(address)
        return {
            "fee": result["fee"],
            "distance_km": result["distance_km"],
            "zone_id": result.get("zone_id"),
            "zone_name": result.get("zone_name"),
            "delivery_fee": result["fee"]
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))