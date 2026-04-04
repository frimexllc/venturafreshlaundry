# Ventura Fresh Laundry - PRD

## Original Problem Statement
Comprehensive AI-powered laundry management system with CRM, ERP, Finances, POS, Stripe, Twilio/SendGrid notifications, AI assistants, delivery logistics.

## Architecture
```
shared.py (fastapi_app, sio) <- single source of truth
server.py (entry point) -> server_core.py (routes/DB)
realtime.py (emit helper)
Routes: orders, kpis, finances, ai, store, stripe_payments, operator, geocode, logistics, etc.
```

## Credentials
- Admin: owner@frimexllc.com / admin123

## State Machine
### Pickup & Delivery
NEW -> CONFIRMED -> PICKED_UP -> PROCESSING -> READY -> OUT_FOR_DELIVERY -> DELIVERED -> COMPLETED

### Wash & Fold
NEW -> CONFIRMED -> PROCESSING -> READY -> COMPLETED

## Delivery Zone Rules
- API: `GET /api/geocode/distance?lat=&lng=` (OpenRouteService driving distance)
- 0-3 miles: Free delivery ($0)
- 3-10 miles: $2.99 delivery fee
- >10 miles: Delivery not available (rejected)
- Store coordinates: 34.283, -119.293 (Ventura, CA)

## Operator Dashboard Tabs
- Tab 1: **Ordenes de Servicio** — POS grid with P&D and W&F order cards, Print+PDF buttons
- Tab 2: **Store Orders** — Store orders table + DeliveryZonesManager
- Tab 3: **Mapa Logistico** — Leaflet map with order markers + MapFilters (date picker, Morning/Afternoon)

## Logistics Map Filters
- Date picker: Filters orders by `pickup_date`
- Morning (8-12): Filters by `pickup_time_window=8-12`
- Afternoon (14-18): Filters by `pickup_time_window=14-18`
- Backend: `GET /api/logistics/orders?date=YYYY-MM-DD&time_window=morning|afternoon`

## Notification Fallback Chain
- WhatsApp → SMS → Email (cascade on failure, logged)

## PWA Push Notifications
- Service Worker: `/sw.js` (push event + notificationclick)
- Hook: `useOperatorNotifications.js` (Socket.IO + Notification API)
- Events: `order_created`, `order_status` → Browser notifications
- Permission requested on Operator Dashboard load

## Pacific Time (dateUtils.js)
- `formatDatePT()`, `formatShortDatePT()`, `formatTimePT()`, `formatRelative()`

## POS Quick Sale Payment Methods
1. Tap to Pay — Stripe Terminal SDK
2. Tarjeta en Pantalla — Stripe Elements PaymentElement
3. Efectivo — Cash payment

## Print Ticket & PDF
- `GET /api/orders/{id}/ticket` — Full HTML thermal receipt
- Print via window.print(), PDF via html2pdf.js

## Completed Features

### Phase 1 (State Machine, Tickets, Zelle)
- [x] CONFIRMED state + can_transition() validation
- [x] Driver endpoint PATCH /api/driver/orders/{id}/status
- [x] HTML Ticket endpoint with financial breakdown
- [x] Zelle payment method + multi-payment notifications
- [x] Stripe Checkout links in SMS/Email
- [x] POS Tap to Pay via @stripe/terminal-js

### Phase 2 (Tabs, Timezone, PDF)
- [x] Tabs layout (Service Orders, Store Orders, Logistics Map)
- [x] Pacific Time date formatting (formatShortDatePT)
- [x] PDF download button alongside Print (html2pdf.js)
- [x] Backend validations: fecha obligatoria, time_window, weight positivo
- [x] Processing fee 3% for card payments

### Phase 3 (Delivery Rules, Filters, Mobile, PWA) — 2026-04-04
- [x] Delivery Zone Rules: GET /api/geocode/distance (OpenRouteService)
- [x] Logistics Map Filters: date picker + Morning(8-12)/Afternoon(14-18)
- [x] Service Orders Filters: date picker + Morning(8-12)/Afternoon(14-18) in Orders tab
- [x] WhatsApp contact option on Contact page
- [x] WhatsApp→SMS→Email notification fallback chain
- [x] PWA Service Worker for push notifications
- [x] Real-time operator notifications via Socket.IO + Notification API
- [x] PWA manifest.json with maskable icons

## Backlog
- (P2) Refactoring automation_engine.py (complex functions)
- (P3) Automated Stripe Sync every 6 hours (paused by user)
