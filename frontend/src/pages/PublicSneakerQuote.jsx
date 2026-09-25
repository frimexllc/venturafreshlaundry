// PublicSneakerQuote.jsx — public, no-login-required instant AI quote for
// sneaker/shoe cleaning. Visitor gives contact info, uploads up to 3 photos,
// gets an AI-suggested price, then can jump straight into Schedule Pickup.

import { useState, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { Sparkles, Camera, Upload, X, RefreshCw, ArrowRight, CheckCircle } from "lucide-react";
import PublicNav from "../components/PublicNav";
import PublicFooter from "../components/PublicFooter";
import SmsConsentField from "../components/SmsConsentField";
import { useLocale } from "../context/LocaleContext";
import { getRecaptchaToken } from "../utils/recaptcha";
import { fileToResizedBase64 } from "../utils/imageResize";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const MAX_PHOTOS = 3;

// FastAPI returns a plain string `detail` for HTTPException errors, but a
// LIST of validation-error objects for a 422 (request body failed Pydantic
// validation) — the old code only handled the string case and silently
// fell back to a generic message for everything else, which is exactly
// what happened when the photo-count race condition below let a 4th photo
// through and the backend rejected it with a 422.
function getSneakerQuoteErrorMessage(err, t) {
  const detail = err.response?.data?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail) && detail.length > 0) {
    return detail.map((d) => d.msg || JSON.stringify(d)).join("; ");
  }
  return t("Could not analyze photos", "No se pudieron analizar las fotos");
}

const DIRT_LABELS = {
  light: { en: "Light", es: "Leve" },
  moderate: { en: "Moderate", es: "Moderada" },
  heavy: { en: "Heavy", es: "Alta" },
  extreme: { en: "Extreme", es: "Extrema" },
};

export default function PublicSneakerQuote() {
  const { t, locale } = useLocale();
  const navigate = useNavigate();

  const [step, setStep] = useState("contact"); // contact -> photos -> result
  const [form, setForm] = useState({ name: "", email: "", phone: "", contact_method: "email", sms_consent: false });
  const [photos, setPhotos] = useState([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState(null);
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);

  const setF = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const handleContactSubmit = (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim() || !form.phone.trim()) {
      toast.error(t("Please fill in name, email, and phone", "Completa nombre, correo y teléfono"));
      return;
    }
    if (form.contact_method === "sms" && !form.sms_consent) {
      toast.error(t("SMS consent is required for text updates", "Se requiere tu consentimiento para SMS"));
      return;
    }
    setStep("photos");
  };

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (!files.length) return;
    // FIX: compute room from `prev` inside the updater, not from the
    // `photos` closure — on mobile, the camera and gallery pickers can
    // each fire a change event in quick succession before React re-renders,
    // and both reading the same stale `photos.length` let more than
    // MAX_PHOTOS photos slip through, which the backend then rejected
    // with a 422 the UI only showed as a generic "couldn't analyze" error.
    setPhotos((prev) => {
      const room = MAX_PHOTOS - prev.length;
      if (room <= 0) {
        toast.error(t(`You can add up to ${MAX_PHOTOS} photos`, `Puedes agregar hasta ${MAX_PHOTOS} fotos`));
        return prev;
      }
      const next = files.slice(0, room).map((file) => ({ file, preview: URL.createObjectURL(file) }));
      return [...prev, ...next];
    });
  };

  const removePhoto = (idx) => setPhotos((prev) => prev.filter((_, i) => i !== idx));

  const runAnalysis = async () => {
    if (photos.length === 0) {
      toast.error(t("Add at least one photo", "Agrega al menos una foto"));
      return;
    }
    setAnalyzing(true);
    try {
      // Resize/compress before upload — phone camera photos can be several
      // MB each, which is slow on mobile data and can exceed the backend's
      // per-photo size limit.
      const images_base64 = await Promise.all(photos.map((p) => fileToResizedBase64(p.file)));
      const captcha_token = await getRecaptchaToken("sneaker_quote");
      const res = await axios.post(`${API}/public/sneaker-quote`, {
        name: form.name,
        email: form.email,
        phone: form.phone,
        contact_method: form.contact_method,
        sms_consent: form.sms_consent,
        images_base64,
        captcha_token,
      });
      setResult(res.data);
      setStep("result");
    } catch (err) {
      toast.error(getSneakerQuoteErrorMessage(err, t));
    } finally {
      setAnalyzing(false);
    }
  };

  const goSchedule = () => {
    navigate("/schedule-pickup");
  };

  const ai = result?.ai_result;
  const pricing = result?.pricing;

  return (
    <div className="min-h-screen bg-white">
      <PublicNav />

      <section className="pt-28 pb-16 px-4 sm:px-6">
        <div className="max-w-xl mx-auto">
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-violet-50 border border-violet-200 text-violet-600 text-xs font-bold uppercase tracking-wide mb-4">
              <Sparkles className="w-3.5 h-3.5" />{t("AI-Powered", "Con IA")}
            </div>
            <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-2">
              {t("Sneaker & Shoe Cleaning", "Limpieza de Tenis y Calzado")}
            </h1>
            <p className="text-slate-500 text-sm sm:text-base">
              {t("Get an instant price estimate from your photos — no appointment needed.", "Obtén un precio estimado al instante con tus fotos — sin cita previa.")}
            </p>
          </div>

          {step === "contact" && (
            <form onSubmit={handleContactSubmit} className="bg-white rounded-2xl border border-slate-200 shadow-lg p-6 space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">{t("Name", "Nombre")}</label>
                <input
                  type="text" value={form.name} onChange={(e) => setF("name", e.target.value)}
                  className="w-full mt-1 h-11 border border-slate-200 rounded-xl px-3 text-sm"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">{t("Email", "Correo")}</label>
                  <input
                    type="email" value={form.email} onChange={(e) => setF("email", e.target.value)}
                    className="w-full mt-1 h-11 border border-slate-200 rounded-xl px-3 text-sm"
                    required
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">{t("Phone", "Teléfono")}</label>
                  <input
                    type="tel" value={form.phone} onChange={(e) => setF("phone", e.target.value)}
                    className="w-full mt-1 h-11 border border-slate-200 rounded-xl px-3 text-sm"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">{t("How should we send your quote?", "¿Cómo te mandamos tu cotización?")}</label>
                <select
                  value={form.contact_method}
                  onChange={(e) => setF("contact_method", e.target.value)}
                  className="w-full mt-1 h-11 border border-slate-200 rounded-xl px-3 text-sm bg-white"
                >
                  <option value="email">{t("Email", "Correo")}</option>
                  <option value="sms">SMS</option>
                  <option value="call">{t("Phone call", "Llamada")}</option>
                </select>
              </div>
              {form.contact_method === "sms" && (
                <SmsConsentField checked={form.sms_consent} onChange={(v) => setF("sms_consent", v)} />
              )}
              <button
                type="submit"
                className="w-full h-12 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-bold uppercase tracking-wide flex items-center justify-center gap-2 transition-colors"
              >
                {t("Continue to photos", "Continuar a fotos")}<ArrowRight className="w-4 h-4" />
              </button>
            </form>
          )}

          {step === "photos" && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-lg p-6 space-y-4">
              <div className="grid grid-cols-3 gap-2">
                {photos.map((p, idx) => (
                  <div key={idx} className="relative aspect-square rounded-lg overflow-hidden border border-slate-200 bg-slate-50">
                    <img src={p.preview} alt="" className="w-full h-full object-cover" />
                    <button onClick={() => removePhoto(idx)} className="absolute top-1 right-1 bg-white/90 hover:bg-white rounded-full p-1 border border-slate-200">
                      <X className="h-3 w-3 text-slate-600" />
                    </button>
                  </div>
                ))}
                {photos.length < MAX_PHOTOS && (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="aspect-square rounded-lg border-2 border-dashed border-slate-300 flex flex-col items-center justify-center text-slate-400 hover:border-violet-300 hover:text-violet-500 transition-colors"
                  >
                    <Upload className="h-5 w-5 mb-1" />
                    <span className="text-[10px]">{t("Add photo", "Agregar foto")}</span>
                  </button>
                )}
              </div>
              <p className="text-[11px] text-slate-400 text-center">
                {t(
                  `Up to ${MAX_PHOTOS} photos: overall view, sole/damage close-up, brand tag.`,
                  `Hasta ${MAX_PHOTOS} fotos: vista general, suela/daño, etiqueta de marca.`
                )}
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => cameraInputRef.current?.click()}
                  className="h-11 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 flex items-center justify-center gap-2"
                >
                  <Camera className="h-4 w-4" />{t("Take photo", "Tomar foto")}
                </button>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="h-11 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 flex items-center justify-center gap-2"
                >
                  <Upload className="h-4 w-4" />{t("Gallery / File", "Galería / archivo")}
                </button>
              </div>
              <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFileSelect} />
              <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFileSelect} />

              <button
                onClick={runAnalysis}
                disabled={analyzing || photos.length === 0}
                className="w-full h-12 rounded-xl bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-sm font-bold uppercase tracking-wide flex items-center justify-center gap-2 transition-colors"
              >
                {analyzing
                  ? <><RefreshCw className="h-4 w-4 animate-spin" />{t("Analyzing…", "Analizando…")}</>
                  : <><Sparkles className="h-4 w-4" />{t("Get my quote", "Ver mi cotización")}</>}
              </button>
              <button onClick={() => setStep("contact")} className="w-full text-xs text-slate-400 hover:text-slate-600 text-center">
                {t("← Back", "← Volver")}
              </button>
            </div>
          )}

          {step === "result" && ai && pricing && (
            <div className="space-y-4">
              <div className="rounded-2xl border border-violet-200 bg-violet-50/60 p-5 space-y-2">
                <div className="flex items-center gap-2 mb-1">
                  <CheckCircle className="w-5 h-5 text-emerald-500" />
                  <h3 className="font-bold text-slate-800">{t("Here's your estimate", "Aquí está tu estimado")}</h3>
                </div>
                <p className="text-sm text-slate-600">
                  {[ai.brand, ai.model].filter(Boolean).join(" ") || (ai.type !== "unknown" ? ai.type : t("Your item", "Tu artículo"))}
                </p>
                {ai.condition_notes && <p className="text-xs text-slate-500">{ai.condition_notes}</p>}
                <p className="text-xs text-slate-500">
                  {t("Dirt level", "Nivel de suciedad")}: <strong>{DIRT_LABELS[ai.dirt_level]?.[locale === "es" ? "es" : "en"] || ai.dirt_level}</strong>
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 p-5 space-y-1.5">
                <div className="flex justify-between text-xs text-slate-500">
                  <span>{t("Base price", "Precio base")}</span>
                  <span className="font-semibold text-slate-700">${pricing.base_price.toFixed(2)}</span>
                </div>
                {pricing.extra_charge > 0 && (
                  <div className="flex justify-between text-xs text-slate-500">
                    <span>{t("Soiling / complexity surcharge", "Extra por suciedad / complejidad")}</span>
                    <span className="font-semibold text-slate-700">+${pricing.extra_charge.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between text-lg font-black text-slate-900 pt-2 border-t border-slate-100">
                  <span>{t("Estimated total", "Total estimado")}</span>
                  <span>${pricing.suggested_total.toFixed(2)}</span>
                </div>
                <p className="text-[11px] text-slate-400 pt-1">
                  {t("Final price is confirmed when we receive the pair. Sent to your email too.", "El precio final se confirma al recibir el par. También lo enviamos a tu correo.")}
                </p>
              </div>

              <button
                onClick={goSchedule}
                className="w-full h-12 rounded-xl bg-primary hover:opacity-90 text-white text-sm font-bold uppercase tracking-wide flex items-center justify-center gap-2 transition-all"
              >
                {t("Schedule Pickup", "Programar Recogida")}<ArrowRight className="w-4 h-4" />
              </button>
              <button
                onClick={() => { setStep("photos"); setResult(null); }}
                className="w-full text-xs text-slate-400 hover:text-slate-600 text-center"
              >
                {t("Try different photos", "Probar con otras fotos")}
              </button>
            </div>
          )}

          <p className="text-center text-xs text-slate-400 mt-6">
            {t("Prefer to book directly? ", "¿Prefieres agendar directo? ")}
            <Link to="/schedule-pickup" className="text-primary font-semibold hover:underline">
              {t("Schedule a pickup", "Programa una recogida")}
            </Link>
          </p>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}
