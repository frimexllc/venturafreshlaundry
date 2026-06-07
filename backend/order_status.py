"""
order_status.py
───────────────
Single source of truth para los estados (status) de las órdenes.
Resuelve los conflictos históricos entre:
  - UPPERCASE / lowercase
  - guion / underscore (picked-up vs picked_up)
  - alias legacy (pending → new, shipping → out_for_delivery, etc.)
"""

# Estados canónicos del flujo principal (en minúsculas, con underscore).
# Cualquier otra representación que aparezca en el sistema debe poder
# normalizarse a uno de estos.
CANONICAL_STATUSES = (
    "new",
    "confirmed",
    "pickup_scheduled",
    "picked_up",
    "processing",
    "ready",
    "out_for_delivery",
    "delivered",
    "completed",
    "cancelled",
)

# Mapeo de alias / legacy → canonical
STATUS_ALIASES = {
    # Initial / pending
    "pending": "new",
    "PENDING": "new",
    "NEW": "new",
    "nuevo": "new",
    # Confirmed
    "CONFIRMED": "confirmed",
    "confirmado": "confirmed",
    # Scheduled
    "PICKUP_SCHEDULED": "pickup_scheduled",
    "pickup-scheduled": "pickup_scheduled",
    # Picked up
    "PICKED_UP": "picked_up",
    "picked-up": "picked_up",
    "recolectado": "picked_up",
    # Processing
    "PROCESSING": "processing",
    "in-process": "processing",
    "in_process": "processing",
    "lavando": "processing",
    # Ready
    "READY": "ready",
    "listo": "ready",
    # Out for delivery / shipping
    "OUT_FOR_DELIVERY": "out_for_delivery",
    "out-for-delivery": "out_for_delivery",
    "shipping": "out_for_delivery",
    "shipped": "out_for_delivery",
    "en_camino": "out_for_delivery",
    # Delivered
    "DELIVERED": "delivered",
    "entregado": "delivered",
    # Completed
    "COMPLETED": "completed",
    "complete": "completed",
    "completado": "completed",
    # Cancelled
    "CANCELLED": "cancelled",
    "canceled": "cancelled",
    "cancelado": "cancelled",
}

# Estados activos para vista de logística (excluye delivered/completed/cancelled)
LOGISTICS_ACTIVE_STATUSES = (
    "new",
    "confirmed",
    "pickup_scheduled",
    "picked_up",
    "processing",
    "ready",
    "out_for_delivery",
)


def normalize_status(status):
    """
    Convierte cualquier representación (case, hyphen, alias) al estado canónico.
    Retorna None si el input es vacío. Si no reconoce el valor, lo retorna
    en minúsculas con underscore (best-effort) para no romper datos existentes.
    """
    if status is None:
        return None
    s = str(status).strip()
    if not s:
        return None

    # 1) Lookup directo
    if s in STATUS_ALIASES:
        return STATUS_ALIASES[s]

    # 2) Lookup case-insensitive
    s_lower = s.lower()
    if s_lower in STATUS_ALIASES:
        return STATUS_ALIASES[s_lower]

    # 3) Reemplazar guiones por underscores y reintentar
    s_norm = s_lower.replace("-", "_").replace(" ", "_")
    if s_norm in CANONICAL_STATUSES:
        return s_norm
    if s_norm in STATUS_ALIASES:
        return STATUS_ALIASES[s_norm]

    # 4) Si ya es canónico tal cual
    if s in CANONICAL_STATUSES:
        return s

    # 5) Best-effort: devolver normalizado (lowercase + underscore)
    return s_norm


def is_valid_status(status):
    """¿El status puede normalizarse a un canónico?"""
    return normalize_status(status) in CANONICAL_STATUSES


def status_for_query(status):
    """
    Para queries en Mongo: devuelve la lista de TODAS las representaciones
    posibles del status canónico. Útil para no perder datos legacy.
    Ej: 'picked_up' → ['picked_up', 'picked-up', 'PICKED_UP']
    """
    canonical = normalize_status(status)
    if not canonical:
        return []
    variants = {canonical}
    for alias, target in STATUS_ALIASES.items():
        if target == canonical:
            variants.add(alias)
    return list(variants)


def status_in_query(*statuses):
    """
    Construye un $in de Mongo cubriendo todas las variantes legacy.
    Uso: db.orders.find({"status": status_in_query("new", "picked_up")})
    """
    all_variants = set()
    for s in statuses:
        all_variants.update(status_for_query(s))
    return {"$in": list(all_variants)}
