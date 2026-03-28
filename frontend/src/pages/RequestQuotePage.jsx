import { useState, useRef, useEffect, useCallback } from "react";
import axios from "axios";
import { toast } from "sonner";
import { ChevronDown, Building2, Briefcase, Hotel, CheckCircle } from "lucide-react";
import PublicNav from "../components/PublicNav";
import PublicFooter from "../components/PublicFooter";
import SmsConsentField from "../components/SmsConsentField";
import AddressAutocomplete from "../components/AddressAutocomplete";
import { useLocale } from "../context/LocaleContext";
import heroBanner from "../assets/WhatsApp Image 2026-03-20 at 2.51.26 PM (1).jpeg";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

/* ─── Data ─────────────────────────────────────────────────────────────────── */
const BUSINESS_TYPES = [
  { value: "hotel",               en: "Hotel / Hospitality",        es: "Hotel / Hospitalidad" },
  { value: "airbnb",              en: "Airbnb / Vacation Rental",   es: "Airbnb / Alquiler vacacional" },
  { value: "restaurant",          en: "Restaurant / Food Service",  es: "Restaurante / Servicio de alimentos" },
  { value: "healthcare",          en: "Healthcare / Medical",       es: "Salud / Médico" },
  { value: "fitness",             en: "Gym / Fitness Center",       es: "Gimnasio / Centro de fitness" },
  { value: "spa",                 en: "Spa / Salon",                es: "Spa / Salón" },
  { value: "property_management", en: "Property Management",        es: "Administración de propiedades" },
  { value: "corporate",           en: "Corporate Office",           es: "Oficina corporativa" },
  { value: "manufacturing",       en: "Manufacturing / Industrial", es: "Manufactura / Industrial" },
  { value: "retail",              en: "Retail",                     es: "Venta al por menor" },
  { value: "other",               en: "Other",                      es: "Otro" },
];

const SERVICE_TYPES = [
  { value: "wash_fold",    en: "Wash & Fold",                  es: "Lavado y Doblado",                icon: "🧺" },
  { value: "dry_cleaning", en: "Dry Cleaning",                 es: "Lavado en seco",                  icon: "👔" },
  { value: "linens",       en: "Linens & Towels",              es: "Ropa de cama y toallas",          icon: "🛏️" },
  { value: "uniforms",     en: "Uniforms",                     es: "Uniformes",                       icon: "👷" },
  { value: "full_service", en: "Full Service (All of above)",  es: "Servicio completo",               icon: "⭐" },
];

const FREQUENCY_OPTIONS = [
  { value: "daily",       en: "Daily",          es: "Diario",           icon: "📅" },
  { value: "twice_week",  en: "Twice a Week",   es: "Dos veces/semana", icon: "🔁" },
  { value: "weekly",      en: "Weekly",         es: "Semanal",          icon: "📆" },
  { value: "biweekly",    en: "Biweekly",       es: "Quincenal",        icon: "🗓️" },
  { value: "monthly",     en: "Monthly",        es: "Mensual",          icon: "📋" },
  { value: "on_demand",   en: "On Demand",      es: "Bajo demanda",     icon: "⚡" },
];

const CONTACT_METHODS = [
  { value: "phone", en: "Phone Call", es: "Llamada",          icon: "📞" },
  { value: "text",  en: "Text/SMS",   es: "Mensaje de texto", icon: "💬" },
  { value: "email", en: "Email",      es: "Correo",           icon: "✉️" },
];

const STAGES = [
  { icon: "👤", en: "Contact",  es: "Contacto",  subEN: "Who are you?",           subES: "¿Quién eres?" },
  { icon: "📍", en: "Address",  es: "Dirección", subEN: "Where is your business?", subES: "¿Dónde está tu negocio?" },
  { icon: "🏢", en: "Business", es: "Negocio",   subEN: "About your company",      subES: "Tu empresa" },
  { icon: "🧺", en: "Service",  es: "Servicio",  subEN: "What do you need?",       subES: "¿Qué necesitas?" },
  { icon: "📅", en: "Schedule", es: "Horario",   subEN: "Best time to reach you",  subES: "Cuándo contactarte" },
  { icon: "✅", en: "Confirm",  es: "Confirmar", subEN: "Review & submit",         subES: "Revisar y enviar" },
];

/* ─── Atoms ─────────────────────────────────────────────────────────────────── */
const inputSt = (foc) => ({
  width: "100%", padding: "9px 12px", boxSizing: "border-box",
  border: `1.5px solid ${foc ? "#0ea5e9" : "hsl(var(--border))"}`,
  borderRadius: 10, background: "hsl(var(--background))",
  color: "hsl(var(--foreground))", fontSize: 13, fontWeight: 500,
  fontFamily: "inherit", outline: "none",
  boxShadow: foc ? "0 0 0 3px rgba(14,165,233,.12)" : "none",
  transition: "all .15s",
});

const FInput = ({ style, ...p }) => {
  const [f, setF] = useState(false);
  return <input {...p} style={{ ...inputSt(f), ...(style || {}) }} onFocus={() => setF(true)} onBlur={() => setF(false)} />;
};

const FTextarea = ({ rows = 3, ...p }) => {
  const [f, setF] = useState(false);
  return <textarea rows={rows} {...p} style={{ ...inputSt(f), resize: "vertical", minHeight: 72 }} onFocus={() => setF(true)} onBlur={() => setF(false)} />;
};

const FLabel = ({ children }) => (
  <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".14em", color: "hsl(var(--muted-foreground))", marginBottom: 5 }}>{children}</div>
);

const FF = ({ label, children }) => <div><FLabel>{label}</FLabel>{children}</div>;

const FSelect = ({ value, onChange, children }) => {
  const [f, setF] = useState(false);
  return (
    <select value={value} onChange={onChange} onFocus={() => setF(true)} onBlur={() => setF(false)}
      style={{ ...inputSt(f), appearance: "none", cursor: "pointer",
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%230ea5e9'/%3E%3C/svg%3E")`,
        backgroundRepeat: "no-repeat", backgroundPosition: "right 12px center" }}>
      {children}
    </select>
  );
};

const ChipSet = ({ options, value, onChange }) => (
  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
    {options.map((o) => (
      <button key={o.value || o.val} type="button" onClick={() => onChange(o.value || o.val)}
        style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 20,
          border: `1.5px solid ${value === (o.value || o.val) ? "#0ea5e9" : "hsl(var(--border))"}`,
          background: value === (o.value || o.val) ? "rgba(14,165,233,.1)" : "hsl(var(--secondary))",
          color: value === (o.value || o.val) ? "#0ea5e9" : "hsl(var(--muted-foreground))",
          fontSize: 12, fontWeight: value === (o.value || o.val) ? 700 : 400,
          cursor: "pointer", transition: "all .15s",
          transform: value === (o.value || o.val) ? "scale(1.03)" : "scale(1)",
          fontFamily: "inherit" }}>
        <span style={{ fontSize: 14 }}>{o.icon}</span>
        {o.en || o.label}
      </button>
    ))}
  </div>
);

const OptionGrid = ({ options, value, onChange, cols = 3 }) => (
  <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 8 }}>
    {options.map((o) => {
      const active = value === (o.value || o.val);
      return (
        <button key={o.value || o.val} type="button" onClick={() => onChange(o.value || o.val)}
          style={{ padding: "13px 8px", borderRadius: 12, textAlign: "center",
            border: `1.5px solid ${active ? "#0ea5e9" : "hsl(var(--border))"}`,
            background: active ? "rgba(14,165,233,.09)" : "hsl(var(--secondary))",
            cursor: "pointer", transition: "all .18s",
            transform: active ? "scale(1.04)" : "scale(1)", fontFamily: "inherit",
            boxShadow: active ? "0 0 0 3px rgba(14,165,233,.15)" : "none" }}>
          <div style={{ fontSize: 22, marginBottom: 5 }}>{o.icon}</div>
          <div style={{ fontSize: 11, fontWeight: 700, color: active ? "#0ea5e9" : "hsl(var(--foreground))", lineHeight: 1.3, marginBottom: 2 }}>
            {o.en}
          </div>
          {o.es && <div style={{ fontSize: 10, color: "hsl(var(--muted-foreground))", lineHeight: 1.4 }}>{o.es}</div>}
        </button>
      );
    })}
  </div>
);

const SumBlock = ({ title, rows }) => (
  <div style={{ padding: "11px 14px", borderRadius: 10, background: "hsl(var(--secondary))", border: "0.5px solid hsl(var(--border))" }}>
    <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".13em", color: "hsl(var(--muted-foreground))", marginBottom: 7 }}>{title}</div>
    {rows.filter(([, v]) => v).map(([k, v]) => (
      <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "3px 0", fontSize: 12 }}>
        <span style={{ color: "hsl(var(--muted-foreground))" }}>{k}</span>
        <span style={{ fontWeight: 600, color: "hsl(var(--foreground))", textAlign: "right", maxWidth: "60%" }}>{v}</span>
      </div>
    ))}
  </div>
);

/* ─── Rider machine (tiny, rides the conveyor) ─────────────────────────────── */
const RiderMachine = ({ step }) => {
  const spinDurs = ["2.5s", "2.2s", "1.8s", "1.2s", "0.7s", "0.5s"];
  const spinDur = spinDurs[Math.min(step, spinDurs.length - 1)];
  return (
    <svg viewBox="0 0 100 130" width="50" style={{ display: "block", overflow: "visible" }}>
      <defs>
        <clipPath id="rc2"><circle cx="50" cy="65" r="28" /></clipPath>
        <filter id="rg2"><feGaussianBlur stdDeviation="1.5" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
      </defs>
      <ellipse cx="50" cy="127" rx="30" ry="4" fill="#000" opacity=".18" />
      <rect x="4" y="16" width="92" height="100" rx="10" fill="#1a3558" stroke="#2a4568" strokeWidth="1" />
      <rect x="4" y="104" width="92" height="12" fill="#0f1e2e" />
      <rect x="4" y="4" width="92" height="14" rx="7" fill="#0c1825" stroke="#1e3355" strokeWidth=".6" />
      {[16, 25, 34, 43, 52, 61].map((x, i) => (
        <circle key={i} cx={x} cy="11" r={i === step ? 2.5 : 1.8}
          fill={i <= step ? "#38bdf8" : "#1a3050"}
          opacity={i === step ? 1 : i < step ? 0.85 : 0.3}>
          {i === step && <animate attributeName="r" values="2.5;3.5;2.5" dur="1s" repeatCount="indefinite" />}
        </circle>
      ))}
      <circle cx="82" cy="11" r="5" fill="#0c2d45" stroke="#38bdf8" strokeWidth=".8" filter="url(#rg2)" />
      <circle cx="82" cy="11" r="2" fill="#38bdf8" opacity=".9">
        <animate attributeName="opacity" values=".9;.3;.9" dur="1.5s" repeatCount="indefinite" />
      </circle>
      <circle cx="50" cy="65" r="32" fill="#0b1a2a" stroke="#1a3050" strokeWidth=".8" />
      <circle cx="50" cy="65" r="28" fill="#0e1e2e" />
      <g clipPath="url(#rc2)">
        <rect x="22" y="78" width="56" height="52" fill="#0ea5e9" opacity=".38" />
        <g style={{ transformOrigin: "50px 65px", animation: `rq_spin ${spinDur} linear infinite` }}>
          {[0,45,90,135,180,225,270,315].map((deg, i) => {
            const rad = (deg * Math.PI) / 180;
            return <circle key={i} cx={50 + 19 * Math.sin(rad)} cy={65 - 19 * Math.cos(rad)} r="3" fill="#071320" stroke="#1e3558" strokeWidth=".5" opacity=".9" />;
          })}
        </g>
        <g transform="translate(50,65)" style={{ transformOrigin: "0 0", animation: `rq_spinr ${spinDur} linear infinite` }}>
          <circle r="8" fill="#050e1a" stroke="#38bdf8" strokeWidth="1" filter="url(#rg2)" opacity=".95" />
          <text textAnchor="middle" dy=".35em" fill="#38bdf8" fontSize="4" fontWeight="800" fontFamily="'Manrope',sans-serif" letterSpacing=".8">VFL</text>
        </g>
      </g>
      <circle cx="50" cy="65" r="28" fill="none" stroke="#1e3558" strokeWidth="1.5" />
    </svg>
  );
};

/* ─── Conveyor Track ─────────────────────────────────────────────────────────── */
const ConveyorTrack = ({ cur, locale, onStageClick }) => {
  const stageRefs = useRef([]);
  const trackRef  = useRef(null);
  const [riderLeft, setRiderLeft] = useState(0);

  useEffect(() => {
    if (stageRefs.current[cur] && trackRef.current) {
      const tRect = trackRef.current.getBoundingClientRect();
      const sRect = stageRefs.current[cur].getBoundingClientRect();
      setRiderLeft(sRect.left - tRect.left + sRect.width / 2 - 25);
    }
  }, [cur]);

  return (
    <div style={{ background: "linear-gradient(150deg,#0b1929 0%,#081320 60%,#040c16 100%)", borderRadius: 16, padding: "20px 0 14px", position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0, backgroundImage: "linear-gradient(rgba(255,255,255,.022) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.022) 1px,transparent 1px)", backgroundSize: "32px 32px", pointerEvents: "none" }} />
      <div style={{ overflowX: "auto", overflowY: "visible", padding: "0 16px", WebkitOverflowScrolling: "touch" }} className="scrollbar-hide">
        <div ref={trackRef} style={{ display: "flex", alignItems: "flex-start", minWidth: "max-content", padding: "10px 8px 4px", position: "relative" }}>
          <div style={{ position: "absolute", top: 38, left: 0, right: 0, height: 4, background: "repeating-linear-gradient(90deg,#1e3558 0,#1e3558 18px,#0b1929 18px,#0b1929 24px)", borderRadius: 2, zIndex: 0 }} />
          <div style={{ position: "absolute", top: 10, left: riderLeft, transition: "left .6s cubic-bezier(.34,1.56,.64,1)", zIndex: 3, pointerEvents: "none", animation: "rq_float 4s ease-in-out infinite" }}>
            <RiderMachine step={cur} />
          </div>
          {STAGES.map((s, i) => (
            <div key={i} style={{ display: "flex", alignItems: "flex-start" }}>
              {i > 0 && (
                <div style={{ width: 22, height: 4, marginTop: 26, flexShrink: 0, position: "relative", background: i <= cur ? "#0ea5e9" : "#1e3558", transition: "background .3s" }}>
                  <div style={{ position: "absolute", top: -4, right: -5, width: 0, height: 0, borderTop: "6px solid transparent", borderBottom: "6px solid transparent", borderLeft: `6px solid ${i <= cur ? "#0ea5e9" : "#1e3558"}`, transition: "border-left-color .3s" }} />
                </div>
              )}
              <div ref={(el) => (stageRefs.current[i] = el)} onClick={() => i < cur && onStageClick(i)}
                style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 0, cursor: i < cur ? "pointer" : "default", position: "relative", zIndex: 1, width: 96, flexShrink: 0 }}>
                <div style={{ width: 52, height: 52, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, position: "relative",
                  background: i < cur ? "rgba(14,165,233,.15)" : i === cur ? "#0ea5e9" : "#0b1929",
                  border: `2.5px solid ${i < cur ? "#0ea5e9" : i === cur ? "#38bdf8" : "#1e3558"}`,
                  boxShadow: i === cur ? "0 0 0 6px rgba(14,165,233,.2)" : "none",
                  transform: i === cur ? "scale(1.18)" : "scale(1)",
                  transition: "all .25s cubic-bezier(.34,1.56,.64,1)" }}>
                  {s.icon}
                  {i === cur && <div style={{ position: "absolute", inset: -8, borderRadius: "50%", border: "2px solid rgba(14,165,233,.35)", animation: "rq_pulse 1.6s ease-out infinite" }} />}
                  {i < cur && <div style={{ position: "absolute", bottom: -2, right: -2, width: 16, height: 16, borderRadius: "50%", background: "#0ea5e9", color: "white", fontSize: 9, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700 }}>✓</div>}
                </div>
                <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".1em", color: i === cur ? "#38bdf8" : i < cur ? "rgba(255,255,255,.55)" : "rgba(255,255,255,.22)", marginTop: 7, whiteSpace: "nowrap", transition: "color .2s" }}>
                  {locale === "es" ? s.es : s.en}
                </div>
                <div style={{ fontSize: 8.5, color: i === cur ? "rgba(14,165,233,.7)" : "rgba(255,255,255,.18)", textAlign: "center", maxWidth: 84, lineHeight: 1.4, transition: "color .2s" }}>
                  {locale === "es" ? s.subES : s.subEN}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

/* ─── Success Machine (full-size) ───────────────────────────────────────────── */
const SuccessMachine = () => (
  <svg viewBox="0 0 240 310" width="100%" style={{ maxWidth: 160, display: "block" }}>
    <defs>
      <clipPath id="sm_c"><circle cx="119" cy="155" r="62" /></clipPath>
      <filter id="sm_g"><feGaussianBlur stdDeviation="2" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
    </defs>
    <ellipse cx="120" cy="304" rx="76" ry="6" fill="#000" opacity=".18" />
    <rect x="10" y="38" width="220" height="240" rx="18" fill="#1a3558" stroke="#2a4568" strokeWidth="1.5" />
    <rect x="10" y="248" width="220" height="30" fill="#0f1e2e" />
    <rect x="10" y="12" width="220" height="30" rx="12" fill="#0c1825" stroke="#1e3355" strokeWidth=".8" />
    {[38,54,70,86,102].map((x, i) => (
      <circle key={i} cx={x} cy="27" r="4" fill="#38bdf8" opacity=".9">
        <animate attributeName="opacity" values=".9;.3;.9" dur={`${0.4 + i*0.12}s`} begin={`${i*0.1}s`} repeatCount="indefinite" />
      </circle>
    ))}
    <circle cx="119" cy="155" r="72" fill="#0b1a2a" stroke="#1a3050" strokeWidth="1.2" />
    <circle cx="119" cy="155" r="62" fill="#071e30" />
    <g clipPath="url(#sm_c)">
      <rect x="57" y="100" width="124" height="120" fill="#34d399" opacity=".25" />
      <g transform="translate(119,155)" style={{ transformOrigin: "0 0" }}>
        <circle r="28" fill="#050e1a" stroke="#34d399" strokeWidth="2" filter="url(#sm_g)" opacity=".95" />
        <text textAnchor="middle" dy=".35em" fill="#34d399" fontSize="22" fontWeight="800">✓</text>
      </g>
    </g>
    <circle cx="119" cy="155" r="62" fill="none" stroke="#1e3558" strokeWidth="2.5" />
  </svg>
);

/* ─── Empty state ────────────────────────────────────────────────────────────── */
const EMPTY = {
  first_name: "", last_name: "", email: "", phone: "",
  contact_method: "", sms_consent: false,
  address_line1: "", address_line2: "", city: "", state: "", zip_code: "",
  company_legal_name: "", dba_name: "", business_type: "", has_membership: "", job_title: "",
  service_type: "", laundry_frequency: "", estimated_lbs: "",
  best_date: "", best_time: "",
  additional_notes: "", subscribe_newsletter: false,
};

/* ─── Main ─────────────────────────────────────────────────────────────────── */
export default function RequestQuotePage() {
  const { t, locale } = useLocale();
  const topRef = useRef(null);
  const [cur, setCur] = useState(0);
  const [formKey, setFormKey] = useState(0);
  const [form, setForm] = useState({ ...EMPTY });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const setF = useCallback((k, v) => setForm((p) => ({ ...p, [k]: v })), []);
  const scrollTop = () => topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });

  const goTo = (n) => { setCur(n); setFormKey((k) => k + 1); scrollTop(); };

  const validate = () => {
    const err = (msg) => { toast.error(msg); return false; };
    if (cur === 0) {
      if (!form.first_name.trim()) return err(t("Enter your first name", "Ingresa tu nombre"));
      if (!form.last_name.trim())  return err(t("Enter your last name", "Ingresa tu apellido"));
      if (!form.email.includes("@")) return err(t("Enter a valid email", "Correo inválido"));
      if (!form.phone.trim()) return err(t("Enter your phone", "Ingresa tu teléfono"));
    }
    if (cur === 1) {
      if (!form.address_line1.trim()) return err(t("Enter your address", "Ingresa tu dirección"));
      if (!form.city.trim())  return err(t("Enter your city", "Ingresa tu ciudad"));
      if (!form.state.trim()) return err(t("Enter your state", "Ingresa tu estado"));
      if (!form.zip_code.trim()) return err(t("Enter your ZIP", "Ingresa tu código postal"));
    }
    if (cur === 2) {
      if (!form.business_type) return err(t("Select a business type", "Selecciona tipo de negocio"));
      if (!form.has_membership) return err(t("Select membership status", "Selecciona estado de membresía"));
    }
    if (cur === 3) {
      if (!form.service_type) return err(t("Select a service type", "Selecciona tipo de servicio"));
      if (!form.laundry_frequency) return err(t("Select a frequency", "Selecciona una frecuencia"));
      if (!form.estimated_lbs) return err(t("Enter estimated lbs", "Ingresa las libras estimadas"));
    }
    if (cur === 4) {
      if (!form.best_date) return err(t("Select a date", "Selecciona una fecha"));
      if (!form.best_time) return err(t("Select a time", "Selecciona un horario"));
    }
    if (cur === 5) {
      if (["text", "sms", "whatsapp"].includes(form.contact_method) && !form.sms_consent)
        return err(t("Accept SMS consent", "Acepta el consentimiento SMS"));
    }
    return true;
  };

  const handleNext = async () => {
    if (!validate()) return;
    if (cur < 5) { goTo(cur + 1); return; }

    setSubmitting(true);
    try {
      const payload = {
        ...form,
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        address_line1: form.address_line1.trim(),
        city: form.city.trim(),
        state: form.state.trim(),
        zip_code: form.zip_code.trim(),
        company_legal_name: form.company_legal_name.trim(),
        dba_name: form.dba_name.trim(),
        additional_notes: form.additional_notes.trim(),
        estimated_lbs: parseFloat(form.estimated_lbs) || 0,
      };
      const res = await axios.post(`${API}/public/b2b-quote`, payload);
      toast.success(res.data.message || t("Quote request submitted!", "¡Solicitud enviada!"));
      setSubmitted(true);
    } catch (e) {
      const d = e.response?.data?.detail;
      toast.error(typeof d === "string" ? d : t("Error submitting request", "Error al enviar la solicitud"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    setForm({ ...EMPTY }); setCur(0); setFormKey((k) => k + 1);
    setSubmitted(false); scrollTop();
  };

  const g2 = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 };
  const g3 = { display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 10 };
  const fGap = { display: "flex", flexDirection: "column", gap: 16 };

  const svcLabel = SERVICE_TYPES.find((s) => s.value === form.service_type)?.[locale === "es" ? "es" : "en"] || "";
  const freqLabel = FREQUENCY_OPTIONS.find((f) => f.value === form.laundry_frequency)?.[locale === "es" ? "es" : "en"] || "";
  const bizLabel = BUSINESS_TYPES.find((b) => b.value === form.business_type)?.[locale === "es" ? "es" : "en"] || "";
  const cmLabel = CONTACT_METHODS.find((c) => c.value === form.contact_method)?.[locale === "es" ? "es" : "en"] || "";
  const memLabels = { yes: t("Yes", "Sí"), no: t("No", "No"), interested: t("Interested", "Interesado") };

  return (
    <div className="min-h-screen" style={{ background: "hsl(var(--background))" }}>
      <PublicNav />

      <style>{`
        @keyframes rq_spin   { to { transform: rotate(360deg)  } }
        @keyframes rq_spinr  { to { transform: rotate(-360deg) } }
        @keyframes rq_pulse  { 0%{transform:scale(.85);opacity:.8} 100%{transform:scale(1.35);opacity:0} }
        @keyframes rq_float  { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-7px)} }
        @keyframes rq_panel  { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        @keyframes rq_shimmer{ 0%{transform:translateX(-100%)} 100%{transform:translateX(100%)} }
        @keyframes rq_glow   { 0%,100%{opacity:.4} 50%{opacity:.9} }
        .scrollbar-hide::-webkit-scrollbar{display:none}
        .scrollbar-hide{scrollbar-width:none}
      `}</style>

      {/* ── Hero ── */}
<section ref={topRef} style={{
  paddingTop: 80, paddingBottom: 0,
  background: "linear-gradient(150deg,#0b1929 0%,#081320 55%,#040c16 100%)",
  position: "relative", overflow: "hidden",
}}>
  <div style={{ position: "absolute", inset: 0, backgroundImage: "linear-gradient(rgba(255,255,255,.022) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.022) 1px,transparent 1px)", backgroundSize: "44px 44px", pointerEvents: "none" }} />
  <div style={{ position: "absolute", top: -80, left: -60, width: 380, height: 380, borderRadius: "50%", background: "radial-gradient(circle,rgba(14,165,233,.13) 0%,transparent 65%)", filter: "blur(40px)", pointerEvents: "none" }} />

  {/* ── Banner image ── */}
  <div style={{ width: "100%", maxHeight: 280, overflow: "hidden", position: "relative" }}>
    <img src={heroBanner} alt="Ventura Fresh Laundry"
      style={{ width: "100%", height: 280, objectFit: "cover", objectPosition: "center", display: "block", opacity: 0.75 }} />
    <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 120, background: "linear-gradient(to bottom, transparent, #081320)", pointerEvents: "none" }} />
    <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 60, background: "linear-gradient(to bottom, #0b1929, transparent)", pointerEvents: "none" }} />
  </div>

  {/* ── Text ── */}
  <div style={{ maxWidth: 900, margin: "0 auto", padding: "20px 24px 48px", position: "relative", zIndex: 2 }}>
    {/* Badge */}
    <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 20, padding: "4px 12px", marginBottom: 18 }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#34d399", boxShadow: "0 0 6px rgba(52,211,153,.9)", display: "inline-block", animation: "rq_glow 2s ease-in-out infinite" }} />
      <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".18em", color: "rgba(255,255,255,.5)" }}>
        {t("Commercial Laundry Services", "Servicios Comerciales de Lavandería")}
      </span>
    </div>

    {/* Heading */}
    <h1 style={{ fontFamily: "'Manrope',sans-serif", fontSize: "clamp(26px,4.5vw,48px)", fontWeight: 800, color: "white", lineHeight: 1.1, letterSpacing: "-.025em", margin: "0 0 12px" }}>
      {t("Get a Custom", "Solicita una")} <span style={{ color: "#38bdf8" }}>{t("Commercial Quote", "Cotización Comercial")}</span>
    </h1>

    <p style={{ fontSize: 14, color: "rgba(255,255,255,.45)", lineHeight: 1.75, maxWidth: 420, margin: "0 0 28px" }}>
      {t(
        "Follow each stage on the conveyor belt — fill in your business details and our team will respond within 24–48 hours.",
        "Completa cada etapa en la cinta — ingresa los datos de tu negocio y te respondemos en 24–48 horas."
      )}
    </p>

    {/* Industry icons row */}
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
      {[
        { icon: "🏨", en: "Hotels",      es: "Hoteles"      },
        { icon: "🏠", en: "Airbnb",      es: "Airbnb"       },
        { icon: "🍽️", en: "Restaurants", es: "Restaurantes" },
        { icon: "🏥", en: "Healthcare",  es: "Salud"        },
        { icon: "💪", en: "Gyms",        es: "Gimnasios"    },
        { icon: "🏢", en: "Corporate",   es: "Corporativo"  },
      ].map((item) => (
        <div key={item.en} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 12px", borderRadius: 20, background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.08)" }}>
          <span style={{ fontSize: 13 }}>{item.icon}</span>
          <span style={{ fontSize: 11, color: "rgba(255,255,255,.5)", fontWeight: 600 }}>{locale === "es" ? item.es : item.en}</span>
        </div>
      ))}
    </div>
  </div>
</section>

      {/* ── Main ── */}
      <section style={{ padding: "0 0 72px" }}>
        <div style={{ maxWidth: 760, margin: "0 auto", padding: "0 16px" }}>

          {/* Conveyor */}
          <div style={{ marginTop: "-20px", position: "relative", zIndex: 2 }}>
            <ConveyorTrack cur={submitted ? 5 : cur} locale={locale} onStageClick={(i) => { if (!submitted) goTo(i); }} />
          </div>

          {/* ── Success overlay ── */}
          {submitted && (
            <div style={{ background: "#07111d", borderRadius: 16, marginTop: 16, border: "0.5px solid rgba(14,165,233,.2)", padding: "36px 28px", textAlign: "center", animation: "rq_panel .4s ease both" }}>
              <div style={{ width: 160, margin: "0 auto 8px", animation: "rq_float 4s ease-in-out infinite" }}>
                <SuccessMachine />
              </div>
              <div style={{ width: 56, height: 56, borderRadius: "50%", background: "rgba(52,211,153,.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, margin: "4px auto 12px" }}>🎉</div>
              <div style={{ fontSize: 22, fontWeight: 800, fontFamily: "'Manrope',sans-serif", color: "white", marginBottom: 8 }}>
                {t("Quote request received!", "¡Solicitud de cotización recibida!")}
              </div>
              <p style={{ fontSize: 13, color: "rgba(255,255,255,.45)", maxWidth: 320, lineHeight: 1.7, margin: "0 auto 24px" }}>
                {t(
                  "Our team will review your requirements and contact you within 24–48 hours with a customized proposal.",
                  "Nuestro equipo revisará tus requisitos y se pondrá en contacto en 24–48 horas con una propuesta personalizada."
                )}
              </p>
              <button onClick={handleReset} style={{ padding: "11px 26px", borderRadius: 10, border: "none", background: "linear-gradient(135deg,#0ea5e9,#2563eb)", color: "white", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", boxShadow: "0 4px 20px rgba(14,165,233,.3)" }}>
                🔄 {t("Submit another request", "Enviar otra solicitud")}
              </button>
            </div>
          )}

          {/* ── Form card ── */}
          {!submitted && (
            <div key={formKey} style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 16, boxShadow: "0 20px 60px rgba(0,0,0,.25)", overflow: "hidden", marginTop: 16, animation: "rq_panel .3s ease both" }}>
              {/* Top accent bar */}
              <div style={{ height: 3, background: "linear-gradient(90deg,#38bdf8,#0ea5e9,#2563eb)" }} />

              {/* Card header */}
              <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 22px", borderBottom: "1px solid hsl(var(--border))", background: "hsl(var(--secondary))" }}>
                <div style={{ width: 38, height: 38, borderRadius: 10, background: "rgba(14,165,233,.1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>
                  {STAGES[cur].icon}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, fontFamily: "'Manrope',sans-serif", color: "hsl(var(--foreground))" }}>
                    {locale === "es" ? STAGES[cur].subES : STAGES[cur].subEN}
                  </div>
                  <div style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", marginTop: 1 }}>
                    {t(`Step ${cur + 1} of 6`, `Paso ${cur + 1} de 6`)} — {locale === "es" ? STAGES[cur].es : STAGES[cur].en}
                  </div>
                </div>
                {/* Progress dots */}
                <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                  {STAGES.map((_, i) => (
                    <div key={i} onClick={() => i < cur && goTo(i)}
                      style={{ width: i === cur ? 20 : 7, height: 7, borderRadius: 3.5, transition: "all .3s", cursor: i < cur ? "pointer" : "default",
                        background: i < cur ? "#0ea5e9" : i === cur ? "#0ea5e9" : "hsl(var(--border))" }} />
                  ))}
                </div>
              </div>

              {/* Form body */}
              <div style={{ padding: "22px 24px" }}>
                <div style={fGap}>

                  {/* ── Step 0: Contact ── */}
                  {cur === 0 && (
                    <>
                      <div style={g2}>
                        <FF label={t("First name *", "Nombre *")}><FInput value={form.first_name} onChange={(e) => setF("first_name", e.target.value)} placeholder="John" autoComplete="given-name" /></FF>
                        <FF label={t("Last name *", "Apellido *")}><FInput value={form.last_name} onChange={(e) => setF("last_name", e.target.value)} placeholder="Smith" autoComplete="family-name" /></FF>
                      </div>
                      <div style={g2}>
                        <FF label={t("Email *", "Correo *")}><FInput type="email" value={form.email} onChange={(e) => setF("email", e.target.value)} placeholder="you@company.com" /></FF>
                        <FF label={t("Phone *", "Teléfono *")}><FInput type="tel" value={form.phone} onChange={(e) => setF("phone", e.target.value)} placeholder="+1 (555) 000-0000" /></FF>
                      </div>
                      <div style={g2}>
                        <FF label={t("Job title / Role", "Cargo / Rol")}>
                          <FInput value={form.job_title} onChange={(e) => setF("job_title", e.target.value)} placeholder={t("e.g. Operations Manager", "ej. Gerente de operaciones")} />
                        </FF>
                     <FF label={t("Best way to contact you", "Cómo contactarte")}>
  <ChipSet
    value={form.contact_method}
    onChange={(v) => setF("contact_method", v)}
    options={CONTACT_METHODS.map((m) => ({
      ...m,
      val: m.value,
      en: locale === "es" ? m.es : m.en,
    }))}
  />
</FF>
                      </div>
                      {["text", "sms", "whatsapp"].includes(form.contact_method) && (
                        <SmsConsentField checked={form.sms_consent} onChange={(e) => setF("sms_consent", e.target.checked)} idPrefix="rq-sms" />
                      )}
                      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                        <input type="checkbox" id="rq-news" checked={form.subscribe_newsletter} onChange={(e) => setF("subscribe_newsletter", e.target.checked)} style={{ width: 14, height: 14, accentColor: "#0ea5e9", cursor: "pointer" }} />
                        <label htmlFor="rq-news" style={{ fontSize: 12, color: "hsl(var(--muted-foreground))", cursor: "pointer" }}>
                          {t("Sign up for news and updates", "Suscríbete para recibir noticias y actualizaciones")}
                        </label>
                      </div>
                    </>
                  )}

                  {/* ── Step 1: Address ── */}
                  {cur === 1 && (
                    <>
                      <FF label={t("Street address *", "Dirección *")}>
                        <AddressAutocomplete
                          value={form.address_line1}
                          onChange={(v) => setF("address_line1", v)}
                          onSelect={(addr) => {
                            setF("address_line1", addr.street);
                            if (addr.city) setF("city", addr.city);
                            if (addr.state) setF("state", addr.state.length > 2 ? addr.state.substring(0, 2).toUpperCase() : addr.state.toUpperCase());
                            if (addr.zip) setF("zip_code", addr.zip);
                          }}
                          renderInput={(props) => <FInput {...props} data-testid="quote-address-autocomplete" />}
                        />
                      </FF>
                      <FF label={t("Suite / Unit (optional)", "Suite / Unidad (opcional)")}><FInput value={form.address_line2} onChange={(e) => setF("address_line2", e.target.value)} placeholder={t("Suite 200, Unit B…", "Suite 200, Unidad B…")} /></FF>
                      <div style={g3}>
                        <FF label={t("City *", "Ciudad *")}><FInput value={form.city} onChange={(e) => setF("city", e.target.value)} placeholder="Los Angeles" /></FF>
                        <FF label={t("State *", "Estado *")}><FInput value={form.state} onChange={(e) => setF("state", e.target.value.toUpperCase())} placeholder="CA" maxLength={2} /></FF>
                        <FF label={t("ZIP *", "CP *")}><FInput value={form.zip_code} onChange={(e) => setF("zip_code", e.target.value)} placeholder="90001" maxLength={10} /></FF>
                      </div>
                    </>
                  )}

                  {/* ── Step 2: Business ── */}
                  {cur === 2 && (
                    <>
                      <div style={g2}>
                        <FF label={t("Company legal name", "Nombre legal de la empresa")}>
                          <FInput value={form.company_legal_name} onChange={(e) => setF("company_legal_name", e.target.value)} placeholder="Acme Corp LLC" />
                        </FF>
                        <FF label={t("DBA / Trade name", "Nombre comercial / DBA")}>
                          <FInput value={form.dba_name} onChange={(e) => setF("dba_name", e.target.value)} placeholder={t("If different", "Si es diferente")} />
                        </FF>
                      </div>
                      <FF label={t("Business type / Industry *", "Tipo de negocio / Industria *")}>
                        <FSelect value={form.business_type} onChange={(e) => setF("business_type", e.target.value)}>
                          <option value="">{t("Select…", "Selecciona…")}</option>
                          {BUSINESS_TYPES.map((b) => <option key={b.value} value={b.value}>{locale === "es" ? b.es : b.en}</option>)}
                        </FSelect>
                      </FF>
                      <FF label={t("Active membership? *", "¿Membresía activa? *")}>
                        <ChipSet
                          value={form.has_membership}
                          onChange={(v) => setF("has_membership", v)}
                          options={[
                            { val: "yes",       icon: "✅", en: t("Yes, I have one", "Sí, tengo una") },
                            { val: "no",        icon: "❌", en: t("No", "No") },
                            { val: "interested",icon: "🤔", en: t("Interested", "Me interesa") },
                          ]}
                        />
                      </FF>
                    </>
                  )}

                  {/* ── Step 3: Service ── */}
                  {cur === 3 && (
                    <>
                      <FF label={t("Type of service needed *", "Tipo de servicio requerido *")}>
                        <OptionGrid value={form.service_type} onChange={(v) => setF("service_type", v)} cols={3}
                          options={SERVICE_TYPES.map((s) => ({ ...s, val: s.value, en: locale === "es" ? s.es : s.en }))} />
                      </FF>
                      <FF label={t("Expected laundry frequency *", "Frecuencia esperada de lavandería *")}>
                        <OptionGrid value={form.laundry_frequency} onChange={(v) => setF("laundry_frequency", v)} cols={3}
                          options={FREQUENCY_OPTIONS.map((f) => ({ ...f, val: f.value, en: locale === "es" ? f.es : f.en }))} />
                      </FF>
                      <FF label={t("Estimated avg. pounds per pick-up *", "Libras promedio estimadas por recogida *")}>
                        <FInput type="number" min="1" value={form.estimated_lbs} onChange={(e) => setF("estimated_lbs", e.target.value)} placeholder={t("e.g. 250", "ej. 250")} />
                      </FF>
                    </>
                  )}

                  {/* ── Step 4: Schedule ── */}
                  {cur === 4 && (
                    <>
                      <div style={g2}>
                        <FF label={t("Best date to reach you *", "Mejor fecha para contactarte *")}>
                          <FInput type="date" value={form.best_date} onChange={(e) => setF("best_date", e.target.value)} min={new Date().toISOString().split("T")[0]} style={{ cursor: "pointer" }} />
                        </FF>
                        <FF label={t("Best time (Pacific Time) *", "Mejor hora (hora del Pacífico) *")}>
                          <FInput type="time" value={form.best_time} onChange={(e) => setF("best_time", e.target.value)} style={{ cursor: "pointer" }} />
                        </FF>
                      </div>
                      <FF label={t("Additional notes", "Notas adicionales")}>
                        <FTextarea value={form.additional_notes} onChange={(e) => setF("additional_notes", e.target.value)} placeholder={t("Any specific requirements, questions or context…", "Requisitos específicos, preguntas o contexto adicional…")} rows={4} />
                      </FF>
                      {/* Pacific Time note */}
                      <div style={{ padding: "10px 14px", borderRadius: 9, background: "rgba(14,165,233,.06)", border: "1px solid rgba(14,165,233,.18)", fontSize: 11, color: "hsl(var(--muted-foreground))", lineHeight: 1.6 }}>
                        💡 {t("Our team typically responds within 24–48 business hours. We'll reach out via your preferred contact method.", "Nuestro equipo responde en 24–48 horas hábiles. Te contactaremos por tu método preferido.")}
                      </div>
                    </>
                  )}

                  {/* ── Step 5: Confirm ── */}
                  {cur === 5 && (
                    <>
                      <SumBlock title={`👤 ${t("Contact", "Contacto")}`} rows={[
                        [t("Name", "Nombre"), `${form.first_name} ${form.last_name}`.trim()],
                        [t("Email", "Correo"), form.email],
                        [t("Phone", "Teléfono"), form.phone],
                        [t("Role", "Cargo"), form.job_title],
                        [t("Contact via", "Via"), cmLabel],
                      ]} />
                      <SumBlock title={`📍 ${t("Business Address", "Dirección")}`} rows={[
                        [t("Street", "Calle"), form.address_line1],
                        [t("Line 2", "Línea 2"), form.address_line2],
                        [t("City / State / ZIP", "Ciudad / Estado / CP"), [form.city, form.state, form.zip_code].filter(Boolean).join(", ")],
                      ]} />
                      <SumBlock title={`🏢 ${t("Business", "Negocio")}`} rows={[
                        [t("Company", "Empresa"), form.company_legal_name || form.dba_name],
                        [t("Type", "Tipo"), bizLabel],
                        [t("Membership", "Membresía"), memLabels[form.has_membership]],
                      ]} />
                      <SumBlock title={`🧺 ${t("Service", "Servicio")}`} rows={[
                        [t("Service type", "Tipo de servicio"), svcLabel],
                        [t("Frequency", "Frecuencia"), freqLabel],
                        [t("Est. lbs / pickup", "Lbs / recogida"), form.estimated_lbs ? `${form.estimated_lbs} lbs` : ""],
                      ]} />
                      <SumBlock title={`📅 ${t("Schedule", "Horario")}`} rows={[
                        [t("Date", "Fecha"), form.best_date],
                        [t("Time", "Hora"), form.best_time],
                        ...(form.additional_notes ? [[t("Notes", "Notas"), form.additional_notes.slice(0, 80)]] : []),
                      ]} />

                      {/* Terms */}
                      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "11px 14px", background: "hsl(var(--secondary))", borderRadius: 10, border: "0.5px solid hsl(var(--border))" }}>
                        <input type="checkbox" id="rq-terms" checked={form.terms} onChange={(e) => setF("terms", e.target.checked)} style={{ width: 15, height: 15, flexShrink: 0, marginTop: 1, accentColor: "#0ea5e9", cursor: "pointer" }} />
                        <label htmlFor="rq-terms" style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", lineHeight: 1.6, cursor: "pointer" }}>
                          {t(
                            "By submitting this form, you agree to be contacted by our team regarding your commercial laundry quote.",
                            "Al enviar este formulario, aceptas ser contactado por nuestro equipo en relación a tu cotización de lavandería comercial."
                          )}
                        </label>
                      </div>
                    </>
                  )}

                </div>

                {/* ── Navigation ── */}
                <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
                  {cur > 0 && (
                    <button type="button" onClick={() => goTo(cur - 1)}
                      style={{ padding: "10px 18px", borderRadius: 9, border: "1px solid hsl(var(--border))", background: "hsl(var(--secondary))", color: "hsl(var(--muted-foreground))", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", transition: "all .15s" }}>
                      ← {t("Back", "Atrás")}
                    </button>
                  )}
                  <button type="button" onClick={handleNext} disabled={submitting}
                    style={{ flex: 1, padding: "11px 18px", borderRadius: 9, border: "none", background: "linear-gradient(135deg,#0ea5e9,#2563eb)", color: "white", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".1em", cursor: submitting ? "not-allowed" : "pointer", opacity: submitting ? 0.6 : 1, fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, boxShadow: "0 4px 20px rgba(14,165,233,.3)", transition: "all .15s", position: "relative", overflow: "hidden" }}>
                    {submitting ? (
                      <>
                        <div style={{ width: 13, height: 13, border: "2px solid rgba(255,255,255,.4)", borderTopColor: "white", borderRadius: "50%", animation: "rq_spin .7s linear infinite" }} />
                        {t("Sending…", "Enviando…")}
                      </>
                    ) : cur < 5 ? (
                      <>{t("Next", "Siguiente")}: {locale === "es" ? STAGES[cur + 1].es : STAGES[cur + 1].en} →</>
                    ) : (
                      <>📋 {t("Submit quote request", "Enviar solicitud de cotización")}</>
                    )}
                    <span style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg,transparent,rgba(255,255,255,.1),transparent)", transform: "translateX(-100%)", animation: "rq_shimmer 2s ease infinite", pointerEvents: "none" }} />
                  </button>
                </div>
              </div>
            </div>
          )}

        </div>
      </section>

      <PublicFooter />
    </div>
  );
}