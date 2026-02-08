# Guía de Integración n8n - Ventura Fresh Laundry CRM

## Descripción General

Esta guía explica cómo configurar los workflows de n8n para automatizar completamente las operaciones de Ventura Fresh Laundry.

## Endpoints Disponibles

Base URL: `https://[tu-dominio]/api/n8n`

### 1. Webhooks (Entrada de Datos)

| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `/webhook/ingest` | POST | Recibe nuevos registros y los bloquea |
| `/webhook/normalize` | POST | Normaliza un registro existente |
| `/webhook/route` | POST | Clasifica y enruta un registro |
| `/process/full` | POST | Procesa un registro completo (todo en uno) |

### 2. CRUD Endpoints

| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `/customers/upsert` | POST | Crea o actualiza cliente |
| `/orders/create` | POST | Crea nueva orden |
| `/tickets/create` | POST | Crea ticket de soporte |
| `/quotes/create` | POST | Crea cotización B2B |
| `/leads/create` | POST | Crea nuevo lead |

### 3. Reportes

| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `/reports/daily-summary` | GET | Resumen diario de operaciones |
| `/reports/sla-alerts` | GET | Tickets cerca o pasados de SLA |
| `/reports/quote-followups` | GET | Cotizaciones que necesitan seguimiento |

### 4. Calendario

| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `/calendar/events` | GET | Eventos de calendario (pickups) |

### 5. Notificaciones

| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `/notifications/trigger` | POST | Dispara una notificación |

---

## Workflows de n8n

### Workflow 01: Gatekeeper (Más Importante)

**Trigger:** Google Sheets - New Row en `Ingest_Squarespace`

```
[Google Sheets Trigger] → [HTTP Request: POST /api/n8n/webhook/ingest] → [IF duplicate] → [End]
                                                                        → [Continue to Workflow 02]
```

**Configuración HTTP Request:**
```json
{
  "method": "POST",
  "url": "{{$env.CRM_URL}}/api/n8n/webhook/ingest",
  "body": {
    "source_form": "={{$json.source_form}}",
    "submitted_at": "={{$json.submitted_on}}",
    "name": "={{$json.name}}",
    "email": "={{$json.email}}",
    "phone": "={{$json.phone}}",
    "address": "={{$json.address}}",
    "service_type": "={{$json.type_of_service}}",
    "pickup_date": "={{$json.pickup_date}}",
    "pickup_time": "={{$json.pickup_time}}",
    "message": "={{$json.message}}"
  }
}
```

---

### Workflow 02: Normalize + Route

**Trigger:** Webhook desde Workflow 01

```
[Webhook] → [HTTP: POST /webhook/normalize] → [HTTP: POST /webhook/route] → [Switch by route_result]
                                                                            → ORDER: Workflow 06
                                                                            → QUOTE: Workflow 10
                                                                            → SUPPORT: Workflow 09
                                                                            → LEAD: Create Lead
```

---

### Workflow 03: Proceso Completo (Alternativa Simple)

Si prefieres un solo workflow que haga todo:

```
[Google Sheets Trigger] → [HTTP: POST /api/n8n/process/full] → [Switch by entity.type]
                                                                → order: Google Calendar
                                                                → quote: Google Tasks
                                                                → ticket: Gmail Alert
                                                                → lead: Add to CRM
```

**Body para /process/full:**
```json
{
  "source_form": "={{$json.source_form}}",
  "submitted_at": "={{$json.submitted_on}}",
  "name": "={{$json.name}}",
  "first_name": "={{$json.first_name}}",
  "last_name": "={{$json.last_name}}",
  "email": "={{$json.email}}",
  "phone": "={{$json.phone}}",
  "address": "={{$json.address}}",
  "street": "={{$json.street}}",
  "city": "={{$json.city}}",
  "state": "={{$json.state}}",
  "zip_code": "={{$json.zip}}",
  "service_type": "={{$json.type_of_service}}",
  "pickup_date": "={{$json.pickup_date}}",
  "pickup_time": "={{$json.pickup_time}}",
  "company_name": "={{$json.company_name}}",
  "industry": "={{$json.industry}}",
  "estimated_lbs": "={{$json.estimated_lbs}}",
  "subject": "={{$json.subject}}",
  "message": "={{$json.message}}",
  "detergent_preference": "={{$json.detergent}}",
  "folding_style": "={{$json.folding_style}}",
  "special_instructions": "={{$json.special_instructions}}"
}
```

---

### Workflow 04: Customer Upsert

```
[Trigger] → [HTTP: POST /api/n8n/customers/upsert]
```

**Body:**
```json
{
  "email": "cliente@example.com",
  "phone": "+18051234567",
  "name": "Juan Pérez",
  "address": "123 Main St, Ventura, CA 93003",
  "preferred_contact": "phone",
  "source": "n8n-workflow"
}
```

**Response:**
```json
{
  "status": "created|updated",
  "customer_id": "CUST-000123",
  "is_new": true
}
```

---

### Workflow 06: Order Create

```
[Trigger] → [HTTP: POST /api/n8n/orders/create] → [Google Calendar: Create Event]
```

**Body:**
```json
{
  "customer_id": "CUST-000123",
  "service_type": "pickup_delivery",
  "pickup_date": "2024-02-15",
  "pickup_time_window": "10am-12pm",
  "pickup_address": "123 Main St, Ventura, CA",
  "estimated_lbs": 25,
  "special_instructions": "Separar blancos",
  "source": "n8n"
}
```

**Response:**
```json
{
  "status": "created",
  "order_id": "uuid",
  "order_number": "ORD-20240215-0001"
}
```

---

### Workflow 07: Google Calendar Integration

Después de crear una orden, crear evento en Google Calendar:

```
[Order Created] → [Google Calendar: Create Event]
                  Title: "Pickup - {{order_number}} - {{customer_name}}"
                  Location: "{{pickup_address}}"
                  Start: "{{pickup_date}} {{pickup_time}}"
                  Description: "{{special_instructions}}"
```

---

### Workflow 08: Notificaciones

```
[Order/Ticket Created] → [HTTP: POST /api/n8n/notifications/trigger]
                       → [Gmail: Send Email]
                       → [Twilio/SMS Gateway: Send SMS]
```

**Trigger Notification:**
```json
{
  "event_type": "ORDER_CREATED",
  "entity_type": "order",
  "entity_id": "uuid",
  "recipient_email": "cliente@example.com",
  "recipient_phone": "+18051234567"
}
```

---

### Workflow 09: Support Tickets con SLA

```
[Ticket Created] → [IF priority = HIGH] → [Gmail: Send Alert to Manager]
                                        → [Slack/Discord: Alert Channel]
                 → [Schedule: 4h later] → [HTTP: GET /reports/sla-alerts]
                                        → [IF past_sla > 0] → [Send Reminder]
```

---

### Workflow 10: B2B Quotes Pipeline

```
[Quote Created] → [Google Tasks: Create Follow-up]
               → [Gmail: Send Confirmation]
               → [Schedule: 3 days later] → [HTTP: GET /reports/quote-followups]
                                          → [Gmail: Send Reminder to Sales]
```

---

### Workflow 12: Daily Summary (Cron 7:00 AM)

```
[Cron: 7:00 AM] → [HTTP: GET /api/n8n/reports/daily-summary]
               → [Gmail: Send to Operations]
```

**Email Template:**
```
📊 Resumen Diario - Ventura Fresh Laundry

📦 ÓRDENES
- Creadas hoy: {{orders.created_today}}
- Estado NEW: {{orders.status_new}}
- En proceso: {{orders.status_processing}}

🚚 PICKUPS HOY
- Programados: {{pickups.scheduled_today}}

🎫 TICKETS
- Abiertos: {{tickets.open_total}}
- Alta prioridad: {{tickets.high_priority}}

💼 COTIZACIONES B2B
- Necesitan seguimiento: {{quotes.needing_followup}}

🎯 LEADS
- Nuevos: {{leads.new}}
```

---

## Variables de Entorno en n8n

Configura estas variables en n8n:

| Variable | Valor |
|----------|-------|
| `CRM_URL` | `https://tu-dominio.com` |
| `CRM_N8N_SECRET` | `vfl-n8n-secret-2024` |

---

## Mapeo de Campos Google Sheets → CRM

| Google Sheets Column | CRM Field |
|---------------------|-----------|
| `source_form` | `source_form` |
| `submitted_on` | `submitted_at` |
| `name` / `first_name` + `last_name` | `name` |
| `email` | `email` |
| `phone` / `telephone` | `phone` |
| `address` / `street` + `city` + `state` + `zip` | `address` |
| `type_of_service` | `service_type` |
| `pickup_date` | `pickup_date` |
| `pickup_time` / `pickup_time_window` | `pickup_time` |
| `company_name` / `business_name` | `company_name` |
| `industry` | `industry` |
| `estimated_lbs` / `pounds` | `estimated_lbs` |
| `subject` | `subject` |
| `message` / `comments` / `notes` | `message` |
| `detergent` / `detergent_preference` | `detergent_preference` |
| `folding_style` | `folding_style` |
| `special_instructions` | `special_instructions` |

---

## Clasificación Automática (Router)

El sistema clasifica automáticamente los registros:

| Clasificación | Condiciones |
|--------------|-------------|
| **ORDER** | Tiene pickup_date/time, service_type contiene "pickup/delivery/wash/fold" |
| **QUOTE** | Tiene company_name/industry, estimated_lbs > 50 lbs |
| **SUPPORT** | Subject/message contiene "issue/problem/complaint/refund/damaged" |
| **LEAD** | Tiene email/phone pero no cae en otras categorías |
| **ERROR** | Faltan datos esenciales |

---

## Prioridad Automática de Tickets

| Prioridad | Keywords |
|-----------|----------|
| **HIGH** | urgent, refund, damaged, missing, lost, complaint, lawsuit |
| **MEDIUM** | issue, problem, wrong, incorrect, delay, late |
| **LOW** | Todo lo demás |

---

## SLA por Prioridad

| Prioridad | Tiempo Límite |
|-----------|---------------|
| HIGH | 4 horas |
| MEDIUM | 24 horas |
| LOW | 72 horas |

---

## Testing

Puedes probar los endpoints con curl:

```bash
# Test process/full
curl -X POST "https://tu-dominio/api/n8n/process/full" \
  -H "Content-Type: application/json" \
  -d '{
    "source_form": "PICKUP_REQUEST",
    "name": "Juan Pérez",
    "email": "juan@example.com",
    "phone": "8051234567",
    "address": "123 Main St, Ventura, CA",
    "pickup_date": "2024-02-20",
    "pickup_time": "10am-12pm"
  }'

# Test daily summary
curl "https://tu-dominio/api/n8n/reports/daily-summary"

# Test SLA alerts
curl "https://tu-dominio/api/n8n/reports/sla-alerts"
```

---

## Orden de Implementación Recomendado

### Semana 1 (Base):
1. ✅ Workflow 01: Gatekeeper
2. ✅ Workflow 02: Normalize + Route
3. ✅ Workflow 04: Customer Upsert
4. ✅ Audit Log automático

### Semana 2 (Operación):
5. Workflow 06: Orders
6. Workflow 07: Google Calendar
7. Workflow 08: Notificaciones

### Semana 3 (Calidad):
8. Workflow 09: Support Tickets + SLA
9. Workflow 10: B2B Quotes
10. Follow-ups automáticos

### Semana 4 (Pro):
11. Workflow 12: Daily Summary
12. Alertas y dashboards
