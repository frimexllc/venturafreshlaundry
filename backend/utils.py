"""
Shared utility functions: QR generation, ticket formatting, order helpers, membership, etc.

UNIFIED PRICING v17 — Single Source of Truth
═══════════════════════════════════════════════════════════════════════════════

MEMBERSHIP PRICING RULES:
  While allowance lbs are still available:
    Standard → $0.00/lb on covered lbs  (fully included)
    Premium  → +$0.25/lb on covered lbs (speed surcharge only)
    Express  → +$0.50/lb on covered lbs (speed surcharge only)

  After allowance is exhausted (member rates apply to all extra lbs):
    Standard → $2.50/lb
    Premium  → $2.75/lb
    Express  → $3.00/lb

MINIMUM CHARGE ($40 for Pickup & Delivery):
  The $40 minimum is only applied when the FULL ORDER at regular rates
  would cost less than $40 AND there is no membership allowance coverage.
  Example: 65 lb order with 60 lb allowance → full order = $178.75 ≥ $40,
  so NO minimum is applied to the 5 extra lbs. Member pays 5 × $2.50 = $12.50.

DELIVERY FEE TIERS (unified):
  0–3 mi → $0.00
  3–5 mi → $1.99
  5–8 mi → $2.99
  8–12 mi → $4.99
  12–15 mi → $8.99

FIX v16 (2026-07-22):
  1) BUG DE TARIFA: calculate_final_amount_with_membership() estaba cobrando
     `regular_rate` en TODAS las libras extra de un miembro (tanto las que
     exceden el allowance como las de un miembro sin allowance restante),
     contradiciendo la regla de negocio documentada arriba mismo en este
     docstring ("member rates apply to all extra lbs"). Ahora usa
     `member_rate` en esas dos ramas. Esto corrige un sobre-cobro sistemático
     a miembros con ordenes que exceden su allowance mensual.
  2) BUG DE ADDONS/ENVIO: el campo "extra_charge" que regresa esta funcion
     representaba SOLO el cargo por libras (amount_to_charge), mientras que
     "total" incluia libras + envio + addons. Como varios endpoints del
     backend (ej. apply-membership en customer.py, y probablemente el PUT
     /orders/{order_id} en orders.py) leen o escriben "extra_charge" asumiendo
     que YA es el monto final completo, cualquier flujo que confiara
     directamente en breakdown["extra_charge"] perdia silenciosamente el
     envio y los addons del cobro. Ahora "extra_charge" == "total" siempre
     (el monto real a cobrar). "amount_to_charge" se mantiene como el campo
     interno de solo-libras para quien necesite el desglose granular.
  3) BUG DE CASING: el plan "SIGNATURE ELITE" en PLAN_ALLOWANCES estaba en
     mayusculas, pero _get_plan_allowance() siempre compara en minusculas,
     asi que ese plan NUNCA hacia match y devolvia 0 lbs de allowance
     (el cliente se cobraba como si no tuviera membresia). Corregido a
     minusculas.

FIX v17 (2026-08-08):
  4) BUG DE ADDONS CON PRECIO EDITADO: calculate_final_amount_with_membership()
     solo leia addon.get("price") para sumar addons_total, ignorando
     "custom_price" (el precio editado a mano por el operador en
     OrderDetailDialog.jsx). El ticket impreso (get_order_ticket en
     orders.py) SI respetaba custom_price, asi que el total mostrado en el
     ticket y el total realmente cobrado (extra_charge/total_amount) podian
     no coincidir. Ahora esta funcion tambien prioriza custom_price sobre
     price, igual que el resto del sistema.
"""
import io
import json
import html
import base64
import uuid
import time
import logging
import os
from typing import Any, Dict, List, Optional
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

import qrcode
from fastapi import HTTPException

from database import db
from models import OrderCreate, PreferenceCreate
from domain.membership import (
    get_plan_allowance_fallback,
    compute_billing_cycle,
    compute_cycle_usage,
    PLAN_ALLOWANCE_FALLBACK as PLAN_ALLOWANCES,
)
import domain.delivery as domain_delivery
import domain.notifications as domain_notifications
import domain.billing as domain_billing

logger = logging.getLogger(__name__)

TZ_PACIFIC = ZoneInfo("America/Los_Angeles")


def now_utc():
    return datetime.now(timezone.utc)

def now_iso():
    return now_utc().isoformat()


import re as _re

def normalize_spaces(value):
    if not value or not isinstance(value, str):
        return value
    return " ".join(value.split()).strip()

def normalize_email(value):
    if not value or not isinstance(value, str):
        return value
    return value.strip().lower()

def normalize_phone(value):
    if not value or not isinstance(value, str):
        return value
    digits = _re.sub(r"[^\d+]", "", value.strip())
    return digits if digits else value.strip()

def normalize_address(value):
    if not value or not isinstance(value, str):
        return value
    return normalize_spaces(value)

def normalize_preference_dict(data):
    if not data or not isinstance(data, dict):
        return data
    return {k: normalize_spaces(v) if isinstance(v, str) else v for k, v in data.items()}

def normalize_name(value):
    if not value or not isinstance(value, str):
        return value
    return " ".join(value.split()).strip().title()

def normalize_yes_no(value):
    if not value or not isinstance(value, str):
        return value
    v = value.strip().lower()
    if v in ("yes", "si", "sí", "1", "true"):
        return "yes"
    if v in ("no", "0", "false"):
        return "no"
    return value.strip()

def normalize_preference_payload(data: PreferenceCreate) -> Dict[str, Any]:
    def normalize_list(value):
        if not value:
            return []
        if isinstance(value, list):
            return [normalize_spaces(v) for v in value if normalize_spaces(v)]
        if isinstance(value, str):
            cleaned = normalize_spaces(value)
            return [v for v in (item.strip() for item in cleaned.split(",")) if v]
        return []
    return {
        "detergent_type":        normalize_spaces(data.detergent_type) or "standard",
        "water_temperature":     normalize_spaces(data.water_temperature),
        "fabric_softener":       normalize_spaces(data.fabric_softener),
        "folding_style":         normalize_spaces(data.folding_style) or "standard",
        "hanging_instructions":  normalize_spaces(data.hanging_instructions),
        "allergies":             normalize_spaces(data.allergies),
        "special_instructions":  normalize_spaces(data.special_instructions),
        "pickup_time_preference":normalize_spaces(data.pickup_time_preference),
        "gate_code":             normalize_spaces(data.gate_code),
        "hang_dry_items":        normalize_list(data.hang_dry_items),
        "fragrance_preference":  normalize_spaces(data.fragrance_preference) or "light",
    }


# ── Order helpers ──────────────────────────────────────────────────────────────

async def generate_order_number():
    today = datetime.now(timezone.utc).strftime("%Y%m%d")
    unique = uuid.uuid4().hex[:8]
    return f"VFL-{today}-{unique}"

def normalize_status(value: Optional[str]) -> str:
    """
    Normaliza el status de una orden al canónico.
    Delega a order_status.normalize_status que maneja:
      - UPPERCASE / lowercase
      - hyphens / underscores
      - alias legacy (pending → new, shipping → out_for_delivery, etc.)
    """
    if not value:
        return ""
    try:
        from order_status import normalize_status as _norm
        result = _norm(value)
        return result or ""
    except ImportError:
        # Fallback al comportamiento antiguo si el módulo no está disponible
        return value.strip().lower().replace(" ", "_")

def normalize_payment_method(value: Optional[str]) -> str:
    if not value:
        return ""
    normalized = value.strip().lower()
    mapping = {
        "efectivo": "cash", "cash": "cash",
        "tarjeta": "card", "card": "card",
        "credito": "card", "débito": "card", "debito": "card",
        "transferencia": "transfer", "transfer": "transfer",
        "transferencia_bancaria": "transfer",
        "otro": "other", "other": "other",
    }
    return mapping.get(normalized, normalized)

def build_order_times(now_iso_str: str, status_value: str):
    return {
        "creacion": now_iso_str,
        "ultimo_cambio_estado": now_iso_str,
        "fechas_estado": {status_value: now_iso_str},
    }

def validate_order_payload(data: OrderCreate):
    errors = []
    if data.service_type == "pickup_delivery":
        if not data.pickup_date:
            errors.append({"codigo": "MISSING_PICKUP_DATE", "campo": "pickup_date"})
        if not data.pickup_time_window:
            errors.append({"codigo": "MISSING_PICKUP_TIME", "campo": "pickup_time_window"})
        if not data.pickup_address:
            errors.append({"codigo": "MISSING_PICKUP_ADDRESS", "campo": "pickup_address"})
    return errors

def is_active_member(order: Optional[dict], customer: Optional[dict]) -> bool:
    return domain_billing.is_active_member(order, customer)


# ════════════════════════════════════════════════════════════════════════════
# PRICING TABLES — now in domain/billing.py, the single source of truth for
# how much an order costs. Re-exported here under their historical names
# since several route modules import them directly from utils.
# ════════════════════════════════════════════════════════════════════════════

PRICING = domain_billing.PRICING
MEMBERSHIP_ALLOWANCE_SURCHARGE = domain_billing.MEMBERSHIP_ALLOWANCE_SURCHARGE
PLAN_UPGRADE_SURCHARGE = MEMBERSHIP_ALLOWANCE_SURCHARGE

# PLAN_ALLOWANCES lives in domain/membership.py as PLAN_ALLOWANCE_FALLBACK
# (imported at the top of this file).

PD_MINIMUM_CHARGE = domain_billing.PD_MINIMUM_CHARGE
WF_MINIMUM_LBS = domain_billing.WF_MINIMUM_LBS


def _normalize_service_type(service_type: str) -> str:
    return domain_billing.normalize_service_type(service_type)

def _get_rate(service_type: str, plan: str, is_member: bool) -> float:
    return domain_billing.get_rate(service_type, plan, is_member)

def _get_plan_allowance(plan_name: str) -> int:
    """Hardcoded fallback for backward compatibility — delegates to
    domain/membership.py, the single source of truth for this table."""
    return get_plan_allowance_fallback(plan_name)

async def _get_plan_allowance_dynamic(plan_name: str) -> int:
    """
    Obtiene las libras del plan: primero busca en la DB (membership_plans),
    luego hace fallback al dict hardcodeado.
    Esto permite planes custom creados desde el admin (ej: 'Gold 150 lbs').
    """
    if not plan_name:
        return 0

    # 1️⃣ Buscar en DB — soporta planes custom creados desde AdminMemberships
    try:
        plan_doc = await db.membership_plans.find_one(
            {
                "$or": [
                    {"name": {"$regex": f"^{plan_name}$", "$options": "i"}},
                    {"name": {"$regex": plan_name, "$options": "i"}},
                ]
            },
            {"_id": 0, "lbs_allowance": 1, "name": 1}
        )
        if plan_doc and plan_doc.get("lbs_allowance") and int(plan_doc["lbs_allowance"]) > 0:
            return int(plan_doc["lbs_allowance"])
    except Exception as e:
        logger.warning(f"DB lookup for plan allowance failed: {e}")

    # 2️⃣ Fallback al dict hardcodeado (compatibilidad hacia atrás)
    return _get_plan_allowance(plan_name)

def _is_order_before_membership(order: dict, customer: dict) -> bool:
    return domain_billing.is_order_before_membership(order, customer)


# ── Customer ownership helpers ─────────────────────────────────────────────────

async def get_customer_ids_by_email(email: str) -> set:
    if not email:
        return set()
    customers = await db.customers.find(
        {"email": {"$regex": f"^{email}$", "$options": "i"}},
        {"_id": 0, "id": 1},
    ).to_list(20)
    return {c["id"] for c in customers if c.get("id")}

async def customer_owns_order(order: dict, customer: dict) -> bool:
    if not customer:
        return False
    current_id    = customer.get("id", "")
    current_email = (customer.get("email") or "").lower()
    order_cid     = order.get("customer_id", "")
    order_email   = (order.get("customer_email") or "").lower()
    if order_cid == current_id:
        return True
    if current_email and order_email and order_email == current_email:
        return True
    if order_cid and current_email:
        linked_ids = await get_customer_ids_by_email(current_email)
        if order_cid in linked_ids:
            return True
    return False


# ── Delivery fee (UNIFIED) ─────────────────────────────────────────────────────
# The tier table and fee math now live in domain/delivery.py — the single
# source of truth shared with delivery_config.py, routes/delivery_config.py,
# and routes/delivery_rules.py, which used to each keep their own slightly
# different copy (one of them diverged enough to crash when called).

def calculate_delivery_fee(distance_miles) -> float:
    return domain_delivery.calculate_delivery_fee(distance_miles)

# ── Membership cycle usage (VERSIÓN MEJORADA CON PATCH 1) ─────────────────────

async def get_customer_cycle_usage(customer_id: str) -> Optional[dict]:
    """
    Retorna el uso del ciclo actual de membresía del cliente.
    Versión mejorada: lbs_allowance viene del plan en DB (dinámico),
    no del dict hardcodeado — soporta planes custom del admin.
    """
    customer = await db.customers.find_one({"id": customer_id}, {"_id": 0})
    if not customer:
        return None

    membership_status = (customer.get("membership_status") or "").lower()
    membership_plan   = customer.get("membership_plan") or ""

    if membership_status not in ("active", "current", "paid"):
        return None

    # ── Allowance dinámico desde DB, con override manual del admin ───────
    # custom_lbs_allowance (Anular allowance / override-allowance) debe
    # ganarle siempre al allowance del plan — antes solo se aplicaba en
    # el endpoint GET /api/customers/{id}/cycle-usage, y el resto de
    # llamadores de esta funcion (tabla de admin, barra del cliente,
    # billing preview) ignoraban el override por completo.
    custom_allowance = customer.get("custom_lbs_allowance")
    if custom_allowance:
        lbs_allowance = float(custom_allowance)
    else:
        lbs_allowance = await _get_plan_allowance_dynamic(membership_plan)
    if lbs_allowance == 0:
        return None

    membership_start_date_str = customer.get("membership_start_date")
    if not membership_start_date_str:
        return None

    try:
        if isinstance(membership_start_date_str, str):
            mem_start_dt = datetime.fromisoformat(
                membership_start_date_str.replace("Z", "+00:00")
            )
        else:
            mem_start_dt = membership_start_date_str
        if mem_start_dt.tzinfo is None:
            mem_start_dt = mem_start_dt.replace(tzinfo=timezone.utc)
    except Exception as e:
        logger.warning(f"Could not parse membership start date for {customer_id}: {e}")
        return None

    now = datetime.now(timezone.utc)
    cycle = compute_billing_cycle(mem_start_dt, now)
    cycle_start      = cycle["cycle_start"]
    cycle_end        = cycle["cycle_end"]
    effective_start  = cycle["effective_start"]
    effective_start_iso = effective_start.isoformat()
    cycle_end_iso        = cycle_end.isoformat()

    pipeline = [
        {
            "$match": {
                "customer_id": customer_id,
                "status":      {"$nin": ["cancelled"]},
                "actual_lbs":  {"$gt": 0},
                "created_at": {
                    "$gte": effective_start_iso,
                    "$lt":  cycle_end_iso,
                },
            }
        },
        {
            "$group": {
                "_id":         None,
                "total_lbs":   {"$sum": "$actual_lbs"},
                "order_count": {"$sum": 1},
            }
        },
    ]

    result       = await db.orders.aggregate(pipeline).to_list(1)
    orders_lbs   = float(result[0]["total_lbs"]) if result else 0.0
    # cycle_lbs_used guarda el ajuste manual del admin (Ajustar libras),
    # un offset que se suma al consumo real calculado desde las ordenes —
    # sin esto, un ajuste manual nunca se reflejaba en ningun lado porque
    # esta funcion siempre recalculaba el consumo desde cero a partir de
    # las ordenes reales, ignorando el campo que adjust_membership_lbs
    # escribe en el cliente.
    manual_adjustment = float(customer.get("cycle_lbs_used", 0) or 0)
    usage = compute_cycle_usage(lbs_allowance, orders_lbs, manual_adjustment)
    lbs_used      = usage["lbs_used"]
    lbs_remaining = usage["lbs_remaining"]
    pct_used      = usage["pct_used"]

    # ── Datos del plan desde DB para el frontend ─────────────────────────
    plan_doc = None
    try:
        plan_doc = await db.membership_plans.find_one(
            {"name": {"$regex": f"^{membership_plan}$", "$options": "i"}},
            {"_id": 0, "name": 1, "price": 1, "lbs_allowance": 1, "features": 1}
        )
    except Exception:
        pass

    return {
        # Ciclo
        "plan":                  membership_plan,
        "lbs_allowance":         lbs_allowance,
        "lbs_used":              lbs_used,
        "lbs_remaining":         round(lbs_remaining, 1),
        "pct_used":              pct_used,
        "cycle_start":           cycle_start.strftime("%Y-%m-%d"),
        "cycle_end":             cycle_end.strftime("%Y-%m-%d"),
        "effective_start":       effective_start.strftime("%Y-%m-%d %H:%M:%S"),
        "membership_start_date": mem_start_dt.strftime("%Y-%m-%d %H:%M:%S"),
        "rate_per_extra_lb":     _get_rate("pickup_delivery", "standard", True),
        # Datos extra del plan para la barra del customer
        "plan_price":            plan_doc.get("price") if plan_doc else None,
        "plan_features":         plan_doc.get("features", []) if plan_doc else [],
        "plan_from_db":          bool(plan_doc),
    }


async def get_remaining_membership_allowance(customer_id: str, plan_name: str) -> float:
    """Versión actualizada que usa allowance dinámico desde DB."""
    usage = await get_customer_cycle_usage(customer_id)
    if usage:
        return usage.get("lbs_remaining", 0.0)
    # Fallback: allowance dinámico sin ciclo calculado
    return float(await _get_plan_allowance_dynamic(plan_name))


# ════════════════════════════════════════════════════════════════════════════
# CORE BILLING FUNCTION — calculate_final_amount_with_membership
# ════════════════════════════════════════════════════════════════════════════
#
# GLOSARIO DE CAMPOS (para evitar futuras confusiones entre módulos):
#   amount_to_charge   → SOLO el cargo por libras (con o sin descuento de
#                        membresía), SIN envío ni addons. Uso interno /
#                        depuración.
#   extra_charge       → el MONTO TOTAL REAL a cobrar (libras + envío +
#                        addons + processing_fee si aplica). Es el mismo
#                        valor que "total". Este es el campo que cualquier
#                        endpoint debe usar si necesita "cuánto se le cobra
#                        al cliente" en una sola cifra.
#   total              → idéntico a extra_charge (se mantiene por
#                        compatibilidad con código existente que ya lo lee).
#   membership_discount→ cuánto se ahorró el cliente vs. tarifa regular
#                        completa, solo por el efecto de la membresía en las
#                        libras (no incluye envío/addons, esos nunca tienen
#                        descuento de membresía).
# ════════════════════════════════════════════════════════════════════════════

async def calculate_final_amount_with_membership(
    order: dict,
    customer: Optional[dict],
) -> Optional[dict]:
    """
    Full billing breakdown for an order — the single amount actually
    charged to a customer. The calculation itself (rates, membership
    allowance coverage, minimum charge, add-ons, totals) lives in
    domain/billing.py as a pure function; this wrapper's only job is
    resolving the two pieces that need a database round-trip: the
    distance-based delivery fee and, when the order actually qualifies for
    membership coverage, the customer's remaining monthly allowance.
    """
    delivery_fee = calculate_delivery_fee(order.get("distance_miles"))

    remaining_allowance = 0.0
    if is_active_member(order, customer) and customer and not _is_order_before_membership(order, customer):
        plan_name = customer.get("membership_plan") or ""
        remaining_allowance = await get_remaining_membership_allowance(
            customer.get("id", ""), plan_name
        )

    return domain_billing.compute_order_billing(
        order, customer, remaining_allowance=remaining_allowance, delivery_fee=delivery_fee,
    )


# ── Legacy sync helper ─────────────────────────────────────────────────────────

def calculate_service_amount(order: dict, customer) -> Optional[float]:
    service_type = _normalize_service_type(order.get("service_type") or "pickup_delivery")
    lbs_value    = order.get("actual_lbs")
    if lbs_value is None:
        return None
    try:
        lbs_value = float(lbs_value)
    except (TypeError, ValueError):
        return None
    if lbs_value <= 0:
        return None
    plan   = (order.get("service_plan") or "standard").lower()
    is_mem = is_active_member(order, customer)
    rate   = _get_rate(service_type, plan, is_mem)
    is_wf  = service_type == "wash_fold"
    if is_wf:
        amount = max(lbs_value, WF_MINIMUM_LBS) * rate
    else:
        amount = max(lbs_value * rate, PD_MINIMUM_CHARGE)
    amount += calculate_delivery_fee(order.get("distance_miles"))
    for svc in (order.get("addon_services") or []):
        try:
            amount += float(svc.get("price", 0) or 0) * int(
                svc.get("qty") or svc.get("quantity") or 1
            )
        except (TypeError, ValueError):
            pass
    if (order.get("payment_method") or "").strip().lower() in ("card", "stripe"):
        amount += round(amount * 0.03, 2)
    return round(float(amount), 2)


async def should_skip_payment_notification(order: dict, customer: dict) -> bool:
    if not is_active_member(order, customer):
        return False
    final = await calculate_final_amount_with_membership(order, customer)
    if not final:
        return False
    return final["total"] <= 0.50

def _notify_rule_category(service_type: Optional[str]) -> str:
    return domain_notifications.normalize_service_category(service_type)


async def should_notify_order_status(order: dict, status: str) -> bool:
    """
    Decide si un cambio de estado dispara SMS/email al cliente.

    The actual eligibility rule (never notify pickup_scheduled, always
    notify the critical delivered/completed/cancelled milestones, and only
    notify an intermediate status if it matches the one the admin
    configured for this order's service category) lives in
    domain/notifications.py — the single source of truth now shared by
    routes/orders.py, automation_engine.py's operator-dashboard status
    endpoint, and routes/operator_routes.py, which previously either
    duplicated this logic or (in automation_engine.py's case, the endpoint
    the main operator dashboard actually calls) didn't check it at all.
    This wrapper's only job is fetching the configured rule from the DB —
    skipped entirely for the never/always-notify statuses, so those don't
    pay for a DB round-trip on every status change.
    """
    normalized = (status or "").strip().lower()
    if normalized in domain_notifications.NEVER_NOTIFY_STATUSES or normalized in domain_notifications.ALWAYS_NOTIFY_STATUSES:
        return domain_notifications.should_notify_for_status(status, configured_status=None)

    try:
        rules = await get_or_seed_business_rules()
        category = domain_notifications.normalize_service_category(order.get("service_type"))
        configured = (
            rules.get("auto_transitions", {}).get(category, {}).get("notify_status")
        )
    except Exception as e:
        logger.warning(f"Could not load notify_status business rule, defaulting to notify: {e}")
        return True

    return domain_notifications.should_notify_for_status(status, configured)


# ── QR / Ticket helpers ────────────────────────────────────────────────────────

def build_qr_payload(order: dict):
    return json.dumps({
        "order_id":     order.get("id"),
        "order_number": order.get("order_number"),
        "qr_token":     order.get("qr_token"),
    })

def build_display_order_number(order: dict) -> str:
    order_number = order.get("order_number")
    if order_number and order_number.startswith("VFL-"):
        return order_number
    created_at = order.get("created_at") or datetime.now(timezone.utc).isoformat()
    date_part  = created_at[:10].replace("-", "")
    base_id    = order_number or order.get("id") or "00000000"
    short      = "".join([c for c in str(base_id) if c.isalnum()]).lower()[:8]
    if len(short) < 8:
        short = (short + "00000000")[:8]
    return f"VFL-{date_part}-{short}"

def format_time_window(window: Optional[str]) -> str:
    if not window:
        return "-"
    cleaned = window.replace(" ", "")
    if "-" in cleaned:
        start, end = cleaned.split("-", 1)
        return f"{start} - {end}"
    return window

def build_ticket_lines(order: dict, customer: Optional[dict]) -> List[str]:
    customer    = customer or {}
    display_id  = build_display_order_number(order)
    status      = normalize_status(order.get("status") or "new").upper()
    name        = order.get("customer_name") or customer.get("name") or "-"
    phone       = customer.get("phone") or order.get("customer_phone") or "-"
    contact     = customer.get("preferred_contact") or order.get("preferred_contact") or "-"
    contact_label = str(contact).capitalize() if contact else "-"
    pickup_date = order.get("pickup_date") or "-"
    window      = format_time_window(order.get("pickup_time_window") or order.get("pickup_time"))
    address     = (
        order.get("pickup_address") or order.get("delivery_address")
        or customer.get("address") or "-"
    )
    membership  = "yes" if customer.get("membership_plan") or customer.get("membership_status") else "no"
    notes       = order.get("notes") or "N/A"

    def format_lbs(value):
        if value is None or value == "":
            return "N/A"
        try:
            return f"{float(value):g}"
        except Exception:
            return str(value)

    est_lbs     = format_lbs(order.get("estimated_lbs"))
    act_lbs     = format_lbs(order.get("actual_lbs"))
    pref_id     = order.get("preferences_id") or "N/A"
    customer_id = order.get("customer_id") or customer.get("id") or "N/A"
    email       = customer.get("email") or order.get("customer_email") or ""
    source      = order.get("origen") or "crm"
    dedup       = f"e:{email}|f:{source}"
    if len(dedup) > 45:
        dedup = dedup[:42] + "..."
    summary = f"{display_id} | {pickup_date} {window} | {name}"
    return [
        "VENTURA FRESH LAUNDRY",
        f"ORDER: {display_id}",
        f"STATUS: {status or 'NEW'}",
        f"NAME: {name}",
        f"PHONE: {phone}    CONTACT: {contact_label}",
        f"PICKUP: {pickup_date}    WINDOW: {window}",
        f"ADDR: {address}",
        f"MEMBERSHIP: {membership}",
        f"NOTES: {notes}",
        f"EST_LBS: {est_lbs}",
        f"ACT_LBS: {act_lbs}",
        f"PREF: {pref_id}",
        f"CUS_ID: {customer_id}",
        f"DEDUP: {dedup}",
        "",
        summary,
    ]

def build_qr_png_base64(payload: str) -> str:
    qr = qrcode.QRCode(box_size=6, border=2)
    qr.add_data(payload)
    qr.make(fit=True)
    img    = qr.make_image(fill_color="black", back_color="white")
    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    return base64.b64encode(buffer.getvalue()).decode("utf-8")


def build_ticket_svg(order: dict, customer: Optional[dict], qr_payload: str) -> bytes:
    import html

    qr_base64 = build_qr_png_base64(qr_payload)
    customer = customer or {}

    display_id = build_display_order_number(order)
    status = (order.get("status") or "new").upper()

    name = order.get("customer_name") or customer.get("name") or "-"
    phone = customer.get("phone") or order.get("customer_phone") or "-"
    pickup_date = order.get("pickup_date") or "-"

    window = format_time_window(
        order.get("pickup_time_window") or order.get("pickup_time")
    )

    address = (
        order.get("pickup_address")
        or order.get("delivery_address")
        or customer.get("address")
        or "-"
    )

    service = order.get("service_type") or "Wash Fold"
    payment_status = (order.get("payment_status") or "unpaid").upper()
    payment_method = (order.get("payment_method") or "-").upper()

    # --- PLAN LABEL ---
    plan_key = order.get("service_plan") or "standard"
    plan_labels = {
        "standard": "Standard (36h)",
        "premium":  "Premium (24h)",
        "express":  "Express (Same Day)",
    }
    plan_label = plan_labels.get(plan_key.lower(), plan_key)

    def safe_float(v, fallback="--"):
        if v is None or v == "":
            return fallback
        try:
            return f"{float(v):.1f}"
        except Exception:
            return str(v)

    def safe_currency(v, fallback="--"):
        if v is None or v == "":
            return fallback
        try:
            return f"${float(v):.2f}"
        except Exception:
            return str(v)

    est_lbs = safe_float(order.get("estimated_lbs"))
    act_lbs = safe_float(order.get("actual_lbs") or order.get("actual_weight"))
    rate = safe_currency(order.get("price_per_lb") or order.get("rate"))
    subtotal = safe_currency(order.get("subtotal"))
    delivery_fee = safe_currency(order.get("delivery_fee"))
    total = safe_currency(order.get("total_amount") or order.get("total"))

    notes = order.get("notes") or order.get("special_instructions") or ""
    if len(notes) > 65:
        notes = notes[:62] + "..."

    addon_services = order.get("addon_services") or []

    # 4 inches wide
    W = 384
    PAD = 18

    addr = str(address)
    if len(addr) > 56:
        addr = addr[:53] + "..."

    # Metric boxes
    BOX_W = 108
    BOX_H = 56
    BOX_GAP = 12

    B1_X = PAD
    B2_X = B1_X + BOX_W + BOX_GAP
    B3_X = B2_X + BOX_W + BOX_GAP

    BC_1 = B1_X + BOX_W / 2
    BC_2 = B2_X + BOX_W / 2
    BC_3 = B3_X + BOX_W / 2

    # --- OFFSET por el nuevo campo PLAN ---
    OFFSET = 22   # píxeles extra para la línea de PLAN

    # Price rows (se mantienen igual, pero sus coordenadas se calculan a partir de cur_y que se actualiza)
    cur_y = 445 + OFFSET  # antes 445, sumamos OFFSET
    rows = ""

    rows += f"""
      <text x="{PAD}" y="{cur_y}" class="price-label">Subtotal</text>
      <text x="{W - PAD}" y="{cur_y}" text-anchor="end" class="price-value">{html.escape(subtotal)}</text>
    """
    cur_y += 22

    rows += f"""
      <text x="{PAD}" y="{cur_y}" class="price-label">Delivery Fee / Envio</text>
      <text x="{W - PAD}" y="{cur_y}" text-anchor="end" class="price-value">{html.escape(delivery_fee)}</text>
    """
    cur_y += 22

    for addon in addon_services:
        aname = addon.get("name", "Add-on")
        aprice = float(addon.get("price") or 0)
        aqty = int(addon.get("qty") or addon.get("quantity") or 1)

        if aprice > 0:
            rows += f"""
              <text x="{PAD}" y="{cur_y}" class="price-label">{html.escape(aname)} x{aqty}</text>
              <text x="{W - PAD}" y="{cur_y}" text-anchor="end" class="price-value">${aprice * aqty:.2f}</text>
            """
            cur_y += 22

    cur_y += 8

    rows += f"""
      <line x1="{PAD}" y1="{cur_y}" x2="{W - PAD}" y2="{cur_y}" class="solid-line"/>
    """

    cur_y += 28

    rows += f"""
      <text x="{PAD}" y="{cur_y}" class="total-label">TOTAL</text>
      <text x="{W - PAD}" y="{cur_y}" text-anchor="end" class="total-value">{html.escape(total)}</text>
    """

    cur_y += 22
    pay_y = cur_y + 10

    rows += f"""
      <rect x="{PAD}" y="{pay_y}" width="{W - PAD * 2}" height="32" rx="4"
            fill="#ffffff" stroke="#999999" stroke-width="1"/>
      <text x="{W / 2}" y="{pay_y + 21}" text-anchor="middle" class="payment-text">
        PAYMENT: {html.escape(payment_status)} | METHOD: {html.escape(payment_method)}
      </text>
    """

    cur_y = pay_y + 46

    if notes:
        cur_y += 8
        rows += f"""
          <text x="{PAD}" y="{cur_y}" class="section-title">NOTES</text>
        """
        cur_y += 16
        rows += f"""
          <text x="{PAD}" y="{cur_y}" class="small-text">{html.escape(notes)}</text>
        """
        cur_y += 20

    footer_y = cur_y + 12

    rows += f"""
      <line x1="{PAD}" y1="{footer_y}" x2="{W - PAD}" y2="{footer_y}" class="dash-line"/>
      <text x="{W / 2}" y="{footer_y + 18}" text-anchor="middle" class="footer-text">
        Ventura Fresh Laundry | (820) 234-8181 | venturafreshlaundry.com
      </text>
    """

    # Dynamic height so it never cuts the ticket
    H = footer_y + 38

    # Ahora construyo el SVG con las coordenadas ajustadas con OFFSET
    svg = f"""<svg xmlns="http://www.w3.org/2000/svg"
     width="4in" height="{H}px" viewBox="0 0 {W} {H}">

  <defs>
    <style>
      .brand {{
        font-family: Arial, Helvetica, sans-serif;
        font-size: 18px;
        font-weight: 900;
        fill: white;
      }}

      .subtitle {{
        font-family: Arial, Helvetica, sans-serif;
        font-size: 10px;
        font-weight: 700;
        fill: white;
      }}

      .badge-text {{
        font-family: Arial, Helvetica, sans-serif;
        font-size: 9px;
        font-weight: 900;
        fill: #111;
      }}

      .label, .section-title {{
        font-family: Arial, Helvetica, sans-serif;
        font-size: 10px;
        font-weight: 900;
        fill: #222;
        letter-spacing: 1px;
      }}

      .value {{
        font-family: Arial, Helvetica, sans-serif;
        font-size: 13px;
        font-weight: 900;
        fill: #111;
      }}

      .customer-name {{
        font-family: Arial, Helvetica, sans-serif;
        font-size: 15px;
        font-weight: 900;
        fill: #111;
      }}

      .small-text {{
        font-family: Arial, Helvetica, sans-serif;
        font-size: 10px;
        font-weight: 700;
        fill: #333;
      }}

      .address-text {{
        font-family: Arial, Helvetica, sans-serif;
        font-size: 9px;
        font-weight: 700;
        fill: #333;
      }}

      .metric-label {{
        font-family: Arial, Helvetica, sans-serif;
        font-size: 9px;
        font-weight: 900;
        fill: #222;
      }}

      .metric-value {{
        font-family: Arial, Helvetica, sans-serif;
        font-size: 20px;
        font-weight: 900;
        fill: #000;
      }}

      .price-label, .price-value {{
        font-family: Arial, Helvetica, sans-serif;
        font-size: 11px;
        font-weight: 700;
        fill: #222;
      }}

      .total-label {{
        font-family: Arial, Helvetica, sans-serif;
        font-size: 18px;
        font-weight: 900;
        fill: #000;
      }}

      .total-value {{
        font-family: Arial, Helvetica, sans-serif;
        font-size: 22px;
        font-weight: 900;
        fill: #000;
      }}

      .payment-text {{
        font-family: Arial, Helvetica, sans-serif;
        font-size: 10px;
        font-weight: 900;
        letter-spacing: 0.5px;
        fill: #111;
      }}

      .footer-text {{
        font-family: Arial, Helvetica, sans-serif;
        font-size: 7.5px;
        font-weight: 600;
        fill: #777;
      }}

      .dash-line {{
        stroke: #999;
        stroke-width: 1;
        stroke-dasharray: 4,4;
      }}

      .solid-line {{
        stroke: #222;
        stroke-width: 1;
      }}
    </style>
  </defs>

  <rect width="{W}" height="{H}" rx="4" fill="white" stroke="#ccc" stroke-width="1"/>

  <!-- HEADER -->
  <rect x="0" y="0" width="{W}" height="58" rx="4" fill="#111"/>
  <rect x="0" y="48" width="{W}" height="10" fill="#111"/>

  <text x="{PAD}" y="25" class="brand">VENTURA FRESH LAUNDRY</text>
  <text x="{PAD}" y="44" class="subtitle">Order Ticket / Recibo de Orden</text>

  <rect x="{W - 100}" y="12" width="82" height="26" rx="4" fill="white"/>
  <text x="{W - 59}" y="30" text-anchor="middle" class="badge-text">
    {html.escape(status)}
  </text>

  <!-- QR + ORDER INFO -->
  <image href="data:image/png;base64,{qr_base64}" x="{PAD}" y="72" width="110" height="110"/>

  <text x="145" y="86" class="label">ORDER / ORDEN</text>
  <text x="145" y="106" class="value">{html.escape(display_id)}</text>

  <text x="145" y="132" class="label">SERVICE / SERVICIO</text>
  <text x="145" y="150" class="value">{html.escape(str(service).replace("_", " ").title())}</text>

  <!-- PLAN -->
  <text x="145" y="176" class="label">PLAN</text>
  <text x="145" y="194" class="value">{html.escape(plan_label)}</text>

  <!-- DATE / FECHA (desplazada por OFFSET) -->
  <text x="145" y="{216 + OFFSET}" class="label">DATE / FECHA</text>
  <text x="145" y="{234 + OFFSET}" class="value">{html.escape(str(pickup_date))} {html.escape(str(window))}</text>

  <line x1="{PAD}" y1="{256 + OFFSET}" x2="{W - PAD}" y2="{256 + OFFSET}" class="dash-line"/>

  <!-- CUSTOMER / CLIENTE (desplazada) -->
  <text x="{PAD}" y="{278 + OFFSET}" class="section-title">CUSTOMER / CLIENTE</text>
  <text x="{PAD}" y="{300 + OFFSET}" class="customer-name">{html.escape(str(name))}</text>
  <text x="{PAD}" y="{320 + OFFSET}" class="small-text">{html.escape(str(phone))}</text>
  <text x="{PAD}" y="{340 + OFFSET}" class="address-text">{html.escape(addr)}</text>

  <line x1="{PAD}" y1="{360 + OFFSET}" x2="{W - PAD}" y2="{360 + OFFSET}" class="dash-line"/>

  <!-- WEIGHT METRICS -->
  <text x="{PAD}" y="{382 + OFFSET}" class="section-title">WEIGHT METRICS / METRICAS DE PESO</text>

  <rect x="{B1_X}" y="{394 + OFFSET}" width="{BOX_W}" height="{BOX_H}" rx="5" fill="white" stroke="#111" stroke-width="1"/>
  <text x="{BC_1}" y="{412 + OFFSET}" text-anchor="middle" class="metric-label">EST. LBS</text>
  <text x="{BC_1}" y="{441 + OFFSET}" text-anchor="middle" class="metric-value">{html.escape(est_lbs)}</text>

  <rect x="{B2_X}" y="{394 + OFFSET}" width="{BOX_W}" height="{BOX_H}" rx="5" fill="white" stroke="#111" stroke-width="1"/>
  <text x="{BC_2}" y="{412 + OFFSET}" text-anchor="middle" class="metric-label">ACTUAL LBS</text>
  <text x="{BC_2}" y="{441 + OFFSET}" text-anchor="middle" class="metric-value">{html.escape(act_lbs)}</text>

  <rect x="{B3_X}" y="{394 + OFFSET}" width="{BOX_W}" height="{BOX_H}" rx="5" fill="white" stroke="#111" stroke-width="1"/>
  <text x="{BC_3}" y="{412 + OFFSET}" text-anchor="middle" class="metric-label">RATE/LB</text>
  <text x="{BC_3}" y="{441 + OFFSET}" text-anchor="middle" class="metric-value">{html.escape(rate)}</text>

  <line x1="{PAD}" y1="{460 + OFFSET}" x2="{W - PAD}" y2="{460 + OFFSET}" class="dash-line"/>

  <!-- PRICE BREAKDOWN -->
  <text x="{PAD}" y="{477 + OFFSET}" class="section-title">PRICE BREAKDOWN / DESGLOSE</text>

  {rows}

</svg>"""

    return svg.encode("utf-8")


def parse_qr_payload(payload: str):
    try:
        data = json.loads(payload)
        if isinstance(data, dict):
            return data
    except Exception:
        pass
    return {}

def build_address_parts(address: Optional[str]):
    if not address:
        return {"full": None, "street": None, "city": None, "postal_code": None}
    parts       = [p.strip() for p in address.split(",") if p.strip()]
    street      = parts[0] if parts else address
    city        = parts[1] if len(parts) > 1 else None
    postal_code = None
    if len(parts) > 2:
        postal_code = parts[-1].split()[-1]
    return {"full": address, "street": street, "city": city, "postal_code": postal_code}


# ── JSON / AI helpers ──────────────────────────────────────────────────────────

def extract_json_payload(text: str):
    cleaned = text.strip()
    if "```" in cleaned:
        start = cleaned.find("```")
        end   = cleaned.rfind("```")
        if end > start:
            cleaned = cleaned[start + 3:end].strip()
            if cleaned.startswith("json"):
                cleaned = cleaned[4:].strip()
    return json.loads(cleaned)

def call_ollama(prompt: str):
    from groq import Groq
    api_key = os.environ.get("GROQ_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="Groq API key not configured")
    client     = Groq(api_key=api_key)
    models     = ["openai/gpt-oss-120b", "llama-3.1-8b-instant"]
    last_error = None
    for model in models:
        for attempt in range(3):
            try:
                chat_completion = client.chat.completions.create(
                    messages=[{"role": "user", "content": prompt}],
                    model=model, temperature=0.65, max_tokens=2048,
                )
                return chat_completion.choices[0].message.content.strip()
            except Exception as e:
                last_error = e
                time.sleep(0.6 * (attempt + 1))
                continue
    logger.error(f"Groq API error after retries: {last_error}")
    raise HTTPException(status_code=502, detail=f"AI service error: {str(last_error)}")


# ── Import / mapping helpers ───────────────────────────────────────────────────

def normalize_header(value: str):
    return value.strip().lower()

def set_nested_value(target: dict, path: str, value):
    parts   = path.split(".")
    current = target
    for key in parts[:-1]:
        if key not in current or not isinstance(current[key], dict):
            current[key] = {}
        current = current[key]
    current[parts[-1]] = value

def suggest_mapping(headers: List[str]):
    mapping = {}
    for header in headers:
        key = normalize_header(header)
        if key in ["issue key", "key", "id", "order_number", "order number"]:
            mapping[header] = "order_number"
        elif key in ["status", "estado", "state"]:
            mapping[header] = "estado_actual"
        elif key in ["created", "created_at", "fecha", "creation date"]:
            mapping[header] = "tiempos.creacion"
        elif key in ["customer", "customer_name", "name", "cliente"]:
            mapping[header] = "customer_name"
        elif key in ["email", "correo", "customer_email"]:
            mapping[header] = "customer_email"
        elif key in ["phone", "telefono", "customer_phone"]:
            mapping[header] = "customer_phone"
        elif key in ["service_type", "service", "tipo servicio"]:
            mapping[header] = "service_type"
        elif key in ["notes", "summary", "descripcion", "description"]:
            mapping[header] = "notes"
    return mapping

async def resolve_or_create_customer_from_row(row: dict):
    email = row.get("customer_email")
    phone = row.get("customer_phone")
    name  = row.get("customer_name") or "Legacy"
    query = []
    if email: query.append({"email": email.lower()})
    if phone: query.append({"phone": phone})
    if query:
        existing = await db.customers.find_one({"$or": query}, {"_id": 0})
        if existing and "id" in existing:
            return existing["id"]
    customer_id = str(uuid.uuid4())
    now         = datetime.now(timezone.utc).isoformat()
    customer    = {
        "id": customer_id, "name": name,
        "email": email.lower() if email else None, "phone": phone,
        "address": None, "preferred_contact": "email",
        "notes": "Importación legacy", "status": "active",
        "total_orders": 0, "created_at": now, "updated_at": now,
    }
    await db.customers.insert_one(customer)
    return customer_id


# ── Audit log ──────────────────────────────────────────────────────────────────

async def create_audit_log(
    event_type:  str,
    entity_type: str,
    entity_id:   str,
    user_id:     str = None,
    details:     dict = None,
):
    log = {
        "id":          str(uuid.uuid4()),
        "event_type":  event_type,
        "entity_type": entity_type,
        "entity_id":   entity_id,
        "user_id":     user_id,
        "details":     details,
        "created_at":  datetime.now(timezone.utc).isoformat(),
    }
    await db.audit_logs.insert_one(log)


# ── AI index / business rules ──────────────────────────────────────────────────

ai_indexes_ready = False

async def ensure_ai_indexes():
    global ai_indexes_ready
    if ai_indexes_ready:
        return
    await db.patrones_detectados.create_index([("fecha_deteccion", -1)])
    await db.propuestas_ia.create_index([("estado", 1), ("fecha_generacion", -1)])
    await db.importaciones_legacy.create_index([("origen", 1), ("fecha_importacion", -1)])
    await db.audit_logs.create_index([("created_at", -1)])
    ai_indexes_ready = True

async def get_or_seed_business_rules():
    rules = await db.reglas_negocio.find_one({"id": "order_rules_v1"}, {"_id": 0})
    if rules:
        return rules
    now   = datetime.now(timezone.utc).isoformat()
    rules = {
        "id": "order_rules_v1", "type": "order_rules",
        "auto_transitions": {
            "pickup_delivery": {"notify_status": "out_for_delivery"},
            "wash_fold":       {"notify_status": "ready"},
            "self_service":    {"notify_status": "ready"},
        },
        "sla_hours": {
            "pickup_delivery": 48,
            "wash_fold":       36,
            "self_service":    24,
        },
        "created_at": now, "updated_at": now,
    }
    await db.reglas_negocio.insert_one(rules)
    return rules