// src/components/logistics/InternalNavigation.jsx  v3
// Navegación paso a paso sobre el mapa Google Maps EMBEBIDO.
// Fixes: polling robusto, panTo reactivo, UI más compacta y clara.

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Navigation, ChevronRight, ChevronLeft, CheckCircle2,
  X, ArrowUp, ArrowUpLeft, ArrowUpRight, RotateCcw, RotateCw,
  Clock, MapPin, AlertTriangle, Fuel, Package, Loader2, Minimize2,
} from 'lucide-react';

// ── Helpers ──────────────────────────────────────────────────────────────

function ManeuverIcon({ maneuver, className = 'w-6 h-6' }) {
  const icons = {
    'turn-left':         <ArrowUpLeft  className={className} />,
    'turn-right':        <ArrowUpRight className={className} />,
    'turn-slight-left':  <ArrowUpLeft  className={className} />,
    'turn-slight-right': <ArrowUpRight className={className} />,
    'turn-sharp-left':   <RotateCcw   className={className} />,
    'turn-sharp-right':  <RotateCw    className={className} />,
    'uturn-left':        <RotateCcw   className={className} />,
    'uturn-right':       <RotateCw    className={className} />,
    'roundabout-left':   <RotateCcw   className={className} />,
    'roundabout-right':  <RotateCw    className={className} />,
    'straight':          <ArrowUp     className={className} />,
    'merge':             <ArrowUp     className={className} />,
    'fork-left':         <ArrowUpLeft className={className} />,
    'fork-right':        <ArrowUpRight className={className} />,
  };
  return icons[maneuver] ?? <ArrowUp className={className} />;
}

function stripHtml(html = '') {
  return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
}

function fmtDist(meters) {
  if (!meters && meters !== 0) return '—';
  const mi = meters / 1609.34;
  return mi < 0.1 ? `${Math.round(meters * 3.281)} ft` : `${mi.toFixed(1)} mi`;
}

function fmtTime(seconds) {
  if (!seconds && seconds !== 0) return '—';
  const m = Math.round(seconds / 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${m % 60}min`;
}

// ── Component ─────────────────────────────────────────────────────────────

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
  const pollRef     = useRef(null);

  // ── 1. Poll for google.maps.Map ──────────────────────────────────────
  useEffect(() => {
    let tries = 0;
    pollRef.current = setInterval(() => {
      tries++;
      // mapRef is { current: google.maps.Map } via useImperativeHandle
      const map = mapRef?.current;
      const isRealMap = map && window.google?.maps && typeof map.getCenter === 'function';
      if (isRealMap) {
        clearInterval(pollRef.current);
        setMapReady(true);
      }
      if (tries > 60) { // 12 s
        clearInterval(pollRef.current);
        setError('El mapa no está disponible. Cierra y vuelve a intentar.');
        setLoading(false);
      }
    }, 200);
    return () => clearInterval(pollRef.current);
  }, [mapRef]);

  // ── 2. Create DirectionsService + Renderer once map is ready ─────────
  useEffect(() => {
    if (!mapReady) return;
    const map = mapRef.current;
    if (!map) return;

    svcRef.current = new window.google.maps.DirectionsService();
    rendererRef.current = new window.google.maps.DirectionsRenderer({
      suppressMarkers: true,
      preserveViewport: false,
      polylineOptions: {
        strokeColor: '#6366f1',   // indigo
        strokeWeight: 8,
        strokeOpacity: 0.95,
        zIndex: 300,
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

  // ── 3. Fetch leg when stop changes ───────────────────────────────────
  const fetchLeg = useCallback(() => {
    if (!mapReady || !svcRef.current || !stops.length) return;
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
        destination: new window.google.maps.LatLng(destCoord.lat, destCoord.lng),
        travelMode:  window.google.maps.TravelMode.DRIVING,
        drivingOptions: {
          departureTime: new Date(),
          trafficModel:  window.google.maps.TrafficModel.BEST_GUESS,
        },
      },
      (result, status) => {
        setLoading(false);
        if (status !== 'OK' || !result?.routes?.[0]) {
          setError(`No se pudo calcular ruta (${status}).`);
          return;
        }
        if (rendererRef.current) rendererRef.current.setDirections(result);
        const leg = result.routes[0].legs[0];
        setSteps(leg.steps);
        setLegSummary({
          dist:     leg.distance?.text ?? '',
          duration: leg.duration_in_traffic?.text ?? leg.duration?.text ?? '',
          durationSec: leg.duration_in_traffic?.value ?? leg.duration?.value ?? 0,
        });
        if (mapRef.current && leg.steps[0]) {
          mapRef.current.panTo(leg.steps[0].start_location);
          mapRef.current.setZoom(17);
        }
      }
    );
  }, [mapReady, currentStopIdx, stops, hqLocation, mapRef]);

  useEffect(() => { fetchLeg(); }, [fetchLeg]);

  // ── 4. Pan map on step change ─────────────────────────────────────────
  useEffect(() => {
    if (!steps[stepIdx] || !mapRef?.current) return;
    mapRef.current.panTo(steps[stepIdx].start_location);
    mapRef.current.setZoom(17);
  }, [stepIdx, steps, mapRef]);

  // ── Derived ───────────────────────────────────────────────────────────
  const currentStop = stops[currentStopIdx];
  const currentStep = steps[stepIdx];
  const nextStep    = steps[stepIdx + 1];
  const isLastStop  = currentStopIdx === stops.length - 1;
  const isLastStep  = stepIdx === steps.length - 1;
  const isPickup    = currentStop?.order?.status === 'pending';
  const isFuel      = currentStop?.order?.type   === 'fuel-stop';

  function advanceStep() { if (stepIdx < steps.length - 1) setStepIdx(s => s + 1); }
  function retreatStep() { if (stepIdx > 0)                 setStepIdx(s => s - 1); }

  function handleArrived() {
    onStepComplete?.(currentStopIdx);
    if (isLastStop) { onClose?.(); return; }
    setCurrentStopIdx(i => i + 1);
    setSteps([]); setStepIdx(0); setLegSummary(null); setLoading(true);
  }

  function skipStop() {
    if (isLastStop) return;
    setCurrentStopIdx(i => i + 1);
    setSteps([]); setStepIdx(0); setLegSummary(null); setLoading(true);
  }

  const progressPct = Math.round((currentStopIdx / stops.length) * 100);

  // ── Collapsed mini-bar ────────────────────────────────────────────────
  if (collapsed) {
    return (
      <div className="fixed top-14 inset-x-0 z-[1300] px-3 pointer-events-none">
        <div
          onClick={() => setCollapsed(false)}
          className="flex items-center gap-3 bg-indigo-700/95 backdrop-blur text-white rounded-2xl shadow-2xl px-4 py-2.5 cursor-pointer pointer-events-auto max-w-2xl mx-auto border border-indigo-500/30"
        >
          <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center shrink-0">
            <Navigation className="w-3.5 h-3.5 animate-pulse" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] text-indigo-300">
              Parada {currentStopIdx + 1}/{stops.length} · {legSummary?.duration ?? '…'}
            </div>
            <div className="text-sm font-semibold truncate">
              {loading ? 'Calculando ruta…' : currentStep ? stripHtml(currentStep.instructions) : currentStop?.order?.customer?.name ?? 'En ruta'}
            </div>
          </div>
          <ChevronRight className="w-4 h-4 shrink-0 opacity-60" />
        </div>
      </div>
    );
  }

  // ── Arrival button color ──────────────────────────────────────────────
  const arrivalColor = isLastStop
    ? 'bg-green-600 hover:bg-green-500'
    : isFuel
    ? 'bg-amber-600 hover:bg-amber-500'
    : isPickup
    ? 'bg-orange-600 hover:bg-orange-500'
    : 'bg-indigo-600 hover:bg-indigo-500';

  const arrivalLabel = isLastStop  ? '🏁 Ruta completada'
    : isFuel   ? '⛽ Cargué, continuar'
    : isPickup ? '📦 Recogido, siguiente'
    : '✅ Entregado, siguiente';

  // ── Full panel ────────────────────────────────────────────────────────
  return (
    <div className="fixed bottom-0 inset-x-0 z-[1300] pointer-events-none" style={{ maxHeight: '52vh' }}>
      <div
        className="mx-auto max-w-lg bg-gray-950/98 backdrop-blur-md text-white rounded-t-3xl shadow-2xl border border-white/10 overflow-hidden flex flex-col pointer-events-auto"
        style={{ maxHeight: '52vh' }}
      >
        {/* Progress bar */}
        <div className="h-0.5 bg-gray-800">
          <div
            className="h-full bg-indigo-500 transition-all duration-500"
            style={{ width: `${progressPct}%` }}
          />
        </div>

        {/* Header */}
        <div className="flex items-center gap-2.5 px-4 pt-2.5 pb-2 border-b border-white/10">
          <div className="w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center shrink-0">
            <Navigation className="w-3.5 h-3.5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] text-gray-400 leading-none">
              Parada {currentStopIdx + 1} de {stops.length}
            </div>
            <div className="text-xs font-bold truncate leading-tight">
              {currentStop?.order?.customer?.name ?? 'Destino'}
            </div>
          </div>

          {/* Stop dots */}
          <div className="flex items-center gap-0.5 mx-1">
            {stops.slice(0, Math.min(stops.length, 8)).map((_, i) => (
              <div key={i} className={`rounded-full transition-all ${
                i < currentStopIdx  ? 'w-2 h-2 bg-green-400' :
                i === currentStopIdx? 'w-3 h-3 bg-indigo-400 ring-2 ring-indigo-400/30' :
                                      'w-1.5 h-1.5 bg-gray-700'
              }`} />
            ))}
            {stops.length > 8 && <span className="text-[9px] text-gray-500 ml-0.5">+{stops.length - 8}</span>}
          </div>

          <button
            onClick={() => setCollapsed(true)}
            className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-colors shrink-0"
            title="Minimizar"
          >
            <Minimize2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-white/10 hover:bg-red-900/60 transition-colors shrink-0"
            title="Salir de navegación"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Destination info bar */}
        <div className={`px-4 py-1.5 flex items-center gap-2 text-xs border-b border-white/5 ${
          isFuel ? 'bg-amber-900/30' : isPickup ? 'bg-orange-900/30' : 'bg-green-900/30'
        }`}>
          {isFuel
            ? <Fuel    className="w-3 h-3 text-amber-300 shrink-0" />
            : <Package className="w-3 h-3 text-white/50 shrink-0" />
          }
          <span className="font-semibold text-white/80">
            {isFuel ? '⛽ Gasolinera' : isPickup ? '📦 Recoger' : '🚚 Entregar'} →
          </span>
          <span className="text-white/60 truncate flex-1">
            {currentStop?.order?.location?.address ?? ''}
          </span>
          {legSummary && (
            <span className="flex items-center gap-1 text-white/50 shrink-0">
              <Clock className="w-2.5 h-2.5" />
              {legSummary.duration}
            </span>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-3 min-h-0">

          {/* Loading */}
          {loading && (
            <div className="flex flex-col items-center justify-center py-6 gap-2 text-gray-500">
              <Loader2 className="w-5 h-5 animate-spin text-indigo-400" />
              <span className="text-xs">
                {!mapReady ? 'Conectando al mapa…' : 'Calculando ruta…'}
              </span>
            </div>
          )}

          {/* Error */}
          {!loading && error && (
            <div className="flex items-start gap-2 text-red-400 text-xs py-3">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <p>{error}</p>
                <button onClick={fetchLeg} className="mt-1.5 text-indigo-400 underline">
                  Reintentar
                </button>
              </div>
            </div>
          )}

          {/* Current maneuver */}
          {!loading && !error && currentStep && (
            <div className="space-y-3">
              {/* Main instruction */}
              <div className="flex items-start gap-3">
                <div className="w-12 h-12 rounded-2xl bg-indigo-600 flex items-center justify-center shrink-0">
                  <ManeuverIcon maneuver={currentStep.maneuver} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold leading-snug">
                    {stripHtml(currentStep.instructions)}
                  </p>
                  <p className="text-indigo-300 text-xs mt-1">
                    {fmtDist(currentStep.distance?.value)} · {fmtTime(currentStep.duration?.value)}
                  </p>
                </div>
                {/* Step counter */}
                <span className="text-[10px] text-gray-600 shrink-0 mt-1">
                  {stepIdx + 1}/{steps.length}
                </span>
              </div>

              {/* Next step preview */}
              {nextStep && (
                <div className="flex items-center gap-2 bg-white/5 rounded-xl px-3 py-2">
                  <div className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
                    <ManeuverIcon maneuver={nextStep.maneuver} className="w-3.5 h-3.5 text-gray-300" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-[10px] text-gray-500">Luego: </span>
                    <span className="text-[11px] text-gray-300">
                      {stripHtml(nextStep.instructions)}
                    </span>
                  </div>
                  <span className="text-[10px] text-gray-600 shrink-0">
                    {fmtDist(nextStep.distance?.value)}
                  </span>
                </div>
              )}

              {/* Step list (compact) */}
              {steps.length > 1 && (
                <div className="border border-white/10 rounded-xl overflow-hidden">
                  <div className="px-3 py-1.5 bg-white/5 text-[10px] text-gray-500 uppercase tracking-wide">
                    Itinerario completo ({steps.length} pasos)
                  </div>
                  <div className="max-h-[80px] overflow-y-auto divide-y divide-white/5">
                    {steps.map((s, i) => (
                      <button
                        key={i}
                        onClick={() => setStepIdx(i)}
                        className={`w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors ${
                          i === stepIdx ? 'bg-indigo-900/50' : 'hover:bg-white/5'
                        }`}
                      >
                        <div className={`w-4 h-4 rounded-full text-[8px] font-bold flex items-center justify-center shrink-0 ${
                          i < stepIdx  ? 'bg-green-600 text-white' :
                          i === stepIdx? 'bg-indigo-500 text-white' :
                                         'bg-gray-700 text-gray-400'
                        }`}>
                          {i < stepIdx ? '✓' : i + 1}
                        </div>
                        <span className={`flex-1 text-[10px] truncate ${
                          i === stepIdx ? 'text-white font-semibold' : 'text-gray-500'
                        }`}>
                          {stripHtml(s.instructions)}
                        </span>
                        <span className="text-[9px] text-gray-700 shrink-0">
                          {fmtDist(s.distance?.value)}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Empty state */}
          {!loading && !error && steps.length === 0 && (
            <div className="text-center py-6 text-gray-600 text-xs">
              <MapPin className="w-5 h-5 mx-auto mb-1.5 opacity-30" />
              Sin instrucciones disponibles
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="px-4 pb-4 pt-2 border-t border-white/10 space-y-2 shrink-0">
          {/* Step prev/next */}
          {steps.length > 1 && (
            <div className="flex gap-2">
              <button
                onClick={retreatStep}
                disabled={stepIdx === 0}
                className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 disabled:opacity-30 text-xs font-semibold transition-colors"
              >
                <ChevronLeft className="w-3.5 h-3.5" /> Anterior
              </button>
              <button
                onClick={advanceStep}
                disabled={isLastStep}
                className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 disabled:opacity-30 text-xs font-semibold transition-colors"
              >
                Siguiente <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Arrive / Skip */}
          <div className="flex gap-2">
            {!isLastStop && (
              <button
                onClick={skipStop}
                className="px-3 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-semibold text-gray-400 transition-colors"
              >
                Saltar
              </button>
            )}
            <button
              onClick={handleArrived}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold text-sm transition-colors shadow-lg text-white ${arrivalColor}`}
            >
              <CheckCircle2 className="w-4 h-4" />
              {arrivalLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}