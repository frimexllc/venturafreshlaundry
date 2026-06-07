// OrderDetailDialog.jsx — FIXED: no flash, no disappear, stable dialog state
// ADDED: Recurrence information display

import { useState, useEffect, useCallback, useRef } from "react";
import { Dialog, DialogContent, DialogTitle } from "../ui/dialog";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import {
  DollarSign, Scale, CreditCard, Banknote, Send, RefreshCw,
  Printer, X, ImageIcon, CheckCircle2, AlertTriangle, Eye,
  ShieldCheck, ShieldX, Clock, FileDown, Package, Truck,
  ChevronDown, ChevronUp, User, MapPin, Calendar, StickyNote,
  Hash, Award, Plus, Minus, Trash2, Info, Camera, ZoomIn,
  ChevronLeft, ChevronRight, AlertCircle, Phone, Mail,
  CheckCircle, Repeat, CalendarDays, CalendarRange,
} from "lucide-react";
import { toast } from "sonner";
import {
  safeString, formatCurrency, formatOrderNumber,
  isWashFoldService, calcDeliveryFee,
  buildDisplayBreakdown,
} from "./utils";
import { useLocale } from "../../context/LocaleContext";
import PickupImageModal from "../PickupImageModal";
import BillingBreakdown from "./BillingBreakdown";

// ─── Constants ────────────────────────────────────────────────────────────────

const parseLocalDate = (ds) => {
  if (!ds) return null;
  return ds.includes("T") ? new Date(ds) : new Date(ds + "T12:00:00");
};

const API_URL = process.env.REACT_APP_BACKEND_URL || "";
const getToken = () => localStorage.getItem("token");
const authHdrs = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${getToken()}`,
});

const handle401 = (res) => {
  if (res.status === 401) {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    window.location.href = "/login";
    return true;
  }
  return false;
};

const handle403 = (res) => {
  if (res.status === 403) {
    toast.error("No tienes permiso para realizar esta acción");
    return true;
  }
  return false;
};

const normalizePayMethod = (method) => {
  const m = (method || "").toLowerCase();
  if (m === "card") return "card";
  if (m === "cash") return "cash";
  if (m === "zelle") return "zelle";
  if (m === "venmo" || m === "cashapp") return "other";
  return "other";
};

function calculateOrderTotal(order, payMethod) {
  const extraCharge = Number(order.extra_charge || 0);
  const deliveryFee = Number(order.delivery_fee || calcDeliveryFee(order.distance_miles));
  const addonsTotal = (order.addon_services || []).reduce(
    (s, a) => s + Number(a.price || 0) * Number(a.qty || a.quantity || 1), 0
  );
  if (extraCharge > 0) {
    const baseTotal = extraCharge + deliveryFee + addonsTotal;
    return {
      baseTotal, total: baseTotal,
      discount: Number(order.membership_discount || 0),
      deliveryFee, addonsTotal,
      lbsCovered: Number(order.lbs_from_allowance || 0),
      lbsExtra: Number(order.extra_lbs_billed || 0),
      isMember: Boolean(order.membership_plan),
      plan: (order.service_plan || "standard").toLowerCase(),
      lbs: Number(order.actual_lbs || 0),
      allowanceExhausted: Boolean(order.membership_plan) && Number(order.lbs_from_allowance || 0) === 0 && Number(order.actual_lbs || 0) > 0,
    };
  }
  const breakdown = buildDisplayBreakdown(order);
  return {
    baseTotal: breakdown.total, total: breakdown.total,
    discount: breakdown.discount, deliveryFee: breakdown.deliveryFee,
    addonsTotal: breakdown.addonsTotal, lbsCovered: breakdown.lbsCovered,
    lbsExtra: breakdown.lbsExtra, isMember: breakdown.isMember,
    plan: breakdown.plan, lbs: breakdown.lbs,
    allowanceExhausted: breakdown.allowanceExhausted,
  };
}

const ADDON_CATALOG = [
  { id: "bath_mat",       name: "Bath Mat",         price: 8.00,   category: "home_essentials" },
  { id: "Oven Mitt",      name: "Cojín para horno", price: 8.00,   category: "home_essentials" },
  { id: "pet_bed_s",      name: "Pet Bed (S)",       price: 15.00,  category: "home_essentials" },
  { id: "pet_bed_ml",     name: "Pet Bed (M/L)",     price: 18.00,  category: "home_essentials" },
  { id: "pillow_std",     name: "Pillow Std",        price: 10.00,  category: "bedding" },
  { id: "pillow_lg",      name: "Pillow Lg",         price: 15.00,  category: "bedding" },
  { id: "duvet_cover",    name: "Duvet Cover",       price: 15.00,  category: "bedding" },
  { id: "blanket",        name: "Blanket",           price: 15.00,  category: "bedding" },
  { id: "comforter_tdq",  name: "Comforter T/D/Q",  price: 25.00,  category: "comforters" },
  { id: "comforter_king", name: "Comforter King",   price: 30.00,  category: "comforters" },
  { id: "mattress_cover", name: "Mattress Cover",   price: 25.00,  category: "comforters" },
  { id: "down_comforter", name: "Down Comforter",   price: 450.00, category: "comforters" },
];

const CAT_LABELS = {
  home_essentials: { en: "Home Essentials", es: "Artículos del hogar" },
  bedding:         { en: "Bedding",         es: "Ropa de cama" },
  comforters:      { en: "Comforters",      es: "Edredones" },
};

// ─── RECURRENCE LABELS ────────────────────────────────────────────────────────
const RECURRENCE_LABELS = {
  en: {
    once: "One time",
    weekly: "Weekly",
    biweekly: "Every 2 weeks",
    twice_week: "Twice a week",
  },
  es: {
    once: "Una vez",
    weekly: "Semanal",
    biweekly: "Cada 2 semanas",
    twice_week: "Dos veces por semana",
  },
};

const groupBy = (arr, key) =>
  arr.reduce((acc, x) => {
    const k = x[key] || "other";
    (acc[k] = acc[k] || []).push(x);
    return acc;
  }, {});

const STATUS_CONFIG = {
  new:              { color: "bg-yellow-100 text-yellow-800 border-yellow-200" },
  confirmed:        { color: "bg-blue-100 text-blue-800 border-blue-200" },
  picked_up:        { color: "bg-indigo-100 text-indigo-800 border-indigo-200" },
  processing:       { color: "bg-purple-100 text-purple-800 border-purple-200" },
  ready:            { color: "bg-teal-100 text-teal-800 border-teal-200" },
  out_for_delivery: { color: "bg-orange-100 text-orange-800 border-orange-200" },
  delivered:        { color: "bg-green-100 text-green-800 border-green-200" },
  completed:        { color: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  cancelled:        { color: "bg-red-100 text-red-800 border-red-200" },
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function Section({ icon, title, badge, children, collapsible = false, defaultOpen = true, className = "", ...rest }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`rounded-2xl border border-slate-200 overflow-hidden bg-white shadow-sm ${className}`} {...rest}>
      <div
        className={`flex items-center gap-2.5 px-4 py-3 bg-gradient-to-r from-slate-50 to-white border-b border-slate-100 ${collapsible ? "cursor-pointer select-none" : ""}`}
        onClick={() => collapsible && setOpen(v => !v)}
      >
        <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-sky-50 text-sky-600 shrink-0">{icon}</span>
        <h3 className="font-semibold text-slate-800 text-sm flex-1">{title}</h3>
        {badge}
        {collapsible && (
          <span className="text-slate-400">
            {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </span>
        )}
      </div>
      {(!collapsible || open) && <div className="p-4">{children}</div>}
    </div>
  );
}

function DataRow({ label, value, className = "", mono = false }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className={`space-y-0.5 ${className}`}>
      <p className="text-[10px] font-semibold tracking-widest text-slate-400 uppercase">{label}</p>
      <p className={`text-sm font-medium text-slate-800 leading-snug ${mono ? "font-mono" : ""}`}>{value}</p>
    </div>
  );
}

function InfoChip({ icon, label, value, color = "sky" }) {
  const colors = {
    sky:     "bg-sky-50 border-sky-200 text-sky-800",
    emerald: "bg-emerald-50 border-emerald-200 text-emerald-800",
    amber:   "bg-amber-50 border-amber-200 text-amber-800",
    red:     "bg-red-50 border-red-200 text-red-800",
    purple:  "bg-purple-50 border-purple-200 text-purple-800",
  };
  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-semibold ${colors[color]}`}>
      {icon}
      <span>{label && <span className="opacity-60 mr-1">{label}:</span>}{value}</span>
    </div>
  );
}

function PayMethodBtn({ label, icon, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-1.5 py-2.5 px-1 rounded-xl border-2 text-[11px] font-semibold transition-all ${
        active
          ? "bg-sky-600 text-white border-sky-600 shadow-md shadow-sky-200"
          : "bg-white text-slate-500 border-slate-200 hover:border-sky-300 hover:text-sky-600"
      }`}
    >
      <span className={active ? "text-white" : "text-slate-400"}>{icon}</span>
      {label}
    </button>
  );
}

function ReceiptCard({ receipt, onValidate, validating }) {
  const { t } = useLocale();
  const [expanded, setExpanded]     = useState(false);
  const [blobUrl, setBlobUrl]       = useState(null);
  const [imgError, setImgError]     = useState(false);
  const [imgLoading, setImgLoading] = useState(true);

  useEffect(() => {
    let objectUrl = null;
    setImgLoading(true);
    setImgError(false);
    const load = async (retry = true) => {
      try {
        const res = await fetch(`${API_URL}/api/files/${receipt.id}/download`, {
          headers: { Authorization: `Bearer ${getToken()}` },
        });
        if (handle401(res)) return;
        if (!res.ok) throw new Error();
        const blob = await res.blob();
        objectUrl = URL.createObjectURL(blob);
        setBlobUrl(objectUrl);
      } catch {
        if (retry) setTimeout(() => load(false), 1000);
        else { setImgError(true); setImgLoading(false); }
      }
    };
    load();
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [receipt.id]);

  const stCfg = {
    verified_paid: { icon: <ShieldCheck className="w-4 h-4" />, label: t("AI: Verified payment", "IA: Pago verificado"), cls: "bg-emerald-50 border-emerald-200 text-emerald-700" },
    rejected:      { icon: <ShieldX    className="w-4 h-4" />, label: t("AI: Not valid",        "IA: No válido"),        cls: "bg-red-50 border-red-200 text-red-700" },
    pending:       { icon: <Clock      className="w-4 h-4" />, label: t("Pending AI",            "Pendiente IA"),         cls: "bg-amber-50 border-amber-200 text-amber-700" },
  };
  const st = stCfg[receipt.ai_validation_status || "pending"] ?? stCfg.pending;

  return (
    <div className="rounded-xl border border-slate-200 overflow-hidden bg-white">
      <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 border-b border-slate-100">
        <ImageIcon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
        <span className="text-xs font-medium text-slate-600 truncate flex-1">{receipt.original_filename || "receipt"}</span>
        <span className="text-[10px] text-slate-400 shrink-0">
          {receipt.created_at ? new Date(receipt.created_at).toLocaleString() : ""}
        </span>
      </div>
      <div
        className={`relative bg-slate-100 cursor-pointer ${expanded ? "min-h-[200px]" : "min-h-[120px]"}`}
        onClick={() => !imgLoading && !imgError && setExpanded(v => !v)}
      >
        {imgLoading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <RefreshCw className="w-5 h-5 text-slate-400 animate-spin" />
          </div>
        )}
        {imgError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-slate-400">
            <AlertTriangle className="w-6 h-6" />
            <span className="text-[11px]">{t("Could not load", "No se pudo cargar")}</span>
          </div>
        )}
        {blobUrl && !imgError && (
          <img
            src={blobUrl}
            alt="Receipt"
            className={`w-full object-contain ${expanded ? "max-h-[520px]" : "max-h-[160px]"}`}
            onLoad={() => setImgLoading(false)}
            onError={() => { setImgError(true); setImgLoading(false); }}
          />
        )}
        {!imgLoading && !imgError && blobUrl && (
          <button
            onClick={e => { e.stopPropagation(); setExpanded(v => !v); }}
            className="absolute bottom-2 right-2 bg-black/50 text-white rounded-lg px-2 py-1 text-[10px] flex items-center gap-1 hover:bg-black/70"
          >
            <Eye className="w-3 h-3" />
            {expanded ? t("Collapse", "Colapsar") : t("Expand", "Ampliar")}
          </button>
        )}
      </div>
      <div className={`px-3 py-2.5 flex items-start gap-2.5 border-t border-slate-100 ${st.cls}`}>
        <span className="shrink-0 mt-0.5">{st.icon}</span>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold">{st.label}</p>
          {receipt.ai_validation_notes    && <p className="text-[11px] mt-0.5 opacity-80">{receipt.ai_validation_notes}</p>}
          {receipt.ai_extracted_amount > 0 && <p className="text-[11px] mt-0.5 font-bold">{t("Amount", "Monto")}: ${Number(receipt.ai_extracted_amount).toFixed(2)}</p>}
        </div>
        {(receipt.ai_validation_status || "pending") === "pending" && (
          <Button
            size="sm"
            className="h-7 px-2.5 text-[10px] bg-sky-600 hover:bg-sky-700 shrink-0"
            onClick={() => onValidate(receipt.id)}
            disabled={validating === receipt.id}
          >
            {validating === receipt.id ? <RefreshCw className="w-3 h-3 animate-spin" /> : t("Validate", "Validar")}
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── RECURRENCE COMPONENT ──────────────────────────────────────────────────────
function RecurrenceInfo({ order, t, locale }) {
  const [upcomingOrders, setUpcomingOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showUpcoming, setShowUpcoming] = useState(false);

  const isRecurring = order?.is_recurring === true && order?.recurrence !== "once";
  const recurrenceKey = order?.recurrence || "once";
  const recurrenceLabel = RECURRENCE_LABELS[locale === "es" ? "es" : "en"][recurrenceKey] || RECURRENCE_LABELS.en[recurrenceKey];
  const recurrenceDays = order?.recurrence_days || [];

  const fetchUpcomingOrders = useCallback(async () => {
    if (!order?.id) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/orders/${order.id}/recurrence`, {
        headers: authHdrs(),
      });
      if (res.ok) {
        const data = await res.json();
        setUpcomingOrders(data.upcoming_pickups || []);
      }
    } catch (err) {
      console.error("Failed to fetch upcoming recurring orders:", err);
    } finally {
      setLoading(false);
    }
  }, [order?.id]);

  useEffect(() => {
    if (showUpcoming && isRecurring) {
      fetchUpcomingOrders();
    }
  }, [showUpcoming, isRecurring, fetchUpcomingOrders]);

  if (!isRecurring) return null;

  return (
    <Section
      icon={<Repeat className="w-4 h-4" />}
      title={t("Recurring Order", "Orden Recurrente")}
      collapsible={true}
      defaultOpen={true}
      badge={
        <span className="text-[11px] font-bold text-purple-600 bg-purple-50 border border-purple-200 rounded-full px-2 py-0.5">
          {recurrenceLabel}
        </span>
      }
    >
      <div className="space-y-3">
        <div className="flex items-center gap-3 flex-wrap">
          <InfoChip
            icon={<CalendarRange className="w-3.5 h-3.5" />}
            label={t("Frequency", "Frecuencia")}
            value={recurrenceLabel}
            color="purple"
          />
          {recurrenceDays.length > 0 && (
            <InfoChip
              icon={<CalendarDays className="w-3.5 h-3.5" />}
              label={t("Days", "Días")}
              value={recurrenceDays.join(", ")}
              color="sky"
            />
          )}
          {order?.recurrence_end_date && (
            <InfoChip
              icon={<Calendar className="w-3.5 h-3.5" />}
              label={t("End date", "Fecha fin")}
              value={new Date(order.recurrence_end_date).toLocaleDateString()}
              color="amber"
            />
          )}
        </div>

        {/* Upcoming pickups toggle */}
        <button
          onClick={() => setShowUpcoming(!showUpcoming)}
          className="flex items-center gap-1.5 text-xs font-medium text-sky-600 hover:text-sky-700 transition-colors"
        >
          {showUpcoming ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          {showUpcoming ? t("Hide upcoming", "Ocultar próximos") : t("Show upcoming pickups", "Ver próximos pickups")}
        </button>

        {showUpcoming && (
          <div className="mt-2 rounded-xl border border-slate-100 bg-slate-50/50 overflow-hidden">
            {loading ? (
              <div className="p-4 text-center text-slate-400 text-xs">
                <RefreshCw className="w-4 h-4 animate-spin mx-auto mb-1" />
                {t("Loading...", "Cargando...")}
              </div>
            ) : upcomingOrders.length === 0 ? (
              <div className="p-4 text-center text-slate-400 text-xs">
                <Calendar className="w-5 h-5 opacity-30 mx-auto mb-1" />
                {t("No upcoming recurring pickups", "No hay pickups recurrentes próximos")}
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {upcomingOrders.map((uo) => (
                  <div key={uo.id} className="flex items-center justify-between px-3 py-2.5 hover:bg-slate-100 transition-colors">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-3.5 h-3.5 text-slate-400" />
                      <span className="text-xs font-mono text-slate-600">#{uo.order_number}</span>
                    </div>
                    <span className="text-xs font-medium text-slate-700">
                      {new Date(uo.pickup_date).toLocaleDateString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </Section>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function OrderDetailDialog({ order, onClose, onRefresh }) {
  const { t, locale } = useLocale();

  // ── FIX: use a stable internal open state, decoupled from the order prop ──
  const [isOpen, setIsOpen]                 = useState(false);
  const [localOrder, setLocalOrder]         = useState(null);
  const [lbs, setLbs]                       = useState("");
  const [saving, setSaving]                 = useState(false);
  const [payMethod, setPayMethod]           = useState("card");
  const [amtReceived, setAmtReceived]       = useState("");
  const [processing, setProcessing]         = useState(false);
  const [notifyChannel, setNotifyChannel]   = useState("sms");
  const [notifySending, setNotifySending]   = useState(false);
  const [addons, setAddons]                 = useState([]);
  const [savingAddons, setSavingAddons]     = useState(false);
  const [receipts, setReceipts]             = useState([]);
  const [receiptsLoading, setReceiptsLoading] = useState(false);
  const [validatingId, setValidatingId]     = useState(null);
  const [weightPhotoModal, setWeightPhotoModal] = useState(false);
  const [imageCarouselOpen, setImageCarouselOpen] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [imageList, setImageList]           = useState([]);
  const [customerCycleUsage, setCustomerCycleUsage] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  const currentOrderIdRef = useRef(null);

  const hasMembership = Boolean(localOrder?.membership_plan) &&
    !["inactive", "cancelled", "canceled", "expired"].includes(
      (localOrder?.membership_status || "").toLowerCase()
    );

  // ── FIX: Open the dialog and seed localOrder immediately from the prop ──
  useEffect(() => {
    if (order?.id) {
      currentOrderIdRef.current = order.id;
      setLocalOrder(order);
      setLbs(String(order.actual_lbs ?? order.estimated_lbs ?? ""));
      setAmtReceived("");
      setAddons((order.addon_services || []).map(a => ({ ...a, qty: a.qty || a.quantity || 1 })));
      setCustomerCycleUsage(null);
      setIsOpen(true);
    }
  }, [order?.id]);

  const fetchOrderDetails = useCallback(async (oid) => {
    if (!oid) return;
    setLoadingDetails(true);
    try {
      const res = await fetch(`${API_URL}/api/operator/orders/${oid}`, { headers: authHdrs() });
      if (handle401(res)) return;
      if (res.ok) {
        const data = await res.json();
        if (currentOrderIdRef.current === oid) {
          setLocalOrder(data);
          setLbs(String(data.actual_lbs ?? data.estimated_lbs ?? ""));
          setAddons((data.addon_services || []).map(a => ({ ...a, qty: a.qty || a.quantity || 1 })));
        }
      }
    } catch (err) {
      console.error("fetchOrderDetails error:", err);
    } finally {
      setLoadingDetails(false);
    }
  }, []);

  const fetchCustomerCycleUsage = useCallback(async (customerId) => {
    if (!customerId) return;
    try {
      const res = await fetch(`${API_URL}/api/customers/${customerId}/cycle-usage`, { headers: authHdrs() });
      if (res.ok) {
        const data = await res.json();
        setCustomerCycleUsage(data.data || data);
      }
    } catch (err) {
      console.error("cycle-usage error:", err);
    }
  }, []);

  useEffect(() => {
    if (isOpen && order?.id) {
      fetchOrderDetails(order.id);
    }
  }, [isOpen, order?.id, fetchOrderDetails]);

  useEffect(() => {
    if (isOpen && order?.customer_id) {
      fetchCustomerCycleUsage(order.customer_id);
    }
  }, [isOpen, order?.customer_id, fetchCustomerCycleUsage]);

  const loadReceipts = useCallback(async (oid) => {
    if (!oid) return;
    setReceiptsLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/files/receipts-by-order/${oid}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (handle401(res)) return;
      if (res.ok) setReceipts(await res.json() || []);
    } catch { /* ignore */ }
    finally { setReceiptsLoading(false); }
  }, []);

  useEffect(() => {
    if (isOpen && order?.id) {
      loadReceipts(order.id);
    } else {
      setReceipts([]);
    }
  }, [isOpen, order?.id, loadReceipts]);

  const handleClose = useCallback(() => {
    setIsOpen(false);
    currentOrderIdRef.current = null;
    setTimeout(() => {
      setLocalOrder(null);
      setCustomerCycleUsage(null);
      setReceipts([]);
      setAddons([]);
      setLbs("");
    }, 200);
    onClose();
  }, [onClose]);

  // ─── Add-on handlers ──────────────────────────────────────────────────────

  const handleAddAddon = (item) => {
    const ex = addons.find(a => a.id === item.id);
    if (ex) setAddons(prev => prev.map(a => a.id === item.id ? { ...a, qty: (a.qty || 1) + 1 } : a));
    else setAddons(prev => [...prev, { ...item, qty: 1 }]);
  };

  const handleUpdateAddonQty = (id, newQty) => {
    if (newQty <= 0) setAddons(prev => prev.filter(a => a.id !== id));
    else setAddons(prev => prev.map(a => a.id === id ? { ...a, qty: newQty } : a));
  };

  const saveAddonsList = useCallback(async (list) => {
    const oid = localOrder?.id;
    if (!oid) return false;
    setSavingAddons(true);
    try {
      const res = await fetch(`${API_URL}/api/orders/${oid}`, {
        method: "PUT",
        headers: authHdrs(),
        body: JSON.stringify({
          addon_services: list.map(a => ({ ...a, price: Number(a.price), quantity: a.qty || 1 })),
        }),
      });
      if (handle401(res)) return false;
      if (handle403(res)) return false;
      if (res.ok) {
        const updated = await res.json();
        setLocalOrder(prev => ({
          ...prev,
          addon_services: list,
          extra_charge:   updated.extra_charge ?? updated.total_amount,
          total_amount:   updated.total_amount,
          price_per_lb:   updated.price_per_lb ?? prev?.price_per_lb,
          status:         updated.status ?? prev?.status,
        }));
        
        const currentStatus = (localOrder?.status || updated.status || "").toLowerCase();
        const hasAddons = list.length > 0;
        const blockedStatuses = ["processing", "ready", "out_for_delivery", "delivered", "completed", "cancelled"];
        const canAdvance = hasAddons && !blockedStatuses.includes(currentStatus);
        
        if (canAdvance) {
          try {
            const statusRes = await fetch(
              `${API_URL}/api/automation/orders/${oid}/status?new_status=processing`,
              { method: "PUT", headers: authHdrs() }
            );
            if (statusRes.ok) {
              setLocalOrder(prev => ({ ...prev, status: "processing" }));
              toast.info(t("Order advanced to Processing", "Orden avanzada a En proceso"));
              await fetchOrderDetails(oid);
              onRefresh?.();
            }
          } catch (statusErr) {
            console.warn("Auto-advance on add-ons error:", statusErr);
          }
        }
        onRefresh?.();
        return true;
      }
      const err = await res.json().catch(() => ({}));
      toast.error(err.detail || t("Error saving add-ons", "Error al guardar extras"));
      return false;
    } catch {
      toast.error(t("Connection error", "Error de conexión"));
      return false;
    } finally {
      setSavingAddons(false);
    }
  }, [localOrder?.id, localOrder?.status, onRefresh, t, fetchOrderDetails]);

  const handleSaveAddons = async () => {
    const ok = await saveAddonsList(addons);
    if (ok) toast.success(t("Add-ons saved", "Extras guardados"));
  };

  const handleClearAllAddons = async () => {
    if (addons.length === 0) { toast.info(t("No add-ons to clear", "No hay extras para eliminar")); return; }
    if (!window.confirm(t("Are you sure you want to remove all add-ons?", "¿Estás seguro de que quieres eliminar todos los extras?"))) return;
    const ok = await saveAddonsList([]);
    if (ok) { setAddons([]); toast.success(t("Add-ons cleared", "Extras eliminados")); }
  };

  // ─── Receipt handlers ─────────────────────────────────────────────────────

  const handleValidateReceipt = async (fileId) => {
    const oid = localOrder?.id;
    if (!oid) return;
    setValidatingId(fileId);
    try {
      const res = await fetch(`${API_URL}/api/files/validate-payment-receipt/${fileId}?order_id=${oid}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (handle401(res)) return;
      if (res.ok) {
        const d = await res.json();
        setReceipts(prev => prev.map(r =>
          r.id === fileId ? {
            ...r,
            ai_validation_status: d.is_valid_payment ? "verified_paid" : "rejected",
            ai_validation_notes:  d.notes,
            ai_extracted_amount:  d.amount,
          } : r
        ));
        toast[d.is_valid_payment ? "success" : "error"](
          d.is_valid_payment
            ? t("Receipt verified!", "Comprobante verificado!")
            : t("Not a valid payment", "No es pago válido")
        );
      }
    } catch {
      toast.error(t("Connection error", "Error de conexión"));
    } finally {
      setValidatingId(null);
    }
  };

  // ─── Weight / lbs handlers ────────────────────────────────────────────────

  const saveLbsValue = useCallback(async (lbsValue) => {
    const oid = localOrder?.id;
    if (!oid) return false;
    const lbsToSave = (lbsValue === "" || lbsValue === "0") ? null : Number(lbsValue);
    if (lbsToSave !== null && (isNaN(lbsToSave) || lbsToSave <= 0)) {
      toast.error(t("Enter valid lbs", "Ingresa libras válidas"));
      return false;
    }
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/api/orders/${oid}`, {
        method: "PUT",
        headers: authHdrs(),
        body: JSON.stringify({ actual_lbs: lbsToSave }),
      });
      if (handle401(res)) return false;
      if (handle403(res)) return false;
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.detail || t("Error saving lbs", "Error al guardar libras"));
        return false;
      }
      const updated = await res.json();
      setLocalOrder(prev => ({
        ...prev,
        actual_lbs:          lbsToSave,
        extra_charge:        updated.extra_charge ?? updated.total_amount,
        total_amount:        updated.total_amount,
        price_per_lb:        updated.price_per_lb ?? prev?.price_per_lb,
        lbs_from_allowance:  updated.lbs_from_allowance ?? prev?.lbs_from_allowance,
        extra_lbs_billed:    updated.extra_lbs_billed ?? prev?.extra_lbs_billed,
        membership_discount: updated.membership_discount ?? prev?.membership_discount,
        payment_status:      updated.payment_status ?? prev?.payment_status,
        payment_method:      updated.payment_method ?? prev?.payment_method,
        membership_plan:     updated.membership_plan ?? prev?.membership_plan,
        membership_status:   updated.membership_status ?? prev?.membership_status,
      }));
      setLbs(lbsToSave !== null ? String(lbsToSave) : "");
      onRefresh?.();

      if (lbsToSave !== null && lbsToSave > 0) {
        try {
          const chargeRes    = await fetch(`${API_URL}/api/automation/orders/${oid}/auto-charge`, {
            method: "POST", headers: authHdrs(),
          });
          const chargeResult = await chargeRes.json();
          if (chargeResult.success) {
            if (chargeResult.covered_by_membership) {
              toast.success(t(`✓ Order covered by membership (${chargeResult.lbs_covered} lbs from allowance)`,
                `✓ Orden cubierta por membresía (${chargeResult.lbs_covered} lbs del allowance)`));
            } else if (chargeResult.charged) {
              toast.success(t(`✓ Auto-charged $${chargeResult.amount_charged?.toFixed(2)} to ${chargeResult.card_brand || "card"} ****${chargeResult.card_last4 || "****"}`,
                `✓ Se cobraron $${chargeResult.amount_charged?.toFixed(2)} a ${chargeResult.card_brand || "card"} ****${chargeResult.card_last4 || "****"}`));
            } else if (chargeResult.skipped) {
              toast.info(t("Order already paid", "La orden ya estaba pagada"));
            }
            await fetchOrderDetails(oid);
            const chargeOk = chargeResult.covered_by_membership || chargeResult.charged || chargeResult.skipped;
            const isPickupDelivery = ["pickup_delivery", "airbnb_host", "commercial"].includes(localOrder?.service_type);
            if (chargeOk && isPickupDelivery && (localOrder?.status || "").toLowerCase() !== "processing") {
              try {
                const statusRes = await fetch(`${API_URL}/api/automation/orders/${oid}/status?new_status=processing`,
                  { method: "PUT", headers: authHdrs() });
                if (statusRes.ok) {
                  toast.info(t("Order advanced to Processing", "Orden avanzada a En proceso"));
                  await fetchOrderDetails(oid);
                  onRefresh?.();
                }
              } catch { /* ignore */ }
            }
          } else {
            const errMsg = chargeResult.error || chargeResult.reason || "charge failed";
            if (errMsg.toLowerCase().includes("no saved card") || errMsg.toLowerCase().includes("no card")) {
              toast.warning(t("⚠️ No saved card — please charge manually", "⚠️ Sin tarjeta guardada — cobrar manualmente"));
            } else {
              toast.warning(t(`⚠️ Auto-charge failed: ${errMsg}`, `⚠️ Auto-cobro falló: ${errMsg}`));
            }
            await fetchOrderDetails(oid);
            onRefresh?.();
          }
        } catch {
          toast.warning(t("Auto-charge unavailable. Please charge manually.", "Auto-cobro no disponible. Cobrar manualmente."));
          await fetchOrderDetails(oid);
          onRefresh?.();
        }
      }
      return true;
    } catch {
      toast.error(t("Connection error", "Error de conexión"));
      return false;
    } finally {
      setSaving(false);
    }
  }, [localOrder?.id, localOrder?.service_type, localOrder?.status, onRefresh, t, fetchOrderDetails]);

  const handleSetLbsClick = () => {
    if (!lbs || isNaN(Number(lbs)) || Number(lbs) <= 0) {
      toast.error(t("Enter valid lbs before taking the weight photo", "Ingresa las libras válidas antes de tomar la foto de peso"));
      return;
    }
    setWeightPhotoModal(true);
  };

  const handleWeightPhotoConfirm = async (imageResult) => {
    setWeightPhotoModal(false);
    const oid = localOrder?.id;
    if (!oid) return;
    if (imageResult?.id) {
      try {
        await fetch(`${API_URL}/api/driver/orders/${oid}/weight-image/link`, {
          method: "POST",
          headers: authHdrs(),
          body: JSON.stringify({ image_id: imageResult.id }),
        });
      } catch { /* ignore */ }
    }
    const ok = await saveLbsValue(lbs);
    if (ok) {
      toast.success(t("Weight photo saved & lbs recorded", "Foto de peso guardada y libras registradas"));
      await fetchOrderDetails(oid);
    }
  };

  const handleClearLbs = async () => {
    const oid = localOrder?.id;
    if (!oid) return;
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/api/orders/${oid}`, {
        method: "PUT",
        headers: authHdrs(),
        body: JSON.stringify({ actual_lbs: null }),
      });
      if (handle401(res)) return;
      if (res.ok) {
        const updated = await res.json();
        setLocalOrder(prev => ({
          ...prev,
          actual_lbs: null, weight_image_data: null,
          extra_charge: updated.extra_charge ?? updated.total_amount,
          total_amount: updated.total_amount,
          lbs_from_allowance: 0, extra_lbs_billed: 0,
        }));
        setLbs("");
        toast.success(t("Weight removed", "Peso eliminado"));
        onRefresh?.();
      }
    } catch {
      toast.error(t("Connection error", "Error de conexión"));
    } finally {
      setSaving(false);
    }
  };

  // ─── Payment handlers ─────────────────────────────────────────────────────

  const handlePayment = async () => {
    const oid = localOrder?.id;
    if (!oid) return;
    const normalizedMethod = normalizePayMethod(payMethod);

    if (normalizedMethod === "card") {
      setProcessing(true);
      try {
        const breakdown = buildDisplayBreakdown(localOrder);
        const amountWithFee = breakdown.total * 1.03;
        if (amountWithFee <= 0.5) {
          toast.error(t("Amount too small for payment", "Monto demasiado pequeño para pagar"));
          return;
        }
        const res = await fetch(`${API_URL}/api/orders/${oid}/stripe-checkout`, {
          method: "POST", headers: authHdrs(),
          body: JSON.stringify({ origin_url: window.location.origin, amount: amountWithFee }),
        });
        if (handle401(res)) return;
        if (res.ok) {
          const d = await res.json();
          window.location.href = d.url || d.checkout_url;
          return;
        }
        const err = await res.json().catch(() => ({}));
        toast.error(err.detail || t("Stripe error", "Error de Stripe"));
      } catch {
        toast.error(t("Connection error", "Error de conexión"));
      } finally {
        setProcessing(false);
      }
      return;
    }

    const { total: dynamicTotal } = calculateOrderTotal(localOrder, payMethod);

    if (normalizedMethod === "cash") {
      const amt = Number(amtReceived);
      if (!amt || amt < dynamicTotal) {
        toast.error(t("Amount must be ≥ total", "Monto debe ser ≥ total") + ` (${formatCurrency(dynamicTotal)})`);
        return;
      }
      setProcessing(true);
      try {
        const res = await fetch(`${API_URL}/api/orders/${oid}/payment`, {
          method: "POST", headers: authHdrs(),
          body: JSON.stringify({ payment_method: "cash", amount_received: amt }),
        });
        if (handle401(res)) return;
        if (res.ok) {
          const d = await res.json();
          setLocalOrder(prev => ({ ...prev, payment_status: "paid", payment_method: "cash", amount_paid: amt, change_due: d.change_due }));
          toast.success(d.change_due > 0
            ? `${t("Paid!", "¡Pagado!")} ${t("Change", "Cambio")}: ${formatCurrency(d.change_due)}`
            : t("Payment registered", "Pago registrado"));
          onRefresh?.();
        } else {
          const err = await res.json().catch(() => ({}));
          toast.error(err.detail || t("Payment error", "Error de pago"));
        }
      } catch {
        toast.error(t("Connection error", "Error de conexión"));
      } finally {
        setProcessing(false);
      }
      return;
    }

    setProcessing(true);
    try {
      const res = await fetch(`${API_URL}/api/orders/${oid}/payment`, {
        method: "POST", headers: authHdrs(),
        body: JSON.stringify({ payment_method: normalizedMethod }),
      });
      if (handle401(res)) return;
      if (res.ok) {
        setLocalOrder(prev => ({ ...prev, payment_status: "paid", payment_method: normalizedMethod, amount_paid: dynamicTotal }));
        toast.success(t("Payment registered", "Pago registrado"));
        onRefresh?.();
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.detail || t("Payment error", "Error de pago"));
      }
    } catch {
      toast.error(t("Connection error", "Error de conexión"));
    } finally {
      setProcessing(false);
    }
  };

  const handleSendNotification = async () => {
    const oid = localOrder?.id;
    if (!oid) return;
    setNotifySending(true);
    try {
      const res = await fetch(`${API_URL}/api/orders/${oid}/notify-customer`, {
        method: "POST", headers: authHdrs(),
        body: JSON.stringify({ channel: notifyChannel }),
      });
      if (handle401(res)) return;
      const d = await res.json();
      if (res.ok && d.ok) {
        toast.success(d.membership_covered
          ? t("Order covered by membership — no payment notification sent", "Orden cubierta por membresía — sin notificación de pago")
          : t(`Sent via ${notifyChannel.toUpperCase()}`, `Enviado por ${notifyChannel.toUpperCase()}`));
      } else {
        toast.error(d.detail || t("Could not send", "No se pudo enviar"));
      }
    } catch {
      toast.error(t("Connection error", "Error de conexión"));
    } finally {
      setNotifySending(false);
    }
  };

  const handlePrintTicket = async () => {
    const oid = localOrder?.id;
    if (!oid) return;
    try {
      const res = await fetch(`${API_URL}/api/orders/${oid}/ticket`, { headers: authHdrs() });
      if (handle401(res)) return;
      if (!res.ok) throw new Error();
      const pw = window.open("", "_blank", "width=560,height=700");
      if (!pw) { toast.error(t("Allow pop-ups", "Permite pop-ups")); return; }
      let html = await res.text();
      const fixCss = `<style>* { box-sizing: border-box; } body { max-width: 520px; margin: 0 auto; padding: 8px; } table { width: 100%; } td, th { white-space: normal; word-break: break-word; }</style>`;
      html = html.includes("</head>") ? html.replace("</head>", `${fixCss}</head>`) : fixCss + html;
      pw.document.write(html);
      pw.document.close();
      setTimeout(() => pw.print(), 500);
    } catch {
      toast.error(t("Print error", "Error de impresión"));
    }
  };

  const handleDownloadPDF = async () => {
    const oid = localOrder?.id;
    if (!oid) return;
    try {
      const { default: html2pdf } = await import("html2pdf.js");
      const res = await fetch(`${API_URL}/api/orders/${oid}/ticket`, { headers: authHdrs() });
      if (handle401(res)) return;
      if (!res.ok) throw new Error();
      let html = await res.text();
      const fixCss = `<style>* { box-sizing: border-box; } body { max-width: 520px; margin: 0 auto; padding: 8px; } table { width: 100%; }</style>`;
      html = html.includes("</head>") ? html.replace("</head>", `${fixCss}</head>`) : fixCss + html;
      const c = document.createElement("div");
      c.innerHTML = html;
      c.style.cssText = "width:520px;padding:12px";
      document.body.appendChild(c);
      await html2pdf().set({
        margin: 4,
        filename: `ticket-${formatOrderNumber(localOrder)}.pdf`,
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: "mm", format: [148, 280] },
      }).from(c).save();
      document.body.removeChild(c);
    } catch {
      toast.error(t("PDF error", "Error PDF"));
    }
  };

  // ─── Carousel ─────────────────────────────────────────────────────────────

  const openImageCarousel = (imagesArray, startIndex) => {
    setImageList(imagesArray);
    setCurrentImageIndex(startIndex);
    setImageCarouselOpen(true);
  };

  // ─── Render helpers ────────────────────────────────────────────────────────

  const renderEvidenceSection = () => {
    if (!localOrder) return null;
    const images = [];
    if (localOrder.pickup_image_data)   images.push({ key: "pickup",   label: t("Pickup",   "Recogida"), url: `data:image/jpeg;base64,${localOrder.pickup_image_data}` });
    if (localOrder.delivery_image_data) images.push({ key: "delivery", label: t("Delivery", "Entrega"),  url: `data:image/jpeg;base64,${localOrder.delivery_image_data}` });
    if (localOrder.weight_image_data)   images.push({ key: "weight",   label: t("Weight",   "Peso"),     url: `data:image/jpeg;base64,${localOrder.weight_image_data}` });
    return (
      <Section
        icon={<Camera className="w-4 h-4" />}
        title={t("Evidence Images", "Imágenes de evidencia")}
        collapsible defaultOpen={true}
        badge={images.length > 0 ? (
          <span className="text-[11px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">{images.length}</span>
        ) : null}
      >
        {images.length === 0 ? (
          <div className="text-center py-6 text-slate-400 text-sm">
            <Camera className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p>{t("No images yet.", "Aún no hay imágenes.")}</p>
            <p className="text-xs mt-1 text-slate-300">{t("Pickup, delivery and weight photos will appear here.", "Las fotos de recogida, entrega y peso aparecerán aquí.")}</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {images.map((img, idx) => (
              <div
                key={img.key}
                className="relative group cursor-pointer rounded-xl overflow-hidden border border-slate-200 bg-white shadow-sm hover:shadow-md transition-all"
                onClick={() => openImageCarousel(images, idx)}
              >
                <img src={img.url} alt={img.label} className="w-full h-24 object-cover" />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <ZoomIn className="w-5 h-5 text-white" />
                </div>
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-1.5">
                  <p className="text-[9px] font-semibold text-white truncate">{img.label}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>
    );
  };

  // ─── Guard ────────────────────────────────────────────────────────────────

  if (!order) return null;

  const o = localOrder || order;
  const isPaid           = (o.payment_status || "").toLowerCase() === "paid";
  const isWF             = isWashFoldService(o.service_type);
  const deliveryFee      = calcDeliveryFee(o.distance_miles);
  const verifiedReceipts = receipts.filter(r => r.ai_validation_status === "verified_paid");
  const addonTotal       = addons.reduce((s, a) => s + Number(a.price || 0) * Number(a.qty || 1), 0);
  const catLabel         = (cat) => locale === "es" ? CAT_LABELS[cat]?.es : CAT_LABELS[cat]?.en;
  const statusKey        = (o.status || "new").toLowerCase().replace(/ /g, "_");
  const statusCls        = STATUS_CONFIG[statusKey]?.color || "bg-slate-100 text-slate-700 border-slate-200";
  const groupedAddons    = groupBy(addons, "category");
  const groupedCatalog   = groupBy(ADDON_CATALOG, "category");
  const dynamicTotal     = calculateOrderTotal(o, payMethod).baseTotal;

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => { if (!open) handleClose(); }}>
        <DialogContent
          className="w-[95vw] max-w-xl max-h-[92vh] overflow-y-auto bg-slate-50 p-0 gap-0 rounded-2xl"
          data-testid="order-detail-dialog"
        >
          <DialogTitle className="sr-only">{t("Order Details", "Detalles de Orden")}</DialogTitle>

          {/* ── Header ── */}
          <div className="sticky top-0 z-20 bg-white border-b border-slate-200 rounded-t-2xl">
            <div className="flex items-center gap-3 px-5 py-3">
              <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-sky-600 text-white shrink-0">
                <Hash className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-bold tracking-widest text-slate-400 uppercase leading-none mb-0.5">{t("Order", "Orden")}</p>
                <div className="flex items-center gap-2">
                  <p className="text-base font-bold text-slate-900">{formatOrderNumber(o)}</p>
                  {loadingDetails && <RefreshCw className="w-3 h-3 text-slate-400 animate-spin" />}
                </div>
              </div>
              <span className={`text-[11px] font-bold px-3 py-1.5 rounded-full border capitalize ${statusCls}`}>
                {safeString(o.status)}
              </span>
              <button
                onClick={handleClose}
                className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Customer quick info bar */}
            {o.customer_name && (
              <div className="px-5 pb-3 flex flex-wrap gap-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 bg-slate-100 rounded-lg px-2.5 py-1.5">
                  <User className="w-3.5 h-3.5 text-slate-500" />
                  {o.customer_name}
                </div>
                {o.customer_phone && (
                  <a href={`tel:${o.customer_phone}`} className="flex items-center gap-1.5 text-xs font-semibold text-sky-700 bg-sky-50 border border-sky-200 rounded-lg px-2.5 py-1.5 hover:bg-sky-100">
                    <Phone className="w-3.5 h-3.5" />
                    {o.customer_phone}
                  </a>
                )}
                {o.membership_plan && (
                  <div className="flex items-center gap-1 text-xs font-bold text-purple-700 bg-purple-50 border border-purple-200 rounded-lg px-2.5 py-1.5">
                    <Award className="w-3.5 h-3.5" />
                    {o.membership_plan}
                  </div>
                )}
                <div className={`text-[11px] font-bold px-2.5 py-1.5 rounded-lg border ${isPaid ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-red-50 text-red-600 border-red-200"}`}>
                  {isPaid ? `✓ ${t("Paid", "Pagado")}` : t("Unpaid", "Sin pagar")}
                </div>
              </div>
            )}
          </div>

          <div className="p-4 space-y-3">

            {/* ── Customer & Service ── */}
            <Section icon={<User className="w-4 h-4" />} title={t("Customer & Service", "Cliente y Servicio")}>
              <div className="grid grid-cols-2 gap-x-5 gap-y-3">
                <DataRow label={t("Name", "Nombre")}      value={safeString(o.customer_name,  "—")} />
                <DataRow label={t("Phone", "Teléfono")}   value={safeString(o.customer_phone, "—")} />
                <DataRow label="Email"                     value={safeString(o.customer_email, "—")} className="col-span-2" />
                <DataRow label={t("Service", "Servicio")} value={isWF ? "Wash & Fold" : "Pickup & Delivery"} />
                <DataRow label={t("Plan", "Plan")}        value={safeString(o.service_plan)} />
                {o.card_brand && (
                  <DataRow
                    label={t("Card on file", "Tarjeta guardada")}
                    value={`${o.card_brand} ****${o.card_last4 || "—"}`}
                    className="col-span-2"
                  />
                )}
              </div>

              {/* Membership status */}
              {o.membership_plan && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <InfoChip
                    icon={<Award className="w-3.5 h-3.5" />}
                    value={o.membership_plan}
                    color="purple"
                  />
                  {o.membership_status && (
                    <InfoChip
                      icon={<CheckCircle className="w-3.5 h-3.5" />}
                      label={t("Status", "Estado")}
                      value={o.membership_status}
                      color={["inactive","cancelled","canceled","expired"].includes((o.membership_status||"").toLowerCase()) ? "red" : "emerald"}
                    />
                  )}
                </div>
              )}

              {/* Preferred contact */}
              {o.preferred_contact && (
                <div className="mt-2">
                  <DataRow label={t("Preferred contact", "Contacto preferido")} value={o.preferred_contact} />
                </div>
              )}
            </Section>

            {/* ── Distance chip ── */}
            {o.distance_miles != null && (
              <InfoChip
                icon={<Truck className="w-4 h-4" />}
                label={t("Distance", "Distancia")}
                value={`${Number(o.distance_miles).toFixed(1)} mi · ${o.distance_miles <= 3 ? t("FREE delivery", "entrega GRATIS") : formatCurrency(deliveryFee)}`}
                color={o.distance_miles <= 3 ? "emerald" : "sky"}
              />
            )}

            {/* ── Address ── */}
            {o.pickup_address && (
              <Section icon={<MapPin className="w-4 h-4" />} title={t("Address", "Dirección")}>
                <DataRow label={t("Pickup address", "Dirección de recogida")} value={o.pickup_address} />
                {o.gate_code && (
                  <div className="mt-2">
                    <p className="text-[10px] font-semibold tracking-widest text-slate-400 uppercase mb-1">{t("Gate code", "Código de entrada")}</p>
                    <span className="font-mono font-bold text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5 text-sm inline-block">
                      {o.gate_code}
                    </span>
                  </div>
                )}
              </Section>
            )}

            {/* ── Schedule ── */}
            {(o.pickup_date || o.pickup_time) && (
              <Section icon={<Calendar className="w-4 h-4" />} title={t("Schedule", "Horario")}>
                <div className="flex gap-6">
                  {o.pickup_date && (
                    <DataRow
                      label={t("Date", "Fecha")}
                      value={parseLocalDate(o.pickup_date)?.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    />
                  )}
                  {(o.pickup_time || o.pickup_time_window) && (
                    <DataRow label={t("Time", "Hora")} value={o.pickup_time || o.pickup_time_window} />
                  )}
                </div>
              </Section>
            )}

            {/* ── Notes ── */}
            {o.notes && (
              <Section icon={<StickyNote className="w-4 h-4" />} title={t("Notes / Instructions", "Notas / Instrucciones")}>
                <ul className="space-y-1.5 list-disc pl-5 text-sm text-slate-700">
                  {o.notes
                    .split(/(?=- [A-Z])|(?<=[a-z]): /)
                    .map(item => item.trim())
                    .filter(item => item.length > 0)
                    .map((item, i) => (
                      <li key={i} className="leading-relaxed">{item.replace(/^- /, "")}</li>
                    ))}
                </ul>
              </Section>
            )}

            {/* ── Customer preferences ── */}
            {o.preferences_snapshot && (
              <Section
                icon={<User className="w-4 h-4" />}
                title={t("Customer preferences", "Preferencias del cliente")}
                collapsible defaultOpen={false}
              >
                <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                  {Object.entries(o.preferences_snapshot)
                    .filter(([k]) => !["id", "version", "customer_id"].includes(k))
                    .map(([k, v]) => (
                      <DataRow key={k} label={k.replace(/_/g, " ")} value={String(v || "—")} />
                    ))}
                </div>
              </Section>
            )}

            {/* ── RECURRENCE INFORMATION (NEW) ── */}
            <RecurrenceInfo order={o} t={t} locale={locale} />

            {/* ── Receipts ── */}
            <Section
              icon={<ImageIcon className="w-4 h-4" />}
              title={t("Receipts", "Comprobantes")}
              badge={verifiedReceipts.length > 0 ? (
                <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
                  <CheckCircle2 className="w-3 h-3" />{verifiedReceipts.length}
                </span>
              ) : null}
            >
              <div className="space-y-3">
                {receiptsLoading ? (
                  <div className="py-6 text-center text-slate-400 text-xs">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-1" />
                    {t("Loading...", "Cargando...")}
                  </div>
                ) : receipts.length === 0 ? (
                  <div className="py-6 text-center text-slate-400 text-xs">
                    <ImageIcon className="w-8 h-8 opacity-20 mx-auto mb-1" />
                    {t("No receipts", "Sin comprobantes")}
                  </div>
                ) : (
                  receipts.map(r => (
                    <ReceiptCard key={r.id} receipt={r} onValidate={handleValidateReceipt} validating={validatingId} />
                  ))
                )}
                <button
                  onClick={() => loadReceipts(o.id)}
                  className="w-full py-1.5 text-[11px] text-slate-400 hover:text-slate-600 flex items-center justify-center gap-1"
                >
                  <RefreshCw className="w-3 h-3" />{t("Refresh", "Actualizar")}
                </button>
              </div>
            </Section>

            {/* ── Add-ons ── */}
            <Section
              icon={<Package className="w-4 h-4" />}
              title={t("Individual Items / Add-ons", "Artículos / Extras")}
              collapsible defaultOpen={true}
              badge={
                <span className="text-[11px] font-bold text-sky-600 bg-sky-50 border border-sky-200 rounded-full px-2 py-0.5">
                  {addons.reduce((s, a) => s + (a.qty || 1), 0)} — {formatCurrency(addonTotal)}
                </span>
              }
            >
              <div className="space-y-4">
                {/* Current add-ons */}
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">{t("Saved items", "Artículos guardados")}</p>
                  {addons.length === 0 ? (
                    <div className="rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-xs text-slate-400 flex items-center gap-2">
                      <Info className="w-3.5 h-3.5 shrink-0" />
                      {t("No add-ons saved yet. Add items below.", "Aún no hay extras guardados.")}
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {Object.entries(groupedAddons).map(([cat, items]) => (
                        <div key={cat} className="mb-3 last:mb-0">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5 ml-1">{catLabel(cat)}</p>
                          {items.map(a => (
                            <div key={a.id} className="flex items-center justify-between bg-sky-50 border border-sky-100 rounded-xl px-3 py-2.5 mb-1.5 last:mb-0">
                              <span className="text-sm text-slate-700 font-medium">
                                {a.name}{a.qty > 1 && <span className="ml-1 text-sky-500 font-bold">×{a.qty}</span>}
                              </span>
                              <div className="flex items-center gap-2">
                                <div className="flex items-center gap-1">
                                  <button onClick={() => handleUpdateAddonQty(a.id, (a.qty||1)-1)} className="w-6 h-6 rounded-lg text-slate-400 hover:text-sky-600 hover:bg-sky-100 flex items-center justify-center"><Minus className="w-3 h-3" /></button>
                                  <span className="w-6 text-center text-xs font-bold">{a.qty||1}</span>
                                  <button onClick={() => handleUpdateAddonQty(a.id, (a.qty||1)+1)} className="w-6 h-6 rounded-lg text-slate-400 hover:text-sky-600 hover:bg-sky-100 flex items-center justify-center"><Plus className="w-3 h-3" /></button>
                                </div>
                                <span className="text-sm font-bold text-slate-800 min-w-[60px] text-right">{formatCurrency((a.price||0)*(a.qty||1))}</span>
                                <button onClick={() => setAddons(prev => prev.filter(x => x.id !== a.id))} className="w-6 h-6 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50 flex items-center justify-center"><Trash2 className="w-3.5 h-3.5" /></button>
                              </div>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2 mt-3">
                    <Button size="sm" onClick={handleSaveAddons} disabled={savingAddons} className="flex-1 h-9 bg-sky-600 hover:bg-sky-700 text-xs rounded-xl">
                      {savingAddons && <RefreshCw className="w-3 h-3 animate-spin mr-1" />}
                      {t("Save Add-ons", "Guardar Extras")}
                    </Button>
                    <Button size="sm" variant="outline" onClick={handleClearAllAddons} disabled={savingAddons||addons.length===0} className="flex-1 h-9 border-red-300 text-red-600 hover:bg-red-50 text-xs rounded-xl">
                      <Trash2 className="w-3.5 h-3.5 mr-1" />{t("Clear All", "Limpiar Todo")}
                    </Button>
                  </div>
                </div>

                {/* Catalog */}
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">{t("Add available items", "Agregar artículos disponibles")}</p>
                  <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
                    {Object.entries(groupedCatalog).map(([cat, items]) => (
                      <div key={cat}>
                        <p className="text-[10px] font-semibold text-slate-500 mb-1.5">{catLabel(cat)}</p>
                        <div className="grid grid-cols-2 gap-1.5">
                          {items.map(item => {
                            const ex = addons.find(a => a.id === item.id);
                            const qty = ex?.qty || 0;
                            return (
                              <div key={item.id} className="flex items-center justify-between border border-slate-100 rounded-xl px-2 py-1.5 bg-white hover:border-sky-200 transition-colors">
                                <div className="min-w-0 flex-1 mr-1">
                                  <p className="text-[11px] text-slate-700 truncate">{item.name}</p>
                                  <p className="text-[10px] text-slate-400">{formatCurrency(item.price)}</p>
                                </div>
                                <div className="flex items-center gap-0.5 shrink-0">
                                  {qty > 0 && (
                                    <>
                                      <button onClick={() => handleUpdateAddonQty(item.id, qty-1)} className="w-5 h-5 rounded text-slate-400 hover:text-sky-600 flex items-center justify-center"><Minus className="w-2.5 h-2.5" /></button>
                                      <span className="w-4 text-center text-[10px] font-bold">{qty}</span>
                                    </>
                                  )}
                                  <button onClick={() => handleAddAddon(item)} className="w-5 h-5 rounded text-slate-400 hover:text-sky-600 flex items-center justify-center"><Plus className="w-2.5 h-2.5" /></button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </Section>

            {/* ── Evidence images ── */}
            {renderEvidenceSection()}

            {/* ── Weight & Total ── */}
            <Section icon={<Scale className="w-4 h-4" />} title={t("Weight & Total", "Peso y Total")}>
              <div className="space-y-4">
                <div>
                  <Label className="text-[10px] font-semibold tracking-widest text-slate-400 uppercase mb-1.5 block">
                    {t("Actual Lbs", "Libras reales")}
                  </Label>
                  {o.weight_image_data && (
                    <div className="flex items-center gap-2 mb-2 px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-700 font-medium">
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                      {t("Weight photo on file", "Foto de peso registrada")}
                    </div>
                  )}
                  <div className="flex items-end gap-2">
                    <Input
                      type="number" step="0.1" min="0" placeholder="0.0"
                      value={lbs}
                      onChange={e => setLbs(e.target.value)}
                      className="flex-1 h-10 text-sm rounded-xl border-slate-200 focus:border-sky-400 focus:ring-sky-200"
                    />
                    <Button
                      size="sm"
                      onClick={handleSetLbsClick}
                      disabled={saving || !lbs || Number(lbs) <= 0}
                      className="h-10 px-4 bg-sky-600 hover:bg-sky-700 rounded-xl font-semibold gap-1.5 whitespace-nowrap"
                    >
                      {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <><Scale className="w-3.5 h-3.5" />{t("Set lbs", "Set lbs")}</>}
                    </Button>
                    <Button size="sm" variant="outline" onClick={handleClearLbs} disabled={saving}
                      className="h-10 px-3 border border-slate-300 rounded-xl text-slate-500 hover:text-red-500 hover:border-red-300 bg-white">
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1.5">
                    {t("\"Set lbs\" will open camera for the scale photo before saving.", "\"Set lbs\" abrirá la cámara para la foto de báscula antes de guardar.")}
                  </p>
                </div>

                <BillingBreakdown
                  order={o}
                  t={t}
                  hasMembership={hasMembership}
                  customerCycleUsage={customerCycleUsage}
                />

                {/* Payment status row */}
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-widest">{t("Payment", "Pago")}</span>
                  <span className={`text-xs font-bold px-3 py-1.5 rounded-full border ${isPaid ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-red-50 text-red-600 border-red-200"}`}>
                    {isPaid ? t("Paid", "Pagado") : t("Unpaid", "Sin pagar")}
                  </span>
                </div>

                {/* Covered by membership badge */}
                {!isPaid && o.membership_plan && Number(o.extra_charge || 0) <= 0.50 && (
                  <div className="flex items-center gap-2 px-3.5 py-2.5 bg-emerald-50 border border-emerald-200 rounded-xl">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span className="text-xs font-semibold text-emerald-700">{t("Covered by membership", "Cubierto por membresía")}</span>
                  </div>
                )}

                {/* Payment panel */}
                {!isPaid && Number(dynamicTotal) > 0.50 && (
                  <div className="space-y-4 border border-sky-200 bg-sky-50/40 rounded-2xl p-4">
                    <div>
                      <p className="text-[10px] font-bold tracking-widest text-slate-400 uppercase mb-2.5">{t("Payment method", "Método de pago")}</p>
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { val: "zelle",   label: "Zelle",               icon: <Send       className="w-4 h-4" /> },
                          { val: "venmo",   label: "Venmo",               icon: <Send       className="w-4 h-4" /> },
                          { val: "cashapp", label: "CashApp",             icon: <DollarSign className="w-4 h-4" /> },
                          { val: "card",    label: "Stripe",              icon: <CreditCard className="w-4 h-4" /> },
                          { val: "cash",    label: t("Cash","Efectivo"),  icon: <Banknote   className="w-4 h-4" /> },
                          { val: "other",   label: t("Other","Otro"),     icon: <DollarSign className="w-4 h-4" /> },
                        ].map(m => (
                          <PayMethodBtn key={m.val} label={m.label} icon={m.icon} active={payMethod === m.val}
                            onClick={() => { setPayMethod(m.val); setAmtReceived(""); }} />
                        ))}
                      </div>
                    </div>

                    {["zelle","venmo","cashapp"].includes(payMethod) && (
                      <div className="bg-white border border-amber-200 rounded-xl p-3.5 text-xs text-amber-800 space-y-1">
                        <p className="font-bold">{payMethod === "zelle" ? "Zelle" : payMethod === "venmo" ? "Venmo" : "Cash App"} Instructions:</p>
                        <p>Send to: <strong>{payMethod==="zelle" ? "payments@venturafreshlaundry.com" : payMethod==="venmo" ? "@VFLaundry" : "$VFLaundry"}</strong></p>
                        <p>Note: Order <strong>{formatOrderNumber(o)}</strong></p>
                      </div>
                    )}

                    {payMethod === "cash" && (
                      <div>
                        <Label className="text-[10px] font-bold text-slate-400 uppercase">{t("Amount received", "Monto recibido")}</Label>
                        <Input type="number" step="0.01" min={dynamicTotal} placeholder={`$${dynamicTotal.toFixed(2)}`}
                          value={amtReceived} onChange={e => setAmtReceived(e.target.value)} className="mt-1.5 h-10 rounded-xl" />
                      </div>
                    )}

                    <Button className="w-full h-11 bg-emerald-600 hover:bg-emerald-700 rounded-xl font-bold shadow-md"
                      onClick={handlePayment} disabled={processing || dynamicTotal <= 0}>
                      {processing ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : <DollarSign className="w-4 h-4 mr-2" />}
                      {payMethod === "card"
                        ? t("Pay Stripe / Tap", "Pagar Stripe / Tap")
                        : `${t("Register payment", "Registrar pago")} — ${formatCurrency(dynamicTotal)}`}
                    </Button>
                  </div>
                )}
              </div>
            </Section>

            {/* ── Actions bar ── */}
            <div className="flex flex-wrap items-center gap-2 pt-1 pb-2">
              <Button variant="outline" size="sm" className="text-xs gap-1.5 h-9 rounded-xl" onClick={handlePrintTicket}>
                <Printer className="w-3.5 h-3.5" />{t("Print", "Imprimir")}
              </Button>
              <Button variant="outline" size="sm" className="text-xs gap-1.5 h-9 rounded-xl" onClick={handleDownloadPDF}>
                <FileDown className="w-3.5 h-3.5" />PDF
              </Button>
              <div className="flex items-center gap-1.5 ml-auto">
                <select value={notifyChannel} onChange={e => setNotifyChannel(e.target.value)}
                  className="h-9 text-xs border border-slate-200 rounded-xl px-2.5 bg-white">
                  <option value="sms">SMS</option>
                  <option value="email">Email</option>
                  <option value="call">Llamada</option>
                  <option value="whatsapp">WhatsApp</option>
                </select>
                <Button size="sm" className="h-9 gap-1.5 text-xs bg-sky-600 hover:bg-sky-700 rounded-xl"
                  onClick={handleSendNotification} disabled={notifySending}>
                  {notifySending ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                  {t("Notify", "Notificar")}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Image carousel ── */}
      <Dialog open={imageCarouselOpen} onOpenChange={() => setImageCarouselOpen(false)}>
        <DialogContent className="max-w-[90vw] w-auto p-0 bg-transparent border-none shadow-none">
          <div className="relative flex items-center justify-center">
            {imageList.length > 1 && (
              <button onClick={() => setCurrentImageIndex(prev => (prev-1+imageList.length)%imageList.length)}
                className="absolute left-4 z-10 bg-black/50 hover:bg-black/70 text-white rounded-full p-2 transition">
                <ChevronLeft className="w-6 h-6" />
              </button>
            )}
            <img src={imageList[currentImageIndex]?.url} alt={imageList[currentImageIndex]?.label}
              className="max-w-full max-h-[85vh] rounded-xl shadow-2xl" />
            {imageList.length > 1 && (
              <button onClick={() => setCurrentImageIndex(prev => (prev+1)%imageList.length)}
                className="absolute right-4 z-10 bg-black/50 hover:bg-black/70 text-white rounded-full p-2 transition">
                <ChevronRight className="w-6 h-6" />
              </button>
            )}
            <button onClick={() => setImageCarouselOpen(false)}
              className="absolute top-2 right-2 bg-black/50 text-white rounded-full p-1.5 hover:bg-black/70 transition">
              <X className="w-5 h-5" />
            </button>
            {imageList.length > 1 && (
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-black/50 text-white text-xs px-2 py-1 rounded-full">
                {currentImageIndex+1} / {imageList.length}
              </div>
            )}
            {imageList[currentImageIndex]?.label && (
              <div className="absolute bottom-2 left-2 bg-black/50 text-white text-xs px-2 py-1 rounded">
                {imageList[currentImageIndex].label}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Weight photo modal ── */}
      {order && (
        <PickupImageModal
          open={weightPhotoModal}
          order={{
            order_id:      order.id,
            order_number:  order.order_number || localOrder?.order_number,
            customer_name: order.customer_name || localOrder?.customer_name,
          }}
          pendingStatus="weight"
          onClose={() => setWeightPhotoModal(false)}
          onConfirm={handleWeightPhotoConfirm}
        />
      )}
    </>
  );
}