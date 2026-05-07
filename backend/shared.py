"""
Shared module: holds FastAPI app and SocketIO references.
Both server.py and server_core.py import from here instead of from each other.
"""
import os
from pathlib import Path
from dotenv import load_dotenv

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env", override=False)

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# ── Create FastAPI app immediately (no heavy deps) ───────────────────
fastapi_app = FastAPI(
    title="Ventura Fresh Laundry CRM",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
)

cors_origins = os.environ.get("CORS_ORIGINS", "*")
fastapi_app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins.split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Placeholder — replaced by _load_heavy() in server.py once socketio loads
sio = None
