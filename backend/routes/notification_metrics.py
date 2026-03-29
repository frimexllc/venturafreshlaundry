"""
Notification Metrics — analytics for SMS/WhatsApp/Email notifications.
"""
import logging
from fastapi import APIRouter, Depends
from database import db
from auth import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/notification-metrics", tags=["notification-metrics"])


@router.get("")
async def get_notification_metrics(days: int = 30, current_user: dict = Depends(get_current_user)):
    """Return notification analytics: totals, by channel, by event, recent history."""

    # Also read the in-memory audit log as fallback
    from notifications import _audit_log

    # Total counts from MongoDB
    total = await db.notification_logs.count_documents({})
    sent = await db.notification_logs.count_documents({"status": "sent"})
    failed = await db.notification_logs.count_documents({"status": "failed"})
    skipped_dup = await db.notification_logs.count_documents({"status": "duplicate_skipped"})
    queued = await db.notification_logs.count_documents({"status": "queued_quiet_hours"})

    # By channel
    channel_pipeline = [
        {"$group": {
            "_id": {"channel": "$channel", "status": "$status"},
            "count": {"$sum": 1},
        }},
    ]
    channel_raw = await db.notification_logs.aggregate(channel_pipeline).to_list(50)

    channels = {}
    for item in channel_raw:
        ch = item["_id"]["channel"] or "unknown"
        st = item["_id"]["status"] or "unknown"
        if ch not in channels:
            channels[ch] = {"sent": 0, "failed": 0, "other": 0, "total": 0}
        if st == "sent":
            channels[ch]["sent"] += item["count"]
        elif st == "failed":
            channels[ch]["failed"] += item["count"]
        else:
            channels[ch]["other"] += item["count"]
        channels[ch]["total"] += item["count"]

    # By event type
    event_pipeline = [
        {"$group": {
            "_id": {"event": "$event", "status": "$status"},
            "count": {"$sum": 1},
        }},
    ]
    event_raw = await db.notification_logs.aggregate(event_pipeline).to_list(100)

    events = {}
    for item in event_raw:
        ev = item["_id"]["event"] or "unknown"
        st = item["_id"]["status"] or "unknown"
        if ev not in events:
            events[ev] = {"sent": 0, "failed": 0, "other": 0, "total": 0}
        if st == "sent":
            events[ev]["sent"] += item["count"]
        elif st == "failed":
            events[ev]["failed"] += item["count"]
        else:
            events[ev]["other"] += item["count"]
        events[ev]["total"] += item["count"]

    # Recent logs (from DB)
    recent_db = await db.notification_logs.find(
        {}, {"_id": 0}
    ).sort("timestamp", -1).limit(30).to_list(30)

    # Merge in-memory logs if DB is empty
    recent = recent_db
    if not recent and _audit_log:
        recent = sorted(_audit_log, key=lambda x: x.get("timestamp", ""), reverse=True)[:30]
        # Also update the aggregation from in-memory
        total = len(_audit_log)
        sent = sum(1 for e in _audit_log if e.get("status") == "sent")
        failed = sum(1 for e in _audit_log if e.get("status") == "failed")
        skipped_dup = sum(1 for e in _audit_log if e.get("status") == "duplicate_skipped")
        queued = sum(1 for e in _audit_log if e.get("status") == "queued_quiet_hours")

        for e in _audit_log:
            ch = e.get("channel", "unknown")
            st = e.get("status", "unknown")
            if ch not in channels:
                channels[ch] = {"sent": 0, "failed": 0, "other": 0, "total": 0}
            if st == "sent":
                channels[ch]["sent"] += 1
            elif st == "failed":
                channels[ch]["failed"] += 1
            else:
                channels[ch]["other"] += 1
            channels[ch]["total"] += 1

            ev = e.get("event", "unknown")
            if ev not in events:
                events[ev] = {"sent": 0, "failed": 0, "other": 0, "total": 0}
            if st == "sent":
                events[ev]["sent"] += 1
            elif st == "failed":
                events[ev]["failed"] += 1
            else:
                events[ev]["other"] += 1
            events[ev]["total"] += 1

    success_rate = round(sent / total * 100, 1) if total > 0 else 0

    return {
        "total": total,
        "sent": sent,
        "failed": failed,
        "duplicate_skipped": skipped_dup,
        "queued_quiet_hours": queued,
        "success_rate": success_rate,
        "by_channel": channels,
        "by_event": events,
        "recent": recent,
    }
