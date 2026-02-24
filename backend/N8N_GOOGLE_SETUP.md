git # Guía de Configuración: n8n + Google Workspace

## Paso 1: Crear Service Account en Google Cloud

1. Ve a https://console.cloud.google.com
2. Crea un nuevo proyecto o selecciona uno existente
3. Ve a "APIs & Services" > "Credentials"
4. Click "Create Credentials" > "Service Account"
5. Nombra la cuenta: `ventura-n8n-automation`
6. Click "Create and Continue"
7. En el paso de roles, selecciona "Editor"
8. Click "Done"
9. Haz click en el service account creado
10. Ve a "Keys" tab > "Add Key" > "Create new key"
11. Selecciona JSON y descarga el archivo

## Paso 2: Habilitar APIs necesarias

En Google Cloud Console, ve a "APIs & Services" > "Library" y habilita:
- Google Sheets API
- Google Calendar API
- Gmail API
- Google Drive API

## Paso 3: Compartir el Master File

1. Abre tu Google Sheet (Master File con las 8 pestañas)
2. Click "Share"
3. Pega el email del service account (algo como: `ventura-n8n-automation@proyecto.iam.gserviceaccount.com`)
4. Dale permisos de "Editor"
5. Click "Share"

## Paso 4: Configurar credenciales en n8n

1. Accede a n8n: http://localhost:5678
2. Login: admin / ventura2024
3. Ve a Settings > Credentials
4. Click "Add Credential"
5. Busca "Google Sheets API"
6. Selecciona "Service Account"
7. Pega el contenido del JSON descargado
8. Guarda

Repite para:
- Google Calendar API
- Gmail API
- Google Drive API

## Paso 5: Importar Workflows

Los workflows están en `/app/n8n/workflows/`:

1. En n8n, ve a "Workflows"
2. Click "Import from File"
3. Selecciona cada archivo .json de la carpeta workflows
4. Configura las credenciales de Google en cada nodo
5. Activa los workflows

## Workflows Disponibles

| Archivo | Función | Trigger |
|---------|---------|---------|
| 01_gatekeeper.json | Procesa formularios | Webhook POST |
| 02_daily_summary.json | Reporte diario | Cron 7:00 AM |
| 03_sla_monitor.json | Alertas de SLA | Cada hora |

## Configurar Webhook en Squarespace

1. En Squarespace, ve a Settings > Advanced > Code Injection
2. O configura Zapier/Make para enviar a:
   ```
   https://laundry-ai-hub.preview.emergentagent.com/api/automation/ingest
   ```

## IDs Importantes

- **Sheet ID**: (el ID de tu Master File - se ve en la URL)
- **Calendar ID**: (generalmente `primary` o el email del calendario)

## Variables de Entorno

En `/app/backend/.env`:
```
N8N_WEBHOOK_SECRET=vfl-n8n-secret-2024
N8N_BASE_URL=http://localhost:5678
```

## Verificar Funcionamiento

```bash
# Test del endpoint de ingest
curl -X POST https://laundry-ai-hub.preview.emergentagent.com/api/automation/ingest \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test User",
    "email": "test@example.com",
    "phone": "805-555-0000",
    "pickup_date": "2026-02-20",
    "source_form": "PICKUP_REQUEST"
  }'

# Test del daily summary
curl https://laundry-ai-hub.preview.emergentagent.com/api/automation/daily-summary

# Test de SLA alerts
curl https://laundry-ai-hub.preview.emergentagent.com/api/automation/sla-alerts
```

## Flujo de Datos Automático

```
Squarespace Form → Webhook → /api/automation/ingest
                                    ↓
                           Auto-clasificación
                                    ↓
              ┌─────────────────────┼─────────────────────┐
              ↓                     ↓                     ↓
         ORDER              QUOTE/LEAD              SUPPORT
              ↓                     ↓                     ↓
      Orders_Master         Quotes_Master         Support_Tickets
              ↓                     ↓                     ↓
      Calendar Event         Follow-up Task        SLA Tracking
              ↓                     ↓                     ↓
      Email Cliente          Email Ventas         Email Urgente
```

## Notas Importantes

- El operador SOLO actualiza estados de órdenes
- Todo lo demás es automático
- Los emails se envían cuando configures SMTP/Gmail
- Los eventos de calendario se crean cuando conectes Google Calendar
