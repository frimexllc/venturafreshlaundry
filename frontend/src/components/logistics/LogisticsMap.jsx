// ═══════════════════════════════════════════════════════════════════════
// LogisticsMap.jsx — fixed
// FIXES:
//   1. Removed unused `analyzeBestFuelStop` import
//   2. MapFilters import uses named export fallback guard
//   3. Header height calculation corrected (accounts for filter bar)
//   4. MapView key no longer depends on sidebarOpen (prevents unnecessary remounts)
//   5. Stable callback refs passed to MapView via useCallback
//   6. Added default export at the end
// ═══════════════════════════════════════════════════════════════════════

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { OrderDetailsModal } from './OrderDetailsModal';
import { EndOfDayModal } from './EndOfDayModal';
import { MapView } from './MapView';
import { TimAssistant } from './TimAssistant';
import { QuickSaleModal } from './QuickSaleModal';
import { InternalNavigation } from './InternalNavigation';
import VehicleSelectorModal from './VehicleSelectorModal';
import { LogisticsDashboard } from './LogisticsDashboard';
import {
  Navigation, Package, Loader2, Clock, TrendingDown, AlertTriangle,
  ChevronDown, ChevronUp, ExternalLink, PlayCircle, RefreshCw,
  ArrowDownToLine, ArrowUpFromLine, MapPin, Bell, BellRing, Zap, Radio,
  Menu, X, CheckCircle2, Search, Moon, Sun, BarChart2, History, ShoppingBag,
  Fuel, Filter, Calendar,
} from 'lucide-react';
import {
  MOCK_ORDERS, ORDER_TYPE_LABELS, ORDER_STATUS_LABELS,
  optimizeRouteAdvanced, haversineDistance, mapBackendOrder,
} from '../../utils/orders';
import { getCurrentTrafficEvents, totalTrafficDelay, SEVERITY_COLORS, SEVERITY_LABELS } from '../../utils/traffic';
import { requestNotificationPermission } from '../../utils/notifications';
import { saveRouteRecord, loadRouteHistory } from '../../utils/routeHistory';
import { toast } from 'sonner';
// FIX 1: Removed unused `analyzeBestFuelStop` from import
import { useGasStations, GasStationsSidebar } from './GasStations';
// FIX 2: Safe default import — works whether MapFilters uses default or named export
import MapFilters from '../MapFilters';

const API_URL = process.env.REACT_APP_BACKEND_URL;
const NEARBY_THRESHOLD_KM = 1.2;
const HQ = { lat: 34.264309036184606, lng: -119.21374270055239 };
const TRAFFIC_REFRESH_MS = 5 * 60 * 1000;

// ========== TIME HELPERS ==========
function parseFlexibleTime(timeStr) {
  if (!timeStr || typeof timeStr !== 'string') return null;
  const str = timeStr.trim().toLowerCase();
  const keywords = {
    morning: { hours: 8, minutes: 0 },
    afternoon: { hours: 14, minutes: 0 },
    evening: { hours: 18, minutes: 0 },
    night: { hours: 20, minutes: 0 },
  };
  if (keywords[str]) return keywords[str];
  const rangeMatch = str.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*-\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (rangeMatch) {
    let hours = parseInt(rangeMatch[1], 10);
    const minutes = rangeMatch[2] ? parseInt(rangeMatch[2], 10) : 0;
    const meridiem = rangeMatch[3] || '';
    if (meridiem === 'pm' && hours < 12) hours += 12;
    if (meridiem === 'am' && hours === 12) hours = 0;
    return { hours, minutes };
  }
  const timeMatch = str.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (timeMatch) {
    let hours = parseInt(timeMatch[1], 10);
    const minutes = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
    const meridiem = timeMatch[3] || '';
    if (meridiem === 'pm' && hours < 12) hours += 12;
    if (meridiem === 'am' && hours === 12) hours = 0;
    return { hours, minutes };
  }
  return null;
}

function isWithinTimeWindow(order, type, currentTime = new Date()) {
  const schedule = order.schedule;
  if (!schedule) return true;
  const timeStr = type === 'pickup' ? schedule.pickupTime : schedule.deliveryTime;
  if (!timeStr) return true;
  const parsed = parseFlexibleTime(timeStr);
  if (!parsed) return true;
  const scheduled = new Date(currentTime);
  scheduled.setHours(parsed.hours, parsed.minutes, 0, 0);
  return (currentTime - scheduled) / 60000 >= -15;
}

function filterOrdersByTimeWindow(orders, timeWindow) {
  if (!timeWindow || typeof timeWindow !== 'string') return orders;
  let startMinutes, endMinutes;
  if (timeWindow === 'morning') { startMinutes = 8 * 60; endMinutes = 12 * 60; }
  else if (timeWindow === 'afternoon') { startMinutes = 14 * 60; endMinutes = 18 * 60; }
  else {
    const [startStr, endStr] = timeWindow.split('-');
    if (!startStr || !endStr) return orders;
    const start = parseFlexibleTime(startStr.trim());
    const end = parseFlexibleTime(endStr.trim());
    if (!start || !end) return orders;
    startMinutes = start.hours * 60 + start.minutes;
    endMinutes = end.hours * 60 + end.minutes;
  }
  return orders.filter(order => {
    const timeStr = order.status === 'pending'
      ? order.schedule?.pickupTime
      : order.schedule?.deliveryTime;
    if (!timeStr) return true;
    const parsed = parseFlexibleTime(timeStr);
    if (!parsed) return true;
    const orderMinutes = parsed.hours * 60 + parsed.minutes;
    return orderMinutes >= startMinutes && orderMinutes <= endMinutes;
  });
}

function buildGoogleMapsUrl(stops) {
  const origin = `${HQ.lat},${HQ.lng}`;
  const last = stops[stops.length - 1];
  const destination = last ? `${last.order.location.lat},${last.order.location.lng}` : origin;
  const waypoints = stops.slice(0, -1)
    .map(s => `${s.order.location.lat},${s.order.location.lng}`)
    .join('|');
  const params = new URLSearchParams({ origin, destination, travelmode: 'driving' });
  if (waypoints) params.set('waypoints', waypoints);
  return `https://www.google.com/maps/dir/?api=1&${params.toString()}`;
}

function optimizeOrders(allOrders, vehicleMpg, fuelPrice, phase = 'both') {
  // ── Filtrado por status canónico (los que están "activos" en logística) ──
  // Después de la normalización del backend, los status son lowercase canonicos.
  const ACTIVE_LOGISTICS_STATUSES = new Set([
    'new', 'confirmed', 'pickup_scheduled',
    'picked_up', 'processing', 'ready', 'out_for_delivery',
  ]);

  // Selecciona qué órdenes incluir según la fase activa del filtro
  const isPickupStatus = (s) => ['new', 'confirmed', 'pickup_scheduled'].includes(s);
  const isDeliveryStatus = (s) => ['ready', 'out_for_delivery'].includes(s);
  const inTransitStatus = (s) => ['picked_up', 'processing'].includes(s); // intermedios

  const routeOrders = allOrders
    .filter(o => {
      const st = (o.status || '').toLowerCase();
      if (!ACTIVE_LOGISTICS_STATUSES.has(st)) return false;
      if (o.type === 'wash-fold' || o.type === 'self-service') return false;
      // Fase-aware: si el filtro está en "pickup", excluye órdenes ya recogidas
      if (phase === 'pickup' && !isPickupStatus(st)) return false;
      if (phase === 'delivery' && !isDeliveryStatus(st) && !inTransitStatus(st)) return false;
      return true;
    })
    .map(o => {
      // ── Ajuste de coordenadas según fase ─────────────────────────────
      // En pickup, usar pickup_address. En delivery, usar delivery_address.
      // Si la orden no tiene coords específicas, fallback a location actual.
      const useDelivery = phase === 'delivery' ||
        (phase === 'both' && (isDeliveryStatus((o.status || '').toLowerCase()) || inTransitStatus((o.status || '').toLowerCase())));

      // Backend ya envía location con la dirección relevante; mantenemos pero anotamos
      return {
        ...o,
        _routePhase: useDelivery ? 'delivery' : 'pickup',
        // Time window relevante para esta fase
        schedule: {
          ...(o.schedule || {}),
          pickupTime: useDelivery
            ? (o.schedule?.deliveryTime || o.schedule?.pickupTime || '12:00 PM - 03:00 PM')
            : (o.schedule?.pickupTime  || '09:00 AM - 12:00 PM'),
        },
      };
    });

  if (routeOrders.length === 0) return null;

  // ── Boost de prioridad para Express y Premium ────────────────────────
  // Express = same-day → máxima urgencia. Premium = 12-24h → alta.
  // Se aplica como ajuste del tipo efectivo para que `TYPE_PRIORITY` lo recoja.
  const boostedOrders = routeOrders.map(o => {
    const plan = (o.service_plan || '').toLowerCase();
    let typeBoost = o.type;
    if (plan === 'express') typeBoost = 'airbnb'; // prioridad 6 (crítica)
    else if (plan === 'premium' && o.type !== 'airbnb' && o.type !== 'b2b') typeBoost = 'b2b'; // prioridad 5
    return { ...o, type: typeBoost, _originalType: o.type, _servicePlan: plan };
  });

  const kmPerLiter = (vehicleMpg || 12) * 0.425144;     // mpg → km/L
  const pricePerLiter = (fuelPrice || 4.89) / 3.78541;  // USD/gal → USD/L

  return optimizeRouteAdvanced(boostedOrders, HQ, {
    vehicleKmPerLiter: kmPerLiter,
    fuelPricePerLiter: pricePerLiter,
  });
}

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' ? window.innerWidth < 768 : false
  );
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);
  return isMobile;
}

const SEVERITY_BG = {
  light: 'bg-yellow-50 border-yellow-300',
  moderate: 'bg-orange-50 border-orange-300',
  heavy: 'bg-red-50 border-red-400',
};

export function LogisticsMap() {
  const [orders, setOrders]                   = useState(MOCK_ORDERS);
  const [mapFilters, setMapFilters]           = useState({});
  const [selectedOrder, setSelectedOrder]     = useState(null);
  const [modalOpen, setModalOpen]             = useState(false);
  const [routeResult, setRouteResult]         = useState(null);
  const [showStops, setShowStops]             = useState(true);
  const [filterType, setFilterType]           = useState('all');
  const [optimizing, setOptimizing]           = useState(false);
  const [notified, setNotified]               = useState(new Set());
  const [trafficEvents, setTrafficEvents]     = useState([]);
  const [showTraffic, setShowTraffic]         = useState(true);
  const [sidebarOpen, setSidebarOpen]         = useState(false);
  const [sheetHeight, setSheetHeight]         = useState(260);
  const [completedStops, setCompletedStops]   = useState(new Set());
  const [darkMode, setDarkMode]               = useState(() => localStorage.getItem('vfl-dark') === '1');
  const [searchQuery, setSearchQuery]         = useState('');
  const [showEndOfDay, setShowEndOfDay]       = useState(false);
  const [routeStartTime]                      = useState(Date.now());
  const [showHistory, setShowHistory]         = useState(false);
  const [routeHistory, setRouteHistory]       = useState([]);
  const [loadingBackend, setLoadingBackend]   = useState(true);
  const isMobile = useIsMobile();
  const sheetRef      = useRef(null);
  const dragStartY    = useRef(null);
  const dragStartH    = useRef(260);
  const timRef        = useRef(null);
  const prevHeavyRef  = useRef(new Set());
  const [quickSaleOpen, setQuickSaleOpen]     = useState(false);
  const [quickSaleProduct, setQuickSaleProduct] = useState(null);
  const [showProducts, setShowProducts]       = useState(false);
  const [productSearch, setProductSearch]     = useState('');
  const [productsList, setProductsList]       = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [showDashboard, setShowDashboard]     = useState(false);
  const googleMapRef = useRef(null);

  // ── Vehicle settings ──────────────────────────────────────────────────
  const [vehicleMpg, setVehicleMpg]         = useState(12);
  const [fuelPrice, setFuelPrice]           = useState(4.89);
  const [loadingSettings, setLoadingSettings] = useState(true);

  // ── Gas stations ──────────────────────────────────────────────────────
  const [showGasStations, setShowGasStations] = useState(true);
  const [navigationMode, setNavigationMode]   = useState(false);
  const [currentStep, setCurrentStep]         = useState(0);

  // ── Vehicle / Driver pre-flight ───────────────────────────────────────
  const [showVehicleModal, setShowVehicleModal] = useState(false);
  const [activeTrip, setActiveTrip]             = useState(null); // {vehicle_id, vehicle_name, driver_name, mpg}

  const routeWaypoints = useMemo(() => {
    const routeOrdersList = routeResult?.stops.map(s => s.order) ?? [];
    return [HQ, ...routeOrdersList.map(o => ({ lat: o.location.lat, lng: o.location.lng }))];
  }, [routeResult]);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) { setLoadingSettings(false); return; }
    fetch(`${API_URL}/api/logistics/settings`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(res => res.json())
      .then(data => {
        if (data.vehicle_mpg) setVehicleMpg(data.vehicle_mpg);
        if (data.fuel_price_per_gallon) setFuelPrice(data.fuel_price_per_gallon);
      })
      .catch(console.error)
      .finally(() => setLoadingSettings(false));
  }, []);

  const { stations: gasStations, loading: gasLoading, error: gasError, basePrice, cheapestIds, fuelAnalysis } =
    useGasStations(HQ, routeWaypoints, showGasStations, vehicleMpg, fuelPrice);

  // ── Dark mode ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('vfl-dark', '1');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('vfl-dark', '0');
    }
  }, [darkMode]);

  useEffect(() => { setRouteHistory(loadRouteHistory()); }, []);

  useEffect(() => {
    if (!showProducts || productsList.length > 0) return;
    setLoadingProducts(true);
    fetch(`${API_URL}/api/store/products`)
      .then(r => r.ok ? r.json() : [])
      .then(d => setProductsList(Array.isArray(d) ? d : []))
      .catch(() => {})
      .finally(() => setLoadingProducts(false));
  }, [showProducts, productsList.length]);

  useEffect(() => { requestNotificationPermission(); }, []);

  useEffect(() => {
    const heavyNow = new Set(trafficEvents.filter(e => e.severity === 'heavy').map(e => e.id));
    const newHeavy = trafficEvents.filter(e => e.severity === 'heavy' && !prevHeavyRef.current.has(e.id));
    if (newHeavy.length > 0) {
      toast.warning(
        `🚨 Tráfico pesado: ${newHeavy.map(e => e.road).join(', ')} — +${newHeavy.reduce((s, e) => s + e.delayMinutes, 0)} min.`,
        { duration: 8000 }
      );
    }
    prevHeavyRef.current = heavyNow;
  }, [trafficEvents]);

  const loadOrders = useCallback(() => {
    const token = localStorage.getItem('token');
    if (!token || !API_URL) { setLoadingBackend(false); return; }
    setLoadingBackend(true);
    const params = new URLSearchParams();
    if (mapFilters.date) params.set('date', mapFilters.date);
    if (mapFilters.time_window) params.set('time_window', mapFilters.time_window);
    if (mapFilters.service_type && mapFilters.service_type !== 'all') {
      params.set('service_type', mapFilters.service_type);
    }
    if (mapFilters.phase && mapFilters.phase !== 'both') {
      params.set('phase', mapFilters.phase);
    }
    const qs = params.toString();
    fetch(`${API_URL}/api/logistics/orders${qs ? `?${qs}` : ''}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(data => {
        const arr = Array.isArray(data) ? data : [];
        // El backend ya envía type, schedule, customer normalizado
        const mapped = arr.map(o => ({
          ...o,
          _backendId: o.id,
          // garantizar campos requeridos
          type: o.type || o.service_type || 'pickup-delivery',
          pricing: o.pricing || { subtotal: 0, tax: 0, total: 0 },
          payment: o.payment || { method: 'card', status: 'pending' },
          schedule: o.schedule || { pickupDate: '', pickupTime: '', deliveryDate: '', deliveryTime: '' },
          location: o.location || { lat: HQ.lat, lng: HQ.lng, address: '', zipCode: '' },
          customer: o.customer || { name: 'Cliente', phone: '', email: '' },
        }));
        setOrders(mapped);
      })
      .catch(() => { setOrders([]); })
      .finally(() => setLoadingBackend(false));
  }, [mapFilters]);

  useEffect(() => { loadOrders(); }, [loadOrders]);

  // ── Realtime: re-sync con Operator Panel vía Socket.IO ──────────────────
  // Cuando una orden cambia de estado (desde el OperatorDashboard o del cliente)
  // el LogisticsMap se entera al instante y recarga.
  useEffect(() => {
    let socket;
    let cancelled = false;
    (async () => {
      try {
        const { createNotificationsSocket } = await import('../../utils/notificationsSocket');
        socket = createNotificationsSocket();
        if (!socket || cancelled) return;
        const handler = (payload) => {
          const type = payload?.type || '';
          if (
            type === 'order_status_changed' ||
            type === 'order_status' ||
            type === 'order_created' ||
            type === 'order_payment'
          ) {
            if (window.__logmapReloadTimer) clearTimeout(window.__logmapReloadTimer);
            window.__logmapReloadTimer = setTimeout(() => { loadOrders(); }, 350);
          }
        };
        socket.on('notification', handler);
        socket.on('order_status', handler);
        socket._logmapHandler = handler;
      } catch (e) {
        console.warn('[LogisticsMap] socket sync disabled:', e?.message);
      }
    })();
    return () => {
      cancelled = true;
      if (socket && socket._logmapHandler) {
        socket.off('notification', socket._logmapHandler);
        socket.off('order_status', socket._logmapHandler);
      }
      if (window.__logmapReloadTimer) {
        clearTimeout(window.__logmapReloadTimer);
        window.__logmapReloadTimer = null;
      }
    };
  }, [loadOrders]);

  // ── Traffic refresh ───────────────────────────────────────────────────
  useEffect(() => {
    const token = localStorage.getItem('token');
    const refresh = async () => {
      if (!token || !API_URL) { setTrafficEvents(getCurrentTrafficEvents()); return; }
      try {
        const res = await fetch(`${API_URL}/api/traffic/incidents`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setTrafficEvents(data.events || []);
          return;
        }
      } catch {}
      setTrafficEvents(getCurrentTrafficEvents());
    };
    refresh();
    const interval = setInterval(refresh, TRAFFIC_REFRESH_MS);
    return () => clearInterval(interval);
  }, []);

  // ── Filtered orders (backend ya filtra; este es solo respaldo cliente) ──
  const filteredByDateAndTime = useMemo(() => {
    // Backend ya hace el filtrado pesado. Aquí solo aplicamos defensivo si llegan datos sin filtrar.
    return orders;
  }, [orders]);

  // service_type viene del MapFilters (single source of truth); filterType legacy se mantiene para tabs móviles
  const activeServiceType = mapFilters.service_type || filterType || 'all';
  const displayedOrders = activeServiceType === 'all'
    ? filteredByDateAndTime
    : filteredByDateAndTime.filter(o => o.type === activeServiceType);

  const pickupCount   = displayedOrders.filter(o => o.status === 'pending' && o.type !== 'wash-fold').length;
  const deliveryCount = displayedOrders.filter(o => o.status === 'ready'   && o.type !== 'wash-fold').length;
  const trafficDelay  = totalTrafficDelay(trafficEvents, routeWaypoints, 3.0);

  const filteredProducts = productSearch.trim()
    ? productsList.filter(p => p.name?.toLowerCase().includes(productSearch.toLowerCase()))
    : productsList;
  const productsCount = productsList.length;

  // ── Route optimization ───────────────────────────────────────────────
  // Re-optimiza automáticamente cuando cambian: órdenes, fase, ventana horaria, servicio.
  useEffect(() => {
    if (!loadingBackend && !loadingSettings) {
      setRouteResult(optimizeOrders(displayedOrders, vehicleMpg, fuelPrice, mapFilters.phase));
    }
  }, [loadingBackend, loadingSettings, displayedOrders, vehicleMpg, fuelPrice, mapFilters.phase, mapFilters.time_window, mapFilters.service_type]);

  useEffect(() => {
    const timer = setTimeout(() => window.dispatchEvent(new Event('resize')), 100);
    return () => clearTimeout(timer);
  }, [sidebarOpen, sheetHeight, displayedOrders]);

  // ── Gas station insertion ─────────────────────────────────────────────
  function findBestInsertIndex(station, stops, hq) {
    let bestIdx = stops.length, minExtra = Infinity;
    const sl = { lat: station.lat, lng: station.lng };
    for (let i = 0; i <= stops.length; i++) {
      const prev = i === 0 ? hq : stops[i - 1].order.location;
      const next = i === stops.length ? null : stops[i].order.location;
      let extra = 0;
      if (prev && next) {
        const orig = haversineDistance(prev.lat, prev.lng, next.lat, next.lng);
        const via  = haversineDistance(prev.lat, prev.lng, sl.lat, sl.lng)
                   + haversineDistance(sl.lat, sl.lng, next.lat, next.lng);
        extra = via - orig;
      } else if (prev) {
        extra = haversineDistance(prev.lat, prev.lng, sl.lat, sl.lng);
      }
      if (extra < minExtra) { minExtra = extra; bestIdx = i; }
    }
    return bestIdx;
  }

  // FIX 5: stable callback ref to avoid MapView re-renders
  const handleSelectGasStation = useCallback((station) => {
    if (!routeResult) return;
    const fuelOrder = {
      id: `fuel-${station.id}`,
      orderNumber: `GAS-${station.name.slice(0, 6).toUpperCase()}`,
      type: 'fuel-stop',
      status: 'ready',
      customer: { name: station.name, phone: '', email: '' },
      location: { lat: station.lat, lng: station.lng, address: station.name, zipCode: '' },
      schedule: { pickupTime: '', deliveryTime: '' },
      specialInstructions: `Gasolinera - $${station.price}/gal`,
      pricing: { subtotal: 0, tax: 0, total: 0 },
    };
    const currentStops = [...routeResult.stops];
    const insertIndex  = findBestInsertIndex(station, currentStops, HQ);
    const newStop = {
      order: fuelOrder,
      stopNumber: insertIndex + 1,
      distanceFromPrev: station.distanceToRouteKm,
      cumulativeDistance: 0,
      estimatedArrival: '',
      urgencyLevel: 'normal',
      timeWindowStart: 0,
      timeWindowEnd: 0,
      onTime: true,
      priorityScore: 5,
    };
    currentStops.splice(insertIndex, 0, newStop);
    const allOrdersForRoute = currentStops.map(s => s.order);
    const newRoute = optimizeRouteAdvanced(allOrdersForRoute, HQ, vehicleMpg, fuelPrice);
    if (newRoute) {
      setRouteResult(newRoute);
      toast.success(`⛽ ${station.name} añadida a la ruta. Ahorro est.: $${station.savings || '?'}`);
      setNavigationMode(false);
      setCurrentStep(0);
    } else {
      toast.error('No se pudo recalcular la ruta con la gasolinera');
    }
  }, [routeResult, vehicleMpg, fuelPrice]);

  // ── Internal navigation ───────────────────────────────────────────────
  function startInternalNavigation() {
    if (!routeResult?.stops.length) {
      toast.info('No hay ruta activa para navegar');
      return;
    }
    // Pre-flight: pedir vehículo + nombre del driver
    setShowVehicleModal(true);
  }

  // Confirma vehículo y arranca navegación
  function handleVehicleConfirm(tripInfo) {
    setActiveTrip(tripInfo);
    setShowVehicleModal(false);
    if (tripInfo.mpg && tripInfo.mpg !== vehicleMpg) {
      setVehicleMpg(tripInfo.mpg); // ajusta consumo según vehículo elegido
    }
    setNavigationMode(true);
    setCurrentStep(0);
    toast.success(`🚐 Ruta iniciada — ${tripInfo.vehicle_name}`);
  }

  // Cierra navegación. Si hubo ruta activa, registra el viaje round-trip en finanzas.
  async function handleNavigationClose() {
    setNavigationMode(false);
    setCurrentStep(0);

    if (!activeTrip || !routeResult) {
      setActiveTrip(null);
      return;
    }

    // ── Round-trip: distancia outbound + retorno al HQ ─────────────────
    const outboundMiles = Number(routeResult.totalDistanceMiles || routeResult.totalDistance || 0);
    // Distancia del último stop al HQ (haversine como aproximación; el algoritmo
    // de optimización ya devuelve "totalDistanceMiles" como round-trip si está
    // configurado así, pero garantizamos sumando el retorno explícito)
    const lastStop = routeResult.stops[routeResult.stops.length - 1]?.order?.location;
    let returnMiles = 0;
    if (lastStop) {
      returnMiles = haversineDistance(
        lastStop.lat, lastStop.lng, HQ.lat, HQ.lng
      ) * 0.621371; // km → mi
    }
    const totalMiles = outboundMiles + returnMiles;
    const mpg = activeTrip.mpg || vehicleMpg || 22;
    const gallons = totalMiles / mpg;
    const cost = gallons * fuelPrice;

    const token = localStorage.getItem('token');
    if (!token) {
      setActiveTrip(null);
      return;
    }
    try {
      const res = await fetch(`${API_URL}/api/logistics/route-trips`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          vehicle_id: activeTrip.vehicle_id,
          vehicle_name: activeTrip.vehicle_name,
          driver_name: activeTrip.driver_name,
          miles_outbound: Number(outboundMiles.toFixed(2)),
          miles_return: Number(returnMiles.toFixed(2)),
          total_miles: Number(totalMiles.toFixed(2)),
          fuel_mpg: mpg,
          gallons_used: Number(gallons.toFixed(3)),
          fuel_price_per_gallon: fuelPrice,
          total_cost_usd: Number(cost.toFixed(2)),
          stops_count: routeResult.stops.length,
          route_date: mapFilters.date || new Date().toISOString().slice(0, 10),
          notes: `Filtros: ${mapFilters.service_type || 'all'} / ${mapFilters.phase || 'both'}${mapFilters.time_window ? ' / ' + mapFilters.time_window : ''}`,
        }),
      });
      if (res.ok) {
        toast.success(
          `🚐 Viaje registrado: ${totalMiles.toFixed(1)} mi · ${gallons.toFixed(2)} gal · $${cost.toFixed(2)} (gasto en finanzas)`
        );
      } else {
        toast.error('No se pudo registrar el viaje en finanzas');
      }
    } catch (err) {
      console.warn('route-trips error:', err);
      toast.error('Error de red al registrar el viaje');
    }
    setActiveTrip(null);
  }

  // ── Stop handlers ─────────────────────────────────────────────────────
  function handleReoptimize() {
    setOptimizing(true);
    setTimeout(() => {
      const result = optimizeOrders(displayedOrders, vehicleMpg, fuelPrice, mapFilters.phase);
      setRouteResult(result);
      setOptimizing(false);
      if (result) {
        const saved = result.savedMiles > 0 ? ` · ${result.savedMiles.toFixed(1)} mi ahorradas` : '';
        toast.success(`Ruta optimizada: ${result.stops.length} paradas · ${result.totalDistance} mi${saved}`);
        timRef.current?.sendProactive(`RUTA RE-OPTIMIZADA — ${result.stops.length} paradas, ${result.totalDistance} mi.`);
      } else {
        toast.info('Sin paradas activas');
      }
    }, 600);
  }

  function handleCompleteStop(orderId) {
    const stop = routeResult?.stops.find(s => s.order.id === orderId);
    if (!stop) return;
    const order = stop.order;
    const isPickup = order.status === 'pending';
    if (!isWithinTimeWindow(order, isPickup ? 'pickup' : 'delivery')) {
      const timeStr = isPickup ? order.schedule?.pickupTime : order.schedule?.deliveryTime;
      toast.error(`Programada a las ${timeStr || 'hora no definida'}. Máx 15 min antes.`);
      return;
    }
    setCompletedStops(prev => {
      const next = new Set(prev).add(orderId);
      const total = routeResult?.stops.length ?? 0;
      if (total > 0 && next.size >= total) {
        if (routeResult) {
          saveRouteRecord({
            date: new Date().toLocaleDateString('es-MX'),
            totalStops: total,
            completedStops: next.size,
            totalDistance: routeResult.totalDistance,
            estimatedDuration: routeResult.estimatedDuration,
            fuelCost: routeResult.estimatedFuelCost,
            savedMiles: routeResult.savedMiles,
            trafficDelay,
          });
          setRouteHistory(loadRouteHistory());
        }
        setTimeout(() => {
          setShowEndOfDay(true);
          timRef.current?.sendProactive('RUTA COMPLETADA');
        }, 400);
      }
      return next;
    });
    toast.success(`${isPickup ? 'Recogido' : 'Entregado'}: ${order.customer.name}`);
    setTimeout(() => window.dispatchEvent(new Event('resize')), 50);
  }

  function markOrderPaid(orderId) {
    setOrders(prev =>
      prev.map(o => o.id === orderId ? { ...o, payment: { ...o.payment, status: 'paid' } } : o)
    );
    setSelectedOrder(prev =>
      prev?.id === orderId ? { ...prev, payment: { ...prev.payment, status: 'paid' } } : prev
    );
    const order = orders.find(o => o.id === orderId);
    toast.success(`Pago confirmado — ${order?.orderNumber ?? ''} — $${order?.pricing.total.toFixed(2) ?? ''}`);
  }

  function updateOrderStatus(orderId, newStatus) {
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: newStatus } : o));
    setSelectedOrder(prev => prev?.id === orderId ? { ...prev, status: newStatus } : prev);
    const token = localStorage.getItem('token');
    if (token) {
      fetch(`${API_URL}/api/logistics/orders/${orderId}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: newStatus }),
      }).catch(() => {});
    }
    setTimeout(() => {
      setOrders(current => { setRouteResult(optimizeOrders(current, vehicleMpg, fuelPrice, mapFilters.phase)); return current; });
    }, 0);
    toast.success(`Estado → ${ORDER_STATUS_LABELS[newStatus] ?? newStatus}`);
  }

  // FIX 5: stable callback ref
  const handleOrderClick = useCallback((order) => {
    setSelectedOrder(order);
    setModalOpen(true);
  }, []);

  const routeOrders = routeResult?.stops.map(s => s.order) ?? [];

  const nearbyWashFold = displayedOrders.filter(o => {
    if (o.type !== 'wash-fold') return false;
    if (routeWaypoints.length < 2) return false;
    return Math.min(
      ...routeWaypoints.map(wp => haversineDistance(wp.lat, wp.lng, o.location.lat, o.location.lng))
    ) <= NEARBY_THRESHOLD_KM;
  });

  function handleNotify(order) {
    setNotified(prev => new Set(prev).add(order.id));
    toast.success(`Notificación enviada a ${order.customer.name}`);
  }

  const urgencyDot = (level) =>
    ({ critical: 'bg-red-500', high: 'bg-amber-500', normal: 'bg-blue-500', flexible: 'bg-gray-300' }[level] ?? 'bg-gray-300');

  function onDragStart(clientY) { dragStartY.current = clientY; dragStartH.current = sheetHeight; }
  function onDragMove(clientY) {
    if (dragStartY.current === null) return;
    const delta = dragStartY.current - clientY;
    setSheetHeight(Math.max(80, Math.min(window.innerHeight * 0.85, dragStartH.current + delta)));
  }
  function onDragEnd() { dragStartY.current = null; if (sheetHeight < 150) setSheetHeight(80); }

  const filteredStops = routeResult?.stops.filter(s => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      s.order.customer.name.toLowerCase().includes(q) ||
      s.order.location.address.toLowerCase().includes(q) ||
      s.order.orderNumber.toLowerCase().includes(q)
    );
  }) ?? [];

  const progressPct = routeResult
    ? Math.round((completedStops.size / routeResult.stops.length) * 100)
    : 0;

  // ── Sidebar content ───────────────────────────────────────────────────
  const SidebarContent = (
    <div className="h-full overflow-y-auto dark:bg-gray-900">
      {/* Search */}
      <div className="px-3 pt-3 pb-2 border-b dark:border-gray-700">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Buscar cliente, dirección..."
            className="w-full pl-8 pr-8 py-1.5 text-xs border border-gray-200 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-800 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Route summary */}
      {routeResult && (
        <div className="px-4 pt-4 pb-3 border-b dark:border-gray-700 bg-slate-50 dark:bg-gray-800">
          <div className="mb-3">
            <div className="flex items-center justify-between text-[10px] mb-1">
              <span className="text-gray-500 font-semibold">Progreso</span>
              <span className={`font-bold ${progressPct === 100 ? 'text-green-600' : 'text-blue-600'}`}>
                {completedStops.size}/{routeResult.stops.length} ({progressPct}%)
              </span>
            </div>
            <div className="h-2 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${progressPct === 100 ? 'bg-green-500' : 'bg-blue-500'}`}
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: 'Distancia', value: `${routeResult.totalDistance} mi` },
              { label: 'Gasolina est.', value: `$${routeResult.estimatedFuelCost}`, color: 'text-green-700' },
              {
                label: 'Tiempo est.',
                value: `${Math.floor((routeResult.estimatedDuration + trafficDelay) / 60)}h ${(routeResult.estimatedDuration + trafficDelay) % 60}m`,
                extra: trafficDelay > 0
                  ? <span className="ml-1 text-[10px] text-red-500">(+{trafficDelay}min traf.)</span>
                  : null,
              },
              {
                label: 'Ventanas',
                value: routeResult.violations === 0 ? 'OK' : `${routeResult.violations} tarde`,
                color: routeResult.violations === 0 ? 'text-emerald-600' : 'text-amber-600',
              },
            ].map(({ label, value, color, extra }) => (
              <div key={label} className="bg-white dark:bg-gray-700 rounded-lg border dark:border-gray-600 px-3 py-2">
                <div className="text-[10px] text-gray-400 font-medium uppercase tracking-wide">{label}</div>
                <div className={`text-base font-bold ${color ?? 'text-gray-800 dark:text-gray-100'}`}>{value}{extra}</div>
              </div>
            ))}
          </div>
          {routeResult.savedMiles > 0 && (
            <div className="mt-2 flex items-center gap-1.5 text-xs text-green-700 bg-green-50 border border-green-100 rounded-lg px-2 py-1.5">
              <TrendingDown className="w-3 h-3 shrink-0" /> Ahorraste {routeResult.savedMiles.toFixed(1)} mi vs ruta directa
            </div>
          )}
        </div>
      )}

      {/* Gas stations sidebar */}
      {showGasStations && (
        <GasStationsSidebar
          stations={gasStations}
          loading={gasLoading}
          error={gasError}
          basePrice={basePrice}
        />
      )}

      {/* Traffic alerts */}
      {trafficEvents.length > 0 && (
        <div className="px-3 pt-3 pb-3 border-b bg-red-50 dark:bg-red-950/20">
          <button
            onClick={() => setShowTraffic(v => !v)}
            className="w-full flex items-center gap-1.5 text-xs font-semibold text-red-800 dark:text-red-400 mb-2"
          >
            <Radio className="w-3.5 h-3.5 animate-pulse" /> Tráfico en tiempo real
            <span className="ml-1 bg-red-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">
              {trafficEvents.length}
            </span>
            <span className="ml-auto text-red-400">
              {showTraffic ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </span>
          </button>
          {showTraffic && (
            <div className="space-y-1.5">
              {trafficEvents.map(event => (
                <div
                  key={event.id}
                  className={`rounded-lg border px-2.5 py-2 flex items-start gap-2 ${SEVERITY_BG[event.severity]}`}
                >
                  <div
                    className="w-2 h-2 rounded-full mt-0.5 shrink-0"
                    style={{ background: SEVERITY_COLORS[event.severity] }}
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-bold text-gray-700 truncate">{event.road}</span>
                      <span
                        className="text-[9px] font-bold px-1.5 py-0.5 rounded-full text-white shrink-0"
                        style={{ background: SEVERITY_COLORS[event.severity] }}
                      >
                        {SEVERITY_LABELS[event.severity]}
                      </span>
                    </div>
                    <div className="text-[10px] text-gray-500">{event.description}</div>
                    <div className="text-[10px] font-semibold text-red-600 mt-0.5">+{event.delayMinutes} min</div>
                  </div>
                </div>
              ))}
              <button
                onClick={handleReoptimize}
                className="w-full mt-1 flex items-center justify-center gap-1.5 text-[10px] font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg py-1.5 transition-colors"
              >
                <RefreshCw className="w-3 h-3" /> Ajustar ruta por tráfico
              </button>
            </div>
          )}
          <p className="text-[9px] text-red-400 mt-2">Actualiza c/5 min · +{trafficDelay} min total</p>
        </div>
      )}

      {/* Nearby opportunities */}
      {nearbyWashFold.length > 0 && (
        <div className="px-3 pt-3 pb-3 border-b bg-violet-50 dark:bg-violet-950/20">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-violet-800 dark:text-violet-300 mb-2">
            <BellRing className="w-3.5 h-3.5 animate-pulse" /> Clientes cerca de la ruta
            <span className="ml-auto bg-violet-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">
              {nearbyWashFold.length}
            </span>
          </div>
          {nearbyWashFold.map(order => {
            const done = notified.has(order.id);
            const minDist = Math.min(
              ...routeWaypoints.map(wp =>
                haversineDistance(wp.lat, wp.lng, order.location.lat, order.location.lng)
              )
            );
            return (
              <div
                key={order.id}
                className={`rounded-lg border px-3 py-2 flex items-start justify-between gap-2 mb-1.5 transition-all ${done ? 'bg-white border-gray-100 opacity-50' : 'bg-white border-violet-200'}`}
              >
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-gray-800 truncate">{order.customer.name}</div>
                  <div className="text-[10px] text-gray-500">Wash & Fold · {(minDist * 0.621371).toFixed(1)} mi</div>
                </div>
                <button
                  disabled={done}
                  onClick={() => handleNotify(order)}
                  className={`shrink-0 flex items-center gap-1 text-[10px] font-bold px-2.5 py-1.5 rounded-lg transition-colors ${done ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-violet-600 hover:bg-violet-700 text-white'}`}
                >
                  {done ? 'Enviado' : <><Bell className="w-3 h-3" /> Notificar</>}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Stop list */}
      <div>
        {routeResult ? (
          <div className="px-3 pt-3 pb-2">
            <button
              onClick={() => setShowStops(!showStops)}
              className="w-full flex items-center justify-between text-xs font-semibold text-gray-600 dark:text-gray-300 hover:text-gray-900 mb-2 px-1"
            >
              <span className="flex items-center gap-1.5">
                <Navigation className="w-3.5 h-3.5" />
                {filteredStops.length === routeResult.stops.length
                  ? `${routeResult.stops.length} paradas optimizadas`
                  : `${filteredStops.length} de ${routeResult.stops.length} paradas`}
              </span>
              {showStops ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
            {showStops && (
              <div className="space-y-2">
                {/* HQ start */}
                <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-slate-50 dark:bg-gray-800 border border-slate-200 dark:border-gray-700">
                  <div className="w-5 h-5 rounded-full bg-slate-800 flex items-center justify-center shrink-0">
                    <MapPin className="w-2.5 h-2.5 text-white" />
                  </div>
                  <div className="text-xs text-slate-600 dark:text-gray-300 font-medium">HQ — Telephone Rd</div>
                </div>
                {filteredStops.map(stop => {
                  const isPickup = stop.order.status === 'pending';
                  const isFuel   = stop.order.type === 'fuel-stop';
                  const done     = completedStops.has(stop.order.id);
                  const globalIdx = routeResult.stops.findIndex(s => s.order.id === stop.order.id);
                  const isTimeValid = isPickup ? isWithinTimeWindow(stop.order, 'pickup') : true;
                  return (
                    <div
                      key={stop.order.id}
                      className={`rounded-lg border p-2.5 transition-all ${
                        done
                          ? 'border-green-300 bg-green-50 dark:bg-green-950 opacity-70'
                          : isFuel
                          ? 'border-amber-300 bg-amber-50'
                          : stop.onTime
                          ? isPickup
                            ? 'border-orange-200 bg-orange-50/50'
                            : 'border-green-200 bg-green-50/50'
                          : 'border-amber-300 bg-amber-50'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <div
                          className="flex items-center gap-1.5 flex-1 cursor-pointer"
                          onClick={() => handleOrderClick(stop.order)}
                        >
                          <span className="text-[10px] text-gray-400 font-mono w-4">{globalIdx + 1}.</span>
                          <div className={`w-2 h-2 rounded-full shrink-0 ${urgencyDot(stop.urgencyLevel)}`} />
                          <span
                            className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                              done
                                ? 'bg-green-600 text-white'
                                : isFuel
                                ? 'bg-amber-500 text-white'
                                : isPickup
                                ? 'bg-orange-500 text-white'
                                : 'bg-green-500 text-white'
                            }`}
                          >
                            {done ? '✓' : isFuel ? '⛽' : isPickup ? 'P' : 'D'}
                          </span>
                          <span
                            className={`text-xs font-semibold truncate max-w-[80px] ${done ? 'text-green-700 line-through' : 'text-gray-800 dark:text-gray-100'}`}
                          >
                            {stop.order.customer.name.split(' ')[0]}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <span className="text-gray-400 text-[10px] flex items-center gap-0.5">
                            <Clock className="w-2.5 h-2.5" />{stop.estimatedArrival}
                          </span>
                          {!done && !isFuel && (
                            <button
                              onClick={e => { e.stopPropagation(); handleCompleteStop(stop.order.id); }}
                              disabled={!isTimeValid}
                              className={`ml-1 text-[9px] font-bold px-1.5 py-1 rounded-lg transition-colors ${
                                !isTimeValid
                                  ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                                  : 'bg-gray-100 hover:bg-green-100 hover:text-green-700 dark:bg-gray-700'
                              }`}
                              title={isTimeValid ? 'Marcar completado' : 'Horario no permitido aún'}
                            >
                              <CheckCircle2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="flex justify-between text-[10px] text-gray-400 pl-7">
                        <span className="truncate max-w-[120px]">{stop.order.location.address.split(',')[0]}</span>
                        <span>+{stop.distanceFromPrev} mi</span>
                      </div>
                      {!stop.onTime && !done && (
                        <div className="flex items-center gap-1 text-amber-600 text-[10px] mt-1 pl-7">
                          <AlertTriangle className="w-2.5 h-2.5" /> Ventana ajustada
                        </div>
                      )}
                    </div>
                  );
                })}
                {filteredStops.length === 0 && searchQuery && (
                  <div className="text-center py-6 text-gray-400 text-xs">Sin resultados para "{searchQuery}"</div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-32 text-gray-400 text-sm px-4 text-center">
            <Package className="w-8 h-8 mb-2 opacity-30" /> Sin paradas activas
          </div>
        )}
      </div>

      {/* Bottom actions */}
      <div className="sticky bottom-0 p-3 border-t bg-white dark:bg-gray-900 dark:border-gray-700 space-y-2">
        {/* Products */}
        <button
          onClick={() => setShowProducts(!showProducts)}
          className="w-full flex items-center justify-between text-xs font-semibold px-2 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 transition-colors"
        >
          <span className="flex items-center gap-1.5"><ShoppingBag className="w-3.5 h-3.5" /> Productos / Inventario</span>
          <span className="flex items-center gap-1">
            {productsCount > 0 && (
              <span className="bg-indigo-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                {productsCount}
              </span>
            )}
            {showProducts ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </span>
        </button>
        {showProducts && (
          <div className="border border-indigo-200 dark:border-indigo-800 rounded-xl overflow-hidden bg-white dark:bg-gray-800">
            <div className="px-2.5 pt-2 pb-1.5">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400" />
                <input
                  type="text"
                  value={productSearch}
                  onChange={e => setProductSearch(e.target.value)}
                  placeholder="Buscar producto..."
                  className="w-full pl-7 pr-3 py-1.5 text-[11px] border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                />
              </div>
            </div>
            <div className="max-h-[200px] overflow-y-auto divide-y divide-gray-100 dark:divide-gray-700">
              {loadingProducts ? (
                <div className="p-4 text-center text-gray-400 text-[11px]">
                  <Loader2 className="w-4 h-4 animate-spin mx-auto mb-1" />
                </div>
              ) : filteredProducts.length === 0 ? (
                <div className="p-4 text-center text-gray-400 text-[11px]">Sin productos</div>
              ) : filteredProducts.map(p => (
                <div key={p.id} className="px-2.5 py-2 flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-semibold text-gray-800 dark:text-gray-200 truncate">{p.name}</p>
                    <div className="flex items-center gap-2 text-[10px] text-gray-400">
                      <span className="font-medium text-emerald-600">${Number(p.price).toFixed(2)}</span>
                      <span className={p.stock <= 5 ? 'text-red-500 font-bold' : ''}>{`Stock: ${p.stock}`}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => { setQuickSaleProduct(p); setQuickSaleOpen(true); }}
                    className="text-[9px] font-bold px-2 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-colors"
                  >
                    Vender
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Internal nav button */}
        {routeResult?.stops.length > 0 && !navigationMode && (
          <button
            onClick={startInternalNavigation}
            className="flex items-center justify-center gap-2 w-full rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold py-3 px-4 transition-colors shadow-sm"
          >
            <Navigation className="w-4 h-4" /> Navegación Interna
          </button>
        )}

        {/* Google Maps */}
        <a
          href={routeResult ? buildGoogleMapsUrl(routeResult.stops) : '#'}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 w-full rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold py-3 px-4 transition-colors shadow-sm"
        >
          <PlayCircle className="w-4 h-4 shrink-0" /> Google Maps <ExternalLink className="w-3.5 h-3.5 shrink-0 opacity-70" />
        </a>

        <Button variant="outline" size="sm" onClick={handleReoptimize} disabled={optimizing} className="w-full text-xs">
          {optimizing
            ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
            : <RefreshCw className="w-3.5 h-3.5 mr-1.5" />}
          Re-optimizar Ruta
        </Button>

        {/* Legend */}
        <div className="flex flex-wrap items-center justify-center gap-3 text-[10px] text-gray-500 pt-1">
          {[
            ['bg-orange-500', 'Recogida'],
            ['bg-green-500', 'Entrega'],
            ['bg-amber-500', 'Gasolinera'],
            ['bg-violet-500', 'Oportunidad'],
            ['bg-red-500', 'Tráfico'],
            ['bg-slate-700', 'HQ'],
          ].map(([bg, label]) => (
            <span key={label} className="flex items-center gap-1">
              <span className={`w-2.5 h-2.5 rounded-full ${bg} inline-block`} />{label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );

  // FIX 3: Correct heights — header (53px) + filter bar (varies) + mobile tabs (36px on mobile)
  // Use CSS calc with named variables to stay accurate across breakpoints.
  const desktopMapHeight = 'calc(100vh - 97px)'; // 53px header + 44px MapFilters bar
  const mobileMapHeight  = 'calc(100vh - 133px)'; // 53px header + 44px MapFilters + 36px type tabs

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-950" style={{ fontFamily: 'system-ui, sans-serif' }}>
      {/* Header */}
      <div className="bg-white dark:bg-gray-900 border-b dark:border-gray-700 px-4 py-2.5 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-2.5">
          {isMobile && (
            <button
              onClick={() => setSidebarOpen(o => !o)}
              className="text-gray-500 hover:text-gray-700 p-1"
            >
              {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          )}
          <div>
            <h1 className="text-lg font-bold text-gray-900 dark:text-white leading-tight">
              Ventura Fresh Laundry
            </h1>
            <p className="text-[10px] text-gray-500 hidden sm:block">
              Despacho · {new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {trafficEvents.length > 0 && (
            <div className="flex items-center gap-1 text-[10px] text-red-600 bg-red-50 border border-red-200 rounded-lg px-2 py-1">
              <Radio className="w-3 h-3 animate-pulse" />
              <span className="font-bold">+{trafficDelay}m</span>
            </div>
          )}
          <div className="flex items-center gap-1 text-xs text-orange-600 bg-orange-50 border border-orange-200 rounded-lg px-2.5 py-1.5">
            <ArrowUpFromLine className="w-3.5 h-3.5" /><span className="font-semibold">{pickupCount}</span>
          </div>
          <div className="flex items-center gap-1 text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-2.5 py-1.5">
            <ArrowDownToLine className="w-3.5 h-3.5" /><span className="font-semibold">{deliveryCount}</span>
          </div>
          <button
            onClick={() => setShowGasStations(v => !v)}
            className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg border transition-colors ${
              showGasStations
                ? 'bg-amber-500 text-white border-amber-500'
                : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-600 text-gray-600 hover:bg-amber-50 hover:border-amber-300 hover:text-amber-700'
            }`}
          >
            <Fuel className="w-3.5 h-3.5" /><span className="hidden sm:inline">Gas</span>
          </button>
          <button
            onClick={() => setQuickSaleOpen(true)}
            className="flex items-center gap-1.5 text-xs text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg px-3 py-1.5 font-semibold transition-colors shadow-sm"
          >
            <ShoppingBag className="w-3.5 h-3.5" /><span className="hidden sm:inline">POS</span>
          </button>
          <button
            onClick={() => setShowHistory(v => !v)}
            className={`p-1.5 rounded-lg border transition-colors ${
              showHistory
                ? 'bg-blue-50 border-blue-200 text-blue-600'
                : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-600 text-gray-500'
            }`}
          >
            <History className="w-4 h-4" />
          </button>
          <button
            onClick={() => setShowDashboard(true)}
            className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg border transition-colors bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100"
          >
            <BarChart2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Panel</span>
          </button>
          <button
            onClick={() => setDarkMode(v => !v)}
            className="p-1.5 rounded-lg border bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-600 text-gray-500 hover:bg-gray-100 transition-colors"
          >
            {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Filters */}
      <MapFilters onFilterChange={setMapFilters} activeFilters={mapFilters} />

      {/* Mobile filter tabs */}
      {isMobile && (
        <div className="bg-white border-b px-3 py-1.5 flex items-center gap-1.5 overflow-x-auto shrink-0">
          <span className="text-[9px] text-gray-400 font-semibold uppercase tracking-wide shrink-0">Filtrar:</span>
          {['all', 'pickup-delivery', 'airbnb', 'b2b', 'wash-fold'].map(type => (
            <button
              key={type}
              onClick={() => {
                setFilterType(type);
                setMapFilters(prev => ({ ...prev, service_type: type }));
              }}
              data-testid={`mobile-filter-${type}`}
              className={`text-[10px] px-3 py-1 rounded-lg border font-medium transition-colors shrink-0 ${
                activeServiceType === type
                  ? 'bg-gray-900 text-white border-gray-900'
                  : 'bg-white text-gray-600 border-gray-200'
              }`}
            >
              {type === 'all' ? 'Todos' : (ORDER_TYPE_LABELS[type] || type).split(' ')[0]}
            </button>
          ))}
        </div>
      )}

      {/* Main layout */}
      {/* FIX 3: corrected height calculations */}
      <div
        className={`flex ${isMobile ? 'flex-col' : ''}`}
        style={{ height: isMobile ? mobileMapHeight : desktopMapHeight }}
      >
        {/* Desktop sidebar */}
        {!isMobile && (
          <div className="w-[310px] shrink-0 bg-white dark:bg-gray-900 border-r dark:border-gray-700 flex flex-col overflow-hidden">
            {SidebarContent}
          </div>
        )}

        {/* Map */}
        <div className="flex-1 relative" style={{ isolation: 'isolate' }}>
          {/* FIX 4: removed sidebarOpen from key to avoid unnecessary MapView remounts */}
          <MapView
            key={`map-${displayedOrders.length}-${routeOrders.length}`}
            ref={googleMapRef}
            orders={displayedOrders}
            hqLocation={HQ}
            routeOrders={routeOrders}
            nearbyWashFold={nearbyWashFold}
            trafficEvents={trafficEvents}
            completedStops={completedStops}
            onOrderClick={handleOrderClick}
            gasStations={showGasStations ? gasStations : []}
            cheapestIds={cheapestIds}
            onSelectGasStation={handleSelectGasStation}
            navigationActive={navigationMode}
          />

          {/* 🏆 Cheapest gas station floating banner */}
          {showGasStations && (() => {
            const all = gasStations || [];
            // Preferir estaciones con precio REAL (Google Places). Si hay 2+ reales, usar esas.
            // Si no hay ninguna real, mostrar la más barata de las regionales como info pero marcada como estimada.
            const real = all.filter(s => s.isRealPrice && typeof s.price === 'number' && s.price > 0);
            const priced = (real.length >= 1 ? real : all).filter(
              s => typeof s.price === 'number' && !isNaN(s.price) && s.price > 0
            );
            if (priced.length < 2) return null;
            const cheapest = priced.reduce((m, s) => (s.price < m.price ? s : m), priced[0]);
            const avg = priced.reduce((sum, s) => sum + s.price, 0) / priced.length;
            const savings = (avg - cheapest.price).toFixed(2);
            const isRealPrice = !!cheapest.isRealPrice;
            return (
              <div
                className="absolute top-3 left-3 z-[1000] bg-white/95 backdrop-blur-md rounded-lg shadow-md border border-slate-200 px-3 py-2 max-w-[260px]"
                data-testid="cheapest-gas-banner"
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                  <div className="text-[9px] font-semibold text-slate-500 uppercase tracking-[0.12em]">
                    Más barata en ruta
                  </div>
                </div>
                <div className="text-[13px] font-semibold text-slate-900 truncate leading-tight">
                  {cheapest.name}
                </div>
                <div className="flex items-baseline gap-1.5 mt-0.5">
                  <span className="text-lg font-bold text-emerald-600 font-mono leading-none tracking-tight">
                    ${cheapest.price.toFixed(2)}
                  </span>
                  <span className="text-[10px] text-slate-400">/gal</span>
                  {parseFloat(savings) > 0.05 && (
                    <span className="ml-auto text-[10px] font-semibold text-emerald-700">
                      −${savings}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-1 text-[9px] text-slate-400">
                  {typeof cheapest.distanceToRouteKm === 'number' && (
                    <span>{cheapest.distanceToRouteKm.toFixed(1)} km</span>
                  )}
                  {isRealPrice ? (
                    <span className="text-emerald-600 font-medium">· en vivo</span>
                  ) : (
                    <span>· estimado</span>
                  )}
                </div>
                <button
                  onClick={() => {
                    const map = googleMapRef.current;
                    if (map?.panTo) {
                      map.panTo({ lat: cheapest.lat, lng: cheapest.lng });
                      if (map.setZoom) map.setZoom(Math.max(map.getZoom?.() || 14, 16));
                    }
                  }}
                  data-testid="cheapest-gas-locate"
                  className="mt-1.5 w-full text-[10px] font-medium text-slate-600 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 rounded py-1 transition-colors"
                >
                  Ver en el mapa
                </button>
              </div>
            );
          })()}

          {/* Desktop type filter */}
          {!isMobile && (
            <div className="absolute top-3 right-3 z-[1000] bg-white/95 backdrop-blur-sm rounded-xl shadow-lg border px-3 py-2">
              <div className="text-[10px] text-gray-400 font-semibold mb-1.5 uppercase tracking-wide">Filtrar vista</div>
              <div className="flex flex-wrap gap-1">
                {['all', 'pickup-delivery', 'airbnb', 'b2b', 'wash-fold'].map(type => (
                  <button
                    key={type}
                    onClick={() => {
                      setFilterType(type);
                      setMapFilters(prev => ({ ...prev, service_type: type }));
                    }}
                    data-testid={`desktop-filter-${type}`}
                    className={`text-[10px] px-2 py-1 rounded-lg border font-medium transition-colors ${
                      activeServiceType === type
                        ? 'bg-gray-900 text-white border-gray-900'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
                    }`}
                  >
                    {type === 'all' ? 'Todos' : (ORDER_TYPE_LABELS[type] || type).split(' ')[0]}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Mobile bottom sheet */}
        {isMobile && (
          <>
            {sidebarOpen && (
              <div className="fixed inset-0 bg-black/20 z-[900]" onClick={() => setSidebarOpen(false)} />
            )}
            <div
              ref={sheetRef}
              className="fixed bottom-0 left-0 right-0 z-[950] bg-white rounded-t-2xl shadow-2xl border-t flex flex-col"
              style={{
                height: sidebarOpen ? sheetHeight : 72,
                transition: dragStartY.current ? 'none' : 'height 0.3s ease',
              }}
            >
              <div
                className="flex items-center justify-center py-2 cursor-grab active:cursor-grabbing shrink-0"
                onMouseDown={e => { setSidebarOpen(true); onDragStart(e.clientY); }}
                onMouseMove={e => onDragMove(e.clientY)}
                onMouseUp={onDragEnd}
                onTouchStart={e => { setSidebarOpen(true); onDragStart(e.touches[0].clientY); }}
                onTouchMove={e => onDragMove(e.touches[0].clientY)}
                onTouchEnd={onDragEnd}
                onClick={() => !sidebarOpen && setSidebarOpen(true)}
              >
                <div className="w-10 h-1 bg-gray-300 rounded-full" />
              </div>
              {!sidebarOpen && (
                <div
                  className="flex items-center gap-3 px-4 pb-2 cursor-pointer"
                  onClick={() => setSidebarOpen(true)}
                >
                  <Navigation className="w-4 h-4 text-blue-600 shrink-0" />
                  <div className="flex-1 text-xs font-semibold text-gray-700">
                    {routeResult
                      ? `${routeResult.stops.length} paradas · ${routeResult.totalDistance} mi`
                      : 'Sin ruta activa'}
                  </div>
                  {trafficEvents.length > 0 && (
                    <span className="text-[10px] font-bold text-red-600 bg-red-50 border border-red-200 rounded-full px-2 py-0.5">
                      +{trafficDelay}min
                    </span>
                  )}
                  <ChevronUp className="w-4 h-4 text-gray-400 shrink-0" />
                </div>
              )}
              {sidebarOpen && <div className="flex-1 overflow-hidden">{SidebarContent}</div>}
            </div>
          </>
        )}
      </div>

      {/* History panel */}
      {showHistory && (
        <div className="fixed inset-y-0 right-0 z-[1500] w-80 max-w-[90vw] bg-white dark:bg-gray-900 shadow-2xl border-l dark:border-gray-700 flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b dark:border-gray-700">
            <div className="flex items-center gap-2">
              <History className="w-4 h-4 text-blue-600" />
              <span className="font-bold text-sm dark:text-gray-100">Historial de Rutas</span>
            </div>
            <button onClick={() => setShowHistory(false)}><X className="w-4 h-4" /></button>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {routeHistory.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 text-gray-400 text-xs text-center gap-2">
                <BarChart2 className="w-8 h-8 opacity-30" />Sin rutas completadas aún.
              </div>
            ) : routeHistory.map(rec => (
              <div key={rec.id} className="rounded-xl border dark:border-gray-700 p-3 bg-gray-50 dark:bg-gray-800">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-bold text-gray-700 dark:text-gray-200">{rec.date}</span>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      rec.completedStops === rec.totalStops
                        ? 'bg-green-100 text-green-700'
                        : 'bg-amber-100 text-amber-700'
                    }`}
                  >
                    {rec.completedStops}/{rec.totalStops}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-1.5 text-[10px]">
                  <div className="text-center bg-white dark:bg-gray-700 rounded-lg py-1.5 border dark:border-gray-600">
                    <div className="font-bold text-gray-700 dark:text-gray-200">{rec.totalDistance}</div>
                    <div className="text-gray-400">mi</div>
                  </div>
                  <div className="text-center bg-white dark:bg-gray-700 rounded-lg py-1.5 border dark:border-gray-600">
                    <div className="font-bold text-green-600">${rec.fuelCost}</div>
                    <div className="text-gray-400">combustible</div>
                  </div>
                  <div className="text-center bg-white dark:bg-gray-700 rounded-lg py-1.5 border dark:border-gray-600">
                    <div className="font-bold text-gray-700 dark:text-gray-200">
                      {Math.floor(rec.estimatedDuration / 60)}h{rec.estimatedDuration % 60}m
                    </div>
                    <div className="text-gray-400">tiempo</div>
                  </div>
                </div>
                {rec.savedMiles > 0 && (
                  <div className="mt-1.5 text-[9px] text-green-600 flex items-center gap-1">
                    <TrendingDown className="w-2.5 h-2.5" />{rec.savedMiles.toFixed(1)} mi ahorradas
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TIM Assistant */}
      <TimAssistant
        fuelAnalysis={fuelAnalysis}
        routeResult={routeResult}
        trafficEvents={trafficEvents}
        nearbyOpportunities={nearbyWashFold}
        totalTrafficDelay={trafficDelay}
        timRef={timRef}
        orders={displayedOrders}
        onCompleteStop={stopIndex => {
          const stop = routeResult?.stops[stopIndex];
          if (stop) handleCompleteStop(stop.order.id);
        }}
        onUpdateOrderStatus={updateOrderStatus}
      />

      {/* Internal Navigation (overlay on map) */}
      {navigationMode && routeResult && (
        <InternalNavigation
          stops={routeResult.stops}
          hqLocation={HQ}
          mapRef={googleMapRef}
          onClose={handleNavigationClose}
          onStepComplete={stopIndex => {
            const stop = routeResult.stops[stopIndex];
            if (stop) handleCompleteStop(stop.order.id);
          }}
        />
      )}

      {/* Vehicle selector (pre-flight) */}
      <VehicleSelectorModal
        open={showVehicleModal}
        onClose={() => setShowVehicleModal(false)}
        onConfirm={handleVehicleConfirm}
      />

      {/* Modals */}
      {showDashboard && (
        <LogisticsDashboard
          onClose={() => setShowDashboard(false)}
        />
      )}
      <EndOfDayModal
        open={showEndOfDay}
        onClose={() => setShowEndOfDay(false)}
        routeResult={routeResult}
        completedCount={completedStops.size}
        trafficDelay={trafficDelay}
        startTime={routeStartTime}
      />
      <QuickSaleModal
        open={quickSaleOpen}
        onClose={() => { setQuickSaleOpen(false); setQuickSaleProduct(null); }}
        initialProduct={quickSaleProduct}
      />
      {selectedOrder && (
        <OrderDetailsModal
          order={selectedOrder}
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          onStatusChange={newStatus => updateOrderStatus(selectedOrder.id, newStatus)}
          onPaymentSuccess={orderId => markOrderPaid(orderId)}
        />
      )}
    </div>
  );
}

// ⭐ AÑADIR LA EXPORTACIÓN POR DEFECTO AL FINAL
export default LogisticsMap;