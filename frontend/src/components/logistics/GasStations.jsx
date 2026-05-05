// src/components/logistics/GasStations.jsx
import { useState, useEffect, useMemo } from 'react';
import { Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Fuel, Loader2, AlertCircle, Star, DollarSign, MapPin } from 'lucide-react';

// ============================================================
// Helper: haversine distance in km
// ============================================================
function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLng/2) * Math.sin(dLng/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

// ============================================================
// 1. Analiza costo/beneficio de cada gasolinera
// ============================================================
/**
 * Calcula el ahorro neto de cargar en cada gasolinera comparado con
 * seguir la ruta original sin desvío.
 * @param {Array} stations - Lista de estaciones con {lat, lng, price}
 * @param {Object} hq - {lat, lng} punto de partida
 * @param {Array} routeWaypoints - Array de {lat, lng} puntos de la ruta (excluyendo HQ)
 * @param {number} vehicleMpg - Millas por galón del vehículo
 * @returns {Object} { best, all } donde 'all' es cada estación con campos adicionales
 */
export function analyzeBestFuelStop(stations, hq, routeWaypoints, vehicleMpg = 12) {
  if (!stations.length) return null;
  const routePoints = [hq, ...routeWaypoints].filter(p => p?.lat != null && p?.lng != null);
  if (routePoints.length < 2) return null;

  // Distancia total de la ruta original (km)
  function routeDistance(points) {
    let dist = 0;
    for (let i = 1; i < points.length; i++) {
      dist += haversineDistance(points[i-1].lat, points[i-1].lng, points[i].lat, points[i].lng);
    }
    return dist;
  }

  const originalRouteDist = routeDistance(routePoints);
  // Precio de referencia: el más barato de todas las estaciones
  const referencePrice = stations.reduce((min, s) => s.price < min.price ? s : min, stations[0]).price;
  const baseFuelCost = (originalRouteDist / (vehicleMpg * 1.60934)) * referencePrice;

  const withAnalysis = stations.map(station => {
    // Encontrar punto de ruta más cercano a la estación
    let nearestIdx = 0;
    let minDist = Infinity;
    routePoints.forEach((pt, idx) => {
      const d = haversineDistance(station.lat, station.lng, pt.lat, pt.lng);
      if (d < minDist) { minDist = d; nearestIdx = idx; }
    });
    // Desvío: ida y vuelta al punto más cercano
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

  const best = withAnalysis.reduce((best, s) => (Number(s.savings) > Number(best.savings) ? s : best), withAnalysis[0]);
  return { best, all: withAnalysis };
}

// ============================================================
// 2. Hook para obtener gasolineras desde Overpass + análisis
// ============================================================
export function useGasStations(hq, routeWaypoints, enabled = true, vehicleMpg = 12, fuelPrice = null) {
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
    if (allPoints.length === 0) {
      setLoading(false);
      return;
    }

    let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
    for (const p of allPoints) {
      minLat = Math.min(minLat, p.lat);
      maxLat = Math.max(maxLat, p.lat);
      minLng = Math.min(minLng, p.lng);
      maxLng = Math.max(maxLng, p.lng);
    }
    const margin = 0.05; // ~5.5 km — focused search area
    minLat -= margin;
    maxLat += margin;
    minLng -= margin;
    maxLng += margin;

    const overpassQuery = `
      [out:json][timeout:25];
      (
        node["amenity"="fuel"](${minLat},${minLng},${maxLat},${maxLng});
        way["amenity"="fuel"](${minLat},${minLng},${maxLat},${maxLng});
        relation["amenity"="fuel"](${minLat},${minLng},${maxLat},${maxLng});
      );
      out center;
    `;
    const overpassUrl = 'https://overpass-api.de/api/interpreter';

    fetch(overpassUrl, { method: 'POST', body: overpassQuery, headers: { 'Content-Type': 'text/plain' } })
      .then(res => {
        if (!res.ok) throw new Error(`Overpass API error: ${res.status}`);
        return res.json();
      })
      .then(data => {
        if (!isMounted) return;
        const elements = data.elements || [];
        const rawStations = elements.map(el => {
          let lat, lng, name = 'Gas Station';
          if (el.type === 'node') { lat = el.lat; lng = el.lon; }
          else if (el.type === 'way' || el.type === 'relation') { lat = el.center?.lat; lng = el.center?.lon; }
          if (!lat || !lng) return null;
          if (el.tags) name = el.tags.name || el.tags.brand || name;
          return { id: el.id, lat, lng, name: name.substring(0, 40) };
        }).filter(s => s !== null);

        // Eliminar duplicados cercanos (< 50m)
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
          // Usar precio real si se proporciona; si no, precio simulado (entre $3.80 y $5.50)
          let price;
          if (fuelPrice !== null && !isNaN(fuelPrice)) {
            price = fuelPrice;
          } else {
            price = 3.80 + Math.random() * 1.70;
          }
          return {
            ...station,
            distanceToRouteKm: minDist,
            price: parseFloat(price.toFixed(2)),
          };
        });

        stationsWithDistance.sort((a, b) => a.distanceToRouteKm - b.distanceToRouteKm);
        setStations(stationsWithDistance);
      })
      .catch(err => {
        console.error('Gas stations fetch error:', err);
        if (isMounted) {
          setError('No se pudieron cargar gasolineras. Usando datos de ejemplo.');
          setStations(getSampleStations(fuelPrice));
        }
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => { isMounted = false; };
  }, [hq, routeWaypoints, enabled, fuelPrice]);

  // Enriquecer estaciones con el análisis de costo/beneficio
  const enrichedStations = useMemo(() => {
    if (!stations.length || !routeWaypoints.length) return stations;
    const analysis = analyzeBestFuelStop(stations, hq, routeWaypoints, vehicleMpg);
    if (!analysis) return stations;
    // Reemplazar cada estación con su versión enriquecida (con savings, detourCost, etc.)
    return analysis.all;
  }, [stations, hq, routeWaypoints, vehicleMpg]);

  // Calcular el mejor precio base (más barato entre todas)
  const basePrice = useMemo(() => {
    if (!enrichedStations.length) return null;
    return enrichedStations.reduce((min, s) => s.price < min.price ? s : min, enrichedStations[0]).price;
  }, [enrichedStations]);

  // IDs de estaciones más baratas cerca de cada waypoint
  const cheapestIds = useMemo(() => {
    const routePoints = [hq, ...routeWaypoints].filter(p => p?.lat != null);
    const perPointCheapest = new Map();
    for (let idx = 0; idx < routePoints.length; idx++) {
      const point = routePoints[idx];
      const nearby = enrichedStations.filter(s => haversineDistance(s.lat, s.lng, point.lat, point.lng) <= 3.0);
      if (nearby.length === 0) continue;
      const cheapestNearby = nearby.reduce((min, s) => s.price < min.price ? s : min, nearby[0]);
      perPointCheapest.set(idx, cheapestNearby.id);
    }
    return new Set(perPointCheapest.values());
  }, [enrichedStations, hq, routeWaypoints]);

  // Análisis completo (para TIM, etc.)
  const fuelAnalysis = useMemo(() => {
    if (!enrichedStations.length) return null;
    return { best: enrichedStations.reduce((best, s) => (Number(s.savings) > Number(best.savings) ? s : best), enrichedStations[0]), all: enrichedStations };
  }, [enrichedStations]);

  return { stations: enrichedStations, loading, error, basePrice, cheapestIds, fuelAnalysis };
}

// Fallback de estaciones (Ventura, CA) con precios coherentes
function getSampleStations(fuelPrice = null) {
  const price = (fuelPrice !== null && !isNaN(fuelPrice)) ? fuelPrice : 4.89;
  return [
    { id: 's1', lat: 34.2642, lng: -119.2137, name: 'Chevron - Telephone Rd', distanceToRouteKm: 0.2, price },
    { id: 's2', lat: 34.2710, lng: -119.2290, name: 'Shell - Main St', distanceToRouteKm: 1.2, price },
    { id: 's3', lat: 34.2580, lng: -119.2150, name: '76 - Ventura Blvd', distanceToRouteKm: 0.8, price },
    { id: 's4', lat: 34.2805, lng: -119.2275, name: 'ARCO - Thompson Blvd', distanceToRouteKm: 2.1, price },
    { id: 's5', lat: 34.2500, lng: -119.2250, name: 'Mobil - Seaward Ave', distanceToRouteKm: 2.5, price },
    { id: 's6', lat: 34.2900, lng: -119.2100, name: 'Valero - Victoria Ave', distanceToRouteKm: 3.0, price },
  ];
}

// ============================================================
// 3. Sidebar Component (displays list of stations with savings)
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

  if (stations.length === 0) {
    return (
      <div className="px-4 py-3 border-b bg-gray-50 dark:bg-gray-800">
        <p className="text-xs text-gray-500 text-center">No se encontraron gasolineras cercanas.</p>
      </div>
    );
  }

  const sorted = [...stations].sort((a, b) => a.price - b.price);
  const bestPrice = sorted[0]?.price;

  return (
    <div className="border-b border-amber-200 dark:border-amber-800 bg-amber-50/30 dark:bg-amber-950/30">
      <div className="px-4 pt-3 pb-2">
        <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300 font-semibold text-xs uppercase tracking-wide">
          <Fuel className="w-3.5 h-3.5" />
          <span>Gasolineras cercanas</span>
          <span className="ml-auto text-[10px] font-normal text-gray-500">{stations.length} encontradas</span>
        </div>
        {basePrice && (
          <div className="mt-1 text-[11px] text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
            <DollarSign className="w-3 h-3" />
            Mejor precio: ${basePrice.toFixed(2)} / gal
          </div>
        )}
      </div>
      <div className="max-h-[280px] overflow-y-auto space-y-1.5 px-3 pb-3">
        {sorted.map(station => (
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
                <div className="font-semibold text-gray-800 dark:text-gray-100 truncate">{station.name}</div>
                <div className="flex flex-wrap gap-2 mt-1 text-[10px] text-gray-500">
                  <span className="flex items-center gap-0.5"><MapPin className="w-2.5 h-2.5" />{station.distanceToRouteKm.toFixed(1)} km</span>
                  <span className="flex items-center gap-0.5 font-mono"><DollarSign className="w-2.5 h-2.5" />{station.price.toFixed(2)}</span>
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
// 4. Map Layer Component (con botón para seleccionar)
// ============================================================
function makeGasStationIcon(isCheapest = false) {
  const bgColor = isCheapest ? '#10b981' : '#f59e0b';
  const size = 28;
  return L.divIcon({
    className: 'vfl-gas-marker',
    html: `<div style="width:${size}px;height:${size}px;background:${bgColor};border-radius:50%;border:2px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;"><span style="color:white;font-size:11px;font-weight:800;">⛽</span></div>`,
    iconSize: [size, size],
    iconAnchor: [size/2, size/2],
    popupAnchor: [0, -size/2],
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
              <div className="min-w-[200px] p-1">
                <div className="font-bold text-sm flex items-center gap-1">
                  <Fuel className="w-3.5 h-3.5 text-amber-600" />
                  {station.name}
                </div>
                <div className="text-xs mt-1 space-y-1">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Precio:</span>
                    <span className="font-mono font-semibold">${station.price.toFixed(2)}/gal</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Desvío:</span>
                    <span>{station.detourKm ? `${station.detourKm} km` : `${station.distanceToRouteKm.toFixed(1)} km`}</span>
                  </div>
                  {station.savings !== undefined && (
                    <div className={`flex justify-between font-semibold ${Number(station.savings) >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
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
                  {onSelectStation ? "Se recalculará la ruta incluyéndola" : "Haz clic en 'Iniciar Recorrido' para navegar"}
                </div>
              </div>
            </Popup>
          </Marker>
        );
      })}
    </>
  );
}