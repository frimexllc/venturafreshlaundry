from fastapi import FastAPI, APIRouter, HTTPException, Depends, status, Query, Request, UploadFile, File
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import StreamingResponse, HTMLResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import io
import csv
import json
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timezone, timedelta
import jwt
import bcrypt
import requests
import qrcode
from qrcode.image.svg import SvgImage
import zipfile

from normalization import (
    normalize_email,
    normalize_phone,
    normalize_spaces,
    normalize_name,
    normalize_address,
    normalize_yes_no
)

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env', override=True)

# Import AI Assistant
try:
    from ai_assistant import generate_daily_briefing, ai_analyze_business, ai_suggest_actions
    AI_ASSISTANT_ENABLED = True
except ImportError:
    AI_ASSISTANT_ENABLED = False
    logger = logging.getLogger(__name__)
    logger.warning("AI Assistant not available")

# Import notification services
try:
    from notifications import notify_order_created, notify_order_status_changed, send_email, send_sms
    NOTIFICATIONS_ENABLED = True
except ImportError:
    NOTIFICATIONS_ENABLED = False
    logger = logging.getLogger(__name__)
    logger.warning("Notification services not available")

# Import n8n integration
try:
    from n8n_integration import n8n_router, set_database as set_n8n_db
    N8N_ENABLED = True
except ImportError:
    N8N_ENABLED = False
    n8n_router = None
    logger = logging.getLogger(__name__)
    logger.warning("n8n integration not available")

# Import store module
try:
    from store import store_router, set_database as set_store_db, handle_stripe_webhook
    STORE_ENABLED = True
except ImportError:
    STORE_ENABLED = False
    store_router = None
    logger = logging.getLogger(__name__)
    logger.warning("Store module not available")

# Import blog module
try:
    from blog import blog_router, set_database as set_blog_db
    BLOG_ENABLED = True
except ImportError:
    BLOG_ENABLED = False
    blog_router = None
    logger = logging.getLogger(__name__)
    logger.warning("Blog module not available")

# Import automation engine
try:
    from automation_engine import automation_router, set_database as set_automation_db
    AUTOMATION_ENABLED = True
except ImportError:
    AUTOMATION_ENABLED = False
    automation_router = None
    logger = logging.getLogger(__name__)
    logger.warning("Automation engine not available")

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]
SKIP_SERVER_NOTIFICATIONS = os.environ.get('SKIP_SERVER_NOTIFICATIONS', 'false').lower() == 'true'

# Set database for n8n integration
if N8N_ENABLED:
    set_n8n_db(db)

# Set database for store module
if STORE_ENABLED:
    set_store_db(db)

# Set database for blog module
if BLOG_ENABLED:
    set_blog_db(db)

# Set database for automation engine
if AUTOMATION_ENABLED:
    set_automation_db(db)

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
    role: Optional[str] = "operator"  # Default to operator for new users

class UserLogin(BaseModel):
    email: EmailStr
    password: str

# Role-based access control constants
ROLE_ADMIN = "admin"
ROLE_OPERATOR = "operator"
VALID_ROLES = [ROLE_ADMIN, ROLE_OPERATOR]

# Permissions by role - what each role can access
ROLE_PERMISSIONS = {
    ROLE_ADMIN: ["all"],  # Admin has access to everything
    ROLE_OPERATOR: [
        "orders:read", "orders:update_status",
        "customers:read",
        "services:read",
        "operator_dashboard"
    ]
}

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
    membership_plan: Optional[str] = None
    membership_status: Optional[str] = None
    membership_start_date: Optional[str] = None
    preferences_id: Optional[str] = None

class CustomerResponse(BaseModel):
    id: str
    name: Optional[str] = ""
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    preferred_contact: Optional[str] = "email"
    notes: Optional[str] = None
    status: Optional[str] = "active"
    total_orders: Optional[int] = 0
    membership_plan: Optional[str] = None
    membership_status: Optional[str] = None
    membership_start_date: Optional[str] = None
    preferences_id: Optional[str] = None
    created_at: Optional[str] = ""
    updated_at: Optional[str] = ""

class PreferenceCreate(BaseModel):
    customer_id: str
    detergent_type: Optional[str] = "standard"
    water_temperature: Optional[str] = None
    fabric_softener: Optional[str] = None
    folding_style: Optional[str] = "standard"
    hanging_instructions: Optional[str] = None
    allergies: Optional[str] = None
    special_instructions: Optional[str] = None
    pickup_time_preference: Optional[str] = None
    gate_code: Optional[str] = None
    hang_dry_items: Optional[List[str]] = []
    fragrance_preference: Optional[str] = "light"

class CustomerPreferenceUpdate(BaseModel):
    detergent_type: Optional[str] = "standard"
    water_temperature: Optional[str] = None
    fabric_softener: Optional[str] = None
    folding_style: Optional[str] = "standard"
    hanging_instructions: Optional[str] = None
    allergies: Optional[str] = None
    special_instructions: Optional[str] = None
    pickup_time_preference: Optional[str] = None
    gate_code: Optional[str] = None
    hang_dry_items: Optional[List[str]] = []
    fragrance_preference: Optional[str] = "light"

class PreferenceResponse(BaseModel):
    id: str
    customer_id: str
    detergent_type: str
    water_temperature: Optional[str]
    fabric_softener: Optional[str]
    folding_style: str
    hanging_instructions: Optional[str]
    allergies: Optional[str]
    special_instructions: Optional[str]
    pickup_time_preference: Optional[str]
    gate_code: Optional[str]
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
    order_number: Optional[str] = None
    customer_id: Optional[str] = None
    customer_name: Optional[str] = None
    service_type: Optional[str] = "general"
    pickup_date: Optional[str] = None
    pickup_time_window: Optional[str] = None
    pickup_address: Optional[str] = None
    delivery_address: Optional[str] = None
    estimated_lbs: Optional[float] = None
    actual_lbs: Optional[float] = None
    notes: Optional[str] = None
    gate_code: Optional[str] = None
    preferences_id: Optional[str] = None
    preferences_snapshot: Optional[dict] = None
    status: str = "new"
    payment_status: Optional[str] = "pending"
    total_amount: Optional[float] = None
    created_at: Optional[str] = ""
    updated_at: Optional[str] = ""

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

class ServiceCreate(BaseModel):
    name: str
    category: Optional[str] = None
    description: Optional[str] = None
    price: Optional[float] = None
    price_unit: Optional[str] = None
    is_active: bool = True
    sort_order: Optional[int] = 0

class ServiceResponse(BaseModel):
    id: str
    name: str
    category: Optional[str] = None
    description: Optional[str] = None
    price: Optional[float] = None
    price_unit: Optional[str] = None
    is_active: bool
    sort_order: Optional[int] = 0
    created_at: str
    updated_at: str

class MembershipSectionUpdate(BaseModel):
    heading: str
    subheading: Optional[str] = None
    special_title: Optional[str] = None
    special_text: Optional[str] = None
    cta_title: Optional[str] = None
    cta_text: Optional[str] = None
    cta_button_label: Optional[str] = None
    cta_button_url: Optional[str] = None
    contact_phone: Optional[str] = None
    is_active: bool = True

class MembershipSectionResponse(BaseModel):
    id: str
    heading: str
    subheading: Optional[str] = None
    special_title: Optional[str] = None
    special_text: Optional[str] = None
    cta_title: Optional[str] = None
    cta_text: Optional[str] = None
    cta_button_label: Optional[str] = None
    cta_button_url: Optional[str] = None
    contact_phone: Optional[str] = None
    is_active: bool
    created_at: str
    updated_at: str

class MembershipPlanCreate(BaseModel):
    name: str
    price: str
    image_url: Optional[str] = None
    features: List[str]
    is_popular: bool = False
    is_active: bool = True
    sort_order: Optional[int] = 0

class MembershipPlanResponse(BaseModel):
    id: str
    name: str
    price: str
    image_url: Optional[str] = None
    features: List[str]
    is_popular: bool
    is_active: bool
    sort_order: Optional[int] = 0
    created_at: str
    updated_at: str

class MembershipSignupResponse(BaseModel):
    id: str
    first_name: Optional[str] = ""
    last_name: Optional[str] = ""
    email: Optional[str] = ""
    phone: Optional[str] = ""
    contact_method: Optional[str] = ""
    address_line1: Optional[str] = ""
    address_line2: Optional[str] = None
    city: Optional[str] = ""
    state: Optional[str] = ""
    zip_code: Optional[str] = ""
    membership_plan: Optional[str] = ""
    plan_name: Optional[str] = None
    plan_id: Optional[str] = None
    laundry_frequency: Optional[str] = ""
    estimated_lbs: Optional[float] = 0
    amount: Optional[float] = None
    payment_status: Optional[str] = None
    status: str = "pending"
    customer_id: Optional[str] = None
    customer_name: Optional[str] = None
    customer_email: Optional[str] = None
    customer_phone: Optional[str] = None
    stripe_session_id: Optional[str] = None
    created_at: Optional[str] = ""
    updated_at: Optional[str] = ""

class MembershipSignupUpdate(BaseModel):
    status: Optional[str] = None
    customer_id: Optional[str] = None

class MembershipCustomerUpdate(BaseModel):
    membership_plan: Optional[str] = None
    membership_status: Optional[str] = None
    membership_start_date: Optional[str] = None

class AdminAIRequest(BaseModel):
    message: str
    execute: bool = True

class AdminAIInsightsRequest(BaseModel):
    type: str

class PatternScanRequest(BaseModel):
    periodo_desde: Optional[str] = None
    periodo_hasta: Optional[str] = None
    scope: Optional[str] = "orders"
    filtros: Optional[dict] = None

class ProposalGenerateRequest(BaseModel):
    patrones_ids: Optional[List[str]] = None
    max_propuestas: Optional[int] = 10

class ProposalActionRequest(BaseModel):
    accion: str
    modificaciones: Optional[dict] = None
    comentarios: Optional[str] = None

class ImportMappingSuggestRequest(BaseModel):
    campos_legacy: List[str]

class ImportMappingConfirmRequest(BaseModel):
    mapping_campos: Dict[str, str]

class RulesUpdateRequest(BaseModel):
    rules: Dict[str, Any]

class QrResolveRequest(BaseModel):
    qr_token: Optional[str] = None
    payload: Optional[str] = None

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

def require_admin(current_user: dict):
    if current_user.get("role") != ROLE_ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")

def require_role(allowed_roles: List[str]):
    """Dependency factory that creates a role checker"""
    def checker(current_user: dict = Depends(get_current_user)):
        user_role = current_user.get("role", ROLE_OPERATOR)
        if user_role == ROLE_ADMIN:  # Admin always passes
            return current_user
        if user_role not in allowed_roles:
            raise HTTPException(
                status_code=403, 
                detail=f"Access denied. Required roles: {allowed_roles}"
            )
        return current_user
    return checker

def has_permission(current_user: dict, permission: str) -> bool:
    """Check if user has specific permission"""
    user_role = current_user.get("role", ROLE_OPERATOR)
    if user_role == ROLE_ADMIN:
        return True
    permissions = ROLE_PERMISSIONS.get(user_role, [])
    return "all" in permissions or permission in permissions

def require_permission(permission: str):
    """Dependency factory for permission-based access"""
    def checker(current_user: dict = Depends(get_current_user)):
        if not has_permission(current_user, permission):
            raise HTTPException(
                status_code=403,
                detail=f"Permission denied: {permission}"
            )
        return current_user
    return checker

def extract_json_payload(text: str):
    cleaned = text.strip()
    if "```" in cleaned:
        start = cleaned.find("```")
        end = cleaned.rfind("```")
        if end > start:
            cleaned = cleaned[start + 3:end].strip()
            if cleaned.startswith("json"):
                cleaned = cleaned[4:].strip()
    return json.loads(cleaned)

def call_ollama(prompt: str):
    """Use Groq API for AI responses - faster than local Ollama"""
    import os
    from groq import Groq
    
    api_key = os.environ.get("GROQ_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="Groq API key not configured")
    
    try:
        client = Groq(api_key=api_key)
        chat_completion = client.chat.completions.create(
            messages=[
                {"role": "user", "content": prompt}
            ],
            model="llama-3.3-70b-versatile",  # Free tier model
            temperature=0.7,
            max_tokens=2048
        )
        return chat_completion.choices[0].message.content.strip()
    except Exception as e:
        logger.error(f"Groq API error: {e}")
        raise HTTPException(status_code=502, detail=f"AI service error: {str(e)}")

ai_indexes_ready = False

async def ensure_ai_indexes():
    global ai_indexes_ready
    if ai_indexes_ready:
        return
    await db.patrones_detectados.create_index([("fecha_deteccion", -1)])
    await db.propuestas_ia.create_index([("estado", 1), ("fecha_generacion", -1)])
    await db.importaciones_legacy.create_index([("origen", 1), ("fecha_importacion", -1)])
    await db.audit_logs.create_index([("created_at", -1)])
    ai_indexes_ready = True

async def get_or_seed_business_rules():
    rules = await db.reglas_negocio.find_one({"id": "order_rules_v1"}, {"_id": 0})
    if rules:
        return rules
    now = datetime.now(timezone.utc).isoformat()
    rules = {
        "id": "order_rules_v1",
        "type": "order_rules",
        "auto_transitions": {
            "pickup_delivery": {"notify_status": "out_for_delivery"},
            "wash_fold": {"notify_status": "ready"},
            "self_service": {"notify_status": "ready"}
        },
        "sla_hours": {
            "pickup_delivery": 48,
            "wash_fold": 36,
            "self_service": 24
        },
        "created_at": now,
        "updated_at": now
    }
    await db.reglas_negocio.insert_one(rules)
    return rules

def build_order_times(now_iso: str, status_value: str):
    return {
        "creacion": now_iso,
        "ultimo_cambio_estado": now_iso,
        "fechas_estado": {status_value: now_iso}
    }

def validate_order_payload(data: OrderCreate):
    errors = []
    if data.service_type == "pickup_delivery":
        if not data.pickup_date:
            errors.append({"codigo": "MISSING_PICKUP_DATE", "campo": "pickup_date"})
        if not data.pickup_time_window:
            errors.append({"codigo": "MISSING_PICKUP_TIME", "campo": "pickup_time_window"})
        if not data.pickup_address:
            errors.append({"codigo": "MISSING_PICKUP_ADDRESS", "campo": "pickup_address"})
    return errors

def normalize_header(value: str):
    return value.strip().lower()

def set_nested_value(target: dict, path: str, value):
    parts = path.split(".")
    current = target
    for key in parts[:-1]:
        if key not in current or not isinstance(current[key], dict):
            current[key] = {}
        current = current[key]
    current[parts[-1]] = value

def build_qr_svg(payload: str):
    img = qrcode.make(payload, image_factory=SvgImage, box_size=10, border=2)
    buffer = io.BytesIO()
    img.save(buffer)
    return buffer.getvalue()

def build_qr_payload(order: dict):
    return json.dumps({
        "order_id": order.get("id"),
        "order_number": order.get("order_number"),
        "qr_token": order.get("qr_token")
    })

def parse_qr_payload(payload: str):
    try:
        data = json.loads(payload)
        if isinstance(data, dict):
            return data
    except Exception:
        return {}
    return {}

def build_address_parts(address: Optional[str]):
    if not address:
        return {"full": None, "street": None, "city": None, "postal_code": None}
    parts = [p.strip() for p in address.split(",") if p.strip()]
    street = parts[0] if parts else address
    city = parts[1] if len(parts) > 1 else None
    postal_code = None
    if len(parts) > 2:
        postal_code = parts[-1].split()[-1]
    return {"full": address, "street": street, "city": city, "postal_code": postal_code}

def suggest_mapping(headers: List[str]):
    mapping = {}
    for header in headers:
        key = normalize_header(header)
        if key in ["issue key", "key", "id", "order_number", "order number"]:
            mapping[header] = "order_number"
        elif key in ["status", "estado", "state"]:
            mapping[header] = "estado_actual"
        elif key in ["created", "created_at", "fecha", "creation date"]:
            mapping[header] = "tiempos.creacion"
        elif key in ["customer", "customer_name", "name", "cliente"]:
            mapping[header] = "customer_name"
        elif key in ["email", "correo", "customer_email"]:
            mapping[header] = "customer_email"
        elif key in ["phone", "telefono", "customer_phone"]:
            mapping[header] = "customer_phone"
        elif key in ["service_type", "service", "tipo servicio"]:
            mapping[header] = "service_type"
        elif key in ["notes", "summary", "descripcion", "description"]:
            mapping[header] = "notes"
    return mapping

async def resolve_or_create_customer_from_row(row: dict):
    email = row.get("customer_email")
    phone = row.get("customer_phone")
    name = row.get("customer_name") or "Legacy"
    query = []
    if email:
        query.append({"email": email.lower()})
    if phone:
        query.append({"phone": phone})
    if query:
        existing = await db.customers.find_one({"$or": query}, {"_id": 0})
        if existing:
            return existing["id"]
    customer_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    customer = {
        "id": customer_id,
        "name": name,
        "email": email.lower() if email else None,
        "phone": phone,
        "address": None,
        "preferred_contact": "email",
        "notes": "Importación legacy",
        "status": "active",
        "total_orders": 0,
        "created_at": now,
        "updated_at": now
    }
    await db.customers.insert_one(customer)
    return customer_id

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
    
    # Check if this is the first user - make them admin
    user_count = await db.users.count_documents({})
    role = ROLE_ADMIN if user_count == 0 else ROLE_OPERATOR
    
    user_id = str(uuid.uuid4())
    user = {
        "id": user_id,
        "email": user_data.email.lower(),
        "password_hash": hash_password(user_data.password),
        "name": user_data.name,
        "role": role,
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
    if "name" in update_data:
        update_data["name"] = normalize_name(update_data["name"]) or update_data["name"]
    if "email" in update_data and update_data["email"]:
        normalized_email = normalize_email(update_data["email"])
        update_data["email"] = normalized_email or update_data["email"].lower()
    if "phone" in update_data:
        normalized_phone = normalize_phone(update_data["phone"])
        update_data["phone"] = normalized_phone or update_data["phone"]
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

@api_router.delete("/customers/{customer_id}")
async def delete_customer(customer_id: str, current_user: dict = Depends(get_current_user)):
    result = await db.customers.delete_one({"id": customer_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Customer not found")
    await create_audit_log("CUSTOMER_DELETED", "customer", customer_id, current_user["id"])
    return {"message": "Customer deleted"}

# ==================== PREFERENCES ====================

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

@api_router.post("/preferences", response_model=PreferenceResponse)
async def create_preference(data: PreferenceCreate, current_user: dict = Depends(get_current_user)):
    existing = await db.preferences.find({"customer_id": data.customer_id}).sort("version", -1).limit(1).to_list(1)
    version = (existing[0]["version"] + 1) if existing else 1

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

@api_router.get("/preferences/customer/{customer_id}", response_model=PreferenceResponse)
async def get_customer_preference(customer_id: str, current_user: dict = Depends(get_current_user)):
    pref = await db.preferences.find({"customer_id": customer_id}, {"_id": 0}).sort("version", -1).limit(1).to_list(1)
    if not pref:
        raise HTTPException(status_code=404, detail="Preferences not found")
    return PreferenceResponse(**pref[0])

@api_router.get("/customer/preferences", response_model=PreferenceResponse)
async def get_current_customer_preferences(current_customer: dict = Depends(get_current_customer)):
    pref = await db.preferences.find({"customer_id": current_customer["id"]}, {"_id": 0}).sort("version", -1).limit(1).to_list(1)
    if not pref:
        raise HTTPException(status_code=404, detail="Preferences not found")
    return PreferenceResponse(**pref[0])

@api_router.post("/customer/preferences", response_model=PreferenceResponse)
async def upsert_customer_preferences(data: CustomerPreferenceUpdate, current_customer: dict = Depends(get_current_customer)):
    existing = await db.preferences.find({"customer_id": current_customer["id"]}).sort("version", -1).limit(1).to_list(1)
    version = (existing[0]["version"] + 1) if existing else 1

    pref_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    normalized = normalize_preference_payload(PreferenceCreate(customer_id=current_customer["id"], **data.model_dump()))
    pref = {
        "id": pref_id,
        "customer_id": current_customer["id"],
        **normalized,
        "version": version,
        "created_at": now,
        "updated_at": now
    }
    await db.preferences.insert_one(pref)
    await db.customers.update_one({"id": current_customer["id"]}, {"$set": {"preferences_id": pref_id, "updated_at": now}})
    return PreferenceResponse(**pref)

@api_router.delete("/customer/preferences")
async def delete_customer_preferences(current_customer: dict = Depends(get_current_customer)):
    result = await db.preferences.delete_many({"customer_id": current_customer["id"]})
    await db.customers.update_one({"id": current_customer["id"]}, {"$set": {"preferences_id": None, "updated_at": datetime.now(timezone.utc).isoformat()}})
    return {"message": f"Deleted {result.deleted_count} preferences"}

# ==================== ORDERS ====================

async def generate_order_number():
    today = datetime.now(timezone.utc).strftime("%Y%m%d")
    count = await db.orders.count_documents({"order_number": {"$regex": f"^ORD-{today}"}})
    return f"ORD-{today}-{str(count + 1).zfill(4)}"

@api_router.post("/orders", response_model=OrderResponse)
async def create_order(data: OrderCreate, notify: bool = True, current_user: dict = Depends(get_current_user)):
    customer = await db.customers.find_one({"id": data.customer_id}, {"_id": 0})
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    
    order_id = str(uuid.uuid4())
    order_number = await generate_order_number()
    now = datetime.now(timezone.utc).isoformat()
    errors = validate_order_payload(data)

    normalized_pickup_address = normalize_address(data.pickup_address or customer.get("address"))
    normalized_delivery_address = normalize_address(data.delivery_address)
    normalized_notes = normalize_spaces(data.notes)
    normalized_gate_code = normalize_spaces(data.gate_code)
    normalized_service_type = normalize_spaces(data.service_type).lower().replace(" ", "_")

    pref = await db.preferences.find({"customer_id": data.customer_id}, {"_id": 0}).sort("version", -1).limit(1).to_list(1)
    preference_id = pref[0].get("id") if pref else None
    preference_snapshot = None
    if pref:
        preference_snapshot = {k: v for k, v in pref[0].items() if k not in ["_id", "customer_id"]}

    order = {
        "id": order_id,
        "order_number": order_number,
        "customer_id": data.customer_id,
        "customer_name": customer["name"],
        "service_type": normalized_service_type,
        "pickup_date": data.pickup_date,
        "pickup_time_window": data.pickup_time_window,
        "pickup_address": normalized_pickup_address,
        "delivery_address": normalized_delivery_address,
        "estimated_lbs": data.estimated_lbs,
        "actual_lbs": None,
        "notes": normalized_notes,
        "gate_code": normalized_gate_code,
        "preferences_id": preference_id,
        "preferences_snapshot": preference_snapshot,
        "status": "new",
        "estado_actual": "new",
        "payment_status": "unpaid",
        "total_amount": None,
        "tiempos": build_order_times(now, "new"),
        "errores_validacion": [
            {**error, "mensaje": error["codigo"], "timestamp": now}
            for error in errors
        ],
        "secciones": [
            {"nombre": "ingesta", "estado": "done", "inicio": now, "fin": now, "errores": []},
            {"nombre": "procesamiento", "estado": "pending", "inicio": None, "fin": None, "errores": []}
        ],
        "importada": False,
        "origen": "crm",
        "qr_token": str(uuid.uuid4()),
        "created_at": now,
        "updated_at": now
    }
    await db.orders.insert_one(order)
    await db.customers.update_one({"id": data.customer_id}, {"$inc": {"total_orders": 1}})
    await db.eventos_automation.insert_one({
        "id": str(uuid.uuid4()),
        "tipo": "ORDER_CREATED",
        "entity_id": order_id,
        "payload": {"order_number": order_number, "service_type": data.service_type},
        "created_at": now
    })
    await create_audit_log("ORDER_CREATED", "order", order_id, current_user["id"])
    
    # Send notifications if enabled
    if notify and NOTIFICATIONS_ENABLED and not SKIP_SERVER_NOTIFICATIONS:
        try:
            await notify_order_created(customer, order)
        except Exception as e:
            logger.error(f"Notification failed: {e}")
    
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

@api_router.get("/orders/{order_id}/qr")
async def get_order_qr(order_id: str, current_user: dict = Depends(get_current_user)):
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    qr_token = order.get("qr_token") or str(uuid.uuid4())
    if not order.get("qr_token"):
        await db.orders.update_one({"id": order_id}, {"$set": {"qr_token": qr_token}})
    return {"order_id": order_id, "order_number": order.get("order_number"), "qr_token": qr_token}

@api_router.get("/orders/{order_id}/qr.svg")
async def get_order_qr_svg(order_id: str, current_user: dict = Depends(get_current_user)):
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    qr_token = order.get("qr_token") or str(uuid.uuid4())
    if not order.get("qr_token"):
        await db.orders.update_one({"id": order_id}, {"$set": {"qr_token": qr_token}})
    payload = build_qr_payload({"id": order_id, "order_number": order.get("order_number"), "qr_token": qr_token})
    svg_bytes = build_qr_svg(payload)
    filename = f"order-{order.get('order_number') or order_id}.svg"
    return StreamingResponse(io.BytesIO(svg_bytes), media_type="image/svg+xml", headers={"Content-Disposition": f"attachment; filename={filename}"})

@api_router.get("/orders/qr/export")
async def export_qr_batch(
    start_date: str = Query(..., description="Start date YYYY-MM-DD"),
    end_date: str = Query(..., description="End date YYYY-MM-DD"),
    status: Optional[str] = None,
    service_type: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    query = {"pickup_date": {"$gte": start_date, "$lte": end_date}}
    if status:
        query["status"] = status
    if service_type:
        query["service_type"] = service_type
    orders = await db.orders.find(query, {"_id": 0}).sort("pickup_date", 1).to_list(2000)
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
        for order in orders:
            qr_token = order.get("qr_token") or str(uuid.uuid4())
            if not order.get("qr_token"):
                await db.orders.update_one({"id": order["id"]}, {"$set": {"qr_token": qr_token}})
            payload = build_qr_payload({"id": order["id"], "order_number": order.get("order_number"), "qr_token": qr_token})
            svg_bytes = build_qr_svg(payload)
            filename = f"order-{order.get('order_number') or order['id']}.svg"
            zip_file.writestr(filename, svg_bytes)
    buffer.seek(0)
    filename = f"qr-export-{start_date}-to-{end_date}.zip"
    return StreamingResponse(buffer, media_type="application/zip", headers={"Content-Disposition": f"attachment; filename={filename}"})

@api_router.post("/orders/qr/resolve")
async def resolve_qr(data: QrResolveRequest, current_user: dict = Depends(get_current_user)):
    payload_data = {}
    if data.payload:
        payload_data = parse_qr_payload(data.payload)
    qr_token = data.qr_token or payload_data.get("qr_token")
    order_id = payload_data.get("order_id")
    order_number = payload_data.get("order_number")
    if not qr_token and not order_id and not order_number:
        raise HTTPException(status_code=400, detail="QR sin datos válidos")
    order = None
    if qr_token:
        order = await db.orders.find_one({"qr_token": qr_token}, {"_id": 0})
    if not order and order_id:
        order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order and order_number:
        order = await db.orders.find_one({"order_number": order_number}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Orden no encontrada")
    if qr_token and order.get("qr_token") and order.get("qr_token") != qr_token:
        raise HTTPException(status_code=400, detail="QR no coincide con la orden")
    customer_name = order.get("customer_name")
    customer = None
    if not customer_name and order.get("customer_id"):
        customer = await db.customers.find_one({"id": order.get("customer_id")}, {"_id": 0})
        customer_name = customer.get("name") if customer else None
    delivery_address = order.get("delivery_address") or order.get("pickup_address")
    address_parts = build_address_parts(delivery_address)
    response = {
        "order_id": order.get("id"),
        "order_number": order.get("order_number"),
        "service_type": order.get("service_type"),
        "customer_name": customer_name,
        "address": address_parts,
        "request_datetime": order.get("created_at"),
        "status": order.get("status"),
        "items": order.get("items") or order.get("services_included") or order.get("products") or [],
        "total_amount": order.get("total_amount"),
        "special_instructions": order.get("notes") or order.get("special_instructions"),
        "pickup_date": order.get("pickup_date"),
        "pickup_time_window": order.get("pickup_time_window"),
        "payment_status": order.get("payment_status")
    }
    return response

@api_router.put("/orders/{order_id}", response_model=OrderResponse)
async def update_order(order_id: str, data: dict, current_user: dict = Depends(get_current_user)):
    data["updated_at"] = datetime.now(timezone.utc).isoformat()
    result = await db.orders.update_one({"id": order_id}, {"$set": data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Order not found")
    
    await create_audit_log("ORDER_UPDATED", "order", order_id, current_user["id"], {"changes": list(data.keys())})
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    return OrderResponse(**order)

def normalize_status(value: Optional[str]) -> str:
    if not value:
        return ""
    return value.strip().lower().replace(" ", "_")


def should_notify_order_status(order: dict, status_value: str) -> bool:
    """Determine if order status change should trigger notification"""
    status_normalized = normalize_status(status_value)

    if status_normalized in ["ready", "out_for_delivery", "delivered"]:
        return True

    service_type = order.get("service_type")
    if service_type == "pickup_delivery":
        return status_normalized == "out_for_delivery"
    if service_type in ["wash_fold", "self_service"]:
        return status_normalized == "ready"

    return False

@api_router.patch("/orders/{order_id}/status")
async def update_order_status(order_id: str, status: str, notify: bool = True, current_user: dict = Depends(get_current_user)):
    valid_statuses = ["new", "processing", "ready", "out_for_delivery", "delivered", "completed", "cancelled"]
    normalized_status = normalize_status(status)
    if normalized_status not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {valid_statuses}")

    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    current_status = normalize_status(order.get("status"))
    if normalized_status == "completed" and current_status not in ["delivered", "completed"]:
        raise HTTPException(status_code=400, detail="Order must be delivered before it can be completed")

    await db.orders.update_one(
        {"id": order_id},
        {
            "$set": {
                "status": normalized_status,
                "estado_actual": normalized_status,
                "updated_at": datetime.now(timezone.utc).isoformat(),
                "tiempos.ultimo_cambio_estado": datetime.now(timezone.utc).isoformat(),
                f"tiempos.fechas_estado.{normalized_status}": datetime.now(timezone.utc).isoformat()
            }
        }
    )

    await create_audit_log("ORDER_STATUS_CHANGED", "order", order_id, current_user["id"], {"new_status": normalized_status})
    await db.eventos_automation.insert_one({
        "id": str(uuid.uuid4()),
        "tipo": "ORDER_STATUS_CHANGED",
        "entity_id": order_id,
        "payload": {"status": normalized_status},
        "created_at": datetime.now(timezone.utc).isoformat()
    })

    if notify and NOTIFICATIONS_ENABLED and not SKIP_SERVER_NOTIFICATIONS and order.get("customer_id") and should_notify_order_status(order, normalized_status):
        customer = await db.customers.find_one({"id": order["customer_id"]}, {"_id": 0})
        if customer:
            order["status"] = normalized_status
            try:
                await notify_order_status_changed(customer, order, normalized_status)
            except Exception as e:
                logger.error(f"Notification failed: {e}")

    return {"message": f"Order status updated to {normalized_status}"}

@api_router.patch("/orders/{order_id}/payment-status")
async def update_order_payment_status(order_id: str, status: str, current_user: dict = Depends(get_current_user)):
    """Update payment status of an order"""
    valid_statuses = ["pending", "paid", "refunded", "failed"]
    if status not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"Invalid payment status. Must be one of: {valid_statuses}")
    
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    result = await db.orders.update_one(
        {"id": order_id},
        {
            "$set": {
                "payment_status": status,
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
        }
    )
    
    await create_audit_log("ORDER_PAYMENT_STATUS_CHANGED", "order", order_id, current_user["id"], {"payment_status": status})
    return {"message": f"Payment status updated to {status}"}

@api_router.post("/admin/orders/last-completed/notify")
async def notify_last_completed_order(current_user: dict = Depends(get_current_user)):
    require_admin(current_user)
    last_order = await db.orders.find({"status": "completed"}, {"_id": 0}).sort("updated_at", -1).limit(1).to_list(1)
    if not last_order:
        raise HTTPException(status_code=404, detail="No completed orders found")
    order = last_order[0]
    customer_id = order.get("customer_id")
    if not customer_id:
        raise HTTPException(status_code=400, detail="Order missing customer")
    customer = await db.customers.find_one({"id": customer_id}, {"_id": 0})
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    if NOTIFICATIONS_ENABLED and not SKIP_SERVER_NOTIFICATIONS:
        await notify_order_status_changed(customer, order, "completed")
    await create_audit_log("ORDER_COMPLETED_NOTIFICATION_SENT", "order", order["id"], current_user["id"])
    return {"ok": True, "order_id": order["id"], "order_number": order.get("order_number")}

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

# ==================== SERVICES ====================

@api_router.post("/services", response_model=ServiceResponse)
async def create_service(data: ServiceCreate, current_user: dict = Depends(get_current_user)):
    service_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    service = {
        "id": service_id,
        "name": data.name,
        "category": data.category,
        "description": data.description,
        "price": data.price,
        "price_unit": data.price_unit,
        "is_active": data.is_active,
        "sort_order": data.sort_order or 0,
        "created_at": now,
        "updated_at": now
    }
    await db.services.insert_one(service)
    await create_audit_log("SERVICE_CREATED", "service", service_id, current_user["id"])
    return ServiceResponse(**service)

@api_router.get("/services", response_model=List[ServiceResponse])
async def get_services(
    active_only: bool = True,
    search: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    query = {}
    if active_only:
        query["is_active"] = True
    if search:
        query["$or"] = [
            {"name": {"$regex": search, "$options": "i"}},
            {"category": {"$regex": search, "$options": "i"}}
        ]
    services = await db.services.find(query, {"_id": 0}).sort([("sort_order", 1), ("created_at", -1)]).to_list(1000)
    return [ServiceResponse(**s) for s in services]

@api_router.get("/services/{service_id}", response_model=ServiceResponse)
async def get_service(service_id: str, current_user: dict = Depends(get_current_user)):
    service = await db.services.find_one({"id": service_id}, {"_id": 0})
    if not service:
        raise HTTPException(status_code=404, detail="Service not found")
    return ServiceResponse(**service)

@api_router.put("/services/{service_id}", response_model=ServiceResponse)
async def update_service(service_id: str, data: ServiceCreate, current_user: dict = Depends(get_current_user)):
    update_data = data.model_dump(exclude_unset=True)
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    update_data["sort_order"] = update_data.get("sort_order", 0) or 0
    result = await db.services.update_one({"id": service_id}, {"$set": update_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Service not found")
    await create_audit_log("SERVICE_UPDATED", "service", service_id, current_user["id"])
    service = await db.services.find_one({"id": service_id}, {"_id": 0})
    return ServiceResponse(**service)

@api_router.delete("/services/{service_id}")
async def delete_service(service_id: str, current_user: dict = Depends(get_current_user)):
    result = await db.services.delete_one({"id": service_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Service not found")
    await create_audit_log("SERVICE_DELETED", "service", service_id, current_user["id"])
    return {"message": "Service deleted"}

@api_router.get("/public/services", response_model=List[ServiceResponse])
async def get_public_services(active_only: bool = True):
    query = {}
    if active_only:
        query["is_active"] = True
    services = await db.services.find(query, {"_id": 0}).sort([("sort_order", 1), ("created_at", -1)]).to_list(1000)
    return [ServiceResponse(**s) for s in services]

@api_router.get("/services/membership-section", response_model=MembershipSectionResponse)
async def get_membership_section(current_user: dict = Depends(get_current_user)):
    section = await db.membership_section.find_one({"id": "default"}, {"_id": 0})
    if not section:
        section = {
            "id": "default",
            "heading": "Flexible Plans for Every Home",
            "subheading": None,
            "special_title": "🎉 New Member Special",
            "special_text": "$10 OFF your first month on any membership. Ask when you call or text.",
            "cta_title": "Need help choosing?",
            "cta_text": "Just call, text, or email us at (805) 836-8872 and we'll recommend the perfect plan based on your weekly laundry.",
            "cta_button_label": "👉 BECOME A MEMBER",
            "cta_button_url": "/membership",
            "contact_phone": "(805) 836-8872",
            "is_active": True,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat()
        }
        await db.membership_section.insert_one(section)
    return MembershipSectionResponse(**section)

@api_router.put("/services/membership-section", response_model=MembershipSectionResponse)
async def update_membership_section(data: MembershipSectionUpdate, current_user: dict = Depends(get_current_user)):
    now = datetime.now(timezone.utc).isoformat()
    update_data = data.model_dump(exclude_unset=True)
    update_data["updated_at"] = now
    await db.membership_section.update_one(
        {"id": "default"},
        {"$set": update_data, "$setOnInsert": {"id": "default", "created_at": now}},
        upsert=True
    )
    section = await db.membership_section.find_one({"id": "default"}, {"_id": 0})
    await create_audit_log("MEMBERSHIP_SECTION_UPDATED", "membership_section", "default", current_user["id"])
    return MembershipSectionResponse(**section)

@api_router.post("/services/membership-plans", response_model=MembershipPlanResponse)
async def create_membership_plan(data: MembershipPlanCreate, current_user: dict = Depends(get_current_user)):
    plan_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    plan = {
        "id": plan_id,
        "name": data.name,
        "price": data.price,
        "image_url": data.image_url,
        "features": data.features,
        "is_popular": data.is_popular,
        "is_active": data.is_active,
        "sort_order": data.sort_order or 0,
        "created_at": now,
        "updated_at": now
    }
    await db.membership_plans.insert_one(plan)
    await create_audit_log("MEMBERSHIP_PLAN_CREATED", "membership_plan", plan_id, current_user["id"])
    return MembershipPlanResponse(**plan)

@api_router.get("/services/membership-plans", response_model=List[MembershipPlanResponse])
async def get_membership_plans(
    active_only: bool = True,
    current_user: dict = Depends(get_current_user)
):
    query = {}
    if active_only:
        query["is_active"] = True
    plans = await db.membership_plans.find(query, {"_id": 0}).sort([("sort_order", 1), ("created_at", -1)]).to_list(200)
    if len(plans) == 0:
        now = datetime.now(timezone.utc).isoformat()
        seed = [
            {
                "id": str(uuid.uuid4()),
                "name": "MOST POPULAR",
                "price": "$139 / month",
                "image_url": "https://images.squarespace-cdn.com/content/v1/696c559a4b2b9b1b0febf8d7/4a2815a1-54c1-45fb-8320-244dce8b83c8/MOST+POPULAR.png",
                "features": ["Up to 60 lb/ month", "Basic Preferences saved (folding notes)", "Best value for most families"],
                "is_popular": True,
                "is_active": True,
                "sort_order": 1,
                "created_at": now,
                "updated_at": now
            },
            {
                "id": str(uuid.uuid4()),
                "name": "FAMILY PLUS",
                "price": "$199 / month",
                "image_url": "https://images.squarespace-cdn.com/content/v1/696c559a4b2b9b1b0febf8d7/f262a5b8-0043-4977-9d32-d6b343be3e70/FAMILY+PLUS.png",
                "features": ["Up to 90 lb/ month", "Priority scheduling", "Great for larger households or rentals"],
                "is_popular": False,
                "is_active": True,
                "sort_order": 2,
                "created_at": now,
                "updated_at": now
            },
            {
                "id": str(uuid.uuid4()),
                "name": "ELITE CONCIERGE",
                "price": "$299 / month",
                "image_url": "https://images.squarespace-cdn.com/content/v1/696c559a4b2b9b1b0febf8d7/13a4c501-7792-4f72-bf5c-072f95b5f995/ELITE+CONCIERGE.png",
                "features": ["Up to 120 lb/ month", "Priority turnaround (when possible)", "Premium packaging", "Saved preferences", "1 emergency pickup included"],
                "is_popular": False,
                "is_active": True,
                "sort_order": 3,
                "created_at": now,
                "updated_at": now
            }
        ]
        await db.membership_plans.insert_many(seed)
        plans = seed
    return [MembershipPlanResponse(**p) for p in plans]

@api_router.put("/services/membership-plans/{plan_id}", response_model=MembershipPlanResponse)
async def update_membership_plan(plan_id: str, data: MembershipPlanCreate, current_user: dict = Depends(get_current_user)):
    update_data = data.model_dump(exclude_unset=True)
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    update_data["sort_order"] = update_data.get("sort_order", 0) or 0
    result = await db.membership_plans.update_one({"id": plan_id}, {"$set": update_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Plan not found")
    await create_audit_log("MEMBERSHIP_PLAN_UPDATED", "membership_plan", plan_id, current_user["id"])
    plan = await db.membership_plans.find_one({"id": plan_id}, {"_id": 0})
    return MembershipPlanResponse(**plan)

@api_router.delete("/services/membership-plans/{plan_id}")
async def delete_membership_plan(plan_id: str, current_user: dict = Depends(get_current_user)):
    result = await db.membership_plans.delete_one({"id": plan_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Plan not found")
    await create_audit_log("MEMBERSHIP_PLAN_DELETED", "membership_plan", plan_id, current_user["id"])
    return {"message": "Plan deleted"}

@api_router.get("/memberships/section", response_model=MembershipSectionResponse)
async def get_membership_section_admin(current_user: dict = Depends(get_current_user)):
    section = await db.membership_section.find_one({"id": "default"}, {"_id": 0})
    if not section:
        section = {
            "id": "default",
            "heading": "Flexible Plans for Every Home",
            "subheading": None,
            "special_title": "🎉 New Member Special",
            "special_text": "$10 OFF your first month on any membership. Ask when you call or text.",
            "cta_title": "Need help choosing?",
            "cta_text": "Just call, text, or email us at (805) 836-8872 and we'll recommend the perfect plan based on your weekly laundry.",
            "cta_button_label": "👉 BECOME A MEMBER",
            "cta_button_url": "/membership",
            "contact_phone": "(805) 836-8872",
            "is_active": True,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat()
        }
        await db.membership_section.insert_one(section)
    return MembershipSectionResponse(**section)

@api_router.put("/memberships/section", response_model=MembershipSectionResponse)
async def update_membership_section_admin(data: MembershipSectionUpdate, current_user: dict = Depends(get_current_user)):
    now = datetime.now(timezone.utc).isoformat()
    update_data = data.model_dump(exclude_unset=True)
    update_data["updated_at"] = now
    await db.membership_section.update_one(
        {"id": "default"},
        {"$set": update_data, "$setOnInsert": {"id": "default", "created_at": now}},
        upsert=True
    )
    section = await db.membership_section.find_one({"id": "default"}, {"_id": 0})
    await create_audit_log("MEMBERSHIP_SECTION_UPDATED", "membership_section", "default", current_user["id"])
    return MembershipSectionResponse(**section)

@api_router.post("/memberships/plans", response_model=MembershipPlanResponse)
async def create_membership_plan_admin(data: MembershipPlanCreate, current_user: dict = Depends(get_current_user)):
    plan_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    plan = {
        "id": plan_id,
        "name": data.name,
        "price": data.price,
        "image_url": data.image_url,
        "features": data.features,
        "is_popular": data.is_popular,
        "is_active": data.is_active,
        "sort_order": data.sort_order or 0,
        "created_at": now,
        "updated_at": now
    }
    await db.membership_plans.insert_one(plan)
    await create_audit_log("MEMBERSHIP_PLAN_CREATED", "membership_plan", plan_id, current_user["id"])
    return MembershipPlanResponse(**plan)

@api_router.get("/memberships/plans", response_model=List[MembershipPlanResponse])
async def get_membership_plans_admin(
    active_only: bool = True,
    current_user: dict = Depends(get_current_user)
):
    query = {}
    if active_only:
        query["is_active"] = True
    plans = await db.membership_plans.find(query, {"_id": 0}).sort([("sort_order", 1), ("created_at", -1)]).to_list(200)
    if len(plans) == 0:
        now = datetime.now(timezone.utc).isoformat()
        seed = [
            {
                "id": str(uuid.uuid4()),
                "name": "MOST POPULAR",
                "price": "$139 / month",
                "image_url": "https://images.squarespace-cdn.com/content/v1/696c559a4b2b9b1b0febf8d7/4a2815a1-54c1-45fb-8320-244dce8b83c8/MOST+POPULAR.png",
                "features": ["Up to 60 lb/ month", "Basic Preferences saved (folding notes)", "Best value for most families"],
                "is_popular": True,
                "is_active": True,
                "sort_order": 1,
                "created_at": now,
                "updated_at": now
            },
            {
                "id": str(uuid.uuid4()),
                "name": "FAMILY PLUS",
                "price": "$199 / month",
                "image_url": "https://images.squarespace-cdn.com/content/v1/696c559a4b2b9b1b0febf8d7/f262a5b8-0043-4977-9d32-d6b343be3e70/FAMILY+PLUS.png",
                "features": ["Up to 90 lb/ month", "Priority scheduling", "Great for larger households or rentals"],
                "is_popular": False,
                "is_active": True,
                "sort_order": 2,
                "created_at": now,
                "updated_at": now
            },
            {
                "id": str(uuid.uuid4()),
                "name": "ELITE CONCIERGE",
                "price": "$299 / month",
                "image_url": "https://images.squarespace-cdn.com/content/v1/696c559a4b2b9b1b0febf8d7/13a4c501-7792-4f72-bf5c-072f95b5f995/ELITE+CONCIERGE.png",
                "features": ["Up to 120 lb/ month", "Priority turnaround (when possible)", "Premium packaging", "Saved preferences", "1 emergency pickup included"],
                "is_popular": False,
                "is_active": True,
                "sort_order": 3,
                "created_at": now,
                "updated_at": now
            }
        ]
        await db.membership_plans.insert_many(seed)
        plans = seed
    return [MembershipPlanResponse(**p) for p in plans]

@api_router.put("/memberships/plans/{plan_id}", response_model=MembershipPlanResponse)
async def update_membership_plan_admin(plan_id: str, data: MembershipPlanCreate, current_user: dict = Depends(get_current_user)):
    update_data = data.model_dump(exclude_unset=True)
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    update_data["sort_order"] = update_data.get("sort_order", 0) or 0
    result = await db.membership_plans.update_one({"id": plan_id}, {"$set": update_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Plan not found")
    await create_audit_log("MEMBERSHIP_PLAN_UPDATED", "membership_plan", plan_id, current_user["id"])
    plan = await db.membership_plans.find_one({"id": plan_id}, {"_id": 0})
    return MembershipPlanResponse(**plan)

@api_router.delete("/memberships/plans/{plan_id}")
async def delete_membership_plan_admin(plan_id: str, current_user: dict = Depends(get_current_user)):
    result = await db.membership_plans.delete_one({"id": plan_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Plan not found")
    await create_audit_log("MEMBERSHIP_PLAN_DELETED", "membership_plan", plan_id, current_user["id"])
    return {"message": "Plan deleted"}

@api_router.get("/memberships/signups", response_model=List[MembershipSignupResponse])
async def get_membership_signups(
    status: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    require_admin(current_user)
    query = {}
    if status:
        query["status"] = status
    signups = await db.membership_signups.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    
    # Transform signups to match response model
    result = []
    for s in signups:
        try:
            # Handle both old and new signup formats
            signup_data = {
                "id": s.get("id", ""),
                "first_name": s.get("first_name", ""),
                "last_name": s.get("last_name", ""),
                "email": s.get("email", s.get("customer_email", "")),
                "phone": s.get("phone", s.get("customer_phone", "")),
                "contact_method": s.get("contact_method", ""),
                "address_line1": s.get("address_line1", ""),
                "address_line2": s.get("address_line2"),
                "city": s.get("city", ""),
                "state": s.get("state", ""),
                "zip_code": s.get("zip_code", ""),
                "membership_plan": s.get("membership_plan", s.get("plan_name", "")),
                "plan_name": s.get("plan_name"),
                "plan_id": s.get("plan_id"),
                "laundry_frequency": s.get("laundry_frequency", ""),
                "estimated_lbs": s.get("estimated_lbs", 0) or 0,
                "amount": s.get("amount"),
                "payment_status": s.get("payment_status"),
                "status": s.get("status", "pending"),
                "customer_id": s.get("customer_id"),
                "customer_name": s.get("customer_name"),
                "customer_email": s.get("customer_email"),
                "customer_phone": s.get("customer_phone"),
                "stripe_session_id": s.get("stripe_session_id"),
                "created_at": s.get("created_at", ""),
                "updated_at": s.get("updated_at", "")
            }
            result.append(MembershipSignupResponse(**signup_data))
        except Exception as e:
            logger.error(f"Error processing signup {s.get('id')}: {e}")
            continue
    return result

@api_router.put("/memberships/signups/{signup_id}", response_model=MembershipSignupResponse)
async def update_membership_signup(signup_id: str, data: MembershipSignupUpdate, current_user: dict = Depends(get_current_user)):
    require_admin(current_user)
    update_data = data.model_dump(exclude_unset=True)
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    result = await db.membership_signups.update_one({"id": signup_id}, {"$set": update_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Signup not found")
    await create_audit_log("MEMBERSHIP_SIGNUP_UPDATED", "membership_signup", signup_id, current_user["id"])
    signup = await db.membership_signups.find_one({"id": signup_id}, {"_id": 0})
    return MembershipSignupResponse(**signup)

@api_router.post("/memberships/signups/{signup_id}/convert", response_model=CustomerResponse)
async def convert_membership_signup(signup_id: str, current_user: dict = Depends(get_current_user)):
    require_admin(current_user)
    signup = await db.membership_signups.find_one({"id": signup_id}, {"_id": 0})
    if not signup:
        raise HTTPException(status_code=404, detail="Signup not found")
    now = datetime.now(timezone.utc).isoformat()
    customer = await db.customers.find_one({"email": signup["email"]}, {"_id": 0})
    if customer:
        update_data = {
            "membership_plan": signup["membership_plan"],
            "membership_status": "active",
            "membership_start_date": now,
            "updated_at": now
        }
        await db.customers.update_one({"id": customer["id"]}, {"$set": update_data})
        customer = await db.customers.find_one({"id": customer["id"]}, {"_id": 0})
    else:
        customer_id = str(uuid.uuid4())
        customer = {
            "id": customer_id,
            "name": f"{signup['first_name']} {signup['last_name']}",
            "email": signup["email"].lower(),
            "phone": signup["phone"],
            "address": f"{signup['address_line1']}{', ' + signup['address_line2'] if signup.get('address_line2') else ''}, {signup['city']}, {signup['state']} {signup['zip_code']}",
            "preferred_contact": signup["contact_method"],
            "notes": None,
            "status": "active",
            "total_orders": 0,
            "membership_plan": signup["membership_plan"],
            "membership_status": "active",
            "membership_start_date": now,
            "created_at": now,
            "updated_at": now
        }
        await db.customers.insert_one(customer)
        await create_audit_log("CUSTOMER_CREATED", "customer", customer_id, current_user["id"])
    await db.membership_signups.update_one(
        {"id": signup_id},
        {"$set": {"status": "converted", "customer_id": customer["id"], "updated_at": now}}
    )
    await create_audit_log("MEMBERSHIP_SIGNUP_CONVERTED", "membership_signup", signup_id, current_user["id"], {"customer_id": customer["id"]})
    return CustomerResponse(**customer)

@api_router.get("/memberships/customers", response_model=List[CustomerResponse])
async def get_membership_customers(
    search: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    require_admin(current_user)
    query: Dict[str, Any] = {"membership_plan": {"$ne": None}}
    if search:
        query["$or"] = [
            {"name": {"$regex": search, "$options": "i"}},
            {"email": {"$regex": search, "$options": "i"}},
            {"phone": {"$regex": search, "$options": "i"}}
        ]
    customers = await db.customers.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return [CustomerResponse(**c) for c in customers]

@api_router.put("/memberships/customers/{customer_id}", response_model=CustomerResponse)
async def update_membership_customer(customer_id: str, data: MembershipCustomerUpdate, current_user: dict = Depends(get_current_user)):
    require_admin(current_user)
    update_data = data.model_dump(exclude_unset=True)
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    result = await db.customers.update_one({"id": customer_id}, {"$set": update_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Customer not found")
    await create_audit_log("CUSTOMER_MEMBERSHIP_UPDATED", "customer", customer_id, current_user["id"])
    customer = await db.customers.find_one({"id": customer_id}, {"_id": 0})
    return CustomerResponse(**customer)

# ==================== AI ASSISTANT ENDPOINTS ====================

@api_router.get("/ai/briefing")
async def get_daily_briefing(current_user: dict = Depends(get_current_user)):
    """Get AI-generated daily briefing for the current user"""
    if not AI_ASSISTANT_ENABLED:
        raise HTTPException(status_code=503, detail="AI Assistant not available")
    
    try:
        briefing = await generate_daily_briefing(
            db, 
            current_user.get("role", "operator"),
            current_user.get("name", "User")
        )
        return briefing
    except Exception as e:
        logger.error(f"Error generating briefing: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/ai/suggestions")
async def get_ai_suggestions(current_user: dict = Depends(get_current_user)):
    """Get AI-powered action suggestions"""
    if not AI_ASSISTANT_ENABLED:
        raise HTTPException(status_code=503, detail="AI Assistant not available")
    
    try:
        suggestions = await ai_suggest_actions(db, "general")
        return {"suggestions": suggestions}
    except Exception as e:
        logger.error(f"Error getting suggestions: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.post("/ai/chat")
async def ai_chat(data: AdminAIRequest, current_user: dict = Depends(get_current_user)):
    """Chat with AI Business Assistant"""
    if not AI_ASSISTANT_ENABLED:
        raise HTTPException(status_code=503, detail="AI Assistant not available")
    
    try:
        result = await ai_analyze_business(
            db,
            data.message,
            current_user.get("role", "operator")
        )
        
        # Check if response contains action instructions
        response_text = result.get("response", "")
        actions = []
        results = []
        
        # Parse and execute actions if requested
        if data.execute and "```json" in response_text:
            import re
            json_matches = re.findall(r'```json\s*(\{.*?\})\s*```', response_text, re.DOTALL)
            for json_str in json_matches:
                try:
                    action_data = json.loads(json_str)
                    if "action" in action_data:
                        action_result = await execute_ai_action(action_data, current_user)
                        results.append(action_result)
                        actions.append(action_data)
                except:
                    pass
        
        return {
            "reply": response_text,
            "actions": actions,
            "results": results,
            "generated_at": result.get("generated_at")
        }
    except Exception as e:
        logger.error(f"Error in AI chat: {e}")
        raise HTTPException(status_code=500, detail=str(e))

async def execute_ai_action(action_data: dict, current_user: dict) -> dict:
    """Execute an action suggested by AI"""
    action_type = action_data.get("action")
    params = action_data.get("params", {})
    
    try:
        if action_type == "update_order_status":
            order_id = params.get("order_id")
            status = params.get("status")
            if order_id and status:
                await db.orders.update_one(
                    {"id": order_id},
                    {"$set": {"status": status, "updated_at": datetime.now(timezone.utc).isoformat()}}
                )
                await create_audit_log("ORDER_STATUS_CHANGED", "order", order_id, current_user["id"], {"status": status, "source": "ai"})
                return {"action": action_type, "ok": True, "message": f"Order updated to {status}"}
        
        elif action_type == "update_payment_status":
            order_id = params.get("order_id")
            status = params.get("status")
            if order_id and status:
                await db.orders.update_one(
                    {"id": order_id},
                    {"$set": {"payment_status": status, "updated_at": datetime.now(timezone.utc).isoformat()}}
                )
                await create_audit_log("ORDER_PAYMENT_UPDATED", "order", order_id, current_user["id"], {"payment_status": status, "source": "ai"})
                return {"action": action_type, "ok": True, "message": f"Payment status updated to {status}"}
        
        elif action_type == "update_quote_status":
            quote_id = params.get("quote_id")
            status = params.get("status")
            if quote_id and status:
                await db.quotes.update_one(
                    {"id": quote_id},
                    {"$set": {"status": status, "updated_at": datetime.now(timezone.utc).isoformat()}}
                )
                await create_audit_log("QUOTE_STATUS_CHANGED", "quote", quote_id, current_user["id"], {"status": status, "source": "ai"})
                return {"action": action_type, "ok": True, "message": f"Quote updated to {status}"}
        
        elif action_type == "update_lead_status":
            lead_id = params.get("lead_id")
            status = params.get("status")
            if lead_id and status:
                await db.leads.update_one(
                    {"id": lead_id},
                    {"$set": {"status": status, "updated_at": datetime.now(timezone.utc).isoformat()}}
                )
                await create_audit_log("LEAD_STATUS_CHANGED", "lead", lead_id, current_user["id"], {"status": status, "source": "ai"})
                return {"action": action_type, "ok": True, "message": f"Lead updated to {status}"}
        
        elif action_type == "update_ticket_status":
            ticket_id = params.get("ticket_id")
            status = params.get("status")
            if ticket_id and status:
                await db.tickets.update_one(
                    {"id": ticket_id},
                    {"$set": {"status": status, "updated_at": datetime.now(timezone.utc).isoformat()}}
                )
                await create_audit_log("TICKET_STATUS_CHANGED", "ticket", ticket_id, current_user["id"], {"status": status, "source": "ai"})
                return {"action": action_type, "ok": True, "message": f"Ticket updated to {status}"}
        
        return {"action": action_type, "ok": False, "error": "Unknown action type"}
    except Exception as e:
        return {"action": action_type, "ok": False, "error": str(e)}

@api_router.post("/admin/ai")
async def admin_ai(data: AdminAIRequest, current_user: dict = Depends(get_current_user)):
    require_admin(current_user)
    system_prompt = (
        "You are a local admin assistant for Ventura Fresh Laundry CRM. "
        "Return ONLY valid JSON with keys: reply (string) and actions (array). "
        "Actions must be objects with type and payload. Allowed types: "
        "update_order_status, update_ticket_status, update_quote_status, update_lead_status, "
        "update_membership_signup_status, update_customer_membership. "
        "For update_order_status payload: order_id, status. "
        "For update_ticket_status payload: ticket_id, status. "
        "For update_quote_status payload: quote_id, status. "
        "For update_lead_status payload: lead_id, status. "
        "For update_membership_signup_status payload: signup_id, status. "
        "For update_customer_membership payload: customer_id, membership_plan, membership_status, membership_start_date. "
        "If no action is needed, return actions: []."
    )
    prompt = f"{system_prompt}\nUser: {data.message}\nJSON:"
    model_response = call_ollama(prompt)
    try:
        payload = extract_json_payload(model_response)
    except Exception:
        return {"reply": model_response, "actions": [], "results": []}
    reply = payload.get("reply", "")
    actions = payload.get("actions", []) if isinstance(payload.get("actions", []), list) else []
    results = []
    if data.execute:
        for action in actions:
            action_type = action.get("type")
            action_payload = action.get("payload", {})
            if action_type == "update_order_status":
                order_id = action_payload.get("order_id")
                status_value = action_payload.get("status")
                valid_statuses = ["new", "processing", "ready", "out_for_delivery", "delivered", "completed", "cancelled"]
                if not order_id or status_value not in valid_statuses:
                    results.append({"type": action_type, "ok": False, "error": "Invalid order status or id"})
                    continue
                now_iso = datetime.now(timezone.utc).isoformat()
                result = await db.orders.update_one(
                    {"id": order_id},
                    {
                        "$set": {
                            "status": status_value,
                            "estado_actual": status_value,
                            "updated_at": now_iso,
                            "tiempos.ultimo_cambio_estado": now_iso,
                            f"tiempos.fechas_estado.{status_value}": now_iso
                        }
                    }
                )
                if result.matched_count == 0:
                    results.append({"type": action_type, "ok": False, "error": "Order not found"})
                    continue
                await create_audit_log("ORDER_UPDATED", "order", order_id, current_user["id"], {"status": status_value, "source": "ai"})
                await db.eventos_automation.insert_one({
                    "id": str(uuid.uuid4()),
                    "tipo": "ORDER_STATUS_CHANGED",
                    "entity_id": order_id,
                    "payload": {"status": status_value, "source": "ai"},
                    "created_at": now_iso
                })
                if NOTIFICATIONS_ENABLED:
                    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
                    if order and order.get("customer_id") and should_notify_order_status(order, status_value):
                        customer = await db.customers.find_one({"id": order["customer_id"]}, {"_id": 0})
                        if customer:
                            try:
                                await notify_order_status_changed(customer, order, status_value)
                            except Exception as e:
                                logger.error(f"Notification failed: {e}")
                results.append({"type": action_type, "ok": True, "order_id": order_id, "status": status_value})
            elif action_type == "update_ticket_status":
                ticket_id = action_payload.get("ticket_id")
                status_value = action_payload.get("status")
                if not ticket_id or not status_value:
                    results.append({"type": action_type, "ok": False, "error": "Invalid ticket status or id"})
                    continue
                result = await db.tickets.update_one({"id": ticket_id}, {"$set": {"status": status_value, "updated_at": datetime.now(timezone.utc).isoformat()}})
                if result.matched_count == 0:
                    results.append({"type": action_type, "ok": False, "error": "Ticket not found"})
                    continue
                await create_audit_log("TICKET_UPDATED", "ticket", ticket_id, current_user["id"], {"status": status_value, "source": "ai"})
                results.append({"type": action_type, "ok": True, "ticket_id": ticket_id, "status": status_value})
            elif action_type == "update_quote_status":
                quote_id = action_payload.get("quote_id")
                status_value = action_payload.get("status")
                if not quote_id or not status_value:
                    results.append({"type": action_type, "ok": False, "error": "Invalid quote status or id"})
                    continue
                result = await db.quotes.update_one({"id": quote_id}, {"$set": {"status": status_value, "updated_at": datetime.now(timezone.utc).isoformat()}})
                if result.matched_count == 0:
                    results.append({"type": action_type, "ok": False, "error": "Quote not found"})
                    continue
                await create_audit_log("QUOTE_UPDATED", "quote", quote_id, current_user["id"], {"status": status_value, "source": "ai"})
                results.append({"type": action_type, "ok": True, "quote_id": quote_id, "status": status_value})
            elif action_type == "update_lead_status":
                lead_id = action_payload.get("lead_id")
                status_value = action_payload.get("status")
                if not lead_id or not status_value:
                    results.append({"type": action_type, "ok": False, "error": "Invalid lead status or id"})
                    continue
                result = await db.leads.update_one({"id": lead_id}, {"$set": {"status": status_value, "updated_at": datetime.now(timezone.utc).isoformat()}})
                if result.matched_count == 0:
                    results.append({"type": action_type, "ok": False, "error": "Lead not found"})
                    continue
                await create_audit_log("LEAD_UPDATED", "lead", lead_id, current_user["id"], {"status": status_value, "source": "ai"})
                results.append({"type": action_type, "ok": True, "lead_id": lead_id, "status": status_value})
            elif action_type == "update_membership_signup_status":
                signup_id = action_payload.get("signup_id")
                status_value = action_payload.get("status")
                if not signup_id or not status_value:
                    results.append({"type": action_type, "ok": False, "error": "Invalid signup status or id"})
                    continue
                result = await db.membership_signups.update_one({"id": signup_id}, {"$set": {"status": status_value, "updated_at": datetime.now(timezone.utc).isoformat()}})
                if result.matched_count == 0:
                    results.append({"type": action_type, "ok": False, "error": "Signup not found"})
                    continue
                await create_audit_log("MEMBERSHIP_SIGNUP_UPDATED", "membership_signup", signup_id, current_user["id"], {"status": status_value, "source": "ai"})
                results.append({"type": action_type, "ok": True, "signup_id": signup_id, "status": status_value})
            elif action_type == "update_customer_membership":
                customer_id = action_payload.get("customer_id")
                if not customer_id:
                    results.append({"type": action_type, "ok": False, "error": "Invalid customer id"})
                    continue
                update_data = {k: v for k, v in action_payload.items() if k in ["membership_plan", "membership_status", "membership_start_date"] and v is not None}
                if not update_data:
                    results.append({"type": action_type, "ok": False, "error": "No membership fields provided"})
                    continue
                update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
                result = await db.customers.update_one({"id": customer_id}, {"$set": update_data})
                if result.matched_count == 0:
                    results.append({"type": action_type, "ok": False, "error": "Customer not found"})
                    continue
                await create_audit_log("CUSTOMER_MEMBERSHIP_UPDATED", "customer", customer_id, current_user["id"], {"source": "ai"})
                results.append({"type": action_type, "ok": True, "customer_id": customer_id})
            else:
                results.append({"type": action_type, "ok": False, "error": "Unsupported action"})
    return {"reply": reply, "actions": actions, "results": results}

@api_router.post("/admin/ai/insights")
async def admin_ai_insights(data: AdminAIInsightsRequest, current_user: dict = Depends(get_current_user)):
    require_admin(current_user)
    now = datetime.now(timezone.utc)
    today = now.strftime("%Y-%m-%d")
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0).isoformat()

    orders_by_status = {}
    for status_value in ["new", "processing", "ready", "out_for_delivery", "delivered", "completed", "cancelled"]:
        orders_by_status[status_value] = await db.orders.count_documents({"status": status_value})

    orders_today = await db.orders.count_documents({"created_at": {"$regex": f"^{today}"}})
    tickets_open = await db.tickets.count_documents({"status": {"$in": ["open", "in_progress"]}})
    quotes_new = await db.quotes.count_documents({"status": "new"})
    leads_new = await db.leads.count_documents({"status": "new"})
    signups_new = await db.membership_signups.count_documents({"status": "new"})

    pipeline = [
        {"$match": {"created_at": {"$gte": month_start}, "payment_status": "paid"}},
        {"$group": {"_id": None, "total": {"$sum": "$total_amount"}}}
    ]
    revenue_result = await db.orders.aggregate(pipeline).to_list(1)
    revenue = revenue_result[0]["total"] if revenue_result else 0

    latest_orders = await db.orders.find({}, {"_id": 0}).sort("created_at", -1).limit(5).to_list(5)

    snapshot = {
        "generated_at": now.isoformat(),
        "orders_today": orders_today,
        "orders_by_status": orders_by_status,
        "tickets_open": tickets_open,
        "quotes_new": quotes_new,
        "leads_new": leads_new,
        "membership_signups_new": signups_new,
        "revenue_this_month": revenue or 0,
        "latest_orders": [
            {
                "order_number": o.get("order_number"),
                "status": o.get("status"),
                "created_at": o.get("created_at"),
                "customer_name": o.get("customer_name")
            }
            for o in latest_orders
        ]
    }

    if data.type == "summary":
        prompt = (
            "Genera un resumen ejecutivo breve en español, en 4-6 líneas, "
            "con prioridades operativas usando este snapshot JSON:\n"
            f"{json.dumps(snapshot, ensure_ascii=False)}"
        )
    elif data.type == "risks":
        prompt = (
            "Analiza riesgos operativos y financieros en español con este snapshot JSON. "
            "Devuelve 5 bullets claros con riesgo y recomendación breve:\n"
            f"{json.dumps(snapshot, ensure_ascii=False)}"
        )
    elif data.type == "forecast":
        prompt = (
            "Genera una predicción corta en español sobre carga de trabajo y tendencias "
            "para la próxima semana usando este snapshot JSON. "
            "Incluye 3-5 bullets accionables:\n"
            f"{json.dumps(snapshot, ensure_ascii=False)}"
        )
    else:
        raise HTTPException(status_code=400, detail="Tipo de análisis inválido")

    reply = call_ollama(prompt)
    return {"reply": reply, "snapshot": snapshot}

@api_router.get("/finances/summary")
async def get_finances_summary(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    require_admin(current_user)

    def parse_amount(value) -> float:
        try:
            return float(value)
        except (TypeError, ValueError):
            return 0.0

    def normalize_date(date_value: Optional[str], is_end: bool = False) -> Optional[str]:
        if not date_value:
            return None
        try:
            dt = datetime.fromisoformat(date_value)
        except ValueError:
            return None
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        if is_end:
            dt = dt.replace(hour=23, minute=59, second=59, microsecond=999999)
        else:
            dt = dt.replace(hour=0, minute=0, second=0, microsecond=0)
        return dt.isoformat()

    start_iso = normalize_date(start_date)
    end_iso = normalize_date(end_date, is_end=True)

    order_query: Dict[str, Any] = {}
    membership_query: Dict[str, Any] = {}
    if start_iso or end_iso:
        range_query: Dict[str, Any] = {}
        if start_iso:
            range_query["$gte"] = start_iso
        if end_iso:
            range_query["$lte"] = end_iso
        order_query["created_at"] = range_query
        membership_query["created_at"] = range_query

    orders = await db.orders.find(order_query, {"_id": 0}).to_list(5000)
    paid_orders = [o for o in orders if (o.get("payment_status") or "").lower() == "paid"]
    pending_orders = [o for o in orders if (o.get("payment_status") or "").lower() != "paid"]

    order_revenue = sum(parse_amount(o.get("total_amount")) for o in paid_orders)
    avg_order_value = order_revenue / len(paid_orders) if paid_orders else 0

    signups = await db.membership_signups.find(membership_query, {"_id": 0}).to_list(5000)
    paid_signups = [s for s in signups if (s.get("payment_status") or "").lower() == "paid"]
    membership_revenue = sum(parse_amount(s.get("amount")) for s in paid_signups)

    return {
        "start_date": start_date,
        "end_date": end_date,
        "total_revenue": order_revenue + membership_revenue,
        "order_revenue": order_revenue,
        "membership_revenue": membership_revenue,
        "total_orders": len(orders),
        "paid_orders": len(paid_orders),
        "pending_orders": len(pending_orders),
        "avg_order_value": avg_order_value,
        "total_memberships": len(paid_signups)
    }

@api_router.post("/ai/patrones/scan")
async def scan_patterns(data: PatternScanRequest, current_user: dict = Depends(get_current_user)):
    require_admin(current_user)
    await ensure_ai_indexes()
    now = datetime.now(timezone.utc)
    periodo_desde = data.periodo_desde or (now - timedelta(days=7)).isoformat()
    periodo_hasta = data.periodo_hasta or now.isoformat()
    filtros = data.filtros or {}
    base_match = {"created_at": {"$gte": periodo_desde, "$lte": periodo_hasta}}
    if "service_type" in filtros:
        base_match["service_type"] = {"$in": filtros["service_type"]}
    patterns = []
    processing_pipeline = [
        {"$match": base_match},
        {
            "$project": {
                "service_type": 1,
                "processing_ts": {"$dateFromString": {"dateString": "$tiempos.fechas_estado.processing"}},
                "ready_ts": {"$dateFromString": {"dateString": "$tiempos.fechas_estado.ready"}}
            }
        },
        {"$match": {"processing_ts": {"$ne": None}, "ready_ts": {"$ne": None}}},
        {
            "$project": {
                "service_type": 1,
                "duration_hours": {
                    "$divide": [{"$subtract": ["$ready_ts", "$processing_ts"]}, 1000 * 60 * 60]
                }
            }
        },
        {
            "$group": {
                "_id": "$service_type",
                "avg_hours": {"$avg": "$duration_hours"},
                "max_hours": {"$max": "$duration_hours"},
                "count": {"$sum": 1}
            }
        }
    ]
    processing_stats = await db.orders.aggregate(processing_pipeline).to_list(50)
    for stat in processing_stats:
        patterns.append({
            "id": str(uuid.uuid4()),
            "tipo": "cuello_botella",
            "detalle": {
                "estado": "processing",
                "service_type": stat["_id"],
                "avg_hours": stat["avg_hours"],
                "max_hours": stat["max_hours"]
            },
            "query_base": base_match,
            "periodo": {"desde": periodo_desde, "hasta": periodo_hasta},
            "fecha_deteccion": now.isoformat(),
            "impacto_estimado": {"ordenes_afectadas": stat["count"]}
        })
    errors_pipeline = [
        {"$match": base_match},
        {"$unwind": "$errores_validacion"},
        {
            "$group": {
                "_id": "$errores_validacion.codigo",
                "count": {"$sum": 1}
            }
        },
        {"$sort": {"count": -1}},
        {"$limit": 10}
    ]
    errors_stats = await db.orders.aggregate(errors_pipeline).to_list(10)
    for stat in errors_stats:
        patterns.append({
            "id": str(uuid.uuid4()),
            "tipo": "error_recurrente",
            "detalle": {"codigo": stat["_id"], "count": stat["count"]},
            "query_base": base_match,
            "periodo": {"desde": periodo_desde, "hasta": periodo_hasta},
            "fecha_deteccion": now.isoformat(),
            "impacto_estimado": {"ordenes_afectadas": stat["count"]}
        })
    stale_threshold = (now - timedelta(hours=48)).isoformat()
    stale_match = {**base_match, "status": {"$in": ["processing", "ready", "out_for_delivery"]}, "created_at": {"$lte": stale_threshold}}
    stale_pipeline = [
        {"$match": stale_match},
        {"$group": {"_id": "$status", "count": {"$sum": 1}}}
    ]
    stale_stats = await db.orders.aggregate(stale_pipeline).to_list(10)
    for stat in stale_stats:
        patterns.append({
            "id": str(uuid.uuid4()),
            "tipo": "desviacion",
            "detalle": {"estado": stat["_id"], "threshold_hours": 48},
            "query_base": stale_match,
            "periodo": {"desde": periodo_desde, "hasta": periodo_hasta},
            "fecha_deteccion": now.isoformat(),
            "impacto_estimado": {"ordenes_afectadas": stat["count"]}
        })
    if patterns:
        await db.patrones_detectados.insert_many(patterns)
    return {"ok": True, "patrones_creados": len(patterns)}

@api_router.post("/ai/propuestas/generar")
async def generate_proposals(data: ProposalGenerateRequest, current_user: dict = Depends(get_current_user)):
    require_admin(current_user)
    await ensure_ai_indexes()
    await get_or_seed_business_rules()
    query = {}
    if data.patrones_ids:
        query["id"] = {"$in": data.patrones_ids}
    patrones = await db.patrones_detectados.find(query, {"_id": 0}).sort("fecha_deteccion", -1).to_list(50)
    if not patrones:
        return {"ok": True, "propuestas_creadas": 0, "detalle": "Sin patrones"}
    prompt = (
        "Eres un asistente de optimización. Devuelve JSON con clave propuestas (array). "
        "Cada propuesta: tipo, descripcion, impacto_estimado, accion_sugerida, nivel_riesgo, datos_respaldo.\n"
        f"patrones={json.dumps(patrones, ensure_ascii=False)}"
    )
    raw = call_ollama(prompt)
    propuestas = []
    try:
        payload = extract_json_payload(raw)
        propuestas = payload.get("propuestas", [])
    except Exception:
        propuestas = []
    if not propuestas:
        for pattern in patrones[: data.max_propuestas or 10]:
            tipo = "ajuste_regla" if pattern["tipo"] == "cuello_botella" else "nueva_validacion"
            propuestas.append({
                "tipo": tipo,
                "descripcion": f"Propuesta automática basada en patrón {pattern['tipo']}",
                "impacto_estimado": pattern.get("impacto_estimado", {}),
                "accion_sugerida": {"type": tipo, "payload": {"pattern_id": pattern["id"]}},
                "nivel_riesgo": "medio",
                "datos_respaldo": {"pattern_id": pattern["id"]}
            })
    now = datetime.now(timezone.utc).isoformat()
    docs = []
    for propuesta in propuestas[: data.max_propuestas or 10]:
        docs.append({
            "id": str(uuid.uuid4()),
            "tipo": propuesta.get("tipo"),
            "descripcion": propuesta.get("descripcion", ""),
            "estado": "pendiente",
            "impacto_estimado": propuesta.get("impacto_estimado", {}),
            "accion_sugerida": propuesta.get("accion_sugerida", {}),
            "nivel_riesgo": propuesta.get("nivel_riesgo", "medio"),
            "datos_respaldo": propuesta.get("datos_respaldo", {}),
            "fecha_generacion": now,
            "fuente": "analizador_automatico_v1"
        })
    if docs:
        await db.propuestas_ia.insert_many(docs)
    return {"ok": True, "propuestas_creadas": len(docs)}

@api_router.get("/ai/propuestas")
async def list_proposals(estado: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    require_admin(current_user)
    await ensure_ai_indexes()
    query = {}
    if estado:
        query["estado"] = estado
    propuestas = await db.propuestas_ia.find(query, {"_id": 0}).sort("fecha_generacion", -1).to_list(200)
    return propuestas

@api_router.get("/ai/propuestas/{propuesta_id}")
async def get_proposal(propuesta_id: str, current_user: dict = Depends(get_current_user)):
    require_admin(current_user)
    propuesta = await db.propuestas_ia.find_one({"id": propuesta_id}, {"_id": 0})
    if not propuesta:
        raise HTTPException(status_code=404, detail="Propuesta no encontrada")
    return propuesta

@api_router.get("/ai/propuestas/{propuesta_id}/simulacion")
async def get_proposal_simulation(
    propuesta_id: str,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    service_type: Optional[str] = None,
    status: Optional[str] = None,
    real_before_days: Optional[int] = 14,
    real_after_days: Optional[int] = 7,
    current_user: dict = Depends(get_current_user)
):
    require_admin(current_user)
    propuesta = await db.propuestas_ia.find_one({"id": propuesta_id}, {"_id": 0})
    if not propuesta:
        raise HTTPException(status_code=404, detail="Propuesta no encontrada")
    now = datetime.now(timezone.utc)
    periodo_desde = start_date or (now - timedelta(days=7)).isoformat()
    periodo_hasta = end_date or now.isoformat()
    match = {"created_at": {"$gte": periodo_desde, "$lte": periodo_hasta}}
    inferred_service = propuesta.get("accion_sugerida", {}).get("payload", {}).get("service_type")
    service_type = service_type or inferred_service
    if service_type:
        match["service_type"] = service_type
    if status:
        match["status"] = status
    processing_pipeline = [
        {"$match": match},
        {
            "$project": {
                "processing_ts": {"$dateFromString": {"dateString": "$tiempos.fechas_estado.processing"}},
                "ready_ts": {"$dateFromString": {"dateString": "$tiempos.fechas_estado.ready"}}
            }
        },
        {"$match": {"processing_ts": {"$ne": None}, "ready_ts": {"$ne": None}}},
        {
            "$project": {
                "duration_hours": {
                    "$divide": [{"$subtract": ["$ready_ts", "$processing_ts"]}, 1000 * 60 * 60]
                }
            }
        },
        {"$group": {"_id": None, "avg_hours": {"$avg": "$duration_hours"}}}
    ]
    processing_stats = await db.orders.aggregate(processing_pipeline).to_list(1)
    avg_processing_hours = processing_stats[0]["avg_hours"] if processing_stats else 0
    errors_pipeline = [
        {"$match": match},
        {"$unwind": "$errores_validacion"},
        {"$group": {"_id": None, "count": {"$sum": 1}}}
    ]
    errors_stats = await db.orders.aggregate(errors_pipeline).to_list(1)
    errors_count = errors_stats[0]["count"] if errors_stats else 0
    orders_count = await db.orders.count_documents(match)
    before = {
        "ordenes": orders_count,
        "avg_processing_horas": round(avg_processing_hours, 2) if avg_processing_hours else 0,
        "errores_validacion": errors_count
    }
    after = dict(before)
    impacto = propuesta.get("impacto_estimado", {})
    tiempo_pct = impacto.get("tiempo_ahorrado_porcentaje")
    errores_pct = impacto.get("errores_reducidos_porcentaje")
    if isinstance(tiempo_pct, (int, float)):
        after["avg_processing_horas"] = round(before["avg_processing_horas"] * (1 - tiempo_pct / 100), 2)
    if isinstance(errores_pct, (int, float)):
        after["errores_validacion"] = max(0, round(before["errores_validacion"] * (1 - errores_pct / 100)))
    service_pipeline = [
        {"$match": match},
        {"$group": {"_id": "$service_type", "count": {"$sum": 1}}}
    ]
    service_stats = await db.orders.aggregate(service_pipeline).to_list(20)
    status_pipeline = [
        {"$match": match},
        {"$group": {"_id": "$status", "count": {"$sum": 1}}}
    ]
    status_stats = await db.orders.aggregate(status_pipeline).to_list(20)
    real_before_start = (now - timedelta(days=real_before_days or 14)).isoformat()
    real_before_end = (now - timedelta(days=real_after_days or 7)).isoformat()
    real_after_start = (now - timedelta(days=real_after_days or 7)).isoformat()
    real_after_end = now.isoformat()
    real_before_match = {"created_at": {"$gte": real_before_start, "$lte": real_before_end}}
    real_after_match = {"created_at": {"$gte": real_after_start, "$lte": real_after_end}}
    if service_type:
        real_before_match["service_type"] = service_type
        real_after_match["service_type"] = service_type
    if status:
        real_before_match["status"] = status
        real_after_match["status"] = status
    real_before_stats = await db.orders.aggregate([
        {"$match": real_before_match},
        {"$unwind": {"path": "$errores_validacion", "preserveNullAndEmptyArrays": True}},
        {
            "$group": {
                "_id": None,
                "errores": {"$sum": {"$cond": [{"$ifNull": ["$errores_validacion", False]}, 1, 0]}},
                "ordenes": {"$addToSet": "$id"}
            }
        }
    ]).to_list(1)
    real_after_stats = await db.orders.aggregate([
        {"$match": real_after_match},
        {"$unwind": {"path": "$errores_validacion", "preserveNullAndEmptyArrays": True}},
        {
            "$group": {
                "_id": None,
                "errores": {"$sum": {"$cond": [{"$ifNull": ["$errores_validacion", False]}, 1, 0]}},
                "ordenes": {"$addToSet": "$id"}
            }
        }
    ]).to_list(1)
    real_before = real_before_stats[0] if real_before_stats else {"errores": 0, "ordenes": []}
    real_after = real_after_stats[0] if real_after_stats else {"errores": 0, "ordenes": []}
    impacto_real = {
        "errores_before": real_before["errores"],
        "errores_after": real_after["errores"],
        "ordenes_before": len(real_before["ordenes"]),
        "ordenes_after": len(real_after["ordenes"])
    }
    return {
        "before": before,
        "after": after,
        "impacto_estimado": impacto,
        "impacto_real": impacto_real,
        "por_servicio": service_stats,
        "por_estado": status_stats,
        "periodo": {"desde": periodo_desde, "hasta": periodo_hasta},
        "filtros": {"service_type": service_type, "status": status}
    }

@api_router.post("/ai/propuestas/{propuesta_id}/accion")
async def act_on_proposal(propuesta_id: str, data: ProposalActionRequest, current_user: dict = Depends(get_current_user)):
    require_admin(current_user)
    propuesta = await db.propuestas_ia.find_one({"id": propuesta_id}, {"_id": 0})
    if not propuesta:
        raise HTTPException(status_code=404, detail="Propuesta no encontrada")
    accion = data.accion
    if accion not in ["aceptar", "rechazar", "modificar", "posponer"]:
        raise HTTPException(status_code=400, detail="Acción inválida")
    now = datetime.now(timezone.utc).isoformat()
    estado = "pendiente"
    if accion == "aceptar":
        estado = "aceptada"
    if accion == "rechazar":
        estado = "rechazada"
    if accion == "modificar":
        estado = "modificada"
    if accion == "posponer":
        estado = "pospuesta"
    await db.propuestas_ia.update_one(
        {"id": propuesta_id},
        {"$set": {"estado": estado, "feedback": {"ultima_decision": estado, "fecha_decision": now, "usuario_id": current_user["id"], "comentarios": data.comentarios}}}
    )
    feedback = {
        "id": str(uuid.uuid4()),
        "propuesta_id": propuesta_id,
        "accion_tomada": estado,
        "modificaciones": data.modificaciones,
        "motivo": data.comentarios,
        "usuario_id": current_user["id"],
        "timestamp": now
    }
    await db.feedback_ia.insert_one(feedback)
    action_payload = data.modificaciones.get("accion_sugerida") if data.modificaciones else None
    action_payload = action_payload or propuesta.get("accion_sugerida")
    if accion in ["aceptar", "modificar"] and action_payload:
        action_type = action_payload.get("type") or action_payload.get("tipo")
        payload = action_payload.get("payload", {})
        if action_type == "ajuste_regla":
            await db.reglas_negocio.update_one({"id": "order_rules_v1"}, {"$set": {"updated_at": now, **payload}}, upsert=True)
        if action_type == "nueva_validacion":
            await db.reglas_negocio.update_one({"id": "order_rules_v1"}, {"$addToSet": {"validaciones": payload}, "$set": {"updated_at": now}}, upsert=True)
        if action_type == "optimizacion_notificacion":
            await db.reglas_negocio.update_one({"id": "order_rules_v1"}, {"$set": {"updated_at": now, "auto_transitions": payload}}, upsert=True)
        if action_type == "plan_recuperacion":
            acciones = payload.get("acciones", [])
            for item in acciones:
                order_id = item.get("order_id")
                status_value = item.get("status")
                if not order_id or not status_value:
                    continue
                await db.orders.update_one(
                    {"id": order_id},
                    {
                        "$set": {
                            "status": status_value,
                            "estado_actual": status_value,
                            "updated_at": now,
                            "tiempos.ultimo_cambio_estado": now,
                            f"tiempos.fechas_estado.{status_value}": now
                        }
                    }
                )
    await create_audit_log("AI_PROPOSAL_ACTION", "propuesta_ia", propuesta_id, current_user["id"], {"accion": estado})
    return {"ok": True, "estado": estado}

@api_router.post("/admin/import")
async def create_import(origen: str = Query("csv"), file: UploadFile = File(...), current_user: dict = Depends(get_current_user)):
    require_admin(current_user)
    await ensure_ai_indexes()
    filename = file.filename or ""
    content = await file.read()
    rows = []
    headers = []
    if filename.lower().endswith(".csv") or origen == "csv":
        text = content.decode("utf-8", errors="ignore")
        reader = csv.DictReader(io.StringIO(text))
        headers = reader.fieldnames or []
        for idx, row in enumerate(reader):
            if idx >= 500:
                break
            rows.append(row)
    elif filename.lower().endswith(".xlsx") or origen == "excel":
        try:
            import openpyxl
        except Exception:
            raise HTTPException(status_code=400, detail="Excel no soportado sin openpyxl")
        workbook = openpyxl.load_workbook(io.BytesIO(content), data_only=True)
        sheet = workbook.active
        headers = [str(cell.value or "").strip() for cell in next(sheet.iter_rows(min_row=1, max_row=1))]
        for idx, row_cells in enumerate(sheet.iter_rows(min_row=2), start=0):
            if idx >= 500:
                break
            row = {}
            for col_idx, cell in enumerate(row_cells):
                key = headers[col_idx] if col_idx < len(headers) else f"col_{col_idx}"
                row[key] = cell.value
            rows.append(row)
    else:
        raise HTTPException(status_code=400, detail="Formato no soportado")
    import_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "id": import_id,
        "origen": origen,
        "estado": "subido",
        "raw_headers": headers,
        "raw_sample": rows[:5],
        "raw_rows": rows,
        "fecha_importacion": now,
        "usuario_id": current_user["id"]
    }
    await db.importaciones_legacy.insert_one(doc)
    return {"import_id": import_id, "campos_detectados": headers, "sample": rows[:5]}

@api_router.post("/admin/import/{import_id}/mapping/suggest")
async def suggest_import_mapping(import_id: str, data: ImportMappingSuggestRequest, current_user: dict = Depends(get_current_user)):
    require_admin(current_user)
    import_doc = await db.importaciones_legacy.find_one({"id": import_id}, {"_id": 0})
    if not import_doc:
        raise HTTPException(status_code=404, detail="Importación no encontrada")
    mapping = suggest_mapping(data.campos_legacy)
    prompt = (
        "Devuelve JSON con clave sugerencias (objeto) para mapear campos legacy a ordenes. "
        f"campos={json.dumps(data.campos_legacy, ensure_ascii=False)}"
    )
    try:
        raw = call_ollama(prompt)
        payload = extract_json_payload(raw)
        ai_mapping = payload.get("sugerencias")
        if isinstance(ai_mapping, dict):
            mapping = {**mapping, **ai_mapping}
    except Exception:
        pass
    await db.importaciones_legacy.update_one({"id": import_id}, {"$set": {"mapping_sugerido": mapping}})
    return {"sugerencias": mapping}

@api_router.post("/admin/import/{import_id}/mapping/confirm")
async def confirm_import_mapping(import_id: str, data: ImportMappingConfirmRequest, current_user: dict = Depends(get_current_user)):
    require_admin(current_user)
    import_doc = await db.importaciones_legacy.find_one({"id": import_id}, {"_id": 0})
    if not import_doc:
        raise HTTPException(status_code=404, detail="Importación no encontrada")
    rows = import_doc.get("raw_rows", [])
    mapping = data.mapping_campos
    now = datetime.now(timezone.utc).isoformat()
    created_orders = []
    for row in rows:
        mapped = {}
        for legacy_key, target_path in mapping.items():
            if legacy_key in row and target_path:
                set_nested_value(mapped, target_path, row[legacy_key])
        status_value = mapped.get("estado_actual") or mapped.get("status") or "new"
        order_id = str(uuid.uuid4())
        order_number = mapped.get("order_number") or await generate_order_number()
        customer_id = await resolve_or_create_customer_from_row(mapped)
        order = {
            "id": order_id,
            "order_number": order_number,
            "customer_id": customer_id,
            "customer_name": mapped.get("customer_name"),
            "service_type": mapped.get("service_type") or "pickup_delivery",
            "pickup_date": mapped.get("formulario", {}).get("pickup_date"),
            "pickup_time_window": mapped.get("formulario", {}).get("pickup_time_window"),
            "pickup_address": mapped.get("formulario", {}).get("pickup_address"),
            "delivery_address": mapped.get("formulario", {}).get("delivery_address"),
            "estimated_lbs": mapped.get("formulario", {}).get("estimated_lbs"),
            "notes": mapped.get("notes"),
            "gate_code": mapped.get("formulario", {}).get("gate_code"),
            "status": status_value,
            "estado_actual": status_value,
            "payment_status": "unpaid",
            "total_amount": None,
            "tiempos": build_order_times(mapped.get("tiempos", {}).get("creacion") or now, status_value),
            "errores_validacion": [],
            "secciones": [],
            "importada": True,
            "origen": "import_legacy",
            "qr_token": str(uuid.uuid4()),
            "created_at": mapped.get("tiempos", {}).get("creacion") or now,
            "updated_at": now
        }
        await db.orders.insert_one(order)
        created_orders.append(order_id)
    await db.importaciones_legacy.update_one(
        {"id": import_id},
        {"$set": {"estado": "procesado", "mapping_campos": mapping, "ordenes_creadas_ids": created_orders}}
    )
    return {"ok": True, "ordenes_creadas": len(created_orders)}

@api_router.post("/admin/import/{import_id}/plan-recuperacion")
async def import_recovery_plan(import_id: str, current_user: dict = Depends(get_current_user)):
    require_admin(current_user)
    import_doc = await db.importaciones_legacy.find_one({"id": import_id}, {"_id": 0})
    if not import_doc:
        raise HTTPException(status_code=404, detail="Importación no encontrada")
    order_ids = import_doc.get("ordenes_creadas_ids", [])
    if not order_ids:
        raise HTTPException(status_code=400, detail="No hay órdenes importadas")
    now = datetime.now(timezone.utc).isoformat()
    stale_orders = await db.orders.find(
        {"id": {"$in": order_ids}, "status": {"$nin": ["completed", "cancelled"]}},
        {"_id": 0}
    ).to_list(200)
    acciones = [{"order_id": o["id"], "status": "processing"} for o in stale_orders[:50]]
    propuesta = {
        "id": str(uuid.uuid4()),
        "tipo": "plan_recuperacion",
        "descripcion": "Plan de recuperación generado desde importación legacy",
        "estado": "pendiente",
        "impacto_estimado": {"ordenes_afectadas": len(stale_orders)},
        "accion_sugerida": {"type": "plan_recuperacion", "payload": {"acciones": acciones}},
        "nivel_riesgo": "medio",
        "datos_respaldo": {"import_id": import_id},
        "fecha_generacion": now,
        "fuente": "importaciones_legacy"
    }
    await db.propuestas_ia.insert_one(propuesta)
    await db.importaciones_legacy.update_one({"id": import_id}, {"$set": {"plan_recuperacion_propuesta_id": propuesta["id"]}})
    return {"ok": True, "propuesta_id": propuesta["id"]}

@api_router.get("/public/membership-section", response_model=MembershipSectionResponse)
async def get_public_membership_section():
    section = await db.membership_section.find_one({"id": "default"}, {"_id": 0})
    if not section:
        section = {
            "id": "default",
            "heading": "Flexible Plans for Every Home",
            "subheading": None,
            "special_title": "🎉 New Member Special",
            "special_text": "$10 OFF your first month on any membership. Ask when you call or text.",
            "cta_title": "Need help choosing?",
            "cta_text": "Just call, text, or email us at (805) 836-8872 and we'll recommend the perfect plan based on your weekly laundry.",
            "cta_button_label": "👉 BECOME A MEMBER",
            "cta_button_url": "/membership",
            "contact_phone": "(805) 836-8872",
            "is_active": True,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat()
        }
        await db.membership_section.insert_one(section)
    return MembershipSectionResponse(**section)

@api_router.get("/public/membership-plans", response_model=List[MembershipPlanResponse])
async def get_public_membership_plans(active_only: bool = True):
    query = {}
    if active_only:
        query["is_active"] = True
    plans = await db.membership_plans.find(query, {"_id": 0}).sort([("sort_order", 1), ("created_at", -1)]).to_list(200)
    if len(plans) == 0:
        now = datetime.now(timezone.utc).isoformat()
        seed = [
            {
                "id": str(uuid.uuid4()),
                "name": "MOST POPULAR",
                "price": "$139 / month",
                "image_url": "https://images.squarespace-cdn.com/content/v1/696c559a4b2b9b1b0febf8d7/4a2815a1-54c1-45fb-8320-244dce8b83c8/MOST+POPULAR.png",
                "features": ["Up to 60 lb/ month", "Basic Preferences saved (folding notes)", "Best value for most families"],
                "is_popular": True,
                "is_active": True,
                "sort_order": 1,
                "created_at": now,
                "updated_at": now
            },
            {
                "id": str(uuid.uuid4()),
                "name": "FAMILY PLUS",
                "price": "$199 / month",
                "image_url": "https://images.squarespace-cdn.com/content/v1/696c559a4b2b9b1b0febf8d7/f262a5b8-0043-4977-9d32-d6b343be3e70/FAMILY+PLUS.png",
                "features": ["Up to 90 lb/ month", "Priority scheduling", "Great for larger households or rentals"],
                "is_popular": False,
                "is_active": True,
                "sort_order": 2,
                "created_at": now,
                "updated_at": now
            },
            {
                "id": str(uuid.uuid4()),
                "name": "ELITE CONCIERGE",
                "price": "$299 / month",
                "image_url": "https://images.squarespace-cdn.com/content/v1/696c559a4b2b9b1b0febf8d7/13a4c501-7792-4f72-bf5c-072f95b5f995/ELITE+CONCIERGE.png",
                "features": ["Up to 120 lb/ month", "Priority turnaround (when possible)", "Premium packaging", "Saved preferences", "1 emergency pickup included"],
                "is_popular": False,
                "is_active": True,
                "sort_order": 3,
                "created_at": now,
                "updated_at": now
            }
        ]
        await db.membership_plans.insert_many(seed)
        plans = seed
    return [MembershipPlanResponse(**p) for p in plans]

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

# ==================== PUBLIC FORM ENDPOINTS (No Auth Required) ====================

class PublicPickupRequest(BaseModel):
    name: str
    email: EmailStr
    phone: str
    address: str
    pickup_date: Optional[str] = None
    pickup_time: Optional[str] = None
    service_type: Optional[str] = "pickup_delivery"
    notes: Optional[str] = None
    gate_code: Optional[str] = None

class PublicContactRequest(BaseModel):
    name: str
    email: EmailStr
    phone: Optional[str] = None
    message: str
    subject: Optional[str] = "Contact Request"

class PublicQuoteRequest(BaseModel):
    company_name: str
    contact_name: str
    email: EmailStr
    phone: Optional[str] = None
    industry: Optional[str] = None
    estimated_lbs: Optional[float] = None
    message: Optional[str] = None

class PublicMembershipSignup(BaseModel):
    first_name: str
    last_name: str
    email: EmailStr
    phone: str
    contact_method: str
    address_line1: str
    address_line2: Optional[str] = None
    city: str
    state: str
    zip_code: str
    membership_plan: str
    laundry_frequency: str
    estimated_lbs: float
    detergent_type: Optional[str] = None
    water_temperature: Optional[str] = None
    fabric_softener: Optional[str] = None
    folding_style: Optional[str] = None
    hanging_instructions: Optional[str] = None
    allergies: Optional[str] = None
    special_instructions: Optional[str] = None
    pickup_time_preference: Optional[str] = None
    gate_code: Optional[str] = None

@api_router.post("/public/pickup-request")
async def public_pickup_request(data: PublicPickupRequest):
    """Public endpoint for pickup request form - no auth required"""
    now = datetime.now(timezone.utc).isoformat()

    normalized_name = normalize_name(data.name)
    normalized_email = normalize_email(data.email) or data.email.lower()
    normalized_phone = normalize_phone(data.phone)
    normalized_address = normalize_address(data.address)
    normalized_notes = normalize_spaces(data.notes)
    normalized_gate_code = normalize_spaces(data.gate_code)
    normalized_service_type = normalize_spaces(data.service_type).lower().replace(" ", "_") or "pickup_delivery"

    # Find or create customer
    customer = await db.customers.find_one({"email": normalized_email}, {"_id": 0})
    if not customer:
        customer_id = str(uuid.uuid4())
        customer = {
            "id": customer_id,
            "name": normalized_name or data.name,
            "email": normalized_email,
            "phone": normalized_phone or data.phone,
            "address": normalized_address or data.address,
            "preferred_contact": "email",
            "notes": None,
            "status": "active",
            "total_orders": 0,
            "created_at": now,
            "updated_at": now
        }
        await db.customers.insert_one(customer)
        await create_audit_log("CUSTOMER_CREATED", "customer", customer_id, None, {"source": "public_form"})
    else:
        await db.customers.update_one(
            {"id": customer["id"]},
            {"$set": {
                "name": normalized_name or customer.get("name"),
                "phone": normalized_phone or customer.get("phone"),
                "address": normalized_address or customer.get("address"),
                "updated_at": now
            }}
        )
    
    # Create order
    pref = await db.preferences.find({"customer_id": customer["id"]}, {"_id": 0}).sort("version", -1).limit(1).to_list(1)
    preference_id = pref[0].get("id") if pref else None
    preference_snapshot = None
    if pref:
        preference_snapshot = {k: v for k, v in pref[0].items() if k not in ["_id", "customer_id"]}

    order_id = str(uuid.uuid4())
    order_number = await generate_order_number()
    order = {
        "id": order_id,
        "order_number": order_number,
        "customer_id": customer["id"],
        "customer_name": customer["name"],
        "service_type": normalized_service_type,
        "pickup_date": data.pickup_date,
        "pickup_time_window": data.pickup_time,
        "pickup_address": normalized_address,
        "delivery_address": normalized_address,
        "estimated_lbs": None,
        "actual_lbs": None,
        "notes": normalized_notes,
        "gate_code": normalized_gate_code,
        "preferences_id": preference_id,
        "preferences_snapshot": preference_snapshot,
        "status": "new",
        "payment_status": "unpaid",
        "total_amount": None,
        "created_at": now,
        "updated_at": now
    }
    await db.orders.insert_one(order)
    await db.customers.update_one({"id": customer["id"]}, {"$inc": {"total_orders": 1}})
    await create_audit_log("ORDER_CREATED", "order", order_id, None, {"source": "public_form"})
    
    # Send notifications
    if NOTIFICATIONS_ENABLED:
        try:
            await notify_order_created(customer, order)
        except Exception as e:
            logger.error(f"Notification failed: {e}")
    
    return {
        "success": True,
        "order_number": order_number,
        "message": "¡Gracias! Tu solicitud de pickup ha sido recibida. Te contactaremos pronto."
    }

@api_router.post("/public/contact")
async def public_contact(data: PublicContactRequest):
    """Public endpoint for contact form - creates a support ticket"""
    now = datetime.now(timezone.utc).isoformat()

    normalized_name = normalize_name(data.name)
    normalized_email = normalize_email(data.email) or data.email.lower()
    normalized_phone = normalize_phone(data.phone)
    normalized_message = normalize_spaces(data.message)
    normalized_subject = normalize_spaces(data.subject) or "Contact Request"

    # Find customer if exists
    customer = await db.customers.find_one({"email": normalized_email}, {"_id": 0})
    customer_id = customer["id"] if customer else None
    customer_name = customer["name"] if customer else (normalized_name or data.name)
    
    # Create support ticket
    ticket_id = str(uuid.uuid4())
    count = await db.tickets.count_documents({})
    ticket_number = f"TKT-{str(count + 1).zfill(5)}"
    
    ticket = {
        "id": ticket_id,
        "ticket_number": ticket_number,
        "customer_id": customer_id,
        "customer_name": customer_name,
        "subject": normalized_subject,
        "description": f"Nombre: {normalized_name or data.name}\nEmail: {normalized_email}\nTeléfono: {normalized_phone or 'N/A'}\n\nMensaje:\n{normalized_message}",
        "category": "general",
        "priority": "medium",
        "status": "open",
        "assigned_to": None,
        "resolution": None,
        "created_at": now,
        "updated_at": now
    }
    await db.tickets.insert_one(ticket)
    await create_audit_log("TICKET_CREATED", "ticket", ticket_id, None, {"source": "public_form"})
    
    return {
        "success": True,
        "ticket_number": ticket_number,
        "message": "¡Gracias por contactarnos! Te responderemos pronto."
    }

@api_router.post("/public/quote-request")
async def public_quote_request(data: PublicQuoteRequest):
    """Public endpoint for B2B quote request"""
    now = datetime.now(timezone.utc).isoformat()

    normalized_company = normalize_spaces(data.company_name)
    normalized_contact = normalize_name(data.contact_name)
    normalized_email = normalize_email(data.email) or data.email.lower()
    normalized_phone = normalize_phone(data.phone)
    normalized_industry = normalize_spaces(data.industry)
    normalized_message = normalize_spaces(data.message)

    quote_id = str(uuid.uuid4())
    today = datetime.now(timezone.utc).strftime("%Y%m%d")
    count = await db.quotes.count_documents({"quote_number": {"$regex": f"^QT-{today}"}})
    quote_number = f"QT-{today}-{str(count + 1).zfill(4)}"
    
    quote = {
        "id": quote_id,
        "quote_number": quote_number,
        "company_name": normalized_company or data.company_name,
        "contact_name": normalized_contact or data.contact_name,
        "email": normalized_email,
        "phone": normalized_phone or data.phone,
        "industry": normalized_industry,
        "estimated_lbs_per_week": data.estimated_lbs,
        "service_needs": normalized_message,
        "notes": None,
        "status": "new",
        "assigned_to": None,
        "follow_up_date": None,
        "created_at": now,
        "updated_at": now
    }
    await db.quotes.insert_one(quote)
    await create_audit_log("QUOTE_CREATED", "quote", quote_id, None, {"source": "public_form"})
    
    return {
        "success": True,
        "quote_number": quote_number,
        "message": "¡Gracias! Hemos recibido tu solicitud de cotización comercial."
    }

@api_router.post("/public/membership-signup")
async def public_membership_signup(data: PublicMembershipSignup):
    now = datetime.now(timezone.utc).isoformat()
    signup_id = str(uuid.uuid4())

    normalized_first = normalize_name(data.first_name)
    normalized_last = normalize_name(data.last_name)
    normalized_email = normalize_email(data.email) or data.email.lower()
    normalized_phone = normalize_phone(data.phone)
    normalized_contact = normalize_spaces(data.contact_method)
    normalized_address1 = normalize_address(data.address_line1)
    normalized_address2 = normalize_address(data.address_line2)
    normalized_city = normalize_spaces(data.city)
    normalized_state = normalize_spaces(data.state)
    normalized_zip = normalize_spaces(data.zip_code)
    normalized_plan = normalize_spaces(data.membership_plan)
    normalized_frequency = normalize_spaces(data.laundry_frequency)

    preferences = {
        "detergent_type": normalize_spaces(data.detergent_type),
        "water_temperature": normalize_spaces(data.water_temperature),
        "fabric_softener": normalize_spaces(data.fabric_softener),
        "folding_style": normalize_spaces(data.folding_style),
        "hanging_instructions": normalize_spaces(data.hanging_instructions),
        "allergies": normalize_spaces(data.allergies),
        "special_instructions": normalize_spaces(data.special_instructions),
        "pickup_time_preference": normalize_spaces(data.pickup_time_preference),
        "gate_code": normalize_spaces(data.gate_code)
    }
    if not any(preferences.values()):
        preferences = None

    signup = {
        "id": signup_id,
        "first_name": normalized_first or data.first_name,
        "last_name": normalized_last or data.last_name,
        "email": normalized_email,
        "phone": normalized_phone or data.phone,
        "contact_method": normalized_contact or data.contact_method,
        "address_line1": normalized_address1 or data.address_line1,
        "address_line2": normalized_address2 or data.address_line2,
        "city": normalized_city or data.city,
        "state": normalized_state or data.state,
        "zip_code": normalized_zip or data.zip_code,
        "membership_plan": normalized_plan or data.membership_plan,
        "laundry_frequency": normalized_frequency or data.laundry_frequency,
        "estimated_lbs": data.estimated_lbs,
        "preferences": preferences,
        "status": "new",
        "customer_id": None,
        "created_at": now,
        "updated_at": now
    }
    await db.membership_signups.insert_one(signup)
    await create_audit_log("MEMBERSHIP_SIGNUP_CREATED", "membership_signup", signup_id, None, {"source": "public_form"})
    return {
        "success": True,
        "message": "¡Gracias! Tu solicitud de membresía fue recibida. Te contactaremos para confirmar tu plan."
    }

# ==================== B2B QUOTE REQUEST ====================

class B2BQuoteRequest(BaseModel):
    first_name: str
    last_name: str
    email: EmailStr
    phone: str
    contact_method: Optional[str] = None
    address_line1: str
    address_line2: Optional[str] = None
    city: str
    state: str
    zip_code: str
    job_title: Optional[str] = None
    service_type: str
    has_membership: str
    company_legal_name: Optional[str] = None
    dba_name: Optional[str] = None
    business_type: str
    laundry_frequency: str
    estimated_lbs: float
    best_date: str
    best_time: str
    additional_notes: Optional[str] = None
    subscribe_newsletter: Optional[bool] = False

@api_router.post("/public/b2b-quote")
async def create_b2b_quote(data: B2BQuoteRequest):
    """Create a B2B quote request - goes directly to quotes"""
    now = datetime.now(timezone.utc).isoformat()
    quote_id = str(uuid.uuid4())
    quote_number = f"B2B-{datetime.now().strftime('%Y%m%d')}-{str(uuid.uuid4())[:6].upper()}"
    
    quote_doc = {
        "id": quote_id,
        "quote_number": quote_number,
        "source": "website_b2b_form",
        "status": "new",
        # Contact info
        "first_name": data.first_name,
        "last_name": data.last_name,
        "contact_name": f"{data.first_name} {data.last_name}",
        "email": data.email.lower(),
        "phone": data.phone,
        "contact_method": data.contact_method,
        "job_title": data.job_title,
        # Address
        "address_line1": data.address_line1,
        "address_line2": data.address_line2,
        "city": data.city,
        "state": data.state,
        "zip_code": data.zip_code,
        "full_address": f"{data.address_line1}, {data.city}, {data.state} {data.zip_code}",
        # Business info
        "company_legal_name": data.company_legal_name,
        "company_name": data.company_legal_name or data.dba_name,
        "dba_name": data.dba_name,
        "business_type": data.business_type,
        "has_membership": data.has_membership,
        # Service requirements
        "service_type": data.service_type,
        "laundry_frequency": data.laundry_frequency,
        "estimated_lbs_per_pickup": data.estimated_lbs,
        "estimated_lbs_per_week": data.estimated_lbs * (7 if data.laundry_frequency == "daily" else 2 if data.laundry_frequency == "twice_week" else 1),
        # Scheduling
        "best_contact_date": data.best_date,
        "best_contact_time": data.best_time,
        "additional_notes": data.additional_notes,
        "subscribe_newsletter": data.subscribe_newsletter,
        # Meta
        "created_at": now,
        "updated_at": now
    }
    
    await db.quotes.insert_one(quote_doc)
    await create_audit_log("B2B_QUOTE_CREATED", "quote", quote_id, "public", {"company": data.company_legal_name, "business_type": data.business_type})
    
    # Send notification to admin (if Twilio configured)
    if NOTIFICATIONS_ENABLED and not SKIP_SERVER_NOTIFICATIONS:
        try:
            await send_sms(
                os.environ.get("ADMIN_PHONE", "+18055154030"),
                f"New B2B Quote Request: {data.company_legal_name or data.first_name} ({data.business_type}) - {data.estimated_lbs} lbs/{data.laundry_frequency}"
            )
        except:
            pass
    
    return {
        "message": "Thank you! Your quote request has been received. Our team will contact you within 24-48 hours.",
        "quote_number": quote_number
    }

# ==================== EXPORT ENDPOINTS ====================

@api_router.get("/export/customers")
async def export_customers_csv(current_user: dict = Depends(get_current_user)):
    """Export customers to CSV"""
    customers = await db.customers.find({}, {"_id": 0}).to_list(10000)

    output = io.StringIO()
    if customers:
        all_keys = set()
        for customer in customers:
            if isinstance(customer, dict):
                all_keys.update([str(key) for key in customer.keys()])
        fieldnames = sorted(list(all_keys))

        writer = csv.DictWriter(output, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        for customer in customers:
            normalized = {}
            for key in fieldnames:
                value = customer.get(key, "")
                if isinstance(value, (dict, list)):
                    value = json.dumps(value, default=str)
                elif value is None:
                    value = ""
                elif not isinstance(value, (str, int, float, bool)):
                    value = str(value)
                normalized[key] = value
            writer.writerow(normalized)

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=customers.csv"}
    )

@api_router.get("/export/orders")
async def export_orders_csv(current_user: dict = Depends(get_current_user)):
    """Export orders to CSV"""
    orders = await db.orders.find({}, {"_id": 0}).to_list(10000)
    
    output = io.StringIO()
    if orders:
        base_fields = [
            "id",
            "order_number",
            "customer_id",
            "customer_name",
            "service_type",
            "pickup_date",
            "pickup_time_window",
            "pickup_address",
            "delivery_address",
            "estimated_lbs",
            "notes",
            "gate_code",
            "status",
            "payment_status",
            "total_amount",
            "created_at",
            "updated_at"
        ]
        fieldnames = [field for field in base_fields if any(field in o for o in orders)]
        extra_fields = sorted({key for o in orders for key in o.keys()} - set(fieldnames))
        fieldnames.extend(extra_fields)
        writer = csv.DictWriter(output, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(orders)
    
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=orders.csv"}
    )

@api_router.get("/export/leads")
async def export_leads_csv(current_user: dict = Depends(get_current_user)):
    """Export leads to CSV"""
    leads = await db.leads.find({}, {"_id": 0}).to_list(10000)
    
    output = io.StringIO()
    if leads:
        writer = csv.DictWriter(output, fieldnames=leads[0].keys())
        writer.writeheader()
        writer.writerows(leads)
    
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=leads.csv"}
    )

@api_router.get("/export/quotes")
async def export_quotes_csv(current_user: dict = Depends(get_current_user)):
    """Export quotes to CSV"""
    quotes = await db.quotes.find({}, {"_id": 0}).to_list(10000)
    
    output = io.StringIO()
    if quotes:
        writer = csv.DictWriter(output, fieldnames=quotes[0].keys())
        writer.writeheader()
        writer.writerows(quotes)
    
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=quotes.csv"}
    )

@api_router.get("/export/tickets")
async def export_tickets_csv(current_user: dict = Depends(get_current_user)):
    """Export tickets to CSV"""
    tickets = await db.tickets.find({}, {"_id": 0}).to_list(10000)
    
    output = io.StringIO()
    if tickets:
        writer = csv.DictWriter(output, fieldnames=tickets[0].keys())
        writer.writeheader()
        writer.writerows(tickets)
    
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=tickets.csv"}
    )

# ==================== CALENDAR ENDPOINTS ====================

@api_router.get("/calendar/orders")
async def get_calendar_orders(
    start_date: str = Query(..., description="Start date YYYY-MM-DD"),
    end_date: str = Query(..., description="End date YYYY-MM-DD"),
    current_user: dict = Depends(get_current_user)
):
    """Get orders for calendar view within date range"""
    orders = await db.orders.find({
        "pickup_date": {"$gte": start_date, "$lte": end_date}
    }, {"_id": 0}).to_list(1000)
    
    # Format for calendar
    events = []
    for order in orders:
        events.append({
            "id": order["id"],
            "title": f"{order['order_number']} - {order['customer_name']}",
            "date": order["pickup_date"],
            "time": order.get("pickup_time_window"),
            "status": order["status"],
            "service_type": order["service_type"],
            "address": order.get("pickup_address"),
            "customer_name": order["customer_name"],
            "order_number": order["order_number"]
        })
    
    return events

# ==================== NOTIFICATION SETTINGS ====================

@api_router.get("/settings/notifications")
async def get_notification_settings(current_user: dict = Depends(get_current_user)):
    """Get notification service status"""
    return {
        "email_enabled": bool(os.environ.get('RESEND_API_KEY')),
        "sms_enabled": bool(os.environ.get('TWILIO_ACCOUNT_SID') and os.environ.get('TWILIO_AUTH_TOKEN')),
        "notifications_available": NOTIFICATIONS_ENABLED
    }

@api_router.get("/settings/rules")
async def get_business_rules(current_user: dict = Depends(get_current_user)):
    require_admin(current_user)
    rules = await get_or_seed_business_rules()
    return rules

@api_router.put("/settings/rules")
async def update_business_rules(data: RulesUpdateRequest, current_user: dict = Depends(get_current_user)):
    require_admin(current_user)
    rules = data.rules or {}
    now = datetime.now(timezone.utc).isoformat()
    rules["updated_at"] = now
    rules.setdefault("id", "order_rules_v1")
    await db.reglas_negocio.update_one({"id": rules["id"]}, {"$set": rules}, upsert=True)
    await create_audit_log("RULES_UPDATED", "reglas_negocio", rules["id"], current_user["id"])
    return rules

@api_router.post("/test/email")
async def test_email_notification(
    to_email: EmailStr,
    current_user: dict = Depends(get_current_user)
):
    """Test email notification"""
    if not NOTIFICATIONS_ENABLED:
        raise HTTPException(status_code=400, detail="Notifications not configured")
    
    result = await send_email(
        to_email,
        "Test - Ventura Fresh Laundry CRM",
        "<h1>Test Email</h1><p>Este es un correo de prueba del CRM.</p>"
    )
    return result

@api_router.post("/test/sms")
async def test_sms_notification(
    to_phone: str,
    current_user: dict = Depends(get_current_user)
):
    """Test SMS notification"""
    if not NOTIFICATIONS_ENABLED:
        raise HTTPException(status_code=400, detail="Notifications not configured")
    
    result = await send_sms(to_phone, "Test: Este es un mensaje de prueba del CRM de Ventura Fresh Laundry.")
    return result

# ==================== CUSTOMER AUTHENTICATION ====================

class CustomerRegister(BaseModel):
    name: str
    email: EmailStr
    password: str

class CustomerLogin(BaseModel):
    email: EmailStr
    password: str

class CustomerAuthResponse(BaseModel):
    access_token: str
    token_type: str
    customer: dict

def create_customer_token(customer_id: str, email: str) -> str:
    payload = {
        "sub": customer_id,
        "email": email,
        "type": "customer",
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRATION_HOURS * 7)  # 7 days for customers
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

async def get_current_customer(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        customer_id = payload.get("sub")
        token_type = payload.get("type")
        if not customer_id or token_type != "customer":
            raise HTTPException(status_code=401, detail="Invalid token")
        customer = await db.customers.find_one({"id": customer_id}, {"_id": 0})
        if not customer:
            raise HTTPException(status_code=401, detail="Customer not found")
        return customer
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

@api_router.post("/customer/auth/register", response_model=CustomerAuthResponse)
async def customer_register(data: CustomerRegister):
    """Register a new customer account"""
    existing = await db.customers.find_one({"email": data.email.lower()})
    
    if existing:
        # Check if customer already has a password (already registered)
        if existing.get("password_hash"):
            raise HTTPException(status_code=400, detail="Email already registered. Please login.")
        
        # Customer exists from a pickup request but hasn't registered - update with password
        await db.customers.update_one(
            {"email": data.email.lower()},
            {"$set": {
                "password_hash": hash_password(data.password),
                "name": data.name,
                "updated_at": datetime.now(timezone.utc).isoformat()
            }}
        )
        customer = await db.customers.find_one({"email": data.email.lower()}, {"_id": 0, "password_hash": 0})
    else:
        # Create new customer
        customer_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()
        customer = {
            "id": customer_id,
            "name": data.name,
            "email": data.email.lower(),
            "phone": None,
            "address": None,
            "preferred_contact": "email",
            "notes": None,
            "status": "active",
            "total_orders": 0,
            "password_hash": hash_password(data.password),
            "created_at": now,
            "updated_at": now
        }
        await db.customers.insert_one(customer)
        await create_audit_log("CUSTOMER_REGISTERED", "customer", customer_id, None, {"source": "portal"})
        customer = {k: v for k, v in customer.items() if k not in ["password_hash", "_id"]}
    
    token = create_customer_token(customer["id"], customer["email"])
    return CustomerAuthResponse(
        access_token=token,
        token_type="bearer",
        customer=customer
    )

@api_router.post("/customer/auth/login", response_model=CustomerAuthResponse)
async def customer_login(data: CustomerLogin):
    """Customer login"""
    customer = await db.customers.find_one({"email": data.email.lower()})
    if not customer:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    
    if not customer.get("password_hash"):
        raise HTTPException(status_code=401, detail="Please register an account first")
    
    if not verify_password(data.password, customer["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    
    customer_data = {k: v for k, v in customer.items() if k not in ["_id", "password_hash"]}
    token = create_customer_token(customer["id"], customer["email"])
    
    return CustomerAuthResponse(
        access_token=token,
        token_type="bearer",
        customer=customer_data
    )

@api_router.get("/customer/me")
async def get_customer_profile(current_customer: dict = Depends(get_current_customer)):
    """Get current customer profile"""
    return current_customer

@api_router.get("/customer/orders")
async def get_customer_orders(current_customer: dict = Depends(get_current_customer)):
    """Get orders for the logged-in customer"""
    orders = await db.orders.find(
        {"customer_id": current_customer["id"]}, 
        {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    return orders

# ==================== USER MANAGEMENT (ADMIN ONLY) ====================

class UserUpdateRole(BaseModel):
    role: str

class UserCreateAdmin(BaseModel):
    email: EmailStr
    password: str
    name: str
    role: str = ROLE_OPERATOR

@api_router.get("/admin/users")
async def list_users(current_user: dict = Depends(get_current_user)):
    """List all users (admin only)"""
    require_admin(current_user)
    users = await db.users.find({}, {"_id": 0, "password_hash": 0}).sort("created_at", -1).to_list(100)
    return users

@api_router.post("/admin/users", response_model=UserResponse)
async def create_user_admin(user_data: UserCreateAdmin, current_user: dict = Depends(get_current_user)):
    """Create a new user with specified role (admin only)"""
    require_admin(current_user)
    
    if user_data.role not in VALID_ROLES:
        raise HTTPException(status_code=400, detail=f"Invalid role. Must be one of: {VALID_ROLES}")
    
    existing = await db.users.find_one({"email": user_data.email.lower()})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    user_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    user = {
        "id": user_id,
        "email": user_data.email.lower(),
        "password_hash": hash_password(user_data.password),
        "name": user_data.name,
        "role": user_data.role,
        "created_at": now
    }
    await db.users.insert_one(user)
    await create_audit_log("USER_CREATED_BY_ADMIN", "user", user_id, current_user["id"], {"role": user_data.role})
    
    return UserResponse(id=user_id, email=user["email"], name=user["name"], role=user["role"], created_at=now)

@api_router.put("/admin/users/{user_id}/role")
async def update_user_role(user_id: str, data: UserUpdateRole, current_user: dict = Depends(get_current_user)):
    """Update user role (admin only)"""
    require_admin(current_user)
    
    if data.role not in VALID_ROLES:
        raise HTTPException(status_code=400, detail=f"Invalid role. Must be one of: {VALID_ROLES}")
    
    # Prevent admin from demoting themselves
    if user_id == current_user["id"] and data.role != ROLE_ADMIN:
        raise HTTPException(status_code=400, detail="Cannot change your own role")
    
    result = await db.users.update_one(
        {"id": user_id},
        {"$set": {"role": data.role}}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    
    await create_audit_log("USER_ROLE_UPDATED", "user", user_id, current_user["id"], {"new_role": data.role})
    return {"message": f"User role updated to {data.role}"}

@api_router.delete("/admin/users/{user_id}")
async def delete_user(user_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a user (admin only)"""
    require_admin(current_user)
    
    # Prevent admin from deleting themselves
    if user_id == current_user["id"]:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")
    
    result = await db.users.delete_one({"id": user_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    
    await create_audit_log("USER_DELETED", "user", user_id, current_user["id"])
    return {"message": "User deleted"}

@api_router.get("/admin/roles")
async def get_roles(current_user: dict = Depends(get_current_user)):
    """Get available roles and their permissions"""
    require_admin(current_user)
    return {
        "roles": VALID_ROLES,
        "permissions": ROLE_PERMISSIONS
    }

# ==================== OPERATOR-ONLY ENDPOINTS ====================

@api_router.get("/operator/orders")
async def operator_get_orders(
    status: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get orders for operator (limited view - no financial data)"""
    if not has_permission(current_user, "orders:read"):
        raise HTTPException(status_code=403, detail="Permission denied")
    
    query = {}
    if status:
        query["status"] = status
    
    orders = await db.orders.find(query, {
        "_id": 0,
        "total_amount": 0,  # Hide financial data from operators
        "payment_status": 0
    }).sort("created_at", -1).to_list(500)
    return orders

@api_router.patch("/operator/orders/{order_id}/status")
async def operator_update_order_status(
    order_id: str, 
    status: str, 
    current_user: dict = Depends(get_current_user)
):
    """Update order status (operator allowed)"""
    if not has_permission(current_user, "orders:update_status"):
        raise HTTPException(status_code=403, detail="Permission denied")
    
    valid_statuses = ["new", "processing", "ready", "out_for_delivery", "delivered", "completed", "cancelled"]
    if status not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {valid_statuses}")
    
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    now = datetime.now(timezone.utc).isoformat()
    result = await db.orders.update_one(
        {"id": order_id},
        {
            "$set": {
                "status": status,
                "estado_actual": status,
                "updated_at": now,
                "tiempos.ultimo_cambio_estado": now,
                f"tiempos.fechas_estado.{status}": now
            }
        }
    )
    
    await create_audit_log("ORDER_STATUS_CHANGED_BY_OPERATOR", "order", order_id, current_user["id"], {"new_status": status})
    
    # Send notifications if enabled
    if NOTIFICATIONS_ENABLED and not SKIP_SERVER_NOTIFICATIONS and order.get("customer_id"):
        customer = await db.customers.find_one({"id": order["customer_id"]}, {"_id": 0})
        if customer and should_notify_order_status(order, status):
            order["status"] = status
            try:
                await notify_order_status_changed(customer, order, status)
            except Exception as e:
                logger.error(f"Notification failed: {e}")
    
    return {"message": f"Order status updated to {status}"}

# Include router and middleware
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include n8n router
if N8N_ENABLED and n8n_router:
    app.include_router(n8n_router, prefix="/api")
    logger.info("n8n integration endpoints enabled at /api/n8n/*")

# Include store router
if STORE_ENABLED and store_router:
    app.include_router(store_router, prefix="/api")
    logger.info("Store endpoints enabled at /api/store/*")

# Include blog router
if BLOG_ENABLED and blog_router:
    app.include_router(blog_router, prefix="/api")
    logger.info("Blog endpoints enabled at /api/blog/*")

# Include automation engine router
if AUTOMATION_ENABLED and automation_router:
    app.include_router(automation_router, prefix="/api")
    logger.info("Automation engine enabled at /api/automation/*")

# Stripe webhook endpoint
@app.post("/api/webhook/stripe")
async def stripe_webhook(request: Request):
    """Handle Stripe webhook events"""
    if STORE_ENABLED:
        return await handle_stripe_webhook(request)
    raise HTTPException(status_code=503, detail="Store module not available")

# ==================== STATIC WEBSITE ROUTES ====================
# Serve the HTML website files

WEB_DIR = ROOT_DIR / "paginaweb"

# Mount static files directories for each page's assets
if WEB_DIR.exists():
    for folder in WEB_DIR.iterdir():
        if folder.is_dir() and (folder.name.endswith('_files') or folder.name.endswith('_resources')):
            app.mount(f"/web/{folder.name}", StaticFiles(directory=folder), name=folder.name)

@app.get("/web/crm-integration.js")
async def serve_crm_js():
    """Serve the CRM integration JavaScript"""
    js_file = WEB_DIR / "crm-integration.js"
    if js_file.exists():
        return FileResponse(js_file, media_type="application/javascript")
    raise HTTPException(status_code=404, detail="File not found")

@app.get("/web/", response_class=HTMLResponse)
@app.get("/web", response_class=HTMLResponse)
async def serve_home():
    """Serve the main landing page"""
    html_file = WEB_DIR / "index.html"
    if html_file.exists():
        return HTMLResponse(content=html_file.read_text(encoding='utf-8'))
    raise HTTPException(status_code=404, detail="Page not found")

@app.get("/web/about", response_class=HTMLResponse)
async def serve_about():
    """Serve the about page"""
    html_file = WEB_DIR / "about.html"
    if html_file.exists():
        return HTMLResponse(content=html_file.read_text(encoding='utf-8'))
    raise HTTPException(status_code=404, detail="Page not found")

@app.get("/web/contact", response_class=HTMLResponse)
async def serve_contact():
    """Serve the contact page"""
    html_file = WEB_DIR / "contact.html"
    if html_file.exists():
        return HTMLResponse(content=html_file.read_text(encoding='utf-8'))
    raise HTTPException(status_code=404, detail="Page not found")

@app.get("/web/services", response_class=HTMLResponse)
async def serve_services():
    """Serve the services page"""
    html_file = WEB_DIR / "services.html"
    if html_file.exists():
        return HTMLResponse(content=html_file.read_text(encoding='utf-8'))
    raise HTTPException(status_code=404, detail="Page not found")

@app.get("/web/blog", response_class=HTMLResponse)
async def serve_blog():
    """Serve the blog page"""
    html_file = WEB_DIR / "blog.html"
    if html_file.exists():
        return HTMLResponse(content=html_file.read_text(encoding='utf-8'))
    raise HTTPException(status_code=404, detail="Page not found")

@app.get("/web/store", response_class=HTMLResponse)
async def serve_store():
    """Serve the store page"""
    html_file = WEB_DIR / "store.html"
    if html_file.exists():
        return HTMLResponse(content=html_file.read_text(encoding='utf-8'))
    raise HTTPException(status_code=404, detail="Page not found")

@app.get("/web/schedule", response_class=HTMLResponse)
async def serve_schedule():
    """Serve the schedule pickup page"""
    html_file = WEB_DIR / "schedule.html"
    if html_file.exists():
        return HTMLResponse(content=html_file.read_text(encoding='utf-8'))
    raise HTTPException(status_code=404, detail="Page not found")

@app.get("/web/account", response_class=HTMLResponse)
async def serve_account():
    """Serve the account page"""
    html_file = WEB_DIR / "account.html"
    if html_file.exists():
        return HTMLResponse(content=html_file.read_text(encoding='utf-8'))
    raise HTTPException(status_code=404, detail="Page not found")

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
