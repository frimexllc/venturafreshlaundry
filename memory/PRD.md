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
- Realtime: Socket.io (lazy-loaded)
- Integrations: Twilio (SMS/WhatsApp), SendGrid (Email), Groq (LLM via emergentintegrations), Stripe, OpenRouteService

## Architecture (Post-Refactoring)
```
backend/
├── server.py          # Lightweight entry (lazy socketio via _SwappableASGI)
├── server_core.py     # Route endpoints (~4489 lines)
├── database.py        # MongoDB connection singleton, JWT config
├── models.py          # All Pydantic models + role constants
├── auth.py            # JWT helpers, role-based access
├── utils.py           # QR, ticket formatting, order helpers, AI helpers
├── normalization.py   # Data normalization functions
├── notifications.py   # Twilio/SendGrid
├── ai_assistant.py    # AI briefing/analysis
├── automation_engine.py
├── blog.py
├── store.py
├── n8n_integration.py
├── stripe_sync_scaffold.py
└── routes/
    ├── ai.py
    ├── orders.py        # (orphaned — not yet connected)
    ├── public_forms.py
    └── voice.py
```

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
- Integrated across 5 public forms

### AI Agent Metrics (Completed - March 20, 2026)
- Backend: `GET /api/ai/metrics`
- Frontend: `AiMetrics.jsx` dashboard with stats, charts, filters

### Quick Approval Mode (Completed - March 20, 2026)
- Backend: CRUD for pending AI actions
- Frontend: `QuickApproval.jsx` with approve/reject flows

### OperatorDashboard Refactoring (Completed - March 20, 2026)
- Reduced from 1779 to ~1310 lines
- Extracted: OrderDetailDialog.jsx, utils.js

### Deployment Fix — Lazy SocketIO (Completed - March 21, 2026)
- Removed `import socketio` from server.py top-level
- Created `_SwappableASGI` wrapper class for hot-swapping ASGI app
- Port binds in ~0.30s (was timing out at 60s)
- Health check `/api/health` responds before any heavy imports
- Deployment agent verified: PASS

### Backend Modularization (Completed - March 21, 2026)
- Extracted ~877 lines from server_core.py into 4 shared modules:
  - `database.py` — MongoDB singleton, JWT config
  - `models.py` — All Pydantic models + role constants
  - `auth.py` — JWT, password hashing, role-based access
  - `utils.py` — QR generation, ticket formatting, order/AI helpers
- server_core.py reduced from 5366 → 4489 lines
- All 15 API tests passed + frontend verified

## Prioritized Backlog

### PAUSED — Advanced Stripe Sync
- Bidirectional sync (Customers, Products, Prices) between app and Stripe
- User explicitly requested to discuss this on a call before implementing

### Future Tasks
- Further modularization: extract route groups into routes/ directory
- Connect orphaned routes/orders.py and routes/ai.py
- Performance optimization of heavy AI endpoints

## Key Files
- `backend/server.py` — Lightweight entry point with lazy socketio
- `backend/server_core.py` — Main routes (~4489 lines)
- `backend/database.py` — DB connection singleton
- `backend/models.py` — Shared Pydantic models
- `backend/auth.py` — Auth helpers
- `backend/utils.py` — Shared utilities

## Credentials
- Admin: owner@frimexllc.com / admin123
