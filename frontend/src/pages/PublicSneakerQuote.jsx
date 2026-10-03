// PublicSneakerQuote.jsx — public, no-login-required instant AI quote for
// sneaker/shoe cleaning. Visitor gives contact info, groups photos into one
// or more pairs (up to 3), gets an AI-suggested price per pair, then can
// jump straight into Schedule Pickup.

import { useState, useRef } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { Sparkles, Camera, Upload, X, RefreshCw, ArrowRight, CheckCircle, AlertTriangle, Plus, Info, Truck, Store, ShieldCheck } from "lucide-react";
import PublicNav from "../components/PublicNav";
import PublicFooter from "../components/PublicFooter";
import SmsConsentField from "../components/SmsConsentField";
import { useLocale } from "../context/LocaleContext";
import { getRecaptchaToken } from "../utils/recaptcha";
import { fileToResizedBase64 } from "../utils/imageResize";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const MAX_PHOTOS_PER_PAIR = 3;
const MAX_PAIRS = 3;

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

let nextLocalPairId = 1;
const emptyPair = () => ({ localId: nextLocalPairId++, photos: [] });

export default function PublicSneakerQuote() {
  const { t, locale } = useLocale();

  const [step, setStep] = useState("contact"); // contact -> photos -> result -> schedule -> verify -> done
  const [form, setForm] = useState({ name: "", email: "", phone: "", contact_method: "email", sms_consent: false });
  const [pairs, setPairs] = useState([emptyPair()]);
  const [analyzing, setAnalyzing] = useState(false);
  const [results, setResults] = useState(null); // array of {ok, ai_result, pricing} | {ok:false, error, pair_index}
  const [activePairIdx, setActivePairIdx] = useState(0);
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);

  // ── Scheduling (pickup & delivery, or store drop-off) ───────────────────
  const [fulfillment, setFulfillment] = useState("pickup"); // "pickup" | "dropoff"
  const [scheduleForm, setScheduleForm] = useState({ address: "", date: "", time: "" });
  const [scheduling, setScheduling] = useState(false);
  const [pendingVerification, setPendingVerification] = useState(null); // { temp_token, message }
  const [verificationCode, setVerificationCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [orderResult, setOrderResult] = useState(null); // { order_number }

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

  const openPicker = (pairIdx, ref) => {
    setActivePairIdx(pairIdx);
    ref.current?.click();
  };

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (!files.length) return;
    // Compute room from `prev` inside the updater, not from a closure — on
    // mobile, the camera and gallery pickers can each fire a change event
    // in quick succession before React re-renders, and both reading the
    // same stale count let more photos than the limit slip through.
    setPairs((prev) => {
      const pair = prev[activePairIdx];
      if (!pair) return prev;
      const room = MAX_PHOTOS_PER_PAIR - pair.photos.length;
      if (room <= 0) {
        toast.error(t(`Up to ${MAX_PHOTOS_PER_PAIR} photos per pair`, `Hasta ${MAX_PHOTOS_PER_PAIR} fotos por par`));
        return prev;
      }
      const next = files.slice(0, room).map((file) => ({ file, preview: URL.createObjectURL(file) }));
      return prev.map((p, i) => (i === activePairIdx ? { ...p, photos: [...p.photos, ...next] } : p));
    });
  };

  const removePhoto = (pairIdx, photoIdx) => {
    setPairs((prev) =>
      prev.map((p, i) => (i === pairIdx ? { ...p, photos: p.photos.filter((_, j) => j !== photoIdx) } : p))
    );
  };

  const addPair = () => {
    if (pairs.length >= MAX_PAIRS) {
      toast.error(t(`Up to ${MAX_PAIRS} pairs at once`, `Hasta ${MAX_PAIRS} pares a la vez`));
      return;
    }
    setPairs((prev) => [...prev, emptyPair()]);
  };

  const removePair = (pairIdx) => {
    setPairs((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== pairIdx)));
  };

  const pairsWithPhotos = pairs.filter((p) => p.photos.length > 0);

  const runAnalysis = async () => {
    if (pairsWithPhotos.length === 0) {
      toast.error(t("Add at least one photo", "Agrega al menos una foto"));
      return;
    }
    setAnalyzing(true);
    try {
      // Resize/compress before upload — phone camera photos can be several
      // MB each, which is slow on mobile data and can exceed the backend's
      // per-photo size limit.
      const pairsPayload = await Promise.all(
        pairsWithPhotos.map(async (p) => ({
          images_base64: await Promise.all(p.photos.map((ph) => fileToResizedBase64(ph.file))),
        }))
      );
      const captcha_token = await getRecaptchaToken("sneaker_quote");
      const contactFields = {
        name: form.name,
        email: form.email,
        phone: form.phone,
        contact_method: form.contact_method,
        sms_consent: form.sms_consent,
        captcha_token,
      };

      if (pairsPayload.length === 1) {
        const res = await axios.post(`${API}/public/sneaker-quote`, {
          ...contactFields,
          images_base64: pairsPayload[0].images_base64,
        });
        setResults([{ ok: true, ...res.data }]);
      } else {
        // Several pairs are queued and analyzed one at a time on the
        // server, rather than all at once — an unauthenticated visitor
        // firing several parallel AI calls in one request is a cost/abuse
        // risk the operator-side batch flow doesn't have.
        const res = await axios.post(`${API}/public/sneaker-quote/batch`, {
          ...contactFields,
          pairs: pairsPayload,
        });
        setResults(res.data.results);
      }
      setStep("result");
    } catch (err) {
      toast.error(getSneakerQuoteErrorMessage(err, t));
    } finally {
      setAnalyzing(false);
    }
  };

  const successfulResults = results?.filter((r) => r.ok) || [];
  const grandTotal = successfulResults.reduce((sum, r) => sum + r.pricing.suggested_total, 0);

  const buildAddonServices = () =>
    successfulResults.map((r, i) => {
      const label = [r.ai_result.brand, r.ai_result.model].filter(Boolean).join(" ") || r.ai_result.type || "Sneakers";
      return {
        id: r.id || `pair-${i}`,
        name: `AI Sneaker Cleaning — ${label}`,
        price: r.pricing.suggested_total,
        price_unit: "per_item",
        category: "sneaker_cleaning",
      };
    });

  const handleSchedule = async (e) => {
    e.preventDefault();
    if (fulfillment === "pickup" && (!scheduleForm.address.trim() || !scheduleForm.date)) {
      toast.error(t("Please fill in address and pickup date", "Completa la dirección y la fecha de recogida"));
      return;
    }
    if (fulfillment === "dropoff" && !scheduleForm.date) {
      toast.error(t("Please choose a drop-off date", "Elige una fecha para traer tus tenis"));
      return;
    }
    setScheduling(true);
    try {
      const captcha_token = await getRecaptchaToken(fulfillment === "pickup" ? "sneaker_pickup_request" : "sneaker_dropoff_request");
      const addon_services = buildAddonServices();
      const contactFields = {
        name: form.name,
        email: form.email,
        phone: form.phone,
        contact_method: form.contact_method,
        sms_consent: form.sms_consent,
        captcha_token,
        addon_services,
      };

      // Sneaker cleaning has its own dedicated endpoints (not borrowed from
      // pickup-request/wash-fold-request) — see routes/public_forms.py.
      const res = fulfillment === "pickup"
        ? await axios.post(`${API}/public/sneaker-cleaning/pickup-request`, {
            ...contactFields,
            address: scheduleForm.address,
            pickup_date: scheduleForm.date,
            pickup_time: scheduleForm.time || null,
            notes: t("AI sneaker/shoe cleaning quote", "Cotización de limpieza de tenis/calzado con IA"),
          })
        : await axios.post(`${API}/public/sneaker-cleaning/dropoff-request`, {
            ...contactFields,
            dropoff_date: scheduleForm.date,
            dropoff_time: scheduleForm.time || null,
            notes: t("AI sneaker/shoe cleaning quote — store drop-off", "Cotización de limpieza de tenis/calzado con IA — entrega en tienda"),
          });

      setPendingVerification(res.data);
      setStep("verify");
    } catch (err) {
      toast.error(getSneakerQuoteErrorMessage(err, t));
    } finally {
      setScheduling(false);
    }
  };

  const handleVerifyCode = async () => {
    if (!pendingVerification?.temp_token || !verificationCode.trim()) {
      toast.error(t("Enter the code we sent you", "Ingresa el código que te enviamos"));
      return;
    }
    setVerifying(true);
    try {
      const res = await axios.post(`${API}/public/verify-code`, {
        temp_token: pendingVerification.temp_token,
        code: verificationCode.trim(),
      });
      setOrderResult(res.data);
      setPendingVerification(null);
      setStep("done");
    } catch (err) {
      toast.error(getSneakerQuoteErrorMessage(err, t));
    } finally {
      setVerifying(false);
    }
  };

  const handleResendCode = async () => {
    if (!pendingVerification?.temp_token) return;
    try {
      await axios.post(`${API}/public/resend-code`, { temp_token: pendingVerification.temp_token });
      toast.success(t("Code resent", "Código reenviado"));
    } catch (err) {
      toast.error(getSneakerQuoteErrorMessage(err, t));
    }
  };

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
                <SmsConsentField checked={form.sms_consent} onChange={(e) => setF("sms_consent", e.target.checked)} />
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
              {pairs.map((pair, pairIdx) => (
                <div key={pair.localId} className="rounded-xl border border-slate-200 p-3 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">
                      {t("Pair", "Par")} {pairIdx + 1}
                    </span>
                    {pairs.length > 1 && (
                      <button onClick={() => removePair(pairIdx)} className="text-[11px] text-slate-400 hover:text-red-500">
                        {t("Remove", "Quitar")}
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {pair.photos.map((p, photoIdx) => (
                      <div key={photoIdx} className="relative aspect-square rounded-lg overflow-hidden border border-slate-200 bg-slate-50">
                        <img src={p.preview} alt="" className="w-full h-full object-cover" />
                        <button
                          onClick={() => removePhoto(pairIdx, photoIdx)}
                          className="absolute top-1 right-1 bg-white/90 hover:bg-white rounded-full p-1 border border-slate-200"
                        >
                          <X className="h-3 w-3 text-slate-600" />
                        </button>
                      </div>
                    ))}
                    {pair.photos.length < MAX_PHOTOS_PER_PAIR && (
                      <button
                        onClick={() => openPicker(pairIdx, fileInputRef)}
                        className="aspect-square rounded-lg border-2 border-dashed border-slate-300 flex flex-col items-center justify-center text-slate-400 hover:border-violet-300 hover:text-violet-500 transition-colors"
                      >
                        <Upload className="h-5 w-5 mb-1" />
                        <span className="text-[10px]">{t("Add photo", "Agregar foto")}</span>
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => openPicker(pairIdx, cameraInputRef)}
                      className="h-11 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 flex items-center justify-center gap-2"
                    >
                      <Camera className="h-4 w-4" />{t("Take photo", "Tomar foto")}
                    </button>
                    <button
                      onClick={() => openPicker(pairIdx, fileInputRef)}
                      className="h-11 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 flex items-center justify-center gap-2"
                    >
                      <Upload className="h-4 w-4" />{t("Gallery / File", "Galería / archivo")}
                    </button>
                  </div>
                </div>
              ))}

              <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFileSelect} />
              <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFileSelect} />

              {pairs.length < MAX_PAIRS && (
                <button
                  onClick={addPair}
                  className="w-full h-10 rounded-xl border-2 border-dashed border-violet-200 text-violet-500 hover:border-violet-400 hover:bg-violet-50/50 flex items-center justify-center gap-1.5 text-sm font-semibold transition-colors"
                >
                  <Plus className="h-4 w-4" />{t("Got another pair? Add it", "¿Tienes otro par? Agrégalo")}
                </button>
              )}

              <p className="text-[11px] text-slate-400 text-center">
                {t(
                  `Up to ${MAX_PHOTOS_PER_PAIR} photos per pair: overall view, sole/damage close-up, brand tag.`,
                  `Hasta ${MAX_PHOTOS_PER_PAIR} fotos por par: vista general, suela/daño, etiqueta de marca.`
                )}
              </p>

              <button
                onClick={runAnalysis}
                disabled={analyzing || pairsWithPhotos.length === 0}
                className="w-full h-12 rounded-xl bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-sm font-bold uppercase tracking-wide flex items-center justify-center gap-2 transition-colors"
              >
                {analyzing
                  ? <><RefreshCw className="h-4 w-4 animate-spin" />{t("Analyzing…", "Analizando…")}</>
                  : <><Sparkles className="h-4 w-4" />
                      {pairsWithPhotos.length > 1
                        ? t(`Get my quote for ${pairsWithPhotos.length} pairs`, `Ver mi cotización de ${pairsWithPhotos.length} pares`)
                        : t("Get my quote", "Ver mi cotización")}
                    </>}
              </button>
              <button onClick={() => setStep("contact")} className="w-full text-xs text-slate-400 hover:text-slate-600 text-center">
                {t("← Back", "← Volver")}
              </button>
            </div>
          )}

          {step === "result" && results && (
            <div className="space-y-4">
              {results.map((r, idx) => (
                <div key={idx}>
                  {r.ok ? (
                    <div className="space-y-3">
                      <div className="rounded-2xl border border-violet-200 bg-violet-50/60 p-5 space-y-2">
                        <div className="flex items-center gap-2 mb-1">
                          <CheckCircle className="w-5 h-5 text-emerald-500" />
                          <h3 className="font-bold text-slate-800">
                            {results.length > 1 && `${t("Pair", "Par")} ${r.pricing.pair_index}: `}
                            {[r.ai_result.brand, r.ai_result.model].filter(Boolean).join(" ") ||
                              (r.ai_result.type !== "unknown" ? r.ai_result.type : t("Your item", "Tu artículo"))}
                          </h3>
                        </div>
                        {r.ai_result.condition_notes && <p className="text-xs text-slate-500">{r.ai_result.condition_notes}</p>}
                        <p className="text-xs text-slate-500">
                          {t("Dirt level", "Nivel de suciedad")}: <strong>{DIRT_LABELS[r.ai_result.dirt_level]?.[locale === "es" ? "es" : "en"] || r.ai_result.dirt_level}</strong>
                        </p>
                      </div>
                      {!r.ai_result.brand && (
                        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50/70 p-3">
                          <Info className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                          <p className="text-xs text-amber-700">
                            {t(
                              "We couldn't identify the exact brand/model from your photos — this is a general estimate based on the condition and type of shoe. We'll confirm the exact price when we receive your pair.",
                              "No pudimos identificar la marca/modelo exacto en tus fotos — este es un estimado general según el estado y tipo de calzado. Confirmamos el precio exacto al recibir tu par."
                            )}
                          </p>
                        </div>
                      )}
                      <div className="rounded-2xl border border-slate-200 p-5 space-y-1.5">
                        <div className="flex justify-between text-xs text-slate-500">
                          <span>{t("Base price", "Precio base")}</span>
                          <span className="font-semibold text-slate-700">${r.pricing.base_price.toFixed(2)}</span>
                        </div>
                        {r.pricing.extra_charge > 0 && (
                          <div className="flex justify-between text-xs text-slate-500">
                            <span>{t("Soiling / complexity surcharge", "Extra por suciedad / complejidad")}</span>
                            <span className="font-semibold text-slate-700">+${r.pricing.extra_charge.toFixed(2)}</span>
                          </div>
                        )}
                        <div className="flex justify-between text-lg font-black text-slate-900 pt-2 border-t border-slate-100">
                          <span>{t("Estimated total", "Total estimado")}</span>
                          <span>${r.pricing.suggested_total.toFixed(2)}</span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-red-200 bg-red-50/60 p-5 space-y-1">
                      <div className="flex items-center gap-2 text-red-600">
                        <AlertTriangle className="w-5 h-5" />
                        <h3 className="font-bold text-sm">
                          {results.length > 1 ? `${t("Pair", "Par")} ${r.pair_index}: ` : ""}
                          {t("Couldn't analyze this pair", "No se pudo analizar este par")}
                        </h3>
                      </div>
                      <p className="text-xs text-red-500">{r.error}</p>
                    </div>
                  )}
                </div>
              ))}

              {successfulResults.length > 1 && (
                <div className="rounded-2xl border border-slate-200 p-5 flex justify-between items-center">
                  <span className="text-sm font-bold text-slate-700">{t("Estimated grand total", "Total estimado general")}</span>
                  <span className="text-xl font-black text-slate-900">${grandTotal.toFixed(2)}</span>
                </div>
              )}

              <p className="text-[11px] text-slate-400 text-center">
                {t("Final price is confirmed when we receive each pair. Sent to your email too.", "El precio final se confirma al recibir cada par. También lo enviamos a tu correo.")}
              </p>

              <button
                onClick={() => setStep("schedule")}
                disabled={successfulResults.length === 0}
                className="w-full h-12 rounded-xl bg-primary hover:opacity-90 disabled:opacity-50 text-white text-sm font-bold uppercase tracking-wide flex items-center justify-center gap-2 transition-all"
              >
                {t("Schedule my pickup or drop-off", "Agendar recogida o entrega en tienda")}<ArrowRight className="w-4 h-4" />
              </button>
              <button
                onClick={() => { setStep("photos"); setResults(null); }}
                className="w-full text-xs text-slate-400 hover:text-slate-600 text-center"
              >
                {t("Try different photos", "Probar con otras fotos")}
              </button>
            </div>
          )}

          {step === "schedule" && (
            <form onSubmit={handleSchedule} className="bg-white rounded-2xl border border-slate-200 shadow-lg p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setFulfillment("pickup")}
                  className={`h-16 rounded-xl border-2 flex flex-col items-center justify-center gap-1 text-xs font-bold transition-colors ${
                    fulfillment === "pickup" ? "border-violet-500 bg-violet-50 text-violet-700" : "border-slate-200 text-slate-500"
                  }`}
                >
                  <Truck className="w-4 h-4" />{t("Pickup & Delivery", "Recogida y Entrega")}
                </button>
                <button
                  type="button"
                  onClick={() => setFulfillment("dropoff")}
                  className={`h-16 rounded-xl border-2 flex flex-col items-center justify-center gap-1 text-xs font-bold transition-colors ${
                    fulfillment === "dropoff" ? "border-violet-500 bg-violet-50 text-violet-700" : "border-slate-200 text-slate-500"
                  }`}
                >
                  <Store className="w-4 h-4" />{t("Drop off at store", "Entrega en tienda")}
                </button>
              </div>

              {fulfillment === "pickup" && (
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">{t("Pickup address", "Dirección de recogida")}</label>
                  <input
                    type="text" value={scheduleForm.address}
                    onChange={(e) => setScheduleForm((p) => ({ ...p, address: e.target.value }))}
                    className="w-full mt-1 h-11 border border-slate-200 rounded-xl px-3 text-sm"
                    required
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">
                    {fulfillment === "pickup" ? t("Pickup date", "Fecha de recogida") : t("Drop-off date", "Fecha de entrega")}
                  </label>
                  <input
                    type="date" value={scheduleForm.date}
                    min={new Date().toISOString().slice(0, 10)}
                    onChange={(e) => setScheduleForm((p) => ({ ...p, date: e.target.value }))}
                    className="w-full mt-1 h-11 border border-slate-200 rounded-xl px-3 text-sm"
                    required
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">{t("Preferred time (optional)", "Horario preferido (opcional)")}</label>
                  <input
                    type="text" value={scheduleForm.time} placeholder={t("e.g. morning", "ej. en la mañana")}
                    onChange={(e) => setScheduleForm((p) => ({ ...p, time: e.target.value }))}
                    className="w-full mt-1 h-11 border border-slate-200 rounded-xl px-3 text-sm"
                  />
                </div>
              </div>

              <div className="rounded-xl bg-slate-50 p-3 flex justify-between items-center text-sm">
                <span className="text-slate-500">{t("Total to pay", "Total a pagar")}</span>
                <span className="font-black text-slate-900">${grandTotal.toFixed(2)}</span>
              </div>

              <button
                type="submit"
                disabled={scheduling}
                className="w-full h-12 rounded-xl bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-sm font-bold uppercase tracking-wide flex items-center justify-center gap-2 transition-colors"
              >
                {scheduling
                  ? <><RefreshCw className="h-4 w-4 animate-spin" />{t("Submitting…", "Enviando…")}</>
                  : <>{t("Confirm", "Confirmar")}<ArrowRight className="w-4 h-4" /></>}
              </button>
              <button type="button" onClick={() => setStep("result")} className="w-full text-xs text-slate-400 hover:text-slate-600 text-center">
                {t("← Back", "← Volver")}
              </button>
            </form>
          )}

          {step === "verify" && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-lg p-6 space-y-4 text-center">
              <ShieldCheck className="w-10 h-10 text-violet-500 mx-auto" />
              <h3 className="font-bold text-slate-800">{t("Verify your request", "Verifica tu solicitud")}</h3>
              <p className="text-sm text-slate-500">
                {pendingVerification?.message || t("We sent you a verification code.", "Te enviamos un código de verificación.")}
              </p>
              <input
                type="text" value={verificationCode} onChange={(e) => setVerificationCode(e.target.value)}
                placeholder="000000" maxLength={6}
                className="w-full h-12 border border-slate-200 rounded-xl px-3 text-center text-lg tracking-widest"
              />
              <button
                onClick={handleVerifyCode}
                disabled={verifying}
                className="w-full h-12 rounded-xl bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-sm font-bold uppercase tracking-wide flex items-center justify-center gap-2 transition-colors"
              >
                {verifying
                  ? <><RefreshCw className="h-4 w-4 animate-spin" />{t("Verifying…", "Verificando…")}</>
                  : t("Confirm code", "Confirmar código")}
              </button>
              <button onClick={handleResendCode} className="w-full text-xs text-slate-400 hover:text-slate-600 text-center">
                {t("Resend code", "Reenviar código")}
              </button>
            </div>
          )}

          {step === "done" && (
            <div className="bg-white rounded-2xl border border-emerald-200 shadow-lg p-6 space-y-3 text-center">
              <CheckCircle className="w-12 h-12 text-emerald-500 mx-auto" />
              <h3 className="font-bold text-lg text-slate-800">{t("You're all set!", "¡Listo!")}</h3>
              <p className="text-sm text-slate-500">
                {t(
                  `Order ${orderResult?.order_number || ""} is confirmed. We'll contact you to finalize details.`,
                  `Tu orden ${orderResult?.order_number || ""} está confirmada. Te contactaremos para finalizar los detalles.`
                )}
              </p>
              <Link to="/" className="inline-flex items-center gap-2 text-violet-600 font-semibold text-sm hover:underline">
                {t("Back to home", "Volver al inicio")}
              </Link>
            </div>
          )}

          {!["schedule", "verify", "done"].includes(step) && (
            <p className="text-center text-xs text-slate-400 mt-6">
              {t("Prefer to book directly? ", "¿Prefieres agendar directo? ")}
              <Link to="/schedule-pickup" className="text-primary font-semibold hover:underline">
                {t("Schedule a pickup", "Programa una recogida")}
              </Link>
            </p>
          )}
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}
