// src/components/logistics/InternalNavigation.jsx
import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Navigation, ChevronRight, ChevronLeft, CheckCircle2,
  X, ArrowUp, ArrowUpLeft, ArrowUpRight, RotateCcw,
  RotateCw, Clock, AlertTriangle, Fuel, Package,
} from 'lucide-react';

function ManeuverIcon({ maneuver, className = 'w-8 h-8' }) {
  const iconMap = {
    'turn-left':          <ArrowUpLeft className={className} />,
    'turn-right':         <ArrowUpRight className={className} />,
    'turn-slight-left':   <ArrowUpLeft className={className} />,
    'turn-slight-right':  <ArrowUpRight className={className} />,
    'turn-sharp-left':    <RotateCcw className={className} />,
    'turn-sharp-right':   <RotateCw className={className} />,
    'uturn-left':         <RotateCcw className={className} />,
    'uturn-right':        <RotateCw className={className} />,
    'roundabout-left':    <RotateCcw className={className} />,
    'roundabout-right':   <RotateCw className={className} />,
    'straight':           <ArrowUp className={className} />,
    'ramp-left':          <ArrowUpLeft className={className} />,
    'ramp-right':         <ArrowUpRight className={className} />,
    'merge':              <ArrowUp className={className} />,
    'fork-left':          <ArrowUpLeft className={className} />,
    'fork-right':         <ArrowUpRight className={className} />,
  };
  return iconMap[maneuver] ?? <ArrowUp className={className} />;
}

function stripHtml(html = '') {
  return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
}

function fmtDistance(meters) {
  const miles = meters / 1609.34;
  return miles < 0.1 ? `${Math.round(meters)} ft` : `${miles.toFixed(1)} mi`;
}

function fmtDuration(seconds) {
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)}h ${m % 60}min`;
}

export function InternalNavigation({
  stops = [],
  hqLocation,
  mapRef,
  onClose,
  onStepComplete,
}) {
  const [currentStopIdx, setCurrentStopIdx] = useState(0);
  const [steps, setSteps] = useState([]);
  const [currentStepIdx, setCurrentStepIdx] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [legSummary, setLegSummary] = useState(null);
  const [collapsed, setCollapsed] = useState(false);

  const directionsRendererRef = useRef(null);
  const directionsServiceRef = useRef(null);

  useEffect(() => {
    if (!window.google?.maps || !mapRef?.current) return;
    if (!directionsServiceRef.current) {
      directionsServiceRef.current = new window.google.maps.DirectionsService();
    }
    if (!directionsRendererRef.current) {
      directionsRendererRef.current = new window.google.maps.DirectionsRenderer({
        suppressMarkers: false,
        polylineOptions: { strokeColor: '#6366f1', strokeWeight: 6, strokeOpacity: 0.9 },
      });
      directionsRendererRef.current.setMap(mapRef.current);
    }
    return () => {
      if (directionsRendererRef.current) directionsRendererRef.current.setMap(null);
    };
  }, [mapRef]);

  const fetchDirections = useCallback(() => {
    if (!directionsServiceRef.current || stops.length === 0) return;

    let origin, destination;
    if (currentStopIdx === 0) {
      origin = new window.google.maps.LatLng(hqLocation.lat, hqLocation.lng);
    } else {
      const prev = stops[currentStopIdx - 1].order.location;
      origin = new window.google.maps.LatLng(prev.lat, prev.lng);
    }
    const destCoords = stops[currentStopIdx].order.location;
    destination = new window.google.maps.LatLng(destCoords.lat, destCoords.lng);

    setLoading(true);
    setError(null);
    setCurrentStepIdx(0);
    directionsServiceRef.current.route(
      {
        origin,
        destination,
        travelMode: window.google.maps.TravelMode.DRIVING,
        drivingOptions: {
          departureTime: new Date(),
          trafficModel: window.google.maps.TrafficModel.BEST_GUESS,
        },
      },
      (result, status) => {
        setLoading(false);
        if (status === 'OK' && result.routes[0]) {
          directionsRendererRef.current?.setDirections(result);
          const leg = result.routes[0].legs[0];
          setSteps(leg.steps);
          setLegSummary({
            distance: leg.distance.text,
            duration: leg.duration_in_traffic?.text ?? leg.duration.text,
          });
          mapRef?.current?.panTo(leg.steps[0].start_location);
          mapRef?.current?.setZoom(16);
        } else {
          setError('No se pudo calcular la ruta. Verifica la dirección.');
        }
      }
    );
  }, [currentStopIdx, stops, hqLocation, mapRef]);

  useEffect(() => {
    fetchDirections();
  }, [fetchDirections]);

  useEffect(() => {
    if (!steps[currentStepIdx] || !mapRef?.current) return;
    mapRef.current.panTo(steps[currentStepIdx].start_location);
    mapRef.current.setZoom(17);
  }, [currentStepIdx, steps, mapRef]);

  const currentStop = stops[currentStopIdx];
  const currentStep = steps[currentStepIdx];
  const nextStep = steps[currentStepIdx + 1];
  const isLastStop = currentStopIdx === stops.length - 1;
  const isLastStep = currentStepIdx === steps.length - 1;
  const isPickup = currentStop?.order?.status === 'pending';
  const isFuel = currentStop?.order?.type === 'fuel-stop';

  function handleNextStep() { if (currentStepIdx < steps.length - 1) setCurrentStepIdx(i => i + 1); }
  function handlePrevStep() { if (currentStepIdx > 0) setCurrentStepIdx(i => i - 1); }
  function handleArrived() {
    onStepComplete?.(currentStopIdx);
    if (isLastStop) onClose?.();
    else setCurrentStopIdx(i => i + 1);
  }
  function handleSkipStop() { if (!isLastStop) setCurrentStopIdx(i => i + 1); }

  if (stops.length === 0) return null;

  if (collapsed) {
    return (
      <div className="fixed top-[56px] left-0 right-0 z-[1200] mx-auto max-w-2xl px-2 pointer-events-none">
        <div className="flex items-center gap-3 bg-indigo-700 text-white rounded-2xl shadow-2xl px-4 py-2.5 cursor-pointer pointer-events-auto" onClick={() => setCollapsed(false)}>
          <Navigation className="w-4 h-4 shrink-0 animate-pulse" />
          <span className="text-sm font-semibold truncate flex-1">{stripHtml(currentStep?.instructions)}</span>
          <span className="text-xs text-indigo-200 shrink-0">{legSummary?.duration}</span>
          <ChevronRight className="w-4 h-4 shrink-0" />
        </div>
      </div>
    );
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[1200] pointer-events-none" style={{ maxHeight: '55vh' }}>
      <div className="mx-auto max-w-2xl bg-gray-950 text-white rounded-t-3xl shadow-2xl overflow-hidden flex flex-col pointer-events-auto" style={{ maxHeight: '55vh' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b border-gray-800">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center"><Navigation className="w-3.5 h-3.5" /></div>
            <div>
              <div className="text-[10px] text-gray-400">Parada {currentStopIdx+1} de {stops.length}</div>
              <div className="text-xs font-bold truncate max-w-[160px]">{currentStop?.order?.customer?.name ?? 'Destino'}</div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {stops.map((_, i) => (
              <div key={i} className={`rounded-full transition-all ${i < currentStopIdx ? 'w-2 h-2 bg-green-500' : i === currentStopIdx ? 'w-3 h-3 bg-indigo-400' : 'w-2 h-2 bg-gray-700'}`} />
            ))}
          </div>
          <div className="flex gap-1">
            <button onClick={() => setCollapsed(true)} className="p-1.5 rounded-lg bg-gray-800 hover:bg-gray-700"><ChevronLeft className="w-3.5 h-3.5 rotate-90" /></button>
            <button onClick={onClose} className="p-1.5 rounded-lg bg-gray-800 hover:bg-red-900"><X className="w-3.5 h-3.5" /></button>
          </div>
        </div>

        {/* Destination banner */}
        <div className={`px-4 py-2 flex items-center gap-2 text-xs ${isFuel ? 'bg-amber-900/60' : isPickup ? 'bg-orange-900/60' : 'bg-green-900/60'}`}>
          {isFuel ? <Fuel className="w-3.5 h-3.5 text-amber-400" /> : <Package className="w-3.5 h-3.5 text-white/70" />}
          <span className="font-semibold">{isFuel ? '⛽ Gasolinera' : isPickup ? '📦 Recoger' : '🚚 Entregar'} → </span>
          <span className="text-white/80 truncate">{currentStop?.order?.location?.address}</span>
          {legSummary && <span className="ml-auto shrink-0 text-white/60 flex items-center gap-1"><Clock className="w-3 h-3" />{legSummary.duration}</span>}
        </div>

        {/* Main instruction area */}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {loading && <div className="flex items-center justify-center py-6 text-gray-400 text-sm gap-2"><Navigation className="w-4 h-4 animate-spin" /> Calculando ruta...</div>}
          {error && <div className="flex items-center gap-2 text-red-400 text-sm py-4"><AlertTriangle className="w-4 h-4" /> {error}</div>}
          {!loading && !error && currentStep && (
            <>
              <div className="flex items-start gap-4 mb-3">
                <div className="w-14 h-14 rounded-2xl bg-indigo-600 flex items-center justify-center">
                  <ManeuverIcon maneuver={currentStep.maneuver} className="w-7 h-7 text-white" />
                </div>
                <div className="flex-1">
                  <div className="text-base font-bold leading-snug">{stripHtml(currentStep.instructions)}</div>
                  <div className="text-indigo-300 text-sm mt-0.5">{fmtDistance(currentStep.distance.value)} · {fmtDuration(currentStep.duration.value)}</div>
                </div>
              </div>
              {nextStep && (
                <div className="flex items-center gap-3 bg-gray-800/60 rounded-xl px-3 py-2 mb-3">
                  <div className="w-8 h-8 rounded-xl bg-gray-700 flex items-center justify-center"><ManeuverIcon maneuver={nextStep.maneuver} className="w-4 h-4 text-gray-300" /></div>
                  <div className="flex-1 text-xs text-gray-400"><span className="font-semibold text-gray-200">Luego: </span>{stripHtml(nextStep.instructions)}</div>
                  <span className="text-[10px] text-gray-500">{fmtDistance(nextStep.distance.value)}</span>
                </div>
              )}
              {steps.length > 1 && (
                <div className="border border-gray-800 rounded-xl overflow-hidden">
                  <div className="px-3 py-1.5 bg-gray-800/40 text-[10px] text-gray-500 uppercase">Todos los pasos ({steps.length})</div>
                  <div className="max-h-[100px] overflow-y-auto divide-y divide-gray-800/60">
                    {steps.map((step, i) => (
                      <button key={i} onClick={() => setCurrentStepIdx(i)} className={`w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-gray-800/50 ${i === currentStepIdx ? 'bg-indigo-900/50' : ''}`}>
                        <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold ${i < currentStepIdx ? 'bg-green-600 text-white' : i === currentStepIdx ? 'bg-indigo-500 text-white' : 'bg-gray-700 text-gray-400'}`}>
                          {i < currentStepIdx ? '✓' : i+1}
                        </div>
                        <span className={`flex-1 text-[11px] truncate ${i === currentStepIdx ? 'text-white font-semibold' : 'text-gray-400'}`}>{stripHtml(step.instructions)}</span>
                        <span className="text-[10px] text-gray-600">{fmtDistance(step.distance.value)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Controls */}
        <div className="px-4 pb-4 pt-2 border-t border-gray-800 space-y-2">
          {steps.length > 1 && (
            <div className="flex gap-2">
              <button onClick={handlePrevStep} disabled={currentStepIdx === 0} className="flex-1 flex justify-center gap-1.5 py-2 rounded-xl bg-gray-800 hover:bg-gray-700 disabled:opacity-30 text-xs font-semibold"><ChevronLeft className="w-3.5 h-3.5" /> Anterior</button>
              <button onClick={handleNextStep} disabled={isLastStep} className="flex-1 flex justify-center gap-1.5 py-2 rounded-xl bg-gray-800 hover:bg-gray-700 disabled:opacity-30 text-xs font-semibold">Siguiente <ChevronRight className="w-3.5 h-3.5" /></button>
            </div>
          )}
          <div className="flex gap-2">
            {!isLastStop && <button onClick={handleSkipStop} className="px-3 py-2.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-xs font-semibold text-gray-400">Saltar</button>}
            <button onClick={handleArrived} className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold text-sm transition-colors shadow-lg ${isLastStop ? 'bg-green-600 hover:bg-green-500' : isFuel ? 'bg-amber-600 hover:bg-amber-500' : isPickup ? 'bg-orange-600 hover:bg-orange-500' : 'bg-indigo-600 hover:bg-indigo-500'} text-white`}>
              <CheckCircle2 className="w-4 h-4" />
              {isLastStop ? '🏁 Ruta Completada' : isFuel ? '⛽ Listo, continuar' : isPickup ? '📦 Recogido, siguiente' : '✅ Entregado, siguiente'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}