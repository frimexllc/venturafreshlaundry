# Ventura Fresh Laundry - PRD

## Problema y objetivo
Construir un sistema integral de gestión de lavandería para Ventura Fresh Laundry (basado en el repo vfl) que centralice servicios, órdenes y pagos, con automatización operativa y un **asistente de IA tipo “gerente de negocio”**. El sistema debe reducir tareas manuales: el operador solo actualiza estados de órdenes y el resto se gestiona de forma automática dentro de la app (sin herramientas externas tipo n8n).

## Arquitectura
- **Frontend**: React 19 + Tailwind CSS
- **Backend**: FastAPI (Python)
- **Base de datos**: MongoDB
- **Pagos**: Stripe (pagos únicos + membresías recurrentes)
- **Notificaciones**: Twilio SMS/WhatsApp/Voice + SendGrid Email
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
- Preferencias de cliente (crear/editar/eliminar) + snapshot en órdenes
- Normalización de datos en formularios públicos (pickup, B2B)
- Envío de notificaciones Twilio (SMS/WhatsApp) con bloqueos de carrier en algunos números

### Frontend
- Dashboard Admin + vista Operador
- Página de Usuarios (admin)
- B2B Quote Form `/request-quote`
- Sidebar reorganizada por rol
- Memberships centradas y CTAs
- Formulario Elite Concierge con preferencias avanzadas
- Portal de cliente con edición/eliminación de preferencias
- Preferencias visibles en detalle de órdenes (Admin/Operador)
- Ticket QR con formato de ticket y prefijo VFL en órdenes (incluye lbs estimadas/actuales)
- Edición de libras estimadas/actuales en detalle de órdenes (Admin/Operador)
- Panel Operador: impresión de tickets y registro de pagos (efectivo/tarjeta/transferencia/otro)
- Asistente Operativo IA en panel de operador
- Mejoras al asistente IA interno (contexto + acciones de órdenes)
- Formulario separado Wash & Fold `/wash-fold`
- Conversión de cotizaciones B2B → Lead
- Páginas legales + links en footer
- Checkbox de aceptación en login admin y login cliente (bloquea envío)

### Integraciones
- Stripe (pagos/membresías)
- Twilio (SMS/WhatsApp/Voice) **con error 30034 en algunos carriers**
- SendGrid (emails)
- Groq (IA gerente)

## Cambios recientes (2026-02-22)
- ✅ Refactor: endpoints públicos y voz movidos a routers (routes/public_forms.py, routes/voice.py) para reducir server.py
- ✅ Panel Operador: impresión de tickets y registro de pagos (efectivo/tarjeta/transferencia/otro)
- ✅ Asistente Operativo IA con acciones de órdenes/pagos/tickets
- ✅ Preferencia de contacto desde formulario Pickup se guarda y se respeta en notificaciones
- ✅ Normalización de teléfonos respeta prefijo + (MX/EU)
- ✅ Envío de emails SendGrid verificado (host US temporal; EU residency desactivado)
- ✅ Notificaciones según preferencia de contacto (email/sms/whatsapp/llamada)
- ✅ Endpoints de voz Twilio (inbound/outbound) con mensajes IA
- ✅ Edición de libras estimadas/actuales en órdenes (Admin/Operador) + ticket QR incluye lbs
- ✅ Mejoras al asistente IA interno con contexto y acciones de órdenes
- ✅ Flujo de órdenes actualizado (OUT_FOR_DELIVERY → DELIVERED/COMPLETED) y eventos tiempo real desde operador
- ✅ Ticket QR con formato tipo ticket + prefijo VFL
- ✅ Preferencias visibles en detalle de órdenes (Admin/Operador)
- ✅ Formulario separado Wash & Fold + link desde pickup
- ✅ Conversión de cotizaciones B2B → Lead
- ✅ Normalización de datos en pickup y B2B
- ✅ Páginas legales y aceptación en login (admin/cliente)

## Cambios recientes (2026-02-25)
- ✅ Panel Operador: lista de entregas en curso incluye OUT_FOR_DELIVERY y DELIVERED para completar el flujo de entrega.
- ✅ Notificaciones por cambios de estado se envían para cualquier estado (excepto NEW).
- ✅ Backend: carga de .env solo en preview/local (según APP_URL) para no sobrescribir MONGO_URL de producción.
- ✅ Repo: .gitignore permite frontend/package.json para builds de deployment.

## Pendientes / Issues
**P1**
- Validar estabilidad de tiempo real (WebSocket/polling) en producción
- Hacer funcional el panel de Finanzas (UI con KPIs + transacciones + export CSV)
- Módulo Admin para monitorear estados y errores de mensajes Twilio
- Verificación de dominio SendGrid/Twilio Trust (DNS) pendiente en proveedor de dominio

**P2**
- Corregir warnings React (jsx/keys)

## Credenciales de prueba
- **Admin**: owner@frimexllc.com / admin123
