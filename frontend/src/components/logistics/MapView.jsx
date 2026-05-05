// src/components/logistics/MapView.jsx
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
    script.onload = () => resolve(window.google);
    script.onerror = () => reject(new Error('Failed to load Google Maps'));
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
  addMarker(opts) { const m = new window.google.maps.Marker(opts); this.markers.push(m); return m; }
  addPolyline(opts) { const p = new window.google.maps.Polyline(opts); this.polylines.push(p); return p; }
  addCircle(opts) { const c = new window.google.maps.Circle(opts); this.circles.push(c); return c; }
}

export const MapView = forwardRef(function MapView(
  {
    orders,
    hqLocation,
    routeOrders,
    nearbyWashFold = [],
    trafficEvents = [],
    completedStops = new Set(),
    onOrderClick,
    gasStations = [],
    cheapestIds = new Set(),
    onSelectGasStation,
    navigationActive = false,
  },
  ref
) {
  const mapRef = useRef(null);
  const containerRef = useRef(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const managerRef = useRef(null);
  const apiKey = process.env.REACT_APP_GOOGLE_MAPS_API_KEY;

  useImperativeHandle(ref, () => mapRef.current, [isLoaded]);

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
      mapTypeControl: true,
      mapTypeControlOptions: {
        style: window.google.maps.MapTypeControlStyle.HORIZONTAL_BAR,
        position: window.google.maps.ControlPosition.TOP_RIGHT,
        mapTypeIds: ['roadmap', 'satellite', 'hybrid'],
      },
      fullscreenControl: true,
      styles: [
        { featureType: "poi.business", stylers: [{ visibility: "off" }] },
        { featureType: "transit", elementType: "labels.icon", stylers: [{ visibility: "off" }] },
        { featureType: "road", elementType: "geometry", stylers: [{ lightness: 10 }] },
        { featureType: "road.highway", elementType: "geometry.fill", stylers: [{ color: "#a5d6ff" }] },
        { featureType: "water", elementType: "geometry", stylers: [{ color: "#c9e8fc" }] },
      ],
    });
    mapRef.current = map;
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

    // 1. Route polyline — use real driving route via Directions API (chunked for >25 stops)
    if (routeOrders.length > 0 && !navigationActive) {
      const directionsService = new window.google.maps.DirectionsService();
      const allStops = routeOrders.map(o => ({ lat: o.location.lat, lng: o.location.lng }));
      const hqPos = { lat: hqLocation.lat, lng: hqLocation.lng };

      // Split into chunks of max 23 waypoints (Google limit = 25 total including origin/dest)
      const chunkSize = 20;
      const chunks = [];
      for (let i = 0; i < allStops.length; i += chunkSize) {
        chunks.push(allStops.slice(i, i + chunkSize));
      }

      const routeColor = '#2563eb';
      const routeShadow = '#1e3a5f';

      chunks.forEach((chunk, idx) => {
        const origin = idx === 0 ? hqPos : chunks[idx - 1][chunks[idx - 1].length - 1];
        const destination = chunk[chunk.length - 1];
        const waypoints = chunk.slice(0, -1).map(pos => ({ location: pos, stopover: true }));

        directionsService.route({
          origin,
          destination,
          waypoints,
          travelMode: window.google.maps.TravelMode.DRIVING,
          optimizeWaypoints: false,
        }, (result, status) => {
          if (status === 'OK' && result.routes[0]) {
            const routePath = result.routes[0].overview_path;
            // Shadow line
            manager.addPolyline({
              path: routePath, geodesic: true,
              strokeColor: routeShadow, strokeOpacity: 0.25,
              strokeWeight: 10, map: manager.map,
            });
            // Main route line
            manager.addPolyline({
              path: routePath, geodesic: true,
              strokeColor: routeColor, strokeOpacity: 0.9,
              strokeWeight: 5, map: manager.map,
            });
          }
        });
      });

      // Return leg: last stop → HQ
      if (allStops.length > 0) {
        directionsService.route({
          origin: allStops[allStops.length - 1],
          destination: hqPos,
          travelMode: window.google.maps.TravelMode.DRIVING,
        }, (result, status) => {
          if (status === 'OK' && result.routes[0]) {
            manager.addPolyline({
              path: result.routes[0].overview_path, geodesic: true,
              strokeColor: '#64748b', strokeOpacity: 0.5,
              strokeWeight: 3, strokeDashArray: [8, 4], map: manager.map,
            });
          }
        });
      }
    }

    // 2. Traffic circles + markers
    trafficEvents.forEach(event => {
      if (!event.lat || !event.lng) return;
      manager.addCircle({
        center: { lat: event.lat, lng: event.lng },
        radius: event.severity === 'heavy' ? 1100 : event.severity === 'moderate' ? 700 : 400,
        fillColor: SEVERITY_COLORS[event.severity],
        fillOpacity: event.severity === 'heavy' ? 0.18 : 0.12,
        strokeColor: SEVERITY_COLORS[event.severity],
        strokeOpacity: 0.5,
        strokeWeight: 2,
        map: manager.map,
      });
      const tIcon = {
        url: `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='34' height='34' viewBox='0 0 34 34'%3E%3Ccircle cx='17' cy='17' r='16' fill='${encodeURIComponent(SEVERITY_COLORS[event.severity])}' stroke='white' stroke-width='2'/%3E%3Ctext x='17' y='23' text-anchor='middle' font-size='16' fill='white' font-weight='bold'%3ET%3C/text%3E%3C/svg%3E`,
        scaledSize: new window.google.maps.Size(34, 34),
      };
      const tm = manager.addMarker({ position: { lat: event.lat, lng: event.lng }, icon: tIcon, map: manager.map });
      const tiw = createInfoWindow(`
        <div style="min-width:180px">
          <span style="background:${SEVERITY_COLORS[event.severity]};color:white;border-radius:4px;padding:1px 6px;font-size:11px;font-weight:700">${SEVERITY_LABELS[event.severity]}</span>
          <div style="font-weight:700;font-size:14px;margin-top:4px">${event.road}</div>
          <div style="font-size:12px;color:#6b7280">${event.description}</div>
          <div style="font-size:12px;color:#ef4444;margin-top:6px">+${event.delayMinutes} min</div>
        </div>`, tm.getPosition());
      tm.addListener('click', () => tiw.open(mapRef.current));
    });

    // 3. HQ
    const hqIcon = {
      url: `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='38' height='38' viewBox='0 0 38 38'%3E%3Ccircle cx='19' cy='19' r='18' fill='%231e293b' stroke='white' stroke-width='2'/%3E%3Ctext x='19' y='25' text-anchor='middle' font-size='14' fill='white' font-weight='bold'%3EHQ%3C/text%3E%3C/svg%3E`,
      scaledSize: new window.google.maps.Size(38, 38),
    };
    const hqM = manager.addMarker({ position: { lat: hqLocation.lat, lng: hqLocation.lng }, icon: hqIcon, map: manager.map });
    const hqIw = createInfoWindow(`<div><b>Ventura Fresh Laundry HQ</b><br/>5722 Telephone Rd, Ventura</div>`, hqM.getPosition());
    hqM.addListener('click', () => hqIw.open(mapRef.current));

    // 4. Gas stations with price labels
    gasStations.forEach(station => {
      const isCheapest = cheapestIds.has(station.id);
      const priceStr = station.price ? station.price.toFixed(2) : '';
      const bgColor = isCheapest ? '%2310b981' : '%23f59e0b';
      const size = 34;
      const gIcon = {
        url: `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size+12}' viewBox='0 0 ${size} ${size+12}'%3E%3Ccircle cx='${size/2}' cy='${size/2}' r='${size/2-1}' fill='${bgColor}' stroke='white' stroke-width='2'/%3E%3Ctext x='${size/2}' y='${size/2+5}' text-anchor='middle' font-size='14' fill='white' font-weight='bold'%3E%E2%9B%BD%3C/text%3E%3Crect x='2' y='${size}' width='${size-4}' height='12' rx='3' fill='white' stroke='${bgColor}' stroke-width='1'/%3E%3Ctext x='${size/2}' y='${size+10}' text-anchor='middle' font-size='9' fill='%23333' font-weight='bold'%3E%24${priceStr}%3C/text%3E%3C/svg%3E`,
        scaledSize: new window.google.maps.Size(size, size + 12),
      };
      const gm = manager.addMarker({ position: { lat: station.lat, lng: station.lng }, icon: gIcon, map: manager.map, zIndex: 50 });
      const savingsHtml = station.savings !== undefined ? `<div style="color:${Number(station.savings) >= 0 ? '#10b981' : '#ef4444'}">Ahorro neto: $${station.savings}</div>` : '';
      const btnHtml = onSelectGasStation ? `<button id="gas-btn-${station.id}" style="margin-top:8px;background:#2563eb;color:white;border:none;border-radius:8px;padding:6px 12px;font-size:12px;cursor:pointer;width:100%;font-weight:700">Usar esta gasolinera</button>` : '';
      const giw = createInfoWindow(`
        <div style="min-width:200px;font-family:system-ui,sans-serif">
          <div style="font-weight:bold;font-size:14px">${station.name}</div>
          ${station.brand ? `<div style="font-size:11px;color:#6b7280">${station.brand}</div>` : ''}
          <div style="font-size:16px;font-weight:800;color:${isCheapest ? '#10b981' : '#f59e0b'};margin-top:6px">$${station.price.toFixed(2)}/gal</div>
          <div style="font-size:12px;margin-top:4px;color:#64748b">${station.distanceToRouteKm ? station.distanceToRouteKm.toFixed(1) + ' km de desvío' : station.distance_miles ? station.distance_miles.toFixed(1) + ' mi' : ''}</div>
          ${isCheapest ? '<div style="color:#10b981;font-size:11px;font-weight:700;margin-top:4px">Mejor precio</div>' : ''}
          ${savingsHtml}
          ${btnHtml}
        </div>`, gm.getPosition());
      gm.addListener('click', () => giw.open(mapRef.current));
      if (onSelectGasStation) {
        window.google.maps.event.addListener(giw, 'domready', () => {
          const btn = document.getElementById(`gas-btn-${station.id}`);
          if (btn) btn.onclick = () => onSelectGasStation(station);
        });
      }
    });

    // 5. Nearby Wash & Fold
    nearbyWashFold.forEach(order => {
      if (!order.location?.lat) return;
      const wIcon = {
        url: `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='36' height='36' viewBox='0 0 36 36'%3E%3Ccircle cx='18' cy='18' r='17' fill='%237c3aed' stroke='white' stroke-width='2'/%3E%3Ctext x='18' y='25' text-anchor='middle' font-size='16' fill='white'%3EW%3C/text%3E%3C/svg%3E`,
        scaledSize: new window.google.maps.Size(36, 36),
      };
      const wm = manager.addMarker({ position: { lat: order.location.lat, lng: order.location.lng }, icon: wIcon, map: manager.map });
      const wiw = createInfoWindow(`
        <div style="min-width:170px">
          <span style="background:#7c3aed;color:white;border-radius:4px;padding:1px 6px;font-size:11px;font-weight:700">Oportunidad</span>
          <div style="font-weight:700;font-size:14px;margin-top:4px">${order.customer?.name}</div>
          <div style="font-size:12px;color:#6b7280">Wash & Fold</div>
          <div style="font-size:12px;margin-top:4px">${order.location.address}</div>
        </div>`, wm.getPosition());
      wm.addListener('click', () => wiw.open(mapRef.current));
    });

    // 6. Order markers (compact, numbered when in route)
    const sequenceMap = new Map();
    routeOrders.forEach((o, i) => sequenceMap.set(o.id, i + 1));
    orders.forEach(order => {
      if (!order.location?.lat) return;
      const role = order.status === 'pending' && order.type !== 'wash-fold' ? 'pickup'
                 : order.status === 'ready' && order.type !== 'wash-fold' ? 'delivery'
                 : 'processing';
      const seq = sequenceMap.get(order.id);
      const inRoute = seq != null;
      const done = completedStops.has(order.id);
      const color = done ? '#10b981' : role === 'pickup' ? '#f97316' : role === 'delivery' ? '#2563eb' : '#94a3b8';
      const size = inRoute ? 28 : 22;
      const label = done ? '✓' : seq ? String(seq) : role === 'pickup' ? 'P' : 'D';
      const svg = inRoute
        ? `<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}' viewBox='0 0 ${size} ${size}'><circle cx='${size/2}' cy='${size/2}' r='${size/2-2}' fill='${color}' stroke='white' stroke-width='2'/><text x='${size/2}' y='${size/2+4}' text-anchor='middle' font-size='${size*0.4}' fill='white' font-weight='bold'>${label}</text></svg>`
        : `<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}' viewBox='0 0 ${size} ${size}'><circle cx='${size/2}' cy='${size/2}' r='${size/2-1}' fill='${color}' fill-opacity='0.7' stroke='white' stroke-width='1.5'/><text x='${size/2}' y='${size/2+3}' text-anchor='middle' font-size='${size*0.38}' fill='white' font-weight='600'>${label}</text></svg>`;
      const oIcon = { url: `data:image/svg+xml,${encodeURIComponent(svg)}`, scaledSize: new window.google.maps.Size(size, size) };
      const om = manager.addMarker({ position: { lat: order.location.lat, lng: order.location.lng }, icon: oIcon, map: manager.map, zIndex: inRoute ? 100 + (seq || 0) : 10 });
      const oiw = createInfoWindow(`
        <div style="min-width:180px;font-family:system-ui,sans-serif">
          ${inRoute ? `<span style="background:${color};color:white;border-radius:6px;padding:2px 8px;font-size:11px;font-weight:700">#${seq} ${role === 'pickup' ? 'Recogida' : 'Entrega'}</span>` : `<span style="background:#94a3b8;color:white;border-radius:6px;padding:2px 8px;font-size:11px;font-weight:700">${ORDER_STATUS_LABELS[order.status] || order.status}</span>`}
          <div style="font-weight:700;font-size:14px;margin-top:6px">${order.customer?.name}</div>
          <div style="font-size:12px;color:#6b7280">${ORDER_TYPE_LABELS[order.type]}</div>
          <div style="font-size:12px;color:#374151;margin-top:4px">${order.location.address}</div>
          ${order.schedule?.pickupTime ? `<div style="font-size:11px;color:#f97316;margin-top:4px;font-weight:600">Pickup: ${order.schedule.pickupTime}</div>` : ''}
          <div style="font-size:11px;color:#9ca3af;margin-top:4px">${order.orderNumber}</div>
        </div>`, om.getPosition());
      om.addListener('click', () => { oiw.open(mapRef.current); onOrderClick?.(order); });
    });

    // Fit bounds (only when not navigating)
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