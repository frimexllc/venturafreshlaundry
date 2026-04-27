import { useState, useEffect } from "react";
import axios from "axios";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "../components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Textarea } from "../components/ui/textarea";
import { toast } from "sonner";
import { Plus, Search, Mail, Phone, MapPin, MoreHorizontal, Edit, Trash2 } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../components/ui/dropdown-menu";
import { useLocale } from "../context/LocaleContext";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const emptyForm = {
  name: "",
  email: "",
  phone: "",
  address: "",
  preferred_contact: "email",
  notes: ""
};

export default function Customers() {
  const { t } = useLocale();
  const [customers, setCustomers] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [customerToDelete, setCustomerToDelete] = useState(null);

  useEffect(() => {
    fetchCustomers();
  }, []);

  const fetchCustomers = async (searchQuery = "") => {
    try {
      const params = searchQuery ? { search: searchQuery } : {};
      const res = await axios.get(`${API}/customers`, { params });
      setCustomers(res.data);
    } catch (error) {
      toast.error(t("Error loading customers", "Error cargando clientes"));
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e) => {
    const value = e.target.value;
    setSearch(value);
    fetchCustomers(value);
  };

  const handleOpenDialog = (customer = null) => {
    if (customer) {
      setEditingCustomer(customer);
      setForm({
        name: customer.name || "",
        email: customer.email || "",
        phone: customer.phone || "",
        address: customer.address || "",
        preferred_contact: customer.preferred_contact || "email",
        notes: customer.notes || ""
      });
    } else {
      setEditingCustomer(null);
      setForm(emptyForm);
    }
    setDialogOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      if (editingCustomer) {
        await axios.put(`${API}/customers/${editingCustomer.id}`, form);
        toast.success(t("Customer updated", "Cliente actualizado"));
      } else {
        await axios.post(`${API}/customers`, form);
        toast.success(t("Customer created", "Cliente creado"));
      }
      setDialogOpen(false);
      setForm(emptyForm);
      fetchCustomers(search);
    } catch (error) {
      toast.error(error.response?.data?.detail || t("Error saving customer", "Error guardando cliente"));
    } finally {
      setSubmitting(false);
    }
  };

  const confirmDelete = (customer) => {
    setCustomerToDelete(customer);
    setDeleteConfirmOpen(true);
  };

  const handleDelete = async () => {
    if (!customerToDelete) return;
    try {
      await axios.delete(`${API}/customers/${customerToDelete.id}`);
      toast.success(t("Customer deleted", "Cliente eliminado"));
      fetchCustomers(search);
      setDeleteConfirmOpen(false);
      setCustomerToDelete(null);
    } catch (error) {
      toast.error(t("Error deleting customer", "Error eliminando cliente"));
    }
  };

  return (
    <div data-testid="customers-page" className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t("Customers", "Clientes")}</h1>
          <p className="text-slate-500 mt-1">{t("Manage your customer base", "Gestiona tu base de clientes")}</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="btn-primary" onClick={() => handleOpenDialog()} data-testid="add-customer-btn">
              <Plus className="h-4 w-4 mr-2" />
              {t("New Customer", "Nuevo Cliente")}
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md bg-white" style={{ backgroundColor: 'white', opacity: 1 }}>
            <DialogHeader>
              <DialogTitle>{editingCustomer ? t("Edit Customer", "Editar Cliente") : t("New Customer", "Nuevo Cliente")}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 mt-4">
              <div>
                <Label>{t("Name *", "Nombre *")}</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                  className="mt-1.5"
                  data-testid="customer-name-input"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>{t("Email", "Correo")}</Label>
                  <Input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="mt-1.5"
                    data-testid="customer-email-input"
                  />
                </div>
                <div>
                  <Label>{t("Phone", "Teléfono")}</Label>
                  <Input
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    className="mt-1.5"
                    data-testid="customer-phone-input"
                  />
                </div>
              </div>
              <div>
                <Label>{t("Address", "Dirección")}</Label>
                <Input
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  className="mt-1.5"
                  data-testid="customer-address-input"
                />
              </div>
              <div>
                <Label>{t("Preferred contact", "Contacto preferido")}</Label>
                <Select value={form.preferred_contact} onValueChange={(v) => setForm({ ...form, preferred_contact: v })}>
                  <SelectTrigger className="mt-1.5" data-testid="customer-contact-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="email">{t("Email", "Correo")}</SelectItem>
                    <SelectItem value="phone">{t("Phone", "Teléfono")}</SelectItem>
                    <SelectItem value="sms">{t("SMS", "SMS")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t("Notes", "Notas")}</Label>
                <Textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className="mt-1.5"
                  rows={3}
                  data-testid="customer-notes-input"
                />
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                  {t("Cancel", "Cancelar")}
                </Button>
                <Button type="submit" className="btn-primary" disabled={submitting} data-testid="customer-submit-btn">
                  {submitting ? t("Saving...", "Guardando...") : (editingCustomer ? t("Update", "Actualizar") : t("Create", "Crear"))}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <Input
          placeholder={t("Search by name, email or phone...", "Buscar por nombre, email o teléfono...")}
          value={search}
          onChange={handleSearch}
          className="pl-10"
          data-testid="customer-search-input"
        />
      </div>

      {/* Table */}
      <div className="table-card">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left text-xs font-semibold text-slate-600 uppercase tracking-wider px-6 py-3">{t("Customer", "Cliente")}</th>
                <th className="text-left text-xs font-semibold text-slate-600 uppercase tracking-wider px-6 py-3">{t("Contact", "Contacto")}</th>
                <th className="text-left text-xs font-semibold text-slate-600 uppercase tracking-wider px-6 py-3">{t("Address", "Dirección")}</th>
                <th className="text-left text-xs font-semibold text-slate-600 uppercase tracking-wider px-6 py-3">{t("Orders", "Órdenes")}</th>
                <th className="text-left text-xs font-semibold text-slate-600 uppercase tracking-wider px-6 py-3">{t("Status", "Estado")}</th>
                <th className="text-right text-xs font-semibold text-slate-600 uppercase tracking-wider px-6 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-slate-500">{t("Loading...", "Cargando...")}</td>
                </tr>
              ) : customers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-slate-500">{t("No customers", "No hay clientes")}</td>
                </tr>
              ) : (
                customers.map((customer) => (
                  <tr key={customer.id} className="hover:bg-slate-50/50" data-testid={`customer-row-${customer.id}`}>
                    <td className="px-6 py-4">
                      <p className="font-medium text-slate-900">{customer.name}</p>
                      <p className="text-xs text-slate-400 font-mono mt-0.5">{customer.id.slice(0, 8)}</p>
                    </td>
                    <td className="px-6 py-4">
                      <div className="space-y-1">
                        {customer.email && (
                          <div className="flex items-center gap-2 text-sm text-slate-600">
                            <Mail className="h-3.5 w-3.5" />
                            {customer.email}
                          </div>
                        )}
                        {customer.phone && (
                          <div className="flex items-center gap-2 text-sm text-slate-600">
                            <Phone className="h-3.5 w-3.5" />
                            {customer.phone}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {customer.address ? (
                        <div className="flex items-center gap-2 text-sm text-slate-600">
                          <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
                          <span className="truncate max-w-[200px]">{customer.address}</span>
                        </div>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm font-medium text-slate-900">{customer.total_orders}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`badge-${customer.status === 'active' ? 'completed' : 'cancelled'}`}>
                        {customer.status === 'active' ? t("Active", "Activo") : t("Inactive", "Inactivo")}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" data-testid={`customer-actions-${customer.id}`}>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleOpenDialog(customer)}>
                            <Edit className="h-4 w-4 mr-2" />
                            {t("Edit", "Editar")}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => confirmDelete(customer)} className="text-red-600">
                            <Trash2 className="h-4 w-4 mr-2" />
                            {t("Delete", "Eliminar")}
                          </DropdownMenuItem>
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

      {/* Modal de confirmación de eliminación */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("Confirm deletion", "Confirmar eliminación")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-slate-600">
              {t("Are you sure you want to delete the customer", "¿Estás seguro de que deseas eliminar al cliente")}{" "}
              <strong className="font-semibold text-slate-900">"{customerToDelete?.name}"</strong>?
            </p>
            {customerToDelete?.total_orders > 0 && (
              <p className="text-sm text-amber-600">
                {t("This customer has", "Este cliente tiene")} {customerToDelete.total_orders} {t("orders. Deleting will affect order history.", "órdenes. Eliminarlo afectará el historial de órdenes.")}
              </p>
            )}
            <p className="text-sm text-red-600">{t("This action cannot be undone.", "Esta acción no se puede deshacer.")}</p>
            <div className="flex gap-3 pt-2">
              <Button 
                variant="outline" 
                onClick={() => setDeleteConfirmOpen(false)} 
                className="flex-1"
              >
                {t("Cancel", "Cancelar")}
              </Button>
              <Button 
                onClick={handleDelete} 
                className="flex-1 bg-red-600 hover:bg-red-700"
              >
                {t("Delete", "Eliminar")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}