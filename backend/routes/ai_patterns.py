"""AI Patterns & Proposals endpoints."""
import json
import uuid
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends

from database import db
from models import PatternScanRequest, ProposalGenerateRequest, ProposalActionRequest
from auth import get_current_user, require_admin
from utils import (
    create_audit_log, ensure_ai_indexes, get_or_seed_business_rules,
    extract_json_payload, call_ollama,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["AI Patterns"])


@router.post("/ai/patrones/scan")
async def scan_patterns(data: PatternScanRequest, current_user: dict = Depends(get_current_user)):
    require_admin(current_user)
    await ensure_ai_indexes()
    now = datetime.now(timezone.utc)
    periodo_desde = data.periodo_desde or (now - timedelta(days=7)).isoformat()
    periodo_hasta = data.periodo_hasta or now.isoformat()
    filtros = data.filtros or {}
    base_match = {"created_at": {"$gte": periodo_desde, "$lte": periodo_hasta}}
    if "service_type" in filtros:
        base_match["service_type"] = {"$in": filtros["service_type"]}

    patterns = []

    processing_pipeline = [
        {"$match": base_match},
        {"$project": {"service_type": 1, "processing_ts": {"$dateFromString": {"dateString": "$tiempos.fechas_estado.processing"}}, "ready_ts": {"$dateFromString": {"dateString": "$tiempos.fechas_estado.ready"}}}},
        {"$match": {"processing_ts": {"$ne": None}, "ready_ts": {"$ne": None}}},
        {"$project": {"service_type": 1, "duration_hours": {"$divide": [{"$subtract": ["$ready_ts", "$processing_ts"]}, 3600000]}}},
        {"$group": {"_id": "$service_type", "avg_hours": {"$avg": "$duration_hours"}, "max_hours": {"$max": "$duration_hours"}, "count": {"$sum": 1}}},
    ]
    for stat in await db.orders.aggregate(processing_pipeline).to_list(50):
        patterns.append({"id": str(uuid.uuid4()), "tipo": "cuello_botella", "detalle": {"estado": "processing", "service_type": stat["_id"], "avg_hours": stat["avg_hours"], "max_hours": stat["max_hours"]}, "query_base": base_match, "periodo": {"desde": periodo_desde, "hasta": periodo_hasta}, "fecha_deteccion": now.isoformat(), "impacto_estimado": {"ordenes_afectadas": stat["count"]}})

    errors_pipeline = [
        {"$match": base_match}, {"$unwind": "$errores_validacion"},
        {"$group": {"_id": "$errores_validacion.codigo", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}}, {"$limit": 10},
    ]
    for stat in await db.orders.aggregate(errors_pipeline).to_list(10):
        patterns.append({"id": str(uuid.uuid4()), "tipo": "error_recurrente", "detalle": {"codigo": stat["_id"], "count": stat["count"]}, "query_base": base_match, "periodo": {"desde": periodo_desde, "hasta": periodo_hasta}, "fecha_deteccion": now.isoformat(), "impacto_estimado": {"ordenes_afectadas": stat["count"]}})

    stale_threshold = (now - timedelta(hours=48)).isoformat()
    stale_match = {**base_match, "status": {"$in": ["processing", "ready", "out_for_delivery"]}, "created_at": {"$lte": stale_threshold}}
    for stat in await db.orders.aggregate([{"$match": stale_match}, {"$group": {"_id": "$status", "count": {"$sum": 1}}}]).to_list(10):
        patterns.append({"id": str(uuid.uuid4()), "tipo": "desviacion", "detalle": {"estado": stat["_id"], "threshold_hours": 48}, "query_base": stale_match, "periodo": {"desde": periodo_desde, "hasta": periodo_hasta}, "fecha_deteccion": now.isoformat(), "impacto_estimado": {"ordenes_afectadas": stat["count"]}})

    if patterns:
        await db.patrones_detectados.insert_many(patterns)
    return {"ok": True, "patrones_creados": len(patterns)}


@router.post("/ai/propuestas/generar")
async def generate_proposals(data: ProposalGenerateRequest, current_user: dict = Depends(get_current_user)):
    require_admin(current_user)
    await ensure_ai_indexes()
    await get_or_seed_business_rules()
    query = {}
    if data.patrones_ids:
        query["id"] = {"$in": data.patrones_ids}
    patrones = await db.patrones_detectados.find(query, {"_id": 0}).sort("fecha_deteccion", -1).to_list(50)
    if not patrones:
        return {"ok": True, "propuestas_creadas": 0, "detalle": "Sin patrones"}

    prompt = f"Eres un asistente de optimización. Devuelve JSON con clave propuestas (array). Cada propuesta: tipo, descripcion, impacto_estimado, accion_sugerida, nivel_riesgo, datos_respaldo.\npatrones={json.dumps(patrones, ensure_ascii=False)}"
    propuestas = []
    try:
        raw = call_ollama(prompt)
        payload = extract_json_payload(raw)
        propuestas = payload.get("propuestas", [])
    except Exception:
        pass
    if not propuestas:
        for p in patrones[:data.max_propuestas or 10]:
            tipo = "ajuste_regla" if p["tipo"] == "cuello_botella" else "nueva_validacion"
            propuestas.append({"tipo": tipo, "descripcion": f"Propuesta automática basada en patrón {p['tipo']}", "impacto_estimado": p.get("impacto_estimado", {}), "accion_sugerida": {"type": tipo, "payload": {"pattern_id": p["id"]}}, "nivel_riesgo": "medio", "datos_respaldo": {"pattern_id": p["id"]}})

    now = datetime.now(timezone.utc).isoformat()
    docs = [{"id": str(uuid.uuid4()), "tipo": pr.get("tipo"), "descripcion": pr.get("descripcion", ""), "estado": "pendiente", "impacto_estimado": pr.get("impacto_estimado", {}), "accion_sugerida": pr.get("accion_sugerida", {}), "nivel_riesgo": pr.get("nivel_riesgo", "medio"), "datos_respaldo": pr.get("datos_respaldo", {}), "fecha_generacion": now, "fuente": "analizador_automatico_v1"} for pr in propuestas[:data.max_propuestas or 10]]
    if docs:
        await db.propuestas_ia.insert_many(docs)
    return {"ok": True, "propuestas_creadas": len(docs)}


@router.get("/ai/propuestas")
async def list_proposals(estado: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    require_admin(current_user)
    await ensure_ai_indexes()
    query = {}
    if estado:
        query["estado"] = estado
    return await db.propuestas_ia.find(query, {"_id": 0}).sort("fecha_generacion", -1).to_list(200)


@router.get("/ai/propuestas/{propuesta_id}")
async def get_proposal(propuesta_id: str, current_user: dict = Depends(get_current_user)):
    require_admin(current_user)
    propuesta = await db.propuestas_ia.find_one({"id": propuesta_id}, {"_id": 0})
    if not propuesta:
        raise HTTPException(status_code=404, detail="Propuesta no encontrada")
    return propuesta


@router.get("/ai/propuestas/{propuesta_id}/simulacion")
async def get_proposal_simulation(propuesta_id: str, start_date: Optional[str] = None, end_date: Optional[str] = None, service_type: Optional[str] = None, status: Optional[str] = None, real_before_days: Optional[int] = 14, real_after_days: Optional[int] = 7, current_user: dict = Depends(get_current_user)):
    require_admin(current_user)
    propuesta = await db.propuestas_ia.find_one({"id": propuesta_id}, {"_id": 0})
    if not propuesta:
        raise HTTPException(status_code=404, detail="Propuesta no encontrada")

    now = datetime.now(timezone.utc)
    periodo_desde = start_date or (now - timedelta(days=7)).isoformat()
    periodo_hasta = end_date or now.isoformat()
    match = {"created_at": {"$gte": periodo_desde, "$lte": periodo_hasta}}
    inferred_st = propuesta.get("accion_sugerida", {}).get("payload", {}).get("service_type")
    st = service_type or inferred_st
    if st:
        match["service_type"] = st
    if status:
        match["status"] = status

    proc_stats = await db.orders.aggregate([
        {"$match": match},
        {"$project": {"processing_ts": {"$dateFromString": {"dateString": "$tiempos.fechas_estado.processing"}}, "ready_ts": {"$dateFromString": {"dateString": "$tiempos.fechas_estado.ready"}}}},
        {"$match": {"processing_ts": {"$ne": None}, "ready_ts": {"$ne": None}}},
        {"$project": {"duration_hours": {"$divide": [{"$subtract": ["$ready_ts", "$processing_ts"]}, 3600000]}}},
        {"$group": {"_id": None, "avg_hours": {"$avg": "$duration_hours"}}},
    ]).to_list(1)
    avg_hours = proc_stats[0]["avg_hours"] if proc_stats else 0
    err_stats = await db.orders.aggregate([{"$match": match}, {"$unwind": "$errores_validacion"}, {"$group": {"_id": None, "count": {"$sum": 1}}}]).to_list(1)
    errors_count = err_stats[0]["count"] if err_stats else 0
    orders_count = await db.orders.count_documents(match)

    before = {"ordenes": orders_count, "avg_processing_horas": round(avg_hours, 2) if avg_hours else 0, "errores_validacion": errors_count}
    after = dict(before)
    impacto = propuesta.get("impacto_estimado", {})
    tp = impacto.get("tiempo_ahorrado_porcentaje")
    ep = impacto.get("errores_reducidos_porcentaje")
    if isinstance(tp, (int, float)):
        after["avg_processing_horas"] = round(before["avg_processing_horas"] * (1 - tp / 100), 2)
    if isinstance(ep, (int, float)):
        after["errores_validacion"] = max(0, round(before["errores_validacion"] * (1 - ep / 100)))

    service_stats = await db.orders.aggregate([{"$match": match}, {"$group": {"_id": "$service_type", "count": {"$sum": 1}}}]).to_list(20)
    status_stats = await db.orders.aggregate([{"$match": match}, {"$group": {"_id": "$status", "count": {"$sum": 1}}}]).to_list(20)

    rb_start = (now - timedelta(days=real_before_days or 14)).isoformat()
    rb_end = (now - timedelta(days=real_after_days or 7)).isoformat()
    ra_start = rb_end
    ra_end = now.isoformat()
    rbm = {"created_at": {"$gte": rb_start, "$lte": rb_end}}
    ram = {"created_at": {"$gte": ra_start, "$lte": ra_end}}
    if st:
        rbm["service_type"] = st
        ram["service_type"] = st
    if status:
        rbm["status"] = status
        ram["status"] = status
    agg_tpl = [{"$unwind": {"path": "$errores_validacion", "preserveNullAndEmptyArrays": True}}, {"$group": {"_id": None, "errores": {"$sum": {"$cond": [{"$ifNull": ["$errores_validacion", False]}, 1, 0]}}, "ordenes": {"$addToSet": "$id"}}}]
    rb_s = await db.orders.aggregate([{"$match": rbm}] + agg_tpl).to_list(1)
    ra_s = await db.orders.aggregate([{"$match": ram}] + agg_tpl).to_list(1)
    rb = rb_s[0] if rb_s else {"errores": 0, "ordenes": []}
    ra = ra_s[0] if ra_s else {"errores": 0, "ordenes": []}

    return {
        "before": before, "after": after,
        "impacto_estimado": impacto,
        "impacto_real": {"errores_before": rb["errores"], "errores_after": ra["errores"], "ordenes_before": len(rb["ordenes"]), "ordenes_after": len(ra["ordenes"])},
        "por_servicio": service_stats, "por_estado": status_stats,
        "periodo": {"desde": periodo_desde, "hasta": periodo_hasta},
        "filtros": {"service_type": st, "status": status},
    }


@router.post("/ai/propuestas/{propuesta_id}/accion")
async def act_on_proposal(propuesta_id: str, data: ProposalActionRequest, current_user: dict = Depends(get_current_user)):
    require_admin(current_user)
    propuesta = await db.propuestas_ia.find_one({"id": propuesta_id}, {"_id": 0})
    if not propuesta:
        raise HTTPException(status_code=404, detail="Propuesta no encontrada")
    accion = data.accion
    if accion not in ["aceptar", "rechazar", "modificar", "posponer"]:
        raise HTTPException(status_code=400, detail="Acción inválida")
    estado_map = {"aceptar": "aceptada", "rechazar": "rechazada", "modificar": "modificada", "posponer": "pospuesta"}
    estado = estado_map[accion]
    now = datetime.now(timezone.utc).isoformat()
    await db.propuestas_ia.update_one({"id": propuesta_id}, {"$set": {"estado": estado, "feedback": {"ultima_decision": estado, "fecha_decision": now, "usuario_id": current_user["id"], "comentarios": data.comentarios}}})
    await db.feedback_ia.insert_one({"id": str(uuid.uuid4()), "propuesta_id": propuesta_id, "accion_tomada": estado, "modificaciones": data.modificaciones, "motivo": data.comentarios, "usuario_id": current_user["id"], "timestamp": now})

    action_payload = (data.modificaciones.get("accion_sugerida") if data.modificaciones else None) or propuesta.get("accion_sugerida")
    if accion in ["aceptar", "modificar"] and action_payload:
        at = action_payload.get("type") or action_payload.get("tipo")
        pl = action_payload.get("payload", {})
        if at == "ajuste_regla":
            await db.reglas_negocio.update_one({"id": "order_rules_v1"}, {"$set": {"updated_at": now, **pl}}, upsert=True)
        if at == "nueva_validacion":
            await db.reglas_negocio.update_one({"id": "order_rules_v1"}, {"$addToSet": {"validaciones": pl}, "$set": {"updated_at": now}}, upsert=True)
        if at == "optimizacion_notificacion":
            await db.reglas_negocio.update_one({"id": "order_rules_v1"}, {"$set": {"updated_at": now, "auto_transitions": pl}}, upsert=True)
        if at == "plan_recuperacion":
            for item in pl.get("acciones", []):
                oid, sv = item.get("order_id"), item.get("status")
                if oid and sv:
                    await db.orders.update_one({"id": oid}, {"$set": {"status": sv, "estado_actual": sv, "updated_at": now, "tiempos.ultimo_cambio_estado": now, f"tiempos.fechas_estado.{sv}": now}})

    await create_audit_log("AI_PROPOSAL_ACTION", "propuesta_ia", propuesta_id, current_user["id"], {"accion": estado})
    return {"ok": True, "estado": estado}
