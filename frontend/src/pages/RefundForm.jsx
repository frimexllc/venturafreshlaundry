import React, { useState } from "react";
import { useLocale } from "../context/LocaleContext";
import { toast } from "sonner";

const API = process.env.REACT_APP_BACKEND_URL;

const HERO_IMG =
  "https://images.unsplash.com/photo-1638949493140-edb10b7be2f3?w=600&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8MTR8fGxhdW5kcnklMjBzZXJ2aWNlfGVufDB8fDB8fHww";

/* ─── Bilingual reason definitions ────────────────────────────────────────── */
const REASONS = [
  { key: "machineNotStart",  en: "Machine did not start",               es: "La máquina no inició",                        icon: "⏻" },
  { key: "machineStopped",   en: "Machine stopped mid-cycle",           es: "La máquina se detuvo a la mitad",             icon: "⏹" },
  { key: "incompleteCycle",  en: "Incomplete wash or dry cycle",        es: "Ciclo de lavado/secado incompleto",           icon: "🔄" },
  { key: "dryerNotHeating",  en: "Dryer not heating",                   es: "La secadora no calienta",                     icon: "🌡" },
  { key: "noWater",          en: "Washer did not fill with water",      es: "La lavadora no se llenó de agua",             icon: "💧" },
  { key: "paymentAccepted",  en: "Payment accepted, machine didn't run",es: "Pago aceptado pero máquina no funcionó",      icon: "💳" },
  { key: "cardError",        en: "Coin / card system malfunction",      es: "Falla en sistema de monedas / tarjeta",       icon: "🖥" },
  { key: "noCoins",          en: "Change machine didn't dispense coins",es: "La máquina de cambio no dispensó monedas",   icon: "🪙" },
  { key: "noChange",         en: "Change machine took cash, no coins",  es: "La máquina tomó el efectivo sin dar cambio",  icon: "💰" },
];

/* ─── Reason card ──────────────────────────────────────────────────────────── */
function ReasonCard({ reason, checked, onChange, locale }) {
  return (
    <button
      type="button"
      onClick={onChange}
      className={[
        "group relative flex items-start gap-3 p-4 rounded-2xl border-2 text-left w-full",
        "transition-all duration-200 ease-out select-none cursor-pointer",
        checked
          ? "border-[#0c4a6e] bg-[#0c4a6e] shadow-lg shadow-sky-900/25"
          : "border-slate-150 bg-white hover:border-slate-300 hover:shadow-sm",
      ].join(" ")}
    >
      {/* Checkmark */}
      <span className={[
        "w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-all duration-200",
        checked ? "border-white/60 bg-white/20" : "border-slate-200 bg-slate-50",
      ].join(" ")}>
        {checked && (
          <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
            <path d="M1 3.5l2.5 2.5 4.5-5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>

      {/* Icon + text */}
      <span className="flex-1 min-w-0">
        <span className={[
          "block text-lg leading-none mb-1.5 transition-transform duration-200",
          checked ? "scale-110" : "group-hover:scale-105",
        ].join(" ")}>
          {reason.icon}
        </span>
        <span className={[
          "block text-[13px] font-semibold leading-snug",
          checked ? "text-white" : "text-slate-700",
        ].join(" ")}>
          {locale === "es" ? reason.es : reason.en}
        </span>
        <span className={[
          "block text-[11px] mt-0.5 leading-snug",
          checked ? "text-white/55" : "text-slate-400",
        ].join(" ")}>
          {locale === "es" ? reason.en : reason.es}
        </span>
      </span>
    </button>
  );
}

/* ─── Other reason pill (same size as ReasonCard) ────────────────────────── */
function OtherPill({ checked, onChange, locale }) {
  return (
    <button
      type="button"
      onClick={onChange}
      className={[
        "group relative flex items-start gap-3 p-4 rounded-2xl border-2 text-left w-full",
        "transition-all duration-200 ease-out select-none cursor-pointer",
        checked
          ? "border-[#0c4a6e] bg-[#0c4a6e] shadow-lg shadow-sky-900/25"
          : "border-slate-150 bg-white hover:border-slate-300 hover:shadow-sm",
      ].join(" ")}
    >
      <span className={[
        "w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-all duration-200",
        checked ? "border-white/60 bg-white/20" : "border-slate-200 bg-slate-50",
      ].join(" ")}>
        {checked && (
          <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
            <path d="M1 3.5l2.5 2.5 4.5-5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
      <span className="text-lg leading-none mt-0.5 mr-1">📝</span>
      <span className="flex-1 min-w-0">
        <span className={[
          "block text-[13px] font-semibold leading-snug",
          checked ? "text-white" : "text-slate-700",
        ].join(" ")}>
          {locale === "es" ? "Otra razón" : "Other reason"}
        </span>
        <span className={[
          "block text-[11px] mt-0.5 leading-snug",
          checked ? "text-white/55" : "text-slate-400",
        ].join(" ")}>
          {locale === "es" ? "Other" : "Otro"}
        </span>
      </span>
    </button>
  );
}

/* ─── Helpers ──────────────────────────────────────────────────────────────── */
function FormField({ label, children, error }) {
  return (
    <div>
      {label && (
        <span className="block text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-1.5">
          {label}
        </span>
      )}
      {children}
      {error && <p className="text-xs text-red-500 mt-1.5 font-medium">{error}</p>}
    </div>
  );
}

const inputCls =
  "w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 placeholder-slate-400 outline-none focus:bg-white focus:border-[#0c4a6e]/60 focus:ring-4 focus:ring-[#0c4a6e]/8 transition-all duration-200";

function Divider({ label }) {
  return (
    <div className="flex items-center gap-3 py-1">
      <div className="flex-1 h-px bg-slate-100" />
      <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 whitespace-nowrap px-1">
        {label}
      </span>
      <div className="flex-1 h-px bg-slate-100" />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
export default function RefundForm() {
  const { t, locale } = useLocale();
  const lang = locale === "es" ? "es" : "en";

  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split("T")[0],
    time: "", machine_number: "", amount: "",
    reasons: [], otherReason: "", comment: "", name: "", phone: "",
  });
  const [staffApproved, setStaffApproved] = useState(null);
  const [staffAmount, setStaffAmount]     = useState("");
  const [errors, setErrors]               = useState({});

  /* ── Validation ─────────────────────────────────────────────────────────── */
  const validate = () => {
    const e = {};
    const today = new Date(); today.setHours(0,0,0,0);
    if (new Date(formData.date) > today)
      e.date = lang === "es" ? "La fecha no puede ser futura" : "Date cannot be in the future";
    if (formData.time && !/^([01]\d|2[0-3]):([0-5]\d)$/.test(formData.time))
      e.time = lang === "es" ? "Formato inválido (HH:MM)" : "Invalid format (HH:MM)";
    if (!formData.machine_number.trim())
      e.machine_number = lang === "es" ? "Requerido" : "Required";
    else if (!/^[A-Za-z0-9]+(-[A-Za-z0-9]+)?$/.test(formData.machine_number.trim()))
      e.machine_number = lang === "es" ? "Ej: W-04, 12A" : "e.g. W-04, 12A";
    const amt = parseFloat(formData.amount);
    if (!formData.amount || isNaN(amt) || amt <= 0)
      e.amount = lang === "es" ? "Debe ser mayor a $0" : "Must be greater than $0";
    else if (amt > 50)
      e.amount = lang === "es" ? "Máximo $50" : "Maximum $50";
    if (formData.reasons.length === 0)
      e.reasons = lang === "es" ? "Selecciona al menos una razón" : "Select at least one reason";
    if (formData.reasons.includes("other") && !formData.otherReason.trim())
      e.otherReason = lang === "es" ? "Especifica la razón" : "Please specify";
    if (!formData.name.trim())
      e.name = lang === "es" ? "Nombre requerido" : "Name required";
    else if (formData.name.trim().length < 2)
      e.name = lang === "es" ? "Mínimo 2 caracteres" : "Minimum 2 characters";
    if (formData.phone.trim()) {
      if (!/^[\+]?[(]?[0-9]{1,4}[)]?[-\s\.]?[(]?[0-9]{1,4}[)]?[-\s\.]?[0-9]{1,5}[-\s\.]?[0-9]{1,5}$/.test(formData.phone.trim()))
        e.phone = lang === "es" ? "Teléfono inválido" : "Invalid phone number";
    }
    if (formData.comment && formData.comment.length > 500)
      e.comment = lang === "es" ? "Máximo 500 caracteres" : "Maximum 500 characters";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const upd = (field, val) => {
    setFormData(p => ({ ...p, [field]: val }));
    if (errors[field]) setErrors(p => ({ ...p, [field]: null }));
  };

  const toggleReason = (val) => {
    setFormData(p => ({
      ...p,
      reasons: p.reasons.includes(val) ? p.reasons.filter(v => v !== val) : [...p.reasons, val],
    }));
    if (errors.reasons) setErrors(p => ({ ...p, reasons: null }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) {
      toast.error(lang === "es" ? "Por favor corrige los errores" : "Please fix the errors");
      return;
    }
    setLoading(true);
    try {
      const body = {
        ...formData,
        amount: parseFloat(formData.amount),
        reasons: formData.reasons.includes("other") && formData.otherReason
          ? [...formData.reasons.filter(r => r !== "other"), `Otro: ${formData.otherReason}`]
          : formData.reasons,
      };
      const res = await fetch(`${API}/api/public/refund`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      if (res.ok) {
        toast.success(lang === "es" ? "Reembolso registrado, gracias" : "Refund request submitted, thank you");
        setFormData({ date: new Date().toISOString().split("T")[0], time: "", machine_number: "", amount: "", reasons: [], otherReason: "", comment: "", name: "", phone: "" });
        setStaffApproved(null); setStaffAmount(""); setErrors({});
      } else toast.error(lang === "es" ? "Error al enviar" : "Submission error");
    } catch { toast.error(lang === "es" ? "Error de conexión" : "Connection error"); }
    finally { setLoading(false); }
  };

  /* ── Render ─────────────────────────────────────────────────────────────── */
  return (
    <div className="min-h-screen bg-[#f4f6f9] flex items-stretch">

      {/* ── Left hero panel ───────────────────────────────────────────────── */}
      <div className="hidden lg:flex lg:w-[40%] xl:w-[38%] relative flex-shrink-0 sticky top-0 h-screen">
        <img src={HERO_IMG} alt="Laundromat" className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-br from-[#071828]/92 via-[#0c3050]/78 to-[#0c4a6e]/65" />
        <div className="absolute inset-0 opacity-[0.1]"
          style={{ backgroundImage:"radial-gradient(rgb(0, 0, 0) 1px,transparent 1px)", backgroundSize:"24px 24px" }} />

        <div className="relative z-10 flex flex-col justify-between p-10 xl:p-14 w-full">

          {/* ── Matte card: top content ── */}
          <div
            className="rounded-3xl px-7 py-8 backdrop-blur-md"
            style={{
              background: "rgba(2, 47, 68, 0.44)",
              boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.08), 0 12px 40px rgba(0,0,0,0.3)",
            }}
          >
            <div className="inline-flex items-center gap-2 px-3.5 py-2 rounded-full border border-white/15 bg-white/5 backdrop-blur-sm mb-10">
              <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse" />
              <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-sky-400/80">Ventura Fresh Laundry</span>
            </div>

            <h2 className="font-serif text-4xl xl:text-[2.75rem] font-bold text-white leading-[1.15] mb-5">
              {lang === "es" ? <>Reembolso rápido,<br /><span className="text-sky-400">sin complicaciones.</span></> : <>Quick refund,<br /><span className="text-sky-400">no hassle.</span></>}
            </h2>
            <p className="text-[13px] text-white leading-relaxed max-w-[260px]">
              {lang === "es"
                ? "¿Problema con una máquina? Llena el formulario y lo resolveremos lo antes posible."
                : "Had an issue with a machine? Fill this form and we'll make it right as fast as possible."}
            </p>
          </div>

          {/* ── Matte card: bottom steps ── */}
          <div
            className="rounded-3xl px-7 py-7 backdrop-blur-md"
            style={{
              background: "rgba(2, 47, 68, 0.44)",
              boxShadow: "inset 0 0 0 1px rgba(213, 213, 213, 0.2), 0 12px 40px rgba(255, 254, 254, 0.3)",
            }}
          >
            <p className="text-[11px] font-black uppercase tracking-[0.28em] text-sky-400/70 mb-5">
              {lang === "es" ? "Cómo funciona" : "How it works"}
            </p>
            <div className="space-y-4">
              {[
                { n:"01", en:"Fill out this form with details",     es:"Completa el formulario" },
                { n:"02", en:"We review cameras & machine records", es:"Revisamos cámaras y registros" },
                { n:"03", en:"Refund approved within 24–48h",       es:"Reembolso aprobado en 24–48h" },
              ].map(s => (
                <div key={s.n} className="flex items-center gap-4">
                  <span className="text-[15px] font-black text-sky-400 w-5 flex-shrink-0">{s.n}</span>
                  <div className="flex-1 h-px bg-white" />
                  <span className="text-[13px] text-white font-medium text-right max-w-[175px] leading-snug">
                    {lang === "es" ? s.es : s.en}
                  </span>
                </div>
              ))}
            </div>
            <p className="text-[9px] text-white pt-5 tracking-[0.25em] uppercase font-bold">
              — Laundry made effortless —
            </p>
          </div>

        </div>
      </div>

      {/* ── Right form panel ──────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        <div className="min-h-full flex flex-col">

          {/* Mobile hero header */}
          <div className="lg:hidden relative overflow-hidden min-h-[180px]"
            style={{ background:"linear-gradient(135deg,#071828 0%,#0c4a6e 100%)" }}>
            <img src={HERO_IMG} alt="" className="absolute inset-0 w-full h-full object-cover opacity-15 mix-blend-luminosity" />
            <div className="relative z-10 px-6 pt-10 pb-8">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/20 bg-white/10 mb-5">
                <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse" />
                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/60">Ventura Fresh Laundry</span>
              </div>
              <h1 className="text-3xl font-serif font-bold text-white leading-tight">
                {lang === "es" ? <>Solicitud de<br /><span className="text-sky-300">Reembolso</span></> : <>Refund<br /><span className="text-sky-300">Request</span></>}
              </h1>
            </div>
          </div>

          {/* Form body */}
          <div className="flex-1 px-5 sm:px-8 lg:px-12 xl:px-16 py-10 lg:py-14 w-full max-w-[580px] lg:max-w-[560px] mx-auto lg:mx-0">

            {/* Desktop heading */}
            <div className="hidden lg:block mb-10">
              <p className="text-[10px] font-black uppercase tracking-[0.28em] text-sky-600/80 mb-3">
                {lang === "es" ? "Problema con máquina" : "Machine issue"}
              </p>
              <h1 className="font-serif text-[2.5rem] font-bold text-slate-900 leading-[1.1]">
                {lang === "es" ? <>Solicitud de<br /><span className="text-[#0c4a6e]">Reembolso</span></> : <>Refund<br /><span className="text-[#0c4a6e]">Request</span></>}
              </h1>
            </div>

            <form onSubmit={handleSubmit} className="space-y-8">

              {/* ── Incident details ── */}
              <Divider label={lang === "es" ? "Detalles del incidente" : "Incident details"} />
              <div className="grid grid-cols-2 gap-3 sm:gap-4">
                <FormField label={lang === "es" ? "Fecha / Date" : "Date / Fecha"} error={errors.date}>
                  <input type="date" value={formData.date}
                    onChange={e => upd("date", e.target.value)}
                    className={`${inputCls} ${errors.date ? "border-red-300 focus:border-red-400" : ""}`} required />
                </FormField>
                <FormField label={lang === "es" ? "Hora / Time" : "Time / Hora"} error={errors.time}>
                  <input type="time" value={formData.time}
                    onChange={e => upd("time", e.target.value)}
                    className={`${inputCls} ${errors.time ? "border-red-300 focus:border-red-400" : ""}`} />
                </FormField>
                <FormField label={lang === "es" ? "Máquina #" : "Machine #"} error={errors.machine_number}>
                  <input type="text" value={formData.machine_number}
                    onChange={e => upd("machine_number", e.target.value)}
                    placeholder="W-04"
                    className={`${inputCls} ${errors.machine_number ? "border-red-300 focus:border-red-400" : ""}`} required />
                </FormField>
                <FormField label={lang === "es" ? "Monto ($)" : "Amount ($)"} error={errors.amount}>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-semibold">$</span>
                    <input type="number" step="0.01" min="0" value={formData.amount}
                      onChange={e => upd("amount", e.target.value)}
                      placeholder="0.00"
                      className={`${inputCls} pl-8 ${errors.amount ? "border-red-300 focus:border-red-400" : ""}`} required />
                  </div>
                </FormField>
              </div>

              {/* ── Reasons - MODIFICADO: "Other" ahora está al lado ── */}
              <Divider label={lang === "es" ? "Razón — selecciona todas las que apliquen" : "Reason — select all that apply"} />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {REASONS.map(reason => (
                  <ReasonCard key={reason.key} reason={reason} locale={lang}
                    checked={formData.reasons.includes(reason.key)}
                    onChange={() => toggleReason(reason.key)} />
                ))}
                {/* 🔥 Other aparece como un elemento más del grid, sin col-span-2 */}
                <OtherPill locale={lang}
                  checked={formData.reasons.includes("other")}
                  onChange={() => toggleReason("other")} />
              </div>
              {errors.reasons && (
                <p className="text-xs text-red-500 font-medium -mt-2">{errors.reasons}</p>
              )}
              {formData.reasons.includes("other") && (
                <FormField
                  label={lang === "es" ? "Especifica la razón" : "Please specify"}
                  error={errors.otherReason}>
                  <input type="text" value={formData.otherReason}
                    onChange={e => upd("otherReason", e.target.value)}
                    placeholder={lang === "es" ? "Describe lo que ocurrió..." : "Describe what happened..."}
                    className={`${inputCls} ${errors.otherReason ? "border-red-300" : ""}`} />
                </FormField>
              )}

              {/* ── Comment ── */}
              <Divider label={lang === "es" ? "Comentario breve" : "Brief comment"} />
              <FormField error={errors.comment}>
                <div className="relative">
                  <textarea rows={3} value={formData.comment}
                    onChange={e => upd("comment", e.target.value)}
                    placeholder={lang === "es" ? "Detalles adicionales..." : "Any additional details..."}
                    className={`${inputCls} resize-none ${errors.comment ? "border-red-300" : ""}`} />
                  <span className="absolute bottom-3 right-3 text-[10px] text-slate-300 font-medium tabular-nums">
                    {formData.comment.length}/500
                  </span>
                </div>
              </FormField>

              {/* ── Contact ── */}
              <Divider label={lang === "es" ? "Contacto" : "Contact"} />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <FormField label={lang === "es" ? "Nombre / Name" : "Name / Nombre"} error={errors.name}>
                  <input type="text" value={formData.name}
                    onChange={e => upd("name", e.target.value)}
                    placeholder="María García"
                    className={`${inputCls} ${errors.name ? "border-red-300" : ""}`} />
                </FormField>
                <FormField label={lang === "es" ? "Teléfono (opcional)" : "Phone (optional)"} error={errors.phone}>
                  <input type="tel" value={formData.phone}
                    onChange={e => upd("phone", e.target.value)}
                    placeholder="(805) 555-0100"
                    className={`${inputCls} ${errors.phone ? "border-red-300" : ""}`} />
                </FormField>
              </div>

             

              {/* ── Notice ── */}
              <div className="flex gap-4 p-4 sm:p-5 rounded-2xl bg-amber-50 border border-amber-200/80">
                <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M8 1L15 14H1L8 1z" stroke="#b45309" strokeWidth="1.5" strokeLinejoin="round"/>
                    <path d="M8 6v3.5M8 11.5v.5" stroke="#b45309" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-700 mb-1.5">
                    {lang === "es" ? "Aviso / Notice" : "Notice / Aviso"}
                  </p>
                  <p className="text-xs text-amber-800/70 leading-relaxed">
                    {lang === "es"
                      ? "Todas las solicitudes son revisadas con cámaras de seguridad y registros de transacciones de la máquina. La aprobación se determina en base a esta evaluación."
                      : "All requests are reviewed using security camera footage and machine transaction records. Approval is determined based on this evaluation."}
                  </p>
                </div>
              </div>

              {/* ── Submit ── */}
              <button type="submit" disabled={loading}
                className="group relative w-full overflow-hidden rounded-2xl py-4 px-8 text-[13px] font-black uppercase tracking-[0.18em] text-white transition-all duration-300 hover:-translate-y-0.5 active:scale-[0.98] disabled:opacity-60 disabled:pointer-events-none"
                style={{ background:"linear-gradient(135deg,#071828 0%,#0c4a6e 100%)", boxShadow:"0 8px 32px -8px rgba(12,74,110,0.45)" }}>
                <span className="relative z-10 flex items-center justify-center gap-2.5">
                  {loading
                    ? (lang === "es" ? "Enviando..." : "Sending...")
                    : (lang === "es" ? "Enviar solicitud" : "Submit request")}
                  {!loading && (
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none"
                      className="transition-transform duration-200 group-hover:translate-x-1">
                      <path d="M3 8h10M9 4l4 4-4 4" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </span>
                <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
              </button>

              <p className="text-center text-[10px] text-slate-300 font-semibold tracking-[0.25em] uppercase pt-1">
                — Ventura Fresh Laundry —
              </p>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}