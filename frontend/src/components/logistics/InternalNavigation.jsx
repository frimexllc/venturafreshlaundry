// ═══════════════════════════════════════════════════════════════════════
// InternalNavigation.jsx  v2
// Fix principal: el DirectionsService / Renderer se inicializa con
// polling (cada 200ms) hasta que mapRef.current esté disponible,
// en lugar de depender de un useEffect que se ejecuta demasiado pronto.
// ═══════════════════════════════════════════════════════════════════════

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Navigation, ChevronRight, ChevronLeft, CheckCircle2,
  X, ArrowUp, ArrowUpLeft, ArrowUpRight, RotateCcw,
  RotateCw, Clock, MapPin, AlertTriangle, Fuel, Package,
  Loader2,
} from 'lucide-react';

// ── Helpers ─────────────────────────────────────────────────────────────

function ManeuverIcon({ maneuver, className = 'w-7 h-7' }) {
  const map = {
    'turn-left':        <ArrowUpLeft className={className} />,
    'turn-right':       <ArrowUpRight className={className} />,
    'turn-slight-left': <ArrowUpLeft className={className} />,
    'turn-slight-right':<ArrowUpRight className={className} />,
    'turn-sharp-left':  <RotateCcw className={className} />,
    'turn-sharp-right': <RotateCw className={className} />,
    'uturn-left':       <RotateCcw className={className} />,
    'uturn-right':      <RotateCw className={className} />,
    'roundabout-left':  <RotateCcw className={className} />,
    'roundabout-right': <RotateCw className={className} />,
    'straight':         <ArrowUp className={className} />,
    'merge':            <ArrowUp className={className} />,
    'fork-left':        <ArrowUpLeft className={className} />,
    'fork-right':       <ArrowUpRight className={className} />,
    'ramp-left':        <ArrowUpLeft className={className} />,
    'ramp-right':       <ArrowUpRight className={className} />,
  };
  return map[maneuver] ?? <ArrowUp className={className} />;
}

function stripHtml(html = '') {
  return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
}

function fmtDist(meters) {
  const mi = meters / 1609.34;
  if (mi < 0.1) return `${Math.round(meters * 3.281)} ft`;
  return `${mi.toFixed(1)} mi`;
}

function fmtTime(seconds) {
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)}h ${m % 60}min`;
}

// ── Main component ───────────────────────────────────────────────────────

export function InternalNavigation({ stops = [], hqLocation, mapRef, onClose, onStepComplete }) {
  const [currentStopIdx, setCurrentStopIdx] = useState(0);
  const [steps, setSteps]                   = useState([]);
  const [stepIdx, setStepIdx]               = useState(0);
  const [loading, setLoading]               = useState(true);
  const [error, setError]                   = useState(null);
  const [legSummary, setLegSummary]         = useState(null);
  const [collapsed, setCollapsed]           = useState(false);
  const [mapReady, setMapReady]             = useState(false);

  const svcRef      = useRef(null);
  const rendererRef = useRef(null);

  // ── 1. Poll until mapRef.current is a real google.maps.Map ───────────
  useEffect(() => {
    let tries = 0;
    const timer = setInterval(() => {
      tries++;
      const map = mapRef?.current;
      if (map && window.google?.maps && typeof map.getCenter === 'function') {
        clearInterval(timer);
        setMapReady(true);
      }
      if (tries > 50) {          // 10 seconds max
        clearInterval(timer);
        setError('El mapa no estuvo disponible. Cierra y vuelve a abrir la navegación.');
        setLoading(false);
      }
    }, 200);
    return () => clearInterval(timer);
  }, [mapRef]);

  // ── 2. Once map is ready, build DirectionsService + Renderer ─────────
  useEffect(() => {
    if (!mapReady) return;
    const map = mapRef.current;

    svcRef.current = new window.google.maps.DirectionsService();

    rendererRef.current = new window.google.maps.DirectionsRenderer({
      suppressMarkers: true,          // we already have our own markers
      preserveViewport: false,
      polylineOptions: {
        strokeColor: '#4f46e5',
        strokeWeight: 7,
        strokeOpacity: 0.92,
        zIndex: 200,
      },
    });
    rendererRef.current.setMap(map);

    return () => {
      if (rendererRef.current) {
        rendererRef.current.setMap(null);
        rendererRef.current = null;
      }
    };
  }, [mapReady, mapRef]);

  // ── 3. Fetch directions whenever stop or readiness changes ────────────
  const fetchLeg = useCallback(() => {
    if (!mapReady || !svcRef.current || stops.length === 0) return;

    const stop = stops[currentStopIdx];
    if (!stop) return;

    const originCoord = currentStopIdx === 0
      ? { lat: hqLocation.lat, lng: hqLocation.lng }
      : stops[currentStopIdx - 1].order.location;

    const destCoord = stop.order.location;

    setLoading(true);
    setError(null);
    setSteps([]);
    setStepIdx(0);

    svcRef.current.route(
      {
        origin:      new window.google.maps.LatLng(originCoord.lat, originCoord.lng),
        destination: new window.google.maps.LatLng(destCoord.lat,  destCoord.lng),
        travelMode:  window.google.maps.TravelMode.DRIVING,
        drivingOptions: {
          departureTime: new Date(),
          trafficModel:  window.google.maps.TrafficModel.BEST_GUESS,
        },
      },
      (result, status) => {
        setLoading(false);
        if (status !== 'OK' || !result?.routes?.[0]) {
          setError(`No se pudo calcular la ruta (${status}). Verifica la dirección.`);
          return;
        }
        // Draw on map
        if (rendererRef.current) {
          rendererRef.current.setDirections(result);
        }
        const leg = result.routes[0].legs[0];
        setSteps(leg.steps);
        setLegSummary({
          dist:     leg.distance.text,
          duration: leg.duration_in_traffic?.text ?? leg.duration.text,
        });
        // Pan to first step
        if (mapRef.current && leg.steps[0]) {
          mapRef.current.panTo(leg.steps[0].start_location);
          mapRef.current.setZoom(17);
        }
      }
    );
  }, [mapReady, currentStopIdx, stops, hqLocation, mapRef]);

  useEffect(() => { fetchLeg(); }, [fetchLeg]);

  // ── 4. Pan map when navigating steps ─────────────────────────────────
  useEffect(() => {
    if (!steps[stepIdx] || !mapRef?.current) return;
    mapRef.current.panTo(steps[stepIdx].start_location);
    mapRef.current.setZoom(17);
  }, [stepIdx, steps, mapRef]);

  // ── Derived ──────────────────────────────────────────────────────────
  const currentStop = stops[currentStopIdx];
  const currentStep = steps[stepIdx];
  const nextStep    = steps[stepIdx + 1];
  const isLastStop  = currentStopIdx === stops.length - 1;
  const isLastStep  = stepIdx === steps.length - 1;
  const isPickup    = currentStop?.order?.status === 'pending';
  const isFuel      = currentStop?.order?.type   === 'fuel-stop';

  function advanceStep()  { if (stepIdx < steps.length - 1) setStepIdx(s => s + 1); }
  function retreatStep()  { if (stepIdx > 0)                 setStepIdx(s => s - 1); }

  function handleArrived() {
    onStepComplete?.(currentStopIdx);
    if (isLastStop) { onClose?.(); return; }
    setCurrentStopIdx(i => i + 1);
    setSteps([]);
    setStepIdx(0);
    setLegSummary(null);
    setLoading(true);
  }

  // ── Collapsed mini-bar ───────────────────────────────────────────────
  if (collapsed) {
    return (
      <div className="fixed top-14 inset-x-0 z-[1300] px-3 pointer-events-none">
        <div
          onClick={() => setCollapsed(false)}
          className="flex items-center gap-3 bg-indigo-700 text-white rounded-2xl shadow-2xl px-4 py-2.5 cursor-pointer pointer-events-auto max-w-2xl mx-auto"
        >
          <Navigation className="w-4 h-4 shrink-0 animate-pulse" />
          <span className="text-sm font-semibold truncate flex-1">
            {loading ? 'Calculando ruta…' : currentStep ? stripHtml(currentStep.instructions) : 'Navegación activa'}
          </span>
          {legSummary && <span className="text-xs text-indigo-200 shrink-0">{legSummary.duration}</span>}
          <ChevronRight className="w-4 h-4 shrink-0" />
        </div>
      </div>
    );
  }

  // ── Full panel ───────────────────────────────────────────────────────
  return (
    <div className="fixed bottom-0 inset-x-0 z-[1300] pointer-events-none" style={{ maxHeight: '55vh' }}>
      <div
        className="mx-auto max-w-2xl bg-gray-950 text-white rounded-t-3xl shadow-2xl overflow-hidden flex flex-col pointer-events-auto"
        style={{ maxHeight: '55vh' }}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-4 pt-3 pb-2 border-b border-gray-800">
          <div className="w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center shrink-0">
            <Navigation className="w-3.5 h-3.5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] text-gray-400">
              Parada {currentStopIdx + 1} de {stops.length}
            </div>
            <div className="text-xs font-bold truncate">
              {currentStop?.order?.customer?.name ?? 'Destino'}
            </div>
          </div>

          {/* Progress dots */}
          <div className="flex items-center gap-1 mx-2">
            {stops.slice(0, Math.min(stops.length, 10)).map((_, i) => (
              <div key={i} className={`rounded-full transition-all ${
                i < currentStopIdx ? 'w-2 h-2 bg-green-400' :
                i === currentStopIdx ? 'w-3 h-3 bg-indigo-400' :
                'w-1.5 h-1.5 bg-gray-700'
              }`} />
            ))}
            {stops.length > 10 && <span className="text-[9px] text-gray-500">+{stops.length - 10}</span>}
          </div>

          <button onClick={() => setCollapsed(true)} className="p-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 transition-colors shrink-0" title="Minimizar">
            <ChevronLeft className="w-3.5 h-3.5 rotate-90" />
          </button>
          <button onClick={onClose} className="p-1.5 rounded-lg bg-gray-800 hover:bg-red-900 transition-colors shrink-0" title="Salir">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Destination banner */}
        <div className={`px-4 py-1.5 flex items-center gap-2 text-xs ${
          isFuel ? 'bg-amber-900/60' : isPickup ? 'bg-orange-900/60' : 'bg-green-900/60'
        }`}>
          {isFuel ? <Fuel className="w-3 h-3 text-amber-300 shrink-0" /> : <Package className="w-3 h-3 text-white/60 shrink-0" />}
          <span className="font-semibold">
            {isFuel ? '⛽ Gasolinera' : isPickup ? '📦 Recoger' : '🚚 Entregar'} →&nbsp;
          </span>
          <span className="text-white/80 truncate">{currentStop?.order?.location?.address ?? ''}</span>
          {legSummary && (
            <span className="ml-auto shrink-0 text-white/60 flex items-center gap-1">
              <Clock className="w-3 h-3" />{legSummary.duration}
            </span>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-3">

          {/* Loading */}
          {loading && (
            <div className="flex flex-col items-center justify-center py-8 gap-3 text-gray-400">
              <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
              <span className="text-sm">Calculando ruta por calles…</span>
              {!mapReady && <span className="text-xs text-gray-600">Esperando el mapa…</span>}
            </div>
          )}

          {/* Error */}
          {!loading && error && (
            <div className="flex items-start gap-2 text-red-400 text-sm py-4">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <div>{error}</div>
                <button onClick={fetchLeg} className="mt-2 text-xs text-indigo-400 underline">Reintentar</button>
              </div>
            </div>
          )}

          {/* Current maneuver */}
          {!loading && !error && currentStep && (
            <>
              <div className="flex items-start gap-4 mb-3">
                <div className="w-14 h-14 rounded-2xl bg-indigo-600 flex items-center justify-center shrink-0">
                  <ManeuverIcon maneuver={currentStep.maneuver} />
                </div>
                <div className="flex-1">
                  <div className="text-base font-bold leading-snug">
                    {stripHtml(currentStep.instructions)}
                  </div>
                  <div className="text-indigo-300 text-sm mt-1">
                    {fmtDist(currentStep.distance.value)} · {fmtTime(currentStep.duration.value)}
                  </div>
                </div>
              </div>

              {/* Next step preview */}
              {nextStep && (
                <div className="flex items-center gap-3 bg-gray-800/60 rounded-xl px-3 py-2 mb-3">
                  <div className="w-8 h-8 rounded-xl bg-gray-700 flex items-center justify-center shrink-0">
                    <ManeuverIcon maneuver={nextStep.maneuver} className="w-4 h-4 text-gray-300" />
                  </div>
                  <div className="flex-1 text-xs text-gray-400">
                    <span className="font-semibold text-gray-200">Luego: </span>
                    {stripHtml(nextStep.instructions)}
                  </div>
                  <span className="text-[10px] text-gray-500 shrink-0">{fmtDist(nextStep.distance.value)}</span>
                </div>
              )}

              {/* All-steps mini-list */}
              {steps.length > 1 && (
                <div className="border border-gray-800 rounded-xl overflow-hidden">
                  <div className="px-3 py-1 bg-gray-800/40 text-[10px] text-gray-500 uppercase tracking-wide font-semibold">
                    Todos los pasos ({steps.length})
                  </div>
                  <div className="max-h-[90px] overflow-y-auto divide-y divide-gray-800/50">
                    {steps.map((s, i) => (
                      <button key={i} onClick={() => setStepIdx(i)}
                        className={`w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors ${
                          i === stepIdx ? 'bg-indigo-900/50' : 'hover:bg-gray-800/50'
                        }`}
                      >
                        <div className={`w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold shrink-0 ${
                          i < stepIdx ? 'bg-green-600 text-white' : i === stepIdx ? 'bg-indigo-500 text-white' : 'bg-gray-700 text-gray-400'
                        }`}>{i < stepIdx ? '✓' : i + 1}</div>
                        <span className={`flex-1 text-[11px] truncate ${i === stepIdx ? 'text-white font-semibold' : 'text-gray-400'}`}>
                          {stripHtml(s.instructions)}
                        </span>
                        <span className="text-[10px] text-gray-600 shrink-0">{fmtDist(s.distance.value)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* Empty */}
          {!loading && !error && steps.length === 0 && (
            <div className="text-center py-8 text-gray-500 text-sm">
              <MapPin className="w-6 h-6 mx-auto mb-2 opacity-30" />
              Sin instrucciones disponibles
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="px-4 pb-4 pt-2 border-t border-gray-800 space-y-2">
          {steps.length > 1 && (
            <div className="flex gap-2">
              <button onClick={retreatStep} disabled={stepIdx === 0}
                className="flex-1 flex items-center justify-center gap-1 py-2 rounded-xl bg-gray-800 hover:bg-gray-700 disabled:opacity-30 text-xs font-semibold transition-colors">
                <ChevronLeft className="w-3.5 h-3.5" /> Anterior
              </button>
              <button onClick={advanceStep} disabled={isLastStep}
                className="flex-1 flex items-center justify-center gap-1 py-2 rounded-xl bg-gray-800 hover:bg-gray-700 disabled:opacity-30 text-xs font-semibold transition-colors">
                Siguiente <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          <div className="flex gap-2">
            {!isLastStop && (
              <button onClick={() => { setCurrentStopIdx(i => i + 1); setSteps([]); setStepIdx(0); setLegSummary(null); setLoading(true); }}
                className="px-3 py-2.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-xs font-semibold text-gray-400 transition-colors">
                Saltar
              </button>
            )}
            <button onClick={handleArrived}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold text-sm transition-colors shadow-lg ${
                isLastStop  ? 'bg-green-600 hover:bg-green-500 text-white' :
                isFuel      ? 'bg-amber-600 hover:bg-amber-500 text-white' :
                isPickup    ? 'bg-orange-600 hover:bg-orange-500 text-white' :
                              'bg-indigo-600 hover:bg-indigo-500 text-white'
              }`}>
              <CheckCircle2 className="w-4 h-4" />
              {isLastStop ? '🏁 Ruta Completada' :
               isFuel     ? '⛽ Listo, continuar' :
               isPickup   ? '📦 Recogido, siguiente' :
                            '✅ Entregado, siguiente'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}