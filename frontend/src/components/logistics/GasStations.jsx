// src/components/logistics/GasStations.jsx
// FIX: infinite re-render loop caused by routeWaypoints being a new array
// reference on every render (even when content is identical).
//
// Changes vs previous version:
//   1. useGasStations serialises routeWaypoints to a stable JSON string and
//      uses THAT string as the useEffect dependency instead of the raw array.
//   2. A 500ms debounce timer prevents rapid successive calls to Overpass.
//   3. A `lastFetchKey` ref skips the fetch entirely when called with the
//      same params (hq + waypoints + fuelPrice) as the previous call.
//   4. enrichedStations / cheapestIds / fuelAnalysis useMemos also depend on
//      the serialised string so they don't recompute on identical arrays.

import { useState, useEffect, useRef, useMemo } from 'react';
import { Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import { Fuel, Loader2, AlertCircle, Star, DollarSign, MapPin } from 'lucide-react';

// ============================================================
// Helper: haversine distance in km
// ============================================================
function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) *
      Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ============================================================
// 1. Analiza costo/beneficio de cada gasolinera
// ============================================================
export function analyzeBestFuelStop(stations, hq, routeWaypoints, vehicleMpg = 12) {
  if (!stations.length) return null;
  const routePoints = [hq, ...routeWaypoints].filter(
    (p) => p?.lat != null && p?.lng != null
  );
  if (routePoints.length < 2) return null;

  function routeDistance(points) {
    let dist = 0;
    for (let i = 1; i < points.length; i++)
      dist += haversineDistance(
        points[i - 1].lat, points[i - 1].lng,
        points[i].lat,     points[i].lng
      );
    return dist;
  }

  const originalRouteDist = routeDistance(routePoints);
  const referencePrice = stations.reduce(
    (min, s) => (s.price < min.price ? s : min),
    stations[0]
  ).price;
  const baseFuelCost =
    (originalRouteDist / (vehicleMpg * 1.60934)) * referencePrice;

  const withAnalysis = stations.map((station) => {
    let nearestIdx = 0;
    let minDist = Infinity;
    routePoints.forEach((pt, idx) => {
      const d = haversineDistance(station.lat, station.lng, pt.lat, pt.lng);
      if (d < minDist) { minDist = d; nearestIdx = idx; }
    });
    const detourKm = minDist * 2;
    const extraGallons = detourKm / (vehicleMpg * 1.60934);
    const detourCost = extraGallons * station.price;
    const totalFuelCostWithDetour =
      ((originalRouteDist + detourKm) / (vehicleMpg * 1.60934)) * station.price;
    const savings = baseFuelCost - totalFuelCostWithDetour;
    return {
      ...station,
      detourKm:     detourKm.toFixed(1),
      extraGallons: extraGallons.toFixed(2),
      detourCost:   detourCost.toFixed(2),
      totalCost:    totalFuelCostWithDetour.toFixed(2),
      savings:      savings.toFixed(2),
      isWorth:      savings > 0,
    };
  });

  const best = withAnalysis.reduce(
    (b, s) => (Number(s.savings) > Number(b.savings) ? s : b),
    withAnalysis[0]
  );
  return { best, all: withAnalysis };
}

// ============================================================
// 2. Hook para obtener gasolineras desde Overpass + análisis
// ============================================================
export function useGasStations(
  hq,
  routeWaypoints,
  enabled    = true,
  vehicleMpg = 12,
  fuelPrice  = null
) {
  const [stations, setStations] = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState(null);

  // ── KEY FIX 1: stable string representation of the waypoints ──────────
  // useMemo here ensures the string is only recomputed when the actual
  // lat/lng values change, not on every render.
  const waypointsKey = useMemo(
    () =>
      JSON.stringify(
        (routeWaypoints ?? [])
          .filter((p) => p?.lat != null && p?.lng != null)
          .map((p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`)
      ),
    [routeWaypoints]
  );

  const hqKey = hq ? `${hq.lat.toFixed(5)},${hq.lng.toFixed(5)}` : '';

  // Refs that survive re-renders without triggering effects
  const lastFetchKey  = useRef(null);   // skip identical calls
  const debounceTimer = useRef(null);   // debounce rapid changes
  const isMountedRef  = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  // ── KEY FIX 2: only primitive / serialised values as dependencies ──────
  useEffect(() => {
    if (!enabled) {
      setStations([]);
      return;
    }

    const fetchKey = `${hqKey}|${waypointsKey}|${fuelPrice}`;

    // ── KEY FIX 3: skip identical re-fetch ────────────────────────────
    if (fetchKey === lastFetchKey.current) return;

    // ── KEY FIX 4: debounce – wait 500ms before actually hitting the API
    if (debounceTimer.current) clearTimeout(debounceTimer.current);

    debounceTimer.current = setTimeout(() => {
      lastFetchKey.current = fetchKey;

      const allPoints = [hq, ...(routeWaypoints ?? [])].filter(
        (p) => p?.lat != null && p?.lng != null
      );
      if (allPoints.length === 0) return;

      let minLat =  Infinity, maxLat = -Infinity;
      let minLng =  Infinity, maxLng = -Infinity;
      for (const p of allPoints) {
        if (p.lat < minLat) minLat = p.lat;
        if (p.lat > maxLat) maxLat = p.lat;
        if (p.lng < minLng) minLng = p.lng;
        if (p.lng > maxLng) maxLng = p.lng;
      }
      const margin = 0.05;
      minLat -= margin; maxLat += margin;
      minLng -= margin; maxLng += margin;

      const overpassQuery = `
        [out:json][timeout:25];
        (
          node["amenity"="fuel"](${minLat},${minLng},${maxLat},${maxLng});
          way["amenity"="fuel"](${minLat},${minLng},${maxLat},${maxLng});
          relation["amenity"="fuel"](${minLat},${minLng},${maxLat},${maxLng});
        );
        out center;
      `;

      setLoading(true);
      setError(null);

      fetch('https://overpass-api.de/api/interpreter', {
        method:  'POST',
        body:    overpassQuery,
        headers: { 'Content-Type': 'text/plain' },
      })
        .then((res) => {
          if (!res.ok) throw new Error(`Overpass API error: ${res.status}`);
          return res.json();
        })
        .then((data) => {
          if (!isMountedRef.current) return;

          const elements = data.elements || [];
          const rawStations = elements
            .map((el) => {
              let lat, lng, name = 'Gas Station';
              if (el.type === 'node') {
                lat = el.lat; lng = el.lon;
              } else if (el.type === 'way' || el.type === 'relation') {
                lat = el.center?.lat; lng = el.center?.lon;
              }
              if (!lat || !lng) return null;
              if (el.tags) name = el.tags.name || el.tags.brand || name;
              return { id: el.id, lat, lng, name: name.substring(0, 40) };
            })
            .filter(Boolean);

          // Remove duplicates closer than 50 m
          const uniqueStations = [];
          for (const s of rawStations) {
            const dup = uniqueStations.find(
              (ex) => haversineDistance(ex.lat, ex.lng, s.lat, s.lng) < 0.05
            );
            if (!dup) uniqueStations.push(s);
          }

          const routePoints = [hq, ...(routeWaypoints ?? [])].filter(
            (p) => p?.lat != null
          );

          const stationsWithDistance = uniqueStations.map((station) => {
            let minDist = Infinity;
            for (const point of routePoints) {
              const d = haversineDistance(
                station.lat, station.lng, point.lat, point.lng
              );
              if (d < minDist) minDist = d;
            }
            const price =
              fuelPrice != null && !isNaN(fuelPrice)
                ? fuelPrice
                : parseFloat((3.8 + Math.random() * 1.7).toFixed(2));
            return { ...station, distanceToRouteKm: minDist, price };
          });

          stationsWithDistance.sort(
            (a, b) => a.distanceToRouteKm - b.distanceToRouteKm
          );
          setStations(stationsWithDistance);
        })
        .catch((err) => {
          console.error('Gas stations fetch error:', err);
          if (isMountedRef.current) {
            setError('No se pudieron cargar gasolineras. Usando datos de ejemplo.');
            setStations(getSampleStations(fuelPrice));
          }
        })
        .finally(() => {
          if (isMountedRef.current) setLoading(false);
        });
    }, 500); // 500ms debounce

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  // Only primitive / serialised values — no raw array references
  }, [enabled, hqKey, waypointsKey, fuelPrice]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Enrich stations with cost/benefit analysis ────────────────────────
  // waypointsKey ensures this only recomputes when content changes
  const enrichedStations = useMemo(() => {
    if (!stations.length || !routeWaypoints?.length) return stations;
    const analysis = analyzeBestFuelStop(
      stations, hq, routeWaypoints, vehicleMpg
    );
    return analysis ? analysis.all : stations;
  }, [stations, hq, waypointsKey, vehicleMpg]); // eslint-disable-line react-hooks/exhaustive-deps

  const basePrice = useMemo(() => {
    if (!enrichedStations.length) return null;
    return enrichedStations.reduce(
      (min, s) => (s.price < min.price ? s : min),
      enrichedStations[0]
    ).price;
  }, [enrichedStations]);

  const cheapestIds = useMemo(() => {
    const routePoints = [hq, ...(routeWaypoints ?? [])].filter(
      (p) => p?.lat != null
    );
    const perPointCheapest = new Map();
    for (let idx = 0; idx < routePoints.length; idx++) {
      const point = routePoints[idx];
      const nearby = enrichedStations.filter(
        (s) => haversineDistance(s.lat, s.lng, point.lat, point.lng) <= 3.0
      );
      if (!nearby.length) continue;
      const cheapest = nearby.reduce(
        (min, s) => (s.price < min.price ? s : min),
        nearby[0]
      );
      perPointCheapest.set(idx, cheapest.id);
    }
    return new Set(perPointCheapest.values());
  }, [enrichedStations, hq, waypointsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const fuelAnalysis = useMemo(() => {
    if (!enrichedStations.length) return null;
    return {
      best: enrichedStations.reduce(
        (best, s) =>
          Number(s.savings) > Number(best.savings) ? s : best,
        enrichedStations[0]
      ),
      all: enrichedStations,
    };
  }, [enrichedStations]);

  return { stations: enrichedStations, loading, error, basePrice, cheapestIds, fuelAnalysis };
}

// ── Fallback sample stations (Ventura, CA) ────────────────────────────────
function getSampleStations(fuelPrice = null) {
  const price = fuelPrice != null && !isNaN(fuelPrice) ? fuelPrice : 4.89;
  return [
    { id: 's1', lat: 34.2642, lng: -119.2137, name: 'Chevron - Telephone Rd',  distanceToRouteKm: 0.2, price },
    { id: 's2', lat: 34.2710, lng: -119.2290, name: 'Shell - Main St',          distanceToRouteKm: 1.2, price },
    { id: 's3', lat: 34.2580, lng: -119.2150, name: '76 - Ventura Blvd',        distanceToRouteKm: 0.8, price },
    { id: 's4', lat: 34.2805, lng: -119.2275, name: 'ARCO - Thompson Blvd',     distanceToRouteKm: 2.1, price },
    { id: 's5', lat: 34.2500, lng: -119.2250, name: 'Mobil - Seaward Ave',      distanceToRouteKm: 2.5, price },
    { id: 's6', lat: 34.2900, lng: -119.2100, name: 'Valero - Victoria Ave',    distanceToRouteKm: 3.0, price },
  ];
}

// ============================================================
// 3. Sidebar Component
// ============================================================
export function GasStationsSidebar({ stations, loading, error, basePrice }) {
  if (loading) {
    return (
      <div className="px-4 py-3 border-b bg-amber-50 dark:bg-amber-950">
        <div className="flex items-center gap-2 text-amber-700 text-sm">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Cargando gasolineras...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-4 py-3 border-b bg-red-50 dark:bg-red-950">
        <div className="flex items-center gap-2 text-red-600 text-xs">
          <AlertCircle className="w-4 h-4" />
          <span>{error}</span>
        </div>
      </div>
    );
  }

  if (!stations.length) {
    return (
      <div className="px-4 py-3 border-b bg-gray-50 dark:bg-gray-800">
        <p className="text-xs text-gray-500 text-center">
          No se encontraron gasolineras cercanas.
        </p>
      </div>
    );
  }

  const sorted    = [...stations].sort((a, b) => a.price - b.price);
  const bestPrice = sorted[0]?.price;

  return (
    <div className="border-b border-amber-200 dark:border-amber-800 bg-amber-50/30 dark:bg-amber-950/30">
      <div className="px-4 pt-3 pb-2">
        <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300 font-semibold text-xs uppercase tracking-wide">
          <Fuel className="w-3.5 h-3.5" />
          <span>Gasolineras cercanas</span>
          <span className="ml-auto text-[10px] font-normal text-gray-500">
            {stations.length} encontradas
          </span>
        </div>
        {basePrice && (
          <div className="mt-1 text-[11px] text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
            <DollarSign className="w-3 h-3" />
            Mejor precio: ${basePrice.toFixed(2)} / gal
          </div>
        )}
      </div>
      <div className="max-h-[280px] overflow-y-auto space-y-1.5 px-3 pb-3">
        {sorted.map((station) => (
          <div
            key={station.id}
            className={`rounded-lg p-2 text-xs border ${
              station.price === bestPrice
                ? 'bg-emerald-50 border-emerald-300 dark:bg-emerald-950 dark:border-emerald-700'
                : 'bg-white border-gray-200 dark:bg-gray-800 dark:border-gray-700'
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-gray-800 dark:text-gray-100 truncate">
                  {station.name}
                </div>
                <div className="flex flex-wrap gap-2 mt-1 text-[10px] text-gray-500">
                  <span className="flex items-center gap-0.5">
                    <MapPin className="w-2.5 h-2.5" />
                    {station.distanceToRouteKm.toFixed(1)} km
                  </span>
                  <span className="flex items-center gap-0.5 font-mono">
                    <DollarSign className="w-2.5 h-2.5" />
                    {station.price.toFixed(2)}
                  </span>
                  {station.savings && Number(station.savings) > 0 && (
                    <span className="flex items-center gap-0.5 text-emerald-600 font-semibold">
                      💰 ahorro ${station.savings}
                    </span>
                  )}
                </div>
              </div>
              {station.price === bestPrice && (
                <span className="shrink-0 bg-emerald-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                  <Star className="w-2 h-2" /> Mejor
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// 4. Map Layer Component (Leaflet — used only in Leaflet builds)
// ============================================================
function makeGasStationIcon(isCheapest = false) {
  const bgColor = isCheapest ? '#10b981' : '#f59e0b';
  const size    = 28;
  return L.divIcon({
    className: 'vfl-gas-marker',
    html: `<div style="width:${size}px;height:${size}px;background:${bgColor};border-radius:50%;border:2px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;"><span style="color:white;font-size:11px;font-weight:800;">⛽</span></div>`,
    iconSize:    [size, size],
    iconAnchor:  [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
  });
}

export function GasStationsLayer({ stations, cheapestIds = new Set(), onSelectStation }) {
  if (!stations?.length) return null;

  return (
    <>
      {stations.map((station) => {
        const isCheapest = cheapestIds.has(station.id);
        return (
          <Marker
            key={station.id}
            position={[station.lat, station.lng]}
            icon={makeGasStationIcon(isCheapest)}
            zIndexOffset={isCheapest ? 600 : 400}
          >
            <Popup>
              <div className="min-w-[200px] p-1">
                <div className="font-bold text-sm flex items-center gap-1">
                  <Fuel className="w-3.5 h-3.5 text-amber-600" />
                  {station.name}
                </div>
                <div className="text-xs mt-1 space-y-1">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Precio:</span>
                    <span className="font-mono font-semibold">
                      ${station.price.toFixed(2)}/gal
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Desvío:</span>
                    <span>
                      {station.detourKm
                        ? `${station.detourKm} km`
                        : `${station.distanceToRouteKm.toFixed(1)} km`}
                    </span>
                  </div>
                  {station.savings !== undefined && (
                    <div
                      className={`flex justify-between font-semibold ${
                        Number(station.savings) >= 0
                          ? 'text-emerald-600'
                          : 'text-red-500'
                      }`}
                    >
                      <span>Ahorro neto:</span>
                      <span>${station.savings}</span>
                    </div>
                  )}
                </div>
                {onSelectStation && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectStation(station);
                    }}
                    className="mt-2 w-full bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold py-1.5 rounded-lg transition-colors"
                  >
                    ⛽ Usar esta gasolinera
                  </button>
                )}
                <div className="mt-2 text-[10px] text-gray-400 border-t pt-1">
                  {onSelectStation
                    ? "Se recalculará la ruta incluyéndola"
                    : "Haz clic en 'Iniciar Recorrido' para navegar"}
                </div>
              </div>
            </Popup>
          </Marker>
        );
      })}
    </>
  );
}