// src/components/logistics/GasStations.jsx
// FIXES:
//   1. makeGasStationIcon now defined (was missing → crash in GasStationsLayer)
//   2. fetchPricesWithFallback never throws → always returns prices (real or regional)
//   3. GasStationsSidebar shows all stations (regional prices shown with clear indicator)
//   4. UI dark-theme compatible, cleaner station cards

import { useState, useEffect, useMemo } from "react";
import { Marker, Popup } from "react-leaflet";
import L from "leaflet";
import {
  Fuel, Loader2, AlertCircle, MapPin, TrendingDown, Wifi, WifiOff,
} from "lucide-react";

const API_URL = process.env.REACT_APP_BACKEND_URL || "http://localhost:8001";

// ── California regional prices by sub-area (EIA weekly data baseline) ──────
const CA_REGIONAL_PRICES = [
  { minLat: 34.0, maxLat: 34.8, minLng: -120.5, maxLng: -118.8, base: 4.89, area: "Ventura/SB" },
  { minLat: 33.7, maxLat: 34.3, minLng: -118.7, maxLng: -117.9, base: 4.95, area: "Los Angeles" },
  { minLat: 33.4, maxLat: 33.9, minLng: -118.1, maxLng: -117.4, base: 4.91, area: "Orange County" },
  { minLat: 32.5, maxLat: 33.5, minLng: -117.5, maxLng: -116.5, base: 4.87, area: "San Diego" },
];

const BRAND_DELTA = {
  Costco: -0.40, "Sam's Club": -0.35, ARCO: -0.20, Valero: -0.10,
  "76": 0.00, Mobil: 0.08, Shell: 0.12, Chevron: 0.15, BP: 0.12,
};

function getRegionalPrice(lat, lng, brand = "") {
  const region = CA_REGIONAL_PRICES.find(
    (r) => lat >= r.minLat && lat <= r.maxLat && lng >= r.minLng && lng <= r.maxLng
  );
  const base = region ? region.base : 32 < lat && lat < 42 && lng < -114 ? 4.85 : 3.85;
  const delta = BRAND_DELTA[brand] ?? 0;
  return Math.round((base + delta) * 100) / 100;
}

// ── Haversine (km) ───────────────────────────────────────────────────────────
function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function safePrice(price) {
  const n = parseFloat(price);
  return isNaN(n) || n < 1 ? null : n;
}

function formatPrice(price) {
  const n = safePrice(price);
  return n !== null ? `$${n.toFixed(2)}` : "—";
}

// ── FIX: never throws, always returns enriched stations ─────────────────────
async function fetchPricesWithFallback(stations) {
  if (!stations.length) return [];

  const token = localStorage.getItem("token");

  // Try backend endpoint first
  if (token) {
    try {
      const response = await fetch(`${API_URL}/api/logistics/gas-stations/prices`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(
          stations.map((s) => ({ lat: s.lat, lng: s.lng, name: s.name, brand: s.brand }))
        ),
      });

      if (response.ok) {
        const data = await response.json();
        const backendStations = data.stations || [];

        // Merge backend prices into our station list
        return stations.map((station) => {
          const match = backendStations.find(
            (b) =>
              Math.abs((b.lat || 0) - station.lat) < 0.001 &&
              Math.abs((b.lng || 0) - station.lng) < 0.001
          );
          const price = match ? safePrice(match.price) : null;
          const priceSource = match?.price_source || "regional";

          return {
            ...station,
            price: price ?? getRegionalPrice(station.lat, station.lng, station.brand),
            price_source: price ? priceSource : "regional",
          };
        });
      }
    } catch (err) {
      console.warn("[GasStations] Backend unavailable, using regional prices:", err.message);
    }
  }

  // Full regional fallback (no token or request failed)
  return stations.map((s) => ({
    ...s,
    price: getRegionalPrice(s.lat, s.lng, s.brand),
    price_source: "regional",
  }));
}

// ── Cost/benefit analysis ────────────────────────────────────────────────────
export function analyzeBestFuelStop(stations, hq, routeWaypoints, vehicleMpg = 12) {
  const valid = stations.filter((s) => s.price !== null);
  if (!valid.length) return null;

  const routePoints = [hq, ...routeWaypoints].filter((p) => p?.lat != null);
  if (routePoints.length < 2) return null;

  function routeDist(pts) {
    let d = 0;
    for (let i = 1; i < pts.length; i++)
      d += haversineDistance(pts[i - 1].lat, pts[i - 1].lng, pts[i].lat, pts[i].lng);
    return d;
  }

  const origKm = routeDist(routePoints);
  const refPrice = valid.reduce((m, s) => (s.price < m.price ? s : m), valid[0]).price;
  const baseCost = (origKm / (vehicleMpg * 1.60934)) * refPrice;

  const withAnalysis = valid.map((station) => {
    let nearestDist = Infinity;
    routePoints.forEach((pt) => {
      const d = haversineDistance(station.lat, station.lng, pt.lat, pt.lng);
      if (d < nearestDist) nearestDist = d;
    });
    const detourKm = nearestDist * 2;
    const extraGallons = detourKm / (vehicleMpg * 1.60934);
    const totalCost = ((origKm + detourKm) / (vehicleMpg * 1.60934)) * station.price;
    const savings = baseCost - totalCost;
    return {
      ...station,
      detourKm: detourKm.toFixed(1),
      extraGallons: extraGallons.toFixed(2),
      detourCost: (extraGallons * station.price).toFixed(2),
      totalCost: totalCost.toFixed(2),
      savings: savings.toFixed(2),
      isWorth: savings > 0,
    };
  });

  const best = withAnalysis.reduce(
    (b, s) => (Number(s.savings) > Number(b.savings) ? s : b),
    withAnalysis[0]
  );
  return { best, all: withAnalysis };
}

// ── Map icon builder (was missing → fixed) ──────────────────────────────────
export function makeGasStationIcon(isCheapest = false) {
  const color = isCheapest ? "%2310b981" : "%23f59e0b";
  const size = isCheapest ? 36 : 30;
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size + 10}' viewBox='0 0 ${size} ${size + 10}'>
    <circle cx='${size / 2}' cy='${size / 2}' r='${size / 2 - 1}' fill='${color}' stroke='white' stroke-width='2'/>
    <text x='${size / 2}' y='${size / 2 + 5}' text-anchor='middle' font-size='14' fill='white'>⛽</text>
  </svg>`;
  return L.icon({
    iconUrl: `data:image/svg+xml,${encodeURIComponent(svg)}`,
    iconSize: [size, size + 10],
    iconAnchor: [size / 2, size + 10],
    popupAnchor: [0, -(size + 10)],
  });
}

// ── Main hook ────────────────────────────────────────────────────────────────
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

    const allPoints = [hq, ...routeWaypoints].filter((p) => p?.lat != null);
    if (!allPoints.length) { setLoading(false); return; }

    let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
    for (const p of allPoints) {
      minLat = Math.min(minLat, p.lat); maxLat = Math.max(maxLat, p.lat);
      minLng = Math.min(minLng, p.lng); maxLng = Math.max(maxLng, p.lng);
    }
    const margin = 0.2;
    minLat -= margin; maxLat += margin; minLng -= margin; maxLng += margin;

    const overpassQuery = `[out:json][timeout:25];(
      node["amenity"="fuel"](${minLat},${minLng},${maxLat},${maxLng});
      way["amenity"="fuel"](${minLat},${minLng},${maxLat},${maxLng});
    );out center;`;

    fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      body: overpassQuery,
      headers: { "Content-Type": "text/plain" },
    })
      .then((res) => {
        if (!res.ok) throw new Error(`Overpass ${res.status}`);
        return res.json();
      })
      .then(async (data) => {
        if (!isMounted) return;

        const elements = (data.elements || [])
          .map((el) => {
            const lat = el.type === "node" ? el.lat : el.center?.lat;
            const lng = el.type === "node" ? el.lon : el.center?.lon;
            if (!lat || !lng) return null;
            const name = el.tags?.name || el.tags?.brand || "Gas Station";
            const brand = el.tags?.brand || "";
            return { id: el.id, lat, lng, name: name.slice(0, 40), brand: brand.slice(0, 30) };
          })
          .filter(Boolean);

        // Deduplicate
        const unique = [];
        for (const s of elements) {
          if (!unique.find((u) => haversineDistance(u.lat, u.lng, s.lat, s.lng) < 0.05))
            unique.push(s);
        }

        // Add route distance
        const withDist = unique.map((station) => {
          const minD = Math.min(...allPoints.map((p) => haversineDistance(station.lat, station.lng, p.lat, p.lng)));
          return { ...station, distanceToRouteKm: minD };
        });
        withDist.sort((a, b) => a.distanceToRouteKm - b.distanceToRouteKm);

        // FIX: Use fallback-safe price fetcher (never throws)
        const enriched = await fetchPricesWithFallback(withDist.slice(0, 30));
        if (isMounted) setStations(enriched);
      })
      .catch((err) => {
        if (isMounted) {
          setError("No se pudieron cargar gasolineras. Verifica tu conexión.");
          setStations([]);
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
    if (!enrichedStations.length) return null;
    const valid = enrichedStations.filter((s) => s.price != null);
    return valid.length ? valid.reduce((m, s) => (s.price < m.price ? s : m), valid[0]).price : null;
  }, [enrichedStations]);

  const cheapestIds = useMemo(() => {
    const routePoints = [hq, ...routeWaypoints].filter((p) => p?.lat != null);
    const map = new Map();
    routePoints.forEach((pt, idx) => {
      const nearby = enrichedStations.filter(
        (s) => s.price != null && haversineDistance(s.lat, s.lng, pt.lat, pt.lng) <= 3.0
      );
      if (!nearby.length) return;
      const cheapest = nearby.reduce((m, s) => (s.price < m.price ? s : m), nearby[0]);
      map.set(idx, cheapest.id);
    });
    return new Set(map.values());
  }, [enrichedStations, hq, routeWaypoints]);

  const fuelAnalysis = useMemo(() => {
    if (!enrichedStations.length) return null;
    const valid = enrichedStations.filter((s) => s.price != null);
    if (!valid.length) return null;
    return { best: valid.reduce((b, s) => (Number(s.savings) > Number(b.savings) ? s : b), valid[0]), all: enrichedStations };
  }, [enrichedStations]);

  return { stations: enrichedStations, loading, error, basePrice, cheapestIds, fuelAnalysis };
}

// ── Sidebar Component ────────────────────────────────────────────────────────
export function GasStationsSidebar({ stations, loading, error, basePrice }) {
  const [expanded, setExpanded] = useState(false);
  const PREVIEW = 3;

  if (loading) {
    return (
      <div className="px-4 py-3 border-b border-slate-800">
        <div className="flex items-center gap-2 text-amber-500 text-xs">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          <span>Buscando gasolineras...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-4 py-2 border-b border-slate-800">
        <div className="flex items-center gap-2 text-red-400 text-xs">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">{error}</span>
        </div>
      </div>
    );
  }

  const validStations = stations.filter((s) => s.price != null);
  if (!validStations.length) {
    return (
      <div className="px-4 py-3 border-b border-slate-800">
        <p className="text-xs text-slate-600 text-center">Sin gasolineras cercanas</p>
      </div>
    );
  }

  const sorted = [...validStations].sort((a, b) => a.price - b.price);
  const bestPrice = sorted[0]?.price;
  const hasRealPrices = sorted.some((s) => s.price_source === "fuelapi");
  const bestSavings = sorted.find((s) => s.isWorth && Number(s.savings) > 0);
  const displayed = expanded ? sorted : sorted.slice(0, PREVIEW);

  return (
    <div className="border-b border-slate-800">
      {/* Header */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full px-4 py-3 flex items-center gap-2 hover:bg-white/5 transition-colors"
      >
        <Fuel className="w-3.5 h-3.5 text-amber-500 shrink-0" />
        <span className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider">
          Gasolineras
        </span>
        <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded-full">
          {validStations.length}
        </span>
        {basePrice != null && (
          <span className="ml-auto text-[11px] font-bold text-amber-400">
            {formatPrice(basePrice)}/gal
          </span>
        )}
        {!hasRealPrices && (
          <span className="text-[9px] text-slate-600 flex items-center gap-0.5">
            <WifiOff className="w-2.5 h-2.5" /> regional
          </span>
        )}
      </button>

      {/* Smart recommendation */}
      {bestSavings && (
        <div className="mx-4 mb-2 flex items-center gap-2 bg-emerald-950/40 border border-emerald-800/40 rounded-lg px-3 py-2">
          <TrendingDown className="w-3 h-3 text-emerald-400 shrink-0" />
          <span className="text-[10px] text-emerald-300">
            <strong>{bestSavings.name.split(" ")[0]}</strong> —{" "}
            ahorra ${bestSavings.savings} · desvío {bestSavings.detourKm} km
          </span>
        </div>
      )}

      {/* Station list */}
      <div className="px-3 pb-2 space-y-1">
        {displayed.map((station, idx) => {
          const isBest = station.price === bestPrice && idx === 0;
          const isReal = station.price_source === "fuelapi";
          return (
            <div
              key={station.id}
              className={`rounded-lg px-3 py-2 flex items-center gap-2 border transition-all ${
                isBest
                  ? "bg-emerald-950/30 border-emerald-800/40"
                  : "bg-slate-900/60 border-slate-800"
              }`}
            >
              <span className="text-[9px] font-mono text-slate-600 w-4 shrink-0">
                #{idx + 1}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-semibold text-slate-200 truncate">
                    {station.name}
                  </span>
                  {isBest && (
                    <span className="text-[8px] bg-emerald-600 text-white px-1 py-0.5 rounded shrink-0">
                      TOP
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[10px] text-slate-500 flex items-center gap-0.5">
                    <MapPin className="w-2.5 h-2.5" />
                    {typeof station.distanceToRouteKm === "number"
                      ? station.distanceToRouteKm.toFixed(1)
                      : "?"}{" "}
                    km
                  </span>
                  {station.isWorth && Number(station.savings) > 0 && (
                    <span className="text-[10px] text-emerald-400 font-medium">
                      −${station.savings}
                    </span>
                  )}
                  {isReal ? (
                    <span title="Precio en tiempo real" className="text-[9px] text-slate-600 flex items-center gap-0.5">
                      <Wifi className="w-2 h-2" />
                    </span>
                  ) : (
                    <span title="Precio regional estimado" className="text-[9px] text-slate-700">
                      ~est.
                    </span>
                  )}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className={`text-sm font-bold font-mono ${isBest ? "text-emerald-400" : "text-slate-200"}`}>
                  {formatPrice(station.price)}
                </div>
                <div className="text-[9px] text-slate-600">/gal</div>
              </div>
            </div>
          );
        })}
      </div>

      {sorted.length > PREVIEW && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="w-full text-[10px] font-medium text-slate-500 hover:text-slate-300 pb-2 transition-colors"
        >
          {expanded ? "▲ Menos" : `▼ Ver ${sorted.length - PREVIEW} más`}
        </button>
      )}
    </div>
  );
}

// ── Map layer (Leaflet — only if using Leaflet map) ──────────────────────────
export function GasStationsLayer({ stations, cheapestIds = new Set(), onSelectStation }) {
  const valid = stations.filter((s) => s.price != null);
  if (!valid.length) return null;

  return (
    <>
      {valid.map((station) => (
        <Marker
          key={station.id}
          position={[station.lat, station.lng]}
          icon={makeGasStationIcon(cheapestIds.has(station.id))}
          zIndexOffset={cheapestIds.has(station.id) ? 600 : 400}
        >
          <Popup>
            <div className="min-w-[200px] p-2 font-sans">
              <p className="font-bold text-sm">{station.name}</p>
              <p className="text-base font-extrabold text-amber-500 mt-1">
                {formatPrice(station.price)}/gal
              </p>
              <p className="text-xs text-gray-500 mt-1">
                {typeof station.distanceToRouteKm === "number"
                  ? `${station.distanceToRouteKm.toFixed(1)} km de la ruta`
                  : ""}
              </p>
              {station.savings != null && Number(station.savings) !== 0 && (
                <p className={`text-xs font-semibold mt-1 ${Number(station.savings) > 0 ? "text-emerald-600" : "text-red-500"}`}>
                  Ahorro neto: ${station.savings}
                </p>
              )}
              {onSelectStation && (
                <button
                  onClick={(e) => { e.stopPropagation(); onSelectStation(station); }}
                  className="mt-3 w-full bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold py-1.5 rounded transition-colors"
                >
                  ⛽ Añadir a ruta
                </button>
              )}
            </div>
          </Popup>
        </Marker>
      ))}
    </>
  );
}