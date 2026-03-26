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
  Calendar, User, Zap, Bot, DollarSign, ShoppingBag, Printer, Search
} from "lucide-react";
import { toast } from "sonner";
import { createNotificationsSocket } from "../utils/notificationsSocket";
import DeliveryZonesManager from "../components/DeliveryZonesManager";
import OrderDetailDialog from "../components/operator-dashboard/OrderDetailDialog";
import {
  ORDER_STATUSES, STORE_STATUS_FLOW, PAYMENT_METHODS,
  getNextStoreStatus, getErrorMessage, safeString, formatApiError,
  formatCurrency, formatOrderNumber, isWashFoldService, getNextStatus,
  calculateServiceCharge, dedupeOrders, isMemberOrder
} from "../components/operator-dashboard/utils";
import { useLocale } from "../context/LocaleContext";

// Importaciones de Leaflet y React Leaflet
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Iconos por defecto de Leaflet (para evitar problemas con la carga de imágenes)
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
});

const API_URL = process.env.REACT_APP_BACKEND_URL;

// Coordenadas de la tienda (Ventura, CA 93001)
const STORE_COORDINATES = { lat: 34.283, lng: -119.293 };

// Mapeo de códigos postales a coordenadas aproximadas
const cpCoordinates = {
  "93001": { lat: 34.283, lng: -119.293 },
  "93003": { lat: 34.254, lng: -119.215 },
  "93004": { lat: 34.302, lng: -119.186 },
  "93030": { lat: 34.187, lng: -119.179 },
  "93036": { lat: 34.237, lng: -119.181 },
};

// Función para extraer código postal de una dirección (5 dígitos)
const extractCP = (address) => {
  if (!address) return null;
  const match = address.match(/\b(\d{5})\b/);
  return match ? match[1] : null;
};

// Obtener coordenadas a partir de la dirección
const getCoordinatesFromAddress = (address) => {
  const cp = extractCP(address);
  return cp && cpCoordinates[cp] ? cpCoordinates[cp] : null;
};

// Cálculo de distancia en millas (fórmula de Haversine)
function getDistanceFromLatLonInMiles(lat1, lon1, lat2, lon2) {
  const R = 3959; // radio de la Tierra en millas
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Calcular tarifa de envío: primeras 3 millas gratis, luego $2.99/milla
function calculateDeliveryFee(distanceMiles) {
  if (distanceMiles <= 3) return 0;
  const extraMiles = distanceMiles - 3;
  return extraMiles * 2.99;
}

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
      return orderNumber.includes(term) || customerName.includes(term) || address.includes(term);
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
    return dedupeOrders(allOrders);
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

  // Funciones de helpers existentes
  const getErrorMessage = (error, defaultMessage) => {
    if (typeof error === 'string') return error;
    if (error?.response?.data?.detail) return error.response.data.detail;
    if (error?.message) return error.message;
    return defaultMessage;
  };

  const getStatusLabel = (status, serviceType) => {
    const normalizedStatus = (status || "").toString().toUpperCase();
    if (isWashFoldService(serviceType)) {
      const washFoldMap = {
        NEW: t("Order Received", "Orden recibida"),
        PROCESSING: t("Processing", "Procesando"),
        READY: t("Ready for Pickup", "Lista para recoger"),
        COMPLETED: t("Completed", "Completada"),
        CANCELLED: t("Cancelled", "Cancelada")
      };
      return washFoldMap[normalizedStatus] || safeString(status);
    }
    const pickupMap = {
      NEW: t("Order Created", "Orden creada"),
      CONFIRMED: t("Pickup Confirmed", "Pickup confirmado"),
      PICKUP_SCHEDULED: t("Pickup Confirmed", "Pickup confirmado"),
      PICKED_UP: t("Order in Process", "Orden en proceso"),
      PROCESSING: t("Order in Process", "Orden en proceso"),
      READY: t("Ready", "Lista"),
      OUT_FOR_DELIVERY: t("Out for Delivery", "En camino"),
      DELIVERED: t("Delivered", "Entregada"),
      COMPLETED: t("Completed", "Completada"),
      CANCELLED: t("Cancelled", "Cancelada")
    };
    return pickupMap[normalizedStatus] || safeString(status);
  };

  const getStatusInfo = (status, serviceType) => {
    const found = ORDER_STATUSES.find(s => s.value === status) || ORDER_STATUSES[0];
    return { ...found, label: getStatusLabel(found.value, serviceType) };
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

  const loadDashboard = useCallback(async () => {
    try {
      if (document.visibilityState !== "visible" && autoRefresh) return;
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
      if (autoRefresh) { loadDashboard(); loadStoreOrders(); }
    }, 30000);
    return () => clearInterval(interval);
  }, [loadDashboard, loadStoreOrders, autoRefresh]);

  useEffect(() => {
    const socket = createNotificationsSocket();
    if (!socket) { setRealtimeStatus("disabled"); return; }
    const handleNotification = () => { loadDashboard(); loadStoreOrders(); };
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

  const updateOrderStatus = async (orderId, newStatus) => {
    setUpdating(prev => ({ ...prev, [orderId]: true }));
    try {
      const res = await fetch(`${API_URL}/api/automation/orders/${orderId}/status?new_status=${newStatus}`, { method: "PUT" });
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
      const res = await fetch(`${API_URL}/api/store/orders/${orderId}/status?status=${newStatus}`, { method: "PUT" });
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
    if (!printWindow) { toast.error(t("Allow pop-ups to print", "Permite ventanas emergentes para imprimir")); return; }
    const itemsRows = (order.items || [])
      .map((item) => `<tr><td>${safeString(item.name || item.product_name || "Item")}</td><td>${safeString(item.quantity)}</td><td>$${(Number(item.price) || 0).toFixed(2)}</td></tr>`)
      .join("");
    printWindow.document.write(`
      <html><body style="font-family: Arial, sans-serif; padding: 24px;">
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
      </body></html>
    `);
    printWindow.document.close();
  };

  const handlePrintTicket = async (order) => {
    if (!order) return;
    const orderPrimaryId = order.id || order.order_id;
    if (!orderPrimaryId) {
      toast.error(t("Invalid order", "Orden inválida"));
      return;
    }

    let qrBlobUrl = null;
    try {
      const res = await axios.get(`${API_URL}/api/orders/${orderPrimaryId}/qr.svg`, { responseType: "blob" });
      qrBlobUrl = window.URL.createObjectURL(res.data);
    } catch (error) {
      console.warn("No se pudo obtener el QR", error);
    }

    const escapeHtml = (str) => {
      if (!str) return "";
      return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
    };

    const printDate = new Date(order.created_at || order.pickup_date || Date.now()).toLocaleString(t("en-US", "es-MX"), {
      dateStyle: "short",
      timeStyle: "short"
    });

    const isWashFold = isWashFoldService(order.service_type);
    const serviceLabel = isWashFold
      ? t("Wash & Fold", "Lavado y Doblado")
      : t("Pickup & Delivery", "Recogida y Entrega");

    let itemsHtml = "";
    if (order.items && order.items.length > 0) {
      itemsHtml = order.items.map(item => `
        <div class="item-row">
          <span>${escapeHtml(item.name || item.product_name)}</span>
          <span>${item.quantity} × ${formatCurrency(item.price)}</span>
        </div>
      `).join("");
    } else if (isWashFold && order.weight_lbs) {
      const pricePerLb = order.price_per_lb || 0;
      itemsHtml = `
        <div class="item-row">
          <span>Peso: ${order.weight_lbs} lb</span>
          <span>${formatCurrency(pricePerLb)}/lb</span>
        </div>
        <div class="item-row total-row">
          <span>Total lavado</span>
          <span>${formatCurrency(order.total)}</span>
        </div>
      `;
    } else {
      itemsHtml = `<div class="item-row">${t("No items", "Sin ítems")}</div>`;
    }

    const printContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Ticket ${order.order_number || order.id}</title>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            background: #f9fafb;
            padding: 40px 20px;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
          }
          .ticket {
            max-width: 380px;
            width: 100%;
            background: white;
            border-radius: 24px;
            box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.02);
            overflow: hidden;
          }
          .ticket-inner { padding: 24px; }
          .header { text-align: center; margin-bottom: 20px; }
          .logo { font-size: 28px; font-weight: 800; letter-spacing: -0.5px; background: linear-gradient(135deg, #0f172a, #1e293b); -webkit-background-clip: text; background-clip: text; color: transparent; margin-bottom: 4px; }
          .order-number { font-family: 'SF Mono', 'Courier New', monospace; font-size: 20px; font-weight: 600; background: #f1f5f9; display: inline-block; padding: 4px 12px; border-radius: 40px; margin: 12px 0 6px; }
          .date { font-size: 12px; color: #64748b; margin-top: 4px; }
          .divider { height: 1px; background: #e2e8f0; margin: 16px 0; }
          .info-grid { display: flex; flex-direction: column; gap: 12px; margin-bottom: 20px; }
          .info-row { display: flex; justify-content: space-between; align-items: baseline; font-size: 14px; line-height: 1.4; }
          .label { font-weight: 600; color: #334155; }
          .value { text-align: right; color: #0f172a; max-width: 60%; word-break: break-word; }
          .items-section { background: #f8fafc; border-radius: 16px; padding: 16px; margin: 20px 0; }
          .items-title { font-weight: 600; font-size: 14px; margin-bottom: 12px; color: #0f172a; display: flex; justify-content: space-between; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px; }
          .item-row { display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 8px; color: #1e293b; }
          .total-row { margin-top: 12px; padding-top: 8px; border-top: 1px solid #cbd5e1; font-weight: 600; }
          .total-amount { font-size: 18px; font-weight: 800; color: #0f172a; }
          .qr-container { text-align: center; margin: 20px 0 16px; }
          .qr-code { display: inline-block; background: white; padding: 8px; border-radius: 16px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05); border: 1px solid #e2e8f0; }
          .qr-code img { width: 180px; height: 180px; display: block; }
          .qr-label { font-size: 10px; color: #64748b; margin-top: 8px; }
          .footer { text-align: center; font-size: 10px; color: #94a3b8; margin-top: 16px; padding-top: 16px; border-top: 1px solid #e2e8f0; }
          @media print { body { background: white; padding: 0; margin: 0; } .ticket { box-shadow: none; border-radius: 0; } .qr-code { box-shadow: none; border: none; } }
        </style>
      </head>
      <body>
        <div class="ticket">
          <div class="ticket-inner">
            <div class="header">
              <div class="logo">VENTURA</div>
              <div class="order-number">${escapeHtml(order.order_number || order.id)}</div>
              <div class="date">${printDate}</div>
            </div>
            <div class="info-grid">
              <div class="info-row"><span class="label">${t("Service", "Servicio")}</span><span class="value">${escapeHtml(serviceLabel)}</span></div>
              <div class="info-row"><span class="label">${t("Customer", "Cliente")}</span><span class="value">${escapeHtml(order.customer_name || t("N/A", "N/D"))}</span></div>
              <div class="info-row"><span class="label">${t("Status", "Estado")}</span><span class="value">${escapeHtml(getStatusLabel(order.status, order.service_type))}</span></div>
              <div class="info-row"><span class="label">${t("Payment", "Pago")}</span><span class="value">${escapeHtml(getPaymentStatusLabel(order.payment_status))}</span></div>
            </div>
            <div class="items-section">
              <div class="items-title"><span>${t("Items", "Artículos")}</span><span>${t("Amount", "Importe")}</span></div>
              ${itemsHtml}
            </div>
            ${order.delivery_address ? `<div class="info-row"><span class="label">${t("Delivery address", "Dirección")}</span><span class="value">${escapeHtml(order.delivery_address)}</span></div>` : ''}
            ${order.pickup_address ? `<div class="info-row"><span class="label">${t("Pickup address", "Recogida")}</span><span class="value">${escapeHtml(order.pickup_address)}</span></div>` : ''}
            <div class="info-row" style="margin-top: 16px; font-size: 16px;">
              <span class="label" style="font-weight: 700;">${t("Total", "Total")}</span>
              <span class="total-amount">${formatCurrency(order.total)}</span>
            </div>
            <div class="qr-container">
              <div class="qr-code">
                ${qrBlobUrl ? `<img src="${qrBlobUrl}" alt="QR Code" />` : `<div style="width:180px;height:180px;display:flex;align-items:center;justify-content:center;background:#f1f5f9;color:#64748b;">${t("QR not available", "QR no disponible")}</div>`}
              </div>
              <div class="qr-label">${t("Scan to view order details", "Escanea para ver los detalles de la orden")}</div>
            </div>
            <div class="footer">
              ${t("Generated on", "Generado el")} ${new Date().toLocaleString()}<br/>
              ${escapeHtml(t("Thank you for your business", "Gracias por su preferencia"))}
            </div>
          </div>
        </div>
        <script>window.onload = function() { window.print(); window.onafterprint = function() { window.close(); }; };</script>
      </body>
      </html>
    `;

    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      toast.error(t("Allow pop-ups to print", "Permite ventanas emergentes para imprimir"));
      return;
    }
    printWindow.document.write(printContent);
    printWindow.document.close();
    if (qrBlobUrl) setTimeout(() => URL.revokeObjectURL(qrBlobUrl), 1000);
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
          handlePrintTicket({ id: result.order_id, order_id: result.order_id });
        }
      });
    } catch (error) {
      toast.error(t("Could not execute AI task", "No se pudo ejecutar la tarea IA"));
    } finally {
      setAiLoading(false);
    }
  };

  const pollStoreCheckoutStatus = useCallback(async (sessionId, attempt = 0) => {
    const maxAttempts = 8;
    try {
      const res = await fetch(`${API_URL}/api/store/checkout/status/${sessionId}`);
      if (!res.ok) throw new Error("status");
      const data = await res.json();
      const paymentStatus = (data?.payment_status || "").toLowerCase();
      const checkoutStatus = (data?.status || "").toLowerCase();
      if (paymentStatus === "paid") { toast.success(t("Store payment confirmed", "Pago de tienda confirmado")); await loadStoreOrders(); return; }
      if (checkoutStatus === "expired") { toast.error(t("Store payment expired", "Pago de tienda expirado")); await loadStoreOrders(); return; }
      if (attempt >= maxAttempts) { toast.info(t("Store payment pending", "Pago de tienda pendiente")); await loadStoreOrders(); return; }
      setTimeout(() => pollStoreCheckoutStatus(sessionId, attempt + 1), 2000);
    } catch (error) {
      if (attempt >= maxAttempts) { toast.error(t("Unable to verify payment", "No se pudo verificar pago")); await loadStoreOrders(); return; }
      setTimeout(() => pollStoreCheckoutStatus(sessionId, attempt + 1), 2000);
    }
  }, [loadStoreOrders, t]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const storeSessionId = params.get("store_session_id");
    if (!storeSessionId) return;
    pollStoreCheckoutStatus(storeSessionId);
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
        const cartData = await cartRes.json();
        if (!cartData || !Array.isArray(cartData.items)) throw new Error("Invalid cart response");
        setStoreCart(cartData);
      }
      if (productsRes.ok) setStoreProducts(await productsRes.json() || []);
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
    setStoreCheckoutForm({ name: "", email: "", phone: "", address: "", apt: "", instructions: "", notes: "", preferred_contact: "sms", payment_method: "card", fulfillment_type: "pickup" });
    setStoreShippingQuote({ distance_km: null, fee: 0, zone_name: null });
  };

  const getCartItemQuantity = (productId) => {
    try {
      const item = storeCart?.items?.find((entry) => entry.product_id === productId);
      return item ? item.quantity : 0;
    } catch { return 0; }
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
        res = await fetch(`${endpoint}?quantity=${quantity}`, { method: "PUT" });
      }
      if (res.ok) {
        const data = await res.json();
        if (!data || !Array.isArray(data.items)) throw new Error("Invalid cart response");
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
    if (!storeCart || !storeCart.items?.length) { toast.error(t("Cart is empty", "El carrito está vacío")); return; }
    if (!storeCheckoutForm.name || !storeCheckoutForm.email || !storeCheckoutForm.phone) { toast.error(t("Complete customer details", "Completa los datos del cliente")); return; }
    if (storeCheckoutForm.fulfillment_type === "delivery" && !storeCheckoutForm.address) { toast.error(t("Add delivery address", "Agrega dirección de entrega")); return; }
    if (storeCheckoutForm.fulfillment_type === "delivery" && storeShippingError) { toast.error(storeShippingError); return; }
    if (storeCheckoutForm.fulfillment_type === "delivery" && !storeShippingQuote.distance_km) { toast.error(t("Calculate shipping before charging", "Calcula el envío antes de cobrar")); return; }
    setStoreCheckoutLoading(true);
    try {
      const payload = {
        cart_id: storeCart.id, origin_url: window.location.origin,
        customer_name: storeCheckoutForm.name, customer_email: storeCheckoutForm.email,
        customer_phone: storeCheckoutForm.phone,
        shipping_address: storeCheckoutForm.fulfillment_type === "delivery" ? storeCheckoutForm.address : "",
        shipping_apt: storeCheckoutForm.apt, delivery_instructions: storeCheckoutForm.instructions,
        notes: storeCheckoutForm.notes, preferred_contact: storeCheckoutForm.preferred_contact,
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
        const data = await res.json();
        if (storeCheckoutForm.payment_method === "card") window.location.href = data.checkout_url;
        else { toast.success(t("Store order confirmed", "Orden confirmada")); resetStorePos(); await loadStoreOrders(); }
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
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ origin_url: window.location.origin })
        });
        if (res.ok) { const data = await res.json(); window.location.href = data.checkout_url; return; }
        const error = await res.json();
        toast.error(formatApiError(error.detail, t("Stripe checkout failed", "Falló Stripe")));
      } else {
        const res = await fetch(`${API_URL}/api/store/orders/${storePaymentOrder.id}/payment`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ payment_method: storePaymentForm.method })
        });
        if (res.ok) { toast.success(t("Payment registered", "Pago registrado")); setStorePaymentOrder(null); await loadStoreOrders(); }
        else { const error = await res.json(); toast.error(formatApiError(error.detail, t("Payment failed", "Pago fallido"))); }
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
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address: storeCheckoutForm.address })
        });
        if (res.ok) { const data = await res.json(); setStoreShippingQuote(data); setStoreShippingError(""); }
        else {
          const error = await res.json();
          setStoreShippingQuote({ distance_km: null, fee: 0, zone_name: null });
          setStoreShippingError(formatApiError(error.detail, t("Unable to calculate shipping", "No se pudo calcular envío")));
        }
      } catch (error) {
        setStoreShippingQuote({ distance_km: null, fee: 0, zone_name: null });
        setStoreShippingError(t("Unable to calculate shipping", "No se pudo calcular envío"));
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
  const filteredStoreProducts = storeProducts.filter((product) =>
    product.name?.toLowerCase().includes(storeSearch.toLowerCase())
  );
  const unpaidStoreOrders = storeOrders.filter((order) => {
    const status = (order.payment_status || "pending").toLowerCase();
    return status !== "paid" && status !== "refunded";
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-600"></div>
      </div>
    );
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
          <p className="text-sm text-slate-600 mt-0.5">
            {t("Just update order status – the system does the rest", "Solo actualiza el estado de las órdenes - el sistema hace el resto")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
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
          <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${realtimeClass}`} data-testid="operator-realtime-status">
            {realtimeLabel}
          </span>
          <span className="text-xs text-slate-500 hidden sm:inline">
            {t("Last refresh:", "Última actualización:")} {lastRefresh.toLocaleTimeString()}
          </span>
          <Button onClick={() => setAutoRefresh(!autoRefresh)} variant="outline" size="sm" data-testid="toggle-auto-refresh">
            {autoRefresh ? t("Pause", "Pausar") : t("Resume", "Reanudar")}
          </Button>
          <Button onClick={loadDashboard} variant="outline" size="sm" data-testid="refresh-dashboard">
            <RefreshCw className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">{t("Refresh", "Actualizar")}</span>
          </Button>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {[
          { icon: <Truck className="h-5 w-5 text-sky-600" />, bg: "bg-sky-100", count: pickupOrdersCount, label: t("Pickups Today", "Pickups Hoy"), testId: "pickups" },
          { icon: <Package className="h-5 w-5 text-yellow-600" />, bg: "bg-yellow-100", count: ordersInProcessingCount, label: t("In Process", "En Proceso"), testId: "processing" },
          { icon: <CheckCircle className="h-5 w-5 text-green-600" />, bg: "bg-green-100", count: deliveriesCount, label: t("Deliveries Ongoing", "Entregas en curso"), testId: "deliveries" },
          { icon: <AlertTriangle className="h-5 w-5 text-red-600" />, bg: "bg-red-100", count: urgentCount, label: t("Urgent Tickets", "Tickets Urgentes"), testId: "urgent" }
        ].map(({ icon, bg, count, label, testId }) => (
          <div key={testId} className="bg-white rounded-xl border border-slate-200 p-3 sm:p-4">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className={`h-9 w-9 sm:h-10 sm:w-10 rounded-full ${bg} flex items-center justify-center shrink-0`}>
                {icon}
              </div>
              <div className="min-w-0">
                <p className="text-xl sm:text-2xl font-bold text-slate-900 leading-none" data-testid={`operator-stat-${testId}-count`}>{count}</p>
                <p className="text-xs sm:text-sm text-slate-600 mt-0.5 truncate" data-testid={`operator-stat-${testId}-label`}>{label}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* AI Assistant */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-4 sm:px-6 py-4 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
          <Bot className="h-5 w-5 text-sky-600 shrink-0" />
          <h2 className="font-semibold text-slate-900 text-sm sm:text-base">{t("AI Operations Assistant", "Asistente Operativo IA")}</h2>
        </div>
        <div className="p-4 sm:p-6 grid gap-4 sm:gap-6 lg:grid-cols-[2fr_1fr]">
          <div>
            <Textarea
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              rows={4}
              placeholder={t(
                "Example: Mark order VFL-20260222-02220002 as paid in cash $50 and generate ticket",
                "Ej: Marca la orden VFL-20260222-02220002 como pagada en efectivo $50 y genera ticket"
              )}
              className="text-sm"
              data-testid="operator-ai-input"
            />
            <div className="flex flex-wrap gap-2 mt-3">
              <Button onClick={handleAiRequest} disabled={aiLoading} size="sm" data-testid="operator-ai-submit">
                {aiLoading ? t("Processing...", "Procesando...") : t("Send to AI", "Enviar a IA")}
              </Button>
              <Button variant="outline" size="sm" onClick={() => { setAiPrompt(""); setAiReply(""); setAiResults([]); }} data-testid="operator-ai-clear">
                {t("Clear", "Limpiar")}
              </Button>
            </div>
          </div>
          <div className="bg-slate-50 rounded-xl p-4">
            <p className="text-xs sm:text-sm text-slate-500">{t("Response", "Respuesta")}</p>
            <p className="font-medium text-slate-900 mt-1 text-sm" data-testid="operator-ai-reply">
              {aiReply || t("No reply yet", "Aún no hay respuesta")}
            </p>
            <div className="mt-3">
              <p className="text-xs text-slate-500">{t("Executed actions", "Acciones ejecutadas")}</p>
              {aiResults.length === 0 ? (
                <p className="text-xs sm:text-sm text-slate-400 mt-1">{t("No actions yet", "Sin acciones todavía")}</p>
              ) : (
                <ul className="mt-2 space-y-1.5">
                  {aiResults.map((result, index) => (
                    <li key={`${result.type}-${index}`} className="text-xs sm:text-sm text-slate-700" data-testid={`operator-ai-result-${index}`}>
                      {result.type}: {result.ok ? t("OK", "OK") : t("Error", "Error")}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* POS Grid con órdenes filtradas */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 sm:gap-6" data-testid="operator-pos-grid">

        {/* LEFT COLUMN */}
        <div className="space-y-4 sm:space-y-6">
          {/* Pickup Created/Confirmed */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden" data-testid="pos-pickup-today-card">
            <div className="px-4 sm:px-5 py-3 sm:py-4 border-b border-slate-100 bg-slate-50">
              <h2 className="font-semibold text-slate-900 flex items-center gap-2 text-sm sm:text-base">
                <Truck className="h-4 w-4 sm:h-5 sm:w-5 text-sky-600 shrink-0" />
                <span className="truncate">{t("Pickup & Delivery — Created / Confirmed", "Pickup & Delivery — Creadas / Confirmadas")}</span>
                <span className="ml-auto shrink-0 text-xs sm:text-sm font-semibold text-slate-600" data-testid="pos-pickup-today-count">({filteredPickupOrders.length})</span>
              </h2>
            </div>
            <div className="divide-y divide-slate-100">
              {filteredPickupOrders.length === 0 ? (
                <div className="p-6 text-center text-slate-500" data-testid="pos-pickup-today-empty">
                  <Truck className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                  <p className="text-sm">{t("No created or confirmed orders", "No hay órdenes creadas o confirmadas")}</p>
                </div>
              ) : (
                filteredPickupOrders.map((order) => (
                  <div key={order.order_id || Math.random()} className="p-3 sm:p-4 hover:bg-slate-50 transition-colors cursor-pointer" data-testid={`pos-pickup-item-${order.order_id || 'unknown'}`} role="button" onClick={() => setSelectedOrder(order)}>
                    <div className="flex items-start justify-between gap-2 sm:gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5 mb-1">
                          <span className="font-mono font-semibold text-slate-900 text-xs sm:text-sm truncate">{formatOrderNumber(order)}</span>
                          <span className={`px-1.5 py-0.5 text-xs font-medium rounded-full shrink-0 ${getStatusInfo(order.status, order.service_type).color}`}>
                            {getStatusInfo(order.status, order.service_type).label}
                          </span>
                        </div>
                        <div className="text-sm text-slate-600 truncate">{safeString(order.customer_name, t("Customer", "Cliente"))}</div>
                        <div className="text-xs text-slate-500 mt-0.5 truncate">
                          {safeString(order.pickup_time, t("No time", "Sin hora"))} · {safeString(order.pickup_address, t("No address", "Sin dirección"))}
                        </div>
                      </div>
                      <div className="flex flex-col gap-1.5 shrink-0">
                        {(order.next_status || getNextStatus(order.status, order.service_type)) && (
                          <Button size="sm" onClick={(e) => { e.stopPropagation(); updateOrderStatus(order.order_id, order.next_status || getNextStatus(order.status, order.service_type)); }} disabled={updating[order.order_id]} className="bg-sky-600 hover:bg-sky-700 text-xs" data-testid={`pos-pickup-update-${order.order_id}`}>
                            {updating[order.order_id] ? <RefreshCw className="h-3 w-3 animate-spin" /> : <><span className="hidden sm:inline">{getStatusInfo(order.next_status || getNextStatus(order.status, order.service_type), order.service_type).label}</span><ChevronRight className="h-3 w-3 ml-0.5" /></>}
                          </Button>
                        )}
                        <Button variant="outline" size="sm" className="text-xs" onClick={(e) => { e.stopPropagation(); handlePrintTicket(order); }} data-testid={`pos-pickup-print-${order.order_id}`}>
                          <span className="hidden sm:inline">{t("Print Ticket", "Imprimir Ticket")}</span>
                          <span className="sm:hidden">Print</span>
                        </Button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Pickup Payment Queue */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden" data-testid="pos-pickup-payment-card">
            <div className="px-4 sm:px-5 py-3 sm:py-4 border-b border-slate-100 bg-slate-50">
              <h2 className="font-semibold text-slate-900 flex items-center gap-2 text-sm sm:text-base">
                <DollarSign className="h-4 w-4 sm:h-5 sm:w-5 text-emerald-600 shrink-0" />
                <span className="truncate">{t("Pickup & Delivery — Request Payment", "Pickup & Delivery — Solicitar pago")}</span>
                <span className="ml-auto shrink-0 text-xs sm:text-sm font-semibold text-slate-600" data-testid="pos-pickup-payment-count">({filteredPickupPaymentQueue.length})</span>
              </h2>
            </div>
            <div className="divide-y divide-slate-100">
              {filteredPickupPaymentQueue.length === 0 ? (
                <div className="p-6 text-center text-slate-500 text-sm" data-testid="pos-pickup-payment-empty">
                  <p>{t("No pickup payments pending", "Sin pagos pendientes")}</p>
                </div>
              ) : (
                filteredPickupPaymentQueue.map((order) => {
                  const amount = calculateServiceCharge(order);
                  return (
                    <div key={order.order_id || Math.random()} className="p-3 sm:p-4 hover:bg-slate-50 transition-colors cursor-pointer" data-testid={`pos-pickup-payment-${order.order_id || 'unknown'}`} role="button" onClick={() => setSelectedOrder(order)}>
                      <div className="flex items-start justify-between gap-2 sm:gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5 mb-1">
                            <span className="font-mono font-semibold text-slate-900 text-xs sm:text-sm">{formatOrderNumber(order)}</span>
                            <span className={`px-1.5 py-0.5 text-xs font-medium rounded-full shrink-0 ${getStatusInfo(order.status, order.service_type).color}`}>
                              {getStatusInfo(order.status, order.service_type).label}
                            </span>
                          </div>
                          <div className="text-sm text-slate-600 truncate">{safeString(order.customer_name, t("Customer", "Cliente"))}</div>
                          <div className="text-xs text-slate-500 mt-0.5">
                            {t("Charge", "Cobro")}: {amount ? formatCurrency(amount) : t("Set actual lbs", "Ingresa lbs reales")}
                          </div>
                        </div>
                        <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-xs shrink-0" onClick={(e) => { e.stopPropagation(); setSelectedOrder(order); }} data-testid={`pos-pickup-collect-${order.order_id}`}>
                          {t("Collect", "Cobrar")}
                        </Button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Pickup In Process / Ready / Out for Delivery */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden" data-testid="pos-pickup-delivery-card">
            <div className="px-4 sm:px-5 py-3 sm:py-4 border-b border-slate-100 bg-emerald-50">
              <h2 className="font-semibold text-slate-900 flex items-center gap-2 text-sm sm:text-base" data-testid="operator-delivery-section-title">
                <CheckCircle className="h-4 w-4 sm:h-5 sm:w-5 text-emerald-600 shrink-0" />
                <span className="truncate">{t("Pickup & Delivery — In Process / Ready / Out for Delivery", "Pickup & Delivery — En proceso / Lista / En camino")}</span>
                <span className="ml-auto shrink-0 text-xs sm:text-sm font-semibold text-slate-600" data-testid="pos-pickup-delivery-count">({filteredPickupDeliveries.length})</span>
              </h2>
            </div>
            <div className="divide-y divide-slate-100">
              {filteredPickupDeliveries.length === 0 ? (
                <div className="p-6 text-center text-slate-500" data-testid="operator-delivery-empty">
                  <Package className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                  <p className="text-sm">{t("No active process or delivery orders", "No hay órdenes activas en proceso o entrega")}</p>
                </div>
              ) : (
                filteredPickupDeliveries.map((order) => (
                  <div key={order.order_id || Math.random()} className="p-3 sm:p-4 hover:bg-slate-50 transition-colors cursor-pointer" data-testid={`pos-pickup-delivery-${order.order_id || 'unknown'}`} role="button" onClick={() => setSelectedOrder(order)}>
                    <div className="flex items-start justify-between gap-2 sm:gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5 mb-1">
                          <span className="font-mono font-semibold text-slate-900 text-xs sm:text-sm">{formatOrderNumber(order)}</span>
                          <span className={`px-1.5 py-0.5 text-xs font-medium rounded-full shrink-0 ${getStatusInfo(order.status, order.service_type).color}`}>
                            {getStatusInfo(order.status, order.service_type).label}
                          </span>
                        </div>
                        <div className="text-sm text-slate-600 truncate">{safeString(order.customer_name, t("Customer", "Cliente"))}</div>
                        <div className="text-xs text-slate-500 mt-0.5 truncate">{safeString(order.delivery_address || order.pickup_address, "-")}</div>
                      </div>
                      {(order.next_status || getNextStatus(order.status, order.service_type)) && (
                        <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-xs shrink-0" onClick={(e) => { e.stopPropagation(); updateOrderStatus(order.order_id, order.next_status || getNextStatus(order.status, order.service_type)); }} disabled={updating[order.order_id]} data-testid={`pos-pickup-delivery-update-${order.order_id}`}>
                          {updating[order.order_id] ? <RefreshCw className="h-3 w-3 animate-spin" /> : <><span className="hidden sm:inline">{getStatusInfo(order.next_status || getNextStatus(order.status, order.service_type), order.service_type).label}</span><ChevronRight className="h-3 w-3 ml-0.5" /></>}
                        </Button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN */}
        <div className="space-y-4 sm:space-y-6">
          {/* Wash & Fold Dropoffs */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden" data-testid="pos-washfold-dropoff-card">
            <div className="px-4 sm:px-5 py-3 sm:py-4 border-b border-slate-100 bg-slate-50">
              <h2 className="font-semibold text-slate-900 flex items-center gap-2 text-sm sm:text-base">
                <Package className="h-4 w-4 sm:h-5 sm:w-5 text-purple-600 shrink-0" />
                <span className="truncate">{t("Wash & Fold — Order Received / Processing", "Wash & Fold — Orden recibida / Procesando")}</span>
                <span className="ml-auto shrink-0 text-xs sm:text-sm font-semibold text-slate-600" data-testid="pos-washfold-dropoff-count">({filteredWashFoldDropoffs.length})</span>
              </h2>
            </div>
            <div className="divide-y divide-slate-100">
              {filteredWashFoldDropoffs.length === 0 ? (
                <div className="p-6 text-center text-slate-500 text-sm" data-testid="pos-washfold-dropoff-empty">
                  <p>{t("No drop-offs waiting", "Sin entregas pendientes")}</p>
                </div>
              ) : (
                filteredWashFoldDropoffs.map((order) => (
                  <div key={order.order_id || Math.random()} className="p-3 sm:p-4 hover:bg-slate-50 transition-colors cursor-pointer" data-testid={`pos-washfold-dropoff-${order.order_id || 'unknown'}`} role="button" onClick={() => setSelectedOrder(order)}>
                    <div className="flex items-start justify-between gap-2 sm:gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5 mb-1">
                          <span className="font-mono font-semibold text-slate-900 text-xs sm:text-sm">{formatOrderNumber(order)}</span>
                          <span className={`px-1.5 py-0.5 text-xs font-medium rounded-full shrink-0 ${getStatusInfo(order.status, order.service_type).color}`}>
                            {getStatusInfo(order.status, order.service_type).label}
                          </span>
                        </div>
                        <div className="text-sm text-slate-600 truncate">{safeString(order.customer_name, t("Customer", "Cliente"))}</div>
                        <div className="text-xs text-slate-500 mt-0.5">{safeString(order.pickup_date, t("Drop-off today", "Entrega hoy"))}</div>
                      </div>
                      <div className="flex flex-col gap-1.5 shrink-0">
                        {(order.next_status || getNextStatus(order.status, order.service_type)) && (
                          <Button size="sm" className="bg-purple-600 hover:bg-purple-700 text-xs" onClick={(e) => { e.stopPropagation(); updateOrderStatus(order.order_id, order.next_status || getNextStatus(order.status, order.service_type)); }} disabled={updating[order.order_id]} data-testid={`pos-washfold-update-${order.order_id}`}>
                            {updating[order.order_id] ? <RefreshCw className="h-3 w-3 animate-spin" /> : <><span className="hidden sm:inline">{getStatusInfo(order.next_status || getNextStatus(order.status, order.service_type), order.service_type).label}</span><ChevronRight className="h-3 w-3 ml-0.5" /></>}
                          </Button>
                        )}
                        <Button variant="outline" size="sm" className="text-xs" onClick={(e) => { e.stopPropagation(); handlePrintTicket(order); }} data-testid={`pos-washfold-print-${order.order_id}`}>
                          <Printer className="h-3 w-3 mr-1 sm:mr-0" />
                          <span className="hidden sm:inline">{t("Print Ticket", "Imprimir Ticket")}</span>
                          <span className="sm:hidden">{t("Print", "Imprimir")}</span>
                        </Button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Wash & Fold Payment Queue */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden" data-testid="pos-washfold-payment-card">
            <div className="px-4 sm:px-5 py-3 sm:py-4 border-b border-slate-100 bg-slate-50">
              <h2 className="font-semibold text-slate-900 flex items-center gap-2 text-sm sm:text-base">
                <DollarSign className="h-4 w-4 sm:h-5 sm:w-5 text-emerald-600 shrink-0" />
                <span className="truncate">{t("Wash & Fold — Request Payment", "Wash & Fold — Solicitar pago")}</span>
                <span className="ml-auto shrink-0 text-xs sm:text-sm font-semibold text-slate-600" data-testid="pos-washfold-payment-count">({filteredWashFoldPaymentQueue.length})</span>
              </h2>
            </div>
            <div className="divide-y divide-slate-100">
              {filteredWashFoldPaymentQueue.length === 0 ? (
                <div className="p-6 text-center text-slate-500 text-sm" data-testid="pos-washfold-payment-empty">
                  <p>{t("No wash & fold payments pending", "Sin pagos pendientes")}</p>
                </div>
              ) : (
                filteredWashFoldPaymentQueue.map((order) => {
                  const amount = calculateServiceCharge(order);
                  return (
                    <div key={order.order_id || Math.random()} className="p-3 sm:p-4 hover:bg-slate-50 transition-colors cursor-pointer" data-testid={`pos-washfold-payment-${order.order_id || 'unknown'}`} role="button" onClick={() => setSelectedOrder(order)}>
                      <div className="flex items-start justify-between gap-2 sm:gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5 mb-1">
                            <span className="font-mono font-semibold text-slate-900 text-xs sm:text-sm">{formatOrderNumber(order)}</span>
                            <span className={`px-1.5 py-0.5 text-xs font-medium rounded-full shrink-0 ${getStatusInfo(order.status, order.service_type).color}`}>
                              {getStatusInfo(order.status, order.service_type).label}
                            </span>
                          </div>
                          <div className="text-sm text-slate-600 truncate">{safeString(order.customer_name, t("Customer", "Cliente"))}</div>
                          <div className="text-xs text-slate-500 mt-0.5">
                            {t("Charge", "Cobro")}: {amount ? formatCurrency(amount) : t("Set actual lbs", "Ingresa lbs reales")}
                          </div>
                        </div>
                        <div className="flex flex-col gap-1.5 shrink-0">
                          <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-xs" onClick={(e) => { e.stopPropagation(); setSelectedOrder(order); }} data-testid={`pos-washfold-collect-${order.order_id}`}>
                            {t("Collect", "Cobrar")}
                          </Button>
                          <Button variant="outline" size="sm" className="text-xs" onClick={(e) => { e.stopPropagation(); handlePrintTicket(order); }} data-testid={`pos-washfold-print-payment-${order.order_id}`}>
                            <Printer className="h-3 w-3 mr-1 sm:mr-0" />
                            <span className="hidden sm:inline">{t("Print Ticket", "Imprimir Ticket")}</span>
                            <span className="sm:hidden">{t("Print", "Imprimir")}</span>
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Wash & Fold Ready */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden" data-testid="pos-washfold-ready-card">
            <div className="px-4 sm:px-5 py-3 sm:py-4 border-b border-slate-100 bg-emerald-50">
              <h2 className="font-semibold text-slate-900 flex items-center gap-2 text-sm sm:text-base">
                <CheckCircle className="h-4 w-4 sm:h-5 sm:w-5 text-emerald-600 shrink-0" />
                <span className="truncate">{t("Wash & Fold — Ready for customer pickup", "Wash & Fold — Lista para recoger en tienda")}</span>
                <span className="ml-auto shrink-0 text-xs sm:text-sm font-semibold text-slate-600" data-testid="pos-washfold-ready-count">({filteredWashFoldReady.length})</span>
              </h2>
            </div>
            <div className="divide-y divide-slate-100">
              {filteredWashFoldReady.length === 0 ? (
                <div className="p-6 text-center text-slate-500 text-sm" data-testid="pos-washfold-ready-empty">
                  <p>{t("No wash & fold orders ready", "No hay órdenes listas")}</p>
                </div>
              ) : (
                filteredWashFoldReady.map((order) => (
                  <div key={order.order_id || Math.random()} className="p-3 sm:p-4 hover:bg-slate-50 transition-colors cursor-pointer" data-testid={`pos-washfold-ready-${order.order_id || 'unknown'}`} role="button" onClick={() => setSelectedOrder(order)}>
                    <div className="flex items-start justify-between gap-2 sm:gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5 mb-1">
                          <span className="font-mono font-semibold text-slate-900 text-xs sm:text-sm">{formatOrderNumber(order)}</span>
                          <span className={`px-1.5 py-0.5 text-xs font-medium rounded-full shrink-0 ${getStatusInfo(order.status, order.service_type).color}`}>
                            {getStatusInfo(order.status, order.service_type).label}
                          </span>
                        </div>
                        <div className="text-sm text-slate-600 truncate">{safeString(order.customer_name, t("Customer", "Cliente"))}</div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          {t("Payment", "Pago")}: {getPaymentStatusLabel(order.payment_status)}
                        </div>
                      </div>
                      <div className="flex flex-col gap-1.5 shrink-0">
                        {(order.next_status || getNextStatus(order.status, order.service_type)) && (
                          <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-xs" onClick={(e) => { e.stopPropagation(); updateOrderStatus(order.order_id, order.next_status || getNextStatus(order.status, order.service_type)); }} disabled={updating[order.order_id]} data-testid={`pos-washfold-ready-update-${order.order_id}`}>
                            {updating[order.order_id] ? <RefreshCw className="h-3 w-3 animate-spin" /> : <><span className="hidden sm:inline">{getStatusInfo(order.next_status || getNextStatus(order.status, order.service_type), order.service_type).label}</span><ChevronRight className="h-3 w-3 ml-0.5" /></>}
                          </Button>
                        )}
                        <Button variant="outline" size="sm" className="text-xs" onClick={(e) => { e.stopPropagation(); handlePrintTicket(order); }} data-testid={`pos-washfold-ready-print-${order.order_id}`}>
                          <Printer className="h-3 w-3 mr-1 sm:mr-0" />
                          <span className="hidden sm:inline">{t("Print Ticket", "Imprimir Ticket")}</span>
                          <span className="sm:hidden">{t("Print", "Imprimir")}</span>
                        </Button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Mapa interactivo mejorado */}
      <div className="mt-6 sm:mt-10 bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-4 sm:px-6 py-4 border-b border-slate-100 bg-slate-50">
          <h3 className="font-semibold text-slate-900 text-sm sm:text-base flex items-center gap-2">
            <MapPin className="h-4 w-4 text-sky-600" />
            {t("Order Locations", "Ubicaciones de órdenes")}
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            {t("Click on a marker to update status, print ticket, collect payment or view details", "Haz clic en un marcador para actualizar estado, imprimir ticket, cobrar o ver detalles")}
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
              const distance = getDistanceFromLatLonInMiles(
                STORE_COORDINATES.lat,
                STORE_COORDINATES.lng,
                order.coords.lat,
                order.coords.lng
              );
              const deliveryFee = calculateDeliveryFee(distance);
              const exceedsLimit = distance > 9;

              const statusInfo = getStatusInfo(order.status, order.service_type);
              const nextStatus = order.next_status || getNextStatus(order.status, order.service_type);

              const markerColor = isDelivery ? "#3b82f6" : "#a855f7";
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
                      <div className="flex flex-wrap gap-2 pt-2">
                        {nextStatus && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            onClick={() => updateOrderStatus(order.order_id, nextStatus)}
                          >
                            {getStatusLabel(nextStatus, order.service_type)}
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={() => handlePrintTicket(order)}
                        >
                          <Printer className="h-3 w-3 mr-1" />
                          Imprimir
                        </Button>
                        {order.payment_status !== "paid" && (
                          <Button
                            size="sm"
                            variant="default"
                            className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700"
                            onClick={() => setSelectedOrder(order)}
                          >
                            <DollarSign className="h-3 w-3 mr-1" />
                            Cobrar
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="link"
                          className="h-7 text-xs"
                          onClick={() => setSelectedOrder(order)}
                        >
                          Ver detalles
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

      {/* Store Orders y demás módulos (sin cambios) */}
      <div className="mt-6 sm:mt-10 space-y-4 sm:space-y-6">
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden" data-testid="store-orders-panel">
          <div className="px-4 sm:px-6 py-4 border-b border-slate-100 bg-slate-50">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h3 className="font-semibold text-slate-900 text-sm sm:text-base">{t("Store Orders", "Órdenes tienda")}</h3>
                <p className="text-xs sm:text-sm text-slate-500">{t("Process product purchases", "Procesa compras de productos")}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" className="bg-sky-600 hover:bg-sky-700 text-xs sm:text-sm" onClick={openStorePos} data-testid="store-pos-open">
                  {t("New Store Sale", "Nueva venta")}
                </Button>
                {unpaidStoreOrders.length > 0 && (
                  <Button size="sm" variant="outline" className="text-xs sm:text-sm" onClick={() => { setStorePaymentOrder(unpaidStoreOrders[0]); setStorePaymentForm({ method: "card" }); }} data-testid="store-pos-request-payment">
                    {t("Request payment", "Solicitar pago")} ({unpaidStoreOrders.length})
                  </Button>
                )}
                <span className="text-xs sm:text-sm font-semibold text-slate-600" data-testid="store-orders-count">{storeOrders.length}</span>
              </div>
            </div>
          </div>

          <div className="px-4 sm:px-6 py-3 bg-white border-b border-slate-100" data-testid="store-orders-steps">
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 text-xs text-slate-600">
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
            <div className="p-6 text-center text-slate-500 text-sm" data-testid="store-orders-loading">{t("Loading store orders...", "Cargando órdenes...")}</div>
          ) : storeOrders.length === 0 ? (
            <div className="p-6 text-center text-slate-500 text-sm" data-testid="store-orders-empty">{t("No store orders yet", "Sin órdenes de tienda")}</div>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-slate-500">
                    <tr>
                      <th className="text-left px-4 py-3 text-xs font-semibold">{t("Order", "Orden")}</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold">{t("Customer", "Cliente")}</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold">{t("Status", "Estado")}</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold">{t("Payment", "Pago")}</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold">{t("Total", "Total")}</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold">{t("Actions", "Acciones")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {storeOrders.map((order) => {
                      const nextStatus = getNextStoreStatus(order.status);
                      return (
                        <tr key={order.id || Math.random()} className="border-t border-slate-100" data-testid={`store-order-row-${order.id || 'unknown'}`}>
                          <td className="px-4 py-3 font-mono text-slate-900 text-xs">{safeString(order.order_number)}</td>
                          <td className="px-4 py-3">
                            <div className="text-slate-900 text-sm">{safeString(order.customer_name, t("Customer", "Cliente"))}</div>
                            <div className="text-xs text-slate-500">{safeString(order.customer_email)}</div>
                          </td>
                          <td className="px-4 py-3">
                            <span className="px-2 py-1 rounded-full bg-slate-100 text-slate-700 text-xs" data-testid={`store-order-status-${order.id}`}>
                              {getStoreStatusDisplay(order.status)}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="text-slate-900 text-sm" data-testid={`store-order-payment-${order.id}`}>{getPaymentStatusLabel(order.payment_status)}</div>
                            <div className="text-xs text-slate-500">{safeString(order.payment_method, "-")}</div>
                          </td>
                          <td className="px-4 py-3 font-semibold text-sm" data-testid={`store-order-total-${order.id}`}>{formatCurrency(order.total)}</td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex flex-wrap justify-end gap-1.5">
                              {(order.payment_status || "pending") !== "paid" && (order.payment_status || "").toLowerCase() !== "refunded" && (
                                <Button variant="outline" size="sm" className="text-xs" onClick={() => { setStorePaymentOrder(order); setStorePaymentForm({ method: "card" }); }} data-testid={`store-order-request-payment-${order.id}`}>
                                  {t("Request payment", "Solicitar pago")}
                                </Button>
                              )}
                              {nextStatus && (
                                <Button size="sm" className="text-xs" onClick={() => updateStoreOrderStatus(order.id, nextStatus)} disabled={storeUpdating[order.id]} data-testid={`store-order-next-${order.id}`}>
                                  {storeUpdating[order.id] ? t("Updating...", "Actualizando...") : `${t("Move to", "Mover a")} ${getStoreStatusDisplay(nextStatus)}`}
                                </Button>
                              )}
                              <Button variant="outline" size="sm" className="text-xs" onClick={() => handlePrintStoreOrder(order)} data-testid={`store-order-print-${order.id}`}>
                                {t("Print", "Imprimir")}
                              </Button>
                              {order.payment_status === "paid" && (
                                <Button variant="destructive" size="sm" className="text-xs" onClick={() => refundStoreOrder(order.id)} disabled={storeUpdating[order.id]} data-testid={`store-order-refund-${order.id}`}>
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

              {/* Mobile cards */}
              <div className="md:hidden divide-y divide-slate-100">
                {storeOrders.map((order) => {
                  const nextStatus = getNextStoreStatus(order.status);
                  return (
                    <div key={order.id || Math.random()} className="p-4 space-y-3" data-testid={`store-order-row-${order.id || 'unknown'}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-mono text-xs font-semibold text-slate-900">{safeString(order.order_number)}</p>
                          <p className="text-sm text-slate-700 mt-0.5">{safeString(order.customer_name, t("Customer", "Cliente"))}</p>
                          <p className="text-xs text-slate-500">{safeString(order.customer_email)}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-sm" data-testid={`store-order-total-${order.id}`}>{formatCurrency(order.total)}</p>
                          <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-xs inline-block mt-1" data-testid={`store-order-status-${order.id}`}>
                            {getStoreStatusDisplay(order.status)}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <span data-testid={`store-order-payment-${order.id}`}>{getPaymentStatusLabel(order.payment_status)}</span>
                        <span>·</span>
                        <span>{safeString(order.payment_method, "-")}</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {(order.payment_status || "pending") !== "paid" && (order.payment_status || "").toLowerCase() !== "refunded" && (
                          <Button variant="outline" size="sm" className="text-xs flex-1" onClick={() => { setStorePaymentOrder(order); setStorePaymentForm({ method: "card" }); }} data-testid={`store-order-request-payment-${order.id}`}>
                            {t("Request payment", "Solicitar pago")}
                          </Button>
                        )}
                        {nextStatus && (
                          <Button size="sm" className="text-xs flex-1" onClick={() => updateStoreOrderStatus(order.id, nextStatus)} disabled={storeUpdating[order.id]} data-testid={`store-order-next-${order.id}`}>
                            {storeUpdating[order.id] ? "..." : `→ ${getStoreStatusDisplay(nextStatus)}`}
                          </Button>
                        )}
                        <Button variant="outline" size="sm" className="text-xs" onClick={() => handlePrintStoreOrder(order)} data-testid={`store-order-print-${order.id}`}>
                          {t("Print", "Imprimir")}
                        </Button>
                        {order.payment_status === "paid" && (
                          <Button variant="destructive" size="sm" className="text-xs" onClick={() => refundStoreOrder(order.id)} disabled={storeUpdating[order.id]} data-testid={`store-order-refund-${order.id}`}>
                            {storeUpdating[order.id] ? "..." : t("Refund", "Reembolsar")}
                          </Button>
                        )}
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
      <Dialog open={storePosOpen} onOpenChange={(open) => !open ? resetStorePos() : setStorePosOpen(true)}>
        <DialogContent className="w-[95vw] max-w-5xl bg-white max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base sm:text-lg">{t("New Store Sale", "Nueva venta en tienda")}</DialogTitle>
            <DialogDescription className="text-xs sm:text-sm">
              {t("Select products and collect payment quickly.", "Selecciona productos y cobra rápidamente.")}
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6" data-testid="store-pos-modal">
            {/* Products */}
            <div className="space-y-3">
              <Input
                placeholder={t("Search products", "Buscar productos")}
                value={storeSearch}
                onChange={(e) => setStoreSearch(e.target.value)}
                className="text-sm"
                data-testid="store-pos-search"
              />
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="max-h-[300px] sm:max-h-[380px] overflow-y-auto divide-y divide-slate-100" data-testid="store-pos-products">
                  {storeCartLoading ? (
                    <div className="p-6 text-center text-slate-500 text-sm">{t("Loading products...", "Cargando productos...")}</div>
                  ) : filteredStoreProducts.length === 0 ? (
                    <div className="p-6 text-center text-slate-500 text-sm">{t("No products found", "No hay productos")}</div>
                  ) : (
                    filteredStoreProducts.map((product) => {
                      const qty = getCartItemQuantity(product.id);
                      const disabled = product.stock <= 0 || !product.is_active;
                      return (
                        <div key={product.id || Math.random()} className="p-3 sm:p-4 flex items-center justify-between gap-3" data-testid={`store-pos-product-${product.id}`}>
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold text-slate-900 text-sm truncate">{safeString(product.name)}</p>
                            <p className="text-xs text-slate-500">${Number(product.price).toFixed(2)} · {t("Stock", "Stock")}: {product.stock}</p>
                            {disabled && <p className="text-xs text-red-500">{t("Unavailable", "No disponible")}</p>}
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <Button size="sm" variant="outline" className="h-7 w-7 p-0 text-sm" onClick={() => updateStoreCartItem(product, qty - 1)} disabled={qty === 0} data-testid={`store-pos-minus-${product.id}`}>-</Button>
                            <span className="w-5 text-center text-sm font-medium" data-testid={`store-pos-qty-${product.id}`}>{qty}</span>
                            <Button size="sm" className="h-7 w-7 p-0 text-sm" onClick={() => updateStoreCartItem(product, qty + 1)} disabled={disabled} data-testid={`store-pos-plus-${product.id}`}>+</Button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            {/* Checkout */}
            <div className="space-y-3">
              <div className="border border-slate-200 rounded-xl p-3 sm:p-4 bg-white" data-testid="store-pos-cart">
                <h4 className="font-semibold text-slate-900 mb-2 text-sm">{t("Cart", "Carrito")}</h4>
                {storeCart?.items?.length ? (
                  <div className="space-y-1.5">
                    {storeCart.items.map((item) => (
                      <div key={item.product_id || Math.random()} className="flex items-center justify-between text-xs sm:text-sm">
                        <span className="truncate mr-2">{safeString(item.name || item.product_name)}</span>
                        <span className="shrink-0">{item.quantity} × ${Number(item.price || 0).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs sm:text-sm text-slate-500">{t("No items yet", "Sin productos")}</p>
                )}
              </div>

              <div className="border border-slate-200 rounded-xl p-3 sm:p-4 bg-white space-y-2.5" data-testid="store-pos-customer">
                <div className="grid grid-cols-2 gap-2 sm:gap-3">
                  <div>
                    <Label className="text-xs">{t("Name", "Nombre")} *</Label>
                    <Input value={storeCheckoutForm.name} onChange={(e) => setStoreCheckoutForm({ ...storeCheckoutForm, name: e.target.value })} className="mt-1 text-sm h-8" data-testid="store-pos-name" />
                  </div>
                  <div>
                    <Label className="text-xs">{t("Phone", "Teléfono")} *</Label>
                    <Input value={storeCheckoutForm.phone} onChange={(e) => setStoreCheckoutForm({ ...storeCheckoutForm, phone: e.target.value })} className="mt-1 text-sm h-8" data-testid="store-pos-phone" />
                  </div>
                </div>
                <div>
                  <Label className="text-xs">{t("Email", "Email")} *</Label>
                  <Input type="email" value={storeCheckoutForm.email} onChange={(e) => setStoreCheckoutForm({ ...storeCheckoutForm, email: e.target.value })} className="mt-1 text-sm h-8" data-testid="store-pos-email" />
                </div>
                <div className="grid grid-cols-2 gap-2 sm:gap-3">
                  <div>
                    <Label className="text-xs">{t("Fulfillment", "Entrega")}</Label>
                    <select className="w-full mt-1 border border-slate-200 rounded-lg px-2 py-1.5 text-xs sm:text-sm" value={storeCheckoutForm.fulfillment_type} onChange={(e) => setStoreCheckoutForm({ ...storeCheckoutForm, fulfillment_type: e.target.value })} data-testid="store-pos-fulfillment">
                      <option value="pickup">{t("Pickup", "Recoger en tienda")}</option>
                      <option value="delivery">{t("Delivery", "Entrega a domicilio")}</option>
                    </select>
                  </div>
                  <div>
                    <Label className="text-xs">{t("Payment method", "Método de pago")}</Label>
                    <select className="w-full mt-1 border border-slate-200 rounded-lg px-2 py-1.5 text-xs sm:text-sm" value={storeCheckoutForm.payment_method} onChange={(e) => setStoreCheckoutForm({ ...storeCheckoutForm, payment_method: e.target.value })} data-testid="store-pos-payment-method">
                      <option value="card">{t("Card (Stripe)", "Tarjeta (Stripe)")}</option>
                      <option value="cash">{t("Cash", "Efectivo")}</option>
                      <option value="transfer">{t("Transfer", "Transferencia")}</option>
                      <option value="other">{t("Other", "Otro")}</option>
                    </select>
                  </div>
                </div>
                {storeCheckoutForm.fulfillment_type === "delivery" && (
                  <div>
                    <Label className="text-xs">{t("Delivery address", "Dirección de entrega")} *</Label>
                    <Input value={storeCheckoutForm.address} onChange={(e) => setStoreCheckoutForm({ ...storeCheckoutForm, address: e.target.value })} className="mt-1 text-sm h-8" data-testid="store-pos-address" />
                    <p className="text-xs text-slate-500 mt-1" data-testid="store-pos-address-format-help">
                      {t("Format: street + number, city, state, ZIP", "Formato: calle y número, ciudad, estado, ZIP")}
                    </p>
                  </div>
                )}
                <div>
                  <Label className="text-xs">{t("Notes", "Notas")}</Label>
                  <Input value={storeCheckoutForm.notes} onChange={(e) => setStoreCheckoutForm({ ...storeCheckoutForm, notes: e.target.value })} className="mt-1 text-sm h-8" data-testid="store-pos-notes" />
                </div>
              </div>

              <div className="border border-slate-200 rounded-xl p-3 sm:p-4 bg-white space-y-2" data-testid="store-pos-summary">
                <div className="flex items-center justify-between text-xs sm:text-sm">
                  <span>{t("Subtotal", "Subtotal")}</span>
                  <span>${storeCartSubtotal.toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between text-xs sm:text-sm">
                  <span>{t("Shipping", "Envío")}</span>
                  <span>
                    {storeCheckoutForm.fulfillment_type === "delivery"
                      ? storeShippingQuote.distance_km
                        ? `$${storeShippingFee.toFixed(2)} (${storeShippingQuote.distance_km} km)`
                        : t("Enter full address", "Ingresa dirección completa")
                      : t("Pickup", "Recoger")}
                  </span>
                </div>
                {storeShippingQuote.zone_name && storeCheckoutForm.fulfillment_type === "delivery" && (
                  <p className="text-xs text-slate-500" data-testid="store-pos-zone">{safeString(storeShippingQuote.zone_name)}</p>
                )}
                {storeShippingError && storeCheckoutForm.fulfillment_type === "delivery" && (
                  <p className="text-xs text-red-600" data-testid="store-pos-shipping-error">{storeShippingError}</p>
                )}
                <div className="flex items-center justify-between font-semibold text-sm sm:text-base pt-1 border-t border-slate-100">
                  <span>{t("Total", "Total")}</span>
                  <span>${storeOrderTotal.toFixed(2)}</span>
                </div>
                <Button className="w-full bg-sky-600 hover:bg-sky-700 text-sm" onClick={handleStoreCheckout} disabled={storeCheckoutLoading} data-testid="store-pos-submit">
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

      {/* Store Payment Modal */}
      <Dialog open={!!storePaymentOrder} onOpenChange={(open) => !open && setStorePaymentOrder(null)}>
        <DialogContent className="w-[95vw] max-w-lg bg-white">
          <DialogHeader>
            <DialogTitle className="text-base sm:text-lg">{t("Request payment", "Solicitar pago")}</DialogTitle>
            <DialogDescription className="text-xs sm:text-sm">{safeString(storePaymentOrder?.order_number)}</DialogDescription>
          </DialogHeader>
          {storePaymentOrder && (
            <div className="space-y-4" data-testid="store-payment-modal">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600">{t("Total", "Total")}</span>
                <span className="text-lg font-semibold">{formatCurrency(storePaymentOrder.total)}</span>
              </div>
              <div>
                <Label className="text-xs sm:text-sm">{t("Payment method", "Método de pago")}</Label>
                <select className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2 text-sm" value={storePaymentForm.method} onChange={(e) => setStorePaymentForm({ method: e.target.value })} data-testid="store-payment-method">
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
              <Button className="w-full bg-emerald-600 hover:bg-emerald-700 text-sm" onClick={handleStorePayment} disabled={storeProcessingPayment} data-testid="store-payment-submit">
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

      {/* Order Detail Modal */}
      <OrderDetailDialog
        order={selectedOrder}
        onClose={() => setSelectedOrder(null)}
        onRefresh={loadDashboard}
      />

      {/* Urgent Tickets */}
      {dashboard?.urgent_tickets?.length > 0 && (
        <div className="bg-white rounded-xl border border-red-200 overflow-hidden">
          <div className="px-4 sm:px-6 py-4 border-b border-red-100 bg-red-50">
            <h2 className="font-semibold text-red-900 flex items-center gap-2 text-sm sm:text-base">
              <AlertTriangle className="h-4 w-4 sm:h-5 sm:w-5 text-red-600 shrink-0" />
              {t("Urgent Tickets", "Tickets Urgentes")} ({dashboard.urgent_tickets.length})
            </h2>
          </div>
          <div className="divide-y divide-red-100">
            {dashboard.urgent_tickets.map((ticket) => (
              <div key={ticket.ticket_id || Math.random()} className="p-3 sm:p-4" data-testid={`ticket-${ticket.ticket_id}`}>
                <div className="flex items-start justify-between gap-3 sm:gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-mono font-semibold text-slate-900 text-xs sm:text-sm">{safeString(ticket.ticket_id)}</span>
                      <span className="px-1.5 py-0.5 text-xs font-medium rounded-full bg-red-100 text-red-800">{t("URGENT", "URGENTE")}</span>
                    </div>
                    <p className="font-medium text-slate-900 mt-1 text-sm">{safeString(ticket.subject)}</p>
                    <p className="text-xs sm:text-sm text-slate-600 mt-1 line-clamp-2">{safeString(ticket.description)}</p>
                    <p className="text-xs text-red-600 mt-1.5">
                      {t("SLA:", "SLA:")} {new Date(ticket.sla_deadline).toLocaleString()}
                    </p>
                  </div>
                  {ticket.customer_phone && (
                    <a href={`tel:${safeString(ticket.customer_phone)}`} className="flex items-center gap-1 text-xs sm:text-sm text-sky-600 hover:text-sky-700 shrink-0">
                      <Phone className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                      <span className="hidden sm:inline">{t("Call", "Llamar")}</span>
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