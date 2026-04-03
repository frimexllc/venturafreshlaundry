# Ventura Fresh Laundry - PRD

## Original Problem Statement
Comprehensive AI-powered laundry management system with CRM, ERP, Finances, POS, Stripe, Twilio/SendGrid notifications, AI assistants.

## Architecture
```
shared.py (fastapi_app, sio) <- single source of truth
server.py (entry point) -> server_core.py (routes/DB)
realtime.py (emit helper)
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
- POST /api/store/checkout/manual (store POS cash)
- POST /api/store/orders/{id}/payment (store order payment)

KPIs endpoints read from `finances` collection as primary source:
- GET /api/kpis/operational
- GET /api/finances/kpis
- GET /api/dashboard/stats

## Backlog
- Automated Stripe Sync every 6 hours (paused)
- Complexity refactoring (update_order_status, generate_daily_briefing)
- OperatorDashboard.jsx refactoring (1300+ lines)
