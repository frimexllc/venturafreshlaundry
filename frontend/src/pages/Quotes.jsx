import { useState, useEffect } from "react";
import axios from "axios";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "../components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Textarea } from "../components/ui/textarea";
import { toast } from "sonner";
import { Plus, Building2, MoreHorizontal, Eye, Phone, Mail } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "../components/ui/dropdown-menu";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const statusLabels = {
  new: { label: "Nueva", class: "badge-pending" },
  sent: { label: "Enviada", class: "badge-processing" },
  negotiating: { label: "Negociando", class: "badge-processing" },
  won: { label: "Ganada", class: "badge-completed" },
  lost: { label: "Perdida", class: "badge-cancelled" }
};

const emptyForm = {
  company_name: "",
  contact_name: "",
  email: "",
  phone: "",
  industry: "",
  estimated_lbs_per_week: "",
  service_needs: "",
  notes: ""
};

export default function Quotes() {
  const [quotes, setQuotes] = useState([]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [viewQuote, setViewQuote] = useState(null);

  useEffect(() => {
    fetchQuotes();
  }, [statusFilter]);

  const fetchQuotes = async () => {
    try {
      const params = statusFilter !== "all" ? { status: statusFilter } : {};
      const res = await axios.get(`${API}/quotes`, { params });
      setQuotes(res.data);
    } catch (error) {
      toast.error("Error cargando cotizaciones");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const data = {
        ...form,
        estimated_lbs_per_week: form.estimated_lbs_per_week ? parseFloat(form.estimated_lbs_per_week) : null
      };
      await axios.post(`${API}/quotes`, data);
      toast.success("Cotización creada");
      setDialogOpen(false);
      setForm(emptyForm);
      fetchQuotes();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Error creando cotización");
    } finally {
      setSubmitting(false);
    }
  };

  const updateStatus = async (quoteId, newStatus) => {
    try {
      await axios.put(`${API}/quotes/${quoteId}`, { status: newStatus });
      toast.success("Estado actualizado");
      fetchQuotes();
    } catch (error) {
      toast.error("Error actualizando estado");
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
    <div data-testid="quotes-page" className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Cotizaciones B2B</h1>
          <p className="text-slate-500 mt-1">Pipeline de clientes comerciales</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="btn-primary" data-testid="add-quote-btn">
              <Plus className="h-4 w-4 mr-2" />
              Nueva Cotización
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Nueva Cotización B2B</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 mt-4">
              <div>
                <Label>Empresa *</Label>
                <Input
                  value={form.company_name}
                  onChange={(e) => setForm({ ...form, company_name: e.target.value })}
                  required
                  className="mt-1.5"
                  data-testid="quote-company-input"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Contacto *</Label>
                  <Input
                    value={form.contact_name}
                    onChange={(e) => setForm({ ...form, contact_name: e.target.value })}
                    required
                    className="mt-1.5"
                    data-testid="quote-contact-input"
                  />
                </div>
                <div>
                  <Label>Industria</Label>
                  <Input
                    value={form.industry}
                    onChange={(e) => setForm({ ...form, industry: e.target.value })}
                    className="mt-1.5"
                    placeholder="Ej: Hotelería, Restaurantes"
                    data-testid="quote-industry-input"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="mt-1.5"
                    data-testid="quote-email-input"
                  />
                </div>
                <div>
                  <Label>Teléfono</Label>
                  <Input
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    className="mt-1.5"
                    data-testid="quote-phone-input"
                  />
                </div>
              </div>
              <div>
                <Label>Libras Estimadas por Semana</Label>
                <Input
                  type="number"
                  value={form.estimated_lbs_per_week}
                  onChange={(e) => setForm({ ...form, estimated_lbs_per_week: e.target.value })}
                  className="mt-1.5"
                  data-testid="quote-lbs-input"
                />
              </div>
              <div>
                <Label>Necesidades del Servicio</Label>
                <Textarea
                  value={form.service_needs}
                  onChange={(e) => setForm({ ...form, service_needs: e.target.value })}
                  className="mt-1.5"
                  rows={2}
                  placeholder="Describa las necesidades específicas..."
                  data-testid="quote-needs-input"
                />
              </div>
              <div>
                <Label>Notas</Label>
                <Textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className="mt-1.5"
                  rows={2}
                  data-testid="quote-notes-input"
                />
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" className="btn-primary" disabled={submitting} data-testid="quote-submit-btn">
                  {submitting ? "Creando..." : "Crear Cotización"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        {["all", "new", "sent", "negotiating", "won", "lost"].map((status) => (
          <Button
            key={status}
            variant={statusFilter === status ? "default" : "outline"}
            size="sm"
            onClick={() => setStatusFilter(status)}
            className={statusFilter === status ? "bg-sky-600 hover:bg-sky-700" : ""}
            data-testid={`filter-quote-${status}`}
          >
            {status === "all" ? "Todas" : statusLabels[status]?.label || status}
          </Button>
        ))}
      </div>

      {/* Quote Detail Dialog */}
      <Dialog open={!!viewQuote} onOpenChange={() => setViewQuote(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Cotización {viewQuote?.quote_number}</DialogTitle>
          </DialogHeader>
          {viewQuote && (
            <div className="space-y-4 mt-4">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-xl bg-sky-100 flex items-center justify-center">
                  <Building2 className="h-6 w-6 text-sky-600" />
                </div>
                <div>
                  <p className="font-semibold text-lg">{viewQuote.company_name}</p>
                  <p className="text-sm text-slate-500">{viewQuote.industry || "Sin industria"}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-slate-500">Contacto</p>
                  <p className="font-medium">{viewQuote.contact_name}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-500">Estado</p>
                  <span className={statusLabels[viewQuote.status]?.class}>{statusLabels[viewQuote.status]?.label}</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-slate-500">Email</p>
                  <p className="font-medium">{viewQuote.email || "-"}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-500">Teléfono</p>
                  <p className="font-medium">{viewQuote.phone || "-"}</p>
                </div>
              </div>
              <div>
                <p className="text-sm text-slate-500">Lbs/Semana Estimadas</p>
                <p className="font-medium">{viewQuote.estimated_lbs_per_week || "-"}</p>
              </div>
              {viewQuote.service_needs && (
                <div>
                  <p className="text-sm text-slate-500">Necesidades</p>
                  <p className="font-medium">{viewQuote.service_needs}</p>
                </div>
              )}
              {viewQuote.notes && (
                <div>
                  <p className="text-sm text-slate-500">Notas</p>
                  <p className="font-medium">{viewQuote.notes}</p>
                </div>
              )}
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
                <th className="text-left text-xs font-semibold text-slate-600 uppercase tracking-wider px-6 py-3">Cotización</th>
                <th className="text-left text-xs font-semibold text-slate-600 uppercase tracking-wider px-6 py-3">Empresa</th>
                <th className="text-left text-xs font-semibold text-slate-600 uppercase tracking-wider px-6 py-3">Contacto</th>
                <th className="text-left text-xs font-semibold text-slate-600 uppercase tracking-wider px-6 py-3">Lbs/Semana</th>
                <th className="text-left text-xs font-semibold text-slate-600 uppercase tracking-wider px-6 py-3">Estado</th>
                <th className="text-right text-xs font-semibold text-slate-600 uppercase tracking-wider px-6 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-slate-500">Cargando...</td>
                </tr>
              ) : quotes.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-slate-500">No hay cotizaciones</td>
                </tr>
              ) : (
                quotes.map((quote) => (
                  <tr key={quote.id} className="hover:bg-slate-50/50" data-testid={`quote-row-${quote.id}`}>
                    <td className="px-6 py-4">
                      <p className="font-mono font-medium text-slate-900">{quote.quote_number}</p>
                      <p className="text-xs text-slate-400">{formatDate(quote.created_at)}</p>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-lg bg-slate-100 flex items-center justify-center">
                          <Building2 className="h-4 w-4 text-slate-500" />
                        </div>
                        <div>
                          <p className="font-medium text-slate-900">{quote.company_name}</p>
                          <p className="text-xs text-slate-400">{quote.industry || "Sin industria"}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <p className="font-medium text-slate-900">{quote.contact_name}</p>
                      <div className="flex items-center gap-3 mt-1">
                        {quote.email && (
                          <div className="flex items-center gap-1 text-xs text-slate-400">
                            <Mail className="h-3 w-3" />
                            <span className="truncate max-w-[120px]">{quote.email}</span>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="font-medium">{quote.estimated_lbs_per_week || "-"}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={statusLabels[quote.status]?.class || "badge-pending"}>
                        {statusLabels[quote.status]?.label || quote.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" data-testid={`quote-actions-${quote.id}`}>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setViewQuote(quote)}>
                            <Eye className="h-4 w-4 mr-2" />
                            Ver detalles
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          {quote.status === "new" && (
                            <DropdownMenuItem onClick={() => updateStatus(quote.id, "sent")}>
                              Marcar Enviada
                            </DropdownMenuItem>
                          )}
                          {quote.status === "sent" && (
                            <DropdownMenuItem onClick={() => updateStatus(quote.id, "negotiating")}>
                              Marcar Negociando
                            </DropdownMenuItem>
                          )}
                          {["new", "sent", "negotiating"].includes(quote.status) && (
                            <>
                              <DropdownMenuItem onClick={() => updateStatus(quote.id, "won")} className="text-emerald-600">
                                Marcar Ganada
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => updateStatus(quote.id, "lost")} className="text-red-600">
                                Marcar Perdida
                              </DropdownMenuItem>
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
