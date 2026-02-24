from fastapi import APIRouter, HTTPException, Request, Response, Depends
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone
import html
import os

BUSINESS_NAME = os.environ.get("BUSINESS_NAME", "Ventura Fresh Laundromat")


def sanitize_voice_text(text: str) -> str:
    if not text:
        return ""
    cleaned = text.strip()
    if (cleaned.startswith(""") and cleaned.endswith(""")) or (cleaned.startswith("'") and cleaned.endswith("'")):
        cleaned = cleaned[1:-1].strip()
    return cleaned


class VoiceOutboundRequest(BaseModel):
    to_phone: Optional[str] = None
    order_id: Optional[str] = None
    message: Optional[str] = None
    language: Optional[str] = None


def get_voice_router(
    db,
    require_admin,
    get_current_user,
    build_notification_content,
    send_voice_call,
    detect_language,
    generate_ai_message,
    normalize_phone,
    create_audit_log
):
    router = APIRouter()

    @router.post("/voice/outbound")
    async def voice_outbound_call(data: VoiceOutboundRequest, current_user: dict = Depends(get_current_user)):
        require_admin(current_user)

        to_phone = data.to_phone
        message = data.message
        language = data.language or "es-MX"
        order = None
        customer = None

        if data.order_id:
            order = await db.orders.find_one({"id": data.order_id}, {"_id": 0})
            if not order:
                raise HTTPException(status_code=404, detail="Order not found")
            if order.get("customer_id"):
                customer = await db.customers.find_one({"id": order.get("customer_id")}, {"_id": 0})
            to_phone = to_phone or (customer.get("phone") if customer else None)
            if customer:
                content = await build_notification_content(customer, order, "status_changed", order.get("status"))
                message = message or content.get("message")
                language = data.language or content.get("language") or language

        if not to_phone:
            raise HTTPException(status_code=400, detail="Missing destination phone")
        if not message:
            message = "Gracias por contactar Ventura Fresh Laundry. Un agente se comunicará contigo pronto."

        success = await send_voice_call(to_phone, message, language)
        await create_audit_log("VOICE_OUTBOUND", "order", order.get("id") if order else None, current_user["id"], {
            "to": to_phone,
            "order_id": order.get("id") if order else None
        })
        return {"ok": success, "to": to_phone}

    @router.post("/voice/inbound", name="voice_inbound")
    async def voice_inbound(request: Request):
        form = await request.form()
        from_number = form.get("From")
        customer = None
        if from_number:
            normalized = normalize_phone(from_number) or from_number
            digits = "".join([c for c in from_number if c.isdigit()])
            query = {"$or": [{"phone": normalized}, {"phone": from_number}]}
            if digits:
                query["$or"].append({"phone": {"$regex": digits[-10:]}})
            customer = await db.customers.find_one(query, {"_id": 0})

        language = detect_language(customer or {}, from_number or "")
        greeting_context = {
            "event": "voice_inbound",
            "customer_name": customer.get("name") if customer else None,
            "business_name": BUSINESS_NAME
        }
        greeting = generate_ai_message(greeting_context, language, "voice")
        if not greeting:
            greeting = "Gracias por llamar a Ventura Fresh Laundry. ¿En qué podemos ayudarte?"

        host = request.headers.get("x-forwarded-host") or request.headers.get("host")
        proto = request.headers.get("x-forwarded-proto") or "https"
        base_url = f"{proto}://{host}" if host else str(request.base_url).rstrip("/")
        gather_url = f"{base_url}/api/voice/gather"
        voice_language = "es-MX" if str(language).lower().startswith("es") else "en-US"
        greeting_text = html.escape(sanitize_voice_text(greeting))
        fallback_text = "No recibí respuesta. Puedes llamarnos de nuevo cuando gustes." if voice_language == "es-MX" else "We did not receive a response. Please call again anytime."

        twiml = f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" action="{gather_url}" method="POST" language="{voice_language}" timeout="6">
    <Say language="{voice_language}" voice="alice">{greeting_text}</Say>
  </Gather>
  <Say language="{voice_language}" voice="alice">{fallback_text}</Say>
</Response>"""
        return Response(content=twiml, media_type="text/xml")

    @router.post("/voice/gather", name="voice_gather")
    async def voice_gather(request: Request):
        form = await request.form()
        speech = form.get("SpeechResult") or ""
        from_number = form.get("From")
        customer = None
        if from_number:
            normalized = normalize_phone(from_number) or from_number
            digits = "".join([c for c in from_number if c.isdigit()])
            query = {"$or": [{"phone": normalized}, {"phone": from_number}]}
            if digits:
                query["$or"].append({"phone": {"$regex": digits[-10:]}})
            customer = await db.customers.find_one(query, {"_id": 0})

        language = detect_language(customer or {}, from_number or "")
        voice_language = "es-MX" if str(language).lower().startswith("es") else "en-US"

        if speech:
            response_context = {
                "event": "voice_followup",
                "customer_name": customer.get("name") if customer else None,
                "business_name": BUSINESS_NAME,
                "request": speech
            }
            reply = generate_ai_message(response_context, language, "voice")
        else:
            reply = None

        if not reply:
            reply = "Gracias por tu llamada. Un agente se comunicará contigo pronto." if voice_language == "es-MX" else "Thanks for calling. A team member will reach out soon."

        reply_text = html.escape(sanitize_voice_text(reply))
        twiml = f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="{voice_language}" voice="alice">{reply_text}</Say>
</Response>"""
        return Response(content=twiml, media_type="text/xml")

    return router
