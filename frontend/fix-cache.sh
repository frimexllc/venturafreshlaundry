#!/bin/bash
# fix-cache.sh — Limpia TODA la caché del entorno de desarrollo React/CRA/Vite
# Ejecutar desde la raíz del frontend: bash fix-cache.sh

set -e

echo "🧹 Limpiando caché de desarrollo..."

# 1. Matar cualquier proceso del servidor de desarrollo
echo "→ Deteniendo servidores activos..."
pkill -f "react-scripts start" 2>/dev/null || true
pkill -f "vite" 2>/dev/null || true
pkill -f "webpack" 2>/dev/null || true
sleep 1

# 2. Borrar caché de CRA (.cache de babel-loader / webpack)
echo "→ Borrando .cache..."
rm -rf .cache
rm -rf node_modules/.cache

# 3. Borrar caché de Vite (si aplica)
echo "→ Borrando node_modules/.vite..."
rm -rf node_modules/.vite

# 4. Borrar build anterior
echo "→ Borrando build/..."
rm -rf build dist

# 5. Limpiar caché de yarn
echo "→ Limpiando caché de yarn..."
yarn cache clean 2>/dev/null || npm cache clean --force 2>/dev/null || true

# 6. Regenerar variable de entorno para forzar recarga de módulos
echo "→ Tocando archivos modificados para invalidar HMR..."
# Toca los archivos que acabas de cambiar para que el watcher los detecte
touch src/components/PickupImageModal.jsx 2>/dev/null || true
touch src/components/operator/BillingBreakdown.jsx 2>/dev/null || true

echo ""
echo "✅ Caché limpiada. Ahora inicia el servidor manualmente:"
echo "   yarn start"
echo "   # o: npm start"
echo ""
echo "Si el problema persiste, prueba:"
echo "   GENERATE_SOURCEMAP=false yarn start"
echo "   # o abre una ventana de incógnito / hard-refresh (Ctrl+Shift+R)"