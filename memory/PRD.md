# Ventura Fresh Laundry CRM - PRD

## Original Problem Statement
Desarrollar un CRM para Ventura Fresh Laundry (negocio de lavandería) SIN necesidad de usar n8n ni Google Workspace. El sistema debe manejar las automatizaciones descritas originalmente para el Master File incluyendo: Gatekeeper, Router, Customer Upsert, Orders, Quotes B2B, Leads, Support Tickets, Audit Log. Además, incluye Landing Page pública con formularios conectados al CRM.

## Architecture
- **Frontend**: React 19 + Tailwind CSS + Shadcn UI
- **Backend**: FastAPI (Python) 
- **Database**: MongoDB
- **Authentication**: JWT-based custom auth
- **Notifications**: Resend (Email) + Twilio (SMS) - opcional

## User Personas
1. **Administrador/Owner**: Acceso completo al CRM, gestión de clientes, órdenes, cotizaciones B2B
2. **Staff de Operaciones**: Gestión de órdenes y tickets de soporte
3. **Ventas B2B**: Gestión de cotizaciones comerciales y leads
4. **Clientes Públicos**: Acceso a landing page para agendar pickups y contactar

## Core Requirements (Static)
- Sistema de autenticación seguro (JWT)
- Dashboard con métricas en tiempo real
- Gestión completa de clientes (CRUD)
- Gestión de órdenes con workflow de estados
- Pipeline de cotizaciones B2B
- Sistema de leads con conversión a clientes
- Tickets de soporte con priorización automática
- Audit log para trazabilidad
- Landing page pública con formularios
- Calendario visual de pickups
- Exportación de datos a CSV
- Notificaciones por email/SMS
- UI en español

## What's Been Implemented ✅
**Date: 2026-01-31 / 2026-02-01**

### Backend (FastAPI)
- ✅ JWT Authentication (login/register)
- ✅ Customer Management API
- ✅ Order Management API with status workflow
- ✅ Quotes B2B Management API
- ✅ Leads Management API with conversion
- ✅ Support Tickets API with auto-priority
- ✅ Customer Preferences API
- ✅ Audit Log API
- ✅ Dashboard Stats API
- ✅ Ingest Router (form submission classification)
- ✅ **Public Form Endpoints** (no auth required):
  - POST /api/public/pickup-request
  - POST /api/public/contact
  - POST /api/public/quote-request
- ✅ **Export Endpoints** (CSV):
  - GET /api/export/customers
  - GET /api/export/orders
  - GET /api/export/quotes
  - GET /api/export/leads
  - GET /api/export/tickets
- ✅ **Calendar API**:
  - GET /api/calendar/orders (date range filtering)
- ✅ **Notification Service** (ready for Resend/Twilio):
  - notifications.py with email/SMS templates
  - Auto-notify on order creation and status changes

### Frontend (React)
- ✅ Login/Register pages
- ✅ Dashboard with stats cards and activity feed
- ✅ Customers page (list, create, edit, delete)
- ✅ Orders page (list, create, status workflow)
- ✅ Quotes B2B page (list, create, pipeline status)
- ✅ Leads page (list, create, convert to customer)
- ✅ Support Tickets page (list, create, priority)
- ✅ Audit Log page
- ✅ **Calendar page** - Visual view of pickups by date
- ✅ **Settings page** - Notification status + CSV exports
- ✅ Responsive sidebar navigation with link to Landing Page
- ✅ Spanish UI throughout

### Landing Page (Public)
- ✅ Hero section with CTA buttons
- ✅ Services section (3 cards)
- ✅ How It Works (3 steps)
- ✅ Features section (4 cards)
- ✅ **Pickup Request Form** - Creates order + customer
- ✅ **Contact Form** - Creates support ticket
- ✅ **Commercial/B2B Form** - Creates B2B quote
- ✅ Testimonial section
- ✅ FAQ accordion
- ✅ Contact info section
- ✅ Footer with links

### Design System
- Fresh Sky color palette (#0ea5e9)
- Manrope for headings, Inter for body
- Bento grid layout for dashboard
- Status badges with semantic colors
- Calendar with colored event dots

## URLs
- Landing Page: /home
- Admin Login: /login
- Admin Dashboard: /admin
- Admin Calendar: /admin/calendar
- Admin Settings: /admin/settings

## Prioritized Backlog

### P0 (Critical) - DONE ✅
- ✅ Authentication system
- ✅ Customer CRUD
- ✅ Orders CRUD
- ✅ Dashboard
- ✅ Public landing page with forms

### P1 (High Priority) - DONE ✅
- ✅ Quotes B2B
- ✅ Leads management
- ✅ Support tickets
- ✅ Audit log
- ✅ Calendar view
- ✅ CSV exports
- ✅ Notification structure (ready for API keys)

### P2 (Medium Priority) - Pending
- [ ] Customer Preferences detailed view/editor
- [ ] Order payment tracking with Stripe
- [ ] Email notifications activation (add RESEND_API_KEY)
- [ ] SMS notifications activation (add Twilio keys)
- [ ] Bulk actions (mass status update)
- [ ] Search filters on all list pages

### P3 (Nice to Have) - Future
- [ ] Customer self-service portal
- [ ] Mobile app
- [ ] Analytics dashboards with charts
- [ ] Multi-location support
- [ ] Route optimization for drivers
- [ ] Automated reminders/follow-ups

## Next Tasks
1. Configure Resend API key for email notifications
2. Configure Twilio for SMS notifications
3. Add customer preferences management UI
4. Implement payment tracking with Stripe
5. Add advanced search/filters to all list pages
