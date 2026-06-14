const fs = require("fs");
const path = require("path");

const frontendBuildDir = path.resolve(__dirname, "..", "build");
const backendStaticDir = path.resolve(__dirname, "..", "..", "backend", "static");

if (!fs.existsSync(frontendBuildDir)) {
  throw new Error(`Frontend build not found: ${frontendBuildDir}`);
}

fs.rmSync(backendStaticDir, { recursive: true, force: true });
fs.mkdirSync(backendStaticDir, { recursive: true });
fs.cpSync(frontendBuildDir, backendStaticDir, { recursive: true });

console.log(`Synced frontend build to ${backendStaticDir}`);
