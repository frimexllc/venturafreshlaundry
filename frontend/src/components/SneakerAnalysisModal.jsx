// SneakerAnalysisModal.jsx
// AI Sneaker Pricing: operator uploads up to 3 photos of a pair of shoes,
// the backend runs a vision-model analysis, and the operator reviews the
// suggested price before it touches anything. Works both standalone (a
// quote before an order exists) and attached to an order (orderId set).

import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";
import { Button } from "./ui/button";
import { Camera, Upload, X, CheckCircle, Sparkles, RefreshCw, Pencil } from "lucide-react";
import { toast } from "sonner";
import { useLocale } from "../context/LocaleContext";

const API_URL = process.env.REACT_APP_BACKEND_URL;
const MAX_PHOTOS = 3;

const getToken = () => localStorage.getItem("token") || sessionStorage.getItem("token");
const authHdrs = () => {
  const token = getToken();
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
};

const fileToBase64 = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

const DIRT_LABELS = {
  light:    { en: "Light",    es: "Leve" },
  moderate: { en: "Moderate", es: "Moderada" },
  heavy:    { en: "Heavy",    es: "Alta" },
  extreme:  { en: "Extreme",  es: "Extrema" },
};
const COMPLEXITY_LABELS = {
  low:    { en: "Low",    es: "Baja" },
  medium: { en: "Medium", es: "Media" },
  high:   { en: "High",   es: "Alta" },
};

export default function SneakerAnalysisModal({ open, onClose, orderId = null, onAccepted }) {
  const { t, locale } = useLocale();
  const [photos, setPhotos] = useState([]); // [{file, preview}]
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState(null); // full record from the backend
  const [deciding, setDeciding] = useState(false);
  const [editingPrice, setEditingPrice] = useState(false);
  const [customPrice, setCustomPrice] = useState("");
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);

  const reset = () => {
    setPhotos([]);
    setAnalysis(null);
    setEditingPrice(false);
    setCustomPrice("");
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (!files.length) return;
    const room = MAX_PHOTOS - photos.length;
    if (room <= 0) {
      toast.error(t(`You can add up to ${MAX_PHOTOS} photos`, `Puedes agregar hasta ${MAX_PHOTOS} fotos`));
      return;
    }
    const next = files.slice(0, room).map((file) => ({ file, preview: URL.createObjectURL(file) }));
    setPhotos((prev) => [...prev, ...next]);
  };

  const removePhoto = (idx) => {
    setPhotos((prev) => prev.filter((_, i) => i !== idx));
  };

  const runAnalysis = async () => {
    if (photos.length === 0) {
      toast.error(t("Add at least one photo", "Agrega al menos una foto"));
      return;
    }
    setAnalyzing(true);
    setAnalysis(null);
    try {
      const images_base64 = await Promise.all(photos.map((p) => fileToBase64(p.file)));
      const res = await fetch(`${API_URL}/api/sneaker-analysis`, {
        method: "POST",
        headers: authHdrs(),
        body: JSON.stringify({ order_id: orderId, images_base64 }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || t("AI analysis failed", "El análisis de IA falló"));
      }
      const data = await res.json();
      setAnalysis(data);
      setCustomPrice(String(data.pricing.suggested_total));
    } catch (err) {
      toast.error(err.message || t("Connection error", "Error de conexión"));
    } finally {
      setAnalyzing(false);
    }
  };

  const decide = async (action) => {
    if (!analysis) return;
    const finalPrice = action === "edit" ? parseFloat(customPrice) : analysis.pricing.suggested_total;
    if (action !== "reject" && (isNaN(finalPrice) || finalPrice < 0)) {
      toast.error(t("Enter a valid price", "Ingresa un precio válido"));
      return;
    }
    setDeciding(true);
    try {
      const res = await fetch(`${API_URL}/api/sneaker-analysis/${analysis.id}/decide`, {
        method: "POST",
        headers: authHdrs(),
        body: JSON.stringify({ action, final_price: action === "reject" ? null : finalPrice }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || t("Could not save decision", "No se pudo guardar la decisión"));
      }
      const data = await res.json();
      if (action === "reject") {
        toast.info(t("Analysis discarded", "Análisis descartado"));
      } else {
        toast.success(
          orderId
            ? t("Added to the order", "Agregado a la orden")
            : t("Quote saved", "Cotización guardada")
        );
      }
      onAccepted?.(data);
      handleClose();
    } catch (err) {
      toast.error(err.message || t("Connection error", "Error de conexión"));
    } finally {
      setDeciding(false);
    }
  };

  const reanalyze = () => {
    setAnalysis(null);
    setEditingPrice(false);
  };

  const ai = analysis?.ai_result;
  const pricing = analysis?.pricing;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="w-[95vw] max-w-lg bg-white max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-violet-600" />
            {t("AI Sneaker Pricing", "Precio de tenis con IA")}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {orderId
              ? t("Analyze photos and add a priced line to this order.", "Analiza fotos y agrega una línea con precio a esta orden.")
              : t("Quick quote — no order required yet.", "Cotización rápida — todavía no requiere una orden.")}
          </DialogDescription>
        </DialogHeader>

        {!analysis && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2">
              {photos.map((p, idx) => (
                <div key={idx} className="relative aspect-square rounded-lg overflow-hidden border border-slate-200 bg-slate-50">
                  <img src={p.preview} alt="" className="w-full h-full object-cover" />
                  <button
                    onClick={() => removePhoto(idx)}
                    className="absolute top-1 right-1 bg-white/90 hover:bg-white rounded-full p-1 border border-slate-200"
                  >
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
              <Button variant="outline" size="sm" className="gap-2" onClick={() => cameraInputRef.current?.click()}>
                <Camera className="h-4 w-4" />{t("Take photo", "Tomar foto")}
              </Button>
              <Button variant="outline" size="sm" className="gap-2" onClick={() => fileInputRef.current?.click()}>
                <Upload className="h-4 w-4" />{t("Gallery / File", "Galería / archivo")}
              </Button>
            </div>
            <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFileSelect} />
            <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFileSelect} />

            <Button
              className="w-full bg-violet-600 hover:bg-violet-700 gap-2"
              disabled={analyzing || photos.length === 0}
              onClick={runAnalysis}
            >
              {analyzing
                ? <><RefreshCw className="h-4 w-4 animate-spin" />{t("Analyzing…", "Analizando…")}</>
                : <><Sparkles className="h-4 w-4" />{t("Analyze", "Analizar")}</>}
            </Button>
          </div>
        )}

        {analysis && ai && pricing && (
          <div className="space-y-4">
            <div className="rounded-xl border border-violet-200 bg-violet-50/60 p-4 space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-slate-800 text-sm">
                  {[ai.brand, ai.model].filter(Boolean).join(" ") || (ai.type !== "unknown" ? ai.type : t("Unidentified item", "Artículo no identificado"))}
                </h4>
                <span className="text-[10px] font-bold text-violet-600 bg-white px-2 py-0.5 rounded-full border border-violet-200">
                  {Math.round(ai.confidence * 100)}% {t("confidence", "confianza")}
                </span>
              </div>
              {ai.materials?.length > 0 && (
                <p className="text-xs text-slate-500">{t("Materials", "Materiales")}: {ai.materials.join(", ")}</p>
              )}
              <p className="text-xs text-slate-500">
                {t("Dirt level", "Nivel de suciedad")}: <strong>{DIRT_LABELS[ai.dirt_level]?.[locale === "es" ? "es" : "en"] || ai.dirt_level}</strong>
                {"  ·  "}
                {t("Complexity", "Complejidad")}: <strong>{COMPLEXITY_LABELS[ai.cleaning_complexity]?.[locale === "es" ? "es" : "en"] || ai.cleaning_complexity}</strong>
              </p>
              {ai.condition_notes && <p className="text-xs text-slate-600">{ai.condition_notes}</p>}
              <p className="text-xs text-slate-500">{t("Estimated value", "Valor estimado")}: {ai.estimated_value_range}</p>
              <p className="text-xs text-slate-500">{t("Recommended service", "Servicio recomendado")}: {ai.recommended_service}</p>
            </div>

            <div className="rounded-xl border border-slate-200 p-4 space-y-1.5">
              <div className="flex justify-between text-xs text-slate-500">
                <span>{t("Base price", "Precio base")} ({t("pair", "par")} #{pricing.pair_index})</span>
                <span className="font-semibold text-slate-700">${pricing.base_price.toFixed(2)}</span>
              </div>
              {pricing.extra_charge > 0 && (
                <div className="flex justify-between text-xs text-slate-500">
                  <span>{t("Soiling / complexity surcharge", "Extra por suciedad / complejidad")}</span>
                  <span className="font-semibold text-slate-700">+${pricing.extra_charge.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm font-bold text-slate-800 pt-1.5 border-t border-slate-100">
                <span>{t("Suggested total", "Total sugerido")}</span>
                <span>${pricing.suggested_total.toFixed(2)}</span>
              </div>
            </div>

            {editingPrice ? (
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-500">$</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={customPrice}
                  onChange={(e) => setCustomPrice(e.target.value)}
                  className="flex-1 h-9 border border-slate-200 rounded-lg px-2.5 text-sm"
                  autoFocus
                />
                <Button size="sm" disabled={deciding} onClick={() => decide("edit")}>
                  {deciding ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : t("Save", "Guardar")}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setEditingPrice(false)}>{t("Cancel", "Cancelar")}</Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-2">
                <Button className="w-full bg-emerald-600 hover:bg-emerald-700 gap-2" disabled={deciding} onClick={() => decide("accept")}>
                  {deciding ? <RefreshCw className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                  {t("Accept price", "Aceptar precio")} (${pricing.suggested_total.toFixed(2)})
                </Button>
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="outline" className="gap-2" disabled={deciding} onClick={() => setEditingPrice(true)}>
                    <Pencil className="h-3.5 w-3.5" />{t("Edit price", "Editar precio")}
                  </Button>
                  <Button variant="outline" className="gap-2" disabled={deciding} onClick={reanalyze}>
                    <RefreshCw className="h-3.5 w-3.5" />{t("Reanalyze", "Reanalizar")}
                  </Button>
                </div>
                <button
                  className="text-[11px] text-slate-400 hover:text-red-500 text-center"
                  disabled={deciding}
                  onClick={() => decide("reject")}
                >
                  {t("Discard this analysis", "Descartar este análisis")}
                </button>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
