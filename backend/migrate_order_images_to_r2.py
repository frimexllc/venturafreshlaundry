"""
One-time migration to move order proof images from MongoDB base64/local disk to R2.

Usage:
    python migrate_order_images_to_r2.py
"""

from __future__ import annotations

import asyncio
import base64
import mimetypes
from pathlib import Path

from dotenv import load_dotenv
from database import db
from object_storage import is_object_storage_enabled, upload_bytes

# Load environment variables
load_dotenv(Path(__file__).parent / ".env")

IMAGE_CONFIGS = [
    {
        "collection": "pickup_images",
        "type": "pickup",
        "order_id_field": "pickup_image_id",
        "order_data_field": "pickup_image_data",
        "order_url_field": "pickup_image_url",
        "order_filename_field": "pickup_image_filename",
    },
    {
        "collection": "delivery_images",
        "type": "delivery",
        "order_id_field": "delivery_image_id",
        "order_data_field": "delivery_image_data",
        "order_url_field": "delivery_image_url",
        "order_filename_field": "delivery_image_filename",
    },
    {
        "collection": "weight_images",
        "type": "weight",
        "order_id_field": "weight_image_id",
        "order_data_field": "weight_image_data",
        "order_url_field": "weight_image_url",
        "order_filename_field": "weight_image_filename",
    },
]


def _guess_extension(filename: str | None, content_type: str | None) -> str:
    if filename and "." in filename:
        return filename.rsplit(".", 1)[-1].lower()
    guessed = mimetypes.guess_extension(content_type or "")
    if guessed:
        return guessed.lstrip(".")
    return "jpg"


def _load_doc_bytes(doc: dict) -> tuple[bytes, str]:
    data_b64 = doc.get("data_base64")
    if data_b64:
        return base64.b64decode(data_b64), doc.get("content_type", "image/jpeg")

    storage_path = doc.get("storage_path")
    if storage_path:
        path = Path(storage_path)
        if path.exists():
            return path.read_bytes(), doc.get("content_type", "image/jpeg")

    raise FileNotFoundError(f"No payload found for image doc {doc.get('id')}")


async def _migrate_collection_images(config: dict) -> dict:
    collection = getattr(db, config["collection"])
    migrated = 0
    skipped = 0
    failed = 0

    cursor = collection.find({}, {"_id": 0})
    async for doc in cursor:
        if doc.get("storage_key") and doc.get("storage_provider") == "r2" and not doc.get("data_base64"):
            skipped += 1
            continue

        try:
            data, content_type = _load_doc_bytes(doc)
            ext = _guess_extension(doc.get("original_filename"), content_type)
            filename = f"{doc.get('type') or config['type']}_{doc['order_id']}_{doc['id']}.{ext}"
            storage_key, storage_url = upload_bytes(
                data,
                f"order-images/{config['collection']}/{filename}",
                content_type,
            )
            await collection.update_one(
                {"id": doc["id"]},
                {
                    "$set": {
                        "storage_provider": "r2",
                        "storage_key": storage_key,
                        "storage_url": storage_url,
                    },
                    "$unset": {
                        "data_base64": "",
                    },
                },
            )
            migrated += 1
        except Exception as exc:
            failed += 1
            print(f"[ERROR] {config['collection']}:{doc.get('id')} -> {exc}")

    return {"collection": config["collection"], "migrated": migrated, "skipped": skipped, "failed": failed}


async def _migrate_legacy_order_fields(config: dict) -> dict:
    updated = 0
    skipped = 0
    created = 0
    failed = 0
    collection = getattr(db, config["collection"])

    cursor = db.orders.find({config["order_data_field"]: {"$exists": True, "$ne": None}}, {"_id": 0})
    async for order in cursor:
        try:
            image_id = order.get(config["order_id_field"])
            image_doc = None
            if image_id:
                image_doc = await collection.find_one({"id": image_id}, {"_id": 0})
            if not image_doc:
                image_doc = await collection.find_one({"order_id": order["id"]}, {"_id": 0}, sort=[("created_at", -1)])

            if image_doc and image_doc.get("storage_key"):
                await db.orders.update_one(
                    {"id": order["id"]},
                    {
                        "$set": {
                            config["order_id_field"]: image_doc["id"],
                            config["order_url_field"]: image_doc.get("storage_url"),
                        },
                        "$unset": {config["order_data_field"]: ""},
                    },
                )
                updated += 1
                continue

            payload = order.get(config["order_data_field"])
            if not payload:
                skipped += 1
                continue

            data = base64.b64decode(payload)
            content_type = "image/jpeg"
            ext = _guess_extension(order.get(config["order_filename_field"]), content_type)

            if not image_doc:
                image_doc = {
                    "id": image_id or f"{config['type']}-{order['id']}",
                    "order_id": order["id"],
                    "type": f"{config['type']}_proof",
                    "original_filename": order.get(config["order_filename_field"]) or f"{config['type']}_{order['id']}.{ext}",
                    "content_type": content_type,
                    "size": len(data),
                    "created_at": order.get("updated_at") or order.get("created_at"),
                }
                created += 1

            filename = f"{config['type']}_{order['id']}_{image_doc['id']}.{ext}"
            storage_key, storage_url = upload_bytes(
                data,
                f"order-images/{config['collection']}/{filename}",
                content_type,
            )

            image_doc.update({
                "storage_provider": "r2",
                "storage_key": storage_key,
                "storage_url": storage_url,
            })
            image_doc.pop("data_base64", None)

            await collection.update_one(
                {"id": image_doc["id"]},
                {"$set": image_doc, "$unset": {"data_base64": ""}},
                upsert=True,
            )
            await db.orders.update_one(
                {"id": order["id"]},
                {
                    "$set": {
                        config["order_id_field"]: image_doc["id"],
                        config["order_url_field"]: storage_url,
                    },
                    "$unset": {config["order_data_field"]: ""},
                },
            )
            updated += 1
        except Exception as exc:
            failed += 1
            print(f"[ERROR] order:{order.get('id')}:{config['type']} -> {exc}")

    return {
        "type": config["type"],
        "updated_orders": updated,
        "created_records": created,
        "skipped": skipped,
        "failed": failed,
    }


async def main():
    if not is_object_storage_enabled():
        raise RuntimeError("R2 is not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME.")

    print("Migrating image collections to R2...")
    for config in IMAGE_CONFIGS:
        result = await _migrate_collection_images(config)
        print(result)

    print("Cleaning legacy base64 fields in orders...")
    for config in IMAGE_CONFIGS:
        result = await _migrate_legacy_order_fields(config)
        print(result)

    print("Done.")


if __name__ == "__main__":
    asyncio.run(main())
