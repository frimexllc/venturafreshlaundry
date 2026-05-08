from fastapi import FastAPI, APIRouter, HTTPException, Request, Depends
from fastapi.responses import HTMLResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv
import os
import logging
from pathlib import Path
from pydantic import BaseModel
from typing import Optional, Dict
from datetime import datetime, timezone
import importlib

from utils import (
    normalize_phone,
    normalize_spaces,
)

# ── Shared modules ───────────────────────────────────────────────────
from database import db, client, SKIP_SERVER_NOTIFICATIONS, BUSINESS_NAME
from models import (
    ROLE_ADMIN, ROLE_OPERATOR, VALID_ROLES, ROLE_PERMISSIONS,
)
from auth import (
    get_current_user, require_admin,
)
from utils import (
    generate_order_number,
    create_audit_log,
)

ROOT_DIR = Path(__file__).parent
app_url = os.environ.get("APP_URL", "")
if not app_url or "preview" in app_url or "localhost" in app_url:
    load_dotenv(ROOT_DIR / '.env', override=False)

# Import notification services
try:
    from notifications import (
        notify_order_created,
        notify_order_status_changed,
        send_email,
        send_sms,
        send_voice_call,
        send_whatsapp,
        send_preferred_notification,
        build_notification_content,
        generate_ai_message,
        detect_language,
        normalize_preferred_contact
    )
    NOTIFICATIONS_ENABLED = True
except ImportError:
    NOTIFICATIONS_ENABLED = False
    logger = logging.getLogger(__name__)
    logger.warning("Notification services not available")

try:
    from routes.public_forms import get_public_forms_router
except ImportError:
    get_public_forms_router = None
    logger = logging.getLogger(__name__)
    logger.warning("Public forms router not available")

try:
    from routes.voice import get_voice_router
except ImportError:
    get_voice_router = None
    logger = logging.getLogger(__name__)
    logger.warning("Voice router not available")

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

# Stripe Checkout integration (service orders)
try:
    from emergentintegrations.payments.stripe.checkout import (
        StripeCheckout,
        CheckoutSessionResponse,
        CheckoutStatusResponse,
        CheckoutSessionRequest,
    )
    STRIPE_CHECKOUT_AVAILABLE = True
except ImportError:
    STRIPE_CHECKOUT_AVAILABLE = False

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
        status: str = ""
        payment_status: str = ""
        amount_total: int = 0
        currency: str = ""
        metadata: Dict[str, str] = {}

    class StripeCheckout:
        def __init__(self, api_key: str, webhook_url: str):
            self.api_key = api_key
            self.webhook_url = webhook_url

        async def create_checkout_session(self, request: CheckoutSessionRequest):
            raise RuntimeError("Stripe integration not available")

        async def get_checkout_status(self, checkout_session_id: str):
            raise RuntimeError("Stripe integration not available")

        async def handle_webhook(self, payload: bytes, signature: str):
            raise RuntimeError("Stripe integration not available")

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
    from automation_engine import automation_router, set_database as set_automation_db, set_realtime_emitter
    AUTOMATION_ENABLED = True
except ImportError:
    AUTOMATION_ENABLED = False
    automation_router = None
    set_realtime_emitter = None
    logger = logging.getLogger(__name__)
    logger.warning("Automation engine not available")

# Stripe sync is now a modular router (routes/stripe_sync.py), no scaffold needed

# MongoDB connection imported from database.py

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

# ── Import shared objects from the shared module (no circular import) ──
from shared import fastapi_app, sio

app = fastapi_app
api_router = APIRouter(prefix="/api")

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


async def emit_realtime(event: str, payload: dict):
    try:
        await sio.emit(event, payload)
    except Exception as exc:
        logger.warning(f"Realtime emit failed: {exc}")

if AUTOMATION_ENABLED and set_realtime_emitter:
    set_realtime_emitter(emit_realtime)


# ==================== AUTH ENDPOINTS (Extracted → routes/auth_routes.py) ====================
# ==================== DASHBOARD (Extracted → routes/dashboard.py) ====================

# ==================== CUSTOMERS (Extracted → routes/customers.py) ====================
# ==================== PREFERENCES (Extracted → routes/customers.py) ====================

# ==================== ORDERS (Extracted → routes/orders.py) ====================

# ==================== QUOTES (Extracted → routes/quotes.py) ====================
# ==================== LEADS (Extracted → routes/leads.py) ====================
# ==================== SUPPORT TICKETS (Extracted → routes/tickets.py) ====================

# ==================== SERVICES (Extracted → routes/services.py) ====================
# ==================== MEMBERSHIPS (Extracted → routes/services.py) ====================

# ==================== AI ASSISTANT (Extracted → routes/ai_assistant.py) ====================
# ==================== AI METRICS (Extracted → routes/ai_metrics.py) ====================
# ==================== AI ADMIN (Extracted → routes/ai_admin.py) ====================
# ==================== AI PATTERNS (Extracted → routes/ai_patterns.py) ====================
# ==================== ADMIN IMPORT (Extracted → routes/admin_import.py) ====================

# ==================== PUBLIC MEMBERSHIPS (Extracted → routes/services.py) ====================

# ==================== INGEST & ROUTING (Extracted → routes/ingest.py) ====================

# ==================== AUDIT LOG (Extracted → routes/audit.py) ====================

# ==================== HEALTH CHECK ====================

@api_router.get("/")
async def root():
    return {"message": "Ventura Fresh Laundry CRM API", "status": "healthy"}

@api_router.get("/health")
async def health_check():
    return {"status": "healthy", "timestamp": datetime.now(timezone.utc).isoformat()}


# ═══════════════════════════════════════════════════════════════════════
# NUEVO ENDPOINT: TRANSACCIONES REALES (store/transactions)
# ═══════════════════════════════════════════════════════════════════════
@api_router.get("/store/transactions")
async def get_store_transactions(current_user: dict = Depends(get_current_user)):
    """Devuelve transacciones de órdenes de servicio y membresías pagadas (últimos 30 días)."""
    from database import db
    from datetime import datetime, timezone, timedelta

    thirty_days_ago = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()

    orders = await db.orders.find(
        {"payment_status": "paid", "created_at": {"$gte": thirty_days_ago}},
        {"_id": 0, "order_number": 1, "customer_name": 1, "total_amount": 1, "payment_method": 1, "created_at": 1}
    ).sort("created_at", -1).to_list(100)

    memberships = await db.membership_signups.find(
        {"payment_status": "paid", "created_at": {"$gte": thirty_days_ago}},
        {"_id": 0, "id": 1, "first_name": 1, "amount": 1, "created_at": 1}
    ).sort("created_at", -1).to_list(100)

    transactions = []
    for o in orders:
        transactions.append({
            "id": f"order_{o.get('order_number', '')}",
            "created_at": o["created_at"],
            "payment_type": "service",
            "order_number": o.get("order_number"),
            "customer_name": o.get("customer_name"),
            "amount": float(o.get("total_amount", 0)),
            "payment_status": "paid",
            "payment_method": o.get("payment_method", "card"),
        })
    for m in memberships:
        transactions.append({
            "id": f"mem_{m['id']}",
            "created_at": m["created_at"],
            "payment_type": "membership",
            "order_number": f"MEM-{m['id'][:8]}",
            "customer_name": m.get("first_name", ""),
            "amount": float(m.get("amount", 0)),
            "payment_status": "paid",
            "payment_method": "stripe",
        })

    transactions.sort(key=lambda x: x["created_at"], reverse=True)
    return transactions


# ==================== EXPORT ENDPOINTS (Extracted → routes/exports.py) ====================

# ==================== CALENDAR ENDPOINTS (Extracted → routes/calendar.py) ====================

# ==================== NOTIFICATION SETTINGS (Extracted → routes/settings.py) ====================

# ==================== CUSTOMER AUTHENTICATION (Extracted → routes/customer_auth.py) ====================

# ==================== USER MANAGEMENT (Extracted → routes/users.py) ====================

# ==================== OPERATOR-ONLY ENDPOINTS (Extracted → routes/operator.py) ====================

# === External routers (refactored) ===

# Include extracted modular routers
for _mod, _name in [
    ("routes.auth_routes", "Auth"),
    ("routes.dashboard", "Dashboard"),
    ("routes.customers", "Customers"),
    ("routes.quotes", "Quotes"),
    ("routes.leads", "Leads"),
    ("routes.tickets", "Tickets"),
    ("routes.users", "User Management"),
    ("routes.exports", "Exports"),
    ("routes.calendar", "Calendar"),
    ("routes.services", "Services"),
    ("routes.ingest", "Ingest"),
    ("routes.audit", "Audit"),
    ("routes.settings", "Settings"),
    ("routes.customer_auth", "Customer Auth"),
    ("routes.operator", "Operator"),
    ("routes.orders", "Orders"),
    ("routes.ai_assistant", "AI Assistant"),
    ("routes.ai_metrics", "AI Metrics"),
    ("routes.ai_admin", "AI Admin"),
    ("routes.ai_patterns", "AI Patterns"),
    ("routes.admin_import", "Admin Import"),
    ("routes.traffic", "Traffic"),
    ("routes.stripe_sync", "Stripe Sync"),
    ("routes.notification_metrics", "Notification Metrics"),
]:
    try:
        _m = importlib.import_module(_mod)
        app.include_router(_m.router)
        logger.info(f"{_name} router enabled")
    except Exception as e:
        logger.warning(f"{_name} router not loaded: {e}")

if get_public_forms_router:
    public_forms_router = get_public_forms_router(
        db=db,
        generate_order_number=generate_order_number,
        create_audit_log=create_audit_log,
        emit_realtime=emit_realtime,
        notifications_enabled=NOTIFICATIONS_ENABLED,
        skip_server_notifications=SKIP_SERVER_NOTIFICATIONS,
        logger=logger
    )
    api_router.include_router(public_forms_router)

if NOTIFICATIONS_ENABLED and get_voice_router:
    voice_router = get_voice_router(
        db=db,
        require_admin=require_admin,
        get_current_user=get_current_user,
        build_notification_content=build_notification_content,
        send_voice_call=send_voice_call,
        detect_language=detect_language,
        generate_ai_message=generate_ai_message,
        normalize_phone=normalize_phone,
        create_audit_log=create_audit_log
    )
    api_router.include_router(voice_router)

# Include router
app.include_router(api_router)

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

# Include TIM (Transportation Intelligence Module) router
try:
    from routes.tim import router as tim_router
    app.include_router(tim_router)
    logger.info("TIM router enabled at /api/tim/*")
except Exception as e:
    logger.warning(f"TIM router not loaded: {e}")

# Include Logistics router (unified order feed for operator map)
try:
    from routes.logistics import router as logistics_router
    app.include_router(logistics_router, prefix="/api")
    logger.info("Logistics router enabled at /api/logistics/*")
except Exception as e:
    logger.warning(f"Logistics router not loaded: {e}")

try:
    from routes.route_planning import router as route_planning_router
    app.include_router(route_planning_router)
    logger.info("Route planning router enabled at /api/logistics/route-plan")
except Exception as e:
    logger.warning(f"Route planning router not loaded: {e}")


try:
    from routes.geocode import router as geocode_router
    app.include_router(geocode_router, prefix="/api")
    logger.info("Geocode router enabled at /api/geocode/*")
except Exception as e:
    logger.warning(f"Geocode router not loaded: {e}")

try:
    from routes.customer import router as customer_router
    app.include_router(customer_router, prefix="/api")
    logger.info("Customer router enabled at /api/customer/*")
except Exception as e:
    logger.warning(f"Customer router not loaded: {e}")

# Include Stripe Payments router (PaymentIntents, tap-to-pay, POS)
try:
    from routes.stripe_payments import router as stripe_payments_router
    app.include_router(stripe_payments_router)
    logger.info("Stripe Payments router enabled at /api/stripe/*")
except Exception as e:
    logger.warning(f"Stripe Payments router not loaded: {e}")

# Include Suppliers router
try:
    from routes.suppliers import router as suppliers_router
    app.include_router(suppliers_router)
    logger.info("Suppliers router enabled at /api/suppliers/*")
except Exception as e:
    logger.warning(f"Suppliers router not loaded: {e}")

# Include Finances router (expenses, mileage, vehicles)
try:
    from routes.finances import router as finances_router
    app.include_router(finances_router)
    logger.info("Finances router enabled at /api/finances/*")
except Exception as e:
    logger.warning(f"Finances router not loaded: {e}")

# Include Catalog router (authorized products)
try:
    from routes.catalog import router as catalog_router
    app.include_router(catalog_router)
    logger.info("Catalog router enabled at /api/catalog/*")
except Exception as e:
    logger.warning(f"Catalog router not loaded: {e}")

# Include Inventory router (stock, purchase orders)
try:
    from routes.inventory import router as inventory_router
    app.include_router(inventory_router)
    logger.info("Inventory router enabled at /api/inventory/*")
except Exception as e:
    logger.warning(f"Inventory router not loaded: {e}")

# Include Inventory Alerts router
try:
    from routes.inventory_alerts import router as alerts_router
    app.include_router(alerts_router)
    logger.info("Inventory Alerts router enabled at /api/inventory/alerts")
except Exception as e:
    logger.warning(f"Inventory Alerts router not loaded: {e}")

# Include Delivery Rules router (ZIP codes, pricing, payment validation)
try:
    from routes.delivery_rules import delivery_rules_router
    app.include_router(delivery_rules_router, prefix="/api/delivery-rules")
    logger.info("Delivery Rules router enabled at /api/delivery-rules/*")
except Exception as e:
    logger.warning(f"Delivery Rules router not loaded: {e}")

# Include KPIs router (operational dashboard)
try:
    from routes.kpis import router as kpis_router
    app.include_router(kpis_router)
    logger.info("KPIs router enabled at /api/kpis/*")
except Exception as e:
    logger.warning(f"KPIs router not loaded: {e}")

# Include File uploads router (object storage)
try:
    from routes.file_uploads import router as files_router
    app.include_router(files_router)
    logger.info("File uploads router enabled at /api/files/*")
except Exception as e:
    logger.warning(f"File uploads router not loaded: {e}")

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
UPLOADS_DIR = ROOT_DIR / "uploads"
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)

app.mount("/uploads", StaticFiles(directory=str(UPLOADS_DIR)), name="uploads")
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