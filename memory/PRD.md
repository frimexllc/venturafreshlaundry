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
- (P4) Split CustomerAccount.jsx into subcomponents (PendingPayments, OrderHistory, Preferences)
