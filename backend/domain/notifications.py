"""Pure order-status notification-eligibility rules.

No database or HTTP framework imports. Decides whether a status change
should trigger a customer notification (SMS/email) — logic that used to
be duplicated (and, in one case, missing entirely) across three separate
order-status-update endpoints:

- routes/orders.py correctly consulted the configurable per-service-type
  rule (reglas_negocio.auto_transitions.<category>.notify_status).
- automation_engine.py's endpoint — the one the main operator dashboard
  actually calls — didn't consult it at all, so it notified on every
  status change regardless of what the admin configured.
- routes/operator_routes.py used an older, simpler hardcoded blacklist
  that also ignored the configurable rule.

All three now delegate the actual decision to should_notify_for_status
below.
"""

from typing import Optional

# Statuses that never notify, regardless of configuration (an internal
# scheduling milestone, not something the customer needs to hear about).
NEVER_NOTIFY_STATUSES = {"pickup_scheduled"}

# Statuses that always notify — critical milestones the customer should
# hear about no matter what the configurable rule says.
ALWAYS_NOTIFY_STATUSES = {"delivered", "completed", "cancelled"}


def normalize_service_category(service_type: Optional[str]) -> str:
    """Maps a raw service_type string to one of the three categories the
    admin configures a notification milestone for."""
    s = (service_type or "pickup_delivery").strip().lower().replace(" ", "_")
    if "wash" in s or "fold" in s:
        return "wash_fold"
    if "self" in s:
        return "self_service"
    return "pickup_delivery"  # covers pickup_delivery, airbnb_host, commercial


def should_notify_for_status(status: str, configured_status: Optional[str]) -> bool:
    """
    Should a status change to `status` trigger a customer notification?

    `configured_status` is the single intermediate milestone the admin
    configured to notify on for this order's service category (from
    reglas_negocio.auto_transitions.<category>.notify_status) — None means
    "not configured", which defaults to notifying on every status.
    """
    status = (status or "").strip().lower()
    if status in NEVER_NOTIFY_STATUSES:
        return False
    if status in ALWAYS_NOTIFY_STATUSES:
        return True
    if not configured_status:
        return True
    return status == configured_status
