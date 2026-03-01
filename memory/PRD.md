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

## Cambios recientes (2026-02-26)
- ✅ Deployment: se agregó CORS_ORIGINS=* en backend/.env para compatibilidad en producción.
- ✅ Health check /api/health verificado en preview.

## Cambios recientes (2026-02-28)
- ✅ Panel Operador POS: 6 cards con flujos separados para Pickup & Delivery y Wash & Fold Drop-Off.
- ✅ Stripe Checkout en operador (tarjeta) con cálculo automático por lbs y membresía.
- ✅ Reglas de notificación reducidas (Pickup & Delivery: ready/out for delivery/delivered; Wash & Fold: ready).
- ✅ Cálculo automático de total al actualizar lbs reales.
- ✅ Selector de idioma EN/ES persistente en frontend (inglés por defecto).
- ✅ Tienda: checkout con Stripe y pagos manuales, cálculo de envío por km (OpenRouteService), validación de stock y desactivación automática.
- ✅ Tienda: notificaciones de compra según preferencia del cliente.
- ✅ Panel Operador: POS de tienda integrado con selección de productos en modal, checkout rápido y solicitud de pago para órdenes no pagadas.
- ✅ POS tienda: fix para errores 422 al actualizar carrito (PUT con query param) + errores API normalizados en UI.
- ✅ Checkout tienda: verificación de pago Stripe al regresar (actualiza estado y evita quedarse en pendiente).
- ✅ Zonas de entrega: radio 10km + polígonos con tarifas desde panel operador.
- ✅ Finanzas: KPIs + breakdown por métodos de pago y tienda/servicio.
- ✅ WebSocket: client con upgrade a websocket + polling fallback.

## Cambios recientes (2026-03-01)
- ✅ **P0** corregido: el dashboard de operador ahora clasifica órdenes activas por estado/servicio sin filtro rígido de fecha; las órdenes no desaparecen al avanzar de estado.
- ✅ **P0** Stripe tienda reforzado: normalización de estados de pago (`complete/paid`), actualización robusta de orden por `order_id` o `stripe_session_id`, y URL pública para webhook.
- ✅ **P0/P1** frontend: polling de confirmación de pago en `/store` y `/admin/operator` para evitar quedarse en `pending` tras redirección.
- ✅ **P1** shipping quote endurecido: geocoding con fallback (con y sin `boundary.country`) para reducir errores 400 en direcciones válidas.
- ✅ **P1** robustez carrito multi-item: validaciones defensivas de respuesta de carrito para prevenir crashes de UI.
- ✅ **Wash & Fold Drop-Off corregido**: flujo operativo sin pickup/delivery forzado a `NEW → PROCESSING → READY → COMPLETED` (backend + operator dashboard).
- ✅ **Validación de estados wash_fold**: se bloquean transiciones inválidas (`PICKUP_*`, `OUT_FOR_DELIVERY`, `DELIVERED`, `CONFIRMED`) con error claro de negocio.
- ✅ **Formulario público `/wash-fold` actualizado**: dirección ahora opcional y explícitamente “solo para contacto”; la orden se crea como drop-off/pickup en tienda.
- ✅ **UX checkout de envío**: helper visible con formato correcto de dirección (`street + number, city, state, ZIP`) en tienda pública y POS operador.

## Pendientes / Issues
**P1**
- Validar webhook Stripe end-to-end en entorno productivo con eventos reales entrantes
- Export CSV avanzado con filtros por canal y método de pago
- Módulo Admin para monitorear estados y errores de mensajes Twilio
- Verificación de dominio SendGrid/Twilio Trust (DNS) pendiente en proveedor de dominio

**P2**
- Estabilizar WebSocket en producción (fallback ya funcional en preview)
- Corregir warnings React (jsx/keys)

## Credenciales de prueba
- **Admin**: owner@frimexllc.com / admin123
