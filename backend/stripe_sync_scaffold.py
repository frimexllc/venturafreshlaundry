from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Dict, List, Optional
import os
from datetime import datetime, timezone

stripe_sync_router = APIRouter(prefix="/stripe-sync", tags=["stripe-sync-scaffold"])

db = None


def set_database(database):
    global db
    db = database


def is_enabled() -> bool:
    return os.environ.get("STRIPE_ADVANCED_SYNC_ENABLED", "false").strip().lower() == "true"


class SyncRequest(BaseModel):
    dry_run: bool = True
    limit: Optional[int] = 100
    include_inactive: bool = False


def disabled_error() -> HTTPException:
    return HTTPException(
        status_code=503,
        detail={
            "message": "Stripe advanced sync is disabled",
            "how_to_enable": "Set STRIPE_ADVANCED_SYNC_ENABLED=true when you are ready",
            "note": "Scaffold only: endpoints/contracts are prepared but not active"
        }
    )


@stripe_sync_router.get("/status")
async def stripe_sync_status():
    return {
        "enabled": is_enabled(),
        "mode": "scaffold",
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "capabilities": {
            "web_app_to_stripe": ["customers", "products", "prices", "payments"],
            "stripe_to_web_app": ["customers", "products", "prices"]
        },
        "activation_note": "Prepared by feature flag only; execution logic intentionally pending for live onboarding call"
    }


@stripe_sync_router.get("/plan")
async def stripe_sync_plan():
    return {
        "feature_flag": "STRIPE_ADVANCED_SYNC_ENABLED",
        "required_entities": ["customers", "products", "prices", "checkout_sessions"],
        "pull_endpoints": [
            "/api/stripe-sync/pull/customers",
            "/api/stripe-sync/pull/products",
            "/api/stripe-sync/pull/prices"
        ],
        "push_endpoints": [
            "/api/stripe-sync/push/customers",
            "/api/stripe-sync/push/products",
            "/api/stripe-sync/push/prices"
        ],
        "notes": [
            "No write operations execute while feature flag is false",
            "This scaffold is meant to be completed in integration review session"
        ]
    }


@stripe_sync_router.post("/pull/{entity}")
async def stripe_sync_pull(entity: str, request: SyncRequest):
    if not is_enabled():
        raise disabled_error()

    valid_entities = {"customers", "products", "prices"}
    if entity not in valid_entities:
        raise HTTPException(status_code=400, detail=f"Unsupported entity: {entity}")

    return {
        "mode": "enabled",
        "direction": "stripe_to_web_app",
        "entity": entity,
        "dry_run": request.dry_run,
        "limit": request.limit,
        "status": "pending_implementation"
    }


@stripe_sync_router.post("/push/{entity}")
async def stripe_sync_push(entity: str, request: SyncRequest):
    if not is_enabled():
        raise disabled_error()

    valid_entities = {"customers", "products", "prices"}
    if entity not in valid_entities:
        raise HTTPException(status_code=400, detail=f"Unsupported entity: {entity}")

    return {
        "mode": "enabled",
        "direction": "web_app_to_stripe",
        "entity": entity,
        "dry_run": request.dry_run,
        "limit": request.limit,
        "status": "pending_implementation"
    }
