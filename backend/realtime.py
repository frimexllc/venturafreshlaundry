"""Shared realtime emission helper — uses lazy-loaded socketio from shared.py"""
import logging

logger = logging.getLogger(__name__)


async def emit_realtime(event: str, payload: dict):
    import shared
    try:
        if shared.sio:
            await shared.sio.emit(event, payload)
    except Exception as exc:
        logger.warning(f"Realtime emit failed: {exc}")
