"""Admin AI & Insights endpoints (optimized)."""
import json
import uuid
import logging
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional

from fastapi import APIRouter, HTTPException, Depends

from database import db, SKIP_SERVER_NOTIFICATIONS
from models import AdminAIRequest, AdminAIInsightsRequest, ROLE_ADMIN
from auth import get_current_user, require_admin
from utils import (
    normalize_status, create_audit_log, should_notify_order_status,
    extract_json_payload, call_ollama,
)

logger = logging.getLogger(__name__)

# Intento de importar notificaciones (opcional)
try:
    from notifications import notify_order_status_changed
    NOTIFICATIONS_ENABLED = True
except ImportError:
    NOTIFICATIONS_ENABLED = False
    logger.warning("Notifications module not available")

router = APIRouter(prefix="/api", tags=["Admin AI"])

# Constantes para estados válidos (unificadas)
ORDER_STATUS_VALUES = [
    "new", "confirmed", "pickup_scheduled", "picked_up", "processing",
    "ready", "out_for_delivery", "delivered", "completed", "cancelled"
]
PAYMENT_STATUS_VALUES = ["pending", "paid", "refunded", "failed"]
TICKET_STATUS_VALUES = ["open", "in_progress", "closed", "resolved"]
QUOTE_STATUS_VALUES = ["new", "sent", "negotiating", "accepted", "rejected", "expired"]
LEAD_STATUS_VALUES = ["new", "contacted", "qualified", "lost", "converted"]
MEMBERSHIP_SIGNUP_STATUS_VALUES = ["new", "in_review", "approved", "rejected"]

# Mapeo de tipos de acción a colección y campo ID
ACTION_COLLECTION_MAP = {
    "update_ticket_status": ("tickets", "ticket_id"),
    "update_quote_status": ("quotes", "quote_id"),
    "update_lead_status": ("leads", "lead_id"),
}


def to_float(value: Any) -> Optional[float]:
    """Convierte a float si es posible, sino retorna None."""
    try:
        return float(value) if value is not None and value != "" else None
    except (ValueError, TypeError):
        return None


async def update_order_status_core(order_id: str, new_status: str, user_id: str, source: str = "ai") -> bool:
    """
    Actualiza el estado de una orden, registra auditoría, eventos y notificaciones.
    Retorna True si la orden existe y se actualizó.
    """
    now_iso = datetime.now(timezone.utc).isoformat()
    # Construir la actualización con campos anidados
    update_data = {
        "status": new_status,
        "estado_actual": new_status,
        "updated_at": now_iso,
        "tiempos.ultimo_cambio_estado": now_iso,
        f"tiempos.fechas_estado.{new_status}": now_iso,
    }
    result = await db.orders.update_one({"id": order_id}, {"$set": update_data})
    if result.matched_count == 0:
        logger.warning(f"Order {order_id} not found for status update")
        return False

    # Auditoría
    await create_audit_log("ORDER_UPDATED", "order", order_id, user_id,
                           {"status": new_status, "source": source})
    # Evento de automatización
    await db.eventos_automation.insert_one({
        "id": str(uuid.uuid4()),
        "tipo": "ORDER_STATUS_CHANGED",
        "entity_id": order_id,
        "payload": {"status": new_status, "source": source},
        "created_at": now_iso
    })

    # Notificaciones (si están habilitadas)
    if NOTIFICATIONS_ENABLED:
        order = await db.orders.find_one({"id": order_id}, {"_id": 0, "customer_id": 1})
        if order and order.get("customer_id") and should_notify_order_status(order, new_status):
            customer = await db.customers.find_one({"id": order["customer_id"]}, {"_id": 0})
            if customer:
                try:
                    await notify_order_status_changed(customer, order, new_status)
                except Exception as e:
                    logger.error(f"Failed to send notification for order {order_id}: {e}")
    return True


async def update_entity_status(collection_name: str, entity_id: str, new_status: str, user_id: str) -> bool:
    """Genérico para actualizar estado de tickets, quotes, leads o membership_signups."""
    collection = getattr(db, collection_name, None)
    if not collection:
        logger.error(f"Invalid collection: {collection_name}")
        return False

    now_iso = datetime.now(timezone.utc).isoformat()
    result = await collection.update_one(
        {"id": entity_id},
        {"$set": {"status": new_status, "updated_at": now_iso}}
    )
    if result.matched_count:
        await create_audit_log(
            f"{collection_name.upper()}_UPDATED",
            collection_name.rstrip('s'),
            entity_id,
            user_id,
            {"status": new_status, "source": "ai"}
        )
        return True
    return False


@router.post("/admin/ai")
async def admin_ai(data: AdminAIRequest, current_user: dict = Depends(get_current_user)):
    require_admin(current_user)

    # Obtener datos recientes con proyección (solo campos necesarios)
    recent_orders = await db.orders.find(
        {}, {"_id": 0, "order_number": 1, "id": 1, "customer_name": 1, "status": 1,
             "estimated_lbs": 1, "actual_lbs": 1, "pickup_date": 1}
    ).sort("created_at", -1).limit(15).to_list(15)

    orders_summary = "\n".join([
        f"- {o.get('order_number') or o.get('id')} | id:{o.get('id')} | {o.get('customer_name') or '-'} | status:{o.get('status')} | est:{o.get('estimated_lbs')} | act:{o.get('actual_lbs')} | pickup:{o.get('pickup_date')}"
        for o in recent_orders
    ]) or "No recent orders"

    recent_quotes = await db.quotes.find(
        {}, {"_id": 0, "quote_number": 1, "id": 1, "company_name": 1, "contact_name": 1, "status": 1}
    ).sort("created_at", -1).limit(10).to_list(10)
    quotes_summary = "\n".join([
        f"- {q.get('quote_number') or q.get('id')} | id:{q.get('id')} | {q.get('company_name') or q.get('contact_name') or '-'} | status:{q.get('status')}"
        for q in recent_quotes
    ]) or "No recent quotes"

    recent_leads = await db.leads.find(
        {}, {"_id": 0, "id": 1, "name": 1, "status": 1}
    ).sort("created_at", -1).limit(10).to_list(10)
    leads_summary = "\n".join([
        f"- {l.get('id')} | {l.get('name') or '-'} | status:{l.get('status')}"
        for l in recent_leads
    ]) or "No recent leads"

    context = f"RECENT ORDERS:\n{orders_summary}\n\nRECENT QUOTES:\n{quotes_summary}\n\nRECENT LEADS:\n{leads_summary}"

    system_prompt = (
        "You are a local admin assistant for Ventura Fresh Laundry CRM. "
        "Return ONLY valid JSON with keys: reply (string) and actions (array). "
        "Actions must be objects with type and payload. Allowed types: "
        "update_order_status, update_order_lbs, update_payment_status, update_ticket_status, update_quote_status, update_lead_status, "
        "update_membership_signup_status, update_customer_membership. "
        "For update_order_status payload: order_id, status (new|confirmed|pickup_scheduled|picked_up|processing|ready|out_for_delivery|delivered|completed|cancelled). "
        "For update_order_lbs payload: order_id, estimated_lbs, actual_lbs. "
        "For update_payment_status payload: order_id, status (pending|paid|refunded|failed). "
        "Use IDs from the CONTEXT. If no action is needed, return actions: []."
    )
    prompt = f"{system_prompt}\n\nCONTEXT:\n{context}\n\nUser: {data.message}\nJSON:"
    model_response = call_ollama(prompt)

    try:
        payload = extract_json_payload(model_response)
    except Exception as e:
        logger.error(f"Failed to extract JSON from AI response: {e}")
        return {"reply": model_response, "actions": [], "results": []}

    reply = payload.get("reply", "")
    actions = payload.get("actions", []) if isinstance(payload.get("actions", []), list) else []
    results = []

    if data.execute:
        for action in actions:
            action_type = action.get("type")
            ap = action.get("payload", {})
            now_iso = datetime.now(timezone.utc).isoformat()

            # --- update_order_status ---
            if action_type == "update_order_status":
                order_id = ap.get("order_id")
                new_status = ap.get("status")
                if not order_id or new_status not in ORDER_STATUS_VALUES:
                    results.append({"type": action_type, "ok": False, "error": "Invalid order ID or status"})
                    continue

                success = await update_order_status_core(order_id, new_status, current_user["id"], source="ai")
                if success:
                    results.append({"type": action_type, "ok": True, "order_id": order_id, "status": new_status})
                else:
                    results.append({"type": action_type, "ok": False, "error": "Order not found"})

            # --- update_order_lbs ---
            elif action_type == "update_order_lbs":
                order_id = ap.get("order_id")
                if not order_id:
                    results.append({"type": action_type, "ok": False, "error": "Missing order_id"})
                    continue
                update_fields = {}
                if "estimated_lbs" in ap:
                    val = to_float(ap.get("estimated_lbs"))
                    if val is not None:
                        update_fields["estimated_lbs"] = val
                if "actual_lbs" in ap:
                    val = to_float(ap.get("actual_lbs"))
                    if val is not None:
                        update_fields["actual_lbs"] = val
                if not update_fields:
                    results.append({"type": action_type, "ok": False, "error": "No valid lbs values provided"})
                    continue

                update_fields["updated_at"] = now_iso
                r = await db.orders.update_one({"id": order_id}, {"$set": update_fields})
                if r.matched_count:
                    await create_audit_log("ORDER_UPDATED", "order", order_id, current_user["id"], update_fields)
                    results.append({"type": action_type, "ok": True, "order_id": order_id})
                else:
                    results.append({"type": action_type, "ok": False, "error": "Order not found"})

            # --- update_payment_status ---
            elif action_type == "update_payment_status":
                order_id = ap.get("order_id")
                new_status = ap.get("status")
                if not order_id or new_status not in PAYMENT_STATUS_VALUES:
                    results.append({"type": action_type, "ok": False, "error": "Invalid order ID or payment status"})
                    continue
                r = await db.orders.update_one(
                    {"id": order_id},
                    {"$set": {"payment_status": new_status, "updated_at": now_iso}}
                )
                if r.matched_count:
                    await create_audit_log("ORDER_UPDATED", "order", order_id, current_user["id"],
                                           {"payment_status": new_status})
                    results.append({"type": action_type, "ok": True, "order_id": order_id, "status": new_status})
                else:
                    results.append({"type": action_type, "ok": False, "error": "Order not found"})

            # --- update_ticket_status, update_quote_status, update_lead_status ---
            elif action_type in ACTION_COLLECTION_MAP:
                collection_name, id_key = ACTION_COLLECTION_MAP[action_type]
                entity_id = ap.get(id_key)
                new_status = ap.get("status")
                # Validar estado según colección
                valid_statuses = []
                if "ticket" in action_type:
                    valid_statuses = TICKET_STATUS_VALUES
                elif "quote" in action_type:
                    valid_statuses = QUOTE_STATUS_VALUES
                elif "lead" in action_type:
                    valid_statuses = LEAD_STATUS_VALUES

                if not entity_id or new_status not in valid_statuses:
                    results.append({"type": action_type, "ok": False, "error": f"Invalid {id_key} or status"})
                    continue

                success = await update_entity_status(collection_name, entity_id, new_status, current_user["id"])
                results.append({
                    "type": action_type,
                    "ok": success,
                    id_key: entity_id,
                    "status": new_status if success else None,
                    "error": None if success else "Entity not found"
                })

            # --- update_membership_signup_status ---
            elif action_type == "update_membership_signup_status":
                signup_id = ap.get("signup_id")
                new_status = ap.get("status")
                if not signup_id or new_status not in MEMBERSHIP_SIGNUP_STATUS_VALUES:
                    results.append({"type": action_type, "ok": False, "error": "Invalid signup ID or status"})
                    continue
                success = await update_entity_status("membership_signups", signup_id, new_status, current_user["id"])
                results.append({
                    "type": action_type,
                    "ok": success,
                    "signup_id": signup_id,
                    "status": new_status if success else None
                })

            # --- update_customer_membership ---
            elif action_type == "update_customer_membership":
                customer_id = ap.get("customer_id")
                if not customer_id:
                    results.append({"type": action_type, "ok": False, "error": "Missing customer_id"})
                    continue
                update_data = {}
                for field in ["membership_plan", "membership_status", "membership_start_date"]:
                    if field in ap and ap[field] is not None:
                        update_data[field] = ap[field]
                if not update_data:
                    results.append({"type": action_type, "ok": False, "error": "No membership fields to update"})
                    continue
                update_data["updated_at"] = now_iso
                r = await db.customers.update_one({"id": customer_id}, {"$set": update_data})
                if r.matched_count:
                    await create_audit_log("CUSTOMER_UPDATED", "customer", customer_id, current_user["id"], update_data)
                    results.append({"type": action_type, "ok": True, "customer_id": customer_id})
                else:
                    results.append({"type": action_type, "ok": False, "error": "Customer not found"})

            else:
                results.append({"type": action_type, "ok": False, "error": "Unsupported action type"})

    return {"reply": reply, "actions": actions, "results": results}


@router.post("/admin/ai/insights")
async def admin_ai_insights(data: AdminAIInsightsRequest, current_user: dict = Depends(get_current_user)):
    require_admin(current_user)

    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    # Ejecutar consultas en paralelo
    orders_today_task = db.orders.count_documents({"created_at": {"$gte": today_start}})
    tickets_open_task = db.tickets.count_documents({"status": {"$in": ["open", "in_progress"]}})
    quotes_new_task = db.quotes.count_documents({"status": "new"})
    leads_new_task = db.leads.count_documents({"status": "new"})
    signups_new_task = db.membership_signups.count_documents({"status": "new"})

    # Contar órdenes por estado
    orders_by_status_task = {
        status: db.orders.count_documents({"status": status})
        for status in ORDER_STATUS_VALUES
    }

    # Ingresos del mes
    revenue_pipeline = [
        {"$match": {"created_at": {"$gte": month_start}, "payment_status": "paid"}},
        {"$group": {"_id": None, "total": {"$sum": "$total_amount"}}}
    ]
    revenue_task = db.orders.aggregate(revenue_pipeline).to_list(1)

    # Últimas 5 órdenes (solo campos necesarios)
    latest_orders_task = db.orders.find(
        {}, {"_id": 0, "order_number": 1, "status": 1, "created_at": 1, "customer_name": 1}
    ).sort("created_at", -1).limit(5).to_list(5)

    # Recolectar todos los resultados
    results = await asyncio.gather(
        orders_today_task,
        tickets_open_task,
        quotes_new_task,
        leads_new_task,
        signups_new_task,
        revenue_task,
        latest_orders_task,
        *orders_by_status_task.values(),
        return_exceptions=True
    )

    # Desempaquetar resultados (manejo de excepciones)
    orders_today = results[0] if not isinstance(results[0], Exception) else 0
    tickets_open = results[1] if not isinstance(results[1], Exception) else 0
    quotes_new = results[2] if not isinstance(results[2], Exception) else 0
    leads_new = results[3] if not isinstance(results[3], Exception) else 0
    signups_new = results[4] if not isinstance(results[4], Exception) else 0
    revenue_data = results[5] if not isinstance(results[5], Exception) else []
    latest_orders = results[6] if not isinstance(results[6], Exception) else []

    # Construir diccionario de órdenes por estado
    orders_by_status = {}
    idx = 7
    for status in ORDER_STATUS_VALUES:
        if idx < len(results) and not isinstance(results[idx], Exception):
            orders_by_status[status] = results[idx]
        else:
            orders_by_status[status] = 0
        idx += 1

    revenue = revenue_data[0]["total"] if revenue_data else 0

    snapshot = {
        "generated_at": now.isoformat(),
        "orders_today": orders_today,
        "orders_by_status": orders_by_status,
        "tickets_open": tickets_open,
        "quotes_new": quotes_new,
        "leads_new": leads_new,
        "membership_signups_new": signups_new,
        "revenue_this_month": revenue or 0,
        "latest_orders": [
            {
                "order_number": o.get("order_number"),
                "status": o.get("status"),
                "created_at": o.get("created_at"),
                "customer_name": o.get("customer_name")
            }
            for o in latest_orders
        ],
    }

    prompts = {
        "summary": f"Genera un resumen ejecutivo breve en ingles, en 4-6 líneas, con prioridades operativas usando este snapshot JSON:\n{json.dumps(snapshot, ensure_ascii=False)}",
        "risks": f"Analiza riesgos operativos y financieros en ingles con este snapshot JSON. Devuelve 5 bullets claros con riesgo y recomendación breve:\n{json.dumps(snapshot, ensure_ascii=False)}",
        "forecast": f"Genera una predicción corta en ingles sobre carga de trabajo y tendencias para la próxima semana usando este snapshot JSON. Incluye 3-5 bullets accionables:\n{json.dumps(snapshot, ensure_ascii=False)}",
    }

    prompt = prompts.get(data.type)
    if not prompt:
        raise HTTPException(status_code=400, detail="Tipo de análisis inválido")

    reply = call_ollama(prompt)
    return {"reply": reply, "snapshot": snapshot}