"""Unit tests for backend/domain/membership.py.

Unlike the rest of this tests/ folder, these do NOT hit a running server or
a database — they call pure functions directly with plain data, so they're
safe to run anytime without touching the shared production MongoDB.
"""

from datetime import datetime, timezone

from domain.membership import (
    calculate_prorated_amount,
    calculate_total_with_stripe_fee,
    compute_billing_cycle,
    compute_cycle_usage,
    get_customer_membership_due_date,
    get_next_renewal_date,
    get_plan_allowance_fallback,
    get_plan_price_fallback,
    parse_membership_datetime,
)


# ── calculate_total_with_stripe_fee ─────────────────────────────────────────

def test_stripe_fee_grossup_nets_the_original_amount():
    amount = 139.00
    charged = calculate_total_with_stripe_fee(amount, fee_percentage=0.03)
    net = charged * (1 - 0.03)
    assert round(net, 2) == amount


def test_stripe_fee_grossup_zero_or_negative_amount_is_zero():
    assert calculate_total_with_stripe_fee(0) == 0.0
    assert calculate_total_with_stripe_fee(-10) == 0.0


# ── calculate_prorated_amount ───────────────────────────────────────────────

def test_prorated_amount_upgrade_mid_cycle():
    # $60 more expensive plan, 15 days left in a 30-day cycle -> half the diff
    assert calculate_prorated_amount(old_price=139.00, new_price=199.00, days_remaining=15) == 30.00


def test_prorated_amount_downgrade_charges_nothing():
    assert calculate_prorated_amount(old_price=199.00, new_price=139.00, days_remaining=15) == 0.00


def test_prorated_amount_same_price_charges_nothing():
    assert calculate_prorated_amount(old_price=139.00, new_price=139.00, days_remaining=15) == 0.00


def test_prorated_amount_no_days_remaining_charges_full_new_price():
    assert calculate_prorated_amount(old_price=139.00, new_price=199.00, days_remaining=0) == 199.00


# ── plan fallback tables ────────────────────────────────────────────────────

def test_plan_price_fallback_matches_known_plan():
    assert get_plan_price_fallback("Family Plus") == 199.00


def test_plan_price_fallback_unknown_plan_uses_default():
    assert get_plan_price_fallback("totally unknown plan") == 139.00


def test_plan_allowance_fallback_is_case_insensitive():
    # Regression: "SIGNATURE ELITE" used to fail this lookup because the
    # table only had a lowercase key and the comparison was case-sensitive.
    assert get_plan_allowance_fallback("SIGNATURE ELITE") == 200
    assert get_plan_allowance_fallback("signature elite") == 200


def test_plan_allowance_fallback_unknown_plan_is_zero():
    assert get_plan_allowance_fallback("no such plan") == 0


# ── renewal / due date ──────────────────────────────────────────────────────

def test_next_renewal_date_is_30_days_later():
    start = datetime(2026, 1, 1, tzinfo=timezone.utc)
    assert get_next_renewal_date(start) == datetime(2026, 1, 31, tzinfo=timezone.utc)


def test_parse_membership_datetime_handles_z_suffix_iso_string():
    parsed = parse_membership_datetime("2026-01-01T00:00:00Z")
    assert parsed == datetime(2026, 1, 1, tzinfo=timezone.utc)


def test_parse_membership_datetime_none_for_missing_value():
    assert parse_membership_datetime(None) is None
    assert parse_membership_datetime("") is None


def test_customer_membership_due_date_combines_parse_and_renewal():
    customer = {"membership_start_date": "2026-01-01T00:00:00Z"}
    assert get_customer_membership_due_date(customer) == datetime(2026, 1, 31, tzinfo=timezone.utc)


def test_customer_membership_due_date_missing_start_date_is_none():
    assert get_customer_membership_due_date({}) is None


# ── billing cycle ───────────────────────────────────────────────────────────

def test_billing_cycle_anchors_on_membership_start_day():
    membership_start = datetime(2026, 1, 10, tzinfo=timezone.utc)
    now = datetime(2026, 3, 15, tzinfo=timezone.utc)
    cycle = compute_billing_cycle(membership_start, now)
    assert cycle["cycle_start"] == datetime(2026, 3, 10, tzinfo=timezone.utc)
    assert cycle["cycle_end"] == datetime(2026, 4, 10, tzinfo=timezone.utc)


def test_billing_cycle_before_anchor_day_uses_previous_month():
    membership_start = datetime(2026, 1, 20, tzinfo=timezone.utc)
    now = datetime(2026, 3, 5, tzinfo=timezone.utc)  # before the 20th
    cycle = compute_billing_cycle(membership_start, now)
    assert cycle["cycle_start"] == datetime(2026, 2, 20, tzinfo=timezone.utc)
    assert cycle["cycle_end"] == datetime(2026, 3, 20, tzinfo=timezone.utc)


def test_billing_cycle_caps_anchor_day_at_28_for_short_months():
    # A membership that started on the 31st anchors on the 28th (there's no
    # 31st in February). "now" is Feb 15, before this month's 28th anchor,
    # so the active cycle is still the one that started Jan 28 and runs
    # through Feb 28 — this is exactly the kind of edge case that's easy to
    # get wrong when the date math is buried inside a DB-touching function.
    membership_start = datetime(2026, 1, 31, tzinfo=timezone.utc)
    now = datetime(2026, 2, 15, tzinfo=timezone.utc)
    cycle = compute_billing_cycle(membership_start, now)
    assert cycle["cycle_start"] == datetime(2026, 1, 28, tzinfo=timezone.utc)
    assert cycle["cycle_end"] == datetime(2026, 2, 28, tzinfo=timezone.utc)


def test_billing_cycle_december_to_january_rolls_the_year():
    membership_start = datetime(2025, 6, 15, tzinfo=timezone.utc)
    now = datetime(2026, 1, 5, tzinfo=timezone.utc)  # before the 15th
    cycle = compute_billing_cycle(membership_start, now)
    assert cycle["cycle_start"] == datetime(2025, 12, 15, tzinfo=timezone.utc)
    assert cycle["cycle_end"] == datetime(2026, 1, 15, tzinfo=timezone.utc)


def test_billing_cycle_effective_start_clamped_to_membership_start():
    # A membership that started mid-cycle must not get credited usage from
    # before it existed.
    membership_start = datetime(2026, 3, 8, tzinfo=timezone.utc)
    now = datetime(2026, 3, 15, tzinfo=timezone.utc)
    cycle = compute_billing_cycle(membership_start, now)
    assert cycle["effective_start"] == membership_start


# ── cycle usage ──────────────────────────────────────────────────────────────

def test_cycle_usage_basic_math():
    usage = compute_cycle_usage(lbs_allowance=60, orders_lbs=40, manual_adjustment=0)
    assert usage == {"lbs_used": 40.0, "lbs_remaining": 20.0, "pct_used": 66.7}


def test_cycle_usage_manual_adjustment_is_added_as_offset():
    # Regression: a manual admin adjustment (cycle_lbs_used) used to be
    # silently ignored by every caller except one specific endpoint.
    usage = compute_cycle_usage(lbs_allowance=60, orders_lbs=40, manual_adjustment=10)
    assert usage["lbs_used"] == 50.0
    assert usage["lbs_remaining"] == 10.0


def test_cycle_usage_never_goes_negative_lbs_used():
    usage = compute_cycle_usage(lbs_allowance=60, orders_lbs=5, manual_adjustment=-100)
    assert usage["lbs_used"] == 0.0
    assert usage["lbs_remaining"] == 60.0


def test_cycle_usage_over_allowance_clamps_remaining_to_zero():
    usage = compute_cycle_usage(lbs_allowance=60, orders_lbs=90, manual_adjustment=0)
    assert usage["lbs_used"] == 90.0
    assert usage["lbs_remaining"] == 0.0


def test_cycle_usage_zero_allowance_does_not_divide_by_zero():
    usage = compute_cycle_usage(lbs_allowance=0, orders_lbs=10, manual_adjustment=0)
    assert usage["pct_used"] == 0.0
