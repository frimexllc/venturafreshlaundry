import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "../components/ui/dialog";
import { 
  Truck, Package, Clock, AlertTriangle, CheckCircle, 
  RefreshCw, Phone, MapPin, MessageSquare, ChevronRight,
  Calendar, User, Zap, Bot
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

const PREFERENCE_LABELS = {
  detergent_type: "Detergente",
  water_temperature: "Temperatura de agua",
  fabric_softener: "Suavizante",
  folding_style: "Doblado",
  hanging_instructions: "Colgar prendas",
  allergies: "Alergias",
  special_instructions: "Instrucciones especiales",
  pickup_time_preference: "Horario preferido",
  gate_code: "Código de acceso",
  hang_dry_items: "Secado al aire",
  fragrance_preference: "Fragancia"
};

const PAYMENT_METHODS = [
  { value: "cash", label: "Efectivo" },
  { value: "card", label: "Tarjeta" },
  { value: "transfer", label: "Transferencia" },
  { value: "other", label: "Otro" }
];

export default function OperatorDashboard() {
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState({});
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [realtimeStatus, setRealtimeStatus] = useState("offline");
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [weightForm, setWeightForm] = useState({ estimated_lbs: "", actual_lbs: "" });
  const [savingWeights, setSavingWeights] = useState(false);
  const [paymentForm, setPaymentForm] = useState({ method: "cash", amountReceived: "" });
  const [savingPayment, setSavingPayment] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiReply, setAiReply] = useState("");
  const [aiResults, setAiResults] = useState([]);
  const [aiLoading, setAiLoading] = useState(false);

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

  useEffect(() => {
    if (selectedOrder) {
      setWeightForm({
        estimated_lbs: selectedOrder.estimated_lbs ?? "",
        actual_lbs: selectedOrder.actual_lbs ?? ""
      });
      setPaymentForm({
        method: selectedOrder.payment_method || "cash",
        amountReceived: selectedOrder.amount_paid ?? ""
      });
    }
  }, [selectedOrder]);

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

  const updateOrderWeights = async () => {
    if (!selectedOrder) return;
    const orderPrimaryId = selectedOrder.id || selectedOrder.order_id;
    setSavingWeights(true);
    try {
      const payload = {
        estimated_lbs: weightForm.estimated_lbs === "" ? null : parseFloat(weightForm.estimated_lbs),
        actual_lbs: weightForm.actual_lbs === "" ? null : parseFloat(weightForm.actual_lbs)
      };
      const res = await axios.put(`${API_URL}/api/orders/${orderPrimaryId}`, payload);
      const updated = res.data;
      toast.success("Libras actualizadas");
      setSelectedOrder((prev) => prev ? { ...prev, ...updated, order_id: prev.order_id, id: prev.id || updated.id } : prev);
      setDashboard(prev => {
        if (!prev) return prev;
        const updateList = (list) =>
          list.map((order) =>
            order.order_id === selectedOrder.order_id
              ? { ...order, estimated_lbs: updated.estimated_lbs, actual_lbs: updated.actual_lbs }
              : order
          );
        return {
          ...prev,
          todays_pickups: updateList(prev.todays_pickups || []),
          ready_for_delivery: updateList(prev.ready_for_delivery || [])
        };
      });
    } catch (error) {
      toast.error(error.response?.data?.detail || "Error actualizando libras");
    } finally {
      setSavingWeights(false);
    }
  };

  const handlePrintTicket = async (order) => {
    const targetOrder = order || selectedOrder;
    if (!targetOrder) return;
    const orderPrimaryId = targetOrder.id || targetOrder.order_id;
    if (!orderPrimaryId) {
      toast.error("Orden inválida");
      return;
    }
    try {
      const res = await axios.get(`${API_URL}/api/orders/${orderPrimaryId}/qr.svg`, { responseType: "blob" });
      const blobUrl = window.URL.createObjectURL(res.data);
      const printWindow = window.open("");
      if (!printWindow) {
        toast.error("Permite pop-ups para imprimir");
        return;
      }
      printWindow.document.write(`<html><body style="margin:0;display:flex;align-items:center;justify-content:center;"><img src="${blobUrl}" style="max-width:100%;" onload="window.print();window.onafterprint=function(){window.close();};" /></body></html>`);
      printWindow.document.close();
    } catch (error) {
      toast.error("No se pudo generar el ticket");
    }
  };

  const handleRegisterPayment = async () => {
    if (!selectedOrder) return;
    const orderPrimaryId = selectedOrder.id || selectedOrder.order_id;
    if (!selectedOrder.total_amount) {
      toast.error("Agrega el total antes de cobrar");
      return;
    }
    if (paymentForm.method === "cash" && paymentForm.amountReceived === "") {
      toast.error("Ingresa el monto recibido");
      return;
    }
    setSavingPayment(true);
    try {
      const payload = {
        payment_method: paymentForm.method,
        amount_received: paymentForm.amountReceived === "" ? null : parseFloat(paymentForm.amountReceived)
      };
      const res = await axios.post(`${API_URL}/api/orders/${orderPrimaryId}/payment`, payload);
      const updated = res.data;
      toast.success("Pago registrado");
      setSelectedOrder((prev) => prev ? { ...prev, ...updated } : prev);
      setDashboard(prev => {
        if (!prev) return prev;
        const updateList = (list) =>
          list.map((order) =>
            order.order_id === selectedOrder.order_id
              ? {
                  ...order,
                  payment_status: updated.payment_status,
                  payment_method: updated.payment_method,
                  amount_paid: updated.amount_paid,
                  change_due: updated.change_due
                }
              : order
          );
        return {
          ...prev,
          todays_pickups: updateList(prev.todays_pickups || []),
          ready_for_delivery: updateList(prev.ready_for_delivery || [])
        };
      });
    } catch (error) {
      toast.error(error.response?.data?.detail || "Error registrando pago");
    } finally {
      setSavingPayment(false);
    }
  };

  const handleAiRequest = async () => {
    if (!aiPrompt.trim()) return;
    setAiLoading(true);
    try {
      const res = await axios.post(`${API_URL}/api/ai/operations`, { message: aiPrompt, execute: true });
      setAiReply(res.data?.reply || "");
      setAiResults(res.data?.results || []);
      (res.data?.results || []).forEach((result) => {
        if (result.type === "print_ticket" && result.ticket_url) {
          handlePrintTicket({ id: result.order_id || result.orderNumber || result.order_id, order_id: result.order_id });
        }
      });
    } catch (error) {
      toast.error("No se pudo ejecutar la tarea IA");
    } finally {
      setAiLoading(false);
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

  const buildDateSlug = (dateStr) => {
    const base = dateStr ? new Date(dateStr) : new Date();
    if (Number.isNaN(base.getTime())) {
      return new Date().toISOString().slice(0, 10).replace(/-/g, "");
    }
    return base.toISOString().slice(0, 10).replace(/-/g, "");
  };

  const formatOrderNumber = (order) => {
    if (!order) return "-";
    if (order.order_number && order.order_number.startsWith("VFL-")) {
      return order.order_number;
    }
    const dateSlug = buildDateSlug(order.created_at || order.pickup_date);
    const raw = (order.order_number || order.order_id || "00000000").toString();
    const short = raw.replace(/[^a-zA-Z0-9]/g, "").toLowerCase().slice(-8).padStart(8, "0");
    return `VFL-${dateSlug}-${short}`;
  };

  const formatOrderId = (order) => {
    return formatOrderNumber(order);
  };

  const renderPreferenceValue = (value) => {
    if (Array.isArray(value)) {
      return value.length ? value.join(", ") : "-";
    }
    if (value === null || value === undefined || value === "") {
      return "-";
    }
    return value.toString();
  };

  const getWeightDelta = () => {
    const est = parseFloat(weightForm.estimated_lbs);
    const act = parseFloat(weightForm.actual_lbs);
    if (Number.isNaN(est) || Number.isNaN(act)) {
      return "-";
    }
    const diff = parseFloat((act - est).toFixed(2));
    return diff > 0 ? `+${diff}` : `${diff}`;
  };

  const formatCurrency = (value) => {
    if (value === null || value === undefined || value === "") return "-";
    const num = parseFloat(value);
    if (Number.isNaN(num)) return "-";
    return `$${num.toFixed(2)}`;
  };

  const getChangePreview = () => {
    if (!selectedOrder?.total_amount) return "-";
    const amount = parseFloat(paymentForm.amountReceived);
    const total = parseFloat(selectedOrder.total_amount);
    if (Number.isNaN(amount) || Number.isNaN(total)) return "-";
    const diff = amount - total;
    return diff >= 0 ? `$${diff.toFixed(2)}` : `-$${Math.abs(diff).toFixed(2)}`;
  };

  const getPaymentMethodLabel = (method) => {
    if (!method) return "-";
    const found = PAYMENT_METHODS.find((item) => item.value === method);
    return found ? found.label : method;
  };

  const getPaymentStatusLabel = (status) => {
    if (!status) return "Pendiente";
    const normalized = status.toString().toLowerCase();
    if (normalized === "paid") return "Pagado";
    if (normalized === "refunded") return "Reembolsado";
    if (normalized === "failed") return "Fallido";
    return "Pendiente";
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
              <p className="text-2xl font-bold text-slate-900" data-testid="operator-stat-pickups-count">{dashboard?.stats?.pickups_remaining_today || 0}</p>
              <p className="text-sm text-slate-600" data-testid="operator-stat-pickups-label">Pickups Hoy</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-yellow-100 flex items-center justify-center">
              <Package className="h-5 w-5 text-yellow-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900" data-testid="operator-stat-processing-count">{dashboard?.stats?.orders_in_processing || 0}</p>
              <p className="text-sm text-slate-600" data-testid="operator-stat-processing-label">En Proceso</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900" data-testid="operator-stat-deliveries-count">{dashboard?.stats?.orders_ready || 0}</p>
              <p className="text-sm text-slate-600" data-testid="operator-stat-deliveries-label">Entregas en curso</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-red-100 flex items-center justify-center">
              <AlertTriangle className="h-5 w-5 text-red-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900" data-testid="operator-stat-urgent-count">{dashboard?.stats?.urgent_tickets || 0}</p>
              <p className="text-sm text-slate-600" data-testid="operator-stat-urgent-label">Tickets Urgentes</p>
            </div>
          </div>
        </div>
      </div>

      {/* AI Operations Assistant */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
          <Bot className="h-5 w-5 text-sky-600" />
          <h2 className="font-semibold text-slate-900">Asistente Operativo IA</h2>
        </div>
        <div className="p-6 grid gap-6 lg:grid-cols-[2fr_1fr]">
          <div>
            <Textarea
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              rows={4}
              placeholder="Ej: Marca la orden VFL-20260222-02220002 como pagada en efectivo 50 y genera ticket"
              data-testid="operator-ai-input"
            />
            <div className="flex flex-wrap gap-2 mt-3">
              <Button onClick={handleAiRequest} disabled={aiLoading} data-testid="operator-ai-submit">
                {aiLoading ? "Procesando..." : "Enviar a IA"}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setAiPrompt("");
                  setAiReply("");
                  setAiResults([]);
                }}
                data-testid="operator-ai-clear"
              >
                Limpiar
              </Button>
            </div>
          </div>
          <div className="bg-slate-50 rounded-xl p-4">
            <p className="text-sm text-slate-500">Respuesta</p>
            <p className="font-medium text-slate-900 mt-1" data-testid="operator-ai-reply">
              {aiReply || "Aún no hay respuesta"}
            </p>
            <div className="mt-4">
              <p className="text-xs text-slate-500">Acciones ejecutadas</p>
              {aiResults.length === 0 ? (
                <p className="text-sm text-slate-400 mt-1">Sin acciones todavía</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {aiResults.map((result, index) => (
                    <li
                      key={`${result.type}-${index}`}
                      className="text-sm text-slate-700"
                      data-testid={`operator-ai-result-${index}`}
                    >
                      {result.type}: {result.ok ? "OK" : "Error"}
                    </li>
                  ))}
                </ul>
              )}
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
              <div
                key={order.order_id}
                className="p-4 hover:bg-slate-50 transition-colors cursor-pointer"
                data-testid={`pickup-${order.order_id}`}
                role="button"
                onClick={() => setSelectedOrder(order)}
              >
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
                    <div className="text-xs text-slate-500 mt-1" data-testid={`operator-payment-${order.order_id}`}>
                      Pago: {getPaymentStatusLabel(order.payment_status)} {order.payment_method ? `(${getPaymentMethodLabel(order.payment_method)})` : ""}
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
                      <a
                        href={`tel:${order.customer_phone}`}
                        className="flex items-center gap-1 text-sm text-sky-600 hover:text-sky-700"
                        onClick={(e) => e.stopPropagation()}
                        data-testid={`operator-call-${order.order_id}`}
                      >
                        <Phone className="h-4 w-4" />
                        Llamar
                      </a>
                    )}
                    {order.pickup_address && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          openMaps(order.pickup_address);
                        }}
                        data-testid={`operator-map-${order.order_id}`}
                      >
                        <MapPin className="h-4 w-4 mr-2" />
                        Mapa
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePrintTicket(order);
                      }}
                      data-testid={`operator-print-${order.order_id}`}
                    >
                      Imprimir Ticket
                    </Button>
                    {(order.next_status || getNextStatus(order.status)) && (
                      <Button
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          updateOrderStatus(order.order_id, order.next_status || getNextStatus(order.status));
                        }}
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
          <h2 className="font-semibold text-slate-900 flex items-center gap-2" data-testid="operator-delivery-section-title">
            <CheckCircle className="h-5 w-5 text-emerald-600" />
            Entregas en curso ({dashboard?.ready_for_delivery?.length || 0})
          </h2>
        </div>
        <div className="divide-y divide-slate-100">
          {dashboard?.ready_for_delivery?.length === 0 ? (
            <div className="p-8 text-center text-slate-500">
              <Package className="h-12 w-12 mx-auto mb-3 text-slate-300" />
              <p data-testid="operator-delivery-empty">No hay entregas en curso</p>
            </div>
          ) : (
            dashboard?.ready_for_delivery?.map((order) => (
              <div
                key={order.order_id}
                className="p-4 hover:bg-slate-50 transition-colors cursor-pointer"
                data-testid={`delivery-${order.order_id}`}
                role="button"
                onClick={() => setSelectedOrder(order)}
              >
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <span className="font-mono font-semibold text-slate-900">{formatOrderId(order)}</span>
                    <span className="text-slate-600 ml-2">- {order.customer_name || "Cliente"}</span>
                    <div className="text-sm text-slate-500 flex items-center gap-1 mt-1">
                      <MapPin className="h-4 w-4" />
                      {order.delivery_address || "-"}
                    </div>
                    <div className="text-xs text-slate-500 mt-1" data-testid={`operator-delivery-status-${order.order_id}`}>
                      Estado: {getStatusInfo(order.status).label}
                    </div>
                    <div className="text-xs text-slate-500 mt-1" data-testid={`operator-delivery-payment-${order.order_id}`}>
                      Pago: {getPaymentStatusLabel(order.payment_status)} {order.payment_method ? `(${getPaymentMethodLabel(order.payment_method)})` : ""}
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    {order.delivery_address && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          openMaps(order.delivery_address);
                        }}
                        data-testid={`operator-delivery-map-${order.order_id}`}
                      >
                        <MapPin className="h-4 w-4 mr-2" />
                        Mapa
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePrintTicket(order);
                      }}
                      data-testid={`operator-delivery-print-${order.order_id}`}
                    >
                      Imprimir Ticket
                    </Button>
                    <Button
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        updateOrderStatus(order.order_id, order.next_status || "OUT_FOR_DELIVERY");
                      }}
                      disabled={updating[order.order_id]}
                      className="bg-emerald-600 hover:bg-emerald-700"
                      data-testid={`delivery-update-${order.order_id}`}
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

      <Dialog open={!!selectedOrder} onOpenChange={(open) => !open && setSelectedOrder(null)}>
        <DialogContent className="sm:max-w-lg" data-testid="operator-order-detail-modal">
          <DialogHeader>
            <DialogTitle>Orden <span data-testid="operator-order-number">{formatOrderNumber(selectedOrder)}</span></DialogTitle>
            <DialogDescription data-testid="operator-order-description">
              Detalle completo de la orden para operación.
            </DialogDescription>
          </DialogHeader>
          {selectedOrder && (
            <div className="space-y-4 mt-3">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-slate-500">Estado</p>
                  <p className="font-medium" data-testid="operator-order-status">{getStatusInfo(selectedOrder.status).label}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-500">Servicio</p>
                  <p className="font-medium" data-testid="operator-order-service">{selectedOrder.service_type || "-"}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-500">Cliente</p>
                  <p className="font-medium" data-testid="operator-order-customer">{selectedOrder.customer_name || "-"}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-500">Membresía</p>
                  <p className="font-medium" data-testid="operator-order-membership">{selectedOrder.membership_plan || "No"}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-slate-500">Teléfono</p>
                  <p className="font-medium" data-testid="operator-order-phone">{selectedOrder.customer_phone || "-"}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-500">Email</p>
                  <p className="font-medium" data-testid="operator-order-email">{selectedOrder.customer_email || "-"}</p>
                </div>
              </div>
              <div>
                <p className="text-sm text-slate-500">Contacto</p>
                <p className="font-medium" data-testid="operator-order-contact">{selectedOrder.preferred_contact || "-"}</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-slate-500">Fecha Pickup</p>
                  <p className="font-medium" data-testid="operator-order-pickup-date">{selectedOrder.pickup_date || "-"}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-500">Ventana</p>
                  <p className="font-medium" data-testid="operator-order-pickup-window">{selectedOrder.pickup_time || "-"}</p>
                </div>
              </div>
              <div>
                <p className="text-sm text-slate-500">Dirección Pickup</p>
                <p className="font-medium" data-testid="operator-order-pickup-address">{selectedOrder.pickup_address || "-"}</p>
              </div>
              <div>
                <p className="text-sm text-slate-500">Dirección Entrega</p>
                <p className="font-medium" data-testid="operator-order-delivery-address">{selectedOrder.delivery_address || "-"}</p>
              </div>
              {selectedOrder.special_instructions && (
                <div>
                  <p className="text-sm text-slate-500">Notas</p>
                  <p className="font-medium" data-testid="operator-order-notes">{selectedOrder.special_instructions}</p>
                </div>
              )}
              {selectedOrder.gate_code && (
                <div>
                  <p className="text-sm text-slate-500">Código de acceso</p>
                  <p className="font-medium" data-testid="operator-order-gate">{selectedOrder.gate_code}</p>
                </div>
              )}
              <div className="border-t pt-3" data-testid="operator-lbs-section">
                <p className="text-sm text-slate-500">Libras</p>
                <div className="grid grid-cols-2 gap-4 mt-2">
                  <div>
                    <p className="text-xs text-slate-500">Est. Lbs</p>
                    <Input
                      type="number"
                      step="0.1"
                      value={weightForm.estimated_lbs}
                      onChange={(e) => setWeightForm({ ...weightForm, estimated_lbs: e.target.value })}
                      className="mt-1"
                      data-testid="operator-estimated-lbs-input"
                    />
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Actual Lbs</p>
                    <Input
                      type="number"
                      step="0.1"
                      value={weightForm.actual_lbs}
                      onChange={(e) => setWeightForm({ ...weightForm, actual_lbs: e.target.value })}
                      className="mt-1"
                      data-testid="operator-actual-lbs-input"
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between mt-2">
                  <p className="text-xs text-slate-500" data-testid="operator-lbs-delta">Diferencia: {getWeightDelta()}</p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={updateOrderWeights}
                    disabled={savingWeights}
                    data-testid="operator-save-lbs"
                  >
                    {savingWeights ? "Guardando..." : "Guardar libras"}
                  </Button>
                </div>
              </div>
              <div className="border-t pt-3" data-testid="operator-payment-section">
                <p className="text-sm text-slate-500">Pago</p>
                <div className="grid grid-cols-2 gap-4 mt-2">
                  <div>
                    <p className="text-xs text-slate-500">Total</p>
                    <p className="font-medium" data-testid="operator-payment-total">{formatCurrency(selectedOrder.total_amount)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Estado</p>
                    <p className="font-medium" data-testid="operator-payment-status">{getPaymentStatusLabel(selectedOrder.payment_status)}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 mt-2">
                  <div>
                    <p className="text-xs text-slate-500">Método</p>
                    <select
                      value={paymentForm.method}
                      onChange={(e) => setPaymentForm({ ...paymentForm, method: e.target.value })}
                      className="w-full mt-1 border border-slate-200 rounded-md px-2 py-2 text-sm"
                      data-testid="operator-payment-method"
                    >
                      {PAYMENT_METHODS.map((method) => (
                        <option key={method.value} value={method.value}>{method.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Monto recibido</p>
                    <Input
                      type="number"
                      step="0.01"
                      value={paymentForm.amountReceived}
                      onChange={(e) => setPaymentForm({ ...paymentForm, amountReceived: e.target.value })}
                      className="mt-1"
                      disabled={paymentForm.method !== "cash"}
                      placeholder={paymentForm.method === "cash" ? "0.00" : "No requerido"}
                      data-testid="operator-payment-amount"
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between mt-2">
                  <p className="text-xs text-slate-500" data-testid="operator-payment-change">Cambio: {paymentForm.method === "cash" ? getChangePreview() : "-"}</p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleRegisterPayment}
                      disabled={savingPayment}
                      data-testid="operator-payment-save"
                    >
                      {savingPayment ? "Guardando..." : "Registrar pago"}
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handlePrintTicket(selectedOrder)}
                      data-testid="operator-payment-print"
                    >
                      Imprimir Ticket
                    </Button>
                  </div>
                </div>
              </div>
              <div className="border-t pt-3" data-testid="operator-preferences-section">
                <p className="text-sm text-slate-500">Preferencias de lavado</p>
                {selectedOrder.preferences_snapshot ? (
                  <div className="grid grid-cols-2 gap-3 mt-2">
                    {Object.entries(PREFERENCE_LABELS).map(([key, label]) => (
                      <div key={key}>
                        <p className="text-xs text-slate-500">{label}</p>
                        <p className="font-medium" data-testid={`operator-pref-${key}`}>
                          {renderPreferenceValue(selectedOrder.preferences_snapshot?.[key])}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm font-medium text-slate-600 mt-1" data-testid="operator-pref-empty">
                    Sin preferencias registradas
                  </p>
                )}
                <p className="text-xs text-slate-500 mt-2" data-testid="operator-pref-id">
                  PREF: {selectedOrder.preferences_id || "N/A"}
                </p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

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
