export const ORDER_STATUSES = [
  { value: "NEW", color: "bg-blue-100 text-blue-800" },
  { value: "CONFIRMED", color: "bg-indigo-100 text-indigo-800" },
  { value: "PICKUP_SCHEDULED", color: "bg-purple-100 text-purple-800" },
  { value: "PICKED_UP", color: "bg-cyan-100 text-cyan-800" },
  { value: "PROCESSING", color: "bg-yellow-100 text-yellow-800" },
  { value: "READY", color: "bg-emerald-100 text-emerald-800" },
  { value: "OUT_FOR_DELIVERY", color: "bg-orange-100 text-orange-800" },
  { value: "DELIVERED", color: "bg-green-100 text-green-800" },
  { value: "COMPLETED", color: "bg-emerald-100 text-emerald-800" },
  { value: "CANCELLED", color: "bg-red-100 text-red-800" }
];

export const STORE_STATUS_FLOW = ["pending", "confirmed", "processing", "shipped", "delivered", "cancelled"];

export const PAYMENT_METHODS = [
  { value: "cash", label: "Cash" },
  { value: "card", label: "Card" },
  { value: "transfer", label: "Transfer" },
  { value: "other", label: "Other" }
];

export const PREFERENCE_LABELS = {
  detergent_type: "Detergent",
  water_temperature: "Water temperature",
  fabric_softener: "Fabric softener",
  folding_style: "Folding style",
  hanging_instructions: "Hanging instructions",
  allergies: "Allergies",
  special_instructions: "Special instructions",
  pickup_time_preference: "Preferred time",
  gate_code: "Gate code",
  hang_dry_items: "Hang dry items",
  fragrance_preference: "Fragrance"
};

export const getNextStoreStatus = (status) => {
  const normalized = (status || "pending").toLowerCase();
  const idx = STORE_STATUS_FLOW.indexOf(normalized);
  if (idx === -1 || idx === STORE_STATUS_FLOW.length - 1) return null;
  return STORE_STATUS_FLOW[idx + 1];
};

export const getErrorMessage = (error, defaultMessage) => {
  if (typeof error === "string") return error;
  if (error?.response?.data?.detail) return error.response.data.detail;
  if (error?.message) return error.message;
  return defaultMessage;
};

export const safeString = (value, defaultValue = "-") => {
  if (value === null || value === undefined) return defaultValue;
  if (typeof value === "object") {
    if (value.message) return value.message;
    if (value.msg) return value.msg;
    return defaultValue;
  }
  return String(value);
};

export const formatApiError = (detail, fallback) => {
  if (!detail) return fallback;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    const msg = detail.map((item) => item?.msg || JSON.stringify(item)).join(", ");
    return msg || fallback;
  }
  if (detail?.msg) return detail.msg;
  return JSON.stringify(detail);
};

export const formatCurrency = (value) => {
  if (value === null || value === undefined || value === "") return "-";
  try {
    const num = parseFloat(value);
    if (Number.isNaN(num)) return "-";
    return `$${num.toFixed(2)}`;
  } catch { return "-"; }
};

export const buildDateSlug = (dateStr) => {
  if (!dateStr) return new Date().toISOString().slice(0, 10).replace(/-/g, "");
  try {
    const base = new Date(dateStr);
    if (Number.isNaN(base.getTime())) return new Date().toISOString().slice(0, 10).replace(/-/g, "");
    return base.toISOString().slice(0, 10).replace(/-/g, "");
  } catch { return new Date().toISOString().slice(0, 10).replace(/-/g, ""); }
};

export const formatOrderNumber = (order) => {
  if (!order || typeof order !== "object") return "-";
  try {
    if (order.order_number && typeof order.order_number === "string" && order.order_number.startsWith("VFL-")) return order.order_number;
    const dateSlug = buildDateSlug(order.created_at || order.pickup_date);
    const raw = (order.order_number || order.order_id || "00000000").toString();
    const short = raw.replace(/[^a-zA-Z0-9]/g, "").toLowerCase().slice(-8).padStart(8, "0");
    return `VFL-${dateSlug}-${short}`;
  } catch { return "-"; }
};

export const isWashFoldService = (serviceType) => {
  const normalized = (serviceType || "").toString().trim().toLowerCase();
  return ["wash_fold", "wash_fold_dropoff", "wash-fold", "wash fold", "wash_and_fold", "wash&fold"].includes(normalized);
};

export const getNextStatus = (currentStatus, serviceType) => {
  const normalizedStatus = (currentStatus || "").toString().toUpperCase();
  if (isWashFoldService(serviceType)) {
    const washFoldFlow = {
      NEW: "PROCESSING", CONFIRMED: "PROCESSING", PICKUP_SCHEDULED: "PROCESSING",
      PICKED_UP: "PROCESSING", PROCESSING: "READY", READY: "COMPLETED",
      OUT_FOR_DELIVERY: "COMPLETED", DELIVERED: "COMPLETED"
    };
    return washFoldFlow[normalizedStatus] || null;
  }
  const pickupFlow = {
    NEW: "CONFIRMED", CONFIRMED: "PROCESSING", PICKUP_SCHEDULED: "PROCESSING",
    PICKED_UP: "PROCESSING", PROCESSING: "READY", READY: "OUT_FOR_DELIVERY",
    OUT_FOR_DELIVERY: "DELIVERED"
  };
  return pickupFlow[normalizedStatus] || null;
};

export const renderPreferenceValue = (value) => {
  if (Array.isArray(value)) return value.length ? value.map((v) => safeString(v)).join(", ") : "-";
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "object") return "-";
  return value.toString();
};

export const isMemberOrder = (order) => {
  if (!order) return false;
  try {
    const status = (order?.membership_status || "").toString().toLowerCase();
    if (["inactive", "cancelled", "canceled", "expired"].includes(status)) return false;
    if (["active", "current", "paid", "yes", "true"].includes(status)) return true;
    return Boolean(order?.membership_plan);
  } catch { return false; }
};

export const calculateServiceCharge = (order) => {
  if (!order) return null;
  try {
    const lbsValue = parseFloat(order.actual_lbs);
    if (Number.isNaN(lbsValue) || lbsValue <= 0) return null;
    if (order.service_type === "wash_fold") {
      const billable = Math.max(lbsValue, 10);
      return billable * 2.25;
    }
    const rate = isMemberOrder(order) ? 2.5 : 2.75;
    return Math.max(lbsValue * rate, 40);
  } catch { return null; }
};

export const dedupeOrders = (orders) => {
  if (!Array.isArray(orders)) return [];
  const seen = new Set();
  return orders.filter((order) => {
    if (!order || typeof order !== "object") return false;
    const key = order.order_id || order.id;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};
