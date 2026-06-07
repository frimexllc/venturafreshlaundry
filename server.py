
# Montar router de formularios públicos
try:
    from backend.routes.public_forms import get_public_forms_router
    from database import db
    from utils import generate_order_number, create_audit_log
    from shared import sio
    import os
    
    SKIP_SERVER_NOTIFICATIONS = os.environ.get("SKIP_SERVER_NOTIFICATIONS", "false").lower() == "true"
    NOTIFICATIONS_ENABLED = True
    
    public_forms_router = get_public_forms_router(
        db=db,
        generate_order_number=generate_order_number,
        create_audit_log=create_audit_log,
        emit_realtime=lambda event, payload: sio.emit(event, payload),
        notifications_enabled=NOTIFICATIONS_ENABLED,
        skip_server_notifications=SKIP_SERVER_NOTIFICATIONS,
        logger=logging.getLogger(__name__)
    )
    app.include_router(public_forms_router, prefix="/api")
    print("✅ Public forms router mounted at /api")
except Exception as e:
    print(f"❌ Error mounting public forms router: {e}")
