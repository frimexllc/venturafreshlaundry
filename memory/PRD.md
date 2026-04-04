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

## State Machine (Updated 2026-04-04)
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

## Print Ticket (Updated 2026-04-04)
- `GET /api/orders/{id}/ticket` — Returns full HTML thermal receipt
- Shows: order number, date, customer, address, lbs x rate, subtotal, delivery fee, processing fee (3% for card), total, payment status/method
- Auto-calls `window.print()` on load

## Multi-Payment Notification System (Updated 2026-04-04)
`POST /api/orders/{order_id}/notify-customer`:
- **UNPAID orders**: Multi-payment format with:
  - Stripe payment link (shortened via TinyURL)
  - Zelle instructions (payments@venturafreshlaundry.com)
  - Cash option
  - Financial breakdown (lbs x rate, delivery, total)
- **PAID orders**: Thank-you format with checkmarks
- Email: Professional HTML template with gradient header, payment button
- SMS/WhatsApp: Plain text with emojis

## Completed Features (This Session - 2026-04-04)
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

## Backlog — Phase 2 (UX & Validaciones)
- (P1) Timezone correction: UTC backend + Pacific Time frontend (moment-timezone/date-fns-tz)
- (P1) Tabs in Operator Dashboard: "Ordenes de Servicio" / "Store Orders" / "Mapa Logístico"
- (P1) Additional validations: fecha obligatoria, time_window, weight positivo, processing fee 3%
- (P2) Print + PDF dual buttons (html2pdf.js or weasyprint)

## Backlog — Phase 3 (Features Avanzados)
- (P2) Delivery Zone Rules: Google Maps Distance Matrix API, fee calculation (0-3mi free, 3-10mi $2.99, >10mi no service)
- (P2) Logistics Map filters: date picker + morning/afternoon (8-12 / 14-18)
- (P2) Mobile support ticket: responsive contact form with channel preference
- (P2) Complex function refactoring: automation_engine.py, ai_assistant.py
- (P3) Automated Stripe Sync every 6 hours (paused by user)
