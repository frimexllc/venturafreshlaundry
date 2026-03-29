# Ventura Fresh Laundry — PRD

## Problem Statement
Comprehensive AI-powered laundry management system with: CRUD services, order/ticket management, operator logistics panel, admin panel, Stripe integration, Twilio & SendGrid notifications, AI assistants (Groq), POS system, dynamic shipping, PWA, bilingual support (EN/ES), and enterprise modules (CRM, ERP, Finances, Inventory, Catalog, Suppliers).

## Architecture
- **Frontend**: React (CRA via Craco), Tailwind CSS, Leaflet, Stripe SDK, Shadcn/UI, Sonner toasts
- **Backend**: FastAPI, MongoDB (motor), Pydantic, JWT Auth
- **Integrations**: Groq LLM, Stripe, Twilio, SendGrid, OpenRouteService, OSRM, Nominatim (geocoding)
- **Deployment**: Deferred-load backend (server.py -> server_core.py via background thread)

## Core Modules

### 1. Public Website
- Landing page with services, pricing, about, contact
- Schedule Pickup, Wash & Fold request, Membership, Store, Blog
- Address Autocomplete (Nominatim/OpenStreetMap)
- FAQ page (/faq) with bilingual content, search, category filters
- Bilingual EN/ES

### 2. Admin Dashboard (/admin)
- Dashboard, Customers, Orders, Calendar, Quotes, Leads, Tickets
- Services, Memberships, AI assistant, Store, Blog management
- User Management, Finances, Audit Log, Settings
- AI Metrics (/admin/ai-metrics)
- Quick Approval (/admin/quick-approval)

### 3. Logistics Map / Operator Panel (/admin/operator)
- Interactive OpenStreetMap with real-time route optimization
- OSRM road-following route polylines
- Real backend data via /api/logistics/orders
- TIM AI copilot (Groq-powered voice/text)
- Stripe Payment modal for on-route collections

### 4. POS & Store System
- In-store POS, product sales, cart management
- Stripe Payment Elements (Inline, Tap-to-Pay)
- Dynamic delivery zones with OpenRouteService

### 5. Enterprise Modules (NEW - Architectural Merge)

#### 5a. Suppliers (/admin/suppliers)
- Full CRUD for vendor/supplier management
- Categories: chemicals, packaging, equipment, uniforms, maintenance, delivery
- Search, filter, contact info, products/services tags
- Tracks total orders and total spent per supplier

#### 5b. Authorized Catalog (/admin/catalog)
- Strict authorized brand catalog: Tide, Gain, Foca, Ariel, Arm & Hammer, OxiClean, Suavitel, Downy, Snuggle, Bounce, Clorox, Cloralen
- Categories: detergent, softener, dryer_sheet, bleach
- Default product marking, stock status, pricing
- Seed/Reset to defaults functionality

#### 5c. Inventory (/admin/inventory)
- Stock tracking with quantity and min-stock alerts
- Stock movements (in/out/adjustment) with history
- Purchase Orders with full lifecycle: pending -> approved -> ordered -> received
- Auto-stock on PO receipt
- Low stock alerts panel

#### 5d. Finances (/admin/finances)
- Financial dashboard: Revenue, Expenses, Net Income, Mileage stats
- Period filtering (day/week/month/year)
- Expense management: CRUD with categories, types (fixed/variable/subscription), payment methods
- Mileage tracking with IRS rate ($0.70/mi) reimbursement calculation
- Vehicle fleet management
- Expense categories with color coding

### 6. Notifications
- Multi-channel: Twilio SMS/WhatsApp/Voice, SendGrid Email

## Key API Endpoints
- `GET /api/health` — Deployment health check
- `GET /api/logistics/orders` — Unified order feed with geocoded coordinates
- `POST /api/stripe-payments/create-intent` — Stripe payment intents
- `GET /api/suppliers` — Suppliers CRUD
- `GET /api/catalog` — Authorized product catalog (public)
- `GET /api/catalog/grouped` — Catalog grouped by category
- `GET /api/inventory/stock` — Current stock levels
- `POST /api/inventory/stock/movement` — Record stock movement
- `GET /api/inventory/purchase-orders` — Purchase orders
- `GET /api/finances/dashboard` — Financial summary
- `GET /api/finances/expenses` — Expense listing
- `POST /api/finances/mileage` — Mileage logging
- `GET /api/finances/vehicles` — Vehicle fleet

## Database Collections
- users, orders, store_orders, customers, quotes, leads, tickets
- services, memberships, delivery_zones, blog_posts
- ai_operator_sessions, ai_pending_actions
- geocode_cache — Cached Nominatim geocoding results
- suppliers — Vendor/supplier records
- catalog — Authorized product catalog
- inventory — Current stock levels
- stock_movements — Stock movement history
- purchase_orders — Purchase order lifecycle
- expenses — Financial expense records
- expense_categories — Custom expense categories
- mileage_logs — Vehicle mileage records
- vehicles — Fleet management

## Credentials
- Admin: owner@frimexllc.com / Fr!m3x##$$

## What's Implemented
- Full public website with all pages including FAQ
- Admin CRM dashboard with all modules
- Logistics Map Operator Panel with real backend data
- AI Metrics and Quick Approval admin pages
- Address Autocomplete on public forms
- Multi-channel notifications (Twilio/SendGrid)
- Deferred-loading backend for K8s deployment
- Stripe Payment Elements (inline, tap-to-pay)
- **Enterprise Modules: Suppliers, Catalog, Inventory, Finances (COMPLETE)**
- Sidebar navigation with collapsible groups for all modules

## Known Issues
- Traffic events in logistics map are MOCKED (client-side simulation)

## Deployment Status
- server.py binds port in 0.3s, server_core loads in 0.8s
- /api/health responds instantly before heavy imports
- Deployment agent scan: PASS

## Backlog
- P1: Implement strict business rules (ZIP code delivery zones, payment rules)
- P1: Refactor server_core.py (~4400 lines) into modular route files
- P2: Ticket redesign with QR codes and price breakdown
- P2: Replace simulated traffic with Google Traffic API
- PAUSED: Advanced Stripe Sync (bidirectional) — pending user call
