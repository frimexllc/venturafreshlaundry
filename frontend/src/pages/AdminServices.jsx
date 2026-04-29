import { useState, useEffect } from "react";
import axios from "axios";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { toast } from "sonner";
import { Plus, Edit2, Trash2, Search, AlertTriangle } from "lucide-react";
import { useLocale } from "../context/LocaleContext";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const emptyForm = {
  name: "",
  category: "",
  description: "",
  price: "",
  price_unit: "per_lb",
  is_active: true,
  sort_order: 0
};

const priceUnitLabels = {
  per_lb: "Per pound",
  per_order: "Per order",
  per_month: "Per month",
  per_item: "Per item"
};

// Componente de Confirmación Modal
const ConfirmationModal = ({ isOpen, onClose, onConfirm, title, message, confirmText = "Eliminar", cancelText = "Cancelar", variant = "danger" }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className={`p-2 rounded-full ${variant === 'danger' ? 'bg-red-100' : 'bg-amber-100'}`}>
            <AlertTriangle className={`h-5 w-5 ${variant === 'danger' ? 'text-red-600' : 'text-amber-600'}`} />
          </div>
          <h2 className="text-xl font-bold text-slate-900">{title}</h2>
        </div>
        <p className="text-slate-600 mb-6">{message}</p>
        <div className="flex gap-3">
          <Button type="button" variant="outline" onClick={onClose} className="flex-1">
            {cancelText}
          </Button>
          <Button 
            type="button" 
            onClick={onConfirm} 
            className={`flex-1 ${variant === 'danger' ? 'bg-red-600 hover:bg-red-700' : 'bg-amber-600 hover:bg-amber-700'}`}
          >
            {confirmText}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default function AdminServices() {
  const { t } = useLocale();
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingService, setEditingService] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [search, setSearch] = useState("");
  
  // Estado para el modal de confirmación de eliminación
  const [deleteConfirm, setDeleteConfirm] = useState({ isOpen: false, serviceId: null, serviceName: '' });

  useEffect(() => {
    fetchServices();
  }, []);

  const fetchServices = async (searchQuery = "") => {
    try {
      const res = await axios.get(`${API}/services`, {
        params: { active_only: false, search: searchQuery || undefined }
      });
      setServices(res.data);
    } catch (error) {
      toast.error(t("Error loading services", "Error cargando servicios"));
    } finally {
      setLoading(false);
    }
  };

  const openDialog = (service = null) => {
    if (service) {
      setEditingService(service);
      setForm({
        name: service.name || "",
        category: service.category || "",
        description: service.description || "",
        price: service.price ?? "",
        price_unit: service.price_unit || "per_lb",
        is_active: service.is_active !== false,
        sort_order: service.sort_order ?? 0
      });
    } else {
      setEditingService(null);
      setForm(emptyForm);
    }
    setDialogOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...form,
        price: form.price === "" ? null : parseFloat(form.price),
        sort_order: form.sort_order === "" ? 0 : parseInt(form.sort_order, 10)
      };
      if (editingService) {
        await axios.put(`${API}/services/${editingService.id}`, payload);
        toast.success(t("Service updated", "Servicio actualizado"));
      } else {
        await axios.post(`${API}/services`, payload);
        toast.success(t("Service created", "Servicio creado"));
      }
      setDialogOpen(false);
      setEditingService(null);
      setForm(emptyForm);
      fetchServices(search);
    } catch (error) {
      toast.error(error.response?.data?.detail || t("Error saving service", "Error guardando servicio"));
    }
  };

  const handleDelete = async () => {
    const { serviceId } = deleteConfirm;
    try {
      await axios.delete(`${API}/services/${serviceId}`);
      toast.success(t("Service deleted", "Servicio eliminado"));
      fetchServices(search);
    } catch (error) {
      toast.error(t("Error deleting service", "Error eliminando servicio"));
    } finally {
      setDeleteConfirm({ isOpen: false, serviceId: null, serviceName: '' });
    }
  };

  const handleSearch = (e) => {
    const value = e.target.value;
    setSearch(value);
    fetchServices(value);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t("Services", "Servicios")}</h1>
          <p className="text-slate-600">
            {t("Manage services, pricing, and status", "Gestiona servicios, precios y estado")}
          </p>
        </div>
        <Button onClick={() => openDialog()} className="bg-sky-600 hover:bg-sky-700">
          <Plus className="h-4 w-4 mr-2" />
          {t("New Service", "Nuevo servicio")}
        </Button>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <Input
          placeholder={t("Search services...", "Buscar servicios...")}
          value={search}
          onChange={handleSearch}
          className="pl-10"
          data-testid="services-search"
        />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">{t("Service", "Servicio")}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">{t("Category", "Categoría")}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">{t("Price", "Precio")}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">{t("Status", "Estado")}</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase">{t("Order", "Orden")}</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase">{t("Actions", "Acciones")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading ? (
                <tr>
                  <td colSpan="6" className="px-4 py-6 text-center text-slate-500">{t("Loading...", "Cargando...")}</td>
                </tr>
              ) : services.length === 0 ? (
                <tr>
                  <td colSpan="6" className="px-4 py-6 text-center text-slate-500">{t("No services", "Sin servicios")}</td>
                </tr>
              ) : (
                services.map((service) => (
                  <tr key={service.id} className="hover:bg-slate-50" data-testid={`service-row-${service.id}`}>
                    <td className="px-4 py-3 text-sm font-medium text-slate-900">{service.name}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">{service.category || "—"}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">
                      {service.price != null ? `$${service.price}` : "—"} {service.price_unit ? `(${t(priceUnitLabels[service.price_unit], priceUnitLabels[service.price_unit])})` : ""}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${service.is_active ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"}`}>
                        {service.is_active ? t("Active", "Activo") : t("Inactive", "Inactivo")}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600 text-right">{service.sort_order ?? 0}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => openDialog(service)}
                          data-testid={`edit-service-${service.id}`}
                        >
                          <Edit2 className="h-4 w-4 text-slate-500 hover:text-sky-600" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => setDeleteConfirm({ isOpen: true, serviceId: service.id, serviceName: service.name })}
                          data-testid={`delete-service-${service.id}`}
                        >
                          <Trash2 className="h-4 w-4 text-rose-500 hover:text-rose-700" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de confirmación para eliminar servicio */}
      <ConfirmationModal
        isOpen={deleteConfirm.isOpen}
        onClose={() => setDeleteConfirm({ isOpen: false, serviceId: null, serviceName: '' })}
        onConfirm={handleDelete}
        title={t("Delete Service", "Eliminar Servicio")}
        message={t(`Are you sure you want to delete "${deleteConfirm.serviceName}"? This action cannot be undone.`, `¿Estás seguro de eliminar "${deleteConfirm.serviceName}"? Esta acción no se puede deshacer.`)}
        confirmText={t("Delete", "Eliminar")}
        cancelText={t("Cancel", "Cancelar")}
        variant="danger"
      />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingService ? t("Edit Service", "Editar servicio") : t("New Service", "Nuevo servicio")}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <Label>{t("Name", "Nombre")}</Label>
                <Input 
                  value={form.name} 
                  onChange={(e) => setForm({ ...form, name: e.target.value })} 
                  required 
                  data-testid="service-name-input"
                />
              </div>
              <div>
                <Label>{t("Category", "Categoría")}</Label>
                <Input 
                  value={form.category} 
                  onChange={(e) => setForm({ ...form, category: e.target.value })} 
                  data-testid="service-category-input"
                />
              </div>
              <div>
                <Label>{t("Price", "Precio")}</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })}
                  data-testid="service-price-input"
                />
              </div>
              <div>
                <Label>{t("Price Unit", "Unidad de precio")}</Label>
                <Select value={form.price_unit} onValueChange={(value) => setForm({ ...form, price_unit: value })}>
                  <SelectTrigger data-testid="service-price-unit">
                    <SelectValue placeholder={t("Select unit", "Selecciona unidad")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="per_lb">{t("Per pound", "Por libra")}</SelectItem>
                    <SelectItem value="per_order">{t("Per order", "Por orden")}</SelectItem>
                    <SelectItem value="per_month">{t("Per month", "Por mes")}</SelectItem>
                    <SelectItem value="per_item">{t("Per item", "Por pieza")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t("Order", "Orden")}</Label>
                <Input
                  type="number"
                  value={form.sort_order}
                  onChange={(e) => setForm({ ...form, sort_order: e.target.value })}
                  data-testid="service-sort-order"
                />
              </div>
              <div>
                <Label>{t("Status", "Estado")}</Label>
                <Select value={form.is_active ? "active" : "inactive"} onValueChange={(value) => setForm({ ...form, is_active: value === "active" })}>
                  <SelectTrigger data-testid="service-status">
                    <SelectValue placeholder={t("Select status", "Selecciona estado")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">{t("Active", "Activo")}</SelectItem>
                    <SelectItem value="inactive">{t("Inactive", "Inactivo")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>{t("Description", "Descripción")}</Label>
              <Textarea 
                value={form.description} 
                onChange={(e) => setForm({ ...form, description: e.target.value })} 
                rows={4}
                data-testid="service-description"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} data-testid="service-cancel-btn">
                {t("Cancel", "Cancelar")}
              </Button>
              <Button type="submit" className="bg-sky-600 hover:bg-sky-700" data-testid="service-submit-btn">
                {editingService ? t("Save Changes", "Guardar cambios") : t("Create Service", "Crear servicio")}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}