"""Unit tests for backend/domain/delivery.py.

Like test_domain_membership.py, these are pure — no server, no database,
safe to run anytime. A couple of tests explicitly pass `tiers=` so the
assertions don't depend on whatever DELIVERY_TIERS happens to be set in
the environment this test runs in.
"""

from domain.delivery import (
    DEFAULT_DELIVERY_FEE_TIERS,
    calculate_delivery_fee,
    get_delivery_info,
    haversine_miles,
    parse_tiers_from_string,
)


# ── calculate_delivery_fee ──────────────────────────────────────────────────

def test_fee_is_free_within_first_tier():
    assert calculate_delivery_fee(2.0, tiers=DEFAULT_DELIVERY_FEE_TIERS) == 0.00


def test_fee_at_exact_tier_boundary_uses_that_tier():
    # Boundaries are inclusive ("<= max_miles"), so exactly 3 miles is free.
    assert calculate_delivery_fee(3.0, tiers=DEFAULT_DELIVERY_FEE_TIERS) == 0.00
    assert calculate_delivery_fee(3.01, tiers=DEFAULT_DELIVERY_FEE_TIERS) == 1.99


def test_fee_middle_tiers():
    assert calculate_delivery_fee(5.0, tiers=DEFAULT_DELIVERY_FEE_TIERS) == 1.99
    assert calculate_delivery_fee(8.0, tiers=DEFAULT_DELIVERY_FEE_TIERS) == 2.99
    assert calculate_delivery_fee(12.0, tiers=DEFAULT_DELIVERY_FEE_TIERS) == 4.99
    assert calculate_delivery_fee(15.0, tiers=DEFAULT_DELIVERY_FEE_TIERS) == 8.99


def test_fee_beyond_last_tier_is_capped_not_extrapolated():
    # Regression: one of the four duplicated copies of this logic charged
    # an open-ended $1.50/mile beyond the last tier instead of capping —
    # the consolidated version always caps at the last tier's flat fee.
    assert calculate_delivery_fee(50.0, tiers=DEFAULT_DELIVERY_FEE_TIERS) == 8.99


def test_fee_none_distance_is_zero():
    assert calculate_delivery_fee(None, tiers=DEFAULT_DELIVERY_FEE_TIERS) == 0.0


def test_fee_invalid_distance_is_zero():
    assert calculate_delivery_fee("not a number", tiers=DEFAULT_DELIVERY_FEE_TIERS) == 0.0


# ── parse_tiers_from_string ─────────────────────────────────────────────────

def test_parse_tiers_matches_default_table_shape():
    parsed = parse_tiers_from_string("3:0,5:1.99,8:2.99,12:4.99,15:8.99")
    assert [t["max_miles"] for t in parsed] == [3, 5, 8, 12, 15]
    assert [t["fee"] for t in parsed] == [0, 1.99, 2.99, 4.99, 8.99]


def test_parse_tiers_empty_string_returns_none():
    assert parse_tiers_from_string("") is None
    assert parse_tiers_from_string(None) is None


def test_parse_tiers_malformed_entries_are_skipped():
    parsed = parse_tiers_from_string("3:0,garbage,5:1.99")
    assert [t["max_miles"] for t in parsed] == [3, 5]


def test_parse_tiers_all_malformed_returns_none():
    assert parse_tiers_from_string("garbage,also garbage") is None


# ── get_delivery_info ───────────────────────────────────────────────────────

def test_delivery_info_within_range():
    info = get_delivery_info(7.0, tiers=DEFAULT_DELIVERY_FEE_TIERS, max_service_miles=15.0)
    assert info["fee"] == 2.99
    assert info["is_free"] is False
    assert info["allowed"] is True
    assert info["tier"]["max_miles"] == 8


def test_delivery_info_beyond_max_service_miles_is_not_allowed():
    # This is the flag real callers gate charging on — get_delivery_info
    # still returns a (capped) fee for a too-far address, but "allowed"
    # is False so nothing should actually charge it.
    info = get_delivery_info(20.0, tiers=DEFAULT_DELIVERY_FEE_TIERS, max_service_miles=15.0)
    assert info["allowed"] is False
    assert info["fee"] == 8.99


def test_delivery_info_free_tier():
    info = get_delivery_info(1.5, tiers=DEFAULT_DELIVERY_FEE_TIERS, max_service_miles=15.0)
    assert info["is_free"] is True
    assert info["fee"] == 0.0


def test_delivery_info_none_distance():
    info = get_delivery_info(None, tiers=DEFAULT_DELIVERY_FEE_TIERS, max_service_miles=15.0)
    assert info["fee"] == 0.0
    assert info["allowed"] is False
    assert info["tier"] is None


# ── haversine_miles ──────────────────────────────────────────────────────────

def test_haversine_same_point_is_zero():
    assert haversine_miles(34.264309, -119.213742, 34.264309, -119.213742) == 0.0


def test_haversine_known_distance_is_reasonable():
    # Store address (Ventura, CA) to Santa Barbara City Hall — roughly 25-30
    # miles by air, a loose bound just to catch a badly broken formula.
    dist = haversine_miles(34.264309, -119.213742, 34.4237, -119.7025)
    assert 20 < dist < 35
