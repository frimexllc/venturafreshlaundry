"""Simple local file storage for customer receipts and uploads."""
import os
import logging

logger = logging.getLogger(__name__)

UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)


def put_object(path: str, data: bytes, content_type: str = "") -> dict:
    """Store file data locally. Returns dict with path and size."""
    full_path = os.path.join(UPLOAD_DIR, path)
    os.makedirs(os.path.dirname(full_path), exist_ok=True)
    with open(full_path, "wb") as f:
        f.write(data)
    logger.info(f"Stored file: {full_path} ({len(data)} bytes)")
    return {"path": path, "size": len(data)}


def get_object(path: str) -> tuple:
    """Retrieve file data. Returns (data, content_type)."""
    full_path = os.path.join(UPLOAD_DIR, path)
    if not os.path.exists(full_path):
        raise FileNotFoundError(f"File not found: {path}")
    with open(full_path, "rb") as f:
        data = f.read()
    ext = path.rsplit(".", 1)[-1].lower() if "." in path else ""
    ct_map = {"jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png", "webp": "image/webp"}
    return data, ct_map.get(ext, "application/octet-stream")
