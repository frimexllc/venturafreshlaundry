"""Unit tests for backend/domain/notifications.py.

Pure — no server, no database, safe to run anytime.
"""

from domain.notifications import (
    normalize_service_category,
    should_notify_for_status,
)


# ── normalize_service_category ──────────────────────────────────────────────

def test_wash_and_fold_variants_map_to_wash_fold():
    assert normalize_service_category("Wash & Fold") == "wash_fold"
    assert normalize_service_category("wash_fold") == "wash_fold"
    assert normalize_service_category("Fold Service") == "wash_fold"


def test_self_service_maps_to_self_service():
    assert normalize_service_category("Self Service") == "self_service"


def test_pickup_delivery_and_unknown_default_to_pickup_delivery():
    assert normalize_service_category("Pickup & Delivery") == "pickup_delivery"
    assert normalize_service_category("airbnb_host") == "pickup_delivery"
    assert normalize_service_category("commercial") == "pickup_delivery"
    assert normalize_service_category(None) == "pickup_delivery"
    assert normalize_service_category("") == "pickup_delivery"


# ── should_notify_for_status ────────────────────────────────────────────────

def test_pickup_scheduled_never_notifies():
    # Even if it were somehow the configured milestone, this is an internal
    # scheduling step, not something worth texting the customer about.
    assert should_notify_for_status("pickup_scheduled", configured_status="pickup_scheduled") is False


def test_critical_milestones_always_notify_regardless_of_config():
    assert should_notify_for_status("delivered", configured_status=None) is True
    assert should_notify_for_status("completed", configured_status="processing") is True
    assert should_notify_for_status("cancelled", configured_status="processing") is True


def test_unconfigured_rule_defaults_to_notify_every_status():
    assert should_notify_for_status("confirmed", configured_status=None) is True
    assert should_notify_for_status("processing", configured_status=None) is True


def test_configured_status_only_notifies_on_that_exact_status():
    # Regression: this is the actual "reduce excessive notifications" fix —
    # once an admin configures a single intermediate milestone, every OTHER
    # intermediate status must stay silent.
    assert should_notify_for_status("processing", configured_status="ready") is False
    assert should_notify_for_status("confirmed", configured_status="ready") is False
    assert should_notify_for_status("ready", configured_status="ready") is True


def test_status_comparison_is_case_and_whitespace_insensitive():
    assert should_notify_for_status("  READY  ", configured_status="ready") is True
