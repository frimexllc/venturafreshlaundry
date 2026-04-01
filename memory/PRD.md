# Ventura Fresh Laundry - PRD

## Original Problem Statement
Comprehensive AI-powered laundry management system featuring:
1. Laundry Management Module (CRUD services, order/ticket management, operator panel, admin panel)
2. Stripe Integration (single payments and recurring memberships)
3. Twilio & SendGrid Integration (SMS/WhatsApp/Email notifications)
4. AI-Powered Management (Groq LLM assistants for public and operators)
5. Store & POS (in-store POS, product sales, dynamic shipping, cart management)
6. PWA & UX (splash screens, bilingual EN/ES, legal policies)
7. Enterprise Architecture (CRM, ERP, Finances, Inventory, Delivery Zones, Route Optimization)

## Tech Stack
- Frontend: React, Tailwind CSS, Shadcn/UI, Web Speech API
- Backend: FastAPI, MongoDB (motor), Pydantic
- Integrations: Twilio, SendGrid, Groq (emergentintegrations), Stripe, TomTom Traffic API
- Realtime: Socket.io
- Rules: Bilingual t("EN","ES"), Pacific/Los_Angeles timezone

## Core User Personas
- **Admin/Owner**: Full CRM/ERP access, finances, reports
- **Operator**: Order status updates, POS, ticket printing, payment capture
- **Customer**: Public forms, order tracking, membership management

## What's Been Implemented
- Full modular backend (routes split from server_core.py monolith)
- Operator Dashboard with 3-column layout per service type
- Real-time TomTom Traffic API for logistics
- OCR Analytics Dashboard
- Bidirectional Stripe Synchronization
- Notification Metrics Dashboard
- AI Voice Assistants (Public + Operator Jarvis)
- Address Autocomplete (Nominatim/OpenStreetMap)
- AI Metrics Dashboard + Quick Approval Panel
- Delivery Zones Manager with interactive map

## Credentials
- Admin: owner@frimexllc.com / admin123

## State Flows (Updated 2026-04-01)
### Pickup & Delivery
NEW -> CONFIRMED -> PICKED_UP -> PROCESSING -> READY -> OUT_FOR_DELIVERY -> DELIVERED -> COMPLETED

### Wash & Fold
NEW -> CONFIRMED -> PROCESSING -> READY -> COMPLETED

## Key API Endpoints
- GET /api/health
- GET /api/automation/operator-dashboard
- PUT /api/automation/orders/{id}/status
- POST /api/orders/{id}/payment (creates finance ledger entry)
- GET /api/orders/{id}/qr.svg (no auth required)
- POST /api/store/checkout/manual (optional customer fields)
- POST /api/store/orders/{id}/send-payment-link (sms/email channel)
- GET /api/store/products
- GET /api/ai/metrics
- GET /api/ai/pending-actions

## Changes Made (2026-04-01)

### P0 - Operator Dashboard State Machine & Columns
- Updated P&D flow: NEW→CONFIRMED→PICKED_UP→PROCESSING→READY→OUT_FOR_DELIVERY→DELIVERED→COMPLETED
- Updated W&F flow: NEW→CONFIRMED→PROCESSING→READY→COMPLETED (CONFIRMED now allowed)
- Updated dashboard bucket sorting for correct column placement
- Updated column titles: "Created / Confirmed", "Request Payment", "In Process / Ready / Out for Delivery"

### P0 - Print Ticket Fix
- Removed auth requirement from GET /api/orders/{id}/qr.svg endpoint
- Fixed frontend fetch calls with proper headers

### P0 - Payment Registration to Finances DB
- Fixed frontend URL from /capture-payment to /payment  
- Added finance ledger entry creation in POST /api/orders/{id}/payment
- Added finance ledger entry creation in POST /api/store/orders/{id}/payment
- Added finance ledger entry creation in POST /api/store/checkout/manual

### P0 - Store POS Simplification
- Removed customer form fields (Name, Phone, Email, Fulfillment, Notes, Address)
- Added 4 quick payment buttons: Tap/Card, Cash, Link SMS, Link Email
- Made customer fields optional in CheckoutRequest model
- Created POST /api/store/orders/{id}/send-payment-link endpoint

### P1 - Notify Customer Enhancement
- Updated notification payload to include actual_lbs, calculated total, and payment status

### Product Inventory in LogisticsMap
- Added collapsible product inventory panel in sidebar
- Product search functionality
- Quick "Vender" button linking to QuickSaleModal

## Key DB Collections
- orders, customers, services, finances, expenses
- store_orders, carts, products, payment_transactions
- ai_operator_sessions, ai_pending_actions
- delivery_zones, eventos_automation, _audit_log

## Backlog
- Automated Stripe Sync every 6 hours (paused per user request)
- OperatorDashboard.jsx refactoring (1300+ lines)
