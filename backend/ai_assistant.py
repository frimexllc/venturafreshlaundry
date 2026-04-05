"""
AI Business Assistant - Groq-powered intelligent management

CORRECCIONES v2:
  - Token budget diario con contador persistente en memoria (resetea a medianoche)
  - Cache de respuestas con TTL configurable para evitar llamadas idénticas
  - Prompts truncados: briefing 600 tokens max, analyze 800 tokens max
  - Backoff exponencial en 429 con un solo reintento
  - Fallback estático inmediato cuando el budget está agotado
  - Cooldown por tipo de briefing para evitar llamadas en ráfaga
"""
import os
import time
import hashlib
import logging
from datetime import datetime, timezone, timedelta, date
from typing import Optional, Dict, Any, List

from groq import Groq

logger = logging.getLogger(__name__)

GROQ_API_KEY   = os.environ.get("GROQ_API_KEY")
BUSINESS_NAME  = os.environ.get("BUSINESS_NAME", "Ventura Fresh Laundry")

# ─────────────────────────────────────────────────────────────────────────────
# Configuración de rate limiting (todas sobreponibles por env var)
# ─────────────────────────────────────────────────────────────────────────────

# 80 % del límite gratuito de 100 K tokens/día — deja margen para notificaciones
DAILY_TOKEN_BUDGET       = int(os.environ.get("GROQ_DAILY_TOKEN_BUDGET", "80000"))
MAX_BRIEFING_TOKENS      = int(os.environ.get("GROQ_MAX_BRIEFING_TOKENS", "600"))   # respuesta
MAX_ANALYZE_TOKENS       = int(os.environ.get("GROQ_MAX_ANALYZE_TOKENS",  "800"))   # respuesta
RESPONSE_CACHE_TTL       = int(os.environ.get("GROQ_CACHE_TTL",           "300"))   # 5 min
BRIEFING_COOLDOWN_S      = int(os.environ.get("GROQ_BRIEFING_COOLDOWN",   "120"))   # 2 min entre briefings del mismo usuario
MAX_PROMPT_CHARS         = int(os.environ.get("GROQ_MAX_PROMPT_CHARS",    "3000"))  # ~750 tokens estimados


# ─────────────────────────────────────────────────────────────────────────────
# Token Budget Tracker  (singleton en memoria, resetea a medianoche UTC)
# ─────────────────────────────────────────────────────────────────────────────

class _TokenBudget:
    def __init__(self):
        self._used: int = 0
        self._day: date = date.today()

    def _maybe_reset(self):
        today = date.today()
        if today != self._day:
            logger.info(f"Token budget reset. Yesterday used: {self._used} tokens")
            self._used = 0
            self._day = today

    def consume(self, tokens: int) -> None:
        self._maybe_reset()
        self._used += tokens
        logger.debug(f"Token budget: {self._used}/{DAILY_TOKEN_BUDGET} used today")

    def has_budget(self, estimated_tokens: int = 800) -> bool:
        self._maybe_reset()
        return (self._used + estimated_tokens) < DAILY_TOKEN_BUDGET

    @property
    def remaining(self) -> int:
        self._maybe_reset()
        return max(0, DAILY_TOKEN_BUDGET - self._used)

    @property
    def used(self) -> int:
        self._maybe_reset()
        return self._used


_budget = _TokenBudget()


# ─────────────────────────────────────────────────────────────────────────────
# Response Cache  (evita llamadas idénticas dentro del TTL)
# ─────────────────────────────────────────────────────────────────────────────

class _ResponseCache:
    def __init__(self):
        self._store: Dict[str, Dict] = {}

    def _key(self, *parts) -> str:
        return hashlib.md5("|".join(str(p) for p in parts).encode()).hexdigest()

    def get(self, *key_parts) -> Optional[str]:
        k = self._key(*key_parts)
        entry = self._store.get(k)
        if entry and (time.monotonic() - entry["ts"]) < RESPONSE_CACHE_TTL:
            logger.debug(f"Cache HIT for key {k[:8]}")
            return entry["value"]
        return None

    def set(self, value: str, *key_parts) -> None:
        k = self._key(*key_parts)
        self._store[k] = {"value": value, "ts": time.monotonic()}

    def invalidate_expired(self):
        now = time.monotonic()
        expired = [k for k, v in self._store.items()
                   if (now - v["ts"]) >= RESPONSE_CACHE_TTL]
        for k in expired:
            del self._store[k]


_cache = _ResponseCache()


# ─────────────────────────────────────────────────────────────────────────────
# Cooldown por usuario/evento  (evita ráfagas de briefings)
# ─────────────────────────────────────────────────────────────────────────────

_last_call: Dict[str, float] = {}   # key -> monotonic timestamp


def _is_in_cooldown(cooldown_key: str, cooldown_s: int = BRIEFING_COOLDOWN_S) -> bool:
    last = _last_call.get(cooldown_key, 0.0)
    return (time.monotonic() - last) < cooldown_s


def _mark_called(cooldown_key: str) -> None:
    _last_call[cooldown_key] = time.monotonic()


# ─────────────────────────────────────────────────────────────────────────────
# Groq client helper con backoff en 429
# ─────────────────────────────────────────────────────────────────────────────

def get_groq_client() -> Optional[Groq]:
    if not GROQ_API_KEY:
        return None
    return Groq(api_key=GROQ_API_KEY)


def _groq_call(client: Groq, messages: list, max_tokens: int,
               temperature: float = 0.7) -> Optional[str]:
    """
    Llama a Groq con un reintento en caso de 429.
    Consume el budget automáticamente.
    Retorna None si falla o el budget está agotado.
    """
    # Estimación conservadora: prompt ~400 tokens + respuesta
    estimated = max_tokens + 400
    if not _budget.has_budget(estimated):
        logger.warning(
            f"Groq daily token budget exhausted "
            f"({_budget.used}/{DAILY_TOKEN_BUDGET}). Using fallback."
        )
        return None

    for attempt in range(2):   # máximo 2 intentos (original + 1 reintento)
        try:
            response = client.chat.completions.create(
                messages=messages,
                model="llama-3.3-70b-versatile",
                temperature=temperature,
                max_tokens=max_tokens,
            )
            text = response.choices[0].message.content.strip()

            # Consumir tokens reales reportados por la API
            usage = getattr(response, "usage", None)
            if usage:
                _budget.consume(
                    getattr(usage, "total_tokens", estimated)
                )
            else:
                _budget.consume(estimated)

            return text

        except Exception as e:
            err_str = str(e)
            # Detectar 429 y extraer el tiempo de espera sugerido
            if "429" in err_str or "rate_limit_exceeded" in err_str:
                if attempt == 0:
                    # Intentar leer el retry-after del mensaje de error
                    wait_s = 15  # default conservador
                    import re
                    m = re.search(r"try again in\s+([\d.]+)s", err_str)
                    if m:
                        wait_s = min(float(m.group(1)), 60)
                    elif "min" in err_str:
                        # "18m51.84s" → demasiado largo, no esperamos
                        logger.warning(
                            f"Groq 429 with long retry window. "
                            f"Skipping retry. Budget remaining: {_budget.remaining}"
                        )
                        return None
                    logger.warning(
                        f"Groq 429 on attempt {attempt+1}. "
                        f"Waiting {wait_s}s before retry."
                    )
                    import asyncio, threading
                    # En contexto síncrono, usar time.sleep
                    try:
                        loop = asyncio.get_running_loop()
                        # Estamos en async — no bloqueamos el event loop
                        # simplemente retornamos None (ya se manejará con fallback)
                        logger.warning("Groq 429 in async context — returning None immediately")
                        return None
                    except RuntimeError:
                        time.sleep(wait_s)
                else:
                    logger.error(f"Groq 429 persists after retry: {err_str[:200]}")
                    return None
            else:
                logger.error(f"Groq API error: {err_str[:300]}")
                return None

    return None


def _truncate_prompt(text: str, max_chars: int = MAX_PROMPT_CHARS) -> str:
    """Trunca el prompt preservando el inicio (más relevante) y añade aviso."""
    if len(text) <= max_chars:
        return text
    truncated = text[:max_chars]
    return truncated + "\n\n[Context truncated to fit token limit]"


# ─────────────────────────────────────────────────────────────────────────────
# Fallbacks estáticos (se usan cuando Groq no está disponible o sin budget)
# ─────────────────────────────────────────────────────────────────────────────

def _briefing_fallback(user_name: str, data: Dict, now: datetime) -> str:
    hour = now.hour
    greeting = "Buenos días" if hour < 12 else ("Buenas tardes" if hour < 19 else "Buenas noches")
    urgent = []
    if data.get("tickets_high_priority", 0) > 0:
        urgent.append(f"⚠️ {data['tickets_high_priority']} tickets de alta prioridad")
    if data.get("orders_pending_payment", 0) > 0:
        urgent.append(f"💰 ${data.get('pending_revenue', 0):.2f} en pagos pendientes")
    if data.get("orders_new", 0) > 0:
        urgent.append(f"📦 {data['orders_new']} órdenes nuevas esperando")
    urgent_block = "\n".join(urgent) if urgent else "✅ Sin alertas urgentes"
    return (
        f"{greeting}, {user_name}!\n\n"
        f"📊 **Resumen rápido:**\n"
        f"- {data.get('orders_today', 0)} órdenes hoy\n"
        f"- {data.get('orders_ready', 0)} listas para entrega\n"
        f"- {data.get('orders_out_delivery', 0)} en camino\n"
        f"- {data.get('total_customers', 0)} clientes ({data.get('active_members', 0)} miembros)\n\n"
        f"🚨 **Prioritario:**\n{urgent_block}\n\n"
        f"_(Resumen generado sin IA — budget diario agotado o IA no disponible)_"
    )


def _analyze_fallback(query: str) -> str:
    return (
        "El asistente de IA no está disponible en este momento "
        "(límite diario de tokens alcanzado o servicio no configurado). "
        "Por favor intenta de nuevo más tarde o revisa los datos directamente en el panel."
    )


# ─────────────────────────────────────────────────────────────────────────────
# generate_daily_briefing — CORREGIDO
# ─────────────────────────────────────────────────────────────────────────────

async def generate_daily_briefing(db, user_role: str, user_name: str) -> Dict[str, Any]:
    """
    Genera el briefing diario con protección contra rate limiting.

    Mejoras respecto a la versión original:
    - Cooldown de 2 min por usuario: evita múltiples llamadas en reconexiones
    - Cache de 5 min: el mismo usuario recibe la respuesta cacheada
    - Prompt compacto: ~400 tokens en lugar de ~800
    - max_tokens reducido a 600 en lugar de 1500 (ahorro de 60 %)
    - Fallback estático inmediato si no hay budget
    """
    now = datetime.now(timezone.utc)

    # ── Cooldown por usuario ───────────────────────────────────────────────
    cooldown_key = f"briefing:{user_name}:{user_role}"
    if _is_in_cooldown(cooldown_key):
        remaining_s = BRIEFING_COOLDOWN_S - (time.monotonic() - _last_call.get(cooldown_key, 0))
        logger.info(f"Briefing cooldown active for {user_name} ({remaining_s:.0f}s remaining)")
        # Si hay algo en cache, devolverlo
        cached = _cache.get("briefing", user_name, user_role)
        if cached:
            return {
                "briefing": cached,
                "data": {},
                "generated_at": now.isoformat(),
                "user_role": user_role,
                "from_cache": True,
            }

    # ── Recopilar datos del negocio ────────────────────────────────────────
    data = {}
    all_orders = await db.orders.find({}, {"_id": 0}).to_list(1000)
    today_str = now.strftime("%Y-%m-%d")

    data["orders_today"]           = sum(1 for o in all_orders if (o.get("created_at") or "")[:10] == today_str)
    data["orders_new"]             = sum(1 for o in all_orders if (o.get("status") or "").lower() == "new")
    data["orders_processing"]      = sum(1 for o in all_orders if (o.get("status") or "").lower() == "processing")
    data["orders_ready"]           = sum(1 for o in all_orders if (o.get("status") or "").lower() == "ready")
    data["orders_out_delivery"]    = sum(1 for o in all_orders if (o.get("status") or "").lower() in ["out_for_delivery", "out for delivery"])
    data["orders_pending_payment"] = sum(1 for o in all_orders if (o.get("payment_status") or "").lower() != "paid")
    paid = [o for o in all_orders if (o.get("payment_status") or "").lower() == "paid"]
    data["total_revenue"]          = sum(float(o.get("total_amount") or 0) for o in paid)
    data["pending_revenue"]        = sum(float(o.get("total_amount") or 0) for o in all_orders if (o.get("payment_status") or "").lower() != "paid")

    customers = await db.customers.find({}, {"_id": 0, "membership_status": 1}).to_list(1000)
    data["total_customers"]  = len(customers)
    data["active_members"]   = sum(1 for c in customers if c.get("membership_status") == "active")

    tickets = await db.tickets.find({}, {"_id": 0, "status": 1, "priority": 1}).to_list(500)
    data["tickets_open"]          = sum(1 for t in tickets if (t.get("status") or "").lower() in ["open", "new", "pending"])
    data["tickets_high_priority"] = sum(1 for t in tickets if (t.get("priority") or "").lower() == "high" and (t.get("status") or "").lower() != "closed")

    signups = await db.membership_signups.find({"status": "pending"}, {"_id": 0}).to_list(100)
    data["signups_pending"] = len(signups)

    quotes = await db.quotes.find({}, {"_id": 0, "status": 1}).to_list(200)
    data["quotes_pending"] = sum(1 for q in quotes if (q.get("status") or "").lower() in ["new", "pending", "sent"])

    leads = await db.leads.find({"status": "new"}, {"_id": 0}).to_list(200)
    data["leads_new"] = len(leads)

    # ── Intentar respuesta cacheada ────────────────────────────────────────
    # La clave incluye un snapshot de los números principales para que el
    # cache se invalide si cambian los datos significativamente
    cache_signature = (
        data["orders_new"], data["orders_ready"],
        data["orders_pending_payment"], data["tickets_high_priority"]
    )
    cached = _cache.get("briefing", user_name, user_role, *cache_signature)
    if cached:
        logger.info(f"Returning cached briefing for {user_name}")
        return {
            "briefing": cached,
            "data": data,
            "generated_at": now.isoformat(),
            "user_role": user_role,
            "from_cache": True,
        }

    # ── Intentar llamada a Groq ────────────────────────────────────────────
    client = get_groq_client()
    if not client or not _budget.has_budget(MAX_BRIEFING_TOKENS + 400):
        briefing_text = _briefing_fallback(user_name, data, now)
        return {
            "briefing": briefing_text,
            "data": data,
            "generated_at": now.isoformat(),
            "user_role": user_role,
            "from_cache": False,
            "fallback": True,
        }

    role_ctx = "administrador con acceso completo" if user_role == "admin" else "operador enfocado en operaciones diarias"

    # Prompt compacto — ~350 tokens en lugar de ~800
    prompt = _truncate_prompt(
        f"Eres el asistente de {BUSINESS_NAME}. "
        f"Usuario: {user_name} ({role_ctx}). "
        f"Hora: {now.strftime('%A %d/%m/%Y %H:%M')} UTC.\n\n"
        f"DATOS:\n"
        f"Hoy: {data['orders_today']} órdenes | Nuevas: {data['orders_new']} | "
        f"Proceso: {data['orders_processing']} | Listas: {data['orders_ready']} | "
        f"En camino: {data['orders_out_delivery']}\n"
        f"Pagos pendientes: {data['orders_pending_payment']} (${data['pending_revenue']:.0f}) | "
        f"Ingresos cobrados: ${data['total_revenue']:.0f}\n"
        f"Clientes: {data['total_customers']} ({data['active_members']} miembros)\n"
        f"Tickets abiertos: {data['tickets_open']} ({data['tickets_high_priority']} alta prioridad)\n"
        f"Cotizaciones pendientes: {data['quotes_pending']} | Leads nuevos: {data['leads_new']} | "
        f"Membresías pendientes: {data['signups_pending']}\n\n"
        f"Genera un briefing breve (máx 3 párrafos): saludo, prioridades urgentes, recomendación. "
        f"En español. Formato Markdown simple."
    )

    _mark_called(cooldown_key)
    briefing_text = _groq_call(
        client,
        messages=[{"role": "user", "content": prompt}],
        max_tokens=MAX_BRIEFING_TOKENS,
        temperature=0.6,
    )

    if not briefing_text:
        briefing_text = _briefing_fallback(user_name, data, now)
        fallback = True
    else:
        _cache.set(briefing_text, "briefing", user_name, user_role, *cache_signature)
        fallback = False

    return {
        "briefing": briefing_text,
        "data": data,
        "generated_at": now.isoformat(),
        "user_role": user_role,
        "from_cache": False,
        "fallback": fallback,
    }


# ─────────────────────────────────────────────────────────────────────────────
# ai_analyze_business — CORREGIDO
# ─────────────────────────────────────────────────────────────────────────────

async def ai_analyze_business(db, query: str, user_role: str) -> Dict[str, Any]:
    """
    Responde consultas del usuario con datos del negocio.

    Mejoras:
    - Cache por query (evita recalcular la misma pregunta)
    - Contexto de datos truncado a MAX_PROMPT_CHARS
    - max_tokens reducido a 800 en lugar de 2000 (ahorro de 60 %)
    - Fallback descriptivo si no hay budget
    """
    now = datetime.now(timezone.utc)

    # Cache por query + role (la misma pregunta en 5 min devuelve lo mismo)
    cached = _cache.get("analyze", query.strip().lower(), user_role)
    if cached:
        logger.info(f"Returning cached analysis for query: {query[:50]}")
        return {"response": cached, "generated_at": now.isoformat(), "from_cache": True}

    client = get_groq_client()
    if not client or not _budget.has_budget(MAX_ANALYZE_TOKENS + 400):
        return {"error": _analyze_fallback(query), "generated_at": now.isoformat()}

    # Recopilar datos — solo los más recientes para reducir tokens
    orders    = await db.orders.find({}, {"_id": 0}).sort("created_at", -1).to_list(50)
    customers = await db.customers.find({}, {"_id": 0, "membership_status": 1}).to_list(200)
    quotes    = await db.quotes.find({}, {"_id": 0}).sort("created_at", -1).to_list(30)
    leads     = await db.leads.find({"status": "new"}, {"_id": 0}).to_list(20)
    tickets   = await db.tickets.find({"status": {"$nin": ["closed", "resolved"]}}, {"_id": 0}).to_list(20)
    services  = await db.services.find({"is_active": True}, {"_id": 0}).to_list(20)

    # Construir contexto compacto
    context = _truncate_prompt(
        f"NEGOCIO: {BUSINESS_NAME} | ROL: {user_role} | HORA: {now.strftime('%Y-%m-%d %H:%M')} UTC\n\n"
        f"ÓRDENES RECIENTES:\n{format_orders_for_ai(orders[:15])}\n\n"
        f"CLIENTES: {len(customers)} total, {sum(1 for c in customers if c.get('membership_status') == 'active')} miembros\n\n"
        f"COTIZACIONES PENDIENTES:\n{format_quotes_for_ai([q for q in quotes if (q.get('status') or '').lower() in ['new', 'pending', 'sent']][:8])}\n\n"
        f"LEADS NUEVOS:\n{format_leads_for_ai(leads[:8])}\n\n"
        f"TICKETS ABIERTOS:\n{format_tickets_for_ai(tickets[:8])}\n\n"
        f"SERVICIOS ACTIVOS:\n{format_services_for_ai(services)}"
    )

    system_prompt = (
        f"Eres el asistente de negocio de {BUSINESS_NAME}. "
        f"Responde de forma concisa y accionable. "
        f"Para ejecutar acciones, incluye un bloque JSON:\n"
        '```json\n{"action": "tipo", "params": {...}}\n```\n'
        "Acciones disponibles: update_order_status, update_order_lbs, "
        "update_payment_status, update_quote_status, update_lead_status, update_ticket_status."
    )

    result = _groq_call(
        client,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user",   "content": f"{context}\n\nPREGUNTA: {query}"},
        ],
        max_tokens=MAX_ANALYZE_TOKENS,
        temperature=0.5,
    )

    if not result:
        return {"error": _analyze_fallback(query), "generated_at": now.isoformat()}

    _cache.set(result, "analyze", query.strip().lower(), user_role)
    return {"response": result, "generated_at": now.isoformat(), "from_cache": False}


# ─────────────────────────────────────────────────────────────────────────────
# ai_suggest_actions — sin cambios en lógica, añade guard de budget
# ─────────────────────────────────────────────────────────────────────────────

async def ai_suggest_actions(db, context_type: str) -> List[Dict[str, Any]]:
    """
    Genera sugerencias de acciones basadas en el estado actual.
    No llama a Groq — solo análisis local, sin consumo de tokens.
    """
    suggestions = []
    now = datetime.now(timezone.utc)

    orders = await db.orders.find({}, {"_id": 0}).to_list(500)

    # Órdenes atascadas en processing > 2 días
    for order in orders:
        if (order.get("status") or "").lower() == "processing":
            created = order.get("created_at") or ""
            if created:
                try:
                    created_date = datetime.fromisoformat(created.replace("Z", "+00:00"))
                    days_stuck = (now - created_date).days
                    if days_stuck >= 2:
                        order_id = order.get("id") or ""
                        suggestions.append({
                            "type":        "warning",
                            "title":       f"Orden {order.get('order_number', order_id[:8])} atascada en proceso",
                            "description": f"Lleva {days_stuck} días en procesamiento",
                            "action":      {"type": "update_order_status", "order_id": order_id, "suggested_status": "ready"},
                            "priority":    "high",
                        })
                except Exception:
                    pass

    # Muchas órdenes listas sin entregar
    ready_orders = [o for o in orders if (o.get("status") or "").lower() == "ready"]
    if len(ready_orders) > 3:
        suggestions.append({
            "type":        "info",
            "title":       f"{len(ready_orders)} órdenes listas para entrega",
            "description": "Considera programar entregas para limpiar la cola",
            "action":      None,
            "priority":    "medium",
        })

    # Pagos pendientes en órdenes completadas
    pending_payment = [
        o for o in orders
        if (o.get("payment_status") or "").lower() != "paid"
        and (o.get("status") or "").lower() == "completed"
    ]
    if pending_payment:
        total = sum(float(o.get("total_amount") or 0) for o in pending_payment)
        suggestions.append({
            "type":        "revenue",
            "title":       f"${total:.2f} en pagos pendientes",
            "description": f"{len(pending_payment)} órdenes completadas sin cobrar",
            "action":      None,
            "priority":    "high",
        })

    # Tickets de alta prioridad
    tickets = await db.tickets.find(
        {"status": {"$in": ["open", "new"]}, "priority": "high"}, {"_id": 0}
    ).to_list(100)
    if tickets:
        suggestions.append({
            "type":        "urgent",
            "title":       f"{len(tickets)} tickets de alta prioridad",
            "description": "Problemas de clientes que requieren atención inmediata",
            "action":      None,
            "priority":    "critical",
        })

    return suggestions[:10]


# ─────────────────────────────────────────────────────────────────────────────
# Budget status endpoint helper (exponer en el API para monitoreo)
# ─────────────────────────────────────────────────────────────────────────────

def get_budget_status() -> Dict[str, Any]:
    """Retorna el estado actual del budget de tokens para monitoreo."""
    return {
        "used_today":       _budget.used,
        "daily_budget":     DAILY_TOKEN_BUDGET,
        "remaining":        _budget.remaining,
        "pct_used":         round((_budget.used / DAILY_TOKEN_BUDGET) * 100, 1),
        "reset_day":        _budget._day.isoformat(),
        "cache_entries":    len(_cache._store),
        "cache_ttl_s":      RESPONSE_CACHE_TTL,
        "briefing_cooldown_s": BRIEFING_COOLDOWN_S,
    }


# ─────────────────────────────────────────────────────────────────────────────
# Helpers de formato — sin cambios de lógica
# ─────────────────────────────────────────────────────────────────────────────

def format_orders_for_ai(orders: List[Dict]) -> str:
    if not orders:
        return "Sin órdenes recientes"
    lines = []
    for o in orders[:15]:
        amount     = float(o.get("total_amount") or 0)
        order_num  = o.get("order_number") or (o.get("id", "")[:8] if o.get("id") else "N/A")
        lines.append(
            f"- {order_num}: {o.get('status', 'unknown')} | "
            f"Pago: {o.get('payment_status', 'pending')} | "
            f"${amount:.2f} | Cliente: {o.get('customer_name', 'N/A')}"
        )
    return "\n".join(lines)


def format_quotes_for_ai(quotes: List[Dict]) -> str:
    if not quotes:
        return "Sin cotizaciones pendientes"
    return "\n".join(
        f"- {q.get('quote_number', q.get('id', '')[:8])}: "
        f"{q.get('company_name', 'N/A')} | "
        f"Estado: {q.get('status', 'new')} | "
        f"Est: {q.get('estimated_lbs_per_week', 'N/A')} lbs/sem"
        for q in quotes[:8]
    )


def format_leads_for_ai(leads: List[Dict]) -> str:
    if not leads:
        return "Sin leads nuevos"
    return "\n".join(
        f"- {l.get('name', 'N/A')}: {l.get('email', 'sin email')} | "
        f"Fuente: {l.get('source', 'desconocida')} | "
        f"Estado: {l.get('status', 'new')}"
        for l in leads[:8]
    )


def format_tickets_for_ai(tickets: List[Dict]) -> str:
    if not tickets:
        return "Sin tickets abiertos"
    return "\n".join(
        f"- #{t.get('ticket_number', t.get('id', '')[:8])}: "
        f"{(t.get('subject') or 'Sin asunto')[:50]} | "
        f"Prioridad: {t.get('priority', 'normal')} | "
        f"Estado: {t.get('status', 'open')}"
        for t in tickets[:8]
    )


def format_services_for_ai(services: List[Dict]) -> str:
    if not services:
        return "Sin servicios configurados"
    lines = [
        f"- {s.get('name', 'N/A')}: ${float(s.get('price', 0)):.2f} {s.get('price_unit', '')}"
        for s in services
        if s.get("is_active")
    ]
    return "\n".join(lines) if lines else "Sin servicios activos"