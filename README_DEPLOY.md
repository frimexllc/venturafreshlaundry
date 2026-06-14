# Ventura Fresh Laundry - Guía de Despliegue

## Requisitos Previos

Antes de empezar, asegúrate de tener instalados:
- **Python 3.8+** (para el backend)
- **Node.js 18+** y **Yarn** (para el frontend)
- **MongoDB** (local o en la nube, como MongoDB Atlas)

---

## Paso 1: Configuración Inicial

### Windows
Ejecuta el archivo `setup.bat` para instalar todas las dependencias automáticamente:
```cmd
setup.bat
```

### Linux/Mac
Ejecuta el archivo `setup.sh` (asegurarte de darle permisos de ejecución primero):
```bash
chmod +x setup.sh
./setup.sh
```

---

## Paso 2: Configurar Variables de Entorno

Edita los archivos `.env` en las carpetas `backend/` y `frontend/` con tus credenciales reales:

### Backend (`backend/.env`)
```env
# MongoDB - Local o Atlas
MONGO_URL=mongodb://localhost:27017/venturafresh
DB_NAME=venturafresh

# JWT - Cambia esto en producción!
JWT_SECRET=tu-clave-secreta-super-segura

# Stripe
STRIPE_SECRET_KEY=sk_test_tu_stripe_secret_key
STRIPE_PUBLISHABLE_KEY=pk_test_tu_stripe_publishable_key
STRIPE_WEBHOOK_SECRET=whsec_tu_webhook_secret

# Google Maps
GOOGLE_MAPS_API_KEY=tu_google_maps_api_key

# Otras configuraciones
BUSINESS_NAME=Ventura Fresh Laundry
APP_URL=https://tu-dominio.com
```

### Frontend (`frontend/.env`)
```env
REACT_APP_BACKEND_URL=https://tu-dominio.com
REACT_APP_STRIPE_PUBLISHABLE_KEY=pk_test_tu_stripe_publishable_key
REACT_APP_GOOGLE_MAPS_API_KEY=tu_google_maps_api_key
```

---

## Paso 3: Desplegar la Aplicación

### Windows
Ejecuta `deploy.bat` para compilar el frontend y arrancar el backend:
```cmd
deploy.bat
```

### Linux/Mac
Ejecuta `deploy.sh` (asegurarte de darle permisos primero):
```bash
chmod +x deploy.sh
./deploy.sh
```

---

## Despliegue en Hostinguer (o Proveedores Similares)

1. **Sube el código** al servidor (via FTP, Git, etc.)
2. **Ejecuta el setup**:
   - Linux: `./setup.sh`
3. **Configura las variables de entorno** (usa la interfaz del hosting o edita los archivos `.env`)
4. **Ejecuta el deploy**:
   - Linux: `./deploy.sh`
5. **Configura un proxy inverso** (Nginx/Apache) para apuntar al puerto 8001

Ejemplo de configuración Nginx:
```nginx
server {
    listen 80;
    server_name tu-dominio.com;

    location / {
        proxy_pass http://localhost:8001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Para WebSockets
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

---

## Primer Inicio de Sesión

Credenciales de administrador por defecto (cámbialas inmediatamente!):
- Email: `owner@frimexllc.com`
- Contraseña: `admin123`

---

## Problemas Comunes

1. **MongoDB no se conecta**: Asegúrate de que MongoDB esté corriendo o que la URL en `backend/.env` sea correcta.
2. **Frontend no se carga**: Verifica que `REACT_APP_BACKEND_URL` en `frontend/.env` apunte al backend correcto.
3. **Puerto 8001 está ocupado**: Cambia el puerto en `deploy.bat`/`deploy.sh` y actualiza `REACT_APP_BACKEND_URL`.

---

## Soporte

Para más información, consulta el archivo `README.md` principal del proyecto.
