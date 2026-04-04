# Ventura Fresh Laundry - PRD

## Original Problem Statement
Comprehensive AI-powered laundry management system with CRM, ERP, Finances, POS, Stripe, Twilio/SendGrid notifications, AI assistants.

## Architecture
```
shared.py (fastapi_app, sio) <- single source of truth
server.py (entry point) -> server_core.py (routes/DB)
realtime.py (emit helper)
Routes: orders, kpis, finances, ai, store, stripe_payments, operator, etc.
```

## Credentials
- Admin: owner@frimexllc.com / admin123

## State Machine
### Pickup & Delivery
NEW -> CONFIRMED (operator) -> PICKED_UP (driver) -> PROCESSING (operator) -> READY (operator) -> OUT_FOR_DELIVERY (operator) -> DELIVERED (driver) -> COMPLETED (driver)

### Wash & Fold
NEW -> CONFIRMED (operator) -> PROCESSING (operator) -> READY (operator) -> COMPLETED (operator)

### Implementation
- `can_transition(order, new_status, role)` in `/app/backend/routes/operator.py`
- `PD_TRANSITIONS` and `WF_TRANSITIONS` dictionaries
- `OPERATOR_STATUSES` and `DRIVER_STATUSES` validation
- Status history recorded in `status_history` array in each order document

## Driver Endpoint
- `PATCH /api/driver/orders/{id}/status` — Protected by driver role
- `GET /api/driver/orders` — Returns orders assigned to driver

## Revenue/Finance Architecture
All payment endpoints write income entries to `finances` collection:
- POST /api/orders/{id}/payment (cash/zelle/transfer/card)
- POST /api/stripe/confirm-payment (Stripe card payments)
- POST /api/stripe/quick-sale/cash (POS cash sales)
- POST /api/store/checkout/manual (store POS cash)

## POS Quick Sale Payment Methods
1. Tap to Pay — Stripe Terminal SDK with physical NFC reader
2. Tarjeta en Pantalla — Stripe Elements PaymentElement
3. Efectivo — Cash payment with instant completion

## Print Ticket & PDF
- `GET /api/orders/{id}/ticket` — Returns full HTML thermal receipt
- Shows: order number, date, customer, address, lbs x rate, subtotal, delivery fee, processing fee (3% for card), total, payment status/method
- Auto-calls `window.print()` on load
- PDF download via `html2pdf.js` from the same HTML ticket endpoint

## Multi-Payment Notification System
`POST /api/orders/{order_id}/notify-customer`:
- **UNPAID orders**: Multi-payment format with Stripe link, Zelle instructions, Cash option
- **PAID orders**: Thank-you format with checkmarks
- Email: Professional HTML template
- SMS/WhatsApp: Plain text

## Operator Dashboard Tabs Layout
- Tab 1: **Ordenes de Servicio** — POS grid with P&D and W&F order cards
- Tab 2: **Store Orders** — Store orders table + DeliveryZonesManager
- Tab 3: **Mapa Logistico** — Leaflet map with order markers and popups

## Pacific Time (dateUtils.js)
- `formatDatePT()` — Full date+time in PT
- `formatShortDatePT()` — MM/DD/YYYY format
- `formatTimePT()` — Time only in PT
- `formatRelative()` — Relative time (hace 2h, 3d ago)
- Applied to: lastRefresh, SLA deadlines, pickup_date displays

## Completed Features

### Session 2026-04-04 (Phase 1)
- [x] POS Quick Sale with 3 payment methods (Tap, Card, Cash)
- [x] Notification payment links (Stripe URL in SMS/Email)
- [x] CONFIRMED state + state machine validation
- [x] Driver endpoint (PATCH /api/driver/orders/{id}/status)
- [x] Status history tracking (status_history array)
- [x] Print Ticket HTML endpoint with financial breakdown
- [x] Zelle payment method support
- [x] Multi-payment notification format (Stripe/Zelle/Cash)
- [x] TinyURL link shortening for Stripe URLs
- [x] Payment success page (/payment-success)

### Session 2026-04-04 (Phase 2)
- [x] Tabs layout in Operator Dashboard (3 tabs: Orders, Store, Map)
- [x] Fixed broken JSX structure (Map had Dialogs inside MapContainer)
- [x] Removed duplicate map from Store tab
- [x] Pacific Time date formatting (formatShortDatePT for pickup_date)
- [x] PDF download button alongside Print (html2pdf.js)
- [x] Auth header fix for PDF download (403 bug)
- [x] Backend validations: fecha obligatoria, time_window, weight positivo
- [x] Processing fee 3% for card payments

## Backlog — Phase 3 (Upcoming)
- (P1) Delivery Zone Rules: Google Maps Distance Matrix API, fee calculation (0-3mi free, 3-10mi $2.99, >10mi no service)
- (P1) Logistics Map filters: date picker + morning/afternoon (8-12 / 14-18)
- (P2) Mobile support ticket: responsive contact form with channel preference
- (P2) Complex function refactoring: automation_engine.py

## Backlog — Future
- (P3) Automated Stripe Sync every 6 hours (paused by user)
