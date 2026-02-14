# Ventura Fresh Laundry CRM - PRD

## Original Problem Statement
Desarrollar un CRM para Ventura Fresh Laundry con automatización completa de workflows. El sistema procesa automáticamente todos los formularios (Squarespace, website), clasifica y enruta a las tablas correctas (Orders, Quotes, Leads, Support, Preferences), actualiza/crea clientes, y genera alertas. **El operador SOLO actualiza el estado de las órdenes - el sistema hace todo lo demás automáticamente.**

## Architecture
- **Frontend**: React 19 + Tailwind CSS + Shadcn UI
- **Backend**: FastAPI (Python) 
- **Database**: MongoDB
- **Automation**: n8n (self-hosted) + Custom Automation Engine
- **Admin Authentication**: JWT-based custom auth
- **Customer Authentication**: JWT-based custom auth (separate from admin)
- **Payments**: Stripe (via emergentintegrations)
- **Notifications**: SMTP Email (pendiente config)

## User Personas
1. **Administrador/Owner**: Acceso completo al CRM, configuración, reportes
2. **Operador**: Solo actualiza estados de órdenes - el sistema le da toda la información
3. **Ventas B2B**: Gestión de cotizaciones (pipeline automatizado)
4. **Clientes Públicos**: Acceso al sitio web público y portal de cuenta

## Automation Engine (NUEVO - 2026-02-14) ✅

### Workflow Implementados:
1. **01 Gatekeeper** - Punto de entrada único para todos los formularios
   - Genera `ingest_id` y `dedup_key` automáticamente
   - Detecta duplicados
   - Normaliza datos (email, phone, name)
   
2. **02 Normalize** - Limpieza de datos integrada en Gatekeeper
   - Email: lowercase, trim
   - Phone: formato E.164 (+1XXXXXXXXXX)
   - Validación de campos requeridos

3. **03 Router** - Auto-clasificación inteligente
   - `ORDER`: si tiene pickup_date, pickup_time, o source_form=PICKUP_REQUEST
   - `QUOTE`: si tiene company_name, industry, o tipo comercial
   - `SUPPORT`: si tiene issue, complaint, o palabras clave de soporte
   - `PREFERENCES`: si tiene fabric_softener, detergent_preference
   - `LEAD`: default para consultas generales

4. **04 Customer Upsert** - Crea/actualiza cliente automáticamente
   - Busca por email, luego por phone
   - Genera customer_id único: CUST-000XXX
   - Actualiza último contacto y dirección

5. **05 Preferences** - Historial versionado de preferencias
   - Cada update crea nueva versión (v1, v2, v3...)
   - Mantiene `is_current` flag

6. **06 Order Create** - Creación automática de órdenes
   - ID formato: ORD-YYYYMMDD-XXXX
   - Status inicial: NEW
   - Crea evento de calendario automáticamente

7. **09 Ticket Create** - Con prioridad y SLA automáticos
   - **HIGH** (4h SLA): urgent, refund, damaged, missing, complaint
   - **MEDIUM** (24h SLA): issue, problem, delay
   - **LOW** (72h SLA): general inquiries

8. **10 Quote Create** - Pipeline B2B
   - Follow-up automático a 2 días
   - Tracking de empresa, industria, volumen

9. **12 Daily Summary** - Reporte diario (n8n cron 7am)
   - Órdenes nuevas hoy
   - Pickups programados
   - Tickets abiertos/SLA at risk
   - Quotes pendientes follow-up

### API Endpoints de Automatización:
- `POST /api/automation/ingest` - Procesa cualquier formulario
- `GET /api/automation/daily-summary` - Reporte diario
- `GET /api/automation/sla-alerts` - Tickets en riesgo de SLA
- `GET /api/automation/operator-dashboard` - Vista para operador
- `PUT /api/automation/orders/{id}/status` - Actualizar estado (ÚNICO action del operador)

### Panel del Operador (`/admin/operator`):
- **Solo muestra lo que necesita actuar**
- Pickups de hoy con botón de un clic para avanzar estado
- Órdenes listas para entrega
- Tickets urgentes con SLA deadline
- Auto-refresh cada 30 segundos

## n8n Configuration
- **URL**: http://localhost:5678
- **Auth**: admin / ventura2024
- **Workflows**: /app/n8n/workflows/
- **Status**: RUNNING

### Para conectar con Google Workspace:
1. Crear Service Account en Google Cloud Console
2. Habilitar APIs: Sheets, Calendar, Gmail, Drive
3. Compartir el Master File con el service account email
4. Configurar credenciales en n8n

## What's Been Implemented ✅

### Backend (FastAPI)
- ✅ JWT Authentication (Admin + Customer)
- ✅ Customer Management API
- ✅ Order Management API with status workflow
- ✅ Quotes B2B Management API
- ✅ Leads Management API
- ✅ Support Tickets API with auto-priority
- ✅ Audit Log API
- ✅ Dashboard Stats API
- ✅ **Automation Engine** (NEW)
- ✅ **Store Module** with Stripe payments
- ✅ **Blog Module** with categories

### Frontend (React)
- ✅ Admin Dashboard
- ✅ **Operator Dashboard** (NEW) - Vista simplificada para operador
- ✅ Customers, Orders, Quotes, Leads, Tickets pages
- ✅ Calendar view
- ✅ Store management (products, orders)
- ✅ Blog management (posts, categories)
- ✅ Public website (9 pages)
- ✅ Customer portal

### Static Website
- ✅ HTML pages served from /web/*
- ✅ CRM integration script
- ✅ Forms connected to backend

## Order Status Flow
```
NEW → CONFIRMED → PICKUP_SCHEDULED → PICKED_UP → PROCESSING → READY → OUT_FOR_DELIVERY → DELIVERED
         ↓
     CANCELLED
```

## Test Credentials
- **Admin**: admin@venturafresh.com / admin123
- **Customer**: test@example.com / test123
- **n8n**: admin / ventura2024

## Recent Changes (2026-02-14)
- **Automation Engine**: Full workflow automation implemented
- **Operator Dashboard**: Simplified view for operators
- **n8n**: Self-hosted instance running and configured
- **Auto-routing**: Forms automatically classified and routed
- **SLA tracking**: Automatic priority and deadline calculation
- **Testing**: All automation endpoints tested and working

## Próximos Pasos
1. 🔴 Conectar n8n con Google Sheets (Master File)
2. 🔴 Conectar n8n con Google Calendar
3. 🔴 Configurar Gmail para notificaciones
4. 🟠 Configurar SMTP para emails automáticos
5. 🟡 Agregar WhatsApp notifications (Twilio)
