"""Admin AI & Insights endpoints."""
import json
import uuid
import logging
from datetime import datetime, timezone
from typing import List

from fastapi import APIRouter, HTTPException, Depends

from database import db, SKIP_SERVER_NOTIFICATIONS
from models import AdminAIRequest, AdminAIInsightsRequest, ROLE_ADMIN
from auth import get_current_user, require_admin
from utils import (
    normalize_status, create_audit_log, should_notify_order_status,
    extract_json_payload, call_ollama,
)

logger = logging.getLogger(__name__)

try:
    from notifications import notify_order_status_changed
    NOTIFICATIONS_ENABLED = True
except ImportError:
    NOTIFICATIONS_ENABLED = False

router = APIRouter(prefix="/api", tags=["Admin AI"])


@router.post("/admin/ai")
async def admin_ai(data: AdminAIRequest, current_user: dict = Depends(get_current_user)):
    require_admin(current_user)
    recent_orders = await db.orders.find({}, {"_id": 0}).sort("created_at", -1).limit(15).to_list(15)
    orders_summary = "\n".join([
        f"- {o.get('order_number') or o.get('id')} | id:{o.get('id')} | {o.get('customer_name') or '-'} | status:{o.get('status')} | est:{o.get('estimated_lbs')} | act:{o.get('actual_lbs')} | pickup:{o.get('pickup_date')}"
        for o in recent_orders
    ]) or "No recent orders"
    recent_quotes = await db.quotes.find({}, {"_id": 0}).sort("created_at", -1).limit(10).to_list(10)
    quotes_summary = "\n".join([
        f"- {q.get('quote_number') or q.get('id')} | id:{q.get('id')} | {q.get('company_name') or q.get('contact_name') or '-'} | status:{q.get('status')}"
        for q in recent_quotes
    ]) or "No recent quotes"
    recent_leads = await db.leads.find({}, {"_id": 0}).sort("created_at", -1).limit(10).to_list(10)
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
        "For update_order_status payload: order_id, status (new|processing|ready|out_for_delivery|delivered|completed|cancelled). "
        "For update_order_lbs payload: order_id, estimated_lbs, actual_lbs. "
        "For update_payment_status payload: order_id, status (pending|paid|refunded|failed). "
        "Use IDs from the CONTEXT. If no action is needed, return actions: []."
    )
    prompt = f"{system_prompt}\n\nCONTEXT:\n{context}\n\nUser: {data.message}\nJSON:"
    model_response = call_ollama(prompt)
    try:
        payload = extract_json_payload(model_response)
    except Exception:
        return {"reply": model_response, "actions": [], "results": []}

    reply = payload.get("reply", "")
    actions = payload.get("actions", []) if isinstance(payload.get("actions", []), list) else []
    results = []

    if data.execute:
        for action in actions:
            action_type = action.get("type")
            ap = action.get("payload", {})
            now_iso = datetime.now(timezone.utc).isoformat()

            if action_type == "update_order_status":
                order_id, status_value = ap.get("order_id"), ap.get("status")
                valid = ["new", "confirmed", "pickup_scheduled", "picked_up", "processing", "ready", "out_for_delivery", "delivered", "completed", "cancelled"]
                if not order_id or status_value not in valid:
                    results.append({"type": action_type, "ok": False, "error": "Invalid order status or id"})
                    continue
                r = await db.orders.update_one({"id": order_id}, {"$set": {"status": status_value, "estado_actual": status_value, "updated_at": now_iso, "tiempos.ultimo_cambio_estado": now_iso, f"tiempos.fechas_estado.{status_value}": now_iso}})
                if r.matched_count == 0:
                    results.append({"type": action_type, "ok": False, "error": "Order not found"})
                    continue
                await create_audit_log("ORDER_UPDATED", "order", order_id, current_user["id"], {"status": status_value, "source": "ai"})
                await db.eventos_automation.insert_one({"id": str(uuid.uuid4()), "tipo": "ORDER_STATUS_CHANGED", "entity_id": order_id, "payload": {"status": status_value, "source": "ai"}, "created_at": now_iso})
                if NOTIFICATIONS_ENABLED:
                    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
                    if order and order.get("customer_id") and should_notify_order_status(order, status_value):
                        customer = await db.customers.find_one({"id": order["customer_id"]}, {"_id": 0})
                        if customer:
                            try:
                                await notify_order_status_changed(customer, order, status_value)
                            except Exception as e:
                                logger.error(f"Notification failed: {e}")
                results.append({"type": action_type, "ok": True, "order_id": order_id, "status": status_value})

            elif action_type == "update_order_lbs":
                order_id = ap.get("order_id")
                if not order_id:
                    results.append({"type": action_type, "ok": False, "error": "Invalid order id"})
                    continue
                def to_float(v):
                    try: return float(v) if v is not None and v != "" else None
                    except: return None
                ud = {}
                if "estimated_lbs" in ap: ud["estimated_lbs"] = to_float(ap.get("estimated_lbs"))
                if "actual_lbs" in ap: ud["actual_lbs"] = to_float(ap.get("actual_lbs"))
                if not ud:
                    results.append({"type": action_type, "ok": False, "error": "No lbs provided"})
                    continue
                ud["updated_at"] = now_iso
                r = await db.orders.update_one({"id": order_id}, {"$set": ud})
                if r.matched_count == 0:
                    results.append({"type": action_type, "ok": False, "error": "Order not found"})
                    continue
                results.append({"type": action_type, "ok": True, "order_id": order_id})

            elif action_type == "update_payment_status":
                order_id, sv = ap.get("order_id"), ap.get("status")
                if not order_id or sv not in ["pending", "paid", "refunded", "failed"]:
                    results.append({"type": action_type, "ok": False, "error": "Invalid payment status"})
                    continue
                r = await db.orders.update_one({"id": order_id}, {"$set": {"payment_status": sv, "updated_at": now_iso}})
                results.append({"type": action_type, "ok": r.matched_count > 0, "order_id": order_id, "status": sv})

            elif action_type in ("update_ticket_status", "update_quote_status", "update_lead_status"):
                coll_map = {"update_ticket_status": ("tickets", "ticket_id"), "update_quote_status": ("quotes", "quote_id"), "update_lead_status": ("leads", "lead_id")}
                cn, ik = coll_map[action_type]
                eid, sv = ap.get(ik), ap.get("status")
                if not eid or not sv:
                    results.append({"type": action_type, "ok": False, "error": f"Invalid {ik}"})
                    continue
                r = await getattr(db, cn).update_one({"id": eid}, {"$set": {"status": sv, "updated_at": now_iso}})
                results.append({"type": action_type, "ok": r.matched_count > 0, ik: eid, "status": sv})

            elif action_type == "update_membership_signup_status":
                sid, sv = ap.get("signup_id"), ap.get("status")
                if not sid or not sv:
                    results.append({"type": action_type, "ok": False, "error": "Invalid signup"})
                    continue
                r = await db.membership_signups.update_one({"id": sid}, {"$set": {"status": sv, "updated_at": now_iso}})
                results.append({"type": action_type, "ok": r.matched_count > 0, "signup_id": sid, "status": sv})

            elif action_type == "update_customer_membership":
                cid = ap.get("customer_id")
                if not cid:
                    results.append({"type": action_type, "ok": False, "error": "Invalid customer id"})
                    continue
                ud = {k: v for k, v in ap.items() if k in ["membership_plan", "membership_status", "membership_start_date"] and v is not None}
                if not ud:
                    results.append({"type": action_type, "ok": False, "error": "No membership fields"})
                    continue
                ud["updated_at"] = now_iso
                r = await db.customers.update_one({"id": cid}, {"$set": ud})
                results.append({"type": action_type, "ok": r.matched_count > 0, "customer_id": cid})
            else:
                results.append({"type": action_type, "ok": False, "error": "Unsupported action"})

    return {"reply": reply, "actions": actions, "results": results}


@router.post("/admin/ai/insights")
async def admin_ai_insights(data: AdminAIInsightsRequest, current_user: dict = Depends(get_current_user)):
    require_admin(current_user)
    now = datetime.now(timezone.utc)
    today = now.strftime("%Y-%m-%d")
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0).isoformat()

    orders_by_status = {}
    for sv in ["new", "processing", "ready", "out_for_delivery", "delivered", "completed", "cancelled"]:
        orders_by_status[sv] = await db.orders.count_documents({"status": sv})

    orders_today = await db.orders.count_documents({"created_at": {"$regex": f"^{today}"}})
    tickets_open = await db.tickets.count_documents({"status": {"$in": ["open", "in_progress"]}})
    quotes_new = await db.quotes.count_documents({"status": "new"})
    leads_new = await db.leads.count_documents({"status": "new"})
    signups_new = await db.membership_signups.count_documents({"status": "new"})

    pipeline = [{"$match": {"created_at": {"$gte": month_start}, "payment_status": "paid"}}, {"$group": {"_id": None, "total": {"$sum": "$total_amount"}}}]
    rev = await db.orders.aggregate(pipeline).to_list(1)
    revenue = rev[0]["total"] if rev else 0

    latest_orders = await db.orders.find({}, {"_id": 0}).sort("created_at", -1).limit(5).to_list(5)
    snapshot = {
        "generated_at": now.isoformat(), "orders_today": orders_today,
        "orders_by_status": orders_by_status, "tickets_open": tickets_open,
        "quotes_new": quotes_new, "leads_new": leads_new,
        "membership_signups_new": signups_new, "revenue_this_month": revenue or 0,
        "latest_orders": [{"order_number": o.get("order_number"), "status": o.get("status"), "created_at": o.get("created_at"), "customer_name": o.get("customer_name")} for o in latest_orders],
    }

    prompts = {
        "summary": f"Genera un resumen ejecutivo breve en español, en 4-6 líneas, con prioridades operativas usando este snapshot JSON:\n{json.dumps(snapshot, ensure_ascii=False)}",
        "risks": f"Analiza riesgos operativos y financieros en español con este snapshot JSON. Devuelve 5 bullets claros con riesgo y recomendación breve:\n{json.dumps(snapshot, ensure_ascii=False)}",
        "forecast": f"Genera una predicción corta en español sobre carga de trabajo y tendencias para la próxima semana usando este snapshot JSON. Incluye 3-5 bullets accionables:\n{json.dumps(snapshot, ensure_ascii=False)}",
    }
    prompt = prompts.get(data.type)
    if not prompt:
        raise HTTPException(status_code=400, detail="Tipo de análisis inválido")

    reply = call_ollama(prompt)
    return {"reply": reply, "snapshot": snapshot}
