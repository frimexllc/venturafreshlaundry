export const ORDER_STATUSES = [
  { value: "NEW", label: "New", color: "bg-yellow-100 text-yellow-800" },
  { value: "CONFIRMED", label: "Confirmed", color: "bg-blue-100 text-blue-800" },
  { value: "PICKED_UP", label: "Picked Up", color: "bg-indigo-100 text-indigo-800" },
  { value: "PROCESSING", label: "Processing", color: "bg-purple-100 text-purple-800" },
  { value: "READY", label: "Ready", color: "bg-teal-100 text-teal-800" },
  { value: "OUT_FOR_DELIVERY", label: "Out for Delivery", color: "bg-orange-100 text-orange-800" },
  { value: "DELIVERED", label: "Delivered", color: "bg-green-100 text-green-800" },
  { value: "COMPLETED", label: "Completed", color: "bg-emerald-100 text-emerald-800" },
  { value: "CANCELLED", label: "Cancelled", color: "bg-red-100 text-red-800" },
];

export const STORE_STATUS_FLOW = ["pending", "confirmed", "processing", "ready", "delivered", "completed"];

export function getNextStoreStatus(current) {
  const idx = STORE_STATUS_FLOW.indexOf(current?.toLowerCase());
  if (idx < 0 || idx >= STORE_STATUS_FLOW.length - 1) return null;
  return STORE_STATUS_FLOW[idx + 1];
}

export function safeString(val, fallback = "") {
  if (val === null || val === undefined) return fallback;
  return String(val);
}

export function formatApiError(detail, fallback = "Error") {
  if (!detail) return fallback;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail.map(d => d.msg || d).join(", ");
  return fallback;
}

export function formatCurrency(amount) {
  if (amount === null || amount === undefined) return "$0.00";
  return `$${Number(amount).toFixed(2)}`;
}

export function formatOrderNumber(order) {
  if (!order) return "";
  return order.order_number || order.id?.slice(0, 8) || "";
}

export function isWashFoldService(serviceType) {
  if (!serviceType) return false;
  const s = serviceType.toLowerCase();
  return s.includes("wash") && s.includes("fold");
}

export function getNextStatus(currentStatus, serviceType) {
  if (!currentStatus) return null;
  const s = currentStatus.toUpperCase();
  if (isWashFoldService(serviceType)) {
    const flow = ["NEW", "CONFIRMED", "PROCESSING", "READY", "COMPLETED"];
    const idx = flow.indexOf(s);
    if (idx < 0 || idx >= flow.length - 1) return null;
    return flow[idx + 1];
  }
  const flow = ["NEW", "CONFIRMED", "PICKED_UP", "PROCESSING", "READY", "OUT_FOR_DELIVERY", "DELIVERED", "COMPLETED"];
  const idx = flow.indexOf(s);
  if (idx < 0 || idx >= flow.length - 1) return null;
  return flow[idx + 1];
}

// ─── Pricing Tables (must match backend) ───────────────────────────────────
const PRICING_PD = {
  standard: { member: 2.50, regular: 2.75 },
  premium:  { member: 2.75, regular: 3.00 },
  express:  { member: 3.00, regular: 3.25 },
};
const PRICING_WF = {
  standard: 2.25,
  premium:  2.50,
  express:  2.75,
};

export function getRate(order) {
  // 1st priority: explicit price_per_lb on the order
  if (order.price_per_lb && Number(order.price_per_lb) > 0) return Number(order.price_per_lb);
  // 2nd: derive from service_plan + service_type
  const plan = (order.service_plan || "standard").toLowerCase();
  const st = (order.service_type || "").toLowerCase();
  if (st === "wash_fold") return PRICING_WF[plan] || PRICING_WF.standard;
  const tier = PRICING_PD[plan] || PRICING_PD.standard;
  return order.has_membership ? tier.member : tier.regular;
}

export function calculateServiceCharge(order) {
  if (!order) return null;
  const lbs = Number(order.actual_lbs || order.actual_weight || order.weight || 0);
  const rate = getRate(order);
  if (lbs > 0) {
    const subtotal = lbs * rate;
    const deliveryFee = Number(order.delivery_fee || 0);
    return subtotal + deliveryFee;
  }
  return order.total_amount || order.total || null;
}

export function dedupeOrders(orders) {
  if (!Array.isArray(orders)) return [];
  const seen = new Set();
  return orders.filter(o => {
    const key = o.id || o.order_number || JSON.stringify(o);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
