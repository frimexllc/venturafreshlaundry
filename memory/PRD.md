# Ventura Fresh Laundry - PRD

## Original Problem Statement
Comprehensive AI-powered laundry management system with CRM, ERP, Finances, POS, Stripe, Twilio/SendGrid notifications, AI assistants.

## Architecture
```
shared.py (fastapi_app, sio) <- single source of truth
server.py (entry point) -> server_core.py (routes/DB)
realtime.py (emit helper)
Routes: orders, kpis, finances, ai, store, stripe_payments, etc.
```

## Credentials
- Admin: owner@frimexllc.com / admin123

## State Flows
- P&D: NEW -> CONFIRMED -> PICKED_UP -> PROCESSING -> READY -> OUT_FOR_DELIVERY -> DELIVERED -> COMPLETED
- W&F: NEW -> CONFIRMED -> PROCESSING -> READY -> COMPLETED

## Revenue/Finance Architecture (Updated 2026-04-03)
All payment endpoints write income entries to `finances` collection:
- POST /api/orders/{id}/payment (service order cash/transfer)
- POST /api/stripe/confirm-payment (Stripe card payments)
- POST /api/stripe/quick-sale/cash (POS cash sales) **NEW**
- POST /api/store/checkout/manual (store POS cash)
- POST /api/store/orders/{id}/payment (store order payment)

KPIs endpoints read from `finances` collection as primary source:
- GET /api/kpis/operational
- GET /api/finances/kpis
- GET /api/dashboard/stats

## POS Quick Sale Payment Methods (Updated 2026-04-03)
The QuickSaleModal in LogisticsMap supports 3 payment methods:
1. **Tap to Pay** — Stripe Terminal SDK with physical NFC reader (card_present)
2. **Tarjeta en Pantalla** — Stripe Elements PaymentElement (card, Apple Pay, Google Pay)
3. **Efectivo** — Cash payment with instant completion

### Key POS Endpoints:
- POST /api/stripe/quick-sale — Card PaymentIntent
- POST /api/stripe/quick-sale/cash — Cash sale (instant, writes to store_orders + finances)
- POST /api/stripe/quick-sale/terminal — Terminal PaymentIntent (card_present)
- POST /api/stripe/terminal/connection-token — Terminal SDK authentication
- POST /api/stripe/confirm-payment — Confirms card/terminal payments

## Backlog
- (P1) Complexity refactoring: automation_engine.py, ai_assistant.py
- (P2) Automated Stripe Sync every 6 hours (paused by user)
- (P2) OperatorDashboard.jsx refactoring (1300+ lines)
