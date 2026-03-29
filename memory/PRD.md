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
  server.py → Lightweight FastAPI entry point
  server_core.py → 531 lines — Pure bootstrap/mount point (COMPLETE)
  notifications.py → Multi-channel (SMS/WhatsApp/Email) notification engine
  routes/ → 35+ modular routers
```

## What's Implemented

### Core Systems
- Full public website + FAQ + Legal pages + Bilingual EN/ES
- Admin CRM with all enterprise modules
- Orders CRUD with QR tickets, Stripe checkout, notification workflows
- Customer portal auth (register/login), Operator limited-view

### Notifications (Fixed - Session 4)
- **Wash & Fold**: Notifications on confirmed, processing, and ready
- **Schedule Pickup**: Notifications on every status except completed
- **Quotes**: "Received your request" confirmation
- **Contact**: "Received your request, we'll contact you" confirmation
- **Support**: Same as contact
- All notifications respect user's preferred contact method (SMS/WhatsApp/Email)

### Operator Dashboard (Enhanced - Session 4)
- Full POS grid with Pickup & Delivery + Wash & Fold sections
- OrderDetailDialog with: customer info, addresses, notes, preferences
- **Lbs Input**: Enter actual lbs, auto-recalculates total amount
- **Payment Collection**: 4 methods (Stripe/Tap-to-Pay, Cash with change calc, Transfer, Other)
- AI Operations Assistant for natural-language order management
- Store POS for product sales
- Urgent tickets panel

### Logistics & Traffic (Session 4)
- Real-time TomTom Traffic API (15+ incidents in Ventura area, cached 5min)
- Replaced simulated traffic data

### OCR & Finances (Session 4)
- Receipt OCR via GPT-4o Vision (amount, vendor, date, description)
- OCR Analytics Dashboard with success rates, field extraction accuracy, top vendors

### Enterprise Modules
- Suppliers, Catalog, Inventory (with alerts), Finances (expenses, mileage, vehicles)
- KPIs Operational Dashboard, AI Metrics, Quick Approval

## Credentials
- Admin: owner@frimexllc.com / Fr!m3x##$$

## API Keys in .env
- TOMTOM_API_KEY, EMERGENT_LLM_KEY, STRIPE keys, TWILIO keys, SENDGRID_API_KEY, ORS_API_KEY

## Backlog
- PAUSED: Advanced Stripe Sync (bidirectional) — pending user call
