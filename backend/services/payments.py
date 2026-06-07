import os
import stripe
import logging
from typing import Dict, Optional
from database import db

logger = logging.getLogger(__name__)

# Initialize Stripe
stripe.api_key = os.environ.get("STRIPE_API_KEY")

async def charge_customer_saved_card(
    customer_id: str,
    amount: float,
    order_id: str,
    description: str = "Laundry service charge"
) -> Dict:
    """
    Charge a customer's saved payment method automatically.
    Returns dict with success status and charge details.
    """
    try:
        # Get customer from database
        customer = await db.customers.find_one({"id": customer_id}, {"_id": 0})
        if not customer:
            return {"success": False, "error": "Customer not found"}
        
        stripe_customer_id = customer.get("stripe_customer_id")
        if not stripe_customer_id:
            return {"success": False, "error": "No saved payment method"}
        
        # Get the default payment method for this customer
        stripe_customer = stripe.Customer.retrieve(stripe_customer_id)
        default_payment_method = stripe_customer.get("invoice_settings", {}).get("default_payment_method")
        
        if not default_payment_method:
            # Get the first payment method if no default
            payment_methods = stripe.PaymentMethod.list(
                customer=stripe_customer_id,
                type="card",
                limit=1
            )
            if not payment_methods.data:
                return {"success": False, "error": "No saved payment method found"}
            default_payment_method = payment_methods.data[0].id
        
        # Create payment intent
        payment_intent = stripe.PaymentIntent.create(
            amount=int(amount * 100),  # Convert to cents
            currency="usd",
            customer=stripe_customer_id,
            payment_method=default_payment_method,
            off_session=True,
            confirm=True,
            metadata={
                "order_id": order_id,
                "customer_id": customer_id,
                "description": description[:500]
            }
        )
        
        if payment_intent.status == "succeeded":
            # Record transaction
            transaction = {
                "id": f"txn_{payment_intent.id}",
                "order_id": order_id,
                "customer_id": customer_id,
                "amount": amount,
                "currency": "usd",
                "status": "succeeded",
                "stripe_payment_intent_id": payment_intent.id,
                "created_at": datetime.now(timezone.utc).isoformat()
            }
            await db.payment_transactions.insert_one(transaction)
            
            return {
                "success": True,
                "payment_intent_id": payment_intent.id,
                "amount": amount,
                "status": "succeeded"
            }
        else:
            return {
                "success": False,
                "error": f"Payment {payment_intent.status}",
                "payment_intent_id": payment_intent.id
            }
            
    except stripe.error.CardError as e:
        logger.error(f"Card error for customer {customer_id}: {e.error.message}")
        return {"success": False, "error": e.error.message}
    except Exception as e:
        logger.error(f"Payment error for customer {customer_id}: {str(e)}")
        return {"success": False, "error": str(e)}