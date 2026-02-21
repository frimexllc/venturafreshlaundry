# Ventura Fresh Laundry - PRD

## Problema y objetivo
Construir un sistema integral de gestión de lavandería para Ventura Fresh Laundry (basado en el repo vfl) que centralice servicios, órdenes y pagos, con automatización operativa y un **asistente de IA tipo “gerente de negocio”**. El sistema debe reducir tareas manuales: el operador solo actualiza estados de órdenes y el resto se gestiona de forma automática dentro de la app (sin herramientas externas tipo n8n).

## Arquitectura
- **Frontend**: React 19 + Tailwind CSS
- **Backend**: FastAPI (Python)
- **Base de datos**: MongoDB
- **Pagos**: Stripe (pagos únicos + membresías recurrentes)
- **Notificaciones**: Twilio SMS/WhatsApp
- **IA**: Groq (briefing diario + chat de gestión)
- **Autenticación**: JWT (roles admin/operador)

## Personas
1. **Administrador/Owner**: acceso completo, reportes, finanzas, configuración
2. **Operador**: solo lectura + actualización de estados
3. **Ventas B2B**: gestión de cotizaciones comerciales
4. **Clientes Públicos**: formularios web y portal básico

## Requerimientos clave
1. **Módulo de servicios y precios** (CRUD)
2. **Gestión de órdenes/tickets** con cálculo de precio y estados
3. **Pagos**: servicios individuales + membresías recurrentes (Stripe)
4. **Seguridad por roles** (Admin/Operador)
5. **Notificaciones** por cambios de estado (Twilio)
6. **IA Manager**: briefing diario + chat para insights/acciones
7. **B2B Quotes**: formulario público + pipeline de leads
8. **Panel de Finanzas** con resumen y transacciones

## Flujo de estados de orden
```
RECEIVED → PROCESSING → READY → OUT_FOR_DELIVERY → DELIVERED → COMPLETED
                  ↓
              CANCELLED
```

## Modelos principales
- **users**: {email, hashed_password, full_name, role}
- **customers**: {name, email, phone, address, membership_plan, ...}
- **orders**: {customer_id, status, total_price, payment_status, ...}
- **b2b_quotes**: {name, email, phone, company_legal_name, industry, ...}
- **memberships**: {name, price, stripe_price_id, features}

## Implementado ✅
### Backend
- JWT + roles (admin/operador)
- CRUD de clientes/órdenes/cotizaciones
- Finanzas: /api/finances/summary + transacciones de tienda
- Stripe recurring para membresías
- Groq AI (briefing y chat)
- Exportación de clientes robusta

### Frontend
- Dashboard Admin + vista Operador
- Página de Usuarios (admin)
- B2B Quote Form `/request-quote`
- Sidebar reorganizada por rol
- Memberships centradas y CTAs
- Panel de Finanzas funcional (KPIs + transacciones + export CSV)
- Flujo de órdenes con estados normalizados + acciones entregado/completado

### Integraciones
- Stripe (pagos/membresías)
- Twilio (SMS/WhatsApp) **validado E2E**
- Groq (IA gerente)

## Cambios recientes (2026-02-21)
- ✅ Fix robusto en `/api/export/customers` (normalización de valores CSV)
- ✅ CTAs de B2B “Request a Quote” conectados a `/request-quote`
- ✅ Resumen financiero `/api/finances/summary` + panel de finanzas funcional
- ✅ Normalización de estados y bloqueo completed sin delivered
- ✅ Twilio SMS validado E2E al cambiar estado

## Pendientes / Issues
**P1**
- Revisar fallos de WebSocket en consola (no reproducido aún)

**P2**
- Remover “wash and fold” del pickup y crear formulario separado
- Formulario de preferencias avanzadas para membresías premium
- Corregir warnings React (jsx/keys)

## Credenciales de prueba
- **Admin**: owner@frimexllc.com / admin123
