"""
Lightweight entry-point so uvicorn can bind port 8001 in < 2 seconds.
Heavy imports and route registration run in a background thread AFTER
the port is already open and responding to health checks.
"""
import os
import asyncio
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


# ── Deferred heavy initialisation (runs AFTER port opens) ───────────
def _load_server_core():
    """Synchronous import executed in a thread pool worker."""
    import server_core  # noqa: F401


async def _deferred_init():
    """Import server_core in a background thread so the event loop
    stays free to answer health-check probes."""
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, _load_server_core)


@fastapi_app.on_event("startup")
async def _bootstrap():
    # Schedule heavy loading as a background task.
    # The startup event returns immediately → uvicorn opens the port.
    asyncio.create_task(_deferred_init())
