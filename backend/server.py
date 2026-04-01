"""
Lightweight entry-point so uvicorn can bind port 8001 in < 2 seconds.
Heavy imports (socketio, server_core) run in a background thread AFTER
the port is already open and responding to health checks.
"""
import asyncio

from shared import fastapi_app

# Re-export for backward compat (other modules may import from server)
# But the canonical source is now shared.py
import shared

# ── Health-check available before any heavy import ───────────────────
@fastapi_app.get("/api/health")
@fastapi_app.get("/health")
async def health_check():
    return {"status": "ok"}


# ── Lazy ASGI wrapper ────────────────────────────────────────────────
class _SwappableASGI:
    """Starts delegating to plain FastAPI; swapped to socketio.ASGIApp later."""

    def __init__(self, initial):
        self._inner = initial

    async def __call__(self, scope, receive, send):
        await self._inner(scope, receive, send)

    def mount(self, new_app):
        self._inner = new_app


app = _SwappableASGI(fastapi_app)


# ── Deferred heavy initialisation (runs AFTER port opens) ───────────
def _load_heavy():
    """Run in a thread-pool worker so the event loop stays free."""
    # 1. Import socketio (heavy) and create the AsyncServer
    import socketio as _sio_mod

    sio_obj = _sio_mod.AsyncServer(
        async_mode="asgi",
        cors_allowed_origins="*",
        ping_timeout=60,
        ping_interval=25,
    )

    # 2. Expose sio at module level in shared BEFORE importing server_core
    shared.sio = sio_obj

    # 3. Import server_core (all routes, DB, etc.)
    import server_core  # noqa: F401

    # 4. Wrap fastapi_app with socketio ASGI and swap the live app
    socketio_asgi = _sio_mod.ASGIApp(
        sio_obj,
        other_asgi_app=fastapi_app,
        socketio_path="api/socket.io",
    )
    app.mount(socketio_asgi)


async def _deferred_init():
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, _load_heavy)


@fastapi_app.on_event("startup")
async def _bootstrap():
    # Fire-and-forget: heavy loading happens while health probes pass
    asyncio.create_task(_deferred_init())
