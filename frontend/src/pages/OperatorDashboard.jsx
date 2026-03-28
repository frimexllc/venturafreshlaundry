import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "../components/ui/dialog";
import { Truck, Package, AlertTriangle, CheckCircle, RefreshCw, Phone, ChevronRight, Zap, Bot, DollarSign, Printer, MapPin, Search } from "lucide-react";
import { toast } from "sonner";
import { createNotificationsSocket } from "../utils/notificationsSocket";
import DeliveryZonesManager from "../components/DeliveryZonesManager";
import OrderDetailDialog from "../components/operator-dashboard/OrderDetailDialog";
import { ORDER_STATUSES, STORE_STATUS_FLOW, getNextStoreStatus, safeString, formatApiError, formatCurrency, formatOrderNumber, isWashFoldService, getNextStatus, calculateServiceCharge, dedupeOrders } from "../components/operator-dashboard/utils";
import { useLocale } from "../context/LocaleContext";

// Importaciones de Leaflet y React Leaflet
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Iconos por defecto de Leaflet
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
});

const API_URL = process.env.REACT_APP_BACKEND_URL;

// Coordenadas de la tienda (Ventura, CA 93001)
const STORE_COORDINATES = { lat: 34.283, lng: -119.293 };

// Mapeo de códigos postales a coordenadas
const cpCoordinates = {
  "93001": { lat: 34.283, lng: -119.293 },
  "93003": { lat: 34.254, lng: -119.215 },
  "93004": { lat: 34.302, lng: -119.186 },
  "93030": { lat: 34.187, lng: -119.179 },
  "93036": { lat: 34.237, lng: -119.181 },
  "93035": { lat: 34.174, lng: -119.222 },
  "93010": { lat: 34.225, lng: -119.082 },
};

// Función para extraer código postal
const extractCP = (address) => {
  if (!address) return null;
  const match = address.match(/\b(\d{5})\b/);
  return match ? match[1] : null;
};

// Obtener coordenadas desde dirección
const getCoordinatesFromAddress = (address) => {
  const cp = extractCP(address);
  return cp && cpCoordinates[cp] ? cpCoordinates[cp] : null;
};

// Distancia en millas (Haversine)
function getDistanceInMiles(lat1, lng1, lat2, lng2) {
  const R = 3959;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) *
            Math.sin(dLng/2) * Math.sin(dLng/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Tarifa de envío: primeras 3 millas gratis, luego $2.99/milla extra
function calculateDeliveryFee(distanceMiles) {
  if (distanceMiles <= 3) return 0;
  const extra = distanceMiles - 3;
  return extra * 2.99;
}

// Color del marcador según estado
function getMarkerColor(status) {
  const s = (status || "").toUpperCase();
  switch (s) {
    case "NEW": return "#3b82f6";
    case "CONFIRMED": return "#3b82f6";
    case "PICKUP_SCHEDULED": return "#3b82f6";
    case "PICKED_UP": return "#f97316";
    case "PROCESSING": return "#f97316";
    case "READY": return "#22c55e";
    case "OUT_FOR_DELIVERY": return "#22c55e";
    case "DELIVERED": return "#22c55e";
    case "COMPLETED": return "#6b7280";
    case "CANCELLED": return "#ef4444";
    default: return "#6b7280";
  }
}

/* reusable primitives */
const CardHeader = ({ icon, title, count, bgClass = "bg-slate-50", testId }) => (
  <div className={`px-4 sm:px-5 py-3 border-b border-slate-100 ${bgClass}`}>
    <h2 className="font-semibold text-slate-900 flex items-center gap-2 text-sm sm:text-base">
      <span className="shrink-0">{icon}</span>
      <span className="truncate">{title}</span>
      <span className="ml-auto shrink-0 text-xs font-semibold text-slate-500 bg-white border border-slate-200 rounded-full px-2 py-0.5" data-testid={testId}>{count}</span>
    </h2>
  </div>
);

const EmptyState = ({ icon, text, testId }) => (
  <div className="p-8 text-center text-slate-400" data-testid={testId}>
    <div className="mb-2 flex justify-center opacity-25">{icon}</div>
    <p className="text-sm">{text}</p>
  </div>
);

const StatCard = ({ icon, bg, count, label, testId, highlight }) => (
  <div className={`bg-white rounded-xl border p-3 sm:p-4 transition-shadow hover:shadow-md ${highlight ? "border-red-200 bg-red-50/30" : "border-slate-200"}`}>
    <div className="flex items-center gap-2 sm:gap-3">
      <div className={`h-9 w-9 sm:h-10 sm:w-10 rounded-full ${bg} flex items-center justify-center shrink-0`}>{icon}</div>
      <div className="min-w-0">
        <p className="text-xl sm:text-2xl font-bold text-slate-900 leading-none" data-testid={`operator-stat-${testId}-count`}>{count}</p>
        <p className="text-xs sm:text-sm text-slate-500 mt-0.5 truncate" data-testid={`operator-stat-${testId}-label`}>{label}</p>
      </div>
    </div>
  </div>
);

/* generic order row used in pickup + washfold lists */
const OrderRow = ({ order, statusInfo, nextStatus, nextStatusInfo, updating, onRowClick, onAdvance, onPrint, advanceBtnClass = "bg-sky-600 hover:bg-sky-700", showPrint = false, t }) => (
  <div className="p-3 sm:p-4 hover:bg-slate-50/70 transition-colors cursor-pointer" role="button" onClick={() => onRowClick(order)} data-testid={`order-row-${order.order_id || "unknown"}`}>
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5 mb-1">
          <span className="font-mono font-semibold text-slate-900 text-xs sm:text-sm truncate">{formatOrderNumber(order)}</span>
          <span className={`px-1.5 py-0.5 text-xs font-medium rounded-full shrink-0 ${statusInfo.color}`}>{statusInfo.label}</span>
        </div>
        <p className="text-sm text-slate-700 font-medium truncate">{safeString(order.customer_name, t("Customer", "Cliente"))}</p>
        <p className="text-xs text-slate-400 mt-0.5 truncate">
          {safeString(order.pickup_time || order.pickup_date, t("No time", "Sin hora"))}
          {(order.pickup_address || order.delivery_address) && <> · {safeString(order.pickup_address || order.delivery_address)}</>}
          {extractCP(order.pickup_address || order.delivery_address) && (
            <span className="ml-1 px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded text-xs font-mono">
              CP {extractCP(order.pickup_address || order.delivery_address)}
            </span>
          )}
        </p>
      </div>
      <div className="flex flex-col gap-1.5 shrink-0" onClick={e => e.stopPropagation()}>
        {nextStatus && (
          <Button size="sm" className={`${advanceBtnClass} text-xs h-7 px-2`} onClick={() => onAdvance(order.order_id, nextStatus)} disabled={updating[order.order_id]} data-testid={`advance-btn-${order.order_id}`}>
            {updating[order.order_id] ? <RefreshCw className="h-3 w-3 animate-spin" /> : <><span className="hidden sm:inline mr-1">{nextStatusInfo?.label}</span><ChevronRight className="h-3 w-3" /></>}
          </Button>
        )}
        {showPrint && (
          <Button variant="outline" size="sm" className="text-xs h-7 px-2 gap-1 hover:border-sky-300 hover:text-sky-600" onClick={() => onPrint(order)} data-testid={`print-btn-${order.order_id}`}>
            <Printer className="h-3 w-3" /><span className="hidden sm:inline">{t("Ticket", "Ticket")}</span>
          </Button>
        )}
      </div>
    </div>
  </div>
);

/* main component */
export default function OperatorDashboard() {
  const { t } = useLocale();
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState({});
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [realtimeStatus, setRealtimeStatus] = useState("offline");
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [storeOrders, setStoreOrders] = useState([]);
  const [storeOrdersLoading, setStoreOrdersLoading] = useState(false);
  const [storeUpdating, setStoreUpdating] = useState({});
  const [storePosOpen, setStorePosOpen] = useState(false);
  const [storeCart, setStoreCart] = useState(null);
  const [storeCartLoading, setStoreCartLoading] = useState(false);
  const [storeProducts, setStoreProducts] = useState([]);
  const [storeSearch, setStoreSearch] = useState("");
  const [storeCheckoutForm, setStoreCheckoutForm] = useState({
    name: "", email: "", phone: "", address: "", apt: "",
    instructions: "", notes: "", preferred_contact: "sms",
    payment_method: "card", fulfillment_type: "pickup"
  });
  const [storeShippingQuote, setStoreShippingQuote] = useState({ distance_km: null, fee: 0, zone_name: null });
  const [storeShippingError, setStoreShippingError] = useState("");
  const [storeCheckoutLoading, setStoreCheckoutLoading] = useState(false);
  const [storePaymentOrder, setStorePaymentOrder] = useState(null);
  const [storePaymentForm, setStorePaymentForm] = useState({ method: "card" });
  const [storeProcessingPayment, setStoreProcessingPayment] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiReply, setAiReply] = useState("");
  const [aiResults, setAiResults] = useState([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  // Funciones de filtrado
  const filterOrders = (orders) => {
    if (!searchTerm.trim()) return orders;
    const term = searchTerm.toLowerCase();
    return orders.filter(order => {
      const orderNumber = (order.order_number || "").toLowerCase();
      const customerName = (order.customer_name || "").toLowerCase();
      const address = (order.pickup_address || order.delivery_address || "").toLowerCase();
      const cp = extractCP(address) || "";
      return orderNumber.includes(term) || customerName.includes(term) || address.includes(term) || cp.includes(term);
    });
  };

  // Obtener todas las órdenes para el mapa
  const getAllOrders = () => {
    const allOrders = [
      ...(dashboard?.todays_pickups || []),
      ...(dashboard?.ready_for_delivery || []),
      ...(dashboard?.wash_fold_dropoffs || []),
      ...(dashboard?.wash_fold_ready || [])
    ];
    return dedupeOrders(allOrders).filter(order => order.status?.toUpperCase() !== "COMPLETED");
  };

  // Órdenes con coordenadas para el mapa
  const ordersWithCoordinates = getAllOrders()
    .map(order => {
      const address = order.pickup_address || order.delivery_address;
      const coords = getCoordinatesFromAddress(address);
      if (!coords) return null;
      return { ...order, coords };
    })
    .filter(Boolean);

  // helpers
  const getStatusLabel = (status, serviceType) => {
    const s = (status || "").toString().toUpperCase();
    if (isWashFoldService(serviceType)) {
      const washFoldMap = {
        NEW: t("Order Received", "Orden recibida"),
        PROCESSING: t("Processing", "Procesando"),
        READY: t("Ready for Pickup", "Lista para recoger"),
        COMPLETED: t("Completed", "Completada"),
        CANCELLED: t("Cancelled", "Cancelada")
      };
      return washFoldMap[s] || safeString(status);
    }
    const pickupMap = {
      NEW: t("Order Created", "Orden creada"),
      CONFIRMED: t("Pickup Confirmed", "Pickup confirmado"),
      PICKUP_SCHEDULED: t("Pickup Confirmed", "Pickup confirmado"),
      PICKED_UP: t("In Process", "En proceso"),
      PROCESSING: t("In Process", "En proceso"),
      READY: t("Ready", "Lista"),
      OUT_FOR_DELIVERY: t("Out for Delivery", "En camino"),
      DELIVERED: t("Delivered", "Entregada"),
      COMPLETED: t("Completed", "Completada"),
      CANCELLED: t("Cancelled", "Cancelada")
    };
    return pickupMap[s] || safeString(status);
  };

  const getStatusInfo = (status, serviceType) => {
    const found = ORDER_STATUSES.find(s => s.value === status) || ORDER_STATUSES[0];
    return { ...found, label: getStatusLabel(found.value, serviceType) };
  };

  const getStoreStatusDisplay = (status) => {
    const n = (status || "pending").toLowerCase();
    const map = {
      pending: t("Pending", "Pendiente"),
      confirmed: t("Confirmed", "Confirmado"),
      processing: t("Processing", "Procesando"),
      shipped: t("Shipped", "Enviado"),
      delivered: t("Delivered", "Entregado"),
      cancelled: t("Cancelled", "Cancelado")
    };
    return map[n] || safeString(status);
  };

  const getPaymentStatusLabel = (status) => {
    if (!status) return t("Pending", "Pendiente");
    const n = status.toString().toLowerCase();
    if (n === "paid") return t("Paid", "Pagado");
    if (n === "refunded") return t("Refunded", "Reembolsado");
    if (n === "failed") return t("Failed", "Fallido");
    return t("Pending", "Pendiente");
  };

  // data loading
  const loadDashboard = useCallback(async () => {
    try {
      if (document.visibilityState !== "visible" && autoRefresh) return;
      const res = await fetch(`${API_URL}/api/automation/operator-dashboard`);
      if (res.ok) {
        setDashboard(await res.json());
        setLastRefresh(new Date());
      }
    } catch {
      toast.error(t("Error loading dashboard", "Error al cargar dashboard"));
    } finally {
      setLoading(false);
    }
  }, [autoRefresh, t]);

  const loadStoreOrders = useCallback(async () => {
    setStoreOrdersLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/store/orders`);
      if (res.ok) setStoreOrders(await res.json() || []);
    } catch {
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
    const fn = () => {
      loadDashboard();
      loadStoreOrders();
    };
    socket.on("connect", () => setRealtimeStatus("connected"));
    socket.on("disconnect", () => setRealtimeStatus("offline"));
    socket.on("connect_error", () => setRealtimeStatus("offline"));
    socket.on("notification", fn);
    socket.on("dashboard", fn);
    return () => {
      socket.off("notification", fn);
      socket.off("dashboard", fn);
      socket.disconnect();
    };
  }, [loadDashboard, loadStoreOrders]);

  /* order status update */
  const updateOrderStatus = async (orderId, newStatus) => {
    setUpdating(prev => ({ ...prev, [orderId]: true }));
    try {
      const res = await fetch(`${API_URL}/api/automation/orders/${orderId}/status?new_status=${newStatus.toLowerCase()}`, {
        method: "PUT"
      });
      if (res.ok) {
        toast.success(t("Status updated", "Estado actualizado"));
        await loadDashboard();
      } else {
        const errorText = await res.text();
        toast.error(t("Error updating order", "Error al actualizar orden") + `: ${errorText}`);
      }
    } catch (error) {
      toast.error(t("Connection error", "Error de conexión"));
    } finally {
      setUpdating(prev => ({ ...prev, [orderId]: false }));
    }
  };

  /* store order actions (unchanged) */
  const updateStoreOrderStatus = async (orderId, newStatus) => {
    setStoreUpdating(prev => ({ ...prev, [orderId]: true }));
    try {
      const res = await fetch(`${API_URL}/api/store/orders/${orderId}/status?status=${newStatus}`, { method: "PUT" });
      if (res.ok) {
        toast.success(t("Store order updated", "Orden de tienda actualizada"));
        await loadStoreOrders();
      } else {
        const e = await res.json();
        toast.error(formatApiError(e.detail, t("Error updating store order", "Error actualizando orden")));
      }
    } catch {
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
        const e = await res.json();
        toast.error(formatApiError(e.detail, t("Refund failed", "Falló el reembolso")));
      }
    } catch {
      toast.error(t("Connection error", "Error de conexión"));
    } finally {
      setStoreUpdating(prev => ({ ...prev, [orderId]: false }));
    }
  };

  /* printing */
  const handlePrintTicket = async (order) => {
    if (!order) return;
    const id = order.id || order.order_id;
    if (!id) {
      toast.error(t("Invalid order", "Orden inválida"));
      return;
    }
    try {
      const res = await axios.get(`${API_URL}/api/orders/${id}/qr.svg`, { responseType: "blob" });
      const url = window.URL.createObjectURL(res.data);
      const pw = window.open("");
      if (!pw) {
        toast.error(t("Allow pop-ups to print", "Permite ventanas emergentes para imprimir"));
        return;
      }
      pw.document.write(`<html><body style="margin:0;display:flex;align-items:center;justify-content:center;"><img src="${url}" style="max-width:100%;" onload="window.print();window.onafterprint=function(){window.close();};" /></body></html>`);
      pw.document.close();
    } catch {
      toast.error(t("Could not generate ticket", "No se pudo generar el ticket"));
    }
  };

  const handlePrintStoreOrder = (order) => {
    if (!order) return;
    const pw = window.open("");
    if (!pw) {
      toast.error(t("Allow pop-ups to print", "Permite ventanas emergentes para imprimir"));
      return;
    }
    const rows = (order.items || [])
      .map(i => `a href="#" role="button" class="prose-sm prose-slate max-w-none"> <div> <p> <span>Item</span> <span>Quantity</span> <span>Price</span> </p> <div> <span>${safeString(i.name || i.product_name || "Item")}</span> <span>${safeString(i.quantity)}</span> <span>$${(Number(i.price) || 0).toFixed(2)}</span> </div> </div> `)
      .join("");
    pw.document.write(`
      <html><body style="font-family:Arial,sans-serif;padding:24px;">
        <h2>Store Order ${safeString(order.order_number)}</h2>
        <p>${safeString(order.customer_name)} ${safeString(order.customer_email)}</p>
        <table style="width:100%;border-collapse:collapse;margin-top:16px;">
          <thead> <tr> <th align="left">Item</th> <th align="left">Qty</th> <th align="left">Price</th> </tr> </thead>
          <tbody>${rows}</tbody>
        </table>
        <p style="margin-top:16px;">Subtotal: $${(Number(order.subtotal) || 0).toFixed(2)}</p>
        <p>Shipping: $${(Number(order.shipping_fee) || 0).toFixed(2)}</p>
        <p><strong>Total: $${(Number(order.total) || 0).toFixed(2)}</strong></p>
        <script>window.print();window.onafterprint=function(){window.close();};<\/script>
      </body></html>
    `);
    pw.document.close();
  };

  /* AI */
  const handleAiRequest = async () => {
    if (!aiPrompt.trim()) return;
    setAiLoading(true);
    try {
      const res = await axios.post(`${API_URL}/api/ai/operations`, { message: aiPrompt, execute: true });
      setAiReply(res.data?.reply || "");
      setAiResults(res.data?.results || []);
      (res.data?.results || []).forEach(r => {
        if (r.type === "print_ticket") handlePrintTicket({ id: r.order_id, order_id: r.order_id });
      });
    } catch {
      toast.error(t("Could not execute AI task", "No se pudo ejecutar la tarea IA"));
    } finally {
      setAiLoading(false);
    }
  };

  /* store POS helpers */
  const pollStoreCheckoutStatus = useCallback(async (sessionId, attempt = 0) => {
    try {
      const res = await fetch(`${API_URL}/api/store/checkout/status/${sessionId}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      const ps = (data?.payment_status || "").toLowerCase();
      const cs = (data?.status || "").toLowerCase();
      if (ps === "paid") {
        toast.success(t("Store payment confirmed", "Pago de tienda confirmado"));
        await loadStoreOrders();
        return;
      }
      if (cs === "expired") {
        toast.error(t("Store payment expired", "Pago de tienda expirado"));
        await loadStoreOrders();
        return;
      }
      if (attempt >= 8) {
        toast.info(t("Store payment pending", "Pago de tienda pendiente"));
        await loadStoreOrders();
        return;
      }
      setTimeout(() => pollStoreCheckoutStatus(sessionId, attempt + 1), 2000);
    } catch {
      if (attempt >= 8) {
        toast.error(t("Unable to verify payment", "No se pudo verificar pago"));
        await loadStoreOrders();
        return;
      }
      setTimeout(() => pollStoreCheckoutStatus(sessionId, attempt + 1), 2000);
    }
  }, [loadStoreOrders, t]);

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("store_session_id");
    if (!id) return;
    pollStoreCheckoutStatus(id);
    window.history.replaceState({}, "", window.location.pathname);
  }, [pollStoreCheckoutStatus]);

  const openStorePos = async () => {
    setStorePosOpen(true);
    setStoreCartLoading(true);
    try {
      const [cartRes, productsRes] = await Promise.all([
        fetch(`${API_URL}/api/store/cart`, { method: "POST" }),
        fetch(`${API_URL}/api/store/products`)
      ]);
      if (cartRes.ok) {
        const d = await cartRes.json();
        if (!d || !Array.isArray(d.items)) throw new Error();
        setStoreCart(d);
      }
      if (productsRes.ok) setStoreProducts(await productsRes.json() || []);
    } catch {
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
      name: "", email: "", phone: "", address: "", apt: "",
      instructions: "", notes: "", preferred_contact: "sms",
      payment_method: "card", fulfillment_type: "pickup"
    });
    setStoreShippingQuote({ distance_km: null, fee: 0, zone_name: null });
  };

  const getCartItemQuantity = (pid) => storeCart?.items?.find(e => e.product_id === pid)?.quantity || 0;

  const updateStoreCartItem = async (product, quantity) => {
    if (!storeCart) return;
    const ep = `${API_URL}/api/store/cart/${storeCart.id}/items/${product.id}`;
    try {
      let res;
      if (quantity <= 0) {
        res = await fetch(ep, { method: "DELETE" });
      } else if (getCartItemQuantity(product.id) === 0) {
        res = await fetch(`${API_URL}/api/store/cart/${storeCart.id}/items`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ product_id: product.id, quantity })
        });
      } else {
        res = await fetch(`${ep}?quantity=${quantity}`, { method: "PUT" });
      }
      if (res.ok) {
        const d = await res.json();
        if (!d || !Array.isArray(d.items)) throw new Error();
        setStoreCart(d);
      } else {
        const e = await res.json();
        toast.error(formatApiError(e.detail, t("Unable to update cart", "No se pudo actualizar el carrito")));
      }
    } catch {
      toast.error(t("Connection error", "Error de conexión"));
    }
  };

  const handleStoreCheckout = async () => {
    if (!storeCart?.items?.length) {
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
    if (storeCheckoutForm.fulfillment_type === "delivery" && storeShippingError) {
      toast.error(storeShippingError);
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
        body: JSON.stringify(storeCheckoutForm.payment_method === "card" ? payload : { ...payload, payment_method: storeCheckoutForm.payment_method })
      });
      if (res.ok) {
        const d = await res.json();
        if (storeCheckoutForm.payment_method === "card") window.location.href = d.checkout_url;
        else {
          toast.success(t("Store order confirmed", "Orden confirmada"));
          resetStorePos();
          await loadStoreOrders();
        }
      } else {
        const e = await res.json();
        toast.error(formatApiError(e.detail, t("Payment failed", "Pago fallido")));
      }
    } catch {
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
          const d = await res.json();
          window.location.href = d.checkout_url;
          return;
        }
        const e = await res.json();
        toast.error(formatApiError(e.detail, t("Stripe checkout failed", "Falló Stripe")));
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
          const e = await res.json();
          toast.error(formatApiError(e.detail, t("Payment failed", "Pago fallido")));
        }
      }
    } catch {
      toast.error(t("Connection error", "Error de conexión"));
    } finally {
      setStoreProcessingPayment(false);
    }
  };

  useEffect(() => {
    if (!storePosOpen) return;
    if (storeCheckoutForm.fulfillment_type !== "delivery") {
      setStoreShippingQuote({ distance_km: null, fee: 0, zone_name: null });
      setStoreShippingError("");
      return;
    }
    if (!storeCheckoutForm.address || storeCheckoutForm.address.trim().length < 10) {
      setStoreShippingQuote({ distance_km: null, fee: 0, zone_name: null });
      setStoreShippingError("");
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
          const d = await res.json();
          setStoreShippingQuote(d);
          setStoreShippingError("");
        } else {
          const e = await res.json();
          setStoreShippingQuote({ distance_km: null, fee: 0, zone_name: null });
          setStoreShippingError(formatApiError(e.detail, t("Unable to calculate shipping", "No se pudo calcular envío")));
        }
      } catch {
        setStoreShippingQuote({ distance_km: null, fee: 0, zone_name: null });
        setStoreShippingError(t("Unable to calculate shipping", "No se pudo calcular envío"));
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [storeCheckoutForm.address, storeCheckoutForm.fulfillment_type, storePosOpen]);

  /* derived data */
  const rtLabel = realtimeStatus === "connected"
    ? t("Realtime: connected", "Tiempo real: conectado")
    : realtimeStatus === "disabled"
      ? t("Realtime: not configured", "Tiempo real: sin configurar")
      : t("Realtime: disconnected", "Tiempo real: desconectado");
  const rtClass = realtimeStatus === "connected"
    ? "bg-emerald-100 text-emerald-700"
    : realtimeStatus === "disabled"
      ? "bg-slate-100 text-slate-500"
      : "bg-orange-100 text-orange-700";

  // Aplicar filtro a las órdenes
  const filteredPickupOrders = filterOrders(dedupeOrders(dashboard?.todays_pickups || []).filter(
    (order) => !order.service_type || order.service_type === "pickup_delivery"
  ));
  const filteredPickupDeliveries = filterOrders(dedupeOrders(dashboard?.ready_for_delivery || []).filter(
    (order) => !order.service_type || order.service_type === "pickup_delivery"
  ));
  const filteredWashFoldDropoffs = filterOrders(dedupeOrders(dashboard?.wash_fold_dropoffs || []));
  const filteredWashFoldReady = filterOrders(dedupeOrders(dashboard?.wash_fold_ready || []));

  const filteredPickupPaymentQueue = filterOrders(dedupeOrders([...filteredPickupOrders, ...filteredPickupDeliveries]).filter(
    (order) => (order.payment_status || "pending") !== "paid"
  ));
  const filteredWashFoldPaymentQueue = filterOrders(dedupeOrders([...filteredWashFoldDropoffs, ...filteredWashFoldReady]).filter(
    (order) => (order.payment_status || "pending") !== "paid"
  ));

  const pickupOrdersCount = dedupeOrders(dashboard?.todays_pickups || []).filter(
    (order) => !order.service_type || order.service_type === "pickup_delivery"
  ).length;
  const ordersInProcessingCount = dashboard?.stats?.orders_in_processing || 0;
  const deliveriesCount = dedupeOrders(dashboard?.ready_for_delivery || []).filter(
    (order) => !order.service_type || order.service_type === "pickup_delivery"
  ).length;
  const urgentCount = dashboard?.stats?.urgent_tickets || 0;

  const storeCartSubtotal = storeCart?.total || 0;
  const storeShippingFee = storeCheckoutForm.fulfillment_type === "delivery" ? (storeShippingQuote.fee || 0) : 0;
  const storeOrderTotal = storeCartSubtotal + storeShippingFee;
  const filteredStoreProducts = storeProducts.filter(p => p.name?.toLowerCase().includes(storeSearch.toLowerCase()));
  const unpaidStoreOrders = storeOrders.filter(o => {
    const s = (o.payment_status || "pending").toLowerCase();
    return s !== "paid" && s !== "refunded";
  });

  if (loading) {
    return <div className="flex items-center justify-center min-h-[400px]"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-600" /></div>;
  }

  return (
    <div className="space-y-4 sm:space-y-6 px-2 sm:px-0">

      {/* Header con buscador */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Zap className="h-6 w-6 sm:h-7 sm:w-7 text-sky-600 shrink-0" />
            {t("Operator Dashboard", "Panel del Operador")}
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {t("Update order status — the system does the rest", "Actualiza el estado — el sistema hace el resto")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Buscador */}
          <div className="relative">
            <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              type="text"
              placeholder={t("Search by order #, customer or CP", "Buscar por orden, cliente o CP")}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8 text-sm w-64"
              data-testid="order-search-input"
            />
          </div>
          <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${rtClass}`} data-testid="operator-realtime-status">{rtLabel}</span>
          <span className="text-xs text-slate-400 hidden sm:inline">{t("Updated:", "Actualizado:")} {lastRefresh.toLocaleTimeString()}</span>
          <Button onClick={() => setAutoRefresh(a => !a)} variant="outline" size="sm" data-testid="toggle-auto-refresh">
            {autoRefresh ? t("Pause", "Pausar") : t("Resume", "Reanudar")}
          </Button>
          <Button onClick={loadDashboard} variant="outline" size="sm" data-testid="refresh-dashboard">
            <RefreshCw className="h-4 w-4 sm:mr-1.5" /><span className="hidden sm:inline">{t("Refresh", "Actualizar")}</span>
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard icon={<Truck className="h-5 w-5 text-sky-600" />} bg="bg-sky-100" count={pickupOrdersCount} label={t("Pickups Today", "Pickups Hoy")} testId="pickups" />
        <StatCard icon={<Package className="h-5 w-5 text-amber-600" />} bg="bg-amber-100" count={ordersInProcessingCount} label={t("In Process", "En Proceso")} testId="processing" />
        <StatCard icon={<CheckCircle className="h-5 w-5 text-green-600" />} bg="bg-green-100" count={deliveriesCount} label={t("Deliveries Ongoing", "Entregas en curso")} testId="deliveries" />
        <StatCard icon={<AlertTriangle className="h-5 w-5 text-red-600" />} bg="bg-red-100" count={urgentCount} label={t("Urgent Tickets", "Tickets Urgentes")} testId="urgent" highlight={urgentCount > 0} />
      </div>

      {/* AI Assistant */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-4 sm:px-6 py-3.5 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
          <Bot className="h-4 w-4 text-sky-600 shrink-0" />
          <h2 className="font-semibold text-slate-900 text-sm">{t("AI Operations Assistant", "Asistente Operativo IA")}</h2>
        </div>
        <div className="p-4 sm:p-5 grid gap-4 lg:grid-cols-[2fr_1fr]">
          <div>
            <Textarea value={aiPrompt} onChange={e => setAiPrompt(e.target.value)} rows={3} placeholder={t("Example: Mark order VFL-… as paid in cash $50 and generate ticket", "Ej: Marca la orden VFL-… como pagada en efectivo $50 y genera ticket")} className="text-sm resize-none" data-testid="operator-ai-input" />
            <div className="flex gap-2 mt-2.5">
              <Button onClick={handleAiRequest} disabled={aiLoading} size="sm" data-testid="operator-ai-submit">{aiLoading ? t("Processing…", "Procesando…") : t("Send to AI", "Enviar a IA")}</Button>
              <Button variant="outline" size="sm" onClick={() => { setAiPrompt(""); setAiReply(""); setAiResults([]); }} data-testid="operator-ai-clear">{t("Clear", "Limpiar")}</Button>
            </div>
          </div>
          <div className="bg-slate-50 rounded-xl p-3.5">
            <p className="text-xs text-slate-400 mb-1">{t("Response", "Respuesta")}</p>
            <p className="font-medium text-slate-800 text-sm leading-relaxed" data-testid="operator-ai-reply">{aiReply || <span className="text-slate-400 font-normal">{t("No reply yet", "Aún no hay respuesta")}</span>}</p>
            {aiResults.length > 0 && <ul className="mt-2.5 space-y-1 border-t border-slate-200 pt-2.5">{aiResults.map((r, i) => <li key={i} className={`text-xs font-medium ${r.ok ? "text-emerald-600" : "text-red-500"}`} data-testid={`operator-ai-result-${i}`}>{r.ok ? "✓" : "✗"} {r.type}</li>)}</ul>}
          </div>
        </div>
      </div>

      {/* POS Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 sm:gap-6" data-testid="operator-pos-grid">

        {/* LEFT – Pickup & Delivery */}
        <div className="space-y-4">

          {/* Created/Confirmed */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm" data-testid="pos-pickup-today-card">
            <CardHeader icon={<Truck className="h-4 w-4 text-sky-500" />} title={t("Pickup & Delivery — Created / Confirmed", "Pickup & Delivery — Creadas / Confirmadas")} count={filteredPickupOrders.length} testId="pos-pickup-today-count" />
            <div className="divide-y divide-slate-100">
              {filteredPickupOrders.length === 0
                ? <EmptyState icon={<Truck className="h-8 w-8" />} text={t("No created or confirmed orders", "No hay órdenes creadas o confirmadas")} testId="pos-pickup-today-empty" />
                : filteredPickupOrders.map(order => {
                    const ns = getNextStatus(order.status, order.service_type);
                    return <OrderRow key={order.order_id || Math.random()} order={order} statusInfo={getStatusInfo(order.status, order.service_type)} nextStatus={ns} nextStatusInfo={ns ? getStatusInfo(ns, order.service_type) : null} updating={updating} onRowClick={setSelectedOrder} onAdvance={updateOrderStatus} onPrint={handlePrintTicket} showPrint advanceBtnClass="bg-sky-600 hover:bg-sky-700" t={t} />;
                  })}
            </div>
          </div>

          {/* Payment Queue */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm" data-testid="pos-pickup-payment-card">
            <CardHeader icon={<DollarSign className="h-4 w-4 text-emerald-500" />} title={t("Pickup & Delivery — Request Payment", "Pickup & Delivery — Solicitar pago")} count={filteredPickupPaymentQueue.length} testId="pos-pickup-payment-count" />
            <div className="divide-y divide-slate-100">
              {filteredPickupPaymentQueue.length === 0
                ? <EmptyState icon={<DollarSign className="h-8 w-8" />} text={t("No pickup payments pending", "Sin pagos pendientes")} testId="pos-pickup-payment-empty" />
                : filteredPickupPaymentQueue.map(order => {
                    const amount = calculateServiceCharge(order);
                    return (
                      <div key={order.order_id || Math.random()} className="p-3 sm:p-4 hover:bg-slate-50/70 cursor-pointer transition-colors" role="button" onClick={() => setSelectedOrder(order)} data-testid={`pos-pickup-payment-${order.order_id || "unknown"}`}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5 mb-1"><span className="font-mono font-semibold text-xs sm:text-sm text-slate-900">{formatOrderNumber(order)}</span><span className={`px-1.5 py-0.5 text-xs font-medium rounded-full ${getStatusInfo(order.status, order.service_type).color}`}>{getStatusInfo(order.status, order.service_type).label}</span></div>
                            <p className="text-sm text-slate-700 font-medium truncate">{safeString(order.customer_name, t("Customer", "Cliente"))}</p>
                            <p className="text-xs text-slate-400 mt-0.5">{t("Charge", "Cobro")}: <span className="font-semibold text-slate-600">{amount ? formatCurrency(amount) : t("Set actual lbs", "Ingresa lbs reales")}</span></p>
                          </div>
                          <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-xs h-7 shrink-0" onClick={e => { e.stopPropagation(); setSelectedOrder(order); }} data-testid={`pos-pickup-collect-${order.order_id}`}>{t("Collect", "Cobrar")}</Button>
                        </div>
                      </div>
                    );
                  })}
            </div>
          </div>

          {/* In Process / Ready / Out for Delivery */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm" data-testid="pos-pickup-delivery-card">
            <CardHeader icon={<CheckCircle className="h-4 w-4 text-emerald-500" />} title={t("Pickup & Delivery — In Process / Ready / Out for Delivery", "Pickup & Delivery — En proceso / Lista / En camino")} count={filteredPickupDeliveries.length} bgClass="bg-emerald-50" testId="pos-pickup-delivery-count" />
            <div className="divide-y divide-slate-100">
              {filteredPickupDeliveries.length === 0
                ? <EmptyState icon={<Package className="h-8 w-8" />} text={t("No active process or delivery orders", "No hay órdenes activas en proceso o entrega")} testId="operator-delivery-empty" />
                : filteredPickupDeliveries.map(order => {
                    const ns = getNextStatus(order.status, order.service_type);
                    return <OrderRow key={order.order_id || Math.random()} order={order} statusInfo={getStatusInfo(order.status, order.service_type)} nextStatus={ns} nextStatusInfo={ns ? getStatusInfo(ns, order.service_type) : null} updating={updating} onRowClick={setSelectedOrder} onAdvance={updateOrderStatus} onPrint={handlePrintTicket} showPrint advanceBtnClass="bg-emerald-600 hover:bg-emerald-700" t={t} />;
                  })}
            </div>
          </div>
        </div>

        {/* RIGHT – Wash & Fold */}
        <div className="space-y-4">

          {/* Order Received / Processing */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm" data-testid="pos-washfold-dropoff-card">
            <CardHeader icon={<Package className="h-4 w-4 text-purple-500" />} title={t("Wash & Fold — Order Received / Processing", "Wash & Fold — Orden recibida / Procesando")} count={filteredWashFoldDropoffs.length} testId="pos-washfold-dropoff-count" />
            <div className="divide-y divide-slate-100">
              {filteredWashFoldDropoffs.length === 0
                ? <EmptyState icon={<Package className="h-8 w-8" />} text={t("No drop-offs waiting", "Sin entregas pendientes")} testId="pos-washfold-dropoff-empty" />
                : filteredWashFoldDropoffs.map(order => {
                    const statusInfo = getStatusInfo(order.status, order.service_type);
                    const nextStatus = getNextStatus(order.status, order.service_type);
                    const nextStatusInfo = nextStatus ? getStatusInfo(nextStatus, order.service_type) : null;

                    return (
                      <div key={order.order_id || Math.random()} className="p-3 sm:p-4 hover:bg-slate-50/70 cursor-pointer transition-colors" role="button" onClick={() => setSelectedOrder(order)} data-testid={`pos-washfold-dropoff-${order.order_id || "unknown"}`}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5 mb-1">
                              <span className="font-mono font-semibold text-slate-900 text-xs sm:text-sm truncate">{formatOrderNumber(order)}</span>
                              <span className={`px-1.5 py-0.5 text-xs font-medium rounded-full shrink-0 ${statusInfo.color}`}>{statusInfo.label}</span>
                            </div>
                            <p className="text-sm text-slate-700 font-medium truncate">{safeString(order.customer_name, t("Customer", "Cliente"))}</p>
                            <p className="text-xs text-slate-400 mt-0.5 truncate">{safeString(order.pickup_date, t("Drop-off today", "Entrega hoy"))}</p>
                          </div>
                          <div className="flex flex-col gap-1.5 shrink-0" onClick={e => e.stopPropagation()}>
                            {nextStatus && (
                              <Button size="sm" className="bg-purple-600 hover:bg-purple-700 text-xs h-7" onClick={() => updateOrderStatus(order.order_id, nextStatus)} disabled={updating[order.order_id]} data-testid={`pos-washfold-update-${order.order_id}`}>
                                {updating[order.order_id] ? <RefreshCw className="h-3 w-3 animate-spin" /> : <><span className="hidden sm:inline">{nextStatusInfo?.label}</span><ChevronRight className="h-3 w-3 ml-0.5" /></>}
                              </Button>
                            )}
                            <Button variant="outline" size="sm" className="text-xs h-7 px-2 gap-1 hover:border-sky-300 hover:text-sky-600" onClick={() => handlePrintTicket(order)} data-testid={`pos-washfold-print-${order.order_id}`}>
                              <Printer className="h-3 w-3" /><span className="hidden sm:inline">{t("Ticket", "Ticket")}</span>
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
            </div>
          </div>

          {/* W&F Payment Queue */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm" data-testid="pos-washfold-payment-card">
            <CardHeader icon={<DollarSign className="h-4 w-4 text-emerald-500" />} title={t("Wash & Fold — Request Payment", "Wash & Fold — Solicitar pago")} count={filteredWashFoldPaymentQueue.length} testId="pos-washfold-payment-count" />
            <div className="divide-y divide-slate-100">
              {filteredWashFoldPaymentQueue.length === 0
                ? <EmptyState icon={<DollarSign className="h-8 w-8" />} text={t("No wash & fold payments pending", "Sin pagos pendientes")} testId="pos-washfold-payment-empty" />
                : filteredWashFoldPaymentQueue.map(order => {
                    const amount = calculateServiceCharge(order);
                    return (
                      <div key={order.order_id || Math.random()} className="p-3 sm:p-4 hover:bg-slate-50/70 cursor-pointer transition-colors" role="button" onClick={() => setSelectedOrder(order)} data-testid={`pos-washfold-payment-${order.order_id || "unknown"}`}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5 mb-1"><span className="font-mono font-semibold text-xs sm:text-sm text-slate-900">{formatOrderNumber(order)}</span><span className={`px-1.5 py-0.5 text-xs font-medium rounded-full ${getStatusInfo(order.status, order.service_type).color}`}>{getStatusInfo(order.status, order.service_type).label}</span></div>
                            <p className="text-sm text-slate-700 font-medium truncate">{safeString(order.customer_name, t("Customer", "Cliente"))}</p>
                            <p className="text-xs text-slate-400 mt-0.5">{t("Charge", "Cobro")}: <span className="font-semibold text-slate-600">{amount ? formatCurrency(amount) : t("Set actual lbs", "Ingresa lbs reales")}</span></p>
                          </div>
                          <div className="flex flex-col gap-1.5 shrink-0" onClick={e => e.stopPropagation()}>
                            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-xs h-7" onClick={() => setSelectedOrder(order)} data-testid={`pos-washfold-collect-${order.order_id}`}>{t("Collect", "Cobrar")}</Button>
                            <Button variant="outline" size="sm" className="text-xs h-7 px-2 gap-1 hover:border-sky-300 hover:text-sky-600" onClick={() => handlePrintTicket(order)} data-testid={`pos-washfold-print-payment-${order.order_id}`}><Printer className="h-3 w-3" /><span className="hidden sm:inline">{t("Ticket", "Ticket")}</span></Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
            </div>
          </div>

          {/* W&F Ready for pickup */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm" data-testid="pos-washfold-ready-card">
            <CardHeader icon={<CheckCircle className="h-4 w-4 text-emerald-500" />} title={t("Wash & Fold — Ready for customer pickup", "Wash & Fold — Lista para recoger en tienda")} count={filteredWashFoldReady.length} bgClass="bg-emerald-50" testId="pos-washfold-ready-count" />
            <div className="divide-y divide-slate-100">
              {filteredWashFoldReady.length === 0
                ? <EmptyState icon={<CheckCircle className="h-8 w-8" />} text={t("No wash & fold orders ready", "No hay órdenes listas")} testId="pos-washfold-ready-empty" />
                : filteredWashFoldReady.map(order => {
                    const ns = getNextStatus(order.status, order.service_type);
                    return (
                      <div key={order.order_id || Math.random()} className="p-3 sm:p-4 hover:bg-slate-50/70 cursor-pointer transition-colors" role="button" onClick={() => setSelectedOrder(order)} data-testid={`pos-washfold-ready-${order.order_id || "unknown"}`}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5 mb-1"><span className="font-mono font-semibold text-xs sm:text-sm text-slate-900">{formatOrderNumber(order)}</span><span className={`px-1.5 py-0.5 text-xs font-medium rounded-full ${getStatusInfo(order.status, order.service_type).color}`}>{getStatusInfo(order.status, order.service_type).label}</span></div>
                            <p className="text-sm text-slate-700 font-medium truncate">{safeString(order.customer_name, t("Customer", "Cliente"))}</p>
                            <p className="text-xs text-slate-400 mt-0.5">{t("Payment", "Pago")}: <span className={`font-semibold ${order.payment_status === "paid" ? "text-emerald-600" : "text-amber-600"}`}>{getPaymentStatusLabel(order.payment_status)}</span></p>
                          </div>
                          <div className="flex flex-col gap-1.5 shrink-0" onClick={e => e.stopPropagation()}>
                            {ns && <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-xs h-7" onClick={() => updateOrderStatus(order.order_id, ns)} disabled={updating[order.order_id]} data-testid={`pos-washfold-ready-update-${order.order_id}`}>{updating[order.order_id] ? <RefreshCw className="h-3 w-3 animate-spin" /> : <><span className="hidden sm:inline">{getStatusInfo(ns, order.service_type).label}</span><ChevronRight className="h-3 w-3 ml-0.5" /></>}</Button>}
                            <Button variant="outline" size="sm" className="text-xs h-7 px-2 gap-1 hover:border-sky-300 hover:text-sky-600" onClick={() => handlePrintTicket(order)} data-testid={`pos-washfold-ready-print-${order.order_id}`}><Printer className="h-3 w-3" /><span className="hidden sm:inline">{t("Ticket", "Ticket")}</span></Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
            </div>
          </div>
        </div>
      </div>

      {/* Mapa interactivo */}
      <div className="mt-6 sm:mt-10 bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-4 sm:px-6 py-4 border-b border-slate-100 bg-slate-50">
          <h3 className="font-semibold text-slate-900 text-sm sm:text-base flex items-center gap-2">
            <MapPin className="h-4 w-4 text-sky-600" />
            {t("Order Locations", "Ubicaciones de órdenes")}
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            {t("Click on a marker to view order details", "Haz clic en un marcador para ver los detalles de la orden")}
          </p>
        </div>
        <div className="h-[450px] w-full">
          <MapContainer center={[STORE_COORDINATES.lat, STORE_COORDINATES.lng]} zoom={12} style={{ height: "100%", width: "100%" }}>
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            />
            {ordersWithCoordinates.map((order) => {
              const isDelivery = !order.service_type || order.service_type === "pickup_delivery";
              const distance = getDistanceInMiles(
                STORE_COORDINATES.lat,
                STORE_COORDINATES.lng,
                order.coords.lat,
                order.coords.lng
              );
              const deliveryFee = calculateDeliveryFee(distance);
              const exceedsLimit = distance > 9;

              const statusInfo = getStatusInfo(order.status, order.service_type);
              const markerColor = getMarkerColor(order.status);

              const icon = L.divIcon({
                html: `<div style="background-color: ${markerColor}; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 12px; box-shadow: 0 2px 4px rgba(0,0,0,0.3);">📍</div>`,
                className: "custom-marker",
                iconSize: [24, 24],
                popupAnchor: [0, -12]
              });

              return (
                <Marker
                  key={order.id || order.order_id}
                  position={[order.coords.lat, order.coords.lng]}
                  icon={icon}
                >
                  <Popup minWidth={280} maxWidth={320}>
                    <div className="space-y-2 text-sm">
                      <div className="font-bold text-base">{formatOrderNumber(order)}</div>
                      <div className="text-slate-700">{order.customer_name}</div>
                      <div className="text-xs text-slate-500 break-words">
                        {order.pickup_address || order.delivery_address}
                      </div>
                      {isDelivery && (
                        <div className="text-xs">
                          📍 Distancia: <strong>{distance.toFixed(1)} mi</strong><br />
                          🚚 Envío: {deliveryFee > 0 ? formatCurrency(deliveryFee) : "Gratis"}
                          {exceedsLimit && (
                            <span className="ml-2 text-red-500 font-semibold">(⚠️ Excede 9 millas)</span>
                          )}
                        </div>
                      )}
                      <div className="flex items-center gap-1 flex-wrap">
                        <span className={`px-1.5 py-0.5 rounded-full text-xs ${statusInfo.color}`}>
                          {statusInfo.label}
                        </span>
                        {order.payment_status !== "paid" && (
                          <span className="text-xs text-amber-600">💰 Pendiente</span>
                        )}
                      </div>
                      <div className="pt-2">
                        <Button
                          size="sm"
                          variant="default"
                          className="w-full"
                          onClick={() => setSelectedOrder(order)}
                        >
                          {t("View details", "Ver detalles")}
                        </Button>
                      </div>
                    </div>
                  </Popup>
                </Marker>
              );
            })}
          </MapContainer>
        </div>
      </div>

      {/* Store Orders y DeliveryZonesManager */}
      <div className="mt-6 sm:mt-10 space-y-4">
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm" data-testid="store-orders-panel">
          <div className="px-4 sm:px-6 py-4 border-b border-slate-100 bg-slate-50">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h3 className="font-semibold text-slate-900 text-sm sm:text-base">{t("Store Orders", "Órdenes tienda")}</h3>
                <p className="text-xs text-slate-400 mt-0.5">{t("Process product purchases", "Procesa compras de productos")}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" className="bg-sky-600 hover:bg-sky-700 text-xs sm:text-sm" onClick={openStorePos} data-testid="store-pos-open">{t("New Store Sale", "Nueva venta")}</Button>
                {unpaidStoreOrders.length > 0 && <Button size="sm" variant="outline" className="text-xs sm:text-sm" onClick={() => { setStorePaymentOrder(unpaidStoreOrders[0]); setStorePaymentForm({ method: "card" }); }} data-testid="store-pos-request-payment">{t("Request payment", "Solicitar pago")} <span className="ml-1 bg-amber-100 text-amber-700 text-xs font-bold px-1.5 py-0.5 rounded-full">{unpaidStoreOrders.length}</span></Button>}
                <span className="text-xs font-semibold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full" data-testid="store-orders-count">{storeOrders.length}</span>
              </div>
            </div>
          </div>
          <div className="px-4 sm:px-6 py-2.5 bg-white border-b border-slate-100 flex flex-wrap items-center gap-1.5 text-xs text-slate-500" data-testid="store-orders-steps">
            {[t("Open POS", "Abre POS"), t("Add products", "Agrega productos"), t("Collect payment", "Cobrar")].map((s, i) => <span key={i} className="flex items-center gap-1"><span className="w-4 h-4 rounded-full bg-sky-100 text-sky-600 font-bold flex items-center justify-center text-[10px]">{i + 1}</span>{s}{i < 2 && <span className="text-slate-300">›</span>}</span>)}
            {unpaidStoreOrders.length > 0 && <span className="ml-2 text-amber-600 font-medium">{t("· Pending payments below", "· Pagos pendientes abajo")}</span>}
          </div>
          {storeOrdersLoading ? <div className="p-8 text-center text-slate-400 text-sm">{t("Loading store orders…", "Cargando órdenes…")}</div> : storeOrders.length === 0 ? <div className="p-8 text-center text-slate-400 text-sm">{t("No store orders yet", "Sin órdenes de tienda")}</div> : (
            <>
              {/* Desktop table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-slate-400 text-xs uppercase tracking-wide">
                    <tr>{[t("Order", "Orden"), t("Customer", "Cliente"), t("Status", "Estado"), t("Payment", "Pago"), t("Total", "Total"), t("Actions", "Acciones")].map((h, i) => <th key={i} className={`px-4 py-3 font-semibold ${i === 5 ? "text-right" : "text-left"}`}>{h}</th>)}</tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {storeOrders.map(order => {
                      const ns = getNextStoreStatus(order.status);
                      return (
                        <tr key={order.id || Math.random()} className="hover:bg-slate-50/50 transition-colors" data-testid={`store-order-row-${order.id || "unknown"}`}>
                          <td className="px-4 py-3 font-mono text-slate-800 text-xs">{safeString(order.order_number)}</td>
                          <td className="px-4 py-3"><p className="text-slate-800 text-sm font-medium">{safeString(order.customer_name, t("Customer", "Cliente"))}</p><p className="text-xs text-slate-400">{safeString(order.customer_email)}</p></td>
                          <td className="px-4 py-3"><span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-xs font-medium" data-testid={`store-order-status-${order.id}`}>{getStoreStatusDisplay(order.status)}</span></td>
                          <td className="px-4 py-3"><p className={`text-sm font-semibold ${order.payment_status === "paid" ? "text-emerald-600" : "text-amber-600"}`} data-testid={`store-order-payment-${order.id}`}>{getPaymentStatusLabel(order.payment_status)}</p><p className="text-xs text-slate-400">{safeString(order.payment_method, "-")}</p></td>
                          <td className="px-4 py-3 font-bold text-slate-800" data-testid={`store-order-total-${order.id}`}>{formatCurrency(order.total)}</td>
                          <td className="px-4 py-3 text-right"><div className="flex flex-wrap justify-end gap-1.5">
                            {(order.payment_status || "pending") !== "paid" && (order.payment_status || "").toLowerCase() !== "refunded" && <Button variant="outline" size="sm" className="text-xs" onClick={() => { setStorePaymentOrder(order); setStorePaymentForm({ method: "card" }); }} data-testid={`store-order-request-payment-${order.id}`}>{t("Request payment", "Solicitar pago")}</Button>}
                            {ns && <Button size="sm" className="text-xs" onClick={() => updateStoreOrderStatus(order.id, ns)} disabled={storeUpdating[order.id]} data-testid={`store-order-next-${order.id}`}>{storeUpdating[order.id] ? "…" : `→ ${getStoreStatusDisplay(ns)}`}</Button>}
                            <Button variant="outline" size="sm" className="text-xs" onClick={() => handlePrintStoreOrder(order)} data-testid={`store-order-print-${order.id}`}>{t("Print", "Imprimir")}</Button>
                            {order.payment_status === "paid" && <Button variant="destructive" size="sm" className="text-xs" onClick={() => refundStoreOrder(order.id)} disabled={storeUpdating[order.id]} data-testid={`store-order-refund-${order.id}`}>{storeUpdating[order.id] ? "…" : t("Refund", "Reembolsar")}</Button>}
                          </div></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {/* Mobile cards */}
              <div className="md:hidden divide-y divide-slate-100">
                {storeOrders.map(order => {
                  const ns = getNextStoreStatus(order.status);
                  return (
                    <div key={order.id || Math.random()} className="p-4 space-y-2.5" data-testid={`store-order-row-${order.id || "unknown"}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div><p className="font-mono text-xs font-semibold text-slate-700">{safeString(order.order_number)}</p><p className="text-sm font-medium text-slate-800 mt-0.5">{safeString(order.customer_name, t("Customer", "Cliente"))}</p><p className="text-xs text-slate-400">{safeString(order.customer_email)}</p></div>
                        <div className="text-right shrink-0"><p className="font-bold text-sm text-slate-800">{formatCurrency(order.total)}</p><span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-xs inline-block mt-1">{getStoreStatusDisplay(order.status)}</span></div>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs"><span className={`font-semibold ${order.payment_status === "paid" ? "text-emerald-600" : "text-amber-600"}`}>{getPaymentStatusLabel(order.payment_status)}</span><span className="text-slate-300">·</span><span className="text-slate-400">{safeString(order.payment_method, "-")}</span></div>
                      <div className="flex flex-wrap gap-1.5">
                        {(order.payment_status || "pending") !== "paid" && (order.payment_status || "").toLowerCase() !== "refunded" && <Button variant="outline" size="sm" className="text-xs flex-1" onClick={() => { setStorePaymentOrder(order); setStorePaymentForm({ method: "card" }); }}>{t("Request payment", "Solicitar pago")}</Button>}
                        {ns && <Button size="sm" className="text-xs flex-1" onClick={() => updateStoreOrderStatus(order.id, ns)} disabled={storeUpdating[order.id]}>{storeUpdating[order.id] ? "…" : `→ ${getStoreStatusDisplay(ns)}`}</Button>}
                        <Button variant="outline" size="sm" className="text-xs" onClick={() => handlePrintStoreOrder(order)}>{t("Print", "Imprimir")}</Button>
                        {order.payment_status === "paid" && <Button variant="destructive" size="sm" className="text-xs" onClick={() => refundStoreOrder(order.id)} disabled={storeUpdating[order.id]}>{storeUpdating[order.id] ? "…" : t("Refund", "Reembolsar")}</Button>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
        <DeliveryZonesManager />
      </div>

      {/* Store POS Modal */}
      <Dialog open={storePosOpen} onOpenChange={open => !open ? resetStorePos() : setStorePosOpen(true)}>
        <DialogContent className="w-[95vw] max-w-5xl bg-white max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="text-base sm:text-lg">{t("New Store Sale", "Nueva venta en tienda")}</DialogTitle><DialogDescription className="text-xs sm:text-sm">{t("Select products and collect payment quickly.", "Selecciona productos y cobra rápidamente.")}</DialogDescription></DialogHeader>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6" data-testid="store-pos-modal">
            <div className="space-y-3">
              <Input placeholder={t("Search products", "Buscar productos")} value={storeSearch} onChange={e => setStoreSearch(e.target.value)} className="text-sm" data-testid="store-pos-search" />
              <div className="border border-slate-200 rounded-xl overflow-hidden"><div className="max-h-[300px] sm:max-h-[380px] overflow-y-auto divide-y divide-slate-100" data-testid="store-pos-products">
                {storeCartLoading ? <div className="p-6 text-center text-slate-400 text-sm">{t("Loading products…", "Cargando productos…")}</div> : filteredStoreProducts.length === 0 ? <div className="p-6 text-center text-slate-400 text-sm">{t("No products found", "No hay productos")}</div> : filteredStoreProducts.map(product => {
                  const qty = getCartItemQuantity(product.id);
                  const disabled = product.stock <= 0 || !product.is_active;
                  return (<div key={product.id || Math.random()} className="p-3 sm:p-4 flex items-center justify-between gap-3" data-testid={`store-pos-product-${product.id}`}><div className="min-w-0 flex-1"><p className="font-semibold text-slate-800 text-sm truncate">{safeString(product.name)}</p><p className="text-xs text-slate-400">${Number(product.price).toFixed(2)} · Stock: {product.stock}</p>{disabled && <p className="text-xs text-red-400 font-medium">{t("Unavailable", "No disponible")}</p>}</div><div className="flex items-center gap-1.5 shrink-0"><Button size="sm" variant="outline" className="h-7 w-7 p-0" onClick={() => updateStoreCartItem(product, qty - 1)} disabled={qty === 0} data-testid={`store-pos-minus-${product.id}`}>-</Button><span className="w-5 text-center text-sm font-bold text-slate-700" data-testid={`store-pos-qty-${product.id}`}>{qty}</span><Button size="sm" className="h-7 w-7 p-0" onClick={() => updateStoreCartItem(product, qty + 1)} disabled={disabled} data-testid={`store-pos-plus-${product.id}`}>+</Button></div></div>);
                })}
              </div></div>
            </div>
            <div className="space-y-3">
              <div className="border border-slate-200 rounded-xl p-3 sm:p-4" data-testid="store-pos-cart"><h4 className="font-semibold text-slate-800 mb-2 text-sm">{t("Cart", "Carrito")}</h4>{storeCart?.items?.length ? <div className="space-y-1.5">{storeCart.items.map(item => <div key={item.product_id || Math.random()} className="flex items-center justify-between text-xs sm:text-sm"><span className="truncate mr-2 text-slate-700">{safeString(item.name || item.product_name)}</span><span className="shrink-0 text-slate-500">{item.quantity} × ${Number(item.price || 0).toFixed(2)}</span></div>)}</div> : <p className="text-xs text-slate-400">{t("No items yet", "Sin productos")}</p>}</div>
              <div className="border border-slate-200 rounded-xl p-3 sm:p-4 space-y-2.5" data-testid="store-pos-customer">
                <div className="grid grid-cols-2 gap-2"><div><Label className="text-xs">{t("Name", "Nombre")} *</Label><Input value={storeCheckoutForm.name} onChange={e => setStoreCheckoutForm({ ...storeCheckoutForm, name: e.target.value })} className="mt-1 text-sm h-8" data-testid="store-pos-name" /></div><div><Label className="text-xs">{t("Phone", "Teléfono")} *</Label><Input value={storeCheckoutForm.phone} onChange={e => setStoreCheckoutForm({ ...storeCheckoutForm, phone: e.target.value })} className="mt-1 text-sm h-8" data-testid="store-pos-phone" /></div></div>
                <div><Label className="text-xs">{t("Email", "Email")} *</Label><Input type="email" value={storeCheckoutForm.email} onChange={e => setStoreCheckoutForm({ ...storeCheckoutForm, email: e.target.value })} className="mt-1 text-sm h-8" data-testid="store-pos-email" /></div>
                <div className="grid grid-cols-2 gap-2"><div><Label className="text-xs">{t("Fulfillment", "Entrega")}</Label><select className="w-full mt-1 border border-slate-200 rounded-lg px-2 py-1.5 text-xs sm:text-sm" value={storeCheckoutForm.fulfillment_type} onChange={e => setStoreCheckoutForm({ ...storeCheckoutForm, fulfillment_type: e.target.value })} data-testid="store-pos-fulfillment"><option value="pickup">{t("Pickup", "Recoger en tienda")}</option><option value="delivery">{t("Delivery", "Entrega a domicilio")}</option></select></div><div><Label className="text-xs">{t("Payment method", "Método de pago")}</Label><select className="w-full mt-1 border border-slate-200 rounded-lg px-2 py-1.5 text-xs sm:text-sm" value={storeCheckoutForm.payment_method} onChange={e => setStoreCheckoutForm({ ...storeCheckoutForm, payment_method: e.target.value })} data-testid="store-pos-payment-method"><option value="card">{t("Card (Stripe)", "Tarjeta (Stripe)")}</option><option value="cash">{t("Cash", "Efectivo")}</option><option value="transfer">{t("Transfer", "Transferencia")}</option><option value="other">{t("Other", "Otro")}</option></select></div></div>
                {storeCheckoutForm.fulfillment_type === "delivery" && <div><Label className="text-xs">{t("Delivery address", "Dirección de entrega")} *</Label><Input value={storeCheckoutForm.address} onChange={e => setStoreCheckoutForm({ ...storeCheckoutForm, address: e.target.value })} className="mt-1 text-sm h-8" data-testid="store-pos-address" /><p className="text-xs text-slate-400 mt-1">{t("Format: street + number, city, state, ZIP", "Formato: calle y número, ciudad, estado, ZIP")}</p></div>}
                <div><Label className="text-xs">{t("Notes", "Notas")}</Label><Input value={storeCheckoutForm.notes} onChange={e => setStoreCheckoutForm({ ...storeCheckoutForm, notes: e.target.value })} className="mt-1 text-sm h-8" data-testid="store-pos-notes" /></div>
              </div>
              <div className="border border-slate-200 rounded-xl p-3 sm:p-4 space-y-2" data-testid="store-pos-summary">
                <div className="flex justify-between text-sm"><span className="text-slate-500">{t("Subtotal", "Subtotal")}</span><span className="font-medium">${storeCartSubtotal.toFixed(2)}</span></div>
                <div className="flex justify-between text-sm"><span className="text-slate-500">{t("Shipping", "Envío")}</span><span className="font-medium">{storeCheckoutForm.fulfillment_type === "delivery" ? (storeShippingQuote.distance_km ? `$${storeShippingFee.toFixed(2)} (${storeShippingQuote.distance_km} km)` : t("Enter full address", "Ingresa dirección completa")) : t("Pickup", "Recoger")}</span></div>
                {storeShippingError && storeCheckoutForm.fulfillment_type === "delivery" && <p className="text-xs text-red-500">{storeShippingError}</p>}
                <div className="flex justify-between font-bold text-sm sm:text-base pt-1 border-t border-slate-100"><span>{t("Total", "Total")}</span><span>${storeOrderTotal.toFixed(2)}</span></div>
                <Button className="w-full bg-sky-600 hover:bg-sky-700 text-sm" onClick={handleStoreCheckout} disabled={storeCheckoutLoading} data-testid="store-pos-submit">{storeCheckoutLoading ? t("Processing…", "Procesando…") : storeCheckoutForm.payment_method === "card" ? t("Pay with Stripe", "Pagar con Stripe") : t("Confirm order", "Confirmar orden")}</Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Store Payment Modal */}
      <Dialog open={!!storePaymentOrder} onOpenChange={open => !open && setStorePaymentOrder(null)}>
        <DialogContent className="w-[95vw] max-w-lg bg-white">
          <DialogHeader><DialogTitle className="text-base sm:text-lg">{t("Request payment", "Solicitar pago")}</DialogTitle><DialogDescription className="text-xs sm:text-sm">{safeString(storePaymentOrder?.order_number)}</DialogDescription></DialogHeader>
          {storePaymentOrder && <div className="space-y-4" data-testid="store-payment-modal">
            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg"><span className="text-sm text-slate-500">{t("Total", "Total")}</span><span className="text-xl font-bold text-slate-900">{formatCurrency(storePaymentOrder.total)}</span></div>
            <div><Label className="text-xs sm:text-sm">{t("Payment method", "Método de pago")}</Label><select className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2 text-sm" value={storePaymentForm.method} onChange={e => setStorePaymentForm({ method: e.target.value })} data-testid="store-payment-method"><option value="card">{t("Card (Stripe)", "Tarjeta (Stripe)")}</option><option value="cash">{t("Cash", "Efectivo")}</option><option value="transfer">{t("Transfer", "Transferencia")}</option><option value="other">{t("Other", "Otro")}</option></select></div>
            {storePaymentForm.method === "card" && <p className="text-xs text-slate-400 bg-sky-50 border border-sky-100 rounded-lg p-2.5">{t("Stripe Checkout will open in a new page", "Stripe Checkout se abrirá en otra página")}</p>}
            <Button className="w-full bg-emerald-600 hover:bg-emerald-700 text-sm" onClick={handleStorePayment} disabled={storeProcessingPayment} data-testid="store-payment-submit">{storeProcessingPayment ? t("Processing…", "Procesando…") : storePaymentForm.method === "card" ? t("Pay with Stripe", "Pagar con Stripe") : t("Register payment", "Registrar pago")}</Button>
          </div>}
        </DialogContent>
      </Dialog>

      {/* Order Detail Modal */}
      <OrderDetailDialog order={selectedOrder} onClose={() => setSelectedOrder(null)} onRefresh={loadDashboard} />

      {/* Urgent Tickets */}
      {dashboard?.urgent_tickets?.length > 0 && (
        <div className="bg-white rounded-xl border border-red-200 overflow-hidden shadow-sm">
          <div className="px-4 sm:px-6 py-4 border-b border-red-100 bg-red-50 flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-red-500 shrink-0" /><h2 className="font-semibold text-red-800 text-sm sm:text-base">{t("Urgent Tickets", "Tickets Urgentes")} <span className="ml-1 bg-red-100 text-red-700 text-xs font-bold px-2 py-0.5 rounded-full">{dashboard.urgent_tickets.length}</span></h2></div>
          <div className="divide-y divide-red-100">
            {dashboard.urgent_tickets.map(ticket => (
              <div key={ticket.ticket_id || Math.random()} className="p-3 sm:p-4" data-testid={`ticket-${ticket.ticket_id}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5 mb-1"><span className="font-mono font-semibold text-slate-800 text-xs sm:text-sm">{safeString(ticket.ticket_id)}</span><span className="px-1.5 py-0.5 text-xs font-bold rounded-full bg-red-100 text-red-700">{t("URGENT", "URGENTE")}</span></div>
                    <p className="font-semibold text-slate-800 text-sm">{safeString(ticket.subject)}</p>
                    <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{safeString(ticket.description)}</p>
                    <p className="text-xs text-red-500 mt-1.5 font-medium">{t("SLA:", "SLA:")} {new Date(ticket.sla_deadline).toLocaleString()}</p>
                  </div>
                  {ticket.customer_phone && <a href={`tel:${safeString(ticket.customer_phone)}`} className="flex items-center gap-1.5 text-xs sm:text-sm text-sky-600 hover:text-sky-700 font-medium shrink-0 bg-sky-50 hover:bg-sky-100 px-2.5 py-1.5 rounded-lg transition-colors"><Phone className="h-3.5 w-3.5" /><span className="hidden sm:inline">{t("Call", "Llamar")}</span></a>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}