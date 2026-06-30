"""
exports.py — Backup/Restore paginado adaptativo.

Endpoints de backup:
  GET  /api/admin/backup/stream/{col}/count  → total de docs + page_size recomendado
  GET  /api/admin/backup/stream/{col}?page=N&size=50  → página N de docs
  GET  /api/admin/backup/collections  → lista con conteo estimado

Endpoints de restore:
  POST /api/admin/restore              → ZIP completo (JSON o JSONL)
  POST /api/admin/restore/csv/{col}   → CSV individual
  POST /api/admin/restore/jsonl/{col} → JSONL o JSON individual
  POST /api/admin/restore/jsonl-zip   → ZIP con varios JSONL/JSON

CSV exports:
  GET  /api/export/customers|orders|leads|quotes|tickets
"""

import asyncio
import csv
import gc
import io
import json
import logging
import zipfile
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import JSONResponse, StreamingResponse

from auth import get_current_user
from database import db

router = APIRouter(prefix="/api", tags=["Export"])
logger = logging.getLogger(__name__)

BATCH_SIZE    = 50   # docs por lote en restore e inserts
PAGE_SIZE_MAX = 50   # máximo por página en backup stream (Cloudflare ~10MB)

IMAGE_COLLECTIONS = {"delivery_images", "pickup_images", "weight_images"}

ALL_COLLECTIONS = [
    "ai_command_logs","ai_daily_summaries","ai_operator_sessions","ai_pending_actions",
    "audit_log","audit_logs","blog_categories","blog_posts","carts","catalog",
    "customer_preferences","customer_surveys","customers",
    "delivery_zones","email_verifications","eventos_automation","expenses",
    "feedback_ia","files","finances","geocode_cache","importaciones_legacy",
    "inventory","leads","machine_income","machines","membership_plans",
    "membership_section","membership_signups","memberships","notification_dedupe",
    "notification_logs","notification_openapi","notification_queue",
    "notification_templates","notifications","ocr_logs","orders","password_resets",
    "patrones_detectados","payment_transactions","payment_validations",
    "pending_registrations","preferences","products","propuestas_ia",
    "purchase_orders","quotes","reglas_negocio","services","services_page_config",
    "stock_movements","store_orders","stripe_products","stripe_sync_log","suppliers",
    "survey_responses","tickets","users","vehicles","voice_assistant_sessions",
    # Imágenes disponibles solo vía stream individual (muy pesadas para ZIP)
    "delivery_images", "pickup_images", "weight_images",
]


# ── helpers ────────────────────────────────────────────────────────────────

def _require_admin(user: dict):
    role = (user.get("role") or "").lower()
    if role not in ("admin", "owner", "super_admin"):
        raise HTTPException(status_code=403, detail="Solo administradores")


def _get_col(name: str):
    col = getattr(db, name, None)
    if col is None:
        raise HTTPException(status_code=404, detail=f"Colección '{name}' no encontrada")
    return col


def _safe_json(obj) -> str:
    return json.dumps(obj, default=str, ensure_ascii=False)


def _parse_json_or_jsonl(text: str):
    """
    Detecta automáticamente si el texto es un JSON array o JSONL.
    Retorna (docs: list, invalid_count: int).
    """
    stripped = text.strip()
    if stripped.startswith("["):
        try:
            docs = json.loads(stripped)
            return (docs if isinstance(docs, list) else [docs]), 0
        except Exception as e:
            raise ValueError(f"JSON inválido: {e}")
    # JSONL: una línea por documento
    docs, inv = [], 0
    for line in stripped.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            docs.append(json.loads(line))
        except Exception:
            inv += 1
    return docs, inv


async def _insert_docs(col, docs: list):
    """Inserta docs en lotes de BATCH_SIZE cediendo el event-loop entre cada lote."""
    for i in range(0, len(docs), BATCH_SIZE):
        await col.insert_many(docs[i : i + BATCH_SIZE], ordered=False)
        gc.collect()
        await asyncio.sleep(0)


async def _insert_docs_from_jsonl_stream(col, binary_stream):
    """
    Procesa JSONL línea por línea desde el ZIP y escribe en lotes.
    Evita cargar archivos grandes completos a memoria.
    Retorna (inserted_count, invalid_lines_count).
    """
    inserted = 0
    invalid = 0
    batch = []
    text_stream = io.TextIOWrapper(binary_stream, encoding="utf-8", errors="ignore")
    for raw_line in text_stream:
        line = raw_line.strip()
        if not line:
            continue
        try:
            batch.append(json.loads(line))
        except Exception:
            invalid += 1
            continue
        if len(batch) >= BATCH_SIZE:
            await col.insert_many(batch, ordered=False)
            inserted += len(batch)
            batch.clear()
            gc.collect()
            await asyncio.sleep(0)
    if batch:
        await col.insert_many(batch, ordered=False)
        inserted += len(batch)
        batch.clear()
        gc.collect()
        await asyncio.sleep(0)
    return inserted, invalid


# ══════════════════════════════════════════════════════════════════════════
#  BACKUP — endpoints de streaming paginado
# ══════════════════════════════════════════════════════════════════════════

@router.get("/admin/backup/collections")
async def list_collections(current_user: dict = Depends(get_current_user)):
    """
    Lista todas las colecciones con conteo estimado y page_size recomendado.
    El frontend usa esto para mostrar el selector y saber cómo paginar.
    """
    _require_admin(current_user)
    result = []
    for name in ALL_COLLECTIONS:
        col = getattr(db, name, None)
        try:
            count = await col.estimated_document_count() if col else 0
        except Exception:
            count = -1
        result.append({
            "name": name,
            "has_images": name in IMAGE_COLLECTIONS,
            "estimated_docs": count,
            "recommended_page_size": 1 if name in IMAGE_COLLECTIONS else 50,
        })
    return {"collections": result}


@router.get("/admin/backup/stream/{collection_name}/count")
async def stream_count(
    collection_name: str,
    current_user: dict = Depends(get_current_user),
):
    """
    Devuelve el total exacto de documentos y el page_size recomendado.
    El frontend lo llama primero para saber cuántas páginas hay.
    """
    _require_admin(current_user)
    col   = _get_col(collection_name)
    total = await col.count_documents({})
    return {
        "collection": collection_name,
        "total": total,
        "has_images": collection_name in IMAGE_COLLECTIONS,
        # El backend recomienda 1 doc/req para imágenes (evita el límite de Cloudflare)
        "recommended_page_size": 1 if collection_name in IMAGE_COLLECTIONS else 50,
    }


@router.get("/admin/backup/stream/{collection_name}")
async def stream_page(
    collection_name: str,
    page: int = Query(0, ge=0),
    size: int = Query(50, ge=1, le=PAGE_SIZE_MAX),
    current_user: dict = Depends(get_current_user),
):
    """
    Devuelve UNA página de `size` documentos (sin _id).

    El servidor:
      - Hace skip(page*size).limit(size) → nunca carga más que `size` docs en RAM.
      - Serializa a JSON con gc.collect() al final.

    El frontend:
      - Acumula docs en memoria local.
      - Mide el tamaño de la respuesta y ajusta `size` dinámicamente.
      - Espera DELAY_MS antes de la siguiente página.
    """
    _require_admin(current_user)
    col  = _get_col(collection_name)
    skip = page * size

    docs = await col.find({}, {"_id": 0}).skip(skip).limit(size).to_list(size)

    result = {
        "collection": collection_name,
        "page":  page,
        "size":  size,
        "count": len(docs),
        "docs":  json.loads(_safe_json(docs)),
    }
    del docs
    gc.collect()

    return JSONResponse(content=result)


# ══════════════════════════════════════════════════════════════════════════
#  CSV exports individuales
# ══════════════════════════════════════════════════════════════════════════

async def _export_csv(collection, filename: str):
    """Streaming CSV con cursor paginado — nunca carga toda la colección en RAM."""
    async def generate():
        sample = await collection.find({}, {"_id": 0}).limit(500).to_list(500)
        if not sample:
            yield b"no data\n"
            return

        keys = sorted({str(k) for doc in sample for k in doc})
        out  = io.StringIO()
        writer = csv.DictWriter(out, fieldnames=keys, extrasaction="ignore")
        writer.writeheader()
        yield out.getvalue().encode(); out.seek(0); out.truncate(0)

        def _row(doc):
            row = {}
            for k in keys:
                v = doc.get(k, "")
                if isinstance(v, (dict, list)):                v = _safe_json(v)
                elif v is None:                                 v = ""
                elif not isinstance(v, (str, int, float, bool)): v = str(v)
                row[k] = v
            return row

        for doc in sample:
            writer.writerow(_row(doc))
        yield out.getvalue().encode(); out.seek(0); out.truncate(0)

        skip = len(sample)
        while True:
            batch = await collection.find({}, {"_id": 0}).skip(skip).limit(BATCH_SIZE).to_list(BATCH_SIZE)
            if not batch:
                break
            for doc in batch:
                writer.writerow(_row(doc))
            yield out.getvalue().encode(); out.seek(0); out.truncate(0)
            skip += len(batch)
            await asyncio.sleep(0)

        del sample
        gc.collect()

    return StreamingResponse(
        generate(),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/export/customers")
async def export_customers(current_user: dict = Depends(get_current_user)):
    return await _export_csv(db.customers, "customers.csv")

@router.get("/export/orders")
async def export_orders(current_user: dict = Depends(get_current_user)):
    return await _export_csv(db.orders, "orders.csv")

@router.get("/export/leads")
async def export_leads(current_user: dict = Depends(get_current_user)):
    return await _export_csv(db.leads, "leads.csv")

@router.get("/export/quotes")
async def export_quotes(current_user: dict = Depends(get_current_user)):
    return await _export_csv(db.quotes, "quotes.csv")

@router.get("/export/tickets")
async def export_tickets(current_user: dict = Depends(get_current_user)):
    return await _export_csv(db.tickets, "tickets.csv")


# ══════════════════════════════════════════════════════════════════════════
#  RESTORE — todos los endpoints con UploadFile declarado correctamente
# ══════════════════════════════════════════════════════════════════════════

@router.post("/admin/restore")
async def restore_full_zip(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    """
    Restaura TODAS las colecciones desde un ZIP de respaldo.
    El ZIP puede contener archivos .json (array) o .jsonl (una línea por doc).
    
    Proceso por colección:
      1. Lee el archivo del ZIP.
      2. Parsea como JSON array o JSONL.
      3. Borra la colección existente.
      4. Inserta en lotes de BATCH_SIZE con gc.collect() entre cada lote.

    ADVERTENCIA: Sobrescribe todos los datos existentes.
    """
    _require_admin(current_user)
    restored: dict = {}
    errors:   list = []
    invalid_lines: dict = {}
    total = 0
    #region debug-point restore-zip-start
    logger.info("restore_full_zip start filename=%s", getattr(file, "filename", None))
    #endregion

    try:
        file.file.seek(0)
        with zipfile.ZipFile(file.file) as zf:
            for entry in zf.namelist():
                if entry == "manifest.json":
                    continue

                col_name = entry.replace(".jsonl", "").replace(".json", "")
                col = getattr(db, col_name, None)
                if col is None:
                    errors.append(f"Colección no encontrada: {col_name}")
                    continue

                try:
                    info = zf.getinfo(entry)
                    #region debug-point restore-zip-entry
                    logger.info(
                        "restore_full_zip entry=%s collection=%s size_bytes=%s",
                        entry,
                        col_name,
                        info.file_size,
                    )
                    #endregion
                    await col.delete_many({})
                    if entry.endswith(".jsonl"):
                        with zf.open(entry, "r") as entry_stream:
                            inserted, inv = await _insert_docs_from_jsonl_stream(col, entry_stream)
                    else:
                        # Los JSON array grandes pueden tumbar el proceso si se cargan completos.
                        if info.file_size > 25 * 1024 * 1024:
                            raise ValueError(
                                "Archivo JSON demasiado grande para restore directo. "
                                "Convierte esta colección a JSONL o divide el respaldo."
                            )
                        raw = zf.read(entry).decode("utf-8")
                        docs, inv = _parse_json_or_jsonl(raw)
                        inserted = len(docs)
                        if docs:
                            await _insert_docs(col, docs)
                        del docs, raw
                        gc.collect()

                    if inv:
                        invalid_lines[col_name] = inv

                    restored[col_name] = inserted
                    total += inserted

                except Exception as exc:
                    logger.exception("restore_full_zip entry_error entry=%s collection=%s", entry, col_name)
                    errors.append(f"{col_name}: {str(exc)[:150]}")

    except zipfile.BadZipFile:
        raise HTTPException(status_code=400, detail="Archivo ZIP inválido o corrupto")
    except Exception as exc:
        logger.exception("restore_full_zip fatal_error")
        raise HTTPException(status_code=400, detail=f"Error procesando ZIP: {str(exc)[:200]}")

    return {
        "total_restored": total,
        "restored_collections": restored,
        "errors": errors,
        "invalid_lines": invalid_lines,
    }


@router.post("/admin/restore/csv/{collection_name}")
async def restore_collection_csv(
    collection_name: str,
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    """
    Restaura UNA colección desde un archivo CSV.
    La primera fila debe ser el encabezado con los nombres de los campos.
    
    ADVERTENCIA: Borra todos los documentos existentes en la colección.
    """
    _require_admin(current_user)
    col = _get_col(collection_name)

    contents = await file.read()
    try:
        text = contents.decode("utf-8")
    except UnicodeDecodeError:
        text = contents.decode("latin-1")

    reader = csv.DictReader(io.StringIO(text))
    docs   = list(reader)

    if not docs:
        raise HTTPException(status_code=400, detail="CSV vacío o sin encabezado")

    await col.delete_many({})
    await _insert_docs(col, docs)

    return {
        "collection":    collection_name,
        "inserted_count": len(docs),
    }


@router.post("/admin/restore/jsonl/{collection_name}")
async def restore_collection_jsonl(
    collection_name: str,
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    """
    Restaura UNA colección desde un archivo JSONL o JSON.

    Formatos aceptados:
      - JSONL: un objeto JSON por línea  →  {"_id":...}\\n{"_id":...}
      - JSON:  array de objetos          →  [{"_id":...}, {"_id":...}]

    ADVERTENCIA: Borra todos los documentos existentes en la colección.
    """
    _require_admin(current_user)
    col = _get_col(collection_name)

    contents = await file.read()
    try:
        text = contents.decode("utf-8")
    except UnicodeDecodeError:
        text = contents.decode("latin-1")

    try:
        docs, inv = _parse_json_or_jsonl(text)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    if not docs and inv > 0:
        raise HTTPException(
            status_code=400,
            detail=f"No se pudo parsear ningún documento válido ({inv} líneas inválidas)"
        )

    errors = []
    if inv > 0:
        errors.append(f"{inv} líneas no pudieron parsearse y fueron omitidas")

    await col.delete_many({})
    await _insert_docs(col, docs)

    return {
        "collection":         collection_name,
        "inserted_count":     len(docs),
        "invalid_lines_count": inv,
        "errors":             errors,
    }


@router.post("/admin/restore/jsonl-zip")
async def restore_jsonl_zip(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    """
    Restaura MÚLTIPLES colecciones desde un ZIP que contiene archivos .jsonl o .json.
    Cada archivo debe llamarse {collection_name}.jsonl o {collection_name}.json.

    Proceso:
      - Por cada archivo en el ZIP: parsea, borra la colección, inserta en lotes.
      - Continúa con la siguiente colección aunque una falle.
      - gc.collect() entre colecciones para liberar RAM.

    ADVERTENCIA: Sobrescribe los datos de las colecciones encontradas en el ZIP.
    """
    _require_admin(current_user)
    restored: dict = {}
    errors:   list = []
    invalid_lines: dict = {}
    total = 0

    try:
        file.file.seek(0)
        with zipfile.ZipFile(file.file) as zf:
            entries = [e for e in zf.namelist() if e != "manifest.json"]

            if not entries:
                raise HTTPException(
                    status_code=400,
                    detail="El ZIP está vacío o solo contiene manifest.json"
                )

            for entry in entries:
                col_name = entry.replace(".jsonl", "").replace(".json", "")
                col = getattr(db, col_name, None)
                if col is None:
                    errors.append(f"Colección no encontrada en la BD: '{col_name}'")
                    continue

                try:
                    info = zf.getinfo(entry)
                    await col.delete_many({})
                    if entry.endswith(".jsonl"):
                        with zf.open(entry, "r") as entry_stream:
                            inserted, inv = await _insert_docs_from_jsonl_stream(col, entry_stream)
                    else:
                        if info.file_size > 25 * 1024 * 1024:
                            raise ValueError(
                                "Archivo JSON demasiado grande para restore directo. "
                                "Convierte esta colección a JSONL o divide el respaldo."
                            )
                        raw = zf.read(entry).decode("utf-8")
                        docs, inv = _parse_json_or_jsonl(raw)
                        inserted = len(docs)
                        if docs:
                            await _insert_docs(col, docs)
                        del docs, raw
                        gc.collect()

                    if inv:
                        invalid_lines[col_name] = inv

                    restored[col_name] = inserted
                    total += inserted

                except Exception as exc:
                    errors.append(f"{col_name}: {str(exc)[:150]}")

    except zipfile.BadZipFile:
        raise HTTPException(status_code=400, detail="Archivo ZIP inválido o corrupto")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Error procesando ZIP: {str(exc)[:200]}")

    return {
        "total_restored": total,
        "restored_collections": restored,
        "collections_count": len(restored),
        "errors": errors,
        "invalid_lines": invalid_lines,
    }


# ══════════════════════════════════════════════════════════════════════════
#  Utilidades
# ══════════════════════════════════════════════════════════════════════════

@router.post("/admin/free-memory")
async def free_memory(current_user: dict = Depends(get_current_user)):
    """Fuerza garbage collection de Python. Útil después de operaciones pesadas."""
    _require_admin(current_user)
    collected = gc.collect()
    return {"status": "ok", "objects_collected": collected}


@router.get("/admin/backup/status")
async def backup_status(current_user: dict = Depends(get_current_user)):
    """
    Devuelve un resumen rápido de todas las colecciones con conteo estimado.
    Útil para verificar el estado de la BD antes/después de un restore.
    """
    _require_admin(current_user)
    summary = {}
    for name in ALL_COLLECTIONS:
        col = getattr(db, name, None)
        if col is None:
            summary[name] = {"status": "not_found", "count": 0}
            continue
        try:
            count = await col.estimated_document_count()
            summary[name] = {
                "status": "ok",
                "count": count,
                "has_images": name in IMAGE_COLLECTIONS,
            }
        except Exception as exc:
            summary[name] = {"status": "error", "error": str(exc)[:80]}

    total = sum(v["count"] for v in summary.values() if isinstance(v.get("count"), int))
    return {"collections": summary, "total_documents": total}
