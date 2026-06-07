"""
Shared utility functions: QR generation, ticket formatting, order helpers, membership, etc.

UNIFIED PRICING v15 — Single Source of Truth
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
"""
import io
import json
import html
import base64
import uuid
import time
import logging
import math
import os
from typing import Any, Dict, List, Optional
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

import qrcode
from qrcode.image.svg import SvgImage
from fastapi import HTTPException

from database import db
from models import OrderCreate, PreferenceCreate

logger = logging.getLogger(__name__)

TZ_PACIFIC = ZoneInfo("America/Los_Angeles")


def now_utc():
    return datetime.now(timezone.utc)

def now_pacific():
    return datetime.now(TZ_PACIFIC)

def to_pacific(dt_str):
    if not dt_str:
        return dt_str
    try:
        if isinstance(dt_str, datetime):
            dt = dt_str
        else:
            dt_str = str(dt_str)
            if dt_str.endswith("Z"):
                dt_str = dt_str[:-1] + "+00:00"
            dt = datetime.fromisoformat(dt_str)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(TZ_PACIFIC).isoformat()
    except Exception:
        return dt_str

def now_iso():
    return now_utc().isoformat()

def now_pacific_display():
    dt = now_pacific()
    return dt.strftime("%b %d, %Y %I:%M %p PT")


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
    if not value:
        return ""
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
    status_value = ""
    if customer:
        status_value = customer.get("membership_status") or ""
    elif order:
        status_value = order.get("membership_status") or ""
    status_normalized = normalize_spaces(status_value).lower() if status_value else ""
    if status_normalized in ("inactive", "cancelled", "canceled", "expired"):
        return False
    if status_normalized in ("active", "current", "paid", "yes", "true"):
        plan = None
        if customer:
            plan = customer.get("membership_plan")
        elif order:
            plan = order.get("membership_plan")
        return bool(plan)
    plan = None
    if customer:
        plan = customer.get("membership_plan")
    if not plan and order:
        plan = order.get("membership_plan")
    return bool(plan)


# ════════════════════════════════════════════════════════════════════════════
# PRICING TABLES — SINGLE SOURCE OF TRUTH
# ════════════════════════════════════════════════════════════════════════════

PRICING: Dict[str, Dict[str, Dict[str, float]]] = {
    "pickup_delivery": {
        "standard": {"regular": 2.75, "member": 2.50},
        "premium":  {"regular": 3.00, "member": 2.75},
        "express":  {"regular": 3.25, "member": 3.00},
    },
    "wash_fold": {
        "standard": {"regular": 2.25, "member": 2.25},
        "premium":  {"regular": 2.50, "member": 2.50},
        "express":  {"regular": 2.75, "member": 2.75},
    },
    "airbnb_host": {
        "standard": {"regular": 2.75, "member": 2.50},
        "premium":  {"regular": 3.00, "member": 2.75},
        "express":  {"regular": 3.25, "member": 3.00},
    },
    "commercial": {
        "standard": {"regular": 2.75, "member": 2.50},
        "premium":  {"regular": 3.00, "member": 2.75},
        "express":  {"regular": 3.25, "member": 3.00},
    },
}

MEMBERSHIP_ALLOWANCE_SURCHARGE: Dict[str, float] = {
    "standard": 0.00,
    "premium":  0.25,
    "express":  0.50,
}

PLAN_UPGRADE_SURCHARGE = MEMBERSHIP_ALLOWANCE_SURCHARGE

PLAN_ALLOWANCES: Dict[str, int] = {
    "most popular":       60,
    "popular":            60,
    "standard":           60,
    "basic":              60,
    "family plus":        90,
    "family":             90,
    "familyplus":         90,
    "elite concierge":   120,
    "elite":             120,
    "concierge":         120,
    "executive premium": 200,
    "executive":         200,
    "SIGNATURE ELITE":   200,
    "mamamia":         500,

}

PD_MINIMUM_CHARGE: float = 40.0
WF_MINIMUM_LBS:   float = 10.0


def _normalize_service_type(service_type: str) -> str:
    s = (service_type or "pickup_delivery").strip().lower().replace(" ", "_")
    if s in ("airbnb_host", "commercial"):
        return s
    if "wash" in s or "fold" in s:
        return "wash_fold"
    return "pickup_delivery"

def _get_rate(service_type: str, plan: str, is_member: bool) -> float:
    svc_key  = _normalize_service_type(service_type)
    tier_map = PRICING.get(svc_key, PRICING["pickup_delivery"])
    rates    = tier_map.get(plan, tier_map["standard"])
    return rates["member"] if is_member else rates["regular"]

def _get_plan_allowance(plan_name: str) -> int:
    """Fallback hardcodeado para compatibilidad hacia atrás."""
    if not plan_name:
        return 0
    key = plan_name.strip().lower().replace("_", " ").replace("-", " ")
    if key in PLAN_ALLOWANCES:
        return PLAN_ALLOWANCES[key]
    for allowed_key, allowance in PLAN_ALLOWANCES.items():
        if key in allowed_key or allowed_key in key:
            return allowance
    return 0

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
    membership_start_date = customer.get("membership_start_date")
    order_created_at = order.get("created_at")
    if not membership_start_date or not order_created_at:
        return False
    try:
        if isinstance(membership_start_date, str):
            mem_start_dt = datetime.fromisoformat(
                membership_start_date.replace("Z", "+00:00")
            )
        else:
            mem_start_dt = membership_start_date
        if mem_start_dt.tzinfo is None:
            mem_start_dt = mem_start_dt.replace(tzinfo=timezone.utc)
        if isinstance(order_created_at, str):
            order_dt = datetime.fromisoformat(
                order_created_at.replace("Z", "+00:00")
            )
        else:
            order_dt = order_created_at
        if order_dt.tzinfo is None:
            order_dt = order_dt.replace(tzinfo=timezone.utc)
        return order_dt < mem_start_dt
    except Exception as e:
        logger.warning(f"Billing date comparison error: {e}")
        return False


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

MAX_SERVICE_MILES  = 15.0
FREE_MILES_LIMIT   = 3.0

DELIVERY_FEE_TIERS = [
    {"max_miles":  3, "fee": 0.00},
    {"max_miles":  5, "fee": 1.99},
    {"max_miles":  8, "fee": 2.99},
    {"max_miles": 12, "fee": 4.99},
    {"max_miles": 15, "fee": 8.99},
]

def calculate_delivery_fee(distance_miles) -> float:
    if distance_miles is None:
        return 0.0
    try:
        d = float(distance_miles)
    except (TypeError, ValueError):
        return 0.0
    for tier in DELIVERY_FEE_TIERS:
        if d <= tier["max_miles"]:
            return tier["fee"]
    return DELIVERY_FEE_TIERS[-1]["fee"]

def stripe_processing_fee(amount: float, include_in_total: bool = True) -> float:
    if include_in_total:
        return round(float(amount) * 1.03, 2)
    return round(float(amount) * 0.03, 2)


def haversine_miles(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 3958.8
    dlat = (lat2 - lat1) * math.pi / 180
    dlon = (lon2 - lon1) * math.pi / 180
    a = math.sin(dlat/2)**2 + math.cos(lat1 * math.pi/180) * math.cos(lat2 * math.pi/180) * math.sin(dlon/2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
    return R * c

def haversine_km(coord1: List[float], coord2: List[float]) -> float:
    lon1, lat1 = coord1
    lon2, lat2 = coord2
    r = 6371.0
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return 2 * r * math.atan2(math.sqrt(a), math.sqrt(1 - a))


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

    # ── Allowance dinámico desde DB ──────────────────────────────────────
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

    now        = datetime.now(timezone.utc)
    anchor_day = min(mem_start_dt.day, 28)

    cycle_start = now.replace(
        day=anchor_day, hour=0, minute=0, second=0, microsecond=0
    )
    if cycle_start > now:
        prev_month  = cycle_start.month - 1 or 12
        prev_year   = cycle_start.year - (1 if prev_month == 12 else 0)
        cycle_start = cycle_start.replace(year=prev_year, month=prev_month)

    next_month = cycle_start.month % 12 + 1
    next_year  = cycle_start.year + (1 if next_month == 1 else 0)
    cycle_end  = cycle_start.replace(year=next_year, month=next_month)

    effective_start     = max(cycle_start, mem_start_dt)
    effective_start_iso = effective_start.isoformat()
    cycle_end_iso       = cycle_end.isoformat()

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

    result   = await db.orders.aggregate(pipeline).to_list(1)
    lbs_used = round(float(result[0]["total_lbs"]) if result else 0.0, 1)

    lbs_remaining = max(0.0, lbs_allowance - lbs_used)
    pct_used      = round((lbs_used / lbs_allowance) * 100, 1) if lbs_allowance else 0.0

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

async def calculate_final_amount_with_membership(
    order: dict,
    customer: Optional[dict],
) -> Optional[dict]:
    # ── Add-ons ──────────────────────────────────────────────────────────────
    addons_total = 0.0
    for addon in (order.get("addon_services") or []):
        try:
            qty         = int(addon.get("qty") or addon.get("quantity") or 1)
            addon_price = float(addon.get("price") or 0)
            addons_total += addon_price * qty
        except (TypeError, ValueError):
            pass
    addons_total = round(addons_total, 2)

    lbs_raw = order.get("actual_lbs")
    if lbs_raw is None or (float(lbs_raw) <= 0 if lbs_raw is not None else True):
        if addons_total > 0:
            delivery_fee   = calculate_delivery_fee(order.get("distance_miles"))
            payment_method = (order.get("payment_method") or "").strip().lower()
            total_before   = round(addons_total + delivery_fee, 2)
            processing_fee = round(total_before * 0.03, 2) if payment_method in ("card", "stripe") else 0.0
            return {
                "lbs": 0, "billable_lbs": 0,
                "plan": (order.get("service_plan") or "standard").strip().lower(),
                "is_member": False, "is_express": False,
                "regular_rate": 0.0, "member_rate": 0.0,
                "allowance_surcharge": 0.0, "allowance_surcharge_charge": 0.0,
                "lbs_covered": 0.0, "lbs_extra": 0.0,
                "lbs_from_allowance": 0.0, "extra_lbs_billed": 0.0,
                "membership_discount": 0.0,
                "subtotal": 0.0, "amount_to_charge": 0.0, "extra_charge": 0.0,
                "delivery_fee": delivery_fee, "addons_total": addons_total,
                "processing_fee": processing_fee,
                "subtotal_after_discount": total_before,
                "total": round(total_before + processing_fee, 2),
                "currency": "USD",
                "fully_covered_by_membership": False,
                "is_addon_only": True, "membership_applied": False,
                "price_per_lb": 0.0, "rate_used": 0.0,
            }
        return None

    try:
        lbs = float(lbs_raw)
    except (TypeError, ValueError):
        return None
    if lbs <= 0:
        return None

    service_type   = _normalize_service_type(order.get("service_type") or "pickup_delivery")
    plan           = (order.get("service_plan") or "standard").strip().lower()
    is_wf          = service_type == "wash_fold"
    is_express     = plan == "express"
    payment_method = (order.get("payment_method") or "").strip().lower()
    is_card        = payment_method in ("card", "stripe")
    is_member      = is_active_member(order, customer)

    regular_rate    = _get_rate(service_type, plan, False)
    member_rate     = _get_rate(service_type, plan, True)
    allowance_surch = MEMBERSHIP_ALLOWANCE_SURCHARGE.get(plan, 0.0)

    billable_lbs = max(lbs, WF_MINIMUM_LBS) if is_wf else lbs

    lbs_covered            = 0.0
    lbs_extra              = billable_lbs
    allowance_surch_charge = 0.0
    membership_discount    = 0.0
    remaining_allowance    = 0.0

    if is_member and customer:
        if not _is_order_before_membership(order, customer):
            plan_name           = customer.get("membership_plan") or ""
            remaining_allowance = await get_remaining_membership_allowance(
                customer.get("id", ""), plan_name
            )
            if remaining_allowance > 0:
                lbs_covered            = min(billable_lbs, remaining_allowance)
                lbs_extra              = billable_lbs - lbs_covered
                allowance_surch_charge = round(lbs_covered * allowance_surch, 2)

    if lbs_covered > 0:
        amount_to_charge = round(allowance_surch_charge + lbs_extra * regular_rate, 2)
    elif is_member:
        amount_to_charge = round(billable_lbs * regular_rate, 2)
    else:
        amount_to_charge = round(billable_lbs * regular_rate, 2)

    if not is_wf:
        full_regular_price  = billable_lbs * regular_rate
        order_below_minimum = full_regular_price < PD_MINIMUM_CHARGE
        if order_below_minimum and lbs_covered == 0:
            amount_to_charge = max(amount_to_charge, PD_MINIMUM_CHARGE)

    if is_member and lbs_covered > 0:
        full_regular        = round(billable_lbs * regular_rate, 2)
        membership_discount = max(0.0, round(full_regular - amount_to_charge, 2))

    delivery_fee  = calculate_delivery_fee(order.get("distance_miles"))
    total_before  = round(amount_to_charge + delivery_fee + addons_total, 2)
    processing_fee = 0.0

    fully_covered = (
        is_member
        and lbs_covered >= billable_lbs
        and allowance_surch == 0.0
        and addons_total == 0.0
        and delivery_fee == 0.0
    )
    if fully_covered:
        final_total    = 0.0
        processing_fee = 0.0
    else:
        final_total = round(total_before + processing_fee, 2)

    return {
        "lbs":             lbs,
        "billable_lbs":    billable_lbs,
        "plan":            plan,
        "is_member":       is_member,
        "is_express":      is_express,
        "regular_rate":    regular_rate,
        "member_rate":     member_rate,
        "rate_used":       regular_rate,
        "price_per_lb":    regular_rate,
        "allowance_surcharge":        allowance_surch,
        "allowance_surcharge_charge": allowance_surch_charge,
        "lbs_covered":        round(lbs_covered, 1),
        "lbs_extra":          round(lbs_extra, 1),
        "lbs_from_allowance": round(lbs_covered, 1),
        "extra_lbs_billed":   round(lbs_extra, 1),
        "subtotal":           round(billable_lbs * regular_rate, 2),
        "membership_discount": round(membership_discount, 2),
        "amount_to_charge":    round(amount_to_charge, 2),
        "extra_charge":        round(amount_to_charge, 2),
        "delivery_fee":        round(delivery_fee, 2),
        "addons_total":        addons_total,
        "processing_fee":      0.0,
        "subtotal_after_discount": total_before,
        "total":               final_total,
        "currency":            "USD",
        "fully_covered_by_membership": fully_covered,
        "membership_applied":  is_member and lbs_covered > 0,
        "is_addon_only":       False,
    }


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

def should_notify_order_status(order: dict, status: str) -> bool:
    return status not in {"pickup_scheduled"}


# ── QR / Ticket helpers ────────────────────────────────────────────────────────

def build_qr_svg(payload: str):
    img = qrcode.make(payload, image_factory=SvgImage, box_size=10, border=2)
    buffer = io.BytesIO()
    img.save(buffer)
    return buffer.getvalue()

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

    # Price rows
    cur_y = 445
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

  <text x="145" y="176" class="label">DATE / FECHA</text>
  <text x="145" y="194" class="value">{html.escape(str(pickup_date))} {html.escape(str(window))}</text>

  <line x1="{PAD}" y1="216" x2="{W - PAD}" y2="216" class="dash-line"/>

  <!-- CUSTOMER -->
  <text x="{PAD}" y="238" class="section-title">CUSTOMER / CLIENTE</text>
  <text x="{PAD}" y="260" class="customer-name">{html.escape(str(name))}</text>
  <text x="{PAD}" y="280" class="small-text">{html.escape(str(phone))}</text>
  <text x="{PAD}" y="300" class="address-text">{html.escape(addr)}</text>

  <line x1="{PAD}" y1="320" x2="{W - PAD}" y2="320" class="dash-line"/>

  <!-- WEIGHT METRICS -->
  <text x="{PAD}" y="342" class="section-title">WEIGHT METRICS / METRICAS DE PESO</text>

  <rect x="{B1_X}" y="354" width="{BOX_W}" height="{BOX_H}" rx="5" fill="white" stroke="#111" stroke-width="1"/>
  <text x="{BC_1}" y="372" text-anchor="middle" class="metric-label">EST. LBS</text>
  <text x="{BC_1}" y="401" text-anchor="middle" class="metric-value">{html.escape(est_lbs)}</text>

  <rect x="{B2_X}" y="354" width="{BOX_W}" height="{BOX_H}" rx="5" fill="white" stroke="#111" stroke-width="1"/>
  <text x="{BC_2}" y="372" text-anchor="middle" class="metric-label">ACTUAL LBS</text>
  <text x="{BC_2}" y="401" text-anchor="middle" class="metric-value">{html.escape(act_lbs)}</text>

  <rect x="{B3_X}" y="354" width="{BOX_W}" height="{BOX_H}" rx="5" fill="white" stroke="#111" stroke-width="1"/>
  <text x="{BC_3}" y="372" text-anchor="middle" class="metric-label">RATE/LB</text>
  <text x="{BC_3}" y="401" text-anchor="middle" class="metric-value">{html.escape(rate)}</text>

  <line x1="{PAD}" y1="420" x2="{W - PAD}" y2="420" class="dash-line"/>

  <!-- PRICE BREAKDOWN -->
  <text x="{PAD}" y="437" class="section-title">PRICE BREAKDOWN / DESGLOSE</text>

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
    models     = ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"]
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