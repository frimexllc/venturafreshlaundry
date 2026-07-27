"""Singleton MongoDB connection and shared runtime configuration.

Every module in the backend that needs the database handle or a piece of
global configuration (JWT settings, feature flags) imports it from here
instead of re-reading environment variables in place. This keeps
configuration centralized and makes misconfiguration fail fast at import
time instead of surfacing as a confusing runtime error deep in a request.
"""
import os
import logging
from typing import Final

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

logger = logging.getLogger(__name__)


def _require_env(name: str) -> str:
    """Return the value of a required environment variable or raise.

    Failing fast on startup is much cheaper to debug than discovering a
    missing secret hours later because of a silently-wrong fallback value.
    """
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(
            f"Missing required environment variable '{name}'. "
            f"Set it in your .env file or deployment environment."
        )
    return value


mongo_url: Final[str] = _require_env("MONGO_URL")
client: Final[AsyncIOMotorClient] = AsyncIOMotorClient(mongo_url)

# In production (Atlas), MONGO_URL already carries the authorized database
# name, so get_default_database() picks it up. Local dev connection strings
# often omit it, so we fall back to the explicit DB_NAME env var.
try:
    db: AsyncIOMotorDatabase = client.get_default_database()
except Exception:
    db = client[_require_env("DB_NAME")]

SKIP_SERVER_NOTIFICATIONS: Final[bool] = (
    os.environ.get("SKIP_SERVER_NOTIFICATIONS", "false").lower() == "true"
)
BUSINESS_NAME: Final[str] = os.environ.get("BUSINESS_NAME", "Ventura Fresh Laundry")

# ── JWT configuration ────────────────────────────────────────────────────
# NOTE: previously this fell back to a hardcoded secret string when
# JWT_SECRET was unset. That meant a misconfigured deployment would issue
# and accept tokens signed with a secret visible in source control instead
# of failing loudly. We now require it explicitly.
JWT_SECRET: Final[str] = _require_env("JWT_SECRET")
JWT_ALGORITHM: Final[str] = "HS256"
JWT_EXPIRATION_HOURS: Final[int] = int(os.environ.get("JWT_EXPIRATION_HOURS", "168"))  # 7 days
