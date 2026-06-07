# Ventura Fresh Laundry - PRD

## Original Problem Statement
Comprehensive AI-powered laundry management system with CRM, ERP, Finances, POS, Stripe, Twilio/SendGrid notifications, AI assistants, delivery logistics.

## Architecture
```
shared.py (fastapi_app, sio) <- single source of truth
server.py (entry point) -> server_core.py (routes/DB)
realtime.py (emit helper)
Routes: orders, kpis, finances, ai, store, stripe_payments, operator, geocode, logistics, customer, customer_auth, etc.
```

## Credentials
- Admin: owner@frimexllc.com / admin123
- Test Customer: testcustomer@example.com / test123456
- Extended Test: maria_extended@test.com / test123456

## State Machine
### Pickup & Delivery
NEW -> CONFIRMED -> PICKED_UP -> PROCESSING -> READY -> OUT_FOR_DELIVERY -> DELIVERED -> COMPLETED

### Wash & Fold
NEW -> CONFIRMED -> PROCESSING -> READY -> COMPLETED

## Delivery Zone Rules
- API: `GET /api/geocode/distance?lat=&lng=` (OpenRouteService driving distance)
- 0-3 miles: Free delivery ($0)
- 3-10 miles: $2.99 delivery fee
- >10 miles: Delivery not available (rejected)
- Store coordinates: 34.283, -119.293 (Ventura, CA)

## Customer Portal & Auth
- **Registration required**: All service forms require customer login
- **Auth Guard**: `CustomerProtectedRoute` in App.js redirects to `/account/login?redirect=...`
- **Customer Account**: `/account` — profile, orders, pending payments, membership upsell
- **Pending Payments**: 5 methods (Stripe Card, Zelle, Venmo, CashApp, Receipt Upload with OCR)
- **Preferences**: Only for customers with active membership
- **OCR Pipeline**: Customer uploads receipt → AI (GPT-4o Vision) extracts amount → auto-verifies within 10% tolerance

### Customer API Endpoints
- `POST /api/customer/auth/register`, `POST /api/customer/auth/login`
- `GET /api/customer/me`, `GET /api/customer/orders`, `GET /api/customer/pending-payments`
- `GET /api/customer/membership-status`
- `GET/POST/DELETE /api/customer/preferences` (403 if no membership)
- `POST /api/customer/order/{id}/checkout-auth` (Stripe checkout)
- `POST /api/customer/order/{id}/mark-zelle`, `POST /api/customer/order/{id}/confirm-payment`

## Operator Dashboard Tabs
- Tab 1: **Ordenes de Servicio** — POS grid with P&D and W&F order cards
- Tab 2: **Store Orders** — Store orders table + DeliveryZonesManager
- Tab 3: **Mapa Logistico** — Leaflet map with MapFilters (date/shift)

## Completed Features

### Phase 1 (State Machine, Tickets, Zelle)
- [x] CONFIRMED state + can_transition() validation
- [x] Driver endpoint, HTML Ticket, Zelle, Stripe Checkout, POS Tap to Pay

### Phase 2 (Tabs, Timezone, PDF)
- [x] Tabs layout, Pacific Time, PDF download, validations, processing fee

### Phase 3 (Delivery Rules, Filters, Mobile, PWA) — 2026-04-04
- [x] Delivery Zone Rules, Map Filters, WhatsApp fallback, PWA Service Worker

### Phase 4 (Customer Portal & Auth) — 2026-04-06
- [x] Customer registration/login required before placing orders
- [x] Pending Payments section with Stripe/Zelle/Cash
- [x] Preferences hidden for non-members with membership upsell
- [x] Pre-fill forms from customer data, notification links → /account

### Phase 5 (Code Quality & Refactoring) — 2026-04-12
- [x] Fixed 2 syntax errors in test files (test_ai_operations.py, test_refactoring_verification.py)
- [x] Removed all hardcoded secrets from 17 test files → os.environ.get()
- [x] Replaced MD5 with SHA-256 in ai_assistant.py cache key
- [x] Fixed `is True/False` identity comparisons in 3 test files
- [x] Refactored ai_assistant.py: extracted _collect_briefing_data(), _build_briefing_prompt(), _parse_rate_limit_wait(), _suggest_stuck_orders(), _suggest_ready_backlog(), _suggest_unpaid_completed()
- [x] Refactored automation_engine.py: extracted _normalize_order_for_dashboard(), _categorize_orders()

### Phase 6 (Payment Pipeline: Stripe + OCR) — 2026-04-12
- [x] Fixed Stripe `confirm-payment` endpoint: Made PUBLIC (no auth), eliminates 403 on Stripe redirect
- [x] Receipt Upload + OCR Pipeline: upload-receipt → ocr-receipt (GPT-4o Vision via emergentintegrations)
- [x] Fixed route conflicts: removed duplicate /customer/me and /customer/orders from customer_auth.py
- [x] Improved Stripe return flow: proper error handling (was silently swallowing errors)
- [x] Added `pending` payment status support for backwards compatibility with older orders
- [x] 5 payment methods: Stripe Card, Zelle, Venmo, CashApp, Receipt Upload (with AI OCR)
- [x] OCR validates amount within 10% tolerance, auto-marks order as pending_verification

### Phase 6b (MongoDB Image Storage + AI Strengthening) — 2026-04-12
- [x] Migrated file storage from external Emergent Object Storage to MongoDB (base64 in documents)
- [x] All new uploads store `data_base64` field in MongoDB `files` collection
- [x] Download endpoints read from MongoDB first, fallback to external storage for legacy files
- [x] Strengthened AI OCR: now verifies COMPLETED payments vs previews/requests (is_valid_payment field)
- [x] AI rejects payment request screenshots, pending transactions, non-payment images
- [x] Frontend shows rejection reason in Spanish when AI rejects receipt
- [x] Fixed LlmChat timeout parameter bug in operator validation endpoints

### Phase 7 (Enhanced Registration + Auto-fill) — 2026-04-13
- [x] 2-step customer registration: Step 1 (name/email/password) → Step 2 (phone/address/city/state/zip)
- [x] Backend CustomerRegister model accepts phone, address, city, state, zip_code
- [x] Post-registration Terms & Privacy modal explaining data storage purposes
- [x] Auto-fill service forms (SchedulePickup, WashFold, RequestQuote) from customer_data
- [x] Restored /api/orders router (was accidentally overwritten by testing agent)

### Phase 7b (Profile Editing + Alejandro Verification) — 2026-04-13
- [x] PUT /api/customer/me endpoint for profile updates (name, phone, address, city, state, zip_code)
- [x] Profile updates propagate to ALL linked customer records (same email)
- [x] Inline profile edit mode in CustomerAccount.jsx with Edit/Save/Cancel
- [x] "Add phone" / "Add address" links for empty fields

### Phase 11 (Logistics Map Professionalization) — 2026-05-05
- [x] Backend: /api/logistics/route-plan — real driving routes via ORS API (238+ waypoints)
- [x] Backend: /api/logistics/gas-stations — Overpass API + Ventura fallback data
- [x] MapView: Real driving routes via Google Directions API (not straight lines)
- [x] MapView: Professional map styling (hidden POI, highway colors, water styling)
- [x] MapView: Satellite/hybrid toggle, marker info windows
- [x] TIM assistant: Starts CLOSED (removed auto-open after 2.8s)
- [x] Toast cleanup: visibleToasts=3, duration=3s, traffic deduplication with toast IDs
- [x] Gas stations: Prices displayed ($4.49-$5.09/gal range), sorted by cheapest
- [x] 10-mile P&D limit enforced on backend (rejects with 400 + distance message)
- [x] Addons/individual items: Operator can add items (comforter, blanket, etc.) with auto-recalc

- [x] Login/Register backfills customer_email on existing orders (fixes ownership matching)
- [x] GET /api/customer/me returns extended fields (city, state, zip_code)
- [x] Verified Alejandro's real account: login, 13 orders visible, 8 pending payments, profile editing

### Phase 8 (Password Recovery) — 2026-04-28
- [x] POST /api/customer/auth/forgot-password: generates secure token, stores SHA-256 hash in DB, sends HTML email via SendGrid
- [x] POST /api/customer/auth/reset-password: validates token, resets password on ALL linked records, marks token used
- [x] Security: doesn't reveal if email exists, token expires in 1 hour, single-use
- [x] Frontend: "Forgot your password?" link on login, email input → success message
- [x] Frontend: Reset view detects ?reset=TOKEN in URL, shows new password + confirm fields

### Phase 9 (Notification System Fix) — 2026-04-28
- [x] Fixed: 'confirmed' and 'picked_up' now trigger customer notifications (removed from _NO_NOTIFY_STATUSES)
- [x] Fixed: 'processing' event added to pickup_delivery MILESTONES
- [x] Fixed: format_phone() defaults to US (+1) for 10-digit numbers instead of Mexico (+52)
- [x] Fixed: notify-customer endpoint has customer lookup fallback by email
- [x] Fixed: Simplified guard in send_preferred_notification — only blocks unmapped events
- [x] Added: Call and WhatsApp channels to frontend dropdown and backend handler
- [x] Verified: Twilio SMS sends OK (201), Twilio Call initiates OK (201)
- [x] NOTE: SendGrid API key returning 401 — user needs to regenerate
- [x] NOTE: WhatsApp requires Twilio WhatsApp Business channel setup

### Phase 10 (Dynamic Pricing by Service Tier) — 2026-04-29
- [x] Pricing tables: P&D Standard $2.50/$2.75, Premium $2.75/$3.00, Express $3.00/$3.25 (member/regular)
- [x] Pricing tables: W&F Standard $2.25, Premium $2.50, Express $2.75
- [x] Backend: service_plan + price_per_lb stored on order at creation time
- [x] Backend: calculate_service_amount uses stored price_per_lb (not hardcoded)
- [x] Backend: OrderResponse includes service_plan, price_per_lb, delivery_fee, customer_email
- [x] Frontend: PlanSelector shows prices dynamically per tier (member/regular for P&D, flat for W&F)
- [x] Frontend: calculateServiceCharge uses order.price_per_lb for correct recalculation
- [x] Operator panel: Shows rate and plan in order detail total section
- [x] Minimums enforced: P&D $40 minimum, W&F 10 lb minimum

### Phase 10b (Auto Delivery Fee + SMS/Email Only) — 2026-04-29
- [x] Auto-geocoding: At order creation, pickup_address is geocoded via Nominatim
- [x] Auto distance calculation: haversine formula from store coords to customer coords
- [x] Delivery fee formula: 3 miles free, $1.50/mile after, capped at $25
- [x] delivery_fee, distance_miles, coords stored on order at creation
- [x] calculate_service_amount includes delivery_fee in total (subtotal + delivery)
- [x] Frontend calculateDeliveryFee synced with backend ($1.50/mile, cap $25)
- [x] Auto-notification after lbs save restricted to SMS or Email only (not call/whatsapp)
- [x] Verified: P&D Premium 20lbs + 3.66mi = $60.99 ($60.00 + $0.99 delivery)

### Customer API Endpoints (Updated)
- `POST /api/customer/auth/register`, `POST /api/customer/auth/login`
- `GET /api/customer/me`, `GET /api/customer/orders`, `GET /api/customer/pending-payments`
- `GET /api/customer/membership-status`
- `GET/POST/DELETE /api/customer/preferences` (403 if no membership)
- `POST /api/customer/order/{id}/checkout-auth` (Stripe checkout — requires auth)
- `POST /api/customer/order/{id}/mark-zelle?method=<zelle|venmo|cashapp>` (requires auth)
- `POST /api/customer/order/{id}/confirm-payment` (PUBLIC — no auth)
- `POST /api/customer/upload-receipt` (image upload — requires auth)
- `POST /api/customer/ocr-receipt/{file_id}` (AI OCR — requires auth)

## Backlog
- (P3) Advanced Stripe Sync bidirectional (PAUSED by user)
- (P4) Split CustomerAccount.jsx into subcomponents
- (P5) Virtual tour of the interface (guided walkthrough for new operators) (PendingPayments, OrderHistory, Preferences)

## Logistics Module Enhancements — 2026-02-07
### Backend (`routes/logistics.py`)
- `/api/logistics/orders` GET ahora soporta filtros completos:
  - `date` (auto = hoy si no se envía via `auto_today=true`)
  - `service_type` = pickup-delivery | wash-fold | airbnb | b2b | all
  - `time_window` = morning (6-12) | afternoon (12-18) | evening (18-22)
  - `phase` = pickup | delivery | both
  - `include_wash_fold` = bool (excluye drop-off W&F si false)
- Normaliza `service_type` desde múltiples formatos (`wash_fold`, `airbnb-specialist`, `commercial`, etc.)
- Devuelve `type` y `service_type` para compatibilidad con mapper de frontend
- Estados ampliados: `new`, `pending`, `confirmed`, `pickup_scheduled`, `picked_up`, `in_process`, `ready`, `out_for_delivery`, `shipping`
- Filtra siempre `self-service` (no requiere ruta)

### Frontend
- `MapFilters.jsx` rediseñado profesional con:
  - Fecha por defecto = hoy + botón HOY
  - 5 chips de servicio (Todos, P&D, Airbnb, B2B, W&F) con íconos
  - 3 chips de fase (Ambos, Recoger, Entregar)
  - 3 chips de horario (AM, PM, Noche)
  - data-testid en todos los controles para testing
  - Modo oscuro soportado
- `LogisticsMap.jsx`:
  - Bug fix: `optimizeRouteAdvanced(orders, HQ, mpg, fuelPrice)` → `optimizeRouteAdvanced(orders, HQ, { vehicleKmPerLiter, fuelPricePerLiter })` (firma correcta, mpg→km/L, USD/gal→USD/L)
  - Excluye `self-service` y `wash-fold` de la optimización de ruta
  - Pasa filtros completos al backend (date, time_window, service_type, phase)
  - Tabs móviles y filtro lateral sincronizados con `mapFilters.service_type` como single source of truth
  - Fallback defensivo si backend devuelve datos sin filtrar

### Conocidos / Externos
- Google Maps RefererNotAllowedMapError en preview: requiere whitelist del dominio `route-optimize-fresh.preview.emergentagent.com` en Google Cloud Console. Funciona en producción.
- Overpass API a veces devuelve 504 (servicio público externo). Tenemos fallback regional EIA + backend FuelAPI.
