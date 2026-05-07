import React, { useState } from "react";
import { useLocale } from "../context/LocaleContext";
import { toast } from "sonner";

const API = process.env.REACT_APP_BACKEND_URL;

/* ─── Hero image ──────────────────────────────────────────────────────────── */
const HERO_IMG = "https://images.unsplash.com/photo-1582735689369-4fe89db7114c?w=900&auto=format&fit=crop&q=80";

/* ─── Definición local de tipos de sugerencia (sin usar traducciones) ─────── */
const SUGGESTION_TYPES = [
  { key: "service",     en: "Service",      es: "Servicio",      icon: "✨" },
  { key: "machines",    en: "Machines",     es: "Máquinas",      icon: "🧺" },
  { key: "cleanliness", en: "Cleanliness",  es: "Limpieza",      icon: "🧹" },
  { key: "hours",       en: "Hours",        es: "Horario",       icon: "⏰" },
  { key: "prices",      en: "Prices",       es: "Precios",       icon: "💰" },
  { key: "newServices", en: "New services", es: "Nuevos servicios", icon: "🚀" },
];

const IMPROVEMENT_AREAS = [
  { key: "experience", en: "Customer experience", es: "Experiencia del cliente", icon: "😊" },
  { key: "time",       en: "Waiting time",        es: "Tiempo de espera",       icon: "⏱️" },
  { key: "quality",    en: "Quality",             es: "Calidad",                icon: "⭐" },
  { key: "comfort",    en: "Comfort",             es: "Confort",                icon: "🛋️" },
];

/* ─── PillCheck con soporte para icono (sin cambios) ───────────────────────── */
function PillCheck({ label, checked, onChange, icon }) {
  return (
    <button
      type="button"
      onClick={onChange}
      className={`relative flex items-center gap-2 px-4 py-2.5 rounded-full border text-sm font-medium transition-all duration-200 ease-out select-none cursor-pointer text-left ${
        checked
          ? "bg-[#0c4a6e] border-[#0c4a6e] text-white shadow-md shadow-sky-900/20"
          : "bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50"
      }`}
    >
      <span
        className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all duration-200 ${
          checked ? "border-white bg-white/30" : "border-slate-300"
        }`}
      >
        {checked && (
          <svg width="8" height="6" viewBox="0 0 8 6" fill="none">
            <path
              d="M1 3l2 2 4-4"
              stroke="white"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </span>
      {icon && <span className="mr-1">{icon}</span>}
      {label}
    </button>
  );
}

function FormField({ label, children, error }) {
  return (
    <label className="block">
      <span className="block text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-1.5">
        {label}
      </span>
      {children}
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </label>
  );
}

const inputCls = [
  "w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3",
  "text-sm text-slate-800 placeholder-slate-400",
  "outline-none focus:bg-white focus:border-[#0c4a6e]/50 focus:ring-3 focus:ring-[#0c4a6e]/10",
  "transition-all duration-200",
].join(" ");

function Divider({ label }) {
  return (
    <div className="flex items-center gap-3 py-1">
      <div className="flex-1 h-px bg-slate-100" />
      <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
        {label}
      </span>
      <div className="flex-1 h-px bg-slate-100" />
    </div>
  );
}

export default function SuggestionForm() {
  const { t, locale } = useLocale();
  const lang = locale === "es" ? "es" : "en";

  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split("T")[0],
    types: [],
    suggestion: "",
    improve: [],
    otherType: "",
    otherImprove: "",
    name: "",
    phone: "",
    acceptPromotions: false,
  });

  const [staffStatus, setStaffStatus] = useState(null);
  const [staffComment, setStaffComment] = useState("");
  const [errors, setErrors] = useState({});

  // Funciones auxiliares para obtener el texto según idioma
  const getTypeLabel = (typeKey) => {
    const type = SUGGESTION_TYPES.find(t => t.key === typeKey);
    return type ? (lang === "es" ? type.es : type.en) : typeKey;
  };

  const getImproveLabel = (improveKey) => {
    const area = IMPROVEMENT_AREAS.find(a => a.key === improveKey);
    return area ? (lang === "es" ? area.es : area.en) : improveKey;
  };

  const toggle = (field, value) => {
    setFormData((prev) => ({
      ...prev,
      [field]: prev[field].includes(value)
        ? prev[field].filter((v) => v !== value)
        : [...prev[field], value],
    }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: null }));
  };

  const validateForm = () => {
    const newErrors = {};
    const selectedDate = new Date(formData.date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (selectedDate > today) {
      newErrors.date = t("validations.dateFuture", "La fecha no puede ser futura");
    }
    const suggestionTrim = formData.suggestion.trim();
    if (!suggestionTrim) {
      newErrors.suggestion = t("suggestionForm.pleaseEnterSuggestion", "Por favor ingresa tu sugerencia");
    } else if (suggestionTrim.length < 10) {
      newErrors.suggestion = t("validations.suggestionMin", "Mínimo 10 caracteres (cuéntanos más)");
    } else if (suggestionTrim.length > 1000) {
      newErrors.suggestion = t("validations.suggestionMax", "Máximo 1000 caracteres");
    }
    if (formData.name.trim() && formData.name.trim().length < 2) {
      newErrors.name = t("validations.nameMin", "Mínimo 2 caracteres");
    }
    if (formData.phone.trim()) {
      const phoneRegex = /^[\+]?[(]?[0-9]{1,4}[)]?[-\s\.]?[(]?[0-9]{1,4}[)]?[-\s\.]?[0-9]{1,5}[-\s\.]?[0-9]{1,5}$/;
      if (!phoneRegex.test(formData.phone.trim())) {
        newErrors.phone = t("validations.phoneInvalid", "Teléfono inválido");
      }
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) {
      toast.error(t("validations.fixErrors", "Por favor corrige los errores del formulario"));
      return;
    }
    setLoading(true);
    try {
      const body = {
        ...formData,
        types:
          formData.types.includes("other") && formData.otherType
            ? [...formData.types.filter((x) => x !== "other"), `Otro: ${formData.otherType}`]
            : formData.types,
        improve:
          formData.improve.includes("other") && formData.otherImprove
            ? [...formData.improve.filter((x) => x !== "other"), `Otro: ${formData.otherImprove}`]
            : formData.improve,
      };
      const res = await fetch(`${API}/api/public/suggestion`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        toast.success(t("suggestionForm.thanks", "¡Gracias por tu sugerencia!"));
        setFormData({
          date: new Date().toISOString().split("T")[0],
          types: [],
          suggestion: "",
          improve: [],
          otherType: "",
          otherImprove: "",
          name: "",
          phone: "",
          acceptPromotions: false,
        });
        setStaffStatus(null);
        setStaffComment("");
        setErrors({});
      } else {
        toast.error(t("common.error", "Error al enviar"));
      }
    } catch {
      toast.error(t("common.error", "Error de conexión"));
    } finally {
      setLoading(false);
    }
  };

  const updateField = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: null }));
  };

  return (
    <div className="min-h-screen bg-[#ffffff] flex items-stretch">
      {/* ── Left hero panel (idéntico al original) ───────────────────────── */}
      <div className="hidden lg:flex lg:w-[42%] xl:w-[40%] relative flex-shrink-0 sticky top-0 h-screen">
        <img
          src={HERO_IMG}
          alt="Fresh clean laundry"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-br from-[#000000]/85 via-[#0c3050]/70 to-[#ffffff]/60" />
        <div
          className="absolute inset-0 opacity-[0.08]"
          style={{
            backgroundImage: "radial-gradient(rgba(255, 255, 255, 0.44) 1px,transparent 10px)",
            backgroundSize: "24px 24px",
          }}
        />

        <div className="relative z-10 flex flex-col justify-between p-10 xl:p-14 w-full">
          <div
            className="rounded-3xl px-7 py-8 backdrop-blur-md"
            style={{
              background: "rgba(2, 37, 68, 0.34)",
              boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.15), 0 12px 40px rgba(0,0,0,0.3)",
            }}
          >
            <div className="inline-flex items-center gap-2 px-3.5 py-2 rounded-full border border-white/15 bg-white/5 backdrop-blur-sm mb-8">
              <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse" />
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-sky-400/80">
                Ventura Fresh Laundry
              </span>
            </div>
            <h2 className="font-serif text-4xl xl:text-5xl font-bold text-white leading-tight mb-4">
              Your voice<br />
              <span className="text-sky-400">shapes us.</span>
            </h2>
            <p className="text-sm text-white leading-relaxed max-w-xs">
              {t(
                "Every suggestion helps us deliver a better experience. We read every single one.",
                "Cada sugerencia nos ayuda a mejorar. Leemos cada una con atención."
              )}
            </p>
          </div>

          <div
            className="rounded-3xl px-7 py-7 backdrop-blur-md"
            style={{
              background: "rgba(2, 37, 68, 0.3)",
              boxShadow: "inset 0 0 0 1px rgba(255, 255, 255, 0.15), 0 12px 40px rgba(0,0,0,0.3)",
            }}
          >
            <div className="space-y-3.5">
              {[
                { icon: "✦", text: t("Read by our team within 24h", "Leída por nuestro equipo en 24h") },
                { icon: "✦", text: t("Changes made based on feedback", "Cambios reales basados en tu opinión") },
                { icon: "✦", text: t("Your opinion is anonymous by default", "Tu opinión es anónima por defecto") },
              ].map((b, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="text-sky-400 text-xs">{b.icon}</span>
                  <span className="text-xs text-white font-medium">{b.text}</span>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-white pt-5 tracking-widest uppercase font-semibold">
              — Laundry made effortless —
            </p>
          </div>
        </div>
      </div>

      {/* ── Right panel: formulario ───────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        <div className="min-h-full flex flex-col">
          {/* Mobile header (sin cambios) */}
          <div
            className="lg:hidden relative overflow-hidden"
            style={{ background: "linear-gradient(135deg,#071828 0%,#0c4a6e 100%)" }}
          >
            <img
              src={HERO_IMG}
              alt=""
              className="absolute inset-0 w-full h-full object-cover opacity-20 mix-blend-luminosity"
            />
            <div className="relative z-10 px-6 py-10">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/20 bg-white/10 mb-4">
                <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse" />
                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/70">
                  Ventura Fresh Laundry
                </span>
              </div>
              <h1 className="text-3xl font-serif font-bold text-white leading-tight">
                Suggestion<br />
                <span className="text-sky-300">Form</span>
              </h1>
              <p className="text-sm text-white/50 mt-2">
                {t("Your opinion makes a big difference.", "Tu opinión hace una gran diferencia.")}
              </p>
            </div>
          </div>

          <div className="flex-1 px-6 sm:px-10 lg:px-12 xl:px-16 py-10 lg:py-14 max-w-xl w-full mx-auto lg:mx-0">
            <div className="hidden lg:block mb-10">
              <p className="text-[10px] font-black uppercase tracking-[0.25em] text-sky-600 mb-2">
                {t("Share your thoughts", "Comparte tu opinión")}
              </p>
              <h1 className="font-serif text-4xl font-bold text-slate-900 leading-tight">
                Suggestion<br />
                <span className="text-[#0c4a6e]">Form</span>
              </h1>
            </div>

            <form onSubmit={handleSubmit} className="space-y-7">
              <FormField label={t("Date / Fecha", "Date / Fecha")} error={errors.date}>
                <input
                  type="date"
                  value={formData.date}
                  onChange={(e) => updateField("date", e.target.value)}
                  className={inputCls}
                  required
                />
              </FormField>

              <Divider label={t("1 · Type of suggestion", "1 · Tipo de sugerencia")} />

              {/* TIPOS DE SUGERENCIA (con textos directos, sin traducción por clave) */}
              <div className="flex flex-wrap gap-2">
                {SUGGESTION_TYPES.map((type) => (
                  <PillCheck
                    key={type.key}
                    label={getTypeLabel(type.key)}
                    icon={type.icon}
                    checked={formData.types.includes(type.key)}
                    onChange={() => toggle("types", type.key)}
                  />
                ))}
                <PillCheck
                  label={lang === "es" ? "Otra razón" : "Other reason"}
                  icon="📝"
                  checked={formData.types.includes("other")}
                  onChange={() => toggle("types", "other")}
                />
              </div>
              {formData.types.includes("other") && (
                <input
                  type="text"
                  value={formData.otherType}
                  onChange={(e) => updateField("otherType", e.target.value)}
                  placeholder={t("common.specify", "Especificar...")}
                  className={inputCls}
                />
              )}

              <Divider label={t("2 · Your suggestion", "2 · Tu sugerencia")} />

              <FormField error={errors.suggestion}>
                <textarea
                  rows={5}
                  value={formData.suggestion}
                  onChange={(e) => updateField("suggestion", e.target.value)}
                  placeholder={t("Describe your idea in detail...", "Describe tu idea con detalle...")}
                  className={`${inputCls} resize-none leading-relaxed`}
                  required
                />
              </FormField>

              <Divider label={t("3 · What would improve?", "3 · ¿Qué mejoraría?")} />

              {/* ÁREAS DE MEJORA (textos directos) */}
              <div className="flex flex-wrap gap-2">
                {IMPROVEMENT_AREAS.map((area) => (
                  <PillCheck
                    key={area.key}
                    label={getImproveLabel(area.key)}
                    icon={area.icon}
                    checked={formData.improve.includes(area.key)}
                    onChange={() => toggle("improve", area.key)}
                  />
                ))}
                <PillCheck
                  label={lang === "es" ? "Otra área" : "Other area"}
                  icon="📝"
                  checked={formData.improve.includes("other")}
                  onChange={() => toggle("improve", "other")}
                />
              </div>
              {formData.improve.includes("other") && (
                <input
                  type="text"
                  value={formData.otherImprove}
                  onChange={(e) => updateField("otherImprove", e.target.value)}
                  placeholder={t("common.specify", "Especificar...")}
                  className={inputCls}
                />
              )}

              <Divider label={t("Contact (optional)", "Contacto (opcional)")} />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField label={t("Name / Nombre", "Name / Nombre")} error={errors.name}>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => updateField("name", e.target.value)}
                    placeholder="María García"
                    className={inputCls}
                  />
                </FormField>
                <FormField label={t("Phone / Teléfono", "Phone / Teléfono")} error={errors.phone}>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => updateField("phone", e.target.value)}
                    placeholder="(805) 555-0100"
                    className={inputCls}
                  />
                </FormField>
              </div>

              <button
                type="button"
                onClick={() => setFormData({ ...formData, acceptPromotions: !formData.acceptPromotions })}
                className={`w-full flex items-center gap-3.5 p-4 rounded-2xl border transition-all duration-200 text-left ${
                  formData.acceptPromotions
                    ? "border-sky-200 bg-sky-50"
                    : "border-slate-200 bg-white hover:bg-slate-50"
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all duration-200 ${
                    formData.acceptPromotions ? "bg-[#0c4a6e] border-[#0c4a6e]" : "border-slate-300"
                  }`}
                >
                  {formData.acceptPromotions && (
                    <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                      <path d="M1 4l3 3 5-6" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-700">
                    {t("I'd like to receive promotions", "Me gustaría recibir promociones")}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {t("Occasional discounts and news. No spam.", "Descuentos y novedades. Sin spam.")}
                  </p>
                </div>
              </button>

            

              {/* Notice (sin cambios) */}
              <div className="flex gap-3.5 p-4 rounded-2xl bg-amber-50 border border-amber-200/80">
                <div className="w-8 h-8 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M8 1L15 14H1L8 1z" stroke="#b45309" strokeWidth="1.5" strokeLinejoin="round" />
                    <path d="M8 6v3.5M8 11.5v.5" stroke="#b45309" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-700 mb-1">
                    {t("Notice / Aviso", "Notice / Aviso")}
                  </p>
                  <p className="text-xs text-amber-800/75 leading-relaxed">
                    {t(
                      "All suggestions are reviewed by our management team weekly. We may contact you if more details are needed.",
                      "Todas las sugerencias son revisadas semanalmente por nuestro equipo. Podríamos contactarte si necesitamos más detalles."
                    )}
                  </p>
                </div>
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={loading}
                className="group relative w-full overflow-hidden rounded-2xl py-4 px-8 text-[13px] font-black uppercase tracking-[0.18em] text-white transition-all duration-300 hover:-translate-y-0.5 active:scale-[0.98] disabled:opacity-60 disabled:pointer-events-none"
                style={{
                  background: "linear-gradient(135deg,#071828 0%,#0c4a6e 100%)",
                  boxShadow: "0 8px 32px -8px rgba(12,74,110,0.5)",
                }}
              >
                <span className="relative z-10 flex items-center justify-center gap-2.5">
                  {loading ? t("common.sending", "Enviando...") : t("common.send", "Enviar sugerencia")}
                  {!loading && (
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none"
                      className="transition-transform duration-200 group-hover:translate-x-1">
                      <path d="M3 8h10M9 4l4 4-4 4" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </span>
                <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
              </button>

              <p className="text-center text-[11px] text-slate-400 italic leading-relaxed">
                {t("Thank you for helping us improve every day.", "Gracias por ayudarnos a mejorar cada día.")}
              </p>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}