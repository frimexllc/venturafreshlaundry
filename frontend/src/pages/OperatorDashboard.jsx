import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "../components/ui/dialog";
import { 
  Truck, Package, Clock, AlertTriangle, CheckCircle, 
  RefreshCw, Phone, MapPin, MessageSquare, ChevronRight,
  Calendar, User, Zap, Bot, DollarSign, ShoppingBag
} from "lucide-react";
import { toast } from "sonner";
import { createNotificationsSocket } from "../utils/notificationsSocket";
import DeliveryZonesManager from "../components/DeliveryZonesManager";
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

const STORE_STATUS_FLOW = ["pending", "confirmed", "processing", "shipped", "delivered", "cancelled"];

const getNextStoreStatus = (status) => {
  const normalized = (status || "pending").toLowerCase();
  const idx = STORE_STATUS_FLOW.indexOf(normalized);
  if (idx === -1 || idx === STORE_STATUS_FLOW.length - 1) return null;
  return STORE_STATUS_FLOW[idx + 1];
};

const getStoreStatusLabel = (status) => {
  const normalized = (status || "pending").toLowerCase();
  const labels = {
    pending: "Pending",
    confirmed: "Confirmed",
    processing: "Processing",
    shipped: "Shipped",
    delivered: "Delivered",
    cancelled: "Cancelled"
  };
  return labels[normalized] || status;
};


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
  const [storeOrders, setStoreOrders] = useState([]);
  const [storeOrdersLoading, setStoreOrdersLoading] = useState(false);
  const [storeUpdating, setStoreUpdating] = useState({});
  const [storePosOpen, setStorePosOpen] = useState(false);
  const [storeCart, setStoreCart] = useState(null);
  const [storeCartLoading, setStoreCartLoading] = useState(false);
  const [storeProducts, setStoreProducts] = useState([]);
  const [storeSearch, setStoreSearch] = useState("");
  const [storeCheckoutForm, setStoreCheckoutForm] = useState({
    name: "",
    email: "",
    phone: "",
    address: "",
    apt: "",
    instructions: "",
    notes: "",
    preferred_contact: "sms",
    payment_method: "card",
    fulfillment_type: "pickup"
  });
  const [storeShippingQuote, setStoreShippingQuote] = useState({ distance_km: null, fee: 0, zone_name: null });
  const [storeCheckoutLoading, setStoreCheckoutLoading] = useState(false);
  const [storePaymentOrder, setStorePaymentOrder] = useState(null);
  const [storePaymentForm, setStorePaymentForm] = useState({ method: "card" });
  const [storeProcessingPayment, setStoreProcessingPayment] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiReply, setAiReply] = useState("");
  const [aiResults, setAiResults] = useState([]);
  const [aiLoading, setAiLoading] = useState(false);

  // Helper function to safely get error message
  const getErrorMessage = (error, defaultMessage) => {
    if (typeof error === 'string') return error;
    if (error?.response?.data?.detail) return error.response.data.detail;
    if (error?.message) return error.message;
    return defaultMessage;
  };

  // Safe string conversion for any value
  const safeString = (value, defaultValue = "-") => {
    if (value === null || value === undefined) return defaultValue;
    if (typeof value === 'object') {
      // Si es un objeto de error, retornar mensaje de error o default
      if (value.message) return value.message;
      if (value.msg) return value.msg;
      return defaultValue;
    }
    return String(value);
  };

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
    return map[status] || safeString(status);
  };

  const getStatusInfo = (status) => {
    const found = ORDER_STATUSES.find(s => s.value === status) || ORDER_STATUSES[0];
    return { ...found, label: getStatusLabel(found.value) };
  };

  const storeStatusLabels = {
    pending: t("Pending", "Pendiente"),
    confirmed: t("Confirmed", "Confirmado"),
    processing: t("Processing", "Procesando"),
    shipped: t("Shipped", "Enviado"),
    delivered: t("Delivered", "Entregado"),
    cancelled: t("Cancelled", "Cancelado")
  };

  const getStoreStatusDisplay = (status) => {
    const normalized = (status || "pending").toLowerCase();
    return storeStatusLabels[normalized] || safeString(status);
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
    return map[method] || safeString(method);
  };

  const getPaymentStatusLabel = (status) => {
    if (!status) return t("Pending", "Pendiente");
    const normalized = status.toString().toLowerCase();
    if (normalized === "paid") return t("Paid", "Pagado");
    if (normalized === "refunded") return t("Refunded", "Reembolsado");
    if (normalized === "failed") return t("Failed", "Fallido");
    return t("Pending", "Pendiente");
  };

  const formatApiError = (detail, fallback) => {
    if (!detail) return fallback;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) {
      const msg = detail.map((item) => item?.msg || JSON.stringify(item)).join(", ");
      return msg || fallback;
    }
    if (detail?.msg) return detail.msg;
    return JSON.stringify(detail);
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

  const loadStoreOrders = useCallback(async () => {
    setStoreOrdersLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/store/orders`);
      if (res.ok) {
        const data = await res.json();
        setStoreOrders(data || []);
      }
    } catch (error) {
      toast.error(t("Error loading store orders", "Error cargando órdenes de tienda"));
    } finally {
      setStoreOrdersLoading(false);
    }
  }, [t]);

  useEffect(() => {
    loadDashboard();
    loadStoreOrders();
    const interval = setInterval(() => {
      if (autoRefresh) {
        loadDashboard();
        loadStoreOrders();
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [loadDashboard, loadStoreOrders, autoRefresh]);

  useEffect(() => {
    const socket = createNotificationsSocket();
    if (!socket) {
      setRealtimeStatus("disabled");
      return;
    }

    const handleNotification = () => {
      loadDashboard();
      loadStoreOrders();
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
  }, [loadDashboard, loadStoreOrders]);

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
          .replace("{id}", safeString(orderId)).replace("{status}", getStatusLabel(newStatus)));
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

  const updateStoreOrderStatus = async (orderId, newStatus) => {
    setStoreUpdating(prev => ({ ...prev, [orderId]: true }));
    try {
      const res = await fetch(`${API_URL}/api/store/orders/${orderId}/status?status=${newStatus}`, {
        method: "PUT"
      });
      if (res.ok) {
        toast.success(t("Store order updated", "Orden de tienda actualizada"));
        await loadStoreOrders();
      } else {
        const error = await res.json();
        toast.error(formatApiError(error.detail, t("Error updating store order", "Error actualizando orden de tienda")));
      }
    } catch (error) {
      toast.error(t("Connection error", "Error de conexión"));
    } finally {
      setStoreUpdating(prev => ({ ...prev, [orderId]: false }));
    }
  };

  const refundStoreOrder = async (orderId) => {
    setStoreUpdating(prev => ({ ...prev, [orderId]: true }));
    try {
      const res = await fetch(`${API_URL}/api/store/orders/${orderId}/refund`, { method: "POST" });
      if (res.ok) {
        toast.success(t("Store order refunded", "Orden reembolsada"));
        await loadStoreOrders();
      } else {
        const error = await res.json();
        toast.error(formatApiError(error.detail, t("Refund failed", "Falló el reembolso")));
      }
    } catch (error) {
      toast.error(t("Connection error", "Error de conexión"));
    } finally {
      setStoreUpdating(prev => ({ ...prev, [orderId]: false }));
    }
  };

  const handlePrintStoreOrder = (order) => {
    if (!order) return;
    const printWindow = window.open("");
    if (!printWindow) {
      toast.error(t("Allow pop-ups to print", "Permite ventanas emergentes para imprimir"));
      return;
    }
    const itemsRows = (order.items || [])
      .map((item) => `<tr><td>${safeString(item.name || item.product_name || "Item")}</td><td>${safeString(item.quantity)}</td><td>$${(Number(item.price) || 0).toFixed(2)}</td></tr>`)
      .join("");
    printWindow.document.write(`
      <html>
        <body style="font-family: Arial, sans-serif; padding: 24px;">
          <h2>Store Order ${safeString(order.order_number)}</h2>
          <p>${safeString(order.customer_name)} ${safeString(order.customer_email)}</p>
          <table style="width:100%; border-collapse: collapse; margin-top: 16px;">
            <thead><tr><th align="left">Item</th><th align="left">Qty</th><th align="left">Price</th></tr></thead>
            <tbody>${itemsRows}</tbody>
          </table>
          <p style="margin-top: 16px;">Subtotal: $${(Number(order.subtotal) || 0).toFixed(2)}</p>
          <p>Shipping: $${(Number(order.shipping_fee) || 0).toFixed(2)}</p>
          <p><strong>Total: $${(Number(order.total) || 0).toFixed(2)}</strong></p>
          <script>window.print();window.onafterprint=function(){window.close();};</script>
        </body>
      </html>
    `);
    printWindow.document.close();
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
      toast.error(getErrorMessage(error, t("Error updating weights", "Error actualizando libras")));
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
      toast.error(getErrorMessage(error, t("Error registering payment", "Error registrando pago")));
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
    if (!dateStr) return new Date().toISOString().slice(0, 10).replace(/-/g, "");
    try {
      const base = new Date(dateStr);
      if (Number.isNaN(base.getTime())) {
        return new Date().toISOString().slice(0, 10).replace(/-/g, "");
      }
      return base.toISOString().slice(0, 10).replace(/-/g, "");
    } catch {
      return new Date().toISOString().slice(0, 10).replace(/-/g, "");
    }
  };

  const formatOrderNumber = (order) => {
    if (!order || typeof order !== 'object') return "-";
    try {
      if (order.order_number && typeof order.order_number === 'string' && order.order_number.startsWith("VFL-")) {
        return order.order_number;
      }
      const dateSlug = buildDateSlug(order.created_at || order.pickup_date);
      const raw = (order.order_number || order.order_id || "00000000").toString();
      const short = raw.replace(/[^a-zA-Z0-9]/g, "").toLowerCase().slice(-8).padStart(8, "0");
      return `VFL-${dateSlug}-${short}`;
    } catch {
      return "-";
    }
  };

  const formatOrderId = (order) => {
    return formatOrderNumber(order);
  };

  const renderPreferenceValue = (value) => {
    if (Array.isArray(value)) {
      return value.length ? value.map(v => safeString(v)).join(", ") : "-";
    }
    if (value === null || value === undefined || value === "") {
      return "-";
    }
    if (typeof value === 'object') {
      return "-";
    }
    return value.toString();
  };

  const getWeightDelta = () => {
    try {
      const est = parseFloat(weightForm.estimated_lbs);
      const act = parseFloat(weightForm.actual_lbs);
      if (Number.isNaN(est) || Number.isNaN(act)) {
        return "-";
      }
      const diff = parseFloat((act - est).toFixed(2));
      return diff > 0 ? `+${diff}` : `${diff}`;
    } catch {
      return "-";
    }
  };

  const formatCurrency = (value) => {
    if (value === null || value === undefined || value === "") return "-";
    try {
      const num = parseFloat(value);
      if (Number.isNaN(num)) return "-";
      return `$${num.toFixed(2)}`;
    } catch {
      return "-";
    }
  };

  const getChangePreview = () => {
    try {
      const totalRaw = selectedOrder?.total_amount ?? calculateServiceCharge(selectedOrder);
      if (!totalRaw) return "-";
      const amount = parseFloat(paymentForm.amountReceived);
      const total = parseFloat(totalRaw);
      if (Number.isNaN(amount) || Number.isNaN(total)) return "-";
      const diff = amount - total;
      return diff >= 0 ? `$${diff.toFixed(2)}` : `-$${Math.abs(diff).toFixed(2)}`;
    } catch {
      return "-";
    }
  };

  const openMaps = (address) => {
    if (!address) return;
    const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(safeString(address))}`;
    window.open(url, "_blank");
  };

  const isMemberOrder = (order) => {
    if (!order) return false;
    try {
      const status = (order?.membership_status || "").toString().toLowerCase();
      if (["inactive", "cancelled", "canceled", "expired"].includes(status)) return false;
      if (["active", "current", "paid", "yes", "true"].includes(status)) return true;
      return Boolean(order?.membership_plan);
    } catch {
      return false;
    }
  };

  const calculateServiceCharge = (order) => {
    if (!order) return null;
    try {
      const lbsValue = parseFloat(order.actual_lbs);
      if (Number.isNaN(lbsValue) || lbsValue <= 0) return null;
      if (order.service_type === "wash_fold") {
        const billable = Math.max(lbsValue, 10);
        return billable * 2.25;
      }
      const rate = isMemberOrder(order) ? 2.5 : 2.75;
      const amount = Math.max(lbsValue * rate, 40);
      return amount;
    } catch {
      return null;
    }
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
      const message = getErrorMessage(error, t("Stripe checkout failed", "Falló Stripe"));
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

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const storeSessionId = params.get("store_session_id");
    if (!storeSessionId) return;
    const checkStatus = async () => {
      try {
        const res = await fetch(`${API_URL}/api/store/orders/by-session/${storeSessionId}`);
        if (res.ok) {
          const data = await res.json();
          if (data.payment_status === "paid") {
            toast.success(t("Store payment confirmed", "Pago de tienda confirmado"));
          } else {
            toast.info(t("Store payment pending", "Pago de tienda pendiente"));
          }
        }
      } catch (error) {
        // ignore
      } finally {
        await loadStoreOrders();
        const cleanUrl = window.location.pathname;
        window.history.replaceState({}, "", cleanUrl);
      }
    };
    checkStatus();
  }, [loadStoreOrders, t]);

  const openStorePos = async () => {
    setStorePosOpen(true);
    setStoreCartLoading(true);
    try {
      const [cartRes, productsRes] = await Promise.all([
        fetch(`${API_URL}/api/store/cart`, { method: "POST" }),
        fetch(`${API_URL}/api/store/products`)
      ]);
      if (cartRes.ok) {
        const cartData = await cartRes.json();
        setStoreCart(cartData);
      }
      if (productsRes.ok) {
        const productsData = await productsRes.json();
        setStoreProducts(productsData || []);
      }
    } catch (error) {
      toast.error(t("Error loading store POS", "Error cargando POS"));
    } finally {
      setStoreCartLoading(false);
    }
  };

  const resetStorePos = () => {
    setStorePosOpen(false);
    setStoreCart(null);
    setStoreProducts([]);
    setStoreSearch("");
    setStoreCheckoutForm({
      name: "",
      email: "",
      phone: "",
      address: "",
      apt: "",
      instructions: "",
      notes: "",
      preferred_contact: "sms",
      payment_method: "card",
      fulfillment_type: "pickup"
    });
    setStoreShippingQuote({ distance_km: null, fee: 0, zone_name: null });
  };

  const getCartItemQuantity = (productId) => {
    try {
      const item = storeCart?.items?.find((entry) => entry.product_id === productId);
      return item ? item.quantity : 0;
    } catch {
      return 0;
    }
  };

  const updateStoreCartItem = async (product, quantity) => {
    if (!storeCart) return;
    try {
      const endpoint = `${API_URL}/api/store/cart/${storeCart.id}/items/${product.id}`;
      let res;
      if (quantity <= 0) {
        res = await fetch(endpoint, { method: "DELETE" });
      } else if (getCartItemQuantity(product.id) === 0) {
        res = await fetch(`${API_URL}/api/store/cart/${storeCart.id}/items`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ product_id: product.id, quantity })
        });
      } else {
        res = await fetch(endpoint, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ quantity })
        });
      }
      if (res.ok) {
        const data = await res.json();
        setStoreCart(data);
      } else {
        const error = await res.json();
        toast.error(formatApiError(error.detail, t("Unable to update cart", "No se pudo actualizar el carrito")));
      }
    } catch (error) {
      toast.error(t("Connection error", "Error de conexión"));
    }
  };

  const handleStoreCheckout = async () => {
    if (!storeCart || !storeCart.items?.length) {
      toast.error(t("Cart is empty", "El carrito está vacío"));
      return;
    }
    if (!storeCheckoutForm.name || !storeCheckoutForm.email || !storeCheckoutForm.phone) {
      toast.error(t("Complete customer details", "Completa los datos del cliente"));
      return;
    }
    if (storeCheckoutForm.fulfillment_type === "delivery" && !storeCheckoutForm.address) {
      toast.error(t("Add delivery address", "Agrega dirección de entrega"));
      return;
    }
    if (storeCheckoutForm.fulfillment_type === "delivery" && !storeShippingQuote.distance_km) {
      toast.error(t("Calculate shipping before charging", "Calcula el envío antes de cobrar"));
      return;
    }

    setStoreCheckoutLoading(true);
    try {
      const payload = {
        cart_id: storeCart.id,
        origin_url: window.location.origin,
        customer_name: storeCheckoutForm.name,
        customer_email: storeCheckoutForm.email,
        customer_phone: storeCheckoutForm.phone,
        shipping_address: storeCheckoutForm.fulfillment_type === "delivery" ? storeCheckoutForm.address : "",
        shipping_apt: storeCheckoutForm.apt,
        delivery_instructions: storeCheckoutForm.instructions,
        notes: storeCheckoutForm.notes,
        preferred_contact: storeCheckoutForm.preferred_contact,
        fulfillment_type: storeCheckoutForm.fulfillment_type
      };

      const endpoint = storeCheckoutForm.payment_method === "card"
        ? `${API_URL}/api/store/checkout`
        : `${API_URL}/api/store/checkout/manual`;

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          storeCheckoutForm.payment_method === "card"
            ? payload
            : { ...payload, payment_method: storeCheckoutForm.payment_method }
        )
      });

      if (res.ok) {
        const data = await res.json();
        if (storeCheckoutForm.payment_method === "card") {
          window.location.href = data.checkout_url;
        } else {
          toast.success(t("Store order confirmed", "Orden confirmada"));
          resetStorePos();
          await loadStoreOrders();
        }
      } else {
        const error = await res.json();
        toast.error(formatApiError(error.detail, t("Payment failed", "Pago fallido")));
      }
    } catch (error) {
      toast.error(t("Connection error", "Error de conexión"));
    } finally {
      setStoreCheckoutLoading(false);
    }
  };

  const handleStorePayment = async () => {
    if (!storePaymentOrder) return;
    setStoreProcessingPayment(true);
    try {
      if (storePaymentForm.method === "card") {
        const res = await fetch(`${API_URL}/api/store/orders/${storePaymentOrder.id}/stripe-checkout`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ origin_url: window.location.origin })
        });
        if (res.ok) {
          const data = await res.json();
          window.location.href = data.checkout_url;
          return;
        }
        const error = await res.json();
        toast.error(formatApiError(error.detail, t("Stripe checkout failed", "Falló Stripe")));
      } else {
        const res = await fetch(`${API_URL}/api/store/orders/${storePaymentOrder.id}/payment`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ payment_method: storePaymentForm.method })
        });
        if (res.ok) {
          toast.success(t("Payment registered", "Pago registrado"));
          setStorePaymentOrder(null);
          await loadStoreOrders();
        } else {
          const error = await res.json();
          toast.error(formatApiError(error.detail, t("Payment failed", "Pago fallido")));
        }
      }
    } catch (error) {
      toast.error(t("Connection error", "Error de conexión"));
    } finally {
      setStoreProcessingPayment(false);
    }
  };

  useEffect(() => {
    if (!storePosOpen) return;
    if (storeCheckoutForm.fulfillment_type !== "delivery") {
      setStoreShippingQuote({ distance_km: null, fee: 0, zone_name: null });
      return;
    }
    if (!storeCheckoutForm.address) {
      setStoreShippingQuote({ distance_km: null, fee: 0, zone_name: null });
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`${API_URL}/api/store/shipping/quote`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address: storeCheckoutForm.address })
        });
        if (res.ok) {
          const data = await res.json();
          setStoreShippingQuote(data);
        } else {
          setStoreShippingQuote({ distance_km: null, fee: 0, zone_name: null });
        }
      } catch (error) {
        setStoreShippingQuote({ distance_km: null, fee: 0, zone_name: null });
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [storeCheckoutForm.address, storeCheckoutForm.fulfillment_type, storePosOpen]);

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
    if (!Array.isArray(orders)) return [];
    const seen = new Set();
    return orders.filter((order) => {
      if (!order || typeof order !== 'object') return false;
      const key = order.order_id || order.id;
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };

  const pickupOrders = dedupeOrders(dashboard?.todays_pickups || []).filter(
    (order) => !order.service_type || order.service_type === "pickup_delivery"
  );
  const pickupDeliveries = dedupeOrders(dashboard?.ready_for_delivery || []).filter(
    (order) => !order.service_type || order.service_type === "pickup_delivery"
  );
  const washFoldDropoffs = dedupeOrders(dashboard?.wash_fold_dropoffs || []);
  const washFoldReady = dedupeOrders(dashboard?.wash_fold_ready || []);

  const pickupPaymentQueue = dedupeOrders([...pickupOrders, ...pickupDeliveries]).filter(
    (order) => (order.payment_status || "pending") !== "paid"
  );
  const washFoldPaymentQueue = dedupeOrders([...washFoldDropoffs, ...washFoldReady]).filter(
    (order) => (order.payment_status || "pending") !== "paid"
  );

  const storeCartSubtotal = storeCart?.total || 0;
  const storeShippingFee = storeCheckoutForm.fulfillment_type === "delivery" ? (storeShippingQuote.fee || 0) : 0;
  const storeOrderTotal = storeCartSubtotal + storeShippingFee;
  const filteredStoreProducts = storeProducts.filter((product) =>
    product.name?.toLowerCase().includes(storeSearch.toLowerCase())
  );
  const unpaidStoreOrders = storeOrders.filter((order) => {
    const status = (order.payment_status || "pending").toLowerCase();
    return status !== "paid" && status !== "refunded";
  });

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
                {t("Pickup & Delivery — Pickups Today", "Pickup & Delivery — Pickups de hoy")}
                <span className="ml-2 text-sm font-semibold text-slate-600" data-testid="pos-pickup-today-count">({pickupOrders.length})</span>
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
                    key={order.order_id || Math.random()}
                    className="p-4 hover:bg-slate-50 transition-colors cursor-pointer"
                    data-testid={`pos-pickup-item-${order.order_id || 'unknown'}`}
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
                        <div className="text-sm text-slate-600">{safeString(order.customer_name, t("Customer", "Cliente"))}</div>
                        <div className="text-xs text-slate-500 mt-1">
                          {safeString(order.pickup_time, t("No time", "Sin hora"))} · {safeString(order.pickup_address, t("No address", "Sin dirección"))}
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
                {t("Pickup & Delivery — Request Payment", "Pickup & Delivery — Solicitar pago")}
                <span className="ml-2 text-sm font-semibold text-slate-600" data-testid="pos-pickup-payment-count">({pickupPaymentQueue.length})</span>
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
                      key={order.order_id || Math.random()}
                      className="p-4 hover:bg-slate-50 transition-colors cursor-pointer"
                      data-testid={`pos-pickup-payment-${order.order_id || 'unknown'}`}
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
                          <div className="text-sm text-slate-600">{safeString(order.customer_name, t("Customer", "Cliente"))}</div>
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
                {t("Pickup & Delivery — Deliveries in progress", "Pickup & Delivery — Entregas en curso")}
                <span className="ml-2 text-sm font-semibold text-slate-600" data-testid="pos-pickup-delivery-count">({pickupDeliveries.length})</span>
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
                    key={order.order_id || Math.random()}
                    className="p-4 hover:bg-slate-50 transition-colors cursor-pointer"
                    data-testid={`pos-pickup-delivery-${order.order_id || 'unknown'}`}
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
                        <div className="text-sm text-slate-600">{safeString(order.customer_name, t("Customer", "Cliente"))}</div>
                        <div className="text-xs text-slate-500 mt-1">
                          {safeString(order.delivery_address || order.pickup_address, "-")}
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
                {t("Wash & Fold Drop-Off", "Wash & Fold Drop-Off")}
                <span className="ml-2 text-sm font-semibold text-slate-600" data-testid="pos-washfold-dropoff-count">({washFoldDropoffs.length})</span>
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
                    key={order.order_id || Math.random()}
                    className="p-4 hover:bg-slate-50 transition-colors cursor-pointer"
                    data-testid={`pos-washfold-dropoff-${order.order_id || 'unknown'}`}
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
                        <div className="text-sm text-slate-600">{safeString(order.customer_name, t("Customer", "Cliente"))}</div>
                        <div className="text-xs text-slate-500 mt-1">
                          {safeString(order.pickup_date, t("Drop-off today", "Entrega hoy"))}
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
                {t("Wash & Fold — Request Payment", "Wash & Fold — Solicitar pago")}
                <span className="ml-2 text-sm font-semibold text-slate-600" data-testid="pos-washfold-payment-count">({washFoldPaymentQueue.length})</span>
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
                      key={order.order_id || Math.random()}
                      className="p-4 hover:bg-slate-50 transition-colors cursor-pointer"
                      data-testid={`pos-washfold-payment-${order.order_id || 'unknown'}`}
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
                          <div className="text-sm text-slate-600">{safeString(order.customer_name, t("Customer", "Cliente"))}</div>
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
                {t("Wash & Fold — Ready or Delivered", "Wash & Fold — Listas o entregadas")}
                <span className="ml-2 text-sm font-semibold text-slate-600" data-testid="pos-washfold-ready-count">({washFoldReady.length})</span>
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
                    key={order.order_id || Math.random()}
                    className="p-4 hover:bg-slate-50 transition-colors cursor-pointer"
                    data-testid={`pos-washfold-ready-${order.order_id || 'unknown'}`}
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
                        <div className="text-sm text-slate-600">{safeString(order.customer_name, t("Customer", "Cliente"))}</div>
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

      <div className="mt-10 space-y-6">
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden" data-testid="store-orders-panel">
          <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-slate-900">{t("Store Orders", "Órdenes tienda")}</h3>
              <p className="text-sm text-slate-500">{t("Process product purchases", "Procesa compras de productos")}</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button
                size="sm"
                className="bg-sky-600 hover:bg-sky-700"
                onClick={openStorePos}
                data-testid="store-pos-open"
              >
                {t("New Store Sale", "Nueva venta")}
              </Button>
              {unpaidStoreOrders.length > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setStorePaymentOrder(unpaidStoreOrders[0]);
                    setStorePaymentForm({ method: "card" });
                  }}
                  data-testid="store-pos-request-payment"
                >
                  {t("Request payment", "Solicitar pago")} ({unpaidStoreOrders.length})
                </Button>
              )}
              <span className="text-sm font-semibold text-slate-600" data-testid="store-orders-count">
                {storeOrders.length}
              </span>
            </div>
          </div>
          <div className="px-6 py-3 bg-white border-b border-slate-100" data-testid="store-orders-steps">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
              <span className="px-2 py-1 rounded-full bg-slate-100">1. {t("Open POS", "Abre POS")}</span>
              <span className="px-2 py-1 rounded-full bg-slate-100">2. {t("Add products", "Agrega productos")}</span>
              <span className="px-2 py-1 rounded-full bg-slate-100">3. {t("Collect payment", "Cobrar")}</span>
            </div>
            {unpaidStoreOrders.length > 0 && (
              <div className="mt-2 text-xs text-amber-700" data-testid="store-orders-unpaid-hint">
                {t("Pending payments available below", "Pagos pendientes disponibles abajo")}
              </div>
            )}
          </div>
          {storeOrdersLoading ? (
            <div className="p-6 text-center text-slate-500" data-testid="store-orders-loading">
              {t("Loading store orders...", "Cargando órdenes...")}
            </div>
          ) : storeOrders.length === 0 ? (
            <div className="p-6 text-center text-slate-500" data-testid="store-orders-empty">
              {t("No store orders yet", "Sin órdenes de tienda")}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="text-left px-4 py-3">{t("Order", "Orden")}</th>
                    <th className="text-left px-4 py-3">{t("Customer", "Cliente")}</th>
                    <th className="text-left px-4 py-3">{t("Status", "Estado")}</th>
                    <th className="text-left px-4 py-3">{t("Payment", "Pago")}</th>
                    <th className="text-left px-4 py-3">{t("Total", "Total")}</th>
                    <th className="text-right px-4 py-3">{t("Actions", "Acciones")}</th>
                  </tr>
                </thead>
                <tbody>
                  {storeOrders.map((order) => {
                    const nextStatus = getNextStoreStatus(order.status);
                    return (
                      <tr key={order.id || Math.random()} className="border-t border-slate-100" data-testid={`store-order-row-${order.id || 'unknown'}`}>
                        <td className="px-4 py-3 font-mono text-slate-900">{safeString(order.order_number)}</td>
                        <td className="px-4 py-3">
                          <div className="text-slate-900">{safeString(order.customer_name, t("Customer", "Cliente"))}</div>
                          <div className="text-xs text-slate-500">{safeString(order.customer_email)}</div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-1 rounded-full bg-slate-100 text-slate-700 text-xs" data-testid={`store-order-status-${order.id}`}>
                            {getStoreStatusDisplay(order.status)}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-slate-900" data-testid={`store-order-payment-${order.id}`}>
                            {getPaymentStatusLabel(order.payment_status)}
                          </div>
                          <div className="text-xs text-slate-500">{safeString(order.payment_method, "-")}</div>
                        </td>
                        <td className="px-4 py-3 font-semibold" data-testid={`store-order-total-${order.id}`}>
                          {formatCurrency(order.total)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex flex-wrap justify-end gap-2">
                            {(order.payment_status || "pending") !== "paid" && (order.payment_status || "").toLowerCase() !== "refunded" && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setStorePaymentOrder(order);
                                  setStorePaymentForm({ method: "card" });
                                }}
                                data-testid={`store-order-request-payment-${order.id}`}
                              >
                                {t("Request payment", "Solicitar pago")}
                              </Button>
                            )}
                            {nextStatus && (
                              <Button
                                size="sm"
                                onClick={() => updateStoreOrderStatus(order.id, nextStatus)}
                                disabled={storeUpdating[order.id]}
                                data-testid={`store-order-next-${order.id}`}
                              >
                                {storeUpdating[order.id] ? t("Updating...", "Actualizando...") : t("Move to", "Mover a") + ` ${getStoreStatusDisplay(nextStatus)}`}
                              </Button>
                            )}
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handlePrintStoreOrder(order)}
                              data-testid={`store-order-print-${order.id}`}
                            >
                              {t("Print", "Imprimir")}
                            </Button>
                            {order.payment_status === "paid" && (
                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => refundStoreOrder(order.id)}
                                disabled={storeUpdating[order.id]}
                                data-testid={`store-order-refund-${order.id}`}
                              >
                                {storeUpdating[order.id] ? t("Refunding...", "Reembolsando...") : t("Refund", "Reembolsar")}
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <DeliveryZonesManager />
      </div>

      <Dialog open={storePosOpen} onOpenChange={(open) => !open ? resetStorePos() : setStorePosOpen(true)}>
        <DialogContent className="sm:max-w-5xl bg-white">
          <DialogHeader>
            <DialogTitle>{t("New Store Sale", "Nueva venta en tienda")}</DialogTitle>
            <DialogDescription>
              {t("Select products and collect payment quickly.", "Selecciona productos y cobra rápidamente.")}
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6" data-testid="store-pos-modal">
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Input
                  placeholder={t("Search products", "Buscar productos")}
                  value={storeSearch}
                  onChange={(e) => setStoreSearch(e.target.value)}
                  data-testid="store-pos-search"
                />
              </div>
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="max-h-[380px] overflow-y-auto divide-y divide-slate-100" data-testid="store-pos-products">
                  {storeCartLoading ? (
                    <div className="p-6 text-center text-slate-500">{t("Loading products...", "Cargando productos...")}</div>
                  ) : filteredStoreProducts.length === 0 ? (
                    <div className="p-6 text-center text-slate-500">{t("No products found", "No hay productos")}</div>
                  ) : (
                    filteredStoreProducts.map((product) => {
                      const qty = getCartItemQuantity(product.id);
                      const disabled = product.stock <= 0 || !product.is_active;
                      return (
                        <div key={product.id || Math.random()} className="p-4 flex items-center justify-between gap-4" data-testid={`store-pos-product-${product.id}`}>
                          <div>
                            <p className="font-semibold text-slate-900">{safeString(product.name)}</p>
                            <p className="text-sm text-slate-500">${Number(product.price).toFixed(2)} · {t("Stock", "Stock")}: {product.stock}</p>
                            {disabled && <p className="text-xs text-red-500">{t("Unavailable", "No disponible")}</p>}
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => updateStoreCartItem(product, qty - 1)}
                              disabled={qty === 0}
                              data-testid={`store-pos-minus-${product.id}`}
                            >
                              -
                            </Button>
                            <span className="w-6 text-center" data-testid={`store-pos-qty-${product.id}`}>{qty}</span>
                            <Button
                              size="sm"
                              onClick={() => updateStoreCartItem(product, qty + 1)}
                              disabled={disabled}
                              data-testid={`store-pos-plus-${product.id}`}
                            >
                              +
                            </Button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
            <div className="space-y-4">
              <div className="border border-slate-200 rounded-xl p-4 bg-white" data-testid="store-pos-cart">
                <h4 className="font-semibold text-slate-900 mb-3">{t("Cart", "Carrito")}</h4>
                {storeCart?.items?.length ? (
                  <div className="space-y-2">
                    {storeCart.items.map((item) => (
                      <div key={item.product_id || Math.random()} className="flex items-center justify-between text-sm">
                        <span>{safeString(item.name || item.product_name)}</span>
                        <span>{item.quantity} × ${Number(item.price || 0).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">{t("No items yet", "Sin productos")}</p>
                )}
              </div>

              <div className="border border-slate-200 rounded-xl p-4 bg-white space-y-3" data-testid="store-pos-customer">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>{t("Name", "Nombre")} *</Label>
                    <Input
                      value={storeCheckoutForm.name}
                      onChange={(e) => setStoreCheckoutForm({ ...storeCheckoutForm, name: e.target.value })}
                      data-testid="store-pos-name"
                    />
                  </div>
                  <div>
                    <Label>{t("Phone", "Teléfono")} *</Label>
                    <Input
                      value={storeCheckoutForm.phone}
                      onChange={(e) => setStoreCheckoutForm({ ...storeCheckoutForm, phone: e.target.value })}
                      data-testid="store-pos-phone"
                    />
                  </div>
                </div>
                <div>
                  <Label>{t("Email", "Email")} *</Label>
                  <Input
                    type="email"
                    value={storeCheckoutForm.email}
                    onChange={(e) => setStoreCheckoutForm({ ...storeCheckoutForm, email: e.target.value })}
                    data-testid="store-pos-email"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>{t("Fulfillment", "Entrega")}</Label>
                    <select
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                      value={storeCheckoutForm.fulfillment_type}
                      onChange={(e) => setStoreCheckoutForm({ ...storeCheckoutForm, fulfillment_type: e.target.value })}
                      data-testid="store-pos-fulfillment"
                    >
                      <option value="pickup">{t("Pickup", "Recoger en tienda")}</option>
                      <option value="delivery">{t("Delivery", "Entrega a domicilio")}</option>
                    </select>
                  </div>
                  <div>
                    <Label>{t("Payment method", "Método de pago")}</Label>
                    <select
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                      value={storeCheckoutForm.payment_method}
                      onChange={(e) => setStoreCheckoutForm({ ...storeCheckoutForm, payment_method: e.target.value })}
                      data-testid="store-pos-payment-method"
                    >
                      <option value="card">{t("Card (Stripe)", "Tarjeta (Stripe)")}</option>
                      <option value="cash">{t("Cash", "Efectivo")}</option>
                      <option value="transfer">{t("Transfer", "Transferencia")}</option>
                      <option value="other">{t("Other", "Otro")}</option>
                    </select>
                  </div>
                </div>
                {storeCheckoutForm.fulfillment_type === "delivery" && (
                  <div>
                    <Label>{t("Delivery address", "Dirección de entrega")} *</Label>
                    <Input
                      value={storeCheckoutForm.address}
                      onChange={(e) => setStoreCheckoutForm({ ...storeCheckoutForm, address: e.target.value })}
                      data-testid="store-pos-address"
                    />
                  </div>
                )}
                <div>
                  <Label>{t("Notes", "Notas")}</Label>
                  <Input
                    value={storeCheckoutForm.notes}
                    onChange={(e) => setStoreCheckoutForm({ ...storeCheckoutForm, notes: e.target.value })}
                    data-testid="store-pos-notes"
                  />
                </div>
              </div>

              <div className="border border-slate-200 rounded-xl p-4 bg-white space-y-2" data-testid="store-pos-summary">
                <div className="flex items-center justify-between text-sm">
                  <span>{t("Subtotal", "Subtotal")}</span>
                  <span>${storeCartSubtotal.toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span>{t("Shipping", "Envío")}</span>
                  <span>
                    {storeCheckoutForm.fulfillment_type === "delivery"
                      ? storeShippingQuote.distance_km
                        ? `$${storeShippingFee.toFixed(2)} (${storeShippingQuote.distance_km} km)`
                        : t("Enter address", "Ingresa dirección")
                      : t("Pickup", "Recoger")}
                  </span>
                </div>
                {storeShippingQuote.zone_name && storeCheckoutForm.fulfillment_type === "delivery" && (
                  <p className="text-xs text-slate-500" data-testid="store-pos-zone">{safeString(storeShippingQuote.zone_name)}</p>
                )}
                <div className="flex items-center justify-between font-semibold">
                  <span>{t("Total", "Total")}</span>
                  <span>${storeOrderTotal.toFixed(2)}</span>
                </div>
                <Button
                  className="w-full bg-sky-600 hover:bg-sky-700"
                  onClick={handleStoreCheckout}
                  disabled={storeCheckoutLoading}
                  data-testid="store-pos-submit"
                >
                  {storeCheckoutLoading
                    ? t("Processing...", "Procesando...")
                    : storeCheckoutForm.payment_method === "card"
                      ? t("Pay with Stripe", "Pagar con Stripe")
                      : t("Confirm order", "Confirmar orden")}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!storePaymentOrder} onOpenChange={(open) => !open && setStorePaymentOrder(null)}>
        <DialogContent className="sm:max-w-lg bg-white">
          <DialogHeader>
            <DialogTitle>{t("Request payment", "Solicitar pago")}</DialogTitle>
            <DialogDescription>{safeString(storePaymentOrder?.order_number)}</DialogDescription>
          </DialogHeader>
          {storePaymentOrder && (
            <div className="space-y-4" data-testid="store-payment-modal">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600">{t("Total", "Total")}</span>
                <span className="text-lg font-semibold">{formatCurrency(storePaymentOrder.total)}</span>
              </div>
              <div>
                <Label>{t("Payment method", "Método de pago")}</Label>
                <select
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                  value={storePaymentForm.method}
                  onChange={(e) => setStorePaymentForm({ method: e.target.value })}
                  data-testid="store-payment-method"
                >
                  <option value="card">{t("Card (Stripe)", "Tarjeta (Stripe)")}</option>
                  <option value="cash">{t("Cash", "Efectivo")}</option>
                  <option value="transfer">{t("Transfer", "Transferencia")}</option>
                  <option value="other">{t("Other", "Otro")}</option>
                </select>
              </div>
              {storePaymentForm.method === "card" && (
                <p className="text-xs text-slate-500" data-testid="store-payment-note">
                  {t("Stripe Checkout will open in a new page", "Stripe Checkout se abrirá en otra página")}
                </p>
              )}
              <Button
                className="w-full bg-emerald-600 hover:bg-emerald-700"
                onClick={handleStorePayment}
                disabled={storeProcessingPayment}
                data-testid="store-payment-submit"
              >
                {storeProcessingPayment
                  ? t("Processing...", "Procesando...")
                  : storePaymentForm.method === "card"
                    ? t("Pay with Stripe", "Pagar con Stripe")
                    : t("Register payment", "Registrar pago")}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

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
                  <p className="font-medium" data-testid="operator-order-service">{safeString(selectedOrder.service_type, "-")}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-500">{t("Customer", "Cliente")}</p>
                  <p className="font-medium" data-testid="operator-order-customer">{safeString(selectedOrder.customer_name, "-")}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-500">{t("Membership", "Membresía")}</p>
                  <p className="font-medium" data-testid="operator-order-membership">{safeString(selectedOrder.membership_plan, t("No", "No"))}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-slate-500">{t("Phone", "Teléfono")}</p>
                  <p className="font-medium" data-testid="operator-order-phone">{safeString(selectedOrder.customer_phone, "-")}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-500">{t("Email", "Correo")}</p>
                  <p className="font-medium" data-testid="operator-order-email">{safeString(selectedOrder.customer_email, "-")}</p>
                </div>
              </div>
              <div>
                <p className="text-sm text-slate-500">{t("Contact preference", "Contacto preferido")}</p>
                <p className="font-medium" data-testid="operator-order-contact">{safeString(selectedOrder.preferred_contact, "-")}</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-slate-500">{t("Pickup Date", "Fecha Pickup")}</p>
                  <p className="font-medium" data-testid="operator-order-pickup-date">{safeString(selectedOrder.pickup_date, "-")}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-500">{t("Time Window", "Ventana de tiempo")}</p>
                  <p className="font-medium" data-testid="operator-order-pickup-window">{safeString(selectedOrder.pickup_time, "-")}</p>
                </div>
              </div>
              <div>
                <p className="text-sm text-slate-500">{t("Pickup Address", "Dirección Pickup")}</p>
                <p className="font-medium" data-testid="operator-order-pickup-address">{safeString(selectedOrder.pickup_address, "-")}</p>
              </div>
              <div>
                <p className="text-sm text-slate-500">{t("Delivery Address", "Dirección Entrega")}</p>
                <p className="font-medium" data-testid="operator-order-delivery-address">{safeString(selectedOrder.delivery_address, "-")}</p>
              </div>
              {selectedOrder.special_instructions && (
                <div>
                  <p className="text-sm text-slate-500">{t("Notes", "Notas")}</p>
                  <p className="font-medium" data-testid="operator-order-notes">{safeString(selectedOrder.special_instructions)}</p>
                </div>
              )}
              {selectedOrder.gate_code && (
                <div>
                  <p className="text-sm text-slate-500">{t("Gate code", "Código de acceso")}</p>
                  <p className="font-medium" data-testid="operator-order-gate">{safeString(selectedOrder.gate_code)}</p>
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
                    {paymentForm.method === "card" && (
                      <p className="text-xs text-slate-500 mt-2" data-testid="operator-payment-stripe-note">
                        {t("Card payments open Stripe Checkout", "Los pagos con tarjeta abren Stripe Checkout")}
                      </p>
                    )}
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
                  {t("PREF:", "PREF:")} {safeString(selectedOrder.preferences_id, "N/A")}
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
              <div key={ticket.ticket_id || Math.random()} className="p-4" data-testid={`ticket-${ticket.ticket_id}`}>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-semibold text-slate-900">{safeString(ticket.ticket_id)}</span>
                      <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-red-100 text-red-800">
                        {t("URGENT", "URGENTE")}
                      </span>
                    </div>
                    <p className="font-medium text-slate-900 mt-1">{safeString(ticket.subject)}</p>
                    <p className="text-sm text-slate-600 mt-1 line-clamp-2">{safeString(ticket.description)}</p>
                    <p className="text-xs text-red-600 mt-2">
                      {t("SLA:", "SLA:")} {new Date(ticket.sla_deadline).toLocaleString()}
                    </p>
                  </div>
                  {ticket.customer_phone && (
                    <a href={`tel:${safeString(ticket.customer_phone)}`} className="flex items-center gap-1 text-sm text-sky-600 hover:text-sky-700">
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