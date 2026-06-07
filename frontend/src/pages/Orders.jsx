import { useState, useEffect, useMemo } from "react";
import axios from "axios";
import { toast } from "sonner";
import { 
  Plus, Calendar, Truck, MoreHorizontal, Eye, CheckCircle, 
  Download, Loader2, Camera, X, ZoomIn, Filter, Search,
  LayoutGrid, List, Clock, Star, Zap, Package, RefreshCw,
  ChevronDown, ChevronUp, Edit, Trash2, User, MapPin,
  CreditCard, Banknote, Send, FileText
} from "lucide-react";
import { useLocale } from "../context/LocaleContext";
import { formatShortDatePT } from "../utils/dateUtils";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { 
  Dialog, DialogContent, DialogHeader, DialogTitle, 
  DialogTrigger, DialogDescription 
} from "../components/ui/dialog";
import { 
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue 
} from "../components/ui/select";
import { Textarea } from "../components/ui/textarea";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger, DropdownMenuSeparator
} from "../components/ui/dropdown-menu";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Avatar, AvatarFallback } from "../components/ui/avatar";
import { Progress } from "../components/ui/progress";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// ─── CONSTANTS ──────────────────────────────────────────────────────────────

const SERVICE_TYPES = {
  pickup_delivery: { label: "Pickup & Delivery", icon: "🚚", color: "#0ea5e9" },
  wash_fold: { label: "Wash & Fold", icon: "🧺", color: "#8b5cf6" },
  self_service: { label: "Self Service", icon: "🏪", color: "#f59e0b" },
  commercial: { label: "Commercial / B2B", icon: "🏢", color: "#6366f1" },
  airbnb_host: { label: "Airbnb Host", icon: "🏠", color: "#f97316" },
};

const PLAN_LABELS = {
  standard: { label: "Standard", time: "36h", badge: "bg-slate-100 text-slate-700" },
  premium: { label: "Premium", time: "24h", badge: "bg-sky-100 text-sky-700" },
  express: { label: "Express", time: "Same Day", badge: "bg-amber-100 text-amber-700" },
};

const STATUS_LABELS = {
  new: { label: "New", color: "bg-blue-100 text-blue-700", icon: "🆕" },
  confirmed: { label: "Confirmed", color: "bg-cyan-100 text-cyan-700", icon: "✅" },
  pickup_scheduled: { label: "Pickup Scheduled", color: "bg-purple-100 text-purple-700", icon: "📅" },
  picked_up: { label: "Picked Up", color: "bg-indigo-100 text-indigo-700", icon: "📦" },
  processing: { label: "Processing", color: "bg-amber-100 text-amber-700", icon: "🔄" },
  ready: { label: "Ready", color: "bg-emerald-100 text-emerald-700", icon: "✨" },
  out_for_delivery: { label: "Out for Delivery", color: "bg-orange-100 text-orange-700", icon: "🚚" },
  delivered: { label: "Delivered", color: "bg-green-100 text-green-700", icon: "📦" },
  completed: { label: "Completed", color: "bg-emerald-100 text-emerald-700", icon: "🎉" },
  cancelled: { label: "Cancelled", color: "bg-red-100 text-red-700", icon: "❌" },
};

const PAYMENT_STATUS = {
  paid: { label: "Paid", color: "bg-green-100 text-green-700", icon: "💳" },
  pending: { label: "Pending", color: "bg-yellow-100 text-yellow-700", icon: "⏳" },
  refunded: { label: "Refunded", color: "bg-red-100 text-red-700", icon: "↩️" },
  failed: { label: "Failed", color: "bg-red-100 text-red-700", icon: "❌" },
};

const emptyForm = {
  customer_id: "",
  service_type: "pickup_delivery",
  service_plan: "standard",
  pickup_date: "",
  pickup_time_window: "",
  pickup_address: "",
  delivery_address: "",
  estimated_lbs: "",
  notes: "",
  gate_code: "",
  addon_services: [],
};

// ─── UTILITY FUNCTIONS ──────────────────────────────────────────────────────

const normalizeStatus = (status) => 
  (status || "").toString().trim().toLowerCase().replace(/\s+/g, "_");

const getInitials = (name) => 
  name?.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2) || "?";

const formatCurrency = (amount) => 
  amount != null ? `$${parseFloat(amount).toFixed(2)}` : "-";

const formatDate = (dateStr) => 
  dateStr ? formatShortDatePT(dateStr) : "-";

const formatOrderNumber = (order) => {
  if (!order) return "-";
  if (order.order_number?.startsWith("VFL-")) return order.order_number;
  const dateSlug = buildDateSlug(order.pickup_date || order.created_at);
  const raw = (order.order_number || order.id || "00000000").toString();
  const short = raw.replace(/[^a-zA-Z0-9]/g, "").toLowerCase().slice(-8).padStart(8, "0");
  return `VFL-${dateSlug}-${short}`;
};

const buildDateSlug = (dateStr) => {
  if (!dateStr) return new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const safeStr = dateStr.includes("T") ? dateStr : dateStr + "T12:00:00";
  const d = new Date(safeStr);
  if (isNaN(d.getTime())) return new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
};

const getLocalDate = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

// ─── MAIN COMPONENT ─────────────────────────────────────────────────────────

export default function Orders() {
  const { t, locale } = useLocale();
  
  // ─── State ──────────────────────────────────────────────────────────────────
  const [orders, setOrders] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState("table"); // "table" | "cards"
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [viewOrder, setViewOrder] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [weightForm, setWeightForm] = useState({ estimated_lbs: "", actual_lbs: "" });
  const [savingWeights, setSavingWeights] = useState(false);
  
  // Filters
  const [filters, setFilters] = useState({
    status: "all",
    service: "all",
    payment: "all",
    search: "",
    dateFrom: "",
    dateTo: "",
  });
  
  // QR Export
  const [qrStartDate, setQrStartDate] = useState("");
  const [qrEndDate, setQrEndDate] = useState("");
  const [exportingQr, setExportingQr] = useState(false);
  const [qrStatusFilter, setQrStatusFilter] = useState("");
  const [qrServiceFilter, setQrServiceFilter] = useState("");
  const [selectedImage, setSelectedImage] = useState(null);
  
  // ─── Stats ──────────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const total = orders.length;
    const byStatus = {};
    const byService = {};
    const paid = orders.filter(o => (o.payment_status || "").toLowerCase() === "paid").length;
    const pending = orders.filter(o => (o.payment_status || "").toLowerCase() !== "paid").length;
    const totalRevenue = orders.reduce((sum, o) => sum + (parseFloat(o.total_amount) || 0), 0);
    
    orders.forEach(o => {
      const status = normalizeStatus(o.status) || "unknown";
      byStatus[status] = (byStatus[status] || 0) + 1;
      const service = o.service_type || "unknown";
      byService[service] = (byService[service] || 0) + 1;
    });
    
    return { total, byStatus, byService, paid, pending, totalRevenue };
  }, [orders]);
  
  // ─── Data Fetching ─────────────────────────────────────────────────────────
  const fetchOrders = async () => {
    setLoading(true);
    try {
      const params = {};
      if (filters.status !== "all") params.status = filters.status;
      if (filters.service !== "all") params.service_type = filters.service;
      if (filters.dateFrom) params.date_from = filters.dateFrom;
      if (filters.dateTo) params.date_to = filters.dateTo;
      if (filters.search) params.search = filters.search;
      
      const res = await axios.get(`${API}/orders`, { params });
      setOrders(res.data);
    } catch (error) {
      toast.error(t("Error loading orders", "Error cargando órdenes"));
    } finally {
      setLoading(false);
    }
  };

  const fetchCustomers = async () => {
    try {
      const res = await axios.get(`${API}/customers`);
      setCustomers(res.data);
    } catch (error) {
      console.error("Error loading customers");
    }
  };

  const fetchOrderDetails = async (orderId) => {
    setDetailLoading(true);
    try {
      const res = await axios.get(`${API}/operator/orders/${orderId}`);
      setViewOrder(res.data);
      setWeightForm({
        estimated_lbs: res.data.estimated_lbs ?? "",
        actual_lbs: res.data.actual_lbs ?? ""
      });
    } catch (error) {
      toast.error(t("Error loading order details", "Error cargando detalles de la orden"));
    } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
    fetchCustomers();
  }, [filters]);

  // ─── Order CRUD ─────────────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    let correctedTimeWindow = form.pickup_time_window;
    if (correctedTimeWindow === "8am-12am") correctedTimeWindow = "8-12";
    if (correctedTimeWindow === "2pm-6pm") correctedTimeWindow = "14-18";
    
    const today = getLocalDate();
    if (form.pickup_date && form.pickup_date < today) {
      toast.error(t("Pickup date cannot be in the past", "La fecha de recogida no puede ser anterior a hoy"));
      return;
    }

    setSubmitting(true);
    try {
      await axios.post(`${API}/orders`, {
        ...form,
        pickup_time_window: correctedTimeWindow,
        estimated_lbs: form.estimated_lbs ? parseFloat(form.estimated_lbs) : null,
      });
      toast.success(t("Order created", "Orden creada"));
      setDialogOpen(false);
      setForm(emptyForm);
      fetchOrders();
    } catch (error) {
      toast.error(error.response?.data?.detail || t("Error creating order", "Error creando orden"));
    } finally {
      setSubmitting(false);
    }
  };

  const updateStatus = async (orderId, newStatus) => {
    try {
      await axios.patch(`${API}/orders/${orderId}/status?status=${newStatus}`);
      toast.success(t("Status updated", "Estado actualizado"));
      fetchOrders();
    } catch (error) {
      toast.error(error.response?.data?.detail || t("Error updating status", "Error actualizando estado"));
    }
  };

  const updatePaymentStatus = async (orderId, newStatus) => {
    try {
      await axios.patch(`${API}/orders/${orderId}/payment-status?status=${newStatus}`);
      toast.success(t("Payment status updated", "Estado de pago actualizado"));
      fetchOrders();
    } catch (error) {
      toast.error(error.response?.data?.detail || t("Error updating payment status", "Error actualizando estado de pago"));
    }
  };

  const handleUpdateWeights = async () => {
    if (!viewOrder) return;
    setSavingWeights(true);
    try {
      const payload = {
        estimated_lbs: weightForm.estimated_lbs === "" ? null : parseFloat(weightForm.estimated_lbs),
        actual_lbs: weightForm.actual_lbs === "" ? null : parseFloat(weightForm.actual_lbs)
      };
      const res = await axios.put(`${API}/orders/${viewOrder.id}`, payload);
      const updated = res.data;
      toast.success(t("Weights updated", "Libras actualizadas"));
      setViewOrder(updated);
      setOrders(prev => prev.map(o => o.id === updated.id ? { ...o, ...updated } : o));
    } catch (error) {
      toast.error(error.response?.data?.detail || t("Error updating weights", "Error actualizando libras"));
    } finally {
      setSavingWeights(false);
    }
  };

  // ─── QR Export ──────────────────────────────────────────────────────────────
  const handleDownloadQr = async (order) => {
    try {
      const res = await axios.get(`${API}/orders/${order.id}/qr.svg`, { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `ticket-${formatOrderNumber(order)}.svg`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success(t("QR downloaded", "QR descargado"));
    } catch (error) {
      toast.error(t("Error downloading QR", "Error descargando QR"));
    }
  };

  const handleExportQrBatch = async () => {
    if (!qrStartDate || !qrEndDate) {
      toast.error(t("Select a date range", "Selecciona un rango de fechas"));
      return;
    }
    setExportingQr(true);
    try {
      const params = new URLSearchParams({
        start_date: qrStartDate,
        end_date: qrEndDate
      });
      if (qrStatusFilter) params.append("status", qrStatusFilter);
      if (qrServiceFilter) params.append("service_type", qrServiceFilter);
      const res = await axios.get(`${API}/orders/qr/export?${params.toString()}`, { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `qr-export-${qrStartDate}-to-${qrEndDate}.zip`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success(t("QRs downloaded", "QRs descargados"));
    } catch (error) {
      toast.error(t("Error exporting QRs", "Error exportando QRs"));
    } finally {
      setExportingQr(false);
    }
  };

  // ─── Render Helpers ─────────────────────────────────────────────────────────
  const getServiceLabel = (key) => SERVICE_TYPES[key]?.label || key || "-";
  const getServiceIcon = (key) => SERVICE_TYPES[key]?.icon || "📋";
  const getServiceColor = (key) => SERVICE_TYPES[key]?.color || "#64748b";
  const getPlanLabel = (key) => PLAN_LABELS[key]?.label || key || "-";
  const getPlanTime = (key) => PLAN_LABELS[key]?.time || "";
  const getPlanBadge = (key) => PLAN_LABELS[key]?.badge || "bg-slate-100 text-slate-700";
  const getStatusLabel = (key) => STATUS_LABELS[normalizeStatus(key)]?.label || key || "-";
  const getStatusColor = (key) => STATUS_LABELS[normalizeStatus(key)]?.color || "bg-slate-100 text-slate-700";
  const getStatusIcon = (key) => STATUS_LABELS[normalizeStatus(key)]?.icon || "📋";
  const getPaymentLabel = (key) => PAYMENT_STATUS[key?.toLowerCase()]?.label || key || "-";
  const getPaymentColor = (key) => PAYMENT_STATUS[key?.toLowerCase()]?.color || "bg-slate-100 text-slate-700";
  
  const clearFilters = () => {
    setFilters({
      status: "all",
      service: "all",
      payment: "all",
      search: "",
      dateFrom: "",
      dateTo: "",
    });
  };

  // ─── CARD VIEW ──────────────────────────────────────────────────────────────
  const OrderCard = ({ order }) => {
    const status = normalizeStatus(order.status);
    const isPaid = (order.payment_status || "").toLowerCase() === "paid";
    
    return (
      <Card className="hover:shadow-lg transition-all duration-300 cursor-pointer border-l-4" 
        style={{ borderLeftColor: getServiceColor(order.service_type) }}
        onClick={() => fetchOrderDetails(order.id)}
      >
        <CardHeader className="pb-2">
          <div className="flex justify-between items-start">
            <div>
              <CardTitle className="text-sm font-bold">
                {formatOrderNumber(order)}
              </CardTitle>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="outline" className="text-xs">
                  {getServiceIcon(order.service_type)} {getServiceLabel(order.service_type)}
                </Badge>
                {order.service_plan && (
                  <Badge className={`text-xs ${getPlanBadge(order.service_plan)}`}>
                    {getPlanLabel(order.service_plan)}
                  </Badge>
                )}
              </div>
            </div>
            <Badge className={getStatusColor(status)}>
              {getStatusIcon(status)} {getStatusLabel(status)}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="grid grid-cols-2 gap-2 text-xs text-slate-500 mt-2">
            <div className="flex items-center gap-1">
              <User className="w-3 h-3" />
              <span className="truncate">{order.customer_name}</span>
            </div>
            <div className="flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              <span>{formatDate(order.pickup_date)}</span>
            </div>
            <div className="flex items-center gap-1">
              <MapPin className="w-3 h-3" />
              <span className="truncate">{order.pickup_address || "-"}</span>
            </div>
            <div className="flex items-center gap-1 justify-end">
              <span className={isPaid ? "text-green-600 font-bold" : "text-yellow-600 font-bold"}>
                {formatCurrency(order.total_amount)}
              </span>
              <Badge className={`text-[10px] ${getPaymentColor(order.payment_status)}`}>
                {getPaymentLabel(order.payment_status)}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  // ─── TABLE VIEW ─────────────────────────────────────────────────────────────
  const OrderTable = () => (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead className="bg-slate-50 border-b border-slate-200">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
              {t("Order", "Orden")}
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
              {t("Customer", "Cliente")}
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
              {t("Service", "Servicio")}
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
              {t("Plan", "Plan")}
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
              {t("Pickup", "Pickup")}
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
              {t("Status", "Estado")}
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
              {t("Payment", "Pago")}
            </th>
            <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 uppercase tracking-wider">
              {t("Actions", "Acciones")}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {loading ? (
            <tr>
              <td colSpan={8} className="text-center py-8 text-slate-500">
                <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
                {t("Loading...", "Cargando...")}
              </td>
            </tr>
          ) : orders.length === 0 ? (
            <tr>
              <td colSpan={8} className="text-center py-8 text-slate-500">
                {t("No orders found", "No se encontraron órdenes")}
              </td>
            </tr>
          ) : (
            orders.map((order) => {
              const status = normalizeStatus(order.status);
              const isPaid = (order.payment_status || "").toLowerCase() === "paid";
              return (
                <tr key={order.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-mono font-medium text-slate-900 text-sm">
                      {formatOrderNumber(order)}
                    </p>
                    <p className="text-xs text-slate-400">
                      {formatDate(order.created_at)}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-900 text-sm">
                      {order.customer_name}
                    </p>
                    <p className="text-xs text-slate-400 truncate max-w-[120px]">
                      {order.customer_email}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{getServiceIcon(order.service_type)}</span>
                      <span className="text-sm">{getServiceLabel(order.service_type)}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {order.service_plan ? (
                      <Badge className={`text-xs ${getPlanBadge(order.service_plan)}`}>
                        {getPlanLabel(order.service_plan)}
                      </Badge>
                    ) : (
                      <span className="text-slate-400 text-xs">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-3.5 h-3.5 text-slate-400" />
                      <span className="text-sm">{formatDate(order.pickup_date)}</span>
                    </div>
                    {order.pickup_time_window && (
                      <p className="text-xs text-slate-400 mt-0.5">
                        {order.pickup_time_window}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Badge className={getStatusColor(status)}>
                      {getStatusIcon(status)} {getStatusLabel(status)}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-0.5">
                      <Badge className={`text-xs ${getPaymentColor(order.payment_status)}`}>
                        {getPaymentLabel(order.payment_status)}
                      </Badge>
                      <span className="text-xs font-bold text-slate-700">
                        {formatCurrency(order.total_amount)}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuItem onClick={() => fetchOrderDetails(order.id)}>
                          <Eye className="h-4 w-4 mr-2" />
                          {t("View details", "Ver detalles")}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleDownloadQr(order)}>
                          <Download className="h-4 w-4 mr-2" />
                          {t("Download Ticket", "Descargar Ticket")}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {status === "new" && (
                          <DropdownMenuItem onClick={() => updateStatus(order.id, "confirmed")}>
                            <CheckCircle className="h-4 w-4 mr-2" />
                            {t("Confirm", "Confirmar")}
                          </DropdownMenuItem>
                        )}
                        {status === "confirmed" && (
                          <DropdownMenuItem onClick={() => updateStatus(order.id, "pickup_scheduled")}>
                            <Calendar className="h-4 w-4 mr-2" />
                            {t("Schedule Pickup", "Programar Pickup")}
                          </DropdownMenuItem>
                        )}
                        {status === "pickup_scheduled" && (
                          <DropdownMenuItem onClick={() => updateStatus(order.id, "picked_up")}>
                            <Package className="h-4 w-4 mr-2" />
                            {t("Mark Picked Up", "Marcar Recogido")}
                          </DropdownMenuItem>
                        )}
                        {status === "picked_up" && (
                          <DropdownMenuItem onClick={() => updateStatus(order.id, "processing")}>
                            <RefreshCw className="h-4 w-4 mr-2" />
                            {t("Start Processing", "Iniciar Procesamiento")}
                          </DropdownMenuItem>
                        )}
                        {status === "processing" && (
                          <DropdownMenuItem onClick={() => updateStatus(order.id, "ready")}>
                            <Star className="h-4 w-4 mr-2" />
                            {t("Mark Ready", "Marcar Listo")}
                          </DropdownMenuItem>
                        )}
                        {status === "ready" && (
                          <DropdownMenuItem onClick={() => updateStatus(order.id, "out_for_delivery")}>
                            <Truck className="h-4 w-4 mr-2" />
                            {t("Out for Delivery", "En camino")}
                          </DropdownMenuItem>
                        )}
                        {status === "out_for_delivery" && (
                          <DropdownMenuItem onClick={() => updateStatus(order.id, "delivered")}>
                            <CheckCircle className="h-4 w-4 mr-2" />
                            {t("Mark Delivered", "Marcar Entregado")}
                          </DropdownMenuItem>
                        )}
                        {status === "delivered" && (
                          <DropdownMenuItem onClick={() => updateStatus(order.id, "completed")}>
                            <CheckCircle className="h-4 w-4 mr-2" />
                            {t("Complete Order", "Completar Orden")}
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        {!isPaid && (
                          <DropdownMenuItem onClick={() => updatePaymentStatus(order.id, "paid")}>
                            <CreditCard className="h-4 w-4 mr-2" />
                            {t("Mark Paid", "Marcar Pagado")}
                          </DropdownMenuItem>
                        )}
                        {isPaid && (
                          <DropdownMenuItem onClick={() => updatePaymentStatus(order.id, "pending")}>
                            <Clock className="h-4 w-4 mr-2" />
                            {t("Mark Pending", "Marcar Pendiente")}
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        {status !== "cancelled" && (
                          <DropdownMenuItem 
                            onClick={() => updateStatus(order.id, "cancelled")}
                            className="text-red-600"
                          >
                            <X className="h-4 w-4 mr-2" />
                            {t("Cancel Order", "Cancelar Orden")}
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );

  // ─── DASHBOARD STATS ──────────────────────────────────────────────────────
  const DashboardStats = () => (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      <Card className="bg-gradient-to-br from-blue-50 to-cyan-50 border-blue-100">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-blue-600 uppercase tracking-wider">
                {t("Total Orders", "Órdenes Totales")}
              </p>
              <p className="text-2xl font-bold text-slate-800 mt-1">{stats.total}</p>
            </div>
            <div className="bg-blue-100 p-2 rounded-lg">
              <Package className="w-5 h-5 text-blue-600" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-gradient-to-br from-green-50 to-emerald-50 border-green-100">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-green-600 uppercase tracking-wider">
                {t("Paid", "Pagados")}
              </p>
              <p className="text-2xl font-bold text-slate-800 mt-1">{stats.paid}</p>
            </div>
            <div className="bg-green-100 p-2 rounded-lg">
              <CreditCard className="w-5 h-5 text-green-600" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-gradient-to-br from-yellow-50 to-amber-50 border-yellow-100">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-yellow-600 uppercase tracking-wider">
                {t("Pending", "Pendientes")}
              </p>
              <p className="text-2xl font-bold text-slate-800 mt-1">{stats.pending}</p>
            </div>
            <div className="bg-yellow-100 p-2 rounded-lg">
              <Clock className="w-5 h-5 text-yellow-600" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-gradient-to-br from-purple-50 to-pink-50 border-purple-100">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-purple-600 uppercase tracking-wider">
                {t("Revenue", "Ingresos")}
              </p>
              <p className="text-2xl font-bold text-slate-800 mt-1">
                {formatCurrency(stats.totalRevenue)}
              </p>
            </div>
            <div className="bg-purple-100 p-2 rounded-lg">
              <Banknote className="w-5 h-5 text-purple-600" />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  // ─── FILTER BAR ────────────────────────────────────────────────────────────
  const FilterBar = () => (
    <div className="bg-white rounded-xl border border-slate-200 p-4 mb-6 shadow-sm">
      <div className="flex flex-col lg:flex-row gap-3 items-start lg:items-end">
        <div className="flex-1 w-full">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder={t("Search orders...", "Buscar órdenes...")}
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              className="pl-9"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Select
            value={filters.status}
            onValueChange={(v) => setFilters({ ...filters, status: v })}
          >
            <SelectTrigger className="w-[130px]">
              <SelectValue placeholder={t("Status", "Estado")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("All", "Todos")}</SelectItem>
              {Object.entries(STATUS_LABELS).map(([key, val]) => (
                <SelectItem key={key} value={key}>
                  {val.icon} {val.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={filters.service}
            onValueChange={(v) => setFilters({ ...filters, service: v })}
          >
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder={t("Service", "Servicio")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("All", "Todos")}</SelectItem>
              {Object.entries(SERVICE_TYPES).map(([key, val]) => (
                <SelectItem key={key} value={key}>
                  {val.icon} {val.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={filters.payment}
            onValueChange={(v) => setFilters({ ...filters, payment: v })}
          >
            <SelectTrigger className="w-[130px]">
              <SelectValue placeholder={t("Payment", "Pago")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("All", "Todos")}</SelectItem>
              <SelectItem value="paid">💳 {t("Paid", "Pagado")}</SelectItem>
              <SelectItem value="pending">⏳ {t("Pending", "Pendiente")}</SelectItem>
            </SelectContent>
          </Select>

          <Button variant="outline" size="sm" onClick={clearFilters}>
            <X className="h-4 w-4 mr-1" />
            {t("Clear", "Limpiar")}
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant={viewMode === "cards" ? "default" : "outline"}
            size="sm"
            onClick={() => setViewMode("cards")}
            className={viewMode === "cards" ? "bg-sky-600" : ""}
          >
            <LayoutGrid className="h-4 w-4" />
          </Button>
          <Button
            variant={viewMode === "table" ? "default" : "outline"}
            size="sm"
            onClick={() => setViewMode("table")}
            className={viewMode === "table" ? "bg-sky-600" : ""}
          >
            <List className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );

  // ─── QR EXPORT SECTION ────────────────────────────────────────────────────
  const QrExportSection = () => (
    <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 mb-6">
      <div className="flex flex-col lg:flex-row gap-3 items-start lg:items-end">
        <div>
          <Label className="text-xs">{t("Start", "Inicio")}</Label>
          <Input 
            type="date" 
            value={qrStartDate} 
            onChange={(e) => setQrStartDate(e.target.value)} 
            className="h-8 text-sm"
          />
        </div>
        <div>
          <Label className="text-xs">{t("End", "Fin")}</Label>
          <Input 
            type="date" 
            value={qrEndDate} 
            onChange={(e) => setQrEndDate(e.target.value)} 
            className="h-8 text-sm"
          />
        </div>
        <div>
          <Label className="text-xs">{t("Status", "Estado")}</Label>
          <select
            className="h-8 rounded-md border border-slate-200 px-2 text-sm bg-white"
            value={qrStatusFilter}
            onChange={(e) => setQrStatusFilter(e.target.value)}
          >
            <option value="">{t("All", "Todos")}</option>
            {Object.keys(STATUS_LABELS).map(key => (
              <option key={key} value={key}>{STATUS_LABELS[key].label}</option>
            ))}
          </select>
        </div>
        <div>
          <Label className="text-xs">{t("Service", "Servicio")}</Label>
          <select
            className="h-8 rounded-md border border-slate-200 px-2 text-sm bg-white"
            value={qrServiceFilter}
            onChange={(e) => setQrServiceFilter(e.target.value)}
          >
            <option value="">{t("All", "Todos")}</option>
            {Object.keys(SERVICE_TYPES).map(key => (
              <option key={key} value={key}>{SERVICE_TYPES[key].label}</option>
            ))}
          </select>
        </div>
        <Button 
          variant="outline" 
          onClick={handleExportQrBatch} 
          disabled={exportingQr}
          className="h-8"
        >
          <Download className="h-4 w-4 mr-2" />
          {exportingQr ? t("Exporting...", "Exportando...") : t("Export Tickets", "Exportar Tickets")}
        </Button>
      </div>
    </div>
  );

  // ─── MAIN RENDER ───────────────────────────────────────────────────────────
  return (
    <div className="p-4 lg:p-6 max-w-7xl mx-auto bg-slate-50 min-h-screen">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {t("Orders Dashboard", "Panel de Órdenes")}
          </h1>
          <p className="text-slate-500 mt-1">
            {t("Manage all services in one place", "Gestiona todos los servicios en un solo lugar")}
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-sky-600 hover:bg-sky-700">
              <Plus className="h-4 w-4 mr-2" />
              {t("New Order", "Nueva Orden")}
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg bg-white max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{t("Create New Order", "Crear Nueva Orden")}</DialogTitle>
              <DialogDescription>
                {t("Fill in the details below to create a new order", "Completa los detalles abajo para crear una nueva orden")}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>{t("Customer *", "Cliente *")}</Label>
                  <Select 
                    value={form.customer_id} 
                    onValueChange={(v) => setForm({ ...form, customer_id: v })}
                  >
                    <SelectTrigger className="mt-1.5">
                      <SelectValue placeholder={t("Select customer", "Seleccionar cliente")} />
                    </SelectTrigger>
                    <SelectContent>
                      {customers.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>{t("Service Type *", "Tipo de Servicio *")}</Label>
                  <Select 
                    value={form.service_type} 
                    onValueChange={(v) => setForm({ ...form, service_type: v })}
                  >
                    <SelectTrigger className="mt-1.5">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(SERVICE_TYPES).map(([key, val]) => (
                        <SelectItem key={key} value={key}>
                          {val.icon} {val.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label>{t("Service Plan *", "Plan de Servicio *")}</Label>
                <Select 
                  value={form.service_plan} 
                  onValueChange={(v) => setForm({ ...form, service_plan: v })}
                >
                  <SelectTrigger className="mt-1.5">
                    <SelectValue placeholder={t("Select plan", "Seleccionar plan")} />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(PLAN_LABELS).map(([key, val]) => (
                      <SelectItem key={key} value={key}>
                        {val.label} ({val.time})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>{t("Pickup Date", "Fecha de Pickup")}</Label>
                  <Input
                    type="date"
                    value={form.pickup_date}
                    onChange={(e) => setForm({ ...form, pickup_date: e.target.value })}
                    className="mt-1.5"
                    min={getLocalDate()}
                  />
                </div>
                <div>
                  <Label>{t("Time Window", "Ventana de Tiempo")}</Label>
                  <Select 
                    value={form.pickup_time_window} 
                    onValueChange={(v) => setForm({ ...form, pickup_time_window: v })}
                  >
                    <SelectTrigger className="mt-1.5">
                      <SelectValue placeholder={t("Select", "Seleccionar")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="8-12">8am - 12am</SelectItem>
                      <SelectItem value="14-18">2pm - 6pm</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label>{t("Pickup Address", "Dirección de Pickup")}</Label>
                <Input
                  value={form.pickup_address}
                  onChange={(e) => setForm({ ...form, pickup_address: e.target.value })}
                  className="mt-1.5"
                  placeholder={t("Uses customer address if empty", "Se usará la dirección del cliente si está vacío")}
                />
              </div>

              <div>
                <Label>{t("Delivery Address", "Dirección de Entrega")}</Label>
                <Input
                  value={form.delivery_address}
                  onChange={(e) => setForm({ ...form, delivery_address: e.target.value })}
                  className="mt-1.5"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>{t("Estimated Lbs", "Libras Estimadas")}</Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={form.estimated_lbs}
                    onChange={(e) => setForm({ ...form, estimated_lbs: e.target.value })}
                    className="mt-1.5"
                  />
                </div>
                <div>
                  <Label>{t("Gate Code", "Código de acceso")}</Label>
                  <Input
                    value={form.gate_code}
                    onChange={(e) => setForm({ ...form, gate_code: e.target.value })}
                    className="mt-1.5"
                  />
                </div>
              </div>

              <div>
                <Label>{t("Notes", "Notas")}</Label>
                <Textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className="mt-1.5"
                  rows={2}
                />
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                  {t("Cancel", "Cancelar")}
                </Button>
                <Button 
                  type="submit" 
                  className="bg-sky-600 hover:bg-sky-700"
                  disabled={submitting || !form.customer_id}
                >
                  {submitting ? t("Creating...", "Creando...") : t("Create Order", "Crear Orden")}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* ── Stats ── */}
      <DashboardStats />

      {/* ── Filters ── */}
      <FilterBar />

      {/* ── QR Export ── */}
      <QrExportSection />

      {/* ── Orders View ── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {viewMode === "cards" ? (
          <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {loading ? (
              <div className="col-span-full text-center py-8 text-slate-500">
                <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />
                {t("Loading...", "Cargando...")}
              </div>
            ) : orders.length === 0 ? (
              <div className="col-span-full text-center py-8 text-slate-500">
                {t("No orders found", "No se encontraron órdenes")}
              </div>
            ) : (
              orders.map(order => (
                <OrderCard key={order.id} order={order} />
              ))
            )}
          </div>
        ) : (
          <OrderTable />
        )}
      </div>

      {/* ── Order Detail Modal ── */}
      <Dialog open={!!viewOrder} onOpenChange={() => setViewOrder(null)}>
        <DialogContent className="sm:max-w-3xl bg-white p-0 max-h-[90vh] flex flex-col">
          <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-white z-10">
            <DialogHeader className="p-0">
              <DialogTitle className="text-xl">
                {t("Order", "Orden")} <span className="font-mono text-sky-600">
                  {formatOrderNumber(viewOrder)}
                </span>
              </DialogTitle>
              <DialogDescription>
                {t("Order details and laundry preferences.", "Detalle de la orden y preferencias de lavado.")}
              </DialogDescription>
            </DialogHeader>
            <Button variant="ghost" size="icon" onClick={() => setViewOrder(null)} className="rounded-full">
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {detailLoading ? (
              <div className="py-12 text-center text-slate-500 flex justify-center items-center gap-2">
                <Loader2 className="h-6 w-6 animate-spin" />
                {t("Loading...", "Cargando...")}
              </div>
            ) : viewOrder ? (
              <>
                {/* ── Summary Card ── */}
                <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div>
                      <p className="text-xs text-slate-500">{t("Customer", "Cliente")}</p>
                      <p className="font-medium">{viewOrder.customer_name}</p>
                      <p className="text-xs text-slate-400">{viewOrder.customer_email}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">{t("Service", "Servicio")}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-lg">{getServiceIcon(viewOrder.service_type)}</span>
                        <span className="font-medium">{getServiceLabel(viewOrder.service_type)}</span>
                      </div>
                      {viewOrder.service_plan && (
                        <Badge className={`mt-1 ${getPlanBadge(viewOrder.service_plan)}`}>
                          {getPlanLabel(viewOrder.service_plan)}
                        </Badge>
                      )}
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">{t("Pickup", "Pickup")}</p>
                      <p className="font-medium">{formatDate(viewOrder.pickup_date)}</p>
                      <p className="text-xs text-slate-400">{viewOrder.pickup_time_window || "-"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">{t("Status", "Estado")}</p>
                      <Badge className={getStatusColor(viewOrder.status)}>
                        {getStatusIcon(viewOrder.status)} {getStatusLabel(viewOrder.status)}
                      </Badge>
                      <p className="text-xs text-slate-400 mt-1">
                        {t("Payment", "Pago")}: {getPaymentLabel(viewOrder.payment_status)}
                      </p>
                    </div>
                  </div>
                </div>

                {/* ── Addresses ── */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                    <p className="text-xs text-slate-500 mb-1">{t("Pickup Address", "Dirección Pickup")}</p>
                    <p className="font-medium">{viewOrder.pickup_address || "-"}</p>
                    {viewOrder.gate_code && (
                      <p className="text-xs text-amber-600 mt-1">
                        🔑 {t("Gate code", "Código de acceso")}: {viewOrder.gate_code}
                      </p>
                    )}
                  </div>
                  <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                    <p className="text-xs text-slate-500 mb-1">{t("Delivery Address", "Dirección Entrega")}</p>
                    <p className="font-medium">{viewOrder.delivery_address || "-"}</p>
                  </div>
                </div>

                {/* ── Notes ── */}
                {viewOrder.notes && (
                  <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                    <p className="text-xs text-slate-500 mb-1">{t("Notes", "Notas")}</p>
                    <p className="text-sm whitespace-pre-wrap">{viewOrder.notes}</p>
                  </div>
                )}

                {/* ── Weight & Billing ── */}
                <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                  <h3 className="font-semibold text-slate-700 mb-3">
                    {t("Weight & Billing", "Peso y facturación")}
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <p className="text-xs text-slate-500">{t("Est. Lbs", "Est. Lbs")}</p>
                      <Input
                        type="number"
                        step="0.1"
                        value={weightForm.estimated_lbs}
                        onChange={(e) => setWeightForm({ ...weightForm, estimated_lbs: e.target.value })}
                        className="mt-1"
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
                      />
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">{t("Total", "Total")}</p>
                      <p className="font-bold text-xl">
                        {formatCurrency(viewOrder.total_amount)}
                      </p>
                      {viewOrder.membership_discount > 0 && (
                        <p className="text-xs text-green-600">
                          {t("Membership discount", "Descuento membresía")}: -{formatCurrency(viewOrder.membership_discount)}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2 mt-4">
                    <Button variant="outline" size="sm" onClick={handleUpdateWeights} disabled={savingWeights}>
                      {savingWeights ? t("Saving...", "Guardando...") : t("Update Weights", "Actualizar Pesos")}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => handleDownloadQr(viewOrder)}>
                      <Download className="h-4 w-4 mr-2" />
                      {t("Ticket", "Ticket")}
                    </Button>
                  </div>
                </div>

                {/* ── Evidence Images ── */}
                {(viewOrder.pickup_image_data || viewOrder.delivery_image_data || viewOrder.weight_image_data) && (
                  <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                    <h3 className="font-semibold text-slate-700 mb-3">
                      {t("Evidence Images", "Imágenes de evidencia")}
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      {viewOrder.pickup_image_data && (
                        <div 
                          className="cursor-pointer group relative"
                          onClick={() => setSelectedImage({ 
                            url: `data:image/jpeg;base64,${viewOrder.pickup_image_data}`, 
                            label: t("Pickup", "Recogida") 
                          })}
                        >
                          <img
                            src={`data:image/jpeg;base64,${viewOrder.pickup_image_data}`}
                            alt="Pickup"
                            className="w-full h-32 object-cover rounded-lg"
                          />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-lg">
                            <ZoomIn className="w-8 h-8 text-white" />
                          </div>
                          <p className="text-xs text-slate-500 mt-1">{t("Pickup", "Recogida")}</p>
                        </div>
                      )}
                      {viewOrder.delivery_image_data && (
                        <div 
                          className="cursor-pointer group relative"
                          onClick={() => setSelectedImage({ 
                            url: `data:image/jpeg;base64,${viewOrder.delivery_image_data}`, 
                            label: t("Delivery", "Entrega") 
                          })}
                        >
                          <img
                            src={`data:image/jpeg;base64,${viewOrder.delivery_image_data}`}
                            alt="Delivery"
                            className="w-full h-32 object-cover rounded-lg"
                          />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-lg">
                            <ZoomIn className="w-8 h-8 text-white" />
                          </div>
                          <p className="text-xs text-slate-500 mt-1">{t("Delivery", "Entrega")}</p>
                        </div>
                      )}
                      {viewOrder.weight_image_data && (
                        <div 
                          className="cursor-pointer group relative"
                          onClick={() => setSelectedImage({ 
                            url: `data:image/jpeg;base64,${viewOrder.weight_image_data}`, 
                            label: t("Weight", "Peso") 
                          })}
                        >
                          <img
                            src={`data:image/jpeg;base64,${viewOrder.weight_image_data}`}
                            alt="Weight"
                            className="w-full h-32 object-cover rounded-lg"
                          />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-lg">
                            <ZoomIn className="w-8 h-8 text-white" />
                          </div>
                          <p className="text-xs text-slate-500 mt-1">{t("Weight", "Peso")}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Image Zoom Modal ── */}
      <Dialog open={!!selectedImage} onOpenChange={() => setSelectedImage(null)}>
        <DialogContent className="max-w-[90vw] w-auto p-0 bg-transparent border-none shadow-none">
          <div className="relative">
            <img
              src={selectedImage?.url}
              alt={selectedImage?.label}
              className="max-w-full max-h-[85vh] rounded-xl shadow-2xl"
            />
            <button
              onClick={() => setSelectedImage(null)}
              className="absolute top-2 right-2 bg-black/50 text-white rounded-full p-1.5 hover:bg-black/70"
            >
              <X className="w-5 h-5" />
            </button>
            {selectedImage?.label && (
              <div className="absolute bottom-2 left-2 bg-black/50 text-white text-xs px-2 py-1 rounded">
                {selectedImage.label}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}