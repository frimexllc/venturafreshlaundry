import { useState, useEffect } from "react";
import axios from "axios";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "../components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Textarea } from "../components/ui/textarea";
import { toast } from "sonner";
import { Plus, UserPlus, MoreHorizontal, ArrowRight, Mail, Phone } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "../components/ui/dropdown-menu";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const statusLabels = {
  new: { label: "Nuevo", class: "badge-pending" },
  contacted: { label: "Contactado", class: "badge-processing" },
  qualified: { label: "Calificado", class: "badge-processing" },
  converted: { label: "Convertido", class: "badge-completed" },
  lost: { label: "Perdido", class: "badge-cancelled" }
};

const sourceLabels = {
  website: "Sitio Web",
  referral: "Referido",
  social: "Redes Sociales",
  walk_in: "Walk-in",
  b2b_quote: "Cotización B2B",
  other: "Otro"
};

const emptyForm = {
  name: "",
  email: "",
  phone: "",
  source: "website",
  interest_type: "",
  notes: ""
};

export default function Leads() {
  const [leads, setLeads] = useState([]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchLeads();
  }, [statusFilter]);

  const fetchLeads = async () => {
    try {
      const params = statusFilter !== "all" ? { status: statusFilter } : {};
      const res = await axios.get(`${API}/leads`, { params });
      setLeads(res.data);
    } catch (error) {
      toast.error("Error cargando leads");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      await axios.post(`${API}/leads`, form);
      toast.success("Lead creado");
      setDialogOpen(false);
      setForm(emptyForm);
      fetchLeads();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Error creando lead");
    } finally {
      setSubmitting(false);
    }
  };

  const updateStatus = async (leadId, newStatus) => {
    try {
      await axios.put(`${API}/leads/${leadId}`, { status: newStatus });
      toast.success("Estado actualizado");
      fetchLeads();
    } catch (error) {
      toast.error("Error actualizando estado");
    }
  };

  const convertToCustomer = async (leadId) => {
    try {
      await axios.post(`${API}/leads/${leadId}/convert`);
      toast.success("Lead convertido a cliente");
      fetchLeads();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Error convirtiendo lead");
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
    <div data-testid="leads-page" className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Leads</h1>
          <p className="text-slate-500 mt-1">Prospectos y clientes potenciales</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="btn-primary" data-testid="add-lead-btn">
              <Plus className="h-4 w-4 mr-2" />
              Nuevo Lead
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Nuevo Lead</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 mt-4">
              <div>
                <Label>Nombre *</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                  className="mt-1.5"
                  data-testid="lead-name-input"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="mt-1.5"
                    data-testid="lead-email-input"
                  />
                </div>
                <div>
                  <Label>Teléfono</Label>
                  <Input
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    className="mt-1.5"
                    data-testid="lead-phone-input"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Fuente</Label>
                  <Select value={form.source} onValueChange={(v) => setForm({ ...form, source: v })}>
                    <SelectTrigger className="mt-1.5" data-testid="lead-source-select">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="website">Sitio Web</SelectItem>
                      <SelectItem value="referral">Referido</SelectItem>
                      <SelectItem value="social">Redes Sociales</SelectItem>
                      <SelectItem value="walk_in">Walk-in</SelectItem>
                      <SelectItem value="other">Otro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Interés</Label>
                  <Input
                    value={form.interest_type}
                    onChange={(e) => setForm({ ...form, interest_type: e.target.value })}
                    className="mt-1.5"
                    placeholder="Ej: Pickup, Wash & Fold"
                    data-testid="lead-interest-input"
                  />
                </div>
              </div>
              <div>
                <Label>Notas</Label>
                <Textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className="mt-1.5"
                  rows={3}
                  data-testid="lead-notes-input"
                />
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" className="btn-primary" disabled={submitting} data-testid="lead-submit-btn">
                  {submitting ? "Creando..." : "Crear Lead"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        {["all", "new", "contacted", "qualified", "converted", "lost"].map((status) => (
          <Button
            key={status}
            variant={statusFilter === status ? "default" : "outline"}
            size="sm"
            onClick={() => setStatusFilter(status)}
            className={statusFilter === status ? "bg-sky-600 hover:bg-sky-700" : ""}
            data-testid={`filter-lead-${status}`}
          >
            {status === "all" ? "Todos" : statusLabels[status]?.label || status}
          </Button>
        ))}
      </div>

      {/* Table */}
      <div className="table-card">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left text-xs font-semibold text-slate-600 uppercase tracking-wider px-6 py-3">Lead</th>
                <th className="text-left text-xs font-semibold text-slate-600 uppercase tracking-wider px-6 py-3">Contacto</th>
                <th className="text-left text-xs font-semibold text-slate-600 uppercase tracking-wider px-6 py-3">Fuente</th>
                <th className="text-left text-xs font-semibold text-slate-600 uppercase tracking-wider px-6 py-3">Interés</th>
                <th className="text-left text-xs font-semibold text-slate-600 uppercase tracking-wider px-6 py-3">Estado</th>
                <th className="text-right text-xs font-semibold text-slate-600 uppercase tracking-wider px-6 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-slate-500">Cargando...</td>
                </tr>
              ) : leads.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-slate-500">No hay leads</td>
                </tr>
              ) : (
                leads.map((lead) => (
                  <tr key={lead.id} className="hover:bg-slate-50/50" data-testid={`lead-row-${lead.id}`}>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-full bg-indigo-100 flex items-center justify-center">
                          <UserPlus className="h-4 w-4 text-indigo-600" />
                        </div>
                        <div>
                          <p className="font-medium text-slate-900">{lead.name}</p>
                          <p className="text-xs text-slate-400">{formatDate(lead.created_at)}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="space-y-1">
                        {lead.email && (
                          <div className="flex items-center gap-2 text-sm text-slate-600">
                            <Mail className="h-3.5 w-3.5" />
                            {lead.email}
                          </div>
                        )}
                        {lead.phone && (
                          <div className="flex items-center gap-2 text-sm text-slate-600">
                            <Phone className="h-3.5 w-3.5" />
                            {lead.phone}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm">{sourceLabels[lead.source] || lead.source}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm">{lead.interest_type || "-"}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={statusLabels[lead.status]?.class || "badge-pending"}>
                        {statusLabels[lead.status]?.label || lead.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" data-testid={`lead-actions-${lead.id}`}>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {lead.status === "new" && (
                            <DropdownMenuItem onClick={() => updateStatus(lead.id, "contacted")}>
                              Marcar Contactado
                            </DropdownMenuItem>
                          )}
                          {lead.status === "contacted" && (
                            <DropdownMenuItem onClick={() => updateStatus(lead.id, "qualified")}>
                              Marcar Calificado
                            </DropdownMenuItem>
                          )}
                          {["new", "contacted", "qualified"].includes(lead.status) && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => convertToCustomer(lead.id)} className="text-emerald-600">
                                <ArrowRight className="h-4 w-4 mr-2" />
                                Convertir a Cliente
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => updateStatus(lead.id, "lost")} className="text-red-600">
                                Marcar Perdido
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
