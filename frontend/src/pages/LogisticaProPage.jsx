// LogisticaProPage.jsx — standalone, full-screen 3D logistics command view.
// Phase 1: live multi-driver GPS tracking + traffic incidents on a
// photorealistic 3D map. Intentionally separate from the existing
// /admin/logistics-map (own backend endpoints, own realtime channel) so
// this still-experimental module (Google's maps3d library is in Preview)
// can evolve without risking the stable map operators rely on daily.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Navigation, Satellite, Users, X } from 'lucide-react';
import Map3D from '../components/logisticapro/Map3D';
import { createNotificationsSocket } from '../utils/notificationsSocket';
import { getCurrentTrafficEvents } from '../utils/traffic';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';
const HQ = { lat: 34.264309036184606, lng: -119.21374270055239 };

// How often the driver's phone posts its position while sharing is on.
// Frequent enough to look "live" on the map, sparse enough not to drain
// battery or spam the backend.
const LOCATION_POST_INTERVAL_MS = 8000;

// Orders don't need second-by-second freshness like a GPS fix — this just
// keeps pickups/deliveries reasonably current as statuses change elsewhere.
const ORDERS_REFRESH_MS = 30000;

function authHeaders() {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function timeAgo(iso) {
  const diffSec = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (diffSec < 60) return `hace ${diffSec}s`;
  return `hace ${Math.floor(diffSec / 60)}min`;
}

export default function LogisticaProPage() {
  const navigate = useNavigate();

  const [driverLocations, setDriverLocations] = useState([]); // [{user_id, name, lat, lng, heading, updated_at}]
  const [trafficEvents, setTrafficEvents] = useState([]);
  const [orders, setOrders] = useState([]);
  const [sharing, setSharing] = useState(false);
  const [panelOpen, setPanelOpen] = useState(true);

  const watchIdRef = useRef(null);
  const postIntervalRef = useRef(null);
  const lastCoordsRef = useRef(null);

  // ── Initial active drivers + traffic ────────────────────────────────────
  useEffect(() => {
    if (!API_URL) return;
    fetch(`${API_URL}/api/logistics-pro/driver-locations`, { headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setDriverLocations(Array.isArray(data) ? data : []))
      .catch(() => {});

    fetch(`${API_URL}/api/traffic/incidents`, { headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setTrafficEvents(data?.events || getCurrentTrafficEvents()))
      .catch(() => setTrafficEvents(getCurrentTrafficEvents()));
  }, []);

  // ── Orders (pickups / deliveries) — same endpoint the 2D logistics
  // map uses, refreshed periodically rather than only once on mount ──────
  useEffect(() => {
    if (!API_URL) return;
    const loadOrders = () => {
      fetch(`${API_URL}/api/logistics/orders`, { headers: authHeaders() })
        .then((r) => (r.ok ? r.json() : []))
        .then((data) => setOrders(Array.isArray(data) ? data : []))
        .catch(() => {});
    };
    loadOrders();
    const id = setInterval(loadOrders, ORDERS_REFRESH_MS);
    return () => clearInterval(id);
  }, []);

  // ── Live updates over the shared notifications socket ──────────────────
  useEffect(() => {
    const socket = createNotificationsSocket();
    if (!socket) return;

    const onNotification = (data) => {
      if (data?.type === 'logisticapro_driver_location') {
        setDriverLocations((prev) => {
          const next = prev.filter((d) => d.user_id !== data.user_id);
          next.push(data);
          return next;
        });
      }
      if (data?.type === 'logisticapro_driver_offline') {
        setDriverLocations((prev) => prev.filter((d) => d.user_id !== data.user_id));
      }
    };

    socket.on('notification', onNotification);
    return () => socket.off('notification', onNotification);
  }, []);

  // Drop drivers nobody has heard from in a while, even if no explicit
  // "offline" event arrived (e.g. the phone lost signal outright).
  useEffect(() => {
    const id = setInterval(() => {
      setDriverLocations((prev) =>
        prev.filter((d) => Date.now() - new Date(d.updated_at).getTime() < 5 * 60 * 1000)
      );
    }, 30000);
    return () => clearInterval(id);
  }, []);

  // ── Share my own location (for whoever is driving) ──────────────────────
  const postLocation = useCallback(() => {
    const coords = lastCoordsRef.current;
    if (!coords || !API_URL) return;
    fetch(`${API_URL}/api/logistics-pro/driver-location`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(coords),
    }).catch(() => {});
  }, []);

  const startSharing = useCallback(() => {
    if (!('geolocation' in navigator)) {
      toast.error('Este dispositivo no soporta geolocalización');
      return;
    }
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        lastCoordsRef.current = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          heading: pos.coords.heading ?? undefined,
          speed: pos.coords.speed ?? undefined,
          accuracy: pos.coords.accuracy ?? undefined,
        };
      },
      (err) => {
        console.error('Geolocation error:', err);
        toast.error('No se pudo obtener tu ubicación — revisa los permisos del navegador');
      },
      { enableHighAccuracy: true, maximumAge: 5000 }
    );
    postIntervalRef.current = setInterval(postLocation, LOCATION_POST_INTERVAL_MS);
    setSharing(true);
    toast.success('Compartiendo tu ubicación en vivo');
  }, [postLocation]);

  const stopSharing = useCallback(() => {
    if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current);
    if (postIntervalRef.current) clearInterval(postIntervalRef.current);
    watchIdRef.current = null;
    postIntervalRef.current = null;
    setSharing(false);
    if (API_URL) {
      fetch(`${API_URL}/api/logistics-pro/driver-location/stop`, { method: 'POST', headers: authHeaders() }).catch(() => {});
    }
  }, []);

  useEffect(() => () => stopSharing(), [stopSharing]);

  const handleOrderClick = useCallback((order) => {
    const label = order.customer?.name || order.orderNumber || 'Orden';
    toast(`${label} — ${order.location?.address || 'sin dirección'}`);
  }, []);

  return (
    <div className="fixed inset-0 bg-slate-950 text-white">
      <Map3D
        hqLocation={HQ}
        driverLocations={driverLocations}
        trafficEvents={trafficEvents}
        orders={orders}
        onOrderClick={handleOrderClick}
      />

      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 py-3 bg-gradient-to-b from-slate-950/90 to-transparent">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/admin')}
            className="p-2 rounded-lg bg-white/10 hover:bg-white/20 backdrop-blur-sm"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <Satellite className="w-5 h-5 text-blue-400" />
            <span className="font-bold tracking-tight">LogisticaPro</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 font-semibold uppercase">Preview</span>
          </div>
          <span className="text-xs text-slate-300 bg-white/5 px-2 py-1 rounded-lg">{orders.length} órdenes en mapa</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={sharing ? stopSharing : startSharing}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold backdrop-blur-sm transition-colors ${
              sharing ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-white/10 hover:bg-white/20'
            }`}
          >
            <Navigation className="w-4 h-4" />
            {sharing ? 'Compartiendo ubicación' : 'Compartir mi ubicación'}
          </button>
          <button
            onClick={() => setPanelOpen((v) => !v)}
            className="p-2 rounded-lg bg-white/10 hover:bg-white/20 backdrop-blur-sm"
          >
            {panelOpen ? <X className="w-5 h-5" /> : <Users className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Active drivers panel */}
      {panelOpen && (
        <div className="absolute top-20 right-4 w-72 max-h-[60vh] overflow-y-auto rounded-xl bg-slate-900/90 backdrop-blur-sm border border-white/10 shadow-xl">
          <div className="px-4 py-3 border-b border-white/10 flex items-center gap-2">
            <Users className="w-4 h-4 text-blue-400" />
            <span className="text-sm font-bold">Conductores activos ({driverLocations.length})</span>
          </div>
          {driverLocations.length === 0 ? (
            <p className="px-4 py-4 text-sm text-slate-400">Nadie está compartiendo su ubicación en este momento.</p>
          ) : (
            <ul className="divide-y divide-white/5">
              {driverLocations.map((d) => (
                <li key={d.user_id} className="px-4 py-3 flex items-center justify-between text-sm">
                  <span className="font-medium">{d.name}</span>
                  <span className="text-xs text-slate-400">{timeAgo(d.updated_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
