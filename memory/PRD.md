# Ventura Fresh Laundry — PRD

## Problem Statement
Comprehensive AI-powered laundry management system with: CRUD services, order/ticket management, operator logistics panel, admin panel, Stripe integration, Twilio & SendGrid notifications, AI assistants (Groq), POS system, dynamic shipping, PWA, and bilingual support (EN/ES).

## Architecture
- **Frontend**: React (CRA via Craco), Tailwind CSS, Leaflet, Stripe SDK, Shadcn/UI, Sonner toasts
- **Backend**: FastAPI, MongoDB (motor), Pydantic, JWT Auth
- **Integrations**: Groq LLM, Stripe, Twilio, SendGrid, OpenRouteService, OSRM, Nominatim (geocoding)
- **Deployment**: Deferred-load backend (server.py → server_core.py via background thread)

## Core Modules

### 1. Public Website
- Landing page with services, pricing, about, contact
- Schedule Pickup, Wash & Fold request, Membership, Store, Blog
- Address Autocomplete (Nominatim/OpenStreetMap)
- Bilingual EN/ES

### 2. Admin Dashboard (/admin)
- Dashboard, Customers, Orders, Calendar, Quotes, Leads, Tickets
- Services, Memberships, AI assistant, Store, Blog management
- User Management, Finances, Audit Log, Settings
- AI Metrics (/admin/ai-metrics)
- Quick Approval (/admin/quick-approval)

### 3. Logistics Map / Operator Panel (/admin/operator) — COMPLETE
- Interactive OpenStreetMap with real-time route optimization (2-opt + Time Windows)
- OSRM road-following route polylines
- **Real backend data** via unified `/api/logistics/orders` endpoint (CRM + Store orders merged)
- **Geocoding** via Nominatim with MongoDB cache (`geocode_cache` collection)
- Order markers with pickup/delivery/processing status colors
- Sidebar: Route stats (distance, fuel, ETA), stop list, progress bar
- Filter by order type (Pickup, Airbnb, B2B, Wash & Fold)
- Complete stops workflow with End-of-Day summary modal
- TIM (Transportation Intelligence Module) — AI copilot powered by Groq
  - Text and voice interface (Web Speech API STT/TTS)
  - Wake word "Oye TIM" / "Hey TIM"
  - Voice commands for status changes and stop completion
  - Proactive alerts (traffic, route updates)
- Stripe Payment modal for on-route collections
- Google Maps deep-link for turn-by-turn navigation
- Dark mode, search, route history panel
- Real-time traffic alerts (simulated)
- Nearby Wash & Fold opportunity detection
- Status updates persist to backend DB (both CRM and Store orders)

### 4. POS & Store System
- In-store POS, product sales, cart management
- Dynamic delivery zones with OpenRouteService

### 5. Notifications
- Multi-channel: Twilio SMS/WhatsApp/Voice, SendGrid Email

## Key API Endpoints
- `GET /api/health` — Deployment health check
- `GET /api/logistics/orders` — Unified order feed with geocoded coordinates
- `PUT /api/logistics/orders/{id}/status` — Update order status from map
- `POST /api/tim/chat` — TIM AI assistant (proxies to Groq)
- `GET /api/orders` — CRM orders
- `GET /api/store/orders` — Store orders
- `POST /api/auth/login` — Authentication

## Database Collections
- users, orders, store_orders, customers, quotes, leads, tickets
- services, memberships, delivery_zones, blog_posts
- ai_operator_sessions, ai_pending_actions
- **geocode_cache** — Cached Nominatim geocoding results (address → lat/lng)

## Credentials
- Admin: owner@frimexllc.com / Fr!m3x##$$

## What's Implemented
- Full public website with all pages
- Admin CRM dashboard with all modules
- Logistics Map Operator Panel with real backend data (COMPLETE)
- AI Metrics and Quick Approval admin pages
- Address Autocomplete on public forms
- Multi-channel notifications (Twilio/SendGrid)
- Deferred-loading backend for K8s deployment

## Known Issues
- Deployment timeout (120s) — Backend starts but K8s health check may fail intermittently
- Traffic events are MOCKED (client-side simulation)

## Backlog
- P0: Fix 120s deployment timeout
- P1: Advanced Stripe Sync (PAUSED — pending user call)
- P2: Refactor server_core.py into modular route files (~4400 lines remaining)
