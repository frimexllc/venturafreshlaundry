"""Pure order-billing calculation — the single source of truth for how much
an order costs.

No database or HTTP framework imports. This is the highest-stakes module
extracted so far: it decides the dollar amount actually charged to a
customer. The historical "FIX" notes below are preserved from utils.py
because they document real overcharge bugs found in production — each one
now has a regression test in tests/test_domain_billing.py so it can't
silently come back during a future refactor.

compute_order_billing() takes `remaining_allowance` as a plain float
parameter rather than fetching it itself, because that's the one piece of
this calculation that genuinely requires a database round-trip (the
customer's current membership cycle usage). The caller in utils.py is
responsible for fetching it — only when the order actually qualifies for
membership coverage — and passing it in.
"""

from datetime import datetime, timezone
from typing import Any, Dict, Optional

# ── Pricing tables — single source of truth for per-lb rates ───────────────

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

PD_MINIMUM_CHARGE: float = 40.0
WF_MINIMUM_LBS: float = 10.0


def normalize_service_type(service_type: Optional[str]) -> str:
    s = (service_type or "pickup_delivery").strip().lower().replace(" ", "_")
    if s in ("airbnb_host", "commercial"):
        return s
    if "wash" in s or "fold" in s:
        return "wash_fold"
    return "pickup_delivery"


def get_rate(service_type: str, plan: str, is_member: bool) -> float:
    svc_key = normalize_service_type(service_type)
    tier_map = PRICING.get(svc_key, PRICING["pickup_delivery"])
    rates = tier_map.get(plan, tier_map["standard"])
    return rates["member"] if is_member else rates["regular"]


def is_active_member(order: Optional[dict], customer: Optional[dict]) -> bool:
    status_value = ""
    if customer:
        status_value = customer.get("membership_status") or ""
    elif order:
        status_value = order.get("membership_status") or ""
    status_normalized = " ".join(status_value.split()).strip().lower() if status_value else ""
    if status_normalized in ("inactive", "cancelled", "canceled", "expired", "paused"):
        return False
    if status_normalized in ("active", "current", "paid", "yes", "true"):
        plan = customer.get("membership_plan") if customer else (order.get("membership_plan") if order else None)
        return bool(plan)
    plan = customer.get("membership_plan") if customer else None
    if not plan and order:
        plan = order.get("membership_plan")
    return bool(plan)


def is_order_before_membership(order: dict, customer: dict) -> bool:
    membership_start_date = customer.get("membership_start_date")
    order_created_at = order.get("created_at")
    if not membership_start_date or not order_created_at:
        return False
    try:
        if isinstance(membership_start_date, str):
            mem_start_dt = datetime.fromisoformat(membership_start_date.replace("Z", "+00:00"))
        else:
            mem_start_dt = membership_start_date
        if mem_start_dt.tzinfo is None:
            mem_start_dt = mem_start_dt.replace(tzinfo=timezone.utc)
        if isinstance(order_created_at, str):
            order_dt = datetime.fromisoformat(order_created_at.replace("Z", "+00:00"))
        else:
            order_dt = order_created_at
        if order_dt.tzinfo is None:
            order_dt = order_dt.replace(tzinfo=timezone.utc)
        return order_dt < mem_start_dt
    except Exception:
        return False


def _addons_total(order: dict) -> float:
    total = 0.0
    for addon in (order.get("addon_services") or []):
        try:
            qty = int(addon.get("qty") or addon.get("quantity") or 1)
            # FIX v17: prioritize custom_price (an operator's hand-edited
            # price in OrderDetailDialog.jsx) over price. This function used
            # to read only "price", so an edited price was silently ignored
            # in the REAL charge even though the printed ticket (built
            # separately) respected it — the amount charged could disagree
            # with the amount printed on the ticket.
            raw_price = addon.get("custom_price")
            if raw_price in (None, ""):
                raw_price = addon.get("price")
            total += float(raw_price or 0) * qty
        except (TypeError, ValueError):
            pass
    return round(total, 2)


def compute_order_billing(
    order: dict,
    customer: Optional[dict],
    remaining_allowance: float = 0.0,
    delivery_fee: float = 0.0,
) -> Optional[Dict[str, Any]]:
    """The full billing breakdown for an order: per-lb charge, membership
    allowance coverage, minimum charge, delivery fee, add-ons, and the
    final total. Returns None when there's nothing billable yet (no
    weight recorded and no add-ons) — the caller should treat that as
    "not ready to bill", not as a zero-dollar order.

    `remaining_allowance` and `delivery_fee` are the two external
    dependencies (membership cycle usage and distance-based fee) — the
    caller resolves both before calling this.
    """
    addons_total = _addons_total(order)

    lbs_raw = order.get("actual_lbs")
    has_lbs = lbs_raw is not None
    if has_lbs:
        try:
            has_lbs = float(lbs_raw) > 0
        except (TypeError, ValueError):
            has_lbs = False

    if not has_lbs:
        if addons_total <= 0:
            return None
        payment_method = (order.get("payment_method") or "").strip().lower()
        total_before = round(addons_total + delivery_fee, 2)
        processing_fee = round(total_before * 0.03, 2) if payment_method in ("card", "stripe") else 0.0
        final_total = round(total_before + processing_fee, 2)
        return {
            "lbs": 0, "billable_lbs": 0,
            "plan": (order.get("service_plan") or "standard").strip().lower(),
            "is_member": False, "is_express": False,
            "regular_rate": 0.0, "member_rate": 0.0,
            "allowance_surcharge": 0.0, "allowance_surcharge_charge": 0.0,
            "lbs_covered": 0.0, "lbs_extra": 0.0,
            "lbs_from_allowance": 0.0, "extra_lbs_billed": 0.0,
            "membership_discount": 0.0,
            "subtotal": 0.0, "amount_to_charge": 0.0,
            # This is the total amount actually due (lbs + delivery + add-ons),
            # matching "total" — several callers read/write "extra_charge"
            # assuming it's already the full total.
            "extra_charge": final_total,
            "delivery_fee": delivery_fee, "addons_total": addons_total,
            "processing_fee": processing_fee,
            "subtotal_after_discount": total_before,
            "total": final_total,
            "currency": "USD",
            "fully_covered_by_membership": False,
            "is_addon_only": True, "membership_applied": False,
            "price_per_lb": 0.0, "rate_used": 0.0,
        }

    try:
        lbs = float(lbs_raw)
    except (TypeError, ValueError):
        return None
    if lbs <= 0:
        return None

    service_type = normalize_service_type(order.get("service_type") or "pickup_delivery")
    plan = (order.get("service_plan") or "standard").strip().lower()
    is_wf = service_type == "wash_fold"
    is_express = plan == "express"
    payment_method = (order.get("payment_method") or "").strip().lower()
    is_member = is_active_member(order, customer)

    regular_rate = get_rate(service_type, plan, False)
    member_rate = get_rate(service_type, plan, True)
    allowance_surch = MEMBERSHIP_ALLOWANCE_SURCHARGE.get(plan, 0.0)

    billable_lbs = max(lbs, WF_MINIMUM_LBS) if is_wf else lbs

    lbs_covered = 0.0
    lbs_extra = billable_lbs
    allowance_surch_charge = 0.0
    membership_discount = 0.0

    if is_member and customer and not is_order_before_membership(order, customer):
        if remaining_allowance > 0:
            lbs_covered = min(billable_lbs, remaining_allowance)
            lbs_extra = billable_lbs - lbs_covered
            allowance_surch_charge = round(lbs_covered * allowance_surch, 2)

    if lbs_covered > 0:
        # Lbs beyond the allowance are charged at the MEMBER rate, not the
        # regular one — the business rule ("after allowance is exhausted,
        # member rates apply to all extra lbs") was previously violated
        # here, overcharging every member whose order exceeded their
        # monthly allowance.
        amount_to_charge = round(allowance_surch_charge + lbs_extra * member_rate, 2)
    elif is_member:
        # Same case — a member with no remaining allowance coverage (used
        # up, or the order predates their membership) still pays the
        # member rate, not the regular one.
        amount_to_charge = round(billable_lbs * member_rate, 2)
    else:
        amount_to_charge = round(billable_lbs * regular_rate, 2)

    if not is_wf:
        full_regular_price = billable_lbs * regular_rate
        order_below_minimum = full_regular_price < PD_MINIMUM_CHARGE
        if order_below_minimum and lbs_covered == 0:
            amount_to_charge = max(amount_to_charge, PD_MINIMUM_CHARGE)

    if is_member:
        # Covers both the allowance-covered and no-coverage cases — the
        # discount is always "what a non-member would have paid" minus
        # what this member is actually being charged.
        full_regular = round(billable_lbs * regular_rate, 2)
        membership_discount = max(0.0, round(full_regular - amount_to_charge, 2))

    total_before = round(amount_to_charge + delivery_fee + addons_total, 2)
    processing_fee = 0.0

    fully_covered = (
        is_member
        and lbs_covered >= billable_lbs
        and allowance_surch == 0.0
        and addons_total == 0.0
        and delivery_fee == 0.0
    )
    if fully_covered:
        final_total = 0.0
        processing_fee = 0.0
    else:
        final_total = round(total_before + processing_fee, 2)

    return {
        "lbs": lbs,
        "billable_lbs": billable_lbs,
        "plan": plan,
        "is_member": is_member,
        "is_express": is_express,
        "regular_rate": regular_rate,
        "member_rate": member_rate,
        "rate_used": member_rate if (is_member and lbs_covered != billable_lbs) else regular_rate,
        "price_per_lb": member_rate if is_member else regular_rate,
        "allowance_surcharge": allowance_surch,
        "allowance_surcharge_charge": allowance_surch_charge,
        "lbs_covered": round(lbs_covered, 1),
        "lbs_extra": round(lbs_extra, 1),
        "lbs_from_allowance": round(lbs_covered, 1),
        "extra_lbs_billed": round(lbs_extra, 1),
        "subtotal": round(billable_lbs * regular_rate, 2),
        "membership_discount": round(membership_discount, 2),
        "amount_to_charge": round(amount_to_charge, 2),
        # The total amount actually due (lbs + delivery + add-ons), same as
        # "total" — kept identical to it because several callers read or
        # write "extra_charge" assuming it's already the full total, not
        # just the per-lb portion.
        "extra_charge": final_total,
        "delivery_fee": round(delivery_fee, 2),
        "addons_total": addons_total,
        "processing_fee": 0.0,
        "subtotal_after_discount": total_before,
        "total": final_total,
        "currency": "USD",
        "fully_covered_by_membership": fully_covered,
        "membership_applied": is_member and lbs_covered > 0,
        "is_addon_only": False,
    }
