# Ventura Fresh Laundry — PRD

## Problem Statement
Comprehensive AI-powered laundry management system with: CRUD services, order/ticket management, operator logistics panel, admin panel, Stripe integration, Twilio & SendGrid notifications, AI assistants (Groq), POS system, dynamic shipping, PWA, bilingual support (EN/ES), and enterprise modules (CRM, ERP, Finances, Inventory, Catalog, Suppliers).

## Architecture
- **Frontend**: React (CRA via Craco), Tailwind CSS, Leaflet, Stripe SDK, Shadcn/UI
- **Backend**: FastAPI, MongoDB (motor), Pydantic, JWT Auth
- **Integrations**: Groq LLM, Stripe, Twilio, SendGrid, OpenRouteService, OSRM, Nominatim
- **Deployment**: Deferred-load backend (server.py -> server_core.py via background thread)

## Modular Backend Architecture (Refactored)
```
/app/backend/routes/
  auth_routes.py    → /api/auth/* (register, login, me)
  dashboard.py      → /api/dashboard/* (stats, activity)
  customers.py      → /api/customers/*, /api/preferences/*, /api/customer/*
  quotes.py         → /api/quotes/*
  leads.py          → /api/leads/*
  tickets.py        → /api/tickets/*
  suppliers.py      → /api/suppliers/*
  catalog.py        → /api/catalog/*
  inventory.py      → /api/inventory/*
  finances.py       → /api/finances/*
  delivery_rules.py → /api/delivery-rules/* (ZIP zones, pricing, payment validation)
  kpis.py           → /api/kpis/* (operational dashboard)
  logistics.py      → /api/logistics/*
  stripe_payments.py→ /api/stripe-payments/*
  tim.py            → /api/tim/*
  voice.py          → Voice/call routes
  public_forms.py   → Public form submissions
```
server_core.py still holds: Orders, Services/Memberships, AI Assistant, AI Metrics, 
Quick Approval, Ingest/Routing, Audit Log, Exports, Calendar, Notifications, 
Customer Auth, User Management, Operator endpoints (~3500 lines remaining)

## Business Rules (Implemented)
- **Delivery Zones**: 7 authorized ZIP codes: 93001, 93003, 93004 (Ventura core), 93010 (Camarillo), 93030, 93035, 93036 (Oxnard extended)
- **Pricing**: First 3 miles FREE, $1.50/mile after, max $25 cap
- **Payment Methods**: Card, Zelle, Cash ONLY. No delivery without payment confirmation.

## What's Implemented
- Full public website with all pages including FAQ
- Admin CRM dashboard with all modules
- Logistics Map Operator Panel with real backend data
- AI Metrics and Quick Approval admin pages
- Address Autocomplete on public forms
- Multi-channel notifications (Twilio/SendGrid)
- Deferred-loading backend for K8s deployment
- Stripe Payment Elements (inline, tap-to-pay)
- Enterprise Modules: Suppliers, Catalog, Inventory, Finances
- KPIs Operational Dashboard (consolidated metrics)
- Redesigned Ticket SVG with QR, price breakdown, weight metrics
- Modular backend: 12 route files extracted from monolith
- Sidebar navigation with all module groups active

## Credentials
- Admin: owner@frimexllc.com / Fr!m3x##$$

## Known Issues
- Traffic events in logistics map are MOCKED (client-side simulation)

## Backlog
- P1: Continue server_core.py refactoring (orders, services, AI sections)
- P2: Replace simulated traffic with Google Traffic API
- PAUSED: Advanced Stripe Sync (bidirectional) — pending user call
