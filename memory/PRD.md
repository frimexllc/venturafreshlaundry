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
- Finance Panel with revenue, payment methods, CSV export
- Delivery Zones Management with Leaflet map + CRUD

### Address Autocomplete (Completed - March 20, 2026)
- Reusable `AddressAutocomplete` component using OpenStreetMap/Nominatim
- Integrated across 5 public forms: SchedulePickup, WashFoldRequest, RequestQuotePage, MembershipPage, StorePage
- Features: debounce (350ms), dropdown suggestions, auto-fill city/state/ZIP, keyboard navigation

### AI Agent Metrics (Completed - March 20, 2026)
- Backend: `GET /api/ai/metrics` — aggregates data from ai_command_logs and ai_daily_summaries
- Frontend: `AiMetrics.jsx` — dashboard with stats cards, daily activity chart, action breakdown table, recent logs
- Period filter (7d/30d/90d), refresh button, bilingual

### Quick Approval Mode (Completed - March 20, 2026)
- Backend: `GET /api/ai/pending-actions`, `POST /api/ai/pending-actions/{id}/approve`, `POST /api/ai/pending-actions/{id}/reject`
- Frontend: `QuickApproval.jsx` — cards with action details, payload preview, Approve & Execute / Reject buttons
- Real-time badge showing pending count, bilingual

### OperatorDashboard Refactoring (Completed - March 20, 2026)
- Reduced from 1779 to ~1310 lines (-26%)
- Extracted: `components/operator-dashboard/OrderDetailDialog.jsx` (344 lines)
- Extracted: `components/operator-dashboard/utils.js` (165 lines) — constants, formatters, helpers

## Prioritized Backlog

### PAUSED — Advanced Stripe Sync
- Bidirectional sync (Customers, Products, Prices) between app and Stripe
- User explicitly requested to discuss this on a call before implementing

## Key Files
- `frontend/src/components/AddressAutocomplete.jsx` — reusable address autocomplete
- `frontend/src/pages/AiMetrics.jsx` — AI agent metrics dashboard
- `frontend/src/pages/QuickApproval.jsx` — quick approval panel
- `frontend/src/components/operator-dashboard/OrderDetailDialog.jsx` — extracted order detail dialog
- `frontend/src/components/operator-dashboard/utils.js` — shared constants and utilities
- `frontend/src/pages/OperatorDashboard.jsx` — refactored operator dashboard
- `backend/server.py` — FastAPI entry with AI metrics/approval endpoints
- `backend/notifications.py` — Twilio/SendGrid templates
- `backend/routes/ai.py` — Groq-powered AI endpoints

## Credentials
- Admin: owner@frimexllc.com / admin123
