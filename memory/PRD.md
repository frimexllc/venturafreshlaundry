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

## Key API Endpoints
- GET /api/health
- GET /api/automation/operator-dashboard
- PUT /api/automation/orders/{id}/status
- POST /api/orders/{id}/payment (creates finance ledger entry)
- GET /api/orders/{id}/qr.svg (no auth required)
- GET /api/ai/metrics
- GET /api/ai/pending-actions

## State Flows (Updated 2026-03-29)
### Pickup & Delivery
NEW -> CONFIRMED -> PICKED_UP -> PROCESSING -> READY -> OUT_FOR_DELIVERY -> DELIVERED -> COMPLETED

### Wash & Fold
NEW -> CONFIRMED -> PROCESSING -> READY -> COMPLETED

## Key DB Collections
- orders, customers, services, finances, expenses
- ai_operator_sessions, ai_pending_actions
- delivery_zones, payment_transactions
- eventos_automation, _audit_log, notification_queue
