"""Centralized Stripe charging service.

This module is the single place that talks to Stripe for automatic /
operator-triggered card charges. It replaces three previously separate,
divergent implementations that used to live in ``services/payments.py``,
``routes/orders.py`` (``operator_auto_charge_order``) and
``routes/customer.py`` (``charge_by_weight`` / ``operator_charge_order``).

Consolidating them fixes three real bugs found in the original code:

1. **Crash-after-charge**: the original ``services/payments.py`` referenced
   ``datetime`` / ``timezone`` without importing them, so recording a
   successful transaction raised ``NameError`` *after* the customer's card
   had already been charged — the caller would see a 500 error for a
   payment that actually succeeded.
2. **Double-charge risk**: none of the three implementations passed a
   Stripe ``idempotency_key``, and none of them locked the order before
   charging. A retried request (client timeout, an operator double
   tapping "charge", a cron re-run after a slow response) could charge
   the same order twice. This module derives a stable idempotency key per
   order + amount and atomically flips the order into a "processing"
   state before calling Stripe, so a concurrent/duplicate call
   short-circuits instead of charging again.
3. **Blocking the event loop**: the ``stripe`` Python SDK is synchronous.
   Calling it directly inside ``async def`` route handlers blocks the
   whole event loop for the duration of the network round-trip to Stripe.
   Every Stripe call here is offloaded via ``asyncio.to_thread``.
"""
import asyncio
import logging
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, Optional

import stripe

from database import db

logger = logging.getLogger(__name__)

MIN_CHARGEABLE_AMOUNT = 0.50  # Stripe's minimum charge amount in USD


class PaymentError(Exception):
    """Base class for payment-flow errors callers may want to branch on."""


class CustomerNotChargeable(PaymentError):
    """Raised when a customer has no usable saved payment method."""


class OrderAlreadyProcessing(PaymentError):
    """Raised when another charge attempt for this order is already in flight."""


@dataclass
class ChargeResult:
    """Outcome of a charge attempt, safe to serialize directly as a
    JSON API response via `.to_dict()`.
    """

    success: bool
    charged: bool = False
    amount_charged: float = 0.0
    payment_intent_id: Optional[str] = None
    error: Optional[str] = None
    decline_code: Optional[str] = None
    suggest_action: Optional[str] = None
    extra: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        result: Dict[str, Any] = {
            "success": self.success,
            "charged": self.charged,
            "amount_charged": self.amount_charged,
        }
        if self.payment_intent_id:
            result["payment_intent_id"] = self.payment_intent_id
        if self.error:
            result["error"] = self.error
        if self.decline_code:
            result["decline_code"] = self.decline_code
        if self.suggest_action:
            result["suggest_action"] = self.suggest_action
        result.update(self.extra)
        return result


async def get_or_create_stripe_customer(customer: Dict[str, Any]) -> str:
    """Return the Stripe customer id for a customer document, creating one
    in Stripe (and persisting it back to Mongo) if it doesn't exist yet.
    """
    stripe_customer_id = customer.get("stripe_customer_id")
    if stripe_customer_id:
        return stripe_customer_id

    stripe_customer = await asyncio.to_thread(
        stripe.Customer.create,
        name=customer.get("name", ""),
        email=customer.get("email", ""),
        phone=customer.get("phone", ""),
        metadata={"internal_id": customer.get("id", "")},
    )
    stripe_customer_id = stripe_customer.id
    await db.customers.update_one(
        {"id": customer["id"]},
        {"$set": {
            "stripe_customer_id": stripe_customer_id,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }},
    )
    return stripe_customer_id


async def _release_order_claim(order_id: str) -> None:
    """Release the "processing" claim on an order after a failed charge
    attempt, so a future attempt isn't permanently blocked.
    """
    await db.orders.update_one(
        {"id": order_id, "payment_status": "processing"},
        {"$set": {
            "payment_status": "unpaid",
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }},
    )


async def charge_order_saved_card(
    *,
    order: Dict[str, Any],
    customer: Dict[str, Any],
    amount: float,
    description: str,
    metadata: Optional[Dict[str, str]] = None,
    finance_category: str = "service_payment_auto",
) -> ChargeResult:
    """Charge a customer's saved card for a specific order, exactly once.

    Safe to call concurrently or repeatedly for the same order: this
    function atomically claims the order (``payment_status`` ->
    ``"processing"``) before contacting Stripe, so a second concurrent
    call for the same order raises `OrderAlreadyProcessing` instead of
    issuing a second charge. Stripe is also given an idempotency key
    derived from the order id and amount, which protects against
    network-retry duplicate charges even across process restarts.

    Raises:
        CustomerNotChargeable: the customer has no saved card on file.
        OrderAlreadyProcessing: another charge attempt is in flight, or
            the order was already paid between the caller's check and
            this call.
    """
    order_id = order["id"]
    charge_metadata: Dict[str, str] = dict(metadata or {})
    charge_metadata.setdefault("order_id", order_id)
    charge_metadata.setdefault("customer_id", customer.get("id", ""))

    if amount < MIN_CHARGEABLE_AMOUNT:
        return ChargeResult(
            success=False,
            error=(
                f"Amount too small (${amount:.2f}) — "
                f"Stripe minimum is ${MIN_CHARGEABLE_AMOUNT:.2f}"
            ),
        )

    payment_method_id = customer.get("stripe_payment_method_id")
    if not payment_method_id:
        raise CustomerNotChargeable("Customer has no saved payment method")

    # Atomically claim the order so a concurrent/duplicate call can't also
    # charge it. Only succeeds if the order isn't already paid/processing.
    claim = await db.orders.find_one_and_update(
        {"id": order_id, "payment_status": {"$nin": ["paid", "processing"]}},
        {"$set": {
            "payment_status": "processing",
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }},
    )
    if claim is None:
        current = await db.orders.find_one({"id": order_id}, {"_id": 0, "payment_status": 1})
        current_status = (current or {}).get("payment_status")
        if current_status == "paid":
            return ChargeResult(success=True, charged=False, extra={"already_paid": True})
        raise OrderAlreadyProcessing(
            f"Order {order_id} is already being charged (status={current_status!r})"
        )

    # Stable per order+amount: a retried call for the same charge reuses
    # this key so Stripe returns the original result instead of creating
    # a second PaymentIntent.
    idempotency_key = f"order-charge:{order_id}:{int(round(amount * 100))}"

    try:
        stripe_customer_id = await get_or_create_stripe_customer(customer)
        payment_intent = await asyncio.to_thread(
            stripe.PaymentIntent.create,
            amount=int(round(amount * 100)),
            currency="usd",
            customer=stripe_customer_id,
            payment_method=payment_method_id,
            off_session=True,
            confirm=True,
            description=description[:500],
            metadata=charge_metadata,
            receipt_email=customer.get("email") or None,
            idempotency_key=idempotency_key,
        )
    except stripe.CardError as e:
        err = e.error
        logger.error("Card declined for order %s: %s — %s", order_id, err.code, err.message)
        await _release_order_claim(order_id)
        return ChargeResult(
            success=False,
            error=err.message,
            decline_code=err.code,
            suggest_action="Charge manually or ask the customer to update their card",
        )
    except stripe.StripeError as e:
        logger.error("Stripe error for order %s: %s", order_id, e)
        await _release_order_claim(order_id)
        return ChargeResult(
            success=False,
            error=str(getattr(e, "user_message", None) or e),
            suggest_action="Charge manually",
        )
    except Exception as e:  # noqa: BLE001 — last-resort guard around a third-party SDK
        logger.exception("Unexpected auto-charge error for order %s", order_id)
        await _release_order_claim(order_id)
        return ChargeResult(success=False, error=str(e), suggest_action="Charge manually")

    if payment_intent.status != "succeeded":
        # e.g. "requires_action" (3-D Secure) needs the customer, not us.
        await _release_order_claim(order_id)
        return ChargeResult(
            success=False,
            error=f"Payment {payment_intent.status}",
            payment_intent_id=payment_intent.id,
            suggest_action=(
                "Payment requires additional authentication from the customer"
                if payment_intent.status == "requires_action"
                else "Charge manually"
            ),
        )

    now_iso = datetime.now(timezone.utc).isoformat()
    await db.orders.update_one(
        {"id": order_id},
        {"$set": {
            "payment_status": "paid",
            "payment_method": "card_auto",
            "amount_paid": amount,
            "paid_at": now_iso,
            "updated_at": now_iso,
            "stripe_payment_intent_id": payment_intent.id,
        }},
    )
    await db.finances.insert_one({
        "id": str(uuid.uuid4()),
        "type": "income",
        "category": finance_category,
        "description": description,
        "amount": amount,
        "payment_method": "card_auto",
        "order_id": order_id,
        "order_number": order.get("order_number"),
        "customer_name": customer.get("name"),
        "customer_id": customer.get("id"),
        "stripe_payment_intent_id": payment_intent.id,
        "date": now_iso[:10],
        "created_at": now_iso,
        "updated_at": now_iso,
    })
    await db.payment_transactions.insert_one({
        "id": f"txn_{payment_intent.id}",
        "order_id": order_id,
        "customer_id": customer.get("id"),
        "amount": amount,
        "currency": "usd",
        "status": "succeeded",
        "stripe_payment_intent_id": payment_intent.id,
        "created_at": now_iso,
    })

    logger.info("Auto-charged $%.2f for order %s", amount, order.get("order_number", order_id))
    return ChargeResult(
        success=True,
        charged=True,
        amount_charged=amount,
        payment_intent_id=payment_intent.id,
        extra={
            "card_last4": customer.get("card_last4"),
            "card_brand": customer.get("card_brand"),
        },
    )


async def mark_order_covered_by_membership(
    *,
    order_id: str,
    lbs_covered: float = 0,
    membership_discount: float = 0,
) -> None:
    """Mark an order as paid because it was fully covered by the
    customer's membership allowance (no Stripe charge involved).
    """
    now_iso = datetime.now(timezone.utc).isoformat()
    await db.orders.update_one(
        {"id": order_id},
        {"$set": {
            "payment_status": "paid",
            "payment_method": "membership_covered",
            "paid_at": now_iso,
            "updated_at": now_iso,
            "lbs_from_allowance": lbs_covered,
            "membership_discount": membership_discount,
        }},
    )
