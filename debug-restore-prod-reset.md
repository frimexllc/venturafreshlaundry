# [OPEN] Debug Session: restore-prod-reset

## Resumen
- Sintoma principal: en produccion, al intentar restaurar la BD desde Settings, el navegador muestra `net::ERR_CONNECTION_RESET` en `/api/admin/restore`.
- Sintoma secundario: el navegador tambien muestra `Manifest: Line: 1, column: 1, Syntax error.`
- Objetivo: identificar con evidencia de runtime si la restauracion revienta el proceso, si hay timeout/reset durante lectura del ZIP, o si el frontend servido en `manifest.json` esta corrupto o devolviendo HTML.

## Hipotesis
1. El endpoint de restauracion lanza una excepcion no controlada al procesar algun archivo del ZIP y el worker/proceso se reinicia, causando `ERR_CONNECTION_RESET`.
2. El ZIP contiene archivos grandes o lineas JSONL invalidas y el backend consume demasiada memoria o tiempo, provocando cierre de conexion por el proceso o por PM2/proxy.
3. La restauracion inserta documentos con tipos incompatibles y luego alguna consulta posterior rompe el backend, dando la impresion de que la restauracion fallo.
4. `manifest.json` en produccion no es JSON valido o se esta resolviendo a `index.html`/otra respuesta HTML por un problema de archivos estaticos.
5. El build desplegado en `backend/static` queda parcialmente actualizado y durante restore/restart se sirve una mezcla de assets viejos y nuevos.

## Evidencia Inicial
- Hay antecedentes de errores de tipos tras restore, por ejemplo `phone` entero vs string.
- Ya hubo conflictos/desajustes con archivos generados en `backend/static`.

## Plan
1. Inspeccionar el flujo actual de restore y de static serving.
2. Agregar instrumentacion minima en backend para registrar inicio, contenido del ZIP, progreso por archivo y excepciones fatales.
3. Verificar diagnosticos locales.
4. Entregar instrucciones concretas para reproducir y capturar evidencia en produccion.
