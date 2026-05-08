// src/components/logistics/GasStations.jsx
import { useState, useEffect, useMemo } from 'react';
import { Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Fuel, Loader2, AlertCircle, Star, DollarSign, MapPin, TrendingDown, AlertTriangle } from 'lucide-react';

const API_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8001';

// ============================================================
// Helper: distancia haversine (km)
// ============================================================
function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// ============================================================
// Safe price formatter — never crashes on undefined/null
// ============================================================
function safePrice(price) {
  const n = parseFloat(price);
  return isNaN(n) ? null : n;
}

function formatPrice(price) {
  const n = safePrice(price);
  return n !== null ? `$${n.toFixed(2)}` : '—';
}

// ============================================================
// Precios reales desde backend
// ============================================================
async function fetchRealPrices(stations) {
  if (!stations.length) return stations;

  try {
    const token = localStorage.getItem('token');
    if (!token) {
      return stations.map(s => ({ ...s, price: getRegionalPrice(s), price_source: 'simulated' }));
    }

    const response = await fetch(`${API_URL}/api/logistics/gas-stations/prices`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify(stations.map(s => ({ lat: s.lat, lng: s.lng, name: s.name, brand: s.brand })))
    });

    if (response.ok) {
      const data = await response.json();
      // Ensure every station has a valid numeric price
      return (data.stations || []).map(s => ({
        ...s,
        price: safePrice(s.price) ?? getRegionalPrice(s),
      }));
    }
  } catch (error) {
    console.error('Error fetching real prices:', error);
  }

  return stations.map(s => ({ ...s, price: getRegionalPrice(s), price_source: 'simulated' }));
}

function getRegionalPrice(station) {
  const lat = station.lat ?? 34;
  const lng = station.lng ?? -119;
  let base = 4.89; // California default
  if (lat > 32 && lat < 42 && lng < -114) base = 4.89;
  else if (lat > 25 && lat < 36 && lng < -93) base = 3.10;
  else if (lat > 24 && lat < 31 && lng < -80) base = 3.40;
  else if (lat > 40 && lat < 45 && lng < -71) base = 3.65;
  const variation = (Math.random() - 0.5) * 0.30;
  return parseFloat((base + variation).toFixed(2));
}

// ============================================================
// Análisis costo/beneficio
// ============================================================
export function analyzeBestFuelStop(stations, hq, routeWaypoints, vehicleMpg = 12) {
  // Only analyze stations with valid prices
  const validStations = stations.filter(s => safePrice(s.price) !== null);
  if (!validStations.length) return null;

  const routePoints = [hq, ...routeWaypoints].filter(p => p?.lat != null && p?.lng != null);
  if (routePoints.length < 2) return null;

  function routeDistance(points) {
    let dist = 0;
    for (let i = 1; i < points.length; i++) {
      dist += haversineDistance(points[i-1].lat, points[i-1].lng, points[i].lat, points[i].lng);
    }
    return dist;
  }

  const originalRouteDist = routeDistance(routePoints);
  const referencePrice = validStations.reduce((min, s) => s.price < min.price ? s : min, validStations[0]).price;
  const baseFuelCost = (originalRouteDist / (vehicleMpg * 1.60934)) * referencePrice;

  const withAnalysis = validStations.map(station => {
    let nearestIdx = 0;
    let minDist = Infinity;
    routePoints.forEach((pt, idx) => {
      const d = haversineDistance(station.lat, station.lng, pt.lat, pt.lng);
      if (d < minDist) { minDist = d; nearestIdx = idx; }
    });
    const detourKm = minDist * 2;
    const extraGallons = detourKm / (vehicleMpg * 1.60934);
    const detourCost = extraGallons * station.price;
    const totalFuelCostWithDetour = ((originalRouteDist + detourKm) / (vehicleMpg * 1.60934)) * station.price;
    const savings = baseFuelCost - totalFuelCostWithDetour;

    return {
      ...station,
      detourKm: detourKm.toFixed(1),
      extraGallons: extraGallons.toFixed(2),
      detourCost: detourCost.toFixed(2),
      totalCost: totalFuelCostWithDetour.toFixed(2),
      savings: savings.toFixed(2),
      isWorth: savings > 0,
    };
  });

  const best = withAnalysis.reduce(
    (best, s) => (Number(s.savings) > Number(best.savings) ? s : best),
    withAnalysis[0]
  );
  return { best, all: withAnalysis };
}

// ============================================================
// Hook principal
// ============================================================
export function useGasStations(hq, routeWaypoints, enabled = true, vehicleMpg = 12) {
  const [stations, setStations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!enabled || (!hq && routeWaypoints.length === 0)) {
      setStations([]);
      return;
    }

    let isMounted = true;
    setLoading(true);
    setError(null);

    const allPoints = [hq, ...routeWaypoints].filter(p => p?.lat != null && p?.lng != null);
    if (allPoints.length === 0) { setLoading(false); return; }

    let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
    for (const p of allPoints) {
      minLat = Math.min(minLat, p.lat); maxLat = Math.max(maxLat, p.lat);
      minLng = Math.min(minLng, p.lng); maxLng = Math.max(maxLng, p.lng);
    }
    const margin = 0.2;
    minLat -= margin; maxLat += margin; minLng -= margin; maxLng += margin;

    const overpassQuery = `[out:json][timeout:25];(node["amenity"="fuel"](${minLat},${minLng},${maxLat},${maxLng});way["amenity"="fuel"](${minLat},${minLng},${maxLat},${maxLng});relation["amenity"="fuel"](${minLat},${minLng},${maxLat},${maxLng}););out center;`;

    fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST', body: overpassQuery, headers: { 'Content-Type': 'text/plain' }
    })
      .then(res => { if (!res.ok) throw new Error(`Overpass ${res.status}`); return res.json(); })
      .then(async (data) => {
        if (!isMounted) return;
        const elements = data.elements || [];
        const rawStations = elements.map(el => {
          let lat, lng, name = 'Gas Station', brand = '';
          if (el.type === 'node') { lat = el.lat; lng = el.lon; }
          else if (el.type === 'way' || el.type === 'relation') { lat = el.center?.lat; lng = el.center?.lon; }
          if (!lat || !lng) return null;
          if (el.tags) { name = el.tags.name || el.tags.brand || name; brand = el.tags.brand || ''; }
          return { id: el.id, lat, lng, name: name.substring(0, 40), brand: brand.substring(0, 30) };
        }).filter(Boolean);

        const uniqueStations = [];
        for (const s of rawStations) {
          const dup = uniqueStations.find(ex => haversineDistance(ex.lat, ex.lng, s.lat, s.lng) < 0.05);
          if (!dup) uniqueStations.push(s);
        }

        const routePoints = [hq, ...routeWaypoints].filter(p => p?.lat != null);
        const stationsWithDistance = uniqueStations.map(station => {
          let minDist = Infinity;
          for (const point of routePoints) {
            const d = haversineDistance(station.lat, station.lng, point.lat, point.lng);
            if (d < minDist) minDist = d;
          }
          return { ...station, distanceToRouteKm: minDist };
        });

        stationsWithDistance.sort((a, b) => a.distanceToRouteKm - b.distanceToRouteKm);
        const stationsWithPrices = await fetchRealPrices(stationsWithDistance);

        if (isMounted) setStations(stationsWithPrices);
      })
      .catch(err => {
        console.error('Gas stations fetch error:', err);
        if (isMounted) {
          setError('No se pudieron cargar gasolineras. Usando datos de ejemplo.');
          setStations(getSampleStations());
        }
      })
      .finally(() => { if (isMounted) setLoading(false); });

    return () => { isMounted = false; };
  }, [hq, routeWaypoints, enabled]);

  const enrichedStations = useMemo(() => {
    if (!stations.length || !routeWaypoints.length) return stations;
    const analysis = analyzeBestFuelStop(stations, hq, routeWaypoints, vehicleMpg);
    if (!analysis) return stations;
    return analysis.all;
  }, [stations, hq, routeWaypoints, vehicleMpg]);

  const basePrice = useMemo(() => {
    const valid = enrichedStations.filter(s => safePrice(s.price) !== null);
    if (!valid.length) return null;
    return valid.reduce((min, s) => s.price < min.price ? s : min, valid[0]).price;
  }, [enrichedStations]);

  const cheapestIds = useMemo(() => {
    const routePoints = [hq, ...routeWaypoints].filter(p => p?.lat != null);
    const perPointCheapest = new Map();
    for (let idx = 0; idx < routePoints.length; idx++) {
      const point = routePoints[idx];
      const nearby = enrichedStations.filter(s =>
        safePrice(s.price) !== null &&
        haversineDistance(s.lat, s.lng, point.lat, point.lng) <= 3.0
      );
      if (!nearby.length) continue;
      const cheapestNearby = nearby.reduce((min, s) => (s.price < min.price ? s : min), nearby[0]);
      perPointCheapest.set(idx, cheapestNearby.id);
    }
    return new Set(perPointCheapest.values());
  }, [enrichedStations, hq, routeWaypoints]);

  const fuelAnalysis = useMemo(() => {
    if (!enrichedStations.length) return null;
    const valid = enrichedStations.filter(s => safePrice(s.price) !== null);
    if (!valid.length) return null;
    return {
      best: valid.reduce((best, s) => (Number(s.savings) > Number(best.savings) ? s : best), valid[0]),
      all: enrichedStations
    };
  }, [enrichedStations]);

  return { stations: enrichedStations, loading, error, basePrice, cheapestIds, fuelAnalysis };
}

function getSampleStations() {
  return [
    { id: 's1', lat: 34.2642, lng: -119.2137, name: 'Chevron - Telephone Rd', brand: 'Chevron', distanceToRouteKm: 0.2, price: 4.89 },
    { id: 's2', lat: 34.2710, lng: -119.2290, name: 'Shell - Main St', brand: 'Shell', distanceToRouteKm: 1.2, price: 4.75 },
    { id: 's3', lat: 34.2580, lng: -119.2150, name: '76 - Ventura Blvd', brand: '76', distanceToRouteKm: 0.8, price: 4.85 },
    { id: 's4', lat: 34.2805, lng: -119.2275, name: 'ARCO - Thompson Blvd', brand: 'ARCO', distanceToRouteKm: 2.1, price: 4.69 },
    { id: 's5', lat: 34.2500, lng: -119.2250, name: 'Mobil - Seaward Ave', brand: 'Mobil', distanceToRouteKm: 2.5, price: 4.92 },
  ];
}

// ============================================================
// Sidebar Component — mejorado
// ============================================================
export function GasStationsSidebar({ stations, loading, error, basePrice }) {
  const [expanded, setExpanded] = useState(false);
  const PREVIEW_COUNT = 3;

  if (loading) {
    return (
      <div className="px-4 py-3 border-b bg-amber-50 dark:bg-amber-950/40">
        <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 text-sm">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-xs">Cargando gasolineras...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-4 py-2 border-b bg-red-50 dark:bg-red-950/40">
        <div className="flex items-center gap-2 text-red-500 text-xs">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      </div>
    );
  }

  const validStations = stations.filter(s => safePrice(s.price) !== null);

  if (validStations.length === 0) {
    return (
      <div className="px-4 py-3 border-b">
        <p className="text-xs text-gray-400 text-center">Sin gasolineras cercanas.</p>
      </div>
    );
  }

  const sorted = [...validStations].sort((a, b) => a.price - b.price);
  const bestPrice = sorted[0]?.price;
  const displayed = expanded ? sorted : sorted.slice(0, PREVIEW_COUNT);

  // Find the one with best savings (worth stopping)
  const bestSavings = sorted.find(s => s.isWorth && Number(s.savings) > 0);

  return (
    <div className="border-b border-amber-200 dark:border-amber-800/50">
      {/* Header */}
      <div className="px-4 pt-3 pb-2">
        <div className="flex items-center gap-2">
          <Fuel className="w-3.5 h-3.5 text-amber-600" />
          <span className="text-[11px] font-bold text-amber-800 dark:text-amber-300 uppercase tracking-wider">
            Gasolineras
          </span>
          <span className="ml-1 text-[10px] bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300 px-1.5 py-0.5 rounded-full font-semibold">
            {validStations.length}
          </span>
          {basePrice && (
            <span className="ml-auto text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
              Mejor: {formatPrice(basePrice)}/gal
            </span>
          )}
        </div>

        {/* Smart recommendation banner */}
        {bestSavings && (
          <div className="mt-2 flex items-center gap-2 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 rounded-lg px-2.5 py-1.5">
            <TrendingDown className="w-3 h-3 text-emerald-600 shrink-0" />
            <span className="text-[10px] text-emerald-700 dark:text-emerald-400 leading-tight">
              <strong>{bestSavings.name.split(' ')[0]}</strong> te ahorra ${bestSavings.savings} — desvío {bestSavings.detourKm} km
            </span>
          </div>
        )}
      </div>

      {/* Station list */}
      <div className="px-3 pb-2 space-y-1">
        {displayed.map((station, idx) => {
          const isBest = station.price === bestPrice;
          const hasSavings = station.isWorth && Number(station.savings) > 0;
          return (
            <div
              key={station.id}
              className={`rounded-lg px-2.5 py-2 text-xs border transition-all ${
                isBest && idx === 0
                  ? 'bg-emerald-50 border-emerald-300 dark:bg-emerald-950/40 dark:border-emerald-700'
                  : 'bg-white border-gray-100 dark:bg-gray-800/50 dark:border-gray-700'
              }`}
            >
              <div className="flex items-center gap-2">
                {/* Rank */}
                <span className={`text-[9px] font-black w-4 text-center ${idx === 0 ? 'text-emerald-600' : 'text-gray-400'}`}>
                  #{idx + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-semibold text-gray-800 dark:text-gray-100 truncate text-[11px]">
                      {station.name}
                    </span>
                    {isBest && idx === 0 && (
                      <span className="shrink-0 bg-emerald-500 text-white text-[8px] font-bold px-1 py-0.5 rounded-full">
                        ★ TOP
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2.5 mt-0.5">
                    <span className="flex items-center gap-0.5 text-[10px] text-gray-500">
                      <MapPin className="w-2.5 h-2.5" />
                      {typeof station.distanceToRouteKm === 'number'
                        ? station.distanceToRouteKm.toFixed(1)
                        : '?'} km
                    </span>
                    {hasSavings && (
                      <span className="text-[10px] text-emerald-600 font-semibold">
                        💰 −${station.savings}
                      </span>
                    )}
                    {station.price_source && (
                      <span className="text-[9px] text-gray-400">
                        {station.price_source === 'real_time' ? '📡' : '📊'}
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className={`font-bold font-mono text-sm ${isBest && idx === 0 ? 'text-emerald-600' : 'text-gray-700 dark:text-gray-200'}`}>
                    {formatPrice(station.price)}
                  </div>
                  <div className="text-[9px] text-gray-400">/gal</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Show more / less */}
      {sorted.length > PREVIEW_COUNT && (
        <button
          onClick={() => setExpanded(v => !v)}
          className="w-full text-[10px] font-semibold text-amber-700 dark:text-amber-400 pb-2 hover:text-amber-900 transition-colors"
        >
          {expanded ? '▲ Ver menos' : `▼ Ver ${sorted.length - PREVIEW_COUNT} más`}
        </button>
      )}
    </div>
  );
}

// ============================================================
// Map Layer — unchanged but uses formatPrice safety
// ============================================================
function makeGasStationIcon(isCheapest = false) {
  const bgColor = isCheapest ? '#10b981' : '#f59e0b';
  const size = 28;
  return L.divIcon({
    className: 'vfl-gas-marker',
    html: `<div style="width:${size}px;height:${size}px;background:${bgColor};border-radius:50%;border:2px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;"><span style="color:white;font-size:14px;font-weight:800;">⛽</span></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
  });
}

export function GasStationsLayer({ stations, cheapestIds = new Set(), onSelectStation }) {
  if (!stations || stations.length === 0) return null;
  return (
    <>
      {stations.map(station => {
        const isCheapest = cheapestIds.has(station.id);
        return (
          <Marker
            key={station.id}
            position={[station.lat, station.lng]}
            icon={makeGasStationIcon(isCheapest)}
            zIndexOffset={isCheapest ? 600 : 400}
          >
            <Popup>
              <div className="min-w-[220px] p-2">
                <div className="font-bold text-sm flex items-center gap-1">
                  <Fuel className="w-3.5 h-3.5 text-amber-600" />
                  {station.name}
                </div>
                {station.brand && <div className="text-xs text-gray-500">{station.brand}</div>}
                <div className="text-xs mt-2 space-y-1">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Precio:</span>
                    <span className="font-mono font-semibold text-emerald-600">
                      {formatPrice(station.price)}/gal
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Distancia ruta:</span>
                    <span>
                      {typeof station.distanceToRouteKm === 'number'
                        ? station.distanceToRouteKm.toFixed(1)
                        : '?'} km
                    </span>
                  </div>
                  {station.detourKm && (
                    <div className="flex justify-between text-gray-500">
                      <span>Desvío:</span><span>{station.detourKm} km</span>
                    </div>
                  )}
                  {station.savings !== undefined && Number(station.savings) !== 0 && (
                    <div className={`flex justify-between font-semibold ${Number(station.savings) > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                      <span>Ahorro neto:</span><span>${station.savings}</span>
                    </div>
                  )}
                </div>
                {isCheapest && (
                  <div className="mt-2 text-[10px] bg-emerald-100 text-emerald-800 rounded px-2 py-1 text-center">
                    🌟 Mejor precio en esta zona
                  </div>
                )}
                {onSelectStation && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onSelectStation(station); }}
                    className="mt-3 w-full bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold py-2 rounded-lg transition-colors"
                  >
                    ⛽ Añadir a mi ruta
                  </button>
                )}
              </div>
            </Popup>
          </Marker>
        );
      })}
    </>
  );
}