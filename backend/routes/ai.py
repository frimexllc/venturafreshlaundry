from fastapi import APIRouter, HTTPException, Depends, Request
from typing import Optional, Dict, Any
from datetime import datetime, timezone, timedelta
import json
import uuid


def get_ai_router(
    db,
    get_current_user,
    require_admin,
    require_role,
    ROLE_OPERATOR,
    AdminAIRequest,
    PatternScanRequest,
    ProposalGenerateRequest,
    ProposalActionRequest,
    OrderPaymentUpdate,
    call_ollama,
    extract_json_payload,
    ensure_ai_indexes,
    get_or_seed_business_rules,
    generate_daily_briefing,
    ai_suggest_actions,
    ai_analyze_business,
    normalize_preferred_contact,
    send_email,
    send_sms,
    send_voice_call,
    send_whatsapp,
    send_preferred_notification,
    detect_language,
    create_audit_log,
    emit_realtime,
    NOTIFICATIONS_ENABLED,
    SKIP_SERVER_NOTIFICATIONS,
    normalize_status,
    should_notify_order_status,
    notify_order_status_changed,
    logger,
    AI_ASSISTANT_ENABLED
):
    router = APIRouter()

    async def apply_order_status(order_id: str, status: str, current_user: dict):
        valid_statuses = ["new", "processing", "ready", "out_for_delivery", "delivered", "completed", "cancelled"]
        normalized_status = normalize_status(status)
        if normalized_status not in valid_statuses:
            raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {valid_statuses}")

        order = await db.orders.find_one({"id": order_id}, {"_id": 0})
        if not order:
            raise HTTPException(status_code=404, detail="Order not found")

        current_status = normalize_status(order.get("status"))
        if normalized_status == "completed" and current_status not in ["delivered", "completed", "out_for_delivery"]:
            raise HTTPException(status_code=400, detail="Order must be delivered before it can be completed")

        await db.orders.update_one(
            {"id": order_id},
            {
                "$set": {
                    "status": normalized_status,
                    "estado_actual": normalized_status,
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                    "tiempos.ultimo_cambio_estado": datetime.now(timezone.utc).isoformat(),
                    f"tiempos.fechas_estado.{normalized_status}": datetime.now(timezone.utc).isoformat()
                }
            }
        )

        await create_audit_log("ORDER_STATUS_CHANGED", "order", order_id, current_user["id"], {"new_status": normalized_status, "source": "ai"})

        if NOTIFICATIONS_ENABLED and not SKIP_SERVER_NOTIFICATIONS and order.get("customer_id") and should_notify_order_status(order, normalized_status):
            customer = await db.customers.find_one({"id": order["customer_id"]}, {"_id": 0})
            if customer:
                order["status"] = normalized_status
                try:
                    await notify_order_status_changed(customer, order, normalized_status)
                except Exception as e:
                    logger.error(f"Notification failed: {e}")

        await emit_realtime("notification", {"type": "order_status", "order_id": order_id, "status": normalized_status})
        return {"message": f"Order status updated to {normalized_status}"}

    async def update_order_record(order_id: str, data: dict, current_user: dict):
        data["updated_at"] = datetime.now(timezone.utc).isoformat()
        result = await db.orders.update_one({"id": order_id}, {"$set": data})
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Order not found")
        await create_audit_log("ORDER_UPDATED", "order", order_id, current_user["id"], {"changes": list(data.keys()), "source": "ai"})
        order = await db.orders.find_one({"id": order_id}, {"_id": 0})
        return order

    async def capture_payment(order_id: str, payment_method: str, amount_received: Optional[float], current_user: dict):
        method = payment_method
        allowed = ["cash", "card", "transfer", "other"]
        if method not in allowed:
            raise HTTPException(status_code=400, detail=f"Invalid payment method. Must be one of: {allowed}")

        order = await db.orders.find_one({"$or": [{"id": order_id}, {"order_number": order_id}]}, {"_id": 0})
        if not order:
            raise HTTPException(status_code=404, detail="Order not found")

        total_amount = order.get("total_amount")
        if method == "cash" and amount_received is None:
            raise HTTPException(status_code=400, detail="Amount received is required for cash payments")

        if amount_received is None:
            amount_received = total_amount

        if total_amount is not None and amount_received is not None:
            try:
                total_amount = float(total_amount)
                amount_received = float(amount_received)
            except Exception:
                raise HTTPException(status_code=400, detail="Invalid amount values")
            if amount_received < total_amount:
                raise HTTPException(status_code=400, detail="Amount received cannot be less than total")

        change_due = None
        if method == "cash" and total_amount is not None and amount_received is not None:
            change_due = round(amount_received - total_amount, 2)

        now = datetime.now(timezone.utc).isoformat()
        update_data = {
            "payment_status": "paid",
            "payment_method": method,
            "amount_paid": amount_received,
            "change_due": change_due,
            "paid_at": now,
            "updated_at": now
        }

        await db.orders.update_one({"id": order.get("id")}, {"$set": update_data})
        await create_audit_log("ORDER_PAYMENT_CAPTURED", "order", order.get("id"), current_user["id"], update_data)
        await emit_realtime("notification", {"type": "order_payment", "order_id": order.get("id"), "status": "paid", "method": method})
        return {"ok": True, "order_id": order.get("id"), **update_data}

from zoneinfo import ZoneInfo
from datetime import datetime, timedelta
import os
from groq import Groq

PT = ZoneInfo("America/Los_Angeles")

@router.get("/ai/briefing")
async def get_daily_briefing(current_user: dict = Depends(get_current_user)):
    if not AI_ASSISTANT_ENABLED:
        raise HTTPException(status_code=503, detail="AI Assistant not available")
    try:
        # 1. Obtener hora actual en Pacific Time
        now_pt = datetime.now(PT)
        today_start = now_pt.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
        today_end = now_pt.replace(hour=23, minute=59, second=59, microsecond=999999).isoformat()
        month_start = now_pt.replace(day=1, hour=0, minute=0, second=0, microsecond=0).isoformat()

        # 2. Consultar estadísticas usando rangos en Pacific Time (las fechas en DB están en UTC,
        #    pero como convertimos a ISO string, funciona correctamente)
        orders_today = await db.orders.count_documents({
            "created_at": {"$gte": today_start, "$lte": today_end}
        })
        orders_new = await db.orders.count_documents({"status": "new"})
        orders_processing = await db.orders.count_documents({"status": "processing"})
        orders_ready = await db.orders.count_documents({"status": "ready"})
        orders_out_delivery = await db.orders.count_documents({"status": "out_for_delivery"})

        # Ingresos del mes (pagos realizados en este mes)
        revenue_pipeline = [
            {"$match": {"payment_status": "paid", "paid_at": {"$gte": month_start}}},
            {"$group": {"_id": None, "total": {"$sum": "$total_amount"}}}
        ]
        revenue_result = await db.orders.aggregate(revenue_pipeline).to_list(1)
        total_revenue = revenue_result[0]["total"] if revenue_result else 0.0

        pending_pipeline = [
            {"$match": {"payment_status": {"$in": ["unpaid", "pending", "pending_verification"]}}},
            {"$group": {"_id": None, "total": {"$sum": "$total_amount"}}}
        ]
        pending_result = await db.orders.aggregate(pending_pipeline).to_list(1)
        pending_revenue = pending_result[0]["total"] if pending_result else 0.0

        # 3. Construir prompt en inglés con la hora actual en Pacific Time
        current_time_str = now_pt.strftime("%Y-%m-%d %H:%M:%S %Z")
        prompt = f"""
You are an AI business assistant for Ventura Fresh Laundry, a laundry service in Ventura County, California.
Current date and time in Pacific Time (America/Los_Angeles): {current_time_str}

Based on the following real-time data, write a concise executive briefing (2-3 short paragraphs) in English.
Focus on key metrics, actionable insights, and any notable trends.

**Business Data:**
- Orders created today: {orders_today}
- New orders (status 'new'): {orders_new}
- Orders in process: {orders_processing}
- Orders ready for delivery: {orders_ready}
- Orders out for delivery: {orders_out_delivery}
- Total revenue collected (this month): ${total_revenue:,.2f}
- Pending payments: ${pending_revenue:,.2f}

Please write a friendly, professional briefing. Include:
- A summary of today's activity.
- A note about pending payments.
- Any recommendation based on the data (e.g., follow up on pending payments).
- End with a positive, encouraging sentence.

Use natural language, no markdown, and keep it under 200 words.
"""

        system = (
            "You are an AI assistant for a laundry business. Always respond in English. "
            "Use the provided Pacific Time zone for any time references. Be concise and professional."
        )

        # 4. Llamar a Groq (puedes usar call_ollama si prefieres, pero Groq es más rápido)
        api_key = os.environ.get("GROQ_API_KEY")
        if not api_key:
            raise HTTPException(status_code=503, detail="GROQ_API_KEY not configured")
        client = Groq(api_key=api_key)
        completion = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": prompt}
            ],
            temperature=0.5,
            max_tokens=800,
        )
        briefing_text = completion.choices[0].message.content.strip()

        # 5. Devolver el briefing y los datos (incluyendo la hora actual en Pacific Time)
        return {
            "briefing": briefing_text,
            "data": {
                "orders_new": orders_new,
                "orders_processing": orders_processing,
                "orders_ready": orders_ready,
                "orders_out_delivery": orders_out_delivery,
                "total_revenue": total_revenue,
                "pending_revenue": pending_revenue,
                "current_time_pacific": now_pt.isoformat()
            }
        }
    except Exception as e:
        logger.error(f"Error generating briefing: {e}")
        raise HTTPException(status_code=500, detail=str(e))

    @router.get("/ai/suggestions")
    async def get_ai_suggestions_endpoint(current_user: dict = Depends(get_current_user)):
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
            actions = []
            results = []
            if data.execute and "```json" in response_text:
                import re
                json_matches = re.findall(r'```json\s*(\{.*?\})\s*```', response_text, re.DOTALL)
                for json_str in json_matches:
                    try:
                        action_data = json.loads(json_str)
                        if "action" in action_data:
                            action_result = await execute_ai_action(action_data, current_user)
                            results.append(action_result)
                            actions.append(action_data)
                    except Exception:
                        pass

            return {
                "reply": response_text,
                "actions": actions,
                "results": results,
                "generated_at": result.get("generated_at")
            }
        except Exception as e:
            logger.error(f"Error in AI chat: {e}")
            raise HTTPException(status_code=500, detail=str(e))

    @router.post("/ai/operations")
    async def ai_operations(data: AdminAIRequest, request: Request, current_user: dict = Depends(require_role([ROLE_OPERATOR]))):
        if not AI_ASSISTANT_ENABLED:
            raise HTTPException(status_code=503, detail="AI Assistant not available")

        recent_orders = await db.orders.find({}, {"_id": 0}).sort("created_at", -1).limit(15).to_list(15)
        orders_summary = "\n".join([
            f"- {o.get('order_number') or o.get('id')} | id:{o.get('id')} | {o.get('customer_name') or '-'} | status:{o.get('status')} | total:{o.get('total_amount')} | payment:{o.get('payment_status')}"
            for o in recent_orders
        ]) or "No recent orders"

        system_prompt = (
            "You are an operations assistant for a laundry business. "
            "Return ONLY valid JSON with keys: reply (string) and actions (array). "
            "Actions must be objects with type and payload. Allowed types: "
            "update_order_status, update_order_lbs, register_payment, print_ticket, send_notification. "
            "For update_order_status payload: order_id, status (new|processing|ready|out_for_delivery|delivered|completed|cancelled). "
            "For update_order_lbs payload: order_id, estimated_lbs (number or null), actual_lbs (number or null). "
            "For register_payment payload: order_id, payment_method (cash|card|transfer|other), amount_received (number or null). "
            "For print_ticket payload: order_id. "
            "For send_notification payload: order_id, message (optional), channel (email|sms|whatsapp|call). "
            "Use IDs from the context. If no action is needed, return actions: []."
        )

        prompt = f"{system_prompt}\n\nCONTEXT:\n{orders_summary}\n\nUSER: {data.message}\nJSON:"
        raw = call_ollama(prompt)
        payload = extract_json_payload(raw)
        reply = payload.get("reply", "")
        actions = payload.get("actions", []) if isinstance(payload.get("actions", []), list) else []

        results = []
        if data.execute:
            host = request.headers.get("x-forwarded-host") or request.headers.get("host")
            proto = request.headers.get("x-forwarded-proto") or "https"
            base_url = f"{proto}://{host}" if host else str(request.base_url).rstrip("/")

            for action in actions:
                action_type = action.get("type") or action.get("action")
                action_payload = action.get("payload") or action.get("params") or {}
                try:
                    if action_type == "update_order_status":
                        order_id = action_payload.get("order_id")
                        status = action_payload.get("status")
                        if not order_id or not status:
                            results.append({"type": action_type, "ok": False, "error": "Missing order_id or status"})
                            continue
                        result = await apply_order_status(order_id, status, current_user)
                        results.append({"type": action_type, "ok": True, "order_id": order_id, "status": status, "result": result})
                    elif action_type == "update_order_lbs":
                        order_id = action_payload.get("order_id")
                        if not order_id:
                            results.append({"type": action_type, "ok": False, "error": "Missing order_id"})
                            continue
                        update_data = {}
                        if "estimated_lbs" in action_payload:
                            update_data["estimated_lbs"] = action_payload.get("estimated_lbs")
                        if "actual_lbs" in action_payload:
                            update_data["actual_lbs"] = action_payload.get("actual_lbs")
                        if not update_data:
                            results.append({"type": action_type, "ok": False, "error": "No lbs provided"})
                            continue
                        updated = await update_order_record(order_id, update_data, current_user)
                        results.append({"type": action_type, "ok": True, "order_id": order_id, "updated": updated})
                    elif action_type == "register_payment":
                        order_id = action_payload.get("order_id")
                        method = action_payload.get("payment_method")
                        amount_received = action_payload.get("amount_received")
                        if not order_id or not method:
                            results.append({"type": action_type, "ok": False, "error": "Missing payment data"})
                            continue
                        updated = await capture_payment(order_id, method, amount_received, current_user)
                        results.append({"type": action_type, "ok": True, "order_id": order_id, "updated": updated})
                    elif action_type == "print_ticket":
                        order_id = action_payload.get("order_id")
                        if not order_id:
                            results.append({"type": action_type, "ok": False, "error": "Missing order_id"})
                            continue
                        ticket_url = f"{base_url}/api/orders/{order_id}/qr.svg"
                        results.append({"type": action_type, "ok": True, "order_id": order_id, "ticket_url": ticket_url})
                    elif action_type == "send_notification":
                        order_id = action_payload.get("order_id")
                        message = action_payload.get("message")
                        channel = action_payload.get("channel")
                        if not order_id:
                            results.append({"type": action_type, "ok": False, "error": "Missing order_id"})
                            continue
                        order = await db.orders.find_one({"$or": [{"id": order_id}, {"order_number": order_id}]}, {"_id": 0})
                        if not order:
                            results.append({"type": action_type, "ok": False, "error": "Order not found"})
                            continue
                        customer = None
                        if order.get("customer_id"):
                            customer = await db.customers.find_one({"id": order.get("customer_id")}, {"_id": 0})
                        if not customer:
                            results.append({"type": action_type, "ok": False, "error": "Customer not found"})
                            continue

                        if message:
                            preferred = normalize_preferred_contact(channel or customer.get("preferred_contact") or order.get("preferred_contact"))
                            if preferred == "email":
                                ok = await send_email(customer.get("email"), "Actualización de tu orden", message)
                            elif preferred == "call":
                                language = detect_language(customer, customer.get("phone"))
                                ok = await send_voice_call(customer.get("phone"), message, language)
                            elif preferred == "whatsapp":
                                ok = await send_whatsapp(customer.get("phone"), message)
                            else:
                                ok = await send_sms(customer.get("phone"), message)
                        else:
                            ok = await send_preferred_notification(customer, order, "status_changed", order.get("status"))
                        results.append({"type": action_type, "ok": ok, "order_id": order_id})
                    else:
                        results.append({"type": action_type, "ok": False, "error": "Unknown action"})
                except Exception as exc:
                    results.append({"type": action_type, "ok": False, "error": str(exc)})

        return {
            "reply": reply,
            "actions": actions,
            "results": results,
            "generated_at": datetime.now(timezone.utc).isoformat()
        }

    async def execute_ai_action(action_data: dict, current_user: dict) -> dict:
        action_type = action_data.get("action")
        params = action_data.get("params", {})

        try:
            if action_type == "update_order_status":
                order_id = params.get("order_id")
                status = params.get("status")
                if order_id and status:
                    await db.orders.update_one(
                        {"id": order_id},
                        {"$set": {"status": status, "updated_at": datetime.now(timezone.utc).isoformat()}}
                    )
                    await create_audit_log("ORDER_STATUS_CHANGED", "order", order_id, current_user["id"], {"status": status, "source": "ai"})
                    return {"action": action_type, "ok": True, "message": f"Order updated to {status}"}

            elif action_type == "update_order_lbs":
                order_id = params.get("order_id")
                if order_id:
                    update_data = {}
                    if "estimated_lbs" in params:
                        update_data["estimated_lbs"] = params.get("estimated_lbs")
                    if "actual_lbs" in params:
                        update_data["actual_lbs"] = params.get("actual_lbs")
                    if update_data:
                        update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
                        await db.orders.update_one({"id": order_id}, {"$set": update_data})
                        await create_audit_log("ORDER_UPDATED", "order", order_id, current_user["id"], {"changes": list(update_data.keys()), "source": "ai"})
                        return {"action": action_type, "ok": True, "message": "Order lbs updated"}

            elif action_type == "update_payment_status":
                order_id = params.get("order_id")
                status = params.get("status")
                if order_id and status:
                    await db.orders.update_one(
                        {"id": order_id},
                        {"$set": {"payment_status": status, "updated_at": datetime.now(timezone.utc).isoformat()}}
                    )
                    await create_audit_log("ORDER_PAYMENT_UPDATED", "order", order_id, current_user["id"], {"payment_status": status, "source": "ai"})
                    return {"action": action_type, "ok": True, "message": f"Payment status updated to {status}"}

            elif action_type == "update_quote_status":
                quote_id = params.get("quote_id")
                status = params.get("status")
                if quote_id and status:
                    await db.quotes.update_one(
                        {"id": quote_id},
                        {"$set": {"status": status, "updated_at": datetime.now(timezone.utc).isoformat()}}
                    )
                    await create_audit_log("QUOTE_STATUS_CHANGED", "quote", quote_id, current_user["id"], {"status": status, "source": "ai"})
                    return {"action": action_type, "ok": True, "message": f"Quote updated to {status}"}

            elif action_type == "update_lead_status":
                lead_id = params.get("lead_id")
                status = params.get("status")
                if lead_id and status:
                    await db.leads.update_one(
                        {"id": lead_id},
                        {"$set": {"status": status, "updated_at": datetime.now(timezone.utc).isoformat()}}
                    )
                    await create_audit_log("LEAD_STATUS_CHANGED", "lead", lead_id, current_user["id"], {"status": status, "source": "ai"})
                    return {"action": action_type, "ok": True, "message": f"Lead updated to {status}"}

            elif action_type == "update_ticket_status":
                ticket_id = params.get("ticket_id")
                status = params.get("status")
                if ticket_id and status:
                    await db.tickets.update_one(
                        {"id": ticket_id},
                        {"$set": {"status": status, "updated_at": datetime.now(timezone.utc).isoformat()}}
                    )
                    await create_audit_log("TICKET_STATUS_CHANGED", "ticket", ticket_id, current_user["id"], {"status": status, "source": "ai"})
                    return {"action": action_type, "ok": True, "message": f"Ticket updated to {status}"}

            return {"action": action_type, "ok": False, "error": "Unknown action type"}
        except Exception as e:
            return {"action": action_type, "ok": False, "error": str(e)}

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
            f"- {q.get('quote_number') or q.get('id')} | id:{q.get('id')} | {q.get('company_name') or q.get('contact_name') or '-'} | status:{q.get('status')} | est_lbs:{q.get('estimated_lbs')}"
            for q in recent_quotes
        ]) or "No recent quotes"

        recent_leads = await db.leads.find({}, {"_id": 0}).sort("created_at", -1).limit(10).to_list(10)
        leads_summary = "\n".join([
            f"- {ld.get('id')} | {ld.get('name') or '-'} | status:{ld.get('status')}"
            for ld in recent_leads
        ]) or "No recent leads"

        context = f"RECENT ORDERS:\n{orders_summary}\n\nRECENT QUOTES:\n{quotes_summary}\n\nRECENT LEADS:\n{leads_summary}"

        system_prompt = (
            "You are a local admin assistant for Ventura Fresh Laundry CRM. "
            "Return ONLY valid JSON with keys: reply (string) and actions (array). "
            "Actions must be objects with type and payload. Allowed types: "
            "update_order_status, update_order_lbs, update_payment_status, update_ticket_status, update_quote_status, update_lead_status, "
            "update_membership_signup_status, update_customer_membership. "
            "For update_order_status payload: order_id, status (new|processing|ready|out_for_delivery|delivered|completed|cancelled). "
            "For update_order_lbs payload: order_id, estimated_lbs (number or null), actual_lbs (number or null). "
            "For update_payment_status payload: order_id, status (pending|paid|refunded|failed). "
            "For update_ticket_status payload: ticket_id, status. "
            "For update_quote_status payload: quote_id, status. "
            "For update_lead_status payload: lead_id, status. "
            "For update_membership_signup_status payload: signup_id, status. "
            "For update_customer_membership payload: customer_id, membership_plan, membership_status, membership_start_date. "
            "Use IDs from the CONTEXT. If no action is needed, return actions: []."
        )

        prompt = f"{system_prompt}\n\nCONTEXT:\n{context}\n\nUser: {data.message}\nJSON:"
        model_response = call_ollama(prompt)
        payload = extract_json_payload(model_response)
        reply = payload.get("reply", "")
        actions = payload.get("actions", []) if isinstance(payload.get("actions", []), list) else []

        results = []
        if data.execute:
            for action in actions:
                action_type = action.get("type") or action.get("action")
                action_payload = action.get("payload") or action.get("params") or {}

                if action_type == "update_order_status":
                    order_id = action_payload.get("order_id")
                    status_value = action_payload.get("status")
                    if not order_id or not status_value:
                        results.append({"type": action_type, "ok": False, "error": "Invalid order id or status"})
                        continue
                    try:
                        await db.orders.update_one(
                            {"id": order_id},
                            {"$set": {"status": status_value, "updated_at": datetime.now(timezone.utc).isoformat()}}
                        )
                        await create_audit_log("ORDER_STATUS_CHANGED", "order", order_id, current_user["id"], {"status": status_value, "source": "ai"})
                        results.append({"type": action_type, "ok": True, "order_id": order_id, "status": status_value})
                    except Exception as exc:
                        results.append({"type": action_type, "ok": False, "error": str(exc)})
                elif action_type == "update_order_lbs":
                    order_id = action_payload.get("order_id")
                    if not order_id:
                        results.append({"type": action_type, "ok": False, "error": "Invalid order id"})
                        continue
                    update_data = {}
                    if "estimated_lbs" in action_payload:
                        update_data["estimated_lbs"] = action_payload.get("estimated_lbs")
                    if "actual_lbs" in action_payload:
                        update_data["actual_lbs"] = action_payload.get("actual_lbs")
                    if not update_data:
                        results.append({"type": action_type, "ok": False, "error": "No lbs provided"})
                        continue
                    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
                    result = await db.orders.update_one({"id": order_id}, {"$set": update_data})
                    if result.matched_count == 0:
                        results.append({"type": action_type, "ok": False, "error": "Order not found"})
                        continue
                    await create_audit_log("ORDER_UPDATED", "order", order_id, current_user["id"], {"changes": list(update_data.keys()), "source": "ai"})
                    results.append({"type": action_type, "ok": True, "order_id": order_id, "estimated_lbs": update_data.get("estimated_lbs"), "actual_lbs": update_data.get("actual_lbs")})
                elif action_type == "update_payment_status":
                    order_id = action_payload.get("order_id")
                    status_value = action_payload.get("status")
                    valid_payment = ["pending", "paid", "refunded", "failed"]
                    if not order_id or status_value not in valid_payment:
                        results.append({"type": action_type, "ok": False, "error": "Invalid payment status or id"})
                        continue
                    result = await db.orders.update_one(
                        {"id": order_id},
                        {"$set": {"payment_status": status_value, "updated_at": datetime.now(timezone.utc).isoformat()}}
                    )
                    if result.matched_count == 0:
                        results.append({"type": action_type, "ok": False, "error": "Order not found"})
                        continue
                    await create_audit_log("ORDER_PAYMENT_STATUS_CHANGED", "order", order_id, current_user["id"], {"status": status_value, "source": "ai"})
                    results.append({"type": action_type, "ok": True, "order_id": order_id, "status": status_value})
                elif action_type == "update_ticket_status":
                    ticket_id = action_payload.get("ticket_id")
                    status_value = action_payload.get("status")
                    if not ticket_id or not status_value:
                        results.append({"type": action_type, "ok": False, "error": "Invalid ticket status or id"})
                        continue
                    await db.tickets.update_one(
                        {"id": ticket_id},
                        {"$set": {"status": status_value, "updated_at": datetime.now(timezone.utc).isoformat()}}
                    )
                    await create_audit_log("TICKET_STATUS_CHANGED", "ticket", ticket_id, current_user["id"], {"status": status_value, "source": "ai"})
                    results.append({"type": action_type, "ok": True, "ticket_id": ticket_id})
                elif action_type == "update_quote_status":
                    quote_id = action_payload.get("quote_id")
                    status_value = action_payload.get("status")
                    if not quote_id or not status_value:
                        results.append({"type": action_type, "ok": False, "error": "Invalid quote status or id"})
                        continue
                    await db.quotes.update_one(
                        {"id": quote_id},
                        {"$set": {"status": status_value, "updated_at": datetime.now(timezone.utc).isoformat()}}
                    )
                    await create_audit_log("QUOTE_STATUS_CHANGED", "quote", quote_id, current_user["id"], {"status": status_value, "source": "ai"})
                    results.append({"type": action_type, "ok": True, "quote_id": quote_id})
                elif action_type == "update_lead_status":
                    lead_id = action_payload.get("lead_id")
                    status_value = action_payload.get("status")
                    if not lead_id or not status_value:
                        results.append({"type": action_type, "ok": False, "error": "Invalid lead status or id"})
                        continue
                    await db.leads.update_one(
                        {"id": lead_id},
                        {"$set": {"status": status_value, "updated_at": datetime.now(timezone.utc).isoformat()}}
                    )
                    await create_audit_log("LEAD_STATUS_CHANGED", "lead", lead_id, current_user["id"], {"status": status_value, "source": "ai"})
                    results.append({"type": action_type, "ok": True, "lead_id": lead_id})
                elif action_type == "update_membership_signup_status":
                    signup_id = action_payload.get("signup_id")
                    status_value = action_payload.get("status")
                    if not signup_id or not status_value:
                        results.append({"type": action_type, "ok": False, "error": "Invalid signup status or id"})
                        continue
                    await db.membership_signups.update_one(
                        {"id": signup_id},
                        {"$set": {"status": status_value, "updated_at": datetime.now(timezone.utc).isoformat()}}
                    )
                    await create_audit_log("MEMBERSHIP_SIGNUP_STATUS_CHANGED", "membership_signup", signup_id, current_user["id"], {"status": status_value, "source": "ai"})
                    results.append({"type": action_type, "ok": True, "signup_id": signup_id})
                elif action_type == "update_customer_membership":
                    customer_id = action_payload.get("customer_id")
                    membership_plan = action_payload.get("membership_plan")
                    membership_status = action_payload.get("membership_status")
                    membership_start_date = action_payload.get("membership_start_date")
                    if not customer_id:
                        results.append({"type": action_type, "ok": False, "error": "Invalid customer id"})
                        continue
                    update_data = {}
                    if membership_plan is not None:
                        update_data["membership_plan"] = membership_plan
                    if membership_status is not None:
                        update_data["membership_status"] = membership_status
                    if membership_start_date is not None:
                        update_data["membership_start_date"] = membership_start_date
                    if not update_data:
                        results.append({"type": action_type, "ok": False, "error": "No membership fields provided"})
                        continue
                    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
                    result = await db.customers.update_one({"id": customer_id}, {"$set": update_data})
                    if result.matched_count == 0:
                        results.append({"type": action_type, "ok": False, "error": "Customer not found"})
                        continue
                    await create_audit_log("CUSTOMER_MEMBERSHIP_UPDATED", "customer", customer_id, current_user["id"], {"changes": list(update_data.keys()), "source": "ai"})
                    results.append({"type": action_type, "ok": True, "customer_id": customer_id})
                else:
                    results.append({"type": action_type, "ok": False, "error": "Unknown action type"})

        return {
            "reply": reply,
            "actions": actions,
            "results": results,
            "generated_at": datetime.now(timezone.utc).isoformat()
        }

    @router.get("/ai/propuestas")
    async def list_proposals(estado: Optional[str] = None, current_user: dict = Depends(get_current_user)):
        require_admin(current_user)
        await ensure_ai_indexes()
        query: Dict[str, Any] = {}
        if estado:
            query["estado"] = estado
        propuestas = await db.propuestas_ia.find(query, {"_id": 0}).sort("fecha_generacion", -1).to_list(200)
        return propuestas

    @router.get("/ai/propuestas/{propuesta_id}")
    async def get_proposal(propuesta_id: str, current_user: dict = Depends(get_current_user)):
        require_admin(current_user)
        propuesta = await db.propuestas_ia.find_one({"id": propuesta_id}, {"_id": 0})
        if not propuesta:
            raise HTTPException(status_code=404, detail="Propuesta no encontrada")
        return propuesta

    @router.post("/ai/propuestas/generar")
    async def generate_proposals(data: ProposalGenerateRequest, current_user: dict = Depends(get_current_user)):
        require_admin(current_user)
        await ensure_ai_indexes()
        await get_or_seed_business_rules()
        query: Dict[str, Any] = {}
        if data.patrones_ids:
            query["id"] = {"$in": data.patrones_ids}
        patrones = await db.patrones_detectados.find(query, {"_id": 0}).sort("fecha_deteccion", -1).to_list(50)
        if not patrones:
            return {"ok": True, "propuestas_creadas": 0, "detalle": "Sin patrones"}
        prompt = (
            "Eres un asistente de optimización. Devuelve JSON con clave propuestas (array). "
            "Cada propuesta: tipo, descripcion, impacto_estimado, accion_sugerida, nivel_riesgo, datos_respaldo. "
            f"patrones={json.dumps(patrones, ensure_ascii=False)}"
        )
        raw = call_ollama(prompt)
        propuestas = []
        try:
            payload = extract_json_payload(raw)
            propuestas = payload.get("propuestas", [])
        except Exception:
            propuestas = []
        if not propuestas:
            for pattern in patrones[: data.max_propuestas or 10]:
                tipo = "ajuste_regla" if pattern["tipo"] == "cuello_botella" else "nueva_validacion"
                propuestas.append({
                    "tipo": tipo,
                    "descripcion": f"Propuesta automática basada en patrón {pattern['tipo']}",
                    "impacto_estimado": pattern.get("impacto_estimado", {}),
                    "accion_sugerida": {"type": tipo, "payload": {"pattern_id": pattern["id"]}},
                    "nivel_riesgo": "medio",
                    "datos_respaldo": {"pattern_id": pattern["id"]}
                })
        now = datetime.now(timezone.utc).isoformat()
        docs = []
        for propuesta in propuestas[: data.max_propuestas or 10]:
            docs.append({
                "id": str(uuid.uuid4()),
                "tipo": propuesta.get("tipo"),
                "descripcion": propuesta.get("descripcion", ""),
                "estado": "pendiente",
                "impacto_estimado": propuesta.get("impacto_estimado", {}),
                "accion_sugerida": propuesta.get("accion_sugerida", {}),
                "nivel_riesgo": propuesta.get("nivel_riesgo", "medio"),
                "datos_respaldo": propuesta.get("datos_respaldo", {}),
                "fecha_generacion": now,
                "fuente": "analizador_automatico_v1"
            })
        if docs:
            await db.propuestas_ia.insert_many(docs)
        return {"ok": True, "propuestas_creadas": len(docs)}

    @router.get("/ai/propuestas/{propuesta_id}/simulacion")
    async def get_proposal_simulation(
        propuesta_id: str,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        service_type: Optional[str] = None,
        status: Optional[str] = None,
        real_before_days: Optional[int] = 14,
        real_after_days: Optional[int] = 7,
        current_user: dict = Depends(get_current_user)
    ):
        require_admin(current_user)
        propuesta = await db.propuestas_ia.find_one({"id": propuesta_id}, {"_id": 0})
        if not propuesta:
            raise HTTPException(status_code=404, detail="Propuesta no encontrada")
        now = datetime.now(timezone.utc)
        periodo_desde = start_date or (now - timedelta(days=7)).isoformat()
        periodo_hasta = end_date or now.isoformat()
        match = {"created_at": {"$gte": periodo_desde, "$lte": periodo_hasta}}
        inferred_service = propuesta.get("accion_sugerida", {}).get("payload", {}).get("service_type")
        service_type = service_type or inferred_service
        if service_type:
            match["service_type"] = service_type
        if status:
            match["status"] = status
        processing_pipeline = [
            {"$match": match},
            {
                "$project": {
                    "processing_ts": {"$dateFromString": {"dateString": "$tiempos.fechas_estado.processing"}},
                    "ready_ts": {"$dateFromString": {"dateString": "$tiempos.fechas_estado.ready"}}
                }
            },
            {"$match": {"processing_ts": {"$ne": None}, "ready_ts": {"$ne": None}}},
            {
                "$project": {
                    "duration_hours": {
                        "$divide": [{"$subtract": ["$ready_ts", "$processing_ts"]}, 1000 * 60 * 60]
                    }
                }
            },
            {"$group": {"_id": None, "avg_hours": {"$avg": "$duration_hours"}}}
        ]
        processing_stats = await db.orders.aggregate(processing_pipeline).to_list(1)
        avg_processing_hours = processing_stats[0]["avg_hours"] if processing_stats else 0
        errors_pipeline = [
            {"$match": match},
            {"$unwind": "$errores_validacion"},
            {"$group": {"_id": None, "count": {"$sum": 1}}}
        ]
        errors_stats = await db.orders.aggregate(errors_pipeline).to_list(1)
        errors_count = errors_stats[0]["count"] if errors_stats else 0
        orders_count = await db.orders.count_documents(match)
        before = {
            "ordenes": orders_count,
            "avg_processing_horas": round(avg_processing_hours, 2) if avg_processing_hours else 0,
            "errores_validacion": errors_count
        }
        after = dict(before)
        impacto = propuesta.get("impacto_estimado", {})
        tiempo_pct = impacto.get("tiempo_ahorrado_porcentaje")
        errores_pct = impacto.get("errores_reducidos_porcentaje")
        if isinstance(tiempo_pct, (int, float)):
            after["avg_processing_horas"] = round(before["avg_processing_horas"] * (1 - tiempo_pct / 100), 2)
        if isinstance(errores_pct, (int, float)):
            after["errores_validacion"] = max(0, round(before["errores_validacion"] * (1 - errores_pct / 100)))
        service_pipeline = [
            {"$match": match},
            {"$group": {"_id": "$service_type", "count": {"$sum": 1}}}
        ]
        service_stats = await db.orders.aggregate(service_pipeline).to_list(20)
        status_pipeline = [
            {"$match": match},
            {"$group": {"_id": "$status", "count": {"$sum": 1}}}
        ]
        status_stats = await db.orders.aggregate(status_pipeline).to_list(20)
        real_before_start = (now - timedelta(days=real_before_days or 14)).isoformat()
        real_before_end = (now - timedelta(days=real_after_days or 7)).isoformat()
        real_after_start = (now - timedelta(days=real_after_days or 7)).isoformat()
        real_after_end = now.isoformat()
        real_before_match = {"created_at": {"$gte": real_before_start, "$lte": real_before_end}}
        real_after_match = {"created_at": {"$gte": real_after_start, "$lte": real_after_end}}
        if service_type:
            real_before_match["service_type"] = service_type
            real_after_match["service_type"] = service_type
        if status:
            real_before_match["status"] = status
            real_after_match["status"] = status
        real_before_stats = await db.orders.aggregate([
            {"$match": real_before_match},
            {"$unwind": {"path": "$errores_validacion", "preserveNullAndEmptyArrays": True}},
            {
                "$group": {
                    "_id": None,
                    "errores": {"$sum": {"$cond": [{"$ifNull": ["$errores_validacion", False]}, 1, 0]}},
                    "ordenes": {"$addToSet": "$id"}
                }
            }
        ]).to_list(1)
        real_after_stats = await db.orders.aggregate([
            {"$match": real_after_match},
            {"$unwind": {"path": "$errores_validacion", "preserveNullAndEmptyArrays": True}},
            {
                "$group": {
                    "_id": None,
                    "errores": {"$sum": {"$cond": [{"$ifNull": ["$errores_validacion", False]}, 1, 0]}},
                    "ordenes": {"$addToSet": "$id"}
                }
            }
        ]).to_list(1)
        real_before = real_before_stats[0] if real_before_stats else {"errores": 0, "ordenes": []}
        real_after = real_after_stats[0] if real_after_stats else {"errores": 0, "ordenes": []}
        impacto_real = {
            "errores_before": real_before["errores"],
            "errores_after": real_after["errores"],
            "ordenes_before": len(real_before["ordenes"]),
            "ordenes_after": len(real_after["ordenes"])
        }
        return {
            "before": before,
            "after": after,
            "impacto_estimado": impacto,
            "impacto_real": impacto_real,
            "por_servicio": service_stats,
            "por_estado": status_stats,
            "periodo": {"desde": periodo_desde, "hasta": periodo_hasta},
            "filtros": {"service_type": service_type, "status": status}
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
        now = datetime.now(timezone.utc).isoformat()
        estado = "pendiente"
        if accion == "aceptar":
            estado = "aceptada"
        if accion == "rechazar":
            estado = "rechazada"
        if accion == "modificar":
            estado = "modificada"
        await db.propuestas_ia.update_one(
            {"id": propuesta_id},
            {"$set": {"estado": estado, "updated_at": now, "accion": accion, "nota": data.nota}}
        )
        await create_audit_log("PROPUESTA_IA_ACTUALIZADA", "propuesta", propuesta_id, current_user["id"], {"accion": accion})
        return {"ok": True, "estado": estado}

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
            {
                "$project": {
                    "service_type": 1,
                    "processing_ts": {"$dateFromString": {"dateString": "$tiempos.fechas_estado.processing"}},
                    "ready_ts": {"$dateFromString": {"dateString": "$tiempos.fechas_estado.ready"}}
                }
            },
            {"$match": {"processing_ts": {"$ne": None}, "ready_ts": {"$ne": None}}},
            {
                "$project": {
                    "service_type": 1,
                    "duration_hours": {"$divide": [{"$subtract": ["$ready_ts", "$processing_ts"]}, 1000 * 60 * 60]}
                }
            },
            {
                "$group": {
                    "_id": "$service_type",
                    "avg_hours": {"$avg": "$duration_hours"},
                    "max_hours": {"$max": "$duration_hours"},
                    "count": {"$sum": 1}
                }
            }
        ]
        processing_stats = await db.orders.aggregate(processing_pipeline).to_list(50)
        for stat in processing_stats:
            patterns.append({
                "id": str(uuid.uuid4()),
                "tipo": "cuello_botella",
                "detalle": {
                    "estado": "processing",
                    "service_type": stat["_id"],
                    "avg_hours": stat["avg_hours"],
                    "max_hours": stat["max_hours"]
                },
                "query_base": base_match,
                "periodo": {"desde": periodo_desde, "hasta": periodo_hasta},
                "fecha_deteccion": now.isoformat(),
                "impacto_estimado": {"ordenes_afectadas": stat["count"]}
            })
        errors_pipeline = [
            {"$match": base_match},
            {"$unwind": "$errores_validacion"},
            {
                "$group": {
                    "_id": "$errores_validacion.codigo",
                    "count": {"$sum": 1}
                }
            },
            {"$sort": {"count": -1}},
            {"$limit": 10}
        ]
        errors_stats = await db.orders.aggregate(errors_pipeline).to_list(10)
        for stat in errors_stats:
            patterns.append({
                "id": str(uuid.uuid4()),
                "tipo": "error_recurrente",
                "detalle": {"codigo": stat["_id"], "count": stat["count"]},
                "query_base": base_match,
                "periodo": {"desde": periodo_desde, "hasta": periodo_hasta},
                "fecha_deteccion": now.isoformat(),
                "impacto_estimado": {"ordenes_afectadas": stat["count"]}
            })
        stale_threshold = (now - timedelta(hours=48)).isoformat()
        stale_match = {**base_match, "status": {"$in": ["processing", "ready", "out_for_delivery"]}, "created_at": {"$lte": stale_threshold}}
        stale_pipeline = [
            {"$match": stale_match},
            {"$group": {"_id": "$status", "count": {"$sum": 1}}}
        ]
        stale_stats = await db.orders.aggregate(stale_pipeline).to_list(10)
        for stat in stale_stats:
            patterns.append({
                "id": str(uuid.uuid4()),
                "tipo": "desviacion",
                "detalle": {"estado": stat["_id"], "threshold_hours": 48},
                "query_base": stale_match,
                "periodo": {"desde": periodo_desde, "hasta": periodo_hasta},
                "fecha_deteccion": now.isoformat(),
                "impacto_estimado": {"ordenes_afectadas": stat["count"]}
            })
        if patterns:
            await db.patrones_detectados.insert_many(patterns)
        return {"ok": True, "patrones_creados": len(patterns)}

    return router
