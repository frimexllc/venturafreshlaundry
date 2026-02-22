import { useState, useEffect, useCallback } from "react";
import { Button } from "../components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { 
  Truck, Package, Clock, AlertTriangle, CheckCircle, 
  RefreshCw, Phone, MapPin, MessageSquare, ChevronRight,
  Calendar, User, Zap
} from "lucide-react";
import { toast } from "sonner";
import { createNotificationsSocket } from "../utils/notificationsSocket";

const API_URL = process.env.REACT_APP_BACKEND_URL;

const ORDER_STATUSES = [
  { value: "NEW", label: "Nuevo", color: "bg-blue-100 text-blue-800" },
  { value: "CONFIRMED", label: "Confirmado", color: "bg-indigo-100 text-indigo-800" },
  { value: "PICKUP_SCHEDULED", label: "Pickup Programado", color: "bg-purple-100 text-purple-800" },
  { value: "PICKED_UP", label: "Recogido", color: "bg-cyan-100 text-cyan-800" },
  { value: "PROCESSING", label: "En Proceso", color: "bg-yellow-100 text-yellow-800" },
  { value: "READY", label: "Listo", color: "bg-emerald-100 text-emerald-800" },
  { value: "OUT_FOR_DELIVERY", label: "En Camino", color: "bg-orange-100 text-orange-800" },
  { value: "DELIVERED", label: "Entregado", color: "bg-green-100 text-green-800" },
  { value: "COMPLETED", label: "Completado", color: "bg-emerald-100 text-emerald-800" },
  { value: "CANCELLED", label: "Cancelado", color: "bg-red-100 text-red-800" }
];

export default function OperatorDashboard() {
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState({});
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [realtimeStatus, setRealtimeStatus] = useState("offline");

  const loadDashboard = useCallback(async () => {
    try {
      if (document.visibilityState !== "visible" && autoRefresh) {
        return;
      }
      const res = await fetch(`${API_URL}/api/automation/operator-dashboard`);
      if (res.ok) {
        const data = await res.json();
        setDashboard(data);
        setLastRefresh(new Date());
      }
    } catch (error) {
      toast.error("Error al cargar dashboard");
    } finally {
      setLoading(false);
    }
  }, [autoRefresh]);

  useEffect(() => {
    loadDashboard();
    const interval = setInterval(() => {
      if (autoRefresh) {
        loadDashboard();
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [loadDashboard]);

  useEffect(() => {
    const socket = createNotificationsSocket();
    if (!socket) {
      setRealtimeStatus("disabled");
      return;
    }

    const handleNotification = () => {
      loadDashboard();
    };

    socket.on("connect", () => setRealtimeStatus("connected"));
    socket.on("disconnect", () => setRealtimeStatus("offline"));
    socket.on("connect_error", () => setRealtimeStatus("offline"));
    socket.on("notification", handleNotification);
    socket.on("dashboard", handleNotification);

    return () => {
      socket.off("notification", handleNotification);
      socket.off("dashboard", handleNotification);
      socket.disconnect();
    };
  }, [loadDashboard]);

  const updateOrderStatus = async (orderId, newStatus) => {
    setUpdating(prev => ({ ...prev, [orderId]: true }));
    try {
      const res = await fetch(`${API_URL}/api/automation/orders/${orderId}/status?new_status=${newStatus}`, {
        method: "PUT"
      });
      if (res.ok) {
        toast.success(`Orden ${orderId} actualizada a ${newStatus}`);
        setDashboard(prev => {
          if (!prev) return prev;
          const updateList = (list) =>
            list.map((order) =>
              order.order_id === orderId
                ? { ...order, status: newStatus, next_status: getNextStatus(newStatus), action_label: null }
                : order
            );
          return {
            ...prev,
            todays_pickups: updateList(prev.todays_pickups || []),
            ready_for_delivery: (prev.ready_for_delivery || []).filter(
              (order) => !(order.order_id === orderId && newStatus === "OUT_FOR_DELIVERY")
            )
          };
        });
      } else {
        toast.error("Error al actualizar orden");
      }
    } catch (error) {
      toast.error("Error de conexión");
    } finally {
      setUpdating(prev => ({ ...prev, [orderId]: false }));
    }
  };

  const getNextStatus = (currentStatus) => {
    const statusOrder = ["NEW", "CONFIRMED", "PICKUP_SCHEDULED", "PICKED_UP", "PROCESSING", "READY", "OUT_FOR_DELIVERY", "DELIVERED", "COMPLETED"];
    const currentIndex = statusOrder.indexOf(currentStatus);
    if (currentIndex < statusOrder.length - 1) {
      return statusOrder[currentIndex + 1];
    }
    return null;
  };

  const formatOrderId = (order) => {
    return order.order_number || order.order_id;
  };

  const openMaps = (address) => {
    if (!address) return;
    const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
    window.open(url, "_blank");
  };

  const getStatusInfo = (status) => {
    return ORDER_STATUSES.find(s => s.value === status) || ORDER_STATUSES[0];
  };

  const realtimeLabel = realtimeStatus === "connected"
    ? "Tiempo real: conectado"
    : realtimeStatus === "disabled"
      ? "Tiempo real: sin configurar"
      : "Tiempo real: desconectado";
  const realtimeClass = realtimeStatus === "connected"
    ? "bg-emerald-100 text-emerald-700"
    : realtimeStatus === "disabled"
      ? "bg-slate-100 text-slate-500"
      : "bg-orange-100 text-orange-700";

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Zap className="h-7 w-7 text-sky-600" />
            Panel del Operador
          </h1>
          <p className="text-slate-600">Solo actualiza el estado de las órdenes - el sistema hace el resto</p>
        </div>
        <div className="flex items-center gap-3">
          <span className={`px-3 py-1 rounded-full text-xs font-semibold ${realtimeClass}`} data-testid="operator-realtime-status">
            {realtimeLabel}
          </span>
          <span className="text-sm text-slate-500">
            Última actualización: {lastRefresh.toLocaleTimeString()}
          </span>
          <Button onClick={() => setAutoRefresh(!autoRefresh)} variant="outline" size="sm" data-testid="toggle-auto-refresh">
            {autoRefresh ? "Pausar" : "Reanudar"}
          </Button>
          <Button onClick={loadDashboard} variant="outline" size="sm" data-testid="refresh-dashboard">
            <RefreshCw className="h-4 w-4 mr-2" />
            Actualizar
          </Button>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-sky-100 flex items-center justify-center">
              <Truck className="h-5 w-5 text-sky-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">{dashboard?.stats?.pickups_remaining_today || 0}</p>
              <p className="text-sm text-slate-600">Pickups Hoy</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-yellow-100 flex items-center justify-center">
              <Package className="h-5 w-5 text-yellow-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">{dashboard?.stats?.orders_in_processing || 0}</p>
              <p className="text-sm text-slate-600">En Proceso</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">{dashboard?.stats?.orders_ready || 0}</p>
              <p className="text-sm text-slate-600">Listos para Entrega</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-red-100 flex items-center justify-center">
              <AlertTriangle className="h-5 w-5 text-red-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">{dashboard?.stats?.urgent_tickets || 0}</p>
              <p className="text-sm text-slate-600">Tickets Urgentes</p>
            </div>
          </div>
        </div>
      </div>

      {/* Today's Pickups */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50">
          <h2 className="font-semibold text-slate-900 flex items-center gap-2">
            <Calendar className="h-5 w-5 text-sky-600" />
            Pickups de Hoy ({dashboard?.todays_pickups?.length || 0})
          </h2>
        </div>
        <div className="divide-y divide-slate-100">
          {dashboard?.todays_pickups?.length === 0 ? (
            <div className="p-8 text-center text-slate-500">
              <Truck className="h-12 w-12 mx-auto mb-3 text-slate-300" />
              <p>No hay pickups programados para hoy</p>
            </div>
          ) : (
            dashboard?.todays_pickups?.map((order) => (
              <div key={order.order_id} className="p-4 hover:bg-slate-50 transition-colors" data-testid={`pickup-${order.order_id}`}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono font-semibold text-slate-900">{formatOrderId(order)}</span>
                      <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${getStatusInfo(order.status).color}`}>
                        {getStatusInfo(order.status).label}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-slate-600 mb-2">
                      <span className="flex items-center gap-1">
                        <User className="h-4 w-4" />
                        {order.customer_name || "Cliente"}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-4 w-4" />
                        {order.pickup_time || "Sin hora"}
                      </span>
                    </div>
                    <div className="flex items-start gap-1 text-sm text-slate-500">
                      <MapPin className="h-4 w-4 mt-0.5 flex-shrink-0" />
                      <span className="line-clamp-1">{order.pickup_address || "Sin dirección"}</span>
                    </div>
                    <div className="text-xs text-slate-500 mt-1">
                      Servicio: {order.service_type || "-"}
                    </div>
                    {order.special_instructions && (
                      <div className="flex items-start gap-1 text-sm text-amber-600 mt-1">
                        <MessageSquare className="h-4 w-4 mt-0.5 flex-shrink-0" />
                        <span className="line-clamp-1">{order.special_instructions}</span>
                      </div>
                    )}
                    {order.gate_code && (
                      <div className="text-sm font-medium text-purple-600 mt-1">
                        🔑 Código: {order.gate_code}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-2">
                    {order.customer_phone && (
                      <a href={`tel:${order.customer_phone}`} className="flex items-center gap-1 text-sm text-sky-600 hover:text-sky-700">
                        <Phone className="h-4 w-4" />
                        Llamar
                      </a>
                    )}
                    {order.pickup_address && (
                      <Button variant="outline" size="sm" onClick={() => openMaps(order.pickup_address)}>
                        <MapPin className="h-4 w-4 mr-2" />
                        Mapa
                      </Button>
                    )}
                    {(order.next_status || getNextStatus(order.status)) && (
                      <Button
                        size="sm"
                        onClick={() => updateOrderStatus(order.order_id, order.next_status || getNextStatus(order.status))}
                        disabled={updating[order.order_id]}
                        className="bg-sky-600 hover:bg-sky-700"
                        data-testid={`update-${order.order_id}`}
                      >
                        {updating[order.order_id] ? (
                          <RefreshCw className="h-4 w-4 animate-spin" />
                        ) : (
                          <>
                            {order.action_label || getStatusInfo(order.next_status || getNextStatus(order.status)).label}
                            <ChevronRight className="h-4 w-4 ml-1" />
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Ready for Delivery */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 bg-emerald-50">
          <h2 className="font-semibold text-slate-900 flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-emerald-600" />
            Listos para Entrega ({dashboard?.ready_for_delivery?.length || 0})
          </h2>
        </div>
        <div className="divide-y divide-slate-100">
          {dashboard?.ready_for_delivery?.length === 0 ? (
            <div className="p-8 text-center text-slate-500">
              <Package className="h-12 w-12 mx-auto mb-3 text-slate-300" />
              <p>No hay órdenes listas para entrega</p>
            </div>
          ) : (
            dashboard?.ready_for_delivery?.map((order) => (
              <div key={order.order_id} className="p-4 hover:bg-slate-50 transition-colors" data-testid={`delivery-${order.order_id}`}>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <span className="font-mono font-semibold text-slate-900">{formatOrderId(order)}</span>
                    <span className="text-slate-600 ml-2">- {order.customer_name || "Cliente"}</span>
                    <div className="text-sm text-slate-500 flex items-center gap-1 mt-1">
                      <MapPin className="h-4 w-4" />
                      {order.delivery_address || "-"}
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    {order.delivery_address && (
                      <Button variant="outline" size="sm" onClick={() => openMaps(order.delivery_address)}>
                        <MapPin className="h-4 w-4 mr-2" />
                        Mapa
                      </Button>
                    )}
                    <Button
                      size="sm"
                      onClick={() => updateOrderStatus(order.order_id, order.next_status || "OUT_FOR_DELIVERY")}
                      disabled={updating[order.order_id]}
                      className="bg-emerald-600 hover:bg-emerald-700"
                    >
                      {updating[order.order_id] ? (
                        <RefreshCw className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          {order.action_label || "Salir a Entregar"}
                          <Truck className="h-4 w-4 ml-1" />
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Urgent Tickets */}
      {dashboard?.urgent_tickets?.length > 0 && (
        <div className="bg-white rounded-xl border border-red-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-red-100 bg-red-50">
            <h2 className="font-semibold text-red-900 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-600" />
              Tickets Urgentes ({dashboard.urgent_tickets.length})
            </h2>
          </div>
          <div className="divide-y divide-red-100">
            {dashboard.urgent_tickets.map((ticket) => (
              <div key={ticket.ticket_id} className="p-4" data-testid={`ticket-${ticket.ticket_id}`}>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-semibold text-slate-900">{ticket.ticket_id}</span>
                      <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-red-100 text-red-800">
                        URGENTE
                      </span>
                    </div>
                    <p className="font-medium text-slate-900 mt-1">{ticket.subject}</p>
                    <p className="text-sm text-slate-600 mt-1 line-clamp-2">{ticket.description}</p>
                    <p className="text-xs text-red-600 mt-2">
                      SLA: {new Date(ticket.sla_deadline).toLocaleString()}
                    </p>
                  </div>
                  {ticket.customer_phone && (
                    <a href={`tel:${ticket.customer_phone}`} className="flex items-center gap-1 text-sm text-sky-600 hover:text-sky-700">
                      <Phone className="h-4 w-4" />
                      Llamar
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
