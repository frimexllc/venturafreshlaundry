"""Pydantic models and role constants shared across the backend."""
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Dict, Any


# Role-based access control constants
ROLE_ADMIN = "admin"
ROLE_OPERATOR = "operator"
ROLE_DRIVER = "driver"
VALID_ROLES = [ROLE_ADMIN, ROLE_OPERATOR, ROLE_DRIVER]

ROLE_PERMISSIONS = {
    ROLE_ADMIN: ["all"],
    ROLE_OPERATOR: [
        "orders:read", "orders:update_status",
        "customers:read",
        "services:read",
        "operator_dashboard"
    ],
    ROLE_DRIVER: [
        "orders:read",
        "orders:update_status_driver",
    ]
}


class UserCreate(BaseModel):
    email: EmailStr
    password: str
    name: str
    role: Optional[str] = "operator"


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
    service_type: str
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
    preferred_contact: Optional[str] = None
    gate_code: Optional[str] = None
    preferences_id: Optional[str] = None
    preferences_snapshot: Optional[dict] = None
    status: str = "new"
    payment_status: Optional[str] = "pending"
    payment_method: Optional[str] = None
    amount_paid: Optional[float] = None
    change_due: Optional[float] = None
    paid_at: Optional[str] = None
    total_amount: Optional[float] = None
    created_at: Optional[str] = ""
    updated_at: Optional[str] = ""


class OrderPaymentUpdate(BaseModel):
    payment_method: str
    amount_received: Optional[float] = None


class OrderStripeCheckoutRequest(BaseModel):
    origin_url: str


class OrderStripeCheckoutResponse(BaseModel):
    session_id: str
    url: str
    amount: float
    currency: str


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
    preferences: Optional[dict] = None
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
    session_id: Optional[str] = None
    confirm_token: Optional[str] = None
    context: Optional[dict] = None


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
