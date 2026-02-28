"""
Store module - Products, Cart, and Stripe Payment Integration
"""
from fastapi import APIRouter, HTTPException, Request, Depends
from pydantic import BaseModel, Field
from typing import List, Optional, Dict
from datetime import datetime, timezone
import uuid
import os
import openrouteservice
import requests
from motor.motor_asyncio import AsyncIOMotorClient
from normalization import normalize_email, normalize_phone, normalize_spaces, normalize_preference_dict
from notifications import notify_store_order

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

store_router = APIRouter(prefix="/store", tags=["Store"])

# Database reference (set by main app)
db = None

def set_database(database):
    global db
    db = database


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
    response = requests.get(
        "https://api.openrouteservice.org/geocode/search",
        params={
            "api_key": ors_api_key,
            "text": address,
            "size": 1,
            "boundary.country": "USA"
        },
        timeout=15
    )
    if response.status_code != 200:
        raise HTTPException(status_code=400, detail="Unable to geocode address")
    result = response.json()
    features = result.get("features", []) if result else []
    if not features:
        raise HTTPException(status_code=400, detail="Unable to geocode address")
    coordinates = features[0].get("geometry", {}).get("coordinates")
    if not coordinates or len(coordinates) < 2:
        raise HTTPException(status_code=400, detail="Unable to geocode address")
    return coordinates


def calculate_shipping_fee(address: str) -> Dict[str, float]:
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
    fee = distance_km * rate_per_km
    fee = max(fee, min_fee)
    fee = min(fee, max_fee)
    return {"distance_km": round(distance_km, 2), "fee": round(fee, 2)}


def build_customer_snapshot(payload: dict) -> Dict:
    return {
        "name": payload.get("customer_name"),
        "email": payload.get("customer_email"),
        "phone": payload.get("customer_phone"),
        "preferred_contact": payload.get("preferred_contact")
    }


async def apply_stock_deduction(items: List[Dict]):
    for item in items:
        product = await db.products.find_one({"id": item["product_id"]}, {"_id": 0})
        if not product:
            continue
        new_stock = max((product.get("stock", 0) - item.get("quantity", 0)), 0)
        update_doc = {"stock": new_stock, "updated_at": datetime.now(timezone.utc).isoformat()}
        if new_stock <= 0:
            update_doc["is_active"] = False
        await db.products.update_one({"id": item["product_id"]}, {"$set": update_doc})


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
    customer_name: str
    customer_email: str
    customer_phone: str
    shipping_address: str
    shipping_apt: Optional[str] = None
    delivery_instructions: Optional[str] = None
    notes: Optional[str] = None
    preferred_contact: Optional[str] = None

class ManualCheckoutRequest(CheckoutRequest):
    payment_method: str
    amount_received: Optional[float] = None

class ShippingQuoteRequest(BaseModel):
    address: str

class ShippingQuoteResponse(BaseModel):
    distance_km: float
    fee: float

class StoreOrderResponse(BaseModel):
    id: str
    order_number: str
    customer_id: Optional[str] = None
    customer_name: Optional[str] = None
    customer_email: Optional[str] = None
    customer_phone: Optional[str] = None
    preferred_contact: Optional[str] = None
    items: List[Dict]
    total: float
    subtotal: Optional[float] = 0.0
    shipping_fee: Optional[float] = 0.0
    shipping_distance_km: Optional[float] = 0.0
    payment_status: str
    payment_method: Optional[str] = None
    stripe_session_id: Optional[str] = None
    shipping_address: Optional[Dict] = None
    notes: Optional[str] = None
    status: str
    created_at: str
    updated_at: str


class DeliveryZoneCreate(BaseModel):
    name: str
    type: str  # circle or polygon
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
    """Seed initial products if none exist"""
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
    """List all products"""
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
    """Get a single product by ID"""
    product = await db.products.find_one({"id": product_id}, {"_id": 0})
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    return product


@store_router.post("/products", response_model=ProductResponse)
async def create_product(product: ProductCreate):
    """Create a new product (admin only)"""
    now = datetime.now(timezone.utc).isoformat()
    product_doc = {
        "id": str(uuid.uuid4()),
        **product.model_dump(),
        "created_at": now,
        "updated_at": now
    }
    if product_doc.get("stock", 0) <= 0:
        product_doc["is_active"] = False
    await db.products.insert_one(product_doc)
    del product_doc["_id"]
    return product_doc


@store_router.put("/products/{product_id}", response_model=ProductResponse)
async def update_product(product_id: str, product: ProductCreate):
    """Update a product (admin only)"""
    existing = await db.products.find_one({"id": product_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Product not found")
    
    update_data = {
        **product.model_dump(),
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    if update_data.get("stock", 0) <= 0:
        update_data["is_active"] = False
    await db.products.update_one({"id": product_id}, {"$set": update_data})
    
    updated = await db.products.find_one({"id": product_id}, {"_id": 0})
    return updated


@store_router.delete("/products/{product_id}")
async def delete_product(product_id: str):
    """Delete a product (admin only)"""
    result = await db.products.delete_one({"id": product_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Product not found")
    return {"message": "Product deleted successfully"}


# ==================== CART ENDPOINTS ====================

@store_router.post("/cart", response_model=CartResponse)
async def create_cart():
    """Create a new shopping cart"""
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
    """Get cart by ID"""
    cart = await db.carts.find_one({"id": cart_id}, {"_id": 0})
    if not cart:
        raise HTTPException(status_code=404, detail="Cart not found")
    return cart


@store_router.post("/cart/{cart_id}/items", response_model=CartResponse)
async def add_to_cart(cart_id: str, item: CartItem):
    """Add item to cart"""
    cart = await db.carts.find_one({"id": cart_id})
    if not cart:
        raise HTTPException(status_code=404, detail="Cart not found")
    
    # Verify product exists and has stock
    product = await db.products.find_one({"id": item.product_id}, {"_id": 0})
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    if not product.get("is_active") or product.get("stock", 0) <= 0:
        raise HTTPException(status_code=400, detail="Product is out of stock")
    if product["stock"] < item.quantity:
        raise HTTPException(status_code=400, detail="Insufficient stock")
    
    # Check if product already in cart
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
    
    # Recalculate total
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
    """Update quantity of item in cart"""
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
        # Remove item from cart
        items = [i for i in items if i["product_id"] != product_id]
    else:
        # Update quantity
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
    """Remove item from cart"""
    return await update_cart_item(cart_id, product_id, 0)


@store_router.delete("/cart/{cart_id}")
async def clear_cart(cart_id: str):
    """Clear all items from cart"""
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


@store_router.post("/shipping/quote", response_model=ShippingQuoteResponse)
async def get_shipping_quote(payload: ShippingQuoteRequest):
    """Calculate shipping fee based on address"""
    if not payload.address:
        raise HTTPException(status_code=400, detail="Address required")
    result = calculate_shipping_fee(payload.address)
    return result


# ==================== CHECKOUT & PAYMENT ENDPOINTS ====================

@store_router.post("/checkout")
async def create_checkout_session(checkout: CheckoutRequest, request: Request):
    """Create Stripe checkout session for cart"""
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

    shipping_quote = calculate_shipping_fee(checkout.shipping_address)
    subtotal = float(cart["total"])
    shipping_fee = shipping_quote["fee"]
    shipping_distance_km = shipping_quote["distance_km"]
    total = round(subtotal + shipping_fee, 2)

    stripe_api_key = os.environ.get("STRIPE_API_KEY")
    if not stripe_api_key:
        raise HTTPException(status_code=500, detail="Payment configuration error")

    host_url = str(request.base_url).rstrip("/")
    webhook_url = f"{host_url}/api/webhook/stripe"
    success_url = f"{checkout.origin_url}/store?session_id={{CHECKOUT_SESSION_ID}}&status=success"
    cancel_url = f"{checkout.origin_url}/store?status=cancelled"

    stripe_checkout = StripeCheckout(api_key=stripe_api_key, webhook_url=webhook_url)

    now = datetime.now(timezone.utc).isoformat()
    order_number = f"SO-{datetime.now().strftime('%Y%m%d')}-{str(uuid.uuid4())[:8].upper()}"
    normalized_email = normalize_email(checkout.customer_email) or checkout.customer_email
    normalized_phone = normalize_phone(checkout.customer_phone) if checkout.customer_phone else None

    shipping_address = {
        "address": normalize_spaces(checkout.shipping_address),
        "apt": normalize_spaces(checkout.shipping_apt) if checkout.shipping_apt else None,
        "instructions": normalize_spaces(checkout.delivery_instructions) if checkout.delivery_instructions else None
    }

    order_doc = {
        "id": str(uuid.uuid4()),
        "order_number": order_number,
        "customer_id": cart.get("customer_id"),
        "customer_name": normalize_spaces(checkout.customer_name),
        "customer_email": normalized_email,
        "customer_phone": normalized_phone,
        "preferred_contact": checkout.preferred_contact,
        "items": cart["items"],
        "subtotal": subtotal,
        "shipping_fee": shipping_fee,
        "shipping_distance_km": shipping_distance_km,
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
    """Create manual checkout for cash/transfer/other payments"""
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

    shipping_quote = calculate_shipping_fee(checkout.shipping_address)
    subtotal = float(cart["total"])
    shipping_fee = shipping_quote["fee"]
    shipping_distance_km = shipping_quote["distance_km"]
    total = round(subtotal + shipping_fee, 2)

    payment_method = normalize_spaces(checkout.payment_method).lower()
    if payment_method not in ["cash", "transfer", "other"]:
        raise HTTPException(status_code=400, detail="Invalid payment method")

    now = datetime.now(timezone.utc).isoformat()
    order_number = f"SO-{datetime.now().strftime('%Y%m%d')}-{str(uuid.uuid4())[:8].upper()}"
    normalized_email = normalize_email(checkout.customer_email) or checkout.customer_email
    normalized_phone = normalize_phone(checkout.customer_phone) if checkout.customer_phone else None

    shipping_address = {
        "address": normalize_spaces(checkout.shipping_address),
        "apt": normalize_spaces(checkout.shipping_apt) if checkout.shipping_apt else None,
        "instructions": normalize_spaces(checkout.delivery_instructions) if checkout.delivery_instructions else None
    }

    order_doc = {
        "id": str(uuid.uuid4()),
        "order_number": order_number,
        "customer_id": cart.get("customer_id"),
        "customer_name": normalize_spaces(checkout.customer_name),
        "customer_email": normalized_email,
        "customer_phone": normalized_phone,
        "preferred_contact": checkout.preferred_contact,
        "items": cart["items"],
        "subtotal": subtotal,
        "shipping_fee": shipping_fee,
        "shipping_distance_km": shipping_distance_km,
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
    """Get the status of a checkout session"""
    if not STRIPE_AVAILABLE:
        raise HTTPException(status_code=503, detail="Stripe integration not available")
    stripe_api_key = os.environ.get("STRIPE_API_KEY")
    if not stripe_api_key:
        raise HTTPException(status_code=500, detail="Payment configuration error")
    
    stripe_checkout = StripeCheckout(api_key=stripe_api_key, webhook_url="")
    
    try:
        status: CheckoutStatusResponse = await stripe_checkout.get_checkout_status(session_id)
        
        # Update payment transaction
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
        
        # If paid, update order status
        if payment_status == "paid":
            transaction = await db.payment_transactions.find_one({"session_id": session_id})
            if transaction:
                order_id = transaction.get("order_id")
                if order_id:
                    order = await db.store_orders.find_one({"id": order_id})
                    if order and order.get("payment_status") != "paid":
                        await db.store_orders.update_one(
                            {"id": order_id},
                            {
                                "$set": {
                                    "payment_status": "paid",
                                    "payment_method": "card",
                                    "status": "confirmed",
                                    "updated_at": datetime.now(timezone.utc).isoformat()
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
                        await notify_store_order(customer_snapshot, order)
        
        return {
            "status": status.status,
            "payment_status": payment_status,
            "amount_total": status.amount_total / 100,  # Convert from cents
            "currency": status.currency,
            "metadata": status.metadata
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get checkout status: {str(e)}")


# ==================== STORE ORDERS ENDPOINTS ====================

@store_router.get("/orders", response_model=List[StoreOrderResponse])
async def list_store_orders(status: Optional[str] = None, limit: int = 50):
    """List store orders (admin only)"""
    query = {}
    if status:
        query["status"] = status
    
    orders = await db.store_orders.find(query, {"_id": 0}).sort("created_at", -1).to_list(limit)
    return orders


@store_router.get("/orders/{order_id}", response_model=StoreOrderResponse)
async def get_store_order(order_id: str):
    """Get a store order by ID"""
    order = await db.store_orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    return order


@store_router.get("/orders/by-session/{session_id}", response_model=StoreOrderResponse)
async def get_order_by_session(session_id: str):
    """Get order by Stripe session ID"""
    order = await db.store_orders.find_one({"stripe_session_id": session_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    return order


@store_router.put("/orders/{order_id}/status")
async def update_order_status(order_id: str, status: str):
    """Update order status (admin only)"""
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


# ==================== WEBHOOK ENDPOINT ====================

async def handle_stripe_webhook(request: Request):
    """Handle Stripe webhook events"""
    if not STRIPE_AVAILABLE:
        raise HTTPException(status_code=503, detail="Stripe integration not available")
    stripe_api_key = os.environ.get("STRIPE_API_KEY")
    if not stripe_api_key:
        raise HTTPException(status_code=500, detail="Payment configuration error")
    
    host_url = str(request.base_url).rstrip("/")
    webhook_url = f"{host_url}/api/webhook/stripe"
    stripe_checkout = StripeCheckout(api_key=stripe_api_key, webhook_url=webhook_url)
    
    try:
        body = await request.body()
        signature = request.headers.get("Stripe-Signature")
        
        webhook_response = await stripe_checkout.handle_webhook(body, signature)
        
        # Process webhook event
        if webhook_response.payment_status == "paid":
            session_id = webhook_response.session_id
            
            # Update payment transaction
            await db.payment_transactions.update_one(
                {"session_id": session_id},
                {
                    "$set": {
                        "payment_status": "paid",
                        "updated_at": datetime.now(timezone.utc).isoformat()
                    }
                }
            )
            
            # Update order
            order_id = webhook_response.metadata.get("order_id")
            if order_id:
                order = await db.store_orders.find_one({"id": order_id})
                if order and order.get("payment_status") != "paid":
                    await db.store_orders.update_one(
                        {"id": order_id},
                        {
                            "$set": {
                                "payment_status": "paid",
                                "payment_method": "card",
                                "status": "confirmed",
                                "updated_at": datetime.now(timezone.utc).isoformat()
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
                    await notify_store_order(customer_snapshot, order)
        
        return {"status": "ok", "event_type": webhook_response.event_type}
        
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

class ServiceCheckoutRequest(BaseModel):
    service_id: str
    origin_url: str
    quantity: int = 1
    customer_email: Optional[str] = None
    estimated_lbs: Optional[float] = None

# Membership plan prices (fixed on backend for security)
MEMBERSHIP_PRICES = {
    "most_popular": 139.00,
    "family_plus": 199.00,
    "elite_concierge": 299.00
}

@store_router.post("/membership/checkout")
async def create_membership_checkout(checkout: MembershipCheckoutRequest, request: Request):
    """Create Stripe checkout session for membership subscription"""
    if not STRIPE_AVAILABLE:
        raise HTTPException(status_code=503, detail="Stripe integration not available")
    
    # Get membership plan from database
    plan = await db.membership_plans.find_one({"id": checkout.plan_id}, {"_id": 0})
    if not plan:
        raise HTTPException(status_code=404, detail="Membership plan not found")
    
    # Parse price from plan (e.g., "$139 / month" -> 139.00)
    price_str = plan.get("price", "$0")
    try:
        price = float(price_str.replace("$", "").replace(",", "").split("/")[0].strip())
    except (ValueError, AttributeError):
        raise HTTPException(status_code=500, detail="Invalid plan price configuration")
    
    if price <= 0:
        raise HTTPException(status_code=400, detail="Invalid plan price")
    
    # Get Stripe API key
    stripe_api_key = os.environ.get("STRIPE_API_KEY")
    if not stripe_api_key:
        raise HTTPException(status_code=500, detail="Payment configuration error")
    
    # Build URLs
    host_url = str(request.base_url).rstrip("/")
    webhook_url = f"{host_url}/api/webhook/stripe"
    success_url = f"{checkout.origin_url}/membership?session_id={{CHECKOUT_SESSION_ID}}&status=success"
    cancel_url = f"{checkout.origin_url}/membership?status=cancelled"
    
    # Initialize Stripe checkout
    stripe_checkout = StripeCheckout(api_key=stripe_api_key, webhook_url=webhook_url)
    
    # Create membership signup record
    now = datetime.now(timezone.utc).isoformat()
    signup_id = str(uuid.uuid4())

    normalized_email = normalize_email(checkout.customer_email) if checkout.customer_email else ""
    normalized_email = normalized_email or (checkout.customer_email.lower() if checkout.customer_email else None)
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
        "amount": price,
        "payment_status": "pending",
        "stripe_session_id": None,
        "status": "pending",
        "created_at": now,
        "updated_at": now
    }
    
    # Create checkout session
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
        
        # Update signup with session ID
        signup_doc["stripe_session_id"] = session.session_id
        
        # Save signup
        await db.membership_signups.insert_one(signup_doc)
        
        # Create payment transaction record
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
    """Get the status of a membership checkout session"""
    if not STRIPE_AVAILABLE:
        raise HTTPException(status_code=503, detail="Stripe integration not available")
    
    stripe_api_key = os.environ.get("STRIPE_API_KEY")
    if not stripe_api_key:
        raise HTTPException(status_code=500, detail="Payment configuration error")
    
    stripe_checkout = StripeCheckout(api_key=stripe_api_key, webhook_url="")
    
    try:
        status: CheckoutStatusResponse = await stripe_checkout.get_checkout_status(session_id)
        
        # Update payment transaction
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
        
        # If paid, update membership signup and create customer membership
        if payment_status == "paid":
            transaction = await db.payment_transactions.find_one({"session_id": session_id})
            if transaction:
                signup_id = transaction.get("signup_id")
                if signup_id:
                    # Check if already processed
                    signup = await db.membership_signups.find_one({"id": signup_id})
                    if signup and signup.get("payment_status") != "paid":
                        now = datetime.now(timezone.utc).isoformat()
                        
                        # Update signup status
                        await db.membership_signups.update_one(
                            {"id": signup_id},
                            {
                                "$set": {
                                    "payment_status": "paid",
                                    "status": "active",
                                    "updated_at": now
                                }
                            }
                        )
                        
                        # Create or update customer with membership
                        customer_email = signup.get("customer_email")
                        if customer_email:
                            normalized_email = normalize_email(customer_email) or customer_email.lower()
                            existing_customer = await db.customers.find_one({"email": normalized_email})
                            customer_id = None
                            if existing_customer:
                                customer_id = existing_customer.get("id")
                                # Update existing customer
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
                                # Create new customer
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

                            preferences = normalize_preference_dict(signup.get("preferences"))
                            if preferences and customer_id:
                                existing_pref = await db.preferences.find({"customer_id": customer_id}).sort("version", -1).limit(1).to_list(1)
                                version = (existing_pref[0]["version"] + 1) if existing_pref else 1
                                pref_id = str(uuid.uuid4())
                                pref_doc = {
                                    "id": pref_id,
                                    "customer_id": customer_id,
                                    "detergent_type": preferences.get("detergent_type") or "standard",
                                    "water_temperature": preferences.get("water_temperature"),
                                    "fabric_softener": preferences.get("fabric_softener"),
                                    "folding_style": preferences.get("folding_style") or "standard",
                                    "hanging_instructions": preferences.get("hanging_instructions"),
                                    "allergies": preferences.get("allergies"),
                                    "special_instructions": preferences.get("special_instructions"),
                                    "pickup_time_preference": preferences.get("pickup_time_preference"),
                                    "gate_code": preferences.get("gate_code"),
                                    "hang_dry_items": preferences.get("hang_dry_items") or [],
                                    "fragrance_preference": preferences.get("fragrance_preference") or "light",
                                    "version": version,
                                    "created_at": now,
                                    "updated_at": now
                                }
                                await db.preferences.insert_one(pref_doc)
                                await db.customers.update_one({"id": customer_id}, {"$set": {"preferences_id": pref_id, "updated_at": now}})
        
        return {
            "status": status.status,
            "payment_status": payment_status,
            "amount_total": status.amount_total / 100 if status.amount_total else 0,
            "currency": status.currency,
            "metadata": status.metadata
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get checkout status: {str(e)}")


@store_router.post("/service/checkout")
async def create_service_checkout(checkout: ServiceCheckoutRequest, request: Request):
    """Create Stripe checkout session for a laundry service"""
    if not STRIPE_AVAILABLE:
        raise HTTPException(status_code=503, detail="Stripe integration not available")
    
    # Get service from database
    service = await db.services.find_one({"id": checkout.service_id}, {"_id": 0})
    if not service:
        raise HTTPException(status_code=404, detail="Service not found")
    
    if not service.get("is_active"):
        raise HTTPException(status_code=400, detail="Service is not available")
    
    # Calculate price
    base_price = service.get("price", 0)
    price_unit = service.get("price_unit", "")
    
    # Calculate total based on unit type
    total_amount = base_price * checkout.quantity
    if "lb" in price_unit.lower() and checkout.estimated_lbs:
        total_amount = base_price * checkout.estimated_lbs
    
    if total_amount <= 0:
        raise HTTPException(status_code=400, detail="Invalid service price")
    
    # Get Stripe API key
    stripe_api_key = os.environ.get("STRIPE_API_KEY")
    if not stripe_api_key:
        raise HTTPException(status_code=500, detail="Payment configuration error")
    
    # Build URLs
    host_url = str(request.base_url).rstrip("/")
    webhook_url = f"{host_url}/api/webhook/stripe"
    success_url = f"{checkout.origin_url}/services?session_id={{CHECKOUT_SESSION_ID}}&status=success"
    cancel_url = f"{checkout.origin_url}/services?status=cancelled"
    
    # Initialize Stripe checkout
    stripe_checkout = StripeCheckout(api_key=stripe_api_key, webhook_url=webhook_url)
    
    # Create service order record
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
        
        # Update order with session ID
        order_doc["stripe_session_id"] = session.session_id
        
        # Save order
        await db.service_orders.insert_one(order_doc)
        
        # Create payment transaction record
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
async def get_transactions():
    """Get payment transactions"""
    transactions = await db.payment_transactions.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return transactions

