"""
AI Sneaker Pricing endpoints.

POST /api/sneaker-analysis                    -> run AI analysis on up to 3 photos of ONE pair
POST /api/sneaker-analysis/batch               -> same, for several pairs at once (one Groq call per pair, run in parallel)
GET  /api/sneaker-analysis?order_id=...        -> list past analyses (for an order, or all recent ones)
POST /api/sneaker-analysis/{id}/decide         -> accept / edit / reject a pending analysis

An "analysis" can exist without an order_id (a standalone quote, e.g. done
at drop-off before an order is created). Accepting a quote-only analysis
just records the decision; accepting one tied to an order also appends a
priced line item to that order's addon_services.
"""
import asyncio
import base64
import logging
import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from auth import get_current_user, require_role
from database import db
from models import ROLE_OPERATOR
from sneaker_ai import analyze_sneaker_photos, build_pricing, MAX_IMAGES_PER_ANALYSIS
from utils import create_audit_log

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["Sneaker AI"])

MAX_PAIRS_PER_BATCH = 6


class SneakerAnalysisRequest(BaseModel):
    order_id: Optional[str] = None
    images_base64: List[str] = Field(..., min_items=1, max_items=MAX_IMAGES_PER_ANALYSIS)
    notes: Optional[str] = None


class SneakerPairInput(BaseModel):
    images_base64: List[str] = Field(..., min_items=1, max_items=MAX_IMAGES_PER_ANALYSIS)
    notes: Optional[str] = None


class SneakerBatchAnalysisRequest(BaseModel):
    order_id: Optional[str] = None
    pairs: List[SneakerPairInput] = Field(..., min_items=1, max_items=MAX_PAIRS_PER_BATCH)


class SneakerDecisionRequest(BaseModel):
    action: str  # "accept" | "edit" | "reject"
    final_price: Optional[float] = None


async def _next_pair_index(order_id: Optional[str]) -> int:
    if not order_id:
        return 1
    count = await db.sneaker_ai_analyses.count_documents(
        {"order_id": order_id, "status": {"$in": ["accepted", "edited"]}}
    )
    return count + 1


async def _analyze_and_price_one_pair(
    images_base64: List[str],
    notes: Optional[str],
    order_id: Optional[str],
    pair_index: int,
    created_by: Optional[str],
) -> dict:
    """Runs one pair's photos through the AI, prices it, and saves a
    pending analysis record. Returns {"ok": True, ...record} on success or
    {"ok": False, "error": ..., "pair_index": ...} on failure — used by
    both the single-pair and batch endpoints so one bad photo in a batch
    doesn't take down every other pair in it."""
    try:
        image_bytes_list = [base64.b64decode(img) for img in images_base64]
    except Exception:
        return {"ok": False, "error": "Invalid image data", "pair_index": pair_index}

    try:
        ai_result = await analyze_sneaker_photos(image_bytes_list, notes=notes)
    except RuntimeError as e:
        return {"ok": False, "error": str(e), "pair_index": pair_index}

    pricing = build_pricing(pair_index, ai_result)
    now = datetime.now(timezone.utc).isoformat()
    record = {
        "id": str(uuid.uuid4()),
        "order_id": order_id,
        "ai_result": ai_result,
        "pricing": pricing,
        "final_price": None,
        "status": "pending",
        "notes": notes,
        "created_by": created_by,
        "created_at": now,
        "updated_at": now,
    }
    await db.sneaker_ai_analyses.insert_one(record)
    return {"ok": True, **{k: v for k, v in record.items() if k != "_id"}}


@router.post("/sneaker-analysis")
async def create_sneaker_analysis(
    data: SneakerAnalysisRequest,
    current_user: dict = Depends(require_role([ROLE_OPERATOR])),
) -> dict:
    if data.order_id:
        order = await db.orders.find_one({"id": data.order_id}, {"_id": 0, "id": 1})
        if not order:
            raise HTTPException(status_code=404, detail="Order not found")

    pair_index = await _next_pair_index(data.order_id)
    result = await _analyze_and_price_one_pair(
        data.images_base64, data.notes, data.order_id, pair_index, current_user.get("id"),
    )
    if not result["ok"]:
        status_code = 400 if result["error"] == "Invalid image data" else 502
        raise HTTPException(status_code=status_code, detail=result["error"])

    return {k: v for k, v in result.items() if k != "ok"}


@router.post("/sneaker-analysis/batch")
async def create_sneaker_analysis_batch(
    data: SneakerBatchAnalysisRequest,
    current_user: dict = Depends(require_role([ROLE_OPERATOR])),
) -> dict:
    """Analyzes several pairs in one request — one Groq call per pair, run
    concurrently. Each pair gets its own pricing tier (1st/2nd/3rd+ pair in
    this order) based on its position in the batch. A pair whose photos
    fail to analyze doesn't block the others; check "ok" on each result."""
    if data.order_id:
        order = await db.orders.find_one({"id": data.order_id}, {"_id": 0, "id": 1})
        if not order:
            raise HTTPException(status_code=404, detail="Order not found")

    start_index = await _next_pair_index(data.order_id)
    results = await asyncio.gather(*[
        _analyze_and_price_one_pair(
            pair.images_base64, pair.notes, data.order_id, start_index + i, current_user.get("id"),
        )
        for i, pair in enumerate(data.pairs)
    ])

    return {"results": results}


@router.get("/sneaker-analysis")
async def list_sneaker_analyses(
    order_id: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    current_user: dict = Depends(require_role([ROLE_OPERATOR])),
) -> list:
    query = {"order_id": order_id} if order_id else {}
    docs = await db.sneaker_ai_analyses.find(query, {"_id": 0}).sort("created_at", -1).to_list(limit)
    return docs


@router.post("/sneaker-analysis/{analysis_id}/decide")
async def decide_sneaker_analysis(
    analysis_id: str,
    data: SneakerDecisionRequest,
    current_user: dict = Depends(require_role([ROLE_OPERATOR])),
) -> dict:
    analysis = await db.sneaker_ai_analyses.find_one({"id": analysis_id}, {"_id": 0})
    if not analysis:
        raise HTTPException(status_code=404, detail="Analysis not found")
    if analysis["status"] != "pending":
        raise HTTPException(status_code=400, detail=f"Analysis already {analysis['status']}")

    action = data.action
    if action not in ("accept", "edit", "reject"):
        raise HTTPException(status_code=400, detail="action must be accept, edit, or reject")

    now = datetime.now(timezone.utc).isoformat()

    if action == "reject":
        await db.sneaker_ai_analyses.update_one(
            {"id": analysis_id},
            {"$set": {"status": "rejected", "decided_by": current_user.get("id"), "updated_at": now}},
        )
        return {"ok": True, "status": "rejected"}

    if data.final_price is None or data.final_price < 0:
        raise HTTPException(status_code=400, detail="final_price is required to accept or edit")

    new_status = "accepted" if action == "accept" else "edited"
    await db.sneaker_ai_analyses.update_one(
        {"id": analysis_id},
        {"$set": {
            "status": new_status,
            "final_price": data.final_price,
            "decided_by": current_user.get("id"),
            "updated_at": now,
        }},
    )

    order_id = analysis.get("order_id")
    if order_id:
        ai_result = analysis.get("ai_result", {})
        label_parts = [p for p in [ai_result.get("brand"), ai_result.get("model")] if p]
        shoe_label = " ".join(label_parts) if label_parts else (ai_result.get("type") or "Sneakers")
        addon_item = {
            "id": str(uuid.uuid4()),
            "name": f"AI Sneaker Cleaning — {shoe_label}",
            "price": data.final_price,
            "price_unit": "per_item",
            "category": "sneaker_cleaning",
            "qty": 1,
        }
        await db.orders.update_one(
            {"id": order_id},
            {
                "$push": {"addon_services": addon_item},
                "$set": {"updated_at": now},
            },
        )

    await create_audit_log(
        "SNEAKER_AI_ANALYSIS_DECIDED", "sneaker_ai_analysis", analysis_id, current_user.get("id"),
        {"action": action, "final_price": data.final_price, "order_id": order_id},
    )

    return {"ok": True, "status": new_status, "final_price": data.final_price}
