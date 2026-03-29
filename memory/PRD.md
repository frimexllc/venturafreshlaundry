# Ventura Fresh Laundry — PRD

## Problem Statement
Comprehensive AI-powered laundry management system with enterprise modules, AI assistants, multi-channel notifications, POS, logistics map, bilingual EN/ES, timezone Pacific (PT).

## Architecture
- **Frontend**: React, Tailwind, Leaflet, Stripe SDK, Shadcn/UI
- **Backend**: FastAPI, MongoDB (motor), Pydantic, JWT Auth
- **Storage**: Emergent Object Storage (file uploads/receipts)
- **Timezone**: America/Los_Angeles (Pacific Time)
- **Languages**: Bilingual EN/ES via LocaleContext + t() function
- **Integrations**: Groq LLM, Stripe, Twilio, SendGrid, Nominatim, GPT-4o Vision (OCR), TomTom Traffic

## Modular Backend Architecture
```
/app/backend/
  server.py          → Lightweight FastAPI entry point
  server_core.py     → 531 lines — Pure bootstrap/mount point (COMPLETE)
  realtime.py        → Shared socket.io emission helper
  routes/
    auth_routes.py, dashboard.py, customers.py, orders.py, quotes.py, leads.py,
    tickets.py, users.py, exports.py, calendar.py, services.py, ingest.py,
    audit.py, settings.py, customer_auth.py, operator.py, suppliers.py,
    catalog.py, inventory.py, inventory_alerts.py, finances.py, delivery_rules.py,
    kpis.py, file_uploads.py (+ OCR + analytics), ai_assistant.py, ai_metrics.py,
    ai_admin.py, ai_patterns.py, admin_import.py, traffic.py (TomTom real-time),
    logistics.py, stripe_payments.py, tim.py, voice.py, ai.py, public_forms.py
```

## What's Implemented
- Full public website + FAQ + Legal pages + Bilingual EN/ES
- Admin CRM with all enterprise modules
- Orders CRUD with QR tickets, Stripe checkout, notification workflows
- Logistics Map with real-time TomTom traffic data (15 incidents in Ventura area)
- AI Metrics + Quick Approval + Jarvis operator assistant
- Stripe Payment Elements (inline, tap-to-pay)
- Enterprise: Suppliers, Catalog, Inventory (with alerts), Finances
- KPIs Operational Dashboard
- Camera/File Upload for expense receipts + OCR auto-fill via GPT-4o Vision
- OCR Analytics Dashboard — tracks success rate, field extraction accuracy, top vendors, total amount captured
- Delivery zone rules + payment validation
- CSV export, Customer portal, Operator limited-view
- server_core.py fully refactored to pure bootstrap (531 lines)

## Credentials
- Admin: owner@frimexllc.com / Fr!m3x##$$

## API Keys in .env
- TOMTOM_API_KEY — Real-time traffic for logistics map
- EMERGENT_LLM_KEY — Vision OCR + AI assistant
- STRIPE_API_KEY / STRIPE_PUBLISHABLE_KEY
- TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN
- SENDGRID_API_KEY
- ORS_API_KEY — OpenRouteService

## Known Issues
- None currently broken

## Backlog
- PAUSED: Advanced Stripe Sync (bidirectional) — pending user call
