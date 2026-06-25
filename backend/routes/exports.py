"""CSV Export endpoints"""
from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
import csv
import io
import json

from database import db
from auth import get_current_user

router = APIRouter(prefix="/api", tags=["Export"])


async def _export_collection(collection, filename):
    items = await collection.find({}, {"_id": 0}).to_list(10000)
    output = io.StringIO()
    if items:
        all_keys = set()
        for item in items:
            if isinstance(item, dict):
                all_keys.update([str(k) for k in item.keys()])
        fieldnames = sorted(list(all_keys))
        writer = csv.DictWriter(output, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        for item in items:
            row = {}
            for key in fieldnames:
                value = item.get(key, "")
                if isinstance(value, (dict, list)):
                    value = json.dumps(value, default=str)
                elif value is None:
                    value = ""
                elif not isinstance(value, (str, int, float, bool)):
                    value = str(value)
                row[key] = value
            writer.writerow(row)
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@router.get("/export/customers")
async def export_customers_csv(current_user: dict = Depends(get_current_user)):
    return await _export_collection(db.customers, "customers.csv")


@router.get("/export/orders")
async def export_orders_csv(current_user: dict = Depends(get_current_user)):
    return await _export_collection(db.orders, "orders.csv")


@router.get("/export/leads")
async def export_leads_csv(current_user: dict = Depends(get_current_user)):
    return await _export_collection(db.leads, "leads.csv")


@router.get("/export/quotes")
async def export_quotes_csv(current_user: dict = Depends(get_current_user)):
    return await _export_collection(db.quotes, "quotes.csv")


@router.get("/export/tickets")
async def export_tickets_csv(current_user: dict = Depends(get_current_user)):
    return await _export_collection(db.tickets, "tickets.csv")


# ==================== FULL DATABASE BACKUP ====================
@router.get("/admin/backup")
async def admin_full_backup(current_user: dict = Depends(get_current_user)):
    """
    Genera un respaldo completo de la base de datos como archivo .zip
    con un JSON por colección. Solo admin/owner.

    Returns: zip stream con manifest.json + {collection}.json para cada colección
    """
    # Solo admin/owner pueden descargar respaldos completos
    role = (current_user.get("role") or "").lower()
    if role not in ("admin", "owner", "super_admin"):
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="Solo administradores pueden descargar respaldos")

    import zipfile
    from datetime import datetime, timezone

    # Lista de colecciones a incluir (importantes para restaurar el negocio)
    COLLECTIONS = [
        "users", "customers", "orders", "leads", "quotes",
        "tickets", "products", "memberships", "membership_subscriptions",
        "addresses", "payments", "invoices", "expenses",
        "fuel_logs", "mileage_logs", "route_trips", "vehicles",
        "notifications", "messages", "audit_logs",
        "calendar_events", "store_orders", "files",
        "preferences", "feedback", "suggestions", "refunds",
        "delivery_settings", "logistics_settings",
    ]

    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d_%H%M%S")
    filename = f"vfl_backup_{timestamp}.zip"

    buf = io.BytesIO()
    counts: dict = {}
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for col_name in COLLECTIONS:
            try:
                collection = getattr(db, col_name, None)
                if collection is None:
                    continue
                docs = await collection.find({}, {"_id": 0}).to_list(100000)
                counts[col_name] = len(docs)
                payload = json.dumps(docs, default=str, ensure_ascii=False, indent=2)
                zf.writestr(f"{col_name}.json", payload)
            except Exception as e:
                # No bloquear el backup si una colección falla
                counts[col_name] = f"error: {str(e)[:60]}"

        # Manifest con metadata
        manifest = {
            "app": "Ventura Fresh Laundry",
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "generated_by": current_user.get("email", "unknown"),
            "collections": counts,
            "total_documents": sum(c for c in counts.values() if isinstance(c, int)),
            "format_version": "1.0",
            "restore_instructions": (
                "Use `mongorestore --uri=$MONGO_URL --db=$DB_NAME` después de "
                "convertir cada .json a BSON con `mongoimport --jsonArray`."
            ),
        }
        zf.writestr("manifest.json", json.dumps(manifest, indent=2, ensure_ascii=False))

    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="application/zip",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "X-Backup-Documents": str(manifest["total_documents"]),
        },
    )
