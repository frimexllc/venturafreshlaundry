# Ventura Fresh Laundry — PRD

## Original Problem Statement
AI-powered laundry management system (Ventura Fresh Laundry) with:
1. Laundry Management Module: CRUD services, order/ticket management, operator & admin panels
2. Stripe Integration: Single payments and recurring memberships
3. Twilio & SendGrid: SMS/WhatsApp/Email notifications for order status
4. AI-Powered Management: AI assistants (Groq) for public users and operators
5. Store & POS: In-store POS, product sales, dynamic shipping, cart management
6. PWA & UX: Splash screens, bilingual (EN/ES), legal policies, optimized form UX

## Tech Stack
- Frontend: React, Tailwind CSS, Shadcn/UI, Web Speech API
- Backend: FastAPI, MongoDB (motor), Pydantic
- Realtime: Socket.io
- Integrations: Twilio (SMS/WhatsApp), SendGrid (Email), Groq (LLM via emergentintegrations), Stripe, OpenRouteService

## What's Been Implemented

### Core Features (Completed)
- Role-based access (Admin, Operator, Customer)
- Order/ticket management with status tracking
- POS system for operators
- Dynamic shipping quotes via OpenRouteService
- Multi-channel notifications (Twilio SMS/WhatsApp + SendGrid Email)
- Animated PWA Splash Screen (3 variants, 3.5s duration)
- Public Voice Assistant for customer inquiries
- "Jarvis" Operator Voice Assistant at /admin/operator/agent
- Bilingual support (EN/ES)
- Legal policies (TOS, Privacy Policy)
- SMS consent checkboxes on all forms
- SEO/Favicon with Ventura logo
- Stripe checkout for memberships and store products

### Address Autocomplete (Completed - March 20, 2026)
- Reusable `AddressAutocomplete` component using OpenStreetMap/Nominatim
- Integrated across 5 public forms: SchedulePickup, WashFoldRequest, RequestQuotePage, MembershipPage, StorePage
- Features: debounce (350ms), dropdown suggestions, auto-fill city/state/ZIP, keyboard navigation (arrows, Enter, Escape)
- 100% test pass rate (iteration_15)

## Prioritized Backlog

### P1 — Finance Panel
- Backend endpoints + UI for Admin/Finances.jsx
- Revenue, payment methods, CSV export

### P2 — Delivery Zone Management
- Map-based interface for defining service areas

### P2 — Operator AI Metrics
- Performance tracking for the Operator AI agent

### P2 — Quick Approval Mode
- Approve/Reject buttons for operator AI critical actions

### PAUSED — Advanced Stripe Sync
- Bidirectional sync (Customers, Products, Prices) between app and Stripe
- User explicitly requested to discuss this on a call before implementing

## Refactoring Needs
- `OperatorDashboard.jsx` (~2000 lines) — needs to be split into smaller components

## Key Files
- `frontend/src/components/AddressAutocomplete.jsx` — reusable address autocomplete
- `frontend/src/pages/SchedulePickup.jsx`, `WashFoldRequest.jsx`, `RequestQuotePage.jsx`, `MembershipPage.jsx`, `StorePage.jsx` — public forms
- `backend/notifications.py` — Twilio/SendGrid templates
- `backend/routes/ai.py` & `frontend/src/components/operator-agent/*` — Operator AI
- `backend/server.py` — FastAPI entry

## Credentials
- Admin: owner@frimexllc.com / admin123
