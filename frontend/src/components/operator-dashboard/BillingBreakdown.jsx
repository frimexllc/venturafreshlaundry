/**
 * BillingBreakdown.jsx — CORREGIDO
 *
 * FUENTE DE VERDAD: usa los campos del backend (lbs_from_allowance, extra_lbs_billed,
 * extra_charge) cuando están disponibles.
 *
 * customerCycleUsage se usa SOLO para mostrar la barra de progreso del ciclo,
 * NO para decidir cuántas lbs están cubiertas en esta orden específica.
 */

import { Award, AlertCircle, Truck, Package, CreditCard, TrendingUp, Calendar } from "lucide-react";
import {
  formatCurrency,
  PD_MINIMUM_CHARGE,
  isWashFoldService,
  MEMBERSHIP_ALLOWANCE_SURCHARGE,
  calcDeliveryFee,
} from "./utils";

// Tabla de precios local
function getRate(serviceType, plan, isMember) {
  const PRICING = {
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
  const svc   = (serviceType || "pickup_delivery").toLowerCase().replace(/ /g, "_");
  const tier  = PRICING[svc] || PRICING.pickup_delivery;
  const rates = tier[plan] || tier.standard;
  return isMember ? rates.member : rates.regular;
}

export default function BillingBreakdown({ order, t, hasMembership, customerCycleUsage }) {
  if (!order) return null;

  const lbs        = Number(order.actual_lbs || 0);
  const plan       = (order.service_plan || "standard").toLowerCase();
  const isWF       = isWashFoldService(order.service_type);
  const isMember   = hasMembership !== undefined
    ? hasMembership
    : Boolean(order.membership_plan) &&
      !["inactive", "cancelled", "canceled", "expired"].includes(
        (order.membership_status || "").toLowerCase()
      );

  const regularRate      = getRate(order.service_type, plan, false);
  const allowanceSurcharge = MEMBERSHIP_ALLOWANCE_SURCHARGE[plan] || 0;

  // ─── FUENTE DE VERDAD: campos del backend ────────────────────────────────
  // Estos campos los setea el backend al momento de calcular el cobro.
  // Si existen, son la autoridad.
  const backendLbsCovered  = order.lbs_from_allowance != null ? Number(order.lbs_from_allowance) : null;
  const backendLbsExtra    = order.extra_lbs_billed    != null ? Number(order.extra_lbs_billed)   : null;
  const backendExtraCharge = order.extra_charge        != null ? Number(order.extra_charge)       : null;

  // Determinar si usamos datos del backend
  const hasBackendData = (backendLbsCovered !== null || backendExtraCharge !== null) && lbs > 0;

  let lbsCovered, lbsExtra, extraCharge, allowanceExhausted;

  if (hasBackendData) {
    // ✅ Usar datos exactos del backend
    lbsCovered = backendLbsCovered ?? 0;
    lbsExtra = backendLbsExtra ?? Math.max(0, lbs - lbsCovered);
    allowanceExhausted = isMember && lbsCovered === 0 && lbs > 0;
    extraCharge = backendExtraCharge !== null 
      ? backendExtraCharge 
      : (allowanceExhausted ? lbs * regularRate : (lbsCovered * allowanceSurcharge) + (lbsExtra * regularRate));
  } else {
    // ⚠️ Sin datos del backend (orden nueva sin peso registrado): mostrar estimación
    lbsCovered = 0;
    lbsExtra = lbs;
    allowanceExhausted = false;
    extraCharge = lbs * regularRate;
  }

  // Aplicar mínimo $40 para P&D sin membresía
  if (!isWF && !isMember && extraCharge > 0 && extraCharge < PD_MINIMUM_CHARGE && !hasBackendData) {
    extraCharge = PD_MINIMUM_CHARGE;
  }

  const fullRegularPrice = lbs * regularRate;
  const addonServices    = order.addon_services || [];
  const addonsTotal      = addonServices.reduce(
    (s, a) => s + Number(a.price || 0) * Number(a.qty || a.quantity || 1), 0
  );
  const deliveryFee = Number(order.delivery_fee ?? calcDeliveryFee(order.distance_miles) ?? 0);

  const hasAllowance = isMember && lbsCovered > 0;
  const fullyCovered = hasAllowance && lbsExtra === 0 && allowanceSurcharge === 0
    && addonsTotal === 0 && deliveryFee === 0 && extraCharge <= 0.50;

  const totalWeightCharge = hasAllowance
    ? (lbsCovered * allowanceSurcharge) + (lbsExtra * regularRate)
    : extraCharge;
  const totalSavings = fullRegularPrice - totalWeightCharge;

  const total = fullyCovered
    ? 0
    : Math.round((extraCharge + deliveryFee + addonsTotal) * 100) / 100;

  // Progreso del ciclo (solo visual, NO afecta cálculos de esta orden)
  const allowanceProgress = customerCycleUsage && customerCycleUsage.lbs_allowance > 0
    ? Math.min((customerCycleUsage.lbs_used / customerCycleUsage.lbs_allowance) * 100, 100)
    : 0;

  const rowCls    = "flex items-start justify-between gap-3 py-2 border-b border-slate-100 last:border-0";
  const labelCls  = "text-slate-500 text-xs leading-snug flex-1";
  const valueCls  = "font-semibold text-slate-700 text-xs text-right whitespace-nowrap";
  const headerCls = "text-[10px] font-black uppercase tracking-[0.12em] text-slate-400 mb-1 mt-3 first:mt-0 px-0.5";

  return (
    <div className="rounded-xl bg-slate-50 border border-slate-200 overflow-hidden shadow-sm">

      {/* Banner: allowance agotado */}
      {isMember && allowanceExhausted && lbs > 0 && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-amber-50 border-b border-amber-200 text-amber-800">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span className="text-xs font-semibold">
            {t(
              "Monthly allowance fully used — regular rates apply",
              "Allowance mensual agotado — se aplican tarifas regulares"
            )}
          </span>
        </div>
      )}

      {/* Barra de progreso del ciclo (solo informativa - NO afecta cálculos) */}
      {isMember && customerCycleUsage && (
        <div className="px-4 py-3 bg-sky-50 border-b border-sky-100 space-y-2">
          <div className="flex flex-wrap justify-between items-center gap-2 text-xs text-sky-800">
            <div className="flex items-center gap-2">
              <Calendar className="w-3.5 h-3.5 shrink-0" />
              <span>
                {t("Cycle:", "Ciclo:")} {customerCycleUsage.cycle_start} – {customerCycleUsage.cycle_end}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <TrendingUp className="w-3.5 h-3.5 shrink-0" />
              <span>
                {t("Used / Allowance:", "Usado / Allowance:")}{" "}
                {customerCycleUsage.lbs_used} / {customerCycleUsage.lbs_allowance} lbs
              </span>
            </div>
            <div className="font-semibold">
              {t("Remaining:", "Restante:")} {Math.max(0, customerCycleUsage.lbs_remaining)} lbs
            </div>
          </div>
          <div className="w-full bg-sky-200 rounded-full h-1.5 overflow-hidden">
            <div
              className={`h-full rounded-full ${allowanceProgress >= 100 ? "bg-amber-500" : "bg-sky-600"}`}
              style={{ width: `${allowanceProgress}%` }}
            />
          </div>
          {/* Nota aclaratoria si esta orden se procesó antes de agotar el allowance */}
          {hasBackendData && lbsCovered > 0 && customerCycleUsage?.lbs_remaining <= 0 && (
            <p className="text-[10px] text-sky-700 font-medium">
              {t(
                "This order was processed before the allowance was exhausted.",
                "Esta orden fue procesada antes de que se agotara el allowance."
              )}
            </p>
          )}
        </div>
      )}

      {/* Sin lbs ni add-ons */}
      {lbs === 0 && addonServices.length === 0 && (
        <div className="px-4 py-6 text-center text-slate-400 text-xs">
          {t("Weight not recorded yet", "Peso aún no registrado")}
        </div>
      )}

      {(lbs > 0 || addonServices.length > 0) && (
        <div className="px-4 py-3">

          {/* ── Peso y tarifa ─────────────────────────────────── */}
          {lbs > 0 && (
            <>
              <p className={headerCls}>{t("Weight & Rate", "Peso y Tarifa")}</p>

              {/* Precio regular de referencia */}
              <div className={rowCls}>
                <span className={labelCls}>
                  {lbs} lbs × ${regularRate.toFixed(2)}/lb
                  <span className="ml-1 text-slate-400">({t("regular rate", "tarifa regular")})</span>
                </span>
                <span className={valueCls}>{formatCurrency(fullRegularPrice)}</span>
              </div>

              {/* Miembro con allowance disponible en esta orden */}
              {hasAllowance && (
                <>
                  <div className={`${rowCls} bg-emerald-50 rounded-md px-2 -mx-2`}>
                    <span className="flex items-start gap-1 text-emerald-700 text-xs font-semibold flex-1">
                      <Award className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      {lbsCovered} lbs {t("covered by membership", "cubiertas por membresía")}
                    </span>
                    <span className="font-bold text-emerald-700 text-xs text-right">
                      {allowanceSurcharge > 0
                        ? `+ ${formatCurrency(lbsCovered * allowanceSurcharge)}`
                        : t("$0 (fully included)", "$0 (totalmente incluidas)")}
                    </span>
                  </div>

                  {allowanceSurcharge > 0 && (
                    <div className="pl-6 mt-[-6px] mb-1 text-[10px] text-slate-500">
                      {t("Speed surcharge", "Cargo por velocidad")}: {lbsCovered} lbs × $
                      {allowanceSurcharge.toFixed(2)}/lb = {formatCurrency(lbsCovered * allowanceSurcharge)}
                    </div>
                  )}

                  {/* Libras extra fuera del allowance */}
                  {lbsExtra > 0 && (
                    <>
                      <div className={`${rowCls} bg-amber-50 rounded-md px-2 -mx-2`}>
                        <span className="flex items-start gap-1 text-amber-700 text-xs font-semibold flex-1">
                          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                          {lbsExtra} lbs {t("outside allowance", "fuera del allowance")}
                        </span>
                        <span className="font-bold text-amber-700 text-xs text-right">
                          + {formatCurrency(lbsExtra * regularRate)}
                        </span>
                      </div>
                      <div className="pl-6 mt-[-6px] text-[10px] text-slate-500">
                        {t("Charged at regular rate", "Cobradas a tarifa regular")}: {lbsExtra} lbs × $
                        {regularRate.toFixed(2)}/lb = {formatCurrency(lbsExtra * regularRate)}
                      </div>
                    </>
                  )}

                  {/* Todo cubierto sin cargo */}
                  {lbsExtra === 0 && allowanceSurcharge === 0 && (
                    <div className="text-emerald-600 text-xs mt-1 px-2 py-1 bg-emerald-50 rounded-md">
                      ✅ {t(
                        "All lbs covered at $0 — no charge for weight",
                        "Todas las libras cubiertas a $0 — sin cargo por peso"
                      )}
                    </div>
                  )}

                  {/* Ahorro total */}
                  {totalSavings > 0 && (
                    <div className="flex justify-end text-emerald-600 text-xs mt-1">
                      {t("You saved", "Ahorraste")}: {formatCurrency(totalSavings)}
                    </div>
                  )}
                </>
              )}

              {/* Miembro con allowance agotado en esta orden */}
              {isMember && allowanceExhausted && (
                <>
                  <div className={`${rowCls} bg-slate-100 rounded-md px-2 -mx-2`}>
                    <span className="flex items-start gap-1 text-slate-700 text-xs font-semibold flex-1">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      {lbs} lbs × ${regularRate.toFixed(2)}/lb
                    </span>
                    <span className="font-bold text-slate-700 text-xs text-right">
                      {formatCurrency(lbs * regularRate)}
                    </span>
                  </div>
                  <div className="pl-6 text-[10px] text-slate-500">
                    {t(
                      "Monthly allowance exhausted, regular rates apply",
                      "Allowance mensual agotado, se aplican tarifas regulares"
                    )}
                  </div>
                </>
              )}

              {/* No miembro — mínimo $40 para P&D */}
              {!isMember && fullRegularPrice > 0 && fullRegularPrice < PD_MINIMUM_CHARGE && !isWF && !hasBackendData && (
                <div className={`${rowCls} bg-amber-50 rounded-md px-2 -mx-2`}>
                  <span className="flex items-start gap-1 text-amber-700 text-xs font-semibold flex-1">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    {t("P&D minimum charge applied", "Aplicado mínimo de P&D")} (${PD_MINIMUM_CHARGE.toFixed(2)})
                    <span className="font-normal text-slate-500 ml-1">
                      ({formatCurrency(fullRegularPrice)} {t("below minimum", "por debajo del mínimo")})
                    </span>
                  </span>
                  <span className="font-bold text-amber-700 text-xs text-right">
                    = {formatCurrency(PD_MINIMUM_CHARGE)}
                  </span>
                </div>
              )}
            </>
          )}

          {/* ── Add-ons ──────────────────────────────────────── */}
          {addonServices.length > 0 && (
            <>
              <p className={headerCls}>{t("Individual items / Add-ons", "Artículos / Extras")}</p>
              {addonServices.map((addon, idx) => {
                const qty   = parseInt(addon.qty || addon.quantity || 1);
                const price = parseFloat(addon.price || 0);
                return (
                  <div key={idx} className={rowCls}>
                    <span className={labelCls}>
                      <Package className="w-3.5 h-3.5 inline mr-1.5 text-slate-400 shrink-0" />
                      {addon.name}
                      {qty > 1 && <span className="ml-1 text-sky-600 font-semibold">×{qty}</span>}
                      <span className="ml-1 text-slate-400">(${price.toFixed(2)}/u)</span>
                    </span>
                    <span className={valueCls}>{formatCurrency(price * qty)}</span>
                  </div>
                );
              })}
            </>
          )}

          {/* ── Delivery fee ─────────────────────────────────── */}
          {(deliveryFee > 0 || order.distance_miles != null) && (
            <>
              <p className={headerCls}>{t("Delivery", "Entrega")}</p>
              {deliveryFee > 0 ? (
                <div className={rowCls}>
                  <span className={`${labelCls} flex items-center gap-1`}>
                    <Truck className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    {t("Delivery fee", "Tarifa de entrega")}
                    {order.distance_miles != null && (
                      <span className="text-slate-400 ml-1">
                        ({Number(order.distance_miles).toFixed(1)} mi)
                      </span>
                    )}
                  </span>
                  <span className={valueCls}>{formatCurrency(deliveryFee)}</span>
                </div>
              ) : (
                order.distance_miles != null && order.distance_miles <= 3 && (
                  <div className={rowCls}>
                    <span className={`${labelCls} flex items-center gap-1`}>
                      <Truck className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                      {t("Free delivery", "Entrega gratuita")}
                      <span className="text-slate-400 ml-1">
                        ({Number(order.distance_miles).toFixed(1)} mi ≤ 3 mi)
                      </span>
                    </span>
                    <span className="font-semibold text-emerald-600 text-xs text-right">$0.00</span>
                  </div>
                )
              )}
            </>
          )}

          {/* ── Total ────────────────────────────────────────── */}
          <div className="flex items-center justify-between mt-4 pt-3 border-t-2 border-slate-200 bg-white rounded-b-lg">
            <span className="font-bold text-slate-800 text-sm">{t("Total", "Total")}</span>
            <span className="text-2xl font-extrabold text-slate-900 tracking-tight">
              {formatCurrency(fullyCovered ? 0 : total)}
            </span>
          </div>

          {/* Nota tarjeta */}
          {!fullyCovered && total > 0 && (
            <div className="flex items-center gap-1.5 mt-2 text-[10px] text-slate-400">
              <CreditCard className="w-3.5 h-3.5 shrink-0" />
              <span>
                {t("Card (Stripe): +3% → total ", "Tarjeta (Stripe): +3% → total ")}
                <strong className="text-slate-600">{formatCurrency(total * 1.03)}</strong>
                {" · "}
                {t("Zelle / Venmo / Cash App: no extra fee", "Zelle / Venmo / Cash App: sin comisión extra")}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}