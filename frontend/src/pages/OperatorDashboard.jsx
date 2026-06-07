import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import axios from "axios";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "../components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/ui/tabs";
import {
  Truck,
  Package,
  AlertTriangle,
  CheckCircle,
  RefreshCw,
  Phone,
  ChevronRight,
  Zap,
  Bot,
  DollarSign,
  Printer,
  MapPin,
  Search,
  CreditCard,
  Mail,
  X,
  ShoppingBag,
  Map as MapIcon,
  ClipboardList,
  FileDown,
  Wifi,
  WifiOff,
  ArrowUpDown,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { createNotificationsSocket } from "../utils/notificationsSocket";
import DeliveryZonesManager from "../components/DeliveryZonesManager";
import OrderDetailDialog from "../components/operator-dashboard/OrderDetailDialog";
import MapFilters from "../components/MapFilters";
import {
  ORDER_STATUSES,
  STORE_STATUS_FLOW,
  getNextStoreStatus,
  safeString,
  formatApiError,
  formatCurrency,
  formatOrderNumber,
  isWashFoldService,
  getNextStatus,
  calculateServiceCharge,
  getRate,
  dedupeOrders,
} from "../components/operator-dashboard/utils";
import PickupImageModal from "../components/PickupImageModal";
import ConfirmDialog from "../components/ConfirmDialog";
import { useLocale } from "../context/LocaleContext";
import { formatDatePT, formatTimePT, formatShortDatePT } from "../utils/dateUtils";
import { useOperatorNotifications } from "../hooks/useOperatorNotifications";
import html2pdf from "html2pdf.js";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Fix Leaflet default icons
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
});

const API_URL = process.env.REACT_APP_BACKEND_URL;
const STORE_COORDINATES = { lat: 34.283, lng: -119.293 };

const cpCoordinates = {
  93001: { lat: 34.283, lng: -119.293 },
  93003: { lat: 34.254, lng: -119.215 },
  93004: { lat: 34.302, lng: -119.186 },
  93030: { lat: 34.187, lng: -119.179 },
  93036: { lat: 34.237, lng: -119.181 },
  93035: { lat: 34.174, lng: -119.222 },
  93010: { lat: 34.225, lng: -119.082 },
};

const INITIAL_CHECKOUT_FORM = {
  name: "",
  email: "",
  phone: "",
  address: "",
  apt: "",
  instructions: "",
  notes: "",
  preferred_contact: "sms",
  payment_method: "cash",
  fulfillment_type: "pickup",
};

// Tarifas por método de pago
const PAYMENT_METHOD_FEES = {
  card: 0.035,
  cash: 0,
  transfer: 0.02,
  other: 0,
};

const MIN_CARD_FEE = 0.5;
const MAX_CARD_FEE = 15.0;

const extractCP = (address) => {
  if (!address) return null;
  const match = address.match(/\b(\d{5})\b/);
  return match ? match[1] : null;
};

const getCoordinatesFromAddress = (address) => {
  const cp = extractCP(address);
  if (!cp) return null;
  return cpCoordinates[cp] || null;
};

function getDistanceInMiles(lat1, lng1, lat2, lng2) {
  const R = 3959;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function calculateDeliveryFee(distanceMiles) {
  if (distanceMiles <= 3) return 0;
  const extraMiles = distanceMiles - 3;
  const fee = extraMiles * 1.5;
  return Math.min(Math.round(fee * 100) / 100, 25.0);
}

function getMarkerColor(status) {
  switch ((status || "").toUpperCase()) {
    case "NEW":
    case "CONFIRMED":
    case "PICKUP_SCHEDULED":
      return "#3b82f6";
    case "PICKED_UP":
    case "PROCESSING":
      return "#f97316";
    case "READY":
    case "OUT_FOR_DELIVERY":
    case "DELIVERED":
      return "#22c55e";
    case "CANCELLED":
      return "#ef4444";
    default:
      return "#6b7280";
  }
}

const isValidEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
const getToken = () => localStorage.getItem("token") || sessionStorage.getItem("token");
const isValidPhone = (v) => /^\+?[\d\s\-().]{7,}$/.test(v.trim());

const useMobile = () => {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  return isMobile;
};

const calculatePriceWithPaymentMethod = (baseAmount, paymentMethod) => {
  const feePercentage = PAYMENT_METHOD_FEES[paymentMethod] || 0;
  if (feePercentage === 0)
    return { original: baseAmount, fee: 0, total: baseAmount, feePercentage: 0 };
  let feeAmount = baseAmount * feePercentage;
  if (paymentMethod === "card") {
    feeAmount = Math.min(Math.max(feeAmount, MIN_CARD_FEE), MAX_CARD_FEE);
  }
  return {
    original: baseAmount,
    fee: feeAmount,
    total: baseAmount + feeAmount,
    feePercentage: feePercentage * 100,
  };
};

const CardHeader = ({
  icon,
  title,
  count,
  bgClass = "bg-gradient-to-r from-slate-50 to-slate-100/50",
  testId,
}) => (
  <div className={`px-5 py-4 border-b border-slate-200/80 ${bgClass}`}>
    <h2 className="font-semibold text-slate-800 flex items-center gap-2 text-base">
      <span className="shrink-0">{icon}</span>
      <span className="flex-1 truncate">{title}</span>
      <span
        className="shrink-0 text-xs font-semibold text-indigo-600 bg-indigo-50 border border-indigo-200/50 rounded-full px-2.5 py-1 shadow-sm"
        data-testid={testId}
      >
        {count}
      </span>
    </h2>
  </div>
);

const EmptyState = ({ icon, text, testId }) => (
  <div className="py-12 text-center text-slate-400" data-testid={testId}>
    <div className="mb-4 flex justify-center">
      <div className="w-20 h-20 rounded-2xl bg-slate-100 flex items-center justify-center border border-slate-200">
        {icon}
      </div>
    </div>
    <p className="text-sm font-medium">{text}</p>
  </div>
);

const StatCard = ({ icon, bg, count, label, testId, highlight }) => (
  <div
    className={`bg-white rounded-2xl border p-5 transition-all hover:shadow-lg hover:-translate-y-1 shadow-md ${
      highlight ? "border-red-200 bg-red-50/30" : "border-slate-200/50"
    }`}
  >
    <div className="flex items-center gap-4">
      <div
        className={`h-14 w-14 rounded-2xl ${bg} flex items-center justify-center shrink-0 shadow-inner`}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <p
          className="text-2xl font-bold text-slate-900 leading-none truncate"
          data-testid={`operator-stat-${testId}-count`}
        >
          {count}
        </p>
        <p
          className="text-xs font-semibold text-slate-500 mt-1 truncate uppercase tracking-wide"
          data-testid={`operator-stat-${testId}-label`}
        >
          {label}
        </p>
      </div>
    </div>
  </div>
);

const OrderRow = ({
  order,
  statusInfo,
  nextStatus,
  nextStatusInfo,
  updating,
  onRowClick,
  onAdvance,
  onPrint,
  onPDF,
  advanceBtnClass = "bg-slate-900 hover:bg-slate-800",
  showPrint = false,
  t,
}) => (
  <div
    className="p-4 bg-white border-l-4 border-l-transparent hover:border-l-indigo-500 border rounded-xl hover:shadow-lg transition-all duration-200 cursor-pointer group"
    role="button"
    onClick={() => onRowClick(order)}
    data-testid={`order-row-${order.order_id || "unknown"}`}
  >
    <div className="flex flex-col sm:flex-row sm:items-start gap-4">
      <div className="flex-1 min-w-0 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-slate-800 text-sm font-mono tracking-wide">
            {formatOrderNumber(order)}
          </span>
          <span
            className={`px-2.5 py-0.5 text-xs font-medium rounded-full shrink-0 border ${statusInfo.color} shadow-sm`}
          >
            {statusInfo.label}
          </span>
          <span className="text-xs text-slate-400 truncate font-medium">
            {order.pickup_time_window || order.pickup_date || t("No time", "Sin hora")}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
          <span className="font-semibold truncate">
            {safeString(order.customer_name, t("Customer", "Cliente"))}
          </span>
          <span className="text-slate-400 text-xs truncate">
            {order.pickup_address || order.delivery_address}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2 mt-1">
          {order.service_type === "airbnb_host" && (
            <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-orange-600 bg-orange-50/80 px-2 py-0.5 rounded-full border border-orange-200">
              🏠 Airbnb
            </span>
          )}
          {order.service_type === "commercial" && (
            <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-indigo-600 bg-indigo-50/80 px-2 py-0.5 rounded-full border border-indigo-200">
              🏢 B2B
            </span>
          )}
          {(order.is_recurring || (order.recurrence && order.recurrence !== "once")) && (
            <span
              className="inline-flex items-center gap-1 text-[10px] font-semibold text-violet-700 bg-violet-50 px-2 py-0.5 rounded-full border border-violet-200"
              title={
                order.recurrence_end_date
                  ? t(`Recurring (${order.recurrence}). Ends ${order.recurrence_end_date}`,
                      `Recurrente (${order.recurrence}). Termina ${order.recurrence_end_date}`)
                  : t(`Recurring (${order.recurrence || "weekly"})`, `Recurrente (${order.recurrence || "semanal"})`)
              }
              data-testid={`recurring-badge-${order.order_id}`}
            >
              🔄 {order.recurrence === "weekly" ? t("Weekly","Semanal")
                  : order.recurrence === "biweekly" ? t("Biweekly","Quincenal")
                  : order.recurrence === "twice_week" ? t("2×/wk","2×/sem")
                  : order.recurrence === "monthly" ? t("Monthly","Mensual")
                  : t("Recurring","Recurrente")}
              {order.recurrence_end_date && (
                <span className="text-violet-500 font-normal ml-0.5">
                  → {order.recurrence_end_date.slice(5)}
                </span>
              )}
            </span>
          )}
          {extractCP(order.pickup_address || order.delivery_address) && (
            <span className="inline-flex items-center gap-0.5 px-2 py-0.5 bg-slate-100 text-slate-500 rounded-full text-[10px] font-mono font-medium">
              CP {extractCP(order.pickup_address || order.delivery_address)}
            </span>
          )}
        </div>
      </div>
      <div className="flex flex-row gap-2 sm:justify-end flex-wrap items-start shrink-0">
        {nextStatus && (
          <Button
            size="sm"
            className={`${advanceBtnClass} text-white text-xs h-8 px-3 rounded-lg shadow-sm hover:shadow-md transition-all`}
            onClick={(e) => {
              e.stopPropagation();
              onAdvance(order.order_id, nextStatus);
            }}
            disabled={updating[order.order_id]}
            data-testid={`advance-btn-${order.order_id}`}
          >
            {updating[order.order_id] ? (
              <RefreshCw className="h-3 w-3 animate-spin" />
            ) : (
              <span className="flex items-center gap-1 font-medium">
                {nextStatusInfo?.label} <ChevronRight className="h-3 w-3" />
              </span>
            )}
          </Button>
        )}
        {showPrint && (
          <div className="flex gap-1">
            <Button
              variant="outline"
              size="sm"
              className="h-8 w-8 p-0 rounded-lg text-slate-400 hover:text-sky-600 hover:border-sky-300 hover:bg-sky-50 shadow-sm"
              onClick={(e) => {
                e.stopPropagation();
                onPrint(order);
              }}
              data-testid={`print-btn-${order.order_id}`}
            >
              <Printer className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 w-8 p-0 rounded-lg text-slate-400 hover:text-emerald-600 hover:border-emerald-300 hover:bg-emerald-50 shadow-sm"
              onClick={(e) => {
                e.stopPropagation();
                onPDF(order);
              }}
              data-testid={`pdf-btn-${order.order_id}`}
            >
              <FileDown className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  </div>
);

const MobileServiceSwitch = ({ onSwitch, currentService }) => {
  const isMobile = useMobile();
  if (!isMobile) return null;
  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2">
      <button
        onClick={onSwitch}
        className="group relative bg-slate-900 text-white rounded-full p-3 shadow-xl hover:bg-slate-800 active:scale-90 transition-all border border-slate-800/50"
      >
        <ArrowUpDown className="h-5 w-5" />
        <div className="absolute -top-12 left-1/2 transform -translate-x-1/2 bg-slate-900 text-white text-xs py-1 px-3 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none shadow-lg font-medium">
          Cambiar a {currentService === "pickup" ? "Wash & Fold" : "Pickup & Delivery"}
        </div>
      </button>
      <div className="bg-white rounded-full px-3 py-1 shadow-md text-xs font-semibold text-slate-700 border border-slate-200 flex items-center gap-1 mx-auto">
        {currentService === "pickup" ? (
          <Truck className="h-3 w-3 text-indigo-500" />
        ) : (
          <Package className="h-3 w-3 text-purple-500" />
        )}
      </div>
    </div>
  );
};

export default function OperatorDashboard() {
  const { t } = useLocale();
  const isMobile = useMobile();

  // Core state
  const [confirmDialog, setConfirmDialog] = useState(null);
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState({});
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [activeTab, setActiveTab] = useState("orders");
  const [serviceSubTab, setServiceSubTab] = useState("pickup");
  const autoRefreshRef = useRef(true);
  const dashboardLoadingRef = useRef(false);
  const storeLoadingRef = useRef(false);

  // Realtime
  const [realtimeStatus, setRealtimeStatus] = useState("offline");

  // Orders
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [pickupImageModal, setPickupImageModal] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [orderFilters, setOrderFilters] = useState({});

  // Map
  const [mapFilters, setMapFilters] = useState({});
  const [filteredMapOrders, setFilteredMapOrders] = useState(null);
  const [mapKey] = useState(() => Math.random().toString(36).slice(2));

  // Store orders
  const [storeOrders, setStoreOrders] = useState([]);
  const [storeOrdersLoading, setStoreOrdersLoading] = useState(false);
  const [storeUpdating, setStoreUpdating] = useState({});
  const [storeOrderSearch, setStoreOrderSearch] = useState("");
  const [storePaymentFilter, setStorePaymentFilter] = useState("all");

  // Store POS
  const [storePosOpen, setStorePosOpen] = useState(false);
  const [storeCart, setStoreCart] = useState(null);
  const [storeCartLoading, setStoreCartLoading] = useState(false);
  const [storeProducts, setStoreProducts] = useState([]);
  const [storeSearch, setStoreSearch] = useState("");
  const [storeCheckoutForm, setStoreCheckoutForm] = useState(INITIAL_CHECKOUT_FORM);
  const [storeShippingQuote, setStoreShippingQuote] = useState({
    distance_km: null,
    fee: 0,
    zone_name: null,
  });
  const [storeShippingError, setStoreShippingError] = useState("");
  const [storeCheckoutLoading, setStoreCheckoutLoading] = useState(false);
  const [storeLinkMode, setStoreLinkMode] = useState(null);
  const [storeLinkContact, setStoreLinkContact] = useState("");

  // Store payment modal
  const [storePaymentOrder, setStorePaymentOrder] = useState(null);
  const [storePaymentForm, setStorePaymentForm] = useState({ method: "card" });
  const [storeProcessingPayment, setStoreProcessingPayment] = useState(false);

  // AI
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiReply, setAiReply] = useState("");
  const [aiResults, setAiResults] = useState([]);
  const [aiLoading, setAiLoading] = useState(false);

  useOperatorNotifications(true);

  useEffect(() => {
    autoRefreshRef.current = autoRefresh;
  }, [autoRefresh]);

  const handleSwitchService = useCallback(() => {
    setServiceSubTab((prev) => (prev === "pickup" ? "wash" : "pickup"));
  }, []);

  // ─── Status helpers ───────────────────────────────────────────────────────

  const getStatusLabel = useCallback(
    (status, serviceType) => {
      const s = (status || "").toString().toUpperCase();
      if (isWashFoldService(serviceType)) {
        return (
          {
            NEW: t("New", "Nueva"),
            CONFIRMED: t("Confirmed", "Confirmada"),
            PROCESSING: t("Processing", "Procesando"),
            READY: t("Ready for Pickup", "Lista para recoger"),
            COMPLETED: t("Completed", "Completada"),
            CANCELLED: t("Cancelled", "Cancelada"),
          }[s] || safeString(status)
        );
      }
      return (
        {
          NEW: t("New", "Nueva"),
          CONFIRMED: t("Confirmed", "Confirmada"),
          PICKUP_SCHEDULED: t("Pickup Scheduled", "Pickup programado"),
          PICKED_UP: t("Picked Up", "Recolectada"),
          PROCESSING: t("In Process", "En proceso"),
          READY: t("Ready for Delivery", "Lista p/ entrega"),
          OUT_FOR_DELIVERY: t("Out for Delivery", "En camino"),
          DELIVERED: t("Delivered", "Entregada"),
          COMPLETED: t("Completed", "Completada"),
          CANCELLED: t("Cancelled", "Cancelada"),
        }[s] || safeString(status)
      );
    },
    [t]
  );

  const getStatusInfo = useCallback(
    (status, serviceType) => {
      const s = (status || "").toUpperCase();
      const found = ORDER_STATUSES.find((st) => st.value === s) || ORDER_STATUSES[0];
      return { ...found, label: getStatusLabel(found.value, serviceType) };
    },
    [getStatusLabel]
  );

  const getStoreStatusDisplay = useCallback(
    (status) => {
      const n = (status || "pending").toLowerCase();
      return (
        {
          pending: t("Pending", "Pendiente"),
          confirmed: t("Confirmed", "Confirmado"),
          processing: t("Processing", "Procesando"),
          shipped: t("Shipped", "Enviado"),
          delivered: t("Delivered", "Entregado"),
          cancelled: t("Cancelled", "Cancelado"),
        }[n] || safeString(status)
      );
    },
    [t]
  );

  const getPaymentStatusLabel = useCallback(
    (status) => {
      if (!status) return t("Pending", "Pendiente");
      const n = status.toString().toLowerCase();
      if (n === "paid") return t("Paid", "Pagado");
      if (n === "refunded") return t("Refunded", "Reembolsado");
      if (n === "failed") return t("Failed", "Fallido");
      return t("Pending", "Pendiente");
    },
    [t]
  );

  // ─── Data loading ─────────────────────────────────────────────────────────

  const loadDashboard = useCallback(async () => {
    if (dashboardLoadingRef.current) return;
    if (document.visibilityState !== "visible" && autoRefreshRef.current) return;
    dashboardLoadingRef.current = true;
    try {
      const token = getToken();
      const res = await fetch(`${API_URL}/api/automation/operator-dashboard`, {
        headers: {
          "Content-Type": "application/json",
          ...(token && { Authorization: `Bearer ${token}` }),
        },
      });
      if (res.status === 401) {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        window.location.href = "/login";
        return;
      }
      if (res.ok) {
        setDashboard(await res.json());
        setLastRefresh(new Date());
      }
    } catch {
      toast.error(t("Error loading dashboard", "Error al cargar dashboard"));
    } finally {
      dashboardLoadingRef.current = false;
      setLoading(false);
    }
  }, [t]);

  const loadStoreOrders = useCallback(async () => {
    if (storeLoadingRef.current) return;
    storeLoadingRef.current = true;
    setStoreOrdersLoading(true);
    try {
      const token = getToken();
      const res = await fetch(`${API_URL}/api/store/orders`, {
        headers: {
          "Content-Type": "application/json",
          ...(token && { Authorization: `Bearer ${token}` }),
        },
      });
      if (res.ok) {
        setStoreOrders((await res.json()) || []);
      } else if (res.status === 401) {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        window.location.href = "/login";
      } else {
        console.error("Store orders error:", res.status);
        setStoreOrders([]);
      }
    } catch (err) {
      console.error("Error loading store orders:", err);
      setStoreOrders([]);
    } finally {
      storeLoadingRef.current = false;
      setStoreOrdersLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
    loadStoreOrders();
    const interval = setInterval(() => {
      if (autoRefreshRef.current) {
        loadDashboard();
        loadStoreOrders();
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [loadDashboard, loadStoreOrders]);

  const loadFilteredMapOrders = useCallback(
    async (filters) => {
      setMapFilters(filters);
      if (!filters.date && !filters.time_window) {
        setFilteredMapOrders(null);
        return;
      }
      try {
        const params = new URLSearchParams();
        if (filters.date) params.set("date", filters.date);
        if (filters.time_window) params.set("time_window", filters.time_window);
        const res = await fetch(`${API_URL}/api/logistics/orders?${params.toString()}`);
        if (res.ok) {
          const data = await res.json();
          setFilteredMapOrders(Array.isArray(data) ? data : data.orders || data);
        }
      } catch {
        toast.error(t("Error loading filtered orders", "Error cargando ordenes filtradas"));
      }
    },
    [t]
  );

  // ─── Socket ──────────────────────────────────────────────────────────────

  useEffect(() => {
    const socket = createNotificationsSocket();
    if (!socket) {
      setRealtimeStatus("disabled");
      return;
    }
    const fn = () => {
      if (!autoRefreshRef.current) return;
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

  // ─── Stripe return handling ───────────────────────────────────────────────

  const pollStoreCheckoutStatus = useCallback(
    async (sessionId, attempt = 0) => {
      const finish = async (notify) => {
        notify();
        try {
          await loadStoreOrders();
        } catch {}
      };
      const scheduleRetry = () => {
        setTimeout(() => pollStoreCheckoutStatus(sessionId, attempt + 1), 2000);
      };
      try {
        const res = await fetch(`${API_URL}/api/store/checkout/status/${sessionId}`);
        if (!res.ok) throw new Error("fetch_failed");
        const data = await res.json();
        const ps = (data?.payment_status || "").toLowerCase();
        const cs = (data?.status || "").toLowerCase();
        if (ps === "paid") {
          return finish(() =>
            toast.success(t("Store payment confirmed", "Pago de tienda confirmado"))
          );
        }
        if (cs === "expired") {
          return finish(() =>
            toast.error(t("Store payment expired", "Pago de tienda expirado"))
          );
        }
        if (attempt >= 8) {
          return finish(() =>
            toast.info(t("Store payment pending", "Pago de tienda pendiente"))
          );
        }
        scheduleRetry();
      } catch {
        if (attempt >= 8) {
          return finish(() =>
            toast.error(t("Unable to verify payment", "No se pudo verificar pago"))
          );
        }
        scheduleRetry();
      }
    },
    [loadStoreOrders, t]
  );

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("store_session_id");
    if (!id) return;
    pollStoreCheckoutStatus(id);
    window.history.replaceState({}, "", window.location.pathname);
  }, [pollStoreCheckoutStatus]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get("session_id");
    const orderId = params.get("order_id");
    const cancelled = params.get("status");
    if (!sessionId || !orderId) return;
    window.history.replaceState({}, "", window.location.pathname);
    if (cancelled === "cancelled") {
      toast.info(t("Payment cancelled", "Pago cancelado"));
      return;
    }
    (async () => {
      try {
        const tkn = getToken();
        const res = await fetch(`${API_URL}/api/stripe/confirm-payment`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(tkn ? { Authorization: `Bearer ${tkn}` } : {}),
          },
          body: JSON.stringify({ paymentIntentId: sessionId, orderId }),
        });
        if (res.ok) {
          toast.success(t("Payment confirmed successfully!", "Pago confirmado exitosamente!"));
          loadDashboard();
        } else {
          toast.error(t("Payment verification failed", "Fallo verificacion de pago"));
        }
      } catch {
        toast.error(t("Connection error", "Error de conexion"));
      }
    })();
  }, [t, loadDashboard]);

  // ─── Order status updates ─────────────────────────────────────────────────

  const executeOrderStatusUpdate = async (orderId, newStatus) => {
    setUpdating((prev) => ({ ...prev, [orderId]: true }));
    try {
      const res = await fetch(
        `${API_URL}/api/automation/orders/${orderId}/status?new_status=${newStatus.toLowerCase()}`,
        { method: "PUT" }
      );
      if (res.ok) {
        toast.success(t("Status updated", "Estado actualizado"));
        await loadDashboard();
      } else {
        const errorText = await res.text();
        toast.error(
          t("Error updating order", "Error al actualizar orden") + `: ${errorText}`
        );
      }
    } catch {
      toast.error(t("Connection error", "Error de conexion"));
    } finally {
      setUpdating((prev) => ({ ...prev, [orderId]: false }));
    }
  };

  const handleConfirmDialogAccept = async () => {
    const { orderId, newStatus } = confirmDialog;
    setConfirmDialog(null);
    await executeOrderStatusUpdate(orderId, newStatus);
  };

  const allServiceOrdersById = useMemo(() => {
    const map = new Map();
    [
      ...(dashboard?.todays_pickups || []),
      ...(dashboard?.ready_for_delivery || []),
      ...(dashboard?.wash_fold_dropoffs || []),
      ...(dashboard?.wash_fold_ready || []),
    ].forEach((o) => map.set(o.order_id, o));
    return map;
  }, [dashboard]);

  /**
   * updateOrderStatus — manejador principal del botón de avance de estado.
   *
   * REGLAS:
   * - "picked_up" / "delivered" → abre modal de foto (evidencia de recogida/entrega).
   * - "processing"              → avanza directamente el status SIN pedir lbs ni foto.
   *                               El peso y la foto de báscula se manejan dentro de
   *                               OrderDetailModal (botón "Set lbs").
   * - "confirmed"               → muestra diálogo de confirmación.
   * - Todo lo demás             → avanza directamente.
   */
const updateOrderStatus = useCallback(
  async (orderId, newStatus) => {
    const statusLower = newStatus.toLowerCase();

    let order = allServiceOrdersById.get(orderId);
    if (!order && dashboard) {
      const allOrders = [
        ...(dashboard.todays_pickups || []),
        ...(dashboard.ready_for_delivery || []),
        ...(dashboard.wash_fold_dropoffs || []),
        ...(dashboard.wash_fold_ready || []),
      ];
      order = allOrders.find((o) => o.order_id === orderId) || null;
    }

    // Foto de evidencia de recogida o entrega
    if (statusLower === "picked_up" || statusLower === "delivered") {
      setPickupImageModal({
        order: order || { order_id: orderId, order_number: orderId, customer_name: "" },
        pendingStatus: statusLower,
      });
      return;
    }

// ✅ VALIDACIÓN ESTRICTA: Para avanzar a "processing" DEBE tener peso O add-ons guardados en el backend
if (statusLower === "processing") {
  // Obtener la orden FRESCA del estado actual (que se actualiza con onRefresh)
  const currentOrderData = allServiceOrdersById.get(orderId);
  
  // Verificar si tiene peso real (del backend, no del input)
  const hasWeight = currentOrderData?.actual_lbs && Number(currentOrderData.actual_lbs) > 0;
  
  // Verificar si tiene add-ons guardados (del backend)
  const hasAddons = (currentOrderData?.addon_services || []).length > 0;
  
  // Si NO tiene peso Y NO tiene add-ons → bloquear y abrir modal
  if (!hasWeight && !hasAddons) {
    toast.warning(
      t("Debe ingresar el peso o agregar artículos (add-ons) antes de avanzar a Procesando",
        "Debe ingresar el peso o agregar artículos (add-ons) antes de avanzar a Procesando")
    );
    // Abrir el modal para que el operador ingrese peso o add-ons
    setSelectedOrder(currentOrderData || order);
    // NO avanzar — el operador debe guardar cambios en el modal primero
    return;
  }
  
  // Si llegó aquí, tiene peso O add-ons → permitir avanzar
}

    // Confirmación: mostrar diálogo antes de avanzar
    if (statusLower === "confirmed") {
      setConfirmDialog({
        orderId,
        newStatus,
        title: t("Confirm order", "Confirmar orden"),
        description: t(
          "Se notificará al cliente y al driver asignado.",
          "Se notificará al cliente y al driver asignado."
        ),
      });
      return;
    }

    // Todos los demás estados: avanzar directamente
    await executeOrderStatusUpdate(orderId, newStatus);
  },
  [allServiceOrdersById, dashboard, t]
);

  /**
   * handlePickupImageConfirm — se llama cuando el operador/driver confirma
   * la foto de recogida o entrega.  NO maneja el flujo de peso (eso ya
   * está en OrderDetailModal).
   */
  const handlePickupImageConfirm = async (imageResult) => {
    const { order, pendingStatus } = pickupImageModal;
    setPickupImageModal(null);
    const orderId = order.order_id;

    // "weight" ya no llega desde aquí — sólo "picked_up" o "delivered"
    const targetStatus = pendingStatus;

    if (imageResult && imageResult.id) {
      let linkEndpoint = null;
      if (targetStatus === "delivered") {
        linkEndpoint = `/api/driver/orders/${orderId}/delivery-image/link`;
      } else if (targetStatus === "picked_up") {
        linkEndpoint = `/api/driver/orders/${orderId}/pickup-image/link`;
      }

      if (linkEndpoint) {
        try {
          const res = await fetch(`${API_URL}${linkEndpoint}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ image_id: imageResult.id }),
          });
          if (!res.ok)
            console.warn(`Could not link ${targetStatus} image:`, await res.text());
        } catch (e) {
          console.warn(`Could not link ${targetStatus} image:`, e);
        }
      }
    }

    await executeOrderStatusUpdate(orderId, targetStatus);
  };

  const updateStoreOrderStatus = async (orderId, newStatus) => {
    setStoreUpdating((prev) => ({ ...prev, [orderId]: true }));
    try {
      const res = await fetch(`${API_URL}/api/store/orders/${orderId}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        toast.success(t("Status updated", "Estado actualizado"));
        await loadStoreOrders();
      } else {
        const e = await res.json();
        toast.error(
          formatApiError(e.detail, t("Error updating order", "Error al actualizar"))
        );
      }
    } catch {
      toast.error(t("Connection error", "Error de conexión"));
    } finally {
      setStoreUpdating((prev) => ({ ...prev, [orderId]: false }));
    }
  };

  const refundStoreOrder = async (orderId) => {
    setStoreUpdating((prev) => ({ ...prev, [orderId]: true }));
    try {
      const res = await fetch(`${API_URL}/api/store/orders/${orderId}/refund`, {
        method: "POST",
      });
      if (res.ok) {
        toast.success(t("Store order refunded", "Orden reembolsada"));
        await loadStoreOrders();
      } else {
        const e = await res.json();
        toast.error(
          formatApiError(e.detail, t("Refund failed", "Falló el reembolso"))
        );
      }
    } catch {
      toast.error(t("Connection error", "Error de conexión"));
    } finally {
      setStoreUpdating((prev) => ({ ...prev, [orderId]: false }));
    }
  };

  // ─── Print / PDF ──────────────────────────────────────────────────────────

  const handlePrintTicket = async (order) => {
    if (!order) return;
    const id = order.id || order.order_id;
    if (!id) {
      toast.error(t("Invalid order", "Orden inválida"));
      return;
    }
    try {
      const res = await axios.get(`${API_URL}/api/orders/${id}/qr.svg`, {
        responseType: "blob",
      });
      const url = window.URL.createObjectURL(res.data);
      const pw = window.open("");
      if (!pw) {
        toast.error(t("Allow pop-ups to print", "Permite ventanas emergentes para imprimir"));
        return;
      }
      pw.document.write(
        `<html><body style="margin:0;display:flex;align-items:center;justify-content:center;"><img src="${url}" style="max-width:100%;" onload="window.print();window.onafterprint=function(){window.close();};" /></body></html>`
      );
      pw.document.close();
    } catch {
      toast.error(t("Could not generate ticket", "No se pudo generar el ticket"));
    }
  };

  const handleDownloadPDF = async (order) => {
    if (!order) return;
    const id = order.id || order.order_id;
    if (!id) {
      toast.error(t("Invalid order", "Orden invalida"));
      return;
    }
    try {
      const tkn = getToken();
      const res = await fetch(`${API_URL}/api/orders/${id}/ticket`, {
        headers: tkn ? { Authorization: `Bearer ${tkn}` } : {},
      });
      if (!res.ok) throw new Error("fetch_failed");
      const htmlContent = await res.text();
      const container = document.createElement("div");
      container.innerHTML = htmlContent;
      container.style.width = "300px";
      document.body.appendChild(container);
      await html2pdf()
        .set({
          margin: 4,
          filename: `ticket-${formatOrderNumber(order)}.pdf`,
          html2canvas: { scale: 2, useCORS: true },
          jsPDF: { unit: "mm", format: [100, 250], orientation: "portrait" },
        })
        .from(container)
        .save();
      document.body.removeChild(container);
      toast.success(t("PDF downloaded", "PDF descargado"));
    } catch {
      toast.error(t("Could not generate PDF", "No se pudo generar el PDF"));
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
      .map(
        (i) => `
          <tr>
            <td style="padding:6px 8px;border-bottom:1px solid #eee;">${safeString(
              i.name || i.product_name || "Item"
            )}</td>
            <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:center;">${safeString(
              i.quantity
            )}</td>
            <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right;">$${(
              Number(i.price) || 0
            ).toFixed(2)}</td>
          </tr>
        `
      )
      .join("");
    pw.document.write(`
      <html><body style="font-family:Arial,sans-serif;padding:24px;">
        <h2>Store Order ${safeString(order.order_number)}</h2>
        <p>${safeString(order.customer_name)} &mdash; ${safeString(order.customer_email)}</p>
        <table style="width:100%;border-collapse:collapse;margin-top:16px;">
          <thead><tr style="background:#f5f5f5;">
            <th style="padding:8px;text-align:left;border-bottom:2px solid #ddd;">Item</th>
            <th style="padding:8px;text-align:center;border-bottom:2px solid #ddd;">Qty</th>
            <th style="padding:8px;text-align:right;border-bottom:2px solid #ddd;">Price</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <div style="margin-top:16px;text-align:right;">
          <p>Subtotal: $${(Number(order.subtotal) || 0).toFixed(2)}</p>
          <p>Shipping: $${(Number(order.shipping_fee) || 0).toFixed(2)}</p>
          <p style="font-size:18px;font-weight:bold;">Total: $${(
            Number(order.total) || 0
          ).toFixed(2)}</p>
        </div>
        <script>window.print();window.onafterprint=function(){window.close();};<\/script>
      </body></html>
    `);
    pw.document.close();
  };

  // ─── AI Assistant ─────────────────────────────────────────────────────────

  const handleAiRequest = async () => {
    if (!aiPrompt.trim()) return;
    setAiLoading(true);
    try {
      const res = await axios.post(`${API_URL}/api/ai/operations`, {
        message: aiPrompt,
        execute: true,
      });
      setAiReply(res.data?.reply || "");
      setAiResults(res.data?.results || []);
      (res.data?.results || []).forEach((r) => {
        if (r.type === "print_ticket")
          handlePrintTicket({ id: r.order_id, order_id: r.order_id });
      });
    } catch {
      toast.error(t("Could not execute AI task", "No se pudo ejecutar la tarea IA"));
    } finally {
      setAiLoading(false);
    }
  };

  // ─── Store POS ────────────────────────────────────────────────────────────

  const openStorePos = async () => {
    setStorePosOpen(true);
    setStoreCartLoading(true);
    try {
      const productsRes = await fetch(`${API_URL}/api/store/products`);

      let cartData = null;
      if (storeCart?.id) {
        const cartRes = await fetch(`${API_URL}/api/store/cart/${storeCart.id}`);
        if (cartRes.ok) {
          const d = await cartRes.json();
          if (d && Array.isArray(d.items)) cartData = d;
        }
        if (!cartData) {
          const newCartRes = await fetch(`${API_URL}/api/store/cart`, { method: "POST" });
          if (newCartRes.ok) {
            const d = await newCartRes.json();
            if (d && Array.isArray(d.items)) cartData = d;
          }
        }
      } else {
        const newCartRes = await fetch(`${API_URL}/api/store/cart`, { method: "POST" });
        if (newCartRes.ok) {
          const d = await newCartRes.json();
          if (d && Array.isArray(d.items)) cartData = d;
        }
      }

      if (cartData) setStoreCart(cartData);
      else toast.error(t("Error loading cart", "Error cargando carrito"));

      if (productsRes.ok) setStoreProducts((await productsRes.json()) || []);
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
    setStoreCheckoutForm(INITIAL_CHECKOUT_FORM);
    setStoreShippingQuote({ distance_km: null, fee: 0, zone_name: null });
    setStoreLinkMode(null);
    setStoreLinkContact("");
  };

  const getCartItemQuantity = (pid) =>
    storeCart?.items?.find((e) => e.product_id === pid)?.quantity || 0;

  const updateStoreCartItem = async (product, quantity) => {
    if (!storeCart) return;
    const currentQty = getCartItemQuantity(product.id);
    const ep = `${API_URL}/api/store/cart/${storeCart.id}/items/${product.id}`;
    try {
      let res;
      if (quantity <= 0) {
        if (currentQty === 0) return;
        res = await fetch(ep, { method: "DELETE" });
      } else if (currentQty === 0) {
        res = await fetch(`${API_URL}/api/store/cart/${storeCart.id}/items`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ product_id: product.id, quantity }),
        });
      } else {
        res = await fetch(`${ep}?quantity=${quantity}`, { method: "PUT" });
      }
      if (res && res.ok) {
        const d = await res.json();
        if (!d || !Array.isArray(d.items)) throw new Error("Invalid cart response");
        setStoreCart(d);
      } else if (res) {
        const e = await res.json().catch(() => ({}));
        toast.error(
          formatApiError(
            e.detail,
            t("Unable to update cart", "No se pudo actualizar el carrito")
          )
        );
      }
    } catch {
      toast.error(t("Connection error", "Error de conexión"));
    }
  };

  const storeOrderTotal = useMemo(() => {
    const subtotal = Number(storeCart?.total) || 0;
    const shipping =
      storeCheckoutForm.fulfillment_type === "delivery"
        ? Number(storeShippingQuote.fee) || 0
        : 0;
    const baseTotal = subtotal + shipping;
    const result = calculatePriceWithPaymentMethod(baseTotal, storeCheckoutForm.payment_method);
    return {
      base: baseTotal,
      fee: result.fee,
      total: result.total,
      feePercentage: result.feePercentage,
      paymentMethod: storeCheckoutForm.payment_method,
    };
  }, [
    storeCart?.total,
    storeCheckoutForm.fulfillment_type,
    storeShippingQuote.fee,
    storeCheckoutForm.payment_method,
  ]);

  const handleQuickCheckout = async (method) => {
    if (!storeCart?.items?.length) {
      toast.error(t("Cart is empty", "El carrito esta vacio"));
      return;
    }
    setStoreCheckoutLoading(true);
    try {
      const finalMethod = method;
      const subtotal = Number(storeCart?.total) || 0;
      const shipping =
        storeCheckoutForm.fulfillment_type === "delivery"
          ? Number(storeShippingQuote.fee) || 0
          : 0;
      const baseTotal = subtotal + shipping;
      const { total: finalTotal } = calculatePriceWithPaymentMethod(baseTotal, finalMethod);

      const payload = {
        cart_id: storeCart.id,
        origin_url: window.location.origin,
        fulfillment_type: storeCheckoutForm.fulfillment_type,
        payment_method: finalMethod,
        total_amount: finalTotal,
        original_amount: baseTotal,
        fee_amount: finalTotal - baseTotal,
      };

      if (finalMethod === "card") {
        const res = await fetch(`${API_URL}/api/store/checkout`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          const d = await res.json();
          window.location.href = d.checkout_url;
        } else {
          const e = await res.json();
          toast.error(formatApiError(e.detail, t("Payment failed", "Pago fallido")));
        }
      } else {
        const res = await fetch(`${API_URL}/api/store/checkout/manual`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          toast.success(
            t("Order confirmed - paid with cash", "Orden confirmada - pagado en efectivo")
          );
          resetStorePos();
          await loadStoreOrders();
        } else {
          const e = await res.json();
          toast.error(formatApiError(e.detail, t("Payment failed", "Pago fallido")));
        }
      }
    } catch {
      toast.error(t("Connection error", "Error de conexion"));
    } finally {
      setStoreCheckoutLoading(false);
    }
  };

  const handleSendPaymentLink = async (channel) => {
    if (!storeCart?.items?.length) {
      toast.error(t("Cart is empty", "El carrito esta vacio"));
      return;
    }
    const contact = storeLinkContact.trim();
    if (!contact) {
      toast.error(
        channel === "sms"
          ? t("Enter phone number", "Ingresa numero de telefono")
          : t("Enter email", "Ingresa correo electronico")
      );
      return;
    }
    if (channel === "sms" && !isValidPhone(contact)) {
      toast.error(t("Invalid phone number", "Número de teléfono inválido"));
      return;
    }
    if (channel === "email" && !isValidEmail(contact)) {
      toast.error(t("Invalid email address", "Correo electrónico inválido"));
      return;
    }

    setStoreCheckoutLoading(true);
    try {
      const selectedMethod = storeCheckoutForm.payment_method;
      const subtotal = Number(storeCart?.total) || 0;
      const shipping =
        storeCheckoutForm.fulfillment_type === "delivery"
          ? Number(storeShippingQuote.fee) || 0
          : 0;
      const baseTotal = subtotal + shipping;
      const { total: finalTotal } = calculatePriceWithPaymentMethod(baseTotal, selectedMethod);

      const payload = {
        cart_id: storeCart.id,
        origin_url: window.location.origin,
        fulfillment_type: storeCheckoutForm.fulfillment_type,
        payment_method: selectedMethod,
        total_amount: finalTotal,
        original_amount: baseTotal,
        fee_amount: finalTotal - baseTotal,
      };
      if (channel === "sms") payload.customer_phone = contact;
      if (channel === "email") payload.customer_email = contact;

      const orderRes = await fetch(`${API_URL}/api/store/checkout/manual`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!orderRes.ok) {
        const e = await orderRes.json();
        toast.error(
          formatApiError(e.detail, t("Error creating order", "Error creando orden"))
        );
        return;
      }
      const orderData = await orderRes.json();
      const orderId = orderData.order_id || orderData.id;
      if (!orderId) {
        toast.error(t("Could not obtain order ID", "No se pudo obtener el ID de la orden"));
        return;
      }

      const linkRes = await fetch(
        `${API_URL}/api/store/orders/${orderId}/send-payment-link`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            channel,
            phone: channel === "sms" ? contact : null,
            email: channel === "email" ? contact : null,
          }),
        }
      );
      if (linkRes.ok) {
        toast.success(
          t(
            `Payment link sent via ${channel.toUpperCase()}`,
            `Link de pago enviado por ${channel.toUpperCase()}`
          )
        );
        resetStorePos();
        await loadStoreOrders();
      } else {
        const e = await linkRes.json();
        toast.error(
          formatApiError(
            e.detail || e.message,
            t("Could not send link", "No se pudo enviar el link")
          )
        );
      }
    } catch {
      toast.error(t("Connection error", "Error de conexion"));
    } finally {
      setStoreCheckoutLoading(false);
    }
  };

  const handleStorePayment = async () => {
    if (!storePaymentOrder) return;
    const orderId = storePaymentOrder.id || storePaymentOrder.order_id;
    if (!orderId) {
      toast.error(t("Invalid order ID", "ID de orden inválido"));
      return;
    }
    setStoreProcessingPayment(true);
    try {
      if (storePaymentForm.method === "card") {
        const res = await fetch(
          `${API_URL}/api/store/orders/${orderId}/stripe-checkout`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ origin_url: window.location.origin }),
          }
        );
        if (res.ok) {
          const d = await res.json();
          window.location.href = d.checkout_url;
          return;
        }
        const e = await res.json();
        toast.error(
          formatApiError(e.detail, t("Stripe checkout failed", "Falló Stripe"))
        );
      } else {
        const res = await fetch(`${API_URL}/api/store/orders/${orderId}/payment`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ payment_method: storePaymentForm.method }),
        });
        if (res.ok) {
          toast.success(t("Payment registered", "Pago registrado"));
          setStorePaymentOrder(null);
          await loadStoreOrders();
        } else {
          const e = await res.json();
          toast.error(
            formatApiError(e.detail, t("Payment failed", "Pago fallido"))
          );
        }
      }
    } catch {
      toast.error(t("Connection error", "Error de conexión"));
    } finally {
      setStoreProcessingPayment(false);
    }
  };

  // ─── Shipping quote debounce ──────────────────────────────────────────────

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
          body: JSON.stringify({ address: storeCheckoutForm.address }),
        });
        if (res.ok) {
          setStoreShippingQuote(await res.json());
          setStoreShippingError("");
        } else {
          const e = await res.json();
          setStoreShippingQuote({ distance_km: null, fee: 0, zone_name: null });
          setStoreShippingError(
            formatApiError(
              e.detail,
              t("Unable to calculate shipping", "No se pudo calcular envío")
            )
          );
        }
      } catch {
        setStoreShippingQuote({ distance_km: null, fee: 0, zone_name: null });
        setStoreShippingError(
          t("Unable to calculate shipping", "No se pudo calcular envío")
        );
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [
    storeCheckoutForm.address,
    storeCheckoutForm.fulfillment_type,
    storePosOpen,
    t,
  ]);

  // ─── Derived data ─────────────────────────────────────────────────────────

  const {
    allPickupOrders,
    allPickupDeliveries,
    allWashFoldDropoffs,
    allWashFoldReady,
    allPickupPaymentQueue,
    allWashFoldPaymentQueue,
    ordersWithCoordinates,
  } = useMemo(() => {
    const pickupOrders = dedupeOrders(dashboard?.todays_pickups || [])
      .filter(
        (o) =>
          !o.service_type ||
          o.service_type === "pickup_delivery" ||
          o.service_type === "airbnb_host" ||
          o.service_type === "commercial"
      )
      .map((o) => ({
        ...o,
        pickup_time_window: o.pickup_time_window || o.pickup_time || "",
      }));

    const pickupDeliveries = dedupeOrders(dashboard?.ready_for_delivery || [])
      .filter(
        (o) =>
          !o.service_type ||
          o.service_type === "pickup_delivery" ||
          o.service_type === "airbnb_host" ||
          o.service_type === "commercial"
      )
      .map((o) => ({
        ...o,
        pickup_time_window: o.pickup_time_window || o.pickup_time || "",
      }));

    const wfDropoffs = dedupeOrders(dashboard?.wash_fold_dropoffs || []).map((o) => ({
      ...o,
      pickup_time_window: o.pickup_time_window || o.pickup_time || "",
    }));

    const wfReady = dedupeOrders(dashboard?.wash_fold_ready || []).map((o) => ({
      ...o,
      pickup_time_window: o.pickup_time_window || o.pickup_time || "",
    }));

    const pickupPaymentQueue = dedupeOrders([...pickupOrders, ...pickupDeliveries]).filter(
      (o) => (o.payment_status || "pending") !== "paid"
    );

    const wfPaymentQueue = dedupeOrders([...wfDropoffs, ...wfReady]).filter(
      (o) => (o.payment_status || "pending") !== "paid"
    );

    const allOrders = dedupeOrders([
      ...pickupOrders,
      ...pickupDeliveries,
      ...wfDropoffs,
      ...wfReady,
    ]).filter((o) => o.status?.toUpperCase() !== "COMPLETED");

    const withCoords = allOrders
      .map((order) => {
        const address = order.pickup_address || order.delivery_address;
        const coords = getCoordinatesFromAddress(address);
        return coords ? { ...order, coords } : null;
      })
      .filter(Boolean);

    return {
      allPickupOrders: pickupOrders,
      allPickupDeliveries: pickupDeliveries,
      allWashFoldDropoffs: wfDropoffs,
      allWashFoldReady: wfReady,
      allPickupPaymentQueue: pickupPaymentQueue,
      allWashFoldPaymentQueue: wfPaymentQueue,
      ordersWithCoordinates: withCoords,
    };
  }, [dashboard]);

  const isWithinTimeWindow = useCallback((pickupTimeStr, filterWindow) => {
    if (!pickupTimeStr) return false;
    if (pickupTimeStr === "8-12" || pickupTimeStr === "14-18") {
      return (
        (filterWindow === "morning" && pickupTimeStr === "8-12") ||
        (filterWindow === "afternoon" && pickupTimeStr === "14-18")
      );
    }
    const match = pickupTimeStr.match(/(\d{1,2}):?(\d{2})?\s*(AM|PM)?/i);
    if (!match) return false;
    let hour = parseInt(match[1]);
    const period = match[3]?.toUpperCase();
    if (period === "PM" && hour !== 12) hour += 12;
    if (period === "AM" && hour === 12) hour = 0;
    if (filterWindow === "morning") return hour >= 8 && hour < 12;
    if (filterWindow === "afternoon") return hour >= 14 && hour < 18;
    return false;
  }, []);

  const filterOrders = useCallback(
    (orders) => {
      let result = orders;
      if (orderFilters.date)
        result = result.filter((o) => o.pickup_date === orderFilters.date);
      if (orderFilters.time_window)
        result = result.filter((o) =>
          isWithinTimeWindow(o.pickup_time_window, orderFilters.time_window)
        );
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        result = result.filter((order) => {
          const orderNumber = (order.order_number || "").toLowerCase();
          const customerName = (order.customer_name || "").toLowerCase();
          const address = (
            order.pickup_address ||
            order.delivery_address ||
            ""
          ).toLowerCase();
          const cp = extractCP(address) || "";
          return (
            orderNumber.includes(term) ||
            customerName.includes(term) ||
            address.includes(term) ||
            cp.includes(term)
          );
        });
      }
      return result;
    },
    [orderFilters, searchTerm, isWithinTimeWindow]
  );

  const filteredPickupOrders = useMemo(
    () => filterOrders(allPickupOrders),
    [filterOrders, allPickupOrders]
  );
  const filteredPickupDeliveries = useMemo(
    () => filterOrders(allPickupDeliveries),
    [filterOrders, allPickupDeliveries]
  );
  const filteredWashFoldDropoffs = useMemo(
    () => filterOrders(allWashFoldDropoffs),
    [filterOrders, allWashFoldDropoffs]
  );
  const filteredWashFoldReady = useMemo(
    () => filterOrders(allWashFoldReady),
    [filterOrders, allWashFoldReady]
  );
  const filteredPickupPaymentQueue = useMemo(
    () => filterOrders(allPickupPaymentQueue),
    [filterOrders, allPickupPaymentQueue]
  );
  const filteredWashFoldPaymentQueue = useMemo(
    () => filterOrders(allWashFoldPaymentQueue),
    [filterOrders, allWashFoldPaymentQueue]
  );

  const filteredStoreOrders = useMemo(
    () =>
      storeOrders.filter((order) => {
        if (storePaymentFilter === "unpaid" && order.payment_status === "paid") return false;
        if (storePaymentFilter === "paid" && order.payment_status !== "paid") return false;
        if (storeOrderSearch.trim()) {
          const term = storeOrderSearch.toLowerCase();
          const num = (order.order_number || "").toLowerCase();
          const name = (order.customer_name || "").toLowerCase();
          const email = (order.customer_email || "").toLowerCase();
          if (!num.includes(term) && !name.includes(term) && !email.includes(term))
            return false;
        }
        return true;
      }),
    [storeOrders, storePaymentFilter, storeOrderSearch]
  );

  const filteredStoreProducts = useMemo(
    () =>
      storeProducts.filter((p) =>
        p.name?.toLowerCase().includes(storeSearch.toLowerCase())
      ),
    [storeProducts, storeSearch]
  );

  const unpaidStoreOrders = useMemo(
    () =>
      storeOrders.filter((o) => {
        const s = (o.payment_status || "pending").toLowerCase();
        return s !== "paid" && s !== "refunded";
      }),
    [storeOrders]
  );

  const pickupOrdersCount = allPickupOrders.length;
  const ordersInProcessingCount = dashboard?.stats?.orders_in_processing || 0;
  const deliveriesCount = allPickupDeliveries.length;
  const urgentCount = dashboard?.stats?.urgent_tickets || 0;

  const rtLabel =
    realtimeStatus === "connected"
      ? t("Realtime: connected", "Tiempo real: conectado")
      : realtimeStatus === "disabled"
      ? t("Realtime: not configured", "Tiempo real: sin configurar")
      : t("Realtime: disconnected", "Tiempo real: desconectado");
  const rtClass =
    realtimeStatus === "connected"
      ? "bg-emerald-100 text-emerald-700"
      : realtimeStatus === "disabled"
      ? "bg-slate-100 text-slate-500"
      : "bg-orange-100 text-orange-700";
  const RtIcon = realtimeStatus === "connected" ? Wifi : WifiOff;

  // ─── Loading screen ───────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-3">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600" />
        <p className="text-sm text-slate-400 animate-pulse font-medium">
          {t("Loading dashboard…", "Cargando panel…")}
        </p>
      </div>
    );
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-6 pb-12 space-y-8">
      {/* Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-500 p-6 md:p-8 shadow-xl mb-8">
        <div className="absolute inset-0 bg-black/5 pointer-events-none"></div>
        <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3 text-white">
            <div className="p-2 bg-white/20 rounded-lg backdrop-blur-sm">
              <Zap className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">
                {t("Operator Dashboard", "Panel del Operador")}
              </h1>
              <p className="text-white/80 text-sm mt-0.5">
                {t(
                  "Update order status — the system does the rest",
                  "Actualiza el estado — el sistema hace el resto"
                )}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                type="text"
                placeholder={t("Search orders...", "Buscar órdenes...")}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 text-sm w-full sm:w-64 bg-white/10 border-white/20 text-white placeholder-white/60 focus:bg-white/20 focus:border-white/40 ring-0"
                data-testid="order-search-input"
              />
            </div>
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold backdrop-blur-sm border border-white/20 ${rtClass}`}
              data-testid="operator-realtime-status"
            >
              <RtIcon className="h-3 w-3" />
              {rtLabel}
            </span>
            <Button
              onClick={() => setAutoRefresh((a) => !a)}
              variant="secondary"
              size="sm"
              className="bg-white/10 border-white/20 text-white hover:bg-white/20"
              data-testid="toggle-auto-refresh"
            >
              {autoRefresh ? t("Pause", "Pausar") : t("Resume", "Reanudar")}
            </Button>
            <Button
              onClick={loadDashboard}
              variant="secondary"
              size="sm"
              className="bg-white/10 border-white/20 text-white hover:bg-white/20"
              data-testid="refresh-dashboard"
            >
              <RefreshCw className="h-4 w-4 sm:mr-1.5" />
              <span className="hidden sm:inline">{t("Refresh", "Actualizar")}</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={<Truck className="h-6 w-6 text-sky-600" />}
          bg="bg-sky-100"
          count={pickupOrdersCount}
          label={t("Pickups Today", "Pickups Hoy")}
          testId="pickups"
        />
        <StatCard
          icon={<Package className="h-6 w-6 text-amber-600" />}
          bg="bg-amber-100"
          count={ordersInProcessingCount}
          label={t("In Process", "En Proceso")}
          testId="processing"
        />
        <StatCard
          icon={<CheckCircle className="h-6 w-6 text-green-600" />}
          bg="bg-green-100"
          count={deliveriesCount}
          label={t("Deliveries Ongoing", "Entregas en curso")}
          testId="deliveries"
        />
        <StatCard
          icon={<AlertTriangle className="h-6 w-6 text-red-600" />}
          bg="bg-red-100"
          count={urgentCount}
          label={t("Urgent Tickets", "Tickets Urgentes")}
          testId="urgent"
          highlight={urgentCount > 0}
        />
      </div>

      {/* AI Assistant */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200 flex items-center gap-2 bg-slate-50">
          <Bot className="h-4 w-4 text-indigo-600 shrink-0" />
          <h3 className="font-semibold text-slate-800 text-sm tracking-tight">
            {t("AI Operations Assistant", "Asistente Operativo IA")}
          </h3>
          <Sparkles className="h-3.5 w-3.5 text-amber-400 ml-auto animate-pulse" />
        </div>
        <div className="p-5 grid gap-4 lg:grid-cols-[2fr_1fr]">
          <div>
            <Textarea
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              rows={3}
              placeholder={t(
                "Example: Mark order VFL-… as paid in cash $50 and generate ticket",
                "Ej: Marca la orden VFL-… como pagada en efectivo $50 y genera ticket"
              )}
              className="text-sm resize-none bg-slate-50/80 focus:bg-white"
              data-testid="operator-ai-input"
            />
            <div className="flex gap-2 mt-3">
              <Button
                onClick={handleAiRequest}
                disabled={aiLoading || !aiPrompt.trim()}
                size="sm"
                className="bg-indigo-600 hover:bg-indigo-700"
                data-testid="operator-ai-submit"
              >
                {aiLoading ? t("Processing…", "Procesando…") : t("Send to AI", "Enviar a IA")}
              </Button>
              <Button
                variant="outline"
                size="sm"
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
          <div className="bg-slate-50 rounded-xl p-4 border border-slate-200/80">
            <p className="text-xs text-slate-400 font-medium uppercase tracking-wide mb-2">
              {t("Response", "Respuesta")}
            </p>
            <p
              className="font-medium text-slate-800 text-sm leading-relaxed min-h-[4rem]"
              data-testid="operator-ai-reply"
            >
              {aiReply || (
                <span className="text-slate-400 font-normal italic">
                  {t("No reply yet", "Aún no hay respuesta")}
                </span>
              )}
            </p>
            {aiResults.length > 0 && (
              <ul className="mt-2 space-y-1.5 border-t border-slate-200 pt-2">
                {aiResults.map((r, i) => (
                  <li
                    key={i}
                    className={`text-xs font-medium ${r.ok ? "text-emerald-600" : "text-red-500"}`}
                    data-testid={`operator-ai-result-${i}`}
                  >
                    {r.ok ? "✓" : "✗"} {r.type}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* ═══ TABS ═══ */}
      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="w-full"
        data-testid="operator-tabs"
      >
        <TabsList className="w-full grid grid-cols-3 mb-6 h-12 rounded-xl bg-slate-100 p-1">
          <TabsTrigger
            value="orders"
            className="text-sm gap-1.5 h-10 rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-md data-[state=active]:text-indigo-600"
            data-testid="tab-orders"
          >
            <ClipboardList className="h-4 w-4" />
            <span className="hidden sm:inline">{t("Service Orders", "Ordenes de Servicio")}</span>
            <span className="sm:hidden">{t("Orders", "Ordenes")}</span>
          </TabsTrigger>
          <TabsTrigger
            value="store"
            className="text-sm gap-1.5 h-10 rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-md data-[state=active]:text-indigo-600"
            data-testid="tab-store"
          >
            <ShoppingBag className="h-4 w-4" />
            <span className="hidden sm:inline">{t("Store Orders", "Store Orders")}</span>
            <span className="sm:hidden">Store</span>
          </TabsTrigger>
          <TabsTrigger
            value="map"
            className="text-sm gap-1.5 h-10 rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-md data-[state=active]:text-indigo-600"
            data-testid="tab-map"
          >
            <MapIcon className="h-4 w-4" />
            <span className="hidden sm:inline">{t("Logistics Map", "Mapa Logistico")}</span>
            <span className="sm:hidden">{t("Map", "Mapa")}</span>
          </TabsTrigger>
        </TabsList>

        {/* ── Tab 1: Service Orders ──────────────────────────────────────── */}
        <TabsContent value="orders">
          <MapFilters onFilterChange={setOrderFilters} activeFilters={orderFilters} />

          {!isMobile && (
            <div className="flex gap-3 mb-4 px-1">
              <button
                onClick={() => setServiceSubTab("pickup")}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition-all text-sm ${
                  serviceSubTab === "pickup"
                    ? "bg-slate-900 text-white shadow-md"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                }`}
              >
                <Truck className="h-4 w-4" />
                Pickup &amp; Delivery
              </button>
              <button
                onClick={() => setServiceSubTab("wash")}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition-all text-sm ${
                  serviceSubTab === "wash"
                    ? "bg-slate-900 text-white shadow-md"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                }`}
              >
                <Package className="h-4 w-4" />
                Wash &amp; Fold
              </button>
            </div>
          )}

          <MobileServiceSwitch onSwitch={handleSwitchService} currentService={serviceSubTab} />

          {serviceSubTab === "pickup" ? (
            <div className="space-y-6">
              {/* Created / Confirmed */}
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-md">
                <CardHeader
                  icon={<Truck className="h-4 w-4 text-sky-500" />}
                  title={t(
                    "Pickup & Delivery — Created / Confirmed",
                    "Pickup & Delivery — Creadas / Confirmadas"
                  )}
                  count={filteredPickupOrders.length}
                  testId="pos-pickup-today-count"
                />
                <div className="divide-y divide-slate-100">
                  {filteredPickupOrders.length === 0 ? (
                    <EmptyState
                      icon={<Truck className="h-8 w-8 text-slate-300" />}
                      text={t(
                        "No created or confirmed orders",
                        "No hay ordenes creadas o confirmadas"
                      )}
                      testId="pos-pickup-today-empty"
                    />
                  ) : (
                    filteredPickupOrders.map((order) => {
                      const ns = getNextStatus(order.status, order.service_type);
                      return (
                        <OrderRow
                          key={order.order_id ?? order.order_number}
                          order={order}
                          statusInfo={getStatusInfo(order.status, order.service_type)}
                          nextStatus={ns}
                          nextStatusInfo={ns ? getStatusInfo(ns, order.service_type) : null}
                          updating={updating}
                          onRowClick={setSelectedOrder}
                          onAdvance={updateOrderStatus}
                          onPrint={handlePrintTicket}
                          onPDF={handleDownloadPDF}
                          showPrint
                          advanceBtnClass="bg-sky-600 hover:bg-sky-700"
                          t={t}
                        />
                      );
                    })
                  )}
                </div>
              </div>

              {/* Payment queue */}
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-md">
                <CardHeader
                  icon={<DollarSign className="h-4 w-4 text-emerald-500" />}
                  title={t(
                    "Pickup & Delivery — Request Payment",
                    "Pickup & Delivery — Solicitar pago"
                  )}
                  count={filteredPickupPaymentQueue.length}
                  testId="pos-pickup-payment-count"
                />
                <div className="divide-y divide-slate-100">
                  {filteredPickupPaymentQueue.length === 0 ? (
                    <EmptyState
                      icon={<DollarSign className="h-8 w-8 text-slate-300" />}
                      text={t("No pickup payments pending", "Sin pagos pendientes")}
                      testId="pos-pickup-payment-empty"
                    />
                  ) : (
                    filteredPickupPaymentQueue.map((order) => {
                      const amount = Number(order.extra_charge ?? order.total_amount ?? 0);
                      return (
                        <div
                          key={order.order_id ?? order.order_number}
                          className="p-4 bg-white border border-slate-200 rounded-xl hover:shadow-md hover:border-emerald-300 transition-all cursor-pointer"
                          role="button"
                          onClick={() => setSelectedOrder(order)}
                          data-testid={`pos-pickup-payment-${order.order_id || "unknown"}`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-1.5 mb-1">
                                <span className="font-mono font-semibold text-slate-800 font-sm">
                                  {formatOrderNumber(order)}
                                </span>
                                <span
                                  className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                                    getStatusInfo(order.status, order.service_type).color
                                  }`}
                                >
                                  {getStatusInfo(order.status, order.service_type).label}
                                </span>
                              </div>
                              <p className="text-sm text-slate-700 font-medium truncate">
                                {safeString(order.customer_name, t("Customer", "Cliente"))}
                              </p>
                              <p className="text-xs text-slate-400 mt-0.5">
                                {t("Charge", "Cobro")}:{" "}
                                <span className="font-semibold text-slate-600">
                                  {amount
                                    ? formatCurrency(amount)
                                    : t("Set actual lbs", "Ingresa lbs reales")}
                                </span>
                              </p>
                            </div>
                            <div className="flex flex-col gap-2 shrink-0">
                              <Button
                                size="sm"
                                className="bg-emerald-600 hover:bg-emerald-700 text-xs h-8 px-3 rounded-lg shadow-sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedOrder(order);
                                }}
                                data-testid={`pos-pickup-collect-${order.order_id}`}
                              >
                                {t("Collect", "Cobrar")}
                              </Button>
                              <div className="flex gap-1">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-8 w-8 p-0 rounded-lg text-slate-400 hover:text-sky-600 shadow-sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handlePrintTicket(order);
                                  }}
                                  data-testid={`pos-pickup-payment-print-${order.order_id}`}
                                >
                                  <Printer className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-8 w-8 p-0 rounded-lg text-slate-400 hover:text-emerald-600 shadow-sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDownloadPDF(order);
                                  }}
                                  data-testid={`pos-pickup-payment-pdf-${order.order_id}`}
                                >
                                  <FileDown className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* In Process / Ready / Out for Delivery */}
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-md">
                <CardHeader
                  icon={<CheckCircle className="h-4 w-4 text-emerald-500" />}
                  title={t(
                    "Pickup & Delivery — In Process / Ready / Out for Delivery",
                    "Pickup & Delivery — En proceso / Lista / En camino"
                  )}
                  count={filteredPickupDeliveries.length}
                  bgClass="bg-emerald-50/30"
                  testId="pos-pickup-delivery-count"
                />
                <div className="divide-y divide-slate-100">
                  {filteredPickupDeliveries.length === 0 ? (
                    <EmptyState
                      icon={<Package className="h-8 w-8 text-slate-300" />}
                      text={t(
                        "No active process or delivery orders",
                        "No hay ordenes activas en proceso o entrega"
                      )}
                      testId="operator-delivery-empty"
                    />
                  ) : (
                    filteredPickupDeliveries.map((order) => {
                      const ns = getNextStatus(order.status, order.service_type);
                      return (
                        <OrderRow
                          key={order.order_id ?? order.order_number}
                          order={order}
                          statusInfo={getStatusInfo(order.status, order.service_type)}
                          nextStatus={ns}
                          nextStatusInfo={ns ? getStatusInfo(ns, order.service_type) : null}
                          updating={updating}
                          onRowClick={setSelectedOrder}
                          onAdvance={updateOrderStatus}
                          onPrint={handlePrintTicket}
                          onPDF={handleDownloadPDF}
                          showPrint
                          advanceBtnClass="bg-emerald-600 hover:bg-emerald-700"
                          t={t}
                        />
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Wash & Fold — Created / Confirmed */}
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-md">
                <CardHeader
                  icon={<Package className="h-4 w-4 text-purple-500" />}
                  title={t(
                    "Wash & Fold — Created / Confirmed",
                    "Wash & Fold — Creadas / Confirmadas"
                  )}
                  count={filteredWashFoldDropoffs.length}
                  testId="pos-washfold-dropoff-count"
                />
                <div className="divide-y divide-slate-100">
                  {filteredWashFoldDropoffs.length === 0 ? (
                    <EmptyState
                      icon={<Package className="h-8 w-8 text-slate-300" />}
                      text={t(
                        "No created or confirmed orders",
                        "Sin ordenes creadas o confirmadas"
                      )}
                      testId="pos-washfold-dropoff-empty"
                    />
                  ) : (
                    filteredWashFoldDropoffs.map((order) => {
                      const ns = getNextStatus(order.status, order.service_type);
                      return (
                        <OrderRow
                          key={order.order_id ?? order.order_number}
                          order={order}
                          statusInfo={getStatusInfo(order.status, order.service_type)}
                          nextStatus={ns}
                          nextStatusInfo={ns ? getStatusInfo(ns, order.service_type) : null}
                          updating={updating}
                          onRowClick={setSelectedOrder}
                          onAdvance={updateOrderStatus}
                          onPrint={handlePrintTicket}
                          onPDF={handleDownloadPDF}
                          showPrint
                          advanceBtnClass="bg-purple-600 hover:bg-purple-700"
                          t={t}
                        />
                      );
                    })
                  )}
                </div>
              </div>

              {/* Wash & Fold — Payment queue */}
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-md">
                <CardHeader
                  icon={<DollarSign className="h-4 w-4 text-emerald-500" />}
                  title={t(
                    "Wash & Fold — Request Payment",
                    "Wash & Fold — Solicitar pago"
                  )}
                  count={filteredWashFoldPaymentQueue.length}
                  testId="pos-washfold-payment-count"
                />
                <div className="divide-y divide-slate-100">
                  {filteredWashFoldPaymentQueue.length === 0 ? (
                    <EmptyState
                      icon={<DollarSign className="h-8 w-8 text-slate-300" />}
                      text={t("No wash & fold payments pending", "Sin pagos pendientes")}
                      testId="pos-washfold-payment-empty"
                    />
                  ) : (
                    filteredWashFoldPaymentQueue.map((order) => {
                      const amount = Number(order.extra_charge ?? order.total_amount ?? 0);
                      return (
                        <div
                          key={order.order_id ?? order.order_number}
                          className="p-4 bg-white border border-slate-200 rounded-xl hover:shadow-md hover:border-emerald-300 transition-all cursor-pointer"
                          role="button"
                          onClick={() => setSelectedOrder(order)}
                          data-testid={`pos-washfold-payment-${order.order_id || "unknown"}`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-1.5 mb-1">
                                <span className="font-mono font-semibold text-slate-800 text-sm">
                                  {formatOrderNumber(order)}
                                </span>
                                <span
                                  className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                                    getStatusInfo(order.status, order.service_type).color
                                  }`}
                                >
                                  {getStatusInfo(order.status, order.service_type).label}
                                </span>
                              </div>
                              <p className="text-sm text-slate-700 font-medium truncate">
                                {safeString(order.customer_name, t("Customer", "Cliente"))}
                              </p>
                              <p className="text-xs text-slate-400 mt-0.5">
                                {t("Charge", "Cobro")}:{" "}
                                <span className="font-semibold text-slate-600">
                                  {amount
                                    ? formatCurrency(amount)
                                    : t("Set actual lbs", "Ingresa lbs reales")}
                                </span>
                              </p>
                            </div>
                            <div className="flex flex-col gap-2 shrink-0">
                              <Button
                                size="sm"
                                className="bg-emerald-600 hover:bg-emerald-700 text-xs h-8 px-3 rounded-lg shadow-sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedOrder(order);
                                }}
                                data-testid={`pos-washfold-collect-${order.order_id}`}
                              >
                                {t("Collect", "Cobrar")}
                              </Button>
                              <div className="flex gap-1">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-8 w-8 p-0 rounded-lg text-slate-400 hover:text-sky-600 shadow-sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handlePrintTicket(order);
                                  }}
                                  data-testid={`pos-washfold-print-payment-${order.order_id}`}
                                >
                                  <Printer className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-8 w-8 p-0 rounded-lg text-slate-400 hover:text-emerald-600 shadow-sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDownloadPDF(order);
                                  }}
                                  data-testid={`pos-washfold-pdf-payment-${order.order_id}`}
                                >
                                  <FileDown className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Wash & Fold — Processing / Ready */}
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-md">
                <CardHeader
                  icon={<CheckCircle className="h-4 w-4 text-emerald-500" />}
                  title={t(
                    "Wash & Fold — Processing / Ready for pickup",
                    "Wash & Fold — Procesando / Lista para recoger"
                  )}
                  count={filteredWashFoldReady.length}
                  bgClass="bg-emerald-50/30"
                  testId="pos-washfold-ready-count"
                />
                <div className="divide-y divide-slate-100">
                  {filteredWashFoldReady.length === 0 ? (
                    <EmptyState
                      icon={<CheckCircle className="h-8 w-8 text-slate-300" />}
                      text={t(
                        "No orders in process or ready",
                        "Sin ordenes en proceso o listas"
                      )}
                      testId="pos-washfold-ready-empty"
                    />
                  ) : (
                    filteredWashFoldReady.map((order) => {
                      const ns = getNextStatus(order.status, order.service_type);
                      return (
                        <OrderRow
                          key={order.order_id ?? order.order_number}
                          order={order}
                          statusInfo={getStatusInfo(order.status, order.service_type)}
                          nextStatus={ns}
                          nextStatusInfo={ns ? getStatusInfo(ns, order.service_type) : null}
                          updating={updating}
                          onRowClick={setSelectedOrder}
                          onAdvance={updateOrderStatus}
                          onPrint={handlePrintTicket}
                          onPDF={handleDownloadPDF}
                          showPrint
                          advanceBtnClass="bg-emerald-600 hover:bg-emerald-700"
                          t={t}
                        />
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          )}
        </TabsContent>

        {/* ── Tab 2: Store Orders ────────────────────────────────────────── */}
        <TabsContent value="store">
          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-md">
              <div className="px-5 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-slate-50/50">
                <div>
                  <h3 className="font-semibold text-slate-800 text-sm">
                    {t("Store Orders", "Ordenes tienda")}
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {t("Process product purchases", "Procesa compras de productos")}
                  </p>
                </div>
                <Button
                  size="sm"
                  className="bg-slate-900 hover:bg-slate-800 text-xs h-9 px-4 rounded-lg shadow-sm"
                  onClick={openStorePos}
                  data-testid="store-pos-open"
                >
                  {t("New Store Sale", "Nueva venta")}
                </Button>
              </div>

              <div className="px-4 py-3 border-b border-slate-100 flex flex-wrap items-center gap-2">
                <Search className="h-4 w-4 text-slate-400 shrink-0" />
                <Input
                  placeholder={t(
                    "Search by order, customer...",
                    "Buscar por orden, cliente..."
                  )}
                  value={storeOrderSearch}
                  onChange={(e) => setStoreOrderSearch(e.target.value)}
                  className="h-8 w-[200px] text-xs"
                  data-testid="store-search-input"
                />
                <div className="flex items-center gap-1">
                  {["all", "unpaid", "paid"].map((f) => (
                    <Button
                      key={f}
                      size="sm"
                      variant={storePaymentFilter === f ? "default" : "outline"}
                      className={`h-7 text-xs ${
                        storePaymentFilter === f
                          ? f === "unpaid"
                            ? "bg-amber-500 hover:bg-amber-600"
                            : f === "paid"
                            ? "bg-emerald-500 hover:bg-emerald-600"
                            : ""
                          : ""
                      }`}
                      onClick={() => setStorePaymentFilter(f)}
                      data-testid={`store-filter-${f}`}
                    >
                      {t(f === "all" ? "All" : f === "unpaid" ? "Unpaid" : "Paid")}
                      {f === "unpaid" && unpaidStoreOrders.length > 0 && (
                        <span className="ml-1 text-[10px] font-bold">
                          {unpaidStoreOrders.length}
                        </span>
                      )}
                    </Button>
                  ))}
                </div>
              </div>

              {storeOrdersLoading ? (
                <div className="p-8 text-center text-slate-400 text-sm">
                  {t("Loading store orders...", "Cargando ordenes...")}
                </div>
              ) : filteredStoreOrders.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-sm">
                  {storeOrderSearch || storePaymentFilter !== "all"
                    ? t("No orders match filters", "Sin ordenes con esos filtros")
                    : t("No store orders yet", "Sin ordenes de tienda")}
                </div>
              ) : (
                <>
                  {/* Desktop table */}
                  <div className="hidden md:block overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead className="bg-slate-50 text-slate-400 text-xs uppercase tracking-wide">
                        <tr>
                          {[
                            t("Order", "Orden"),
                            t("Customer", "Cliente"),
                            t("Status", "Estado"),
                            t("Payment", "Pago"),
                            t("Total", "Total"),
                            t("Actions", "Acciones"),
                          ].map((h, i) => (
                            <th
                              key={i}
                              className={`px-4 py-3 font-semibold ${
                                i === 5 ? "text-right" : "text-left"
                              }`}
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredStoreOrders.map((order) => {
                          const ns = getNextStoreStatus(order.status);
                          return (
                            <tr
                              key={order.id ?? order.order_number}
                              className="hover:bg-slate-50/50 transition-colors"
                              data-testid={`store-order-row-${order.id || "unknown"}`}
                            >
                              <td className="px-4 py-3 font-mono text-slate-800 text-xs">
                                {safeString(order.order_number)}
                              </td>
                              <td className="px-4 py-3">
                                <p className="text-slate-800 text-sm font-medium">
                                  {safeString(order.customer_name)}
                                </p>
                                <p className="text-xs text-slate-400">
                                  {safeString(order.customer_email)}
                                </p>
                              </td>
                              <td className="px-4 py-3">
                                <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-xs font-medium">
                                  {getStoreStatusDisplay(order.status)}
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                <p
                                  className={`text-sm font-semibold ${
                                    order.payment_status === "paid"
                                      ? "text-emerald-600"
                                      : "text-amber-600"
                                  }`}
                                >
                                  {getPaymentStatusLabel(order.payment_status)}
                                </p>
                                <p className="text-xs text-slate-400">
                                  {safeString(order.payment_method, "-")}
                                </p>
                              </td>
                              <td className="px-4 py-3 font-bold text-slate-800">
                                {formatCurrency(order.total)}
                              </td>
                              <td className="px-4 py-3 text-right">
                                <div className="flex flex-wrap justify-end gap-1.5">
                                  {(order.payment_status || "pending") !== "paid" &&
                                    (order.payment_status || "").toLowerCase() !== "refunded" && (
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className="text-xs"
                                        onClick={() => {
                                          setStorePaymentOrder(order);
                                          setStorePaymentForm({ method: "card" });
                                        }}
                                        data-testid={`store-order-request-payment-${order.id}`}
                                      >
                                        {t("Request payment", "Solicitar pago")}
                                      </Button>
                                    )}
                                  {ns && (
                                    <Button
                                      size="sm"
                                      className="text-xs"
                                      onClick={() => updateStoreOrderStatus(order.id, ns)}
                                      disabled={storeUpdating[order.id]}
                                      data-testid={`store-order-next-${order.id}`}
                                    >
                                      {storeUpdating[order.id]
                                        ? "…"
                                        : `→ ${getStoreStatusDisplay(ns)}`}
                                    </Button>
                                  )}
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="text-xs"
                                    onClick={() => handlePrintStoreOrder(order)}
                                    data-testid={`store-order-print-${order.id}`}
                                  >
                                    {t("Print", "Imprimir")}
                                  </Button>
                                  {order.payment_status === "paid" && (
                                    <Button
                                      variant="destructive"
                                      size="sm"
                                      className="text-xs"
                                      onClick={() => refundStoreOrder(order.id)}
                                      disabled={storeUpdating[order.id]}
                                      data-testid={`store-order-refund-${order.id}`}
                                    >
                                      {storeUpdating[order.id]
                                        ? "…"
                                        : t("Refund", "Reembolsar")}
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
                    {filteredStoreOrders.map((order) => {
                      const ns = getNextStoreStatus(order.status);
                      return (
                        <div
                          key={order.id ?? order.order_number}
                          className="p-4 space-y-2.5"
                          data-testid={`store-order-row-${order.id || "unknown"}`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="font-mono text-xs font-semibold text-slate-700">
                                {safeString(order.order_number)}
                              </p>
                              <p className="text-sm font-medium text-slate-800 mt-0.5">
                                {safeString(order.customer_name)}
                              </p>
                              <p className="text-xs text-slate-400">
                                {safeString(order.customer_email)}
                              </p>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="font-bold text-sm text-slate-800">
                                {formatCurrency(order.total)}
                              </p>
                              <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-xs inline-block mt-1">
                                {getStoreStatusDisplay(order.status)}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 text-xs">
                            <span
                              className={`font-semibold ${
                                order.payment_status === "paid"
                                  ? "text-emerald-600"
                                  : "text-amber-600"
                              }`}
                            >
                              {getPaymentStatusLabel(order.payment_status)}
                            </span>
                            <span className="text-slate-300">·</span>
                            <span className="text-slate-400">
                              {safeString(order.payment_method, "-")}
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {(order.payment_status || "pending") !== "paid" &&
                              (order.payment_status || "").toLowerCase() !== "refunded" && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="text-xs flex-1"
                                  onClick={() => {
                                    setStorePaymentOrder(order);
                                    setStorePaymentForm({ method: "card" });
                                  }}
                                >
                                  {t("Request payment", "Solicitar pago")}
                                </Button>
                              )}
                            {ns && (
                              <Button
                                size="sm"
                                className="text-xs flex-1"
                                onClick={() => updateStoreOrderStatus(order.id, ns)}
                                disabled={storeUpdating[order.id]}
                              >
                                {storeUpdating[order.id]
                                  ? "…"
                                  : `→ ${getStoreStatusDisplay(ns)}`}
                              </Button>
                            )}
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-xs"
                              onClick={() => handlePrintStoreOrder(order)}
                            >
                              {t("Print", "Imprimir")}
                            </Button>
                            {order.payment_status === "paid" && (
                              <Button
                                variant="destructive"
                                size="sm"
                                className="text-xs"
                                onClick={() => refundStoreOrder(order.id)}
                                disabled={storeUpdating[order.id]}
                              >
                                {storeUpdating[order.id] ? "…" : t("Refund", "Reembolsar")}
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
        </TabsContent>

        {/* ── Tab 3: Logistics Map ───────────────────────────────────────── */}
        <TabsContent value="map">
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-md">
            <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center gap-2">
              <MapPin className="h-4 w-4 text-indigo-600" />
              <h3 className="font-semibold text-slate-800 text-sm">
                {t("Order Locations", "Ubicaciones de ordenes")}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                {t(
                  "Click on a marker to view order details",
                  "Haz clic en un marcador para ver los detalles de la orden"
                )}
              </p>
            </div>
            <MapFilters onFilterChange={loadFilteredMapOrders} activeFilters={mapFilters} />
            {(mapFilters.date || mapFilters.time_window) && (
              <div className="px-4 py-1.5 bg-indigo-50 border-b border-indigo-100 text-xs text-indigo-700 font-medium">
                {t("Showing filtered results", "Mostrando resultados filtrados")}
                {mapFilters.date && (
                  <span className="ml-1 font-semibold">
                    {formatShortDatePT(mapFilters.date)}
                  </span>
                )}
                {mapFilters.time_window && (
                  <span className="ml-1 font-semibold">
                    {" "}
                    · {mapFilters.time_window === "morning" ? "8-12" : "14-18"}
                  </span>
                )}
                <span className="ml-2">
                  ({(filteredMapOrders || ordersWithCoordinates).length}{" "}
                  {t("orders", "ordenes")})
                </span>
              </div>
            )}
            <div className="h-[450px] w-full" style={{ position: "relative", zIndex: 0 }}>
              <MapContainer
                key={mapKey}
                center={[STORE_COORDINATES.lat, STORE_COORDINATES.lng]}
                zoom={12}
                style={{ height: "100%", width: "100%", zIndex: 0 }}
              >
                <TileLayer
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                />
                {(() => {
                  const mapOrders = filteredMapOrders
                    ? filteredMapOrders
                        .filter((o) => o.location?.lat && o.location?.lng)
                        .map((o) => ({
                          ...o,
                          order_id: o.id,
                          customer_name: o.customer?.name || o.customer_name || "",
                          pickup_address:
                            o.location?.address || o.pickup_address || "",
                          delivery_address: o.delivery_address || "",
                          payment_status:
                            o.payment?.status || o.payment_status || "unpaid",
                          coords: { lat: o.location.lat, lng: o.location.lng },
                        }))
                    : ordersWithCoordinates;

                  return mapOrders.map((order) => {
                    const isDelivery =
                      !order.service_type || order.service_type === "pickup_delivery";
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
                      html: `<div style="background-color:${markerColor};width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:white;font-weight:bold;font-size:12px;box-shadow:0 2px 4px rgba(0,0,0,0.3);">📍</div>`,
                      className: "custom-marker",
                      iconSize: [24, 24],
                      popupAnchor: [0, -12],
                    });
                    return (
                      <Marker
                        key={order.id || order.order_id}
                        position={[order.coords.lat, order.coords.lng]}
                        icon={icon}
                      >
                        <Popup minWidth={280} maxWidth={320}>
                          <div className="space-y-2 text-sm">
                            <div className="font-bold text-base">
                              {formatOrderNumber(order)}
                            </div>
                            <div className="text-slate-700">{order.customer_name}</div>
                            <div className="text-xs text-slate-500 break-words">
                              {order.pickup_address || order.delivery_address}
                            </div>
                            {isDelivery && (
                              <div className="text-xs">
                                {t("Distance", "Distancia")}:{" "}
                                <strong>{distance.toFixed(1)} mi</strong>
                                <br />
                                {t("Shipping", "Envío")}:{" "}
                                {deliveryFee > 0
                                  ? formatCurrency(deliveryFee)
                                  : t("Free", "Gratis")}
                                {exceedsLimit && (
                                  <span className="ml-2 text-red-500 font-semibold">
                                    ({t("Exceeds 9 miles", "Excede 9 millas")})
                                  </span>
                                )}
                              </div>
                            )}
                            <div className="flex items-center gap-1 flex-wrap">
                              <span
                                className={`px-1.5 py-0.5 rounded-full text-xs ${statusInfo.color}`}
                              >
                                {statusInfo.label}
                              </span>
                              {order.payment_status !== "paid" && (
                                <span className="text-xs text-amber-600">
                                  {t("Pending", "Pendiente")}
                                </span>
                              )}
                            </div>
                            <div className="pt-2">
                              <Button
                                size="sm"
                                variant="default"
                                className="w-full bg-slate-900 hover:bg-slate-800"
                                onClick={() => setSelectedOrder(order)}
                              >
                                {t("View details", "Ver detalles")}
                              </Button>
                            </div>
                          </div>
                        </Popup>
                      </Marker>
                    );
                  });
                })()}
              </MapContainer>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* ── Modals ─────────────────────────────────────────────────────────── */}
      <OrderDetailDialog
        order={selectedOrder}
        onClose={() => setSelectedOrder(null)}
        onRefresh={loadDashboard}
      />
      <PickupImageModal
        open={!!pickupImageModal}
        order={pickupImageModal?.order}
        pendingStatus={pickupImageModal?.pendingStatus}
        onClose={() => setPickupImageModal(null)}
        onConfirm={handlePickupImageConfirm}
      />
      <ConfirmDialog
        open={!!confirmDialog}
        title={confirmDialog?.title}
        description={confirmDialog?.description}
        onConfirm={handleConfirmDialogAccept}
        onCancel={() => setConfirmDialog(null)}
      />

      {/* Store POS Modal */}
      <Dialog
        open={storePosOpen}
        onOpenChange={(open) => (!open ? resetStorePos() : setStorePosOpen(true))}
      >
        <DialogContent className="w-[95vw] max-w-5xl bg-white max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base sm:text-lg">
              {t("New Store Sale", "Nueva venta en tienda")}
            </DialogTitle>
            <DialogDescription className="text-xs sm:text-sm">
              {t(
                "Select products and collect payment quickly.",
                "Selecciona productos y cobra rapido."
              )}
            </DialogDescription>
          </DialogHeader>
          <div
            className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6"
            data-testid="store-pos-modal"
          >
            <div className="space-y-3">
              <Input
                placeholder={t("Search products", "Buscar productos")}
                value={storeSearch}
                onChange={(e) => setStoreSearch(e.target.value)}
                className="text-sm"
                data-testid="store-pos-search"
              />
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div
                  className="max-h-[300px] sm:max-h-[380px] overflow-y-auto divide-y divide-slate-100"
                  data-testid="store-pos-products"
                >
                  {storeCartLoading ? (
                    <div className="p-6 text-center text-slate-400 text-sm">
                      {t("Loading products…", "Cargando productos…")}
                    </div>
                  ) : filteredStoreProducts.length === 0 ? (
                    <div className="p-6 text-center text-slate-400 text-sm">
                      {t("No products found", "No hay productos")}
                    </div>
                  ) : (
                    filteredStoreProducts.map((product) => {
                      const qty = getCartItemQuantity(product.id);
                      const disabled = product.stock <= 0 || !product.is_active;
                      return (
                        <div
                          key={product.id}
                          className="p-3 sm:p-4 flex items-center justify-between gap-3"
                          data-testid={`store-pos-product-${product.id}`}
                        >
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold text-slate-800 text-sm truncate">
                              {safeString(product.name)}
                            </p>
                            <p className="text-xs text-slate-400">
                              ${Number(product.price).toFixed(2)} · {t("Stock", "Stock")}:{" "}
                              {product.stock}
                            </p>
                            {disabled && (
                              <p className="text-xs text-red-400 font-medium">
                                {t("Unavailable", "No disponible")}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 w-7 p-0"
                              onClick={() => updateStoreCartItem(product, qty - 1)}
                              disabled={qty === 0}
                              data-testid={`store-pos-minus-${product.id}`}
                            >
                              -
                            </Button>
                            <span
                              className="w-5 text-center text-sm font-bold text-slate-700"
                              data-testid={`store-pos-qty-${product.id}`}
                            >
                              {qty}
                            </span>
                            <Button
                              size="sm"
                              className="h-7 w-7 p-0"
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
            <div className="space-y-3">
              <div
                className="border border-slate-200 rounded-xl p-3 sm:p-4"
                data-testid="store-pos-cart"
              >
                <h4 className="font-semibold text-slate-800 mb-2 text-sm">
                  {t("Cart", "Carrito")}
                </h4>
                {storeCart?.items?.length ? (
                  <div className="space-y-1.5">
                    {storeCart.items.map((item) => (
                      <div
                        key={item.product_id ?? item.name}
                        className="flex items-center justify-between text-xs sm:text-sm"
                      >
                        <span className="truncate mr-2 text-slate-700">
                          {safeString(item.name || item.product_name)}
                        </span>
                        <span className="shrink-0 text-slate-500">
                          {item.quantity} × ${Number(item.price || 0).toFixed(2)}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400">{t("No items yet", "Sin productos")}</p>
                )}
              </div>
              <div
                className="border border-slate-200 rounded-xl p-3 sm:p-4 space-y-2"
                data-testid="store-pos-summary"
              >
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">{t("Subtotal", "Subtotal")}</span>
                  <span>${storeOrderTotal.base.toFixed(2)}</span>
                </div>
                {storeCheckoutForm.fulfillment_type === "delivery" &&
                  storeShippingQuote.fee > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">{t("Shipping", "Envío")}</span>
                      <span>${storeShippingQuote.fee.toFixed(2)}</span>
                    </div>
                  )}
                {storeOrderTotal.fee > 0 && (
                  <div className="flex justify-between text-sm text-amber-600">
                    <span>
                      {t("Payment method fee", "Recargo por método de pago")} (
                      {storeOrderTotal.feePercentage}%)
                    </span>
                    <span>+${storeOrderTotal.fee.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-base sm:text-lg pt-2 border-t border-slate-100">
                  <span>{t("Total", "Total")}</span>
                  <span data-testid="store-pos-total">${storeOrderTotal.total.toFixed(2)}</span>
                </div>

                <div className="mt-3">
                  <label className="text-xs font-semibold">
                    {t("Payment method", "Método de pago")}
                  </label>
                  <select
                    className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2 text-sm"
                    value={storeCheckoutForm.payment_method}
                    onChange={(e) =>
                      setStoreCheckoutForm((prev) => ({
                        ...prev,
                        payment_method: e.target.value,
                      }))
                    }
                    data-testid="store-payment-method-select"
                  >
                    <option value="cash">{t("Cash (0% fee)", "Efectivo (0% recargo)")}</option>
                    <option value="card">{t("Card (3.5% fee)", "Tarjeta (3.5% recargo)")}</option>
                    <option value="transfer">
                      {t("Transfer (2% fee)", "Transferencia (2% recargo)")}
                    </option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-2 mt-2">
                  <Button
                    className="w-full bg-sky-600 hover:bg-sky-700 text-xs sm:text-sm h-11 shadow-sm"
                    onClick={() => handleQuickCheckout("card")}
                    disabled={storeCheckoutLoading || !storeCart?.items?.length}
                  >
                    <CreditCard className="h-4 w-4 mr-1.5" />
                    {t("Pay with Card", "Pagar con Tarjeta")}
                  </Button>
                  <Button
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-xs sm:text-sm h-11 shadow-sm"
                    onClick={() => handleQuickCheckout("cash")}
                    disabled={storeCheckoutLoading || !storeCart?.items?.length}
                  >
                    <DollarSign className="h-4 w-4 mr-1.5" />
                    {t("Pay with Cash", "Pagar en Efectivo")}
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full text-xs sm:text-sm h-11 border-purple-200 text-purple-700 hover:bg-purple-50 shadow-sm"
                    onClick={() => setStoreLinkMode("sms")}
                    disabled={storeCheckoutLoading || !storeCart?.items?.length}
                    data-testid="store-pos-link-sms"
                  >
                    <Phone className="h-4 w-4 mr-1.5" />
                    {t("Link via SMS", "Link por SMS")}
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full text-xs sm:text-sm h-11 border-indigo-200 text-indigo-700 hover:bg-indigo-50 shadow-sm"
                    onClick={() => setStoreLinkMode("email")}
                    disabled={storeCheckoutLoading || !storeCart?.items?.length}
                    data-testid="store-pos-link-email"
                  >
                    <Mail className="h-4 w-4 mr-1.5" />
                    {t("Link via Email", "Link por Email")}
                  </Button>
                </div>
                {storeLinkMode && (
                  <div
                    className="mt-2 p-3 bg-slate-50 rounded-lg space-y-2 border border-slate-200"
                    data-testid="store-pos-link-form"
                  >
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold">
                        {storeLinkMode === "sms"
                          ? t("Phone number", "Numero de telefono")
                          : t("Email address", "Correo electronico")}
                      </label>
                      <button
                        className="text-slate-400 hover:text-slate-600"
                        onClick={() => setStoreLinkMode(null)}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="flex gap-2">
                      <Input
                        value={storeLinkContact}
                        onChange={(e) => setStoreLinkContact(e.target.value)}
                        placeholder={
                          storeLinkMode === "sms" ? "(805) 555-0000" : "email@cliente.com"
                        }
                        type={storeLinkMode === "email" ? "email" : "tel"}
                        className="text-sm h-9 flex-1"
                        data-testid="store-pos-link-input"
                      />
                      <Button
                        className="bg-purple-600 hover:bg-purple-700 text-xs h-9 px-4"
                        onClick={() => handleSendPaymentLink(storeLinkMode)}
                        disabled={storeCheckoutLoading || !storeLinkContact.trim()}
                        data-testid="store-pos-link-send"
                      >
                        {storeCheckoutLoading ? "…" : t("Send", "Enviar")}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Store Payment Modal */}
      <Dialog
        open={!!storePaymentOrder}
        onOpenChange={(open) => !open && setStorePaymentOrder(null)}
      >
        <DialogContent className="w-[95vw] max-w-lg bg-white">
          <DialogHeader>
            <DialogTitle className="text-base sm:text-lg">
              {t("Request payment", "Solicitar pago")}
            </DialogTitle>
            <DialogDescription className="text-xs sm:text-sm">
              {safeString(storePaymentOrder?.order_number)}
            </DialogDescription>
          </DialogHeader>
          {storePaymentOrder && (
            <div className="space-y-4" data-testid="store-payment-modal">
              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                <span className="text-sm text-slate-500">{t("Total", "Total")}</span>
                <span className="text-xl font-bold text-slate-900">
                  {formatCurrency(storePaymentOrder.total)}
                </span>
              </div>
              <div>
                <label className="text-xs sm:text-sm">
                  {t("Payment method", "Metodo de pago")}
                </label>
                <select
                  className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2 text-sm"
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
                <p className="text-xs text-slate-400 bg-sky-50 border border-sky-100 rounded-lg p-2.5">
                  {t(
                    "Stripe Checkout will open in a new page",
                    "Stripe Checkout se abrira en otra pagina"
                  )}
                </p>
              )}
              <Button
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-sm shadow-md"
                onClick={handleStorePayment}
                disabled={storeProcessingPayment}
                data-testid="store-payment-submit"
              >
                {storeProcessingPayment
                  ? t("Processing…", "Procesando…")
                  : storePaymentForm.method === "card"
                  ? t("Pay with Stripe", "Pagar con Stripe")
                  : t("Register payment", "Registrar pago")}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Urgent Tickets */}
      {dashboard?.urgent_tickets?.length > 0 && (
        <div className="bg-white rounded-2xl border border-red-200 overflow-hidden shadow-md">
          <div className="px-5 py-4 border-b border-red-100 bg-red-50/50 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
            <h3 className="font-semibold text-red-800 text-sm sm:text-base">
              {t("Urgent Tickets", "Tickets Urgentes")}{" "}
              <span className="ml-1 bg-red-100 text-red-700 text-xs font-bold px-2 py-0.5 rounded-full">
                {dashboard.urgent_tickets.length}
              </span>
            </h3>
          </div>
          <div className="divide-y divide-red-100">
            {dashboard.urgent_tickets.map((ticket) => (
              <div
                key={ticket.ticket_id}
                className="p-3 sm:p-4"
                data-testid={`ticket-${ticket.ticket_id}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5 mb-1">
                      <span className="font-mono font-semibold text-slate-800 text-xs sm:text-sm">
                        {safeString(ticket.ticket_id)}
                      </span>
                      <span className="px-1.5 py-0.5 text-xs font-bold rounded-full bg-red-100 text-red-700">
                        {t("URGENT", "URGENTE")}
                      </span>
                    </div>
                    <p className="font-semibold text-slate-800 text-sm">
                      {safeString(ticket.subject)}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">
                      {safeString(ticket.description)}
                    </p>
                    <p className="text-xs text-red-500 mt-1.5 font-medium">
                      {t("SLA:", "SLA:")} {formatDatePT(ticket.sla_deadline)}
                    </p>
                  </div>
                  {ticket.customer_phone && (
                    <a
                      href={`tel:${safeString(ticket.customer_phone)}`}
                      className="flex items-center gap-1.5 text-xs sm:text-sm text-sky-600 hover:text-sky-700 font-medium shrink-0 bg-sky-50 hover:bg-sky-100 px-2.5 py-1.5 rounded-lg transition-colors"
                    >
                      <Phone className="h-3.5 w-3.5" />
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