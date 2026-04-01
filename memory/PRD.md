# Ventura Fresh Laundry - PRD

## Original Problem Statement
Comprehensive AI-powered laundry management system featuring:
1. Laundry Management Module (CRUD services, order/ticket management, operator panel, admin panel)
2. Stripe Integration (single payments and recurring memberships)
3. Twilio & SendGrid Integration (SMS/WhatsApp/Email notifications)
4. AI-Powered Management (Groq LLM assistants for public and operators)
5. Store & POS (in-store POS, product sales, dynamic shipping, cart management)
6. PWA & UX (splash screens, bilingual EN/ES, legal policies)
7. Enterprise Architecture (CRM, ERP, Finances, Inventory, Delivery Zones, Route Optimization)

## Tech Stack
- Frontend: React, Tailwind CSS, Shadcn/UI, Web Speech API
- Backend: FastAPI, MongoDB (motor), Pydantic
- Integrations: Twilio, SendGrid, Groq (emergentintegrations), Stripe, TomTom Traffic API
- Realtime: Socket.io
- Rules: Bilingual t("EN","ES"), Pacific/Los_Angeles timezone, Distances in MILES

## State Flows
### Pickup & Delivery
NEW -> CONFIRMED -> PICKED_UP -> PROCESSING -> READY -> OUT_FOR_DELIVERY -> DELIVERED -> COMPLETED

### Wash & Fold
NEW -> CONFIRMED -> PROCESSING -> READY -> COMPLETED

## Credentials
- Admin: owner@frimexllc.com / admin123

## Changes (2026-04-01, Session 2)
### Product Selection in LogisticsMap
- "Vender" button in product inventory passes product data to QuickSaleModal
- QuickSaleModal accepts `initialProduct` prop, pre-fills amount and description

### Z-Index Fix for Maps
- Added CSS in index.css to contain Leaflet within stacking context (z-index: 0)
- Map container wrapper in OperatorDashboard with position:relative, zIndex:0
- Dialog modals (z-50) now render above maps correctly

### Miles Instead of KM
- DeliveryZonesManager: "Radius (mi)", "Rate/mi", "$X/mi"
- StorePage: distance_km * 0.621371 displayed as "mi"
- OperatorDashboard: already uses Haversine with R=3959 miles

## Backlog
- Automated Stripe Sync every 6 hours (paused per user request)
- OperatorDashboard.jsx refactoring (1300+ lines)
