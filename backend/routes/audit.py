"""Audit Log endpoints — extracted from server_core.py"""
from fastapi import APIRouter, Depends
from typing import Optional, List

from database import db
from models import AuditLogResponse
from auth import get_current_user

router = APIRouter(prefix="/api", tags=["Audit"])


@router.get("/audit-logs", response_model=List[AuditLogResponse])
async def get_audit_logs(
    entity_type: Optional[str] = None,
    entity_id: Optional[str] = None,
    event_type: Optional[str] = None,
    limit: int = 100,
    current_user: dict = Depends(get_current_user),
):
    query = {}
    if entity_type:
        query["entity_type"] = entity_type
    if entity_id:
        query["entity_id"] = entity_id
    if event_type:
        query["event_type"] = event_type
    logs = await db.audit_logs.find(query, {"_id": 0}).sort("created_at", -1).limit(limit).to_list(limit)
    return [AuditLogResponse(**log) for log in logs]
