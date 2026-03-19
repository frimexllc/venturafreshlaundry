import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import {
  User, Mail, MapPin, Package, LogOut, Calendar, Clock,
  ArrowRight, Sparkles, ChevronDown, Settings, Shield
} from "lucide-react";
import PublicNav from "../components/PublicNav";
import PublicFooter from "../components/PublicFooter";
import { useLocale } from "../context/LocaleContext";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const statusConfig = {
  new:             { label: { en: "New",             es: "Nueva"      }, cls: "bg-blue-50 text-blue-600 border-blue-200/60" },
  processing:      { label: { en: "Processing",      es: "Procesando" }, cls: "bg-amber-50 text-amber-600 border-amber-200/60" },
  ready:           { label: { en: "Ready",           es: "Lista"      }, cls: "bg-violet-50 text-violet-600 border-violet-200/60" },
  out_for_delivery:{ label: { en: "Out for Delivery",es: "En camino"  }, cls: "bg-orange-50 text-orange-600 border-orange-200/60" },
  delivered:       { label: { en: "Delivered",       es: "Entregada"  }, cls: "bg-emerald-50 text-emerald-600 border-emerald-200/60" },
  completed:       { label: { en: "Completed",       es: "Completada" }, cls: "bg-emerald-50 text-emerald-600 border-emerald-200/60" },
  cancelled:       { label: { en: "Cancelled",       es: "Cancelada"  }, cls: "bg-red-50 text-red-600 border-red-200/60" },
};

// ─── IntersectionObserver hook ────────────────────────────────────────────────
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

// ─── Reveal ───────────────────────────────────────────────────────────────────
const ORIGINS = { up: "opacity-0 translate-y-8", left: "opacity-0 translate-x-6", right: "opacity-0 -translate-x-6", scale: "opacity-0 scale-95", blur: "opacity-0 blur-sm scale-97" };
const Reveal = ({ children, delay = 0, dir = "up", dur = 650, className = "" }) => {
  const [ref, v] = useInView();
  return (
    <div ref={ref} className={`${className} transition-all ease-out ${v ? "opacity-100 translate-y-0 translate-x-0 scale-100 blur-0" : ORIGINS[dir]}`}
      style={{ transitionDuration: `${dur}ms`, transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  );
};

// ─── Magnetic wrapper ─────────────────────────────────────────────────────────
const Mag = ({ children, className = "", strength = 0.28, as: Tag = "div", ...p }) => {
  const ref = useRef(null);
  const onMove = useCallback((e) => {
    const r = ref.current.getBoundingClientRect();
    ref.current.style.transform = `translate(${(e.clientX - r.left - r.width / 2) * strength}px,${(e.clientY - r.top - r.height / 2) * strength}px)`;
  }, [strength]);
  const onLeave = useCallback(() => { ref.current.style.transform = "translate(0,0)"; }, []);
  return <Tag ref={ref} className={className} style={{ transition: "transform 500ms cubic-bezier(0.34,1.56,0.64,1)" }} onMouseMove={onMove} onMouseLeave={onLeave} {...p}>{children}</Tag>;
};

// ─── Tilt ─────────────────────────────────────────────────────────────────────
const Tilt = ({ children, className = "", depth = 4 }) => {
  const ref = useRef(null); const [s, setS] = useState({});
  const onMove = useCallback((e) => {
    const r = ref.current.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width - 0.5) * depth * 2;
    const y = ((e.clientY - r.top) / r.height - 0.5) * -depth * 2;
    setS({ transform: `perspective(900px) rotateX(${y}deg) rotateY(${x}deg) translateZ(6px)`, transition: "transform 80ms linear" });
  }, [depth]);
  const onLeave = useCallback(() => setS({ transform: "perspective(900px) rotateX(0) rotateY(0) translateZ(0)", transition: "transform 600ms cubic-bezier(0.34,1.56,0.64,1)" }), []);
  return <div ref={ref} style={s} className={className} onMouseMove={onMove} onMouseLeave={onLeave}>{children}</div>;
};

// ─── Custom Cursor ────────────────────────────────────────────────────────────
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

// ─── Styled Input / Textarea ──────────────────────────────────────────────────
const inputCls = "w-full border border-slate-200 bg-white rounded-xl px-4 py-3 text-sm text-slate-800 placeholder-slate-300 focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition-all duration-200 mt-1.5";
const Field = ({ label, children }) => (
  <div>
    <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{label}</label>
    {children}
  </div>
);

// ─── Section Card ─────────────────────────────────────────────────────────────
const Card = ({ children, className = "", hover = false }) => {
  const [h, setH] = useState(false);
  return (
    <div
      className={`relative bg-white rounded-2xl border overflow-hidden transition-all duration-350
        ${hover ? (h ? "border-primary/25 shadow-xl shadow-sky-100/50" : "border-slate-100 shadow-lg") : "border-slate-100 shadow-lg"}
        ${className}`}
      onMouseEnter={() => hover && setH(true)} onMouseLeave={() => hover && setH(false)}>
      {hover && <div className={`absolute top-0 left-6 right-6 h-px bg-gradient-to-r from-transparent via-primary to-transparent transition-opacity duration-500 ${h ? "opacity-100" : "opacity-0"}`} />}
      {hover && <div className={`absolute inset-0 bg-gradient-to-br from-sky-50/40 to-transparent transition-opacity duration-500 pointer-events-none ${h ? "opacity-100" : "opacity-0"}`} />}
      <div className="relative">{children}</div>
    </div>
  );
};

// ─── MAIN ─────────────────────────────────────────────────────────────────────
export default function CustomerAccount() {
  const { t, locale } = useLocale();
  const navigate = useNavigate();
  const { ring, dot } = useCursor();

  const [customer, setCustomer] = useState(null);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [scrollY, setScrollY] = useState(0);
  const [prefOpen, setPrefOpen] = useState(true);

  const [preferences, setPreferences] = useState({
    detergent_type: "", water_temperature: "", fabric_softener: "",
    folding_style: "", hanging_instructions: "", allergies: "",
    special_instructions: "", pickup_time_preference: "", gate_code: ""
  });
  const [preferencesMeta, setPreferencesMeta] = useState({ updated_at: null, version: null });
  const [preferencesLoading, setPreferencesLoading] = useState(true);

  const statusLabel = (s) => {
    const cfg = statusConfig[s];
    if (!cfg) return s;
    return locale === "es" ? cfg.label.es : cfg.label.en;
  };
  const statusCls = (s) => statusConfig[s]?.cls || "bg-slate-100 text-slate-600 border-slate-200";

  useEffect(() => {
    let tick = false;
    const fn = () => { if (!tick) { requestAnimationFrame(() => { setScrollY(window.pageYOffset); tick = false; }); tick = true; } };
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);

  useEffect(() => {
    const token = localStorage.getItem("customer_token");
    const customerData = localStorage.getItem("customer_data");
    if (!token) { navigate("/account/login"); return; }
    if (customerData) setCustomer(JSON.parse(customerData));
    fetchOrders(token);
    fetchPreferences(token);
  }, [navigate]);

  const fetchOrders = async (token) => {
    try {
      const res = await axios.get(`${API}/customer/orders`, { headers: { Authorization: `Bearer ${token}` } });
      setOrders(res.data || []);
    } catch (err) { if (err.response?.status === 401) handleLogout(); }
    finally { setLoading(false); }
  };

  const fetchPreferences = async (token) => {
    setPreferencesLoading(true);
    try {
      const res = await axios.get(`${API}/customer/preferences`, { headers: { Authorization: `Bearer ${token}` } });
      const d = res.data || {};
      setPreferences({ detergent_type: d.detergent_type || "", water_temperature: d.water_temperature || "", fabric_softener: d.fabric_softener || "", folding_style: d.folding_style || "", hanging_instructions: d.hanging_instructions || "", allergies: d.allergies || "", special_instructions: d.special_instructions || "", pickup_time_preference: d.pickup_time_preference || "", gate_code: d.gate_code || "" });
      setPreferencesMeta({ updated_at: d.updated_at || null, version: d.version || null });
    } catch (err) { if (err.response?.status !== 404) toast.error(t("Could not load preferences", "No se pudieron cargar las preferencias")); }
    finally { setPreferencesLoading(false); }
  };

  const handleLogout = () => {
    localStorage.removeItem("customer_token"); localStorage.removeItem("customer_data");
    toast.success(t("Signed out successfully", "Sesión cerrada correctamente"));
    navigate("/account/login");
  };

  const handleSavePreferences = async () => {
    const token = localStorage.getItem("customer_token"); if (!token) return;
    try {
      const res = await axios.post(`${API}/customer/preferences`, preferences, { headers: { Authorization: `Bearer ${token}` } });
      toast.success(t("Preferences saved", "Preferencias guardadas"));
      setPreferencesMeta({ updated_at: res.data.updated_at || null, version: res.data.version || null });
    } catch (err) { toast.error(err.response?.data?.detail || t("Could not save preferences", "No se pudieron guardar las preferencias")); }
  };

  const handleDeletePreferences = async () => {
    const token = localStorage.getItem("customer_token"); if (!token) return;
    try {
      await axios.delete(`${API}/customer/preferences`, { headers: { Authorization: `Bearer ${token}` } });
      toast.success(t("Preferences deleted", "Preferencias eliminadas"));
      setPreferences({ detergent_type: "", water_temperature: "", fabric_softener: "", folding_style: "", hanging_instructions: "", allergies: "", special_instructions: "", pickup_time_preference: "", gate_code: "" });
      setPreferencesMeta({ updated_at: null, version: null });
    } catch (err) { toast.error(err.response?.data?.detail || t("Could not delete preferences", "No se pudieron eliminar las preferencias")); }
  };

  const setPref = (k, v) => setPreferences(p => ({ ...p, [k]: v }));

  const formatDate = (ds) => {
    if (!ds) return "";
    return new Date(ds).toLocaleDateString(locale === "es" ? "es-ES" : "en-US", { year: "numeric", month: "long", day: "numeric" });
  };

  if (loading) return (
    <div className="min-h-screen bg-white">
      <PublicNav />
      <div className="pt-40 flex items-center justify-center">
        <div className="w-10 h-10 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
      </div>
    </div>
  );

  const firstName = customer?.name?.split(" ")[0] || t("Customer", "Cliente");

  return (<>
    {/* Cursor */}
    <div className="pointer-events-none fixed inset-0 z-[9999] hidden lg:block">
      <div ref={ring} className="absolute w-9 h-9 rounded-full border border-primary/50 will-change-transform" style={{ top: 0, left: 0 }} />
      <div ref={dot}  className="absolute w-1.5 h-1.5 rounded-full bg-primary will-change-transform" style={{ top: 0, left: 0 }} />
    </div>

    <style>{`
      @keyframes fadeUp { from { opacity:0; transform:translateY(16px) } to { opacity:1; transform:translateY(0) } }
    `}</style>

    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white overflow-x-hidden">
      <PublicNav />

      {/* ══ HERO BANNER ═══════════════════════════════════════════════════ */}
      <section className="relative overflow-hidden pt-24 pb-32">
        {/* BG image with parallax */}
        <div className="absolute inset-0 will-change-transform"
          style={{ backgroundImage: "url('https://images.unsplash.com/photo-1545173168-9f1947eebb7f?w=1920&h=600&fit=crop')", backgroundSize: "cover", backgroundPosition: "center 30%", transform: `translateY(${scrollY * 0.15}px) scale(1.06)` }} />
        <div className="absolute inset-0 bg-gradient-to-b from-sky-950/90 via-sky-900/80 to-slate-50" />
        <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: "radial-gradient(rgba(255,255,255,0.8) 1px,transparent 1px)", backgroundSize: "28px 28px" }} />

        <div className="relative z-10 max-w-4xl mx-auto px-6 sm:px-8 pt-16">
          {/* Greeting */}
          <div style={{ animation: "fadeUp 0.8s 0.1s both ease-out" }}>
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/8 backdrop-blur-md border border-white/15 mb-6">
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              <span className="text-[11px] text-white/70 font-bold uppercase tracking-[0.18em]">{t("My Account", "Mi Cuenta")}</span>
            </div>
          </div>
          <h1 className="text-4xl sm:text-5xl font-light text-white  mb-2 leading-tight"
            style={{ animation: "fadeUp 0.9s 0.2s both ease-out" }}>
            {t("Hi,", "Hola,")}
            <span className="ml-3" style={{ WebkitTextStroke: "1.5px rgba(255,255,255,0.85)", color: "transparent" }}>
              {firstName}.
            </span>
          </h1>
          <p className="text-white/55 text-lg" style={{ animation: "fadeUp 0.9s 0.35s both ease-out" }}>
            {customer?.email}
          </p>
        </div>

        {/* Wave */}
        <div className="absolute bottom-0 left-0 right-0 z-20">
          <svg viewBox="0 0 1440 70" preserveAspectRatio="none" className="w-full h-10 sm:h-14">
            <path d="M0,35 C360,0 720,70 1440,35 L1440,70 L0,70 Z" fill="#f8fafc" />
          </svg>
        </div>
      </section>

      {/* ══ CONTENT ═══════════════════════════════════════════════════════ */}
      <div className="max-w-4xl mx-auto px-6 sm:px-8 pb-24 -mt-10 space-y-5 relative z-10">

        {/* ── Profile header card ── */}
        <Reveal dir="up" delay={0}>
          <Tilt depth={2}>
            <Card hover>
              <div className="px-7 py-6 flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-4">
                  {/* Avatar ring */}
                  <div className="relative">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-sky-400 to-primary flex items-center justify-center shadow-lg shadow-primary/25">
                      <span className="text-white text-xl font-black">{firstName[0]?.toUpperCase()}</span>
                    </div>
                    <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-emerald-400 rounded-full border-2 border-white" />
                  </div>
                  <div>
                    <p className="font-bold text-slate-900 text-lg">{customer?.name}</p>
                    <p className="text-slate-400 text-sm">{customer?.email}</p>
                  </div>
                </div>
                <button onClick={handleLogout} data-testid="customer-logout-btn"
                  className="group flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 text-slate-500 text-sm font-semibold hover:border-red-200 hover:text-red-500 hover:bg-red-50 transition-all duration-200">
                  <LogOut className="h-4 w-4 transition-transform duration-200 group-hover:-translate-x-0.5" />
                  {t("Sign out", "Cerrar sesión")}
                </button>
              </div>
            </Card>
          </Tilt>
        </Reveal>

        {/* ── Quick stats row ── */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { icon: Package,  value: orders.length,    label: t("Orders", "Órdenes") },
            { icon: Calendar, value: orders.filter(o => ["new","processing"].includes(o.status)).length, label: t("Active", "Activas") },
            { icon: Shield,   value: orders.filter(o => o.status === "completed").length, label: t("Done", "Completadas") },
          ].map((s, i) => (
            <Reveal key={i} delay={i * 80} dir="up">
              <Tilt depth={3}>
                <Card hover>
                  <div className="px-5 py-5 text-center">
                    <div className="w-9 h-9 bg-primary/10 rounded-xl flex items-center justify-center mx-auto mb-2">
                      <s.icon className="h-4 w-4 text-primary" />
                    </div>
                    <p className="text-2xl font-black text-primary">{s.value}</p>
                    <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">{s.label}</p>
                  </div>
                </Card>
              </Tilt>
            </Reveal>
          ))}
        </div>

        {/* ── Preferences (collapsible) ── */}
        <Reveal delay={120} dir="up">
          <Card hover data-testid="customer-preferences-card">
            {/* Header */}
            <button onClick={() => setPrefOpen(p => !p)}
              className="w-full px-7 py-5 flex items-center justify-between text-left focus:outline-none group">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-primary/10 rounded-xl flex items-center justify-center group-hover:bg-primary/15 transition-colors duration-200">
                  <Settings className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <h2 className="font-bold text-slate-900 text-base group-hover:text-primary transition-colors duration-200">{t("Laundry Preferences", "Preferencias de lavandería")}</h2>
                  {preferencesMeta.updated_at && (
                    <p className="text-[11px] text-slate-400" data-testid="customer-preferences-updated">
                      {t("Updated", "Actualizado")}: {formatDate(preferencesMeta.updated_at)}
                    </p>
                  )}
                </div>
              </div>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-350 ${prefOpen ? "bg-primary text-white rotate-180" : "bg-slate-100 text-slate-400 group-hover:bg-primary/10 group-hover:text-primary"}`}>
                <ChevronDown className="w-4 h-4" />
              </div>
            </button>

            <div className={`overflow-hidden transition-all duration-500 ease-in-out ${prefOpen ? "max-h-[2000px] opacity-100" : "max-h-0 opacity-0"}`}>
              <div className="px-7 pb-7 border-t border-slate-100">
                {preferencesLoading ? (
                  <div className="flex items-center justify-center py-10" data-testid="customer-preferences-loading">
                    <div className="w-8 h-8 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
                  </div>
                ) : (
                  <div className="pt-5 space-y-5">
                    <div className="grid sm:grid-cols-2 gap-4">
                      {/* Detergent */}
                      <Field label={t("Preferred detergent", "Detergente preferido")}>
                        <Select value={preferences.detergent_type} onValueChange={v => setPref("detergent_type", v)}>
                          <SelectTrigger className="mt-1.5 rounded-xl border-slate-200 focus:ring-2 focus:ring-primary/10 focus:border-primary/50 text-sm h-[44px]" data-testid="customer-pref-detergent">
                            <SelectValue placeholder={t("Select", "Selecciona")} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="hypoallergenic">{t("Hypoallergenic", "Hipoalergénico")}</SelectItem>
                            <SelectItem value="free_clear">{t("Free & Clear", "Sin fragancia")}</SelectItem>
                            <SelectItem value="lavender">{t("Lavender", "Lavanda")}</SelectItem>
                            <SelectItem value="standard">{t("Standard", "Estándar")}</SelectItem>
                          </SelectContent>
                        </Select>
                      </Field>
                      {/* Temperature */}
                      <Field label={t("Water temperature", "Temperatura de lavado")}>
                        <Select value={preferences.water_temperature} onValueChange={v => setPref("water_temperature", v)}>
                          <SelectTrigger className="mt-1.5 rounded-xl border-slate-200 focus:ring-2 focus:ring-primary/10 focus:border-primary/50 text-sm h-[44px]" data-testid="customer-pref-temperature">
                            <SelectValue placeholder={t("Select", "Selecciona")} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="cold">{t("Cold", "Fría")}</SelectItem>
                            <SelectItem value="warm">{t("Warm", "Tibia")}</SelectItem>
                            <SelectItem value="hot">{t("Hot", "Caliente")}</SelectItem>
                          </SelectContent>
                        </Select>
                      </Field>
                      {/* Softener */}
                      <Field label={t("Fabric softener", "Suavizante")}>
                        <Select value={preferences.fabric_softener} onValueChange={v => setPref("fabric_softener", v)}>
                          <SelectTrigger className="mt-1.5 rounded-xl border-slate-200 focus:ring-2 focus:ring-primary/10 focus:border-primary/50 text-sm h-[44px]" data-testid="customer-pref-softener">
                            <SelectValue placeholder={t("Select", "Selecciona")} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">{t("None", "Sin suavizante")}</SelectItem>
                            <SelectItem value="light">{t("Light", "Ligero")}</SelectItem>
                            <SelectItem value="standard">{t("Standard", "Estándar")}</SelectItem>
                            <SelectItem value="extra">{t("Extra", "Extra")}</SelectItem>
                          </SelectContent>
                        </Select>
                      </Field>
                      {/* Folding */}
                      <Field label={t("Folding style", "Estilo de doblado")}>
                        <Select value={preferences.folding_style} onValueChange={v => setPref("folding_style", v)}>
                          <SelectTrigger className="mt-1.5 rounded-xl border-slate-200 focus:ring-2 focus:ring-primary/10 focus:border-primary/50 text-sm h-[44px]" data-testid="customer-pref-folding">
                            <SelectValue placeholder={t("Select", "Selecciona")} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="standard">{t("Standard", "Estándar")}</SelectItem>
                            <SelectItem value="konmari">{t("KonMari", "KonMari")}</SelectItem>
                            <SelectItem value="stacked">{t("Premium stacked", "Apilado premium")}</SelectItem>
                          </SelectContent>
                        </Select>
                      </Field>
                    </div>

                    <Field label={t("Hanging / special items", "Colgado / prendas especiales")}>
                      <input value={preferences.hanging_instructions} onChange={e => setPref("hanging_instructions", e.target.value)} placeholder={t("e.g. Shirts on hangers", "Ej. Camisas en gancho")} className={inputCls} data-testid="customer-pref-hanging" />
                    </Field>
                    <Field label={t("Allergies or sensitivities", "Alergias o sensibilidades")}>
                      <textarea value={preferences.allergies} onChange={e => setPref("allergies", e.target.value)} rows={3} placeholder={t("e.g. No fragrances", "Ej. Sin fragancias")} className={`${inputCls} resize-none`} data-testid="customer-pref-allergies" />
                    </Field>
                    <Field label={t("Additional notes", "Notas adicionales")}>
                      <textarea value={preferences.special_instructions} onChange={e => setPref("special_instructions", e.target.value)} rows={3} placeholder={t("Special instructions", "Instrucciones especiales")} className={`${inputCls} resize-none`} data-testid="customer-pref-notes" />
                    </Field>

                    <div className="grid sm:grid-cols-2 gap-4">
                      <Field label={t("Preferred pickup time", "Horario preferido de pickup")}>
                        <input value={preferences.pickup_time_preference} onChange={e => setPref("pickup_time_preference", e.target.value)} placeholder={t("e.g. 8am – 12pm", "Ej. 8am – 12pm")} className={inputCls} data-testid="customer-pref-pickup-time" />
                      </Field>
                      <Field label={t("Gate / Access code", "Puerta / Código de acceso")}>
                        <input value={preferences.gate_code} onChange={e => setPref("gate_code", e.target.value)} placeholder={t("e.g. 1234#", "Ej. 1234#")} className={inputCls} data-testid="customer-pref-gate" />
                      </Field>
                    </div>

                    {/* Actions */}
                    <div className="flex flex-wrap gap-3 pt-2">
                      <button onClick={handleSavePreferences} data-testid="customer-preferences-save"
                        className="group flex items-center gap-2 overflow-hidden relative bg-primary text-white rounded-xl px-6 py-3 text-sm font-bold uppercase tracking-wider shadow-md shadow-primary/20 hover:bg-primary/90 hover:shadow-lg transition-all duration-300 active:scale-95">
                        <span className="relative z-10 flex items-center gap-2">
                          {t("Save preferences", "Guardar preferencias")}
                          <ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1" />
                        </span>
                        <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/15 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
                      </button>
                      <button onClick={handleDeletePreferences} data-testid="customer-preferences-delete"
                        className="flex items-center gap-2 px-6 py-3 rounded-xl border border-slate-200 text-slate-500 text-sm font-semibold hover:border-red-200 hover:text-red-500 hover:bg-red-50 transition-all duration-200">
                        {t("Delete preferences", "Eliminar preferencias")}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </Card>
        </Reveal>

        {/* ── Orders ── */}
        <Reveal delay={160} dir="up">
          <Card hover>
            <div className="px-7 py-5 flex items-center justify-between border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-primary/10 rounded-xl flex items-center justify-center">
                  <Package className="h-4 w-4 text-primary" />
                </div>
                <h2 className="font-bold text-slate-900 text-base">{t("Orders", "Órdenes")}</h2>
              </div>
              <Link to="/schedule-pickup">
                <Mag as="div" strength={0.2}
                  className="inline-flex items-center gap-1.5 bg-primary text-white rounded-full px-4 py-2 text-xs font-bold uppercase tracking-wider shadow-md shadow-primary/20 hover:bg-primary/90 transition-colors duration-200 cursor-pointer active:scale-95">
                  + {t("New Pickup", "Nueva recogida")}
                </Mag>
              </Link>
            </div>

            <div className="px-7 py-5">
              {orders.length === 0 ? (
                <div className="text-center py-14">
                  <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <Package className="h-8 w-8 text-slate-300" />
                  </div>
                  <p className="text-slate-500 font-medium mb-2">{t("No orders yet", "Aún no tienes órdenes")}</p>
                  <p className="text-slate-400 text-sm mb-6">{t("Schedule your first pickup to get started.", "Programa tu primera recogida para comenzar.")}</p>
                  <Link to="/schedule-pickup">
                    <Mag as="div" strength={0.2} className="inline-flex items-center gap-2 bg-primary text-white rounded-full px-7 py-3 text-sm font-bold uppercase tracking-wider shadow-lg shadow-primary/25 cursor-pointer hover:-translate-y-0.5 transition-transform duration-300 active:scale-95">
                      🚚 {t("Schedule Your First Pickup", "Programa tu primera recogida")}
                    </Mag>
                  </Link>
                </div>
              ) : (
                <div className="space-y-3">
                  {orders.map((order, i) => (
                    <Reveal key={order.id} delay={i * 60} dir="up">
                      <div className="relative flex items-center justify-between flex-wrap gap-3 p-4 rounded-2xl border border-slate-100 hover:border-primary/20 hover:shadow-md hover:shadow-sky-50 transition-all duration-300 group bg-white overflow-hidden">
                        <div className="absolute inset-0 bg-gradient-to-r from-sky-50/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
                        <div className="relative">
                          <div className="flex items-center gap-3 mb-2 flex-wrap">
                            <span className="font-bold text-slate-900 text-sm">{order.order_number}</span>
                            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest border ${statusCls(order.status)}`}>
                              {statusLabel(order.status)}
                            </span>
                          </div>
                          <div className="flex items-center gap-4 text-xs text-slate-400 flex-wrap">
                            <span className="flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" />{order.pickup_date || "TBD"}</span>
                            {order.pickup_time_window && <span className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" />{order.pickup_time_window}</span>}
                            {order.pickup_address && <span className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" />{order.pickup_address}</span>}
                          </div>
                        </div>
                        <div className="relative text-right">
                          {order.service_type && <p className="text-xs text-slate-400 mb-0.5 capitalize">{order.service_type.replace("_", " ")}</p>}
                          {order.total_amount != null && (
                            <p className="font-black text-primary text-lg">${Number(order.total_amount).toFixed(2)}</p>
                          )}
                        </div>
                      </div>
                    </Reveal>
                  ))}
                </div>
              )}
            </div>
          </Card>
        </Reveal>

        {/* ── Profile + Address ── */}
        <div className="grid sm:grid-cols-2 gap-5">
          <Reveal delay={200} dir="left">
            <Tilt depth={3}>
              <Card hover>
                <div className="px-6 py-5">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-9 h-9 bg-primary/10 rounded-xl flex items-center justify-center">
                      <Mail className="h-4 w-4 text-primary" />
                    </div>
                    <h2 className="font-bold text-slate-900 text-sm uppercase tracking-wider">{t("Profile", "Perfil")}</h2>
                  </div>
                  <div className="space-y-2 text-sm">
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">{t("Email", "Correo")}</p>
                      <p className="text-slate-700 font-medium">{customer?.email}</p>
                    </div>
                    {customer?.phone && (
                      <div>
                        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">{t("Phone", "Teléfono")}</p>
                        <p className="text-slate-700 font-medium">{customer.phone}</p>
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            </Tilt>
          </Reveal>

          <Reveal delay={260} dir="right">
            <Tilt depth={3}>
              <Card hover>
                <div className="px-6 py-5">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-9 h-9 bg-primary/10 rounded-xl flex items-center justify-center">
                      <MapPin className="h-4 w-4 text-primary" />
                    </div>
                    <h2 className="font-bold text-slate-900 text-sm uppercase tracking-wider">{t("Address", "Dirección")}</h2>
                  </div>
                  {customer?.address
                    ? <p className="text-slate-600 text-sm leading-relaxed">{customer.address}</p>
                    : <p className="text-slate-400 text-sm ">{t("No address saved", "No hay dirección guardada")}</p>}
                </div>
              </Card>
            </Tilt>
          </Reveal>
        </div>

        {/* ── CTA banner ── */}
        <Reveal delay={300} dir="scale">
          <div className="relative overflow-hidden bg-gradient-to-br from-sky-950 to-sky-900 rounded-2xl p-8 text-center">
            <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: "radial-gradient(rgba(255,255,255,0.8) 1px,transparent 1px)", backgroundSize: "22px 22px" }} />
            <div className="absolute top-0 left-10 right-10 h-px bg-gradient-to-r from-transparent via-sky-400/50 to-transparent" />
            <Sparkles className="w-6 h-6 text-sky-400/60 mx-auto mb-3" />
            <h3 className="text-lg font-bold text-white mb-1">{t("Ready for your next pickup?", "¿Listo para tu próxima recogida?")}</h3>
            <p className="text-white/50 text-sm mb-6">{t("Schedule in seconds, we'll handle the rest.", "Programa en segundos, nosotros hacemos el resto.")}</p>
            <Link to="/schedule-pickup">
              <Mag as="div" strength={0.22}
                className="inline-flex items-center gap-2 bg-primary text-white rounded-full px-8 py-3.5 text-sm font-bold uppercase tracking-wider shadow-lg shadow-primary/30 cursor-pointer hover:-translate-y-0.5 transition-transform duration-300 active:scale-95 group overflow-hidden relative">
                <span className="relative z-10 flex items-center gap-2">
                  🚚 {t("Schedule Pickup", "Programar Recogida")}
                  <ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1" />
                </span>
                <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/15 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
              </Mag>
            </Link>
          </div>
        </Reveal>

      </div>

      <PublicFooter />
    </div>
  </>);
}