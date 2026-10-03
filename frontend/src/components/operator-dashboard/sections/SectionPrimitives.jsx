// SectionPrimitives.jsx — generic, service-agnostic UI building blocks
// shared by the per-service dashboard sections (PickupDeliverySection,
// WashFoldSection, SneakerCleaningSection). These are plain presentational
// pieces (a numbered step badge, a card header, an empty-state illustration,
// a clickable order row) — not business logic, so unlike each service's own
// data/flow they're meant to stay shared, same as the verification-code
// mechanism stayed shared on the backend side of this same separation.
import { Button } from "../../ui/button";
import { AlertTriangle, Printer, FileDown, RefreshCw, ChevronRight } from "lucide-react";
import Icon1 from "../../../assets/1.png";
import Icon2 from "../../../assets/2.png";
import { formatOrderNumber, safeString, formatCurrency } from "../utils";

export function isOrderOverdue(order) {
  const s = (order?.status || "").toString().toUpperCase();
  if (["COMPLETED", "CANCELLED", "DELIVERED"].includes(s)) return false;
  if (!order?.pickup_date) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const pickupDate = new Date(`${order.pickup_date}T00:00:00`);
  if (Number.isNaN(pickupDate.getTime())) return false;
  return pickupDate < today;
}

export function isOrderUrgent(order) {
  if (!order) return false;
  if (order.is_urgent || order.urgent) return true;
  if (order.priority && ["urgent", "high"].includes(String(order.priority).toLowerCase())) return true;
  return isOrderOverdue(order);
}

export const extractCP = (address) => {
  if (!address) return null;
  const match = address.match(/\b(\d{5})\b/);
  return match ? match[1] : null;
};

// Same colors as PLAN_LABELS in Orders.jsx, so the plan badge looks the
// same on both screens.
const PLAN_BADGE_STYLES = {
  standard: "bg-slate-100 text-slate-700 border-slate-200",
  premium:  "bg-sky-100 text-sky-700 border-sky-200",
  express:  "bg-amber-100 text-amber-700 border-amber-200",
};

export const SectionNumber = ({ number }) => {
  const icons = { "1": Icon1, "2": Icon2 };
  const icon = icons[number];
  return (
    <div className="shrink-0 mt-2 sm:mt-4 flex flex-col items-center">
      <div className="w-9 h-9 sm:w-14 sm:h-14 rounded-xl shadow-lg flex items-center justify-center overflow-hidden bg-white border border-slate-200">
        <img src={icon} alt={`Número ${number}`} className="w-7 h-7 sm:w-11 sm:h-11 object-contain" />
      </div>
      <div className="w-0.5 h-6 sm:h-8 bg-gradient-to-b from-slate-400 to-transparent mt-1" />
    </div>
  );
};

export const CardHeader = ({ icon, title, count, bgClass = "bg-black", testId }) => (
  <div className={`px-5 py-3.5 border-b border-slate-800 ${bgClass}`}>
    <div className="flex items-center gap-3">
      <span className="shrink-0 text-white/80">{icon}</span>
      <h2 className="font-bold text-white flex-1 text-xs sm:text-sm tracking-wide uppercase">{title}</h2>
      <span
        className="shrink-0 text-xs font-bold text-black bg-white rounded-full min-w-[24px] h-[24px] flex items-center justify-center px-1.5 shadow-sm"
        data-testid={testId}
      >
        {count}
      </span>
    </div>
  </div>
);

export const EmptyState = ({ icon, text, testId }) => (
  <div className="py-10 text-center" data-testid={testId}>
    <div className="mx-auto mb-3 w-14 h-14 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-300">
      {icon}
    </div>
    <p className="text-sm text-slate-400 font-medium">{text}</p>
  </div>
);

export const OrderRow = ({
  order,
  statusInfo,
  nextStatus,
  nextStatusInfo,
  updating,
  onRowClick,
  onAdvance,
  onPrint,
  onPDF,
  advanceBtnClass = "bg-slate-900 hover:bg-slate-800",
  showPrint = false,
  urgent = false,
  t,
}) => (
  <div
    className={`px-4 py-3.5 transition-colors cursor-pointer border-b last:border-b-0 group ${
      urgent
        ? "bg-red-50/60 hover:bg-red-50 border-red-100 border-l-4 border-l-red-500"
        : "bg-white hover:bg-slate-50/50 border-slate-100"
    }`}
    role="button"
    onClick={() => onRowClick(order)}
    data-testid={`order-row-${order.order_id || "unknown"}`}
  >
    <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-mono font-semibold text-slate-800 text-sm">
            {formatOrderNumber(order)}
          </span>
          {urgent && (
            <span
              className="inline-flex items-center gap-1 text-[10px] font-bold text-red-700 bg-red-100 px-2 py-0.5 rounded-full border border-red-300"
              data-testid={`urgent-badge-${order.order_id}`}
            >
              <AlertTriangle className="h-2.5 w-2.5" /> {t("Urgent", "Urgente")}
            </span>
          )}
          <span className={`px-2 py-0.5 text-[11px] font-semibold rounded-full border ${statusInfo.color}`}>
            {statusInfo.label}
          </span>
          {(order.is_recurring || (order.recurrence && order.recurrence !== "once")) && (
            <span
              className="inline-flex items-center gap-1 text-[10px] font-semibold text-violet-700 bg-violet-50 px-2 py-0.5 rounded-full border border-violet-200"
              title={order.recurrence_end_date ? `Termina ${order.recurrence_end_date}` : ""}
              data-testid={`recurring-badge-${order.order_id}`}
            >
              🔄{" "}
              {order.recurrence === "weekly"
                ? t("Weekly", "Semanal")
                : order.recurrence === "biweekly"
                ? t("Biweekly", "Quincenal")
                : order.recurrence === "twice_week"
                ? "2×/sem"
                : t("Recurring", "Recurrente")}
            </span>
          )}
          {order.service_type === "airbnb_host" && (
            <span className="text-[10px] font-medium text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full border border-orange-200">
              🏠 Airbnb
            </span>
          )}
          {order.service_type === "commercial" && (
            <span className="text-[10px] font-medium text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-200">
              🏢 B2B
            </span>
          )}
          {order.service_type === "sneaker_cleaning" && (
            <span className="text-[10px] font-medium text-violet-600 bg-violet-50 px-2 py-0.5 rounded-full border border-violet-200">
              👟 Sneaker
            </span>
          )}
          {order.service_plan && (
            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wide ${PLAN_BADGE_STYLES[(order.service_plan || "").toLowerCase()] || PLAN_BADGE_STYLES.standard}`}
              data-testid={`plan-badge-${order.order_id}`}
            >
              {(order.service_plan || "").toUpperCase()}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="font-semibold text-slate-700 text-sm truncate">
            {safeString(order.customer_name, t("Customer", "Cliente"))}
          </span>
          {extractCP(order.pickup_address || order.delivery_address) && (
            <span className="text-[10px] text-slate-400 font-mono bg-slate-100 px-1.5 py-0.5 rounded">
              CP {extractCP(order.pickup_address || order.delivery_address)}
            </span>
          )}
        </div>
        {(order.pickup_time_window || order.pickup_date) && (
          <p className="text-xs text-slate-400">
            {order.pickup_time_window || order.pickup_date}
          </p>
        )}
      </div>

      <div className="flex items-center gap-1.5 shrink-0 w-full sm:w-auto">
        {showPrint && (
          <>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 text-slate-400 hover:text-sky-600 hover:bg-sky-50 rounded-lg hidden sm:flex"
              onClick={(e) => { e.stopPropagation(); onPrint(order); }}
              data-testid={`print-btn-${order.order_id}`}
            >
              <Printer className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg hidden sm:flex"
              onClick={(e) => { e.stopPropagation(); onPDF(order); }}
              data-testid={`pdf-btn-${order.order_id}`}
            >
              <FileDown className="h-3.5 w-3.5" />
            </Button>
          </>
        )}
        {nextStatus && (
          <Button
            size="sm"
            className={`${advanceBtnClass} text-white text-xs h-9 sm:h-8 px-3 rounded-lg shadow-sm whitespace-nowrap w-full sm:w-auto justify-center`}
            onClick={(e) => { e.stopPropagation(); onAdvance(order.order_id, nextStatus); }}
            disabled={updating[order.order_id]}
            data-testid={`advance-btn-${order.order_id}`}
          >
            {updating[order.order_id] ? (
              <RefreshCw className="h-3 w-3 animate-spin" />
            ) : (
              <span className="flex items-center gap-1">
                {nextStatusInfo?.label}
                <ChevronRight className="h-3 w-3" />
              </span>
            )}
          </Button>
        )}
      </div>
    </div>
  </div>
);

// The "Request Payment" row style — same across all three services, just
// fed a different queue and a different print/collect handler set.
export const PaymentQueueRow = ({ order, statusInfo, onRowClick, onPrint, onPDF, onCollect, testIdPrefix, t, amountFallbackLabel }) => {
  const amount = Number(order.extra_charge ?? order.total_amount ?? 0);
  const urgent = isOrderUrgent(order);
  return (
    <div
      className={`px-4 py-3.5 transition-colors cursor-pointer border-b last:border-b-0 ${
        urgent
          ? "bg-red-50/60 hover:bg-red-50 border-red-100 border-l-4 border-l-red-500"
          : "bg-white hover:bg-slate-50/50 border-slate-100"
      }`}
      role="button"
      onClick={() => onRowClick(order)}
      data-testid={`${testIdPrefix}-${order.order_id || "unknown"}`}
    >
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-mono font-semibold text-slate-800 text-sm">{formatOrderNumber(order)}</span>
            {urgent && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red-700 bg-red-100 px-2 py-0.5 rounded-full border border-red-300">
                <AlertTriangle className="h-2.5 w-2.5" /> {t("Urgent", "Urgente")}
              </span>
            )}
            {statusInfo && (
              <span className={`px-2 py-0.5 text-[11px] font-semibold rounded-full border ${statusInfo.color}`}>{statusInfo.label}</span>
            )}
          </div>
          <p className="text-sm font-semibold text-slate-700 truncate">{safeString(order.customer_name, t("Customer", "Cliente"))}</p>
          <p className="text-xs text-slate-400">
            {t("Charge", "Cobro")}: <span className="font-semibold text-slate-600">{amount ? formatCurrency(amount) : amountFallbackLabel}</span>
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0 w-full sm:w-auto">
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-slate-400 hover:text-sky-600 hover:bg-sky-50 hidden sm:flex" onClick={(e) => { e.stopPropagation(); onPrint(order); }} data-testid={`${testIdPrefix}-print-${order.order_id}`}><Printer className="h-3.5 w-3.5" /></Button>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 hidden sm:flex" onClick={(e) => { e.stopPropagation(); onPDF(order); }} data-testid={`${testIdPrefix}-pdf-${order.order_id}`}><FileDown className="h-3.5 w-3.5" /></Button>
          <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-xs h-9 sm:h-8 px-3 rounded-lg shadow-sm w-full sm:w-auto justify-center" onClick={(e) => { e.stopPropagation(); onCollect(order); }} data-testid={`${testIdPrefix}-collect-${order.order_id}`}>{t("Collect", "Cobrar")}</Button>
        </div>
      </div>
    </div>
  );
};
