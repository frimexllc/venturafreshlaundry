"""Shared module: holds the FastAPI app and Socket.IO references.

Both server.py and server_core.py import from here instead of from each
other, avoiding a circular import between the "core" app object and the
process that wires the heavy dependencies (sockets, routers) onto it.
"""
import logging
import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

logger = logging.getLogger(__name__)

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env", override=False)

# ── Create FastAPI app immediately (no heavy deps) ───────────────────────
fastapi_app = FastAPI(
    title="Ventura Fresh Laundry CRM",
    docs_url=None,      # interactive docs disabled in all environments
    redoc_url=None,
    openapi_url=None,
)

# NOTE: `allow_origins=["*"]` combined with `allow_credentials=True` is
# rejected by browsers (and is unsafe even when a browser lets it through,
# since it means any site can make authenticated requests on a user's
# behalf). CORS_ORIGINS must be an explicit comma-separated allowlist in
# any environment that needs credentials; "*" is only tolerated for local
# dev, and only with credentials disabled.
cors_origins_env = os.environ.get("CORS_ORIGINS", "").strip()
if cors_origins_env:
    cors_origins = [origin.strip() for origin in cors_origins_env.split(",") if origin.strip()]
    allow_credentials = True
else:
    logger.warning(
        "CORS_ORIGINS is not set — falling back to '*' with credentials disabled. "
        "Set CORS_ORIGINS to an explicit domain list in production."
    )
    cors_origins = ["*"]
    allow_credentials = False

fastapi_app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=allow_credentials,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Placeholder — replaced by _load_heavy() in server.py once socketio loads.
sio = None
