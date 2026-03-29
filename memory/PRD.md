# Ventura Fresh Laundry — PRD

## Problem Statement
Comprehensive AI-powered laundry management system with enterprise modules (CRM, ERP, Finances, Inventory, Catalog, Suppliers), AI assistants, multi-channel notifications, POS system, logistics map, and bilingual support (EN/ES).

## Architecture
- **Frontend**: React (CRA/Craco), Tailwind CSS, Leaflet, Stripe SDK, Shadcn/UI
- **Backend**: FastAPI, MongoDB (motor), Pydantic, JWT Auth
- **Storage**: Emergent Object Storage (file uploads)
- **Integrations**: Groq LLM, Stripe, Twilio, SendGrid, OpenRouteService, OSRM, Nominatim

## Modular Backend Architecture (20 route files)
```
/app/backend/routes/
  auth_routes.py    → /api/auth/* 
  dashboard.py      → /api/dashboard/*
  customers.py      → /api/customers/*, /api/preferences/*
  quotes.py         → /api/quotes/*
  leads.py          → /api/leads/*
  tickets.py        → /api/tickets/*
  suppliers.py      → /api/suppliers/*
  catalog.py        → /api/catalog/*
  inventory.py      → /api/inventory/*
  finances.py       → /api/finances/*
  delivery_rules.py → /api/delivery-rules/* (ZIP zones, pricing, payment validation)
  kpis.py           → /api/kpis/* (operational dashboard)
  file_uploads.py   → /api/files/* (camera/receipt uploads)
  logistics.py      → /api/logistics/*
  stripe_payments.py→ /api/stripe-payments/*
  tim.py, voice.py, ai.py, public_forms.py
```

## Business Rules
- **Delivery Zones**: 7 ZIP codes: 93001, 93003, 93004 (Ventura), 93010 (Camarillo), 93030, 93035, 93036 (Oxnard)
- **Pricing**: First 3 miles FREE, $1.50/mile after, $25 cap
- **Payments**: Card, Zelle, Cash ONLY. No delivery without payment confirmation.
- **Catalog**: Authorized brands: Tide, Gain, Foca, Ariel, Arm & Hammer, OxiClean, Suavitel, Downy, Snuggle, Bounce, Clorox, Cloralen

## What's Implemented (Complete)
- Full public website (all pages + FAQ)
- Admin CRM with all modules
- Logistics Map with real backend data
- AI Metrics + Quick Approval
- Stripe Payment Elements (inline, tap-to-pay)
- Enterprise: Suppliers, Catalog, Inventory, Finances
- KPIs Operational Dashboard (17 metric cards)
- Ticket SVG redesigned (QR + price breakdown + weight metrics)
- **Camera/File Upload for expense receipts** (Emergent Object Storage)
- Delivery zone rules + payment validation
- Multi-channel notifications (Twilio/SendGrid)
- 13 backend route modules extracted from monolith

## Credentials
- Admin: owner@frimexllc.com / Fr!m3x##$$

## Known Issues
- Traffic events in logistics map are MOCKED

## Backlog
- P1: Continue server_core.py refactoring (Orders, Services, AI — ~3500 lines remaining)
- P2: Inventory alerts via Twilio/SendGrid when stock drops below minimum
- P2: Replace simulated traffic with Google Traffic API
- PAUSED: Advanced Stripe Sync (bidirectional) — pending user call
