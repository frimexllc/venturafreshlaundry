# Ventura Fresh Laundry — PRD

## Problem Statement
Comprehensive AI-powered laundry management system with enterprise modules, AI assistants, multi-channel notifications, POS, logistics map, bilingual EN/ES, timezone Pacific (PT).

## Architecture
- **Frontend**: React, Tailwind, Leaflet, Stripe SDK, Shadcn/UI
- **Backend**: FastAPI, MongoDB (motor), Pydantic, JWT Auth
- **Storage**: Emergent Object Storage (file uploads/receipts)
- **Timezone**: America/Los_Angeles (Pacific Time)
- **Languages**: Bilingual EN/ES via LocaleContext + t() function
- **Integrations**: Groq LLM, Stripe, Twilio, SendGrid, Nominatim, GPT-4o Vision (OCR)

## Modular Backend Architecture (31 route files + shared modules)
```
/app/backend/
  server.py          → Lightweight FastAPI entry point (lazy socket.io)
  server_core.py     → 2195 lines remaining (AI endpoints, admin/import, static routes)
  realtime.py        → Shared socket.io emission helper
  routes/
    auth_routes.py   → /api/auth/*
    dashboard.py     → /api/dashboard/*
    customers.py     → /api/customers/*, /api/preferences/*
    orders.py        → /api/orders/* (CRUD, status, payment, QR, Stripe checkout)
    quotes.py        → /api/quotes/*
    leads.py         → /api/leads/*
    tickets.py       → /api/tickets/*
    users.py         → /api/admin/users/*, /api/admin/roles
    exports.py       → /api/export/*
    calendar.py      → /api/calendar/*
    services.py      → /api/services/*, /api/memberships/*, /api/public/services, /api/public/membership-*
    ingest.py        → /api/ingest
    audit.py         → /api/audit-logs
    settings.py      → /api/settings/*, /api/test/*
    customer_auth.py → /api/customer/auth/*, /api/customer/me, /api/customer/orders
    operator.py      → /api/operator/orders
    suppliers.py     → /api/suppliers/*
    catalog.py       → /api/catalog/*
    inventory.py     → /api/inventory/*
    inventory_alerts.py → /api/inventory/alerts
    finances.py      → /api/finances/* (expenses, mileage, vehicles, summary)
    delivery_rules.py → /api/delivery-rules/*
    kpis.py          → /api/kpis/*
    file_uploads.py  → /api/files/* (upload, download, OCR with GPT-4o vision)
    logistics.py, stripe_payments.py, tim.py, voice.py, ai.py, public_forms.py
```

## What's Implemented
- Full public website + FAQ + Legal pages
- Admin CRM with all enterprise modules
- Orders CRUD with QR tickets (SVG), Stripe checkout, notification workflows
- Logistics Map with backend data (traffic MOCKED)
- AI Metrics + Quick Approval + Jarvis operator assistant
- Stripe Payment Elements (inline, tap-to-pay)
- Enterprise: Suppliers, Catalog, Inventory (with alerts), Finances (expenses, mileage, vehicles)
- KPIs Operational Dashboard
- Camera/File Upload for expense receipts + OCR auto-fill (amount, description, date, vendor) via GPT-4o Vision
- Delivery zone rules + payment validation
- CSV export for all entities
- Customer portal auth (register/login)
- Operator limited-view order management
- Bilingual EN/ES on all pages
- Pacific Time (PT) timezone throughout

## Credentials
- Admin: owner@frimexllc.com / Fr!m3x##$$

## Known Issues
- Traffic events in logistics map are MOCKED (simulated data)
- Stripe Checkout conditionally available (requires STRIPE_API_KEY env var)
- Inventory alert SMS/email requires Twilio/SendGrid env vars

## Backlog
- P1: Continue server_core.py refactoring — AI section (~1700 lines remaining, deeply coupled)
- P2: Replace simulated traffic with real traffic API
- PAUSED: Advanced Stripe Sync (bidirectional) — pending user call
