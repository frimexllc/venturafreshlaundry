import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Button } from '../ui/button';
import { OrderDetailsModal } from './OrderDetailsModal';
import { EndOfDayModal } from './EndOfDayModal';
import { MapView } from './MapView';
import { TimAssistant } from './TimAssistant';
import { InternalNavigation } from './InternalNavigation';
import VehicleSelectorModal from './VehicleSelectorModal';
import { LogisticsDashboard } from './LogisticsDashboard';
import {
  Navigation, Package, Loader2, MapPin, Zap,
  Menu, X, CheckCircle2, Search, Moon, Sun, BarChart2,
  Fuel, Filter, ChevronDown, PlayCircle, Clock,
} from 'lucide-react';
import {
  MOCK_ORDERS, ORDER_TYPE_LABELS, ORDER_STATUS_LABELS,
  optimizeRouteAdvanced, haversineDistance,
} from '../../utils/orders';
import { getCurrentTrafficEvents, totalTrafficDelay, SEVERITY_COLORS, SEVERITY_LABELS } from '../../utils/traffic';
import { saveRouteRecord, loadRouteHistory } from '../../utils/routeHistory';
import { toast } from 'sonner';
import { useGasStations } from './GasStations';
import MapFilters from '../MapFilters';

const API_URL = process.env.REACT_APP_BACKEND_URL;
const HQ = { lat: 34.264309036184606, lng: -119.21374270055239 };
const TRAFFIC_REFRESH_MS = 5 * 60 * 1000;

const SEVERITY_BG = {
  light: 'bg-yellow-50 border-yellow-200',
  moderate: 'bg-orange-50 border-orange-200',
  heavy: 'bg-red-50 border-red-200',
};

export function LogisticsMap() {
  const [orders, setOrders] = useState(MOCK_ORDERS);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [routeResult, setRouteResult] = useState(null);
  const [optimizing, setOptimizing] = useState(false);
  const [trafficEvents, setTrafficEvents] = useState([]);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [completedStops, setCompletedStops] = useState(new Set());
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('vfl-dark') === '1');
  const [searchQuery, setSearchQuery] = useState('');
  const [showEndOfDay, setShowEndOfDay] = useState(false);
  const [routeStartTime] = useState(Date.now());
  const [routeHistory, setRouteHistory] = useState([]);
  const [loadingBackend, setLoadingBackend] = useState(true);
  const [showVehicleModal, setShowVehicleModal] = useState(false);
  const [navigationMode, setNavigationMode] = useState(false);
  const [showDashboard, setShowDashboard] = useState(false);
  const [showTim, setShowTim] = useState(false);
  const [showGasStations, setShowGasStations] = useState(false);
  const googleMapRef = useRef(null);

  // Vehicle settings
  const [vehicleMpg, setVehicleMpg] = useState(12);
  const [fuelPrice, setFuelPrice] = useState(4.89);
  const [loadingSettings, setLoadingSettings] = useState(true);

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

  const { stations: gasStations } = useGasStations(HQ, routeWaypoints, showGasStations, vehicleMpg, fuelPrice);

  // Dark mode
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

  // Traffic refresh
  useEffect(() => {
    const refresh = async () => {
      const token = localStorage.getItem('token');
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

  const loadOrders = useCallback(() => {
    const token = localStorage.getItem('token');
    if (!token || !API_URL) { setLoadingBackend(false); return; }
    setLoadingBackend(true);
    fetch(`${API_URL}/api/logistics/orders`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(data => {
        const arr = Array.isArray(data) ? data : [];
        setOrders(arr);
      })
      .catch(() => { setOrders([]); })
      .finally(() => setLoadingBackend(false));
  }, []);

  useEffect(() => { loadOrders(); }, [loadOrders]);

  const handleOrderClick = useCallback((order) => {
    setSelectedOrder(order);
    setModalOpen(true);
  }, []);

  const handleStatusChange = useCallback(async (order, newStatus) => {
    const token = localStorage.getItem('token');
    if (!token) return;
    try {
      const response = await fetch(`${API_URL}/api/orders/${order.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: newStatus }),
      });
      if (response.ok) {
        toast.success('Estado actualizado');
        loadOrders();
      }
    } catch (err) {
      console.error(err);
    }
  }, [loadOrders]);

  const handleOptimize = useCallback(async () => {
    setOptimizing(true);
    try {
      const result = await optimizeRouteAdvanced(orders, HQ);
      setRouteResult(result);
      toast.success('Ruta optimizada');
    } catch (err) {
      toast.error('Error al optimizar ruta');
    } finally {
      setOptimizing(false);
    }
  }, [orders]);

  const handleVehicleConfirm = useCallback((trip) => {
    setShowVehicleModal(false);
    setNavigationMode(true);
  }, []);

  const handleMarkComplete = useCallback((index) => {
    setCompletedStops(prev => {
      const newSet = new Set(prev);
      newSet.add(index);
      return newSet;
    });
    if (completedStops.size + 1 === (routeResult?.stops?.length || 0)) {
      setShowEndOfDay(true);
      if (routeResult) {
        saveRouteRecord({
          route: routeResult,
          completed: completedStops.size + 1,
          timestamp: Date.now(),
        });
      }
    }
  }, [completedStops, routeResult]);

  const filteredOrders = useMemo(() => {
    if (!searchQuery) return orders;
    const q = searchQuery.toLowerCase();
    return orders.filter(o =>
      o.customer?.name?.toLowerCase().includes(q) ||
      o.location?.address?.toLowerCase().includes(q) ||
      o.orderNumber?.toLowerCase().includes(q)
    );
  }, [orders, searchQuery]);

  const trafficDelay = totalTrafficDelay(trafficEvents, routeWaypoints, 3.0);

  return (
    <div className={`h-screen w-full flex overflow-hidden ${darkMode ? 'dark bg-gray-900' : 'bg-gray-50'}`}>
      {/* Sidebar */}
      <aside className={`${sidebarOpen ? 'w-80' : 'w-16'} bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col transition-all duration-300`}>
        {/* Sidebar Header */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          {sidebarOpen ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
                  <Navigation className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h1 className="font-bold text-gray-900 dark:text-white">Logística</h1>
                  <p className="text-xs text-gray-500">Ventura Fresh</p>
                </div>
              </div>
              <button
                onClick={() => setSidebarOpen(false)}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
              >
                <Menu className="w-5 h-5 text-gray-600 dark:text-gray-300" />
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4">
              <button
                onClick={() => setSidebarOpen(true)}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
              >
                <Menu className="w-5 h-5 text-gray-600 dark:text-gray-300" />
              </button>
            </div>
          )}
        </div>

        {/* Sidebar Content */}
        {sidebarOpen && (
          <div className="flex-1 overflow-y-auto">
            {/* Search */}
            <div className="p-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Buscar órdenes..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 border border-gray-200 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-700 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Action Buttons */}
            <div className="px-4 pb-4 space-y-2">
              <Button
                onClick={() => setShowDashboard(true)}
                className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white"
              >
                <BarChart2 className="w-4 h-4" />
                Panel de Estadísticas
              </Button>

              {!navigationMode && routeResult && (
                <Button
                  onClick={() => setShowVehicleModal(true)}
                  className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white"
                >
                  <PlayCircle className="w-4 h-4" />
                  Iniciar Ruta
                </Button>
              )}

              {!routeResult && (
                <Button
                  onClick={handleOptimize}
                  disabled={optimizing}
                  className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-700 hover:to-amber-700 text-white"
                >
                  {optimizing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Navigation className="w-4 h-4" />}
                  {optimizing ? 'Optimizando...' : 'Optimizar Ruta'}
                </Button>
              )}
            </div>

            {/* Stats Summary */}
            {routeResult && (
              <div className="px-4 pb-4">
                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border border-blue-100 dark:border-blue-800 rounded-xl p-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Distancia</p>
                      <p className="text-lg font-bold text-gray-900 dark:text-white">{routeResult.totalDistance} mi</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Tiempo</p>
                      <p className="text-lg font-bold text-gray-900 dark:text-white">
                        {Math.floor((routeResult.estimatedDuration + trafficDelay) / 60)}h {(routeResult.estimatedDuration + trafficDelay) % 60}m
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Gasolina</p>
                      <p className="text-lg font-bold text-green-700 dark:text-green-400">${routeResult.estimatedFuelCost}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Paradas</p>
                      <p className="text-lg font-bold text-gray-900 dark:text-white">{completedStops.size}/{routeResult.stops.length}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Orders List */}
            <div className="px-4 pb-4">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                <Package className="w-4 h-4" />
                {routeResult ? 'Ruta Optimizada' : 'Órdenes'}
              </h3>
              <div className="space-y-2">
                {loadingBackend ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                  </div>
                ) : (routeResult ? routeResult.stops : filteredOrders).map((stop, index) => {
                  const order = 'order' in stop ? stop.order : stop;
                  const isCompleted = completedStops.has(index);
                  return (
                    <button
                      key={order.id}
                      onClick={() => handleOrderClick(order)}
                      className={`w-full text-left p-3 rounded-xl border transition-all ${
                        isCompleted
                          ? 'bg-green-50 border-green-200'
                          : 'bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 hover:border-blue-300 hover:shadow-md'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                          isCompleted ? 'bg-green-500 text-white' : 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
                        }`}>
                          {isCompleted ? <CheckCircle2 className="w-4 h-4" /> : <span className="text-sm font-bold">{index + 1}</span>}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm text-gray-900 dark:text-white truncate">{order.customer?.name || 'Cliente'}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{order.location?.address || ''}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-600 text-gray-600 dark:text-gray-300">
                              {ORDER_TYPE_LABELS[order.type] || order.type}
                            </span>
                            {order.schedule?.pickupTime && (
                              <span className="text-xs text-gray-500">
                                <Clock className="w-3 h-3 inline mr-1" />
                                {order.schedule.pickupTime}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Sidebar Footer - Always visible */}
        <div className="p-4 border-t border-gray-200 dark:border-gray-700 space-y-2">
          {sidebarOpen ? (
            <>
              <Button
                variant="ghost"
                onClick={() => setShowGasStations(v => !v)}
                className="w-full justify-start gap-2"
              >
                <Fuel className={`w-5 h-5 ${showGasStations ? 'text-green-600' : 'text-gray-500'}`} />
                Gasolineras
              </Button>
              <Button
                variant="ghost"
                onClick={() => setShowTim(v => !v)}
                className="w-full justify-start gap-2"
              >
                <Zap className={`w-5 h-5 ${showTim ? 'text-purple-600' : 'text-gray-500'}`} />
                TIM Assistant
              </Button>
              <Button
                variant="ghost"
                onClick={() => setDarkMode(v => !v)}
                className="w-full justify-start gap-2"
              >
                {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
                {darkMode ? 'Modo Claro' : 'Modo Oscuro'}
              </Button>
            </>
          ) : (
            <>
              <button
                onClick={() => setShowGasStations(v => !v)}
                className="p-2 w-full flex justify-center hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
              >
                <Fuel className={`w-5 h-5 ${showGasStations ? 'text-green-600' : 'text-gray-500'}`} />
              </button>
              <button
                onClick={() => setShowTim(v => !v)}
                className="p-2 w-full flex justify-center hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
              >
                <Zap className={`w-5 h-5 ${showTim ? 'text-purple-600' : 'text-gray-500'}`} />
              </button>
              <button
                onClick={() => setDarkMode(v => !v)}
                className="p-2 w-full flex justify-center hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
              >
                {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
              </button>
            </>
          )}
        </div>
      </aside>

      {/* Main Map Area */}
      <main className="flex-1 relative">
        <MapView
          ref={googleMapRef}
          orders={filteredOrders}
          hqLocation={HQ}
          routeOrders={routeResult?.stops.map(s => s.order) || []}
          trafficEvents={trafficEvents}
          completedStops={completedStops}
          onOrderClick={handleOrderClick}
          gasStations={showGasStations ? gasStations : []}
          navigationActive={navigationMode}
        />

        {/* Floating Action Buttons */}
        <div className="absolute top-4 right-4 flex flex-col gap-2">
          {!sidebarOpen && (
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-3 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              <Menu className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* TIM Assistant Panel */}
        {showTim && (
          <div className="absolute bottom-4 right-4 w-80 bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 bg-gradient-to-r from-purple-600 to-pink-600 rounded-full flex items-center justify-center">
                  <Zap className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 dark:text-white">TIM Assistant</h3>
                  <p className="text-xs text-gray-500">Listo para ayudar</p>
                </div>
              </div>
              <button
                onClick={() => setShowTim(false)}
                className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 h-80 overflow-y-auto">
              <TimAssistant />
            </div>
          </div>
        )}
      </main>

      {/* Modals */}
      {showDashboard && (
        <LogisticsDashboard onClose={() => setShowDashboard(false)} />
      )}

      {showVehicleModal && (
        <VehicleSelectorModal
          open={showVehicleModal}
          onClose={() => setShowVehicleModal(false)}
          onConfirm={handleVehicleConfirm}
        />
      )}

      {modalOpen && selectedOrder && (
        <OrderDetailsModal
          order={selectedOrder}
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          onStatusChange={(status) => handleStatusChange(selectedOrder, status)}
        />
      )}

      {showEndOfDay && (
        <EndOfDayModal
          open={showEndOfDay}
          onClose={() => setShowEndOfDay(false)}
          routeResult={routeResult}
          completedCount={completedStops.size}
          trafficDelay={trafficDelay}
          startTime={routeStartTime}
        />
      )}

      {navigationMode && routeResult && (
        <InternalNavigation
          stops={routeResult.stops}
          hqLocation={HQ}
          mapRef={googleMapRef}
          onClose={() => setNavigationMode(false)}
          onStepComplete={handleMarkComplete}
        />
      )}
    </div>
  );
}

export default LogisticsMap;
