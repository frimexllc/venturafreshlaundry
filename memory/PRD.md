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

## Architecture (Updated 2026-04-01)
```
shared.py (fastapi_app, sio) ← single source of truth
    ↑               ↑
server.py       server_core.py
(entry point)   (all routes/DB)
    ↑
realtime.py (emit helper)
```

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
- POST /api/orders/{id}/payment (creates finance entry)
- POST /api/orders/{id}/notify-customer (direct SMS/Email/WhatsApp)
- GET /api/orders/{id}/qr.svg (no auth required)
- POST /api/store/checkout (Stripe, optional customer fields)
- POST /api/store/checkout/manual (cash/transfer, creates finance entry)
- POST /api/store/orders/{id}/send-payment-link (sms/email link)
- POST /api/stripe/quick-sale
- POST /api/stripe/confirm-payment (creates finance entry)

## Code Quality Fixes Applied (2026-04-01)
1. **Syntax Error**: Fixed unterminated string literals in routes/ai.py (lines 200, 218, 400-436, 613)
2. **Circular Import**: Extracted shared.py module; server.py and server_core.py both import from shared.py
3. **Hardcoded Secrets**: All test files now use os.environ.get() for credentials
4. **Linting**: All Python files pass ruff checks

## Backlog
- Automated Stripe Sync every 6 hours (paused per user request)
- Complexity refactoring: update_order_status() (35 complexity), generate_daily_briefing() (24 complexity)
- OperatorDashboard.jsx refactoring (1300+ lines)
