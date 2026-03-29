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

## Modular Backend Architecture (40+ routes)
```
/app/backend/
  server.py → Lightweight FastAPI entry point
  server_core.py → 518 lines — Pure bootstrap/mount point
  notifications.py → Multi-channel notifications with MongoDB logging
  routes/ → 40+ modular routers including:
    stripe_sync.py → Bidirectional Stripe sync (customers, products, prices)
    notification_metrics.py → Notification analytics endpoint
    traffic.py → TomTom real-time traffic
    file_uploads.py → Object storage + OCR + analytics
    ai_assistant.py, ai_metrics.py, ai_admin.py, ai_patterns.py → AI modules
    admin_import.py → CSV/Excel import with AI mapping
    + orders, customers, finances, inventory, kpis, logistics, etc.
```

## What's Implemented

### Core Systems
- Full public website + FAQ + Legal pages + Bilingual EN/ES
- Admin CRM with all enterprise modules
- Orders CRUD with QR tickets, Stripe checkout, notification workflows
- Customer portal auth, Operator limited-view

### Stripe Bidirectional Sync (Session 5)
- **Push App → Stripe**: Customers (with email/phone/metadata), Products (with prices)
- **Pull Stripe → App**: Import Stripe customers and products/prices into MongoDB
- **Full Sync**: One-click bidirectional sync of all entities
- **Dry Run**: Preview mode to see what would change before syncing
- **Sync History**: Full audit trail of all sync operations

### Notification Metrics Dashboard (Session 5)
- Track all notifications (SMS/WhatsApp/Email) in MongoDB
- Success rate by channel and by event type
- Recent notifications table with status, recipient, timestamp
- Covers both direct sends and orchestrated notifications
- Low-level send functions (send_sms, send_email, send_whatsapp) all log attempts

### Notifications (Fixed - Session 4)
- Wash & Fold: confirmed, processing, ready
- Schedule Pickup: every status except completed
- Quotes/Contact/Support: confirmation based on user preferred contact

### Operator Dashboard (Enhanced - Session 4)
- OrderDetailDialog with lbs input, 4 payment methods, customer info
- AI Operations Assistant, Store POS, Urgent tickets

### Logistics & Traffic (Session 4)
- TomTom real-time traffic API (15+ incidents in Ventura area)

### OCR & Finances (Session 4)
- Receipt OCR via GPT-4o Vision + Analytics Dashboard

## Credentials
- Admin: owner@frimexllc.com / Fr!m3x##$$

## API Keys in .env
- TOMTOM_API_KEY, EMERGENT_LLM_KEY, STRIPE_API_KEY, STRIPE_PUBLISHABLE_KEY
- TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, SENDGRID_API_KEY, ORS_API_KEY

## Known Issues
- None currently broken

## Backlog
- All major features implemented. System is production-ready.
