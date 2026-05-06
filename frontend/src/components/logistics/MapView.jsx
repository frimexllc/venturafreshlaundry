// src/components/logistics/MapView.jsx
// KEY CHANGE: now a forwardRef — parent can pass a ref and get the live
// google.maps.Map instance, which InternalNavigation needs to draw
// DirectionsRenderer on the same map without opening a new tab.

import React, { useState, useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { Loader2 } from 'lucide-react';
import { ORDER_TYPE_LABELS, ORDER_STATUS_LABELS } from '../../utils/orders';
import { SEVERITY_COLORS, SEVERITY_LABELS } from '../../utils/traffic';

let googleMapsPromise = null;

function loadGoogleMaps(apiKey) {
  if (typeof window === 'undefined') return Promise.reject(new Error('No window'));
  if (window.google && window.google.maps) return Promise.resolve(window.google);
  if (googleMapsPromise) return googleMapsPromise;
  googleMapsPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
    script.async = true;
    script.onload  = () => resolve(window.google);
    script.onerror = () => reject(new Error('Failed to load Google Maps'));
    document.head.appendChild(script);
  });
  return googleMapsPromise;
}

class MapManager {
  constructor(map) {
    this.map = map;
    this.markers    = [];
    this.polylines  = [];
    this.circles    = [];
    this.infowindows = [];
  }
  clear() {
    this.markers.forEach(m  => m.setMap(null));
    this.polylines.forEach(p => p.setMap(null));
    this.circles.forEach(c  => c.setMap(null));
    this.infowindows.forEach(iw => iw.close());
    this.markers = []; this.polylines = []; this.circles = []; this.infowindows = [];
  }
  addMarker(opts)   { const m = new window.google.maps.Marker(opts);   this.markers.push(m);   return m; }
  addPolyline(opts) { const p = new window.google.maps.Polyline(opts); this.polylines.push(p); return p; }
  addCircle(opts)   { const c = new window.google.maps.Circle(opts);   this.circles.push(c);   return c; }
}

export const MapView = forwardRef(function MapView(
  {
    orders,
    hqLocation,
    routeOrders,
    nearbyWashFold    = [],
    trafficEvents     = [],
    completedStops    = new Set(),
    onOrderClick,
    gasStations       = [],
    cheapestIds       = new Set(),
    onSelectGasStation,
    // When true the blue route polyline is hidden so InternalNavigation's
    // DirectionsRenderer can render the turn-by-turn path instead.
    navigationActive  = false,
  },
  ref
) {
  const mapRef       = useRef(null);
  const containerRef = useRef(null);
  const [isLoaded,  setIsLoaded]  = useState(false);
  const [loadError, setLoadError] = useState(null);
  const managerRef  = useRef(null);
  const apiKey = process.env.REACT_APP_GOOGLE_MAPS_API_KEY;

  // Expose the raw google.maps.Map instance upward
  // Return an object with .current so InternalNavigation can do mapRef.current
  // and always get the live google.maps.Map, even after re-renders.
  useImperativeHandle(ref, () => ({ get current() { return mapRef.current; } }), []);

  useEffect(() => {
    if (!apiKey) { setLoadError('Falta API Key de Google Maps'); return; }
    loadGoogleMaps(apiKey).then(() => setIsLoaded(true)).catch(err => setLoadError(err));
  }, [apiKey]);

  useEffect(() => {
    if (!isLoaded || !containerRef.current) return;
    const map = new window.google.maps.Map(containerRef.current, {
      center: { lat: hqLocation.lat, lng: hqLocation.lng },
      zoom: 12,
      zoomControl: true,
      streetViewControl: false,
      mapTypeControl: false,
      fullscreenControl: true,
    });
    mapRef.current     = map;
    managerRef.current = new MapManager(map);
    return () => { managerRef.current?.clear(); mapRef.current = null; };
  }, [isLoaded, hqLocation]);

  useEffect(() => {
    if (!managerRef.current || !mapRef.current) return;
    const manager = managerRef.current;
    manager.clear();

    const createInfoWindow = (content, position) => {
      const iw = new window.google.maps.InfoWindow({ content, position });
      manager.infowindows.push(iw);
      return iw;
    };

    // ── 1. Route polyline (hidden during turn-by-turn navigation) ──────
    if (routeOrders.length > 0 && !navigationActive) {
      manager.addPolyline({
        path: [
          { lat: hqLocation.lat, lng: hqLocation.lng },
          ...routeOrders.map(o => ({ lat: o.location.lat, lng: o.location.lng })),
        ],
        geodesic: true,
        strokeColor: '#3b82f6',
        strokeOpacity: 0.9,
        strokeWeight: 5,
        map: manager.map,
      });
    }

    // ── 2. Traffic circles + markers ───────────────────────────────────
    trafficEvents.forEach(event => {
      if (!event.lat || !event.lng) return;
      manager.addCircle({
        center: { lat: event.lat, lng: event.lng },
        radius: event.severity === 'heavy' ? 1100 : event.severity === 'moderate' ? 700 : 400,
        fillColor: SEVERITY_COLORS[event.severity], fillOpacity: event.severity === 'heavy' ? 0.18 : 0.12,
        strokeColor: SEVERITY_COLORS[event.severity], strokeOpacity: 0.5, strokeWeight: 2, map: manager.map,
      });
      const tIcon = {
        url: `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='34' height='34' viewBox='0 0 34 34'%3E%3Ccircle cx='17' cy='17' r='16' fill='${encodeURIComponent(SEVERITY_COLORS[event.severity])}' stroke='white' stroke-width='2'/%3E%3Ctext x='17' y='23' text-anchor='middle' font-size='16' fill='white' font-weight='bold'%3ET%3C/text%3E%3C/svg%3E`,
        scaledSize: new window.google.maps.Size(34, 34),
      };
      const tm = manager.addMarker({ position: { lat: event.lat, lng: event.lng }, icon: tIcon, map: manager.map });
      const tiw = createInfoWindow(`<div style="min-width:180px"><span style="background:${SEVERITY_COLORS[event.severity]};color:white;border-radius:4px;padding:1px 6px;font-size:11px;font-weight:700">${SEVERITY_LABELS[event.severity]}</span><div style="font-weight:700;font-size:14px;margin-top:4px">${event.road}</div><div style="font-size:12px;color:#6b7280">${event.description}</div><div style="font-size:12px;color:#ef4444;margin-top:6px">+${event.delayMinutes} min</div></div>`, tm.getPosition());
      tm.addListener('click', () => tiw.open(mapRef.current));
    });

    // ── 3. HQ ──────────────────────────────────────────────────────────
    const hqIcon = { url: `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='38' height='38' viewBox='0 0 38 38'%3E%3Ccircle cx='19' cy='19' r='18' fill='%231e293b' stroke='white' stroke-width='2'/%3E%3Ctext x='19' y='25' text-anchor='middle' font-size='14' fill='white' font-weight='bold'%3EHQ%3C/text%3E%3C/svg%3E`, scaledSize: new window.google.maps.Size(38, 38) };
    const hqM = manager.addMarker({ position: { lat: hqLocation.lat, lng: hqLocation.lng }, icon: hqIcon, map: manager.map });
    const hqIw = createInfoWindow(`<div><b>Ventura Fresh Laundry HQ</b><br/>5722 Telephone Rd, Ventura</div>`, hqM.getPosition());
    hqM.addListener('click', () => hqIw.open(mapRef.current));

    // ── 4. Gas stations ────────────────────────────────────────────────
    gasStations.forEach(station => {
      const isCheapest = cheapestIds.has(station.id);
      const gIcon = {
        url: isCheapest
          ? `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='28' height='28' viewBox='0 0 28 28'%3E%3Ccircle cx='14' cy='14' r='13' fill='%2310b981' stroke='white' stroke-width='2'/%3E%3Ctext x='14' y='20' text-anchor='middle' font-size='14' fill='white' font-weight='bold'%3E%E2%9B%BD%3C/text%3E%3C/svg%3E`
          : `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='28' height='28' viewBox='0 0 28 28'%3E%3Ccircle cx='14' cy='14' r='13' fill='%23f59e0b' stroke='white' stroke-width='2'/%3E%3Ctext x='14' y='20' text-anchor='middle' font-size='14' fill='white'%3E%E2%9B%BD%3C/text%3E%3C/svg%3E`,
        scaledSize: new window.google.maps.Size(28, 28),
      };
      const gm = manager.addMarker({ position: { lat: station.lat, lng: station.lng }, icon: gIcon, map: manager.map });
      const savingsHtml = station.savings !== undefined ? `<div style="color:${Number(station.savings) >= 0 ? '#10b981' : '#ef4444'}">Ahorro neto: $${station.savings}</div>` : '';
      const btnHtml = onSelectGasStation ? `<button id="gas-btn-${station.id}" style="margin-top:8px;background:#2563eb;color:white;border:none;border-radius:6px;padding:4px 8px;font-size:12px;cursor:pointer;width:100%">⛽ Usar esta gasolinera</button>` : '';
      const giw = createInfoWindow(`<div style="min-width:200px"><div style="font-weight:bold">⛽ ${station.name}</div><div style="font-size:12px;margin-top:4px">Precio: <strong>$${station.price.toFixed(2)}/gal</strong></div><div>Desvío: ${station.distanceToRouteKm.toFixed(1)} km</div>${savingsHtml}${btnHtml}</div>`, gm.getPosition());
      gm.addListener('click', () => giw.open(mapRef.current));
      if (onSelectGasStation) {
        window.google.maps.event.addListener(giw, 'domready', () => {
          const btn = document.getElementById(`gas-btn-${station.id}`);
          if (btn) btn.onclick = () => onSelectGasStation(station);
        });
      }
    });

    // ── 5. Nearby Wash & Fold ──────────────────────────────────────────
    nearbyWashFold.forEach(order => {
      if (!order.location?.lat) return;
      const wIcon = { url: `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='36' height='36' viewBox='0 0 36 36'%3E%3Ccircle cx='18' cy='18' r='17' fill='%237c3aed' stroke='white' stroke-width='2'/%3E%3Ctext x='18' y='25' text-anchor='middle' font-size='16' fill='white'%3EW%3C/text%3E%3C/svg%3E`, scaledSize: new window.google.maps.Size(36, 36) };
      const wm = manager.addMarker({ position: { lat: order.location.lat, lng: order.location.lng }, icon: wIcon, map: manager.map });
      const wiw = createInfoWindow(`<div style="min-width:170px"><span style="background:#7c3aed;color:white;border-radius:4px;padding:1px 6px;font-size:11px;font-weight:700">Oportunidad</span><div style="font-weight:700;font-size:14px;margin-top:4px">${order.customer?.name}</div><div style="font-size:12px;color:#6b7280">Wash & Fold</div><div style="font-size:12px;margin-top:4px">${order.location.address}</div></div>`, wm.getPosition());
      wm.addListener('click', () => wiw.open(mapRef.current));
    });

    // ── 6. Order markers (numbered diamonds) ──────────────────────────
    const sequenceMap = new Map();
    routeOrders.forEach((o, i) => sequenceMap.set(o.id, i + 1));

    orders.forEach(order => {
      if (!order.location?.lat) return;
      const role  = order.status === 'pending' && order.type !== 'wash-fold' ? 'pickup'
                  : order.status === 'ready'   && order.type !== 'wash-fold' ? 'delivery' : 'processing';
      const seq   = sequenceMap.get(order.id);
      const done  = completedStops.has(order.id);
      const color = done ? '#10b981' : role === 'pickup' ? '#f97316' : role === 'delivery' ? '#22c55e' : '#94a3b8';
      const size  = 32;
      const label = done ? '✓' : seq ? String(seq) : role === 'pickup' ? 'P' : 'D';
      const svg   = `<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}' viewBox='0 0 ${size} ${size}'><path d='M${size/2},0 L${size},${size/2} L${size/2},${size} L0,${size/2} Z' fill='${color}' stroke='white' stroke-width='2'/><text x='${size/2}' y='${size/2+4}' text-anchor='middle' font-size='${size*0.4}' fill='white' font-weight='bold'>${label}</text></svg>`;
      const oIcon = { url: `data:image/svg+xml,${encodeURIComponent(svg)}`, scaledSize: new window.google.maps.Size(size, size) };
      const om    = manager.addMarker({ position: { lat: order.location.lat, lng: order.location.lng }, icon: oIcon, map: manager.map });
      const oiw   = createInfoWindow(`<div style="min-width:180px">${seq ? `<span style="background:${color};color:white;border-radius:4px;padding:1px 6px;font-size:11px;font-weight:700">#${seq} ${role === 'pickup' ? 'Recogida' : 'Entrega'}</span>` : `<span style="background:#94a3b8;color:white;border-radius:4px;padding:1px 6px;font-size:11px;font-weight:700">${ORDER_STATUS_LABELS[order.status] || order.status}</span>`}<div style="font-weight:700;font-size:14px;margin-top:4px">${order.customer?.name}</div><div style="font-size:12px;color:#6b7280">${ORDER_TYPE_LABELS[order.type]}</div><div style="font-size:12px;color:#374151;margin-top:4px">${order.location.address}</div>${order.schedule?.pickupTime ? `<div style="font-size:11px;color:#f97316;margin-top:4px;font-weight:600">Pickup: ${order.schedule.pickupTime}</div>` : ''}<div style="font-size:11px;color:#9ca3af;margin-top:4px">${order.orderNumber}</div></div>`, om.getPosition());
      om.addListener('click', () => { oiw.open(mapRef.current); onOrderClick?.(order); });
    });

    // Fit all points in view
    const bounds = new window.google.maps.LatLngBounds();
    bounds.extend({ lat: hqLocation.lat, lng: hqLocation.lng });
    orders.forEach(o => { if (o.location?.lat) bounds.extend({ lat: o.location.lat, lng: o.location.lng }); });
    if (!bounds.isEmpty() && !navigationActive) mapRef.current.fitBounds(bounds);

  }, [orders, routeOrders, hqLocation, nearbyWashFold, trafficEvents, completedStops,
      gasStations, cheapestIds, onSelectGasStation, navigationActive, isLoaded]);

  if (loadError) return <div className="flex items-center justify-center h-full text-red-500">Error: {String(loadError)}</div>;
  if (!isLoaded) return <div className="flex items-center justify-center h-full"><Loader2 className="animate-spin mr-2" /> Cargando Google Maps...</div>;
  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
});