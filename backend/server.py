"""
Lightweight entry-point so uvicorn can bind port 8001 in < 2 seconds.
Heavy imports and route registration are deferred to the startup event.
"""
import os
from pathlib import Path
from dotenv import load_dotenv

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env", override=False)

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import socketio

# ── Create ASGI app immediately ──────────────────────────────────────
fastapi_app = FastAPI(title="Ventura Fresh Laundry CRM")

cors_origins = os.environ.get("CORS_ORIGINS", "*")
fastapi_app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins.split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

sio = socketio.AsyncServer(
    async_mode="asgi",
    cors_allowed_origins="*",
    ping_timeout=60,
    ping_interval=25,
)

# ── Health-check available before any heavy import ───────────────────
@fastapi_app.get("/api/health")
@fastapi_app.get("/health")
async def health_check():
    return {"status": "ok"}


# ── ASGI app that uvicorn exposes ────────────────────────────────────
app = socketio.ASGIApp(
    sio,
    other_asgi_app=fastapi_app,
    socketio_path="api/socket.io",
)


# ── Deferred heavy initialisation ───────────────────────────────────
@fastapi_app.on_event("startup")
async def _bootstrap():
    """Import the real application (server_core) which registers every
    route on *this* FastAPI instance.  Because server_core reads
    `fastapi_app`, `sio` and other objects from this module at import
    time, all decorators attach to the correct app automatically."""
    import server_core  # noqa: F401 – side-effect import
