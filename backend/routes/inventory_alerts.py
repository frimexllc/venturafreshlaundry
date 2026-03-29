"""Inventory Alerts — Low stock and pending PO notifications"""
from fastapi import APIRouter, Depends
from datetime import datetime, timezone, timedelta
import logging
import os

from database import db
from auth import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/inventory", tags=["Inventory Alerts"])


async def get_low_stock_items():
    """Get items where quantity <= min_stock"""
    items = await db.inventory.find(
        {"$expr": {"$lte": ["$quantity", "$min_stock"]}},
        {"_id": 0}
    ).to_list(100)
    return items


async def get_stale_purchase_orders(days=3):
    """Get POs that have been pending/approved for more than N days"""
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    pos = await db.purchase_orders.find(
        {"status": {"$in": ["pending", "approved"]}, "created_at": {"$lte": cutoff}},
        {"_id": 0}
    ).to_list(100)
    return pos


@router.get("/alerts")
async def get_inventory_alerts(current_user: dict = Depends(get_current_user)):
    """Get all active inventory alerts"""
    low_stock = await get_low_stock_items()
    stale_pos = await get_stale_purchase_orders(days=3)

    alerts = []
    for item in low_stock:
        alerts.append({
            "type": "low_stock",
            "severity": "high" if item.get("quantity", 0) == 0 else "medium",
            "title": f"Low stock: {item.get('product_name', 'Unknown')}",
            "title_es": f"Stock bajo: {item.get('product_name', 'Desconocido')}",
            "detail": f"Current: {item.get('quantity', 0)} | Min: {item.get('min_stock', 0)}",
            "item_id": item.get("id"),
            "product_name": item.get("product_name"),
            "quantity": item.get("quantity", 0),
            "min_stock": item.get("min_stock", 0),
        })

    for po in stale_pos:
        created = po.get("created_at", "")
        days_old = 0
        try:
            dt = datetime.fromisoformat(created.replace("Z", "+00:00"))
            days_old = (datetime.now(timezone.utc) - dt).days
        except Exception:
            pass
        alerts.append({
            "type": "stale_po",
            "severity": "medium",
            "title": f"PO pending {days_old} days: {po.get('supplier', 'Unknown')}",
            "title_es": f"PO pendiente {days_old} dias: {po.get('supplier', 'Desconocido')}",
            "detail": f"Status: {po.get('status')} | Items: {len(po.get('items', []))}",
            "po_id": po.get("id"),
            "days_pending": days_old,
        })

    return {
        "total_alerts": len(alerts),
        "low_stock_count": len(low_stock),
        "stale_po_count": len(stale_pos),
        "alerts": alerts,
    }


@router.post("/alerts/notify")
async def send_inventory_alerts(current_user: dict = Depends(get_current_user)):
    """Trigger notification for inventory alerts (email/SMS)"""
    alerts_data = await get_inventory_alerts(current_user)
    if alerts_data["total_alerts"] == 0:
        return {"sent": False, "message": "No alerts to send"}

    # Build alert message
    lines = [f"Ventura Fresh Laundry — Inventory Alerts ({alerts_data['total_alerts']})"]
    lines.append("")

    if alerts_data["low_stock_count"] > 0:
        lines.append(f"LOW STOCK ({alerts_data['low_stock_count']}):")
        for a in alerts_data["alerts"]:
            if a["type"] == "low_stock":
                lines.append(f"  - {a['product_name']}: {a['quantity']} left (min: {a['min_stock']})")
        lines.append("")

    if alerts_data["stale_po_count"] > 0:
        lines.append(f"PENDING PURCHASE ORDERS ({alerts_data['stale_po_count']}):")
        for a in alerts_data["alerts"]:
            if a["type"] == "stale_po":
                lines.append(f"  - {a['title']}")
        lines.append("")

    message = "\n".join(lines)

    # Try SMS via Twilio
    sms_sent = False
    try:
        twilio_sid = os.environ.get("TWILIO_ACCOUNT_SID")
        twilio_token = os.environ.get("TWILIO_AUTH_TOKEN")
        twilio_from = os.environ.get("TWILIO_PHONE_NUMBER")
        admin_phone = os.environ.get("ADMIN_PHONE")
        if twilio_sid and twilio_token and twilio_from and admin_phone:
            from twilio.rest import Client
            client = Client(twilio_sid, twilio_token)
            client.messages.create(body=message[:1600], from_=twilio_from, to=admin_phone)
            sms_sent = True
            logger.info("Inventory alert SMS sent")
    except Exception as e:
        logger.warning(f"SMS alert failed: {e}")

    # Try email via SendGrid
    email_sent = False
    try:
        sg_key = os.environ.get("SENDGRID_API_KEY")
        admin_email = os.environ.get("ADMIN_EMAIL")
        if sg_key and admin_email:
            import sendgrid
            from sendgrid.helpers.mail import Mail
            sg = sendgrid.SendGridAPIClient(api_key=sg_key)
            mail = Mail(
                from_email="alerts@venturafreshlaundry.com",
                to_emails=admin_email,
                subject=f"Inventory Alert: {alerts_data['total_alerts']} issues",
                plain_text_content=message,
            )
            sg.send(mail)
            email_sent = True
            logger.info("Inventory alert email sent")
    except Exception as e:
        logger.warning(f"Email alert failed: {e}")

    # Log the alert attempt
    await db.alert_logs.insert_one({
        "type": "inventory_alert",
        "total_alerts": alerts_data["total_alerts"],
        "sms_sent": sms_sent,
        "email_sent": email_sent,
        "message_preview": message[:200],
        "triggered_by": current_user["id"],
        "created_at": datetime.now(timezone.utc).isoformat(),
    })

    return {
        "sent": sms_sent or email_sent,
        "sms_sent": sms_sent,
        "email_sent": email_sent,
        "alerts_count": alerts_data["total_alerts"],
        "message": "Notifications sent" if (sms_sent or email_sent) else "No notification channels configured. Set TWILIO_* or SENDGRID_* env vars.",
    }
