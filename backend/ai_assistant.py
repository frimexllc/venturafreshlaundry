"""
AI Business Assistant - Groq-powered intelligent management

CORRECCIONES v3 (2025):
  - Zona horaria Pacific Time (America/Los_Angeles)
  - Respuestas en inglés forzadas (prompt, system, fallback)
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
from zoneinfo import ZoneInfo
from typing import Optional, Dict, Any, List

from groq import Groq

logger = logging.getLogger(__name__)

GROQ_API_KEY   = os.environ.get("GROQ_API_KEY")
BUSINESS_NAME  = os.environ.get("BUSINESS_NAME", "Ventura Fresh Laundry")

# Zona horaria de Pacific Time (Ventura, California)
PT = ZoneInfo("America/Los_Angeles")

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
        return hashlib.sha256("|".join(str(p) for p in parts).encode()).hexdigest()

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


def _parse_rate_limit_wait(err_str: str) -> Optional[float]:
    """Extract wait time from Groq 429 error message. Returns None if too long."""
    import re
    m = re.search(r"try again in\s+([\d.]+)s", err_str)
    if m:
        return min(float(m.group(1)), 60)
    if "min" in err_str:
        return None  # Too long to wait
    return 15  # Conservative default


def _groq_call(client: Groq, messages: list, max_tokens: int,
               temperature: float = 0.7) -> Optional[str]:
    """
    Call Groq with a single retry on 429. Returns None on failure.
    """
    estimated = max_tokens + 400
    if not _budget.has_budget(estimated):
        logger.warning(f"Groq daily token budget exhausted ({_budget.used}/{DAILY_TOKEN_BUDGET})")
        return None

    for attempt in range(2):
        try:
            response = client.chat.completions.create(
                messages=messages, model="llama-3.3-70b-versatile",
                temperature=temperature, max_tokens=max_tokens,
            )
            text = response.choices[0].message.content.strip()
            usage = getattr(response, "usage", None)
            _budget.consume(getattr(usage, "total_tokens", estimated) if usage else estimated)
            return text

        except Exception as e:
            err_str = str(e)
            if ("429" in err_str or "rate_limit_exceeded" in err_str) and attempt == 0:
                wait_s = _parse_rate_limit_wait(err_str)
                if wait_s is None:
                    logger.warning("Groq 429 with long retry window — skipping")
                    return None
                logger.warning(f"Groq 429 — waiting {wait_s}s before retry")
                try:
                    import asyncio
                    asyncio.get_running_loop()
                    return None  # Don't block async event loop
                except RuntimeError:
                    time.sleep(wait_s)
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
# Fallbacks estáticos en INGLÉS (se usan cuando Groq no está disponible o sin budget)
# ─────────────────────────────────────────────────────────────────────────────

def _briefing_fallback(user_name: str, data: Dict, now: datetime) -> str:
    # Ahora la hora está en Pacific Time, formatearla para display
    now_pt = now.astimezone(PT)
    time_str = now_pt.strftime("%I:%M %p %Z")
    greeting = "Good morning" if now_pt.hour < 12 else ("Good afternoon" if now_pt.hour < 18 else "Good evening")
    urgent = []
    if data.get("tickets_high_priority", 0) > 0:
        urgent.append(f"⚠️ {data['tickets_high_priority']} high-priority tickets")
    if data.get("orders_pending_payment", 0) > 0:
        urgent.append(f"💰 ${data.get('pending_revenue', 0):.2f} pending payments")
    if data.get("orders_new", 0) > 0:
        urgent.append(f"📦 {data['orders_new']} new orders awaiting")
    urgent_block = "\n".join(urgent) if urgent else "✅ No urgent alerts"
    return (
        f"{greeting}, {user_name}! ({time_str})\n\n"
        f"📊 **Quick Summary:**\n"
        f"- {data.get('orders_today', 0)} orders today\n"
        f"- {data.get('orders_ready', 0)} ready for delivery\n"
        f"- {data.get('orders_out_delivery', 0)} out for delivery\n"
        f"- {data.get('total_customers', 0)} customers ({data.get('active_members', 0)} members)\n\n"
        f"🚨 **Priority:**\n{urgent_block}\n\n"
        f"_(Fallback summary — daily token limit reached or AI unavailable)_"
    )


def _analyze_fallback(query: str) -> str:
    return (
        "The AI assistant is currently unavailable (daily token limit reached or service not configured). "
        "Please try again later or review data directly in the dashboard."
    )


# ─────────────────────────────────────────────────────────────────────────────
# generate_daily_briefing — CORREGIDO (Pacific Time + English)
# ─────────────────────────────────────────────────────────────────────────────

async def _collect_briefing_data(db) -> Dict[str, Any]:
    """Collect business metrics for the daily briefing (using Pacific Time for 'today')."""
    now_pt = datetime.now(PT)
    today_str = now_pt.strftime("%Y-%m-%d")
    data = {}

    all_orders = await db.orders.find({}, {"_id": 0}).to_list(1000)
    # Convertir created_at a Pacific Time para comparar fechas correctamente
    def is_today(created_str):
        if not created_str:
            return False
        try:
            dt = datetime.fromisoformat(created_str.replace("Z", "+00:00"))
            dt_pt = dt.astimezone(PT)
            return dt_pt.strftime("%Y-%m-%d") == today_str
        except:
            return False

    data["orders_today"]           = sum(1 for o in all_orders if is_today(o.get("created_at")))
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

    return data


def _build_briefing_prompt(user_name: str, user_role: str, data: Dict, now: datetime) -> str:
    """Build the compact LLM prompt for the daily briefing (English)."""
    now_pt = now.astimezone(PT)
    time_str = now_pt.strftime("%Y-%m-%d %I:%M %p %Z")
    role_ctx = "admin with full access" if user_role == "admin" else "operator focused on daily operations"
    return _truncate_prompt(
        f"You are the AI business assistant for {BUSINESS_NAME}. "
        f"User: {user_name} ({role_ctx}). "
        f"Current Pacific Time: {time_str}\n\n"
        f"REAL-TIME DATA:\n"
        f"Today: {data['orders_today']} orders | New: {data['orders_new']} | "
        f"In process: {data['orders_processing']} | Ready: {data['orders_ready']} | "
        f"Out for delivery: {data['orders_out_delivery']}\n"
        f"Pending payments: {data['orders_pending_payment']} orders (${data['pending_revenue']:.0f}) | "
        f"Collected revenue this month: ${data['total_revenue']:.0f}\n"
        f"Customers: {data['total_customers']} ({data['active_members']} members)\n"
        f"Open tickets: {data['tickets_open']} ({data['tickets_high_priority']} high priority)\n"
        f"Pending quotes: {data['quotes_pending']} | New leads: {data['leads_new']} | "
        f"Pending memberships: {data['signups_pending']}\n\n"
        f"Write a concise executive briefing in English (max 3 short paragraphs): "
        f"greeting, summary of today's activity, urgent priorities, and a recommendation. "
        f"Use natural language, no markdown. Keep it under 200 words."
    )


async def generate_daily_briefing(db, user_role: str, user_name: str) -> Dict[str, Any]:
    """
    Generates the daily briefing in English, using Pacific Timezone.
    Includes cooldown (2 min), cache (5 min), and static fallback.
    """
    now = datetime.now(PT)  # Base time in Pacific for all calculations

    # ── Cooldown por usuario ───────────────────────────────────────────────
    cooldown_key = f"briefing:{user_name}:{user_role}"
    if _is_in_cooldown(cooldown_key):
        cached = _cache.get("briefing", user_name, user_role)
        if cached:
            return {"briefing": cached, "data": {}, "generated_at": now.isoformat(), "user_role": user_role, "from_cache": True}

    # ── Recopilar datos ────────────────────────────────────────────────────
    data = await _collect_briefing_data(db)

    # ── Cache check ────────────────────────────────────────────────────────
    cache_sig = (data["orders_new"], data["orders_ready"], data["orders_pending_payment"], data["tickets_high_priority"])
    cached = _cache.get("briefing", user_name, user_role, *cache_sig)
    if cached:
        return {"briefing": cached, "data": data, "generated_at": now.isoformat(), "user_role": user_role, "from_cache": True}

    # ── LLM call (or fallback) ─────────────────────────────────────────────
    client = get_groq_client()
    if not client or not _budget.has_budget(MAX_BRIEFING_TOKENS + 400):
        return {"briefing": _briefing_fallback(user_name, data, now), "data": data, "generated_at": now.isoformat(), "user_role": user_role, "from_cache": False, "fallback": True}

    _mark_called(cooldown_key)
    prompt = _build_briefing_prompt(user_name, user_role, data, now)
    briefing_text = _groq_call(client, messages=[{"role": "user", "content": prompt}], max_tokens=MAX_BRIEFING_TOKENS, temperature=0.6)

    if not briefing_text:
        return {"briefing": _briefing_fallback(user_name, data, now), "data": data, "generated_at": now.isoformat(), "user_role": user_role, "from_cache": False, "fallback": True}

    _cache.set(briefing_text, "briefing", user_name, user_role, *cache_sig)
    return {"briefing": briefing_text, "data": data, "generated_at": now.isoformat(), "user_role": user_role, "from_cache": False, "fallback": False}


# ─────────────────────────────────────────────────────────────────────────────
# ai_analyze_business — CORREGIDO (inglés opcional, se puede dejar español o inglés)
# ─────────────────────────────────────────────────────────────────────────────

async def ai_analyze_business(db, query: str, user_role: str) -> Dict[str, Any]:
    """
    Responde consultas del usuario con datos del negocio.
    (Se mantiene en español o se puede cambiar a inglés; no es el briefing principal)
    """
    now = datetime.now(PT)

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

    context = _truncate_prompt(
        f"BUSINESS: {BUSINESS_NAME} | ROLE: {user_role} | TIME (Pacific): {now.strftime('%Y-%m-%d %H:%M %Z')}\n\n"
        f"RECENT ORDERS:\n{format_orders_for_ai(orders[:15])}\n\n"
        f"CUSTOMERS: {len(customers)} total, {sum(1 for c in customers if c.get('membership_status') == 'active')} members\n\n"
        f"PENDING QUOTES:\n{format_quotes_for_ai([q for q in quotes if (q.get('status') or '').lower() in ['new', 'pending', 'sent']][:8])}\n\n"
        f"NEW LEADS:\n{format_leads_for_ai(leads[:8])}\n\n"
        f"OPEN TICKETS:\n{format_tickets_for_ai(tickets[:8])}\n\n"
        f"ACTIVE SERVICES:\n{format_services_for_ai(services)}"
    )

    system_prompt = (
        f"You are the business assistant for {BUSINESS_NAME}. "
        f"Answer concisely and actionably. To execute actions, include a JSON block:\n"
        '```json\n{"action": "type", "params": {...}}\n```\n'
        "Available actions: update_order_status, update_order_lbs, "
        "update_payment_status, update_quote_status, update_lead_status, update_ticket_status."
        "Respond in English unless the user asks otherwise."
    )

    result = _groq_call(
        client,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user",   "content": f"{context}\n\nUSER QUERY: {query}"},
        ],
        max_tokens=MAX_ANALYZE_TOKENS,
        temperature=0.5,
    )

    if not result:
        return {"error": _analyze_fallback(query), "generated_at": now.isoformat()}

    _cache.set(result, "analyze", query.strip().lower(), user_role)
    return {"response": result, "generated_at": now.isoformat(), "from_cache": False}


# ─────────────────────────────────────────────────────────────────────────────
# ai_suggest_actions — sin cambios (solo ajuste de formato opcional)
# ─────────────────────────────────────────────────────────────────────────────

def _suggest_stuck_orders(orders, now) -> List[Dict]:
    """Find orders stuck in processing for 2+ days (using Pacific Time)."""
    results = []
    for order in orders:
        if (order.get("status") or "").lower() != "processing":
            continue
        created = order.get("created_at") or ""
        if not created:
            continue
        try:
            created_dt = datetime.fromisoformat(created.replace("Z", "+00:00")).astimezone(PT)
            days_stuck = (now - created_dt).days
            if days_stuck >= 2:
                oid = order.get("id") or ""
                results.append({
                    "type": "warning", "priority": "high",
                    "title": f"Order {order.get('order_number', oid[:8])} stuck in process",
                    "description": f"Has been processing for {days_stuck} days",
                    "action": {"type": "update_order_status", "order_id": oid, "suggested_status": "ready"},
                })
        except Exception:
            pass
    return results


def _suggest_ready_backlog(orders) -> List[Dict]:
    ready = [o for o in orders if (o.get("status") or "").lower() == "ready"]
    if len(ready) > 3:
        return [{"type": "info", "priority": "medium",
                 "title": f"{len(ready)} orders ready for delivery",
                 "description": "Consider scheduling deliveries to clear the backlog", "action": None}]
    return []


def _suggest_unpaid_completed(orders) -> List[Dict]:
    pending = [o for o in orders if (o.get("payment_status") or "").lower() != "paid" and (o.get("status") or "").lower() == "completed"]
    if pending:
        total = sum(float(o.get("total_amount") or 0) for o in pending)
        return [{"type": "revenue", "priority": "high",
                 "title": f"${total:.2f} in pending payments",
                 "description": f"{len(pending)} completed orders not paid", "action": None}]
    return []


async def ai_suggest_actions(db, context_type: str) -> List[Dict[str, Any]]:
    """Genera sugerencias de acciones basadas en el estado actual (local, sin LLM)."""
    now = datetime.now(PT)
    orders = await db.orders.find({}, {"_id": 0}).to_list(500)

    suggestions = []
    suggestions.extend(_suggest_stuck_orders(orders, now))
    suggestions.extend(_suggest_ready_backlog(orders))
    suggestions.extend(_suggest_unpaid_completed(orders))

    tickets = await db.tickets.find(
        {"status": {"$in": ["open", "new"]}, "priority": "high"}, {"_id": 0}
    ).to_list(100)
    if tickets:
        suggestions.append({
            "type": "urgent", "priority": "critical",
            "title": f"{len(tickets)} high-priority tickets",
            "description": "Customer issues requiring immediate attention", "action": None,
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
        return "No recent orders"
    lines = []
    for o in orders[:15]:
        amount     = float(o.get("total_amount") or 0)
        order_num  = o.get("order_number") or (o.get("id", "")[:8] if o.get("id") else "N/A")
        lines.append(
            f"- {order_num}: {o.get('status', 'unknown')} | "
            f"Payment: {o.get('payment_status', 'pending')} | "
            f"${amount:.2f} | Customer: {o.get('customer_name', 'N/A')}"
        )
    return "\n".join(lines)


def format_quotes_for_ai(quotes: List[Dict]) -> str:
    if not quotes:
        return "No pending quotes"
    return "\n".join(
        f"- {q.get('quote_number', q.get('id', '')[:8])}: "
        f"{q.get('company_name', 'N/A')} | "
        f"Status: {q.get('status', 'new')} | "
        f"Est: {q.get('estimated_lbs_per_week', 'N/A')} lbs/week"
        for q in quotes[:8]
    )


def format_leads_for_ai(leads: List[Dict]) -> str:
    if not leads:
        return "No new leads"
    return "\n".join(
        f"- {lead.get('name', 'N/A')}: {lead.get('email', 'no email')} | "
        f"Source: {lead.get('source', 'unknown')} | "
        f"Status: {lead.get('status', 'new')}"
        for lead in leads[:8]
    )


def format_tickets_for_ai(tickets: List[Dict]) -> str:
    if not tickets:
        return "No open tickets"
    return "\n".join(
        f"- #{t.get('ticket_number', t.get('id', '')[:8])}: "
        f"{(t.get('subject') or 'No subject')[:50]} | "
        f"Priority: {t.get('priority', 'normal')} | "
        f"Status: {t.get('status', 'open')}"
        for t in tickets[:8]
    )


def format_services_for_ai(services: List[Dict]) -> str:
    if not services:
        return "No services configured"
    lines = [
        f"- {s.get('name', 'N/A')}: ${float(s.get('price', 0)):.2f} {s.get('price_unit', '')}"
        for s in services
        if s.get("is_active")
    ]
    return "\n".join(lines) if lines else "No active services"