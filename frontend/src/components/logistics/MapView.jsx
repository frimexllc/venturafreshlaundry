// src/components/logistics/MapView.jsx
import React, { useState, useEffect, useRef, useImperativeHandle, forwardRef, useCallback } from 'react';
import { Loader2 } from 'lucide-react';
import { ORDER_TYPE_LABELS, ORDER_STATUS_LABELS } from '../../utils/orders';
import { SEVERITY_COLORS, SEVERITY_LABELS } from '../../utils/traffic';

let googleMapsPromise = null;

function loadGoogleMaps(apiKey) {
  if (typeof window === 'undefined') return Promise.reject(new Error('No window'));
  if (window.google?.maps) return Promise.resolve(window.google);
  if (googleMapsPromise) return googleMapsPromise;

  googleMapsPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places,geometry`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve(window.google);
    script.onerror = () => reject(new Error('Failed to load Google Maps API'));
    document.head.appendChild(script);
  });

  return googleMapsPromise;
}

class MapManager {
  constructor(map) {
    this.map = map;
    this.markers = [];
    this.polylines = [];
    this.circles = [];
    this.infowindows = [];
  }

  clear() {
    this.markers.forEach(m => m.setMap(null));
    this.polylines.forEach(p => p.setMap(null));
    this.circles.forEach(c => c.setMap(null));
    this.infowindows.forEach(iw => iw.close());
    this.markers = [];
    this.polylines = [];
    this.circles = [];
    this.infowindows = [];
  }

  addMarker(opts) {
    const marker = new window.google.maps.Marker(opts);
    this.markers.push(marker);
    return marker;
  }

  addPolyline(opts) {
    const polyline = new window.google.maps.Polyline(opts);
    this.polylines.push(polyline);
    return polyline;
  }

  addCircle(opts) {
    const circle = new window.google.maps.Circle(opts);
    this.circles.push(circle);
    return circle;
  }
}

// ─── Geocoding helpers ────────────────────────────────────────────────────────

// HQ / backend fallback coordinates — orders that land here likely have no
// real coordinates stored in the DB and need to be geocoded from their address.
const FALLBACK_LAT = 34.264157;
const FALLBACK_LNG = -119.213715;
const COORD_THRESHOLD = 0.002; // ~200 m — anything closer than this to the fallback is treated as "not geocoded"

function needsGeocode(order) {
  const lat = order.location?.lat;
  const lng = order.location?.lng;
  if (!lat || !lng) return true;
  return (
    Math.abs(lat - FALLBACK_LAT) < COORD_THRESHOLD &&
    Math.abs(lng - FALLBACK_LNG) < COORD_THRESHOLD
  );
}

/**
 * Geocodes a single address with the Google Maps Geocoder.
 * Returns { lat, lng } or null on failure.
 */
function geocodeAddress(geocoder, address) {
  // Append a regional hint so Geocoder doesn't wander to other states
  const query = address.includes('CA') || address.includes('Ventura')
    ? address
    : `${address}, Ventura County, CA`;

  return new Promise((resolve) => {
    geocoder.geocode({ address: query }, (results, status) => {
      if (status === 'OK' && results?.[0]) {
        const loc = results[0].geometry.location;
        resolve({ lat: loc.lat(), lng: loc.lng() });
      } else {
        resolve(null);
      }
    });
  });
}

/**
 * Given a list of orders and a geocoder, returns a new list where every order
 * with missing / fallback coordinates has been geocoded from its address.
 * Results are cached in a module-level Map so repeated renders don't re-fire.
 */
const _geocodeCache = new Map();

async function enrichOrderCoordinates(orders, geocoder) {
  const results = await Promise.all(
    orders.map(async (order) => {
      if (!needsGeocode(order)) return order;

      const address = order.location?.address;
      if (!address) return order;

      // Use cache to avoid redundant API calls
      if (_geocodeCache.has(address)) {
        const cached = _geocodeCache.get(address);
        return cached
          ? { ...order, location: { ...order.location, ...cached } }
          : order;
      }

      const coords = await geocodeAddress(geocoder, address);
      _geocodeCache.set(address, coords); // cache even null to avoid retrying

      return coords
        ? { ...order, location: { ...order.location, ...coords } }
        : order;
    })
  );

  return results;
}

// ─── Component ────────────────────────────────────────────────────────────────

export const MapView = forwardRef(({
  orders = [],
  hqLocation,
  routeOrders = [],
  nearbyWashFold = [],
  trafficEvents = [],
  completedStops = new Set(),
  onOrderClick,
  gasStations = [],
  cheapestIds = new Set(),
  onSelectGasStation,
  navigationActive = false,
}, ref) => {
  const mapRef = useRef(null);
  const containerRef = useRef(null);
  const managerRef = useRef(null);
  const geocoderRef = useRef(null);

  const [isLoaded, setIsLoaded] = useState(false);
  const [loadError, setLoadError] = useState(null);

  // Geocoded copies of the orders/routeOrders props
  const [resolvedOrders, setResolvedOrders] = useState([]);
  const [resolvedRouteOrders, setResolvedRouteOrders] = useState([]);

  const apiKey = process.env.REACT_APP_GOOGLE_MAPS_API_KEY;

  useImperativeHandle(ref, () => mapRef.current, [isLoaded]);

  // ── 1. Load Google Maps ────────────────────────────────────────────────────
  useEffect(() => {
    if (!apiKey) {
      setLoadError('Falta REACT_APP_GOOGLE_MAPS_API_KEY en variables de entorno');
      return;
    }
    loadGoogleMaps(apiKey)
      .then(() => setIsLoaded(true))
      .catch(err => {
        console.error(err);
        setLoadError('Error al cargar Google Maps');
      });
  }, [apiKey]);

  // ── 2. Initialise map & geocoder ───────────────────────────────────────────
  useEffect(() => {
    if (!isLoaded || !containerRef.current || !hqLocation) return;

    const map = new window.google.maps.Map(containerRef.current, {
      center: { lat: hqLocation.lat, lng: hqLocation.lng },
      zoom: 12,
      zoomControl: true,
      streetViewControl: false,
      mapTypeControl: true,
      fullscreenControl: true,
      styles: [
        { featureType: 'poi.business', stylers: [{ visibility: 'off' }] },
        { featureType: 'transit', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
      ],
    });

    mapRef.current = map;
    managerRef.current = new MapManager(map);
    geocoderRef.current = new window.google.maps.Geocoder();

    return () => {
      managerRef.current?.clear();
      mapRef.current = null;
      geocoderRef.current = null;
    };
  }, [isLoaded, hqLocation]);

  // ── 3. Geocode orders whenever the props change ────────────────────────────
  useEffect(() => {
    if (!isLoaded || !geocoderRef.current) return;

    let cancelled = false;

    async function resolve() {
      const [enrichedOrders, enrichedRoute] = await Promise.all([
        enrichOrderCoordinates(orders, geocoderRef.current),
        enrichOrderCoordinates(routeOrders, geocoderRef.current),
      ]);

      if (!cancelled) {
        setResolvedOrders(enrichedOrders);
        setResolvedRouteOrders(enrichedRoute);
      }
    }

    resolve().catch(console.error);

    return () => { cancelled = true; };
  }, [isLoaded, orders, routeOrders]);

  // ── 4. Draw map elements ───────────────────────────────────────────────────
  const updateMap = useCallback(() => {
    if (!managerRef.current || !mapRef.current || !hqLocation) return;

    const manager = managerRef.current;
    manager.clear();

    const createInfoWindow = (content, position) => {
      const iw = new window.google.maps.InfoWindow({ content, position });
      manager.infowindows.push(iw);
      return iw;
    };

    const hqPos = { lat: hqLocation.lat, lng: hqLocation.lng };

    // ── Route polyline ──────────────────────────────────────────────────────
    if (resolvedRouteOrders.length > 0 && !navigationActive) {
      const directionsService = new window.google.maps.DirectionsService();
      const MAX_WAYPOINTS = 20;
      const allStops = resolvedRouteOrders
        .filter(o => o.location?.lat && !needsGeocode(o))
        .map(o => ({ lat: o.location.lat, lng: o.location.lng }));

      for (let i = 0; i < allStops.length; i += MAX_WAYPOINTS) {
        const segment = allStops.slice(i, i + MAX_WAYPOINTS);
        const origin = i === 0 ? hqPos : allStops[i - 1];
        const destination = segment[segment.length - 1];
        const waypoints = segment.slice(0, -1).map(pos => ({ location: pos, stopover: true }));

        directionsService.route(
          { origin, destination, waypoints, travelMode: window.google.maps.TravelMode.DRIVING, optimizeWaypoints: false },
          (result, status) => {
            if (status === 'OK' && result.routes[0]) {
              const path = result.routes[0].overview_path;
              manager.addPolyline({ path, geodesic: true, strokeColor: '#1e40af', strokeOpacity: 0.9, strokeWeight: 6, map: mapRef.current });
              manager.addPolyline({ path, geodesic: true, strokeColor: '#3b82f6', strokeOpacity: 0.8, strokeWeight: 4, map: mapRef.current });
            }
          }
        );
      }

      if (allStops.length > 0) {
        directionsService.route(
          { origin: allStops[allStops.length - 1], destination: hqPos, travelMode: window.google.maps.TravelMode.DRIVING },
          (result, status) => {
            if (status === 'OK' && result.routes[0]) {
              manager.addPolyline({
                path: result.routes[0].overview_path,
                geodesic: true, strokeColor: '#64748b', strokeOpacity: 0.6, strokeWeight: 3,
                strokeDashArray: [8, 4], map: mapRef.current,
              });
            }
          }
        );
      }
    }

    // ── Traffic events ──────────────────────────────────────────────────────
    trafficEvents.forEach(event => {
      if (!event.lat || !event.lng) return;

      manager.addCircle({
        center: { lat: event.lat, lng: event.lng },
        radius: event.severity === 'heavy' ? 1100 : event.severity === 'moderate' ? 700 : 400,
        fillColor: SEVERITY_COLORS[event.severity],
        fillOpacity: event.severity === 'heavy' ? 0.18 : 0.12,
        strokeColor: SEVERITY_COLORS[event.severity],
        strokeOpacity: 0.5, strokeWeight: 2, map: mapRef.current,
      });

      const tIcon = {
        url: `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='34' height='34' viewBox='0 0 34 34'%3E%3Ccircle cx='17' cy='17' r='16' fill='${encodeURIComponent(SEVERITY_COLORS[event.severity])}' stroke='white' stroke-width='2'/%3E%3Ctext x='17' y='23' text-anchor='middle' font-size='16' fill='white' font-weight='bold'%3ET%3C/text%3E%3C/svg%3E`,
        scaledSize: new window.google.maps.Size(34, 34),
      };
      const tm = manager.addMarker({ position: { lat: event.lat, lng: event.lng }, icon: tIcon, map: mapRef.current });
      const tiw = createInfoWindow(`
        <div style="min-width:200px">
          <span style="background:${SEVERITY_COLORS[event.severity]};color:white;border-radius:4px;padding:1px 6px;font-size:11px;font-weight:700">${SEVERITY_LABELS[event.severity]}</span>
          <div style="font-weight:700;font-size:14px;margin-top:4px">${event.road}</div>
          <div style="font-size:12px;color:#6b7280">${event.description}</div>
          <div style="font-size:12px;color:#ef4444;margin-top:6px">+${event.delayMinutes} min</div>
        </div>`, tm.getPosition());
      tm.addListener('click', () => tiw.open(mapRef.current));
    });

    // ── HQ marker ───────────────────────────────────────────────────────────
    const hqIcon = {
      url: `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='38' height='38' viewBox='0 0 38 38'%3E%3Ccircle cx='19' cy='19' r='18' fill='%231e293b' stroke='white' stroke-width='2'/%3E%3Ctext x='19' y='25' text-anchor='middle' font-size='14' fill='white' font-weight='bold'%3EHQ%3C/text%3E%3C/svg%3E`,
      scaledSize: new window.google.maps.Size(38, 38),
    };
    const hqM = manager.addMarker({ position: hqPos, icon: hqIcon, map: mapRef.current });
    const hqIw = createInfoWindow(`<div><b>Ventura Fresh Laundry HQ</b><br/>5722 Telephone Rd, Ventura</div>`, hqM.getPosition());
    hqM.addListener('click', () => hqIw.open(mapRef.current));

    // ── Gas stations ────────────────────────────────────────────────────────
    const validGasStations = gasStations.filter(s => typeof s.price === 'number' && !isNaN(s.price));
    validGasStations.forEach(station => {
      const isCheapest = cheapestIds.has(station.id);
      const priceStr = station.price.toFixed(2);

      const gIcon = {
        url: `data:image/svg+xml,${encodeURIComponent(`
          <svg width="38" height="50" viewBox="0 0 38 50" xmlns="http://www.w3.org/2000/svg">
            <circle cx="19" cy="19" r="17" fill="${isCheapest ? '#10b981' : '#f59e0b'}" stroke="white" stroke-width="3"/>
            <text x="19" y="25" text-anchor="middle" font-size="14" fill="white" font-weight="bold">⛽</text>
            <rect x="4" y="38" width="30" height="11" rx="3" fill="white" stroke="#333" stroke-width="1"/>
            <text x="19" y="47" text-anchor="middle" font-size="9" fill="#111" font-weight="bold">$${priceStr}</text>
          </svg>
        `)}`,
        scaledSize: new window.google.maps.Size(38, 50),
      };

      const gm = manager.addMarker({ position: { lat: station.lat, lng: station.lng }, icon: gIcon, map: mapRef.current, zIndex: 50 });

      const infoContent = `
        <div style="min-width:220px; font-family:system-ui">
          <b>${station.name}</b><br/>
          ${station.brand ? `<small>${station.brand}</small><br/>` : ''}
          <span style="color:${isCheapest ? '#10b981' : '#f59e0b'}; font-size:18px; font-weight:800">$${priceStr}/gal</span>
          ${onSelectGasStation ? `<button id="gas-${station.id}" style="margin-top:10px; width:100%; padding:8px; background:#2563eb; color:white; border:none; border-radius:6px; font-weight:600">Seleccionar esta gasolinera</button>` : ''}
        </div>`;

      const giw = createInfoWindow(infoContent, gm.getPosition());
      gm.addListener('click', () => giw.open(mapRef.current));

      if (onSelectGasStation) {
        window.google.maps.event.addListener(giw, 'domready', () => {
          const btn = document.getElementById(`gas-${station.id}`);
          if (btn) btn.onclick = () => onSelectGasStation(station);
        });
      }
    });

    // ── Nearby Wash & Fold opportunities ────────────────────────────────────
    nearbyWashFold.forEach(order => {
      if (!order.location?.lat) return;
      const wIcon = {
        url: `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='36' height='36' viewBox='0 0 36 36'%3E%3Ccircle cx='18' cy='18' r='17' fill='%237c3aed' stroke='white' stroke-width='2'/%3E%3Ctext x='18' y='25' text-anchor='middle' font-size='16' fill='white'%3EW%3C/text%3E%3C/svg%3E`,
        scaledSize: new window.google.maps.Size(36, 36),
      };
      const wm = manager.addMarker({ position: { lat: order.location.lat, lng: order.location.lng }, icon: wIcon, map: mapRef.current });
      const wiw = createInfoWindow(`
        <div style="min-width:170px">
          <span style="background:#7c3aed;color:white;border-radius:4px;padding:1px 6px;font-size:11px;font-weight:700">Oportunidad</span>
          <div style="font-weight:700;font-size:14px;margin-top:4px">${order.customer?.name}</div>
          <div style="font-size:12px;color:#6b7280">Wash & Fold</div>
          <div style="font-size:12px;margin-top:4px">${order.location.address}</div>
        </div>`, wm.getPosition());
      wm.addListener('click', () => wiw.open(mapRef.current));
    });

    // ── Order markers ───────────────────────────────────────────────────────
    const sequenceMap = new Map();
    resolvedRouteOrders.forEach((o, i) => sequenceMap.set(o.id, i + 1));

    resolvedOrders.forEach(order => {
      if (!order.location?.lat) return;

      // Skip orders that still have no useful coordinates (geocode failed)
      if (needsGeocode(order)) {
        console.warn(`MapView: no coordinates for order ${order.orderNumber} — "${order.location?.address}"`);
        return;
      }

      const role = order.status === 'pending' && order.type !== 'wash-fold' ? 'pickup'
        : order.status === 'ready' && order.type !== 'wash-fold' ? 'delivery'
        : 'processing';

      const seq = sequenceMap.get(order.id);
      const done = completedStops.has(order.id);
      const color = done ? '#10b981' : role === 'pickup' ? '#f97316' : role === 'delivery' ? '#2563eb' : '#94a3b8';
      const size = seq ? 28 : 22;
      const label = done ? '✓' : seq ? String(seq) : role === 'pickup' ? 'P' : 'D';

      const svg = `
        <svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}' viewBox='0 0 ${size} ${size}'>
          <circle cx='${size / 2}' cy='${size / 2}' r='${size / 2 - 2}' fill='${color}' stroke='white' stroke-width='2'/>
          <text x='${size / 2}' y='${size / 2 + 5}' text-anchor='middle' font-size='${size * 0.45}' fill='white' font-weight='bold'>${label}</text>
        </svg>`;

      const oIcon = {
        url: `data:image/svg+xml,${encodeURIComponent(svg)}`,
        scaledSize: new window.google.maps.Size(size, size),
      };

      const om = manager.addMarker({
        position: { lat: order.location.lat, lng: order.location.lng },
        icon: oIcon,
        map: mapRef.current,
        zIndex: seq ? 100 + (seq || 0) : 10,
      });

      const oiw = createInfoWindow(`
        <div style="min-width:200px;font-family:system-ui,sans-serif">
          ${seq ? `<span style="background:${color};color:white;border-radius:6px;padding:2px 8px;font-size:11px;font-weight:700">#${seq} ${role === 'pickup' ? 'Recogida' : 'Entrega'}</span>` : ''}
          <div style="font-weight:700;font-size:14px;margin-top:6px">${order.customer?.name}</div>
          <div style="font-size:12px;color:#6b7280">${ORDER_TYPE_LABELS[order.type] || order.type}</div>
          <div style="font-size:12px;color:#374151;margin-top:4px">${order.location.address}</div>
          ${order.schedule?.pickupTime ? `<div style="font-size:11px;color:#f97316;margin-top:4px">Pickup: ${order.schedule.pickupTime}</div>` : ''}
          <div style="font-size:11px;color:#9ca3af;margin-top:4px">${order.orderNumber}</div>
        </div>`, om.getPosition());

      om.addListener('click', () => {
        oiw.open(mapRef.current);
        onOrderClick?.(order);
      });
    });

    // ── Fit bounds ──────────────────────────────────────────────────────────
    if (!navigationActive) {
      const bounds = new window.google.maps.LatLngBounds();
      bounds.extend(hqPos);
      resolvedOrders.forEach(o => {
        if (o.location?.lat && !needsGeocode(o)) {
          bounds.extend({ lat: o.location.lat, lng: o.location.lng });
        }
      });
      // Include gas stations in bounds so markers are visible
      if (validGasStations.length > 0) {
        validGasStations.slice(0, 10).forEach(s => {
          bounds.extend({ lat: s.lat, lng: s.lng });
        });
      }
      if (!bounds.isEmpty()) {
        mapRef.current.fitBounds(bounds, { padding: 60 });
      }
    }
  }, [
    resolvedOrders, resolvedRouteOrders, hqLocation,
    nearbyWashFold, trafficEvents, completedStops,
    gasStations, cheapestIds, onSelectGasStation, navigationActive,
    onOrderClick,
  ]);

  // Redraw whenever resolved orders or other props change
  useEffect(() => {
    if (isLoaded && mapRef.current) updateMap();
  }, [isLoaded, updateMap]);

  if (loadError) return <div className="h-full flex items-center justify-center text-red-500 p-4">{loadError}</div>;
  if (!isLoaded) return (
    <div className="h-full flex items-center justify-center">
      <Loader2 className="animate-spin mr-2" /> Cargando Google Maps...
    </div>
  );

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
});