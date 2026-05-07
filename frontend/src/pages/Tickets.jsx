import { useState, useEffect } from "react";
import axios from "axios";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "../components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Textarea } from "../components/ui/textarea";
import { toast } from "sonner";
import { 
  Plus, HeadphonesIcon, MoreHorizontal, Eye, AlertCircle, CheckCircle, 
  Printer, Lightbulb, DollarSign 
} from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "../components/ui/dropdown-menu";
import { useLocale } from "../context/LocaleContext";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function Tickets() {
  const { t, locale } = useLocale();
  const lang = locale === "es" ? "es" : "en";

  const [tickets, setTickets] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [refunds, setRefunds] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [viewItem, setViewItem] = useState(null);

  // Estados para la sección staff
  const [staffStatus, setStaffStatus] = useState("");
  const [internalComment, setInternalComment] = useState("");
  const [refundAmount, setRefundAmount] = useState("");
  const [savingStaff, setSavingStaff] = useState(false);

  const [form, setForm] = useState({
    customer_id: "",
    subject: "",
    description: "",
    category: "general"
  });
  const emptyForm = { customer_id: "", subject: "", description: "", category: "general" };

  const statusLabels = {
    open:       { label: t("Open", "Abierto"), class: "badge-pending" },
    in_progress:{ label: t("In Progress", "En Progreso"), class: "badge-processing" },
    resolved:   { label: t("Resolved", "Resuelto"), class: "badge-completed" },
    closed:     { label: t("Closed", "Cerrado"), class: "badge-cancelled" }
  };

  const priorityLabels = {
    high:   { label: t("High", "Alta"), class: "badge-high" },
    medium: { label: t("Medium", "Media"), class: "badge-medium" },
    low:    { label: t("Low", "Baja"), class: "badge-low" }
  };

  const categoryLabels = {
    general:   t("General", "General"),
    complaint: t("Complaint", "Queja"),
    feedback:  t("Feedback", "Feedback"),
    issue:     t("Issue", "Problema"),
    billing:   t("Billing", "Facturación"),
    other:     t("Other", "Otro")
  };

  // Etiquetas para estados staff (sugerencias)
  const staffStatusLabels = {
    review:     { label: t("Under review", "En revisión"), class: "bg-sky-100 text-sky-700" },
    implemented:{ label: t("Implemented", "Implementada"), class: "bg-emerald-100 text-emerald-700" },
    rejected:   { label: t("Rejected", "Rechazada"), class: "bg-red-100 text-red-700" }
  };

  useEffect(() => {
    fetchTickets();
    fetchCustomers();
    fetchSuggestionsAndRefunds();
  }, [statusFilter, typeFilter]);

  // Cada vez que se abre el diálogo, cargar los valores existentes
  useEffect(() => {
    if (viewItem) {
      if (viewItem._type === "suggestion") {
        setStaffStatus(viewItem.staff_status || "review");
        setInternalComment(viewItem.internal_comment || "");
        setRefundAmount("");
      } else if (viewItem._type === "refund") {
        setStaffStatus(viewItem.staff_status === "approved" ? "approved" : 
                       viewItem.staff_status === "denied" ? "denied" : "");
        setRefundAmount(viewItem.refund_amount ? viewItem.refund_amount.toString() : "");
        setInternalComment(viewItem.internal_comment || "");
      }
    }
  }, [viewItem]);

  const fetchTickets = async () => {
    try {
      const params = statusFilter !== "all" ? { status: statusFilter } : {};
      const res = await axios.get(`${API}/tickets`, { params });
      setTickets(res.data);
    } catch (error) {
      toast.error(t("Error loading tickets", "Error cargando tickets"));
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

  const fetchSuggestionsAndRefunds = async () => {
    try {
      const [sugRes, refRes] = await Promise.all([
        axios.get(`${API}/admin/suggestions`),
        axios.get(`${API}/admin/refunds`)
      ]);
      setSuggestions(sugRes.data);
      setRefunds(refRes.data);
    } catch (error) {
      console.error("Error loading suggestions/refunds", error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const data = { ...form, customer_id: form.customer_id || null };
      await axios.post(`${API}/tickets`, data);
      toast.success(t("Ticket created", "Ticket creado"));
      setDialogOpen(false);
      setForm(emptyForm);
      fetchTickets();
    } catch (error) {
      toast.error(error.response?.data?.detail || t("Error creating ticket", "Error creando ticket"));
    } finally {
      setSubmitting(false);
    }
  };

  const updateStatus = async (ticketId, newStatus) => {
    try {
      await axios.put(`${API}/tickets/${ticketId}`, { status: newStatus });
      toast.success(t("Status updated", "Estado actualizado"));
      fetchTickets();
    } catch (error) {
      toast.error(t("Error updating status", "Error actualizando estado"));
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleDateString(lang === "es" ? "es-MX" : "en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  };

  const getAllItems = () => {
    const ticketsItems = tickets.map(t => ({
      id: t.id,
      _type: "ticket",
      displayNumber: t.ticket_number,
      displaySubject: t.subject,
      displayDescription: t.description,
      displayCustomer: t.customer_name,
      priority: t.priority,
      status: t.status,
      category: t.category,
      created_at: t.created_at,
      updated_at: t.updated_at,
      resolution: t.resolution,
    }));

    const suggestionsItems = suggestions.map(s => ({
      id: s.id,
      _type: "suggestion",
      displayNumber: `SUG-${s.id.slice(0, 8)}`,
      displaySubject: `Sugerencia: ${s.suggestion.substring(0, 50)}${s.suggestion.length > 50 ? "..." : ""}`,
      displayDescription: `Tipo: ${s.types.join(", ")}\nMejoraría: ${s.improve.join(", ")}\n\nSugerencia: ${s.suggestion}`,
      displayCustomer: s.name || "Anónimo",
      priority: "low",
      status: s.staff_status === "implemented" ? "resolved" : (s.staff_status === "rejected" ? "closed" : "open"),
      category: "feedback",
      created_at: s.created_at,
      updated_at: s.updated_at || s.created_at,
      resolution: null,
      staff_status: s.staff_status,
      internal_comment: s.internal_comment,
    }));

    const refundsItems = refunds.map(r => ({
      id: r.id,
      _type: "refund",
      displayNumber: `REF-${r.id.slice(0, 8)}`,
      displaySubject: `Solicitud de reembolso - Máquina ${r.machine_number}`,
      displayDescription: `Monto: $${r.amount}\nRazones: ${r.reasons.join(", ")}\nComentario: ${r.comment || ""}`,
      displayCustomer: r.name || "Anónimo",
      priority: "high",
      status: r.staff_status === "approved" ? "resolved" : (r.staff_status === "denied" ? "closed" : "open"),
      category: "billing",
      created_at: r.created_at,
      updated_at: r.updated_at || r.created_at,
      resolution: null,
      staff_status: r.staff_status,
      internal_comment: r.internal_comment,
      refund_amount: r.refund_amount,
    }));

    let combined = [...ticketsItems, ...suggestionsItems, ...refundsItems];

    if (typeFilter !== "all") {
      combined = combined.filter(item => item._type === typeFilter);
    }

    combined.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return combined;
  };

  const items = getAllItems();

  // Guardar cambios staff
  const saveStaffChanges = async () => {
    if (!viewItem) return;
    setSavingStaff(true);
    try {
      let endpoint = "";
      let payload = {};
      if (viewItem._type === "suggestion") {
        endpoint = `${API}/admin/suggestions/${viewItem.id}`;
        payload = { staff_status: staffStatus, internal_comment: internalComment };
      } else if (viewItem._type === "refund") {
        endpoint = `${API}/admin/refunds/${viewItem.id}`;
        payload = { 
          staff_status: staffStatus, 
          internal_comment: internalComment,
          refund_amount: refundAmount ? parseFloat(refundAmount) : null
        };
      } else {
        // Tickets no tienen staff section
        setSavingStaff(false);
        return;
      }
      await axios.put(endpoint, payload);
      toast.success(lang === "es" ? "Cambios guardados" : "Changes saved");
      // Actualizar localmente
      setViewItem({ ...viewItem, ...payload });
      // Refrescar listas completas
      await fetchSuggestionsAndRefunds();
    } catch (error) {
      console.error(error);
      toast.error(lang === "es" ? "Error guardando cambios" : "Error saving changes");
    } finally {
      setSavingStaff(false);
    }
  };

  const handlePrintItem = (item) => {
    const url = `${window.location.origin}/tickets/${item.id}`;
    const qrSize = 100;
    const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=${qrSize}x${qrSize}&data=${encodeURIComponent(url)}`;

    const escapeHtml = (str) => {
      if (!str) return "";
      return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
    };

    const typeLabel = item._type === "ticket" ? "TICKET" : (item._type === "suggestion" ? "SUGERENCIA" : "REEMBOLSO");
    const printDate = new Date(item.created_at).toLocaleString(lang === "es" ? "es-MX" : "en-US", {
      dateStyle: "short",
      timeStyle: "short"
    });

    const printContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>${typeLabel} ${item.displayNumber}</title>
        <meta charset="UTF-8">
        <style>
          * { margin:0; padding:0; box-sizing:border-box; }
          body { font-family: 'Courier New', monospace; font-size: 12px; background:#fff; padding:20px; }
          .ticket { max-width: 280px; margin:0 auto; border:1px solid #000; padding:12px; }
          .center { text-align:center; }
          .divider { border-top:1px dashed #888; margin:8px 0; }
          .row { display:flex; justify-content:space-between; margin-bottom:4px; }
          .label { font-weight:bold; }
          .description { margin:8px 0; padding:4px 0; border-top:1px dotted #aaa; border-bottom:1px dotted #aaa; }
          .qr { text-align:center; margin-top:12px; }
          .qr img { width:${qrSize}px; height:${qrSize}px; margin:0 auto; }
          .footer { text-align:center; font-size:9px; margin-top:12px; color:#666; }
          @media print { body { padding:0; margin:0; } .ticket { border:none; padding:0; } }
        </style>
      </head>
      <body>
        <div class="ticket">
          <div class="center">
            <strong>${typeLabel}</strong><br/>
            ${item.displayNumber}<br/>
            ${printDate}
          </div>
          <div class="divider"></div>
          <div class="row"><span class="label">Asunto:</span><span>${escapeHtml(item.displaySubject)}</span></div>
          <div class="row"><span class="label">Cliente:</span><span>${escapeHtml(item.displayCustomer || "Sin cliente")}</span></div>
          <div class="row"><span class="label">Categoría:</span><span>${escapeHtml(categoryLabels[item.category] || item.category)}</span></div>
          <div class="row"><span class="label">Prioridad:</span><span>${escapeHtml(priorityLabels[item.priority]?.label || item.priority)}</span></div>
          <div class="row"><span class="label">Estado:</span><span>${escapeHtml(statusLabels[item.status]?.label || item.status)}</span></div>
          <div class="description"><strong>Descripción:</strong><br/>${escapeHtml(item.displayDescription).replace(/\n/g, '<br/>')}</div>
          ${item.resolution ? `<div class="row"><span class="label">Resolución:</span><span>${escapeHtml(item.resolution)}</span></div>` : ''}
          <div class="divider"></div>
          <div class="qr"><img src="${qrImageUrl}" alt="QR" /><div style="font-size:8px;">Escanea para ver detalles</div></div>
          <div class="footer">Generado el ${new Date().toLocaleString()}<br/>Sistema de Soporte</div>
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
  };

  return (
    <div data-testid="tickets-page" className="space-y-6 bg-white">
      {/* Header (sin cambios) */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t("Support", "Soporte")}</h1>
          <p className="text-slate-500 mt-1">{t("Tickets, suggestions and refund requests", "Tickets, sugerencias y solicitudes de reembolso")}</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="btn-primary" data-testid="add-ticket-btn">
              <Plus className="h-4 w-4 mr-2" />
              {t("New Ticket", "Nuevo Ticket")}
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg bg-white">
            <DialogHeader>
              <DialogTitle>{t("New Support Ticket", "Nuevo Ticket de Soporte")}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 mt-4">
              <div>
                <Label>{t("Customer (optional)", "Cliente (opcional)")}</Label>
                <Select value={form.customer_id} onValueChange={(v) => setForm({ ...form, customer_id: v })}>
                  <SelectTrigger className="mt-1.5" data-testid="ticket-customer-select">
                    <SelectValue placeholder={t("Select customer", "Seleccionar cliente")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">{t("No customer", "Sin cliente")}</SelectItem>
                    {customers.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t("Subject *", "Asunto *")}</Label>
                <Input
                  value={form.subject}
                  onChange={(e) => setForm({ ...form, subject: e.target.value })}
                  required
                  className="mt-1.5"
                  data-testid="ticket-subject-input"
                />
              </div>
              <div>
                <Label>{t("Category", "Categoría")}</Label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                  <SelectTrigger className="mt-1.5" data-testid="ticket-category-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="general">{t("General", "General")}</SelectItem>
                    <SelectItem value="complaint">{t("Complaint", "Queja")}</SelectItem>
                    <SelectItem value="feedback">{t("Feedback", "Feedback")}</SelectItem>
                    <SelectItem value="issue">{t("Issue", "Problema")}</SelectItem>
                    <SelectItem value="billing">{t("Billing", "Facturación")}</SelectItem>
                    <SelectItem value="other">{t("Other", "Otro")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t("Description *", "Descripción *")}</Label>
                <Textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  required
                  className="mt-1.5"
                  rows={4}
                  placeholder={t("Describe the problem or request...", "Describa el problema o solicitud...")}
                  data-testid="ticket-description-input"
                />
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                  {t("Cancel", "Cancelar")}
                </Button>
                <Button type="submit" className="btn-primary" disabled={submitting} data-testid="ticket-submit-btn">
                  {submitting ? t("Creating...", "Creando...") : t("Create Ticket", "Crear Ticket")}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filtros (sin cambios) */}
      <div className="flex flex-wrap gap-2 justify-between items-center">
        <div className="flex gap-2 flex-wrap">
          <Button variant={typeFilter === "all" ? "default" : "outline"} size="sm" onClick={() => setTypeFilter("all")}>
            {t("All", "Todos")}
          </Button>
          <Button variant={typeFilter === "ticket" ? "default" : "outline"} size="sm" onClick={() => setTypeFilter("ticket")}>
            {t("Tickets", "Tickets")}
          </Button>
          <Button variant={typeFilter === "suggestion" ? "default" : "outline"} size="sm" onClick={() => setTypeFilter("suggestion")}>
            <Lightbulb className="h-3 w-3 mr-1" /> {t("Suggestions", "Sugerencias")}
          </Button>
          <Button variant={typeFilter === "refund" ? "default" : "outline"} size="sm" onClick={() => setTypeFilter("refund")}>
            <DollarSign className="h-3 w-3 mr-1" /> {t("Refunds", "Reembolsos")}
          </Button>
        </div>
        <div className="flex gap-2 flex-wrap">
          {["all", "open", "in_progress", "resolved", "closed"].map((status) => (
            <Button
              key={status}
              variant={statusFilter === status ? "default" : "outline"}
              size="sm"
              onClick={() => setStatusFilter(status)}
              className={statusFilter === status ? "bg-sky-600 hover:bg-sky-700" : ""}
            >
              {status === "all" ? t("All", "Todos") : statusLabels[status]?.label || status}
            </Button>
          ))}
        </div>
      </div>

      {/* Dialog de detalles con sección staff unificada */}
      <Dialog open={!!viewItem} onOpenChange={() => setViewItem(null)}>
        <DialogContent className="sm:max-w-lg bg-white max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {viewItem?._type === "ticket" ? t("Ticket", "Ticket") : 
               viewItem?._type === "suggestion" ? t("Suggestion", "Sugerencia") : 
               t("Refund", "Reembolso")} {viewItem?.displayNumber}
            </DialogTitle>
          </DialogHeader>
          {viewItem && (
            <div className="space-y-5 mt-4">
              {/* Información general (sin cambios) */}
              <div className="flex items-start gap-3">
                <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${
                  viewItem.priority === "high" ? "bg-red-100" : 
                  viewItem.priority === "medium" ? "bg-amber-100" : "bg-slate-100"
                }`}>
                  <AlertCircle className={`h-5 w-5 ${
                    viewItem.priority === "high" ? "text-red-600" : 
                    viewItem.priority === "medium" ? "text-amber-600" : "text-slate-500"
                  }`} />
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-lg">{viewItem.displaySubject}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={priorityLabels[viewItem.priority]?.class}>
                      {priorityLabels[viewItem.priority]?.label}
                    </span>
                    <span className={statusLabels[viewItem.status]?.class}>
                      {statusLabels[viewItem.status]?.label}
                    </span>
                    <span className="badge-processing">
                      {viewItem._type === "ticket" ? "Ticket" : viewItem._type === "suggestion" ? "Sugerencia" : "Reembolso"}
                    </span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-slate-500">{t("Customer", "Cliente")}</p>
                  <p className="font-medium">{viewItem.displayCustomer || t("No customer", "Sin cliente")}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-500">{t("Category", "Categoría")}</p>
                  <p className="font-medium">{categoryLabels[viewItem.category] || viewItem.category}</p>
                </div>
              </div>

              <div>
                <p className="text-sm text-slate-500">{t("Description", "Descripción")}</p>
                <p className="font-medium whitespace-pre-wrap">{viewItem.displayDescription}</p>
              </div>

              {viewItem.resolution && (
                <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-100">
                  <p className="text-sm text-emerald-700 font-medium">{t("Resolution", "Resolución")}</p>
                  <p className="text-emerald-800 mt-1">{viewItem.resolution}</p>
                </div>
              )}

              {/* ================= SECCIÓN STAFF UNIFICADA ================= */}
              {(viewItem._type === "suggestion" || viewItem._type === "refund") && (
                <div className="rounded-xl border border-slate-200 overflow-hidden">
                  <div className="px-4 py-3 bg-slate-100 border-b border-slate-200">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-sky-500"></div>
                      <span className="text-xs font-black uppercase tracking-wider text-slate-700">
                        {lang === "es" ? "Uso interno" : "For staff use only"}
                      </span>
                    </div>
                  </div>
                  <div className="p-4 space-y-4">
                    {viewItem._type === "suggestion" && (
                      <>
                        {/* Radios para sugerencias */}
                        <div>
                          <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                            {t("Status", "Estado")}
                          </Label>
                          <div className="flex flex-wrap gap-4 mt-2">
                            {Object.entries(staffStatusLabels).map(([value, { label }]) => (
                              <label key={value} className="flex items-center gap-2 cursor-pointer">
                                <input
                                  type="radio"
                                  name="staffStatus"
                                  value={value}
                                  checked={staffStatus === value}
                                  onChange={(e) => setStaffStatus(e.target.value)}
                                  className="w-4 h-4 accent-sky-600"
                                />
                                <span className="text-sm">{label}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                        {/* Comentario interno */}
                        <div>
                          <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                            {t("Internal comment", "Comentario interno")}
                          </Label>
                          <Textarea
                            value={internalComment}
                            onChange={(e) => setInternalComment(e.target.value)}
                            placeholder={lang === "es" ? "Ej: Se discutirá en próxima reunión" : "e.g. Will be discussed in next meeting"}
                            className="mt-2"
                            rows={2}
                          />
                        </div>
                      </>
                    )}

                    {viewItem._type === "refund" && (
                      <>
                        {/* Radios para reembolsos */}
                        <div>
                          <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                            {t("Decision", "Decisión")}
                          </Label>
                          <div className="flex flex-wrap gap-4 mt-2">
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="radio"
                                name="staffDecision"
                                value="approved"
                                checked={staffStatus === "approved"}
                                onChange={(e) => setStaffStatus(e.target.value)}
                                className="w-4 h-4 accent-emerald-600"
                              />
                              <span className="text-sm font-semibold text-emerald-700">
                                ✓ {lang === "es" ? "Aprobado" : "Approved"}
                              </span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="radio"
                                name="staffDecision"
                                value="denied"
                                checked={staffStatus === "denied"}
                                onChange={(e) => setStaffStatus(e.target.value)}
                                className="w-4 h-4 accent-red-600"
                              />
                              <span className="text-sm font-semibold text-red-600">
                                ✕ {lang === "es" ? "Rechazado" : "Denied"}
                              </span>
                            </label>
                          </div>
                        </div>
                        {/* Monto a reembolsar */}
                        <div>
                          <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                            {lang === "es" ? "Monto a reembolsar" : "Refund amount"}
                          </Label>
                          <div className="flex items-center gap-1.5 mt-1 border border-slate-200 rounded-lg px-3 py-2 focus-within:border-sky-400">
                            <span className="text-slate-400 text-sm font-bold">$</span>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={refundAmount}
                              onChange={(e) => setRefundAmount(e.target.value)}
                              placeholder="0.00"
                              className="flex-1 bg-transparent border-0 outline-none text-sm font-semibold text-slate-700 placeholder-slate-300"
                            />
                          </div>
                        </div>
                        {/* Comentario interno también para reembolsos */}
                        <div>
                          <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                            {t("Internal comment", "Comentario interno")}
                          </Label>
                          <Textarea
                            value={internalComment}
                            onChange={(e) => setInternalComment(e.target.value)}
                            placeholder={lang === "es" ? "Notas internas..." : "Internal notes..."}
                            className="mt-2"
                            rows={2}
                          />
                        </div>
                      </>
                    )}

                    <Button
                      type="button"
                      size="sm"
                      onClick={saveStaffChanges}
                      disabled={savingStaff}
                      className="w-full bg-slate-800 hover:bg-slate-900 text-white"
                    >
                      {savingStaff ? (lang === "es" ? "Guardando..." : "Saving...") : (lang === "es" ? "Guardar cambios" : "Save changes")}
                    </Button>
                  </div>
                </div>
              )}

              <div className="text-xs text-slate-400 pt-2 border-t">
                {t("Created:", "Creado:")} {formatDate(viewItem.created_at)} | {t("Updated:", "Actualizado:")} {formatDate(viewItem.updated_at)}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Tabla unificada (sin cambios) */}
      <div className="table-card">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left text-xs font-semibold text-slate-600 uppercase tracking-wider px-6 py-3">{t("ID / Type", "ID / Tipo")}</th>
                <th className="text-left text-xs font-semibold text-slate-600 uppercase tracking-wider px-6 py-3">{t("Subject", "Asunto")}</th>
                <th className="text-left text-xs font-semibold text-slate-600 uppercase tracking-wider px-6 py-3">{t("Customer", "Cliente")}</th>
                <th className="text-left text-xs font-semibold text-slate-600 uppercase tracking-wider px-6 py-3">{t("Priority", "Prioridad")}</th>
                <th className="text-left text-xs font-semibold text-slate-600 uppercase tracking-wider px-6 py-3">{t("Status", "Estado")}</th>
                <th className="text-right text-xs font-semibold text-slate-600 uppercase tracking-wider px-6 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-slate-500">{t("Loading...", "Cargando...")}</td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-slate-500">{t("No items found", "No se encontraron elementos")}</td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr key={`${item._type}-${item.id}`} className="hover:bg-slate-50/50" data-testid={`row-${item._type}-${item.id}`}>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        {item._type === "suggestion" && <Lightbulb className="h-4 w-4 text-amber-500" />}
                        {item._type === "refund" && <DollarSign className="h-4 w-4 text-red-500" />}
                        {item._type === "ticket" && <HeadphonesIcon className="h-4 w-4 text-sky-500" />}
                        <div>
                          <p className="font-mono font-medium text-slate-900">{item.displayNumber}</p>
                          <p className="text-xs text-slate-400">{formatDate(item.created_at)}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <p className="font-medium text-slate-900 truncate max-w-[200px]">{item.displaySubject}</p>
                      <p className="text-xs text-slate-400">{categoryLabels[item.category] || item.category}</p>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm">{item.displayCustomer || "-"}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={priorityLabels[item.priority]?.class || "badge-low"}>
                        {priorityLabels[item.priority]?.label || item.priority}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {/* Mostrar estado visual según tipo */}
                      {item._type === "suggestion" || item._type === "refund" ? (
                        <span className={item._type === "suggestion" ? 
                          (staffStatusLabels[item.staff_status]?.class || "badge-pending") : 
                          (item.staff_status === "approved" ? "bg-emerald-100 text-emerald-700" : 
                           item.staff_status === "denied" ? "bg-red-100 text-red-700" : "badge-pending")}>
                          {item._type === "suggestion" ? 
                            (staffStatusLabels[item.staff_status]?.label || t("Pending", "Pendiente")) :
                            (item.staff_status === "approved" ? (lang === "es" ? "Aprobado" : "Approved") :
                             item.staff_status === "denied" ? (lang === "es" ? "Rechazado" : "Denied") :
                             (lang === "es" ? "Pendiente" : "Pending"))}
                        </span>
                      ) : (
                        <span className={statusLabels[item.status]?.class || "badge-pending"}>
                          {statusLabels[item.status]?.label || item.status}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" data-testid={`actions-${item._type}-${item.id}`}>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setViewItem(item)}>
                            <Eye className="h-4 w-4 mr-2" />
                            {t("View details", "Ver detalles")}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handlePrintItem(item)}>
                            <Printer className="h-4 w-4 mr-2" />
                            {t("Print", "Imprimir")}
                          </DropdownMenuItem>
                          {item._type === "ticket" && (
                            <>
                              <DropdownMenuSeparator />
                              {item.status === "open" && (
                                <DropdownMenuItem onClick={() => updateStatus(item.id, "in_progress")}>
                                  {t("Mark In Progress", "Marcar En Progreso")}
                                </DropdownMenuItem>
                              )}
                              {item.status === "in_progress" && (
                                <DropdownMenuItem onClick={() => updateStatus(item.id, "resolved")}>
                                  <CheckCircle className="h-4 w-4 mr-2" />
                                  {t("Mark Resolved", "Marcar Resuelto")}
                                </DropdownMenuItem>
                              )}
                              {["open", "in_progress", "resolved"].includes(item.status) && (
                                <DropdownMenuItem onClick={() => updateStatus(item.id, "closed")}>
                                  {t("Close Ticket", "Cerrar Ticket")}
                                </DropdownMenuItem>
                              )}
                            </>
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