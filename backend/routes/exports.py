"""
exports.py — Streaming paginado ultra-liviano.

El frontend controla el ritmo: pide 50 docs, los escribe al disco,
libera memoria, espera, pide los siguientes 50. El servidor nunca
tiene más de PAGE_SIZE documentos en RAM al mismo tiempo.
"""

import asyncio
import csv
import gc
import io
import json
import logging
import zipfile
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse, StreamingResponse

from auth import get_current_user
from database import db

router = APIRouter(prefix="/api", tags=["Export"])
logger = logging.getLogger(__name__)

BATCH_SIZE    = 50   # docs por página — bajo para no saturar
PAGE_SIZE_MAX = 200  # máximo que el cliente puede pedir

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
    "delivery_images","pickup_images","weight_images",
]


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


# ══════════════════════════════════════════════════════════════════
#  ENDPOINTS PAGINADOS
# ══════════════════════════════════════════════════════════════════

@router.get("/admin/backup/stream/{collection_name}/count")
async def stream_count(
    collection_name: str,
    current_user: dict = Depends(get_current_user),
):
    _require_admin(current_user)
    col   = _get_col(collection_name)
    total = await col.count_documents({})
    return {"collection": collection_name, "total": total}


@router.get("/admin/backup/stream/{collection_name}")
async def stream_page(
    collection_name: str,
    page: int = Query(0, ge=0),
    size: int = Query(50, ge=1, le=PAGE_SIZE_MAX),
    current_user: dict = Depends(get_current_user),
):
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


@router.get("/admin/backup/collections")
async def list_collections(current_user: dict = Depends(get_current_user)):
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
        })
    return {"collections": result}


# ══════════════════════════════════════════════════════════════════
#  CSV exports
# ══════════════════════════════════════════════════════════════════

async def _export_csv(collection, filename: str):
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
                if isinstance(v, (dict, list)):            v = _safe_json(v)
                elif v is None:                             v = ""
                elif not isinstance(v, (str,int,float,bool)): v = str(v)
                row[k] = v
            return row
        for doc in sample:
            writer.writerow(_row(doc))
        yield out.getvalue().encode(); out.seek(0); out.truncate(0)
        skip = len(sample)
        while True:
            batch = await collection.find({}, {"_id": 0}).skip(skip).limit(BATCH_SIZE).to_list(BATCH_SIZE)
            if not batch: break
            for doc in batch:
                writer.writerow(_row(doc))
            yield out.getvalue().encode(); out.seek(0); out.truncate(0)
            skip += len(batch)
            await asyncio.sleep(0)
        del sample; gc.collect()
    return StreamingResponse(generate(), media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'})


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


# ══════════════════════════════════════════════════════════════════
#  RESTORE
# ══════════════════════════════════════════════════════════════════

def _parse_json_or_jsonl(text: str):
    stripped = text.strip()
    if stripped.startswith("["):
        try:
            docs = json.loads(stripped)
            return (docs if isinstance(docs, list) else [docs]), 0
        except Exception as e:
            raise ValueError(f"JSON inválido: {e}")
    docs, inv = [], 0
    for line in stripped.splitlines():
        line = line.strip()
        if not line: continue
        try:    docs.append(json.loads(line))
        except: inv += 1
    return docs, inv


@router.post("/admin/restore")
async def restore_zip(file, current_user: dict = Depends(get_current_user)):
    _require_admin(current_user)
    contents = await file.read()
    restored, errors, invalid_lines, total = {}, [], {}, 0
    #region debug-point restore-zip-start
    logger.info(
        "restore_zip start user_id=%s file_name=%s size_bytes=%s",
        current_user.get("id"),
        getattr(file, "filename", None),
        len(contents),
    )
    #endregion
    try:
        with zipfile.ZipFile(io.BytesIO(contents)) as zf:
            #region debug-point restore-zip-entries
            logger.info(
                "restore_zip opened zip entries_count=%s entries=%s",
                len(zf.namelist()),
                zf.namelist(),
            )
            #endregion
            for entry in zf.namelist():
                if entry == "manifest.json": continue
                col_name = entry.replace(".jsonl","").replace(".json","")
                col = getattr(db, col_name, None)
                if col is None:
                    errors.append(f"No encontrada: {col_name}"); continue
                try:
                    #region debug-point restore-zip-entry-start
                    logger.info("restore_zip entry_start entry=%s collection=%s", entry, col_name)
                    #endregion
                    raw = zf.read(entry).decode("utf-8")
                    docs, inv = _parse_json_or_jsonl(raw)
                    if inv: invalid_lines[col_name] = inv
                    #region debug-point restore-zip-entry-parsed
                    logger.info(
                        "restore_zip entry_parsed collection=%s docs=%s invalid_lines=%s raw_chars=%s",
                        col_name,
                        len(docs),
                        inv,
                        len(raw),
                    )
                    #endregion
                    if docs:
                        await col.delete_many({})
                        for i in range(0, len(docs), BATCH_SIZE):
                            #region debug-point restore-zip-batch
                            logger.info(
                                "restore_zip inserting collection=%s batch_start=%s batch_size=%s",
                                col_name,
                                i,
                                len(docs[i:i+BATCH_SIZE]),
                            )
                            #endregion
                            await col.insert_many(docs[i:i+BATCH_SIZE], ordered=False)
                            await asyncio.sleep(0)
                    restored[col_name] = len(docs); total += len(docs)
                    #region debug-point restore-zip-entry-done
                    logger.info(
                        "restore_zip entry_done collection=%s restored=%s running_total=%s",
                        col_name,
                        len(docs),
                        total,
                    )
                    #endregion
                    del docs, raw; gc.collect()
                except Exception as exc:
                    #region debug-point restore-zip-entry-error
                    logger.exception("restore_zip entry_error collection=%s entry=%s", col_name, entry)
                    #endregion
                    errors.append(f"{col_name}: {str(exc)[:120]}")
    except Exception as exc:
        #region debug-point restore-zip-fatal
        logger.exception("restore_zip fatal_error")
        #endregion
        raise HTTPException(status_code=400, detail=f"ZIP inválido: {exc}")
    #region debug-point restore-zip-finish
    logger.info(
        "restore_zip finish total_restored=%s collections=%s errors=%s invalid_lines=%s",
        total,
        restored,
        errors,
        invalid_lines,
    )
    #endregion
    return {"total_restored": total, "restored_collections": restored,
            "errors": errors, "invalid_lines": invalid_lines}


@router.post("/admin/restore/csv/{collection_name}")
async def restore_csv(collection_name: str, file, current_user: dict = Depends(get_current_user)):
    _require_admin(current_user)
    col = _get_col(collection_name)
    text = (await file.read()).decode("utf-8")
    docs = list(csv.DictReader(io.StringIO(text)))
    if not docs: raise HTTPException(status_code=400, detail="CSV vacío")
    await col.delete_many({})
    for i in range(0, len(docs), BATCH_SIZE):
        await col.insert_many(docs[i:i+BATCH_SIZE], ordered=False)
        await asyncio.sleep(0)
    return {"inserted_count": len(docs), "collection": collection_name}


@router.post("/admin/restore/jsonl/{collection_name}")
async def restore_jsonl(collection_name: str, file, current_user: dict = Depends(get_current_user)):
    _require_admin(current_user)
    col = _get_col(collection_name)
    text = (await file.read()).decode("utf-8")
    docs, inv = _parse_json_or_jsonl(text)
    if not docs and inv > 0:
        raise HTTPException(status_code=400, detail="Sin documentos válidos")
    await col.delete_many({})
    for i in range(0, len(docs), BATCH_SIZE):
        await col.insert_many(docs[i:i+BATCH_SIZE], ordered=False)
        await asyncio.sleep(0)
    return {"inserted_count": len(docs), "collection": collection_name,
            "invalid_lines_count": inv, "errors": []}


@router.post("/admin/restore/jsonl-zip")
async def restore_jsonl_zip(file, current_user: dict = Depends(get_current_user)):
    _require_admin(current_user)
    contents = await file.read()
    restored, errors, invalid_lines, total = {}, [], {}, 0
    try:
        with zipfile.ZipFile(io.BytesIO(contents)) as zf:
            for entry in zf.namelist():
                if entry == "manifest.json": continue
                col_name = entry.replace(".jsonl","").replace(".json","")
                col = getattr(db, col_name, None)
                if col is None:
                    errors.append(f"No encontrada: {col_name}"); continue
                try:
                    raw = zf.read(entry).decode("utf-8")
                    docs, inv = _parse_json_or_jsonl(raw)
                    if inv: invalid_lines[col_name] = inv
                    if docs:
                        await col.delete_many({})
                        for i in range(0, len(docs), BATCH_SIZE):
                            await col.insert_many(docs[i:i+BATCH_SIZE], ordered=False)
                            await asyncio.sleep(0)
                    restored[col_name] = len(docs); total += len(docs)
                    del docs, raw; gc.collect()
                except Exception as exc:
                    errors.append(f"{col_name}: {str(exc)[:120]}")
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"ZIP inválido: {exc}")
    return {"total_restored": total, "restored_collections": restored,
            "errors": errors, "invalid_lines": invalid_lines}


@router.post("/admin/free-memory")
async def free_memory(current_user: dict = Depends(get_current_user)):
    _require_admin(current_user)
    gc.collect()
    return {"status": "ok"}
