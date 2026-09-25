"""Pure membership business logic.

No database access and no HTTP framework imports on purpose: every function
here takes plain data (dicts, numbers, datetimes) and returns plain data, so
it can be unit-tested directly without a running server or database. The
async functions in routes/services.py and utils.py that need live plan
prices/allowances or order history fetch that data separately and delegate
the actual calculation to the functions below.
"""

from datetime import datetime, timedelta, timezone
from typing import Dict, Optional

STRIPE_FEE_PERCENTAGE: float = 0.03  # 3% Stripe processing fee

PLAN_PRICE_FALLBACK: Dict[str, float] = {
    "most popular": 139.00,
    "popular": 139.00,
    "standard": 139.00,
    "family plus": 199.00,
    "family": 199.00,
    "elite concierge": 299.00,
    "elite": 299.00,
    "concierge": 299.00,
}
DEFAULT_PLAN_PRICE: float = 139.00

PLAN_ALLOWANCE_FALLBACK: Dict[str, int] = {
    "most popular": 60,
    "popular": 60,
    "standard": 60,
    "basic": 60,
    "family plus": 90,
    "family": 90,
    "familyplus": 90,
    "elite concierge": 120,
    "elite": 120,
    "concierge": 120,
    "executive premium": 200,
    "executive": 200,
    "signature elite": 200,
    "mamamia": 500,
}

RENEWAL_PERIOD_DAYS = 30


def get_plan_price_fallback(plan_name: str) -> float:
    """Hardcoded plan price, used when the plan isn't found in the DB (or as
    the last-resort default for an unrecognized plan name)."""
    if not plan_name:
        return DEFAULT_PLAN_PRICE
    key = plan_name.strip().lower()
    for known_key, price in PLAN_PRICE_FALLBACK.items():
        if known_key in key or key in known_key:
            return price
    return DEFAULT_PLAN_PRICE


def get_plan_allowance_fallback(plan_name: str) -> int:
    """Hardcoded lbs allowance, used when the plan isn't found in the DB."""
    if not plan_name:
        return 0
    key = plan_name.strip().lower().replace("_", " ").replace("-", " ")
    if key in PLAN_ALLOWANCE_FALLBACK:
        return PLAN_ALLOWANCE_FALLBACK[key]
    for known_key, allowance in PLAN_ALLOWANCE_FALLBACK.items():
        if key in known_key or known_key in key:
            return allowance
    return 0


def calculate_total_with_stripe_fee(amount: float, fee_percentage: float = STRIPE_FEE_PERCENTAGE) -> float:
    """Grosses up `amount` so that after Stripe's percentage fee is taken
    out, the merchant still nets `amount`."""
    if amount <= 0:
        return 0.0
    return round(amount / (1 - fee_percentage), 2)


def calculate_prorated_amount(old_price: float, new_price: float, days_remaining: int) -> float:
    """Prorated charge for switching mid-cycle from `old_price` to
    `new_price`. Downgrades (or an unchanged price) charge nothing extra
    until the next renewal."""
    if days_remaining <= 0:
        return new_price
    if new_price > old_price:
        difference = new_price - old_price
        prorated = difference * (days_remaining / RENEWAL_PERIOD_DAYS)
        return round(prorated, 2)
    return 0.00


def get_next_renewal_date(start_date: datetime) -> datetime:
    return start_date + timedelta(days=RENEWAL_PERIOD_DAYS)


def parse_membership_datetime(value) -> Optional[datetime]:
    """Parses a membership-related timestamp from either a datetime or an
    ISO string, normalizing it to timezone-aware UTC."""
    if not value:
        return None
    if isinstance(value, datetime):
        parsed = value
    else:
        try:
            parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        except Exception:
            return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def get_customer_membership_due_date(customer: dict) -> Optional[datetime]:
    start_date = parse_membership_datetime(customer.get("membership_start_date"))
    if not start_date:
        return None
    return get_next_renewal_date(start_date)


def compute_billing_cycle(membership_start: datetime, now: datetime) -> dict:
    """Computes the current monthly billing-cycle window for a membership.

    The cycle "anchors" on the day of month the membership started (capped
    at 28 so it always exists in every month), chosen so the window always
    contains `now`. `effective_start` clamps the cycle start to the
    membership's actual start date, so a membership that began mid-cycle
    never gets credited usage from before it existed.
    """
    anchor_day = min(membership_start.day, 28)

    cycle_start = now.replace(day=anchor_day, hour=0, minute=0, second=0, microsecond=0)
    if cycle_start > now:
        prev_month = cycle_start.month - 1 or 12
        prev_year = cycle_start.year - (1 if prev_month == 12 else 0)
        cycle_start = cycle_start.replace(year=prev_year, month=prev_month)

    next_month = cycle_start.month % 12 + 1
    next_year = cycle_start.year + (1 if next_month == 1 else 0)
    cycle_end = cycle_start.replace(year=next_year, month=next_month)

    effective_start = max(cycle_start, membership_start)

    return {
        "cycle_start": cycle_start,
        "cycle_end": cycle_end,
        "effective_start": effective_start,
    }


def compute_cycle_usage(lbs_allowance: float, orders_lbs: float, manual_adjustment: float = 0.0) -> dict:
    """Combines real order weight with any manual admin adjustment into the
    final usage numbers shown to staff and customers. `manual_adjustment` is
    an offset (can be negative) recorded separately from live order totals —
    see the `cycle_lbs_used` field on the customer document."""
    lbs_used = round(max(0.0, orders_lbs + manual_adjustment), 1)
    lbs_remaining = max(0.0, lbs_allowance - lbs_used)
    pct_used = round((lbs_used / lbs_allowance) * 100, 1) if lbs_allowance else 0.0
    return {
        "lbs_used": lbs_used,
        "lbs_remaining": round(lbs_remaining, 1),
        "pct_used": pct_used,
    }
