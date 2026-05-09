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
  RotateCcw, Repeat, AlertCircle, Pause, Play, Trash2, Key, ChevronUp,
  User, Shield, Bell, Star, TrendingUp, Zap, ChevronRight
} from "lucide-react";
import PublicNav from "../components/PublicNav";
import PublicFooter from "../components/PublicFooter";
import { useLocale } from "../context/LocaleContext";

// ─── Helper para fechas sin hora (evita desfase UTC) ────────────────────
const parseLocalDate = (dateStr) => {
  if (!dateStr) return null;
  if (dateStr.includes("T")) return new Date(dateStr);
  return new Date(dateStr + "T12:00:00");
};

// ─── Status configs ────────────────────────────────────────────────────────────
const statusConfig = {
  new:              { label: { en: "New",             es: "Nueva"      }, cls: "bg-blue-50 text-blue-600 border-blue-200/60", dot: "#3b82f6" },
  confirmed:        { label: { en: "Confirmed",       es: "Confirmada" }, cls: "bg-violet-50 text-violet-600 border-violet-200/60", dot: "#7c3aed" },
  processing:       { label: { en: "Processing",      es: "Procesando" }, cls: "bg-amber-50 text-amber-600 border-amber-200/60", dot: "#d97706" },
  ready:            { label: { en: "Ready",           es: "Lista"      }, cls: "bg-violet-50 text-violet-600 border-violet-200/60", dot: "#7c3aed" },
  out_for_delivery: { label: { en: "Out for Delivery",es: "En camino"  }, cls: "bg-orange-50 text-orange-600 border-orange-200/60", dot: "#ea580c" },
  delivered:        { label: { en: "Delivered",       es: "Entregada"  }, cls: "bg-emerald-50 text-emerald-600 border-emerald-200/60", dot: "#059669" },
  completed:        { label: { en: "Completed",       es: "Completada" }, cls: "bg-emerald-50 text-emerald-600 border-emerald-200/60", dot: "#059669" },
  cancelled:        { label: { en: "Cancelled",       es: "Cancelada"  }, cls: "bg-red-50 text-red-600 border-red-200/60", dot: "#dc2626" },
};

const RECURRENCE_LABELS = {
  once:       { en: "One time",      es: "Una sola vez",     icon: "1️⃣" },
  weekly:     { en: "Every week",    es: "Cada semana",      icon: "📅" },
  biweekly:   { en: "Every 2 weeks", es: "Cada 2 semanas",   icon: "📆" },
  twice_week: { en: "Twice a week",  es: "Dos veces/semana", icon: "🔄" },
};

const SERVICE_ICONS = {
  pickup_delivery: "🚚",
  airbnb_host:     "🏠",
  commercial:      "🏢",
  wash_fold:       "🧺",
};

// ─── Hooks ────────────────────────────────────────────────────────────────────
function useInView(threshold = 0.1) {
  const ref = useRef(null);
  const [v, setV] = useState(false);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setV(true); obs.disconnect(); } }, { threshold });
    obs.observe(el); return () => obs.disconnect();
  }, []);
  return [ref, v];
}

function useCursor() {
  const ring = useRef(null); const dot = useRef(null);
  const p = useRef({ x: -200, y: -200 }); const l = useRef({ x: -200, y: -200 }); const raf = useRef(null);
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

// ─── UI primitives ────────────────────────────────────────────────────────────
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

// ─── Portal Modal Wrapper ──────────────────────────────────────────────────────
const PortalModal = ({ onClose, children }) => {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);
  return ReactDOM.createPortal(
    <div onClick={onClose} style={{ position:"fixed",top:0,left:0,right:0,bottom:0,width:"100vw",height:"100vh",zIndex:99999,display:"flex",alignItems:"center",justifyContent:"center",padding:"1rem",background:"rgba(2,8,20,0.72)",backdropFilter:"blur(10px)",WebkitBackdropFilter:"blur(10px)",overflowY:"auto" }}>
      <div onClick={e => e.stopPropagation()} style={{ width:"100%",maxWidth:"28rem",position:"relative" }}>
        {children}
      </div>
    </div>,
    document.body
  );
};

// ─── Glass Card ───────────────────────────────────────────────────────────────
const GlassCard = ({ children, className = "", accent = false, onClick }) => (
  <div onClick={onClick} className={`relative rounded-2xl border overflow-hidden transition-all duration-300 ${accent ? "border-sky-200/60 bg-gradient-to-br from-sky-50/80 to-white" : "border-slate-200/60 bg-white/90"} shadow-sm hover:shadow-md ${className}`}>
    {children}
  </div>
);

// ─── Section Header ───────────────────────────────────────────────────────────
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

// ─── Status Badge ─────────────────────────────────────────────────────────────
const StatusBadge = ({ status, config }) => {
  const cfg = config[status];
  if (!cfg) return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-500 border border-slate-200">{status}</span>;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border ${cfg.cls}`}>
      {cfg.dot && <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: cfg.dot }} />}
      {cfg.label ? (cfg.label.en || cfg.label) : status}
    </span>
  );
};

// ─── Preferences Skeleton ─────────────────────────────────────────────────────
const PreferencesSkeleton = () => (
  <div className="space-y-5 animate-pulse pt-5">
    {[1,2,3].map(i => (
      <div key={i} className="grid sm:grid-cols-3 gap-4">
        {[1,2,3].map(j => <div key={j} className="h-[72px] bg-slate-100 rounded-xl" />)}
      </div>
    ))}
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

// ─── Recurrence Manager ───────────────────────────────────────────────────────
const RecurrenceManager = ({ order, t, locale, onUpdate }) => {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editRecurrence, setEditRecurrence] = useState(order.recurrence || "once");
  const [editDays, setEditDays] = useState(order.recurrence_days || []);
  const [editEndDate, setEditEndDate] = useState(order.recurrence_end_date || "");
  const [cancelFuture, setCancelFuture] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [daysWarning, setDaysWarning] = useState("");

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

  const isSaveDisabled = () => saving || (editRecurrence === "twice_week" && editDays.length !== 2);
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
            <div className="relative bg-gradient-to-br from-sky-600 via-sky-500 to-blue-600 px-6 py-6 overflow-hidden">
              <div className="relative flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center"><Repeat className="w-4 h-4 text-white" /></div>
                    <h3 className="text-white font-black text-lg">{t("Recurring Schedule", "Programación Recurrente")}</h3>
                  </div>
                  <p className="text-white/60 text-xs font-mono ml-10">{order.order_number}</p>
                </div>
                <button onClick={() => setOpen(false)} className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center"><X className="w-4 h-4 text-white" /></button>
              </div>
            </div>
            <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
              {loading ? (
                <div className="flex flex-col items-center justify-center py-10 gap-3">
                  <div className="w-8 h-8 border-2 border-sky-200 border-t-sky-500 rounded-full animate-spin" />
                  <p className="text-xs text-slate-400">{t("Loading schedule…", "Cargando horario…")}</p>
                </div>
              ) : (
                <>
                  <div className="rounded-xl bg-gradient-to-br from-slate-50 to-slate-100/50 border border-slate-200/60 p-4">
                    <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-3">{t("Current frequency", "Frecuencia actual")}</p>
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{recurrenceOptions.find(opt => opt.key === editRecurrence)?.icon || "1️⃣"}</span>
                      <div>
                        <p className="font-bold text-slate-800">{locale === "es" ? recurrenceOptions.find(opt => opt.key === editRecurrence)?.label.es : recurrenceOptions.find(opt => opt.key === editRecurrence)?.label.en}</p>
                        {editRecurrence === "twice_week" && editDays.length > 0 && (
                          <p className="text-xs text-slate-500 mt-1">{editDays.map(d => { const w = WEEKDAYS.find(wd => wd.key === d); return w ? (locale === "es" ? w.label.es : w.label.en) : d; }).join(", ")}</p>
                        )}
                        {data?.recurrence_end_date && <p className="text-xs text-slate-400 mt-1">{t("Until", "Hasta")} {data.recurrence_end_date}</p>}
                      </div>
                    </div>
                  </div>
                  {data?.upcoming_pickups?.length > 0 && (
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2">{t("Upcoming scheduled pickups", "Próximos pickups programados")}</p>
                      <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                        {data.upcoming_pickups.slice(0, 5).map((p, i) => (
                          <div key={p.id || i} className="flex items-center justify-between text-sm p-2.5 rounded-xl bg-sky-50 border border-sky-100">
                            <span className="flex items-center gap-2"><Calendar className="w-3.5 h-3.5 text-sky-400" /><span className="font-semibold text-slate-700 text-xs">{p.pickup_date}</span></span>
                            <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-sky-100 text-sky-600 border border-sky-200">{p.order_number}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2.5">{t("Change frequency", "Cambiar frecuencia")}</p>
                    <div className="grid grid-cols-2 gap-2">
                      {recurrenceOptions.map(opt => (
                        <button key={opt.key} type="button" onClick={() => { setEditRecurrence(opt.key); if (opt.key !== "twice_week") setDaysWarning(""); }}
                          className={`flex items-center gap-2.5 p-3 rounded-xl border text-sm font-semibold transition-all ${editRecurrence === opt.key ? "border-sky-400 bg-sky-50 text-sky-700 shadow-sm" : "border-slate-200 text-slate-600 hover:border-sky-200 hover:bg-slate-50"}`}>
                          <span className="text-base">{opt.icon}</span>
                          <span className="text-xs">{locale === "es" ? opt.label.es : opt.label.en}</span>
                          {editRecurrence === opt.key && <CheckCircle className="w-3.5 h-3.5 ml-auto text-sky-500" />}
                        </button>
                      ))}
                    </div>
                  </div>
                  {editRecurrence === "twice_week" && (
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2">{t("Select exactly two days for pickup", "Selecciona exactamente dos días para la recogida")}</p>
                      <div className="flex flex-wrap gap-2.5">
                        {WEEKDAYS.map(day => {
                          const isSelected = editDays.includes(day.key);
                          return (
                            <button key={day.key} type="button" onClick={() => toggleDay(day.key)}
                              className={`px-3.5 py-2 rounded-xl text-xs font-bold uppercase border transition-all ${isSelected ? "border-sky-400 bg-sky-50 text-sky-600 shadow-sm" : "border-slate-200 text-slate-500 hover:border-sky-200 hover:bg-slate-50"}`}>
                              {locale === "es" ? day.label.es : day.label.en}
                            </button>
                          );
                        })}
                      </div>
                      {daysWarning && <p className="text-[11px] text-red-600 mt-2 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{daysWarning}</p>}
                      {!daysWarning && editDays.length !== 2 && editDays.length > 0 && (
                        <p className="text-[11px] text-amber-600 mt-2 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{t("You need exactly 2 days selected", "Debes seleccionar exactamente 2 días")}</p>
                      )}
                    </div>
                  )}
                  {editRecurrence !== "once" && (
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">{t("Recurring until (optional)", "Recurrente hasta (opcional)")}</label>
                      <input type="date" value={editEndDate} onChange={e => setEditEndDate(e.target.value)} min={new Date().toISOString().split("T")[0]}
                        className="mt-1.5 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100 transition-all" />
                      <p className="text-[11px] text-slate-400 mt-1">{t("Leave empty for indefinite", "Deja vacío para indefinido")}</p>
                    </div>
                  )}
                  {editRecurrence !== "once" && (
                    <label className="flex items-start gap-3 cursor-pointer p-3 rounded-xl border border-slate-100 hover:bg-slate-50 transition-colors">
                      <input type="checkbox" checked={cancelFuture} onChange={e => setCancelFuture(e.target.checked)} className="mt-0.5 w-4 h-4 accent-sky-500 rounded" />
                      <span className="text-xs text-slate-600 leading-relaxed">{t("Cancel all pending future pickups when saving", "Cancelar todos los pickups futuros pendientes al guardar")}</span>
                    </label>
                  )}
                  <div className="flex gap-2.5 pt-1">
                    <button onClick={handleSave} disabled={isSaveDisabled()}
                      className={`flex-1 bg-sky-600 hover:bg-sky-700 text-white rounded-xl py-3 text-sm font-bold transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-sm shadow-sky-200 ${isSaveDisabled() ? "opacity-50 cursor-not-allowed" : ""}`}>
                      {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Save className="w-4 h-4" />}
                      {t("Save changes", "Guardar cambios")}
                    </button>
                    {(data?.is_recurring || order.is_recurring) && (
                      <button onClick={() => setConfirmCancel(true)} className="px-4 py-3 rounded-xl border border-red-200 text-red-500 hover:bg-red-50 text-sm font-semibold transition-all">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  {confirmCancel && (
                    <div className="p-4 rounded-xl bg-red-50 border border-red-200">
                      <p className="text-sm font-bold text-red-700 mb-3 flex items-center gap-2"><AlertCircle className="w-4 h-4" />{t("Cancel all future pickups?", "¿Cancelar todos los pickups futuros?")}</p>
                      <div className="flex gap-2">
                        <button onClick={handleCancelAll} disabled={saving} className="flex-1 bg-red-600 text-white rounded-xl py-2.5 text-sm font-bold hover:bg-red-700 disabled:opacity-50 transition-all">{t("Yes, cancel all", "Sí, cancelar todos")}</button>
                        <button onClick={() => setConfirmCancel(false)} className="flex-1 border border-slate-200 rounded-xl py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-all">{t("Keep", "Mantener")}</button>
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

// ─── Order Image Block ─────────────────────────────────────────────────────────
function OrderImageBlock({ orderId, type, token, t }) {
  const [blobUrl, setBlobUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [noImage, setNoImage] = useState(false);
  const isPickup  = type === "pickup";
  const endpoint  = `${process.env.REACT_APP_BACKEND_URL}/api/order/${orderId}/${type}-image/view`;

  useEffect(() => {
    let revoked = false;
    setLoading(true); setNoImage(false); setBlobUrl(null);
    fetch(endpoint, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then(async (res) => {
        if (!res.ok) { setNoImage(true); return; }
        const blob = await res.blob();
        if (!revoked) setBlobUrl(URL.createObjectURL(blob));
      })
      .catch(() => setNoImage(true))
      .finally(() => setLoading(false));
    return () => { revoked = true; if (blobUrl) URL.revokeObjectURL(blobUrl); };
  }, [orderId, type, token]);

  const openFull = async () => {
    try {
      const res = await fetch(endpoint, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const win = window.open(url, "_blank");
      if (win) setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch {}
  };

  const Icon = isPickup ? Camera : Truck;
  const title = isPickup ? t("Pickup Photo", "Foto de Recolección") : t("Delivery Photo", "Foto de Entrega");

  return (
    <div className={`rounded-xl p-4 border ${isPickup ? "bg-slate-50 border-slate-100" : "bg-emerald-50 border-emerald-100"}`}>
      <h4 className={`text-xs font-bold uppercase tracking-wider mb-3 flex items-center gap-2 ${isPickup ? "text-slate-500" : "text-emerald-700"}`}>
        <Icon className="w-3.5 h-3.5" />{title}
      </h4>
      {loading && <div className="flex items-center justify-center py-8"><div className="w-6 h-6 rounded-full border-2 border-slate-200 border-t-sky-500 animate-spin" /></div>}
      {!loading && noImage && <div className="text-center py-6 text-slate-400"><Icon className="w-8 h-8 mx-auto mb-2 opacity-30" /><p className="text-sm">{t("No photo yet", "Foto aún no disponible")}</p></div>}
      {!loading && blobUrl && (
        <div className="space-y-2">
          <div className={`relative rounded-lg overflow-hidden bg-white border ${isPickup ? "border-slate-200" : "border-emerald-200"}`}>
            <img src={blobUrl} alt={title} className="w-full h-auto max-h-72 object-contain cursor-pointer hover:opacity-90 transition-opacity" onClick={openFull} />
          </div>
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span className="flex items-center gap-1"><CheckCircle className="w-3.5 h-3.5 text-emerald-500" />{isPickup ? t("Driver confirmed pickup", "Conductor confirmó recolección") : t("Driver confirmed delivery", "Conductor confirmó entrega")}</span>
            <button onClick={openFull} className="hover:underline flex items-center gap-1 text-sky-500"><ExternalLink className="w-3 h-3" />{t("Full size", "Tamaño completo")}</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Payment Modal ─────────────────────────────────────────────────────────────
const PAYMENT_DEFAULTS = {
  zelle:   { phone: "(805) 626-2524", handle: "VFLaundry" },
  venmo:   { phone: "(805) 626-2524", handle: "@VFLaundry" },
  cashapp: { phone: "(805) 626-2524", tag: "$VFLaundry" },
};

function PaymentInstructionModal({ method, order, onClose, onReceiptUpload, uploadingReceipt, paymentInfo }) {
  const [copied, setCopied] = useState(null);
  if (!method || !order) return null;
  const amount = Number(order.total_amount || 0).toFixed(2);
  const orderNum = order.order_number || order.id;
  const info = paymentInfo || {};
  const copy = (text, key) => { navigator.clipboard.writeText(text).catch(() => {}); setCopied(key); setTimeout(() => setCopied(null), 2000); };
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
    } catch (err) { toast.error(err.response?.data?.detail || "Error marking payment"); }
  };
  return (
    <PortalModal onClose={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
        <div className={`bg-gradient-to-r ${cfg.color} px-6 py-5 flex items-center justify-between`}>
          <div><h3 className="text-white font-black text-lg">{cfg.title}</h3><p className="text-white/70 text-xs mt-0.5">Send payment then upload your receipt</p></div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center transition-all"><X className="w-4 h-4 text-white" /></button>
        </div>
        <div className="px-6 py-4">{cfg.rows.map((r, i) => <Row key={i} emoji={r.emoji} label={r.label} value={r.value} copyKey={r.copyKey} />)}</div>
        <div className="px-6 pb-6 space-y-3">
          <button onClick={handleMarkPayment} className={`w-full py-3 rounded-xl text-white font-bold text-sm bg-gradient-to-r ${cfg.color} hover:brightness-110 transition-all active:scale-95`}>
            ✅ I've sent the payment
          </button>
          <button onClick={() => { onClose(); onReceiptUpload(order.id, order.total_amount, method); }} disabled={uploadingReceipt?.orderId === order.id}
            className="w-full py-3 rounded-xl text-indigo-700 font-bold text-sm border-2 border-indigo-200 bg-indigo-50 hover:bg-indigo-100 transition-all flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50">
            {uploadingReceipt?.orderId === order.id ? <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" /> : <ScanLine className="w-4 h-4" />}
            📤 Upload receipt for instant verification
          </button>
        </div>
      </div>
    </PortalModal>
  );
}

// ─── Membership Usage Card ──────────────────────────────────────────────────────
function MembershipUsageCard({ usage, t, membershipPlan }) {
  if (!usage) return null;
  const pct     = Math.min(usage.pct_used, 100);
  const isLow   = usage.lbs_remaining <= usage.lbs_allowance * 0.15;
  const isEmpty = usage.lbs_remaining === 0;
  const barColor = isEmpty ? "#dc2626" : isLow ? "#f59e0b" : "#0ea5e9";
  const extraLbRate = usage.rate_per_extra_lb ?? (
    membershipPlan?.toLowerCase().includes("elite") ? 2.50 :
    membershipPlan?.toLowerCase().includes("premier") ? 1.35 : 1.50
  );
  const extraLbs = Math.max(0, (usage.lbs_used || 0) - (usage.lbs_allowance || 0));
  const extraCost = extraLbs > 0 ? (extraLbs * extraLbRate).toFixed(2) : null;
  const formatDate = (iso) => { if (!iso) return ""; return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" }); };

  return (
    <div style={{ background:"white", border: isEmpty ? "1.5px solid #fca5a5" : isLow ? "1.5px solid #fcd34d" : "1.5px solid #e2e8f0", borderRadius:16, overflow:"hidden", boxShadow:"0 1px 4px rgba(0,0,0,.06)" }}>
      <div style={{ padding:"14px 20px", borderBottom:"1px solid #f1f5f9", display:"flex", alignItems:"center", gap:10 }}>
        <div style={{ width:36, height:36, borderRadius:10, background: isEmpty ? "#fee2e2" : isLow ? "#fef3c7" : "rgba(14,165,233,.1)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:16, flexShrink:0 }}>🧺</div>
        <div style={{ flex:1 }}>
          <div style={{ fontWeight:700, fontSize:14, color:"#0f172a" }}>{t("Monthly Allowance", "Allowance Mensual")}</div>
          <div style={{ fontSize:11, color:"#94a3b8", marginTop:1 }}>{usage.plan} · {formatDate(usage.cycle_start)} – {formatDate(usage.cycle_end)}</div>
        </div>
        <div style={{ textAlign:"right" }}>
          <div style={{ fontSize:18, fontWeight:900, color:barColor, fontVariantNumeric:"tabular-nums" }}>
            {usage.lbs_remaining}<span style={{ fontSize:11, fontWeight:600, color:"#94a3b8", marginLeft:3 }}>lbs left</span>
          </div>
        </div>
      </div>
      <div style={{ padding:"14px 20px" }}>
        <div style={{ height:8, background:"#f1f5f9", borderRadius:99, overflow:"hidden", marginBottom:8 }}>
          <div style={{ height:"100%", width:`${pct}%`, background:barColor, borderRadius:99, transition:"width .5s ease" }} />
        </div>
        <div style={{ display:"flex", justifyContent:"space-between", fontSize:11, color:"#64748b" }}>
          <span><strong style={{ color:"#0f172a" }}>{usage.lbs_used}</strong> {t("lbs used", "lbs usados")}</span>
          <span>{t("of", "de")} <strong style={{ color:"#0f172a" }}>{usage.lbs_allowance}</strong> lbs</span>
        </div>
        <div style={{ marginTop:10, padding:"10px 12px", borderRadius:10, background:"#f8fafc", border:"1px solid #e2e8f0" }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", fontSize:11 }}>
            <span style={{ color:"#64748b" }}>{t("Extra lb rate", "Tarifa lb extra")}:&nbsp;<strong style={{ color:"#0f172a" }}>${extraLbRate.toFixed(2)}/lb</strong></span>
            {extraLbs > 0
              ? <span style={{ fontWeight:700, color:"#dc2626", fontSize:12 }}>+{extraLbs} lbs · <span style={{ color:"#dc2626" }}>${extraCost} {t("extra", "extra")}</span></span>
              : <span style={{ color:"#10b981", fontWeight:600 }}>✓ {t("Within allowance", "Dentro del límite")}</span>}
          </div>
        </div>
        {isEmpty && <div style={{ marginTop:10, padding:"8px 12px", borderRadius:8, background:"#fef2f2", border:"1px solid #fecaca", fontSize:11, color:"#b91c1c", fontWeight:600 }}>⚠️ {t("You've used your full allowance. Extra lbs will be billed at member rate.", "Has agotado tu allowance. Las libras extra se cobrarán a tarifa miembro.")}</div>}
        {!isEmpty && isLow && <div style={{ marginTop:10, padding:"8px 12px", borderRadius:8, background:"#fffbeb", border:"1px solid #fde68a", fontSize:11, color:"#92400e", fontWeight:600 }}>⚡ {t("Almost at your limit — only " + usage.lbs_remaining + " lbs remaining this cycle.", "Casi en tu límite — solo " + usage.lbs_remaining + " lbs restantes en este ciclo.")}</div>}
      </div>
    </div>
  );
}

// ─── MAIN ──────────────────────────────────────────────────────────────────────
export default function CustomerAccount() {
  const { t, locale } = useLocale();
  const navigate = useNavigate();
  const { ring, dot } = useCursor();

  const [activeStat, setActiveStat] = useState(null);
  const [customer, setCustomer] = useState(null);
  const [orders, setOrders] = useState([]);
  const [pendingPayments, setPendingPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [scrollY, setScrollY] = useState(0);
  const [prefOpen, setPrefOpen] = useState(true);
  const [hasMembership, setHasMembership] = useState(false);
  const [membershipPlan, setMembershipPlan] = useState(null);
  const [membershipUsage, setMembershipUsage] = useState(null);
  const [payingOrderId, setPayingOrderId] = useState(null);
  const [uploadingReceipt, setUploadingReceipt] = useState(null);
  const [paymentModal, setPaymentModal] = useState(null);
  const [paymentInfo, setPaymentInfo] = useState(null);
  const [customerToken, setCustomerToken] = useState(null);
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState({ name: "", phone: "", address: "", city: "", state: "", zip_code: "" });
  const [savingProfile, setSavingProfile] = useState(false);
  const [preferences, setPreferences] = useState({
    detergent_type: "", water_temperature: "", fabric_softener: "", dryer_sheets: "",
    bleach: "", drying: "", folding_style: "", special_care: "", garment_separation: "",
    hanging_instructions: "", allergies: "", special_instructions: "",
    pickup_time_preference: "", gate_code: "",
  });
  const [preferencesMeta, setPreferencesMeta] = useState({ updated_at: null, version: null });
  const [preferencesLoading, setPreferencesLoading] = useState(false);
  const [viewingOrderDetails, setViewingOrderDetails] = useState(null);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordData, setPasswordData] = useState({ current_password: "", new_password: "", confirm_password: "" });
  const [changingPassword, setChangingPassword] = useState(false);
  const [ordersPage, setOrdersPage] = useState(1);
  const ORDERS_PER_PAGE = 5;
  const [orderFilter, setOrderFilter] = useState("all");
  const [ordersSearch, setOrdersSearch] = useState("");
  const [pendingOpen, setPendingOpen] = useState(true);
  const [pendingPage, setPendingPage] = useState(1);
  const PENDING_PER_PAGE = 3;
  const [expandedPayment, setExpandedPayment] = useState(null);
  // ── Nuevos estados para "Aplicar membresía" ──────────────────────────────
  const [applyingMembership, setApplyingMembership] = useState(null); // orderId en proceso

  // ─── Helper: ¿la orden está cubierta por membresía? ─────────────────────
  const isOrderCoveredByMembership = (order) =>
    hasMembership && (!order.extra_charge || Number(order.extra_charge) === 0);

  const statusLabel = (s) => { const c = statusConfig[s]; return c ? (locale === "es" ? c.label.es : c.label.en) : s; };
  const statusCls   = (s) => statusConfig[s]?.cls || "bg-slate-100 text-slate-600 border-slate-200";

  const paymentStatusLabel = (s) => {
    const map = {
      unpaid:               { en: "Unpaid",  es: "Sin pagar", cls: "bg-red-50 text-red-600 border-red-200" },
      pending:              { en: "Pending", es: "Pendiente", cls: "bg-amber-50 text-amber-600 border-amber-200" },
      pending_verification: { en: "Pending", es: "Pendiente", cls: "bg-amber-50 text-amber-600 border-amber-200" },
      paid:                 { en: "Paid",    es: "Pagado",    cls: "bg-emerald-50 text-emerald-600 border-emerald-200" },
    };
    const cfg = map[s] || map.unpaid;
    return { label: locale === "es" ? cfg.es : cfg.en, cls: cfg.cls };
  };

  const isPendingVerification = (s) => s === "pending_verification" || s === "pending";

  // ─── Aplica membresía a una orden (marca como pagada vía membership) ────
  const handleApplyMembership = async (orderId) => {
    setApplyingMembership(orderId);
    try {
      // Intenta con endpoint dedicado; si no existe en tu backend, usa mark-zelle con method=membership
      await customerAxios.post(`/customer/order/${orderId}/apply-membership`);
      toast.success(t("Membership applied — order covered!", "¡Membresía aplicada — orden cubierta!"));
      fetchPendingPayments();
      fetchOrders();
      fetchMembershipUsage();
    } catch (err) {
      // Fallback: marcar como zelle con método "membership"
      try {
        await customerAxios.post(`/customer/order/${orderId}/mark-zelle?method=membership`);
        toast.success(t("Membership applied — order covered!", "¡Membresía aplicada — orden cubierta!"));
        fetchPendingPayments();
        fetchOrders();
        fetchMembershipUsage();
      } catch (err2) {
        toast.error(err2.response?.data?.detail || t("Could not apply membership", "No se pudo aplicar la membresía"));
      }
    } finally { setApplyingMembership(null); }
  };

  // ─── Fetch helpers ──────────────────────────────────────────────────────────
  const fetchOrders = async () => {
    try {
      const r = await customerAxios.get("/customer/orders");
      setOrders(r.data || []);
    } catch (err) { if (err.response?.status === 401) handleLogout(); }
    finally { setLoading(false); }
  };

  const fetchPendingPayments = async () => {
    try {
      const r = await customerAxios.get("/customer/pending-payments");
      setPendingPayments((r.data || []).filter(o => o.total_amount > 0));
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

  useEffect(() => {
    let ticking = false;
    const fn = () => { if (!ticking) { requestAnimationFrame(() => { setScrollY(window.pageYOffset); ticking = false; }); ticking = true; } };
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
    const paidOrderId = params.get("paid");
    if (paidOrderId) {
      customerAxios.post(`/customer/order/${paidOrderId}/confirm-payment`)
        .then(() => { toast.success(t("Payment confirmed!", "¡Pago confirmado!")); window.history.replaceState({}, "", "/account"); fetchOrders(); fetchPendingPayments(); })
        .catch(err => { if (err.response?.data?.detail === "Already paid") toast.success(t("Payment already confirmed", "Pago ya confirmado")); window.history.replaceState({}, "", "/account"); });
    }
    fetchOrders();
    fetchPendingPayments();
    fetchMembershipStatus().then(hasMem => {
      if (hasMem) { fetchPreferences(); fetchMembershipUsage(); }
    });
    customerAxios.get("/customer/me")
      .then(res => { if (res.data) { setCustomer(res.data); localStorage.setItem("customer_data", JSON.stringify(res.data)); } })
      .catch(() => {});
  }, [navigate]);

  useEffect(() => { setOrdersPage(1); }, [orderFilter, ordersSearch]);

  const handleSavePreferences = async () => {
    try {
      const r = await customerAxios.post("/customer/preferences", preferences);
      toast.success(t("Preferences saved", "Preferencias guardadas"));
      setPreferencesMeta({ updated_at: r.data.updated_at || null, version: r.data.version || null });
    } catch (err) {
      toast.error(err.response?.status === 403 ? t("Active membership required", "Se requiere membresía activa") : err.response?.data?.detail || t("Could not save preferences", "No se pudieron guardar las preferencias"));
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

  const handlePayStripe = async (orderId) => {
    setPayingOrderId(orderId);
    try {
      const r = await customerAxios.post(`/customer/order/${orderId}/checkout-auth`);
      if (r.data?.url) window.location.href = r.data.url;
      else toast.error(t("Could not create payment session", "No se pudo crear la sesión de pago"));
    } catch (err) { toast.error(err.response?.data?.detail || t("Payment error", "Error de pago")); }
    finally { setPayingOrderId(null); }
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
        const uploadRes = await customerAxios.post("/customer/upload-receipt", formData, { headers: { "Content-Type": "multipart/form-data" }, params: { context: `payment:${orderId}` } });
        toast.info(t("Analyzing with AI…", "Analizando con IA…"));
        const ocrRes = await customerAxios.post(`/customer/ocr-receipt/${uploadRes.data.id}`);
        const isValid = ocrRes.data.is_valid_payment;
        const extracted = ocrRes.data.amount;
        if (!isValid) { toast.error(ocrRes.data.rejection_reason || t("This doesn't appear to be a completed payment.", "Esto no parece un pago completado."), { duration: 8000 }); return; }
        const tolerance = Math.max(Number(expectedAmount) * 0.10, 1.00);
        if (Math.abs(extracted - Number(expectedAmount)) <= tolerance) {
          await customerAxios.post(`/customer/order/${orderId}/mark-zelle?method=${method}`);
          toast.success(t(`Payment of $${Number(extracted).toFixed(2)} verified!`, `¡Pago de $${Number(extracted).toFixed(2)} verificado!`));
          fetchPendingPayments(); fetchOrders();
        } else {
          toast.error(t(`Amount mismatch: expected $${Number(expectedAmount).toFixed(2)}, got $${Number(extracted).toFixed(2)}`, `Monto no coincide: esperado $${Number(expectedAmount).toFixed(2)}, obtenido $${Number(extracted).toFixed(2)}`), { duration: 8000 });
        }
      } catch (err) { toast.error(err.response?.data?.detail || t("Error processing receipt", "Error al procesar")); }
      finally { setUploadingReceipt(null); }
    };
    input.click();
  };

  const startEditProfile = () => {
    const addrParts = (customer?.address || "").split(",").map(s => s.trim());
    setProfileForm({ name: customer?.name || "", phone: (customer?.phone || "").replace(/^\+\d+\s?/, ""), address: customer?.address_line1 || addrParts[0] || "", city: customer?.city || addrParts[1] || "", state: customer?.state || addrParts[2] || "", zip_code: customer?.zip_code || addrParts[3] || "" });
    setEditingProfile(true);
  };

  const handleSaveProfile = async () => {
    setSavingProfile(true);
    try {
      const res = await customerAxios.put("/customer/me", profileForm);
      setCustomer(res.data); localStorage.setItem("customer_data", JSON.stringify(res.data));
      setEditingProfile(false); toast.success(t("Profile updated", "Perfil actualizado"));
    } catch (err) { toast.error(err.response?.data?.detail || t("Could not update profile", "No se pudo actualizar el perfil")); }
    finally { setSavingProfile(false); }
  };

  const setPref = (k, v) => setPreferences(p => ({ ...p, [k]: v }));
  const formatDate = (ds) => {
    if (!ds) return "";
    return new Date(ds).toLocaleDateString(locale === "es" ? "es-ES" : "en-US", { year: "numeric", month: "long", day: "numeric" });
  };

  const PICKUP_STATUSES   = ["picked_up","processing","ready","out_for_delivery","delivered","completed"];
  const DELIVERY_STATUSES = ["delivered","completed"];

  const filteredOrders = orders.filter(o => {
    const matchFilter = orderFilter === "all" ? true : orderFilter === "recurring" ? o.is_recurring : !o.is_recurring;
    const q = ordersSearch.toLowerCase();
    const matchSearch = !q || (o.order_number || "").toLowerCase().includes(q) || (o.service_type || "").toLowerCase().includes(q) || (o.pickup_date || "").includes(q);
    return matchFilter && matchSearch;
  });

  const paginatedOrders = filteredOrders.slice(0, ordersPage * ORDERS_PER_PAGE);
  const hasMore = ordersPage * ORDERS_PER_PAGE < filteredOrders.length;
  const recurringCount = orders.filter(o => o.is_recurring).length;

  const getStatList = (key) => ({
    orders:    orders,
    active:    orders.filter(o => ["new","processing","confirmed"].includes(o.status)),
    recurring: orders.filter(o => o.is_recurring),
    done:      orders.filter(o => o.status === "completed"),
  }[key] || []);

  // ── Separar pendientes: cubiertos por membresía vs. requieren pago real ──
  const membershipCoveredPending = pendingPayments.filter(o => isOrderCoveredByMembership(o));
  const realPendingPayments      = pendingPayments.filter(o => !isOrderCoveredByMembership(o));

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
    {paymentModal && (
      <PaymentInstructionModal method={paymentModal.method} order={paymentModal.order}
        onClose={() => setPaymentModal(null)} onReceiptUpload={handleUploadReceipt}
        uploadingReceipt={uploadingReceipt} paymentInfo={paymentInfo} />
    )}

    {showPasswordModal && (
      <PortalModal onClose={() => setShowPasswordModal(false)}>
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
          <div className="relative bg-gradient-to-br from-slate-800 to-slate-900 px-6 py-6 overflow-hidden">
            <div className="absolute inset-0 opacity-10" style={{ backgroundImage: "radial-gradient(circle at 30% 50%, white 1px, transparent 1px)", backgroundSize: "20px 20px" }} />
            <div className="relative flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center"><Key className="w-4 h-4 text-white" /></div>
                <div>
                  <h3 className="text-white font-black text-lg">{t("Change Password", "Cambiar contraseña")}</h3>
                  <p className="text-white/50 text-xs">{t("Keep your account secure", "Mantén tu cuenta segura")}</p>
                </div>
              </div>
              <button onClick={() => setShowPasswordModal(false)} className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center transition-all"><X className="w-4 h-4 text-white" /></button>
            </div>
          </div>
          <div className="px-6 py-5 space-y-4">
            {[
              { key: "current_password", label: t("Current Password", "Contraseña actual"), placeholder: "••••••••" },
              { key: "new_password",     label: t("New Password", "Nueva contraseña"),     placeholder: t("Min. 6 characters", "Mín. 6 caracteres") },
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
      @keyframes fadeUp   { from { opacity:0; transform:translateY(20px) } to { opacity:1; transform:translateY(0) } }
      @keyframes float    { 0%,100% { transform:translateY(0) } 50% { transform:translateY(-6px) } }
      @keyframes shimmer  { 0% { background-position: -200% 0 } 100% { background-position: 200% 0 } }
      .float-anim  { animation: float 4s ease-in-out infinite; }
      .fade-up     { animation: fadeUp 0.6s ease-out both; }
    `}</style>

    <div className="min-h-screen bg-slate-50 overflow-x-hidden">
      <PublicNav />

      {/* ── Hero ── */}
      <section className="relative overflow-hidden pt-24 pb-36">
        <div className="absolute inset-0" style={{ backgroundImage:"url('https://images.unsplash.com/photo-1545173168-9f1947eebb7f?w=1920&h=600&fit=crop')", backgroundSize:"cover", backgroundPosition:"center 30%", transform:`translateY(${scrollY*0.12}px) scale(1.06)`, opacity: 0.75 }} />
        <div className="absolute inset-0 bg-gradient-to-b from-slate-900/92 via-slate-900/75 to-slate-50" />
        <div className="absolute top-20 right-20 w-64 h-64 rounded-full bg-sky-400/10 blur-3xl pointer-events-none" />
        <div className="absolute bottom-20 left-10 w-48 h-48 rounded-full bg-blue-400/10 blur-3xl pointer-events-none" />
        <div className="relative z-10 max-w-4xl mx-auto px-6 sm:px-8 pt-16">
          <div className="fade-up" style={{ animationDelay: "0.1s" }}>
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/10 backdrop-blur border border-white/15 mb-6">
              <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse" />
              <span className="text-[10px] text-white/70 font-black uppercase tracking-[0.2em]">{t("My Account", "Mi Cuenta")}</span>
            </div>
          </div>
          <h1 className="text-5xl sm:text-6xl font-light text-white mb-3 leading-tight fade-up" style={{ animationDelay: "0.2s" }}>
            {t("Welcome back,", "Bienvenido,")}
            <br />
            <span className="font-black bg-gradient-to-r from-white via-sky-200 to-white bg-clip-text text-transparent">{firstName}</span>
          </h1>
          <p className="text-white/50 text-base fade-up" style={{ animationDelay: "0.3s" }}>{customer?.email}</p>
          {recurringCount > 0 && (
            <div className="mt-6 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-sky-500/15 border border-sky-400/25 fade-up" style={{ animationDelay: "0.45s" }}>
              <Repeat className="w-4 h-4 text-sky-300" />
              <span className="text-sm text-white/80 font-semibold">
                {recurringCount} {t("recurring pickup(s) active", recurringCount === 1 ? "pickup recurrente activo" : "pickups recurrentes activos")}
              </span>
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

        {/* ── Profile Card ── */}
        <Reveal dir="up" delay={0}>
          <GlassCard className="hover:border-sky-200/60">
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

        {/* ── CTA Banner ── */}
        <Reveal delay={80} dir="scale">
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-sky-600 via-sky-500 to-blue-600 p-8 text-center shadow-lg shadow-sky-200/40">
            <div className="absolute inset-0 opacity-10" style={{ backgroundImage:"radial-gradient(circle, rgba(255,255,255,0.8) 1px, transparent 1px)", backgroundSize:"24px 24px" }} />
            <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full bg-white/10 blur-2xl" />
            <div className="absolute -bottom-8 -left-8 w-32 h-32 rounded-full bg-white/10 blur-2xl" />
            <div className="relative">
              <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center mx-auto mb-4 float-anim">
                <Sparkles className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-xl font-bold text-white mb-1">{t("Ready for your next pickup?","¿Listo para tu próxima recogida?")}</h3>
              <p className="text-white/60 text-sm mb-6">{t("Schedule in seconds, we'll handle the rest.","Programa en segundos, nosotros hacemos el resto.")}</p>
              <Link to="/schedule-pickup">
                <div className="inline-flex items-center gap-2 bg-white text-sky-600 rounded-full px-8 py-3 text-sm font-black uppercase tracking-wider shadow-lg cursor-pointer hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300 active:scale-95">
                  🚚 {t("Schedule Pickup","Programar Recogida")} <ArrowRight className="w-4 h-4" />
                </div>
              </Link>
            </div>
          </div>
        </Reveal>

        {/* ── Stats ── */}
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
                  <p className="text-[9px] text-sky-500 mt-1 font-semibold">{activeStat === s.key ? "▲ " + t("hide","ocultar") : "▼ " + t("details","detalles")}</p>
                </div>
              </GlassCard>
            </Reveal>
          ))}
        </div>

        {/* ── Stat Detail Drawer ── */}
        {activeStat && (
          <Reveal dir="up" delay={0} dur={300}>
            <GlassCard className="overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  {activeStat === "orders"    && <><Package      className="w-4 h-4 text-sky-500"     /><span className="font-bold text-slate-800 text-sm">{t("All orders","Todas las órdenes")}</span></>}
                  {activeStat === "active"    && <><Zap          className="w-4 h-4 text-amber-500"   /><span className="font-bold text-slate-800 text-sm">{t("Active orders","Órdenes activas")}</span></>}
                  {activeStat === "recurring" && <><Repeat       className="w-4 h-4 text-indigo-500"  /><span className="font-bold text-slate-800 text-sm">{t("Recurring pickups","Pickups recurrentes")}</span></>}
                  {activeStat === "done"      && <><CheckCircle  className="w-4 h-4 text-emerald-500" /><span className="font-bold text-slate-800 text-sm">{t("Completed","Completadas")}</span></>}
                  <span className="ml-1 text-[11px] text-slate-400">· {getStatList(activeStat).length} {t("orders","órdenes")}</span>
                </div>
                <button onClick={() => setActiveStat(null)} className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-all">
                  <X className="w-3.5 h-3.5 text-slate-500" />
                </button>
              </div>
              {activeStat === "recurring" && hasMembership && membershipUsage && (
                <div className="px-5 pt-4"><MembershipUsageCard usage={membershipUsage} t={t} membershipPlan={membershipPlan} /></div>
              )}
              {activeStat === "recurring" && hasMembership && membershipUsage && (membershipUsage.lbs_used > membershipUsage.lbs_allowance) && (
                <div className="px-5 pt-3">
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-2">
                    <p className="text-[10px] font-black uppercase tracking-wider text-amber-600 flex items-center gap-1.5">
                      <DollarSign className="w-3 h-3" />{t("Estimated extra charge this cycle","Cargo extra estimado este ciclo")}
                    </p>
                    {(() => {
                      const extraLbRate = membershipUsage.rate_per_extra_lb ?? (membershipPlan?.toLowerCase().includes("elite") ? 1.25 : membershipPlan?.toLowerCase().includes("premier") ? 1.35 : 1.50);
                      const extraLbs  = membershipUsage.lbs_used - membershipUsage.lbs_allowance;
                      const extraCost = (extraLbs * extraLbRate).toFixed(2);
                      return (
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-amber-800">{extraLbs} lbs × ${extraLbRate.toFixed(2)}/lb</span>
                          <span className="font-black text-amber-700 text-lg">${extraCost}</span>
                        </div>
                      );
                    })()}
                    <p className="text-[10px] text-amber-600">{t("This amount will be added to your next invoice.","Este monto se añadirá a tu próxima factura.")}</p>
                  </div>
                </div>
              )}
              <div className="p-4 space-y-2">
                {getStatList(activeStat).length === 0 ? (
                  <div className="text-center py-8 text-slate-400 text-sm">{t("No orders in this category","Sin órdenes en esta categoría")}</div>
                ) : (
                  getStatList(activeStat).slice(0, 5).map(order => (
                    <div key={order.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-slate-100 bg-white hover:border-slate-200 transition-all">
                      <span className="text-base flex-shrink-0">{SERVICE_ICONS[order.service_type] || "🧺"}</span>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-slate-700 text-xs font-mono">{order.order_number}</p>
                        <p className="text-[11px] text-slate-400 truncate flex items-center gap-1.5">
                          {order.pickup_date ? parseLocalDate(order.pickup_date).toLocaleDateString(locale === "es" ? "es-ES" : "en-US", { month:"short", day:"numeric" }) : "TBD"}
                          {order.is_recurring && <Repeat className="w-2.5 h-2.5 text-indigo-400 inline" />}
                          {order.weight_lbs && <span className="text-sky-500 font-semibold">{order.weight_lbs} lbs</span>}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border ${statusCls(order.status)}`}>
                          {statusLabel(order.status)}
                        </span>
                        {order.total_amount != null && (
                          isOrderCoveredByMembership(order)
                            ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-50 text-emerald-600 border border-emerald-200">✓ {t("Covered","Cubierto")}</span>
                            : <span className="font-black text-slate-700 text-sm tabular-nums">${Number(hasMembership && order.extra_charge ? order.extra_charge : order.total_amount).toFixed(2)}</span>
                        )}
                      </div>
                    </div>
                  ))
                )}
                {getStatList(activeStat).length > 5 && (
                  <button onClick={() => { setActiveStat(null); setOrderFilter(activeStat === "recurring" ? "recurring" : "all"); setTimeout(() => document.getElementById("orders-section")?.scrollIntoView({ behavior:"smooth" }), 100); }}
                    className="w-full py-2.5 rounded-xl border border-dashed border-slate-200 text-slate-400 text-xs font-semibold hover:border-sky-300 hover:text-sky-500 hover:bg-sky-50 transition-all flex items-center justify-center gap-1.5">
                    {t("See all in orders section","Ver todos en sección órdenes")} <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </GlassCard>
          </Reveal>
        )}

        {/* ── Membership Upsell ── */}
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
                    <p className="text-xs text-slate-400 mt-0.5">{t("Unlock laundry preferences & exclusive benefits", "Desbloquea preferencias y beneficios exclusivos")}</p>
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

        {/* ══════════════════════════════════════════════════════════════════════
            ── Membership-Covered Pending (banner verde, sin opciones de pago) ──
            ══════════════════════════════════════════════════════════════════════ */}
        {membershipCoveredPending.length > 0 && (
          <Reveal delay={75} dir="up">
            <GlassCard className="border-emerald-200/60">
              <div className="px-6 py-4 border-b border-emerald-100/60 flex items-center gap-3">
                <div className="w-9 h-9 bg-gradient-to-br from-emerald-400 to-teal-500 rounded-xl flex items-center justify-center shadow-sm flex-shrink-0">
                  <Award className="h-4 w-4 text-white" />
                </div>
                <div className="flex-1">
                  <h2 className="font-bold text-slate-800 text-base leading-tight">{t("Covered by Membership","Cubiertas por Membresía")}</h2>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {membershipCoveredPending.length} {t("order(s) within your plan allowance","orden(es) dentro de tu allowance")}
                  </p>
                </div>
                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-black">
                  <CheckCircle className="w-3 h-3" /> {t("No payment needed","Sin pago requerido")}
                </span>
              </div>
              <div className="px-5 py-4 space-y-2">
                {membershipCoveredPending.map(order => (
                  <div key={order.id} className="rounded-xl border border-emerald-100 bg-emerald-50/50 overflow-hidden">
                    <div className="px-4 py-3 flex items-center gap-3">
                      <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-emerald-100 border border-emerald-200 flex items-center justify-center text-base">
                        {SERVICE_ICONS[order.service_type] || "🧺"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-slate-700 text-xs font-mono tracking-tight">{order.order_number}</span>
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-700 border border-emerald-200">
                            <Award className="w-2.5 h-2.5" /> {t("Membership","Membresía")}
                          </span>
                          {order.pickup_date && <span className="text-[10px] text-slate-400">{order.pickup_date}</span>}
                        </div>
                        <p className="text-[11px] text-emerald-600 mt-0.5 font-medium">
                          ✓ {t("This order is covered by your membership allowance","Esta orden está cubierta por tu allowance de membresía")}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {/* Precio tachado + badge cubierto */}
                        <div className="text-right">
                          <p className="text-[10px] text-slate-400 line-through tabular-nums">${Number(order.total_amount||0).toFixed(2)}</p>
                          <p className="text-[10px] font-black text-emerald-600">$0.00</p>
                        </div>
                        <button
                          onClick={() => handleApplyMembership(order.id)}
                          disabled={applyingMembership === order.id}
                          className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all active:scale-95 disabled:opacity-60 shadow-sm">
                          {applyingMembership === order.id
                            ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            : <CheckCircle className="w-3.5 h-3.5" />}
                          {t("Apply membership","Aplicar membresía")}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
                {/* Info explicativa */}
                <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-xl bg-sky-50 border border-sky-100 mt-1">
                  <AlertCircle className="w-3.5 h-3.5 text-sky-500 flex-shrink-0 mt-0.5" />
                  <p className="text-[11px] text-sky-700 leading-relaxed">
                    {t(
                      "These orders are within your monthly allowance. Click \"Apply membership\" to confirm they're covered and remove them from pending.",
                      "Estas órdenes están dentro de tu allowance mensual. Haz clic en \"Aplicar membresía\" para confirmar que están cubiertas y quitarlas de pendientes."
                    )}
                  </p>
                </div>
              </div>
            </GlassCard>
          </Reveal>
        )}

        {/* ══════════════════════════════════════════════════════════════════════
            ── Real Pending Payments (solo órdenes que SÍ requieren pago) ──────
            ══════════════════════════════════════════════════════════════════════ */}
        {realPendingPayments.length > 0 && (
          <Reveal delay={80} dir="up">
            <GlassCard>
              <button onClick={() => setPendingOpen(p => !p)} className="w-full focus:outline-none group">
                <div className="px-6 py-4 flex items-center justify-between border-b border-amber-100/60">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 bg-gradient-to-br from-amber-400 to-orange-500 rounded-xl flex items-center justify-center shadow-sm flex-shrink-0">
                      <CreditCard className="h-4 w-4 text-white" />
                    </div>
                    <div className="text-left">
                      <h2 className="font-bold text-slate-800 text-base leading-tight">{t("Pending Payments","Pagos Pendientes")}</h2>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        <span className="font-bold text-amber-600">{realPendingPayments.length}</span> {t("orders · total","órdenes · total")} <span className="font-bold text-slate-600">${realPendingPayments.reduce((s,o)=>s+Number(o.total_amount||0),0).toFixed(2)}</span>
                      </p>
                    </div>
                  </div>
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all duration-300 ${pendingOpen ? "bg-amber-100 text-amber-600 rotate-180" : "bg-slate-100 text-slate-400 group-hover:bg-amber-50 group-hover:text-amber-500"}`}>
                    <ChevronDown className="w-3.5 h-3.5" />
                  </div>
                </div>
              </button>
              <div className={`overflow-hidden transition-all duration-400 ease-in-out ${pendingOpen ? "max-h-[2000px] opacity-100" : "max-h-0 opacity-0"}`}>
                <div className="px-5 py-4 space-y-2">
                  {realPendingPayments.slice(0, pendingPage * PENDING_PER_PAGE).map((order) => {
                    const isExpanded = expandedPayment === order.id;
                    const isPendingV = isPendingVerification(order.payment_status);
                    return (
                      <div key={order.id}
                        className={`rounded-xl border transition-all duration-200 overflow-hidden ${isExpanded ? "border-amber-200 shadow-sm" : "border-slate-100 hover:border-slate-200"} bg-white`}
                        data-testid={`pending-order-${order.order_number}`}>
                        <button onClick={() => setExpandedPayment(isExpanded ? null : order.id)}
                          className="w-full px-4 py-3 flex items-center gap-3 text-left focus:outline-none group/row">
                          <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-amber-50 border border-amber-100 flex items-center justify-center text-base">
                            {SERVICE_ICONS[order.service_type] || "🧺"}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-slate-700 text-xs font-mono tracking-tight">{order.order_number}</span>
                              {isPendingV ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-amber-50 text-amber-600 border border-amber-200">
                                  <Clock className="w-2.5 h-2.5" /> {t("Verifying","Verificando")}
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-red-50 text-red-500 border border-red-200">
                                  {t("Unpaid","Sin pagar")}
                                </span>
                              )}
                              {order.pickup_date && <span className="text-[10px] text-slate-400">{order.pickup_date}</span>}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <span className="font-black text-slate-800 text-sm tabular-nums">${Number(order.total_amount||0).toFixed(2)}</span>
                            <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${isExpanded ? "rotate-180 text-amber-500" : ""}`} />
                          </div>
                        </button>
                        {isExpanded && (
                          <div className="px-4 pb-4 border-t border-slate-100 pt-3 space-y-3">
                            {isPendingV ? (
                              <div className="flex items-center gap-2.5 p-3 rounded-xl bg-amber-50 border border-amber-200">
                                <div className="w-7 h-7 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0">
                                  <Clock className="w-3.5 h-3.5 text-amber-600" />
                                </div>
                                <p className="text-xs text-amber-700 font-medium leading-relaxed">
                                  {t("Payment submitted — our team will verify it shortly.", "Pago enviado — nuestro equipo lo verificará pronto.")}
                                </p>
                              </div>
                            ) : (
                              <>
                                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{t("Pay with","Pagar con")}</p>
                                <div className="flex gap-2 flex-wrap">
                                  {[
                                    { method:"zelle",   label:"Zelle",    bg:"#6D1ED4" },
                                    { method:"venmo",   label:"Venmo",    bg:"#0074DE" },
                                    { method:"cashapp", label:"Cash App", bg:"#00C244" },
                                  ].map(({ method, label, bg }) => (
                                    <button key={method} onClick={() => setPaymentModal({ method, order })}
                                      className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold text-white transition-all hover:opacity-90 active:scale-95"
                                      style={{ backgroundColor: bg }}>{label}</button>
                                  ))}
                                  <button onClick={() => handlePayStripe(order.id)} disabled={payingOrderId === order.id}
                                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold transition-all disabled:opacity-50 active:scale-95">
                                    {payingOrderId === order.id ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <CreditCard className="w-3 h-3" />}
                                    {t("Card","Tarjeta")}
                                  </button>
                                </div>
                                <button onClick={() => handleUploadReceipt(order.id, order.total_amount)} disabled={uploadingReceipt?.orderId === order.id}
                                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-dashed border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-500 text-xs font-semibold transition-all disabled:opacity-50">
                                  {uploadingReceipt?.orderId === order.id ? <div className="w-3.5 h-3.5 border-2 border-slate-500 border-t-transparent rounded-full animate-spin" /> : <ScanLine className="w-3.5 h-3.5" />}
                                  {t("Upload receipt for instant verification","Sube comprobante para verificación instantánea")}
                                </button>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {realPendingPayments.length > pendingPage * PENDING_PER_PAGE && (
                    <button onClick={() => setPendingPage(p => p + 1)}
                      className="w-full py-2.5 rounded-xl border border-dashed border-slate-200 text-slate-400 text-xs font-semibold hover:border-amber-300 hover:text-amber-600 hover:bg-amber-50 transition-all flex items-center justify-center gap-1.5">
                      <ChevronDown className="w-3.5 h-3.5" />
                      {t("Show more","Ver más")} ({realPendingPayments.length - pendingPage * PENDING_PER_PAGE} {t("remaining","restantes")})
                    </button>
                  )}
                </div>
              </div>
            </GlassCard>
          </Reveal>
        )}

        {/* ── Membership Usage + Preferences ── */}
        {hasMembership && (
          <>
            <Reveal delay={90} dir="up">
              <MembershipUsageCard usage={membershipUsage} t={t} membershipPlan={membershipPlan} />
            </Reveal>
            <Reveal delay={100} dir="up">
              <GlassCard data-testid="customer-preferences-card">
                <button onClick={() => setPrefOpen(p => !p)} className="w-full focus:outline-none group">
                  <SectionHeader
                    icon={Settings}
                    iconColor="from-sky-400 to-sky-600"
                    title={t("Laundry Preferences","Preferencias de Lavandería")}
                    subtitle={preferencesMeta.updated_at ? `${t("Updated","Actualizado")}: ${formatDate(preferencesMeta.updated_at)}` : t("Personalize your wash","Personaliza tu lavado")}
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
                          <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-3">{t("Cleaning Products","Productos de Limpieza")}</p>
                          <div className="grid sm:grid-cols-3 gap-4">
                            <Field label={t("Detergent","Detergente")}>
                              <Select value={preferences.detergent_type} onValueChange={v => setPref("detergent_type",v)}>
                                <SelectTrigger className="mt-1.5 rounded-xl border-slate-200 text-sm h-11" data-testid="customer-pref-detergent"><SelectValue placeholder={t("Select","Selecciona")} /></SelectTrigger>
                                <SelectContent>{["Tide Original","Tide + Oxi","Gain Original","Gain + Aroma Boost","Arm & Hammer","Persil ProClean","Foca","Roma","Ariel","OxiClean"].map(v=><SelectItem key={v} value={v}>{v}</SelectItem>)}<SelectItem value="No Preference">{t("No Preference","Sin preferencia")}</SelectItem></SelectContent>
                              </Select>
                            </Field>
                            <Field label={t("Fabric softener","Suavizante")}>
                              <Select value={preferences.fabric_softener} onValueChange={v => setPref("fabric_softener",v)}>
                                <SelectTrigger className="mt-1.5 rounded-xl border-slate-200 text-sm h-11" data-testid="customer-pref-softener"><SelectValue placeholder={t("Select","Selecciona")} /></SelectTrigger>
                                <SelectContent>{["Downy Original","Downy Ultra","Snuggle Blue Sparkle","Suavitel Field Flowers","Suavitel Morning Sun","Gain Softener","Bounce Liquid Softener"].map(v=><SelectItem key={v} value={v}>{v}</SelectItem>)}<SelectItem value="No Softener">{t("No Softener","Sin suavizante")}</SelectItem><SelectItem value="No Preference">{t("No Preference","Sin preferencia")}</SelectItem></SelectContent>
                              </Select>
                            </Field>
                            <Field label={t("Dryer sheets","Hojas de secadora")}>
                              <Select value={preferences.dryer_sheets} onValueChange={v => setPref("dryer_sheets",v)}>
                                <SelectTrigger className="mt-1.5 rounded-xl border-slate-200 text-sm h-11" data-testid="customer-pref-dryer-sheets"><SelectValue placeholder={t("Select","Selecciona")} /></SelectTrigger>
                                <SelectContent>{["Bounce Original","Gain Dryer Sheets","Snuggle Dryer Sheets","Downy Dryer Sheets","Suavitel Dryer Sheets"].map(v=><SelectItem key={v} value={v}>{v}</SelectItem>)}<SelectItem value="No Dryer Sheets">{t("No Dryer Sheets","Sin hojas")}</SelectItem><SelectItem value="No Preference">{t("No Preference","Sin preferencia")}</SelectItem></SelectContent>
                              </Select>
                            </Field>
                          </div>
                        </div>
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-3">{t("Wash Settings","Configuración de Lavado")}</p>
                          <div className="grid sm:grid-cols-3 gap-4">
                            <Field label={t("Bleach","Blanqueador")}>
                              <Select value={preferences.bleach} onValueChange={v => setPref("bleach",v)}>
                                <SelectTrigger className="mt-1.5 rounded-xl border-slate-200 text-sm h-11" data-testid="customer-pref-bleach"><SelectValue placeholder={t("Select","Selecciona")} /></SelectTrigger>
                                <SelectContent>{["Clorox Regular Bleach","OxiClean","Cloralex"].map(v=><SelectItem key={v} value={v}>{v}</SelectItem>)}<SelectItem value="No Bleach">{t("No Bleach","Sin blanqueador")}</SelectItem><SelectItem value="No Preference">{t("No Preference","Sin preferencia")}</SelectItem></SelectContent>
                              </Select>
                            </Field>
                            <Field label={t("Water temp","Temperatura")}>
                              <Select value={preferences.water_temperature} onValueChange={v => setPref("water_temperature",v)}>
                                <SelectTrigger className="mt-1.5 rounded-xl border-slate-200 text-sm h-11" data-testid="customer-pref-temperature"><SelectValue placeholder={t("Select","Selecciona")} /></SelectTrigger>
                                <SelectContent><SelectItem value="Cold">{t("Cold","Fría")}</SelectItem><SelectItem value="Warm">{t("Warm","Tibia")}</SelectItem><SelectItem value="Hot">{t("Hot","Caliente")}</SelectItem><SelectItem value="No Preference">{t("No Preference","Sin preferencia")}</SelectItem></SelectContent>
                              </Select>
                            </Field>
                            <Field label={t("Drying","Secado")}>
                              <Select value={preferences.drying} onValueChange={v => setPref("drying",v)}>
                                <SelectTrigger className="mt-1.5 rounded-xl border-slate-200 text-sm h-11" data-testid="customer-pref-drying"><SelectValue placeholder={t("Select","Selecciona")} /></SelectTrigger>
                                <SelectContent><SelectItem value="Low Heat">{t("Low Heat","Temperatura baja")}</SelectItem><SelectItem value="Medium Heat">{t("Medium Heat","Temperatura media")}</SelectItem><SelectItem value="High Heat">{t("High Heat","Temperatura alta")}</SelectItem><SelectItem value="No Preference">{t("No Preference","Sin preferencia")}</SelectItem></SelectContent>
                              </Select>
                            </Field>
                          </div>
                        </div>
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-3">{t("Garment Handling","Manejo de Prendas")}</p>
                          <div className="grid sm:grid-cols-3 gap-4">
                            <Field label={t("Folding style","Estilo de doblado")}>
                              <Select value={preferences.folding_style} onValueChange={v => setPref("folding_style",v)}>
                                <SelectTrigger className="mt-1.5 rounded-xl border-slate-200 text-sm h-11" data-testid="customer-pref-folding"><SelectValue placeholder={t("Select","Selecciona")} /></SelectTrigger>
                                <SelectContent><SelectItem value="Standard Fold">{t("Standard Fold","Estándar")}</SelectItem><SelectItem value="Retail Fold (Store Style)">{t("Retail Fold","Tipo tienda")}</SelectItem><SelectItem value="Hanging (Shirts Only)">{t("Hanging","Colgado (camisas)")}</SelectItem><SelectItem value="Fold + Hang Combination">{t("Fold + Hang","Doblado + colgado")}</SelectItem><SelectItem value="No Preference">{t("No Preference","Sin preferencia")}</SelectItem></SelectContent>
                              </Select>
                            </Field>
                            <Field label={t("Special care","Cuidado especial")}>
                              <Select value={preferences.special_care} onValueChange={v => setPref("special_care",v)}>
                                <SelectTrigger className="mt-1.5 rounded-xl border-slate-200 text-sm h-11" data-testid="customer-pref-special-care"><SelectValue placeholder={t("Select","Selecciona")} /></SelectTrigger>
                                <SelectContent><SelectItem value="Hypoallergenic Only">{t("Hypoallergenic Only","Solo hipoalergénico")}</SelectItem><SelectItem value="Baby Safe Products">{t("Baby Safe","Seguros para bebé")}</SelectItem><SelectItem value="No Harsh Chemicals">{t("No Harsh Chemicals","Sin químicos")}</SelectItem><SelectItem value="No Preference">{t("No Preference","Sin preferencia")}</SelectItem></SelectContent>
                              </Select>
                            </Field>
                            <Field label={t("Separation","Separación")}>
                              <Select value={preferences.garment_separation} onValueChange={v => setPref("garment_separation",v)}>
                                <SelectTrigger className="mt-1.5 rounded-xl border-slate-200 text-sm h-11" data-testid="customer-pref-separation"><SelectValue placeholder={t("Select","Selecciona")} /></SelectTrigger>
                                <SelectContent><SelectItem value="No Separation">{t("No Separation","Sin separación")}</SelectItem><SelectItem value="Separate by Person (Label Bags by Name)">{t("By Person","Por persona")}</SelectItem><SelectItem value="Separate by Clothing Type">{t("By Type","Por tipo")}</SelectItem><SelectItem value="Separate by Color (Light / Dark)">{t("By Color","Por color")}</SelectItem><SelectItem value="No Preference">{t("No Preference","Sin preferencia")}</SelectItem></SelectContent>
                              </Select>
                            </Field>
                          </div>
                        </div>
                        <Field label={t("Hanging / special items","Prendas especiales / colgar")}>
                          <input value={preferences.hanging_instructions} onChange={e=>setPref("hanging_instructions",e.target.value)} placeholder={t("e.g. Shirts on hangers","Ej. Camisas en gancho")} className={inputCls} data-testid="customer-pref-hanging" />
                        </Field>
                        <Field label={t("Allergies or sensitivities","Alergias o sensibilidades")}>
                          <textarea value={preferences.allergies} onChange={e=>setPref("allergies",e.target.value)} rows={3} placeholder={t("e.g. No fragrances","Ej. Sin fragancias")} className={`${inputCls} resize-none`} data-testid="customer-pref-allergies" />
                        </Field>
                        <Field label={t("Additional notes","Notas adicionales")}>
                          <textarea value={preferences.special_instructions} onChange={e=>setPref("special_instructions",e.target.value)} rows={3} placeholder={t("Special instructions","Instrucciones especiales")} className={`${inputCls} resize-none`} data-testid="customer-pref-notes" />
                        </Field>
                        <div className="grid sm:grid-cols-2 gap-4">
                          <Field label={t("Preferred pickup time","Horario preferido")}>
                            <Select value={preferences.pickup_time_preference} onValueChange={v => setPref("pickup_time_preference",v)}>
                              <SelectTrigger className="mt-1.5 rounded-xl border-slate-200 text-sm h-11" data-testid="customer-pref-pickup-time"><SelectValue placeholder={t("Select time window","Selecciona horario")} /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="8am-12pm">{t("8:00 AM – 12:00 PM","8:00 AM – 12:00 PM")}</SelectItem>
                                <SelectItem value="2pm-6pm">{t("2:00 PM – 6:00 PM","2:00 PM – 6:00 PM")}</SelectItem>
                                <SelectItem value="any">{t("No preference","Sin preferencia")}</SelectItem>
                              </SelectContent>
                            </Select>
                          </Field>
                          <Field label={t("Gate / Access code","Código de acceso")}>
                            <input value={preferences.gate_code} onChange={e=>setPref("gate_code",e.target.value)} placeholder={t("e.g. 1234#","Ej. 1234#")} className={inputCls} data-testid="customer-pref-gate" />
                          </Field>
                        </div>
                        <div className="flex flex-wrap gap-3 pt-2">
                          <button onClick={handleSavePreferences} data-testid="customer-preferences-save"
                            className="flex items-center gap-2 bg-sky-600 hover:bg-sky-700 text-white rounded-xl px-6 py-3 text-sm font-bold transition-all active:scale-95 shadow-sm shadow-sky-200">
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
          </>
        )}

        {/* ── Orders ── */}
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
                  {paginatedOrders.map((order, i) => (
                    <Reveal key={order.id} delay={i * 40} dir="up">
                      <div className={`relative rounded-xl border overflow-hidden transition-all duration-300 bg-white ${order.is_recurring ? "border-sky-100 hover:border-sky-300 hover:shadow-sm hover:shadow-sky-50" : "border-slate-100 hover:border-slate-200 hover:shadow-sm"}`}>
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
                                {order.is_recurring && <RecurrenceBadge recurrence={order.recurrence} locale={locale} />}
                                {order.recurrence_parent_id && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border bg-slate-50 text-slate-400 border-slate-200">
                                    <RotateCcw className="w-2.5 h-2.5" />{t("Auto", "Auto")}
                                  </span>
                                )}
                                {order.weight_lbs && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border bg-sky-50 text-sky-600 border-sky-200">
                                    ⚖️ {order.weight_lbs} lbs
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-3 text-xs text-slate-400 flex-wrap">
                                <span className="flex items-center gap-1">
                                  <Calendar className="h-3 w-3" />
                                  {order.pickup_date ? parseLocalDate(order.pickup_date).toLocaleDateString(locale === 'es' ? 'es-ES' : 'en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'TBD'}
                                </span>
                                {order.pickup_time_window && <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{order.pickup_time_window}</span>}
                                {order.pickup_address && <span className="flex items-center gap-1 truncate max-w-[180px]"><MapPin className="h-3 w-3 flex-shrink-0" />{order.pickup_address.split(",")[0]}</span>}
                              </div>
                              {order.is_recurring && order.recurrence_end_date && (
                                <p className="mt-1 flex items-center gap-1 text-xs text-slate-400">
                                  <AlertCircle className="w-3 h-3" />{t("Until", "Hasta")} {order.recurrence_end_date}
                                </p>
                              )}
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              {/* Precio: cubierto vs. real */}
                              {order.total_amount != null && (
                                isOrderCoveredByMembership(order)
                                  ? <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black bg-emerald-50 text-emerald-600 border border-emerald-200">
                                      ✓ {t("Covered","Cubierto")}
                                    </span>
                                  : <span className="font-black text-sky-600 text-lg tabular-nums">
                                      ${Number(hasMembership && order.extra_charge ? order.extra_charge : order.total_amount).toFixed(2)}
                                    </span>
                              )}
                              <button onClick={() => setViewingOrderDetails(prev => prev === order.id ? null : order.id)}
                                className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-200 ${viewingOrderDetails === order.id ? "bg-sky-100 text-sky-600" : "bg-slate-100 text-slate-400 hover:bg-slate-200"}`}>
                                <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-300 ${viewingOrderDetails === order.id ? "rotate-180" : ""}`} />
                              </button>
                            </div>
                          </div>
                          {(order.is_recurring || order.recurrence) && order.recurrence !== "once" && (
                            <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-3 flex-wrap">
                              <RecurrenceManager order={order} t={t} locale={locale} onUpdate={() => { fetchOrders(); }} />
                              <span className="text-xs text-slate-400 flex items-center gap-1">
                                {order.recurrence_end_date ? <><Clock className="w-3 h-3" />{t("Ends", "Termina")} {order.recurrence_end_date}</> : t("No end date", "Sin fecha fin")}
                              </span>
                            </div>
                          )}
                          {viewingOrderDetails === order.id && (
                            <div className="mt-4 pt-4 border-t border-slate-100 space-y-3">
                              {order.pickup_address && (
                                <div className="bg-slate-50 rounded-xl p-4">
                                  <h4 className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2.5 flex items-center gap-2">
                                    <MapPin className="w-3 h-3" />{t("Pickup Information","Información de Recolección")}
                                  </h4>
                                  <div className="grid sm:grid-cols-2 gap-3 text-sm">
                                    <div><p className="text-slate-400 text-xs mb-0.5">{t("Address","Dirección")}</p><p className="font-medium text-slate-700 text-sm">{order.pickup_address}</p></div>
                                    {order.pickup_date && (
                                      <div>
                                        <p className="text-slate-400 text-xs mb-0.5">{t("Date & Time","Fecha y Hora")}</p>
                                        <p className="font-medium text-slate-700 text-sm">
                                          {parseLocalDate(order.pickup_date).toLocaleDateString(locale === 'es' ? 'es-ES' : 'en-US', { dateStyle: 'medium' })}
                                          {order.pickup_time_window && ` · ${order.pickup_time_window}`}
                                        </p>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}
                              {hasMembership && (order.weight_lbs || order.extra_lbs_billed) && (
                                <div className="rounded-xl border border-sky-100 bg-sky-50 p-4">
                                  <h4 className="text-[10px] font-black uppercase tracking-wider text-sky-600 mb-2.5 flex items-center gap-1.5">
                                    ⚖️ {t("Weight & Membership Billing","Peso y Facturación Membresía")}
                                  </h4>
                                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                    {order.weight_lbs && <div><p className="text-[10px] text-sky-500 mb-0.5">{t("Weight","Peso")}</p><p className="font-bold text-slate-800 text-sm">{order.weight_lbs} lbs</p></div>}
                                    {order.lbs_from_allowance != null && <div><p className="text-[10px] text-sky-500 mb-0.5">{t("From allowance","De allowance")}</p><p className="font-bold text-emerald-600 text-sm">{order.lbs_from_allowance} lbs</p></div>}
                                    {order.extra_lbs_billed != null && order.extra_lbs_billed > 0 && <div><p className="text-[10px] text-sky-500 mb-0.5">{t("Extra billed","Lbs extra cobradas")}</p><p className="font-bold text-red-500 text-sm">{order.extra_lbs_billed} lbs</p></div>}
                                    {order.extra_charge != null && order.extra_charge > 0 && <div><p className="text-[10px] text-sky-500 mb-0.5">{t("Extra charge","Cargo extra")}</p><p className="font-bold text-red-500 text-sm">${Number(order.extra_charge).toFixed(2)}</p></div>}
                                  </div>
                                </div>
                              )}
                              {PICKUP_STATUSES.includes(order.status) && customerToken && <OrderImageBlock key={`pickup-${order.id}`} orderId={order.id} type="pickup" token={customerToken} t={t} />}
                              {DELIVERY_STATUSES.includes(order.status) && customerToken && <OrderImageBlock key={`delivery-${order.id}`} orderId={order.id} type="delivery" token={customerToken} t={t} />}
                              {order.notes && (
                                <div className="bg-amber-50 rounded-xl p-4 border border-amber-100">
                                  <h4 className="text-[10px] font-black uppercase tracking-wider text-amber-600 mb-2">{t("Order Notes","Notas")}</h4>
                                  <p className="text-sm text-slate-700 whitespace-pre-line">{order.notes}</p>
                                </div>
                              )}
                              {order.status_history && order.status_history.length > 0 && (
                                <div className="bg-slate-50 rounded-xl p-4">
                                  <h4 className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-3">{t("Order Timeline","Línea de Tiempo")}</h4>
                                  <div className="space-y-2">
                                    {order.status_history.slice().reverse().map((event, idx) => (
                                      <div key={idx} className="flex items-start gap-2.5 text-sm">
                                        <div className="w-1.5 h-1.5 rounded-full bg-sky-400 mt-2 flex-shrink-0" />
                                        <div>
                                          <p className="text-slate-700 font-semibold text-xs">{statusLabel(event.to || event.status)}</p>
                                          {event.changed_at && <p className="text-[11px] text-slate-400">{new Date(event.changed_at).toLocaleString(locale === "es" ? "es-ES" : "en-US", { dateStyle:"medium", timeStyle:"short" })}</p>}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </Reveal>
                  ))}
                  {hasMore && (
                    <div className="pt-2 text-center">
                      <button onClick={() => setOrdersPage(p => p + 1)}
                        className="inline-flex items-center gap-2 px-5 py-2 rounded-xl border border-slate-200 text-slate-500 text-xs font-semibold hover:border-sky-300 hover:text-sky-600 hover:bg-sky-50 transition-all">
                        {t("Load more","Cargar más")} <ChevronDown className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                  {ordersPage > 1 && !hasMore && (
                    <div className="pt-2 text-center">
                      <button onClick={() => setOrdersPage(1)}
                        className="inline-flex items-center gap-2 px-5 py-2 rounded-xl border border-slate-200 text-slate-500 text-xs font-semibold hover:border-slate-300 transition-all">
                        {t("Show less","Mostrar menos")} <ChevronUp className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </GlassCard>
        </Reveal>

        {/* ── Profile ── */}
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
              {editingProfile ? (
                <div className="space-y-4">
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div><label className="text-[10px] font-black uppercase tracking-wider text-slate-400">{t("Full Name","Nombre completo")}</label><input value={profileForm.name} onChange={e => setProfileForm(p => ({...p, name: e.target.value}))} className={inputCls} data-testid="profile-name-input" /></div>
                    <div><label className="text-[10px] font-black uppercase tracking-wider text-slate-400">{t("Phone","Teléfono")}</label><input value={profileForm.phone} onChange={e => setProfileForm(p => ({...p, phone: e.target.value}))} className={inputCls} placeholder="(805) 555-1234" data-testid="profile-phone-input" /></div>
                  </div>
                  <div><label className="text-[10px] font-black uppercase tracking-wider text-slate-400">{t("Street Address","Dirección")}</label><input value={profileForm.address} onChange={e => setProfileForm(p => ({...p, address: e.target.value}))} className={inputCls} data-testid="profile-address-input" /></div>
                  <div className="grid grid-cols-3 gap-4">
                    <div><label className="text-[10px] font-black uppercase tracking-wider text-slate-400">{t("City","Ciudad")}</label><input value={profileForm.city} onChange={e => setProfileForm(p => ({...p, city: e.target.value}))} className={inputCls} placeholder="Ventura" data-testid="profile-city-input" /></div>
                    <div><label className="text-[10px] font-black uppercase tracking-wider text-slate-400">{t("State","Estado")}</label><input value={profileForm.state} onChange={e => setProfileForm(p => ({...p, state: e.target.value}))} className={inputCls} placeholder="CA" data-testid="profile-state-input" /></div>
                    <div><label className="text-[10px] font-black uppercase tracking-wider text-slate-400">{t("Zip","C.P.")}</label><input value={profileForm.zip_code} onChange={e => setProfileForm(p => ({...p, zip_code: e.target.value}))} className={inputCls} placeholder="93003" data-testid="profile-zip-input" /></div>
                  </div>
                  <p className="text-[11px] text-slate-400">{t("This information auto-fills your service forms.","Esta información auto-completa tus formularios.")}</p>
                </div>
              ) : (
                <div className="grid sm:grid-cols-2 gap-5">
                  <div className="space-y-4">
                    <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100">
                      <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">{t("Email","Correo")}</p>
                      <p className="text-slate-700 font-semibold text-sm break-all">{customer?.email}</p>
                    </div>
                    <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100">
                      <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">{t("Phone","Teléfono")}</p>
                      {customer?.phone
                        ? <p className="text-slate-700 font-semibold text-sm flex items-center gap-1.5"><Phone className="w-3.5 h-3.5 text-slate-400" />{customer.phone}</p>
                        : <button onClick={startEditProfile} className="text-sky-500 text-xs font-bold hover:underline">+ {t("Add phone","Agregar teléfono")}</button>}
                    </div>
                  </div>
                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100 h-fit">
                    <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">{t("Address","Dirección")}</p>
                    {customer?.address
                      ? <p className="text-slate-700 font-semibold text-sm flex items-start gap-1.5"><MapPin className="w-3.5 h-3.5 text-slate-400 mt-0.5 flex-shrink-0" /><span className="break-words">{customer.address}</span></p>
                      : <button onClick={startEditProfile} className="text-sky-500 text-xs font-bold hover:underline">+ {t("Add address","Agregar dirección")}</button>}
                  </div>
                  {customer?.membership_start_date && (
                    <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100">
                      <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">{t("Membership start","Inicio de membresía")}</p>
                      <p className="text-slate-700 font-semibold text-sm">{parseLocalDate(customer.membership_start_date).toLocaleDateString(locale === 'es' ? 'es-ES' : 'en-US')}</p>
                    </div>
                  )}
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