from fastapi import FastAPI, APIRouter, HTTPException, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional
import uuid
from datetime import datetime, timezone, timedelta
import jwt
import bcrypt

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# JWT Config
JWT_SECRET = os.environ.get('JWT_SECRET', 'ventura-fresh-laundry-secret-key-2024')
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_HOURS = 24

app = FastAPI(title="Ventura Fresh Laundry CRM")
api_router = APIRouter(prefix="/api")
security = HTTPBearer()

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# ==================== MODELS ====================

class UserCreate(BaseModel):
    email: EmailStr
    password: str
    name: str

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserResponse(BaseModel):
    id: str
    email: str
    name: str
    role: str
    created_at: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str
    user: UserResponse

class CustomerCreate(BaseModel):
    name: str
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    preferred_contact: Optional[str] = "email"
    notes: Optional[str] = None

class CustomerResponse(BaseModel):
    id: str
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    preferred_contact: str
    notes: Optional[str] = None
    status: str
    total_orders: int
    created_at: str
    updated_at: str

class PreferenceCreate(BaseModel):
    customer_id: str
    detergent_type: Optional[str] = "standard"
    folding_style: Optional[str] = "standard"
    special_instructions: Optional[str] = None
    hang_dry_items: Optional[List[str]] = []
    fragrance_preference: Optional[str] = "light"

class PreferenceResponse(BaseModel):
    id: str
    customer_id: str
    detergent_type: str
    folding_style: str
    special_instructions: Optional[str]
    hang_dry_items: List[str]
    fragrance_preference: str
    version: int
    created_at: str
    updated_at: str

class OrderCreate(BaseModel):
    customer_id: str
    service_type: str  # pickup_delivery, wash_fold, self_service
    pickup_date: Optional[str] = None
    pickup_time_window: Optional[str] = None
    pickup_address: Optional[str] = None
    delivery_address: Optional[str] = None
    estimated_lbs: Optional[float] = None
    notes: Optional[str] = None
    gate_code: Optional[str] = None

class OrderResponse(BaseModel):
    id: str
    order_number: str
    customer_id: str
    customer_name: Optional[str] = None
    service_type: str
    pickup_date: Optional[str] = None
    pickup_time_window: Optional[str] = None
    pickup_address: Optional[str] = None
    delivery_address: Optional[str] = None
    estimated_lbs: Optional[float] = None
    actual_lbs: Optional[float] = None
    notes: Optional[str] = None
    gate_code: Optional[str] = None
    status: str
    payment_status: str
    total_amount: Optional[float] = None
    created_at: str
    updated_at: str

class QuoteCreate(BaseModel):
    company_name: str
    contact_name: str
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    industry: Optional[str] = None
    estimated_lbs_per_week: Optional[float] = None
    service_needs: Optional[str] = None
    notes: Optional[str] = None

class QuoteResponse(BaseModel):
    id: str
    quote_number: str
    company_name: str
    contact_name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    industry: Optional[str] = None
    estimated_lbs_per_week: Optional[float] = None
    service_needs: Optional[str] = None
    notes: Optional[str] = None
    status: str
    assigned_to: Optional[str] = None
    follow_up_date: Optional[str] = None
    created_at: str
    updated_at: str

class LeadCreate(BaseModel):
    name: str
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    source: Optional[str] = "website"
    interest_type: Optional[str] = None
    notes: Optional[str] = None

class LeadResponse(BaseModel):
    id: str
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    source: str
    interest_type: Optional[str] = None
    notes: Optional[str] = None
    status: str
    converted_to_customer_id: Optional[str] = None
    created_at: str
    updated_at: str

class TicketCreate(BaseModel):
    customer_id: Optional[str] = None
    subject: str
    description: str
    category: Optional[str] = "general"

class TicketResponse(BaseModel):
    id: str
    ticket_number: str
    customer_id: Optional[str] = None
    customer_name: Optional[str] = None
    subject: str
    description: str
    category: str
    priority: str
    status: str
    assigned_to: Optional[str] = None
    resolution: Optional[str] = None
    created_at: str
    updated_at: str

class IngestCreate(BaseModel):
    source_form: str
    data: dict

class AuditLogResponse(BaseModel):
    id: str
    event_type: str
    entity_type: str
    entity_id: str
    user_id: Optional[str] = None
    details: Optional[dict] = None
    created_at: str

class DashboardStats(BaseModel):
    total_customers: int
    total_orders: int
    pending_orders: int
    open_tickets: int
    active_quotes: int
    new_leads: int
    orders_today: int
    revenue_this_month: float

# ==================== AUTH HELPERS ====================

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))

def create_token(user_id: str, email: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRATION_HOURS)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token")
        user = await db.users.find_one({"id": user_id}, {"_id": 0})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

# ==================== AUDIT LOG HELPER ====================

async def create_audit_log(event_type: str, entity_type: str, entity_id: str, user_id: str = None, details: dict = None):
    log = {
        "id": str(uuid.uuid4()),
        "event_type": event_type,
        "entity_type": entity_type,
        "entity_id": entity_id,
        "user_id": user_id,
        "details": details,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.audit_logs.insert_one(log)

# ==================== AUTH ENDPOINTS ====================

@api_router.post("/auth/register", response_model=TokenResponse)
async def register(user_data: UserCreate):
    existing = await db.users.find_one({"email": user_data.email.lower()})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    user_id = str(uuid.uuid4())
    user = {
        "id": user_id,
        "email": user_data.email.lower(),
        "password_hash": hash_password(user_data.password),
        "name": user_data.name,
        "role": "admin",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.users.insert_one(user)
    await create_audit_log("USER_CREATED", "user", user_id, user_id)
    
    token = create_token(user_id, user["email"])
    return TokenResponse(
        access_token=token,
        token_type="bearer",
        user=UserResponse(id=user_id, email=user["email"], name=user["name"], role=user["role"], created_at=user["created_at"])
    )

@api_router.post("/auth/login", response_model=TokenResponse)
async def login(credentials: UserLogin):
    user = await db.users.find_one({"email": credentials.email.lower()}, {"_id": 0})
    if not user or not verify_password(credentials.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    
    token = create_token(user["id"], user["email"])
    return TokenResponse(
        access_token=token,
        token_type="bearer",
        user=UserResponse(id=user["id"], email=user["email"], name=user["name"], role=user["role"], created_at=user["created_at"])
    )

@api_router.get("/auth/me", response_model=UserResponse)
async def get_me(current_user: dict = Depends(get_current_user)):
    return UserResponse(
        id=current_user["id"],
        email=current_user["email"],
        name=current_user["name"],
        role=current_user["role"],
        created_at=current_user["created_at"]
    )

# ==================== DASHBOARD ====================

@api_router.get("/dashboard/stats", response_model=DashboardStats)
async def get_dashboard_stats(current_user: dict = Depends(get_current_user)):
    today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    month_start = datetime.now(timezone.utc).replace(day=1, hour=0, minute=0, second=0, microsecond=0).isoformat()
    
    total_customers = await db.customers.count_documents({})
    total_orders = await db.orders.count_documents({})
    pending_orders = await db.orders.count_documents({"status": {"$in": ["new", "processing", "ready"]}})
    open_tickets = await db.tickets.count_documents({"status": {"$in": ["open", "in_progress"]}})
    active_quotes = await db.quotes.count_documents({"status": {"$in": ["new", "sent", "negotiating"]}})
    new_leads = await db.leads.count_documents({"status": "new"})
    orders_today = await db.orders.count_documents({"created_at": {"$gte": today}})
    
    # Calculate revenue
    pipeline = [
        {"$match": {"created_at": {"$gte": month_start}, "payment_status": "paid"}},
        {"$group": {"_id": None, "total": {"$sum": "$total_amount"}}}
    ]
    revenue_result = await db.orders.aggregate(pipeline).to_list(1)
    revenue = revenue_result[0]["total"] if revenue_result else 0
    
    return DashboardStats(
        total_customers=total_customers,
        total_orders=total_orders,
        pending_orders=pending_orders,
        open_tickets=open_tickets,
        active_quotes=active_quotes,
        new_leads=new_leads,
        orders_today=orders_today,
        revenue_this_month=revenue or 0
    )

@api_router.get("/dashboard/recent-activity")
async def get_recent_activity(current_user: dict = Depends(get_current_user)):
    logs = await db.audit_logs.find({}, {"_id": 0}).sort("created_at", -1).limit(20).to_list(20)
    return logs

# ==================== CUSTOMERS ====================

@api_router.post("/customers", response_model=CustomerResponse)
async def create_customer(data: CustomerCreate, current_user: dict = Depends(get_current_user)):
    customer_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    customer = {
        "id": customer_id,
        "name": data.name,
        "email": data.email.lower() if data.email else None,
        "phone": data.phone,
        "address": data.address,
        "preferred_contact": data.preferred_contact,
        "notes": data.notes,
        "status": "active",
        "total_orders": 0,
        "created_at": now,
        "updated_at": now
    }
    await db.customers.insert_one(customer)
    await create_audit_log("CUSTOMER_CREATED", "customer", customer_id, current_user["id"])
    del customer["_id"] if "_id" in customer else None
    return CustomerResponse(**customer)

@api_router.get("/customers", response_model=List[CustomerResponse])
async def get_customers(
    search: Optional[str] = None,
    status: Optional[str] = None,
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
    
    customers = await db.customers.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return [CustomerResponse(**c) for c in customers]

@api_router.get("/customers/{customer_id}", response_model=CustomerResponse)
async def get_customer(customer_id: str, current_user: dict = Depends(get_current_user)):
    customer = await db.customers.find_one({"id": customer_id}, {"_id": 0})
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    return CustomerResponse(**customer)

@api_router.put("/customers/{customer_id}", response_model=CustomerResponse)
async def update_customer(customer_id: str, data: CustomerCreate, current_user: dict = Depends(get_current_user)):
    update_data = data.model_dump(exclude_unset=True)
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    if "email" in update_data and update_data["email"]:
        update_data["email"] = update_data["email"].lower()
    
    result = await db.customers.update_one({"id": customer_id}, {"$set": update_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Customer not found")
    
    await create_audit_log("CUSTOMER_UPDATED", "customer", customer_id, current_user["id"])
    customer = await db.customers.find_one({"id": customer_id}, {"_id": 0})
    return CustomerResponse(**customer)

@api_router.delete("/customers/{customer_id}")
async def delete_customer(customer_id: str, current_user: dict = Depends(get_current_user)):
    result = await db.customers.delete_one({"id": customer_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Customer not found")
    await create_audit_log("CUSTOMER_DELETED", "customer", customer_id, current_user["id"])
    return {"message": "Customer deleted"}

# ==================== PREFERENCES ====================

@api_router.post("/preferences", response_model=PreferenceResponse)
async def create_preference(data: PreferenceCreate, current_user: dict = Depends(get_current_user)):
    existing = await db.preferences.find({"customer_id": data.customer_id}).sort("version", -1).limit(1).to_list(1)
    version = (existing[0]["version"] + 1) if existing else 1
    
    pref_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    pref = {
        "id": pref_id,
        "customer_id": data.customer_id,
        "detergent_type": data.detergent_type,
        "folding_style": data.folding_style,
        "special_instructions": data.special_instructions,
        "hang_dry_items": data.hang_dry_items or [],
        "fragrance_preference": data.fragrance_preference,
        "version": version,
        "created_at": now,
        "updated_at": now
    }
    await db.preferences.insert_one(pref)
    await create_audit_log("PREFERENCE_CREATED", "preference", pref_id, current_user["id"])
    return PreferenceResponse(**pref)

@api_router.get("/preferences/customer/{customer_id}", response_model=PreferenceResponse)
async def get_customer_preference(customer_id: str, current_user: dict = Depends(get_current_user)):
    pref = await db.preferences.find({"customer_id": customer_id}, {"_id": 0}).sort("version", -1).limit(1).to_list(1)
    if not pref:
        raise HTTPException(status_code=404, detail="Preferences not found")
    return PreferenceResponse(**pref[0])

# ==================== ORDERS ====================

async def generate_order_number():
    today = datetime.now(timezone.utc).strftime("%Y%m%d")
    count = await db.orders.count_documents({"order_number": {"$regex": f"^ORD-{today}"}})
    return f"ORD-{today}-{str(count + 1).zfill(4)}"

@api_router.post("/orders", response_model=OrderResponse)
async def create_order(data: OrderCreate, current_user: dict = Depends(get_current_user)):
    customer = await db.customers.find_one({"id": data.customer_id}, {"_id": 0})
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    
    order_id = str(uuid.uuid4())
    order_number = await generate_order_number()
    now = datetime.now(timezone.utc).isoformat()
    
    order = {
        "id": order_id,
        "order_number": order_number,
        "customer_id": data.customer_id,
        "customer_name": customer["name"],
        "service_type": data.service_type,
        "pickup_date": data.pickup_date,
        "pickup_time_window": data.pickup_time_window,
        "pickup_address": data.pickup_address or customer.get("address"),
        "delivery_address": data.delivery_address,
        "estimated_lbs": data.estimated_lbs,
        "actual_lbs": None,
        "notes": data.notes,
        "gate_code": data.gate_code,
        "status": "new",
        "payment_status": "unpaid",
        "total_amount": None,
        "created_at": now,
        "updated_at": now
    }
    await db.orders.insert_one(order)
    await db.customers.update_one({"id": data.customer_id}, {"$inc": {"total_orders": 1}})
    await create_audit_log("ORDER_CREATED", "order", order_id, current_user["id"])
    return OrderResponse(**order)

@api_router.get("/orders", response_model=List[OrderResponse])
async def get_orders(
    status: Optional[str] = None,
    customer_id: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    query = {}
    if status:
        query["status"] = status
    if customer_id:
        query["customer_id"] = customer_id
    if date_from:
        query["created_at"] = {"$gte": date_from}
    if date_to:
        query.setdefault("created_at", {})["$lte"] = date_to
    
    orders = await db.orders.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return [OrderResponse(**o) for o in orders]

@api_router.get("/orders/{order_id}", response_model=OrderResponse)
async def get_order(order_id: str, current_user: dict = Depends(get_current_user)):
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    return OrderResponse(**order)

@api_router.put("/orders/{order_id}", response_model=OrderResponse)
async def update_order(order_id: str, data: dict, current_user: dict = Depends(get_current_user)):
    data["updated_at"] = datetime.now(timezone.utc).isoformat()
    result = await db.orders.update_one({"id": order_id}, {"$set": data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Order not found")
    
    await create_audit_log("ORDER_UPDATED", "order", order_id, current_user["id"], {"changes": list(data.keys())})
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    return OrderResponse(**order)

@api_router.patch("/orders/{order_id}/status")
async def update_order_status(order_id: str, status: str, current_user: dict = Depends(get_current_user)):
    valid_statuses = ["new", "processing", "ready", "out_for_delivery", "delivered", "completed", "cancelled"]
    if status not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {valid_statuses}")
    
    result = await db.orders.update_one(
        {"id": order_id},
        {"$set": {"status": status, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Order not found")
    
    await create_audit_log("ORDER_STATUS_CHANGED", "order", order_id, current_user["id"], {"new_status": status})
    return {"message": f"Order status updated to {status}"}

# ==================== QUOTES ====================

async def generate_quote_number():
    today = datetime.now(timezone.utc).strftime("%Y%m%d")
    count = await db.quotes.count_documents({"quote_number": {"$regex": f"^QT-{today}"}})
    return f"QT-{today}-{str(count + 1).zfill(4)}"

@api_router.post("/quotes", response_model=QuoteResponse)
async def create_quote(data: QuoteCreate, current_user: dict = Depends(get_current_user)):
    quote_id = str(uuid.uuid4())
    quote_number = await generate_quote_number()
    now = datetime.now(timezone.utc).isoformat()
    
    quote = {
        "id": quote_id,
        "quote_number": quote_number,
        "company_name": data.company_name,
        "contact_name": data.contact_name,
        "email": data.email.lower() if data.email else None,
        "phone": data.phone,
        "industry": data.industry,
        "estimated_lbs_per_week": data.estimated_lbs_per_week,
        "service_needs": data.service_needs,
        "notes": data.notes,
        "status": "new",
        "assigned_to": None,
        "follow_up_date": None,
        "created_at": now,
        "updated_at": now
    }
    await db.quotes.insert_one(quote)
    await create_audit_log("QUOTE_CREATED", "quote", quote_id, current_user["id"])
    return QuoteResponse(**quote)

@api_router.get("/quotes", response_model=List[QuoteResponse])
async def get_quotes(
    status: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    query = {}
    if status:
        query["status"] = status
    
    quotes = await db.quotes.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return [QuoteResponse(**q) for q in quotes]

@api_router.get("/quotes/{quote_id}", response_model=QuoteResponse)
async def get_quote(quote_id: str, current_user: dict = Depends(get_current_user)):
    quote = await db.quotes.find_one({"id": quote_id}, {"_id": 0})
    if not quote:
        raise HTTPException(status_code=404, detail="Quote not found")
    return QuoteResponse(**quote)

@api_router.put("/quotes/{quote_id}", response_model=QuoteResponse)
async def update_quote(quote_id: str, data: dict, current_user: dict = Depends(get_current_user)):
    data["updated_at"] = datetime.now(timezone.utc).isoformat()
    result = await db.quotes.update_one({"id": quote_id}, {"$set": data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Quote not found")
    
    await create_audit_log("QUOTE_UPDATED", "quote", quote_id, current_user["id"])
    quote = await db.quotes.find_one({"id": quote_id}, {"_id": 0})
    return QuoteResponse(**quote)

# ==================== LEADS ====================

@api_router.post("/leads", response_model=LeadResponse)
async def create_lead(data: LeadCreate, current_user: dict = Depends(get_current_user)):
    lead_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    
    lead = {
        "id": lead_id,
        "name": data.name,
        "email": data.email.lower() if data.email else None,
        "phone": data.phone,
        "source": data.source,
        "interest_type": data.interest_type,
        "notes": data.notes,
        "status": "new",
        "converted_to_customer_id": None,
        "created_at": now,
        "updated_at": now
    }
    await db.leads.insert_one(lead)
    await create_audit_log("LEAD_CREATED", "lead", lead_id, current_user["id"])
    return LeadResponse(**lead)

@api_router.get("/leads", response_model=List[LeadResponse])
async def get_leads(
    status: Optional[str] = None,
    source: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    query = {}
    if status:
        query["status"] = status
    if source:
        query["source"] = source
    
    leads = await db.leads.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return [LeadResponse(**l) for l in leads]

@api_router.get("/leads/{lead_id}", response_model=LeadResponse)
async def get_lead(lead_id: str, current_user: dict = Depends(get_current_user)):
    lead = await db.leads.find_one({"id": lead_id}, {"_id": 0})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    return LeadResponse(**lead)

@api_router.put("/leads/{lead_id}", response_model=LeadResponse)
async def update_lead(lead_id: str, data: dict, current_user: dict = Depends(get_current_user)):
    data["updated_at"] = datetime.now(timezone.utc).isoformat()
    result = await db.leads.update_one({"id": lead_id}, {"$set": data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Lead not found")
    
    await create_audit_log("LEAD_UPDATED", "lead", lead_id, current_user["id"])
    lead = await db.leads.find_one({"id": lead_id}, {"_id": 0})
    return LeadResponse(**lead)

@api_router.post("/leads/{lead_id}/convert", response_model=CustomerResponse)
async def convert_lead_to_customer(lead_id: str, current_user: dict = Depends(get_current_user)):
    lead = await db.leads.find_one({"id": lead_id}, {"_id": 0})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    if lead["status"] == "converted":
        raise HTTPException(status_code=400, detail="Lead already converted")
    
    customer_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    customer = {
        "id": customer_id,
        "name": lead["name"],
        "email": lead["email"],
        "phone": lead["phone"],
        "address": None,
        "preferred_contact": "email",
        "notes": lead.get("notes"),
        "status": "active",
        "total_orders": 0,
        "created_at": now,
        "updated_at": now
    }
    await db.customers.insert_one(customer)
    await db.leads.update_one(
        {"id": lead_id},
        {"$set": {"status": "converted", "converted_to_customer_id": customer_id, "updated_at": now}}
    )
    await create_audit_log("LEAD_CONVERTED", "lead", lead_id, current_user["id"], {"customer_id": customer_id})
    return CustomerResponse(**customer)

# ==================== SUPPORT TICKETS ====================

async def generate_ticket_number():
    count = await db.tickets.count_documents({})
    return f"TKT-{str(count + 1).zfill(5)}"

def determine_priority(subject: str, description: str) -> str:
    text = (subject + " " + description).lower()
    high_keywords = ["refund", "damaged", "missing", "complaint", "urgent", "broken", "lost"]
    if any(kw in text for kw in high_keywords):
        return "high"
    medium_keywords = ["issue", "problem", "error", "wrong"]
    if any(kw in text for kw in medium_keywords):
        return "medium"
    return "low"

@api_router.post("/tickets", response_model=TicketResponse)
async def create_ticket(data: TicketCreate, current_user: dict = Depends(get_current_user)):
    customer_name = None
    if data.customer_id:
        customer = await db.customers.find_one({"id": data.customer_id}, {"_id": 0})
        customer_name = customer["name"] if customer else None
    
    ticket_id = str(uuid.uuid4())
    ticket_number = await generate_ticket_number()
    priority = determine_priority(data.subject, data.description)
    now = datetime.now(timezone.utc).isoformat()
    
    ticket = {
        "id": ticket_id,
        "ticket_number": ticket_number,
        "customer_id": data.customer_id,
        "customer_name": customer_name,
        "subject": data.subject,
        "description": data.description,
        "category": data.category,
        "priority": priority,
        "status": "open",
        "assigned_to": None,
        "resolution": None,
        "created_at": now,
        "updated_at": now
    }
    await db.tickets.insert_one(ticket)
    await create_audit_log("TICKET_CREATED", "ticket", ticket_id, current_user["id"])
    return TicketResponse(**ticket)

@api_router.get("/tickets", response_model=List[TicketResponse])
async def get_tickets(
    status: Optional[str] = None,
    priority: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    query = {}
    if status:
        query["status"] = status
    if priority:
        query["priority"] = priority
    
    tickets = await db.tickets.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return [TicketResponse(**t) for t in tickets]

@api_router.get("/tickets/{ticket_id}", response_model=TicketResponse)
async def get_ticket(ticket_id: str, current_user: dict = Depends(get_current_user)):
    ticket = await db.tickets.find_one({"id": ticket_id}, {"_id": 0})
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    return TicketResponse(**ticket)

@api_router.put("/tickets/{ticket_id}", response_model=TicketResponse)
async def update_ticket(ticket_id: str, data: dict, current_user: dict = Depends(get_current_user)):
    data["updated_at"] = datetime.now(timezone.utc).isoformat()
    result = await db.tickets.update_one({"id": ticket_id}, {"$set": data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Ticket not found")
    
    await create_audit_log("TICKET_UPDATED", "ticket", ticket_id, current_user["id"])
    ticket = await db.tickets.find_one({"id": ticket_id}, {"_id": 0})
    return TicketResponse(**ticket)

# ==================== INGEST & ROUTING ====================

@api_router.post("/ingest")
async def process_ingest(data: IngestCreate, current_user: dict = Depends(get_current_user)):
    """
    Process incoming form submission and route to appropriate collection
    """
    ingest_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    
    # Save raw ingest
    ingest_record = {
        "id": ingest_id,
        "source_form": data.source_form,
        "data": data.data,
        "processed_flag": "locked",
        "processed_at": now,
        "route_result": None,
        "error_notes": None,
        "created_at": now
    }
    await db.ingest.insert_one(ingest_record)
    await create_audit_log("INGEST_LOCKED", "ingest", ingest_id, current_user["id"])
    
    # Route based on source_form
    route_result = "unknown"
    entity_id = None
    
    try:
        source = data.source_form.lower()
        form_data = data.data
        
        if any(kw in source for kw in ["pickup", "order", "delivery"]):
            # Route to Orders
            customer = await db.customers.find_one({"email": form_data.get("email", "").lower()}, {"_id": 0})
            if not customer:
                customer_id = str(uuid.uuid4())
                customer = {
                    "id": customer_id,
                    "name": form_data.get("name", "Unknown"),
                    "email": form_data.get("email", "").lower() or None,
                    "phone": form_data.get("phone"),
                    "address": form_data.get("address"),
                    "preferred_contact": "email",
                    "notes": None,
                    "status": "active",
                    "total_orders": 0,
                    "created_at": now,
                    "updated_at": now
                }
                await db.customers.insert_one(customer)
            
            order_id = str(uuid.uuid4())
            order_number = await generate_order_number()
            order = {
                "id": order_id,
                "order_number": order_number,
                "customer_id": customer["id"],
                "customer_name": customer["name"],
                "service_type": form_data.get("service_type", "pickup_delivery"),
                "pickup_date": form_data.get("pickup_date"),
                "pickup_time_window": form_data.get("pickup_time"),
                "pickup_address": form_data.get("address"),
                "delivery_address": form_data.get("delivery_address"),
                "estimated_lbs": form_data.get("estimated_lbs"),
                "actual_lbs": None,
                "notes": form_data.get("notes"),
                "gate_code": form_data.get("gate_code"),
                "status": "new",
                "payment_status": "unpaid",
                "total_amount": None,
                "created_at": now,
                "updated_at": now
            }
            await db.orders.insert_one(order)
            await db.customers.update_one({"id": customer["id"]}, {"$inc": {"total_orders": 1}})
            route_result = "orders"
            entity_id = order_id
            
        elif any(kw in source for kw in ["quote", "commercial", "b2b", "business"]):
            # Route to Quotes
            quote_id = str(uuid.uuid4())
            quote_number = await generate_quote_number()
            quote = {
                "id": quote_id,
                "quote_number": quote_number,
                "company_name": form_data.get("company_name", form_data.get("name", "Unknown")),
                "contact_name": form_data.get("contact_name", form_data.get("name", "")),
                "email": form_data.get("email", "").lower() or None,
                "phone": form_data.get("phone"),
                "industry": form_data.get("industry"),
                "estimated_lbs_per_week": form_data.get("estimated_lbs"),
                "service_needs": form_data.get("service_needs"),
                "notes": form_data.get("notes"),
                "status": "new",
                "assigned_to": None,
                "follow_up_date": None,
                "created_at": now,
                "updated_at": now
            }
            await db.quotes.insert_one(quote)
            route_result = "quotes"
            entity_id = quote_id
            
        elif any(kw in source for kw in ["support", "ticket", "issue", "feedback", "complaint"]):
            # Route to Support Tickets
            ticket_id = str(uuid.uuid4())
            ticket_number = await generate_ticket_number()
            subject = form_data.get("subject", form_data.get("regarding", "Support Request"))
            description = form_data.get("description", form_data.get("message", ""))
            priority = determine_priority(subject, description)
            
            ticket = {
                "id": ticket_id,
                "ticket_number": ticket_number,
                "customer_id": None,
                "customer_name": form_data.get("name"),
                "subject": subject,
                "description": description,
                "category": form_data.get("category", "general"),
                "priority": priority,
                "status": "open",
                "assigned_to": None,
                "resolution": None,
                "created_at": now,
                "updated_at": now
            }
            await db.tickets.insert_one(ticket)
            route_result = "tickets"
            entity_id = ticket_id
            
        else:
            # Default to Leads
            lead_id = str(uuid.uuid4())
            lead = {
                "id": lead_id,
                "name": form_data.get("name", "Unknown"),
                "email": form_data.get("email", "").lower() or None,
                "phone": form_data.get("phone"),
                "source": data.source_form,
                "interest_type": form_data.get("interest_type", form_data.get("service_type")),
                "notes": form_data.get("notes", form_data.get("message")),
                "status": "new",
                "converted_to_customer_id": None,
                "created_at": now,
                "updated_at": now
            }
            await db.leads.insert_one(lead)
            route_result = "leads"
            entity_id = lead_id
        
        # Update ingest record
        await db.ingest.update_one(
            {"id": ingest_id},
            {"$set": {"processed_flag": "processed", "route_result": route_result, "route_id": entity_id}}
        )
        await create_audit_log("INGEST_ROUTED", "ingest", ingest_id, current_user["id"], {"route": route_result, "entity_id": entity_id})
        
    except Exception as e:
        await db.ingest.update_one(
            {"id": ingest_id},
            {"$set": {"processed_flag": "error", "error_notes": str(e)}}
        )
        await create_audit_log("INGEST_ERROR", "ingest", ingest_id, current_user["id"], {"error": str(e)})
        raise HTTPException(status_code=500, detail=f"Error processing ingest: {str(e)}")
    
    return {
        "ingest_id": ingest_id,
        "route_result": route_result,
        "entity_id": entity_id,
        "message": f"Form submission routed to {route_result}"
    }

@api_router.get("/ingest", response_model=List[dict])
async def get_ingest_records(
    status: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    query = {}
    if status:
        query["processed_flag"] = status
    
    records = await db.ingest.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return records

# ==================== AUDIT LOG ====================

@api_router.get("/audit-logs", response_model=List[AuditLogResponse])
async def get_audit_logs(
    entity_type: Optional[str] = None,
    entity_id: Optional[str] = None,
    event_type: Optional[str] = None,
    limit: int = 100,
    current_user: dict = Depends(get_current_user)
):
    query = {}
    if entity_type:
        query["entity_type"] = entity_type
    if entity_id:
        query["entity_id"] = entity_id
    if event_type:
        query["event_type"] = event_type
    
    logs = await db.audit_logs.find(query, {"_id": 0}).sort("created_at", -1).limit(limit).to_list(limit)
    return [AuditLogResponse(**log) for log in logs]

# ==================== HEALTH CHECK ====================

@api_router.get("/")
async def root():
    return {"message": "Ventura Fresh Laundry CRM API", "status": "healthy"}

@api_router.get("/health")
async def health_check():
    return {"status": "healthy", "timestamp": datetime.now(timezone.utc).isoformat()}

# Include router and middleware
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
