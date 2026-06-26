"""CSV Export endpoints and Restore endpoints"""
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse
import csv
import io
import json
import zipfile

from database import db
from auth import get_current_user

router = APIRouter(prefix="/api", tags=["Export/Restore"])


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
        raise HTTPException(status_code=403, detail="Solo administradores pueden descargar respaldos")

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


# ==================== FULL DATABASE RESTORE ====================
@router.post("/admin/restore")
async def admin_full_restore(file: UploadFile = File(...), current_user: dict = Depends(get_current_user)):
    """
    Restaura una base de datos desde un archivo .zip de respaldo.
    Solo admin/owner. Pregunta confirmación primero? No, solo ejecuta.
    """
    from datetime import datetime, timezone
    from utils import create_audit_log

    role = (current_user.get("role") or "").lower()
    if role not in ("admin", "owner", "super_admin"):
        raise HTTPException(status_code=403, detail="Solo administradores pueden restaurar respaldos")

    if not file.filename.lower().endswith(".zip"):
        raise HTTPException(status_code=400, detail="El archivo debe ser un .zip de respaldo")

    content = await file.read()
    buf = io.BytesIO(content)

    restored_counts = {}
    errors = []
    try:
        with zipfile.ZipFile(buf, "r") as zf:
            # Leer manifest primero (si existe)
            manifest = None
            if "manifest.json" in zf.namelist():
                manifest = json.loads(zf.read("manifest.json"))
            
            for filename in zf.namelist():
                if filename == "manifest.json":
                    continue
                if not filename.endswith(".json"):
                    continue
                
                col_name = filename.replace(".json", "")
                try:
                    collection = getattr(db, col_name, None)
                    if collection is None:
                        errors.append(f"Colección {col_name} no encontrada")
                        continue

                    # Leer contenido JSON
                    json_content = zf.read(filename)
                    docs = json.loads(json_content)
                    
                    # Borrar la colección existente y volver a insertar
                    await collection.delete_many({})
                    if docs:
                        await collection.insert_many(docs)
                    
                    restored_counts[col_name] = len(docs)
                except Exception as e:
                    errors.append(f"Error al restaurar {col_name}: {str(e)}")

        await create_audit_log(
            "DB_RESTORED", "system", "full_db",
            current_user["id"],
            {"restored_collections": restored_counts, "errors": errors}
        )
        return {
            "success": True,
            "restored_collections": restored_counts,
            "errors": errors,
            "total_restored": sum(restored_counts.values())
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al leer el zip: {str(e)}")


# ==================== CSV RESTORE (single collection) ====================
@router.post("/admin/restore/csv/{collection}")
async def admin_restore_csv(
    collection: str,
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    """
    Restaura/importa una colección desde un archivo CSV.
    Solo admin/owner. Borra la colección existente y vuelve a insertar.
    """
    from utils import create_audit_log

    role = (current_user.get("role") or "").lower()
    if role not in ("admin", "owner", "super_admin"):
        raise HTTPException(status_code=403, detail="Solo administradores pueden restaurar CSV")

    if not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="El archivo debe ser un .csv")

    # Validar que la colección exista
    allowed_collections = [
        "customers", "orders", "leads", "quotes", "tickets",
        "products", "memberships", "membership_subscriptions",
        "addresses", "payments", "invoices", "expenses",
        "fuel_logs", "mileage_logs", "route_trips", "vehicles"
    ]
    if collection not in allowed_collections:
        raise HTTPException(status_code=400, detail=f"Colección no permitida. Colecciones disponibles: {', '.join(allowed_collections)}")

    try:
        db_collection = getattr(db, collection, None)
        if db_collection is None:
            raise HTTPException(status_code=404, detail=f"Colección {collection} no encontrada")

        content = await file.read()
        text = content.decode("utf-8", errors="ignore")
        reader = csv.DictReader(io.StringIO(text))
        rows = []
        for row in reader:
            # Convertir campos que son JSON (arrays/dicts) de vuelta a objetos
            parsed_row = {}
            for key, value in row.items():
                if value:
                    try:
                        parsed_row[key] = json.loads(value)
                    except:
                        parsed_row[key] = value
                else:
                    parsed_row[key] = value
            rows.append(parsed_row)

        # Borrar la colección existente y volver a insertar
        await db_collection.delete_many({})
        inserted_count = 0
        if rows:
            result = await db_collection.insert_many(rows)
            inserted_count = len(result.inserted_ids)

        await create_audit_log(
            "CSV_RESTORED", collection, "csv_import",
            current_user["id"],
            {"inserted_count": inserted_count}
        )

        return {
            "success": True,
            "collection": collection,
            "inserted_count": inserted_count
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al procesar el CSV: {str(e)}")
