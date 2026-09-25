// SneakerAnalysisModal.jsx
// AI Sneaker Pricing: operator groups photos into one or more pairs of
// shoes (up to 3 photos per pair — different angles of the SAME pair),
// then analyzes every pair in one batch. Each pair gets its own AI
// assessment and suggested price (1st/2nd/3rd+ pair pricing tier), and the
// operator accepts/edits/rejects each one individually. Works both
// standalone (a quote before an order exists) and attached to an order.

import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";
import { Button } from "./ui/button";
import { Camera, Upload, X, CheckCircle, Sparkles, RefreshCw, Pencil, Plus, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useLocale } from "../context/LocaleContext";
import { fileToResizedBase64 } from "../utils/imageResize";

const API_URL = process.env.REACT_APP_BACKEND_URL;
const MAX_PHOTOS_PER_PAIR = 3;
const MAX_PAIRS = 6;

const getToken = () => localStorage.getItem("token") || sessionStorage.getItem("token");
const authHdrs = () => {
  const token = getToken();
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
};

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

let nextLocalPairId = 1;
const emptyPair = () => ({ localId: nextLocalPairId++, photos: [] });

// FastAPI returns a plain string `detail` for a normal HTTPException, but a
// LIST of validation-error objects for a 422 (request body failed Pydantic
// validation) — stringifying that array directly produces unreadable
// "[object Object],[object Object]" text.
function readableErrorDetail(detail, fallback) {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail) && detail.length > 0) {
    return detail.map((d) => d.msg || JSON.stringify(d)).join("; ");
  }
  return fallback;
}

export default function SneakerAnalysisModal({ open, onClose, orderId = null, onAccepted }) {
  const { t, locale } = useLocale();
  const [pairs, setPairs] = useState([emptyPair()]);
  const [analyzing, setAnalyzing] = useState(false);
  const [results, setResults] = useState(null); // null before analysis; else array of per-pair result+UI state
  const [activePairIdx, setActivePairIdx] = useState(0);
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);

  const reset = () => {
    setPairs([emptyPair()]);
    setResults(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const openPicker = (pairIdx, ref) => {
    setActivePairIdx(pairIdx);
    ref.current?.click();
  };

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (!files.length) return;
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
      const pairsPayload = await Promise.all(
        pairsWithPhotos.map(async (p) => ({
          images_base64: await Promise.all(p.photos.map((ph) => fileToResizedBase64(ph.file))),
        }))
      );

      if (pairsPayload.length === 1) {
        const res = await fetch(`${API_URL}/api/sneaker-analysis`, {
          method: "POST",
          headers: authHdrs(),
          body: JSON.stringify({ order_id: orderId, images_base64: pairsPayload[0].images_base64 }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(readableErrorDetail(data.detail, t("AI analysis failed", "El análisis de IA falló")));
        setResults([toResultState({ ok: true, ...data })]);
      } else {
        const res = await fetch(`${API_URL}/api/sneaker-analysis/batch`, {
          method: "POST",
          headers: authHdrs(),
          body: JSON.stringify({ order_id: orderId, pairs: pairsPayload }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(readableErrorDetail(data.detail, t("AI analysis failed", "El análisis de IA falló")));
        setResults(data.results.map(toResultState));
      }
    } catch (err) {
      toast.error(err.message || t("Connection error", "Error de conexión"));
    } finally {
      setAnalyzing(false);
    }
  };

  const toResultState = (r) => ({
    ...r,
    uiStatus: r.ok ? "pending" : "failed",
    editingPrice: false,
    customPrice: r.ok ? String(r.pricing.suggested_total) : "",
  });

  const updateResult = (idx, patch) => {
    setResults((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const decide = async (idx, action) => {
    const r = results[idx];
    if (!r?.ok) return;
    const finalPrice = action === "edit" ? parseFloat(r.customPrice) : r.pricing.suggested_total;
    if (action !== "reject" && (isNaN(finalPrice) || finalPrice < 0)) {
      toast.error(t("Enter a valid price", "Ingresa un precio válido"));
      return;
    }
    updateResult(idx, { uiStatus: "deciding" });
    try {
      const res = await fetch(`${API_URL}/api/sneaker-analysis/${r.id}/decide`, {
        method: "POST",
        headers: authHdrs(),
        body: JSON.stringify({ action, final_price: action === "reject" ? null : finalPrice }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(readableErrorDetail(err.detail, t("Could not save decision", "No se pudo guardar la decisión")));
      }
      const data = await res.json();
      updateResult(idx, { uiStatus: action === "reject" ? "rejected" : "decided", editingPrice: false });
      if (action !== "reject") {
        toast.success(
          orderId ? t("Added to the order", "Agregado a la orden") : t("Quote saved", "Cotización guardada")
        );
        onAccepted?.(data);
      } else {
        toast.info(t("Analysis discarded", "Análisis descartado"));
      }
    } catch (err) {
      toast.error(err.message || t("Connection error", "Error de conexión"));
      updateResult(idx, { uiStatus: "pending" });
    }
  };

  const allDecided = results?.every((r) => !r.ok || r.uiStatus === "decided" || r.uiStatus === "rejected");

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
              ? t("Analyze one or more pairs and add priced lines to this order.", "Analiza uno o más pares y agrega líneas con precio a esta orden.")
              : t("Quick quote — no order required yet.", "Cotización rápida — todavía no requiere una orden.")}
          </DialogDescription>
        </DialogHeader>

        {!results && (
          <div className="space-y-4">
            {pairs.map((pair, pairIdx) => (
              <div key={pair.localId} className="rounded-xl border border-slate-200 p-3 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">
                    {t("Pair", "Par")} {pairIdx + 1}
                  </span>
                  {pairs.length > 1 && (
                    <button
                      onClick={() => removePair(pairIdx)}
                      className="text-[11px] text-slate-400 hover:text-red-500"
                    >
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
                  <Button variant="outline" size="sm" className="gap-2" onClick={() => openPicker(pairIdx, cameraInputRef)}>
                    <Camera className="h-4 w-4" />{t("Take photo", "Tomar foto")}
                  </Button>
                  <Button variant="outline" size="sm" className="gap-2" onClick={() => openPicker(pairIdx, fileInputRef)}>
                    <Upload className="h-4 w-4" />{t("Gallery / File", "Galería / archivo")}
                  </Button>
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
                <Plus className="h-4 w-4" />{t("Add another pair", "Agregar otro par")}
              </button>
            )}

            <p className="text-[11px] text-slate-400 text-center">
              {t(
                `Up to ${MAX_PHOTOS_PER_PAIR} photos per pair: overall view, sole/damage close-up, brand tag.`,
                `Hasta ${MAX_PHOTOS_PER_PAIR} fotos por par: vista general, suela/daño, etiqueta de marca.`
              )}
            </p>

            <Button
              className="w-full bg-violet-600 hover:bg-violet-700 gap-2"
              disabled={analyzing || pairsWithPhotos.length === 0}
              onClick={runAnalysis}
            >
              {analyzing
                ? <><RefreshCw className="h-4 w-4 animate-spin" />{t("Analyzing…", "Analizando…")}</>
                : <><Sparkles className="h-4 w-4" />
                    {pairsWithPhotos.length > 1
                      ? t(`Analyze ${pairsWithPhotos.length} pairs`, `Analizar ${pairsWithPhotos.length} pares`)
                      : t("Analyze", "Analizar")}
                  </>}
            </Button>
          </div>
        )}

        {results && (
          <div className="space-y-4">
            {results.map((r, idx) => (
              <PairResultCard
                key={r.ok ? r.id : `failed-${idx}`}
                result={r}
                index={idx}
                showPairNumber={results.length > 1}
                orderId={orderId}
                t={t}
                locale={locale}
                onDecide={(action) => decide(idx, action)}
                onEditToggle={(v) => updateResult(idx, { editingPrice: v })}
                onCustomPriceChange={(v) => updateResult(idx, { customPrice: v })}
              />
            ))}

            {allDecided ? (
              <Button className="w-full" onClick={handleClose}>
                {t("Done", "Listo")}
              </Button>
            ) : (
              <button
                onClick={() => { setResults(null); }}
                className="w-full text-xs text-slate-400 hover:text-slate-600 text-center"
              >
                {t("← Back to photos", "← Volver a las fotos")}
              </button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function PairResultCard({ result: r, index, showPairNumber, orderId, t, locale, onDecide, onEditToggle, onCustomPriceChange }) {
  if (!r.ok) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50/60 p-4 space-y-1">
        <div className="flex items-center gap-2 text-red-600">
          <AlertTriangle className="h-4 w-4" />
          <span className="text-sm font-bold">
            {showPairNumber ? `${t("Pair", "Par")} ${r.pair_index ?? index + 1}: ` : ""}
            {t("Analysis failed", "El análisis falló")}
          </span>
        </div>
        <p className="text-xs text-red-500">{r.error}</p>
      </div>
    );
  }

  const { ai, pricing } = { ai: r.ai_result, pricing: r.pricing };
  const decided = r.uiStatus === "decided" || r.uiStatus === "rejected";
  const deciding = r.uiStatus === "deciding";

  if (decided) {
    return (
      <div className="rounded-xl border border-slate-200 p-3 flex items-center gap-2 text-sm text-slate-500">
        {r.uiStatus === "decided" ? <CheckCircle className="h-4 w-4 text-emerald-500 shrink-0" /> : <X className="h-4 w-4 text-slate-400 shrink-0" />}
        <span className="truncate">
          {showPairNumber && `${t("Pair", "Par")} ${pricing.pair_index}: `}
          {[ai.brand, ai.model].filter(Boolean).join(" ") || (ai.type !== "unknown" ? ai.type : t("Item", "Artículo"))}
          {r.uiStatus === "decided" ? ` — $${Number(r.customPrice || pricing.suggested_total).toFixed(2)}` : ` (${t("discarded", "descartado")})`}
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-violet-200 bg-violet-50/60 p-4 space-y-2">
        <div className="flex items-center justify-between">
          <h4 className="font-bold text-slate-800 text-sm">
            {showPairNumber && <span className="text-violet-500">{t("Pair", "Par")} {pricing.pair_index}: </span>}
            {[ai.brand, ai.model].filter(Boolean).join(" ") || (ai.type !== "unknown" ? ai.type : t("Unidentified item", "Artículo no identificado"))}
          </h4>
          <span className="text-[10px] font-bold text-violet-600 bg-white px-2 py-0.5 rounded-full border border-violet-200 shrink-0 ml-2">
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

      {r.editingPrice ? (
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-500">$</span>
          <input
            type="number"
            step="0.01"
            min="0"
            value={r.customPrice}
            onChange={(e) => onCustomPriceChange(e.target.value)}
            className="flex-1 h-9 border border-slate-200 rounded-lg px-2.5 text-sm"
            autoFocus
          />
          <Button size="sm" disabled={deciding} onClick={() => onDecide("edit")}>
            {deciding ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : t("Save", "Guardar")}
          </Button>
          <Button size="sm" variant="outline" onClick={() => onEditToggle(false)}>{t("Cancel", "Cancelar")}</Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2">
          <Button className="w-full bg-emerald-600 hover:bg-emerald-700 gap-2" disabled={deciding} onClick={() => onDecide("accept")}>
            {deciding ? <RefreshCw className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
            {t("Accept price", "Aceptar precio")} (${pricing.suggested_total.toFixed(2)})
          </Button>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" className="gap-2" disabled={deciding} onClick={() => onEditToggle(true)}>
              <Pencil className="h-3.5 w-3.5" />{t("Edit price", "Editar precio")}
            </Button>
            <Button variant="outline" className="gap-2" disabled={deciding} onClick={() => onDecide("reject")}>
              <X className="h-3.5 w-3.5" />{t("Discard", "Descartar")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
