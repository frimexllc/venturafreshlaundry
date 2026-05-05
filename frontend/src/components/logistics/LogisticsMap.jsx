// ═══════════════════════════════════════════════════════════════════════
// LogisticsMap.jsx — with gas stations selection + internal navigation (optimized)
// ═══════════════════════════════════════════════════════════════════════

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { OrderDetailsModal } from './OrderDetailsModal';
import { EndOfDayModal } from './EndOfDayModal';
import { MapView } from './MapView';
import { TimAssistant } from './TimAssistant';
import { QuickSaleModal } from './QuickSaleModal';
import MapFilters from '../MapFilters';
import { InternalNavigation } from './InternalNavigation';   // ← nuevo
import {
  Navigation, Package, Loader2, Clock, TrendingDown, AlertTriangle,
  ChevronDown, ChevronUp, ExternalLink, PlayCircle, RefreshCw,
  ArrowDownToLine, ArrowUpFromLine, MapPin, Bell, BellRing, Zap, Radio,
  Menu, X, CheckCircle2, Search, Moon, Sun, BarChart2, History, ShoppingBag,
  Fuel,
} from 'lucide-react';
import {
  MOCK_ORDERS, ORDER_TYPE_LABELS, ORDER_STATUS_LABELS,
  optimizeRouteAdvanced, haversineDistance, mapBackendOrder,
} from '../../utils/orders';
import { getCurrentTrafficEvents, totalTrafficDelay, SEVERITY_COLORS, SEVERITY_LABELS } from '../../utils/traffic';
import { requestNotificationPermission } from '../../utils/notifications';
import { saveRouteRecord, loadRouteHistory } from '../../utils/routeHistory';
import { toast } from 'sonner';
import { useGasStations, GasStationsSidebar, analyzeBestFuelStop } from './GasStations';

const API_URL = process.env.REACT_APP_BACKEND_URL;
const NEARBY_THRESHOLD_KM = 1.2;
const HQ = { lat: 34.264157, lng: -119.213715 };
const TRAFFIC_REFRESH_MS = 5 * 60 * 1000;

// ========== FUNCIONES AVANZADAS PARA HORARIOS (UNIFICADAS) ==========
function parseFlexibleTime(timeStr) {
  if (!timeStr || typeof timeStr !== 'string') return null;
  const str = timeStr.trim().toLowerCase();
  
  const keywords = {
    'morning': { hours: 8, minutes: 0 },
    'afternoon': { hours: 14, minutes: 0 },
    'evening': { hours: 18, minutes: 0 },
    'night': { hours: 20, minutes: 0 },
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
  let timeStr = null;
  if (type === 'pickup') timeStr = schedule.pickupTime;
  else if (type === 'delivery') timeStr = schedule.deliveryTime;
  if (!timeStr) return true;
  
  const parsed = parseFlexibleTime(timeStr);
  if (!parsed) return true;
  
  const scheduled = new Date(currentTime);
  scheduled.setHours(parsed.hours, parsed.minutes, 0, 0);
  const diffMinutes = (currentTime - scheduled) / 60000;
  return diffMinutes >= -15;
}

function filterOrdersByTimeWindow(orders, timeWindow) {
  if (!timeWindow || typeof timeWindow !== 'string') return orders;
  
  let startMinutes, endMinutes;
  
  if (timeWindow === 'morning') {
    startMinutes = 8 * 60;
    endMinutes = 12 * 60;
  } else if (timeWindow === 'afternoon') {
    startMinutes = 14 * 60;
    endMinutes = 18 * 60;
  } else {
    const [startStr, endStr] = timeWindow.split('-');
    if (!startStr || !endStr) return orders;
    const start = parseFlexibleTime(startStr.trim());
    const end = parseFlexibleTime(endStr.trim());
    if (!start || !end) return orders;
    startMinutes = start.hours * 60 + start.minutes;
    endMinutes = end.hours * 60 + end.minutes;
  }
  
  return orders.filter(order => {
    let timeStr = null;
    if (order.status === 'pending') timeStr = order.schedule?.pickupTime;
    else if (order.status === 'ready') timeStr = order.schedule?.deliveryTime;
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
  const waypoints = stops.slice(0, -1).map((s) => `${s.order.location.lat},${s.order.location.lng}`).join('|');
  const params = new URLSearchParams({ origin, destination, travelmode: 'driving' });
  if (waypoints) params.set('waypoints', waypoints);
  return `https://www.google.com/maps/dir/?api=1&${params.toString()}`;
}

// ========== OPTIMIZACIÓN CON PARÁMETROS REALES ==========
function optimizeOrders(allOrders, vehicleMpg, fuelPrice) {
  const routeOrders = allOrders.filter((o) => (o.status === 'pending' || o.status === 'ready') && o.type !== 'wash-fold');
  if (routeOrders.length === 0) return null;
  return optimizeRouteAdvanced(routeOrders, HQ, vehicleMpg, fuelPrice);
}

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' ? window.innerWidth < 768 : false);
  useEffect(() => { const handler = () => setIsMobile(window.innerWidth < 768); window.addEventListener('resize', handler); return () => window.removeEventListener('resize', handler); }, []);
  return isMobile;
}

const SEVERITY_BG = { light: 'bg-yellow-50 border-yellow-300', moderate: 'bg-orange-50 border-orange-300', heavy: 'bg-red-50 border-red-400' };

export function LogisticsMap() {
  const [orders, setOrders] = useState(MOCK_ORDERS);
  const [mapFilters, setMapFilters] = useState({});
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [routeResult, setRouteResult] = useState(null);
  const [showStops, setShowStops] = useState(true);
  const [filterType, setFilterType] = useState('all');
  const [optimizing, setOptimizing] = useState(false);
  const [notified, setNotified] = useState(new Set());
  const [trafficEvents, setTrafficEvents] = useState([]);
  const [showTraffic, setShowTraffic] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sheetHeight, setSheetHeight] = useState(260);
  const [completedStops, setCompletedStops] = useState(new Set());
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('vfl-dark') === '1');
  const [searchQuery, setSearchQuery] = useState('');
  const [showEndOfDay, setShowEndOfDay] = useState(false);
  const [routeStartTime] = useState(Date.now());
  const [showHistory, setShowHistory] = useState(false);
  const [routeHistory, setRouteHistory] = useState([]);
  const [loadingBackend, setLoadingBackend] = useState(true);
  const isMobile = useIsMobile();
  const sheetRef = useRef(null);
  const dragStartY = useRef(null);
  const dragStartH = useRef(260);
  const timRef = useRef(null);
  const prevHeavyRef = useRef(new Set());
  const [quickSaleOpen, setQuickSaleOpen] = useState(false);
  const [quickSaleProduct, setQuickSaleProduct] = useState(null);
  const [showProducts, setShowProducts] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const [productsList, setProductsList] = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const googleMapRef = useRef(null);   // ← nueva referencia para el mapa

  // ========== LOGÍSTICA REAL: MPG y precio combustible ==========
  const [vehicleMpg, setVehicleMpg] = useState(12);
  const [fuelPrice, setFuelPrice] = useState(4.89);
  const [loadingSettings, setLoadingSettings] = useState(true);

  // ========== GASOLINERAS ==========
  const [showGasStations, setShowGasStations] = useState(false);
  const [navigationMode, setNavigationMode] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);

  // Waypoints de la ruta (para tráfico y gasolineras)
  const routeWaypoints = useMemo(() => {
    const routeOrdersList = routeResult?.stops.map(s => s.order) ?? [];
    return [HQ, ...routeOrdersList.map(o => ({ lat: o.location.lat, lng: o.location.lng }))];
  }, [routeResult]);

  // Obtener MPG y precio desde el backend
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      setLoadingSettings(false);
      return;
    }
    fetch(`${API_URL}/api/logistics/settings`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(data => {
        if (data.vehicle_mpg) setVehicleMpg(data.vehicle_mpg);
        if (data.fuel_price_per_gallon) setFuelPrice(data.fuel_price_per_gallon);
      })
      .catch(console.error)
      .finally(() => setLoadingSettings(false));
  }, []);

  // Hook de gasolineras con valores reales
  const { stations: gasStations, loading: gasLoading, error: gasError, basePrice, cheapestIds, fuelAnalysis } = useGasStations(
    HQ, routeWaypoints, showGasStations, vehicleMpg, fuelPrice
  );

  // Dark mode
  useEffect(() => {
    if (darkMode) { document.documentElement.classList.add('dark'); localStorage.setItem('vfl-dark', '1'); }
    else { document.documentElement.classList.remove('dark'); localStorage.setItem('vfl-dark', '0'); }
  }, [darkMode]);

  // Load route history
  useEffect(() => { setRouteHistory(loadRouteHistory()); }, []);

  // Load products
  useEffect(() => {
    if (!showProducts || productsList.length > 0) return;
    setLoadingProducts(true);
    fetch(`${API_URL}/api/store/products`)
      .then(r => r.ok ? r.json() : [])
      .then(d => setProductsList(Array.isArray(d) ? d : []))
      .catch(() => {})
      .finally(() => setLoadingProducts(false));
  }, [showProducts, productsList.length]);

  // Notifications permission
  useEffect(() => { requestNotificationPermission(); }, []);

  // Toast para tráfico pesado
  useEffect(() => {
    const heavyNow = new Set(trafficEvents.filter(e => e.severity === 'heavy').map(e => e.id));
    const newHeavy = trafficEvents.filter(e => e.severity === 'heavy' && !prevHeavyRef.current.has(e.id));
    if (newHeavy.length > 0) {
      toast.warning(`🚨 Tráfico pesado: ${newHeavy.map(e => e.road).join(', ')} — +${newHeavy.reduce((s, e) => s + e.delayMinutes, 0)} min de retraso.`, {
        duration: 8000,
      });
    }
    prevHeavyRef.current = heavyNow;
  }, [trafficEvents]);

  const loadOrders = useCallback(() => {
    const token = localStorage.getItem('token');
    if (!token || !API_URL) { setLoadingBackend(false); return; }
    const params = new URLSearchParams();
    if (mapFilters.date) params.set('date', mapFilters.date);
    if (mapFilters.time_window) params.set('time_window', mapFilters.time_window);
    const qs = params.toString();
    fetch(`${API_URL}/api/logistics/orders${qs ? `?${qs}` : ''}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(data => {
        const arr = Array.isArray(data) ? data : [];
        let mapped = arr.map(o => ({
          ...o,
          _backendId: o.id,
          pricing: o.pricing || { subtotal: 0, tax: 0, total: 0 },
          payment: o.payment || { method: 'card', status: 'pending' },
          schedule: o.schedule || { pickupDate: '', pickupTime: '', deliveryDate: '', deliveryTime: '' },
        }));
        console.log('📦 Órdenes cargadas desde backend:', mapped.length);
        const antes = mapped.length;
        mapped = filterOrdersByTimeWindow(mapped, mapFilters.time_window);
        console.log(`⏰ Filtro horario local: ${antes} → ${mapped.length} (time_window=${mapFilters.time_window})`);
        setOrders(mapped);
      })
      .catch(() => { /* mantener mock orders */ })
      .finally(() => setLoadingBackend(false));
  }, [mapFilters]);

  useEffect(() => { loadOrders(); }, [loadOrders]);

  // Traffic refresh (con waypoints reales)
  useEffect(() => {
    const token = localStorage.getItem('token');
    const refresh = async () => {
      if (!token || !API_URL) {
        const events = getCurrentTrafficEvents();
        setTrafficEvents(events);
        return;
      }
      try {
        const res = await fetch(`${API_URL}/api/traffic/incidents`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          const events = data.events || [];
          setTrafficEvents(events);
          if (events.some((e) => e.severity === 'heavy')) {
            toast.warning(`Trafico pesado: ${events.filter((e) => e.severity === 'heavy').map((e) => e.road).join(', ')}. TIM recomienda re-optimizar.`, { duration: 6000 });
          }
          return;
        }
      } catch { /* fallback */ }
      const events = getCurrentTrafficEvents();
      setTrafficEvents(events);
    };
    refresh();
    const interval = setInterval(refresh, TRAFFIC_REFRESH_MS);
    return () => clearInterval(interval);
  }, []);

  // Filtrado por fecha/horario
  const filteredByDateAndTime = useMemo(() => {
    let result = orders;
    if (mapFilters.date) {
      result = result.filter(order => {
        const pickupDate = order.schedule?.pickupDate || order.pickup_date || order.pickupDate;
        const deliveryDate = order.schedule?.deliveryDate || order.delivery_date || order.deliveryDate;
        return pickupDate === mapFilters.date || deliveryDate === mapFilters.date;
      });
      console.log(`📅 Filtro fecha: ${mapFilters.date} → ${result.length} órdenes restantes`);
    }
    if (mapFilters.time_window) {
      const antes = result.length;
      result = filterOrdersByTimeWindow(result, mapFilters.time_window);
      console.log(`⏰ Filtro horario local (post-fecha): ${antes} → ${result.length} (time_window=${mapFilters.time_window})`);
    }
    return result;
  }, [orders, mapFilters]);

  const displayedOrders = filterType === 'all' 
    ? filteredByDateAndTime 
    : filteredByDateAndTime.filter((o) => o.type === filterType);

  console.log(`🗺️ Órdenes mostradas en mapa: ${displayedOrders.length}`);

  const pickupCount = displayedOrders.filter((o) => o.status === 'pending' && o.type !== 'wash-fold').length;
  const deliveryCount = displayedOrders.filter((o) => o.status === 'ready' && o.type !== 'wash-fold').length;
  
  // Cálculo de retraso por tráfico SÓLO incidentes cerca de la ruta
  const trafficDelay = totalTrafficDelay(trafficEvents, routeWaypoints, 3.0);
  const filteredProducts = productSearch.trim() ? productsList.filter(p => p.name?.toLowerCase().includes(productSearch.toLowerCase())) : productsList;
  const productsCount = productsList.length;

  // Re-optimizar ruta cuando cambian órdenes o configuración real
  useEffect(() => {
    if (!loadingBackend && !loadingSettings) {
      const result = optimizeOrders(displayedOrders, vehicleMpg, fuelPrice);
      setRouteResult(result);
    }
  }, [loadingBackend, loadingSettings, displayedOrders, vehicleMpg, fuelPrice]);

  // Forzar resize del mapa
  useEffect(() => {
    const timer = setTimeout(() => window.dispatchEvent(new Event('resize')), 100);
    return () => clearTimeout(timer);
  }, [sidebarOpen, sheetHeight, displayedOrders]);

  // ========== SELECCIÓN DE GASOLINERA DESDE EL MAPA ==========
  function findBestInsertIndex(station, stops, hq) {
    let bestIdx = stops.length;
    let minExtraDist = Infinity;
    const stationLatLng = { lat: station.lat, lng: station.lng };
    for (let i = 0; i <= stops.length; i++) {
      const prev = i === 0 ? hq : stops[i-1].order.location;
      const next = i === stops.length ? null : stops[i].order.location;
      let extra = 0;
      if (prev && next) {
        const origDist = haversineDistance(prev.lat, prev.lng, next.lat, next.lng);
        const viaDist = haversineDistance(prev.lat, prev.lng, stationLatLng.lat, stationLatLng.lng) +
                        haversineDistance(stationLatLng.lat, stationLatLng.lng, next.lat, next.lng);
        extra = viaDist - origDist;
      } else if (prev && !next) {
        extra = haversineDistance(prev.lat, prev.lng, stationLatLng.lat, stationLatLng.lng);
      }
      if (extra < minExtraDist) {
        minExtraDist = extra;
        bestIdx = i;
      }
    }
    return bestIdx;
  }

  const handleSelectGasStation = (station) => {
    if (!routeResult) return;
    // Crear una orden ficticia para la gasolinera (tipo especial)
    const fuelOrder = {
      id: `fuel-${station.id}`,
      orderNumber: `GAS-${station.name.slice(0,6).toUpperCase()}`,
      type: 'fuel-stop',
      status: 'ready', // se comporta como una entrega más
      customer: { name: station.name, phone: '', email: '' },
      location: { lat: station.lat, lng: station.lng, address: station.name, zipCode: '' },
      schedule: { pickupTime: '', deliveryTime: '' },
      specialInstructions: `Gasolinera - Precio $${station.price}/gal`,
      pricing: { subtotal: 0, tax: 0, total: 0 },
    };
    const currentStops = [...routeResult.stops];
    const insertIndex = findBestInsertIndex(station, currentStops, HQ);
    // Insertar la nueva parada
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
    // Recalcular toda la ruta con el nuevo conjunto de órdenes (incluye la gasolinera)
    const allOrdersForRoute = currentStops.map(s => s.order);
    const newRoute = optimizeRouteAdvanced(allOrdersForRoute, HQ, vehicleMpg, fuelPrice);
    if (newRoute) {
      setRouteResult(newRoute);
      toast.success(`Gasolinera ${station.name} añadida a la ruta. Ahorro estimado: $${station.savings || '?'}`);
      // Salir del modo navegación si estaba activo
      setNavigationMode(false);
      setCurrentStep(0);
    } else {
      toast.error('No se pudo recalcular la ruta con la gasolinera');
    }
  };

  // ========== NAVEGACIÓN INTERNA (simplificada) ==========
  function startInternalNavigation() {
    if (routeResult && routeResult.stops.length) {
      setNavigationMode(true);
      setCurrentStep(0);
      // El panel InternalNavigation se encarga de todo
    } else {
      toast.info('No hay ruta activa para navegar');
    }
  }

  function nextStep() {
    if (!routeResult) return;
    if (currentStep + 1 < routeResult.stops.length) {
      setCurrentStep(currentStep + 1);
      toast.success(`Siguiente parada: ${routeResult.stops[currentStep+1].order.customer?.name || 'Gasolinera'}`);
    } else {
      setNavigationMode(false);
      toast.success('Ruta completada. ¡Buen trabajo!');
      if (routeResult) {
        // Registrar ruta completada
        saveRouteRecord({
          date: new Date().toLocaleDateString('es-MX'),
          totalStops: routeResult.stops.length,
          completedStops: routeResult.stops.length,
          totalDistance: routeResult.totalDistance,
          estimatedDuration: routeResult.estimatedDuration,
          fuelCost: routeResult.estimatedFuelCost,
          savedMiles: routeResult.savedMiles,
          trafficDelay,
        });
        setRouteHistory(loadRouteHistory());
      }
    }
  }

  // ========== HANDLERS EXISTENTES ==========
  function handleReoptimize() {
    setOptimizing(true);
    setTimeout(() => {
      const result = optimizeOrders(displayedOrders, vehicleMpg, fuelPrice);
      setRouteResult(result);
      setOptimizing(false);
      if (result) {
        const saved = result.savedMiles > 0 ? ` - ${result.savedMiles.toFixed(1)} mi ahorradas` : '';
        toast.success(`Ruta re-optimizada: ${result.stops.length} paradas - ${result.totalDistance} mi${saved}`);
        timRef.current?.sendProactive(`RUTA RE-OPTIMIZADA — ${result.stops.length} paradas, ${result.totalDistance} mi, ETA ${Math.floor(result.estimatedDuration / 60)}h ${result.estimatedDuration % 60}m.`);
      } else { toast.info('No hay paradas activas para optimizar'); }
    }, 600);
  }

  function handleCompleteStop(orderId) {
    const stop = routeResult?.stops.find(s => s.order.id === orderId);
    if (!stop) return;
    const order = stop.order;
    const isPickup = order.status === 'pending';
    const now = new Date();

    if (!isWithinTimeWindow(order, isPickup ? 'pickup' : 'delivery', now)) {
      const typeLabel = isPickup ? 'Recogida' : 'Entrega';
      const timeStr = isPickup ? order.schedule?.pickupTime : order.schedule?.deliveryTime;
      toast.error(`${typeLabel} programada a las ${timeStr || 'horario no definido'}. Aún no es la hora permitida (máximo 15 min antes).`);
      return;
    }

    setCompletedStops((prev) => {
      const next = new Set(prev).add(orderId);
      const total = routeResult?.stops.length ?? 0;
      if (total > 0 && next.size >= total) {
        if (routeResult) {
          saveRouteRecord({ date: new Date().toLocaleDateString('es-MX'), totalStops: total, completedStops: next.size, totalDistance: routeResult.totalDistance, estimatedDuration: routeResult.estimatedDuration, fuelCost: routeResult.estimatedFuelCost, savedMiles: routeResult.savedMiles, trafficDelay });
          setRouteHistory(loadRouteHistory());
        }
        setTimeout(() => { setShowEndOfDay(true); timRef.current?.sendProactive('RUTA COMPLETADA — Felicita brevemente al equipo.'); }, 400);
      }
      return next;
    });
    toast.success(`${isPickup ? 'Recogido' : 'Entregado'}: ${order.customer.name}`);
    setTimeout(() => window.dispatchEvent(new Event('resize')), 50);
  }

  function markOrderPaid(orderId) {
    setOrders((prev) => prev.map((o) => o.id === orderId ? { ...o, payment: { ...o.payment, status: 'paid' } } : o));
    setSelectedOrder((prev) => prev?.id === orderId ? { ...prev, payment: { ...prev.payment, status: 'paid' } } : prev);
    const order = orders.find((o) => o.id === orderId);
    toast.success(`Pago confirmado - ${order?.orderNumber ?? ''} - $${order?.pricing.total.toFixed(2) ?? ''}`);
  }

  function updateOrderStatus(orderId, newStatus) {
    setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, status: newStatus } : o)));
    setSelectedOrder((prev) => prev?.id === orderId ? { ...prev, status: newStatus } : prev);
    const token = localStorage.getItem('token');
    if (token) {
      fetch(`${API_URL}/api/logistics/orders/${orderId}/status`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: newStatus }),
      }).catch(() => {});
    }
    setTimeout(() => {
      setOrders((current) => { const result = optimizeOrders(current, vehicleMpg, fuelPrice); setRouteResult(result); return current; });
    }, 0);
    const label = ORDER_STATUS_LABELS[newStatus] ?? newStatus;
    toast.success(`Estado actualizado -> ${label}`);
  }

  function handleOrderClick(order) { setSelectedOrder(order); setModalOpen(true); }

  const routeOrders = routeResult?.stops.map((s) => s.order) ?? [];

  const nearbyWashFold = displayedOrders.filter((o) => {
    if (o.type !== 'wash-fold') return false;
    if (routeWaypoints.length < 2) return false;
    return Math.min(...routeWaypoints.map((wp) => haversineDistance(wp.lat, wp.lng, o.location.lat, o.location.lng))) <= NEARBY_THRESHOLD_KM;
  });

  function handleNotify(order) {
    setNotified((prev) => new Set(prev).add(order.id));
    toast.success(`Notificacion enviada a ${order.customer.name}: "Estamos cerca! Deseas agregar pickup?"`, { duration: 5000 });
  }

  const urgencyDot = (level) => ({ critical: 'bg-red-500', high: 'bg-amber-500', normal: 'bg-blue-500', flexible: 'bg-gray-300' }[level] ?? 'bg-gray-300');

  function onDragStart(clientY) { dragStartY.current = clientY; dragStartH.current = sheetHeight; }
  function onDragMove(clientY) { if (dragStartY.current === null) return; const delta = dragStartY.current - clientY; setSheetHeight(Math.max(80, Math.min(window.innerHeight * 0.85, dragStartH.current + delta))); }
  function onDragEnd() { dragStartY.current = null; if (sheetHeight < 150) setSheetHeight(80); }

  const filteredStops = routeResult?.stops.filter((s) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return s.order.customer.name.toLowerCase().includes(q) || s.order.location.address.toLowerCase().includes(q) || s.order.orderNumber.toLowerCase().includes(q);
  }) ?? [];

  const progressPct = routeResult ? Math.round((completedStops.size / routeResult.stops.length) * 100) : 0;

  // ========== SIDEBAR CONTENT (versión simplificada, sin navegación interna) ==========
  const SidebarContent = (
    <div className="h-full overflow-y-auto dark:bg-gray-900">
      <div className="px-3 pt-3 pb-2 border-b dark:border-gray-700">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Buscar cliente, direccion..." data-testid="sidebar-search" className="w-full pl-8 pr-8 py-1.5 text-xs border border-gray-200 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-800 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-400" />
          {searchQuery && <button onClick={() => setSearchQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"><X className="w-3 h-3" /></button>}
        </div>
      </div>
      {routeResult && (
        <div className="px-4 pt-4 pb-3 border-b dark:border-gray-700 bg-slate-50 dark:bg-gray-800">
          <div className="mb-3">
            <div className="flex items-center justify-between text-[10px] mb-1">
              <span className="text-gray-500 dark:text-gray-400 font-semibold">Progreso de ruta</span>
              <span className={`font-bold ${progressPct === 100 ? 'text-green-600' : 'text-blue-600'}`}>{completedStops.size}/{routeResult.stops.length} paradas ({progressPct}%)</span>
            </div>
            <div className="h-2 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
              <div className={`h-full rounded-full transition-all duration-500 ${progressPct === 100 ? 'bg-green-500' : 'bg-blue-500'}`} style={{ width: `${progressPct}%` }} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-white dark:bg-gray-700 rounded-lg border dark:border-gray-600 px-3 py-2"><div className="text-[10px] text-gray-400 font-medium uppercase tracking-wide">Distancia</div><div className="text-base font-bold text-gray-800 dark:text-gray-100">{routeResult.totalDistance} mi</div></div>
            <div className="bg-white dark:bg-gray-700 rounded-lg border dark:border-gray-600 px-3 py-2"><div className="text-[10px] text-gray-400 font-medium uppercase tracking-wide">Gasolina est.</div><div className="text-base font-bold text-green-700">${routeResult.estimatedFuelCost}</div></div>
            <div className="bg-white dark:bg-gray-700 rounded-lg border dark:border-gray-600 px-3 py-2"><div className="text-[10px] text-gray-400 font-medium uppercase tracking-wide">Tiempo est.</div><div className="text-base font-bold text-gray-800 dark:text-gray-100">{Math.floor((routeResult.estimatedDuration + trafficDelay) / 60)}h {(routeResult.estimatedDuration + trafficDelay) % 60}m{trafficDelay > 0 && <span className="ml-1 text-[10px] text-red-500 font-normal">(+{trafficDelay}min traf.)</span>}</div></div>
            <div className={`rounded-lg border px-3 py-2 ${routeResult.violations === 0 ? 'bg-white dark:bg-gray-700 dark:border-gray-600' : 'bg-amber-50 border-amber-300'}`}><div className="text-[10px] text-gray-400 font-medium uppercase tracking-wide">Ventanas</div><div className={`text-base font-bold ${routeResult.violations === 0 ? 'text-emerald-600' : 'text-amber-600'}`}>{routeResult.violations === 0 ? 'OK' : `${routeResult.violations} tarde`}</div></div>
          </div>
          {routeResult.savedMiles > 0 && (
            <div className="mt-2 flex items-center gap-1.5 text-xs text-green-700 bg-green-50 border border-green-100 rounded-lg px-2 py-1.5">
              <TrendingDown className="w-3 h-3 shrink-0" /> Ahorraste {routeResult.savedMiles.toFixed(1)} mi vs ruta simple
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
      {/* Tráfico */}
      {trafficEvents.length > 0 && (
        <div className="px-3 pt-3 pb-3 border-b bg-red-50" data-testid="traffic-alerts">
          <button onClick={() => setShowTraffic((v) => !v)} className="w-full flex items-center gap-1.5 text-xs font-semibold text-red-800 mb-2">
            <Radio className="w-3.5 h-3.5 animate-pulse" /> Alertas de trafico en tiempo real
            <span className="ml-1 bg-red-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">{trafficEvents.length}</span>
            <span className="ml-auto text-red-400">{showTraffic ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}</span>
          </button>
          {showTraffic && (
            <div className="space-y-1.5">
              {trafficEvents.map((event) => (
                <div key={event.id} className={`rounded-lg border px-2.5 py-2 flex items-start gap-2 ${SEVERITY_BG[event.severity]}`}>
                  <div className="w-2 h-2 rounded-full mt-0.5 shrink-0" style={{ background: SEVERITY_COLORS[event.severity] }} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5"><span className="text-[10px] font-bold text-gray-700 truncate">{event.road}</span><span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full text-white shrink-0" style={{ background: SEVERITY_COLORS[event.severity] }}>{SEVERITY_LABELS[event.severity]}</span></div>
                    <div className="text-[10px] text-gray-500 leading-tight">{event.description}</div>
                    <div className="text-[10px] font-semibold text-red-600 mt-0.5">+{event.delayMinutes} min de retraso</div>
                  </div>
                </div>
              ))}
              <button onClick={handleReoptimize} data-testid="reoptimize-traffic-btn" className="w-full mt-1 flex items-center justify-center gap-1.5 text-[10px] font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg py-1.5 transition-colors">
                <RefreshCw className="w-3 h-3" /> Ajustar ruta por trafico
              </button>
            </div>
          )}
          <p className="text-[9px] text-red-400 mt-2">Se actualiza cada 5 min - Impacto total: +{trafficDelay} min</p>
        </div>
      )}
      {/* Oportunidades cercanas */}
      {nearbyWashFold.length > 0 && (
        <div className="px-3 pt-3 pb-3 border-b bg-violet-50" data-testid="nearby-opportunities">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-violet-800 mb-2">
            <BellRing className="w-3.5 h-3.5 animate-pulse" /> Clientes cerca de tu ruta
            <span className="ml-auto bg-violet-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">{nearbyWashFold.length}</span>
          </div>
          <div className="space-y-2">
            {nearbyWashFold.map((order) => {
              const done = notified.has(order.id);
              const minDist = Math.min(...routeWaypoints.map((wp) => haversineDistance(wp.lat, wp.lng, order.location.lat, order.location.lng)));
              const distMi = (minDist * 0.621371).toFixed(1);
              return (
                <div key={order.id} className={`rounded-lg border px-3 py-2 flex items-start justify-between gap-2 transition-all ${done ? 'bg-white border-gray-100 opacity-50' : 'bg-white border-violet-200 shadow-sm'}`}>
                  <div className="min-w-0"><div className="text-xs font-semibold text-gray-800 truncate">{order.customer.name}</div><div className="text-[10px] text-gray-500">Wash &amp; Fold - a {distMi} mi</div></div>
                  <button disabled={done} onClick={() => handleNotify(order)} data-testid={`notify-${order.id}`} className={`shrink-0 flex items-center gap-1 text-[10px] font-bold px-2.5 py-1.5 rounded-lg transition-colors ${done ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-violet-600 hover:bg-violet-700 text-white'}`}>
                    {done ? 'Enviado' : <><Bell className="w-3 h-3" />Notificar</>}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {/* Lista de paradas */}
      <div>
        {routeResult ? (
          <div className="px-3 pt-3 pb-2">
            <button onClick={() => setShowStops(!showStops)} className="w-full flex items-center justify-between text-xs font-semibold text-gray-600 dark:text-gray-300 hover:text-gray-900 mb-2 px-1">
              <span className="flex items-center gap-1.5"><Navigation className="w-3.5 h-3.5" />{filteredStops.length === routeResult.stops.length ? `${routeResult.stops.length} paradas en orden optimo` : `${filteredStops.length} de ${routeResult.stops.length} paradas`}</span>
              {showStops ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
            {showStops && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-slate-50 dark:bg-gray-800 border border-slate-200 dark:border-gray-700">
                  <div className="w-5 h-5 rounded-full bg-slate-800 dark:bg-slate-600 flex items-center justify-center shrink-0"><MapPin className="w-2.5 h-2.5 text-white" /></div>
                  <div className="text-xs text-slate-600 dark:text-gray-300 font-medium">Inicio - HQ Telephone Rd</div>
                </div>
                {filteredStops.map((stop) => {
                  const isPickup = stop.order.status === 'pending';
                  const isFuel = stop.order.type === 'fuel-stop';
                  const done = completedStops.has(stop.order.id);
                  const globalIdx = routeResult.stops.findIndex(s => s.order.id === stop.order.id);
                  const isTimeValid = isPickup ? isWithinTimeWindow(stop.order, 'pickup') : true;
                  const primaryName = isFuel ? stop.order.customer.name : stop.order.customer.name.split(' ')[0];
                  return (
                    <div key={stop.order.id} data-testid={`stop-${globalIdx}`} className={`rounded-lg border p-2.5 transition-all ${done ? 'border-green-300 bg-green-50 dark:bg-green-950 opacity-70' : isFuel ? 'border-amber-300 bg-amber-50' : stop.onTime ? (isPickup ? 'border-orange-200 bg-orange-50/50' : 'border-green-200 bg-green-50/50') : 'border-amber-300 bg-amber-50'}`}>
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <div className="flex items-center gap-1.5 flex-1 cursor-pointer" onClick={() => handleOrderClick(stop.order)}>
                          <span className="text-[10px] text-gray-400 font-mono w-4">{globalIdx + 1}.</span>
                          <div className={`w-2 h-2 rounded-full shrink-0 ${urgencyDot(stop.urgencyLevel)}`} />
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${done ? 'bg-green-600 text-white' : isFuel ? 'bg-amber-500 text-white' : isPickup ? 'bg-orange-500 text-white' : 'bg-green-500 text-white'}`}>{done ? '\u2713' : isFuel ? '⛽' : isPickup ? 'P' : 'D'}</span>
                          <span className={`text-xs font-semibold truncate max-w-[70px] ${done ? 'text-green-700 dark:text-green-400 line-through' : 'text-gray-800 dark:text-gray-100'}`}>{primaryName}</span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <span className="text-gray-400 text-[10px] flex items-center gap-0.5"><Clock className="w-2.5 h-2.5" />{stop.estimatedArrival}</span>
                          {!done && !isFuel && (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleCompleteStop(stop.order.id); }}
                              disabled={!isTimeValid}
                              className={`ml-1 text-[9px] font-bold px-1.5 py-1 rounded-lg transition-colors ${
                                !isTimeValid
                                  ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                                  : 'bg-gray-100 hover:bg-green-100 hover:text-green-700 dark:bg-gray-700 dark:hover:bg-green-900'
                              }`}
                              title={isTimeValid ? (isPickup ? 'Marcar como recogido' : 'Marcar como entregado') : 'Horario no permitido aún'}
                            >
                              <CheckCircle2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="flex justify-between text-[10px] text-gray-400 pl-7"><span className="truncate max-w-[120px]">{stop.order.location.address.split(',')[0]}</span><span>+{stop.distanceFromPrev} mi</span></div>
                      {!stop.onTime && !done && <div className="flex items-center gap-1 text-amber-600 text-[10px] mt-1 pl-7"><AlertTriangle className="w-2.5 h-2.5" /> Ventana ajustada</div>}
                    </div>
                  );
                })}
                {filteredStops.length === 0 && searchQuery && <div className="text-center py-6 text-gray-400 text-xs">Sin resultados para "{searchQuery}"</div>}
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-32 text-gray-400 text-sm px-4 text-center"><Package className="w-8 h-8 mb-2 opacity-30" /> No hay paradas activas</div>
        )}
      </div>
      {/* Botones inferiores */}
      <div className="sticky bottom-0 p-3 border-t bg-white dark:bg-gray-900 dark:border-gray-700 space-y-2">
        <button onClick={() => setShowProducts(!showProducts)} data-testid="toggle-products-btn" className="w-full flex items-center justify-between text-xs font-semibold px-2 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 transition-colors">
          <span className="flex items-center gap-1.5"><ShoppingBag className="w-3.5 h-3.5" /> Productos / Inventario</span>
          <span className="flex items-center gap-1">{productsCount > 0 && <span className="bg-indigo-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">{productsCount}</span>}{showProducts ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}</span>
        </button>
        {showProducts && (
          <div className="border border-indigo-200 dark:border-indigo-800 rounded-xl overflow-hidden bg-white dark:bg-gray-800">
            <div className="px-2.5 pt-2 pb-1.5">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400" />
                <input type="text" value={productSearch} onChange={e => setProductSearch(e.target.value)} placeholder="Buscar producto..." data-testid="product-search" className="w-full pl-7 pr-3 py-1.5 text-[11px] border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-indigo-400" />
              </div>
            </div>
            <div className="max-h-[200px] overflow-y-auto divide-y divide-gray-100 dark:divide-gray-700" data-testid="product-list">
              {loadingProducts ? (
                <div className="p-4 text-center text-gray-400 text-[11px]"><Loader2 className="w-4 h-4 animate-spin mx-auto mb-1" /> Cargando...</div>
              ) : filteredProducts.length === 0 ? (
                <div className="p-4 text-center text-gray-400 text-[11px]">Sin productos</div>
              ) : filteredProducts.map(p => (
                <div key={p.id} className="px-2.5 py-2 flex items-center justify-between gap-2" data-testid={`product-item-${p.id}`}>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-semibold text-gray-800 dark:text-gray-200 truncate">{p.name}</p>
                    <div className="flex items-center gap-2 text-[10px] text-gray-400">
                      <span className="font-medium text-emerald-600">${Number(p.price).toFixed(2)}</span>
                      <span className={p.stock <= 5 ? 'text-red-500 font-bold' : ''}>{p.stock <= 5 ? `Stock: ${p.stock}` : `Stock: ${p.stock}`}</span>
                    </div>
                  </div>
                  <button onClick={() => { setQuickSaleProduct(p); setQuickSaleOpen(true); }} className="text-[9px] font-bold px-2 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-colors" data-testid={`product-sell-${p.id}`}>
                    Vender
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
        {/* Botón de navegación interna simplificado (solo cuando NO está activo) */}
        {routeResult && routeResult.stops.length > 0 && !navigationMode && (
          <button
            onClick={startInternalNavigation}
            className="flex items-center justify-center gap-2 w-full rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold py-3 px-4 transition-colors shadow-sm"
          >
            <Navigation className="w-4 h-4" /> Navegación Interna
          </button>
        )}
        <a href={routeResult && buildGoogleMapsUrl(routeResult.stops)} target="_blank" rel="noopener noreferrer" data-testid="google-maps-link" className="flex items-center justify-center gap-2 w-full rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold py-3 px-4 transition-colors shadow-sm">
          <PlayCircle className="w-4 h-4 shrink-0" /> Iniciar Recorrido en Google Maps <ExternalLink className="w-3.5 h-3.5 shrink-0 opacity-70" />
        </a>
        <Button variant="outline" size="sm" onClick={handleReoptimize} disabled={optimizing} data-testid="reoptimize-btn" className="w-full text-xs">
          {optimizing ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5 mr-1.5" />} Re-optimizar Ruta
        </Button>
        <div className="flex flex-wrap items-center justify-center gap-3 text-[10px] text-gray-500 pt-1">
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-orange-500 inline-block" />Recogida</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block" />Entrega</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" />Gasolinera</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-violet-500 inline-block" />Oportunidad</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" />Trafico</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-slate-700 inline-block" />HQ</span>
        </div>
      </div>
    </div>
  );

  // ========== RENDER PRINCIPAL ==========
  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-950" style={{ fontFamily: 'system-ui, sans-serif' }} data-testid="logistics-map-page">
      <div className="bg-white dark:bg-gray-900 dark:border-gray-700 border-b px-4 py-2.5 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-2.5">
          {isMobile && <button onClick={() => setSidebarOpen((o) => !o)} className="text-gray-500 hover:text-gray-700 p-1" data-testid="mobile-menu-btn">{sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}</button>}
          <div>
            <h1 className="text-lg font-bold text-gray-900 dark:text-white leading-tight">Ventura Fresh Laundry</h1>
            <p className="text-[10px] text-gray-500 hidden sm:block">Despacho de Rutas - {new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {trafficEvents.length > 0 && <div className="flex items-center gap-1 text-[10px] text-red-600 bg-red-50 border border-red-200 rounded-lg px-2 py-1"><Radio className="w-3 h-3 animate-pulse" /><span className="font-bold hidden sm:inline">Trafico</span><span className="font-bold">+{trafficDelay}m</span></div>}
          <div className="flex items-center gap-1 text-xs text-orange-600 bg-orange-50 border border-orange-200 rounded-lg px-2.5 py-1.5"><ArrowUpFromLine className="w-3.5 h-3.5" /><span className="font-semibold">{pickupCount}</span><span className="text-orange-500 hidden sm:inline">recogidas</span></div>
          <div className="flex items-center gap-1 text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-2.5 py-1.5"><ArrowDownToLine className="w-3.5 h-3.5" /><span className="font-semibold">{deliveryCount}</span><span className="text-green-600 hidden sm:inline">entregas</span></div>
          <button onClick={() => setShowGasStations(v => !v)} className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg border transition-colors ${showGasStations ? 'bg-amber-500 text-white border-amber-500' : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-amber-50 hover:border-amber-300 hover:text-amber-700'}`}>
            <Fuel className="w-3.5 h-3.5" /><span className="hidden sm:inline">⛽ Gas</span>
          </button>
          <button onClick={() => setQuickSaleOpen(true)} data-testid="quick-sale-btn" title="Venta en Tienda (POS)" className="flex items-center gap-1.5 text-xs text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 rounded-lg px-3 py-1.5 font-semibold transition-colors shadow-sm"><ShoppingBag className="w-3.5 h-3.5" /><span className="hidden sm:inline">Venta POS</span></button>
          <button onClick={() => setShowHistory((v) => !v)} data-testid="history-btn" title="Historial de rutas" className={`p-1.5 rounded-lg border transition-colors ${showHistory ? 'bg-blue-50 border-blue-200 text-blue-600' : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-100'}`}><History className="w-4 h-4" /></button>
          <button onClick={() => setDarkMode((v) => !v)} data-testid="dark-mode-btn" title={darkMode ? 'Modo dia' : 'Modo noche'} className="p-1.5 rounded-lg border bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">{darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}</button>
        </div>
      </div>
      <MapFilters onFilterChange={setMapFilters} activeFilters={mapFilters} />
      {isMobile && (
        <div className="bg-white border-b px-3 py-1.5 flex items-center gap-1.5 overflow-x-auto shrink-0">
          <span className="text-[9px] text-gray-400 font-semibold uppercase tracking-wide shrink-0">Filtrar:</span>
          {['all', 'pickup-delivery', 'airbnb', 'b2b', 'wash-fold'].map((type) => (
            <button key={type} onClick={() => setFilterType(type)} data-testid={`filter-${type}`} className={`text-[10px] px-3 py-1 rounded-lg border font-medium transition-colors shrink-0 ${filterType === type ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200'}`}>
              {type === 'all' ? 'Todos' : (ORDER_TYPE_LABELS[type] || type).split(' ')[0]}
            </button>
          ))}
        </div>
      )}
      <div className={`flex ${isMobile ? 'flex-col' : ''}`} style={{ height: isMobile ? 'calc(100vh - 98px)' : 'calc(100vh - 53px)' }}>
        {!isMobile && <div className="w-[310px] shrink-0 bg-white dark:bg-gray-900 border-r dark:border-gray-700 flex flex-col overflow-hidden">{SidebarContent}</div>}
        <div className="flex-1 relative" style={{ isolation: 'isolate' }}>
          <MapView
            key={`map-${displayedOrders.length}-${routeOrders.length}-${sidebarOpen}`}
            ref={googleMapRef}                         // ← nueva prop
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
            navigationActive={navigationMode}          // ← nueva prop (oculta polyline)
          />
          {!isMobile && (
            <div className="absolute top-3 right-3 z-[1000] bg-white/95 backdrop-blur-sm rounded-xl shadow-lg border px-3 py-2">
              <div className="text-[10px] text-gray-400 font-semibold mb-1.5 uppercase tracking-wide">Filtrar vista</div>
              <div className="flex flex-wrap gap-1">
                {['all', 'pickup-delivery', 'airbnb', 'b2b', 'wash-fold'].map((type) => (
                  <button key={type} onClick={() => setFilterType(type)} data-testid={`filter-${type}`} className={`text-[10px] px-2 py-1 rounded-lg border font-medium transition-colors ${filterType === type ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'}`}>
                    {type === 'all' ? 'Todos' : (ORDER_TYPE_LABELS[type] || type).split(' ')[0]}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        {isMobile && (
          <>
            {sidebarOpen && <div className="fixed inset-0 bg-black/20 z-[900]" onClick={() => setSidebarOpen(false)} />}
            <div ref={sheetRef} className="fixed bottom-0 left-0 right-0 z-[950] bg-white rounded-t-2xl shadow-2xl border-t flex flex-col" style={{ height: sidebarOpen ? sheetHeight : 72, transition: dragStartY.current ? 'none' : 'height 0.3s ease' }}>
              <div className="flex items-center justify-center py-2 cursor-grab active:cursor-grabbing shrink-0"
                onMouseDown={(e) => { setSidebarOpen(true); onDragStart(e.clientY); }} onMouseMove={(e) => onDragMove(e.clientY)} onMouseUp={onDragEnd}
                onTouchStart={(e) => { setSidebarOpen(true); onDragStart(e.touches[0].clientY); }} onTouchMove={(e) => onDragMove(e.touches[0].clientY)} onTouchEnd={onDragEnd}
                onClick={() => !sidebarOpen && setSidebarOpen(true)}
              ><div className="w-10 h-1 bg-gray-300 rounded-full" /></div>
              {!sidebarOpen && (
                <div className="flex items-center gap-3 px-4 pb-2 cursor-pointer" onClick={() => setSidebarOpen(true)}>
                  <Navigation className="w-4 h-4 text-blue-600 shrink-0" />
                  <div className="flex-1 text-xs font-semibold text-gray-700">{routeResult ? `${routeResult.stops.length} paradas - ${routeResult.totalDistance} mi` : 'Sin ruta activa'}</div>
                  {trafficEvents.length > 0 && <span className="text-[10px] font-bold text-red-600 bg-red-50 border border-red-200 rounded-full px-2 py-0.5">+{trafficDelay}min traf.</span>}
                  <ChevronUp className="w-4 h-4 text-gray-400 shrink-0" />
                </div>
              )}
              {sidebarOpen && <div className="flex-1 overflow-hidden">{SidebarContent}</div>}
            </div>
          </>
        )}
      </div>
      {showHistory && (
        <div className="fixed inset-y-0 right-0 z-[1500] w-80 max-w-[90vw] bg-white dark:bg-gray-900 shadow-2xl border-l dark:border-gray-700 flex flex-col" data-testid="history-panel">
          <div className="flex items-center justify-between px-4 py-3 border-b dark:border-gray-700">
            <div className="flex items-center gap-2"><History className="w-4 h-4 text-blue-600" /><span className="font-bold text-sm dark:text-gray-100">Historial de Rutas</span></div>
            <button onClick={() => setShowHistory(false)} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {routeHistory.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 text-gray-400 text-xs text-center gap-2"><BarChart2 className="w-8 h-8 opacity-30" />Sin rutas completadas aun.</div>
            ) : routeHistory.map((rec) => (
              <div key={rec.id} className="rounded-xl border dark:border-gray-700 p-3 bg-gray-50 dark:bg-gray-800">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-bold text-gray-700 dark:text-gray-200">{rec.date}</span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${rec.completedStops === rec.totalStops ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>{rec.completedStops}/{rec.totalStops}</span>
                </div>
                <div className="grid grid-cols-3 gap-1.5 text-[10px]">
                  <div className="text-center bg-white dark:bg-gray-700 rounded-lg py-1.5 border dark:border-gray-600"><div className="font-bold text-gray-700 dark:text-gray-200">{rec.totalDistance}</div><div className="text-gray-400">mi</div></div>
                  <div className="text-center bg-white dark:bg-gray-700 rounded-lg py-1.5 border dark:border-gray-600"><div className="font-bold text-green-600">${rec.fuelCost}</div><div className="text-gray-400">combustible</div></div>
                  <div className="text-center bg-white dark:bg-gray-700 rounded-lg py-1.5 border dark:border-gray-600"><div className="font-bold text-gray-700 dark:text-gray-200">{Math.floor(rec.estimatedDuration / 60)}h{rec.estimatedDuration % 60}m</div><div className="text-gray-400">tiempo</div></div>
                </div>
                {rec.savedMiles > 0 && <div className="mt-1.5 text-[9px] text-green-600 flex items-center gap-1"><TrendingDown className="w-2.5 h-2.5" />{rec.savedMiles.toFixed(1)} mi ahorradas</div>}
              </div>
            ))}
          </div>
        </div>
      )}
      <TimAssistant fuelAnalysis={fuelAnalysis} routeResult={routeResult} trafficEvents={trafficEvents} nearbyOpportunities={nearbyWashFold} totalTrafficDelay={trafficDelay} timRef={timRef} orders={displayedOrders}
        onCompleteStop={(stopIndex) => { const stop = routeResult?.stops[stopIndex]; if (stop) handleCompleteStop(stop.order.id); }}
        onUpdateOrderStatus={updateOrderStatus}
      />
      {/* Componente flotante de navegación interna */}
      {navigationMode && routeResult && (
        <InternalNavigation
          stops={routeResult.stops}
          hqLocation={HQ}
          mapRef={googleMapRef}
          onClose={() => {
            setNavigationMode(false);
            setCurrentStep(0);
          }}
          onStepComplete={(stopIndex) => {
            const stop = routeResult.stops[stopIndex];
            if (stop) handleCompleteStop(stop.order.id);
          }}
        />
      )}
      <EndOfDayModal open={showEndOfDay} onClose={() => setShowEndOfDay(false)} routeResult={routeResult} completedCount={completedStops.size} trafficDelay={trafficDelay} startTime={routeStartTime} />
      <QuickSaleModal open={quickSaleOpen} onClose={() => { setQuickSaleOpen(false); setQuickSaleProduct(null); }} initialProduct={quickSaleProduct} />
      {selectedOrder && (
        <OrderDetailsModal order={selectedOrder} open={modalOpen} onClose={() => setModalOpen(false)} onStatusChange={(newStatus) => updateOrderStatus(selectedOrder.id, newStatus)} onPaymentSuccess={(orderId) => markOrderPaid(orderId)} />
      )}
    </div>
  );
}