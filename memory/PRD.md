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

## Modular Backend Architecture (29 route files)
```
/app/backend/routes/
  auth_routes.py      → /api/auth/*
  dashboard.py        → /api/dashboard/*
  customers.py        → /api/customers/*, /api/preferences/*
  quotes.py           → /api/quotes/*
  leads.py            → /api/leads/*
  tickets.py          → /api/tickets/*
  users.py            → /api/admin/users/*, /api/admin/roles
  exports.py          → /api/export/* (CSV exports)
  calendar.py         → /api/calendar/*
  suppliers.py        → /api/suppliers/*
  catalog.py          → /api/catalog/*
  inventory.py        → /api/inventory/*
  inventory_alerts.py → /api/inventory/alerts
  finances.py         → /api/finances/*
  delivery_rules.py   → /api/delivery-rules/*
  kpis.py             → /api/kpis/*
  file_uploads.py     → /api/files/* (upload, download, OCR)
  services.py         → /api/services/*, /api/memberships/*, /api/public/services
  ingest.py           → /api/ingest
  audit.py            → /api/audit-logs
  settings.py         → /api/settings/*, /api/test/*
  customer_auth.py    → /api/customer/auth/*, /api/customer/me, /api/customer/orders
  operator.py         → /api/operator/orders
  logistics.py, stripe_payments.py, tim.py, voice.py, ai.py, public_forms.py, orders.py
```
server_core.py: ~2830 lines (Orders, AI endpoints, finances/summary, static web routes)

## Business Rules
- **Delivery Zones**: 7 ZIP codes: 93001/93003/93004/93010/93030/93035/93036
- **Pricing**: First 3 miles FREE, $1.50/mi after, $25 cap
- **Payments**: Card, Zelle, Cash ONLY. No delivery without payment.
- **Catalog**: Authorized brands: Tide, Gain, Foca, Ariel, etc.

## What's Implemented
- Full public website + FAQ
- Admin CRM with all modules
- Logistics Map with real backend data
- AI Metrics + Quick Approval
- Stripe Payment Elements (inline, tap-to-pay)
- Enterprise: Suppliers, Catalog, Inventory, Finances
- KPIs Operational Dashboard
- Ticket SVG (QR + price breakdown + weight)
- Camera/File Upload for expense receipts + OCR auto-fill via GPT-4o Vision
- Delivery zone rules + payment validation
- Inventory Alerts (low stock + stale PO) with SMS/Email capability
- Bilingual EN/ES on all pages
- Pacific Time (PT) timezone throughout
- 22 backend modules extracted from monolith (~978 additional lines removed this session)
- CSV export for customers, orders, leads, quotes, tickets
- Customer portal auth (register/login)
- Operator limited-view order management

## Credentials
- Admin: owner@frimexllc.com / Fr!m3x##$$

## Known Issues
- Traffic events in logistics map are MOCKED
- Inventory alert SMS/email requires Twilio/SendGrid env vars (functional but unconfigured)

## Backlog
- P1: Continue server_core.py refactoring (Orders, AI — ~2830 lines remaining)
- P2: Replace simulated traffic with Google Traffic API
- PAUSED: Advanced Stripe Sync (bidirectional) — pending user call
