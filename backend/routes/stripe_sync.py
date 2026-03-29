"""
Stripe Bidirectional Sync — Customers, Products, Prices.
Push app data → Stripe, Pull Stripe data → app.
"""
import os
import logging
from datetime import datetime, timezone
from typing import Optional
import uuid

import stripe
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

from database import db
from auth import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/stripe-sync", tags=["stripe-sync"])

STRIPE_API_KEY = os.environ.get("STRIPE_API_KEY", "")
stripe.api_key = STRIPE_API_KEY


def _enabled():
    return bool(STRIPE_API_KEY)


class SyncRequest(BaseModel):
    dry_run: bool = False
    limit: Optional[int] = 100


# ─── STATUS ──────────────────────────────────────────────────────────────────

@router.get("/status")
async def stripe_sync_status(current_user: dict = Depends(get_current_user)):
    last_sync = await db.stripe_sync_log.find_one(
        {}, {"_id": 0}, sort=[("timestamp", -1)]
    )
    return {
        "enabled": _enabled(),
        "mode": "live" if _enabled() else "disabled",
        "last_sync": last_sync,
        "capabilities": {
            "push": ["customers", "products", "prices"],
            "pull": ["customers", "products", "prices"],
        },
    }


async def _log_sync(action: str, entity: str, stats: dict):
    await db.stripe_sync_log.insert_one({
        "id": str(uuid.uuid4()),
        "action": action,
        "entity": entity,
        "stats": stats,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })


# ─── PUSH: App → Stripe ─────────────────────────────────────────────────────

@router.post("/push/customers")
async def push_customers(req: SyncRequest, current_user: dict = Depends(get_current_user)):
    if not _enabled():
        raise HTTPException(status_code=503, detail="Stripe not configured")

    customers = await db.customers.find(
        {}, {"_id": 0}
    ).limit(req.limit).to_list(req.limit)

    created, updated, skipped, errors = 0, 0, 0, 0

    for c in customers:
        email = c.get("email", "").strip()
        if not email:
            skipped += 1
            continue

        stripe_id = c.get("stripe_customer_id")
        name = c.get("name", "")
        phone = c.get("phone", "")
        metadata = {"app_id": c.get("id", ""), "source": "ventura_sync"}

        if req.dry_run:
            if stripe_id:
                updated += 1
            else:
                created += 1
            continue

        try:
            if stripe_id:
                stripe.Customer.modify(
                    stripe_id, name=name, phone=phone, metadata=metadata
                )
                updated += 1
            else:
                sc = stripe.Customer.create(
                    email=email, name=name, phone=phone, metadata=metadata
                )
                await db.customers.update_one(
                    {"id": c["id"]},
                    {"$set": {"stripe_customer_id": sc.id, "updated_at": datetime.now(timezone.utc).isoformat()}},
                )
                created += 1
        except Exception as e:
            logger.error(f"Push customer {email}: {e}")
            errors += 1

    stats = {"created": created, "updated": updated, "skipped": skipped, "errors": errors, "total": len(customers), "dry_run": req.dry_run}
    await _log_sync("push", "customers", stats)
    return stats


@router.post("/push/products")
async def push_products(req: SyncRequest, current_user: dict = Depends(get_current_user)):
    if not _enabled():
        raise HTTPException(status_code=503, detail="Stripe not configured")

    services = await db.services.find(
        {}, {"_id": 0}
    ).limit(req.limit).to_list(req.limit)

    created, updated, skipped, errors = 0, 0, 0, 0

    for svc in services:
        name = svc.get("name", "").strip()
        if not name:
            skipped += 1
            continue

        stripe_product_id = svc.get("stripe_product_id")
        description = svc.get("description", "")
        price_value = svc.get("price_per_lb") or svc.get("price") or 0
        metadata = {"app_id": svc.get("id", ""), "service_type": svc.get("service_type", ""), "source": "ventura_sync"}

        if req.dry_run:
            created += 1 if not stripe_product_id else 0
            updated += 1 if stripe_product_id else 0
            continue

        try:
            if stripe_product_id:
                stripe.Product.modify(
                    stripe_product_id, name=name, description=description, metadata=metadata
                )
                updated += 1
            else:
                sp = stripe.Product.create(
                    name=name, description=description, metadata=metadata
                )
                # Create default price
                if price_value > 0:
                    price_cents = int(round(price_value * 100))
                    sp_price = stripe.Price.create(
                        product=sp.id,
                        unit_amount=price_cents,
                        currency="usd",
                        metadata={"app_service_id": svc.get("id", "")},
                    )
                    await db.services.update_one(
                        {"id": svc["id"]},
                        {"$set": {
                            "stripe_product_id": sp.id,
                            "stripe_price_id": sp_price.id,
                            "updated_at": datetime.now(timezone.utc).isoformat(),
                        }},
                    )
                else:
                    await db.services.update_one(
                        {"id": svc["id"]},
                        {"$set": {"stripe_product_id": sp.id, "updated_at": datetime.now(timezone.utc).isoformat()}},
                    )
                created += 1
        except Exception as e:
            logger.error(f"Push product {name}: {e}")
            errors += 1

    stats = {"created": created, "updated": updated, "skipped": skipped, "errors": errors, "total": len(services), "dry_run": req.dry_run}
    await _log_sync("push", "products", stats)
    return stats


# ─── PULL: Stripe → App ─────────────────────────────────────────────────────

@router.post("/pull/customers")
async def pull_customers(req: SyncRequest, current_user: dict = Depends(get_current_user)):
    if not _enabled():
        raise HTTPException(status_code=503, detail="Stripe not configured")

    created, updated, skipped, errors = 0, 0, 0, 0

    try:
        stripe_customers = stripe.Customer.list(limit=req.limit)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Stripe API error: {e}")

    for sc in stripe_customers.auto_paging_iter():
        if created + updated + skipped >= req.limit:
            break

        email = (sc.email or "").strip().lower()
        if not email:
            skipped += 1
            continue

        if req.dry_run:
            existing = await db.customers.find_one({"stripe_customer_id": sc.id}, {"_id": 0, "id": 1})
            if existing:
                updated += 1
            else:
                created += 1
            continue

        try:
            existing = await db.customers.find_one(
                {"$or": [{"stripe_customer_id": sc.id}, {"email": email}]},
                {"_id": 0, "id": 1},
            )
            now = datetime.now(timezone.utc).isoformat()

            if existing:
                await db.customers.update_one(
                    {"id": existing["id"]},
                    {"$set": {
                        "stripe_customer_id": sc.id,
                        "name": sc.name or existing.get("name", ""),
                        "phone": sc.phone or "",
                        "updated_at": now,
                    }},
                )
                updated += 1
            else:
                await db.customers.insert_one({
                    "id": str(uuid.uuid4()),
                    "stripe_customer_id": sc.id,
                    "name": sc.name or "",
                    "email": email,
                    "phone": sc.phone or "",
                    "source": "stripe_sync",
                    "created_at": now,
                    "updated_at": now,
                })
                created += 1
        except Exception as e:
            logger.error(f"Pull customer {sc.id}: {e}")
            errors += 1

    stats = {"created": created, "updated": updated, "skipped": skipped, "errors": errors, "dry_run": req.dry_run}
    await _log_sync("pull", "customers", stats)
    return stats


@router.post("/pull/products")
async def pull_products(req: SyncRequest, current_user: dict = Depends(get_current_user)):
    if not _enabled():
        raise HTTPException(status_code=503, detail="Stripe not configured")

    created, updated, skipped, errors = 0, 0, 0, 0

    try:
        stripe_products = stripe.Product.list(limit=req.limit, active=True)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Stripe API error: {e}")

    for sp in stripe_products.auto_paging_iter():
        if created + updated + skipped >= req.limit:
            break

        name = (sp.name or "").strip()
        if not name:
            skipped += 1
            continue

        if req.dry_run:
            existing = await db.stripe_products.find_one({"stripe_product_id": sp.id}, {"_id": 0, "id": 1})
            if existing:
                updated += 1
            else:
                created += 1
            continue

        try:
            # Get default price
            default_price = None
            if sp.default_price:
                try:
                    default_price = stripe.Price.retrieve(sp.default_price)
                except Exception:
                    pass

            now = datetime.now(timezone.utc).isoformat()
            existing = await db.stripe_products.find_one({"stripe_product_id": sp.id}, {"_id": 0, "id": 1})

            doc = {
                "stripe_product_id": sp.id,
                "name": name,
                "description": sp.description or "",
                "active": sp.active,
                "price_cents": default_price.unit_amount if default_price else 0,
                "price_usd": (default_price.unit_amount / 100) if default_price else 0,
                "stripe_price_id": default_price.id if default_price else None,
                "metadata": dict(sp.metadata or {}),
                "updated_at": now,
            }

            if existing:
                await db.stripe_products.update_one({"id": existing["id"]}, {"$set": doc})
                updated += 1
            else:
                doc["id"] = str(uuid.uuid4())
                doc["created_at"] = now
                await db.stripe_products.insert_one(doc)
                created += 1
        except Exception as e:
            logger.error(f"Pull product {sp.id}: {e}")
            errors += 1

    stats = {"created": created, "updated": updated, "skipped": skipped, "errors": errors, "dry_run": req.dry_run}
    await _log_sync("pull", "products", stats)
    return stats


# ─── FULL SYNC ───────────────────────────────────────────────────────────────

@router.post("/full")
async def full_sync(req: SyncRequest, current_user: dict = Depends(get_current_user)):
    """Run bidirectional sync: push app→Stripe, then pull Stripe→app."""
    if not _enabled():
        raise HTTPException(status_code=503, detail="Stripe not configured")

    results = {}
    results["push_customers"] = await push_customers(req, current_user)
    results["push_products"] = await push_products(req, current_user)
    results["pull_customers"] = await pull_customers(req, current_user)
    results["pull_products"] = await pull_products(req, current_user)

    await _log_sync("full_sync", "all", {
        "push_customers": results["push_customers"],
        "push_products": results["push_products"],
        "pull_customers": results["pull_customers"],
        "pull_products": results["pull_products"],
    })

    return results


# ─── SYNC HISTORY ────────────────────────────────────────────────────────────

@router.get("/history")
async def sync_history(limit: int = 20, current_user: dict = Depends(get_current_user)):
    logs = await db.stripe_sync_log.find(
        {}, {"_id": 0}
    ).sort("timestamp", -1).limit(limit).to_list(limit)
    return logs
