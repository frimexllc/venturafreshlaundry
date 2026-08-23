import { useState, useEffect, useMemo } from "react";
import axios from "axios";
import { toast } from "sonner";
import {
  Plus, Calendar, Truck, MoreHorizontal, Eye, CheckCircle,
  Download, Loader2, ZoomIn, Search,
  LayoutGrid, List, Clock, Star, Package, RefreshCw,
  ChevronDown, ChevronUp, ChevronLeft, ChevronRight, X,
  User, MapPin, CreditCard, Banknote, SlidersHorizontal, Inbox, Camera,
  Shirt, Store, Building2, Home, Sparkles, CheckCircle2, CalendarClock,
  PackageCheck, BadgeCheck, PartyPopper, XCircle, Undo2, AlertTriangle,
  Edit, // <-- NUEVO
} from "lucide-react";
import { useLocale } from "../context/LocaleContext";
import { formatShortDatePT } from "../utils/dateUtils";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogTrigger, DialogDescription
} from "../components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "../components/ui/select";
import { Textarea } from "../components/ui/textarea";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger, DropdownMenuSeparator
} from "../components/ui/dropdown-menu";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import ConfirmDialog from "../components/ConfirmDialog";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// ─── CONSTANTS ──────────────────────────────────────────────────────────────

const SERVICE_TYPES = {
  pickup_delivery: { label: "Pickup & Delivery", Icon: Truck, color: "#0ea5e9" },
  wash_fold: { label: "Wash & Fold", Icon: Shirt, color: "#8b5cf6" },
  self_service: { label: "Self Service", Icon: Store, color: "#f59e0b" },
  commercial: { label: "Commercial / B2B", Icon: Building2, color: "#6366f1" },
  airbnb_host: { label: "Airbnb Host", Icon: Home, color: "#f97316" },
};

const PLAN_LABELS = {
  standard: { label: "Standard", time: "36h", badge: "bg-slate-100 text-slate-700" },
  premium: { label: "Premium", time: "24h", badge: "bg-sky-100 text-sky-700" },
  express: { label: "Express", time: "Same Day", badge: "bg-amber-100 text-amber-700" },
};

const STATUS_LABELS = {
  new: { label: "New", color: "bg-blue-100 text-blue-700", Icon: Sparkles },
  confirmed: { label: "Confirmed", color: "bg-cyan-100 text-cyan-700", Icon: CheckCircle2 },
  pickup_scheduled: { label: "Pickup Scheduled", color: "bg-purple-100 text-purple-700", Icon: CalendarClock },
  picked_up: { label: "Picked Up", color: "bg-indigo-100 text-indigo-700", Icon: PackageCheck },
  processing: { label: "Processing", color: "bg-amber-100 text-amber-700", Icon: RefreshCw },
  ready: { label: "Ready", color: "bg-emerald-100 text-emerald-700", Icon: BadgeCheck },
  out_for_delivery: { label: "Out for Delivery", color: "bg-orange-100 text-orange-700", Icon: Truck },
  delivered: { label: "Delivered", color: "bg-green-100 text-green-700", Icon: PackageCheck },
  completed: { label: "Completed", color: "bg-emerald-100 text-emerald-700", Icon: PartyPopper },
  cancelled: { label: "Cancelled", color: "bg-red-100 text-red-700", Icon: XCircle },
};

const PAYMENT_STATUS = {
  paid: { label: "Paid", color: "bg-green-100 text-green-700", Icon: CreditCard },
  pending: { label: "Pending", color: "bg-yellow-100 text-yellow-700", Icon: Clock },
  refunded: { label: "Refunded", color: "bg-red-100 text-red-700", Icon: Undo2 },
  failed: { label: "Failed", color: "bg-red-100 text-red-700", Icon: XCircle },
};

const STATUS_ACTION_META = {
  confirmed: { en: "confirm", es: "confirmar" },
  pickup_scheduled: { en: "schedule pickup", es: "programar pickup" },
  picked_up: { en: "mark as picked up", es: "marcar como recogida" },
  processing: { en: "start processing", es: "iniciar procesamiento" },
  ready: { en: "mark as ready", es: "marcar como lista" },
  out_for_delivery: { en: "mark as out for delivery", es: "marcar en camino" },
  delivered: { en: "mark as delivered", es: "marcar como entregada" },
  completed: { en: "complete", es: "completar" },
  cancelled: { en: "cancel", es: "cancelar" },
};

const DEFAULT_FILTERS = {
  status: "all",
  service: "all",
  payment: "all",
  search: "",
  dateFrom: "",
  dateTo: "",
};

const PAGE_SIZE_OPTIONS = [25, 50, 100];

const EVIDENCE_IMAGE_LABELS = {
  pickup: { en: "Pickup", es: "Recogida" },
  weight: { en: "Weight", es: "Peso" },
  delivery: { en: "Delivery", es: "Entrega" },
};

const URGENCY_META = {
  overdue: {
    label: { en: "Overdue", es: "Atrasada" },
    pill: "bg-red-100 text-red-700 border border-red-200",
    rowBg: "bg-red-50/60",
    borderColor: "#ef4444",
  },
  today: {
    label: { en: "Today", es: "Hoy" },
    pill: "bg-amber-100 text-amber-700 border border-amber-200",
    rowBg: "bg-amber-50/50",
    borderColor: "#f59e0b",
  },
  express: {
    label: { en: "Express", es: "Express" },
    pill: "bg-violet-100 text-violet-700 border border-violet-200",
    rowBg: "",
    borderColor: "#8b5cf6",
  },
};

const getAdminToken = () => localStorage.getItem("token") || sessionStorage.getItem("token");

const emptyForm = {
  customer_id: "",
  service_type: "pickup_delivery",
  service_plan: "standard",
  pickup_date: "",
  pickup_time_window: "",
  pickup_address: "",
  delivery_address: "",
  estimated_lbs: "",
  notes: "",
  gate_code: "",
  addon_services: [],
};

// ─── UTILITY FUNCTIONS ──────────────────────────────────────────────────────

const normalizeStatus = (status) =>
  (status || "").toString().trim().toLowerCase().replace(/\s+/g, "_");

const normalizeText = (value) => (value || "").toString().toLowerCase();

const getInitials = (name) =>
  name?.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2) || "?";

const formatCurrency = (amount) =>
  amount != null ? `$${parseFloat(amount).toFixed(2)}` : "-";

const formatDate = (dateStr) =>
  dateStr ? formatShortDatePT(dateStr) : "-";

const formatOrderNumber = (order) => {
  if (!order) return "-";
  if (order.order_number?.startsWith("VFL-")) return order.order_number;
  const dateSlug = buildDateSlug(order.pickup_date || order.created_at);
  const raw = (order.order_number || order.id || "00000000").toString();
  const short = raw.replace(/[^a-zA-Z0-9]/g, "").toLowerCase().slice(-8).padStart(8, "0");
  return `VFL-${dateSlug}-${short}`;
};

const buildDateSlug = (dateStr) => {
  if (!dateStr) return new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const safeStr = dateStr.includes("T") ? dateStr : dateStr + "T12:00:00";
  const d = new Date(safeStr);
  if (isNaN(d.getTime())) return new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
};

const normalizeServiceTypeKey = (value) =>
  (value || "").toString().trim().toLowerCase().replace(/[\s-]+/g, "_");

const getOrderEvidenceTypes = (order) => {
  const serviceType = normalizeServiceTypeKey(order?.service_type);
  if (serviceType === "pickup_delivery" || serviceType === "wash_fold") {
    return ["pickup", "weight", "delivery"];
  }
  return ["pickup", "weight", "delivery"].filter((type) => {
    if (type === "pickup") return Boolean(order?.pickup_image_id || order?.pickup_image_url || order?.pickup_image_data);
    if (type === "weight") return Boolean(order?.weight_image_id || order?.weight_image_url || order?.weight_image_data);
    return Boolean(order?.delivery_image_id || order?.delivery_image_url || order?.delivery_image_data);
  });
};

const shouldShowEvidenceSection = (order) => {
  const serviceType = normalizeServiceTypeKey(order?.service_type);
  if (serviceType === "pickup_delivery" || serviceType === "wash_fold") {
    return true;
  }
  return getOrderEvidenceTypes(order).length > 0;
};

const getServiceLabel = (key) => SERVICE_TYPES[key]?.label || key || "-";
const getServiceIcon = (key) => SERVICE_TYPES[key]?.Icon || Package;
const getServiceColor = (key) => SERVICE_TYPES[key]?.color || "#64748b";
const getPlanLabel = (key) => PLAN_LABELS[key]?.label || key || "-";
const getPlanBadge = (key) => PLAN_LABELS[key]?.badge || "bg-slate-100 text-slate-700";
const getStatusLabel = (key) => STATUS_LABELS[normalizeStatus(key)]?.label || key || "-";
const getStatusColor = (key) => STATUS_LABELS[normalizeStatus(key)]?.color || "bg-slate-100 text-slate-700";
const getStatusIcon = (key) => STATUS_LABELS[normalizeStatus(key)]?.Icon || Package;
const getPaymentLabel = (key) => PAYMENT_STATUS[key?.toLowerCase()]?.label || key || "-";
const getPaymentColor = (key) => PAYMENT_STATUS[key?.toLowerCase()]?.color || "bg-slate-100 text-slate-700";
const getPaymentIcon = (key) => PAYMENT_STATUS[key?.toLowerCase()]?.Icon || CreditCard;

const getLocalDate = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const dateOnly = (dateStr) => {
  if (!dateStr) return "";
  const str = dateStr.toString();
  return str.includes("T") ? str.split("T")[0] : str.slice(0, 10);
};

const isActiveStatus = (status) =>
  !["completed", "cancelled", "delivered"].includes(normalizeStatus(status));

// ─── SLA / URGENCY LOGIC ────────────────────────────────────────────────────
// El plazo se cuenta desde que la orden fue CREADA (created_at), no desde
// la fecha de pickup. Cada plan tiene una ventana distinta:
//   Standard -> 36 horas
//   Premium  -> 24 horas
//   Express  -> mismo día (vence a las 23:59:59 del día de creación)
const PLAN_SLA_HOURS = {
  standard: 36,
  premium: 24,
};

const parseServerDate = (dateStr) => {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d;
};

const getSlaDeadline = (order) => {
  const createdAt = parseServerDate(order?.created_at);
  if (!createdAt) return null;

  const plan = (order?.service_plan || "standard").toLowerCase();

  if (plan === "express") {
    // Vence al final del mismo día calendario en que se creó la orden
    const deadline = new Date(createdAt);
    deadline.setHours(23, 59, 59, 999);
    return deadline;
  }

  const hours = PLAN_SLA_HOURS[plan] ?? PLAN_SLA_HOURS.standard;
  return new Date(createdAt.getTime() + hours * 60 * 60 * 1000);
};

const getUrgency = (order) => {
  if (!isActiveStatus(order.status)) return null;

  const deadline = getSlaDeadline(order);
  const now = new Date();

  // Fuera de tiempo: ya se venció el plazo real (fecha + hora), según el plan
  if (deadline && now.getTime() > deadline.getTime()) {
    return { level: "overdue" };
  }

  // Aún dentro del plazo, pero el pickup es hoy
  const pickup = dateOnly(order.pickup_date);
  const today = getLocalDate();
  if (pickup && pickup === today) return { level: "today" };

  if ((order.service_plan || "").toLowerCase() === "express") {
    return { level: "express" };
  }

  return null;
};

const orderMatchesFilters = (order, filters) => {
  if (!order) return false;

  if (filters.status !== "all" && normalizeStatus(order.status) !== filters.status) {
    return false;
  }

  if (filters.service !== "all" && order.service_type !== filters.service) {
    return false;
  }

  if (filters.payment !== "all") {
    const isPaid = normalizeText(order.payment_status) === "paid";
    if (filters.payment === "paid" && !isPaid) return false;
    if (filters.payment === "pending" && isPaid) return false;
  }

  const pickup = dateOnly(order.pickup_date);
  if (filters.dateFrom && (!pickup || pickup < filters.dateFrom)) return false;
  if (filters.dateTo && (!pickup || pickup > filters.dateTo)) return false;

  const query = filters.search?.trim().toLowerCase();
  if (query) {
    const haystack = [
      order.customer_name,
      order.customer_email,
      order.customer_phone,
      formatOrderNumber(order),
      order.order_number,
      order.pickup_address,
      order.delivery_address,
      order.notes,
    ]
      .map(normalizeText)
      .join(" \u2022 ");
    if (!haystack.includes(query)) return false;
  }

  return true;
};

const SORT_ACCESSORS = {
  order_number: (o) => formatOrderNumber(o),
  customer_name: (o) => normalizeText(o.customer_name),
  service_type: (o) => normalizeText(o.service_type),
  pickup_date: (o) => dateOnly(o.pickup_date) || "0000-00-00",
  status: (o) => normalizeStatus(o.status),
  payment_status: (o) => normalizeText(o.payment_status),
  total_amount: (o) => parseFloat(o.total_amount) || 0,
};

const sortOrders = (list, sort) => {
  const accessor = SORT_ACCESSORS[sort.key] || SORT_ACCESSORS.pickup_date;
  const dir = sort.direction === "asc" ? 1 : -1;
  return [...list].sort((a, b) => {
    const av = accessor(a);
    const bv = accessor(b);
    if (av < bv) return -1 * dir;
    if (av > bv) return 1 * dir;
    return 0;
  });
};

// ─── SHARED VISUAL PIECES (module scope) ────────────────────────────────────

function ServiceTag({ serviceType, className = "text-sm", iconClassName = "w-4 h-4 text-slate-400" }) {
  const Icon = getServiceIcon(serviceType);
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <Icon className={iconClassName} />
      {getServiceLabel(serviceType)}
    </span>
  );
}

function StatusPill({ status, className = "" }) {
  const Icon = getStatusIcon(status);
  return (
    <Badge className={`inline-flex items-center gap-1 ${getStatusColor(status)} ${className}`}>
      <Icon className="w-3 h-3" />
      {getStatusLabel(status)}
    </Badge>
  );
}

function PaymentPill({ paymentStatus, className = "" }) {
  const Icon = getPaymentIcon(paymentStatus);
  return (
    <Badge className={`inline-flex items-center gap-1 ${getPaymentColor(paymentStatus)} ${className}`}>
      <Icon className="w-3 h-3" />
      {getPaymentLabel(paymentStatus)}
    </Badge>
  );
}

function UrgencyPill({ urgency, locale }) {
  if (!urgency) return null;
  const meta = URGENCY_META[urgency.level];
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded ${meta.pill}`}>
      {urgency.level === "overdue" && <AlertTriangle className="w-3 h-3" />}
      {meta.label[locale === "es" ? "es" : "en"]}
    </span>
  );
}

function EvidenceImageThumb({ orderId, type, label, onOpen, token }) {
  const [blobUrl, setBlobUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (!orderId || !token) return undefined;
    let objectUrl = null;
    let cancelled = false;

    setLoading(true);
    setMissing(false);
    setBlobUrl(null);

    const load = async () => {
      try {
        const response = await axios.get(`${API}/driver/orders/${orderId}/${type}-image/view`, {
          responseType: "blob",
          headers: { Authorization: `Bearer ${token}` },
        });
        objectUrl = URL.createObjectURL(response.data);
        if (!cancelled) setBlobUrl(objectUrl);
      } catch {
        if (!cancelled) setMissing(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [orderId, type, token]);

  return (
    <div
      className={`relative rounded-xl overflow-hidden border transition-all ${
        blobUrl ? "cursor-pointer border-slate-200 bg-white hover:shadow-md" : "border-slate-100 bg-slate-50"
      }`}
      onClick={() => blobUrl && onOpen?.({ url: blobUrl, label })}
    >
      <div className="h-32">
        {loading ? (
          <div className="w-full h-full flex items-center justify-center text-slate-400">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : blobUrl ? (
          <>
            <img src={blobUrl} alt={label} className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-black/40 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center">
              <ZoomIn className="w-8 h-8 text-white" />
            </div>
          </>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-1 text-slate-400">
            <Camera className="w-6 h-6 opacity-40" />
            <span className="text-[11px]">{missing ? "No image yet" : "Unavailable"}</span>
          </div>
        )}
      </div>
      <div className="px-2.5 py-2 border-t border-slate-100 bg-white/90">
        <p className="text-xs text-slate-500">{label}</p>
      </div>
    </div>
  );
}

// ─── SUBCOMPONENTS (module scope) ───────────────────────────────────────────

function SortHeader({ sortKey, children, align = "left", sort, toggleSort }) {
  const active = sort.key === sortKey;
  return (
    <th
      className={`px-4 py-3 text-${align} text-xs font-semibold text-slate-600 uppercase tracking-wider select-none cursor-pointer hover:text-slate-900 transition-colors`}
      onClick={() => toggleSort(sortKey)}
    >
      <span className={`inline-flex items-center gap-1 ${align === "right" ? "flex-row-reverse" : ""}`}>
        {children}
        {active ? (
          sort.direction === "asc"
            ? <ChevronUp className="w-3.5 h-3.5 text-sky-600" />
            : <ChevronDown className="w-3.5 h-3.5 text-sky-600" />
        ) : (
          <ChevronDown className="w-3.5 h-3.5 text-slate-300" />
        )}
      </span>
    </th>
  );
}

function TableSkeletonRows() {
  return (
    <>
      {Array.from({ length: 6 }).map((_, i) => (
        <tr key={i}>
          {Array.from({ length: 9 }).map((__, j) => (
            <td key={j} className="px-4 py-4">
              <div className="h-3.5 rounded bg-slate-100 animate-pulse" style={{ width: `${50 + ((i + j) % 4) * 10}%` }} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

function EmptyState({ onClear, t }) {
  return (
    <div className="flex flex-col items-center justify-center py-14 text-center">
      <div className="bg-slate-100 rounded-full p-3 mb-3">
        <Inbox className="w-6 h-6 text-slate-400" />
      </div>
      <p className="font-medium text-slate-700">
        {t("No orders match your filters", "Ninguna orden coincide con tus filtros")}
      </p>
      <p className="text-sm text-slate-400 mt-1 max-w-sm">
        {t(
          "Try adjusting the search, status, or date range.",
          "Intenta ajustar la búsqueda, el estado o el rango de fechas."
        )}
      </p>
      {onClear && (
        <Button variant="outline" size="sm" className="mt-4" onClick={onClear}>
          <X className="h-4 w-4 mr-1" />
          {t("Clear filters", "Limpiar filtros")}
        </Button>
      )}
    </div>
  );
}

function OrderCard({ order, onSelect, locale }) {
  const status = normalizeStatus(order.status);
  const isPaid = normalizeText(order.payment_status) === "paid";
  const urgency = getUrgency(order);
  const borderColor = urgency ? URGENCY_META[urgency.level].borderColor : getServiceColor(order.service_type);

  return (
    <Card className="hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 cursor-pointer border-l-4"
      style={{ borderLeftColor: borderColor }}
      onClick={() => onSelect(order.id)}
    >
      <CardHeader className="pb-2">
        <div className="flex justify-between items-start gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <CardTitle className="text-sm font-bold">
                {formatOrderNumber(order)}
              </CardTitle>
              <UrgencyPill urgency={urgency} locale={locale} />
            </div>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <Badge variant="outline" className="text-xs">
                <ServiceTag serviceType={order.service_type} className="text-xs" iconClassName="w-3.5 h-3.5 text-slate-500" />
              </Badge>
              {order.service_plan && (
                <Badge className={`text-xs ${getPlanBadge(order.service_plan)}`}>
                  {getPlanLabel(order.service_plan)}
                </Badge>
              )}
            </div>
          </div>
          <StatusPill status={status} />
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="grid grid-cols-2 gap-2 text-xs text-slate-500 mt-2">
          <div className="flex items-center gap-1">
            <User className="w-3 h-3" />
            <span className="truncate">{order.customer_name}</span>
          </div>
          <div className="flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            <span>{formatDate(order.pickup_date)}</span>
          </div>
          <div className="flex items-center gap-1">
            <MapPin className="w-3 h-3" />
            <span className="truncate">{order.pickup_address || "-"}</span>
          </div>
          <div className="flex items-center gap-1 justify-end">
            <span className={isPaid ? "text-green-600 font-bold" : "text-yellow-600 font-bold"}>
              {formatCurrency(order.total_amount)}
            </span>
            <PaymentPill paymentStatus={order.payment_status} className="text-[10px]" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function BulkActionsBar({ count, onMarkPaid, onMarkPending, onDownloadTickets, onCancel, onClear, t }) {
  if (count === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 bg-sky-50 border-b border-sky-100">
      <span className="text-sm font-medium text-sky-900">
        {count} {t("selected", "seleccionadas")}
      </span>
      <div className="flex flex-wrap items-center gap-2 lg:ml-auto">
        <Button size="sm" variant="outline" className="h-7 text-xs bg-white" onClick={onMarkPaid}>
          <CreditCard className="w-3.5 h-3.5 mr-1" /> {t("Mark Paid", "Marcar Pagado")}
        </Button>
        <Button size="sm" variant="outline" className="h-7 text-xs bg-white" onClick={onMarkPending}>
          <Clock className="w-3.5 h-3.5 mr-1" /> {t("Mark Pending", "Marcar Pendiente")}
        </Button>
        <Button size="sm" variant="outline" className="h-7 text-xs bg-white" onClick={onDownloadTickets}>
          <Download className="w-3.5 h-3.5 mr-1" /> {t("Tickets", "Tickets")}
        </Button>
        <Button size="sm" variant="outline" className="h-7 text-xs bg-white text-red-600 hover:text-red-700" onClick={onCancel}>
          <XCircle className="w-3.5 h-3.5 mr-1" /> {t("Cancel", "Cancelar")}
        </Button>
        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onClear}>
          <X className="w-3.5 h-3.5 mr-1" /> {t("Clear", "Limpiar")}
        </Button>
      </div>
    </div>
  );
}

function OrderTable({
  loading,
  paginatedOrders,
  activeFilterCount,
  clearFilters,
  onView,
  onDownloadQr,
  onRequestStatusUpdate,
  onUpdatePaymentStatus,
  sort,
  toggleSort,
  selectedIds,
  onToggleSelect,
  onTogglePage,
  t,
  locale,
}) {
  const allPageSelected = paginatedOrders.length > 0 && paginatedOrders.every((o) => selectedIds.has(o.id));

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-[1]">
          <tr>
            <th className="pl-4 pr-2 py-3 w-10">
              <input
                type="checkbox"
                className="accent-sky-600 w-4 h-4 rounded cursor-pointer"
                checked={allPageSelected}
                onChange={onTogglePage}
                aria-label={t("Select all on page", "Seleccionar todos en la página")}
              />
            </th>
            <SortHeader sortKey="order_number" sort={sort} toggleSort={toggleSort}>{t("Order", "Orden")}</SortHeader>
            <SortHeader sortKey="customer_name" sort={sort} toggleSort={toggleSort}>{t("Customer", "Cliente")}</SortHeader>
            <SortHeader sortKey="service_type" sort={sort} toggleSort={toggleSort}>{t("Service", "Servicio")}</SortHeader>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
              {t("Plan", "Plan")}
            </th>
            <SortHeader sortKey="pickup_date" sort={sort} toggleSort={toggleSort}>{t("Pickup", "Pickup")}</SortHeader>
            <SortHeader sortKey="status" sort={sort} toggleSort={toggleSort}>{t("Status", "Estado")}</SortHeader>
            <SortHeader sortKey="total_amount" align="right" sort={sort} toggleSort={toggleSort}>{t("Payment", "Pago")}</SortHeader>
            <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 uppercase tracking-wider">
              {t("Actions", "Acciones")}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {loading ? (
            <TableSkeletonRows />
          ) : paginatedOrders.length === 0 ? (
            <tr>
              <td colSpan={9}>
                <EmptyState onClear={activeFilterCount > 0 ? clearFilters : undefined} t={t} />
              </td>
            </tr>
          ) : (
            paginatedOrders.map((order) => {
              const status = normalizeStatus(order.status);
              const isPaid = normalizeText(order.payment_status) === "paid";
              const urgency = getUrgency(order);
              const urgencyMeta = urgency ? URGENCY_META[urgency.level] : null;
              return (
                <tr
                  key={order.id}
                  onClick={() => onView(order.id)}
                  className={`cursor-pointer hover:bg-slate-50/70 transition-colors ${urgencyMeta?.rowBg || ""}`}
                  style={{ borderLeft: `3px solid ${urgencyMeta?.borderColor || "transparent"}` }}
                >
                  <td className="pl-4 pr-2 py-3" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      className="accent-sky-600 w-4 h-4 rounded cursor-pointer"
                      checked={selectedIds.has(order.id)}
                      onChange={() => onToggleSelect(order.id)}
                      aria-label={t("Select order", "Seleccionar orden")}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-mono font-medium text-slate-900 text-sm">
                        {formatOrderNumber(order)}
                      </p>
                      <UrgencyPill urgency={urgency} locale={locale} />
                    </div>
                    <p className="text-xs text-slate-400">
                      {formatDate(order.created_at)}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-900 text-sm">
                      {order.customer_name}
                    </p>
                    <p className="text-xs text-slate-400 truncate max-w-[140px]">
                      {order.customer_email}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <ServiceTag serviceType={order.service_type} />
                  </td>
                  <td className="px-4 py-3">
                    {order.service_plan ? (
                      <Badge className={`text-xs ${getPlanBadge(order.service_plan)}`}>
                        {getPlanLabel(order.service_plan)}
                      </Badge>
                    ) : (
                      <span className="text-slate-400 text-xs">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-3.5 h-3.5 text-slate-400" />
                      <span className="text-sm">{formatDate(order.pickup_date)}</span>
                    </div>
                    {order.pickup_time_window && (
                      <p className="text-xs text-slate-400 mt-0.5">
                        {order.pickup_time_window}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <StatusPill status={status} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex flex-col gap-0.5 items-end">
                      <PaymentPill paymentStatus={order.payment_status} className="text-xs" />
                      <span className="text-xs font-bold text-slate-700">
                        {formatCurrency(order.total_amount)}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuItem onClick={() => onView(order.id)}>
                          <Eye className="h-4 w-4 mr-2" />
                          {t("View details", "Ver detalles")}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onDownloadQr(order)}>
                          <Download className="h-4 w-4 mr-2" />
                          {t("Download Ticket", "Descargar Ticket")}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {status === "new" && (
                          <DropdownMenuItem onClick={() => onRequestStatusUpdate(order, "confirmed")}>
                            <CheckCircle className="h-4 w-4 mr-2" />
                            {t("Confirm", "Confirmar")}
                          </DropdownMenuItem>
                        )}
                        {status === "confirmed" && (
                          <DropdownMenuItem onClick={() => onRequestStatusUpdate(order, "pickup_scheduled")}>
                            <Calendar className="h-4 w-4 mr-2" />
                            {t("Schedule Pickup", "Programar Pickup")}
                          </DropdownMenuItem>
                        )}
                        {status === "pickup_scheduled" && (
                          <DropdownMenuItem onClick={() => onRequestStatusUpdate(order, "picked_up")}>
                            <Package className="h-4 w-4 mr-2" />
                            {t("Mark Picked Up", "Marcar Recogido")}
                          </DropdownMenuItem>
                        )}
                        {status === "picked_up" && (
                          <DropdownMenuItem onClick={() => onRequestStatusUpdate(order, "processing")}>
                            <RefreshCw className="h-4 w-4 mr-2" />
                            {t("Start Processing", "Iniciar Procesamiento")}
                          </DropdownMenuItem>
                        )}
                        {status === "processing" && (
                          <DropdownMenuItem onClick={() => onRequestStatusUpdate(order, "ready")}>
                            <Star className="h-4 w-4 mr-2" />
                            {t("Mark Ready", "Marcar Listo")}
                          </DropdownMenuItem>
                        )}
                        {status === "ready" && (
                          <DropdownMenuItem onClick={() => onRequestStatusUpdate(order, "out_for_delivery")}>
                            <Truck className="h-4 w-4 mr-2" />
                            {t("Out for Delivery", "En camino")}
                          </DropdownMenuItem>
                        )}
                        {status === "out_for_delivery" && (
                          <DropdownMenuItem onClick={() => onRequestStatusUpdate(order, "delivered")}>
                            <CheckCircle className="h-4 w-4 mr-2" />
                            {t("Mark Delivered", "Marcar Entregado")}
                          </DropdownMenuItem>
                        )}
                        {status === "delivered" && (
                          <DropdownMenuItem onClick={() => onRequestStatusUpdate(order, "completed")}>
                            <CheckCircle className="h-4 w-4 mr-2" />
                            {t("Complete Order", "Completar Orden")}
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        {!isPaid && (
                          <DropdownMenuItem onClick={() => onUpdatePaymentStatus(order.id, "paid")}>
                            <CreditCard className="h-4 w-4 mr-2" />
                            {t("Mark Paid", "Marcar Pagado")}
                          </DropdownMenuItem>
                        )}
                        {isPaid && (
                          <DropdownMenuItem onClick={() => onUpdatePaymentStatus(order.id, "pending")}>
                            <Clock className="h-4 w-4 mr-2" />
                            {t("Mark Pending", "Marcar Pendiente")}
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        {status !== "cancelled" && (
                          <DropdownMenuItem
                            onClick={() => onRequestStatusUpdate(order, "cancelled")}
                            className="text-red-600"
                          >
                            <X className="h-4 w-4 mr-2" />
                            {t("Cancel Order", "Cancelar Orden")}
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

function DashboardStats({ stats, activeFilterCount, totalOrders, t }) {
  const items = [
    {
      key: "orders",
      label: t("Orders", "Órdenes"),
      value: stats.total,
      icon: Package,
      accent: "bg-sky-600",
      sub: activeFilterCount > 0 ? `${t("of", "de")} ${totalOrders} ${t("total", "total")}` : null,
    },
    { key: "paid", label: t("Paid", "Pagados"), value: stats.paid, icon: CreditCard, accent: "bg-emerald-600" },
    { key: "pending", label: t("Pending", "Pendientes"), value: stats.pending, icon: Clock, accent: "bg-amber-600" },
    { key: "revenue", label: t("Revenue", "Ingresos"), value: formatCurrency(stats.totalRevenue), icon: Banknote, accent: "bg-violet-600" },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
      {items.map((item) => (
        <div key={item.key} className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-3">
          <div className={`${item.accent} rounded-lg p-2.5 text-white shrink-0`}>
            <item.icon className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{item.label}</p>
            <p className="text-xl font-bold text-slate-900 truncate">{item.value}</p>
            {item.sub && <p className="text-[11px] text-slate-400">{item.sub}</p>}
          </div>
        </div>
      ))}
    </div>
  );
}

function FilterBar({
  filters,
  setFilters,
  searchInput,
  setSearchInput,
  setPage,
  activeFilterCount,
  clearFilters,
  filtersExpanded,
  setFiltersExpanded,
  viewMode,
  setViewMode,
  t,
}) {
  const handleSearch = () => {
    setFilters((f) => ({ ...f, search: searchInput }));
    setPage(1);
  };

  const clearSearch = () => {
    setSearchInput("");
    setFilters((f) => ({ ...f, search: "" }));
    setPage(1);
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 mb-6 shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setFiltersExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 lg:hidden"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-slate-700">
          <SlidersHorizontal className="w-4 h-4" />
          {t("Filters", "Filtros")}
          {activeFilterCount > 0 && (
            <Badge className="bg-sky-100 text-sky-700">{activeFilterCount}</Badge>
          )}
        </span>
        {filtersExpanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
      </button>

      <div className={`p-4 ${filtersExpanded ? "block" : "hidden"} lg:block`}>
        <div className="flex flex-col lg:flex-row gap-3 items-start lg:items-end">
          <div className="flex-1 w-full">
            <div className="relative flex items-center">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
              <Input
                placeholder=""
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleSearch();
                  }
                }}
                className="pl-9 pr-20"
              />
              <div className="absolute right-1 flex items-center gap-1">
                {searchInput && (
                  <button
                    type="button"
                    onClick={clearSearch}
                    className="text-slate-300 hover:text-slate-500 p-1"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 px-2 text-sky-600 hover:text-sky-800 hover:bg-sky-50"
                  onClick={handleSearch}
                >
                  {t("Search", "Buscar")}
                </Button>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Select
              value={filters.status}
              onValueChange={(v) => { setFilters({ ...filters, status: v }); setPage(1); }}
            >
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder={t("Status", "Estado")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("All statuses", "Todos los estados")}</SelectItem>
                {Object.entries(STATUS_LABELS).map(([key, val]) => (
                  <SelectItem key={key} value={key}>
                    <span className="inline-flex items-center gap-1.5">
                      <val.Icon className="w-3.5 h-3.5" />
                      {val.label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={filters.service}
              onValueChange={(v) => { setFilters({ ...filters, service: v }); setPage(1); }}
            >
              <SelectTrigger className="w-[170px]">
                <SelectValue placeholder={t("Service", "Servicio")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("All services", "Todos los servicios")}</SelectItem>
                {Object.entries(SERVICE_TYPES).map(([key, val]) => (
                  <SelectItem key={key} value={key}>
                    <span className="inline-flex items-center gap-1.5">
                      <val.Icon className="w-3.5 h-3.5" />
                      {val.label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={filters.payment}
              onValueChange={(v) => { setFilters({ ...filters, payment: v }); setPage(1); }}
            >
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder={t("Payment", "Pago")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("All payments", "Todos los pagos")}</SelectItem>
                <SelectItem value="paid">
                  <span className="inline-flex items-center gap-1.5"><CreditCard className="w-3.5 h-3.5" /> {t("Paid", "Pagado")}</span>
                </SelectItem>
                <SelectItem value="pending">
                  <span className="inline-flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> {t("Pending", "Pendiente")}</span>
                </SelectItem>
              </SelectContent>
            </Select>

            <Input
              type="date"
              value={filters.dateFrom}
              onChange={(e) => { setFilters({ ...filters, dateFrom: e.target.value }); setPage(1); }}
              className="w-[150px]"
              aria-label={t("From date", "Fecha inicial")}
            />

            <Input
              type="date"
              value={filters.dateTo}
              onChange={(e) => { setFilters({ ...filters, dateTo: e.target.value }); setPage(1); }}
              className="w-[150px]"
              aria-label={t("To date", "Fecha final")}
            />

            {activeFilterCount > 0 && (
              <Button variant="outline" size="sm" onClick={clearFilters}>
                <X className="h-4 w-4 mr-1" />
                {t("Clear", "Limpiar")} ({activeFilterCount})
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant={viewMode === "cards" ? "default" : "outline"}
              size="sm"
              onClick={() => setViewMode("cards")}
              className={viewMode === "cards" ? "bg-sky-600" : ""}
              aria-label={t("Card view", "Vista de tarjetas")}
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === "table" ? "default" : "outline"}
              size="sm"
              onClick={() => setViewMode("table")}
              className={viewMode === "table" ? "bg-sky-600" : ""}
              aria-label={t("Table view", "Vista de tabla")}
            >
              <List className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function QrExportSection({
  qrStartDate,
  setQrStartDate,
  qrEndDate,
  setQrEndDate,
  qrStatusFilter,
  setQrStatusFilter,
  qrServiceFilter,
  setQrServiceFilter,
  exportingQr,
  handleExportQrBatch,
  t,
}) {
  return (
    <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 mb-6">
      <div className="flex flex-col lg:flex-row gap-3 items-start lg:items-end">
        <div>
          <Label className="text-xs">{t("Start", "Inicio")}</Label>
          <Input
            type="date"
            value={qrStartDate}
            onChange={(e) => setQrStartDate(e.target.value)}
            className="h-8 text-sm"
          />
        </div>
        <div>
          <Label className="text-xs">{t("End", "Fin")}</Label>
          <Input
            type="date"
            value={qrEndDate}
            onChange={(e) => setQrEndDate(e.target.value)}
            className="h-8 text-sm"
          />
        </div>
        <div>
          <Label className="text-xs">{t("Status", "Estado")}</Label>
          <select
            className="h-8 rounded-md border border-slate-200 px-2 text-sm bg-white"
            value={qrStatusFilter}
            onChange={(e) => setQrStatusFilter(e.target.value)}
          >
            <option value="">{t("All", "Todos")}</option>
            {Object.keys(STATUS_LABELS).map(key => (
              <option key={key} value={key}>{STATUS_LABELS[key].label}</option>
            ))}
          </select>
        </div>
        <div>
          <Label className="text-xs">{t("Service", "Servicio")}</Label>
          <select
            className="h-8 rounded-md border border-slate-200 px-2 text-sm bg-white"
            value={qrServiceFilter}
            onChange={(e) => setQrServiceFilter(e.target.value)}
          >
            <option value="">{t("All", "Todos")}</option>
            {Object.keys(SERVICE_TYPES).map(key => (
              <option key={key} value={key}>{SERVICE_TYPES[key].label}</option>
            ))}
          </select>
        </div>
        <Button
          variant="outline"
          onClick={handleExportQrBatch}
          disabled={exportingQr}
          className="h-8"
        >
          <Download className="h-4 w-4 mr-2" />
          {exportingQr ? t("Exporting...", "Exportando...") : t("Export Tickets", "Exportar Tickets")}
        </Button>
      </div>
    </div>
  );
}

function PaginationBar({ loading, totalItems, page, setPage, pageSize, setPageSize, totalPages, t }) {
  if (loading || totalItems === 0) return null;
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, totalItems);
  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-slate-100 bg-slate-50/50">
      <p className="text-xs text-slate-500">
        {t(
          `Showing ${start}-${end} of ${totalItems}`,
          `Mostrando ${start}-${end} de ${totalItems}`
        )}
      </p>
      <div className="flex items-center gap-3">
        <select
          className="h-8 rounded-md border border-slate-200 px-2 text-xs bg-white"
          value={pageSize}
          onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
        >
          {PAGE_SIZE_OPTIONS.map((size) => (
            <option key={size} value={size}>{size} / {t("page", "página")}</option>
          ))}
        </select>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-xs text-slate-500 px-2 min-w-[70px] text-center">
            {t("Page", "Página")} {page} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function CustomerCombobox({ customers, value, onChange, t }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const selected = customers.find((c) => c.id === value);
    setQuery(selected ? selected.name : "");
  }, [value, customers]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter((c) =>
      (c.name || "").toLowerCase().includes(q) ||
      (c.email || "").toLowerCase().includes(q) ||
      (c.phone || "").toLowerCase().includes(q)
    );
  }, [customers, query]);

  return (
    <div className="relative">
      <Input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          if (value) onChange("");
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && filtered.length > 0) {
            e.preventDefault();
            onChange(filtered[0].id);
            setQuery(filtered[0].name);
            setOpen(false);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        placeholder={t("Type a name, email or phone...", "Escribe nombre, correo o teléfono...")}
        autoComplete="off"
      />
      {open && (
        <div className="absolute z-50 mt-1 w-full max-h-64 overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg">
          {filtered.length === 0 ? (
            <p className="px-3 py-2 text-sm text-slate-400">{t("No customers found", "Sin clientes encontrados")}</p>
          ) : (
            filtered.map((c) => (
              <button
                type="button"
                key={c.id}
                onMouseDown={(e) => {
                  e.preventDefault();
                  onChange(c.id);
                  setQuery(c.name);
                  setOpen(false);
                }}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-sky-50 ${
                  value === c.id ? "bg-sky-50 text-sky-700 font-medium" : "text-slate-700"
                }`}
              >
                <p className="truncate">{c.name}</p>
                {(c.email || c.phone) && (
                  <p className="text-xs text-slate-400 truncate">{c.email || c.phone}</p>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ─── MAIN COMPONENT ─────────────────────────────────────────────────────────

export default function Orders() {
  const { t, locale } = useLocale();

  // ─── State ──────────────────────────────────────────────────────────────
  const [orders, setOrders] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState("table");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [viewOrder, setViewOrder] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [weightForm, setWeightForm] = useState({ estimated_lbs: "", actual_lbs: "" });
  const [savingWeights, setSavingWeights] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState(null);
  const [bulkConfirm, setBulkConfirm] = useState(null);
  const [selectedIds, setSelectedIds] = useState(() => new Set());

  // ─── EDIT STATE ──────────────────────────────────────────────────────────
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({});

  // Filters
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [searchInput, setSearchInput] = useState("");
  const [filtersExpanded, setFiltersExpanded] = useState(true);

  // Sorting + pagination
  const [sort, setSort] = useState({ key: "pickup_date", direction: "desc" });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // QR Export
  const [qrStartDate, setQrStartDate] = useState("");
  const [qrEndDate, setQrEndDate] = useState("");
  const [exportingQr, setExportingQr] = useState(false);
  const [qrStatusFilter, setQrStatusFilter] = useState("");
  const [qrServiceFilter, setQrServiceFilter] = useState("");
  const [selectedImage, setSelectedImage] = useState(null);

  // ─── Derived data ───────────────────────────────────────────────────────
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.status !== "all") count += 1;
    if (filters.service !== "all") count += 1;
    if (filters.payment !== "all") count += 1;
    if (filters.search.trim()) count += 1;
    if (filters.dateFrom) count += 1;
    if (filters.dateTo) count += 1;
    return count;
  }, [filters]);

  const visibleOrders = useMemo(
    () => orders.filter((o) => orderMatchesFilters(o, filters)),
    [orders, filters]
  );

  const sortedOrders = useMemo(
    () => sortOrders(visibleOrders, sort),
    [visibleOrders, sort]
  );

  const totalPages = Math.max(1, Math.ceil(sortedOrders.length / pageSize));

  useEffect(() => {
    if (page > totalPages) setPage(1);
  }, [totalPages, page]);

  const paginatedOrders = useMemo(() => {
    const start = (page - 1) * pageSize;
    return sortedOrders.slice(start, start + pageSize);
  }, [sortedOrders, page, pageSize]);

  // ─── Stats ──────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const total = visibleOrders.length;
    const paid = visibleOrders.filter(o => normalizeText(o.payment_status) === "paid").length;
    const pending = total - paid;
    const totalRevenue = visibleOrders.reduce((sum, o) => sum + (parseFloat(o.total_amount) || 0), 0);
    return { total, paid, pending, totalRevenue };
  }, [visibleOrders]);

  // ─── Data Fetching ─────────────────────────────────────────────────────
  const fetchOrders = async () => {
    setLoading(true);
    try {
      const pageSizeReq = 100;
      let pageReq = 1;
      let keepLoading = true;
      const collected = [];

      while (keepLoading) {
        const res = await axios.get(`${API}/orders`, {
          params: { page: pageReq, page_size: pageSizeReq },
        });
        const batch = Array.isArray(res.data) ? res.data : [];
        collected.push(...batch);
        keepLoading = batch.length === pageSizeReq;
        pageReq += 1;
      }

      setOrders(collected);
    } catch (error) {
      toast.error(t("Error loading orders", "Error cargando órdenes"));
    } finally {
      setLoading(false);
    }
  };

  const fetchCustomers = async () => {
    try {
      const pageSizeReq = 100;
      let pageReq = 1;
      let keepLoading = true;
      const collected = [];

      while (keepLoading) {
        const res = await axios.get(`${API}/customers`, {
          params: { page: pageReq, page_size: pageSizeReq },
        });
        const batch = Array.isArray(res.data) ? res.data : [];
        collected.push(...batch);
        keepLoading = batch.length === pageSizeReq;
        pageReq += 1;
      }

      setCustomers(collected);
    } catch (error) {
      console.error("Error loading customers");
    }
  };

  const fetchOrderDetails = async (orderId) => {
    setDetailLoading(true);
    try {
      const res = await axios.get(`${API}/operator/orders/${orderId}`);
      setViewOrder(res.data);
      setWeightForm({
        estimated_lbs: res.data.estimated_lbs ?? "",
        actual_lbs: res.data.actual_lbs ?? ""
      });
      // Reset edit mode when loading new order
      setIsEditing(false);
      setEditForm({});
    } catch (error) {
      toast.error(t("Error loading order details", "Error cargando detalles de la orden"));
    } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
    fetchCustomers();
  }, []);

  // ─── Order CRUD ──────────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();

    let correctedTimeWindow = form.pickup_time_window;
    if (correctedTimeWindow === "8am-12am") correctedTimeWindow = "8-12";
    if (correctedTimeWindow === "2pm-6pm") correctedTimeWindow = "14-18";

    const today = getLocalDate();
    if (form.pickup_date && form.pickup_date < today) {
      toast.error(t("Pickup date cannot be in the past", "La fecha de recogida no puede ser anterior a hoy"));
      return;
    }

    setSubmitting(true);
    try {
      await axios.post(`${API}/orders`, {
        ...form,
        pickup_time_window: correctedTimeWindow,
        estimated_lbs: form.estimated_lbs ? parseFloat(form.estimated_lbs) : null,
      });
      toast.success(t("Order created", "Orden creada"));
      setDialogOpen(false);
      setForm(emptyForm);
      fetchOrders();
    } catch (error) {
      toast.error(error.response?.data?.detail || t("Error creating order", "Error creando orden"));
    } finally {
      setSubmitting(false);
    }
  };

  const updateStatus = async (orderId, newStatus) => {
    try {
      await axios.patch(`${API}/orders/${orderId}/status?status=${newStatus}`);
      toast.success(t("Status updated", "Estado actualizado"));
      fetchOrders();
    } catch (error) {
      toast.error(error.response?.data?.detail || t("Error updating status", "Error actualizando estado"));
    }
  };

  const updatePaymentStatus = async (orderId, newStatus) => {
    try {
      await axios.patch(`${API}/orders/${orderId}/payment-status?status=${newStatus}`);
      toast.success(t("Payment status updated", "Estado de pago actualizado"));
      fetchOrders();
    } catch (error) {
      toast.error(error.response?.data?.detail || t("Error updating payment status", "Error actualizando estado de pago"));
    }
  };

  const requestStatusUpdate = (order, newStatus) => {
    const action = STATUS_ACTION_META[newStatus];
    const actionLabel = locale === "es" ? action?.es : action?.en;
    setConfirmDialog({
      orderId: order.id,
      newStatus,
      title: t("Confirm status change", "Confirmar cambio de estado"),
      description: t(
        `Are you sure you want to ${actionLabel || "update"} order ${formatOrderNumber(order)}?`,
        `¿Seguro que deseas ${actionLabel || "actualizar"} la orden ${formatOrderNumber(order)}?`
      ),
    });
  };

  const handleConfirmDialogAccept = async () => {
    if (!confirmDialog) return;
    const { orderId, newStatus } = confirmDialog;
    setConfirmDialog(null);
    await updateStatus(orderId, newStatus);
  };

  const handleUpdateWeights = async () => {
    if (!viewOrder) return;
    setSavingWeights(true);
    try {
      const payload = {
        estimated_lbs: weightForm.estimated_lbs === "" ? null : parseFloat(weightForm.estimated_lbs),
        actual_lbs: weightForm.actual_lbs === "" ? null : parseFloat(weightForm.actual_lbs)
      };
      const res = await axios.put(`${API}/orders/${viewOrder.id}`, payload);
      const updated = res.data;
      toast.success(t("Weights updated", "Libras actualizadas"));
      setViewOrder(updated);
      setOrders(prev => prev.map(o => o.id === updated.id ? { ...o, ...updated } : o));
    } catch (error) {
      toast.error(error.response?.data?.detail || t("Error updating weights", "Error actualizando libras"));
    } finally {
      setSavingWeights(false);
    }
  };

  // ─── EDIT FUNCTIONS ──────────────────────────────────────────────────────
  const startEditing = () => {
    setEditForm({
      customer_id: viewOrder.customer_id,
      service_type: viewOrder.service_type,
      service_plan: viewOrder.service_plan,
      pickup_date: viewOrder.pickup_date || "",
      pickup_time_window: viewOrder.pickup_time_window || "",
      pickup_address: viewOrder.pickup_address || "",
      delivery_address: viewOrder.delivery_address || "",
      estimated_lbs: viewOrder.estimated_lbs || "",
      notes: viewOrder.notes || "",
      gate_code: viewOrder.gate_code || "",
    });
    setIsEditing(true);
  };

  const handleEditSave = async () => {
    try {
      const payload = { ...editForm };
      if (payload.estimated_lbs !== "") payload.estimated_lbs = parseFloat(payload.estimated_lbs);
      else payload.estimated_lbs = null;

      const res = await axios.put(`${API}/orders/${viewOrder.id}`, payload);
      toast.success(t("Order updated", "Orden actualizada"));
      setViewOrder(res.data);
      await fetchOrders();
      setIsEditing(false);
    } catch (error) {
      toast.error(error.response?.data?.detail || t("Error updating order", "Error al actualizar"));
    }
  };

  // ─── QR Export ───────────────────────────────────────────────────────────
  const handleDownloadQr = async (order) => {
    try {
      const res = await axios.get(`${API}/orders/${order.id}/qr.svg`, { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `ticket-${formatOrderNumber(order)}.svg`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success(t("QR downloaded", "QR descargado"));
    } catch (error) {
      toast.error(t("Error downloading QR", "Error descargando QR"));
    }
  };

  const handleExportQrBatch = async () => {
    if (!qrStartDate || !qrEndDate) {
      toast.error(t("Select a date range", "Selecciona un rango de fechas"));
      return;
    }
    setExportingQr(true);
    try {
      const params = new URLSearchParams({
        start_date: qrStartDate,
        end_date: qrEndDate
      });
      if (qrStatusFilter) params.append("status", qrStatusFilter);
      if (qrServiceFilter) params.append("service_type", qrServiceFilter);
      const res = await axios.get(`${API}/orders/qr/export?${params.toString()}`, { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `qr-export-${qrStartDate}-to-${qrEndDate}.zip`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success(t("QRs downloaded", "QRs descargados"));
    } catch (error) {
      toast.error(t("Error exporting QRs", "Error exportando QRs"));
    } finally {
      setExportingQr(false);
    }
  };

  // ─── Bulk actions ────────────────────────────────────────────────────────
  const toggleSelect = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const togglePageSelection = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const pageIds = paginatedOrders.map((o) => o.id);
      const allSelected = pageIds.every((id) => next.has(id));
      pageIds.forEach((id) => (allSelected ? next.delete(id) : next.add(id)));
      return next;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

  const bulkUpdatePayment = async (status) => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    try {
      await Promise.all(ids.map((id) => axios.patch(`${API}/orders/${id}/payment-status?status=${status}`)));
      toast.success(t("Payment status updated", "Estado de pago actualizado"));
      clearSelection();
      fetchOrders();
    } catch (error) {
      toast.error(t("Error updating payment status", "Error actualizando estado de pago"));
    }
  };

  const bulkDownloadTickets = async () => {
    const ids = Array.from(selectedIds);
    const targets = orders.filter((o) => ids.includes(o.id));
    for (const order of targets) {
      // eslint-disable-next-line no-await-in-loop
      await handleDownloadQr(order);
    }
  };

  const requestBulkCancel = () => {
    if (selectedIds.size === 0) return;
    setBulkConfirm({
      title: t("Cancel orders", "Cancelar órdenes"),
      description: t(
        `Are you sure you want to cancel ${selectedIds.size} order(s)?`,
        `¿Seguro que deseas cancelar ${selectedIds.size} orden(es)?`
      ),
    });
  };

  const handleBulkCancelAccept = async () => {
    const ids = Array.from(selectedIds);
    setBulkConfirm(null);
    try {
      await Promise.all(ids.map((id) => axios.patch(`${API}/orders/${id}/status?status=cancelled`)));
      toast.success(t("Status updated", "Estado actualizado"));
      clearSelection();
      fetchOrders();
    } catch (error) {
      toast.error(t("Error updating status", "Error actualizando estado"));
    }
  };

  // ─── Render Helpers ──────────────────────────────────────────────────────
  const clearFilters = () => {
    setFilters(DEFAULT_FILTERS);
    setSearchInput("");
    setPage(1);
  };

  const toggleSort = (key) => {
    setSort((prev) => {
      if (prev.key === key) {
        return { key, direction: prev.direction === "asc" ? "desc" : "asc" };
      }
      return { key, direction: "asc" };
    });
    setPage(1);
  };

  // ─── MAIN RENDER ─────────────────────────────────────────────────────────
  return (
    <div className="p-4 lg:p-6 max-w-7xl mx-auto bg-slate-50 min-h-screen">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {t("Orders Dashboard", "Panel de Órdenes")}
          </h1>
          <p className="text-slate-500 mt-1">
            {t("Manage all services in one place", "Gestiona todos los servicios en un solo lugar")}
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-sky-600 hover:bg-sky-700">
              <Plus className="h-4 w-4 mr-2" />
              {t("New Order", "Nueva Orden")}
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg bg-white max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{t("Create New Order", "Crear Nueva Orden")}</DialogTitle>
              <DialogDescription>
                {t("Fill in the details below to create a new order", "Completa los detalles abajo para crear una nueva orden")}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>{t("Customer *", "Cliente *")}</Label>
                  <div className="mt-1.5">
                    <CustomerCombobox
                      customers={customers}
                      value={form.customer_id}
                      onChange={(id) => setForm({ ...form, customer_id: id })}
                      t={t}
                    />
                  </div>
                </div>
                <div>
                  <Label>{t("Service Type *", "Tipo de Servicio *")}</Label>
                  <Select
                    value={form.service_type}
                    onValueChange={(v) => setForm({ ...form, service_type: v })}
                  >
                    <SelectTrigger className="mt-1.5">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(SERVICE_TYPES).map(([key, val]) => (
                        <SelectItem key={key} value={key}>
                          <span className="inline-flex items-center gap-1.5">
                            <val.Icon className="w-3.5 h-3.5" />
                            {val.label}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label>{t("Service Plan *", "Plan de Servicio *")}</Label>
                <Select
                  value={form.service_plan}
                  onValueChange={(v) => setForm({ ...form, service_plan: v })}
                >
                  <SelectTrigger className="mt-1.5">
                    <SelectValue placeholder={t("Select plan", "Seleccionar plan")} />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(PLAN_LABELS).map(([key, val]) => (
                      <SelectItem key={key} value={key}>
                        {val.label} ({val.time})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>{t("Pickup Date", "Fecha de Pickup")}</Label>
                  <Input
                    type="date"
                    value={form.pickup_date}
                    onChange={(e) => setForm({ ...form, pickup_date: e.target.value })}
                    className="mt-1.5"
                    min={getLocalDate()}
                  />
                </div>
                <div>
                  <Label>{t("Time Window", "Ventana de Tiempo")}</Label>
                  <Select
                    value={form.pickup_time_window}
                    onValueChange={(v) => setForm({ ...form, pickup_time_window: v })}
                  >
                    <SelectTrigger className="mt-1.5">
                      <SelectValue placeholder={t("Select", "Seleccionar")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="8-12">8am - 12am</SelectItem>
                      <SelectItem value="14-18">2pm - 6pm</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label>{t("Pickup Address", "Dirección de Pickup")}</Label>
                <Input
                  value={form.pickup_address}
                  onChange={(e) => setForm({ ...form, pickup_address: e.target.value })}
                  className="mt-1.5"
                  placeholder={t("Uses customer address if empty", "Se usará la dirección del cliente si está vacío")}
                />
              </div>

              <div>
                <Label>{t("Delivery Address", "Dirección de Entrega")}</Label>
                <Input
                  value={form.delivery_address}
                  onChange={(e) => setForm({ ...form, delivery_address: e.target.value })}
                  className="mt-1.5"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>{t("Estimated Lbs", "Libras Estimadas")}</Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={form.estimated_lbs}
                    onChange={(e) => setForm({ ...form, estimated_lbs: e.target.value })}
                    className="mt-1.5"
                  />
                </div>
                <div>
                  <Label>{t("Gate Code", "Código de acceso")}</Label>
                  <Input
                    value={form.gate_code}
                    onChange={(e) => setForm({ ...form, gate_code: e.target.value })}
                    className="mt-1.5"
                  />
                </div>
              </div>

              <div>
                <Label>{t("Notes", "Notas")}</Label>
                <Textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className="mt-1.5"
                  rows={2}
                />
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                  {t("Cancel", "Cancelar")}
                </Button>
                <Button
                  type="submit"
                  className="bg-sky-600 hover:bg-sky-700"
                  disabled={submitting || !form.customer_id}
                >
                  {submitting ? t("Creating...", "Creando...") : t("Create Order", "Crear Orden")}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* ── Stats ── */}
      <DashboardStats stats={stats} activeFilterCount={activeFilterCount} totalOrders={orders.length} t={t} />

      {/* ── Filters ── */}
      <FilterBar
        filters={filters}
        setFilters={setFilters}
        searchInput={searchInput}
        setSearchInput={setSearchInput}
        setPage={setPage}
        activeFilterCount={activeFilterCount}
        clearFilters={clearFilters}
        filtersExpanded={filtersExpanded}
        setFiltersExpanded={setFiltersExpanded}
        viewMode={viewMode}
        setViewMode={setViewMode}
        t={t}
      />

      {/* ── QR Export ── */}
      <QrExportSection
        qrStartDate={qrStartDate}
        setQrStartDate={setQrStartDate}
        qrEndDate={qrEndDate}
        setQrEndDate={setQrEndDate}
        qrStatusFilter={qrStatusFilter}
        setQrStatusFilter={setQrStatusFilter}
        qrServiceFilter={qrServiceFilter}
        setQrServiceFilter={setQrServiceFilter}
        exportingQr={exportingQr}
        handleExportQrBatch={handleExportQrBatch}
        t={t}
      />

      {/* ── Orders View ── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {viewMode === "table" && (
          <BulkActionsBar
            count={selectedIds.size}
            onMarkPaid={() => bulkUpdatePayment("paid")}
            onMarkPending={() => bulkUpdatePayment("pending")}
            onDownloadTickets={bulkDownloadTickets}
            onCancel={requestBulkCancel}
            onClear={clearSelection}
            t={t}
          />
        )}
        {viewMode === "cards" ? (
          <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-32 rounded-xl bg-slate-100 animate-pulse" />
              ))
            ) : paginatedOrders.length === 0 ? (
              <div className="col-span-full">
                <EmptyState onClear={activeFilterCount > 0 ? clearFilters : undefined} t={t} />
              </div>
            ) : (
              paginatedOrders.map(order => (
                <OrderCard key={order.id} order={order} onSelect={fetchOrderDetails} locale={locale} />
              ))
            )}
          </div>
        ) : (
          <OrderTable
            loading={loading}
            paginatedOrders={paginatedOrders}
            activeFilterCount={activeFilterCount}
            clearFilters={clearFilters}
            onView={fetchOrderDetails}
            onDownloadQr={handleDownloadQr}
            onRequestStatusUpdate={requestStatusUpdate}
            onUpdatePaymentStatus={updatePaymentStatus}
            sort={sort}
            toggleSort={toggleSort}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
            onTogglePage={togglePageSelection}
            t={t}
            locale={locale}
          />
        )}
        <PaginationBar
          loading={loading}
          totalItems={sortedOrders.length}
          page={page}
          setPage={setPage}
          pageSize={pageSize}
          setPageSize={setPageSize}
          totalPages={totalPages}
          t={t}
        />
      </div>

      {/* ── Order Detail Modal ── */}
      <Dialog open={!!viewOrder} onOpenChange={() => { setViewOrder(null); setIsEditing(false); }}>
        <DialogContent className="sm:max-w-3xl bg-white p-0 max-h-[90vh] flex flex-col">
          <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-white z-10">
            <DialogHeader className="p-0">
              <DialogTitle className="text-xl">
                {t("Order", "Orden")} <span className="font-mono text-sky-600">
                  {formatOrderNumber(viewOrder)}
                </span>
              </DialogTitle>
              <DialogDescription>
                {t("Order details and laundry preferences.", "Detalle de la orden y preferencias de lavado.")}
              </DialogDescription>
            </DialogHeader>
            <div className="flex items-center gap-2">
              {!isEditing && viewOrder && (
                <Button variant="outline" size="sm" onClick={startEditing}>
                  <Edit className="h-4 w-4 mr-1" /> {t("Edit", "Editar")}
                </Button>
              )}
              <Button variant="ghost" size="icon" onClick={() => { setViewOrder(null); setIsEditing(false); }} className="rounded-full">
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {detailLoading ? (
              <div className="py-12 text-center text-slate-500 flex justify-center items-center gap-2">
                <Loader2 className="h-6 w-6 animate-spin" />
                {t("Loading...", "Cargando...")}
              </div>
            ) : viewOrder ? (
              <>
                {isEditing ? (
                  // ── EDIT MODE ──
                  <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <Label>{t("Customer", "Cliente")}</Label>
                      <CustomerCombobox
                        customers={customers}
                        value={editForm.customer_id}
                        onChange={(id) => setEditForm({ ...editForm, customer_id: id })}
                        t={t}
                      />
                    </div>
                    <div>
                      <Label>{t("Service Type", "Tipo de Servicio")}</Label>
                      <Select
                        value={editForm.service_type}
                        onValueChange={(v) => setEditForm({ ...editForm, service_type: v })}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {Object.entries(SERVICE_TYPES).map(([key, val]) => (
                            <SelectItem key={key} value={key}>
                              <span className="inline-flex items-center gap-1.5">
                                <val.Icon className="w-3.5 h-3.5" />
                                {val.label}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>{t("Service Plan", "Plan")}</Label>
                      <Select
                        value={editForm.service_plan}
                        onValueChange={(v) => setEditForm({ ...editForm, service_plan: v })}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {Object.entries(PLAN_LABELS).map(([key, val]) => (
                            <SelectItem key={key} value={key}>{val.label} ({val.time})</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>{t("Pickup Date", "Fecha de Pickup")}</Label>
                      <Input
                        type="date"
                        value={editForm.pickup_date}
                        onChange={(e) => setEditForm({ ...editForm, pickup_date: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>{t("Time Window", "Ventana")}</Label>
                      <Select
                        value={editForm.pickup_time_window}
                        onValueChange={(v) => setEditForm({ ...editForm, pickup_time_window: v })}
                      >
                        <SelectTrigger><SelectValue placeholder={t("Select", "Seleccionar")} /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="8-12">8am - 12am</SelectItem>
                          <SelectItem value="14-18">2pm - 6pm</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="sm:col-span-2">
                      <Label>{t("Pickup Address", "Dirección de Pickup")}</Label>
                      <Input
                        value={editForm.pickup_address}
                        onChange={(e) => setEditForm({ ...editForm, pickup_address: e.target.value })}
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <Label>{t("Delivery Address", "Dirección de Entrega")}</Label>
                      <Input
                        value={editForm.delivery_address}
                        onChange={(e) => setEditForm({ ...editForm, delivery_address: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>{t("Est. Lbs", "Est. Lbs")}</Label>
                      <Input
                        type="number"
                        step="0.1"
                        value={editForm.estimated_lbs}
                        onChange={(e) => setEditForm({ ...editForm, estimated_lbs: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>{t("Gate Code", "Código de acceso")}</Label>
                      <Input
                        value={editForm.gate_code}
                        onChange={(e) => setEditForm({ ...editForm, gate_code: e.target.value })}
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <Label>{t("Notes", "Notas")}</Label>
                      <Textarea
                        value={editForm.notes}
                        onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                        rows={2}
                      />
                    </div>
                  </div>
                ) : (
                  // ── READ-ONLY VIEW ──
                  <>
                    {/* ── Summary Card ── */}
                    <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        <div>
                          <p className="text-xs text-slate-500">{t("Customer", "Cliente")}</p>
                          <p className="font-medium">{viewOrder.customer_name}</p>
                          <p className="text-xs text-slate-400">{viewOrder.customer_email}</p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-500">{t("Service", "Servicio")}</p>
                          <div className="mt-1">
                            <ServiceTag serviceType={viewOrder.service_type} className="text-base font-medium text-slate-900" iconClassName="w-5 h-5 text-slate-500" />
                          </div>
                          {viewOrder.service_plan && (
                            <Badge className={`mt-1 ${getPlanBadge(viewOrder.service_plan)}`}>
                              {getPlanLabel(viewOrder.service_plan)}
                            </Badge>
                          )}
                        </div>
                        <div>
                          <p className="text-xs text-slate-500">{t("Pickup", "Pickup")}</p>
                          <p className="font-medium">{formatDate(viewOrder.pickup_date)}</p>
                          <p className="text-xs text-slate-400">{viewOrder.pickup_time_window || "-"}</p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-500">{t("Status", "Estado")}</p>
                          <StatusPill status={viewOrder.status} />
                          <p className="text-xs text-slate-400 mt-1">
                            {t("Payment", "Pago")}: {getPaymentLabel(viewOrder.payment_status)}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* ── Addresses ── */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                        <p className="text-xs text-slate-500 mb-1">{t("Pickup Address", "Dirección Pickup")}</p>
                        <p className="font-medium">{viewOrder.pickup_address || "-"}</p>
                        {viewOrder.gate_code && (
                          <p className="text-xs text-amber-600 mt-1">
                            🔑 {t("Gate code", "Código de acceso")}: {viewOrder.gate_code}
                          </p>
                        )}
                      </div>
                      <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                        <p className="text-xs text-slate-500 mb-1">{t("Delivery Address", "Dirección Entrega")}</p>
                        <p className="font-medium">{viewOrder.delivery_address || "-"}</p>
                      </div>
                    </div>

                    {/* ── Notes ── */}
                    {viewOrder.notes && (
                      <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                        <p className="text-xs text-slate-500 mb-1">{t("Notes", "Notas")}</p>
                        <p className="text-sm whitespace-pre-wrap">{viewOrder.notes}</p>
                      </div>
                    )}

                    {/* ── Weight & Billing ── */}
                    <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                      <h3 className="font-semibold text-slate-700 mb-3">
                        {t("Weight & Billing", "Peso y facturación")}
                      </h3>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div>
                          <p className="text-xs text-slate-500">{t("Est. Lbs", "Est. Lbs")}</p>
                          <Input
                            type="number"
                            step="0.1"
                            value={weightForm.estimated_lbs}
                            onChange={(e) => setWeightForm({ ...weightForm, estimated_lbs: e.target.value })}
                            className="mt-1"
                          />
                        </div>
                        <div>
                          <p className="text-xs text-slate-500">{t("Actual Lbs", "Actual Lbs")}</p>
                          <Input
                            type="number"
                            step="0.1"
                            value={weightForm.actual_lbs}
                            onChange={(e) => setWeightForm({ ...weightForm, actual_lbs: e.target.value })}
                            className="mt-1"
                          />
                        </div>
                        <div>
                          <p className="text-xs text-slate-500">{t("Total", "Total")}</p>
                          <p className="font-bold text-xl">
                            {formatCurrency(viewOrder.total_amount)}
                          </p>
                          {viewOrder.membership_discount > 0 && (
                            <p className="text-xs text-green-600">
                              {t("Membership discount", "Descuento membresía")}: -{formatCurrency(viewOrder.membership_discount)}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-2 mt-4">
                        <Button variant="outline" size="sm" onClick={handleUpdateWeights} disabled={savingWeights}>
                          {savingWeights ? t("Saving...", "Guardando...") : t("Update Weights", "Actualizar Pesos")}
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => handleDownloadQr(viewOrder)}>
                          <Download className="h-4 w-4 mr-2" />
                          {t("Ticket", "Ticket")}
                        </Button>
                      </div>
                    </div>

                    {/* ── Evidence Images ── */}
                    {(() => {
                      const evidenceTypes = getOrderEvidenceTypes(viewOrder);
                      const token = getAdminToken();
                      if (!shouldShowEvidenceSection(viewOrder) || !token) return null;
                      return (
                        <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                          <h3 className="font-semibold text-slate-700 mb-3">
                            {t("Evidence Images", "Imágenes de evidencia")}
                          </h3>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            {evidenceTypes.map((type) => (
                              <EvidenceImageThumb
                                key={`${viewOrder.id}-${type}`}
                                orderId={viewOrder.id}
                                type={type}
                                token={token}
                                label={locale === "es" ? EVIDENCE_IMAGE_LABELS[type].es : EVIDENCE_IMAGE_LABELS[type].en}
                                onOpen={setSelectedImage}
                              />
                            ))}
                          </div>
                        </div>
                      );
                    })()}
                  </>
                )}

                {isEditing && (
                  <div className="flex justify-end gap-2 pt-4 border-t">
                    <Button variant="outline" onClick={() => setIsEditing(false)}>
                      {t("Cancel", "Cancelar")}
                    </Button>
                    <Button className="bg-sky-600 hover:bg-sky-700" onClick={handleEditSave}>
                      {t("Save", "Guardar")}
                    </Button>
                  </div>
                )}
              </>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Image Zoom Modal ── */}
      <Dialog open={!!selectedImage} onOpenChange={() => setSelectedImage(null)}>
        <DialogContent className="max-w-[90vw] w-auto p-0 bg-transparent border-none shadow-none">
          <div className="relative">
            <img
              src={selectedImage?.url}
              alt={selectedImage?.label}
              className="max-w-full max-h-[85vh] rounded-xl shadow-2xl"
            />
            <button
              onClick={() => setSelectedImage(null)}
              className="absolute top-2 right-2 bg-black/50 text-white rounded-full p-1.5 hover:bg-black/70"
            >
              <X className="w-5 h-5" />
            </button>
            {selectedImage?.label && (
              <div className="absolute bottom-2 left-2 bg-black/50 text-white text-xs px-2 py-1 rounded">
                {selectedImage.label}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!confirmDialog}
        title={confirmDialog?.title}
        description={confirmDialog?.description}
        onConfirm={handleConfirmDialogAccept}
        onCancel={() => setConfirmDialog(null)}
      />
      <ConfirmDialog
        open={!!bulkConfirm}
        title={bulkConfirm?.title}
        description={bulkConfirm?.description}
        onConfirm={handleBulkCancelAccept}
        onCancel={() => setBulkConfirm(null)}
      />
    </div>
  );
}