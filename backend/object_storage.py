"""
S3-compatible object storage helper.

Designed for Cloudflare R2 but also works with any S3-compatible backend.
"""

from __future__ import annotations

import logging
import os
from typing import Optional, Tuple

import boto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError

logger = logging.getLogger(__name__)

R2_ACCOUNT_ID = os.environ.get("R2_ACCOUNT_ID", "").strip()
R2_ACCESS_KEY_ID = os.environ.get("R2_ACCESS_KEY_ID", "").strip()
R2_SECRET_ACCESS_KEY = os.environ.get("R2_SECRET_ACCESS_KEY", "").strip()
R2_BUCKET_NAME = os.environ.get("R2_BUCKET_NAME", "").strip()
R2_PUBLIC_BASE_URL = os.environ.get("R2_PUBLIC_BASE_URL", "").rstrip("/")


def is_object_storage_enabled() -> bool:
    return all([R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME])


def _get_endpoint_url() -> str:
    return f"https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com"


def get_public_url(storage_key: str) -> Optional[str]:
    if not storage_key:
        return None
    if R2_PUBLIC_BASE_URL:
        return f"{R2_PUBLIC_BASE_URL}/{storage_key}"
    return None


def _get_client():
    if not is_object_storage_enabled():
        raise RuntimeError("Object storage is not configured")
    return boto3.client(
        "s3",
        endpoint_url=_get_endpoint_url(),
        aws_access_key_id=R2_ACCESS_KEY_ID,
        aws_secret_access_key=R2_SECRET_ACCESS_KEY,
        region_name="auto",
        config=Config(signature_version="s3v4"),
    )


def upload_bytes(data: bytes, storage_key: str, content_type: str) -> Tuple[str, Optional[str]]:
    client = _get_client()
    try:
        client.put_object(
            Bucket=R2_BUCKET_NAME,
            Key=storage_key,
            Body=data,
            ContentType=content_type,
        )
    except (ClientError, BotoCoreError) as exc:
        logger.error("R2 upload failed for key=%s: %s", storage_key, exc)
        raise
    return storage_key, get_public_url(storage_key)


def get_bytes(storage_key: str) -> Tuple[bytes, str]:
    client = _get_client()
    try:
        response = client.get_object(Bucket=R2_BUCKET_NAME, Key=storage_key)
        data = response["Body"].read()
        content_type = response.get("ContentType") or "application/octet-stream"
        return data, content_type
    except client.exceptions.NoSuchKey as exc:
        raise FileNotFoundError(storage_key) from exc
    except (ClientError, BotoCoreError) as exc:
        logger.error("R2 read failed for key=%s: %s", storage_key, exc)
        raise
