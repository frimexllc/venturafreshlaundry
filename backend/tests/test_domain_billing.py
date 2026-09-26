"""Unit tests for backend/domain/billing.py.

Pure — no server, no database, safe to run anytime. Several of these are
direct regression tests for overcharge bugs documented in the historical
"FIX" comments this module was extracted from; a future refactor breaking
one of them should fail loudly here, not surface as a wrong charge.
"""

from domain.billing import (
    PD_MINIMUM_CHARGE,
    compute_amount_to_charge,
    compute_checkout_amount_from_known_coverage,
    compute_order_billing,
    get_rate,
    is_active_member,
    is_order_before_membership,
    normalize_service_type,
)


def make_order(**overrides):
    order = {
        "service_type": "pickup_delivery",
        "service_plan": "standard",
        "actual_lbs": 20,
        "payment_method": "cash",
        "addon_services": [],
    }
    order.update(overrides)
    return order


def make_member_customer(**overrides):
    customer = {
        "id": "cust-1",
        "membership_status": "active",
        "membership_plan": "Standard",
    }
    customer.update(overrides)
    return customer


# ── normalize_service_type / get_rate ───────────────────────────────────────

def test_normalize_service_type_variants():
    assert normalize_service_type("Wash & Fold") == "wash_fold"
    assert normalize_service_type("Self Service Standard") == "pickup_delivery"
    assert normalize_service_type("commercial") == "commercial"
    assert normalize_service_type(None) == "pickup_delivery"


def test_get_rate_member_vs_regular():
    assert get_rate("pickup_delivery", "standard", is_member=False) == 2.75
    assert get_rate("pickup_delivery", "standard", is_member=True) == 2.50
    assert get_rate("wash_fold", "standard", is_member=True) == 2.25  # same both ways


# ── is_active_member ─────────────────────────────────────────────────────────

def test_is_active_member_true_with_plan():
    assert is_active_member(None, {"membership_status": "active", "membership_plan": "Standard"}) is True


def test_is_active_member_false_when_paused_or_cancelled():
    assert is_active_member(None, {"membership_status": "paused", "membership_plan": "Standard"}) is False
    assert is_active_member(None, {"membership_status": "cancelled", "membership_plan": "Standard"}) is False


def test_is_active_member_false_without_plan():
    assert is_active_member(None, {"membership_status": "active", "membership_plan": None}) is False


# ── is_order_before_membership ──────────────────────────────────────────────

def test_order_before_membership_start():
    order = {"created_at": "2026-01-01T00:00:00Z"}
    customer = {"membership_start_date": "2026-02-01T00:00:00Z"}
    assert is_order_before_membership(order, customer) is True


def test_order_after_membership_start():
    order = {"created_at": "2026-03-01T00:00:00Z"}
    customer = {"membership_start_date": "2026-02-01T00:00:00Z"}
    assert is_order_before_membership(order, customer) is False


# ── compute_order_billing: non-member ───────────────────────────────────────

def test_non_member_billed_at_regular_rate():
    result = compute_order_billing(make_order(actual_lbs=20), customer=None)
    assert result["amount_to_charge"] == 55.0  # 20 * 2.75
    assert result["total"] == 55.0
    assert result["is_member"] is False


def test_non_member_below_minimum_charges_pd_minimum():
    result = compute_order_billing(make_order(actual_lbs=5), customer=None)
    assert result["amount_to_charge"] == PD_MINIMUM_CHARGE
    assert result["total"] == 40.0


def test_wash_fold_uses_minimum_lbs_not_minimum_charge():
    # 5 lbs of wash & fold bills at the 10 lb minimum, but PD_MINIMUM_CHARGE
    # ($40) never applies to wash & fold at all.
    order = make_order(service_type="wash_fold", actual_lbs=5)
    result = compute_order_billing(order, customer=None)
    assert result["billable_lbs"] == 10
    assert result["amount_to_charge"] == 22.5  # 10 * 2.25


# ── compute_order_billing: membership allowance coverage ───────────────────

def test_member_fully_covered_by_allowance_is_free():
    order = make_order(actual_lbs=20)
    customer = make_member_customer()
    result = compute_order_billing(order, customer, remaining_allowance=30)
    assert result["lbs_covered"] == 20.0
    assert result["amount_to_charge"] == 0.0
    assert result["fully_covered_by_membership"] is True
    assert result["total"] == 0.0


def test_member_exceeding_allowance_charges_extra_lbs_at_member_rate():
    # Regression: extra lbs beyond the allowance used to be charged at
    # regular_rate (27.5 here) instead of member_rate (25.0) — a systematic
    # overcharge to every member whose order exceeded their allowance.
    order = make_order(actual_lbs=20)
    customer = make_member_customer()
    result = compute_order_billing(order, customer, remaining_allowance=10)
    assert result["lbs_covered"] == 10.0
    assert result["lbs_extra"] == 10.0
    assert result["amount_to_charge"] == 25.0  # 10 * member_rate(2.50), not regular(2.75)
    assert result["fully_covered_by_membership"] is False


def test_member_with_zero_remaining_allowance_still_gets_member_rate():
    # Regression: a member with no allowance left used to fall through to
    # amount_to_charge computed at regular_rate. It must still be the
    # member rate for ALL billable lbs, not the regular rate.
    order = make_order(actual_lbs=20)
    customer = make_member_customer()
    result = compute_order_billing(order, customer, remaining_allowance=0)
    assert result["lbs_covered"] == 0.0
    assert result["amount_to_charge"] == 50.0  # 20 * member_rate(2.50), not regular(2.75)=55.0


def test_membership_discount_reported_even_without_allowance_coverage():
    # Regression: membership_discount used to be reported as 0.0 whenever
    # lbs_covered was 0, even though the member was still saving money via
    # the member rate vs. what a non-member would pay.
    order = make_order(actual_lbs=20)
    customer = make_member_customer()
    result = compute_order_billing(order, customer, remaining_allowance=0)
    assert result["membership_discount"] == 5.0  # 55.0 (regular) - 50.0 (member)


def test_order_predating_membership_gets_no_allowance_coverage():
    order = make_order(actual_lbs=20, created_at="2026-01-01T00:00:00Z")
    customer = make_member_customer(membership_start_date="2026-02-01T00:00:00Z")
    # Even though a generous remaining_allowance is passed in, the order
    # predates the membership so it must not be applied.
    result = compute_order_billing(order, customer, remaining_allowance=100)
    assert result["lbs_covered"] == 0.0
    assert result["amount_to_charge"] == 50.0  # still member rate, just no allowance coverage


def test_premium_plan_allowance_surcharge_still_applies_when_fully_covered():
    order = make_order(actual_lbs=20, service_plan="premium")
    customer = make_member_customer(membership_plan="Premium")
    result = compute_order_billing(order, customer, remaining_allowance=30)
    assert result["lbs_covered"] == 20.0
    assert result["allowance_surcharge_charge"] == 5.0  # 20 * 0.25 speed surcharge
    assert result["amount_to_charge"] == 5.0
    # Surcharge > 0 means NOT fully free even though all lbs are covered.
    assert result["fully_covered_by_membership"] is False


# ── compute_order_billing: add-ons and totals ───────────────────────────────

def test_extra_charge_always_equals_total():
    # Regression: "extra_charge" used to reflect only the per-lb amount,
    # silently dropping delivery fee and add-ons for any caller that read
    # extra_charge assuming it was already the full total.
    order = make_order(actual_lbs=20, addon_services=[{"price": 10, "qty": 1}])
    result = compute_order_billing(order, customer=None, delivery_fee=3.0)
    assert result["extra_charge"] == result["total"]
    assert result["total"] == 55.0 + 10.0 + 3.0


def test_addon_price_uses_custom_price_override():
    # Regression: a custom_price hand-edited by an operator used to be
    # ignored by the real charge (only the printed ticket respected it).
    order = make_order(actual_lbs=None, addon_services=[{"price": 20, "custom_price": 15, "qty": 1}])
    result = compute_order_billing(order, customer=None)
    assert result["addons_total"] == 15.0
    assert result["total"] == 15.0


def test_addon_only_order_with_no_weight_yet():
    order = make_order(actual_lbs=None, addon_services=[{"price": 20, "qty": 1}])
    result = compute_order_billing(order, customer=None)
    assert result["is_addon_only"] is True
    assert result["total"] == 20.0
    assert result["extra_charge"] == 20.0


def test_addon_only_order_applies_card_processing_fee():
    order = make_order(actual_lbs=None, addon_services=[{"price": 20, "qty": 1}], payment_method="card")
    result = compute_order_billing(order, customer=None, delivery_fee=5.0)
    # (20 + 5) * 1.03 = 25.75
    assert result["total"] == 25.75


def test_no_weight_and_no_addons_returns_none():
    order = make_order(actual_lbs=None, addon_services=[])
    assert compute_order_billing(order, customer=None) is None


def test_zero_weight_and_no_addons_returns_none():
    order = make_order(actual_lbs=0, addon_services=[])
    assert compute_order_billing(order, customer=None) is None


# ── compute_amount_to_charge: the shared minimum-charge rule ───────────────

def test_minimum_charge_applies_to_member_with_no_coverage():
    # Regression: the customer-checkout fast-path in routes/customer.py used
    # to have its own copy of this formula that only applied the $40 minimum
    # inside the non-member branch — a member with an exhausted allowance
    # and a small order got undercharged. The documented rule is "no
    # allowance coverage" (lbs_covered == 0), not "non-member".
    amount = compute_amount_to_charge(
        billable_lbs=5, is_wf=False, is_member=True,
        regular_rate=2.75, member_rate=2.50, allowance_surcharge=0.0,
        lbs_covered=0.0, lbs_extra=5, allowance_surcharge_charge=0.0,
    )
    assert amount == PD_MINIMUM_CHARGE


def test_minimum_charge_skipped_when_allowance_covers_some_lbs():
    # Even a tiny order doesn't get the minimum bumped if it has ANY
    # allowance coverage — matches the documented example (65 lb order with
    # 60 lb allowance: no minimum applied to the 5 extra lbs).
    amount = compute_amount_to_charge(
        billable_lbs=5, is_wf=False, is_member=True,
        regular_rate=2.75, member_rate=2.50, allowance_surcharge=0.0,
        lbs_covered=2.0, lbs_extra=3.0, allowance_surcharge_charge=0.0,
    )
    assert amount == 7.50  # 3 * member_rate(2.50), no minimum bump
    assert amount < PD_MINIMUM_CHARGE


def test_minimum_charge_never_applies_to_wash_fold():
    amount = compute_amount_to_charge(
        billable_lbs=10, is_wf=True, is_member=False,
        regular_rate=2.25, member_rate=2.25, allowance_surcharge=0.0,
        lbs_covered=0.0, lbs_extra=10, allowance_surcharge_charge=0.0,
    )
    assert amount == 22.5  # 10 * 2.25, well under $40, no bump because is_wf


# ── compute_checkout_amount_from_known_coverage ─────────────────────────────

def test_checkout_fast_path_matches_full_calculation_for_a_covered_member():
    order = make_order(actual_lbs=20)
    customer = make_member_customer()
    full = compute_order_billing(order, customer, remaining_allowance=10)
    fast = compute_checkout_amount_from_known_coverage(
        order, customer, lbs_covered=full["lbs_covered"], lbs_extra=full["lbs_extra"],
    )
    assert fast == full["amount_to_charge"]


def test_checkout_fast_path_applies_minimum_for_exhausted_allowance_member():
    # The exact bug scenario: small order, member, allowance fully used up
    # this cycle (lbs_covered/lbs_extra as they'd be read back from a
    # previously-stored breakdown).
    order = make_order(actual_lbs=5)
    customer = make_member_customer()
    amount = compute_checkout_amount_from_known_coverage(
        order, customer, lbs_covered=0.0, lbs_extra=5.0,
    )
    assert amount == PD_MINIMUM_CHARGE


def test_checkout_fast_path_addon_only_no_weight():
    order = make_order(actual_lbs=None, addon_services=[{"price": 20, "qty": 1}])
    amount = compute_checkout_amount_from_known_coverage(order, customer=None, lbs_covered=0.0, lbs_extra=0.0)
    assert amount == 20.0


def test_checkout_fast_path_no_weight_no_addons_returns_none():
    order = make_order(actual_lbs=None, addon_services=[])
    assert compute_checkout_amount_from_known_coverage(order, customer=None, lbs_covered=0.0, lbs_extra=0.0) is None
