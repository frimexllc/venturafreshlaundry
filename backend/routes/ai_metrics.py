"""AI Metrics & Quick Approval endpoints."""
import os
import uuid
import logging
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, HTTPException, Depends, Query

from database import db
from models import ROLE_OPERATOR, ROLE_ADMIN
from auth import require_role, get_current_user
from utils import create_audit_log

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["AI Metrics"])


@router.get("/ai/metrics")
async def get_ai_metrics(days: int = Query(default=30, ge=1, le=365), current_user: dict = Depends(require_role([ROLE_ADMIN]))):
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    total_interactions = await db.ai_command_logs.count_documents({"created_at": {"$gte": cutoff}})
    executed_count = await db.ai_command_logs.count_documents({"created_at": {"$gte": cutoff}, "executed": True})
    critical_count = await db.ai_command_logs.count_documents({"created_at": {"$gte": cutoff}, "requires_confirmation": True})

    pipeline_success = [
        {"$match": {"created_at": {"$gte": cutoff}, "executed": True}},
        {"$unwind": "$results"},
        {"$group": {"_id": None, "total": {"$sum": 1}, "ok": {"$sum": {"$cond": [{"$eq": ["$results.ok", True]}, 1, 0]}}}},
    ]
    agg = await db.ai_command_logs.aggregate(pipeline_success).to_list(1)
    success_total = agg[0]["total"] if agg else 0
    success_ok = agg[0]["ok"] if agg else 0

    pipeline_types = [
        {"$match": {"created_at": {"$gte": cutoff}, "executed": True}},
        {"$unwind": "$results"},
        {"$group": {"_id": "$results.type", "count": {"$sum": 1}, "ok": {"$sum": {"$cond": [{"$eq": ["$results.ok", True]}, 1, 0]}}}},
    ]
    action_breakdown = [{"type": doc["_id"] or "unknown", "count": doc["count"], "success": doc["ok"]} async for doc in db.ai_command_logs.aggregate(pipeline_types)]

    daily_summaries = await db.ai_daily_summaries.find(
        {"day": {"$gte": (datetime.now(timezone.utc) - timedelta(days=days)).strftime("%Y-%m-%d")}},
        {"_id": 0, "day": 1, "interactions_count": 1, "actions_proposed_count": 1, "actions_executed_count": 1},
    ).sort("day", -1).to_list(days)

    unique_sessions = await db.ai_command_logs.distinct("session_id", {"created_at": {"$gte": cutoff}})
    recent_logs = await db.ai_command_logs.find(
        {"created_at": {"$gte": cutoff}},
        {"_id": 0, "id": 1, "session_id": 1, "user_id": 1, "message": 1, "reply": 1, "actions": 1, "executed": 1, "requires_confirmation": 1, "results": 1, "confidence": 1, "created_at": 1},
    ).sort("created_at", -1).limit(50).to_list(50)

    return {
        "period_days": days, "total_interactions": total_interactions,
        "total_sessions": len(unique_sessions), "executed_commands": executed_count,
        "critical_actions_requested": critical_count,
        "action_success_total": success_total, "action_success_ok": success_ok,
        "success_rate": round((success_ok / success_total * 100), 1) if success_total > 0 else 0,
        "action_breakdown": action_breakdown, "daily_summaries": daily_summaries,
        "recent_logs": recent_logs,
    }


@router.get("/ai/pending-actions")
async def list_pending_actions(current_user: dict = Depends(require_role([ROLE_OPERATOR, ROLE_ADMIN]))):
    pending = await db.ai_pending_actions.find({"status": "pending"}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return {"pending_actions": pending}


@router.post("/ai/pending-actions/{action_id}/approve")
async def approve_pending_action(action_id: str, current_user: dict = Depends(require_role([ROLE_OPERATOR, ROLE_ADMIN]))):
    action = await db.ai_pending_actions.find_one({"id": action_id, "status": "pending"})
    if not action:
        raise HTTPException(status_code=404, detail="Pending action not found")

    now = datetime.now(timezone.utc).isoformat()
    base_url = os.environ.get("REACT_APP_BACKEND_URL", "")

    from routes.ai_assistant import execute_jarvis_action
    results = []
    for act in action.get("actions", []):
        a_type = act.get("type") or act.get("action")
        a_payload = act.get("payload") or act.get("params") or {}
        try:
            result = await execute_jarvis_action(a_type, a_payload, current_user, base_url)
            results.append(result)
        except Exception as exc:
            results.append({"type": a_type, "ok": False, "error": str(exc)})

    await db.ai_pending_actions.update_one({"id": action_id}, {"$set": {"status": "approved", "approved_at": now, "approved_by": current_user.get("id"), "results": results}})
    await db.ai_command_logs.update_one({"session_id": action.get("session_id"), "confirm_token": action.get("token")}, {"$set": {"executed": True, "results": results}})
    return {"ok": True, "message": "Action approved and executed", "results": results}


@router.post("/ai/pending-actions/{action_id}/reject")
async def reject_pending_action(action_id: str, current_user: dict = Depends(require_role([ROLE_OPERATOR, ROLE_ADMIN]))):
    action = await db.ai_pending_actions.find_one({"id": action_id, "status": "pending"})
    if not action:
        raise HTTPException(status_code=404, detail="Pending action not found")
    await db.ai_pending_actions.update_one({"id": action_id}, {"$set": {"status": "rejected", "rejected_at": datetime.now(timezone.utc).isoformat(), "rejected_by": current_user.get("id")}})
    return {"ok": True, "message": "Action rejected"}
