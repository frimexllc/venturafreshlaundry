/**
 * utils.js — SINGLE SOURCE OF TRUTH for frontend pricing
 *
 * MEMBERSHIP PRICING RULES (mirrors utils.py exactly):
 *
 *   While allowance lbs are still available:
 *     Standard → $0.00/lb on covered lbs  (fully included)
 *     Premium  → +$0.25/lb on covered lbs (speed surcharge only)
 *     Express  → +$0.50/lb on covered lbs (speed surcharge only)
 *
 *   After allowance is exhausted (member rates apply to ALL remaining lbs):
 *     Standard → $2.50/lb
 *     Premium  → $2.75/lb
 *     Express  → $3.00/lb
 *
 * P&D $40 MINIMUM:
 *   Applied ONLY when the FULL order at regular rates < $40
 *   AND no membership allowance covers any lbs.
 *
 * DELIVERY FEE TIERS:
 *   0–3 mi → $0.00
 *   3–5 mi → $1.99
 *   5–8 mi → $2.99
 *   8–12 mi → $4.99
 *   ≥12 mi → $8.99
 */

// ─── Status config ────────────────────────────────────────────────────────────

export const ORDER_STATUSES = [
  { value: "NEW",              label: "New",              color: "bg-yellow-100 text-yellow-800"  },
  { value: "CONFIRMED",        label: "Confirmed",        color: "bg-blue-100 text-blue-800"      },
  { value: "PICKED_UP",        label: "Picked Up",        color: "bg-indigo-100 text-indigo-800"  },
  { value: "PROCESSING",       label: "Processing",       color: "bg-purple-100 text-purple-800"  },
  { value: "READY",            label: "Ready",            color: "bg-teal-100 text-teal-800"      },
  { value: "OUT_FOR_DELIVERY", label: "Out for Delivery", color: "bg-orange-100 text-orange-800"  },
  { value: "DELIVERED",        label: "Delivered",        color: "bg-green-100 text-green-800"    },
  { value: "COMPLETED",        label: "Completed",        color: "bg-emerald-100 text-emerald-800"},
  { value: "CANCELLED",        label: "Cancelled",        color: "bg-red-100 text-red-800"        },
];

export const STORE_STATUS_FLOW = [
  "pending", "confirmed", "processing", "ready", "delivered", "completed",
];

export function getNextStoreStatus(current) {
  const idx = STORE_STATUS_FLOW.indexOf(current?.toLowerCase());
  if (idx < 0 || idx >= STORE_STATUS_FLOW.length - 1) return null;
  return STORE_STATUS_FLOW[idx + 1];
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
  const flow = [
    "NEW", "CONFIRMED", "PICKED_UP", "PROCESSING",
    "READY", "OUT_FOR_DELIVERY", "DELIVERED", "COMPLETED",
  ];
  const idx = flow.indexOf(s);
  if (idx < 0 || idx >= flow.length - 1) return null;
  return flow[idx + 1];
}

// ─── String helpers ───────────────────────────────────────────────────────────

export function safeString(val, fallback = "") {
  if (val === null || val === undefined) return fallback;
  return String(val);
}

export function formatApiError(detail, fallback = "Error") {
  if (!detail) return fallback;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail.map((d) => d.msg || d).join(", ");
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

export function dedupeOrders(orders) {
  if (!Array.isArray(orders)) return [];
  const seen = new Set();
  return orders.filter((o) => {
    const key = o.id || o.order_number || JSON.stringify(o);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ════════════════════════════════════════════════════════════════════════════
// PRICING TABLES — mirrors utils.py exactly
// ════════════════════════════════════════════════════════════════════════════

export const PRICING = {
  pickup_delivery: {
    standard: { regular: 2.75, member: 2.50 },
    premium:  { regular: 3.00, member: 2.75 },
    express:  { regular: 3.25, member: 3.00 },
  },
  wash_fold: {
    standard: { regular: 2.25, member: 2.25 },
    premium:  { regular: 2.50, member: 2.50 },
    express:  { regular: 2.75, member: 2.75 },
  },
  airbnb_host: {
    standard: { regular: 2.75, member: 2.50 },
    premium:  { regular: 3.00, member: 2.75 },
    express:  { regular: 3.25, member: 3.00 },
  },
  commercial: {
    standard: { regular: 2.75, member: 2.50 },
    premium:  { regular: 3.00, member: 2.75 },
    express:  { regular: 3.25, member: 3.00 },
  },
};

export const MEMBERSHIP_ALLOWANCE_SURCHARGE = {
  standard: 0.00,
  premium:  0.25,
  express:  0.50,
};

export const PLAN_ALLOWANCES = {
  "most popular":       60,
  "popular":            60,
  "standard":           60,
  "basic":              60,
  "family plus":        90,
  "family":             90,
  "familyplus":         90,
  "elite concierge":   120,
  "elite":             120,
  "concierge":         120,
  "executive premium": 200,
  "executive":         200,
};

export const PD_MINIMUM_CHARGE = 40.00;
export const WF_MINIMUM_LBS    = 10.0;

// ─── Delivery fee ────────────────────────────────────────────────────────────

export const DELIVERY_FEE_TIERS = [
  { maxMiles:  3, fee: 0.00 },
  { maxMiles:  5, fee: 1.99 },
  { maxMiles:  8, fee: 2.99 },
  { maxMiles: 12, fee: 4.99 },
  { maxMiles: 15, fee: 8.99 },
];

export function calcDeliveryFee(distanceMiles) {
  if (distanceMiles == null || isNaN(Number(distanceMiles))) return 0;
  const d = Number(distanceMiles);
  for (const tier of DELIVERY_FEE_TIERS) {
    if (d <= tier.maxMiles) return tier.fee;
  }
  return DELIVERY_FEE_TIERS[DELIVERY_FEE_TIERS.length - 1].fee;
}

// ─── Rate helpers ────────────────────────────────────────────────────────────

export function normalizeServiceType(serviceType) {
  const s = (serviceType || "pickup_delivery").toLowerCase().replace(/ /g, "_");
  if (s === "airbnb_host" || s === "commercial") return s;
  if (s.includes("wash") || s.includes("fold")) return "wash_fold";
  return "pickup_delivery";
}

export function getPlanAllowance(planName) {
  if (!planName) return 0;
  const key = planName.toLowerCase().trim().replace(/_/g, " ").replace(/-/g, " ");
  if (PLAN_ALLOWANCES[key] !== undefined) return PLAN_ALLOWANCES[key];
  for (const [k, v] of Object.entries(PLAN_ALLOWANCES)) {
    if (key.includes(k) || k.includes(key)) return v;
  }
  return 0;
}

export function getRate(serviceType, plan, isMember) {
  const svc   = normalizeServiceType(serviceType);
  const tier  = PRICING[svc] || PRICING.pickup_delivery;
  const rates = tier[plan] || tier.standard;
  return isMember ? rates.member : rates.regular;
}

// ════════════════════════════════════════════════════════════════════════════
// CORE BILLING FUNCTION (CLIENT-SIDE)
// ════════════════════════════════════════════════════════════════════════════

export function calculateOrderTotal(order, isMember = false, lbsCoveredOverride = null) {
  if (!order) return _emptyBreakdown();

  const serviceType  = normalizeServiceType(order.service_type);
  const plan         = (order.service_plan || "standard").toLowerCase();
  const isWF         = isWashFoldService(order.service_type);
  const lbsRaw       = Number(order.actual_lbs || 0);

  const addonsTotal = (order.addon_services || []).reduce(
    (sum, a) => sum + Number(a.price || 0) * Number(a.qty || a.quantity || 1), 0
  );

  if (lbsRaw <= 0 && addonsTotal === 0) return _emptyBreakdown();

  const deliveryFee = calcDeliveryFee(order.distance_miles);
  if (lbsRaw <= 0) {
    const total = addonsTotal + deliveryFee;
    return { ..._emptyBreakdown(), addonsTotal, deliveryFee, total, baseTotal: total };
  }

  const regularRate    = getRate(serviceType, plan, false);
  const memberRate     = getRate(serviceType, plan, true);
  const allowanceSurch = MEMBERSHIP_ALLOWANCE_SURCHARGE[plan] ?? 0.0;

  const billableLbs = isWF ? Math.max(lbsRaw, WF_MINIMUM_LBS) : lbsRaw;
  let lbsCovered, lbsExtra;

  if (lbsCoveredOverride !== null) {
    lbsCovered = Number(lbsCoveredOverride);
    lbsExtra   = Math.max(0, billableLbs - lbsCovered);
  } else if (isMember) {
    const membershipStatus = (order.membership_status || "").toLowerCase();
    const membershipActive = !["inactive","cancelled","canceled","expired"].includes(membershipStatus);
    if (membershipActive && order.membership_plan) {
      if (order.lbs_from_allowance !== undefined && order.lbs_from_allowance !== null) {
        lbsCovered = Number(order.lbs_from_allowance);
        lbsExtra   = Math.max(0, billableLbs - lbsCovered);
      } else {
        const allowance = getPlanAllowance(order.membership_plan);
        lbsCovered = Math.min(billableLbs, allowance);
        lbsExtra   = Math.max(0, billableLbs - lbsCovered);
      }
    } else {
      lbsCovered = 0;
      lbsExtra   = billableLbs;
    }
  } else {
    lbsCovered = 0;
    lbsExtra   = billableLbs;
  }

  // --- CORRECCIÓN: cuando allowance agotado, se cobra a tarifa regular ---
  let amountToCharge;
  if (isMember && lbsCovered > 0) {
    // Miembro con allowance activo: cubiertas solo surcharge, extra a regular
    const allowanceSurchCharge = lbsCovered * allowanceSurch;
    amountToCharge = allowanceSurchCharge + lbsExtra * regularRate;
  } else if (isMember) {
    // Miembro sin allowance: todas las libras a tarifa regular
    amountToCharge = billableLbs * regularRate;
  } else {
    // No miembro: tarifa regular
    amountToCharge = billableLbs * regularRate;
  }

  // Mínimo $40 para P&D
  if (!isWF) {
    const fullRegularPrice = billableLbs * regularRate;
    const orderBelowMinimum = fullRegularPrice < PD_MINIMUM_CHARGE;
    if (orderBelowMinimum && lbsCovered === 0) {
      amountToCharge = Math.max(amountToCharge, PD_MINIMUM_CHARGE);
    }
  }
  amountToCharge = Math.round(amountToCharge * 100) / 100;

  const fullRegular = Math.round(billableLbs * regularRate * 100) / 100;
  const membershipDiscount = isMember && lbsCovered > 0
    ? Math.max(0, Math.round((fullRegular - amountToCharge) * 100) / 100)
    : 0;

  const allowanceSurchForPlan = MEMBERSHIP_ALLOWANCE_SURCHARGE[plan] ?? 0;
  const fullyCovered = (
    isMember && lbsCovered >= billableLbs && allowanceSurchForPlan === 0 &&
    addonsTotal === 0 && deliveryFee === 0
  );
  const total = fullyCovered ? 0 : Math.round((amountToCharge + deliveryFee + addonsTotal) * 100) / 100;

  return {
    lbs: lbsRaw,
    billableLbs,
    plan,
    isMember,
    isExpress: plan === "express",
    regularRate,
    memberRate,
    rateUsed: isMember ? memberRate : regularRate,
    allowanceSurcharge: allowanceSurch,
    lbsCovered: Math.round(lbsCovered * 10) / 10,
    lbsExtra: Math.round(lbsExtra * 10) / 10,
    lbsFromAllowance: Math.round(lbsCovered * 10) / 10,
    extraLbsBilled: Math.round(lbsExtra * 10) / 10,
    subtotal: fullRegular,
    membershipDiscount,
    amountToCharge,
    extraCharge: amountToCharge,
    deliveryFee,
    addonsTotal: Math.round(addonsTotal * 100) / 100,
    baseTotal: total,
    total,
    fullyCoveredByMembership: fullyCovered,
    membershipApplied: isMember && lbsCovered > 0,
    allowanceExhausted: isMember && lbsCovered === 0,
  };
}

function _emptyBreakdown() {
  return {
    lbs: 0, billableLbs: 0, plan: "standard",
    isMember: false, isExpress: false,
    regularRate: 0, memberRate: 0, rateUsed: 0, allowanceSurcharge: 0,
    lbsCovered: 0, lbsExtra: 0, lbsFromAllowance: 0, extraLbsBilled: 0,
    subtotal: 0, membershipDiscount: 0, amountToCharge: 0, extraCharge: 0,
    deliveryFee: 0, addonsTotal: 0,
    baseTotal: 0, total: 0,
    fullyCoveredByMembership: false, membershipApplied: false, allowanceExhausted: false,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// buildDisplayBreakdown — reads backend fields directly
// ════════════════════════════════════════════════════════════════════════════

export function buildDisplayBreakdown(order) {
  if (!order) {
    return {
      lbs: 0, plan: "standard", isMember: false,
      regularRate: 0, memberRate: 0,
      lbsCovered: 0, lbsExtra: 0,
      discount: 0, extraCharge: 0,
      deliveryFee: 0, addonsTotal: 0, total: 0,
      allowanceSurcharge: 0,
      allowanceExhausted: false,
    };
  }

  const lbs = Number(order.actual_lbs || 0);
  const plan = (order.service_plan || "standard").toLowerCase();
  const serviceType = normalizeServiceType(order.service_type);

  const membershipStatus = (order.membership_status || "").toLowerCase();
  const isMember = Boolean(order.membership_plan) &&
    !["inactive", "cancelled", "canceled", "expired"].includes(membershipStatus);

  const regularRate = getRate(serviceType, plan, false);
  const memberRate = getRate(serviceType, plan, true);

  const lbsCoveredFromBackend = Number(order.lbs_from_allowance ?? 0);
  const lbsExtraFromBackend = Number(order.extra_lbs_billed ?? Math.max(0, lbs - lbsCoveredFromBackend));
  const discount = Number(order.membership_discount ?? 0);
  const extraCharge = Number(order.extra_charge ?? 0);
  const deliveryFee = Number(order.delivery_fee ?? calcDeliveryFee(order.distance_miles));
  const addonsTotal = (order.addon_services || []).reduce(
    (s, a) => s + Number(a.price || 0) * Number(a.qty || a.quantity || 1), 0
  );

  const allowanceExhausted = isMember && lbsCoveredFromBackend === 0 && lbs > 0;

  // Cuando allowance agotado, todas las lbs se cobran a tarifa regular
  // y no deben mostrarse líneas de "Extra lbs" separadas.
  const lbsCovered = allowanceExhausted ? 0 : lbsCoveredFromBackend;
  const lbsExtra = allowanceExhausted ? 0 : lbsExtraFromBackend;

  let total;
  if (extraCharge > 0) {
    total = extraCharge + deliveryFee + addonsTotal;
  } else if (isMember && lbsCoveredFromBackend >= lbs && MEMBERSHIP_ALLOWANCE_SURCHARGE[plan] === 0 && addonsTotal === 0 && deliveryFee === 0) {
    total = 0;
  } else if (allowanceExhausted) {
    total = (lbs * regularRate) + deliveryFee + addonsTotal;
  } else {
    total = calculateOrderTotal(order, isMember, lbsCoveredFromBackend).total;
  }

  total = Math.round(total * 100) / 100;

  return {
    lbs,
    plan,
    isMember,
    regularRate,
    memberRate,
    lbsCovered,
    lbsExtra,
    discount,
    extraCharge,
    deliveryFee,
    addonsTotal,
    total,
    allowanceSurcharge: MEMBERSHIP_ALLOWANCE_SURCHARGE[plan] ?? 0,
    allowanceExhausted,
  };
}

export function isOrderCoveredByMembership(order) {
  if (!order) return false;
  const extraCharge = order.extra_charge ?? order.total_amount ?? 0;
  const hasMembership = !!order.membership_plan;
  return hasMembership && extraCharge <= 0.50;
}