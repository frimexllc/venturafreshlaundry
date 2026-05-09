import { useState, useEffect } from "react";
import axios from "axios";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "../components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Textarea } from "../components/ui/textarea";
import { toast } from "sonner";
import { Plus, Search, Calendar, Truck, MoreHorizontal, Eye, CheckCircle, Download } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "../components/ui/dropdown-menu";
import { useLocale } from "../context/LocaleContext";
import { formatShortDatePT } from "../utils/dateUtils"; // ← CORREGIDO: usamos la función que ya tiene ensureLocalNoon

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const normalizeStatus = (status) =>
  (status || "")
    .toString()
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");

const preferenceLabels = {
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

const emptyForm = {
  customer_id: "",
  service_type: "pickup_delivery",
  pickup_date: "",
  pickup_time_window: "",
  pickup_address: "",
  delivery_address: "",
  estimated_lbs: "",
  notes: "",
  gate_code: ""
};

export default function Orders() {
  const { t, locale } = useLocale();
  const [orders, setOrders] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [viewOrder, setViewOrder] = useState(null);
  const [weightForm, setWeightForm] = useState({ estimated_lbs: "", actual_lbs: "" });
  const [savingWeights, setSavingWeights] = useState(false);
  const [qrStartDate, setQrStartDate] = useState("");
  const [qrEndDate, setQrEndDate] = useState("");
  const [exportingQr, setExportingQr] = useState(false);
  const [qrStatusFilter, setQrStatusFilter] = useState("");
  const [qrServiceFilter, setQrServiceFilter] = useState("");

  const statusLabels = {
    new: { label: t("New", "Nueva"), class: "badge-pending" },
    processing: { label: t("Processing", "Procesando"), class: "badge-processing" },
    ready: { label: t("Ready", "Lista"), class: "badge-processing" },
    out_for_delivery: { label: t("Out for delivery", "En camino"), class: "badge-processing" },
    delivered: { label: t("Delivered", "Entregada"), class: "badge-completed" },
    completed: { label: t("Completed", "Completada"), class: "badge-completed" },
    cancelled: { label: t("Cancelled", "Cancelada"), class: "badge-cancelled" }
  };

  const getStatusMeta = (status) =>
    statusLabels[normalizeStatus(status)] || { label: status || "-", class: "badge-pending" };

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

  const getServiceLabel = (key) => {
    const map = {
      pickup_delivery: t("Pickup & Delivery", "Recogida y Entrega"),
      wash_fold: t("Wash & Fold", "Lavado y Doblado"),
      self_service: t("Self Service", "Autoservicio"),
      commercial: t("Commercial / B2B", "Comercial / B2B"),
      airbnb_host: t("Airbnb Host", "Anfitrión Airbnb")
    };
    return map[key] || key;
  };

  useEffect(() => {
    fetchOrders();
    fetchCustomers();
  }, [statusFilter]);

  useEffect(() => {
    if (viewOrder) {
      setWeightForm({
        estimated_lbs: viewOrder.estimated_lbs ?? "",
        actual_lbs: viewOrder.actual_lbs ?? ""
      });
    }
  }, [viewOrder]);

  const fetchOrders = async () => {
    try {
      const params = statusFilter !== "all" ? { status: statusFilter } : {};
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

  const getLocalDate = () => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    let correctedTimeWindow = form.pickup_time_window;
    if (correctedTimeWindow === "8am-12am") correctedTimeWindow = "8-12";
    if (correctedTimeWindow === "2pm-6pm") correctedTimeWindow = "14-18";
    
    let correctedPickupDate = form.pickup_date;
    if (correctedPickupDate) {
      const [year, month, day] = correctedPickupDate.split('-');
      correctedPickupDate = `${year}-${month}-${day}`;
    }
    
    const today = getLocalDate();
    if (correctedPickupDate && correctedPickupDate < today) {
      toast.error(t("Pickup date cannot be in the past", "La fecha de recogida no puede ser anterior a hoy"));
      return;
    }

    setSubmitting(true);
    try {
      const data = {
        ...form,
        pickup_time_window: correctedTimeWindow,
        pickup_date: correctedPickupDate,
        estimated_lbs: form.estimated_lbs ? parseFloat(form.estimated_lbs) : null
      };
      console.log("Enviando orden:", data);
      await axios.post(`${API}/orders`, data);
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
      setOrders((prev) => prev.map((order) => (order.id === updated.id ? { ...order, ...updated } : order)));
    } catch (error) {
      toast.error(error.response?.data?.detail || t("Error updating weights", "Error actualizando libras"));
    } finally {
      setSavingWeights(false);
    }
  };

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

  // ─── CORREGIDO: se usa formatShortDatePT (ya arreglada con ensureLocalNoon) ───
  const formatDate = (dateStr) => {
    if (!dateStr) return "-";
    return formatShortDatePT(dateStr);
  };

  const buildDateSlug = (dateStr) => {
    if (!dateStr) return new Date().toISOString().slice(0, 10).replace(/-/g, "");
    // Usamos la misma lógica que ensureLocalNoon para evitar desfase
    const safeStr = dateStr.includes("T") ? dateStr : dateStr + "T12:00:00";
    const d = new Date(safeStr);
    if (isNaN(d.getTime())) return new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}${month}${day}`;
  };

  const formatOrderNumber = (order) => {
    if (!order) return "-";
    if (order.order_number && order.order_number.startsWith("VFL-")) return order.order_number;
    const dateSlug = buildDateSlug(order.pickup_date || order.created_at);
    const raw = (order.order_number || order.id || "00000000").toString();
    const short = raw.replace(/[^a-zA-Z0-9]/g, "").toLowerCase().slice(-8).padStart(8, "0");
    return `VFL-${dateSlug}-${short}`;
  };

  const getWeightDelta = () => {
    const est = parseFloat(weightForm.estimated_lbs);
    const act = parseFloat(weightForm.actual_lbs);
    if (isNaN(est) || isNaN(act)) return "-";
    const diff = parseFloat((act - est).toFixed(2));
    return diff > 0 ? `+${diff}` : `${diff}`;
  };

  const renderPreferenceValue = (value) => {
    if (Array.isArray(value)) return value.length ? value.join(", ") : "-";
    if (value === null || value === undefined || value === "") return "-";
    return value.toString();
  };

  return (
    <div data-testid="orders-page" className="space-y-6 bg-white">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t("Orders", "Órdenes")}</h1>
          <p className="text-slate-500 mt-1">{t("Manage pickups and deliveries", "Gestiona pickups y entregas")}</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="btn-primary" data-testid="add-order-btn">
              <Plus className="h-4 w-4 mr-2" />
              {t("New Order", "Nueva Orden")}
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg bg-white" style={{ backgroundColor: 'white', opacity: 1 }}>
            <DialogHeader>
              <DialogTitle>{t("New Order", "Nueva Orden")}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 mt-4">
              <div>
                <Label>{t("Customer *", "Cliente *")}</Label>
                <Select value={form.customer_id} onValueChange={(v) => setForm({ ...form, customer_id: v })}>
                  <SelectTrigger className="mt-1.5" data-testid="order-customer-select">
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
                <Select value={form.service_type} onValueChange={(v) => setForm({ ...form, service_type: v })}>
                  <SelectTrigger className="mt-1.5" data-testid="order-service-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pickup_delivery">{t("Pickup & Delivery", "Pickup & Delivery")}</SelectItem>
                    <SelectItem value="wash_fold">{t("Wash & Fold", "Wash & Fold")}</SelectItem>
                    <SelectItem value="self_service">{t("Self Service", "Self Service")}</SelectItem>
                    <SelectItem value="commercial">{t("Commercial / B2B", "Comercial / B2B")}</SelectItem>
                    <SelectItem value="airbnb_host">{t("Airbnb Host", "Anfitrión Airbnb")}</SelectItem>
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
                    data-testid="order-date-input"
                  />
                </div>
                <div>
                  <Label>{t("Time Window", "Ventana de Tiempo")}</Label>
                  <Select value={form.pickup_time_window} onValueChange={(v) => setForm({ ...form, pickup_time_window: v })}>
                    <SelectTrigger className="mt-1.5" data-testid="order-time-select">
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
                  data-testid="order-pickup-address-input"
                />
              </div>
              <div>
                <Label>{t("Delivery Address", "Dirección de Entrega")}</Label>
                <Input
                  value={form.delivery_address}
                  onChange={(e) => setForm({ ...form, delivery_address: e.target.value })}
                  className="mt-1.5"
                  data-testid="order-delivery-address-input"
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
                    data-testid="order-lbs-input"
                  />
                </div>
                <div>
                  <Label>{t("Gate Code", "Código de acceso")}</Label>
                  <Input
                    value={form.gate_code}
                    onChange={(e) => setForm({ ...form, gate_code: e.target.value })}
                    className="mt-1.5"
                    data-testid="order-gate-input"
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
                  data-testid="order-notes-input"
                />
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} data-testid="order-cancel-btn">
                  {t("Cancel", "Cancelar")}
                </Button>
                <Button type="submit" className="btn-primary" disabled={submitting || !form.customer_id} data-testid="order-submit-btn">
                  {submitting ? t("Creating...", "Creando...") : t("Create Order", "Crear Orden")}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filtros de estado */}
      <div className="flex gap-2 flex-wrap">
        {["all", "new", "processing", "ready", "out_for_delivery", "delivered", "completed", "cancelled"].map((status) => (
          <Button
            key={status}
            variant={statusFilter === status ? "default" : "outline"}
            size="sm"
            onClick={() => setStatusFilter(status)}
            className={statusFilter === status ? "bg-sky-600 hover:bg-sky-700" : ""}
            data-testid={`filter-${status}`}
          >
            {status === "all" ? t("All", "Todas") : statusLabels[status]?.label || status}
          </Button>
        ))}
      </div>

      {/* Exportación de tickets QR */}
      <div className="flex flex-col lg:flex-row gap-3 items-start lg:items-end">
        <div>
          <Label>{t("Start", "Inicio")}</Label>
          <Input type="date" value={qrStartDate} onChange={(e) => setQrStartDate(e.target.value)} data-testid="qr-start-date" />
        </div>
        <div>
          <Label>{t("End", "Fin")}</Label>
          <Input type="date" value={qrEndDate} onChange={(e) => setQrEndDate(e.target.value)} data-testid="qr-end-date" />
        </div>
        <div>
          <Label>{t("Status", "Estado")}</Label>
          <select
            className="h-9 rounded-md border border-slate-200 px-2 text-sm"
            value={qrStatusFilter}
            onChange={(e) => setQrStatusFilter(e.target.value)}
            data-testid="qr-status-filter"
          >
            <option value="">{t("All", "Todos")}</option>
            <option value="new">{t("New", "Nueva")}</option>
            <option value="processing">{t("Processing", "Procesando")}</option>
            <option value="ready">{t("Ready", "Lista")}</option>
            <option value="out_for_delivery">{t("Out for delivery", "En camino")}</option>
            <option value="delivered">{t("Delivered", "Entregada")}</option>
            <option value="completed">{t("Completed", "Completada")}</option>
            <option value="cancelled">{t("Cancelled", "Cancelada")}</option>
          </select>
        </div>
        <div>
          <Label>{t("Service", "Servicio")}</Label>
          <select
            className="h-9 rounded-md border border-slate-200 px-2 text-sm"
            value={qrServiceFilter}
            onChange={(e) => setQrServiceFilter(e.target.value)}
            data-testid="qr-service-filter"
          >
            <option value="">{t("All", "Todos")}</option>
            <option value="pickup_delivery">{t("Pickup & Delivery", "Pickup & Delivery")}</option>
            <option value="wash_fold">{t("Wash & Fold", "Wash & Fold")}</option>
            <option value="self_service">{t("Self Service", "Self Service")}</option>
            <option value="commercial">{t("Commercial / B2B", "Comercial / B2B")}</option>
            <option value="airbnb_host">{t("Airbnb Host", "Anfitrión Airbnb")}</option>
          </select>
        </div>
        <Button variant="outline" onClick={handleExportQrBatch} disabled={exportingQr} data-testid="qr-export-button">
          <Download className="h-4 w-4 mr-2" />
          {exportingQr ? t("Exporting...", "Exportando...") : t("Export Tickets", "Exportar Tickets")}
        </Button>
      </div>

      {/* Modal de detalle de orden */}
      <Dialog open={!!viewOrder} onOpenChange={() => setViewOrder(null)}>
        <DialogContent className="sm:max-w-lg bg-white" style={{ backgroundColor: 'white', opacity: 1 }}>
          <DialogHeader>
            <DialogTitle>{t("Order", "Orden")} <span data-testid="order-detail-number">{formatOrderNumber(viewOrder)}</span></DialogTitle>
            <DialogDescription data-testid="order-detail-description">
              {t("Order details and laundry preferences.", "Detalle de la orden y preferencias de lavado.")}
            </DialogDescription>
          </DialogHeader>
          {viewOrder && (
            <div className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-slate-500">{t("Customer", "Cliente")}</p>
                  <p className="font-medium" data-testid="order-detail-customer">{viewOrder.customer_name}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-500">{t("Service", "Servicio")}</p>
                  <p className="font-medium" data-testid="order-detail-service">{getServiceLabel(viewOrder.service_type) || viewOrder.service_type || "-"}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-500">{t("Pickup Date", "Fecha Pickup")}</p>
                  <p className="font-medium" data-testid="order-detail-pickup-date">{formatDate(viewOrder.pickup_date)}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-500">{t("Time Window", "Ventana de tiempo")}</p>
                  <p className="font-medium" data-testid="order-detail-pickup-window">{viewOrder.pickup_time_window || "-"}</p>
                </div>
              </div>
              <div>
                <p className="text-sm text-slate-500">{t("Pickup Address", "Dirección Pickup")}</p>
                <p className="font-medium" data-testid="order-detail-pickup-address">{viewOrder.pickup_address || "-"}</p>
              </div>
              <div>
                <p className="text-sm text-slate-500">{t("Delivery Address", "Dirección Entrega")}</p>
                <p className="font-medium" data-testid="order-detail-delivery-address">{viewOrder.delivery_address || "-"}</p>
              </div>
              {viewOrder.notes && (
                <div>
                  <p className="text-sm text-slate-500">{t("Notes", "Notas")}</p>
                  <p className="font-medium" data-testid="order-detail-notes">{viewOrder.notes}</p>
                </div>
              )}
              <div className="border-t pt-3" data-testid="order-preferences-section">
                <p className="text-sm text-slate-500">{t("Laundry preferences", "Preferencias de lavado")}</p>
                {viewOrder.preferences_snapshot ? (
                  <div className="grid grid-cols-2 gap-3 mt-2">
                    {Object.entries(preferenceLabels).map(([key]) => (
                      <div key={key}>
                        <p className="text-xs text-slate-500">{getPreferenceLabel(key)}</p>
                        <p className="font-medium" data-testid={`order-pref-${key}`}>
                          {renderPreferenceValue(viewOrder.preferences_snapshot?.[key])}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm font-medium text-slate-600 mt-1" data-testid="order-pref-empty">
                    {t("No preferences recorded", "Sin preferencias registradas")}
                  </p>
                )}
                <p className="text-xs text-slate-500 mt-2" data-testid="order-pref-id">
                  {t("PREF:", "PREF:")} {viewOrder.preferences_id || "N/A"}
                </p>
              </div>
              <div className="grid grid-cols-3 gap-4 pt-2 border-t">
                <div>
                  <p className="text-sm text-slate-500">{t("Est. Lbs", "Est. Lbs")}</p>
                  <Input
                    type="number"
                    step="0.1"
                    value={weightForm.estimated_lbs}
                    onChange={(e) => setWeightForm({ ...weightForm, estimated_lbs: e.target.value })}
                    className="mt-1"
                    data-testid="order-estimated-lbs-input"
                  />
                </div>
                <div>
                  <p className="text-sm text-slate-500">{t("Actual Lbs", "Actual Lbs")}</p>
                  <Input
                    type="number"
                    step="0.1"
                    value={weightForm.actual_lbs}
                    onChange={(e) => setWeightForm({ ...weightForm, actual_lbs: e.target.value })}
                    className="mt-1"
                    data-testid="order-actual-lbs-input"
                  />
                </div>
                <div>
                  <p className="text-sm text-slate-500">{t("Difference", "Diferencia")}</p>
                  <p className="font-medium" data-testid="order-detail-lbs-delta">{getWeightDelta()}</p>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <div>
                  <p className="text-sm text-slate-500">{t("Total", "Total")}</p>
                  <p className="font-medium" data-testid="order-detail-total">{viewOrder.total_amount ? `$${viewOrder.total_amount}` : "-"}</p>
                </div>
                <div className="flex items-end justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleUpdateWeights}
                    disabled={savingWeights}
                    data-testid="order-save-lbs"
                  >
                    {savingWeights ? t("Saving...", "Guardando...") : t("Save lbs", "Guardar libras")}
                  </Button>
                </div>
              </div>
              <div className="flex justify-end">
                <Button variant="outline" size="sm" onClick={() => handleDownloadQr(viewOrder)} data-testid="order-detail-download-qr">
                  <Download className="h-4 w-4 mr-2" />
                  {t("Download Ticket", "Descargar Ticket")}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Tabla de órdenes */}
      <div className="table-card">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left text-xs font-semibold text-slate-600 uppercase tracking-wider px-6 py-3">{t("Order", "Orden")}</th>
                <th className="text-left text-xs font-semibold text-slate-600 uppercase tracking-wider px-6 py-3">{t("Customer", "Cliente")}</th>
                <th className="text-left text-xs font-semibold text-slate-600 uppercase tracking-wider px-6 py-3">{t("Service", "Servicio")}</th>
                <th className="text-left text-xs font-semibold text-slate-600 uppercase tracking-wider px-6 py-3">{t("Pickup", "Pickup")}</th>
                <th className="text-left text-xs font-semibold text-slate-600 uppercase tracking-wider px-6 py-3">{t("Status", "Estado")}</th>
                <th className="text-left text-xs font-semibold text-slate-600 uppercase tracking-wider px-6 py-3">{t("Payment", "Pago")}</th>
                <th className="text-right text-xs font-semibold text-slate-600 uppercase tracking-wider px-6 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-slate-500">{t("Loading...", "Cargando...")}</td>
                </tr>
              ) : orders.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-slate-500">{t("No orders", "No hay órdenes")}</td>
                </tr>
              ) : (
                orders.map((order) => {
                  const normalizedStatus = normalizeStatus(order.status);
                  const statusMeta = getStatusMeta(order.status);
                  const paymentIsPaid = (order.payment_status || "").toLowerCase() === "paid";
                  return (
                    <tr key={order.id} className="hover:bg-slate-50/50" data-testid={`order-row-${order.id}`}>
                      <td className="px-6 py-4">
                        <p className="font-mono font-medium text-slate-900" data-testid={`order-number-${order.id}`}>{formatOrderNumber(order)}</p>
                        <p className="text-xs text-slate-400" data-testid={`order-created-${order.id}`}>{formatDate(order.created_at)}</p>
                      </td>
                      <td className="px-6 py-4">
                        <p className="font-medium text-slate-900" data-testid={`order-customer-${order.id}`}>{order.customer_name}</p>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <Truck className="h-4 w-4 text-slate-400" />
                          <span className="text-sm" data-testid={`order-service-${order.id}`}>{getServiceLabel(order.service_type) || order.service_type || "-"}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-slate-400" />
                          <span className="text-sm" data-testid={`order-pickup-${order.id}`}>{formatDate(order.pickup_date)}</span>
                        </div>
                        {order.pickup_time_window && (
                          <p className="text-xs text-slate-400 mt-0.5" data-testid={`order-pickup-window-${order.id}`}>{order.pickup_time_window}</p>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <span className={statusMeta.class} data-testid={`order-status-${order.id}`}>
                          {statusMeta.label}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={paymentIsPaid ? "badge-completed" : "badge-pending"} data-testid={`order-payment-${order.id}`}>
                          {paymentIsPaid ? t("Paid", "Pagado") : t("Pending", "Pendiente")}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" data-testid={`order-actions-${order.id}`}>
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem data-testid={`order-view-${order.id}`} onClick={() => setViewOrder(order)}>
                              <Eye className="h-4 w-4 mr-2" />
                              {t("View details", "Ver detalles")}
                            </DropdownMenuItem>
                            <DropdownMenuItem data-testid={`order-download-qr-${order.id}`} onClick={() => handleDownloadQr(order)}>
                              <Download className="h-4 w-4 mr-2" />
                              {t("Download Ticket", "Descargar Ticket")}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            {normalizedStatus === "new" && (
                              <DropdownMenuItem data-testid={`order-status-processing-${order.id}`} onClick={() => updateStatus(order.id, "processing")}>
                                <CheckCircle className="h-4 w-4 mr-2" />
                                {t("Mark as Processing", "Marcar Procesando")}
                              </DropdownMenuItem>
                            )}
                            {normalizedStatus === "processing" && (
                              <DropdownMenuItem data-testid={`order-status-ready-${order.id}`} onClick={() => updateStatus(order.id, "ready")}>
                                <CheckCircle className="h-4 w-4 mr-2" />
                                {t("Mark as Ready", "Marcar Lista")}
                              </DropdownMenuItem>
                            )}
                            {normalizedStatus === "ready" && (
                              <DropdownMenuItem data-testid={`order-status-out-delivery-${order.id}`} onClick={() => updateStatus(order.id, "out_for_delivery")}>
                                <Truck className="h-4 w-4 mr-2" />
                                {t("Out for delivery", "En camino")}
                              </DropdownMenuItem>
                            )}
                            {normalizedStatus === "out_for_delivery" && (
                              <DropdownMenuItem data-testid={`order-status-delivered-${order.id}`} onClick={() => updateStatus(order.id, "delivered")}>
                                <CheckCircle className="h-4 w-4 mr-2" />
                                {t("Mark as Delivered", "Marcar Entregada")}
                              </DropdownMenuItem>
                            )}
                            {normalizedStatus === "delivered" && (
                              <DropdownMenuItem data-testid={`order-status-completed-${order.id}`} onClick={() => updateStatus(order.id, "completed")}>
                                <CheckCircle className="h-4 w-4 mr-2" />
                                {t("Complete Order", "Completar Orden")}
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            {!paymentIsPaid && (
                              <DropdownMenuItem data-testid={`order-payment-paid-${order.id}`} onClick={() => updatePaymentStatus(order.id, "paid")}>
                                <CheckCircle className="h-4 w-4 mr-2 text-green-600" />
                                {t("Mark as Paid", "Marcar como Pagado")}
                              </DropdownMenuItem>
                            )}
                            {paymentIsPaid && (
                              <DropdownMenuItem data-testid={`order-payment-pending-${order.id}`} onClick={() => updatePaymentStatus(order.id, "pending")}>
                                <CheckCircle className="h-4 w-4 mr-2 text-orange-600" />
                                {t("Mark as Pending", "Marcar como Pendiente")}
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            {normalizedStatus !== "cancelled" && (
                              <DropdownMenuItem data-testid={`order-status-cancel-${order.id}`} onClick={() => updateStatus(order.id, "cancelled")} className="text-red-600">
                                <CheckCircle className="h-4 w-4 mr-2" />
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
      </div>
    </div>
  );
}