export const ORDER_STATUSES = [
  { value: "PENDING", label: "Pending", color: "bg-yellow-100 text-yellow-800" },
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
    const flow = ["PENDING", "CONFIRMED", "PROCESSING", "READY", "COMPLETED"];
    const idx = flow.indexOf(s);
    if (idx < 0 || idx >= flow.length - 1) return null;
    return flow[idx + 1];
  }
  const flow = ["PENDING", "CONFIRMED", "PICKED_UP", "PROCESSING", "READY", "OUT_FOR_DELIVERY", "DELIVERED", "COMPLETED"];
  const idx = flow.indexOf(s);
  if (idx < 0 || idx >= flow.length - 1) return null;
  return flow[idx + 1];
}

export function calculateServiceCharge(order) {
  if (!order) return null;
  const lbs = Number(order.actual_weight || order.weight || 0);
  const rate = Number(order.price_per_lb || order.rate || 1.75);
  if (lbs > 0) return lbs * rate;
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
