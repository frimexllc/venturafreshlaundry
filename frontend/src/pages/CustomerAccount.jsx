import { useState, useEffect, useRef, useCallback } from "react";
import ReactDOM from "react-dom";
import { useNavigate, Link } from "react-router-dom";
import customerAxios from "../api/customerAxios";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import {
  Mail, MapPin, Package, LogOut, Calendar, Clock,
  ArrowRight, Sparkles, ChevronDown, Settings, Heart, Award,
  CreditCard, Building2, DollarSign, ScanLine, X, Copy, CheckCircle,
  Phone, Edit3, Save, Camera, ExternalLink, Truck, RefreshCw,
  RotateCcw, Repeat, AlertCircle, Trash2, Key, ChevronUp,
  User, Shield, Star, Zap, ChevronRight, Info, Scale,
} from "lucide-react";
import PublicNav from "../components/PublicNav";
import PublicFooter from "../components/PublicFooter";
import { useLocale } from "../context/LocaleContext";
import AddressAutocomplete from "../components/AddressAutocomplete";
import BillingBreakdown from "../components/operator-dashboard/BillingBreakdown.jsx";
import MembershipCycleBar from "../components/operator-dashboard/MembershipCycleBar.jsx";  // ✅ Importado

// ─── Stripe ───────────────────────────────────────────────────────────────────
import { loadStripe } from "@stripe/stripe-js";
import { Elements, CardElement, useStripe, useElements } from "@stripe/react-stripe-js";

// ─── Importaciones desde utils (ruta corregida) ────────────────────────────
import {
  safeString, formatCurrency, formatOrderNumber,
  isWashFoldService, calcDeliveryFee,
} from "../components/operator-dashboard/utils";

// ─── Helpers ──────────────────────────────────────────────────────────────────
const parseLocalDate = (ds) => {
  if (!ds) return null;
  return ds.includes("T") ? new Date(ds) : new Date(ds + "T12:00:00");
};

// ─── Status configs ────────────────────────────────────────────────────────────
const STATUS_CFG = {
  new:              { en: "New",              es: "Nueva",      cls: "bg-blue-50 text-blue-600 border-blue-200/60",       dot: "#3b82f6" },
  confirmed:        { en: "Confirmed",        es: "Confirmada", cls: "bg-violet-50 text-violet-600 border-violet-200/60",  dot: "#7c3aed" },
  processing:       { en: "Processing",       es: "Procesando", cls: "bg-amber-50 text-amber-600 border-amber-200/60",    dot: "#d97706" },
  ready:            { en: "Ready",            es: "Lista",      cls: "bg-violet-50 text-violet-600 border-violet-200/60",  dot: "#7c3aed" },
  out_for_delivery: { en: "Out for Delivery", es: "En camino",  cls: "bg-orange-50 text-orange-600 border-orange-200/60", dot: "#ea580c" },
  delivered:        { en: "Delivered",        es: "Entregada",  cls: "bg-emerald-50 text-emerald-600 border-emerald-200/60", dot: "#059669" },
  completed:        { en: "Completed",        es: "Completada", cls: "bg-emerald-50 text-emerald-600 border-emerald-200/60", dot: "#059669" },
  cancelled:        { en: "Cancelled",        es: "Cancelada",  cls: "bg-red-50 text-red-600 border-red-200/60",          dot: "#dc2626" },
};

const RECURRENCE_LABELS = {
  once:       { en: "One time",      es: "Una sola vez" },
  weekly:     { en: "Every week",    es: "Cada semana" },
  biweekly:   { en: "Every 2 weeks", es: "Cada 2 semanas" },
  twice_week: { en: "Twice a week",  es: "Dos veces/semana" },
};

const SERVICE_ICONS = {
  pickup_delivery: "🚚",
  airbnb_host:     "🏠",
  commercial:      "🏢",
  wash_fold:       "🧺",
};

// ─── Hooks ─────────────────────────────────────────────────────────────────────
function useInView(threshold = 0.1) {
  const ref = useRef(null);
  const [v, setV] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setV(true); obs.disconnect(); } }, { threshold });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return [ref, v];
}

function useCursor() {
  const ring = useRef(null);
  const dot  = useRef(null);
  const p    = useRef({ x: -200, y: -200 });
  const l    = useRef({ x: -200, y: -200 });
  const raf  = useRef(null);
  useEffect(() => {
    const fn = (e) => { p.current = { x: e.clientX, y: e.clientY }; };
    window.addEventListener("mousemove", fn, { passive: true });
    const loop = () => {
      l.current.x += (p.current.x - l.current.x) * 0.1;
      l.current.y += (p.current.y - l.current.y) * 0.1;
      if (ring.current) ring.current.style.transform = `translate(${l.current.x - 18}px,${l.current.y - 18}px)`;
      if (dot.current)  dot.current.style.transform  = `translate(${p.current.x - 3}px,${p.current.y - 3}px)`;
      raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
    return () => { window.removeEventListener("mousemove", fn); cancelAnimationFrame(raf.current); };
  }, []);
  return { ring, dot };
}

// ─── UI primitives ─────────────────────────────────────────────────────────────
const ORIGINS = { up: "opacity-0 translate-y-8", left: "opacity-0 translate-x-6", right: "opacity-0 -translate-x-6", scale: "opacity-0 scale-95" };
const Reveal = ({ children, delay = 0, dir = "up", dur = 650, className = "" }) => {
  const [ref, v] = useInView();
  return (
    <div ref={ref} className={`${className} transition-all ease-out ${v ? "opacity-100 translate-y-0 translate-x-0 scale-100" : ORIGINS[dir]}`}
      style={{ transitionDuration: `${dur}ms`, transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  );
};

const inputCls = "w-full border border-slate-200 bg-white/80 rounded-xl px-4 py-3 text-sm text-slate-800 placeholder-slate-300 focus:outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100 transition-all duration-200 mt-1.5";
const Field = ({ label, children }) => (
  <div>
    <label className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-400">{label}</label>
    {children}
  </div>
);

// ─── Portal Modal ──────────────────────────────────────────────────────────────
const PortalModal = ({ onClose, children }) => {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);
  return ReactDOM.createPortal(
    <div onClick={onClose} style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, width: "100vw", height: "100vh", zIndex: 99999, display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem", background: "rgba(2,8,20,0.72)", backdropFilter: "blur(10px)", overflowY: "auto" }}>
      <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: "28rem", position: "relative" }}>
        {children}
      </div>
    </div>,
    document.body
  );
};

// ─── Glass Card ────────────────────────────────────────────────────────────────
const GlassCard = ({ children, className = "", accent = false, onClick }) => (
  <div onClick={onClick} className={`relative rounded-2xl border overflow-hidden transition-all duration-300 ${accent ? "border-sky-200/60 bg-gradient-to-br from-sky-50/80 to-white" : "border-slate-200/60 bg-white/90"} shadow-sm hover:shadow-md ${className}`}>
    {children}
  </div>
);

// ─── Section Header ────────────────────────────────────────────────────────────
const SectionHeader = ({ icon: Icon, title, subtitle, iconColor = "from-sky-400 to-sky-600", action }) => (
  <div className="px-6 py-5 flex items-center justify-between border-b border-slate-100/80">
    <div className="flex items-center gap-3.5">
      <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${iconColor} flex items-center justify-center shadow-sm flex-shrink-0`}>
        <Icon className="h-4 w-4 text-white" />
      </div>
      <div>
        <h2 className="font-bold text-slate-800 text-base leading-tight">{title}</h2>
        {subtitle && <p className="text-[11px] text-slate-400 mt-0.5">{subtitle}</p>}
      </div>
    </div>
    {action}
  </div>
);

// ─── Recurrence Badge ──────────────────────────────────────────────────────────
const RecurrenceBadge = ({ recurrence, locale }) => {
  if (!recurrence || recurrence === "once") return null;
  const info = RECURRENCE_LABELS[recurrence];
  if (!info) return null;
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border bg-sky-50 text-sky-600 border-sky-200">
      <Repeat className="w-2.5 h-2.5" />
      {locale === "es" ? info.es : info.en}
    </span>
  );
};

// ─── Preferences Skeleton ──────────────────────────────────────────────────────
const PreferencesSkeleton = () => (
  <div className="space-y-5 animate-pulse pt-5">
    {[1, 2, 3].map(i => (
      <div key={i} className="grid sm:grid-cols-3 gap-4">
        {[1, 2, 3].map(j => <div key={j} className="h-[72px] bg-slate-100 rounded-xl" />)}
      </div>
    ))}
  </div>
);

// ─── Order Notes Formatter ─────────────────────────────────────────────────────
function FormattedOrderNotes({ notes, t }) {
  if (!notes) return null;
  const lines = notes.split(/\n/).filter(l => l.trim());
  const hasKeyValue = lines.some(l => /^[^:]+:\s*.+/.test(l.trim()));
  if (hasKeyValue) {
    return (
      <ul className="list-disc list-inside text-sm text-slate-700 space-y-1">
        {lines.map((line, idx) => <li key={idx}>{line.trim()}</li>)}
      </ul>
    );
  }
  return <p className="text-sm text-slate-700 whitespace-pre-line">{notes}</p>;
}

// ─── Order Image Block ────────────────────────────────────────────────────────
function OrderImageBlock({ orderId, type, token, t }) {
  const [blobUrl, setBlobUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [noImage, setNoImage] = useState(false);

  const endpointMap = {
    pickup:   `/customer/order/${orderId}/pickup-image/view`,
    delivery: `/customer/order/${orderId}/delivery-image/view`,
    weight:   `/customer/order/${orderId}/weight-image/view`,
  };
  const endpoint = endpointMap[type] || endpointMap.pickup;

  useEffect(() => {
    let revoked = false;
    setLoading(true); setNoImage(false); setBlobUrl(null);
    customerAxios.get(endpoint, { responseType: 'blob' })
      .then(response => {
        if (!revoked) {
          const blob = new Blob([response.data], { type: response.headers['content-type'] || 'image/jpeg' });
          setBlobUrl(URL.createObjectURL(blob));
        }
      })
      .catch(() => { setNoImage(true); })
      .finally(() => { if (!revoked) setLoading(false); });
    return () => {
      revoked = true;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [orderId, type, endpoint]);

  const openFull = async () => {
    try {
      const response = await customerAxios.get(endpoint, { responseType: 'blob' });
      const blob = new Blob([response.data], { type: response.headers['content-type'] || 'image/jpeg' });
      const url = URL.createObjectURL(blob);
      const win = window.open(url, "_blank");
      if (win) setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch {}
  };

  const config = {
    pickup:   { Icon: Camera, title: t("Pickup Photo", "Foto de Recolección"),         bg: "bg-slate-50 border-slate-100",   header: "text-slate-500",   msg: t("Driver confirmed pickup",   "Conductor confirmó recolección") },
    delivery: { Icon: Truck,  title: t("Delivery Photo", "Foto de Entrega"),            bg: "bg-emerald-50 border-emerald-100", header: "text-emerald-700", msg: t("Driver confirmed delivery", "Conductor confirmó entrega") },
    weight:   { Icon: Scale,  title: t("Weight Proof Photo", "Foto de Evidencia de Peso"), bg: "bg-sky-50 border-sky-100",   header: "text-sky-700",     msg: t("Weight verified by staff",  "Peso verificado por personal") },
  };
  const cfg = config[type] || config.pickup;

  return (
    <div className={`rounded-xl p-4 border ${cfg.bg}`}>
      <h4 className={`text-xs font-bold uppercase tracking-wider mb-3 flex items-center gap-2 ${cfg.header}`}>
        <cfg.Icon className="w-3.5 h-3.5" />{cfg.title}
      </h4>
      {loading && <div className="flex items-center justify-center py-8"><div className="w-6 h-6 rounded-full border-2 border-slate-200 border-t-sky-500 animate-spin" /></div>}
      {!loading && noImage && (
        <div className="text-center py-6 text-slate-400">
          <cfg.Icon className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">{t("No photo yet", "Foto aún no disponible")}</p>
        </div>
      )}
      {!loading && blobUrl && (
        <div className="space-y-2">
          <div className="relative rounded-lg overflow-hidden bg-white border border-slate-200">
            <img src={blobUrl} alt={cfg.title} className="w-full h-auto max-h-72 object-contain cursor-pointer hover:opacity-90 transition-opacity" onClick={openFull} />
          </div>
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span className="flex items-center gap-1"><CheckCircle className="w-3.5 h-3.5 text-emerald-500" />{cfg.msg}</span>
            <button onClick={openFull} className="hover:underline flex items-center gap-1 text-sky-500">
              <ExternalLink className="w-3 h-3" />{t("Full size", "Tamaño completo")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Card Setup Modal inner ───────────────────────────────────────────────────
function CardSetupModalInner({ onClose, onSuccess, t }) {
  const stripe   = useStripe();
  const elements = useElements();
  const [saving, setSaving]       = useState(false);
  const [cardReady, setCardReady] = useState(false);
  const [cardError, setCardError] = useState("");

  const CARD_STYLE = {
    style: {
      base: { fontSize: "14px", color: "#1e293b", fontFamily: "'Inter', system-ui, sans-serif", "::placeholder": { color: "#94a3b8" } },
      invalid: { color: "#ef4444" },
    },
  };

  const handleSave = async () => {
    if (!stripe || !elements) return;
    setSaving(true); setCardError("");
    try {
      const siRes = await customerAxios.post("/customer/payments/setup-intent");
      const { client_secret } = siRes.data;
      const { error, setupIntent } = await stripe.confirmCardSetup(client_secret, {
        payment_method: { card: elements.getElement(CardElement) },
      });
      if (error) { setCardError(error.message); setSaving(false); return; }
      await customerAxios.post("/customer/payments/save-method", { payment_method_id: setupIntent.payment_method });
      toast.success(t("Card saved successfully!", "¡Tarjeta guardada exitosamente!"));
      onSuccess();
    } catch (err) {
      const msg = err.response?.data?.detail || t("Could not save card", "No se pudo guardar la tarjeta");
      setCardError(typeof msg === "string" ? msg : JSON.stringify(msg));
      setSaving(false);
    }
  };

  return (
    <PortalModal onClose={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
        <div className="bg-gradient-to-r from-sky-600 to-blue-600 px-6 py-5 flex items-center justify-between">
          <div>
            <h3 className="text-white font-black text-lg">{t("Save a payment method", "Guarda un método de pago")}</h3>
            <p className="text-white/70 text-xs mt-0.5">{t("Charged automatically when weight is confirmed", "Se cobra al confirmar el peso de tu orden")}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center transition-all">
            <X className="w-4 h-4 text-white" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-center gap-5 text-[11px] text-slate-400 font-semibold">
            <span className="flex items-center gap-1"><Shield className="w-3.5 h-3.5 text-emerald-500" /> SSL Encrypted</span>
            <span className="flex items-center gap-1"><Shield className="w-3.5 h-3.5 text-emerald-500" /> Stripe Secured</span>
          </div>
          <div>
            <label className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-400 mb-1.5 block">{t("Card details", "Datos de la tarjeta")}</label>
            <div className={`border rounded-xl px-4 py-3.5 bg-white transition-all ${cardError ? "border-red-300 ring-2 ring-red-100" : "border-slate-200 focus-within:border-sky-400 focus-within:ring-2 focus-within:ring-sky-100"}`}>
              <CardElement options={CARD_STYLE} onChange={e => { setCardReady(e.complete); setCardError(e.error?.message || ""); }} />
            </div>
            {cardError && <p className="flex items-center gap-1 text-xs text-red-500 mt-1.5"><AlertCircle className="w-3 h-3" /> {cardError}</p>}
          </div>
          <div className="bg-sky-50 border border-sky-100 rounded-xl p-3.5">
            <p className="text-[11px] text-sky-700 leading-relaxed">
              💡 {t("When the operator weighs your order, the exact amount will be charged automatically to this card.", "Cuando el operador pese tu orden, el monto exacto se cobrará automáticamente a esta tarjeta.")}
            </p>
          </div>
          <button onClick={handleSave} disabled={saving || !cardReady || !stripe}
            className="w-full flex items-center justify-center gap-2 py-3 text-sm font-bold rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95 hover:shadow-md">
            {saving ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />{t("Saving…", "Guardando…")}</> : <><CreditCard className="w-4 h-4" />{t("Save card", "Guardar tarjeta")}</>}
          </button>
          <button onClick={onClose} className="w-full text-xs text-slate-400 font-semibold hover:text-slate-600 transition-colors text-center py-1">
            {t("Skip for now", "Omitir por ahora")}
          </button>
        </div>
      </div>
    </PortalModal>
  );
}

function CardSetupModal({ stripePromise, onClose, onSuccess, t }) {
  if (!stripePromise) return null;
  return (
    <Elements stripe={stripePromise}>
      <CardSetupModalInner onClose={onClose} onSuccess={onSuccess} t={t} />
    </Elements>
  );
}

// ─── Payment Modal ────────────────────────────────────────────────────────────
function PaymentModal({ method, order, onClose, onReceiptUpload, uploadingReceipt, paymentInfo, amount: baseAmount, onPaymentMarked }) {
  const [copied, setCopied] = useState(null);
  if (!method || !order) return null;

  const amount = (baseAmount ?? order.extra_charge ?? order.total_amount ?? 0).toFixed(2);
  const orderNum = order.order_number || order.id;
  const info = paymentInfo || {};

  const copy = (text, key) => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };
  const CopyBtn = ({ value, label }) => (
    <button onClick={() => copy(value, label)} className="ml-2 text-slate-400 hover:text-sky-500 transition-colors flex-shrink-0">
      {copied === label ? <CheckCircle className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
    </button>
  );
  const Row = ({ emoji, label, value, copyKey }) => (
    <div className="flex items-center justify-between py-3 border-b border-slate-100 last:border-0">
      <span className="text-sm text-slate-500 font-medium">{emoji} {label}</span>
      <div className="flex items-center gap-1">
        <span className="text-sm font-bold text-slate-800">{value}</span>
        {copyKey && <CopyBtn value={value} label={copyKey} />}
      </div>
    </div>
  );

  const configs = {
    zelle:   { title: "💙 Zelle® Payment",    color: "from-purple-600 to-indigo-600", rows: [{ emoji:"💰",label:"Amount",value:`$${amount}`,copyKey:"amount" },{ emoji:"📱",label:"Phone",value:info.zelle_phone||PAYMENT_DEFAULTS.zelle.phone,copyKey:"phone" },{ emoji:"🔗",label:"Handle",value:info.zelle_handle||PAYMENT_DEFAULTS.zelle.handle,copyKey:"handle" },{ emoji:"📝",label:"Note",value:`Order #${orderNum}`,copyKey:"note" }] },
    venmo:   { title: "💜 Pay with Venmo",    color: "from-blue-600 to-sky-500",     rows: [{ emoji:"💰",label:"Amount",value:`$${amount}`,copyKey:"amount" },{ emoji:"📱",label:"Phone",value:info.zelle_phone||PAYMENT_DEFAULTS.venmo.phone,copyKey:"phone" },{ emoji:"🔗",label:"Handle",value:info.venmo_handle||PAYMENT_DEFAULTS.venmo.handle,copyKey:"handle" },{ emoji:"📝",label:"Note",value:`Order #${orderNum}`,copyKey:"note" }] },
    cashapp: { title: "💚 Pay with Cash App", color: "from-green-600 to-emerald-500",rows: [{ emoji:"💰",label:"Amount",value:`$${amount}`,copyKey:"amount" },{ emoji:"💲",label:"$Cashtag",value:info.cashapp_tag||PAYMENT_DEFAULTS.cashapp.tag,copyKey:"tag" },{ emoji:"📱",label:"Phone",value:info.zelle_phone||PAYMENT_DEFAULTS.cashapp.phone,copyKey:"phone" },{ emoji:"📝",label:"Note",value:`Order #${orderNum}`,copyKey:"note" }] },
  };
  const cfg = configs[method];

  const handleMarkPayment = async () => {
    try {
      await customerAxios.post(`/customer/order/${order.id}/mark-zelle?method=${method}`);
      toast.success("Payment marked as sent — awaiting verification");
      onClose();
      if (onPaymentMarked) onPaymentMarked();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Error marking payment");
    }
  };

  return (
    <PortalModal onClose={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
        <div className={`bg-gradient-to-r ${cfg.color} px-6 py-5 flex items-center justify-between`}>
          <div>
            <h3 className="text-white font-black text-lg">{cfg.title}</h3>
            <p className="text-white/70 text-xs mt-0.5">Amount: ${amount} · Order #{orderNum}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center transition-all">
            <X className="w-4 h-4 text-white" />
          </button>
        </div>
        <div className="px-6 py-4">
          {cfg.rows.map((r, i) => <Row key={i} emoji={r.emoji} label={r.label} value={r.value} copyKey={r.copyKey} />)}
        </div>
        <div className="px-6 pb-6 space-y-3">
          <button onClick={handleMarkPayment} className={`w-full py-3 rounded-xl text-white font-bold text-sm bg-gradient-to-r ${cfg.color} hover:brightness-110 transition-all active:scale-95`}>
            ✅ I've sent the payment
          </button>
          <button
            onClick={() => { onClose(); onReceiptUpload(order.id, amount, method); }}
            disabled={uploadingReceipt?.orderId === order.id}
            className="w-full py-3 rounded-xl text-indigo-700 font-bold text-sm border-2 border-indigo-200 bg-indigo-50 hover:bg-indigo-100 transition-all flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50">
            {uploadingReceipt?.orderId === order.id ? <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" /> : <ScanLine className="w-4 h-4" />}
            📤 Upload receipt for instant verification
          </button>
          <p className="text-center text-[11px] text-slate-400">After sending, tap "I've sent the payment" or upload your receipt for faster verification.</p>
        </div>
      </div>
    </PortalModal>
  );
}

// ─── Recurrence Manager ───────────────────────────────────────────────────────
const RecurrenceManager = ({ order, t, locale, onUpdate }) => {
  const [open, setOpen]                     = useState(false);
  const [data, setData]                     = useState(null);
  const [loading, setLoading]               = useState(false);
  const [saving, setSaving]                 = useState(false);
  const [editRecurrence, setEditRecurrence] = useState(order.recurrence || "once");
  const [editDays, setEditDays]             = useState(order.recurrence_days || []);
  const [editEndDate, setEditEndDate]       = useState(order.recurrence_end_date || "");
  const [cancelFuture, setCancelFuture]     = useState(false);
  const [confirmCancel, setConfirmCancel]   = useState(false);
  const [daysWarning, setDaysWarning]       = useState("");

  const WEEKDAYS = [
    { key: "Monday",    label: { en: "Mon", es: "Lun" } },
    { key: "Tuesday",   label: { en: "Tue", es: "Mar" } },
    { key: "Wednesday", label: { en: "Wed", es: "Mié" } },
    { key: "Thursday",  label: { en: "Thu", es: "Jue" } },
    { key: "Friday",    label: { en: "Fri", es: "Vie" } },
    { key: "Saturday",  label: { en: "Sat", es: "Sáb" } },
    { key: "Sunday",    label: { en: "Sun", es: "Dom" } },
  ];

  const fetchRecurrence = async () => {
    setLoading(true);
    try {
      const res = await customerAxios.get(`/customer/orders/${order.id}/recurrence`);
      setData(res.data);
      setEditRecurrence(res.data.recurrence || "once");
      setEditDays(res.data.recurrence_days || []);
      setEditEndDate(res.data.recurrence_end_date || "");
    } catch {
      setData({ is_recurring: order.is_recurring, recurrence: order.recurrence || "once", recurrence_days: order.recurrence_days || [], recurrence_end_date: order.recurrence_end_date, upcoming_pickups: [] });
    } finally { setLoading(false); }
  };

  const handleOpen = () => { setOpen(true); fetchRecurrence(); };

  const toggleDay = (dayKey) => {
    let newDays;
    if (editDays.includes(dayKey)) {
      newDays = editDays.filter(d => d !== dayKey);
    } else {
      if (editDays.length >= 2) { setDaysWarning(t("You can only select up to 2 days", "Solo puedes seleccionar hasta 2 días")); return; }
      newDays = [...editDays, dayKey];
    }
    setEditDays(newDays); setDaysWarning("");
  };

  const handleSave = async () => {
    if (editRecurrence === "twice_week" && editDays.length !== 2) { setDaysWarning(t("Please select exactly two days", "Selecciona exactamente dos días")); return; }
    setSaving(true);
    try {
      const payload = { recurrence: editRecurrence, recurrence_end_date: editEndDate || null, cancel_future: cancelFuture };
      if (editRecurrence === "twice_week") payload.recurrence_days = editDays;
      await customerAxios.patch(`/customer/orders/${order.id}/recurrence`, payload);
      toast.success(t("Recurrence updated!", "¡Frecuencia actualizada!"));
      setOpen(false); onUpdate?.();
    } catch (err) { toast.error(err.response?.data?.detail || t("Could not update recurrence", "No se pudo actualizar la frecuencia")); }
    finally { setSaving(false); }
  };

  const handleCancelAll = async () => {
    setSaving(true);
    try {
      await customerAxios.patch(`/customer/orders/${order.id}/recurrence`, { recurrence: "once", cancel_future: true });
      toast.success(t("Recurring schedule cancelled", "Programación recurrente cancelada"));
      setOpen(false); setConfirmCancel(false); onUpdate?.();
    } catch (err) { toast.error(err.response?.data?.detail || t("Could not cancel", "No se pudo cancelar")); }
    finally { setSaving(false); }
  };

  if (!order.is_recurring && order.recurrence === "once") return null;

  const recurrenceOptions = [
    { key: "once",       icon: "1️⃣", label: { en: "One time",     es: "Una sola vez" } },
    { key: "weekly",     icon: "📅", label: { en: "Every week",    es: "Cada semana" } },
    { key: "biweekly",   icon: "📆", label: { en: "Every 2 weeks", es: "Cada 2 semanas" } },
    { key: "twice_week", icon: "🔄", label: { en: "Twice a week",  es: "Dos veces por semana" } },
  ];

  return (
    <>
      <button onClick={handleOpen} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-sky-50 border border-sky-200 text-sky-600 hover:bg-sky-100 transition-all">
        <Repeat className="w-3 h-3" />{t("Manage schedule", "Gestionar horario")}
      </button>
      {open && (
        <PortalModal onClose={() => setOpen(false)}>
          <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
            <div className="bg-gradient-to-br from-sky-600 to-blue-600 px-6 py-6 flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center"><Repeat className="w-4 h-4 text-white" /></div>
                <div>
                  <h3 className="text-white font-black text-lg">{t("Recurring Schedule", "Programación Recurrente")}</h3>
                  <p className="text-white/60 text-xs font-mono">{order.order_number}</p>
                </div>
              </div>
              <button onClick={() => setOpen(false)} className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center"><X className="w-4 h-4 text-white" /></button>
            </div>
            <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
              {loading ? (
                <div className="flex flex-col items-center justify-center py-10 gap-3">
                  <div className="w-8 h-8 border-2 border-sky-200 border-t-sky-500 rounded-full animate-spin" />
                  <p className="text-xs text-slate-400">{t("Loading…", "Cargando…")}</p>
                </div>
              ) : (
                <>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2.5">{t("Change frequency", "Cambiar frecuencia")}</p>
                    <div className="grid grid-cols-2 gap-2">
                      {recurrenceOptions.map(opt => (
                        <button key={opt.key} type="button" onClick={() => setEditRecurrence(opt.key)}
                          className={`flex items-center gap-2.5 p-3 rounded-xl border text-sm font-semibold transition-all ${editRecurrence === opt.key ? "border-sky-400 bg-sky-50 text-sky-700 shadow-sm" : "border-slate-200 text-slate-600 hover:border-sky-200"}`}>
                          <span className="text-base">{opt.icon}</span>
                          <span className="text-xs">{locale === "es" ? opt.label.es : opt.label.en}</span>
                          {editRecurrence === opt.key && <CheckCircle className="w-3.5 h-3.5 ml-auto text-sky-500" />}
                        </button>
                      ))}
                    </div>
                  </div>
                  {editRecurrence === "twice_week" && (
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2">{t("Select two days for pickup", "Selecciona dos días para la recogida")}</p>
                      <div className="grid grid-cols-2 gap-2">
                        {WEEKDAYS.map(day => (
                          <button key={day.key} type="button" onClick={() => toggleDay(day.key)}
                            className={`px-3.5 py-2 rounded-xl text-xs font-bold uppercase border transition-all ${editDays.includes(day.key) ? "border-sky-400 bg-sky-50 text-sky-600" : "border-slate-200 text-slate-500"}`}>
                            {locale === "es" ? day.label.es : day.label.en}
                          </button>
                        ))}
                      </div>
                      {daysWarning && <p className="text-[11px] text-red-600 mt-2 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{daysWarning}</p>}
                    </div>
                  )}
                  {editRecurrence !== "once" && (
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">{t("End date (optional)", "Fecha final (opcional)")}</label>
                      <input type="date" value={editEndDate} onChange={e => setEditEndDate(e.target.value)} min={new Date().toISOString().split("T")[0]}
                        className="mt-1.5 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-sky-400 transition-all" />
                    </div>
                  )}
                  <div className="flex gap-2.5 pt-1">
                    <button onClick={handleSave} disabled={saving}
                      className="flex-1 bg-sky-600 hover:bg-sky-700 text-white rounded-xl py-3 text-sm font-bold transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                      {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Save className="w-4 h-4" />}
                      {t("Save changes", "Guardar cambios")}
                    </button>
                    {(data?.is_recurring || order.is_recurring) && (
                      <button onClick={() => setConfirmCancel(true)} className="px-4 rounded-xl border border-red-200 text-red-500 hover:bg-red-50 font-semibold transition-all">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  {confirmCancel && (
                    <div className="p-4 rounded-xl bg-red-50 border border-red-200">
                      <p className="text-sm font-bold text-red-700 mb-3">{t("Cancel all future pickups?", "¿Cancelar todos los pickups futuros?")}</p>
                      <div className="flex gap-2">
                        <button onClick={handleCancelAll} disabled={saving} className="flex-1 bg-red-600 text-white rounded-xl py-2.5 text-sm font-bold disabled:opacity-50">{t("Yes, cancel all", "Sí, cancelar todos")}</button>
                        <button onClick={() => setConfirmCancel(false)} className="flex-1 border border-slate-200 rounded-xl py-2.5 text-sm font-semibold text-slate-600">{t("Keep", "Mantener")}</button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </PortalModal>
      )}
    </>
  );
};

// ═════════════════════════════════════════════════════════════════════════════
// ORDER DETAIL COMPONENT - USA VALORES DEL BACKEND
// ═════════════════════════════════════════════════════════════════════════════
function OrderDetail({ order, hasMembership, customerToken, t, isOrderCoveredByMembership, canShowPaymentButtons, isPendingVerification, handlePayStripe, payingOrderId, setPaymentModal, handleUploadReceipt, uploadingReceipt }) {
  const PICKUP_STATUSES   = ["picked_up","processing","ready","out_for_delivery","delivered","completed"];
  const DELIVERY_STATUSES = ["delivered","completed"];
  const hasWeightPhoto    = (o) => Boolean(o.weight_lbs || o.actual_lbs || o.weight_image_id);
  
  const lbs         = Number(order.actual_lbs || 0);
  
  // ★ VALORES DEL BACKEND (calculados correctamente en utils.py) - USAR ESTOS ★
  const lbsCovered  = Number(order.lbs_from_allowance || 0);
  const lbsExtra    = Number(order.extra_lbs_billed || 0);
  const discount    = Number(order.membership_discount || 0);
  const extraCharge = Number(order.extra_charge || 0);
  const totalAmount = Number(order.total_amount || 0);
  const plan        = (order.service_plan || "standard").toLowerCase();
  const isExpress   = plan === "express";
  
  // Tarifas (solo para visualización en breakdown)
  const regularRate = {
    standard: 2.75,
    premium: 3.00,
    express: 3.25
  }[plan] || 2.75;
  
  const memberRate = {
    standard: 2.50,
    premium: 2.75,
    express: 3.00
  }[plan] || 2.50;
  
  // Si NO es miembro, usar tarifa regular
  const rate = hasMembership ? memberRate : regularRate;
  
  const delivery = order.delivery_fee || 0;
  
  // ★ EL MONTO SIN FEE ES EL QUE ENVÍA EL BACKEND ★
  const amountWithoutFee = extraCharge > 0 ? extraCharge : (lbs * rate);
  
  // Total sin fee de tarjeta
  const totalWithoutCardFee = amountWithoutFee + delivery;
  
  const allowance = order.membership_plan ? (order.lbs_from_allowance || 0) : 0;

  return (
    <div className="mt-4 pt-4 border-t border-slate-100 space-y-3">
      {/* Pickup info */}
      {order.pickup_address && (
        <div className="bg-slate-50 rounded-xl p-4">
          <h4 className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2.5 flex items-center gap-2">
            <MapPin className="w-3 h-3" />{t("Pickup", "Recogida")}
          </h4>
          <div className="grid sm:grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-slate-400 text-xs mb-0.5">{t("Address", "Dirección")}</p>
              <p className="font-medium text-slate-700">{order.pickup_address}</p>
            </div>
            {order.pickup_date && (
              <div>
                <p className="text-slate-400 text-xs mb-0.5">{t("Date & Time", "Fecha y Hora")}</p>
                <p className="font-medium text-slate-700">
                  {parseLocalDate(order.pickup_date).toLocaleDateString("en-US", { dateStyle: "medium" })}
                  {order.pickup_time_window && ` · ${order.pickup_time_window}`}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Billing detail */}
      {lbs > 0 && (
        <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
          <h4 className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-1.5">
            <DollarSign className="w-3 h-3" />{t("Billing Breakdown", "Desglose de cobro")}
          </h4>
          
          {isExpress && hasMembership && (
            <div className="flex items-center gap-2 mb-2 px-2.5 py-2 rounded-lg bg-amber-50 border border-amber-200">
              <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              <p className="text-[11px] text-amber-700 font-medium">
                {t("Express service: membership allowance not applied.", "Servicio express: allowance de membresía no aplica.")}
              </p>
            </div>
          )}

          <BillingBreakdown 
            order={order} 
            t={t} 
            hasMembership={hasMembership} 
          />
        </div>
      )}

      {/* Fotos */}
      {PICKUP_STATUSES.includes(order.status) && customerToken && (
        <OrderImageBlock key={`pickup-${order.id}`} orderId={order.id} type="pickup" token={customerToken} t={t} />
      )}
      {hasWeightPhoto(order) && customerToken && (
        <OrderImageBlock key={`weight-${order.id}`} orderId={order.id} type="weight" token={customerToken} t={t} />
      )}
      {DELIVERY_STATUSES.includes(order.status) && customerToken && (
        <OrderImageBlock key={`delivery-${order.id}`} orderId={order.id} type="delivery" token={customerToken} t={t} />
      )}

      {/* Delivery info */}
      {order.delivery_address && order.delivery_address !== order.pickup_address && (
        <div className="bg-slate-50 rounded-xl p-4">
          <h4 className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2.5 flex items-center gap-2">
            <Package className="w-3 h-3" />{t("Delivery", "Entrega")}
          </h4>
          <div className="grid sm:grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-slate-400 text-xs mb-0.5">{t("Address", "Dirección")}</p>
              <p className="font-medium text-slate-700">{order.delivery_address}</p>
            </div>
          </div>
        </div>
      )}

      {/* Notes */}
      {order.notes && (
        <div className="bg-amber-50 rounded-xl p-4 border border-amber-100">
          <h4 className="text-[10px] font-black uppercase tracking-wider text-amber-600 mb-2">{t("Order Notes", "Notas")}</h4>
          <FormattedOrderNotes notes={order.notes} t={t} />
        </div>
      )}

      {/* Bloque de pago */}
      {!isOrderCoveredByMembership(order) && order.payment_status !== "paid" && totalWithoutCardFee > 0 && (
        <div className="rounded-xl border border-amber-100 bg-amber-50 p-4">
          {isPendingVerification(order.payment_status) ? (
            <div className="flex items-center gap-2.5 p-3 rounded-xl bg-amber-50 border border-amber-200">
              <Clock className="w-4 h-4 text-amber-600 flex-shrink-0" />
              <p className="text-xs text-amber-700 font-medium">
                {t("Payment submitted — awaiting verification.", "Pago enviado — esperando verificación.")}
              </p>
            </div>
          ) : canShowPaymentButtons(order) && (
            <>
              <h4 className="text-[10px] font-black uppercase tracking-wider text-amber-700 mb-2">
                {t("Pay for this order", "Pagar esta orden")}
              </h4>
              
              {/* Métodos sin comisión (Zelle, Venmo, CashApp) - muestran el monto base */}
              <div className="grid grid-cols-3 gap-2 mb-3">
                {[
                  { method: "zelle",   label: "Zelle",    bg: "#6D1ED4", amount: totalWithoutCardFee },
                  { method: "venmo",   label: "Venmo",    bg: "#0074DE", amount: totalWithoutCardFee },
                  { method: "cashapp", label: "Cash App", bg: "#00C244", amount: totalWithoutCardFee },
                ].map(({ method, label, bg, amount }) => (
                  <button key={method}
                    onClick={() => setPaymentModal({ method, order, amount: amount })}
                    className="flex flex-col items-center justify-center gap-1 px-2 py-2 rounded-lg text-xs font-bold text-white transition-all hover:opacity-90 active:scale-95"
                    style={{ backgroundColor: bg }}>
                    <span>{label}</span>
                    <span className="text-[9px] opacity-90">{formatCurrency(amount)}</span>
                  </button>
                ))}
              </div>
              
              {/* Tarjeta - muestra el monto + 3% */}
              <button onClick={() => handlePayStripe(order.id)} disabled={payingOrderId === order.id}
                className="w-full flex items-center justify-between px-4 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-sm font-bold transition-all disabled:opacity-50 active:scale-95">
                <span className="flex items-center gap-2">
                  {payingOrderId === order.id ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <CreditCard className="w-4 h-4" />}
                  {t("Pay with Card", "Pagar con Tarjeta")}
                </span>
                <span className="text-sm font-mono">
                  {formatCurrency(totalWithoutCardFee)} 
                  <span className="text-[10px] opacity-70 ml-1">+3% = {formatCurrency(totalWithoutCardFee * 1.03)}</span>
                </span>
              </button>
              
              <p className="text-[10px] text-amber-600 mt-2 text-center">
                {t("3% card processing fee will be added at checkout", "Se añadirá un 3% de comisión por tarjeta al finalizar")}
              </p>
              
              <button onClick={() => handleUploadReceipt(order.id, totalWithoutCardFee)} disabled={uploadingReceipt?.orderId === order.id}
                className="mt-3 w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-dashed border-amber-200 bg-amber-50/50 hover:bg-amber-100 text-amber-700 text-xs font-semibold transition-all disabled:opacity-50">
                {uploadingReceipt?.orderId === order.id ? <div className="w-3.5 h-3.5 border-2 border-amber-600 border-t-transparent rounded-full animate-spin" /> : <ScanLine className="w-3.5 h-3.5" />}
                {t("Upload receipt for instant verification", "Sube comprobante para verificación instantánea")}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// MAIN CUSTOMER ACCOUNT COMPONENT
// ═════════════════════════════════════════════════════════════════════════════
export default function CustomerAccount() {
  const { t, locale } = useLocale();
  const navigate = useNavigate();
  const { ring, dot } = useCursor();

  const [customer, setCustomer]           = useState(null);
  const [customerToken, setCustomerToken] = useState(null);
  const [loading, setLoading]             = useState(true);
  const [scrollY, setScrollY]             = useState(0);

  const [showCardSetup, setShowCardSetup]   = useState(false);
  const [stripePromise, setStripePromise]   = useState(null);

  const [orders, setOrders]                   = useState([]);
  const [pendingPayments, setPendingPayments] = useState([]);
  const [viewingOrderDetails, setViewingOrderDetails] = useState(null);
  const [ordersPage, setOrdersPage]           = useState(1);
  const [orderFilter, setOrderFilter]         = useState("all");
  const [ordersSearch, setOrdersSearch]       = useState("");
  const ORDERS_PER_PAGE = 5;

  const [hasMembership, setHasMembership]     = useState(false);
  const [membershipPlan, setMembershipPlan]   = useState(null);
  const [membershipUsage, setMembershipUsage] = useState(null);
  const [applyingMembership, setApplyingMembership] = useState(null);

  const [payingOrderId, setPayingOrderId]       = useState(null);
  const [uploadingReceipt, setUploadingReceipt] = useState(null);
  const [paymentModal, setPaymentModal]         = useState(null);
  const [paymentInfo, setPaymentInfo]           = useState(null);
  const [expandedPayment, setExpandedPayment]   = useState(null);
  const [pendingOpen, setPendingOpen]           = useState(true);
  const [pendingPage, setPendingPage]           = useState(1);
  const PENDING_PER_PAGE = 3;

  const [prefOpen, setPrefOpen]               = useState(false);
  const [preferences, setPreferences]         = useState({
    detergent_type: "", water_temperature: "", fabric_softener: "", dryer_sheets: "",
    bleach: "", drying: "", folding_style: "", special_care: "", garment_separation: "",
    hanging_instructions: "", allergies: "", special_instructions: "",
    pickup_time_preference: "", gate_code: "",
  });
  const [preferencesMeta, setPreferencesMeta]   = useState({ updated_at: null, version: null });
  const [preferencesLoading, setPreferencesLoading] = useState(false);

  const [editingProfile, setEditingProfile] = useState(false);
  const [profileForm, setProfileForm]       = useState({ name: "", phone: "", address: "", city: "", state: "", zip_code: "" });
  const [savingProfile, setSavingProfile]   = useState(false);

  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordData, setPasswordData]           = useState({ current_password: "", new_password: "", confirm_password: "" });
  const [changingPassword, setChangingPassword]   = useState(false);

  const [activeStat, setActiveStat] = useState(null);

  // ── Helpers ──────────────────────────────────────────────────────────────────
  const statusLabel = (s) => { const c = STATUS_CFG[s]; return c ? (locale === "es" ? c.es : c.en) : s; };
  const statusCls   = (s) => STATUS_CFG[s]?.cls || "bg-slate-100 text-slate-600 border-slate-200";

  const paymentStatusLabel = (s) => {
    const map = {
      unpaid:               { en: "Unpaid",  es: "Sin pagar", cls: "bg-red-50 text-red-600 border-red-200" },
      pending:              { en: "Pending", es: "Pendiente", cls: "bg-amber-50 text-amber-600 border-amber-200" },
      pending_verification: { en: "Pending", es: "Pendiente", cls: "bg-amber-50 text-amber-600 border-amber-200" },
      paid:                 { en: "Paid",    es: "Pagado",    cls: "bg-emerald-50 text-emerald-600 border-emerald-200" },
      membership_covered:   { en: "Covered", es: "Cubierto",  cls: "bg-emerald-50 text-emerald-600 border-emerald-200" },
    };
    const cfg = map[s] || map.unpaid;
    return { label: locale === "es" ? cfg.es : cfg.en, cls: cfg.cls };
  };

  const isPendingVerification = (s) => s === "pending_verification" || s === "pending";
  const isOrderCoveredByMembership = useCallback((order) => {
    if (order.payment_status === "paid") return false;
    if (order.payment_status === "pending_verification") return false;
    if (order.payment_status === "membership_covered") return false;
    if (!hasMembership) return false;
    if (Number(order.lbs_from_allowance || 0) <= 0) return false;
    const extraCharge = Number(order.extra_charge ?? order.total_amount ?? 99);
    return extraCharge <= 0.50;
  }, [hasMembership]);

  const canShowPaymentButtons = useCallback((order) => {
    if (order.payment_status === "paid") return false;
    if (order.payment_status === "membership_covered") return false;
    if (isPendingVerification(order.payment_status)) return false;
    if (isOrderCoveredByMembership(order)) return false;
    return true;
  }, [isPendingVerification, isOrderCoveredByMembership]);

  const realPendingPayments = pendingPayments.filter(
    (o) =>
      !isOrderCoveredByMembership(o) &&
      o.payment_status !== "paid" &&
      o.payment_status !== "membership_covered"
  );
  const membershipCoveredPending = pendingPayments.filter(
    (o) => isOrderCoveredByMembership(o) && o.payment_status !== "paid"
  );
  const pendingTotal = realPendingPayments
    .filter((o) => !isPendingVerification(o.payment_status))
    .reduce((s, o) => s + Number(o.extra_charge ?? o.total_amount ?? 0), 0);

  const formatDate = (ds) => {
    if (!ds) return "";
    return new Date(ds).toLocaleDateString(locale === "es" ? "es-ES" : "en-US", { year: "numeric", month: "long", day: "numeric" });
  };

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchOrders = async () => {
    try {
      const r = await customerAxios.get("/customer/orders");
      setOrders(r.data || []);
    } catch (err) {
      if (err.response?.status === 401) handleLogout();
    } finally { setLoading(false); }
  };

  const fetchPendingPayments = async () => {
    try {
      const r = await customerAxios.get("/customer/pending-payments");
      setPendingPayments((r.data || []).filter(o => Number(o.total_amount || 0) > 0));
    } catch {}
  };

  const fetchMembershipStatus = async () => {
    try {
      const r = await customerAxios.get("/customer/membership-status");
      setHasMembership(r.data?.has_membership || false);
      setMembershipPlan(r.data?.membership_plan || null);
      return r.data?.has_membership || false;
    } catch { return false; }
  };

  const fetchMembershipUsage = async () => {
    try {
      const r = await customerAxios.get("/customer/membership-usage");
      setMembershipUsage(r.data);
    } catch {}
  };

  const fetchPreferences = async () => {
    setPreferencesLoading(true);
    try {
      const r = await customerAxios.get("/customer/preferences");
      const d = r.data || {};
      setPreferences({
        detergent_type: d.detergent_type || "", water_temperature: d.water_temperature || "",
        fabric_softener: d.fabric_softener || "", dryer_sheets: d.dryer_sheets || "",
        bleach: d.bleach || "", drying: d.drying || "", folding_style: d.folding_style || "",
        special_care: d.special_care || "", garment_separation: d.garment_separation || "",
        hanging_instructions: d.hanging_instructions || "", allergies: d.allergies || "",
        special_instructions: d.special_instructions || "",
        pickup_time_preference: d.pickup_time_preference || "", gate_code: d.gate_code || "",
      });
      setPreferencesMeta({ updated_at: d.updated_at || null, version: d.version || null });
    } catch (err) {
      if (err.response?.status !== 404 && err.response?.status !== 403)
        toast.error(t("Could not load preferences", "No se pudieron cargar las preferencias"));
    } finally { setPreferencesLoading(false); }
  };

  const handleLogout = () => {
    localStorage.removeItem("customer_token");
    localStorage.removeItem("customer_data");
    toast.success(t("Signed out successfully", "Sesión cerrada correctamente"));
    navigate("/account/login");
  };

  const handleApplyMembership = async (orderId) => {
    setApplyingMembership(orderId);
    try {
      await customerAxios.post(`/customer/order/${orderId}/apply-membership`);
      toast.success(t("Membership applied — order covered!", "¡Membresía aplicada — orden cubierta!"));
      await Promise.all([fetchPendingPayments(), fetchOrders(), fetchMembershipUsage()]);
    } catch (err) {
      const detail = err.response?.data?.detail;
      if (typeof detail === "string" && detail.toLowerCase().includes("already paid")) {
        toast.info(t("Order already covered", "La orden ya fue cubierta"));
        await Promise.all([fetchPendingPayments(), fetchOrders()]);
      } else {
        toast.error(detail || t("Could not apply membership", "No se pudo aplicar la membresía"));
      }
    } finally {
      setApplyingMembership(null);
    }
  };

  const handlePayStripe = async (orderId) => {
    setPayingOrderId(orderId);
    try {
      const orderCheck = orders.find(o => o.id === orderId);
      if (orderCheck?.payment_status === "paid") {
        toast.info(t("Order already paid", "La orden ya está pagada"));
        return;
      }
      if (isPendingVerification(orderCheck?.payment_status)) {
        toast.warning(t("Payment already submitted — await verification", "Ya enviaste un pago, espera la verificación"));
        return;
      }
      const r = await customerAxios.post(`/customer/order/${orderId}/checkout-auth`);
      if (r.data?.url) {
        window.location.href = r.data.url;
      } else {
        toast.error(t("Could not create payment session", "No se pudo crear la sesión de pago"));
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || t("Payment error", "Error de pago"));
    } finally {
      setPayingOrderId(null);
    }
  };

  const handleUploadReceipt = async (orderId, expectedAmount, method = "zelle") => {
    const input = document.createElement("input");
    input.type = "file"; input.accept = "image/jpeg,image/png,image/webp";
    input.onchange = async (e) => {
      const file = e.target.files[0]; if (!file) return;
      setUploadingReceipt({ orderId, method, loading: true });
      const formData = new FormData(); formData.append("file", file);
      try {
        toast.info(t("Uploading receipt…", "Subiendo comprobante…"));
        const uploadRes = await customerAxios.post("/customer/upload-receipt", formData, {
          headers: { "Content-Type": "multipart/form-data" },
          params: { context: `payment:${orderId}` },
        });
        toast.info(t("Analyzing with AI…", "Analizando con IA…"));
        const ocrRes = await customerAxios.post(`/customer/ocr-receipt/${uploadRes.data.id}`);
        if (!ocrRes.data.is_valid_payment) {
          toast.error(ocrRes.data.rejection_reason || t("This doesn't appear to be a completed payment.", "Esto no parece un pago completado."), { duration: 8000 });
          return;
        }
        const extracted = ocrRes.data.amount;
        const tolerance = Math.max(Number(expectedAmount) * 0.10, 1.00);
        if (Math.abs(extracted - Number(expectedAmount)) <= tolerance) {
          await customerAxios.post(`/customer/order/${orderId}/mark-zelle?method=${method}`);
          toast.success(t(`Payment of $${Number(extracted).toFixed(2)} verified!`, `¡Pago de $${Number(extracted).toFixed(2)} verificado!`));
          fetchPendingPayments(); fetchOrders();
        } else {
          toast.error(t(`Amount mismatch: expected $${Number(expectedAmount).toFixed(2)}, got $${Number(extracted).toFixed(2)}`, `Monto no coincide: esperado $${Number(expectedAmount).toFixed(2)}, obtenido $${Number(extracted).toFixed(2)}`), { duration: 8000 });
        }
      } catch (err) {
        toast.error(err.response?.data?.detail || t("Error processing receipt", "Error al procesar"));
      } finally { setUploadingReceipt(null); }
    };
    input.click();
  };

  const handleChangePassword = async () => {
    if (passwordData.new_password !== passwordData.confirm_password) { toast.error(t("New passwords do not match", "Las nuevas contraseñas no coinciden")); return; }
    if (passwordData.new_password.length < 6) { toast.error(t("Password must be at least 6 characters", "La contraseña debe tener al menos 6 caracteres")); return; }
    setChangingPassword(true);
    try {
      await customerAxios.post("/customer/auth/change-password", { current_password: passwordData.current_password, new_password: passwordData.new_password });
      toast.success(t("Password changed successfully", "Contraseña cambiada con éxito"));
      setShowPasswordModal(false);
      setPasswordData({ current_password: "", new_password: "", confirm_password: "" });
    } catch (err) { toast.error(err.response?.data?.detail || t("Error changing password", "Error al cambiar la contraseña")); }
    finally { setChangingPassword(false); }
  };

  const handleSavePreferences = async () => {
    try {
      const r = await customerAxios.post("/customer/preferences", preferences);
      toast.success(t("Preferences saved", "Preferencias guardadas"));
      setPreferencesMeta({ updated_at: r.data.updated_at || null, version: r.data.version || null });
    } catch (err) {
      toast.error(err.response?.status === 403
        ? t("Active membership required", "Se requiere membresía activa")
        : err.response?.data?.detail || t("Could not save preferences", "No se pudieron guardar las preferencias"));
    }
  };

  const handleDeletePreferences = async () => {
    try {
      await customerAxios.delete("/customer/preferences");
      toast.success(t("Preferences deleted", "Preferencias eliminadas"));
      setPreferences({ detergent_type: "", water_temperature: "", fabric_softener: "", dryer_sheets: "", bleach: "", drying: "", folding_style: "", special_care: "", garment_separation: "", hanging_instructions: "", allergies: "", special_instructions: "", pickup_time_preference: "", gate_code: "" });
      setPreferencesMeta({ updated_at: null, version: null });
    } catch (err) { toast.error(err.response?.data?.detail || t("Could not delete", "No se pudo eliminar")); }
  };

  const startEditProfile = () => {
    const addrParts = (customer?.address || "").split(",").map(s => s.trim());
    setProfileForm({
      name: customer?.name || "",
      phone: (customer?.phone || "").replace(/^\+\d+\s?/, ""),
      address: customer?.address_line1 || addrParts[0] || "",
      city: customer?.city || addrParts[1] || "",
      state: customer?.state || addrParts[2] || "",
      zip_code: customer?.zip_code || addrParts[3] || ""
    });
    setEditingProfile(true);
  };

  const handleSaveProfile = async () => {
    setSavingProfile(true);
    try {
      let fullAddress = profileForm.address?.trim();
      if (fullAddress && (profileForm.city || profileForm.state || profileForm.zip_code)) {
      } else if (profileForm.city && profileForm.state && profileForm.zip_code) {
        fullAddress = `${profileForm.city}, ${profileForm.state} ${profileForm.zip_code}`;
      }

      const payload = {
        name: profileForm.name,
        phone: profileForm.phone,
        address: fullAddress,
        city: profileForm.city,
        state: profileForm.state,
        zip_code: profileForm.zip_code,
      };
      const res = await customerAxios.put("/customer/me", payload);
      setCustomer(res.data);
      localStorage.setItem("customer_data", JSON.stringify(res.data));
      setEditingProfile(false);
      toast.success(t("Profile updated", "Perfil actualizado"));
    } catch (err) {
      toast.error(err.response?.data?.detail || t("Could not update profile", "No se pudo actualizar el perfil"));
    } finally {
      setSavingProfile(false);
    }
  };

  const setPref = (k, v) => setPreferences(p => ({ ...p, [k]: v }));

  // ── Effects ────────────────────────────────────────────────────────────────
  useEffect(() => {
    let ticking = false;
    const fn = () => {
      if (!ticking) { requestAnimationFrame(() => { setScrollY(window.pageYOffset); ticking = false; }); ticking = true; }
    };
    window.addEventListener("scroll", fn);
    return () => window.removeEventListener("scroll", fn);
  }, []);

  useEffect(() => {
    customerAxios.get("/customer/payment-info").then(r => setPaymentInfo(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    const token = localStorage.getItem("customer_token");
    const cd    = localStorage.getItem("customer_data");
    if (!token) { navigate("/account/login"); return; }
    setCustomerToken(token);
    if (cd) setCustomer(JSON.parse(cd));

    const params = new URLSearchParams(window.location.search);

    if (params.get("new_user") === "1") {
      window.history.replaceState({}, "", "/account");
      customerAxios.get("/customer/payments/setup-intent-key")
        .then(res => {
          const key = res.data?.publishable_key;
          if (key) { setStripePromise(loadStripe(key)); setShowCardSetup(true); }
        })
        .catch(() => {});
    }

    const paidOrderId = params.get("paid");
    if (paidOrderId) {
      customerAxios.post(`/customer/order/${paidOrderId}/confirm-payment`)
        .then(() => { toast.success(t("Payment confirmed!", "¡Pago confirmado!")); window.history.replaceState({}, "", "/account"); fetchOrders(); fetchPendingPayments(); })
        .catch(err => { if (err.response?.data?.detail === "Already paid") toast.success(t("Payment already confirmed", "Pago ya confirmado")); window.history.replaceState({}, "", "/account"); });
    }

    const orderIdParam = params.get("order_id");
    if (orderIdParam) {
      setViewingOrderDetails(orderIdParam);
      setTimeout(() => { document.getElementById(`order-${orderIdParam}`)?.scrollIntoView({ behavior: "smooth" }); }, 800);
    }

    fetchOrders();
    fetchPendingPayments();
    fetchMembershipStatus().then(hasMem => { if (hasMem) { fetchPreferences(); fetchMembershipUsage(); } });
    customerAxios.get("/customer/me")
      .then(res => { if (res.data) { setCustomer(res.data); localStorage.setItem("customer_data", JSON.stringify(res.data)); } })
      .catch(() => {});
  }, [navigate]);

  useEffect(() => { setOrdersPage(1); }, [orderFilter, ordersSearch]);

  const recurringCount  = orders.filter(o => o.is_recurring).length;
  const filteredOrders  = orders.filter(o => {
    const matchFilter = orderFilter === "all" ? true : orderFilter === "recurring" ? o.is_recurring : !o.is_recurring;
    const q = ordersSearch.toLowerCase();
    const matchSearch = !q || (o.order_number || "").toLowerCase().includes(q) || (o.service_type || "").toLowerCase().includes(q) || (o.pickup_date || "").includes(q);
    return matchFilter && matchSearch;
  });
  const paginatedOrders = filteredOrders.slice(0, ordersPage * ORDERS_PER_PAGE);
  const hasMore         = ordersPage * ORDERS_PER_PAGE < filteredOrders.length;

  if (loading) return (
    <div className="min-h-screen bg-white">
      <PublicNav />
      <div className="pt-40 flex items-center justify-center">
        <div className="w-10 h-10 rounded-full border-2 border-sky-200 border-t-sky-500 animate-spin" />
      </div>
    </div>
  );

  const firstName = customer?.name?.split(" ")[0] || t("Customer", "Cliente");

  return (<>
    {showCardSetup && stripePromise && (
      <CardSetupModal stripePromise={stripePromise} onClose={() => setShowCardSetup(false)}
        onSuccess={() => { setShowCardSetup(false); toast.success(t("You're all set!", "¡Todo listo!")); }} t={t} />
    )}

    {paymentModal && (
      <PaymentModal method={paymentModal.method} order={paymentModal.order}
        amount={paymentModal.amount}
        onClose={() => setPaymentModal(null)} onReceiptUpload={handleUploadReceipt}
        uploadingReceipt={uploadingReceipt} paymentInfo={paymentInfo}
        onPaymentMarked={() => { fetchOrders(); fetchPendingPayments(); }}
      />
    )}

    {showPasswordModal && (
      <PortalModal onClose={() => setShowPasswordModal(false)}>
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
          <div className="bg-gradient-to-br from-slate-800 to-slate-900 px-6 py-6 flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center"><Key className="w-4 h-4 text-white" /></div>
              <div>
                <h3 className="text-white font-black text-lg">{t("Change Password", "Cambiar contraseña")}</h3>
                <p className="text-white/50 text-xs">{t("Keep your account secure", "Mantén tu cuenta segura")}</p>
              </div>
            </div>
            <button onClick={() => setShowPasswordModal(false)} className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center"><X className="w-4 h-4 text-white" /></button>
          </div>
          <div className="px-6 py-5 space-y-4">
            {[
              { key: "current_password", label: t("Current Password", "Contraseña actual"),   placeholder: "••••••••" },
              { key: "new_password",     label: t("New Password", "Nueva contraseña"),         placeholder: t("Min. 6 characters", "Mín. 6 caracteres") },
              { key: "confirm_password", label: t("Confirm Password", "Confirmar contraseña"), placeholder: "••••••••" },
            ].map(({ key, label, placeholder }) => (
              <div key={key}>
                <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</label>
                <input type="password" value={passwordData[key]} onChange={e => setPasswordData(p => ({ ...p, [key]: e.target.value }))} className={inputCls} placeholder={placeholder} />
              </div>
            ))}
            <button onClick={handleChangePassword} disabled={changingPassword}
              className="w-full py-3 rounded-xl text-white font-bold text-sm bg-slate-800 hover:bg-slate-700 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2 mt-2">
              {changingPassword ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Shield className="w-4 h-4" />}
              {t("Update Password", "Actualizar contraseña")}
            </button>
          </div>
        </div>
      </PortalModal>
    )}

    <div className="pointer-events-none fixed inset-0 z-[9999] hidden lg:block">
      <div ref={ring} className="absolute w-9 h-9 rounded-full border border-sky-400/50 will-change-transform" style={{ top: 0, left: 0 }} />
      <div ref={dot}  className="absolute w-1.5 h-1.5 rounded-full bg-sky-500 will-change-transform" style={{ top: 0, left: 0 }} />
    </div>

    <style>{`
      @keyframes fadeUp { from { opacity:0; transform:translateY(20px) } to { opacity:1; transform:translateY(0) } }
      @keyframes float  { 0%,100% { transform:translateY(0) } 50% { transform:translateY(-6px) } }
      .float-anim { animation: float 4s ease-in-out infinite; }
      .fade-up    { animation: fadeUp 0.6s ease-out both; }
    `}</style>

    <div className="min-h-screen bg-slate-50 overflow-x-hidden">
      <PublicNav />

      {/* Hero */}
      <section className="relative overflow-hidden pt-24 pb-36">
        <div className="absolute inset-0" style={{ backgroundImage: "url('https://images.unsplash.com/photo-1545173168-9f1947eebb7f?w=1920&h=600&fit=crop')", backgroundSize: "cover", backgroundPosition: "center 30%", transform: `translateY(${scrollY * 0.12}px) scale(1.06)`, opacity: 0.75 }} />
        <div className="absolute inset-0 bg-gradient-to-b from-slate-900/92 via-slate-900/75 to-slate-50" />
        <div className="relative z-10 max-w-4xl mx-auto px-6 sm:px-8 pt-16">
          <div className="fade-up" style={{ animationDelay: "0.1s" }}>
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/10 backdrop-blur border border-white/15 mb-6">
              <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse" />
              <span className="text-[10px] text-white/70 font-black uppercase tracking-[0.2em]">{t("My Account", "Mi Cuenta")}</span>
            </div>
          </div>
          <h1 className="text-3xl xs:text-4xl sm:text-5xl md:text-6xl font-light text-white mb-3 leading-tight fade-up" style={{ animationDelay: "0.2s" }}>
            {t("Welcome back,", "Bienvenido,")}
            <br />
            <span className="font-black bg-gradient-to-r from-white via-sky-200 to-white bg-clip-text text-transparent">{firstName}</span>
          </h1>
          <p className="text-white/50 text-base fade-up" style={{ animationDelay: "0.3s" }}>{customer?.email}</p>
          {membershipPlan && (
            <div className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-violet-500/15 border border-violet-400/25 fade-up" style={{ animationDelay: "0.4s" }}>
              <Award className="w-4 h-4 text-violet-300" />
              <span className="text-sm text-white/80 font-semibold">{membershipPlan}</span>
            </div>
          )}
        </div>
        <div className="absolute bottom-0 left-0 right-0">
          <svg viewBox="0 0 1440 60" preserveAspectRatio="none" className="w-full h-12">
            <path d="M0,30 C480,0 960,60 1440,30 L1440,60 L0,60 Z" fill="#f8fafc" />
          </svg>
        </div>
      </section>

      <div className="max-w-4xl mx-auto px-6 sm:px-8 pb-28 -mt-4 space-y-5 relative z-10">

        {/* Profile card */}
        <Reveal dir="up" delay={0}>
          <GlassCard>
            <div className="p-6 flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-4 flex-1 min-w-0">
                <div className="relative flex-shrink-0">
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-sky-400 to-blue-600 flex items-center justify-center shadow-lg shadow-sky-200/50 float-anim">
                    <span className="text-white text-xl font-black">{firstName[0]?.toUpperCase()}</span>
                  </div>
                  <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-emerald-400 rounded-full border-2 border-white" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-slate-800 text-lg">{customer?.name}</span>
                    <Heart className="w-3.5 h-3.5 text-rose-400 fill-rose-400" />
                  </div>
                  <p className="text-slate-400 text-sm truncate">{customer?.email}</p>
                  {membershipPlan && (
                    <div className="mt-1.5 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-violet-50 border border-violet-200 text-violet-600 text-[10px] font-black">
                      <Award className="w-2.5 h-2.5" /> {membershipPlan}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {stripePromise && !showCardSetup && (
                  <button onClick={() => setShowCardSetup(true)} className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-sky-200 text-sky-600 text-xs font-semibold hover:bg-sky-50 transition-all">
                    <CreditCard className="w-3.5 h-3.5" />{t("Add card", "Agregar tarjeta")}
                  </button>
                )}
                <button onClick={() => setShowPasswordModal(true)} className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 text-slate-500 text-xs font-semibold hover:border-slate-300 hover:bg-slate-50 transition-all">
                  <Key className="w-3.5 h-3.5" />{t("Password", "Contraseña")}
                </button>
                <button onClick={handleLogout} data-testid="customer-logout-btn"
                  className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 text-slate-500 text-sm font-semibold hover:border-red-200 hover:text-red-500 hover:bg-red-50 transition-all">
                  <LogOut className="h-3.5 w-3.5" />{t("Sign out", "Salir")}
                </button>
              </div>
            </div>
          </GlassCard>
        </Reveal>

        {/* CTA banner */}
        <Reveal delay={80} dir="scale">
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-sky-600 via-sky-500 to-blue-600 p-8 text-center shadow-lg shadow-sky-200/40">
            <div className="absolute inset-0 opacity-10" style={{ backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.8) 1px, transparent 1px)", backgroundSize: "24px 24px" }} />
            <div className="relative">
              <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center mx-auto mb-4 float-anim">
                <Sparkles className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-xl font-bold text-white mb-1">{t("Ready for your next pickup?", "¿Listo para tu próxima recogida?")}</h3>
              <p className="text-white/60 text-sm mb-6">{t("Schedule in seconds, we'll handle the rest.", "Programa en segundos, nosotros hacemos el resto.")}</p>
              <div className="flex flex-col sm:flex-row justify-center items-center gap-4">
                <Link to="/schedule-pickup" className="w-full sm:w-auto">
                  <div className="inline-flex items-center justify-center gap-2 bg-white text-sky-600 rounded-full px-6 py-3 text-sm font-black uppercase tracking-wider shadow-lg cursor-pointer hover:shadow-xl hover:-translate-y-0.5 transition-all active:scale-95 w-full sm:w-auto">
                    🚚 {t("Schedule Pickup", "Programar Recogida")} <ArrowRight className="w-4 h-4" />
                  </div>
                </Link>
                <Link to="/wash-fold" className="w-full sm:w-auto">
                  <div className="inline-flex items-center justify-center gap-2 bg-white/90 backdrop-blur-sm text-violet-600 rounded-full px-6 py-3 text-sm font-black uppercase tracking-wider shadow-md cursor-pointer hover:shadow-xl hover:-translate-y-0.5 transition-all active:scale-95 w-full sm:w-auto border border-white/30">
                    🧺 {t("Wash & Fold", "Lavado y Doblado")} <ArrowRight className="w-4 h-4" />
                  </div>
                </Link>
              </div>
            </div>
          </div>
        </Reveal>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { key: "orders",    value: orders.length,                                                                label: t("Orders","Órdenes"),       gradient:"from-sky-400 to-sky-600",      icon: Package      },
            { key: "active",    value: orders.filter(o=>["new","processing","confirmed"].includes(o.status)).length, label: t("Active","Activas"),        gradient:"from-amber-400 to-orange-500", icon: Zap          },
            { key: "recurring", value: recurringCount,                                                               label: t("Recurring","Recurrentes"), gradient:"from-indigo-400 to-blue-600",  icon: Repeat       },
            { key: "done",      value: orders.filter(o=>o.status==="completed").length,                              label: t("Done","Completadas"),      gradient:"from-emerald-400 to-teal-600", icon: CheckCircle  },
          ].map((s, i) => (
            <Reveal key={i} delay={i * 60} dir="up">
              <GlassCard className={`cursor-pointer hover:scale-[1.03] transition-all duration-300 select-none ${activeStat === s.key ? "ring-2 ring-sky-400 ring-offset-1 shadow-md" : ""}`}
                onClick={() => setActiveStat(prev => prev === s.key ? null : s.key)}>
                <div className="p-5 text-center">
                  <div className={`w-9 h-9 bg-gradient-to-br ${s.gradient} rounded-xl flex items-center justify-center mx-auto mb-3 shadow-sm`}>
                    <s.icon className="h-4 w-4 text-white" />
                  </div>
                  <p className="text-3xl font-black text-slate-800 tabular-nums">{s.value}</p>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">{s.label}</p>
                </div>
              </GlassCard>
            </Reveal>
          ))}
        </div>

        {/* Membership upsell */}
        {!hasMembership && (
          <Reveal delay={100} dir="up">
            <GlassCard className="border-violet-200/60">
              <div className="p-5 flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-3.5">
                  <div className="w-10 h-10 bg-gradient-to-br from-violet-400 to-purple-600 rounded-xl flex items-center justify-center shadow-sm">
                    <Award className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <h2 className="font-bold text-slate-800">{t("Upgrade to Membership", "Obtén una Membresía")}</h2>
                    <p className="text-xs text-slate-400 mt-0.5">{t("Monthly allowance + exclusive benefits", "Allowance mensual + beneficios exclusivos")}</p>
                  </div>
                </div>
                <Link to="/membership">
                  <div className="inline-flex items-center gap-1.5 bg-gradient-to-r from-violet-500 to-purple-600 text-white rounded-xl px-5 py-2.5 text-xs font-black uppercase tracking-wider shadow-sm cursor-pointer hover:shadow-md transition-all active:scale-95" data-testid="membership-upsell-btn">
                    {t("View Plans","Ver Planes")} <ArrowRight className="w-3.5 h-3.5" />
                  </div>
                </Link>
              </div>
            </GlassCard>
          </Reveal>
        )}

        {/* Membership covered pending */}
        {membershipCoveredPending.length > 0 && (
          <Reveal delay={75} dir="up">
            <GlassCard className="border-emerald-200/60">
              <div className="px-6 py-4 border-b border-emerald-100/60 flex items-center gap-3">
                <div className="w-9 h-9 bg-gradient-to-br from-emerald-400 to-teal-500 rounded-xl flex items-center justify-center shadow-sm flex-shrink-0">
                  <Award className="h-4 w-4 text-white" />
                </div>
                <div className="flex-1">
                  <h2 className="font-bold text-slate-800 text-base">{t("Covered by Membership", "Cubiertas por Membresía")}</h2>
                  <p className="text-[11px] text-slate-400 mt-0.5">{membershipCoveredPending.length} {t("order(s) within your monthly allowance", "orden(es) dentro de tu allowance mensual")}</p>
                </div>
                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-black">
                  <CheckCircle className="w-3 h-3" /> {t("No payment needed", "Sin pago requerido")}
                </span>
              </div>
              <div className="px-5 py-4 space-y-2">
                {membershipCoveredPending.map(order => (
                  <div key={order.id} className="rounded-xl border border-emerald-100 bg-emerald-50/50 px-4 py-3 flex items-center gap-3">
                    <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-emerald-100 border border-emerald-200 flex items-center justify-center text-base">{SERVICE_ICONS[order.service_type] || "🧺"}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-slate-700 text-xs font-mono">{order.order_number}</span>
                        {order.pickup_date && <span className="text-[10px] text-slate-400">{order.pickup_date}</span>}
                      </div>
                      <p className="text-[11px] text-emerald-600 mt-0.5 font-medium">✓ {t("Covered by your membership allowance", "Cubierto por tu allowance de membresía")}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <div className="text-right">
                        <p className="text-[10px] text-slate-400 line-through">{formatCurrency(order.total_amount)}</p>
                        <p className="text-[10px] font-black text-emerald-600">$0.00</p>
                      </div>
                      <button onClick={() => handleApplyMembership(order.id)}
                        disabled={applyingMembership === order.id || order.payment_status === "membership_covered"}
                        className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all active:scale-95 disabled:opacity-60">
                        {applyingMembership === order.id ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                        {t("Apply", "Aplicar")}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </GlassCard>
          </Reveal>
        )}

        {/* Real Pending Payments */}
        {realPendingPayments.length > 0 && (
          <Reveal delay={80} dir="up">
            <GlassCard>
              <button onClick={() => setPendingOpen(p => !p)} className="w-full focus:outline-none">
                <div className="px-6 py-4 flex items-center justify-between border-b border-amber-100/60">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 bg-gradient-to-br from-amber-400 to-orange-500 rounded-xl flex items-center justify-center shadow-sm flex-shrink-0">
                      <CreditCard className="h-4 w-4 text-white" />
                    </div>
                    <div className="text-left">
                      <h2 className="font-bold text-slate-800 text-base">{t("Pending Payments", "Pagos Pendientes")}</h2>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        <span className="font-bold text-amber-600">{realPendingPayments.length}</span> {t("orders · total", "órdenes · total")} <span className="font-bold text-slate-600">{formatCurrency(pendingTotal)}</span>
                      </p>
                    </div>
                  </div>
                  <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-300 ${pendingOpen ? "rotate-180" : ""}`} />
                </div>
              </button>
              <div className={`overflow-hidden transition-all duration-400 ease-in-out ${pendingOpen ? "max-h-[2000px] opacity-100" : "max-h-0 opacity-0"}`}>
                <div className="px-5 py-4 space-y-2">
                  {realPendingPayments.slice(0, pendingPage * PENDING_PER_PAGE).map(order => {
                    const isExpanded      = expandedPayment === order.id;
                    const isPendingV      = isPendingVerification(order.payment_status);
                    const amountDue       = Number(order.extra_charge ?? order.total_amount ?? 0);
                    return (
                      <div key={order.id} className={`rounded-xl border transition-all duration-200 overflow-hidden ${isExpanded ? "border-amber-200 shadow-sm" : "border-slate-100 hover:border-slate-200"} bg-white`} data-testid={`pending-order-${order.order_number}`}>
                        <button onClick={() => setExpandedPayment(isExpanded ? null : order.id)} className="w-full px-4 py-3 flex items-center gap-3 text-left focus:outline-none">
                          <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-amber-50 border border-amber-100 flex items-center justify-center text-base">{SERVICE_ICONS[order.service_type] || "🧺"}</div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-slate-700 text-xs font-mono">{order.order_number}</span>
                              {isPendingV
                                ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-amber-50 text-amber-600 border border-amber-200"><Clock className="w-2.5 h-2.5" /> {t("Verifying","Verificando")}</span>
                                : <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-red-50 text-red-500 border border-red-200">{t("Unpaid","Sin pagar")}</span>
                              }
                              {order.pickup_date && <span className="text-[10px] text-slate-400">{order.pickup_date}</span>}
                            </div>
                            {hasMembership && Number(order.membership_discount || 0) > 0 && (
                              <p className="text-[10px] text-sky-500 mt-0.5">{t("Membership discount applied","Dto. membresía aplicado")} (−{formatCurrency(order.membership_discount)})</p>
                            )}
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <span className="font-black text-slate-800 text-sm tabular-nums">{formatCurrency(amountDue)}</span>
                            <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${isExpanded ? "rotate-180 text-amber-500" : ""}`} />
                          </div>
                        </button>
                        {isExpanded && (
                          <div className="px-4 pb-4 border-t border-slate-100 pt-3 space-y-3">
                            {isPendingV ? (
                              <div className="flex items-center gap-2.5 p-3 rounded-xl bg-amber-50 border border-amber-200">
                                <Clock className="w-4 h-4 text-amber-600 flex-shrink-0" />
                                <p className="text-xs text-amber-700 font-medium">{t("Payment submitted — our team will verify it shortly.", "Pago enviado — nuestro equipo lo verificará pronto.")}</p>
                              </div>
                            ) : (
                              <>
                                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{t("Pay with", "Pagar con")}</p>
                                <div className="grid grid-cols-2 gap-2">
                                  <button onClick={() => setPaymentModal({ method: "zelle", order, amount: amountDue })}
                                    className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-bold text-white transition-all hover:opacity-90 active:scale-95"
                                    style={{ backgroundColor: "#6D1ED4" }}>
                                    <Building2 className="w-3.5 h-3.5" /> Zelle
                                  </button>
                                  <button onClick={() => setPaymentModal({ method: "venmo", order, amount: amountDue })}
                                    className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-bold text-white transition-all hover:opacity-90 active:scale-95"
                                    style={{ backgroundColor: "#0074DE" }}>
                                    <DollarSign className="w-3.5 h-3.5" /> Venmo
                                  </button>
                                  <button onClick={() => setPaymentModal({ method: "cashapp", order, amount: amountDue })}
                                    className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-bold text-black transition-all hover:opacity-90 active:scale-95"
                                    style={{ backgroundColor: "#00C244" }}>
                                    <DollarSign className="w-3.5 h-3.5" /> Cash App
                                  </button>
                                  <button onClick={() => handlePayStripe(order.id)} disabled={payingOrderId === order.id}
                                    className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold transition-all disabled:opacity-50 active:scale-95">
                                    {payingOrderId === order.id ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <CreditCard className="w-3.5 h-3.5" />}
                                    {t("Card", "Tarjeta")}{' '}
                                    <span className="ml-1 text-[10px] opacity-80">({formatCurrency(amountDue)} + 3% fee)</span>
                                  </button>
                                </div>
                                <p className="text-[10px] text-amber-600 mt-2">{t("3% card processing fee will be added at checkout", "Se añadirá un 3% de comisión por tarjeta al finalizar")}</p>
                                <button onClick={() => handleUploadReceipt(order.id, amountDue)} disabled={uploadingReceipt?.orderId === order.id}
                                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-dashed border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-500 text-xs font-semibold transition-all disabled:opacity-50">
                                  {uploadingReceipt?.orderId === order.id ? <div className="w-3.5 h-3.5 border-2 border-slate-500 border-t-transparent rounded-full animate-spin" /> : <ScanLine className="w-3.5 h-3.5" />}
                                  {t("Upload receipt for instant verification", "Sube comprobante para verificación instantánea")}
                                </button>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {realPendingPayments.length > pendingPage * PENDING_PER_PAGE && (
                    <button onClick={() => setPendingPage(p => p + 1)} className="w-full py-2.5 rounded-xl border border-dashed border-slate-200 text-slate-400 text-xs font-semibold hover:border-amber-300 hover:text-amber-600 hover:bg-amber-50 transition-all flex items-center justify-center gap-1.5">
                      <ChevronDown className="w-3.5 h-3.5" /> {t("Show more", "Ver más")} ({realPendingPayments.length - pendingPage * PENDING_PER_PAGE} {t("remaining", "restantes")})
                    </button>
                  )}
                </div>
              </div>
            </GlassCard>
          </Reveal>
        )}

        {/* ✅ Membership usage - usando MembershipCycleBar dinámico */}
        {hasMembership && (
          <Reveal delay={90} dir="up">
            <MembershipCycleBar 
              customerId={customer?.id} 
              compact={false} 
              showPlanDetails={true}
            />
          </Reveal>
        )}

        {/* Preferences */}
        {hasMembership && (
          <Reveal delay={100} dir="up">
            <GlassCard data-testid="customer-preferences-card">
              <button onClick={() => setPrefOpen(p => !p)} className="w-full focus:outline-none group">
                <SectionHeader
                  icon={Settings}
                  iconColor="from-sky-400 to-sky-600"
                  title={t("Laundry Preferences", "Preferencias de Lavandería")}
                  subtitle={preferencesMeta.updated_at ? `${t("Updated", "Actualizado")}: ${formatDate(preferencesMeta.updated_at)}` : t("Tap to configure your preferences", "Toca para configurar tus preferencias")}
                  action={
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all duration-300 ${prefOpen ? "bg-sky-100 text-sky-600 rotate-180" : "bg-slate-100 text-slate-400 group-hover:bg-sky-50 group-hover:text-sky-500"}`}>
                      <ChevronDown className="w-4 h-4" />
                    </div>
                  }
                />
              </button>
              <div className={`overflow-hidden transition-all duration-500 ease-in-out ${prefOpen ? "max-h-[3000px] opacity-100" : "max-h-0 opacity-0"}`}>
                <div className="px-6 pb-6">
                  {preferencesLoading ? <PreferencesSkeleton /> : (
                    <div className="pt-5 space-y-5">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-3">{t("Cleaning Products", "Productos de Limpieza")}</p>
                        <div className="grid sm:grid-cols-3 gap-4">
                          <Field label={t("Detergent", "Detergente")}>
                            <Select value={preferences.detergent_type} onValueChange={v => setPref("detergent_type", v)}>
                              <SelectTrigger className="mt-1.5 rounded-xl border-slate-200 text-sm h-11" data-testid="customer-pref-detergent"><SelectValue placeholder={t("Select", "Selecciona")} /></SelectTrigger>
                              <SelectContent>{["Tide Original","Tide + Oxi","Gain Original","Gain + Aroma Boost","Arm & Hammer","Persil ProClean","Foca","Roma","Ariel","OxiClean"].map(v=><SelectItem key={v} value={v}>{v}</SelectItem>)}<SelectItem value="No Preference">{t("No Preference","Sin preferencia")}</SelectItem></SelectContent>
                            </Select>
                          </Field>
                          <Field label={t("Fabric softener", "Suavizante")}>
                            <Select value={preferences.fabric_softener} onValueChange={v => setPref("fabric_softener", v)}>
                              <SelectTrigger className="mt-1.5 rounded-xl border-slate-200 text-sm h-11" data-testid="customer-pref-softener"><SelectValue placeholder={t("Select", "Selecciona")} /></SelectTrigger>
                              <SelectContent>{["Downy Original","Downy Ultra","Snuggle Blue Sparkle","Suavitel Field Flowers","Suavitel Morning Sun","Gain Softener","Bounce Liquid Softener"].map(v=><SelectItem key={v} value={v}>{v}</SelectItem>)}<SelectItem value="No Softener">{t("No Softener","Sin suavizante")}</SelectItem><SelectItem value="No Preference">{t("No Preference","Sin preferencia")}</SelectItem></SelectContent>
                            </Select>
                          </Field>
                          <Field label={t("Dryer sheets", "Hojas de secadora")}>
                            <Select value={preferences.dryer_sheets} onValueChange={v => setPref("dryer_sheets", v)}>
                              <SelectTrigger className="mt-1.5 rounded-xl border-slate-200 text-sm h-11" data-testid="customer-pref-dryer-sheets"><SelectValue placeholder={t("Select", "Selecciona")} /></SelectTrigger>
                              <SelectContent>{["Bounce Original","Gain Dryer Sheets","Snuggle Dryer Sheets","Downy Dryer Sheets","Suavitel Dryer Sheets"].map(v=><SelectItem key={v} value={v}>{v}</SelectItem>)}<SelectItem value="No Dryer Sheets">{t("No Dryer Sheets","Sin hojas")}</SelectItem><SelectItem value="No Preference">{t("No Preference","Sin preferencia")}</SelectItem></SelectContent>
                            </Select>
                          </Field>
                        </div>
                      </div>
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-3">{t("Wash Settings", "Configuración de Lavado")}</p>
                        <div className="grid sm:grid-cols-3 gap-4">
                          <Field label={t("Bleach", "Blanqueador")}>
                            <Select value={preferences.bleach} onValueChange={v => setPref("bleach", v)}>
                              <SelectTrigger className="mt-1.5 rounded-xl border-slate-200 text-sm h-11" data-testid="customer-pref-bleach"><SelectValue placeholder={t("Select", "Selecciona")} /></SelectTrigger>
                              <SelectContent>{["Clorox Regular Bleach","OxiClean","Cloralex"].map(v=><SelectItem key={v} value={v}>{v}</SelectItem>)}<SelectItem value="No Bleach">{t("No Bleach","Sin blanqueador")}</SelectItem><SelectItem value="No Preference">{t("No Preference","Sin preferencia")}</SelectItem></SelectContent>
                            </Select>
                          </Field>
                          <Field label={t("Water temp", "Temperatura del agua")}>
                            <Select value={preferences.water_temperature} onValueChange={v => setPref("water_temperature", v)}>
                              <SelectTrigger className="mt-1.5 rounded-xl border-slate-200 text-sm h-11" data-testid="customer-pref-temperature"><SelectValue placeholder={t("Select", "Selecciona")} /></SelectTrigger>
                              <SelectContent><SelectItem value="Cold">{t("Cold","Fría")}</SelectItem><SelectItem value="Warm">{t("Warm","Tibia")}</SelectItem><SelectItem value="Hot">{t("Hot","Caliente")}</SelectItem><SelectItem value="No Preference">{t("No Preference","Sin preferencia")}</SelectItem></SelectContent>
                            </Select>
                          </Field>
                          <Field label={t("Drying", "Secado")}>
                            <Select value={preferences.drying} onValueChange={v => setPref("drying", v)}>
                              <SelectTrigger className="mt-1.5 rounded-xl border-slate-200 text-sm h-11" data-testid="customer-pref-drying"><SelectValue placeholder={t("Select", "Selecciona")} /></SelectTrigger>
                              <SelectContent><SelectItem value="Low Heat">{t("Low Heat","Temperatura baja")}</SelectItem><SelectItem value="Medium Heat">{t("Medium Heat","Temperatura media")}</SelectItem><SelectItem value="High Heat">{t("High Heat","Temperatura alta")}</SelectItem><SelectItem value="No Preference">{t("No Preference","Sin preferencia")}</SelectItem></SelectContent>
                            </Select>
                          </Field>
                        </div>
                      </div>
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-3">{t("Garment Handling", "Manejo de Prendas")}</p>
                        <div className="grid sm:grid-cols-3 gap-4">
                          <Field label={t("Folding style", "Estilo de doblado")}>
                            <Select value={preferences.folding_style} onValueChange={v => setPref("folding_style", v)}>
                              <SelectTrigger className="mt-1.5 rounded-xl border-slate-200 text-sm h-11" data-testid="customer-pref-folding"><SelectValue placeholder={t("Select", "Selecciona")} /></SelectTrigger>
                              <SelectContent><SelectItem value="Standard Fold">{t("Standard Fold","Estándar")}</SelectItem><SelectItem value="Retail Fold (Store Style)">{t("Retail Fold","Tipo tienda")}</SelectItem><SelectItem value="Hanging (Shirts Only)">{t("Hanging","Colgado")}</SelectItem><SelectItem value="Fold + Hang Combination">{t("Fold + Hang","Doblado + colgado")}</SelectItem><SelectItem value="No Preference">{t("No Preference","Sin preferencia")}</SelectItem></SelectContent>
                            </Select>
                          </Field>
                          <Field label={t("Special care", "Cuidado especial")}>
                            <Select value={preferences.special_care} onValueChange={v => setPref("special_care", v)}>
                              <SelectTrigger className="mt-1.5 rounded-xl border-slate-200 text-sm h-11" data-testid="customer-pref-special-care"><SelectValue placeholder={t("Select", "Selecciona")} /></SelectTrigger>
                              <SelectContent><SelectItem value="Hypoallergenic Only">{t("Hypoallergenic Only","Solo hipoalergénico")}</SelectItem><SelectItem value="Baby Safe Products">{t("Baby Safe","Seguros para bebé")}</SelectItem><SelectItem value="No Harsh Chemicals">{t("No Harsh Chemicals","Sin químicos")}</SelectItem><SelectItem value="No Preference">{t("No Preference","Sin preferencia")}</SelectItem></SelectContent>
                            </Select>
                          </Field>
                          <Field label={t("Separation", "Separación")}>
                            <Select value={preferences.garment_separation} onValueChange={v => setPref("garment_separation", v)}>
                              <SelectTrigger className="mt-1.5 rounded-xl border-slate-200 text-sm h-11" data-testid="customer-pref-separation"><SelectValue placeholder={t("Select", "Selecciona")} /></SelectTrigger>
                              <SelectContent><SelectItem value="No Separation">{t("No Separation","Sin separación")}</SelectItem><SelectItem value="Separate by Person (Label Bags by Name)">{t("By Person","Por persona")}</SelectItem><SelectItem value="Separate by Clothing Type">{t("By Type","Por tipo")}</SelectItem><SelectItem value="Separate by Color (Light / Dark)">{t("By Color","Por color")}</SelectItem><SelectItem value="No Preference">{t("No Preference","Sin preferencia")}</SelectItem></SelectContent>
                            </Select>
                          </Field>
                        </div>
                      </div>
                      <Field label={t("Hanging / special items", "Prendas especiales / colgar")}>
                        <input value={preferences.hanging_instructions} onChange={e=>setPref("hanging_instructions",e.target.value)} placeholder={t("e.g. Shirts on hangers","Ej. Camisas en gancho")} className={inputCls} data-testid="customer-pref-hanging" />
                      </Field>
                      <Field label={t("Allergies or sensitivities", "Alergias o sensibilidades")}>
                        <textarea value={preferences.allergies} onChange={e=>setPref("allergies",e.target.value)} rows={3} placeholder={t("e.g. No fragrances","Ej. Sin fragancias")} className={`${inputCls} resize-none`} data-testid="customer-pref-allergies" />
                      </Field>
                      <Field label={t("Additional notes", "Notas adicionales")}>
                        <textarea value={preferences.special_instructions} onChange={e=>setPref("special_instructions",e.target.value)} rows={3} placeholder={t("Special instructions","Instrucciones especiales")} className={`${inputCls} resize-none`} data-testid="customer-pref-notes" />
                      </Field>
                      <div className="grid sm:grid-cols-2 gap-4">
                        <Field label={t("Preferred pickup time", "Horario preferido")}>
                          <Select value={preferences.pickup_time_preference} onValueChange={v => setPref("pickup_time_preference", v)}>
                            <SelectTrigger className="mt-1.5 rounded-xl border-slate-200 text-sm h-11" data-testid="customer-pref-pickup-time"><SelectValue placeholder={t("Select time window","Selecciona horario")} /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="8am-12pm">{t("8:00 AM – 12:00 PM","8:00 AM – 12:00 PM")}</SelectItem>
                              <SelectItem value="2pm-6pm">{t("2:00 PM – 6:00 PM","2:00 PM – 6:00 PM")}</SelectItem>
                              <SelectItem value="any">{t("No preference","Sin preferencia")}</SelectItem>
                            </SelectContent>
                          </Select>
                        </Field>
                        <Field label={t("Gate / Access code", "Código de acceso")}>
                          <input value={preferences.gate_code} onChange={e=>setPref("gate_code",e.target.value)} placeholder={t("e.g. 1234#","Ej. 1234#")} className={inputCls} data-testid="customer-pref-gate" />
                        </Field>
                      </div>
                      <div className="flex flex-wrap gap-3 pt-2">
                        <button onClick={handleSavePreferences} data-testid="customer-preferences-save"
                          className="flex items-center gap-2 bg-sky-600 hover:bg-sky-700 text-white rounded-xl px-6 py-3 text-sm font-bold transition-all active:scale-95 shadow-sm">
                          <Save className="w-4 h-4" />{t("Save preferences","Guardar preferencias")}
                        </button>
                        <button onClick={handleDeletePreferences} data-testid="customer-preferences-delete"
                          className="flex items-center gap-2 px-6 py-3 rounded-xl border border-slate-200 text-slate-500 text-sm font-semibold hover:border-red-200 hover:text-red-500 hover:bg-red-50 transition-all">
                          <Trash2 className="w-4 h-4" />{t("Delete","Eliminar")}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </GlassCard>
          </Reveal>
        )}

        {/* Orders list */}
        <Reveal delay={140} dir="up">
          <GlassCard id="orders-section">
            <div className="px-6 py-5 border-b border-slate-100">
              <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
                <div className="flex items-center gap-3.5">
                  <div className="w-9 h-9 bg-gradient-to-br from-sky-400 to-sky-600 rounded-xl flex items-center justify-center shadow-sm">
                    <Package className="h-4 w-4 text-white" />
                  </div>
                  <div>
                    <h2 className="font-bold text-slate-800 text-base">{t("Orders","Órdenes")}</h2>
                    <p className="text-[11px] text-slate-400">{orders.length} {t("total","total")} · {recurringCount} {t("recurring","recurrentes")}</p>
                  </div>
                </div>
                <Link to="/schedule-pickup">
                  <div className="inline-flex items-center gap-1.5 bg-sky-600 hover:bg-sky-700 text-white rounded-xl px-4 py-2 text-xs font-black uppercase tracking-wider shadow-sm transition-all cursor-pointer active:scale-95">
                    + {t("New Pickup","Nueva recogida")}
                  </div>
                </Link>
              </div>
              <div className="flex flex-wrap gap-2.5 items-center">
                <div className="flex bg-slate-100 rounded-xl p-1 gap-0.5">
                  {[
                    { key: "all",       label: t("All","Todas") },
                    { key: "recurring", label: t("Recurring","Recurrentes"), icon: <Repeat className="w-3 h-3" /> },
                    { key: "once",      label: t("One-time","Únicas") },
                  ].map(f => (
                    <button key={f.key} onClick={() => setOrderFilter(f.key)}
                      className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${orderFilter === f.key ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
                      {f.icon}{f.label}
                    </button>
                  ))}
                </div>
                <input type="text" value={ordersSearch} onChange={e => setOrdersSearch(e.target.value)}
                  placeholder={t("Search orders…","Buscar órdenes…")}
                  className="flex-1 min-w-[140px] border border-slate-200 bg-white rounded-xl px-3.5 py-2 text-xs text-slate-700 placeholder-slate-300 focus:outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100 transition-all" />
              </div>
            </div>

            <div className="p-5">
              {filteredOrders.length === 0 ? (
                <div className="text-center py-16">
                  <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <Package className="h-8 w-8 text-slate-300" />
                  </div>
                  <p className="text-slate-500 font-semibold mb-1">{t("No orders found","No se encontraron órdenes")}</p>
                  <p className="text-slate-400 text-xs mb-6">{t("Schedule your first pickup today","Programa tu primera recogida hoy")}</p>
                  <Link to="/schedule-pickup">
                    <div className="inline-flex items-center gap-2 bg-sky-600 text-white rounded-xl px-6 py-3 text-sm font-bold cursor-pointer hover:bg-sky-700 transition-all active:scale-95">
                      🚚 {t("Schedule Pickup","Programar Recogida")}
                    </div>
                  </Link>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {paginatedOrders.map((order, i) => {
                    const isExpanded = viewingOrderDetails === order.id;
                    return (
                      <Reveal key={order.id} delay={i * 40} dir="up">
                        <div className={`relative rounded-xl border overflow-hidden transition-all duration-300 bg-white ${order.is_recurring ? "border-sky-100 hover:border-sky-300" : "border-slate-100 hover:border-slate-200"} hover:shadow-sm`} id={`order-${order.id}`}>
                          {order.is_recurring && <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-gradient-to-b from-sky-400 to-indigo-500" />}
                          <div className={`p-4 ${order.is_recurring ? "pl-5" : ""}`}>
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-2 flex-wrap">
                                  <span className="text-base">{SERVICE_ICONS[order.service_type] || "🧺"}</span>
                                  <span className="font-bold text-slate-800 text-sm font-mono">{order.order_number}</span>
                                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border ${statusCls(order.status)}`}>
                                    {statusLabel(order.status)}
                                  </span>
                                  {order.payment_status && !isOrderCoveredByMembership(order) && (
                                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border ${paymentStatusLabel(order.payment_status).cls}`}>
                                      {paymentStatusLabel(order.payment_status).label}
                                    </span>
                                  )}
                                  {isOrderCoveredByMembership(order) && (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-50 text-emerald-600 border border-emerald-200">
                                      ✓ {t("Covered","Cubierto")}
                                    </span>
                                  )}
                                  {order.is_recurring && <RecurrenceBadge recurrence={order.recurrence} locale={locale} />}
                                  {order.weight_lbs && (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border bg-sky-50 text-sky-600 border-sky-200">
                                      ⚖️ {order.weight_lbs} lbs
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-3 text-xs text-slate-400 flex-wrap">
                                  <span className="flex items-center gap-1">
                                    <Calendar className="h-3 w-3" />
                                    {order.pickup_date ? parseLocalDate(order.pickup_date).toLocaleDateString(locale === "es" ? "es-ES" : "en-US", { month: "short", day: "numeric", year: "numeric" }) : "TBD"}
                                  </span>
                                  {order.pickup_time_window && <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{order.pickup_time_window}</span>}
                                  {order.pickup_address && <span className="flex items-center gap-1 truncate max-w-[180px]"><MapPin className="h-3 w-3 flex-shrink-0" />{order.pickup_address.split(",")[0]}</span>}
                                </div>
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                {order.total_amount != null && (
                                  isOrderCoveredByMembership(order)
                                    ? null
                                    : <span className="font-black text-sky-600 text-lg tabular-nums">{formatCurrency(hasMembership && order.extra_charge != null ? order.extra_charge : order.total_amount)}</span>
                                )}
                                <button
                                  onClick={() => setViewingOrderDetails(prev => prev === order.id ? null : order.id)}
                                  className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-200 ${isExpanded ? "bg-sky-100 text-sky-600" : "bg-slate-100 text-slate-400 hover:bg-slate-200"}`}>
                                  <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-300 ${isExpanded ? "rotate-180" : ""}`} />
                                </button>
                              </div>
                            </div>

                            {order.is_recurring && order.recurrence && order.recurrence !== "once" && (
                              <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-3 flex-wrap">
                                <RecurrenceManager order={order} t={t} locale={locale} onUpdate={fetchOrders} />
                                {order.recurrence_end_date && (
                                  <span className="text-xs text-slate-400 flex items-center gap-1">
                                    <Clock className="w-3 h-3" />{t("Ends", "Termina")} {order.recurrence_end_date}
                                  </span>
                                )}
                              </div>
                            )}

                            {isExpanded && (
                              <OrderDetail
                                order={order}
                                hasMembership={hasMembership}
                                customerToken={customerToken}
                                t={t}
                                isOrderCoveredByMembership={isOrderCoveredByMembership}
                                canShowPaymentButtons={canShowPaymentButtons}
                                isPendingVerification={isPendingVerification}
                                handlePayStripe={handlePayStripe}
                                payingOrderId={payingOrderId}
                                setPaymentModal={setPaymentModal}
                                handleUploadReceipt={handleUploadReceipt}
                                uploadingReceipt={uploadingReceipt}
                              />
                            )}
                          </div>
                        </div>
                      </Reveal>
                    );
                  })}
                  {hasMore && (
                    <div className="pt-2 text-center">
                      <button onClick={() => setOrdersPage(p => p + 1)} className="inline-flex items-center gap-2 px-5 py-2 rounded-xl border border-slate-200 text-slate-500 text-xs font-semibold hover:border-sky-300 hover:text-sky-600 hover:bg-sky-50 transition-all">
                        {t("Load more","Cargar más")} <ChevronDown className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                  {ordersPage > 1 && !hasMore && (
                    <div className="pt-2 text-center">
                      <button onClick={() => setOrdersPage(1)} className="inline-flex items-center gap-2 px-5 py-2 rounded-xl border border-slate-200 text-slate-500 text-xs font-semibold hover:border-slate-300 transition-all">
                        {t("Show less","Mostrar menos")} <ChevronUp className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </GlassCard>
        </Reveal>

        {/* Profile */}
        <Reveal delay={180} dir="up">
          <GlassCard>
            <SectionHeader
              icon={User}
              iconColor="from-slate-600 to-slate-800"
              title={t("My Profile","Mi Perfil")}
              subtitle={t("Personal information","Información personal")}
              action={
                !editingProfile ? (
                  <button onClick={startEditProfile} data-testid="edit-profile-btn"
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 text-slate-500 text-xs font-semibold hover:border-slate-300 hover:bg-slate-50 transition-all">
                    <Edit3 className="w-3.5 h-3.5" />{t("Edit","Editar")}
                  </button>
                ) : (
                  <div className="flex gap-2">
                    <button onClick={() => setEditingProfile(false)} className="px-3 py-2 rounded-xl border border-slate-200 text-slate-500 text-xs font-semibold hover:bg-slate-50 transition-all">{t("Cancel","Cancelar")}</button>
                    <button onClick={handleSaveProfile} disabled={savingProfile} data-testid="save-profile-btn"
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-800 text-white text-xs font-bold hover:bg-slate-700 transition-all disabled:opacity-50">
                      {savingProfile ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                      {t("Save","Guardar")}
                    </button>
                  </div>
                )
              }
            />
            <div className="p-6">
              {editingProfile && (
                <div className="space-y-4">
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">{t("Full Name","Nombre completo")}</label>
                      <input value={profileForm.name} onChange={e => setProfileForm(p => ({...p, name: e.target.value}))} className={inputCls} data-testid="profile-name-input" />
                    </div>
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">{t("Phone","Teléfono")}</label>
                      <input value={profileForm.phone} onChange={e => setProfileForm(p => ({...p, phone: e.target.value}))} className={inputCls} placeholder="(805) 555-1234" data-testid="profile-phone-input" />
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">{t("Street Address","Dirección")}</label>
                    <AddressAutocomplete
                      value={profileForm.address}
                      onChange={(val) => setProfileForm(p => ({...p, address: val}))}
                      onSelect={(parsed) => {
                        const fullAddress = parsed.display || parsed.full || parsed.street || "";
                        setProfileForm(p => ({
                          ...p,
                          address: fullAddress,
                          city: parsed.city || p.city,
                          state: parsed.state || p.state,
                          zip_code: parsed.zip || p.zip_code
                        }));
                      }}
                      placeholder={t("Start typing your address...", "Escribe tu dirección...")}
                      inputClassName={inputCls}
                      countryCode="us"
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">{t("City","Ciudad")}</label>
                      <input value={profileForm.city} onChange={e => setProfileForm(p => ({...p, city: e.target.value}))} className={inputCls} placeholder="Ventura" data-testid="profile-city-input" />
                    </div>
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">{t("State","Estado")}</label>
                      <input value={profileForm.state} onChange={e => setProfileForm(p => ({...p, state: e.target.value}))} className={inputCls} placeholder="CA" data-testid="profile-state-input" />
                    </div>
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">{t("Zip","C.P.")}</label>
                      <input value={profileForm.zip_code} onChange={e => setProfileForm(p => ({...p, zip_code: e.target.value}))} className={inputCls} placeholder="93003" data-testid="profile-zip-input" />
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-400">{t("This information auto-fills your service forms.","Esta información auto-completa tus formularios.")}</p>
                </div>
              )}
              {!editingProfile && (
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100 h-fit">
                  <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">{t("Address","Dirección")}</p>
                  {customer?.address
                    ? <p className="text-slate-700 font-semibold text-sm flex items-start gap-1.5"><MapPin className="w-3.5 h-3.5 text-slate-400 mt-0.5 flex-shrink-0" /><span className="break-words">{customer.address}</span></p>
                    : <button onClick={startEditProfile} className="text-sky-500 text-xs font-bold hover:underline">+ {t("Add address","Agregar dirección")}</button>}
                </div>
              )}
            </div>
          </GlassCard>
        </Reveal>

      </div>
      <PublicFooter />
    </div>
  </>);
}