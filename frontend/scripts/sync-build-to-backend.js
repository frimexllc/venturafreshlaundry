const fs = require("fs");
const path = require("path");

const frontendBuildDir = path.resolve(__dirname, "..", "build");
const backendStaticDir = path.resolve(__dirname, "..", "..", "backend", "static");

if (!fs.existsSync(frontendBuildDir)) {
  throw new Error(`Frontend build not found: ${frontendBuildDir}`);
}

function deleteWithRetry(dir, retries = 5, delayMs = 500) {
  for (let i = 0; i < retries; i++) {
    try {
      if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
      }
      return;
    } catch (err) {
      if (err.code === 'EBUSY' && i < retries - 1) {
        console.log(`File/directory is busy, retrying (${i + 1}/${retries})...`);
        // Wait a bit before retrying
        const start = Date.now();
        while (Date.now() - start < delayMs) {
          // Busy wait
        }
      } else {
        throw err;
      }
    }
  }
}

try {
  console.log("Cleaning backend static directory...");
  deleteWithRetry(backendStaticDir);
  
  console.log("Creating backend static directory...");
  fs.mkdirSync(backendStaticDir, { recursive: true });
  
  console.log("Copying build files to backend...");
  fs.cpSync(frontendBuildDir, backendStaticDir, { recursive: true });
  
  console.log(`✅ Synced frontend build to ${backendStaticDir}`);
} catch (err) {
  if (err.code === 'EBUSY') {
    console.error(`
❌ ERROR: Archivo/directorio ocupado!
Por favor:
1. Detén el servidor backend local (si está corriendo)
2. Cierra cualquier explorador de archivos que tenga la carpeta backend/static abierta
3. Vuelve a intentar
El archivo que está ocupado: ${err.path}
`);
  } else {
    console.error("Error syncing build:", err);
  }
  process.exit(1);
}
