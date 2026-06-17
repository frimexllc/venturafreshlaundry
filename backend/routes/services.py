"""
Services & Memberships Management API - Complete Implementation
===============================================================
Combines:
1. ServicesPageConfig - Dynamic pricing configuration for public ServicesPage
2. Services & Memberships - Complete membership management with admin controls

Endpoints:
- ServicesPageConfig: GET/PUT public/admin config, section updates, reset
- Services & Memberships: Full CRUD, membership plans, admin controls, Stripe integration
"""

from fastapi import APIRouter, HTTPException, Depends, Query
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone, timedelta
from pydantic import BaseModel, Field
import uuid
import logging
import os

from database import db
from models import (
    ServiceCreate, ServiceResponse,
    MembershipSectionUpdate, MembershipSectionResponse,
    MembershipPlanCreate, MembershipPlanResponse,
    MembershipSignupResponse, MembershipSignupUpdate,
    MembershipCustomerUpdate, CustomerResponse,
    PreferenceCreate,
)
from auth import get_current_user, require_admin, require_role, get_current_customer
from utils import (
    create_audit_log,
    calculate_final_amount_with_membership,
    should_skip_payment_notification,
    get_remaining_membership_allowance,
    is_active_member,
    normalize_spaces,
    get_customer_cycle_usage,
    _get_plan_allowance,
    normalize_preference_payload,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Services & Memberships"])

# Try to import Stripe
try:
    import stripe
    STRIPE_AVAILABLE = True
    STRIPE_API_KEY = os.environ.get("STRIPE_API_KEY", "")
    if STRIPE_API_KEY:
        stripe.api_key = STRIPE_API_KEY
except ImportError:
    STRIPE_AVAILABLE = False
    logger.warning("Stripe not available for membership payments")

# Stripe fee configuration
STRIPE_FEE_PERCENTAGE = 0.03  # 3% Stripe fee

# ============================================================
# SERVICES PAGE CONFIG MODELS
# ============================================================

class PriceTier(BaseModel):
    """A single plan tier with regular and member prices."""
    name: str
    name_es: Optional[str] = None
    regular: float
    member: Optional[float] = None
    badge: Optional[str] = None
    is_popular: bool = False
    turnaround: Optional[str] = None
    turnaround_es: Optional[str] = None
    best_for: Optional[str] = None
    best_for_es: Optional[str] = None


class DeliveryFeeTier(BaseModel):
    max_miles: float
    fee: float
    label: Optional[str] = None


class WasherPrice(BaseModel):
    size: str
    size_es: Optional[str] = None
    price: str


class DryerPrice(BaseModel):
    size: str
    time: str
    price: str


class PerPieceItem(BaseModel):
    name: str
    name_es: Optional[str] = None
    price: str


class PerPieceCategory(BaseModel):
    category: str
    category_es: Optional[str] = None
    items: List[PerPieceItem]


class ExpressChip(BaseModel):
    label: str
    label_es: Optional[str] = None
    price: str


class DarkSection(BaseModel):
    heading: str
    heading_es: Optional[str] = None
    subheading: str
    subheading_es: Optional[str] = None
    features: List[str] = []
    features_es: List[str] = []
    cta_label: str
    cta_label_es: Optional[str] = None
    cta_url: str
    bg_image_url: Optional[str] = None
    tint: Optional[str] = "rgba(3, 15, 40, 0.68)"


class ServicesPageConfigIn(BaseModel):
    pd_tiers: List[PriceTier] = []
    pd_notes: List[str] = []
    pd_notes_es: List[str] = []
    wf_tiers: List[PriceTier] = []
    wf_notes: List[str] = []
    wf_notes_es: List[str] = []
    express_chips: List[ExpressChip] = []
    express_features: List[str] = []
    express_features_es: List[str] = []
    delivery_fee_tiers: List[DeliveryFeeTier] = []
    washers: List[WasherPrice] = []
    dryers: List[DryerPrice] = []
    self_service_hours_open: Optional[str] = None
    self_service_hours_close: Optional[str] = None
    per_piece_categories: List[PerPieceCategory] = []
    airbnb_section: Optional[DarkSection] = None
    b2b_section: Optional[DarkSection] = None
    commercial_section: Optional[DarkSection] = None
    pd_minimum_charge: float = 40.00
    wf_minimum_lbs: float = 10.0
    updated_by: Optional[str] = None
    notes: Optional[str] = None


class SectionPatchIn(BaseModel):
    section: str = Field(..., description="Section name to update")
    data: Any


# ============================================================
# MEMBERSHIP CONTROL MODELS
# ============================================================

class MembershipLbsAdjustment(BaseModel):
    lbs_to_add: float = Field(..., description="Lbs to add (negative to subtract)")
    reason: str = Field(..., description="Adjustment reason")
    notes: Optional[str] = None


class MembershipStatusUpdate(BaseModel):
    status: str = Field(..., description="active, paused, cancelled")
    reason: Optional[str] = None


class MembershipManualOverride(BaseModel):
    lbs_allowance: Optional[int] = None
    reset_cycle: bool = False
    reason: str = Field(..., description="Override reason")


class MembershipRenewalRequest(BaseModel):
    plan_id: Optional[str] = None


# ============================================================
# SERVICES PAGE CONFIG - DEFAULT CONFIG
# ============================================================

def _default_services_config() -> dict:
    return {
        "id": "default",
        "pd_tiers": [
            {"name": "Standard", "name_es": "Estándar", "regular": 2.75, "member": 2.50,
             "badge": "standard", "is_popular": False, "turnaround": "36 h", "turnaround_es": "36 h"},
            {"name": "Premium",  "name_es": "Premium",  "regular": 3.00, "member": 2.75,
             "badge": "premium",  "is_popular": True,  "turnaround": "24 h", "turnaround_es": "24 h"},
            {"name": "Express",  "name_es": "Express",  "regular": 3.25, "member": 3.00,
             "badge": "express",  "is_popular": False, "turnaround": "Same day", "turnaround_es": "Mismo día"},
        ],
        "pd_notes": [
            "✅ FREE delivery (0–3 miles)",
            "🚗 3–15 Miles | $1.99–$8.99",
            "📦 Min. order $40",
        ],
        "pd_notes_es": [
            "✅ Entrega GRATIS (0–3 millas)",
            "🚗 3–15 Millas | $1.99–$8.99",
            "📦 Pedido mínimo $40",
        ],
        "wf_tiers": [
            {"name": "Standard", "name_es": "Estándar", "regular": 2.25,
             "badge": "standard", "is_popular": False, "turnaround": "24–36 h",
             "best_for": "Budget-friendly", "best_for_es": "Económico"},
            {"name": "Premium",  "name_es": "Premium",  "regular": 2.50,
             "badge": "premium",  "is_popular": True,  "turnaround": "12–24 h",
             "best_for": "Most popular", "best_for_es": "Más popular"},
            {"name": "Express",  "name_es": "Express",  "regular": 2.75,
             "badge": "express",  "is_popular": False, "turnaround": "Same day",
             "turnaround_es": "Mismo día",
             "best_for": "Urgent orders", "best_for_es": "Urgentes"},
        ],
        "wf_notes": [
            "Professional care · Minimum 10 lb per order",
            "Monday – Sunday · 8:00 AM – 6:00 PM",
        ],
        "wf_notes_es": [
            "Cuidado profesional · Mínimo 10 lb por orden",
            "Lunes – Domingo · 8:00 AM – 6:00 PM",
        ],
        "express_chips": [
            {"label": "In-Store",      "label_es": "En Tienda",      "price": "$2.75/lb"},
            {"label": "Members P&D",   "label_es": "Miembros R&E",   "price": "$3.00/lb"},
            {"label": "Regular P&D",   "label_es": "Regular R&E",    "price": "$3.25/lb"},
        ],
        "express_features": [
            "Priority processing",
            "Fast turnaround",
            "Limited capacity",
        ],
        "express_features_es": [
            "Procesamiento prioritario",
            "Respuesta rápida",
            "Capacidad limitada",
        ],
        "delivery_fee_tiers": [
            {"max_miles": 3,  "fee": 0.00, "label": "FREE"},
            {"max_miles": 5,  "fee": 1.99},
            {"max_miles": 8,  "fee": 2.99},
            {"max_miles": 12, "fee": 4.99},
            {"max_miles": 15, "fee": 8.99},
        ],
        "washers": [
            {"size": "20 lb (2 loads)", "size_es": "20 lb (2 cargas)", "price": "$3.25"},
            {"size": "30 lb (3 loads)", "size_es": "30 lb (3 cargas)", "price": "$4.50"},
            {"size": "50 lb (4 loads)", "size_es": "50 lb (4 cargas)", "price": "$6.00"},
            {"size": "60 lb (6 loads)", "size_es": "60 lb (6 cargas)", "price": "$7.50"},
            {"size": "90 lb (9 loads)", "size_es": "90 lb (9 cargas)", "price": "$9.00"},
        ],
        "dryers": [
            {"size": "30 lb", "time": "10min", "price": "$0.50"},
            {"size": "50 lb", "time": "8min",  "price": "$0.50"},
        ],
        "self_service_hours_open":  "6:00 AM",
        "self_service_hours_close": "10:00 PM",
        "per_piece_categories": [
            {
                "category": "Home Essentials", "category_es": "Artículos del hogar",
                "items": [
                    {"name": "Bath Mat",              "name_es": "Tapete de baño",          "price": "$8.00"},
                    {"name": "Heavy Rubber Bath Mat",  "name_es": "Tapete de goma pesado",   "price": "$13.00"},
                    {"name": "Oven Mitt",              "name_es": "Cojín para horno",         "price": "$8.00"},
                    {"name": "Pet Bed (Small)",        "name_es": "Cama mascotas (S)",        "price": "$15.00"},
                    {"name": "Pet Bed (M/L)",          "name_es": "Cama mascotas (M/L)",      "price": "$18.00"},
                ],
            },
            {
                "category": "Bedding", "category_es": "Ropa de cama",
                "items": [
                    {"name": "Standard Pillow",  "name_es": "Almohada estándar",    "price": "$10.00"},
                    {"name": "Large Pillow",     "name_es": "Almohada grande",       "price": "$15.00"},
                    {"name": "Duvet Cover",      "name_es": "Funda de edredón",      "price": "$15.00"},
                    {"name": "Blanket (Small)",  "name_es": "Manta (pequeña)",       "price": "$15.00"},
                    {"name": "Blanket (Large)",  "name_es": "Manta (grande/pesada)", "price": "$25.00"},
                ],
            },
            {
                "category": "Comforters", "category_es": "Edredones",
                "items": [
                    {"name": "Comforter Twin/Full", "name_es": "Edredón Twin/Full",       "price": "$22.00"},
                    {"name": "Comforter Queen",     "name_es": "Edredón Queen",            "price": "$25.00"},
                    {"name": "Comforter King",      "name_es": "Edredón King",             "price": "$30.00"},
                    {"name": "Mattress Cover",      "name_es": "Cubrecama",                "price": "$25.00"},
                    {"name": "Down Comforter",      "name_es": "Edredón de plumas",        "price": "$40.00"},
                ],
            },
            {
                "category": "Add-on Services", "category_es": "Servicios adicionales",
                "items": [
                    {"name": "Same Day Service",        "name_es": "Servicio mismo día",            "price": "$10.00"},
                    {"name": "Express Service",         "name_es": "Servicio Express",              "price": "$15.00"},
                    {"name": "Hypoallergenic Detergent","name_es": "Detergente hipoalergénico",     "price": "$5.00"},
                    {"name": "Premium Softener",        "name_es": "Suavizante premium",            "price": "$4.00"},
                    {"name": "Pet Hair Removal",        "name_es": "Eliminación pelo mascotas",     "price": "$10.00"},
                    {"name": "Heavy Soil Treatment",    "name_es": "Tratamiento suciedad intensa",  "price": "$15.00"},
                    {"name": "Oversized Item Fee",      "name_es": "Cargo artículo grande",         "price": "$10.00"},
                ],
            },
        ],
        "airbnb_section": {
            "heading": "Premium Laundry for Airbnb Hosts.",
            "heading_es": "Lavandería Premium para Anfitriones Airbnb.",
            "subheading": "Spotless linens. Five-star guest experiences. Zero hassle.",
            "subheading_es": "Ropa de cama impecable. Experiencias de cinco estrellas. Cero complicaciones.",
            "features": [
                "Customized programs for Airbnb hosts",
                "Professional cleaning & sanitization",
                "Scheduled pickup aligned with turnover",
                "Consistent quality for 5-star reviews",
                "Save time, eliminate laundry stress",
            ],
            "features_es": [
                "Programas personalizados para anfitriones",
                "Limpieza y sanitización profesional",
                "Recogida alineada con tu calendario",
                "Calidad constante para reseñas de 5 estrellas",
                "Ahorra tiempo, elimina el estrés",
            ],
            "cta_label": "SCHEDULE PICK-UP",
            "cta_label_es": "PROGRAMAR RECOGIDA",
            "cta_url": "/schedule-pickup",
            "bg_image_url": "https://images.unsplash.com/photo-1561053720-76cd73ff22c3?q=80&w=1170&auto=format&fit=crop",
            "tint": "rgba(3, 15, 40, 0.68)",
        },
        "b2b_section": {
            "heading": "High-Performance B2B Laundry.",
            "heading_es": "Alto Rendimiento Lavandería B2B.",
            "subheading": "Reliable, scalable, professional — built to handle volume every day.",
            "subheading_es": "Confiable, escalable, profesional — para manejar volumen todos los días.",
            "features": [
                "Customized programs for all business sizes",
                "Commercial-grade washing & stain removal",
                "Scheduled pickup & delivery",
                "Flexible volume, no long-term commitments",
                "Priority support for business clients",
            ],
            "features_es": [
                "Programas para empresas de todos los tamaños",
                "Lavado comercial y eliminación de manchas",
                "Recogida y entrega programadas",
                "Volumen flexible, sin compromisos a largo plazo",
                "Soporte prioritario para clientes empresariales",
            ],
            "cta_label": "REQUEST A QUOTE",
            "cta_label_es": "SOLICITAR COTIZACIÓN",
            "cta_url": "/request-quote",
            "bg_image_url": "https://images.unsplash.com/photo-1545173168-9f1947eebb7f?w=600&auto=format&fit=crop",
            "tint": "rgba(3, 15, 40, 0.68)",
        },
        "commercial_section": {
            "heading": "Commercial Laundry You Can Depend On.",
            "heading_es": "Lavandería Comercial en la que Puedes Confiar.",
            "subheading": "Volume, quality, reliability — every single day.",
            "subheading_es": "Volumen, calidad, confiabilidad — todos los días.",
            "features": [
                "Restaurants, hotels, spas, gyms, offices",
                "High-volume processing with commercial equipment",
                "Specialized care for uniforms and delicates",
                "Reliable pickup & delivery, strict quality control",
                "Flexible billing and service plans",
            ],
            "features_es": [
                "Restaurantes, hoteles, spas, gimnasios, oficinas",
                "Procesamiento de alto volumen con equipo comercial",
                "Cuidado especializado para uniformes y delicados",
                "Recogida confiable y control de calidad estricto",
                "Facturación y planes de servicio flexibles",
            ],
            "cta_label": "REQUEST A QUOTE",
            "cta_label_es": "SOLICITAR COTIZACIÓN",
            "cta_url": "/request-quote",
            "bg_image_url": "https://plus.unsplash.com/premium_photo-1664372899366-d5fb20b332d1?w=600&auto=format&fit=crop",
            "tint": "rgba(3, 17, 48, 0.74)",
        },
        "pd_minimum_charge": 40.00,
        "wf_minimum_lbs": 10.0,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "updated_by": None,
        "notes": None,
    }


# ============================================================
# MEMBERSHIP HELPER FUNCTIONS
# ============================================================

def _get_plan_price(plan_name: str) -> float:
    prices = {
        "most popular": 139.00,
        "popular": 139.00,
        "standard": 139.00,
        "family plus": 199.00,
        "family": 199.00,
        "elite concierge": 299.00,
        "elite": 299.00,
        "concierge": 299.00,
    }
    key = plan_name.lower()
    for k, v in prices.items():
        if k in key or key in k:
            return v
    return 139.00


def _get_plan_allowance_from_name(plan_name: str) -> int:
    allowances = {
        "most popular": 60,
        "popular": 60,
        "standard": 60,
        "family plus": 90,
        "family": 90,
        "elite concierge": 120,
        "elite": 120,
        "concierge": 120,
    }
    key = plan_name.lower()
    for k, v in allowances.items():
        if k in key or key in k:
            return v
    return 60


def _calculate_total_with_stripe_fee(amount: float) -> float:
    if amount <= 0:
        return 0.0
    return round(amount / (1 - STRIPE_FEE_PERCENTAGE), 2)


def _calculate_prorated_amount(old_plan: str, new_plan: str, days_remaining: int) -> float:
    old_price = _get_plan_price(old_plan)
    new_price = _get_plan_price(new_plan)
    
    if days_remaining <= 0:
        return new_price
    
    if new_price > old_price:
        difference = new_price - old_price
        prorated = difference * (days_remaining / 30)
        return round(prorated, 2)
    
    return 0.00


def _get_next_renewal_date(start_date: datetime) -> datetime:
    return start_date + timedelta(days=30)


def _default_membership_section() -> dict:
    now = datetime.now(timezone.utc).isoformat()
    return {
        "id": "default",
        "heading": "Flexible Plans for Every Home",
        "subheading": None,
        "special_title": "New Member Special",
        "special_text": "$10 OFF your first month on any membership. Ask when you call or text.",
        "cta_title": "Need help choosing?",
        "cta_text": "Just call, text, or email us at (820) 234-8181 and we'll recommend the perfect plan.",
        "cta_button_label": "BECOME A MEMBER",
        "cta_button_url": "/membership",
        "contact_phone": "(820) 234-8181",
        "is_active": True,
        "created_at": now,
        "updated_at": now,
    }


def _seed_membership_plans() -> list:
    now = datetime.now(timezone.utc).isoformat()
    return [
        {
            "id": str(uuid.uuid4()),
            "name": "MOST POPULAR",
            "price": "$139 / month",
            "image_url": "https://images.unsplash.com/photo-1462556791646-c201b8241a94?q=80&w=1165&auto=format&fit=crop",
            "features": ["Up to 60 lb/month", "Basic Preferences saved (folding notes)", "Best value for most families"],
            "is_popular": True,
            "is_active": True,
            "sort_order": 1,
            "created_at": now,
            "updated_at": now,
        },
        {
            "id": str(uuid.uuid4()),
            "name": "FAMILY PLUS",
            "price": "$199 / month",
            "image_url": "https://images.unsplash.com/photo-1462556791646-c201b8241a94?q=80&w=1165&auto=format&fit=crop",
            "features": ["Up to 90 lb/month", "Priority scheduling", "Great for larger households or rentals"],
            "is_popular": False,
            "is_active": True,
            "sort_order": 2,
            "created_at": now,
            "updated_at": now,
        },
        {
            "id": str(uuid.uuid4()),
            "name": "ELITE CONCIERGE",
            "price": "$299 / month",
            "image_url": "https://images.squarespace-cdn.com/content/v1/696c559a4b2b9b1b0febf8d7/13a4c501-7792-4f72-bf5c-072f95b5f995/ELITE+CONCIERGE.png",
            "features": ["Up to 120 lb/month", "Priority turnaround (when possible)", "Premium packaging", "Saved preferences", "1 emergency pickup included"],
            "is_popular": False,
            "is_active": True,
            "sort_order": 3,
            "created_at": now,
            "updated_at": now,
        },
    ]


async def _get_or_create_services_config() -> dict:
    cfg = await db.services_page_config.find_one({"id": "default"}, {"_id": 0})
    if not cfg:
        cfg = _default_services_config()
        await db.services_page_config.insert_one({**cfg})
    return cfg


async def _send_membership_renewal_email(customer: dict, plan_name: str, amount: float, 
                                          is_plan_change: bool = False,
                                          subtotal: float = 0, stripe_fee: float = 0):
    try:
        from notifications import send_email
        frontend_url = os.environ.get("FRONTEND_URL", "")
        subject = f"{'Plan Change' if is_plan_change else 'Membership Renewal'} Confirmation"
        
        if amount > 0:
            fee_info = f"\nStripe processing fee: ${stripe_fee:.2f}" if stripe_fee > 0 else ""
            amount_details = f"Plan price: ${subtotal:.2f}{fee_info}\nTotal charged: ${amount:.2f}"
        else:
            amount_details = "Amount charged: $0.00"
        
        body = f"""
        Hi {customer.get('name')},\n\n
        {'Your membership plan has been changed to' if is_plan_change else 'Your membership has been renewed successfully'} {plan_name}.\n
        {amount_details}\n\n
        Your new cycle starts today and will renew monthly.\n\n
        Log in to manage your membership: {frontend_url}/account\n\n
        Thank you for being a member!\n
        Ventura Fresh Laundry
        """
        await send_email(customer.get("email"), subject, body)
    except Exception as e:
        logger.warning(f"Failed to send renewal email: {e}")


# ============================================================
# SERVICES PAGE CONFIG - PUBLIC ENDPOINTS
# ============================================================

@router.get("/api/public/services-page-config")
async def get_public_services_page_config():
    cfg = await _get_or_create_services_config()
    cfg.pop("_id", None)
    return cfg


# ============================================================
# SERVICES PAGE CONFIG - ADMIN ENDPOINTS
# ============================================================

@router.get("/api/admin/services-page-config")
async def get_admin_services_page_config(current_user: dict = Depends(get_current_user)):
    require_admin(current_user)
    cfg = await _get_or_create_services_config()
    cfg.pop("_id", None)
    return cfg


@router.put("/api/admin/services-page-config")
async def update_services_page_config(
    data: ServicesPageConfigIn,
    current_user: dict = Depends(get_current_user),
):
    require_admin(current_user)
    now = datetime.now(timezone.utc).isoformat()
    update_data = data.model_dump(exclude_unset=False)
    update_data["updated_at"] = now
    update_data["updated_by"] = current_user.get("id")

    await db.services_page_config.update_one(
        {"id": "default"},
        {"$set": update_data, "$setOnInsert": {"id": "default", "created_at": now}},
        upsert=True,
    )

    cfg = await db.services_page_config.find_one({"id": "default"}, {"_id": 0})
    logger.info(f"ServicesPageConfig updated by {current_user.get('email')} at {now}")
    return {"ok": True, "updated_at": now, "config": cfg}


ALLOWED_SECTIONS = {
    "pd_tiers", "pd_notes", "pd_notes_es",
    "wf_tiers", "wf_notes", "wf_notes_es",
    "express_chips", "express_features", "express_features_es",
    "delivery_fee_tiers",
    "washers", "dryers",
    "self_service_hours_open", "self_service_hours_close",
    "per_piece_categories",
    "airbnb_section", "b2b_section", "commercial_section",
    "pd_minimum_charge", "wf_minimum_lbs",
    "notes",
}


@router.put("/api/admin/services-page-config/section")
async def update_services_page_config_section(
    data: SectionPatchIn,
    current_user: dict = Depends(get_current_user),
):
    require_admin(current_user)

    if data.section not in ALLOWED_SECTIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Section '{data.section}' is not editable. Allowed: {sorted(ALLOWED_SECTIONS)}",
        )

    now = datetime.now(timezone.utc).isoformat()
    update_payload = {
        data.section: data.data,
        "updated_at": now,
        "updated_by": current_user.get("id"),
    }

    await db.services_page_config.update_one(
        {"id": "default"},
        {"$set": update_payload, "$setOnInsert": {"id": "default", "created_at": now}},
        upsert=True,
    )

    cfg = await db.services_page_config.find_one({"id": "default"}, {"_id": 0})
    logger.info(f"ServicesPageConfig section '{data.section}' updated by {current_user.get('email')}")
    return {"ok": True, "section": data.section, "updated_at": now, "config": cfg}


@router.post("/api/admin/services-page-config/reset")
async def reset_services_page_config(current_user: dict = Depends(get_current_user)):
    require_admin(current_user)
    cfg = _default_services_config()
    cfg["updated_by"] = current_user.get("id")
    await db.services_page_config.replace_one({"id": "default"}, cfg, upsert=True)
    logger.info(f"ServicesPageConfig reset to defaults by {current_user.get('email')}")
    return {"ok": True, "message": "Config reset to factory defaults", "config": cfg}


# ============================================================
# SERVICES CRUD
# ============================================================

@router.post("/api/services", response_model=ServiceResponse)
async def create_service(data: ServiceCreate, current_user: dict = Depends(get_current_user)):
    require_admin(current_user)
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
        "updated_at": now,
    }
    await db.services.insert_one(service)
    await create_audit_log("SERVICE_CREATED", "service", service_id, current_user["id"])
    return ServiceResponse(**service)


@router.get("/api/services", response_model=List[ServiceResponse])
async def get_services(
    active_only: bool = True,
    search: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    query = {}
    if active_only:
        query["is_active"] = True
    if search:
        query["$or"] = [
            {"name": {"$regex": search, "$options": "i"}},
            {"category": {"$regex": search, "$options": "i"}},
        ]
    services = await db.services.find(query, {"_id": 0}).sort(
        [("sort_order", 1), ("created_at", -1)]
    ).to_list(1000)
    return [ServiceResponse(**s) for s in services]


@router.get("/api/services/{service_id}", response_model=ServiceResponse)
async def get_service(service_id: str, current_user: dict = Depends(get_current_user)):
    service = await db.services.find_one({"id": service_id}, {"_id": 0})
    if not service:
        raise HTTPException(status_code=404, detail="Service not found")
    return ServiceResponse(**service)


@router.put("/api/services/{service_id}", response_model=ServiceResponse)
async def update_service(
    service_id: str,
    data: ServiceCreate,
    current_user: dict = Depends(get_current_user),
):
    require_admin(current_user)
    update_data = data.model_dump(exclude_unset=True)
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    update_data["sort_order"] = update_data.get("sort_order", 0) or 0
    result = await db.services.update_one({"id": service_id}, {"$set": update_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Service not found")
    await create_audit_log("SERVICE_UPDATED", "service", service_id, current_user["id"])
    service = await db.services.find_one({"id": service_id}, {"_id": 0})
    return ServiceResponse(**service)


@router.delete("/api/services/{service_id}")
async def delete_service(
    service_id: str,
    current_user: dict = Depends(require_role(["admin", "operator"])),
):
    result = await db.services.delete_one({"id": service_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Service not found")
    await create_audit_log("SERVICE_DELETED", "service", service_id, current_user["id"])
    return {"message": "Service deleted"}


@router.get("/api/public/services", response_model=List[ServiceResponse])
async def get_public_services(active_only: bool = True):
    query = {}
    if active_only:
        query["is_active"] = True
    services = await db.services.find(query, {"_id": 0}).sort(
        [("sort_order", 1), ("created_at", -1)]
    ).to_list(1000)
    return [ServiceResponse(**s) for s in services]


# ============================================================
# MEMBERSHIP SECTION
# ============================================================

@router.get("/api/services/membership-section", response_model=MembershipSectionResponse)
async def get_membership_section(current_user: dict = Depends(get_current_user)):
    section = await db.membership_section.find_one({"id": "default"}, {"_id": 0})
    if not section:
        section = _default_membership_section()
        await db.membership_section.insert_one(section)
    return MembershipSectionResponse(**section)


@router.put("/api/services/membership-section", response_model=MembershipSectionResponse)
async def update_membership_section(
    data: MembershipSectionUpdate,
    current_user: dict = Depends(get_current_user),
):
    require_admin(current_user)
    now = datetime.now(timezone.utc).isoformat()
    update_data = data.model_dump(exclude_unset=True)
    update_data["updated_at"] = now
    await db.membership_section.update_one(
        {"id": "default"},
        {"$set": update_data, "$setOnInsert": {"id": "default", "created_at": now}},
        upsert=True,
    )
    section = await db.membership_section.find_one({"id": "default"}, {"_id": 0})
    await create_audit_log("MEMBERSHIP_SECTION_UPDATED", "membership_section", "default", current_user["id"])
    return MembershipSectionResponse(**section)


@router.post("/api/services/membership-plans", response_model=MembershipPlanResponse)
async def create_membership_plan(
    data: MembershipPlanCreate,
    current_user: dict = Depends(get_current_user),
):
    require_admin(current_user)
    plan_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    plan = {
        "id": plan_id,
        "name": data.name,
        "price": data.price,
        "image_url": data.image_url,
        "features": data.features,
        "lbs_allowance": getattr(data, 'lbs_allowance', 60),
        "is_popular": data.is_popular,
        "is_active": data.is_active,
        "sort_order": data.sort_order or 0,
        "created_at": now,
        "updated_at": now,
    }
    await db.membership_plans.insert_one(plan)
    await create_audit_log("MEMBERSHIP_PLAN_CREATED", "membership_plan", plan_id, current_user["id"])
    return MembershipPlanResponse(**plan)


@router.get("/api/services/membership-plans", response_model=List[MembershipPlanResponse])
async def get_membership_plans(
    active_only: bool = True,
    current_user: dict = Depends(get_current_user),
):
    query = {}
    if active_only:
        query["is_active"] = True
    plans = await db.membership_plans.find(query, {"_id": 0}).sort(
        [("sort_order", 1), ("created_at", -1)]
    ).to_list(200)
    if not plans:
        plans = _seed_membership_plans()
        await db.membership_plans.insert_many(plans)
    return [MembershipPlanResponse(**p) for p in plans]


@router.put("/api/services/membership-plans/{plan_id}", response_model=MembershipPlanResponse)
async def update_membership_plan(
    plan_id: str,
    data: MembershipPlanCreate,
    current_user: dict = Depends(get_current_user),
):
    require_admin(current_user)
    update_data = data.model_dump(exclude_unset=True)
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    update_data["sort_order"] = update_data.get("sort_order", 0) or 0
    result = await db.membership_plans.update_one({"id": plan_id}, {"$set": update_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Plan not found")
    await create_audit_log("MEMBERSHIP_PLAN_UPDATED", "membership_plan", plan_id, current_user["id"])
    plan = await db.membership_plans.find_one({"id": plan_id}, {"_id": 0})
    return MembershipPlanResponse(**plan)


@router.delete("/api/services/membership-plans/{plan_id}")
async def delete_membership_plan(
    plan_id: str,
    current_user: dict = Depends(get_current_user),
):
    require_admin(current_user)
    result = await db.membership_plans.delete_one({"id": plan_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Plan not found")
    await create_audit_log("MEMBERSHIP_PLAN_DELETED", "membership_plan", plan_id, current_user["id"])
    return {"message": "Plan deleted"}


# ============================================================
# MEMBERSHIPS ADMIN - SIGNUPS
# ============================================================

@router.get("/api/memberships/signups", response_model=List[MembershipSignupResponse])
async def get_membership_signups(
    status: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    require_admin(current_user)
    query = {}
    if status:
        query["status"] = status
    signups = await db.membership_signups.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    result = []
    for s in signups:
        try:
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
                "preferences": s.get("preferences"),
                "created_at": s.get("created_at", ""),
                "updated_at": s.get("updated_at", ""),
            }
            result.append(MembershipSignupResponse(**signup_data))
        except Exception as e:
            logger.error(f"Error processing signup {s.get('id')}: {e}")
            continue
    return result


@router.put("/api/memberships/signups/{signup_id}", response_model=MembershipSignupResponse)
async def update_membership_signup(
    signup_id: str,
    data: MembershipSignupUpdate,
    current_user: dict = Depends(get_current_user),
):
    require_admin(current_user)
    update_data = data.model_dump(exclude_unset=True)
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    result = await db.membership_signups.update_one({"id": signup_id}, {"$set": update_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Signup not found")
    await create_audit_log("MEMBERSHIP_SIGNUP_UPDATED", "membership_signup", signup_id, current_user["id"])
    signup = await db.membership_signups.find_one({"id": signup_id}, {"_id": 0})
    return MembershipSignupResponse(**signup)


@router.post("/api/memberships/signups/{signup_id}/convert", response_model=CustomerResponse)
async def convert_membership_signup(
    signup_id: str,
    current_user: dict = Depends(get_current_user),
):
    require_admin(current_user)
    signup = await db.membership_signups.find_one({"id": signup_id}, {"_id": 0})
    if not signup:
        raise HTTPException(status_code=404, detail="Signup not found")

    now = datetime.now(timezone.utc).isoformat()
    membership_start = signup.get("created_at") or now

    customer = await db.customers.find_one({"email": signup["email"]}, {"_id": 0})
    if customer:
        update_data = {
            "membership_plan": signup["membership_plan"],
            "membership_status": "active",
            "membership_start_date": membership_start,
            "auto_renew": True,
            "updated_at": now,
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
            "address": f"{signup['address_line1']}, {signup['city']}, {signup['state']} {signup['zip_code']}",
            "preferred_contact": signup["contact_method"],
            "notes": None,
            "status": "active",
            "total_orders": 0,
            "membership_plan": signup["membership_plan"],
            "membership_status": "active",
            "membership_start_date": membership_start,
            "auto_renew": True,
            "created_at": now,
            "updated_at": now,
        }
        await db.customers.insert_one(customer)
        await create_audit_log("CUSTOMER_CREATED", "customer", customer_id, current_user["id"])

    preferences = signup.get("preferences")
    if preferences:
        existing_pref = await db.preferences.find(
            {"customer_id": customer["id"]}
        ).sort("version", -1).limit(1).to_list(1)
        version = (existing_pref[0]["version"] + 1) if existing_pref else 1
        pref_id = str(uuid.uuid4())
        normalized = normalize_preference_payload(
            PreferenceCreate(customer_id=customer["id"], **preferences)
        )
        pref_doc = {
            "id": pref_id,
            "customer_id": customer["id"],
            **normalized,
            "version": version,
            "created_at": now,
            "updated_at": now,
        }
        await db.preferences.insert_one(pref_doc)
        await db.customers.update_one(
            {"id": customer["id"]},
            {"$set": {"preferences_id": pref_id, "updated_at": now}},
        )

    await db.membership_signups.update_one(
        {"id": signup_id},
        {"$set": {"status": "converted", "customer_id": customer["id"], "updated_at": now}},
    )
    await create_audit_log(
        "MEMBERSHIP_SIGNUP_CONVERTED", "membership_signup", signup_id,
        current_user["id"], {"customer_id": customer["id"]},
    )
    return CustomerResponse(**customer)


# ============================================================
# MEMBERSHIP CUSTOMERS - ENHANCED WITH FULL CONTROL
# ============================================================

@router.get("/api/memberships/customers", response_model=List[CustomerResponse])
async def get_membership_customers(
    search: Optional[str] = None,
    status: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    require_admin(current_user)

    query: Dict[str, Any] = {
        "membership_plan": {"$ne": None},
        "id": {"$exists": True, "$ne": None},
    }
    
    if status and status != "all":
        query["membership_status"] = status
    else:
        query["membership_status"] = {"$in": ["active", "paused", "cancelled"]}
    
    if search:
        query["$or"] = [
            {"name": {"$regex": search, "$options": "i"}},
            {"email": {"$regex": search, "$options": "i"}},
            {"phone": {"$regex": search, "$options": "i"}},
        ]

    customers = await db.customers.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)

    result = []
    for c in customers:
        try:
            if "id" not in c:
                continue
            usage = await get_customer_cycle_usage(c["id"])
            c["cycle_usage"] = usage
            result.append(CustomerResponse(**c))
        except Exception as e:
            logger.error(f"Error processing customer {c.get('id', 'unknown')}: {e}")
            continue
    return result


@router.put("/api/memberships/customers/{customer_id}", response_model=CustomerResponse)
async def update_membership_customer(
    customer_id: str,
    data: MembershipCustomerUpdate,
    current_user: dict = Depends(get_current_user),
):
    require_admin(current_user)
    update_data = data.model_dump(exclude_unset=True)
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    if "membership_plan" in update_data and update_data["membership_plan"]:
        new_allowance = _get_plan_allowance_from_name(update_data["membership_plan"])
        update_data["custom_lbs_allowance"] = new_allowance
    
    result = await db.customers.update_one({"id": customer_id}, {"$set": update_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Customer not found")
    
    await create_audit_log(
        "CUSTOMER_MEMBERSHIP_UPDATED", "customer", customer_id, current_user["id"],
        {"changes": update_data}
    )
    
    customer = await db.customers.find_one({"id": customer_id}, {"_id": 0})
    return CustomerResponse(**customer)


# ============================================================
# MEMBERSHIP CONTROL ENDPOINTS
# ============================================================

@router.post("/api/memberships/customers/{customer_id}/adjust-lbs")
async def adjust_membership_lbs(
    customer_id: str,
    data: MembershipLbsAdjustment,
    current_user: dict = Depends(get_current_user),
):
    require_admin(current_user)
    
    customer = await db.customers.find_one({"id": customer_id}, {"_id": 0})
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    
    if not customer.get("membership_plan"):
        raise HTTPException(status_code=400, detail="Customer has no active membership plan")
    
    current_lbs_used = customer.get("cycle_lbs_used", 0)
    new_lbs_used = max(0, current_lbs_used + data.lbs_to_add)
    
    custom_allowance = customer.get("custom_lbs_allowance")
    if custom_allowance:
        lbs_allowance = custom_allowance
    else:
        lbs_allowance = _get_plan_allowance_from_name(customer.get("membership_plan", ""))
    
    exceeded = new_lbs_used > lbs_allowance
    excess = max(0, new_lbs_used - lbs_allowance) if exceeded else 0
    
    await db.customers.update_one(
        {"id": customer_id},
        {
            "$set": {
                "cycle_lbs_used": new_lbs_used,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            },
            "$push": {
                "lbs_adjustment_log": {
                    "id": str(uuid.uuid4()),
                    "operator_id": current_user.get("id"),
                    "operator_name": current_user.get("name", current_user.get("email")),
                    "previous_lbs": current_lbs_used,
                    "new_lbs": new_lbs_used,
                    "adjustment": data.lbs_to_add,
                    "reason": data.reason,
                    "notes": data.notes,
                    "exceeded": exceeded,
                    "excess_lbs": excess,
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                }
            }
        }
    )
    
    await create_audit_log(
        "MEMBERSHIP_LBS_ADJUSTED", "customer", customer_id, current_user["id"],
        {
            "previous_lbs": current_lbs_used,
            "new_lbs": new_lbs_used,
            "adjustment": data.lbs_to_add,
            "reason": data.reason,
            "exceeded": exceeded,
            "excess_lbs": excess,
        }
    )
    
    return {
        "success": True,
        "message": f"Adjusted {abs(data.lbs_to_add)} lbs for {customer.get('name')}",
        "previous_lbs": current_lbs_used,
        "new_lbs": new_lbs_used,
        "lbs_allowance": lbs_allowance,
        "exceeded": exceeded,
        "excess_lbs": excess,
        "remaining": max(0, lbs_allowance - new_lbs_used),
    }


@router.post("/api/memberships/customers/{customer_id}/override-allowance")
async def override_membership_allowance(
    customer_id: str,
    data: MembershipManualOverride,
    current_user: dict = Depends(get_current_user),
):
    require_admin(current_user)
    
    customer = await db.customers.find_one({"id": customer_id}, {"_id": 0})
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    
    update_data = {
        "custom_lbs_allowance": data.lbs_allowance,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    
    if data.reset_cycle:
        update_data["cycle_lbs_used"] = 0
        update_data["membership_start_date"] = datetime.now(timezone.utc).isoformat()
    
    await db.customers.update_one({"id": customer_id}, {"$set": update_data})
    
    await create_audit_log(
        "MEMBERSHIP_ALLOWANCE_OVERRIDDEN", "customer", customer_id, current_user["id"],
        {"new_allowance": data.lbs_allowance, "reset_cycle": data.reset_cycle, "reason": data.reason}
    )
    
    return {
        "success": True,
        "message": f"Membership allowance overridden to {data.lbs_allowance} lbs/month",
        "customer_name": customer.get("name"),
        "new_allowance": data.lbs_allowance,
        "cycle_reset": data.reset_cycle,
    }


@router.patch("/api/memberships/customers/{customer_id}/status")
async def update_membership_status(
    customer_id: str,
    data: MembershipStatusUpdate,
    current_user: dict = Depends(get_current_user),
):
    require_admin(current_user)
    
    valid_statuses = ["active", "paused", "cancelled"]
    if data.status not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"Status must be one of: {valid_statuses}")
    
    customer = await db.customers.find_one({"id": customer_id}, {"_id": 0})
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    
    old_status = customer.get("membership_status", "inactive")
    
    update_data = {
        "membership_status": data.status,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    
    if data.status == "cancelled":
        update_data["auto_renew"] = False
        update_data["membership_cancelled_at"] = datetime.now(timezone.utc).isoformat()
    
    if data.status == "active" and old_status in ["paused", "cancelled"]:
        update_data["auto_renew"] = True
        update_data["membership_cancelled_at"] = None
    
    await db.customers.update_one({"id": customer_id}, {"$set": update_data})
    
    await create_audit_log(
        "MEMBERSHIP_STATUS_CHANGED", "customer", customer_id, current_user["id"],
        {"old_status": old_status, "new_status": data.status, "reason": data.reason}
    )
    
    return {
        "success": True,
        "message": f"Membership status changed from {old_status} to {data.status}",
        "customer_name": customer.get("name"),
        "old_status": old_status,
        "new_status": data.status,
    }


@router.get("/api/memberships/customers/{customer_id}/adjustment-log")
async def get_membership_adjustment_log(
    customer_id: str,
    limit: int = Query(50, ge=1, le=500),
    current_user: dict = Depends(get_current_user),
):
    require_admin(current_user)
    
    customer = await db.customers.find_one({"id": customer_id}, {"_id": 0})
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    
    adjustments = customer.get("lbs_adjustment_log", [])
    adjustments.sort(key=lambda x: x.get("timestamp", ""), reverse=True)
    
    return {
        "customer_id": customer_id,
        "customer_name": customer.get("name"),
        "total_adjustments": len(adjustments),
        "current_lbs_used": customer.get("cycle_lbs_used", 0),
        "custom_allowance": customer.get("custom_lbs_allowance"),
        "plan_allowance": _get_plan_allowance_from_name(customer.get("membership_plan", "")),
        "adjustments": adjustments[:limit],
    }


@router.post("/api/memberships/customers/{customer_id}/reset-cycle")
async def reset_membership_cycle(
    customer_id: str,
    current_user: dict = Depends(get_current_user),
):
    require_admin(current_user)
    
    customer = await db.customers.find_one({"id": customer_id}, {"_id": 0})
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    
    old_lbs_used = customer.get("cycle_lbs_used", 0)
    
    await db.customers.update_one(
        {"id": customer_id},
        {
            "$set": {
                "cycle_lbs_used": 0,
                "membership_start_date": datetime.now(timezone.utc).isoformat(),
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
        }
    )
    
    await create_audit_log(
        "MEMBERSHIP_CYCLE_RESET", "customer", customer_id, current_user["id"],
        {"old_lbs_used": old_lbs_used}
    )
    
    return {
        "success": True,
        "message": f"Membership cycle reset for {customer.get('name')}",
        "old_lbs_used": old_lbs_used,
        "new_lbs_used": 0,
    }


@router.post("/api/memberships/customers/{customer_id}/sync-orders")
async def sync_membership_orders(
    customer_id: str,
    current_user: dict = Depends(get_current_user),
):
    require_admin(current_user)
    
    customer = await db.customers.find_one({"id": customer_id}, {"_id": 0})
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    
    cycle_start_str = customer.get("membership_start_date")
    if not cycle_start_str:
        raise HTTPException(status_code=400, detail="Customer has no cycle start date")
    
    try:
        cycle_start = datetime.fromisoformat(cycle_start_str.replace("Z", "+00:00"))
    except:
        cycle_start = datetime.now(timezone.utc) - timedelta(days=30)
    
    orders = await db.orders.find({
        "customer_id": customer_id,
        "status": {"$in": ["delivered", "completed"]},
        "updated_at": {"$gte": cycle_start.isoformat()}
    }).to_list(500)
    
    total_lbs = sum(o.get("actual_lbs", 0) or 0 for o in orders)
    
    await db.customers.update_one(
        {"id": customer_id},
        {
            "$set": {
                "cycle_lbs_used": total_lbs,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
        }
    )
    
    await create_audit_log(
        "MEMBERSHIP_ORDERS_SYNCED", "customer", customer_id, current_user["id"],
        {"orders_synced": len(orders), "total_lbs": total_lbs}
    )
    
    allowance = customer.get("custom_lbs_allowance") or _get_plan_allowance_from_name(customer.get("membership_plan", ""))
    
    return {
        "success": True,
        "message": f"Synced {len(orders)} orders for {customer.get('name')}",
        "orders_synced": len(orders),
        "total_lbs_used": total_lbs,
        "lbs_allowance": allowance,
        "remaining": max(0, allowance - total_lbs),
    }


# ============================================================
# CYCLE USAGE (ENHANCED WITH CUSTOM ALLOWANCE)
# ============================================================

@router.get("/api/customers/{customer_id}/cycle-usage")
async def get_customer_cycle_usage_endpoint(
    customer_id: str,
    current_user: dict = Depends(get_current_user),
):
    role = current_user.get("role", "")
    if role not in ("admin", "operator"):
        if current_user.get("id") != customer_id and current_user.get("customer_id") != customer_id:
            raise HTTPException(status_code=403, detail="Not authorized")

    usage = await get_customer_cycle_usage(customer_id)
    if usage is None:
        return {"ok": False, "detail": "No active membership or plan not recognized"}
    
    customer = await db.customers.find_one({"id": customer_id}, {"_id": 0})
    if customer and customer.get("custom_lbs_allowance"):
        usage["lbs_allowance"] = customer["custom_lbs_allowance"]
        usage["allowance_source"] = "custom_override"
        usage["remaining"] = max(0, usage["lbs_allowance"] - usage.get("lbs_used", 0))
        usage["pct_used"] = round((usage.get("lbs_used", 0) / usage["lbs_allowance"]) * 100, 1) if usage["lbs_allowance"] > 0 else 0
    else:
        usage["allowance_source"] = "plan"
    
    return {"ok": True, "data": usage}


# ============================================================
# MEMBERSHIP PREVIEW
# ============================================================

@router.get("/api/customers/{customer_id}/membership-preview")
async def get_membership_billing_preview(
    customer_id: str,
    lbs: float,
    service_type: str = "pickup_delivery",
    service_plan: str = "standard",
    distance_miles: Optional[float] = None,
    current_user: dict = Depends(get_current_user),
):
    customer = await db.customers.find_one({"id": customer_id}, {"_id": 0})
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    mock_order = {
        "actual_lbs": lbs,
        "service_type": service_type,
        "service_plan": service_plan,
        "distance_miles": distance_miles,
        "addon_services": [],
        "payment_method": "",
    }

    breakdown = await calculate_final_amount_with_membership(mock_order, customer)
    if not breakdown:
        raise HTTPException(status_code=400, detail="Could not calculate breakdown")

    usage = await get_customer_cycle_usage(customer_id)

    return {
        "ok": True,
        "breakdown": breakdown,
        "cycle": usage,
    }


# ============================================================
# MEMBERSHIP RENEWAL & MANAGEMENT (WITH STRIPE FEE)
# ============================================================

@router.post("/api/membership/renew")
async def renew_membership(
    data: MembershipRenewalRequest,
    current_customer: dict = Depends(get_current_customer),
):
    if not STRIPE_AVAILABLE or not STRIPE_API_KEY:
        raise HTTPException(status_code=503, detail="Stripe payment not configured")

    customer_id = current_customer["id"]
    
    customer = await db.customers.find_one({"id": customer_id}, {"_id": 0})
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    
    current_plan = customer.get("membership_plan")
    current_status = customer.get("membership_status", "")
    
    if current_status != "active":
        raise HTTPException(status_code=400, detail="No active membership to renew")
    
    if data.plan_id:
        new_plan_doc = await db.membership_plans.find_one({"id": data.plan_id}, {"_id": 0})
        if not new_plan_doc:
            raise HTTPException(status_code=404, detail="Plan not found")
        new_plan_name = new_plan_doc["name"]
        is_plan_change = True
    else:
        new_plan_name = current_plan
        is_plan_change = False
    
    base_price = _get_plan_price(new_plan_name)
    
    subtotal = base_price
    if is_plan_change:
        usage = await get_customer_cycle_usage(customer_id)
        days_remaining = usage.get("days_remaining", 0) if usage else 0
        prorated = _calculate_prorated_amount(current_plan, new_plan_name, days_remaining)
        subtotal = prorated if prorated > 0 else base_price
    
    amount_to_charge = _calculate_total_with_stripe_fee(subtotal)
    stripe_fee = round(amount_to_charge - subtotal, 2)
    
    payment_method_id = customer.get("stripe_payment_method_id")
    stripe_customer_id = customer.get("stripe_customer_id")
    
    if not payment_method_id or not stripe_customer_id:
        return {
            "success": False,
            "requires_payment_method": True,
            "message": "Please add a payment method first",
            "plan_name": new_plan_name,
            "subtotal": subtotal,
            "total_with_fee": amount_to_charge,
        }
    
    if subtotal <= 0:
        now_iso = datetime.now(timezone.utc).isoformat()
        await db.customers.update_one(
            {"id": customer_id},
            {
                "$set": {
                    "membership_plan": new_plan_name,
                    "membership_start_date": now_iso,
                    "membership_status": "active",
                    "auto_renew": True,
                    "updated_at": now_iso,
                }
            }
        )
        
        await _send_membership_renewal_email(customer, new_plan_name, 0, is_plan_change)
        
        return {
            "success": True,
            "message": f"Plan changed to {new_plan_name} (no additional charge)",
            "amount_charged": 0,
            "plan_name": new_plan_name,
            "is_plan_change": True,
        }
    
    try:
        payment_intent = stripe.PaymentIntent.create(
            amount=int(amount_to_charge * 100),
            currency="usd",
            customer=stripe_customer_id,
            payment_method=payment_method_id,
            off_session=True,
            confirm=True,
            description=f"Membership {'renewal' if not is_plan_change else f'change to {new_plan_name}'}",
            metadata={
                "customer_id": customer_id,
                "plan_name": new_plan_name,
                "type": "membership_renewal" if not is_plan_change else "plan_change",
                "previous_plan": current_plan if is_plan_change else "",
                "subtotal": str(subtotal),
                "stripe_fee": str(stripe_fee),
                "total": str(amount_to_charge),
            },
            receipt_email=customer.get("email"),
        )
        
        if payment_intent.status != "succeeded":
            return {
                "success": False,
                "error": f"Payment failed: {payment_intent.status}",
                "requires_payment_method": True,
                "payment_intent_id": payment_intent.id,
            }
        
        now_iso = datetime.now(timezone.utc).isoformat()
        await db.customers.update_one(
            {"id": customer_id},
            {
                "$set": {
                    "membership_plan": new_plan_name,
                    "membership_start_date": now_iso,
                    "membership_status": "active",
                    "auto_renew": True,
                    "updated_at": now_iso,
                }
            }
        )
        
        await db.payment_transactions.insert_one({
            "id": str(uuid.uuid4()),
            "customer_id": customer_id,
            "subtotal": subtotal,
            "stripe_fee": stripe_fee,
            "amount": amount_to_charge,
            "currency": "usd",
            "payment_type": "membership_renewal" if not is_plan_change else "plan_change",
            "plan_name": new_plan_name,
            "stripe_payment_intent_id": payment_intent.id,
            "payment_status": "succeeded",
            "metadata": {
                "previous_plan": current_plan if is_plan_change else None,
                "days_remaining": usage.get("days_remaining") if is_plan_change else None,
            },
            "created_at": now_iso,
        })
        
        await _send_membership_renewal_email(customer, new_plan_name, amount_to_charge, is_plan_change, subtotal, stripe_fee)
        
        return {
            "success": True,
            "message": f"{'Plan changed to' if is_plan_change else 'Membership renewed'} {new_plan_name}",
            "subtotal": subtotal,
            "stripe_fee": stripe_fee,
            "amount_charged": amount_to_charge,
            "plan_name": new_plan_name,
            "is_plan_change": is_plan_change,
            "new_start_date": now_iso,
        }
        
    except stripe.error.CardError as e:
        logger.error(f"Stripe card error for renewal: {e.error.message}")
        return {
            "success": False,
            "error": e.error.message,
            "decline_code": e.error.code,
            "requires_payment_method": True,
        }
    except stripe.error.StripeError as e:
        logger.error(f"Stripe error for renewal: {e}")
        return {
            "success": False,
            "error": str(e.user_message or e),
            "requires_payment_method": True,
        }
    except Exception as e:
        logger.error(f"Membership renewal error: {e}")
        return {
            "success": False,
            "error": str(e),
        }


@router.post("/api/membership/cancel")
async def cancel_membership(
    current_customer: dict = Depends(get_current_customer),
):
    customer_id = current_customer["id"]
    
    customer = await db.customers.find_one({"id": customer_id}, {"_id": 0})
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    
    if customer.get("membership_status") != "active":
        raise HTTPException(status_code=400, detail="No active membership to cancel")
    
    now_iso = datetime.now(timezone.utc).isoformat()
    
    await db.customers.update_one(
        {"id": customer_id},
        {
            "$set": {
                "auto_renew": False,
                "membership_cancelled_at": now_iso,
                "updated_at": now_iso,
            }
        }
    )
    
    await create_audit_log("MEMBERSHIP_CANCELLED", "customer", customer_id, customer_id)
    
    try:
        from notifications import send_email
        frontend_url = os.environ.get("FRONTEND_URL", "")
        await send_email(
            customer.get("email"),
            "Membership Cancellation Confirmation",
            f"Hi {customer.get('name')},\n\n"
            f"We've cancelled the auto-renewal for your {customer.get('membership_plan')} membership.\n\n"
            f"Your membership will remain active until the end of the current cycle.\n\n"
            f"Log in to your account: {frontend_url}/account"
        )
    except Exception as e:
        logger.warning(f"Failed to send cancellation email: {e}")
    
    return {
        "success": True,
        "message": "Membership auto-renewal cancelled.",
    }


@router.post("/api/membership/reactivate")
async def reactivate_membership(
    current_customer: dict = Depends(get_current_customer),
):
    customer_id = current_customer["id"]
    
    customer = await db.customers.find_one({"id": customer_id}, {"_id": 0})
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    
    if customer.get("membership_status") != "active":
        raise HTTPException(status_code=400, detail="No active membership to reactivate")
    
    await db.customers.update_one(
        {"id": customer_id},
        {
            "$set": {
                "auto_renew": True,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            },
            "$unset": {"membership_cancelled_at": ""}
        }
    )
    
    await create_audit_log("MEMBERSHIP_REACTIVATED", "customer", customer_id, customer_id)
    
    return {
        "success": True,
        "message": "Auto-renewal reactivated for your membership.",
    }


@router.get("/api/membership/status")
async def get_membership_status(
    current_customer: dict = Depends(get_current_customer),
):
    customer_id = current_customer["id"]
    
    customer = await db.customers.find_one({"id": customer_id}, {"_id": 0})
    if not customer:
        return {"has_membership": False}
    
    has_membership = is_active_member(None, customer)
    
    if not has_membership:
        return {"has_membership": False}
    
    usage = await get_customer_cycle_usage(customer_id)
    plan = customer.get("membership_plan")
    base_price = _get_plan_price(plan) if plan else 0
    total_with_fee = _calculate_total_with_stripe_fee(base_price)
    
    start_date_str = customer.get("membership_start_date")
    next_renewal = None
    if start_date_str:
        try:
            start_date = datetime.fromisoformat(start_date_str.replace("Z", "+00:00"))
            next_renewal = _get_next_renewal_date(start_date).strftime("%Y-%m-%d")
        except:
            pass
    
    return {
        "has_membership": True,
        "membership_plan": plan,
        "membership_status": customer.get("membership_status"),
        "membership_start_date": start_date_str,
        "auto_renew": customer.get("auto_renew", True),
        "next_renewal_date": next_renewal,
        "cycle_usage": usage,
        "plan_price": base_price,
        "renewal_total_with_fee": total_with_fee,
        "stripe_fee": round(total_with_fee - base_price, 2),
        "cancelled_at": customer.get("membership_cancelled_at"),
    }


@router.get("/api/membership/renewal-info")
async def get_membership_renewal_info(
    current_customer: dict = Depends(get_current_customer),
):
    customer_id = current_customer["id"]
    usage = await get_customer_cycle_usage(customer_id)
    
    if not usage:
        return {"has_membership": False}
    
    customer = await db.customers.find_one({"id": customer_id}, {"_id": 0})
    current_plan = customer.get("membership_plan")
    base_price = _get_plan_price(current_plan) if current_plan else 0
    total_with_fee = _calculate_total_with_stripe_fee(base_price)
    
    return {
        "has_membership": True,
        "current_plan": current_plan,
        "current_plan_price": base_price,
        "renewal_total_with_fee": total_with_fee,
        "stripe_fee": round(total_with_fee - base_price, 2),
        "cycle_start": usage.get("cycle_start"),
        "cycle_end": usage.get("cycle_end"),
        "days_remaining": usage.get("days_remaining", 0),
        "needs_renewal": usage.get("needs_renewal", False),
        "lbs_used": usage.get("lbs_used", 0),
        "lbs_allowance": usage.get("lbs_allowance", 0),
        "auto_renew": customer.get("auto_renew", True) if customer else True,
    }


# ============================================================
# PUBLIC MEMBERSHIP ROUTES
# ============================================================

@router.get("/api/public/membership-section", response_model=MembershipSectionResponse)
async def get_public_membership_section():
    section = await db.membership_section.find_one({"id": "default"}, {"_id": 0})
    if not section:
        section = _default_membership_section()
        await db.membership_section.insert_one(section)
    return MembershipSectionResponse(**section)


@router.get("/api/public/membership-plans", response_model=List[MembershipPlanResponse])
async def get_public_membership_plans():
    query = {"is_active": True}
    plans = await db.membership_plans.find(query, {"_id": 0}).sort(
        [("sort_order", 1), ("created_at", -1)]
    ).to_list(200)
    if not plans:
        plans = _seed_membership_plans()
        await db.membership_plans.insert_many(plans)
    return [MembershipPlanResponse(**p) for p in plans]