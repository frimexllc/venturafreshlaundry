import { useState, useEffect } from "react";
import axios from "axios";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "../components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Textarea } from "../components/ui/textarea";
import { toast } from "sonner";
import { Plus, HeadphonesIcon, MoreHorizontal, Eye, AlertCircle, CheckCircle, Printer } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "../components/ui/dropdown-menu";
import { useLocale } from "../context/LocaleContext";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function Tickets() {
  const { t } = useLocale();
  const [tickets, setTickets] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({
    customer_id: "",
    subject: "",
    description: "",
    category: "general"
  });
  const [submitting, setSubmitting] = useState(false);
  const [viewTicket, setViewTicket] = useState(null);

  const statusLabels = {
    open: { label: t("Open", "Abierto"), class: "badge-pending" },
    in_progress: { label: t("In Progress", "En Progreso"), class: "badge-processing" },
    resolved: { label: t("Resolved", "Resuelto"), class: "badge-completed" },
    closed: { label: t("Closed", "Cerrado"), class: "badge-cancelled" }
  };

  const priorityLabels = {
    high: { label: t("High", "Alta"), class: "badge-high" },
    medium: { label: t("Medium", "Media"), class: "badge-medium" },
    low: { label: t("Low", "Baja"), class: "badge-low" }
  };

  const categoryLabels = {
    general: t("General", "General"),
    complaint: t("Complaint", "Queja"),
    feedback: t("Feedback", "Feedback"),
    issue: t("Issue", "Problema"),
    billing: t("Billing", "Facturación"),
    other: t("Other", "Otro")
  };

  const emptyForm = {
    customer_id: "",
    subject: "",
    description: "",
    category: "general"
  };

  useEffect(() => {
    fetchTickets();
    fetchCustomers();
  }, [statusFilter]);

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

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const data = {
        ...form,
        customer_id: form.customer_id || null
      };
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
    return new Date(dateStr).toLocaleDateString(t("en-US", "es-MX"), {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  };

  // Función mejorada para imprimir ticket con formato convencional
  const handlePrintTicket = (ticket) => {
    if (!ticket) return;

    // URL para el código QR (página de detalle del ticket)
    const ticketUrl = `${window.location.origin}/tickets/${ticket.id}`;
    const qrSize = 100;
    const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=${qrSize}x${qrSize}&data=${encodeURIComponent(ticketUrl)}`;

    // Función auxiliar para escapar HTML
    const escapeHtml = (str) => {
      if (!str) return "";
      return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
    };

    // Formatear fecha larga para ticket
    const printDate = new Date(ticket.created_at).toLocaleString(t("en-US", "es-MX"), {
      dateStyle: "short",
      timeStyle: "short"
    });

    // Contenido del ticket
    const printContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Ticket ${ticket.ticket_number}</title>
        <meta charset="UTF-8">
        <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          body {
            font-family: 'Courier New', 'Monaco', monospace;
            font-size: 12px;
            line-height: 1.3;
            background: #fff;
            padding: 20px;
          }
          .ticket {
            max-width: 280px;
            margin: 0 auto;
            border: 1px solid #000;
            padding: 12px;
          }
          .center {
            text-align: center;
          }
          .divider {
            border-top: 1px dashed #888;
            margin: 8px 0;
          }
          .row {
            display: flex;
            justify-content: space-between;
            margin-bottom: 4px;
          }
          .label {
            font-weight: bold;
          }
          .description {
            margin: 8px 0;
            padding: 4px 0;
            border-top: 1px dotted #aaa;
            border-bottom: 1px dotted #aaa;
          }
          .qr {
            text-align: center;
            margin-top: 12px;
          }
          .qr img {
            width: ${qrSize}px;
            height: ${qrSize}px;
            margin: 0 auto;
          }
          .footer {
            text-align: center;
            font-size: 9px;
            margin-top: 12px;
            color: #666;
          }
          @media print {
            body { padding: 0; margin: 0; }
            .ticket { border: none; padding: 0; }
          }
        </style>
      </head>
      <body>
        <div class="ticket">
          <div class="center">
            <strong>SOPORTE TÉCNICO</strong><br/>
            Ticket: ${ticket.ticket_number}<br/>
            ${printDate}
          </div>
          <div class="divider"></div>
          <div class="row">
            <span class="label">Asunto:</span>
            <span>${escapeHtml(ticket.subject)}</span>
          </div>
          <div class="row">
            <span class="label">Cliente:</span>
            <span>${escapeHtml(ticket.customer_name || "Sin cliente")}</span>
          </div>
          <div class="row">
            <span class="label">Categoría:</span>
            <span>${escapeHtml(categoryLabels[ticket.category])}</span>
          </div>
          <div class="row">
            <span class="label">Prioridad:</span>
            <span>${escapeHtml(priorityLabels[ticket.priority]?.label || ticket.priority)}</span>
          </div>
          <div class="row">
            <span class="label">Estado:</span>
            <span>${escapeHtml(statusLabels[ticket.status]?.label || ticket.status)}</span>
          </div>
          <div class="description">
            <strong>Descripción:</strong><br/>
            ${escapeHtml(ticket.description).replace(/\n/g, '<br/>')}
          </div>
          ${ticket.resolution ? `
          <div class="row">
            <span class="label">Resolución:</span>
            <span>${escapeHtml(ticket.resolution)}</span>
          </div>
          ` : ''}
          <div class="divider"></div>
          <div class="qr">
            <img src="${qrImageUrl}" alt="QR" />
            <div style="font-size: 8px;">Escanea para ver el ticket</div>
          </div>
          <div class="footer">
            Generado el ${new Date().toLocaleString()}<br/>
            Sistema de Soporte
          </div>
        </div>
        <script>
          window.onload = function() {
            window.print();
            window.onafterprint = function() { window.close(); };
          };
        </script>
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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t("Support", "Soporte")}</h1>
          <p className="text-slate-500 mt-1">{t("Tickets and support requests", "Tickets y solicitudes de soporte")}</p>
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

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        {["all", "open", "in_progress", "resolved", "closed"].map((status) => (
          <Button
            key={status}
            variant={statusFilter === status ? "default" : "outline"}
            size="sm"
            onClick={() => setStatusFilter(status)}
            className={statusFilter === status ? "bg-sky-600 hover:bg-sky-700" : ""}
            data-testid={`filter-ticket-${status}`}
          >
            {status === "all" ? t("All", "Todos") : statusLabels[status]?.label || status}
          </Button>
        ))}
      </div>

      {/* Ticket Detail Dialog */}
      <Dialog open={!!viewTicket} onOpenChange={() => setViewTicket(null)}>
        <DialogContent className="sm:max-w-lg bg-white">
          <DialogHeader>
            <DialogTitle>{t("Ticket", "Ticket")} {viewTicket?.ticket_number}</DialogTitle>
          </DialogHeader>
          {viewTicket && (
            <div className="space-y-4 mt-4">
              <div className="flex items-start gap-3">
                <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${
                  viewTicket.priority === "high" ? "bg-red-100" : 
                  viewTicket.priority === "medium" ? "bg-amber-100" : "bg-slate-100"
                }`}>
                  <AlertCircle className={`h-5 w-5 ${
                    viewTicket.priority === "high" ? "text-red-600" : 
                    viewTicket.priority === "medium" ? "text-amber-600" : "text-slate-500"
                  }`} />
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-lg">{viewTicket.subject}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={priorityLabels[viewTicket.priority]?.class}>
                      {priorityLabels[viewTicket.priority]?.label}
                    </span>
                    <span className={statusLabels[viewTicket.status]?.class}>
                      {statusLabels[viewTicket.status]?.label}
                    </span>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-slate-500">{t("Customer", "Cliente")}</p>
                  <p className="font-medium">{viewTicket.customer_name || t("No customer", "Sin cliente")}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-500">{t("Category", "Categoría")}</p>
                  <p className="font-medium">{categoryLabels[viewTicket.category]}</p>
                </div>
              </div>
              <div>
                <p className="text-sm text-slate-500">{t("Description", "Descripción")}</p>
                <p className="font-medium whitespace-pre-wrap">{viewTicket.description}</p>
              </div>
              {viewTicket.resolution && (
                <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-100">
                  <p className="text-sm text-emerald-700 font-medium">{t("Resolution", "Resolución")}</p>
                  <p className="text-emerald-800 mt-1">{viewTicket.resolution}</p>
                </div>
              )}
              <div className="text-xs text-slate-400 pt-2 border-t">
                {t("Created:", "Creado:")} {formatDate(viewTicket.created_at)} | {t("Updated:", "Actualizado:")} {formatDate(viewTicket.updated_at)}
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
                <th className="text-left text-xs font-semibold text-slate-600 uppercase tracking-wider px-6 py-3">{t("Ticket", "Ticket")}</th>
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
              ) : tickets.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-slate-500">{t("No tickets", "No hay tickets")}</td>
                </tr>
              ) : (
                tickets.map((ticket) => (
                  <tr key={ticket.id} className="hover:bg-slate-50/50" data-testid={`ticket-row-${ticket.id}`}>
                    <td className="px-6 py-4">
                      <p className="font-mono font-medium text-slate-900">{ticket.ticket_number}</p>
                      <p className="text-xs text-slate-400">{formatDate(ticket.created_at)}</p>
                    </td>
                    <td className="px-6 py-4">
                      <p className="font-medium text-slate-900 truncate max-w-[200px]">{ticket.subject}</p>
                      <p className="text-xs text-slate-400">{categoryLabels[ticket.category]}</p>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm">{ticket.customer_name || "-"}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={priorityLabels[ticket.priority]?.class || "badge-low"}>
                        {priorityLabels[ticket.priority]?.label || ticket.priority}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={statusLabels[ticket.status]?.class || "badge-pending"}>
                        {statusLabels[ticket.status]?.label || ticket.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" data-testid={`ticket-actions-${ticket.id}`}>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setViewTicket(ticket)}>
                            <Eye className="h-4 w-4 mr-2" />
                            {t("View details", "Ver detalles")}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handlePrintTicket(ticket)}>
                            <Printer className="h-4 w-4 mr-2" />
                            {t("Print Ticket", "Imprimir Ticket")}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          {ticket.status === "open" && (
                            <DropdownMenuItem onClick={() => updateStatus(ticket.id, "in_progress")}>
                              {t("Mark In Progress", "Marcar En Progreso")}
                            </DropdownMenuItem>
                          )}
                          {ticket.status === "in_progress" && (
                            <DropdownMenuItem onClick={() => updateStatus(ticket.id, "resolved")}>
                              <CheckCircle className="h-4 w-4 mr-2" />
                              {t("Mark Resolved", "Marcar Resuelto")}
                            </DropdownMenuItem>
                          )}
                          {["open", "in_progress", "resolved"].includes(ticket.status) && (
                            <DropdownMenuItem onClick={() => updateStatus(ticket.id, "closed")}>
                              {t("Close Ticket", "Cerrar Ticket")}
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