import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "../components/ui/dialog";
import { 
  Truck, Package, Clock, AlertTriangle, CheckCircle, 
  RefreshCw, Phone, MapPin, MessageSquare, ChevronRight,
  Calendar, User, Zap, Bot, DollarSign
} from "lucide-react";
import { toast } from "sonner";
import { createNotificationsSocket } from "../utils/notificationsSocket";
import { useLocale } from "../context/LocaleContext";

const API_URL = process.env.REACT_APP_BACKEND_URL;

const ORDER_STATUSES = [
  { value: "NEW", color: "bg-blue-100 text-blue-800" },
  { value: "CONFIRMED", color: "bg-indigo-100 text-indigo-800" },
  { value: "PICKUP_SCHEDULED", color: "bg-purple-100 text-purple-800" },
  { value: "PICKED_UP", color: "bg-cyan-100 text-cyan-800" },
  { value: "PROCESSING", color: "bg-yellow-100 text-yellow-800" },
  { value: "READY", color: "bg-emerald-100 text-emerald-800" },
  { value: "OUT_FOR_DELIVERY", color: "bg-orange-100 text-orange-800" },
  { value: "DELIVERED", color: "bg-green-100 text-green-800" },
  { value: "COMPLETED", color: "bg-emerald-100 text-emerald-800" },
  { value: "CANCELLED", color: "bg-red-100 text-red-800" }
];

const PREFERENCE_LABELS = {
  detergent_type: "Detergent",
  water_temperature: "Water temperature",
  fabric_softener: "Fabric softener",
  folding_style: "Folding style",
  hanging_instructions: "Hanging instructions",
  allergies: "Allergies",
  special_instructions: "Special instructions",
  pickup_time_preference: "Preferred time",
  gate_code: "Gate code",
  hang_dry_items: "Hang dry items",
  fragrance_preference: "Fragrance"
};

const PAYMENT_METHODS = [
  { value: "cash", label: "Cash" },
  { value: "card", label: "Card" },
  { value: "transfer", label: "Transfer" },
  { value: "other", label: "Other" }
];

export default function OperatorDashboard() {
  const { t } = useLocale();
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
  const [stripeLoading, setStripeLoading] = useState(false);
  const [stripePolling, setStripePolling] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiReply, setAiReply] = useState("");
  const [aiResults, setAiResults] = useState([]);
  const [aiLoading, setAiLoading] = useState(false);

  // Translate status labels dynamically
  const getStatusLabel = (status) => {
    const map = {
      NEW: t("New", "Nueva"),
      CONFIRMED: t("Confirmed", "Confirmado"),
      PICKUP_SCHEDULED: t("Pickup Scheduled", "Pickup Programado"),
      PICKED_UP: t("Picked Up", "Recogido"),
      PROCESSING: t("Processing", "En Proceso"),
      READY: t("Ready", "Lista"),
      OUT_FOR_DELIVERY: t("Out for Delivery", "En camino"),
      DELIVERED: t("Delivered", "Entregada"),
      COMPLETED: t("Completed", "Completada"),
      CANCELLED: t("Cancelled", "Cancelada")
    };
    return map[status] || status;
  };

  const getStatusInfo = (status) => {
    const found = ORDER_STATUSES.find(s => s.value === status) || ORDER_STATUSES[0];
    return { ...found, label: getStatusLabel(found.value) };
  };

  // Translate preference labels
  const getPreferenceLabel = (key) => {
    const map = {
      detergent_type: t("Detergent", "Detergente"),
      water_temperature: t("Water temperature", "Temperatura de agua"),
      fabric_softener: t("Fabric softener", "Suavizante"),
      folding_style: t("Folding style", "Estilo de doblado"),
      hanging_instructions: t("Hanging instructions", "Instrucciones de colgado"),
      allergies: t("Allergies", "Alergias"),
      special_instructions: t("Special instructions", "Instrucciones especiales"),
      pickup_time_preference: t("Preferred time", "Horario preferido"),
      gate_code: t("Gate code", "Código de acceso"),
      hang_dry_items: t("Hang dry items", "Secado al aire"),
      fragrance_preference: t("Fragrance", "Fragancia")
    };
    return map[key] || key;
  };

  // Translate payment method labels
  const getPaymentMethodLabel = (method) => {
    const map = {
      cash: t("Cash", "Efectivo"),
      card: t("Card (Stripe)", "Tarjeta (Stripe)"),
      transfer: t("Transfer", "Transferencia"),
      other: t("Other", "Otro")
    };
    return map[method] || method;
  };

  const getPaymentStatusLabel = (status) => {
    if (!status) return t("Pending", "Pendiente");
    const normalized = status.toString().toLowerCase();
    if (normalized === "paid") return t("Paid", "Pagado");
    if (normalized === "refunded") return t("Refunded", "Reembolsado");
    if (normalized === "failed") return t("Failed", "Fallido");
    return t("Pending", "Pendiente");
  };

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
      toast.error(t("Error loading dashboard", "Error al cargar dashboard"));
    } finally {
      setLoading(false);
    }
  }, [autoRefresh, t]);

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
        toast.success(t("Order {id} updated to {status}", "Orden {id} actualizada a {status}")
          .replace("{id}", orderId).replace("{status}", getStatusLabel(newStatus)));
        await loadDashboard();
      } else {
        toast.error(t("Error updating order", "Error al actualizar orden"));
      }
    } catch (error) {
      toast.error(t("Connection error", "Error de conexión"));
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
      toast.success(t("Weights updated", "Libras actualizadas"));
      setSelectedOrder((prev) => prev ? { ...prev, ...updated, order_id: prev.order_id, id: prev.id || updated.id } : prev);
      await loadDashboard();
    } catch (error) {
      toast.error(error.response?.data?.detail || t("Error updating weights", "Error actualizando libras"));
    } finally {
      setSavingWeights(false);
    }
  };

  const handlePrintTicket = async (order) => {
    const targetOrder = order || selectedOrder;
    if (!targetOrder) return;
    const orderPrimaryId = targetOrder.id || targetOrder.order_id;
    if (!orderPrimaryId) {
      toast.error(t("Invalid order", "Orden inválida"));
      return;
    }
    try {
      const res = await axios.get(`${API_URL}/api/orders/${orderPrimaryId}/qr.svg`, { responseType: "blob" });
      const blobUrl = window.URL.createObjectURL(res.data);
      const printWindow = window.open("");
      if (!printWindow) {
        toast.error(t("Allow pop-ups to print", "Permite ventanas emergentes para imprimir"));
        return;
      }
      printWindow.document.write(`<html><body style="margin:0;display:flex;align-items:center;justify-content:center;"><img src="${blobUrl}" style="max-width:100%;" onload="window.print();window.onafterprint=function(){window.close();};" /></body></html>`);
      printWindow.document.close();
    } catch (error) {
      toast.error(t("Could not generate ticket", "No se pudo generar el ticket"));
    }
  };

  const handleRegisterPayment = async () => {
    if (!selectedOrder) return;
    const orderPrimaryId = selectedOrder.id || selectedOrder.order_id;
    const totalAmount = selectedOrder.total_amount ?? calculateServiceCharge(selectedOrder);
    if (!totalAmount) {
      toast.error(t("Set actual lbs to calculate total", "Ingresa lbs reales para calcular"));
      return;
    }
    if (!selectedOrder.total_amount) {
      await axios.put(`${API_URL}/api/orders/${orderPrimaryId}`, {
        actual_lbs: selectedOrder.actual_lbs
      });
    }
    if (paymentForm.method === "cash" && paymentForm.amountReceived === "") {
      toast.error(t("Enter amount received", "Ingresa el monto recibido"));
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
      toast.success(t("Payment registered", "Pago registrado"));
      setSelectedOrder((prev) => prev ? { ...prev, ...updated } : prev);
      await loadDashboard();
    } catch (error) {
      toast.error(error.response?.data?.detail || t("Error registering payment", "Error registrando pago"));
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
      toast.error(t("Could not execute AI task", "No se pudo ejecutar la tarea IA"));
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
    const totalRaw = selectedOrder?.total_amount ?? calculateServiceCharge(selectedOrder);
    if (!totalRaw) return "-";
    const amount = parseFloat(paymentForm.amountReceived);
    const total = parseFloat(totalRaw);
    if (Number.isNaN(amount) || Number.isNaN(total)) return "-";
    const diff = amount - total;
    return diff >= 0 ? `$${diff.toFixed(2)}` : `-$${Math.abs(diff).toFixed(2)}`;
  };

  const openMaps = (address) => {
    if (!address) return;
    const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
    window.open(url, "_blank");
  };

  const isMemberOrder = (order) => {
    const status = (order?.membership_status || "").toString().toLowerCase();
    if (["inactive", "cancelled", "canceled", "expired"].includes(status)) return false;
    if (["active", "current", "paid", "yes", "true"].includes(status)) return true;
    return Boolean(order?.membership_plan);
  };

  const calculateServiceCharge = (order) => {
    if (!order) return null;
    const lbsValue = parseFloat(order.actual_lbs);
    if (Number.isNaN(lbsValue) || lbsValue <= 0) return null;
    if (order.service_type === "wash_fold") {
      const billable = Math.max(lbsValue, 10);
      return billable * 2.25;
    }
    const rate = isMemberOrder(order) ? 2.5 : 2.75;
    const amount = Math.max(lbsValue * rate, 40);
    return amount;
  };

  const initiateStripeCheckout = async (order) => {
    if (!order) return;
    setStripeLoading(true);
    try {
      const orderId = order.id || order.order_id;
      const res = await axios.post(`${API_URL}/api/orders/${orderId}/stripe-checkout`, {
        origin_url: window.location.origin
      });
      if (res.data?.url) {
        window.location.href = res.data.url;
      } else {
        toast.error(t("Unable to start Stripe checkout", "No se pudo iniciar Stripe"));
      }
    } catch (error) {
      const message = error.response?.data?.detail || t("Stripe checkout failed", "Falló Stripe");
      toast.error(message);
    } finally {
      setStripeLoading(false);
    }
  };

  const pollStripeStatus = async (sessionId, attempt = 0) => {
    const maxAttempts = 6;
    if (attempt >= maxAttempts) {
      setStripePolling(false);
      toast.error(t("Payment status timeout", "Tiempo de espera de pago"));
      return;
    }
    try {
      const res = await axios.get(`${API_URL}/api/orders/stripe/status/${sessionId}`);
      if (res.data?.payment_status === "paid") {
        toast.success(t("Payment confirmed", "Pago confirmado"));
        setStripePolling(false);
        await loadDashboard();
        return;
      }
      if (res.data?.status === "expired") {
        toast.error(t("Payment expired", "Pago expirado"));
        setStripePolling(false);
        return;
      }
      setTimeout(() => pollStripeStatus(sessionId, attempt + 1), 2000);
    } catch (error) {
      setTimeout(() => pollStripeStatus(sessionId, attempt + 1), 2000);
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get("session_id");
    if (sessionId && !stripePolling) {
      setStripePolling(true);
      pollStripeStatus(sessionId);
      const cleanUrl = window.location.pathname;
      window.history.replaceState({}, "", cleanUrl);
    }
  }, [stripePolling]);

  const realtimeLabel = realtimeStatus === "connected"
    ? t("Realtime: connected", "Tiempo real: conectado")
    : realtimeStatus === "disabled"
      ? t("Realtime: not configured", "Tiempo real: sin configurar")
      : t("Realtime: disconnected", "Tiempo real: desconectado");
  const realtimeClass = realtimeStatus === "connected"
    ? "bg-emerald-100 text-emerald-700"
    : realtimeStatus === "disabled"
      ? "bg-slate-100 text-slate-500"
      : "bg-orange-100 text-orange-700";

  const dedupeOrders = (orders) => {
    const seen = new Set();
    return orders.filter((order) => {
      const key = order.order_id || order.id;
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };

  const pickupOrders = (dashboard?.todays_pickups || []).filter(
    (order) => !order.service_type || order.service_type === "pickup_delivery"
  );
  const pickupDeliveries = (dashboard?.ready_for_delivery || []).filter(
    (order) => !order.service_type || order.service_type === "pickup_delivery"
  );
  const washFoldDropoffs = dashboard?.wash_fold_dropoffs || [];
  const washFoldReady = dashboard?.wash_fold_ready || [];

  const pickupPaymentQueue = dedupeOrders([...pickupOrders, ...pickupDeliveries]).filter(
    (order) => (order.payment_status || "pending") !== "paid"
  );
  const washFoldPaymentQueue = dedupeOrders([...washFoldDropoffs, ...washFoldReady]).filter(
    (order) => (order.payment_status || "pending") !== "paid"
  );

  const selectedOrderCharge = selectedOrder ? calculateServiceCharge(selectedOrder) : null;

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
            {t("Operator Dashboard", "Panel del Operador")}
          </h1>
          <p className="text-slate-600">
            {t("Just update order status – the system does the rest", "Solo actualiza el estado de las órdenes - el sistema hace el resto")}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className={`px-3 py-1 rounded-full text-xs font-semibold ${realtimeClass}`} data-testid="operator-realtime-status">
            {realtimeLabel}
          </span>
          <span className="text-sm text-slate-500">
            {t("Last refresh:", "Última actualización:")} {lastRefresh.toLocaleTimeString()}
          </span>
          <Button onClick={() => setAutoRefresh(!autoRefresh)} variant="outline" size="sm" data-testid="toggle-auto-refresh">
            {autoRefresh ? t("Pause", "Pausar") : t("Resume", "Reanudar")}
          </Button>
          <Button onClick={loadDashboard} variant="outline" size="sm" data-testid="refresh-dashboard">
            <RefreshCw className="h-4 w-4 mr-2" />
            {t("Refresh", "Actualizar")}
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
              <p className="text-sm text-slate-600" data-testid="operator-stat-pickups-label">{t("Pickups Today", "Pickups Hoy")}</p>
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
              <p className="text-sm text-slate-600" data-testid="operator-stat-processing-label">{t("In Process", "En Proceso")}</p>
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
              <p className="text-sm text-slate-600" data-testid="operator-stat-deliveries-label">{t("Deliveries Ongoing", "Entregas en curso")}</p>
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
              <p className="text-sm text-slate-600" data-testid="operator-stat-urgent-label">{t("Urgent Tickets", "Tickets Urgentes")}</p>
            </div>
          </div>
        </div>
      </div>

      {/* AI Operations Assistant */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
          <Bot className="h-5 w-5 text-sky-600" />
          <h2 className="font-semibold text-slate-900">{t("AI Operations Assistant", "Asistente Operativo IA")}</h2>
        </div>
        <div className="p-6 grid gap-6 lg:grid-cols-[2fr_1fr]">
          <div>
            <Textarea
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              rows={4}
              placeholder={t(
                "Example: Mark order VFL-20260222-02220002 as paid in cash $50 and generate ticket",
                "Ej: Marca la orden VFL-20260222-02220002 como pagada en efectivo $50 y genera ticket"
              )}
              data-testid="operator-ai-input"
            />
            <div className="flex flex-wrap gap-2 mt-3">
              <Button onClick={handleAiRequest} disabled={aiLoading} data-testid="operator-ai-submit">
                {aiLoading ? t("Processing...", "Procesando...") : t("Send to AI", "Enviar a IA")}
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
                {t("Clear", "Limpiar")}
              </Button>
            </div>
          </div>
          <div className="bg-slate-50 rounded-xl p-4">
            <p className="text-sm text-slate-500">{t("Response", "Respuesta")}</p>
            <p className="font-medium text-slate-900 mt-1" data-testid="operator-ai-reply">
              {aiReply || t("No reply yet", "Aún no hay respuesta")}
            </p>
            <div className="mt-4">
              <p className="text-xs text-slate-500">{t("Executed actions", "Acciones ejecutadas")}</p>
              {aiResults.length === 0 ? (
                <p className="text-sm text-slate-400 mt-1">{t("No actions yet", "Sin acciones todavía")}</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {aiResults.map((result, index) => (
                    <li
                      key={`${result.type}-${index}`}
                      className="text-sm text-slate-700"
                      data-testid={`operator-ai-result-${index}`}
                    >
                      {result.type}: {result.ok ? t("OK", "OK") : t("Error", "Error")}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </div>


      {/* POS - Operator */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6" data-testid="operator-pos-grid">
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden" data-testid="pos-pickup-today-card">
            <div className="px-5 py-4 border-b border-slate-100 bg-slate-50">
              <h2 className="font-semibold text-slate-900 flex items-center gap-2">
                <Truck className="h-5 w-5 text-sky-600" />
                {t("Pickup & Delivery — Pickups Today", "Pickup & Delivery — Pickups de hoy")} ({pickupOrders.length})
              </h2>
            </div>
            <div className="divide-y divide-slate-100">
              {pickupOrders.length === 0 ? (
                <div className="p-6 text-center text-slate-500" data-testid="pos-pickup-today-empty">
                  <Truck className="h-10 w-10 mx-auto mb-2 text-slate-300" />
                  <p>{t("No pickups scheduled", "No hay pickups programados")}</p>
                </div>
              ) : (
                pickupOrders.map((order) => (
                  <div
                    key={order.order_id}
                    className="p-4 hover:bg-slate-50 transition-colors cursor-pointer"
                    data-testid={`pos-pickup-item-${order.order_id}`}
                    role="button"
                    onClick={() => setSelectedOrder(order)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-mono font-semibold text-slate-900">{formatOrderId(order)}</span>
                          <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${getStatusInfo(order.status).color}`}>
                            {getStatusInfo(order.status).label}
                          </span>
                        </div>
                        <div className="text-sm text-slate-600">{order.customer_name || t("Customer", "Cliente")}</div>
                        <div className="text-xs text-slate-500 mt-1">
                          {order.pickup_time || t("No time", "Sin hora")} · {order.pickup_address || t("No address", "Sin dirección")}
                        </div>
                      </div>
                      <div className="flex flex-col gap-2">
                        {(order.next_status || getNextStatus(order.status)) && (
                          <Button
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              updateOrderStatus(order.order_id, order.next_status || getNextStatus(order.status));
                            }}
                            disabled={updating[order.order_id]}
                            className="bg-sky-600 hover:bg-sky-700"
                            data-testid={`pos-pickup-update-${order.order_id}`}
                          >
                            {updating[order.order_id] ? (
                              <RefreshCw className="h-4 w-4 animate-spin" />
                            ) : (
                              <>
                                {getStatusInfo(order.next_status || getNextStatus(order.status)).label}
                                <ChevronRight className="h-4 w-4 ml-1" />
                              </>
                            )}
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handlePrintTicket(order);
                          }}
                          data-testid={`pos-pickup-print-${order.order_id}`}
                        >
                          {t("Print Ticket", "Imprimir Ticket")}
                        </Button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden" data-testid="pos-pickup-payment-card">
            <div className="px-5 py-4 border-b border-slate-100 bg-slate-50">
              <h2 className="font-semibold text-slate-900 flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-emerald-600" />
                {t("Pickup & Delivery — Request Payment", "Pickup & Delivery — Solicitar pago")} ({pickupPaymentQueue.length})
              </h2>
            </div>
            <div className="divide-y divide-slate-100">
              {pickupPaymentQueue.length === 0 ? (
                <div className="p-6 text-center text-slate-500" data-testid="pos-pickup-payment-empty">
                  <p>{t("No pickup payments pending", "Sin pagos pendientes")}</p>
                </div>
              ) : (
                pickupPaymentQueue.map((order) => {
                  const amount = calculateServiceCharge(order);
                  return (
                    <div
                      key={order.order_id}
                      className="p-4 hover:bg-slate-50 transition-colors cursor-pointer"
                      data-testid={`pos-pickup-payment-${order.order_id}`}
                      role="button"
                      onClick={() => setSelectedOrder(order)}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-mono font-semibold text-slate-900">{formatOrderId(order)}</span>
                            <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${getStatusInfo(order.status).color}`}>
                              {getStatusInfo(order.status).label}
                            </span>
                          </div>
                          <div className="text-sm text-slate-600">{order.customer_name || t("Customer", "Cliente")}</div>
                          <div className="text-xs text-slate-500 mt-1">
                            {t("Charge", "Cobro")}: {amount ? formatCurrency(amount) : t("Set actual lbs", "Ingresa lbs reales")}
                          </div>
                        </div>
                        <Button
                          size="sm"
                          className="bg-emerald-600 hover:bg-emerald-700"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedOrder(order);
                          }}
                          data-testid={`pos-pickup-collect-${order.order_id}`}
                        >
                          {t("Collect", "Cobrar")}
                        </Button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden" data-testid="pos-pickup-delivery-card">
            <div className="px-5 py-4 border-b border-slate-100 bg-emerald-50">
              <h2 className="font-semibold text-slate-900 flex items-center gap-2" data-testid="operator-delivery-section-title">
                <CheckCircle className="h-5 w-5 text-emerald-600" />
                {t("Pickup & Delivery — Deliveries in progress", "Pickup & Delivery — Entregas en curso")} ({pickupDeliveries.length})
              </h2>
            </div>
            <div className="divide-y divide-slate-100">
              {pickupDeliveries.length === 0 ? (
                <div className="p-6 text-center text-slate-500" data-testid="operator-delivery-empty">
                  <Package className="h-10 w-10 mx-auto mb-2 text-slate-300" />
                  <p>{t("No deliveries in progress", "No hay entregas en curso")}</p>
                </div>
              ) : (
                pickupDeliveries.map((order) => (
                  <div
                    key={order.order_id}
                    className="p-4 hover:bg-slate-50 transition-colors cursor-pointer"
                    data-testid={`pos-pickup-delivery-${order.order_id}`}
                    role="button"
                    onClick={() => setSelectedOrder(order)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-mono font-semibold text-slate-900">{formatOrderId(order)}</span>
                          <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${getStatusInfo(order.status).color}`}>
                            {getStatusInfo(order.status).label}
                          </span>
                        </div>
                        <div className="text-sm text-slate-600">{order.customer_name || t("Customer", "Cliente")}</div>
                        <div className="text-xs text-slate-500 mt-1">
                          {order.delivery_address || order.pickup_address || "-"}
                        </div>
                      </div>
                      {(order.next_status || getNextStatus(order.status)) && (
                        <Button
                          size="sm"
                          className="bg-emerald-600 hover:bg-emerald-700"
                          onClick={(e) => {
                            e.stopPropagation();
                            updateOrderStatus(order.order_id, order.next_status || getNextStatus(order.status));
                          }}
                          disabled={updating[order.order_id]}
                          data-testid={`pos-pickup-delivery-update-${order.order_id}`}
                        >
                          {updating[order.order_id] ? (
                            <RefreshCw className="h-4 w-4 animate-spin" />
                          ) : (
                            <>
                              {getStatusInfo(order.next_status || getNextStatus(order.status)).label}
                              <ChevronRight className="h-4 w-4 ml-1" />
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden" data-testid="pos-washfold-dropoff-card">
            <div className="px-5 py-4 border-b border-slate-100 bg-slate-50">
              <h2 className="font-semibold text-slate-900 flex items-center gap-2">
                <Package className="h-5 w-5 text-purple-600" />
                {t("Wash & Fold Drop-Off", "Wash & Fold Drop-Off")} ({washFoldDropoffs.length})
              </h2>
            </div>
            <div className="divide-y divide-slate-100">
              {washFoldDropoffs.length === 0 ? (
                <div className="p-6 text-center text-slate-500" data-testid="pos-washfold-dropoff-empty">
                  <p>{t("No drop-offs waiting", "Sin entregas pendientes")}</p>
                </div>
              ) : (
                washFoldDropoffs.map((order) => (
                  <div
                    key={order.order_id}
                    className="p-4 hover:bg-slate-50 transition-colors cursor-pointer"
                    data-testid={`pos-washfold-dropoff-${order.order_id}`}
                    role="button"
                    onClick={() => setSelectedOrder(order)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-mono font-semibold text-slate-900">{formatOrderId(order)}</span>
                          <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${getStatusInfo(order.status).color}`}>
                            {getStatusInfo(order.status).label}
                          </span>
                        </div>
                        <div className="text-sm text-slate-600">{order.customer_name || t("Customer", "Cliente")}</div>
                        <div className="text-xs text-slate-500 mt-1">
                          {order.pickup_date || t("Drop-off today", "Entrega hoy")}
                        </div>
                      </div>
                      {(order.next_status || getNextStatus(order.status)) && (
                        <Button
                          size="sm"
                          className="bg-purple-600 hover:bg-purple-700"
                          onClick={(e) => {
                            e.stopPropagation();
                            updateOrderStatus(order.order_id, order.next_status || getNextStatus(order.status));
                          }}
                          disabled={updating[order.order_id]}
                          data-testid={`pos-washfold-update-${order.order_id}`}
                        >
                          {updating[order.order_id] ? (
                            <RefreshCw className="h-4 w-4 animate-spin" />
                          ) : (
                            <>
                              {getStatusInfo(order.next_status || getNextStatus(order.status)).label}
                              <ChevronRight className="h-4 w-4 ml-1" />
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden" data-testid="pos-washfold-payment-card">
            <div className="px-5 py-4 border-b border-slate-100 bg-slate-50">
              <h2 className="font-semibold text-slate-900 flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-emerald-600" />
                {t("Wash & Fold — Request Payment", "Wash & Fold — Solicitar pago")} ({washFoldPaymentQueue.length})
              </h2>
            </div>
            <div className="divide-y divide-slate-100">
              {washFoldPaymentQueue.length === 0 ? (
                <div className="p-6 text-center text-slate-500" data-testid="pos-washfold-payment-empty">
                  <p>{t("No wash & fold payments pending", "Sin pagos pendientes")}</p>
                </div>
              ) : (
                washFoldPaymentQueue.map((order) => {
                  const amount = calculateServiceCharge(order);
                  return (
                    <div
                      key={order.order_id}
                      className="p-4 hover:bg-slate-50 transition-colors cursor-pointer"
                      data-testid={`pos-washfold-payment-${order.order_id}`}
                      role="button"
                      onClick={() => setSelectedOrder(order)}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-mono font-semibold text-slate-900">{formatOrderId(order)}</span>
                            <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${getStatusInfo(order.status).color}`}>
                              {getStatusInfo(order.status).label}
                            </span>
                          </div>
                          <div className="text-sm text-slate-600">{order.customer_name || t("Customer", "Cliente")}</div>
                          <div className="text-xs text-slate-500 mt-1">
                            {t("Charge", "Cobro")}: {amount ? formatCurrency(amount) : t("Set actual lbs", "Ingresa lbs reales")}
                          </div>
                        </div>
                        <Button
                          size="sm"
                          className="bg-emerald-600 hover:bg-emerald-700"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedOrder(order);
                          }}
                          data-testid={`pos-washfold-collect-${order.order_id}`}
                        >
                          {t("Collect", "Cobrar")}
                        </Button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden" data-testid="pos-washfold-ready-card">
            <div className="px-5 py-4 border-b border-slate-100 bg-emerald-50">
              <h2 className="font-semibold text-slate-900 flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-emerald-600" />
                {t("Wash & Fold — Ready or Delivered", "Wash & Fold — Listas o entregadas")} ({washFoldReady.length})
              </h2>
            </div>
            <div className="divide-y divide-slate-100">
              {washFoldReady.length === 0 ? (
                <div className="p-6 text-center text-slate-500" data-testid="pos-washfold-ready-empty">
                  <p>{t("No wash & fold orders ready", "No hay órdenes listas")}</p>
                </div>
              ) : (
                washFoldReady.map((order) => (
                  <div
                    key={order.order_id}
                    className="p-4 hover:bg-slate-50 transition-colors cursor-pointer"
                    data-testid={`pos-washfold-ready-${order.order_id}`}
                    role="button"
                    onClick={() => setSelectedOrder(order)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-mono font-semibold text-slate-900">{formatOrderId(order)}</span>
                          <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${getStatusInfo(order.status).color}`}>
                            {getStatusInfo(order.status).label}
                          </span>
                        </div>
                        <div className="text-sm text-slate-600">{order.customer_name || t("Customer", "Cliente")}</div>
                        <div className="text-xs text-slate-500 mt-1">
                          {t("Payment", "Pago")}: {getPaymentStatusLabel(order.payment_status)}
                        </div>
                      </div>
                      {(order.next_status || getNextStatus(order.status)) && (
                        <Button
                          size="sm"
                          className="bg-emerald-600 hover:bg-emerald-700"
                          onClick={(e) => {
                            e.stopPropagation();
                            updateOrderStatus(order.order_id, order.next_status || getNextStatus(order.status));
                          }}
                          disabled={updating[order.order_id]}
                          data-testid={`pos-washfold-ready-update-${order.order_id}`}
                        >
                          {updating[order.order_id] ? (
                            <RefreshCw className="h-4 w-4 animate-spin" />
                          ) : (
                            <>
                              {getStatusInfo(order.next_status || getNextStatus(order.status)).label}
                              <ChevronRight className="h-4 w-4 ml-1" />
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      <Dialog open={!!selectedOrder} onOpenChange={(open) => !open && setSelectedOrder(null)}>
        <DialogContent className="sm:max-w-lg bg-white" style={{ backgroundColor: 'white', opacity: 1 }} data-testid="operator-order-detail-modal">
          <DialogHeader>
            <DialogTitle>{t("Order", "Orden")} <span data-testid="operator-order-number">{formatOrderNumber(selectedOrder)}</span></DialogTitle>
            <DialogDescription data-testid="operator-order-description">
              {t("Complete order details for operation.", "Detalle completo de la orden para operación.")}
            </DialogDescription>
          </DialogHeader>
          {selectedOrder && (
            <div className="space-y-4 mt-3">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-slate-500">{t("Status", "Estado")}</p>
                  <p className="font-medium" data-testid="operator-order-status">{getStatusInfo(selectedOrder.status).label}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-500">{t("Service", "Servicio")}</p>
                  <p className="font-medium" data-testid="operator-order-service">{selectedOrder.service_type || "-"}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-500">{t("Customer", "Cliente")}</p>
                  <p className="font-medium" data-testid="operator-order-customer">{selectedOrder.customer_name || "-"}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-500">{t("Membership", "Membresía")}</p>
                  <p className="font-medium" data-testid="operator-order-membership">{selectedOrder.membership_plan || t("No", "No")}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-slate-500">{t("Phone", "Teléfono")}</p>
                  <p className="font-medium" data-testid="operator-order-phone">{selectedOrder.customer_phone || "-"}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-500">{t("Email", "Correo")}</p>
                  <p className="font-medium" data-testid="operator-order-email">{selectedOrder.customer_email || "-"}</p>
                </div>
              </div>
              <div>
                <p className="text-sm text-slate-500">{t("Contact preference", "Contacto preferido")}</p>
                <p className="font-medium" data-testid="operator-order-contact">{selectedOrder.preferred_contact || "-"}</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-slate-500">{t("Pickup Date", "Fecha Pickup")}</p>
                  <p className="font-medium" data-testid="operator-order-pickup-date">{selectedOrder.pickup_date || "-"}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-500">{t("Time Window", "Ventana de tiempo")}</p>
                  <p className="font-medium" data-testid="operator-order-pickup-window">{selectedOrder.pickup_time || "-"}</p>
                </div>
              </div>
              <div>
                <p className="text-sm text-slate-500">{t("Pickup Address", "Dirección Pickup")}</p>
                <p className="font-medium" data-testid="operator-order-pickup-address">{selectedOrder.pickup_address || "-"}</p>
              </div>
              <div>
                <p className="text-sm text-slate-500">{t("Delivery Address", "Dirección Entrega")}</p>
                <p className="font-medium" data-testid="operator-order-delivery-address">{selectedOrder.delivery_address || "-"}</p>
              </div>
              {selectedOrder.special_instructions && (
                <div>
                  <p className="text-sm text-slate-500">{t("Notes", "Notas")}</p>
                  <p className="font-medium" data-testid="operator-order-notes">{selectedOrder.special_instructions}</p>
                </div>
              )}
              {selectedOrder.gate_code && (
                <div>
                  <p className="text-sm text-slate-500">{t("Gate code", "Código de acceso")}</p>
                  <p className="font-medium" data-testid="operator-order-gate">{selectedOrder.gate_code}</p>
                </div>
              )}
              <div className="border-t pt-3" data-testid="operator-lbs-section">
                <p className="text-sm text-slate-500">{t("Pounds", "Libras")}</p>
                <div className="grid grid-cols-2 gap-4 mt-2">
                  <div>
                    <p className="text-xs text-slate-500">{t("Est. Lbs", "Est. Lbs")}</p>
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
                    <p className="text-xs text-slate-500">{t("Actual Lbs", "Actual Lbs")}</p>
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
                  <p className="text-xs text-slate-500" data-testid="operator-lbs-delta">{t("Difference:", "Diferencia:")} {getWeightDelta()}</p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={updateOrderWeights}
                    disabled={savingWeights}
                    data-testid="operator-save-lbs"
                  >
                    {savingWeights ? t("Saving...", "Guardando...") : t("Save lbs", "Guardar libras")}
                  </Button>
                </div>
              </div>
              <div className="border-t pt-3" data-testid="operator-payment-section">
                <p className="text-sm text-slate-500">{t("Payment", "Pago")}</p>
                <div className="grid grid-cols-2 gap-4 mt-2">
                  <div>
                    <p className="text-xs text-slate-500">{t("Total", "Total")}</p>
                    <p className="font-medium" data-testid="operator-payment-total">{formatCurrency(selectedOrder.total_amount ?? selectedOrderCharge)}</p>
                    <p className="text-xs text-slate-500 mt-1" data-testid="operator-payment-total-note">
                      {selectedOrderCharge
                        ? t("Auto-calculated from actual lbs", "Calculado automáticamente según lbs reales")
                        : t("Set actual lbs to calculate total", "Ingresa lbs reales para calcular")}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">{t("Status", "Estado")}</p>
                    <p className="font-medium" data-testid="operator-payment-status">{getPaymentStatusLabel(selectedOrder.payment_status)}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 mt-2">
                  <div>
                    <p className="text-xs text-slate-500">{t("Method", "Método")}</p>
                    <select
                      value={paymentForm.method}
                      onChange={(e) => setPaymentForm({ ...paymentForm, method: e.target.value })}
                      className="w-full mt-1 border border-slate-200 rounded-md px-2 py-2 text-sm"
                      data-testid="operator-payment-method"
                    >
                      {PAYMENT_METHODS.map((method) => (
                        <option key={method.value} value={method.value}>{getPaymentMethodLabel(method.value)}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">{t("Amount received", "Monto recibido")}</p>
                    <Input
                      type="number"
                      step="0.01"
                      value={paymentForm.amountReceived}
                      onChange={(e) => setPaymentForm({ ...paymentForm, amountReceived: e.target.value })}
                      className="mt-1"
                      disabled={paymentForm.method !== "cash"}
                      placeholder={paymentForm.method === "cash" ? "0.00" : t("Not required", "No requerido")}
                      data-testid="operator-payment-amount"
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between mt-2">
                  <p className="text-xs text-slate-500" data-testid="operator-payment-change">{t("Change:", "Cambio:")} {paymentForm.method === "cash" ? getChangePreview() : "-"}</p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleRegisterPayment}
                      disabled={savingPayment}
                      data-testid="operator-payment-save"
                    >
                      {savingPayment ? t("Saving...", "Guardando...") : t("Register payment", "Registrar pago")}
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handlePrintTicket(selectedOrder)}
                      data-testid="operator-payment-print"
                    >
                      {t("Print Ticket", "Imprimir Ticket")}
                    </Button>
                    {paymentForm.method === "card" && (
                      <Button
                        size="sm"
                        className="bg-emerald-600 hover:bg-emerald-700"
                        onClick={() => initiateStripeCheckout(selectedOrder)}
                        disabled={stripeLoading || !selectedOrderCharge}
                        data-testid="operator-payment-stripe"
                      >
                        {stripeLoading ? t("Starting Stripe...", "Iniciando Stripe...") : t("Pay with Stripe", "Pagar con Stripe")}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
              <div className="border-t pt-3" data-testid="operator-preferences-section">
                <p className="text-sm text-slate-500">{t("Laundry preferences", "Preferencias de lavandería")}</p>
                {selectedOrder.preferences_snapshot ? (
                  <div className="grid grid-cols-2 gap-3 mt-2">
                    {Object.entries(PREFERENCE_LABELS).map(([key]) => (
                      <div key={key}>
                        <p className="text-xs text-slate-500">{getPreferenceLabel(key)}</p>
                        <p className="font-medium" data-testid={`operator-pref-${key}`}>
                          {renderPreferenceValue(selectedOrder.preferences_snapshot?.[key])}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm font-medium text-slate-600 mt-1" data-testid="operator-pref-empty">
                    {t("No preferences recorded", "Sin preferencias registradas")}
                  </p>
                )}
                <p className="text-xs text-slate-500 mt-2" data-testid="operator-pref-id">
                  {t("PREF:", "PREF:")} {selectedOrder.preferences_id || "N/A"}
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
              {t("Urgent Tickets", "Tickets Urgentes")} ({dashboard.urgent_tickets.length})
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
                        {t("URGENT", "URGENTE")}
                      </span>
                    </div>
                    <p className="font-medium text-slate-900 mt-1">{ticket.subject}</p>
                    <p className="text-sm text-slate-600 mt-1 line-clamp-2">{ticket.description}</p>
                    <p className="text-xs text-red-600 mt-2">
                      {t("SLA:", "SLA:")} {new Date(ticket.sla_deadline).toLocaleString()}
                    </p>
                  </div>
                  {ticket.customer_phone && (
                    <a href={`tel:${ticket.customer_phone}`} className="flex items-center gap-1 text-sm text-sky-600 hover:text-sky-700">
                      <Phone className="h-4 w-4" />
                      {t("Call", "Llamar")}
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