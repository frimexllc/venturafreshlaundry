import { useState, useEffect } from "react";
import axios from "axios";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { toast } from "sonner";
import { Plus, Edit2, Trash2, Search } from "lucide-react";
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

export default function AdminServices() {
  const { t } = useLocale();
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingService, setEditingService] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [search, setSearch] = useState("");

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

  const handleDelete = async (id) => {
    if (!confirm(t("Delete this service?", "¿Eliminar este servicio?"))) return;
    try {
      await axios.delete(`${API}/services/${id}`);
      toast.success(t("Service deleted", "Servicio eliminado"));
      fetchServices(search);
    } catch (error) {
      toast.error(t("Error deleting service", "Error eliminando servicio"));
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
        <Button onClick={() => openDialog()}>
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
                  <tr key={service.id} className="hover:bg-slate-50">
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
                        <Button variant="ghost" size="sm" onClick={() => openDialog(service)}>
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleDelete(service.id)}>
                          <Trash2 className="h-4 w-4 text-rose-500" />
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingService ? t("Edit Service", "Editar servicio") : t("New Service", "Nuevo servicio")}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <Label>{t("Name", "Nombre")}</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              </div>
              <div>
                <Label>{t("Category", "Categoría")}</Label>
                <Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
              </div>
              <div>
                <Label>{t("Price", "Precio")}</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })}
                />
              </div>
              <div>
                <Label>{t("Price Unit", "Unidad de precio")}</Label>
                <Select value={form.price_unit} onValueChange={(value) => setForm({ ...form, price_unit: value })}>
                  <SelectTrigger>
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
                />
              </div>
              <div>
                <Label>{t("Status", "Estado")}</Label>
                <Select value={form.is_active ? "active" : "inactive"} onValueChange={(value) => setForm({ ...form, is_active: value === "active" })}>
                  <SelectTrigger>
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
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={4} />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                {t("Cancel", "Cancelar")}
              </Button>
              <Button type="submit">
                {editingService ? t("Save Changes", "Guardar cambios") : t("Create Service", "Crear servicio")}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}