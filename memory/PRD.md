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
- Rules: Bilingual t("EN","ES"), Pacific/Los_Angeles timezone, Distances in MILES

## Credentials
- Admin: owner@frimexllc.com / admin123

## State Flows
### Pickup & Delivery
NEW -> CONFIRMED -> PICKED_UP -> PROCESSING -> READY -> OUT_FOR_DELIVERY -> DELIVERED -> COMPLETED

### Wash & Fold
NEW -> CONFIRMED -> PROCESSING -> READY -> COMPLETED

## Key API Endpoints
- GET /api/health
- GET /api/automation/operator-dashboard
- PUT /api/automation/orders/{id}/status
- POST /api/orders/{id}/payment (creates finance ledger entry)
- POST /api/orders/{id}/notify-customer (direct SMS/Email/WhatsApp)
- GET /api/orders/{id}/qr.svg (no auth required)
- POST /api/store/checkout (Stripe, optional customer fields)
- POST /api/store/checkout/manual (cash/transfer, optional customer fields)
- POST /api/store/orders/{id}/send-payment-link (sms/email link)
- GET /api/stripe/publishable-key
- POST /api/stripe/quick-sale
- POST /api/stripe/confirm-payment (creates finance entry)
- GET /api/store/products

## Changes (2026-04-01)

### Session 1 - P0 Fixes
- State machine updated (P&D 8 steps, W&F 5 steps with CONFIRMED)
- Print Ticket: QR.svg no auth required
- Registrar Pago: Creates finance entries (orders + store)
- Store POS simplified: 4 quick payment buttons, no customer form
- Notify Customer: Direct SMS/Email/WhatsApp with lbs + total

### Session 2 - Stripe & Notifications
- Stripe POS flow validated end-to-end (publishable key, quick-sale, checkout, confirm)
- confirm-payment now creates finance ledger entry
- notify-customer endpoint: direct SMS/Email/WhatsApp with order details
- OrderDetailDialog: channel selector (SMS/Email/WhatsApp) + send button
- React hooks bug fixed (useState before early return)
- Product selection → QuickSaleModal pre-filled
- Z-index fix for maps overlapping modals
- Distances in miles (DeliveryZones, StorePage)

## Backlog
- Automated Stripe Sync every 6 hours (paused per user request)
- OperatorDashboard.jsx refactoring (1300+ lines)
