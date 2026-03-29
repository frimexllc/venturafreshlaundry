"""File upload/download endpoints using Emergent Object Storage"""
from fastapi import APIRouter, HTTPException, Depends, File, UploadFile, Query, Header
from fastapi.responses import Response
from typing import Optional
from datetime import datetime, timezone
import uuid
import os
import logging
import requests

from database import db
from auth import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/files", tags=["Files"])

STORAGE_URL = "https://integrations.emergentagent.com/objstore/api/v1/storage"
EMERGENT_KEY = os.environ.get("EMERGENT_LLM_KEY")
APP_NAME = "ventura-fresh-laundry"
storage_key = None

MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB
ALLOWED_TYPES = {
    "image/jpeg", "image/png", "image/webp", "image/gif", "image/heic",
    "application/pdf", "text/plain", "text/csv",
}


def init_storage():
    global storage_key
    if storage_key:
        return storage_key
    if not EMERGENT_KEY:
        raise RuntimeError("EMERGENT_LLM_KEY not set")
    resp = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_KEY}, timeout=30)
    resp.raise_for_status()
    storage_key = resp.json()["storage_key"]
    logger.info("Object storage initialized")
    return storage_key


def put_object(path: str, data: bytes, content_type: str) -> dict:
    key = init_storage()
    resp = requests.put(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key, "Content-Type": content_type},
        data=data,
        timeout=120,
    )
    resp.raise_for_status()
    return resp.json()


def get_object(path: str):
    key = init_storage()
    resp = requests.get(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key},
        timeout=60,
    )
    resp.raise_for_status()
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")


@router.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    context: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_user),
):
    data = await file.read()
    if len(data) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="File too large (max 10MB)")

    ct = file.content_type or "application/octet-stream"
    if ct not in ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail=f"File type {ct} not allowed")

    ext = file.filename.split(".")[-1].lower() if file.filename and "." in file.filename else "bin"
    uid = str(uuid.uuid4())
    storage_path = f"{APP_NAME}/uploads/{current_user['id']}/{uid}.{ext}"

    result = put_object(storage_path, data, ct)

    file_record = {
        "id": uid,
        "storage_path": result["path"],
        "original_filename": file.filename,
        "content_type": ct,
        "size": result.get("size", len(data)),
        "context": context,
        "uploaded_by": current_user["id"],
        "is_deleted": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.files.insert_one(file_record)

    return {
        "id": uid,
        "filename": file.filename,
        "content_type": ct,
        "size": file_record["size"],
        "url": f"/api/files/{uid}/download",
    }


@router.get("/{file_id}/download")
async def download_file(
    file_id: str,
    authorization: Optional[str] = Header(None),
    auth: Optional[str] = Query(None),
):
    token = None
    if authorization:
        token = authorization.replace("Bearer ", "")
    elif auth:
        token = auth

    if not token:
        raise HTTPException(status_code=401, detail="Authentication required")

    from auth import decode_token
    try:
        decode_token(token)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")

    record = await db.files.find_one({"id": file_id, "is_deleted": False}, {"_id": 0})
    if not record:
        raise HTTPException(status_code=404, detail="File not found")

    data, content_type = get_object(record["storage_path"])
    return Response(
        content=data,
        media_type=record.get("content_type", content_type),
        headers={"Content-Disposition": f"inline; filename=\"{record.get('original_filename', 'file')}\""},
    )


@router.get("/by-context/{context_type}/{context_id}")
async def list_files_by_context(
    context_type: str,
    context_id: str,
    current_user: dict = Depends(get_current_user),
):
    context = f"{context_type}:{context_id}"
    files = await db.files.find(
        {"context": context, "is_deleted": False},
        {"_id": 0, "storage_path": 0},
    ).sort("created_at", -1).to_list(50)
    for f in files:
        f["url"] = f"/api/files/{f['id']}/download"
    return files


@router.delete("/{file_id}")
async def soft_delete_file(file_id: str, current_user: dict = Depends(get_current_user)):
    result = await db.files.update_one(
        {"id": file_id, "is_deleted": False},
        {"$set": {"is_deleted": True, "deleted_at": datetime.now(timezone.utc).isoformat()}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="File not found")
    return {"ok": True}
