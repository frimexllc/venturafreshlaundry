import { Fragment, useEffect, useState, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap, Circle } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { ORDER_TYPE_LABELS, ORDER_STATUS_LABELS } from '../../utils/orders';
import { SEVERITY_COLORS, SEVERITY_LABELS } from '../../utils/traffic';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

const COLORS = { pickup: '#f97316', delivery: '#22c55e', processing: '#94a3b8', hq: '#1e293b' };

function makeIcon(role, sequenceNum, completed) {
  const color = completed ? '#10b981' : COLORS[role];
  const size = role === 'hq' ? 38 : 32;
  const label = completed ? '\u2713' : role === 'hq' ? 'HQ' : sequenceNum != null ? String(sequenceNum) : role === 'pickup' ? 'P' : role === 'delivery' ? 'D' : '\u00b7';
  return L.divIcon({
    className: 'vfl-marker',
    html: `<div style="width:${size}px;height:${size}px;background:${color};border-radius:${role === 'hq' ? '50%' : '50% 50% 50% 0'};transform:${role === 'hq' ? 'none' : 'rotate(-45deg)'};border:3px solid rgba(255,255,255,0.95);box-shadow:0 3px 10px rgba(0,0,0,0.35);display:flex;align-items:center;justify-content:center;"><span style="color:white;font-size:${role === 'hq' ? 12 : 11}px;font-weight:800;transform:${role === 'hq' ? 'none' : 'rotate(45deg)'};font-family:system-ui,sans-serif;line-height:1;">${label}</span></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, role === 'hq' ? size / 2 : size],
    popupAnchor: [0, role === 'hq' ? -size / 2 : -size],
  });
}

function makeTrafficIcon(severity) {
  const color = SEVERITY_COLORS[severity];
  return L.divIcon({
    className: 'vfl-traffic-marker',
    html: `<div style="position:relative;width:34px;height:34px;"><div style="position:absolute;inset:0;border-radius:50%;background:${color};opacity:0.25;animation:trafficPulse 2s ease-in-out infinite;"></div><div style="position:absolute;inset:5px;background:${color};border-radius:50%;border:2.5px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;"><span style="color:white;font-size:11px;font-weight:800;">T</span></div></div><style>@keyframes trafficPulse{0%,100%{transform:scale(1);opacity:0.25}50%{transform:scale(1.6);opacity:0.08}}</style>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    popupAnchor: [0, -20],
  });
}

async function fetchOsrmRoute(waypoints) {
  if (waypoints.length < 2) return [];
  const coords = waypoints.map(([lat, lng]) => `${lng},${lat}`).join(';');
  const url = `https://router.project-osrm.org/route/v1/driving/${coords}?geometries=geojson&overview=full`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('OSRM request failed');
    const data = await res.json();
    if (!data.routes?.[0]) throw new Error('No route found');
    return data.routes[0].geometry.coordinates.map(([lng, lat]) => [lat, lng]);
  } catch {
    return waypoints;
  }
}

function MapContent({ orders, hqLocation, routeOrders, nearbyWashFold = [], trafficEvents = [], completedStops = new Set(), onOrderClick }) {
  const map = useMap();
  const mounted = useRef(true);
  const [roadPath, setRoadPath] = useState([]);
  const [loadingRoute, setLoadingRoute] = useState(false);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, [map]);

  useEffect(() => {
    const allPoints = [[hqLocation.lat, hqLocation.lng], ...orders.map((o) => [o.location.lat, o.location.lng])];
    try { map.fitBounds(L.latLngBounds(allPoints), { padding: [40, 40] }); } catch { /* init */ }
  }, []); // eslint-disable-line

  useEffect(() => {
    if (routeOrders.length === 0) { setRoadPath([]); return; }
    const waypoints = [[hqLocation.lat, hqLocation.lng], ...routeOrders.map((o) => [o.location.lat, o.location.lng])];
    setLoadingRoute(true);
    fetchOsrmRoute(waypoints)
      .then((path) => { if (mounted.current) setRoadPath(path); })
      .catch(() => { if (mounted.current) setRoadPath(waypoints); })
      .finally(() => { if (mounted.current) setLoadingRoute(false); });
  }, [routeOrders, hqLocation]);

  const sequenceMap = new Map();
  (routeOrders ?? []).forEach((o, i) => sequenceMap.set(o.id, i + 1));

  function getRole(order) {
    if (order.status === 'pending' && order.type !== 'wash-fold') return 'pickup';
    if (order.status === 'ready' && order.type !== 'wash-fold') return 'delivery';
    return 'processing';
  }

  const trafficRadius = { light: 400, moderate: 700, heavy: 1100 };
  const trafficFill = { light: '#facc15', moderate: '#f97316', heavy: '#ef4444' };

  return (
    <>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        maxZoom={19}
      />
      {roadPath.length > 1 && (
        <>
          <Polyline positions={roadPath} pathOptions={{ color: 'white', weight: 7, opacity: 0.6 }} />
          <Polyline positions={roadPath} pathOptions={{ color: '#3b82f6', weight: 4, opacity: 0.9 }} />
        </>
      )}
      {loadingRoute && (
        <Marker
          position={[hqLocation.lat + 0.001, hqLocation.lng]}
          icon={L.divIcon({ className: '', html: '<div style="background:#3b82f6;color:white;font-size:10px;padding:2px 6px;border-radius:8px;white-space:nowrap;font-family:system-ui">Calculando ruta...</div>', iconAnchor: [0, 0] })}
        />
      )}
      {trafficEvents.map((event) => (
        <Fragment key={`traffic-${event.id}`}>
          <Circle center={[event.lat, event.lng]} radius={trafficRadius[event.severity]} pathOptions={{ color: trafficFill[event.severity], fillColor: trafficFill[event.severity], fillOpacity: event.severity === 'heavy' ? 0.18 : 0.12, weight: 2, opacity: 0.5, dashArray: '6 4' }} />
          <Marker position={[event.lat, event.lng]} icon={makeTrafficIcon(event.severity)} zIndexOffset={700}>
            <Popup>
              <div style={{ minWidth: 180 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <span style={{ background: SEVERITY_COLORS[event.severity], color: 'white', borderRadius: 4, padding: '1px 6px', fontSize: 11, fontWeight: 700 }}>
                    {SEVERITY_LABELS[event.severity]}
                  </span>
                </div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{event.road}</div>
                <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{event.description}</div>
                <div style={{ fontSize: 12, color: '#ef4444', fontWeight: 600, marginTop: 6 }}>+{event.delayMinutes} min de retraso</div>
              </div>
            </Popup>
          </Marker>
        </Fragment>
      ))}
      <Marker position={[hqLocation.lat, hqLocation.lng]} icon={makeIcon('hq')} zIndexOffset={1000}>
        <Popup>
          <div style={{ fontWeight: 700, fontSize: 14 }}>Ventura Fresh Laundry HQ</div>
          <div style={{ fontSize: 12, color: '#6b7280' }}>5722 Telephone Rd, Ventura</div>
        </Popup>
      </Marker>
      {nearbyWashFold.map((order) => (
        <Marker
          key={`opp-${order.id}`}
          position={[order.location.lat, order.location.lng]}
          icon={L.divIcon({
            className: 'vfl-opp-marker',
            html: `<div style="position:relative;width:36px;height:36px;"><div style="position:absolute;inset:0;border-radius:50%;border:2px solid #7c3aed;opacity:0.4;animation:ping 1.5s cubic-bezier(0,0,0.2,1) infinite;"></div><div style="position:absolute;inset:4px;background:#7c3aed;border-radius:50%;border:2.5px solid white;box-shadow:0 2px 8px rgba(124,58,237,0.5);display:flex;align-items:center;justify-content:center;"><span style="color:white;font-size:12px;line-height:1;">W</span></div></div><style>@keyframes ping{75%,100%{transform:scale(1.8);opacity:0}}</style>`,
            iconSize: [36, 36], iconAnchor: [18, 18], popupAnchor: [0, -20],
          })}
          zIndexOffset={800}
          eventHandlers={{ click: () => onOrderClick(order) }}
        >
          <Popup>
            <div style={{ minWidth: 170 }}>
              <span style={{ background: '#7c3aed', color: 'white', borderRadius: 4, padding: '1px 6px', fontSize: 11, fontWeight: 700 }}>Oportunidad</span>
              <div style={{ fontWeight: 700, fontSize: 14, marginTop: 4 }}>{order.customer.name}</div>
              <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>Wash &amp; Fold</div>
              <div style={{ fontSize: 12, color: '#374151', marginTop: 4 }}>{order.location.address}</div>
            </div>
          </Popup>
        </Marker>
      ))}
      {orders.map((order) => {
        const role = getRole(order);
        const seq = sequenceMap.get(order.id);
        const inRoute = seq != null;
        const done = completedStops.has(order.id);
        return (
          <Marker
            key={order.id}
            position={[order.location.lat, order.location.lng]}
            icon={makeIcon(role, inRoute ? seq : undefined, done)}
            zIndexOffset={done ? 200 : inRoute ? 500 : 0}
            eventHandlers={{ click: () => onOrderClick(order) }}
          >
            <Popup>
              <div style={{ minWidth: 180 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  {inRoute ? (
                    <span style={{ background: COLORS[role], color: 'white', borderRadius: 4, padding: '1px 6px', fontSize: 11, fontWeight: 700 }}>
                      #{seq} {role === 'pickup' ? 'Recogida' : 'Entrega'}
                    </span>
                  ) : (
                    <span style={{ background: '#94a3b8', color: 'white', borderRadius: 4, padding: '1px 6px', fontSize: 11, fontWeight: 700 }}>
                      {ORDER_STATUS_LABELS[order.status] ?? order.status}
                    </span>
                  )}
                </div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{order.customer.name}</div>
                <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{ORDER_TYPE_LABELS[order.type]}</div>
                <div style={{ fontSize: 12, color: '#374151', marginTop: 4 }}>{order.location.address}</div>
                {order.schedule?.pickupTime && (
                  <div style={{ fontSize: 11, color: '#f97316', marginTop: 4, fontWeight: 600 }}>Pickup: {order.schedule.pickupTime}</div>
                )}
                <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>{order.orderNumber}</div>
              </div>
            </Popup>
          </Marker>
        );
      })}
    </>
  );
}

export function MapView({ orders, hqLocation, routeOrders, nearbyWashFold, trafficEvents, completedStops, onOrderClick }) {
  return (
    <MapContainer
      key="road-map"
      center={[hqLocation.lat, hqLocation.lng]}
      zoom={12}
      style={{ width: '100%', height: '100%' }}
      scrollWheelZoom
    >
      <MapContent
        orders={orders}
        hqLocation={hqLocation}
        routeOrders={routeOrders}
        nearbyWashFold={nearbyWashFold}
        trafficEvents={trafficEvents}
        completedStops={completedStops}
        onOrderClick={onOrderClick}
      />
    </MapContainer>
  );
}
