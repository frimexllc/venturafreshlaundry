import { useState, useEffect } from "react";
import axios from "axios";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "../components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Textarea } from "../components/ui/textarea";
import { toast } from "sonner";
import { Plus, Search, Calendar, Truck, MoreHorizontal, Eye, CheckCircle, Download } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "../components/ui/dropdown-menu";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const statusLabels = {
  new: { label: "Nueva", class: "badge-pending" },
  processing: { label: "Procesando", class: "badge-processing" },
  ready: { label: "Lista", class: "badge-processing" },
  out_for_delivery: { label: "En camino", class: "badge-processing" },
  delivered: { label: "Entregada", class: "badge-completed" },
  completed: { label: "Completada", class: "badge-completed" },
  cancelled: { label: "Cancelada", class: "badge-cancelled" }
};

const serviceLabels = {
  pickup_delivery: "Pickup & Delivery",
  wash_fold: "Wash & Fold",
  self_service: "Self Service"
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
  const [orders, setOrders] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [viewOrder, setViewOrder] = useState(null);
  const [qrStartDate, setQrStartDate] = useState("");
  const [qrEndDate, setQrEndDate] = useState("");
  const [exportingQr, setExportingQr] = useState(false);
  const [qrStatusFilter, setQrStatusFilter] = useState("");
  const [qrServiceFilter, setQrServiceFilter] = useState("");

  useEffect(() => {
    fetchOrders();
    fetchCustomers();
  }, [statusFilter]);

  const fetchOrders = async () => {
    try {
      const params = statusFilter !== "all" ? { status: statusFilter } : {};
      const res = await axios.get(`${API}/orders`, { params });
      setOrders(res.data);
    } catch (error) {
      toast.error("Error cargando órdenes");
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const data = {
        ...form,
        estimated_lbs: form.estimated_lbs ? parseFloat(form.estimated_lbs) : null
      };
      await axios.post(`${API}/orders`, data);
      toast.success("Orden creada");
      setDialogOpen(false);
      setForm(emptyForm);
      fetchOrders();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Error creando orden");
    } finally {
      setSubmitting(false);
    }
  };

  const updateStatus = async (orderId, newStatus) => {
    try {
      await axios.patch(`${API}/orders/${orderId}/status?status=${newStatus}`);
      toast.success("Estado actualizado");
      fetchOrders();
    } catch (error) {
      toast.error("Error actualizando estado");
    }
  };

  const handleDownloadQr = async (order) => {
    try {
      const res = await axios.get(`${API}/orders/${order.id}/qr.svg`, { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `${order.order_number || order.id}.svg`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success("QR descargado");
    } catch (error) {
      toast.error("Error descargando QR");
    }
  };

  const handleExportQrBatch = async () => {
    if (!qrStartDate || !qrEndDate) {
      toast.error("Selecciona un rango de fechas");
      return;
    }
    setExportingQr(true);
    try {
      const params = new URLSearchParams({
        start_date: qrStartDate,
        end_date: qrEndDate
      });
      if (qrStatusFilter) {
        params.append("status", qrStatusFilter);
      }
      if (qrServiceFilter) {
        params.append("service_type", qrServiceFilter);
      }
      const res = await axios.get(`${API}/orders/qr/export?${params.toString()}`, { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `qr-export-${qrStartDate}-to-${qrEndDate}.zip`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success("QRs descargados");
    } catch (error) {
      toast.error("Error exportando QRs");
    } finally {
      setExportingQr(false);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleDateString("es-MX", {
      month: "short",
      day: "numeric",
      year: "numeric"
    });
  };

  return (
    <div data-testid="orders-page" className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Órdenes</h1>
          <p className="text-slate-500 mt-1">Gestiona pickups y entregas</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="btn-primary" data-testid="add-order-btn">
              <Plus className="h-4 w-4 mr-2" />
              Nueva Orden
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Nueva Orden</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 mt-4">
              <div>
                <Label>Cliente *</Label>
                <Select value={form.customer_id} onValueChange={(v) => setForm({ ...form, customer_id: v })}>
                  <SelectTrigger className="mt-1.5" data-testid="order-customer-select">
                    <SelectValue placeholder="Seleccionar cliente" />
                  </SelectTrigger>
                  <SelectContent>
                    {customers.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Tipo de Servicio *</Label>
                <Select value={form.service_type} onValueChange={(v) => setForm({ ...form, service_type: v })}>
                  <SelectTrigger className="mt-1.5" data-testid="order-service-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pickup_delivery">Pickup & Delivery</SelectItem>
                    <SelectItem value="wash_fold">Wash & Fold</SelectItem>
                    <SelectItem value="self_service">Self Service</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Fecha de Pickup</Label>
                  <Input
                    type="date"
                    value={form.pickup_date}
                    onChange={(e) => setForm({ ...form, pickup_date: e.target.value })}
                    className="mt-1.5"
                    data-testid="order-date-input"
                  />
                </div>
                <div>
                  <Label>Ventana de Tiempo</Label>
                  <Select value={form.pickup_time_window} onValueChange={(v) => setForm({ ...form, pickup_time_window: v })}>
                    <SelectTrigger className="mt-1.5" data-testid="order-time-select">
                      <SelectValue placeholder="Seleccionar" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="8am-10am">8am - 10am</SelectItem>
                      <SelectItem value="10am-12pm">10am - 12pm</SelectItem>
                      <SelectItem value="12pm-2pm">12pm - 2pm</SelectItem>
                      <SelectItem value="2pm-4pm">2pm - 4pm</SelectItem>
                      <SelectItem value="4pm-6pm">4pm - 6pm</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Dirección de Pickup</Label>
                <Input
                  value={form.pickup_address}
                  onChange={(e) => setForm({ ...form, pickup_address: e.target.value })}
                  className="mt-1.5"
                  placeholder="Se usará la dirección del cliente si está vacío"
                  data-testid="order-pickup-address-input"
                />
              </div>
              <div>
                <Label>Dirección de Entrega</Label>
                <Input
                  value={form.delivery_address}
                  onChange={(e) => setForm({ ...form, delivery_address: e.target.value })}
                  className="mt-1.5"
                  data-testid="order-delivery-address-input"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Libras Estimadas</Label>
                  <Input
                    type="number"
                    value={form.estimated_lbs}
                    onChange={(e) => setForm({ ...form, estimated_lbs: e.target.value })}
                    className="mt-1.5"
                    data-testid="order-lbs-input"
                  />
                </div>
                <div>
                  <Label>Gate Code</Label>
                  <Input
                    value={form.gate_code}
                    onChange={(e) => setForm({ ...form, gate_code: e.target.value })}
                    className="mt-1.5"
                    data-testid="order-gate-input"
                  />
                </div>
              </div>
              <div>
                <Label>Notas</Label>
                <Textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className="mt-1.5"
                  rows={2}
                  data-testid="order-notes-input"
                />
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" className="btn-primary" disabled={submitting || !form.customer_id} data-testid="order-submit-btn">
                  {submitting ? "Creando..." : "Crear Orden"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        {["all", "new", "processing", "ready", "out_for_delivery", "completed"].map((status) => (
          <Button
            key={status}
            variant={statusFilter === status ? "default" : "outline"}
            size="sm"
            onClick={() => setStatusFilter(status)}
            className={statusFilter === status ? "bg-sky-600 hover:bg-sky-700" : ""}
            data-testid={`filter-${status}`}
          >
            {status === "all" ? "Todas" : statusLabels[status]?.label || status}
          </Button>
        ))}
      </div>

      <div className="flex flex-col lg:flex-row gap-3 items-start lg:items-end">
        <div>
          <Label>Inicio</Label>
          <Input type="date" value={qrStartDate} onChange={(e) => setQrStartDate(e.target.value)} />
        </div>
        <div>
          <Label>Fin</Label>
          <Input type="date" value={qrEndDate} onChange={(e) => setQrEndDate(e.target.value)} />
        </div>
        <div>
          <Label>Estado</Label>
          <select
            className="h-9 rounded-md border border-slate-200 px-2 text-sm"
            value={qrStatusFilter}
            onChange={(e) => setQrStatusFilter(e.target.value)}
          >
            <option value="">Todos</option>
            <option value="new">Nueva</option>
            <option value="processing">Procesando</option>
            <option value="ready">Lista</option>
            <option value="out_for_delivery">En camino</option>
            <option value="completed">Completada</option>
            <option value="cancelled">Cancelada</option>
          </select>
        </div>
        <div>
          <Label>Servicio</Label>
          <select
            className="h-9 rounded-md border border-slate-200 px-2 text-sm"
            value={qrServiceFilter}
            onChange={(e) => setQrServiceFilter(e.target.value)}
          >
            <option value="">Todos</option>
            <option value="pickup_delivery">Pickup & Delivery</option>
            <option value="wash_fold">Wash & Fold</option>
            <option value="self_service">Self Service</option>
          </select>
        </div>
        <Button variant="outline" onClick={handleExportQrBatch} disabled={exportingQr}>
          <Download className="h-4 w-4 mr-2" />
          {exportingQr ? "Exportando..." : "Exportar QRs"}
        </Button>
      </div>

      {/* Order Detail Dialog */}
      <Dialog open={!!viewOrder} onOpenChange={() => setViewOrder(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Orden {viewOrder?.order_number}</DialogTitle>
          </DialogHeader>
          {viewOrder && (
            <div className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-slate-500">Cliente</p>
                  <p className="font-medium">{viewOrder.customer_name}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-500">Servicio</p>
                  <p className="font-medium">{serviceLabels[viewOrder.service_type]}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-500">Fecha Pickup</p>
                  <p className="font-medium">{formatDate(viewOrder.pickup_date)}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-500">Horario</p>
                  <p className="font-medium">{viewOrder.pickup_time_window || "-"}</p>
                </div>
              </div>
              <div>
                <p className="text-sm text-slate-500">Dirección Pickup</p>
                <p className="font-medium">{viewOrder.pickup_address || "-"}</p>
              </div>
              <div>
                <p className="text-sm text-slate-500">Dirección Entrega</p>
                <p className="font-medium">{viewOrder.delivery_address || "-"}</p>
              </div>
              {viewOrder.notes && (
                <div>
                  <p className="text-sm text-slate-500">Notas</p>
                  <p className="font-medium">{viewOrder.notes}</p>
                </div>
              )}
              <div className="grid grid-cols-3 gap-4 pt-2 border-t">
                <div>
                  <p className="text-sm text-slate-500">Est. Lbs</p>
                  <p className="font-medium">{viewOrder.estimated_lbs || "-"}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-500">Actual Lbs</p>
                  <p className="font-medium">{viewOrder.actual_lbs || "-"}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-500">Total</p>
                  <p className="font-medium">{viewOrder.total_amount ? `$${viewOrder.total_amount}` : "-"}</p>
                </div>
              </div>
              <div className="flex justify-end">
                <Button variant="outline" size="sm" onClick={() => handleDownloadQr(viewOrder)}>
                  <Download className="h-4 w-4 mr-2" />
                  Descargar QR
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Table */}
      <div className="table-card">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left text-xs font-semibold text-slate-600 uppercase tracking-wider px-6 py-3">Orden</th>
                <th className="text-left text-xs font-semibold text-slate-600 uppercase tracking-wider px-6 py-3">Cliente</th>
                <th className="text-left text-xs font-semibold text-slate-600 uppercase tracking-wider px-6 py-3">Servicio</th>
                <th className="text-left text-xs font-semibold text-slate-600 uppercase tracking-wider px-6 py-3">Pickup</th>
                <th className="text-left text-xs font-semibold text-slate-600 uppercase tracking-wider px-6 py-3">Estado</th>
                <th className="text-left text-xs font-semibold text-slate-600 uppercase tracking-wider px-6 py-3">Pago</th>
                <th className="text-right text-xs font-semibold text-slate-600 uppercase tracking-wider px-6 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-slate-500">Cargando...</td>
                </tr>
              ) : orders.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-slate-500">No hay órdenes</td>
                </tr>
              ) : (
                orders.map((order) => (
                  <tr key={order.id} className="hover:bg-slate-50/50" data-testid={`order-row-${order.id}`}>
                    <td className="px-6 py-4">
                      <p className="font-mono font-medium text-slate-900">{order.order_number}</p>
                      <p className="text-xs text-slate-400">{formatDate(order.created_at)}</p>
                    </td>
                    <td className="px-6 py-4">
                      <p className="font-medium text-slate-900">{order.customer_name}</p>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <Truck className="h-4 w-4 text-slate-400" />
                        <span className="text-sm">{serviceLabels[order.service_type]}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-slate-400" />
                        <span className="text-sm">{formatDate(order.pickup_date)}</span>
                      </div>
                      {order.pickup_time_window && (
                        <p className="text-xs text-slate-400 mt-0.5">{order.pickup_time_window}</p>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span className={statusLabels[order.status]?.class || "badge-pending"}>
                        {statusLabels[order.status]?.label || order.status}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={order.payment_status === "paid" ? "badge-completed" : "badge-pending"}>
                        {order.payment_status === "paid" ? "Pagado" : "Pendiente"}
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
                          <DropdownMenuItem onClick={() => setViewOrder(order)}>
                            <Eye className="h-4 w-4 mr-2" />
                            Ver detalles
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleDownloadQr(order)}>
                            <Download className="h-4 w-4 mr-2" />
                            Descargar QR
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          {order.status === "new" && (
                            <DropdownMenuItem onClick={() => updateStatus(order.id, "processing")}>
                              <CheckCircle className="h-4 w-4 mr-2" />
                              Marcar Procesando
                            </DropdownMenuItem>
                          )}
                          {order.status === "processing" && (
                            <DropdownMenuItem onClick={() => updateStatus(order.id, "ready")}>
                              <CheckCircle className="h-4 w-4 mr-2" />
                              Marcar Lista
                            </DropdownMenuItem>
                          )}
                          {order.status === "ready" && (
                            <DropdownMenuItem onClick={() => updateStatus(order.id, "out_for_delivery")}>
                              <Truck className="h-4 w-4 mr-2" />
                              En camino
                            </DropdownMenuItem>
                          )}
                          {order.status === "out_for_delivery" && (
                            <DropdownMenuItem onClick={() => updateStatus(order.id, "delivered")}>
                              <CheckCircle className="h-4 w-4 mr-2" />
                              Entregada
                            </DropdownMenuItem>
                          )}
                          {order.status === "delivered" && (
                            <DropdownMenuItem onClick={() => updateStatus(order.id, "completed")}>
                              <CheckCircle className="h-4 w-4 mr-2" />
                              Completar
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
