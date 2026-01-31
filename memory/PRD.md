# Ventura Fresh Laundry CRM - PRD

## Original Problem Statement
Desarrollar un CRM para Ventura Fresh Laundry (negocio de lavandería) SIN necesidad de usar n8n ni Google Workspace. El sistema debe manejar las automatizaciones descritas originalmente para el Master File incluyendo: Gatekeeper, Router, Customer Upsert, Orders, Quotes B2B, Leads, Support Tickets, Audit Log.

## Architecture
- **Frontend**: React 19 + Tailwind CSS + Shadcn UI
- **Backend**: FastAPI (Python) 
- **Database**: MongoDB
- **Authentication**: JWT-based custom auth

## User Personas
1. **Administrador/Owner**: Acceso completo al CRM, gestión de clientes, órdenes, cotizaciones B2B
2. **Staff de Operaciones**: Gestión de órdenes y tickets de soporte
3. **Ventas B2B**: Gestión de cotizaciones comerciales y leads

## Core Requirements (Static)
- Sistema de autenticación seguro (JWT)
- Dashboard con métricas en tiempo real
- Gestión completa de clientes (CRUD)
- Gestión de órdenes con workflow de estados
- Pipeline de cotizaciones B2B
- Sistema de leads con conversión a clientes
- Tickets de soporte con priorización automática
- Audit log para trazabilidad
- UI en español

## What's Been Implemented ✅
**Date: 2026-01-31**

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

### Frontend (React)
- ✅ Login/Register pages
- ✅ Dashboard with stats cards and activity feed
- ✅ Customers page (list, create, edit, delete)
- ✅ Orders page (list, create, status workflow)
- ✅ Quotes B2B page (list, create, pipeline status)
- ✅ Leads page (list, create, convert to customer)
- ✅ Support Tickets page (list, create, priority)
- ✅ Audit Log page
- ✅ Responsive sidebar navigation
- ✅ Spanish UI throughout

### Design System
- Fresh Sky color palette (#0ea5e9)
- Manrope for headings, Inter for body
- Bento grid layout for dashboard
- Status badges with semantic colors

## Prioritized Backlog

### P0 (Critical) - DONE
- ✅ Authentication system
- ✅ Customer CRUD
- ✅ Orders CRUD
- ✅ Dashboard

### P1 (High Priority) - DONE
- ✅ Quotes B2B
- ✅ Leads management
- ✅ Support tickets
- ✅ Audit log

### P2 (Medium Priority) - Pending
- [ ] Customer Preferences detailed view
- [ ] Order payment tracking
- [ ] Email notifications (SendGrid/Resend integration)
- [ ] Export to CSV/Excel
- [ ] Bulk actions (mass status update)

### P3 (Nice to Have) - Future
- [ ] SMS notifications (Twilio)
- [ ] Calendar integration for pickups
- [ ] Customer portal (self-service)
- [ ] Mobile app
- [ ] Analytics dashboards with charts
- [ ] Multi-location support

## Next Tasks
1. Add customer preferences management UI
2. Implement payment status tracking in orders
3. Add search/filter functionality to all lists
4. Implement bulk status updates
5. Add data export functionality
