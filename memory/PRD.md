# Ventura Fresh Laundry CRM - PRD

## Original Problem Statement
Desarrollar un CRM para Ventura Fresh Laundry (negocio de lavandería) SIN necesidad de usar n8n ni Google Workspace. El sistema debe manejar las automatizaciones descritas originalmente para el Master File incluyendo: Gatekeeper, Router, Customer Upsert, Orders, Quotes B2B, Leads, Support Tickets, Audit Log. Además, incluye un sitio web público de 9 páginas con formularios conectados al CRM y un portal de clientes para ver historial de órdenes.

## Architecture
- **Frontend**: React 19 + Tailwind CSS + Shadcn UI
- **Backend**: FastAPI (Python) 
- **Database**: MongoDB
- **Admin Authentication**: JWT-based custom auth
- **Customer Authentication**: JWT-based custom auth (separate from admin)
- **Notifications**: Resend (Email) + Twilio (SMS) - MOCKED (awaiting API keys)

## User Personas
1. **Administrador/Owner**: Acceso completo al CRM, gestión de clientes, órdenes, cotizaciones B2B
2. **Staff de Operaciones**: Gestión de órdenes y tickets de soporte
3. **Ventas B2B**: Gestión de cotizaciones comerciales y leads
4. **Clientes Públicos**: Acceso al sitio web público y portal de cuenta para ver órdenes

## Core Requirements (Static)
- Sistema de autenticación seguro (JWT) para admin y clientes
- Dashboard con métricas en tiempo real
- Gestión completa de clientes (CRUD)
- Gestión de órdenes con workflow de estados
- Pipeline de cotizaciones B2B
- Sistema de leads con conversión a clientes
- Tickets de soporte con priorización automática
- Audit log para trazabilidad
- Sitio web público de 9 páginas
- Portal de clientes para ver historial de órdenes
- Calendario visual de pickups
- Exportación de datos a CSV
- Notificaciones por email/SMS (pendiente API keys)
- UI en español (parcial)

## What's Been Implemented ✅
**Date: 2026-02-01**

### Backend (FastAPI)
- ✅ JWT Authentication for Admin (login/register)
- ✅ JWT Authentication for Customers (login/register/orders)
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
- ✅ **Customer Portal Endpoints**:
  - POST /api/customer/auth/register
  - POST /api/customer/auth/login
  - GET /api/customer/me
  - GET /api/customer/orders
- ✅ **Export Endpoints** (CSV):
  - GET /api/export/customers
  - GET /api/export/orders
  - GET /api/export/quotes
  - GET /api/export/leads
  - GET /api/export/tickets
- ✅ **Calendar API**:
  - GET /api/calendar/orders (date range filtering)
- ✅ **Notification Service** (MOCKED - awaiting API keys):
  - notifications.py with email/SMS templates
  - Auto-notify hooks on order creation and status changes

### Frontend (React) - Admin Panel
- ✅ Admin Login/Register pages
- ✅ Dashboard with stats cards and activity feed
- ✅ Customers page (list, create, edit, delete)
- ✅ Orders page (list, create, status workflow)
- ✅ Quotes B2B page (list, create, pipeline status)
- ✅ Leads page (list, create, convert to customer)
- ✅ Support Tickets page (list, create, priority)
- ✅ Audit Log page
- ✅ Calendar page - Visual view of pickups by date
- ✅ Settings page - Notification status + CSV exports
- ✅ Responsive sidebar navigation with link to Landing Page

### Frontend (React) - Public Website (9 Pages)
- ✅ Home Page (/) - Hero with video background, features, FAQ
- ✅ Services Page (/services) - Self-service, Wash & Fold, Pickup & Delivery
- ✅ About Page (/about) - Company story, values, location
- ✅ Contact Page (/contact) - Contact form, info, map, FAQ
- ✅ Store Page (/store) - Coming soon placeholder
- ✅ Blog Page (/blog) - 6 sample blog posts
- ✅ Schedule Pickup Page (/schedule-pickup) - Full pickup request form
- ✅ Customer Login (/account/login) - Login/Register for customers
- ✅ Customer Account (/account) - View order history, profile info
- ✅ Shared PublicNav component with consistent navigation
- ✅ Shared PublicFooter component with contact info and links

### Design System
- Fresh Sky color palette (#0ea5e9)
- Playfair Display for headings, Inter for body
- Consistent navigation across all public pages
- Status badges with semantic colors
- Calendar with colored event dots

## URLs
**Public Website:**
- Home: / and /home
- Services: /services
- About: /about
- Contact: /contact
- Store: /store
- Blog: /blog
- Schedule Pickup: /schedule-pickup
- Customer Login: /account/login
- Customer Account: /account

**Admin Panel:**
- Admin Login: /login
- Admin Dashboard: /admin
- Admin Calendar: /admin/calendar
- Admin Settings: /admin/settings

## Prioritized Backlog

### P0 (Critical) - DONE ✅
- ✅ Authentication system (admin and customer)
- ✅ Customer CRUD
- ✅ Orders CRUD
- ✅ Dashboard
- ✅ Public website (9 pages)
- ✅ Customer portal

### P1 (High Priority) - DONE ✅
- ✅ Quotes B2B
- ✅ Leads management
- ✅ Support tickets
- ✅ Audit log
- ✅ Calendar view
- ✅ CSV exports
- ✅ Notification structure (ready for API keys)

### P2 (Medium Priority) - Pending
- [ ] Email notifications activation (add RESEND_API_KEY)
- [ ] SMS notifications activation (add Twilio keys)
- [ ] Customer Preferences detailed view/editor in portal
- [ ] Order payment tracking with Stripe
- [ ] Store page e-commerce functionality
- [ ] Blog post management in admin
- [ ] Bulk actions (mass status update)
- [ ] Search filters on all list pages

### P3 (Nice to Have) - Future
- [ ] Mobile app
- [ ] Analytics dashboards with charts
- [ ] Multi-location support
- [ ] Route optimization for drivers
- [ ] Automated reminders/follow-ups

## Next Tasks
1. Configure Resend API key for email notifications
2. Configure Twilio for SMS notifications
3. Implement Store page e-commerce functionality
4. Add blog post management in admin panel
5. Add customer preferences management UI

## Test Credentials
- **Admin**: admin@venturafresh.com / admin123
- **Customer**: test@example.com / test123
