"""AI Assistant endpoints — briefing, suggestions, chat, Jarvis operations, sessions."""
import os
import re
import json
import uuid
import logging
from datetime import datetime, timezone
from typing import Optional, List

from fastapi import APIRouter, HTTPException, Depends, Request

from database import db, SKIP_SERVER_NOTIFICATIONS
from models import (
    AdminAIRequest, OrderPaymentUpdate,
    ROLE_OPERATOR, ROLE_ADMIN, VALID_ROLES,
)
from auth import get_current_user, require_role
from utils import (
    normalize_status, normalize_spaces,
    create_audit_log, should_notify_order_status,
    extract_json_payload, call_ollama,
    generate_order_number, build_order_times,
    normalize_payment_method, calculate_service_amount,
)
from realtime import emit_realtime

logger = logging.getLogger(__name__)

try:
    from ai_assistant import generate_daily_briefing, ai_analyze_business, ai_suggest_actions
    AI_ASSISTANT_ENABLED = True
except ImportError:
    AI_ASSISTANT_ENABLED = False

try:
    from notifications import (
        notify_order_status_changed,
        send_email, send_sms, send_voice_call, send_whatsapp,
        send_preferred_notification, detect_language, normalize_preferred_contact,
    )
    NOTIFICATIONS_ENABLED = True
except ImportError:
    NOTIFICATIONS_ENABLED = False

router = APIRouter(prefix="/api", tags=["AI Assistant"])

CRITICAL_AI_ACTION_TYPES = {
    "register_payment", "update_user_role", "update_system_setting",
    "update_membership_customer", "update_store_payment_status",
}


def is_critical_ai_action(action_type: Optional[str], payload: Optional[dict]) -> bool:
    action_type = normalize_status(action_type or "").lower()
    payload = payload or {}
    if action_type in CRITICAL_AI_ACTION_TYPES:
        return True
    if action_type == "update_order_status":
        return normalize_status(payload.get("status") or "") in {"CANCELLED", "COMPLETED"}
    if action_type == "update_store_order_status":
        return normalize_status(payload.get("status") or "") in {"CANCELLED", "REFUNDED"}
    return False


async def get_or_create_ai_session(session_id: Optional[str], current_user: dict) -> dict:
    now = datetime.now(timezone.utc).isoformat()
    target = session_id or str(uuid.uuid4())
    session = await db.ai_operator_sessions.find_one({"session_id": target}, {"_id": 0})
    if session:
        return session
    session = {
        "session_id": target,
        "user_id": current_user.get("id"),
        "user_role": current_user.get("role"),
        "messages": [],
        "created_at": now,
        "updated_at": now,
    }
    await db.ai_operator_sessions.insert_one(session)
    return session


async def save_ai_session_messages(session_id: str, messages: List[dict]):
    await db.ai_operator_sessions.update_one(
        {"session_id": session_id},
        {"$set": {"messages": messages[-80:], "updated_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True,
    )


async def build_global_operations_context() -> dict:
    orders = await db.orders.find({}, {"_id": 0, "id": 1, "order_number": 1, "status": 1, "customer_name": 1, "total_amount": 1, "payment_status": 1, "service_type": 1, "updated_at": 1}).sort("updated_at", -1).limit(30).to_list(30)
    store_orders = await db.store_orders.find({}, {"_id": 0, "id": 1, "order_number": 1, "status": 1, "payment_status": 1, "customer_name": 1, "total": 1, "updated_at": 1}).sort("updated_at", -1).limit(20).to_list(20)
    tickets = await db.tickets.find({}, {"_id": 0, "id": 1, "status": 1, "priority": 1, "created_at": 1}).sort("created_at", -1).limit(20).to_list(20)
    quotes = await db.quotes.find({}, {"_id": 0, "id": 1, "quote_number": 1, "status": 1, "company_name": 1, "updated_at": 1}).sort("updated_at", -1).limit(20).to_list(20)
    leads = await db.leads.find({}, {"_id": 0, "id": 1, "name": 1, "status": 1, "updated_at": 1}).sort("updated_at", -1).limit(20).to_list(20)
    signups = await db.membership_signups.find({}, {"_id": 0, "id": 1, "status": 1, "membership_plan": 1, "contact_name": 1, "updated_at": 1}).sort("updated_at", -1).limit(20).to_list(20)
    users = await db.users.find({}, {"_id": 0, "id": 1, "email": 1, "role": 1, "active": 1, "updated_at": 1}).sort("updated_at", -1).limit(20).to_list(20)
    stats = {
        "orders_total": await db.orders.count_documents({}),
        "orders_processing": await db.orders.count_documents({"status": {"$in": ["processing", "PROCESSING"]}}),
        "orders_ready": await db.orders.count_documents({"status": {"$in": ["ready", "READY"]}}),
        "store_orders_pending_payment": await db.store_orders.count_documents({"payment_status": {"$in": ["pending", "pending_payment", "unpaid"]}}),
        "tickets_open": await db.tickets.count_documents({"status": {"$in": ["open", "OPEN"]}}),
        "quotes_open": await db.quotes.count_documents({"status": {"$nin": ["closed", "rejected", "converted"]}}),
        "leads_open": await db.leads.count_documents({"status": {"$nin": ["won", "lost", "closed"]}}),
    }
    return {
        "stats": stats, "orders": orders, "store_orders": store_orders,
        "tickets": tickets, "quotes": quotes, "leads": leads,
        "signups": signups, "users": users,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


async def try_direct_charge_answer(message: str) -> Optional[dict]:
    text = normalize_spaces(message or "")
    if not text:
        return None
    lower = text.lower()
    trigger_phrases = ["cuánto le cobro a", "cuanto le cobro a", "how much should i charge", "how much to charge"]
    if not any(phrase in lower for phrase in trigger_phrases):
        return None
    name_guess = None
    match_es = re.search(r"(?:cuánto le cobro a|cuanto le cobro a)\s+([\w\sÁÉÍÓÚÜÑáéíóúüñ'-]+)", text, flags=re.IGNORECASE)
    match_en = re.search(r"(?:how much should i charge|how much to charge)\s+([\w\s'-]+)", text, flags=re.IGNORECASE)
    if match_es:
        name_guess = normalize_spaces(match_es.group(1))
    elif match_en:
        name_guess = normalize_spaces(match_en.group(1))
    if not name_guess:
        return None
    customer = await db.customers.find_one({"name": {"$regex": name_guess, "$options": "i"}}, {"_id": 0, "id": 1, "name": 1})
    if not customer:
        return {"reply": f"No encontré un cliente llamado {name_guess} en el sistema. ¿Quieres que busque por teléfono, correo o número de orden para calcular el cobro exacto?", "actions": []}
    orders = await db.orders.find({"customer_id": customer.get("id")}, {"_id": 0, "order_number": 1, "total_amount": 1, "payment_status": 1, "status": 1, "updated_at": 1}).sort("updated_at", -1).limit(5).to_list(5)
    if not orders:
        return {"reply": f"No encontré órdenes activas para {customer.get('name')}. ¿Quieres que cree una nueva orden o revise historial más antiguo?", "actions": []}
    latest = orders[0]
    due_amount = 0.0
    for order in orders:
        if normalize_status(order.get("payment_status") or "") not in {"PAID", "SETTLED"}:
            try:
                due_amount += float(order.get("total_amount") or 0)
            except Exception:
                continue
    due_text = f"${due_amount:.2f}" if due_amount > 0 else "$0.00"
    latest_total = latest.get("total_amount")
    latest_total_text = f"${float(latest_total):.2f}" if latest_total is not None else "N/A"
    reply = (
        f"Para {customer.get('name')}, el saldo pendiente estimado es {due_text}. "
        f"La orden más reciente es {latest.get('order_number') or 'N/A'} con total {latest_total_text} y estado {latest.get('status') or 'N/A'}. "
        f"¿Quieres que registre pago ahora o te detalle cada orden pendiente?"
    )
    return {"reply": reply, "actions": []}


async def execute_jarvis_action(action_type: str, action_payload: dict, current_user: dict, base_url: str) -> dict:
    action_type = normalize_status(action_type or "").lower()
    action_payload = action_payload or {}
    now = datetime.now(timezone.utc).isoformat()

    if action_type == "update_order_status":
        order_id = action_payload.get("order_id")
        status = action_payload.get("status")
        if not order_id or not status:
            return {"type": action_type, "ok": False, "error": "Missing order_id or status"}
        status_n = normalize_status(status)
        result = await db.orders.update_one({"id": order_id}, {"$set": {"status": status_n, "estado_actual": status_n, "updated_at": now, "tiempos.ultimo_cambio_estado": now, f"tiempos.fechas_estado.{status_n}": now}})
        if result.matched_count == 0:
            return {"type": action_type, "ok": False, "error": "Order not found"}
        await create_audit_log("ORDER_STATUS_CHANGED", "order", order_id, current_user["id"], {"status": status_n, "source": "jarvis"})
        return {"type": action_type, "ok": True, "order_id": order_id, "status": status_n}

    if action_type == "update_order_lbs":
        order_id = action_payload.get("order_id")
        if not order_id:
            return {"type": action_type, "ok": False, "error": "Missing order_id"}
        update_data = {}
        if "estimated_lbs" in action_payload:
            update_data["estimated_lbs"] = action_payload.get("estimated_lbs")
        if "actual_lbs" in action_payload:
            update_data["actual_lbs"] = action_payload.get("actual_lbs")
        if not update_data:
            return {"type": action_type, "ok": False, "error": "No lbs provided"}
        update_data["updated_at"] = now
        await db.orders.update_one({"id": order_id}, {"$set": update_data})
        return {"type": action_type, "ok": True, "order_id": order_id}

    if action_type == "register_payment":
        order_id = action_payload.get("order_id")
        method = normalize_payment_method(action_payload.get("payment_method"))
        amount_received = action_payload.get("amount_received")
        if not order_id or not method:
            return {"type": action_type, "ok": False, "error": "Missing payment data"}
        order = await db.orders.find_one({"$or": [{"id": order_id}, {"order_number": order_id}]}, {"_id": 0})
        if not order:
            return {"type": action_type, "ok": False, "error": "Order not found"}
        total_amount = order.get("total_amount")
        if amount_received is None:
            amount_received = total_amount
        change_due = None
        if method == "cash" and total_amount is not None and amount_received is not None:
            change_due = round(float(amount_received) - float(total_amount), 2)
        await db.orders.update_one({"id": order.get("id")}, {"$set": {"payment_status": "paid", "payment_method": method, "amount_paid": amount_received, "change_due": change_due, "paid_at": now, "updated_at": now}})
        return {"type": action_type, "ok": True, "order_id": order.get("id")}

    if action_type == "print_ticket":
        order_id = action_payload.get("order_id")
        if not order_id:
            return {"type": action_type, "ok": False, "error": "Missing order_id"}
        return {"type": action_type, "ok": True, "order_id": order_id, "ticket_url": f"{base_url}/api/orders/{order_id}/qr.svg"}

    if action_type == "send_notification":
        order_id = action_payload.get("order_id")
        message = action_payload.get("message")
        channel = action_payload.get("channel")
        if not order_id:
            return {"type": action_type, "ok": False, "error": "Missing order_id"}
        order = await db.orders.find_one({"$or": [{"id": order_id}, {"order_number": order_id}]}, {"_id": 0})
        if not order:
            return {"type": action_type, "ok": False, "error": "Order not found"}
        customer = await db.customers.find_one({"id": order.get("customer_id")}, {"_id": 0}) if order.get("customer_id") else None
        if not customer:
            return {"type": action_type, "ok": False, "error": "Customer not found"}
        if NOTIFICATIONS_ENABLED and message:
            preferred = normalize_preferred_contact(channel or customer.get("preferred_contact"))
            if preferred == "email":
                ok = await send_email(customer.get("email"), "Order update", message)
            elif preferred == "call":
                ok = await send_voice_call(customer.get("phone"), message, detect_language(customer, customer.get("phone")))
            elif preferred == "whatsapp":
                ok = await send_whatsapp(customer.get("phone"), message)
            else:
                ok = await send_sms(customer.get("phone"), message)
        elif NOTIFICATIONS_ENABLED:
            ok = await send_preferred_notification(customer, order, "status_changed", order.get("status"))
        else:
            ok = False
        return {"type": action_type, "ok": ok, "order_id": order_id}

    simple_updates = {
        "update_ticket_status": ("tickets", "ticket_id", "status"),
        "update_quote_status": ("quotes", "quote_id", "status"),
        "update_lead_status": ("leads", "lead_id", "status"),
        "update_signup_status": ("membership_signups", "signup_id", "status"),
        "update_store_order_status": ("store_orders", "order_id", "status"),
    }
    if action_type in simple_updates:
        coll_name, id_key, field_key = simple_updates[action_type]
        entity_id = action_payload.get(id_key)
        value = action_payload.get(field_key)
        if not entity_id or not value:
            return {"type": action_type, "ok": False, "error": f"Missing {id_key} or {field_key}"}
        coll = getattr(db, coll_name)
        query = {"$or": [{"id": entity_id}, {"order_number": entity_id}]} if coll_name == "store_orders" else {"id": entity_id}
        result = await coll.update_one(query, {"$set": {field_key: value, "updated_at": now}})
        return {"type": action_type, "ok": result.modified_count > 0, id_key: entity_id, field_key: value}

    if action_type == "update_store_payment_status":
        order_id = action_payload.get("order_id")
        ps = action_payload.get("payment_status")
        if not order_id or not ps:
            return {"type": action_type, "ok": False, "error": "Missing order_id or payment_status"}
        result = await db.store_orders.update_one({"$or": [{"id": order_id}, {"order_number": order_id}]}, {"$set": {"payment_status": ps, "updated_at": now}})
        return {"type": action_type, "ok": result.modified_count > 0, "order_id": order_id, "payment_status": ps}

    if action_type == "update_membership_customer":
        customer_id = action_payload.get("customer_id")
        update_fields = {k: v for k, v in action_payload.items() if k in ["membership_plan", "membership_status", "membership_start_date"] and v is not None}
        if not customer_id or not update_fields:
            return {"type": action_type, "ok": False, "error": "Missing customer_id or membership fields"}
        update_fields["updated_at"] = now
        result = await db.customers.update_one({"id": customer_id}, {"$set": update_fields})
        return {"type": action_type, "ok": result.modified_count > 0, "customer_id": customer_id}

    if action_type == "update_user_role":
        user_id = action_payload.get("user_id")
        role = action_payload.get("role")
        if not user_id or role not in VALID_ROLES:
            return {"type": action_type, "ok": False, "error": "Missing user_id or invalid role"}
        result = await db.users.update_one({"id": user_id}, {"$set": {"role": role, "updated_at": now}})
        return {"type": action_type, "ok": result.modified_count > 0, "user_id": user_id, "role": role}

    if action_type == "update_system_setting":
        key = normalize_spaces(action_payload.get("key") or "")
        value = action_payload.get("value")
        if not key:
            return {"type": action_type, "ok": False, "error": "Missing setting key"}
        await db.system_settings.update_one({"key": key}, {"$set": {"value": value, "updated_at": now, "updated_by": current_user.get("id")}}, upsert=True)
        return {"type": action_type, "ok": True, "key": key}

    return {"type": action_type, "ok": False, "error": "Unknown action"}


# ── Endpoints ─────────────────────────────────────────────────────────

@router.get("/ai/briefing")
async def get_daily_briefing(current_user: dict = Depends(get_current_user)):
    if not AI_ASSISTANT_ENABLED:
        raise HTTPException(status_code=503, detail="AI Assistant not available")
    try:
        return await generate_daily_briefing(db, current_user.get("role", "operator"), current_user.get("name", "User"))
    except Exception as e:
        logger.error(f"Error generating briefing: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/ai/suggestions")
async def get_ai_suggestions(current_user: dict = Depends(get_current_user)):
    if not AI_ASSISTANT_ENABLED:
        raise HTTPException(status_code=503, detail="AI Assistant not available")
    try:
        suggestions = await ai_suggest_actions(db, "general")
        return {"suggestions": suggestions}
    except Exception as e:
        logger.error(f"Error getting suggestions: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/ai/chat")
async def ai_chat(data: AdminAIRequest, current_user: dict = Depends(get_current_user)):
    if not AI_ASSISTANT_ENABLED:
        raise HTTPException(status_code=503, detail="AI Assistant not available")
    try:
        result = await ai_analyze_business(db, data.message, current_user.get("role", "operator"))
        response_text = result.get("response", "")
        actions, results = [], []
        if data.execute and "```json" in response_text:
            json_matches = re.findall(r'```json\s*(\{.*?\})\s*```', response_text, re.DOTALL)
            for json_str in json_matches:
                try:
                    action_data = json.loads(json_str)
                    if "action" in action_data:
                        action_result = await execute_ai_action_simple(action_data, current_user)
                        results.append(action_result)
                        actions.append(action_data)
                except Exception:
                    pass
        return {"reply": response_text, "actions": actions, "results": results, "generated_at": result.get("generated_at")}
    except Exception as e:
        logger.error(f"Error in AI chat: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/ai/operations")
async def ai_operations(data: AdminAIRequest, request: Request, current_user: dict = Depends(require_role([ROLE_OPERATOR, ROLE_ADMIN]))):
    if not AI_ASSISTANT_ENABLED:
        raise HTTPException(status_code=503, detail="AI Assistant not available")
    session = await get_or_create_ai_session(data.session_id, current_user)
    session_id = session.get("session_id")
    history = session.get("messages", [])[-20:]
    context_bundle = await build_global_operations_context()

    direct_answer = await try_direct_charge_answer(data.message)
    if direct_answer:
        now = datetime.now(timezone.utc).isoformat()
        history.append({"role": "user", "content": data.message, "created_at": now})
        history.append({"role": "assistant", "content": direct_answer.get("reply"), "created_at": now, "actions": []})
        await save_ai_session_messages(session_id, history)
        await db.ai_command_logs.insert_one({"id": str(uuid.uuid4()), "session_id": session_id, "user_id": current_user.get("id"), "user_role": current_user.get("role"), "message": data.message, "reply": direct_answer.get("reply"), "actions": [], "critical_actions": [], "requires_confirmation": False, "confirm_token": None, "executed": False, "results": [], "confidence": 1, "created_at": now, "source": "direct_charge_answer"})
        return {"session_id": session_id, "reply": direct_answer.get("reply"), "actions": [], "critical_actions": [], "requires_confirmation": False, "confirm_token": None, "results": [], "global_context": context_bundle.get("stats", {}), "generated_at": now}

    history_lines = "\n".join([f"{item.get('role', 'user')}: {item.get('content', '')}" for item in history if item.get("content")]) or "No prior session history"
    system_prompt = (
        "You are JARVIS, the formal-professional omnichannel operations AI for Ventura Fresh Laundry. "
        "You must answer any user query clearly, but only suggest executable actions that exist in the system. "
        "You have global context across orders, store, tickets, quotes, leads, users, settings and finance indicators. "
        "Return ONLY valid JSON with keys: reply (string), actions (array), confidence (number 0-1). "
        "Each action must include: type, payload, reason."
        "Allowed action types: update_order_status, update_order_lbs, register_payment, print_ticket, send_notification, "
        "update_ticket_status, update_quote_status, update_lead_status, update_signup_status, update_membership_customer, "
        "update_store_order_status, update_store_payment_status, update_user_role, update_system_setting. "
        "Be concise, strategic, and accurate."
    )
    prompt = f"{system_prompt}\n\nSESSION HISTORY:\n{history_lines}\n\nGLOBAL CONTEXT JSON:\n{json.dumps(context_bundle, ensure_ascii=False)}\n\nCLIENT CONTEXT JSON:\n{json.dumps(data.context or {}, ensure_ascii=False)}\n\nUSER MESSAGE:\n{data.message}\n\nJSON:"

    ai_error = None
    try:
        raw = call_ollama(prompt)
        try:
            payload = extract_json_payload(raw)
        except Exception:
            payload = {"reply": raw, "actions": [], "confidence": 0.5}
    except Exception as exc:
        ai_error = str(exc)
        is_spanish = any(ch in (data.message or "") for ch in ["¿", "á", "é", "í", "ó", "ú", "ñ"])
        fallback_reply = ("Estoy temporalmente en modo de alta demanda de IA. Puedo seguir ejecutando comandos directos del sistema." if is_spanish else "I'm temporarily in high-demand AI mode. I can still execute direct system commands.")
        payload = {"reply": fallback_reply, "actions": [], "confidence": 0.2}

    reply = normalize_spaces(payload.get("reply") or "Done")
    actions = payload.get("actions", []) if isinstance(payload.get("actions", []), list) else []
    confidence = payload.get("confidence", 0.5)

    host = request.headers.get("x-forwarded-host") or request.headers.get("host")
    proto = request.headers.get("x-forwarded-proto") or "https"
    base_url = f"{proto}://{host}" if host else str(request.base_url).rstrip("/")

    critical_actions = [{"type": a.get("type") or a.get("action"), "payload": a.get("payload") or a.get("params") or {}} for a in actions if is_critical_ai_action(a.get("type") or a.get("action"), a.get("payload") or a.get("params") or {})]
    requires_confirmation = len(critical_actions) > 0 and data.execute
    confirmation_token = data.confirm_token
    results = []

    if requires_confirmation:
        pending = await db.ai_pending_actions.find_one({"session_id": session_id, "status": "pending"}, {"_id": 0})
        if pending and pending.get("token") == confirmation_token:
            await db.ai_pending_actions.update_one({"session_id": session_id, "token": confirmation_token}, {"$set": {"status": "confirmed", "confirmed_at": datetime.now(timezone.utc).isoformat(), "confirmed_by": current_user.get("id")}})
            requires_confirmation = False
        elif not confirmation_token:
            confirmation_token = str(uuid.uuid4())
            await db.ai_pending_actions.insert_one({"id": str(uuid.uuid4()), "session_id": session_id, "token": confirmation_token, "status": "pending", "actions": actions, "critical_actions": critical_actions, "created_at": datetime.now(timezone.utc).isoformat(), "created_by": current_user.get("id")})

    if data.execute and not requires_confirmation:
        for action in actions:
            a_type = action.get("type") or action.get("action")
            a_payload = action.get("payload") or action.get("params") or {}
            try:
                result = await execute_jarvis_action(a_type, a_payload, current_user, base_url)
                results.append(result)
            except Exception as exc:
                results.append({"type": a_type, "ok": False, "error": str(exc)})

    now = datetime.now(timezone.utc).isoformat()
    history.append({"role": "user", "content": data.message, "created_at": now})
    history.append({"role": "assistant", "content": reply, "created_at": now, "actions": actions, "results": results})
    await save_ai_session_messages(session_id, history)

    await db.ai_command_logs.insert_one({"id": str(uuid.uuid4()), "session_id": session_id, "user_id": current_user.get("id"), "user_role": current_user.get("role"), "message": data.message, "reply": reply, "actions": actions, "critical_actions": critical_actions, "requires_confirmation": requires_confirmation, "confirm_token": confirmation_token if requires_confirmation else None, "executed": data.execute and not requires_confirmation, "results": results, "confidence": confidence, "ai_error": ai_error, "created_at": now})

    day_key = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    await db.ai_daily_summaries.update_one(
        {"day": day_key},
        {"$set": {"updated_at": now}, "$inc": {"interactions_count": 1, "actions_proposed_count": len(actions), "actions_executed_count": len([r for r in results if r.get("ok")])}, "$push": {"samples": {"$each": [{"session_id": session_id, "user_id": current_user.get("id"), "message": data.message, "reply": reply, "created_at": now}], "$slice": -50}}},
        upsert=True,
    )

    response_reply = f"{reply}\n\nCritical actions detected. Please confirm execution to proceed." if requires_confirmation else reply
    return {"session_id": session_id, "reply": response_reply, "actions": actions, "critical_actions": critical_actions, "requires_confirmation": requires_confirmation, "confirm_token": confirmation_token if requires_confirmation else None, "results": results, "global_context": context_bundle.get("stats", {}), "generated_at": now}


@router.get("/ai/operations/session/{session_id}")
async def get_ai_operations_session(session_id: str, current_user: dict = Depends(require_role([ROLE_OPERATOR, ROLE_ADMIN]))):
    session = await db.ai_operator_sessions.find_one({"session_id": session_id}, {"_id": 0})
    if not session:
        return {"session_id": session_id, "messages": []}
    if session.get("user_id") and session.get("user_id") != current_user.get("id") and current_user.get("role") != ROLE_ADMIN:
        raise HTTPException(status_code=403, detail="Session not accessible")
    return {"session_id": session.get("session_id"), "messages": session.get("messages", [])[-60:], "updated_at": session.get("updated_at")}


# ── Simple AI action executor (used by /ai/chat) ─────────────────────

async def execute_ai_action_simple(action_data: dict, current_user: dict) -> dict:
    action_type = action_data.get("action")
    params = action_data.get("params", {})
    now = datetime.now(timezone.utc).isoformat()
    try:
        if action_type == "update_order_status":
            order_id, status = params.get("order_id"), params.get("status")
            if order_id and status:
                await db.orders.update_one({"id": order_id}, {"$set": {"status": status, "updated_at": now}})
                await create_audit_log("ORDER_STATUS_CHANGED", "order", order_id, current_user["id"], {"status": status, "source": "ai"})
                return {"action": action_type, "ok": True, "message": f"Order updated to {status}"}
        elif action_type == "update_order_lbs":
            order_id = params.get("order_id")
            if order_id:
                update_data = {k: params[k] for k in ["estimated_lbs", "actual_lbs"] if k in params}
                if update_data:
                    update_data["updated_at"] = now
                    await db.orders.update_one({"id": order_id}, {"$set": update_data})
                    return {"action": action_type, "ok": True, "message": "Order lbs updated"}
        elif action_type == "update_payment_status":
            order_id, status = params.get("order_id"), params.get("status")
            if order_id and status:
                await db.orders.update_one({"id": order_id}, {"$set": {"payment_status": status, "updated_at": now}})
                return {"action": action_type, "ok": True, "message": f"Payment status updated to {status}"}
        elif action_type in ("update_quote_status", "update_lead_status", "update_ticket_status"):
            coll_map = {"update_quote_status": ("quotes", "quote_id"), "update_lead_status": ("leads", "lead_id"), "update_ticket_status": ("tickets", "ticket_id")}
            coll_name, id_key = coll_map[action_type]
            eid, status = params.get(id_key), params.get("status")
            if eid and status:
                await getattr(db, coll_name).update_one({"id": eid}, {"$set": {"status": status, "updated_at": now}})
                return {"action": action_type, "ok": True, "message": f"{coll_name.title()} updated to {status}"}
        return {"action": action_type, "ok": False, "error": "Unknown action type"}
    except Exception as e:
        return {"action": action_type, "ok": False, "error": str(e)}
