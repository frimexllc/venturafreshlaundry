"""
AI Business Assistant - Groq-powered intelligent management
"""
import os
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any, List
from groq import Groq

logger = logging.getLogger(__name__)

GROQ_API_KEY = os.environ.get("GROQ_API_KEY")
BUSINESS_NAME = os.environ.get("BUSINESS_NAME", "Ventura Fresh Laundry")

def get_groq_client():
    """Get Groq client instance"""
    if not GROQ_API_KEY:
        return None
    return Groq(api_key=GROQ_API_KEY)

async def generate_daily_briefing(db, user_role: str, user_name: str) -> Dict[str, Any]:
    """Generate intelligent daily briefing for admin/operator"""
    
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    
    # Gather business data
    data = {}
    
    # Orders stats
    all_orders = await db.orders.find({}, {"_id": 0}).to_list(1000)
    data["total_orders"] = len(all_orders)
    data["orders_today"] = len([o for o in all_orders if o.get("created_at", "")[:10] == now.strftime("%Y-%m-%d")])
    data["orders_new"] = len([o for o in all_orders if o.get("status", "").lower() == "new"])
    data["orders_processing"] = len([o for o in all_orders if o.get("status", "").lower() == "processing"])
    data["orders_ready"] = len([o for o in all_orders if o.get("status", "").lower() == "ready"])
    data["orders_out_delivery"] = len([o for o in all_orders if o.get("status", "").lower() in ["out_for_delivery", "out for delivery"]])
    data["orders_pending_payment"] = len([o for o in all_orders if o.get("payment_status", "").lower() != "paid"])
    
    # Revenue
    paid_orders = [o for o in all_orders if o.get("payment_status", "").lower() == "paid"]
    data["total_revenue"] = sum(o.get("total_amount", 0) or 0 for o in paid_orders)
    data["pending_revenue"] = sum(o.get("total_amount", 0) or 0 for o in all_orders if o.get("payment_status", "").lower() != "paid")
    
    # Customers
    customers = await db.customers.find({}, {"_id": 0}).to_list(1000)
    data["total_customers"] = len(customers)
    data["active_members"] = len([c for c in customers if c.get("membership_status") == "active"])
    
    # Quotes (B2B)
    quotes = await db.quotes.find({}, {"_id": 0}).to_list(500)
    data["quotes_pending"] = len([q for q in quotes if q.get("status", "").lower() in ["new", "pending", "sent"]])
    data["quotes_total"] = len(quotes)
    
    # Leads
    leads = await db.leads.find({}, {"_id": 0}).to_list(500)
    data["leads_new"] = len([l for l in leads if l.get("status", "").lower() == "new"])
    data["leads_total"] = len(leads)
    
    # Support tickets
    tickets = await db.tickets.find({}, {"_id": 0}).to_list(500)
    data["tickets_open"] = len([t for t in tickets if t.get("status", "").lower() in ["open", "new", "pending"]])
    data["tickets_high_priority"] = len([t for t in tickets if t.get("priority", "").lower() == "high" and t.get("status", "").lower() != "closed"])
    
    # Membership signups
    signups = await db.membership_signups.find({}, {"_id": 0}).to_list(500)
    data["signups_pending"] = len([s for s in signups if s.get("status", "").lower() == "pending"])
    
    # Services
    services = await db.services.find({}, {"_id": 0}).to_list(100)
    data["active_services"] = len([s for s in services if s.get("is_active")])
    
    # Generate AI analysis
    client = get_groq_client()
    if not client:
        return {"error": "AI not configured", "data": data}
    
    # Build context for AI
    role_context = "administrator with full access" if user_role == "admin" else "operator focused on daily operations"
    
    prompt = f"""You are the AI Business Manager for {BUSINESS_NAME}, a professional laundry service.
    
Current user: {user_name} ({role_context})
Current time: {now.strftime("%A, %B %d, %Y at %I:%M %p")}

BUSINESS STATUS:
- Orders Today: {data['orders_today']}
- New Orders (waiting): {data['orders_new']}
- Processing: {data['orders_processing']}
- Ready for Pickup/Delivery: {data['orders_ready']}
- Out for Delivery: {data['orders_out_delivery']}
- Pending Payments: {data['orders_pending_payment']} (${data['pending_revenue']:.2f})
- Total Revenue: ${data['total_revenue']:.2f}
- Total Customers: {data['total_customers']} ({data['active_members']} members)
- B2B Quotes Pending: {data['quotes_pending']}
- New Leads: {data['leads_new']}
- Open Support Tickets: {data['tickets_open']} ({data['tickets_high_priority']} high priority)
- Pending Membership Signups: {data['signups_pending']}

Generate a personalized daily briefing for this user. Include:
1. A warm greeting with key priorities for today
2. Urgent items that need immediate attention (if any)
3. Revenue opportunity highlights
4. Operational recommendations
5. One motivational insight

Keep it concise, professional, and actionable. Format with clear sections.
Respond in the same language the user typically uses (Spanish if Mexican business, English otherwise).
"""

    try:
        response = client.chat.completions.create(
            messages=[{"role": "user", "content": prompt}],
            model="llama-3.3-70b-versatile",
            temperature=0.7,
            max_tokens=1500
        )
        briefing_text = response.choices[0].message.content.strip()
    except Exception as e:
        logger.error(f"Groq API error in briefing: {e}")
        briefing_text = f"""Good {'morning' if now.hour < 12 else 'afternoon'}, {user_name}!

📊 **Quick Status:**
- {data['orders_new']} new orders waiting
- {data['orders_ready']} orders ready for delivery
- {data['orders_pending_payment']} pending payments (${data['pending_revenue']:.2f})
- {data['tickets_open']} open support tickets

Have a productive day!"""

    return {
        "briefing": briefing_text,
        "data": data,
        "generated_at": now.isoformat(),
        "user_role": user_role
    }


async def ai_analyze_business(db, query: str, user_role: str) -> Dict[str, Any]:
    """Analyze business data and answer queries using AI"""
    
    client = get_groq_client()
    if not client:
        return {"error": "AI not configured"}
    
    now = datetime.now(timezone.utc)
    
    # Gather comprehensive business data
    orders = await db.orders.find({}, {"_id": 0}).sort("created_at", -1).to_list(100)
    customers = await db.customers.find({}, {"_id": 0}).to_list(500)
    quotes = await db.quotes.find({}, {"_id": 0}).to_list(100)
    leads = await db.leads.find({}, {"_id": 0}).to_list(100)
    tickets = await db.tickets.find({}, {"_id": 0}).to_list(100)
    services = await db.services.find({}, {"_id": 0}).to_list(50)
    
    # Build context
    context = f"""BUSINESS DATA FOR {BUSINESS_NAME}:

RECENT ORDERS (last 100):
{format_orders_for_ai(orders[:20])}

CUSTOMER SUMMARY:
- Total customers: {len(customers)}
- Active members: {len([c for c in customers if c.get('membership_status') == 'active'])}

PENDING QUOTES:
{format_quotes_for_ai([q for q in quotes if q.get('status', '').lower() in ['new', 'pending', 'sent']][:10])}

NEW LEADS:
{format_leads_for_ai([l for l in leads if l.get('status', '').lower() == 'new'][:10])}

OPEN TICKETS:
{format_tickets_for_ai([t for t in tickets if t.get('status', '').lower() != 'closed'][:10])}

SERVICES OFFERED:
{format_services_for_ai(services)}
"""

    system_prompt = f"""You are the AI Business Manager for {BUSINESS_NAME}.
You have access to real business data and can help with:
- Analyzing orders, revenue, and operations
- Providing recommendations for business growth
- Answering questions about customers, services, quotes
- Identifying opportunities and issues
- Executing actions when requested (update statuses, create records, etc.)

Current time: {now.strftime("%Y-%m-%d %H:%M")}
User role: {user_role}

When the user asks to perform an action (like updating an order status), respond with:
1. Confirmation of understanding
2. A JSON block with the action details:
```json
{{"action": "action_type", "params": {{...}}}}
```

Available actions:
- update_order_status: {{"order_id": "...", "status": "new|processing|ready|out_for_delivery|delivered|completed|cancelled"}}
- update_order_lbs: {{"order_id": "...", "estimated_lbs": "number or null", "actual_lbs": "number or null"}}
- update_payment_status: {{"order_id": "...", "status": "pending|paid|refunded"}}
- update_quote_status: {{"quote_id": "...", "status": "new|sent|accepted|rejected|expired"}}
- update_lead_status: {{"lead_id": "...", "status": "new|contacted|qualified|converted|lost"}}
- update_ticket_status: {{"ticket_id": "...", "status": "open|in_progress|resolved|closed"}}

Be concise, professional, and helpful. Respond in the user's language."""

    try:
        response = client.chat.completions.create(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"CONTEXT:\n{context}\n\nUSER QUERY: {query}"}
            ],
            model="llama-3.3-70b-versatile",
            temperature=0.5,
            max_tokens=2000
        )
        return {
            "response": response.choices[0].message.content.strip(),
            "generated_at": now.isoformat()
        }
    except Exception as e:
        logger.error(f"Groq API error: {e}")
        return {"error": str(e)}


async def ai_suggest_actions(db, context_type: str) -> List[Dict[str, Any]]:
    """Generate AI-powered action suggestions based on current business state"""
    
    client = get_groq_client()
    if not client:
        return []
    
    suggestions = []
    now = datetime.now(timezone.utc)
    
    # Check for actionable items
    orders = await db.orders.find({}, {"_id": 0}).to_list(500)
    
    # Old orders stuck in processing
    for order in orders:
        if order.get("status", "").lower() == "processing":
            created = order.get("created_at", "")
            if created:
                try:
                    created_date = datetime.fromisoformat(created.replace("Z", "+00:00"))
                    if (now - created_date).days >= 2:
                        suggestions.append({
                            "type": "warning",
                            "title": f"Order {order.get('order_number', order.get('id')[:8])} stuck in processing",
                            "description": f"This order has been processing for {(now - created_date).days} days",
                            "action": {"type": "update_order_status", "order_id": order.get("id"), "suggested_status": "ready"},
                            "priority": "high"
                        })
                except:
                    pass
    
    # Orders ready but not delivered
    ready_orders = [o for o in orders if o.get("status", "").lower() == "ready"]
    if len(ready_orders) > 3:
        suggestions.append({
            "type": "info",
            "title": f"{len(ready_orders)} orders ready for delivery",
            "description": "Consider scheduling deliveries to clear the queue",
            "action": None,
            "priority": "medium"
        })
    
    # Pending payments
    pending_payment = [o for o in orders if o.get("payment_status", "").lower() != "paid" and o.get("status", "").lower() == "completed"]
    if pending_payment:
        total = sum(float(o.get("total_amount") or 0) for o in pending_payment)
        suggestions.append({
            "type": "revenue",
            "title": f"${total:.2f} in pending payments",
            "description": f"{len(pending_payment)} completed orders awaiting payment",
            "action": None,
            "priority": "high"
        })
    
    # Check tickets
    tickets = await db.tickets.find({"status": {"$in": ["open", "new"]}}, {"_id": 0}).to_list(100)
    high_priority = [t for t in tickets if t.get("priority", "").lower() == "high"]
    if high_priority:
        suggestions.append({
            "type": "urgent",
            "title": f"{len(high_priority)} high-priority tickets",
            "description": "Customer issues requiring immediate attention",
            "action": None,
            "priority": "critical"
        })
    
    return suggestions[:10]  # Limit to 10 suggestions


def format_orders_for_ai(orders: List[Dict]) -> str:
    """Format orders for AI context"""
    if not orders:
        return "No recent orders"
    lines = []
    for o in orders[:15]:
        amount = o.get('total_amount') or 0
        order_num = o.get('order_number') or (o.get('id', '')[:8] if o.get('id') else 'N/A')
        lines.append(f"- {order_num}: {o.get('status', 'unknown')} | Payment: {o.get('payment_status', 'pending')} | ${float(amount):.2f} | Customer: {o.get('customer_name', 'N/A')}")
    return "\n".join(lines)


def format_quotes_for_ai(quotes: List[Dict]) -> str:
    """Format quotes for AI context"""
    if not quotes:
        return "No pending quotes"
    lines = []
    for q in quotes[:10]:
        lines.append(f"- {q.get('quote_number', q.get('id', '')[:8])}: {q.get('company_name', 'N/A')} | Status: {q.get('status', 'new')} | Est: {q.get('estimated_lbs_per_week', 'N/A')} lbs/week")
    return "\n".join(lines)


def format_leads_for_ai(leads: List[Dict]) -> str:
    """Format leads for AI context"""
    if not leads:
        return "No new leads"
    lines = []
    for l in leads[:10]:
        lines.append(f"- {l.get('name', 'N/A')}: {l.get('email', 'no email')} | Source: {l.get('source', 'unknown')} | Status: {l.get('status', 'new')}")
    return "\n".join(lines)


def format_tickets_for_ai(tickets: List[Dict]) -> str:
    """Format tickets for AI context"""
    if not tickets:
        return "No open tickets"
    lines = []
    for t in tickets[:10]:
        lines.append(f"- #{t.get('ticket_number', t.get('id', '')[:8])}: {t.get('subject', 'No subject')[:50]} | Priority: {t.get('priority', 'normal')} | Status: {t.get('status', 'open')}")
    return "\n".join(lines)


def format_services_for_ai(services: List[Dict]) -> str:
    """Format services for AI context"""
    if not services:
        return "No services configured"
    lines = []
    for s in services:
        if s.get("is_active"):
            lines.append(f"- {s.get('name', 'N/A')}: ${s.get('price', 0):.2f} {s.get('price_unit', '')}")
    return "\n".join(lines) if lines else "No active services"
