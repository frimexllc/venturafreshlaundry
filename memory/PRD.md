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

## Architecture
```
shared.py (fastapi_app, sio) <- single source of truth
    |               |
server.py       server_core.py
(entry point)   (all routes/DB)
    |
realtime.py (emit helper)
```

## Credentials
- Admin: owner@frimexllc.com / admin123

## State Flows
### Pickup & Delivery
NEW -> CONFIRMED -> PICKED_UP -> PROCESSING -> READY -> OUT_FOR_DELIVERY -> DELIVERED -> COMPLETED

### Wash & Fold
NEW -> CONFIRMED -> PROCESSING -> READY -> COMPLETED

## Bug Fixes (2026-04-03)
1. **Stripe redirect fix**: Frontend used `data.checkout_url` but backend returns `data.url`. Fixed to `data.url || data.checkout_url`
2. **Stripe return handler**: Added useEffect to handle `session_id` + `order_id` URL params on Stripe return, calls `confirm-payment` and creates finance entry
3. **Finance entry categories**: `service_payment` for laundry orders, `store_sale` for store orders
4. **Notify Customer**: Direct SMS/Email/WhatsApp with actual lbs, total, status, payment status

## Backlog
- Automated Stripe Sync every 6 hours (paused per user request)
- Complexity refactoring: update_order_status(), generate_daily_briefing()
- OperatorDashboard.jsx refactoring (1300+ lines)
