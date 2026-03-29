"""Shared realtime emission helper — uses lazy-loaded socketio from server.py"""
import logging

logger = logging.getLogger(__name__)


async def emit_realtime(event: str, payload: dict):
    import server
    try:
        if server.sio:
            await server.sio.emit(event, payload)
    except Exception as exc:
        logger.warning(f"Realtime emit failed: {exc}")
