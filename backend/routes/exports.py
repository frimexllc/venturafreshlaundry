"""CSV Export endpoints and Restore endpoints"""
import asyncio
import logging
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse
import csv
import io
import json
import zipfile

from database import db
from auth import get_current_user

logger = logging.getLogger(__name__)

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
async def admin_full_backup(
    format: str = "json",
    current_user: dict = Depends(get_current_user)
):
    """
    Genera un respaldo completo de la base de datos como archivo .zip.
    Solo admin/owner.

    Args:
        format: "json" (default, JSON array por colección) o "jsonl" (una línea por documento)
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
                
                if format.lower() == "jsonl":
                    # JSONL: un documento por línea
                    payload = "\n".join([json.dumps(doc, default=str, ensure_ascii=False) for doc in docs])
                    zf.writestr(f"{col_name}.jsonl", payload)
                else:
                    # JSON: un array de documentos (formato original)
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
            "format": format.lower(),
            "format_version": "1.0",
            "restore_instructions": (
                "Use the restore endpoint in the settings page of the app."
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
    Acepta archivos .json (arrays de docs) o .jsonl (un doc por línea).
    Solo admin/owner.
    """
    from datetime import datetime, timezone
    from utils import create_audit_log

    role = (current_user.get("role") or "").lower()
    if role not in ("admin", "owner", "super_admin"):
        raise HTTPException(status_code=403, detail="Solo administradores pueden restaurar respaldos")

    if not file.filename.lower().endswith(".zip"):
        raise HTTPException(status_code=400, detail="El archivo debe ser un .zip de respaldo")

    logger.info(f"Iniciando restauración de respaldo desde: {file.filename}")
    content = await file.read()
    buf = io.BytesIO(content)

    restored_counts = {}
    errors = []
    invalid_lines = {}

    try:
        with zipfile.ZipFile(buf, "r") as zf:
            logger.info(f"Archivos en el zip: {zf.namelist()}")
            # Leer manifest primero (si existe)
            manifest = None
            if "manifest.json" in zf.namelist():
                manifest = json.loads(zf.read("manifest.json"))
                logger.info(f"Manifest encontrado: {manifest}")
            
            for filename in zf.namelist():
                if filename == "manifest.json":
                    continue
                if not filename.endswith(".json") and not filename.endswith(".jsonl"):
                    logger.info(f"Omitiendo archivo no compatible: {filename}")
                    continue
                
                col_name = filename.replace(".json", "").replace(".jsonl", "").replace("backup/", "")
                try:
                    logger.info(f"Restaurando colección: {col_name} desde: {filename}")
                    collection = getattr(db, col_name, None)
                    if collection is None:
                        err_msg = f"Colección {col_name} no encontrada en la base de datos"
                        logger.error(err_msg)
                        errors.append(err_msg)
                        continue

                    # Leer contenido y parsear
                    raw_content = zf.read(filename)
                    docs = []
                    col_errors = []
                    if filename.endswith(".json"):
                        # Es un JSON array (respaldo antiguo)
                        try:
                            docs = json.loads(raw_content)
                            logger.info(f"Parsed {len(docs)} docs from JSON array for {col_name}")
                        except Exception as e:
                            err_msg = f"Error al parsear JSON para {col_name} (no se restauró esta colección): {str(e)}"
                            logger.error(err_msg)
                            errors.append(err_msg)
                            continue
                    else:
                        # Es JSONL (un doc por línea)
                        try:
                            text = raw_content.decode("utf-8", errors="replace")
                            for line_idx, line in enumerate(text.splitlines()):
                                line = line.strip()
                                if line:
                                    try:
                                        docs.append(json.loads(line))
                                    except Exception as e:
                                        err_msg = f"Error en línea {line_idx + 1} de {filename} (se omitirá): {str(e)} - Contenido: {line[:150]}..."
                                        logger.warning(err_msg)
                                        col_errors.append(err_msg)
                            logger.info(f"Parsed {len(docs)} docs válidos de JSONL para {col_name} (se omitieron {len(col_errors)} líneas)")
                        except Exception as e:
                            err_msg = f"Error al leer JSONL para {col_name} (no se restauró esta colección): {str(e)}"
                            logger.error(err_msg)
                            errors.append(err_msg)
                            continue
                    
                    # Borrar la colección existente y volver a insertar
                    await collection.delete_many({})
                    inserted_count = 0
                    if docs:
                        try:
                            result = await collection.insert_many(docs)
                            inserted_count = len(result.inserted_ids)
                        except Exception as e:
                            err_msg = f"Error al insertar docs en {col_name} (no se restauró esta colección): {str(e)}"
                            logger.error(err_msg)
                            errors.append(err_msg)
                            continue
                    
                    restored_counts[col_name] = inserted_count
                    if col_errors:
                        invalid_lines[col_name] = len(col_errors)
                        errors.extend([f"{col_name}: {e}" for e in col_errors[:10]])
                    logger.info(f"Restaurada colección {col_name} con {inserted_count} documentos")
                except Exception as e:
                    err_msg = f"Error al restaurar {col_name}: {str(e)}"
                    logger.error(err_msg)
                    errors.append(err_msg)

        await create_audit_log(
            "DB_RESTORED", "system", "full_db",
            current_user["id"],
            {"restored_collections": restored_counts, "errors": errors, "invalid_lines": invalid_lines}
        )
        logger.info(f"Restauración completada. Colecciones restauradas: {restored_counts}")
        return {
            "success": True,
            "restored_collections": restored_counts,
            "invalid_lines": invalid_lines,
            "errors": errors[:50],
            "total_restored": sum(restored_counts.values())
        }
    except Exception as e:
        err_msg = f"Error al leer el zip: {str(e)}"
        logger.error(err_msg)
        raise HTTPException(status_code=500, detail=err_msg)


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

# ==================== SAFE COLLECTION DOWNLOAD ====================
@router.get("/admin/backup/{collection_name}")
async def download_collection_json(
    collection_name: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Descarga una colección completa como JSON stream (un documento por línea, JSONL).
    No carga todo en memoria: usa cursor y streaming.
    Solo admin/owner.
    """
    role = (current_user.get("role") or "").lower()
    if role not in ("admin", "owner", "super_admin"):
        raise HTTPException(status_code=403, detail="Solo administradores")

    # Obtener la colección de forma segura desde la base de datos
    collection = getattr(db, collection_name, None)
    if collection is None:
        raise HTTPException(status_code=404, detail=f"Colección '{collection_name}' no encontrada")

    async def generate():
        """Generador que recorre el cursor y envía JSON línea por línea."""
        cursor = collection.find({}, {"_id": 0})
        async for doc in cursor:
            line = json.dumps(doc, default=str, ensure_ascii=False) + "\n"
            yield line.encode("utf-8")
            # Permitir que otras tareas corran (no bloqueante)
            await asyncio.sleep(0)

    filename = f"{collection_name}.jsonl"
    return StreamingResponse(
        generate(),
        media_type="application/x-ndjson",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )
    
@router.post("/admin/free-memory")
async def free_memory(current_user: dict = Depends(get_current_user)):
    """
    Fuerza la recolección de basura del intérprete Python para liberar RAM.
    Solo admin/owner.
    """
    role = (current_user.get("role") or "").lower()
    if role not in ("admin", "owner", "super_admin"):
        raise HTTPException(status_code=403, detail="Solo administradores")

    import gc
    gc.collect()
    return {"status": "ok", "detail": "Garbage collection triggered"}


@router.post("/admin/restore/jsonl/{collection}")
async def admin_restore_jsonl(
    collection: str,
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    """
    Restaura una colección desde un archivo JSONL (un documento por línea).
    Borra la colección existente y vuelve a insertar.
    Solo admin/owner.
    """
    from utils import create_audit_log

    role = (current_user.get("role") or "").lower()
    if role not in ("admin", "owner", "super_admin"):
        raise HTTPException(status_code=403, detail="Solo administradores")

    if not file.filename.lower().endswith(".jsonl") and not file.filename.lower().endswith(".json"):
        raise HTTPException(status_code=400, detail="El archivo debe ser .jsonl o .json")

    logger.info(f"Iniciando restauración de colección {collection} desde: {file.filename}")
    collection_obj = getattr(db, collection, None)
    if collection_obj is None:
        raise HTTPException(status_code=404, detail=f"Colección '{collection}' no encontrada")

    # Leer el archivo línea por línea sin cargar todo en RAM
    content = await file.read()
    docs = []
    errors = []
    if file.filename.lower().endswith(".json"):
        logger.info(f"Parseando como JSON array")
        try:
            docs = json.loads(content)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Error al parsear JSON (no se puede restaurar esta colección): {str(e)}")
    else:
        logger.info(f"Parseando como JSONL")
        lines = content.decode("utf-8", errors="replace").splitlines()
        for line_idx, line in enumerate(lines):
            if line.strip():
                try:
                    docs.append(json.loads(line))
                except Exception as e:
                    err_msg = f"Línea {line_idx + 1} inválida (se omitirá): {str(e)} - Contenido: {line[:150]}..."
                    logger.warning(err_msg)
                    errors.append(err_msg)

    logger.info(f"Parsed {len(docs)} docs válidos para la colección {collection} (se omitieron {len(errors)} líneas inválidas)")
    # Borrar y reinsertar
    await collection_obj.delete_many({})
    inserted_count = 0
    if docs:
        try:
            result = await collection_obj.insert_many(docs)
            inserted_count = len(result.inserted_ids)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Error al insertar documentos: {str(e)}")

    await create_audit_log(
        "JSONL_RESTORED", collection, "jsonl_import",
        current_user["id"],
        {"inserted_count": inserted_count, "invalid_lines_count": len(errors)}
    )
    logger.info(f"Restaurada colección {collection} con {inserted_count} documentos")
    return {
        "success": True,
        "collection": collection,
        "inserted_count": inserted_count,
        "invalid_lines_count": len(errors),
        "errors": errors[:20]  # Limit to first 20 errors to keep response size small
    }

@router.post("/admin/restore/jsonl-zip")
async def admin_restore_jsonl_zip(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    """
    Restaura múltiples colecciones desde un archivo ZIP que contiene archivos JSONL o JSON.
    Cada archivo dentro del ZIP debe llamarse <nombre_coleccion>.jsonl o .json
    Solo admin/owner.
    """
    from utils import create_audit_log
    import zipfile

    role = (current_user.get("role") or "").lower()
    if role not in ("admin", "owner", "super_admin"):
        raise HTTPException(status_code=403, detail="Solo administradores")

    if not file.filename.lower().endswith(".zip"):
        raise HTTPException(status_code=400, detail="El archivo debe ser .zip")

    logger.info(f"Iniciando restauración ZIP desde: {file.filename}")
    content = await file.read()
    buf = io.BytesIO(content)

    restored_counts = {}
    errors = []
    invalid_lines = {}

    try:
        with zipfile.ZipFile(buf, "r") as zf:
            logger.info(f"Archivos en el zip: {zf.namelist()}")
            for zip_filename in zf.namelist():
                if not zip_filename.endswith(".jsonl") and not zip_filename.endswith(".json"):
                    logger.info(f"Omitiendo archivo no compatible: {zip_filename}")
                    continue
                col_name = zip_filename.replace(".jsonl", "").replace(".json", "").replace("backup/", "")
                try:
                    logger.info(f"Restaurando colección: {col_name} desde: {zip_filename}")
                    collection = getattr(db, col_name, None)
                    if collection is None:
                        err_msg = f"Colección '{col_name}' no encontrada"
                        logger.error(err_msg)
                        errors.append(err_msg)
                        continue

                    # Leer el archivo y parsear
                    raw = zf.read(zip_filename)
                    docs = []
                    col_errors = []
                    if zip_filename.endswith(".json"):
                        try:
                            docs = json.loads(raw)
                            logger.info(f"Parsed {len(docs)} docs from JSON array for {col_name}")
                        except Exception as e:
                            err_msg = f"Error al parsear JSON para {col_name} (no se restauró esta colección): {str(e)}"
                            logger.error(err_msg)
                            errors.append(err_msg)
                            continue
                    else:
                        try:
                            text = raw.decode("utf-8", errors="replace")
                            for line_idx, line in enumerate(text.splitlines()):
                                line = line.strip()
                                if line:
                                    try:
                                        docs.append(json.loads(line))
                                    except Exception as e:
                                        err_msg = f"Error en línea {line_idx + 1} de {zip_filename} (se omitirá): {str(e)} - Contenido: {line[:150]}..."
                                        logger.warning(err_msg)
                                        col_errors.append(err_msg)
                            logger.info(f"Parsed {len(docs)} docs válidos de JSONL para {col_name} (se omitieron {len(col_errors)} líneas)")
                        except Exception as e:
                            err_msg = f"Error al leer JSONL para {col_name} (no se restauró esta colección): {str(e)}"
                            logger.error(err_msg)
                            errors.append(err_msg)
                            continue

                    # Borrar y insertar
                    await collection.delete_many({})
                    inserted_count = 0
                    if docs:
                        try:
                            result = await collection.insert_many(docs)
                            inserted_count = len(result.inserted_ids)
                        except Exception as e:
                            err_msg = f"Error al insertar docs en {col_name} (no se restauró esta colección): {str(e)}"
                            logger.error(err_msg)
                            errors.append(err_msg)
                            continue
                    restored_counts[col_name] = inserted_count
                    if col_errors:
                        invalid_lines[col_name] = len(col_errors)
                        errors.extend([f"{col_name}: {e}" for e in col_errors[:10]])  # Limit per collection
                    logger.info(f"Restaurada colección {col_name} con {inserted_count} documentos")
                except Exception as e:
                    err_msg = f"Error al restaurar {col_name}: {str(e)}"
                    logger.error(err_msg)
                    errors.append(err_msg)

        await create_audit_log(
            "JSONL_ZIP_RESTORED", "system", "bulk_jsonl_zip",
            current_user["id"],
            {"restored_collections": restored_counts, "errors": errors, "invalid_lines": invalid_lines}
        )
        logger.info(f"Restauración ZIP completada. Colecciones restauradas: {restored_counts}")
        return {
            "success": True,
            "restored_collections": restored_counts,
            "invalid_lines": invalid_lines,
            "errors": errors[:50],  # Limit to first 50 errors total
            "total_restored": sum(restored_counts.values())
        }
    except Exception as e:
        err_msg = f"Error al procesar el ZIP: {str(e)}"
        logger.error(err_msg)
        raise HTTPException(status_code=500, detail=err_msg)