import { useEffect, useState } from "react";
import axios from "axios";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { toast } from "sonner";
import { Plus, Edit2, Trash2 } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const emptyPlan = {
  name: "",
  price: "",
  image_url: "",
  features: "",
  is_popular: false,
  is_active: true,
  sort_order: 0
};

export default function AdminMemberships() {
  const [section, setSection] = useState(null);
  const [plans, setPlans] = useState([]);
  const [signups, setSignups] = useState([]);
  const [membershipCustomers, setMembershipCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingSignups, setLoadingSignups] = useState(true);
  const [loadingCustomers, setLoadingCustomers] = useState(true);
  const [planDialogOpen, setPlanDialogOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState(null);
  const [planForm, setPlanForm] = useState(emptyPlan);
  const [savingSection, setSavingSection] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");

  useEffect(() => {
    loadData();
  }, []);

  const loadCustomers = async (searchValue = "") => {
    setLoadingCustomers(true);
    try {
      const customersRes = await axios.get(`${API}/memberships/customers`, { params: { search: searchValue || undefined } });
      setMembershipCustomers(customersRes.data);
    } catch (error) {
      toast.error("Error cargando clientes con membresía");
    } finally {
      setLoadingCustomers(false);
    }
  };

  const loadData = async () => {
    setLoading(true);
    setLoadingSignups(true);
    try {
      const [sectionRes, plansRes, signupsRes] = await Promise.all([
        axios.get(`${API}/memberships/section`),
        axios.get(`${API}/memberships/plans`, { params: { active_only: false } }),
        axios.get(`${API}/memberships/signups`)
      ]);
      setSection(sectionRes.data);
      setPlans(plansRes.data);
      setSignups(signupsRes.data);
      loadCustomers(customerSearch);
    } catch (error) {
      toast.error("Error cargando membresías");
    } finally {
      setLoading(false);
      setLoadingSignups(false);
    }
  };

  const updateSectionField = (key, value) => {
    setSection((prev) => ({ ...prev, [key]: value }));
  };

  const saveSection = async () => {
    setSavingSection(true);
    try {
      await axios.put(`${API}/memberships/section`, {
        heading: section.heading,
        subheading: section.subheading || null,
        special_title: section.special_title || null,
        special_text: section.special_text || null,
        cta_title: section.cta_title || null,
        cta_text: section.cta_text || null,
        cta_button_label: section.cta_button_label || null,
        cta_button_url: section.cta_button_url || null,
        contact_phone: section.contact_phone || null,
        is_active: section.is_active
      });
      toast.success("Sección actualizada");
      loadData();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Error actualizando sección");
    } finally {
      setSavingSection(false);
    }
  };

  const openPlanDialog = (plan = null) => {
    if (plan) {
      setEditingPlan(plan);
      setPlanForm({
        name: plan.name || "",
        price: plan.price || "",
        image_url: plan.image_url || "",
        features: (plan.features || []).join("\n"),
        is_popular: plan.is_popular,
        is_active: plan.is_active,
        sort_order: plan.sort_order ?? 0
      });
    } else {
      setEditingPlan(null);
      setPlanForm(emptyPlan);
    }
    setPlanDialogOpen(true);
  };

  const handlePlanSubmit = async (e) => {
    e.preventDefault();
    const payload = {
      name: planForm.name,
      price: planForm.price,
      image_url: planForm.image_url || null,
      features: planForm.features
        .split("\n")
        .map((item) => item.trim())
        .filter(Boolean),
      is_popular: planForm.is_popular,
      is_active: planForm.is_active,
      sort_order: planForm.sort_order === "" ? 0 : parseInt(planForm.sort_order, 10)
    };
    try {
      if (editingPlan) {
        await axios.put(`${API}/memberships/plans/${editingPlan.id}`, payload);
        toast.success("Plan actualizado");
      } else {
        await axios.post(`${API}/memberships/plans`, payload);
        toast.success("Plan creado");
      }
      setPlanDialogOpen(false);
      setEditingPlan(null);
      setPlanForm(emptyPlan);
      loadData();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Error guardando plan");
    }
  };

  const deletePlan = async (id) => {
    if (!confirm("¿Eliminar este plan?")) return;
    try {
      await axios.delete(`${API}/memberships/plans/${id}`);
      toast.success("Plan eliminado");
      loadData();
    } catch (error) {
      toast.error("Error eliminando plan");
    }
  };

  const updateSignupStatus = async (signupId, status) => {
    try {
      await axios.put(`${API}/memberships/signups/${signupId}`, { status });
      toast.success("Solicitud actualizada");
      loadData();
    } catch (error) {
      toast.error("Error actualizando solicitud");
    }
  };

  const convertSignup = async (signupId) => {
    if (!confirm("¿Convertir esta solicitud en cliente?")) return;
    try {
      await axios.post(`${API}/memberships/signups/${signupId}/convert`);
      toast.success("Cliente creado/actualizado");
      loadData();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Error convirtiendo solicitud");
    }
  };

  const updateMembershipCustomer = async (customerId, payload) => {
    try {
      await axios.put(`${API}/memberships/customers/${customerId}`, payload);
      toast.success("Cliente actualizado");
      loadData();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Error actualizando cliente");
    }
  };

  const handleCustomerSearch = (e) => {
    const value = e.target.value;
    setCustomerSearch(value);
    loadCustomers(value);
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Membresías</h1>
          <p className="text-slate-600">Gestiona el bloque de planes y su contenido</p>
        </div>
        <Button onClick={() => openPlanDialog()}>
          <Plus className="h-4 w-4 mr-2" />
          Nuevo plan
        </Button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
        <h2 className="text-lg font-semibold text-slate-900">Sección</h2>
        {loading || !section ? (
          <p className="text-slate-500">Cargando...</p>
        ) : (
          <>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <Label>Título</Label>
                <Input value={section.heading || ""} onChange={(e) => updateSectionField("heading", e.target.value)} />
              </div>
              <div>
                <Label>Subtítulo</Label>
                <Input value={section.subheading || ""} onChange={(e) => updateSectionField("subheading", e.target.value)} />
              </div>
              <div>
                <Label>Título especial</Label>
                <Input value={section.special_title || ""} onChange={(e) => updateSectionField("special_title", e.target.value)} />
              </div>
              <div>
                <Label>Teléfono</Label>
                <Input value={section.contact_phone || ""} onChange={(e) => updateSectionField("contact_phone", e.target.value)} />
              </div>
              <div>
                <Label>Botón CTA</Label>
                <Input value={section.cta_button_label || ""} onChange={(e) => updateSectionField("cta_button_label", e.target.value)} />
              </div>
              <div>
                <Label>URL CTA</Label>
                <Input value={section.cta_button_url || ""} onChange={(e) => updateSectionField("cta_button_url", e.target.value)} />
              </div>
              <div>
                <Label>Título ayuda</Label>
                <Input value={section.cta_title || ""} onChange={(e) => updateSectionField("cta_title", e.target.value)} />
              </div>
              <div>
                <Label>Activo</Label>
                <select
                  className="w-full h-10 rounded-md border border-slate-200 px-3 text-sm"
                  value={section.is_active ? "active" : "inactive"}
                  onChange={(e) => updateSectionField("is_active", e.target.value === "active")}
                >
                  <option value="active">Activo</option>
                  <option value="inactive">Inactivo</option>
                </select>
              </div>
            </div>
            <div>
              <Label>Texto especial</Label>
              <Textarea value={section.special_text || ""} onChange={(e) => updateSectionField("special_text", e.target.value)} rows={3} />
            </div>
            <div>
              <Label>Texto ayuda</Label>
              <Textarea value={section.cta_text || ""} onChange={(e) => updateSectionField("cta_text", e.target.value)} rows={3} />
            </div>
            <div className="flex justify-end">
              <Button onClick={saveSection} disabled={savingSection}>
                {savingSection ? "Guardando..." : "Guardar sección"}
              </Button>
            </div>
          </>
        )}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Plan</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Precio</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Popular</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Activo</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase">Orden</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading ? (
                <tr>
                  <td colSpan="6" className="px-4 py-6 text-center text-slate-500">Cargando...</td>
                </tr>
              ) : plans.length === 0 ? (
                <tr>
                  <td colSpan="6" className="px-4 py-6 text-center text-slate-500">Sin planes</td>
                </tr>
              ) : (
                plans.map((plan) => (
                  <tr key={plan.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-sm font-medium text-slate-900">{plan.name}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">{plan.price}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">{plan.is_popular ? "Sí" : "No"}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">{plan.is_active ? "Activo" : "Inactivo"}</td>
                    <td className="px-4 py-3 text-sm text-slate-600 text-right">{plan.sort_order ?? 0}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button variant="ghost" size="sm" onClick={() => openPlanDialog(plan)}>
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => deletePlan(plan.id)}>
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

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-4 py-4 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-900">Solicitudes de membresía</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Cliente</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Plan</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Frecuencia</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Lbs</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Contacto</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Estado</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loadingSignups ? (
                <tr>
                  <td colSpan="7" className="px-4 py-6 text-center text-slate-500">Cargando...</td>
                </tr>
              ) : signups.length === 0 ? (
                <tr>
                  <td colSpan="7" className="px-4 py-6 text-center text-slate-500">Sin solicitudes</td>
                </tr>
              ) : (
                signups.map((signup) => (
                  <tr key={signup.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-sm font-medium text-slate-900">{signup.first_name} {signup.last_name}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">{signup.membership_plan}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">{signup.laundry_frequency}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">{signup.estimated_lbs}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">
                      {signup.email}
                      <div className="text-xs text-slate-400">{signup.phone}</div>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <select
                        className="h-9 rounded-md border border-slate-200 px-2 text-sm"
                        value={signup.status}
                        onChange={(e) => updateSignupStatus(signup.id, e.target.value)}
                      >
                        <option value="new">Nuevo</option>
                        <option value="contacted">Contactado</option>
                        <option value="converted">Convertido</option>
                        <option value="cancelled">Cancelado</option>
                      </select>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button size="sm" onClick={() => convertSignup(signup.id)} disabled={signup.status === "converted"}>
                        Convertir
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-4 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-900">Clientes con membresía</h2>
          <Input
            placeholder="Buscar cliente..."
            value={customerSearch}
            onChange={handleCustomerSearch}
            className="sm:max-w-xs"
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Cliente</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Email</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Plan</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Estado</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Inicio</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loadingCustomers ? (
                <tr>
                  <td colSpan="5" className="px-4 py-6 text-center text-slate-500">Cargando...</td>
                </tr>
              ) : membershipCustomers.length === 0 ? (
                <tr>
                  <td colSpan="5" className="px-4 py-6 text-center text-slate-500">Sin clientes</td>
                </tr>
              ) : (
                membershipCustomers.map((customer) => (
                  <tr key={customer.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-sm font-medium text-slate-900">{customer.name}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">{customer.email || "—"}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">
                      <select
                        className="h-9 rounded-md border border-slate-200 px-2 text-sm"
                        value={customer.membership_plan || ""}
                        onChange={(e) => updateMembershipCustomer(customer.id, { membership_plan: e.target.value })}
                      >
                        <option value="">Sin plan</option>
                        {plans.map((plan) => (
                          <option key={plan.id} value={plan.name}>{plan.name}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">
                      <select
                        className="h-9 rounded-md border border-slate-200 px-2 text-sm"
                        value={customer.membership_status || ""}
                        onChange={(e) => updateMembershipCustomer(customer.id, { membership_status: e.target.value })}
                      >
                        <option value="">Sin estado</option>
                        <option value="active">Activo</option>
                        <option value="paused">Pausado</option>
                        <option value="cancelled">Cancelado</option>
                      </select>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">{customer.membership_start_date ? new Date(customer.membership_start_date).toLocaleDateString() : "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={planDialogOpen} onOpenChange={setPlanDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingPlan ? "Editar plan" : "Nuevo plan"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handlePlanSubmit} className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <Label>Nombre</Label>
                <Input value={planForm.name} onChange={(e) => setPlanForm({ ...planForm, name: e.target.value })} required />
              </div>
              <div>
                <Label>Precio</Label>
                <Input value={planForm.price} onChange={(e) => setPlanForm({ ...planForm, price: e.target.value })} required />
              </div>
              <div>
                <Label>Imagen (URL)</Label>
                <Input value={planForm.image_url} onChange={(e) => setPlanForm({ ...planForm, image_url: e.target.value })} />
              </div>
              <div>
                <Label>Orden</Label>
                <Input
                  type="number"
                  value={planForm.sort_order}
                  onChange={(e) => setPlanForm({ ...planForm, sort_order: e.target.value })}
                />
              </div>
              <div>
                <Label>Popular</Label>
                <select
                  className="w-full h-10 rounded-md border border-slate-200 px-3 text-sm"
                  value={planForm.is_popular ? "yes" : "no"}
                  onChange={(e) => setPlanForm({ ...planForm, is_popular: e.target.value === "yes" })}
                >
                  <option value="yes">Sí</option>
                  <option value="no">No</option>
                </select>
              </div>
              <div>
                <Label>Activo</Label>
                <select
                  className="w-full h-10 rounded-md border border-slate-200 px-3 text-sm"
                  value={planForm.is_active ? "active" : "inactive"}
                  onChange={(e) => setPlanForm({ ...planForm, is_active: e.target.value === "active" })}
                >
                  <option value="active">Activo</option>
                  <option value="inactive">Inactivo</option>
                </select>
              </div>
            </div>
            <div>
              <Label>Características (una por línea)</Label>
              <Textarea value={planForm.features} onChange={(e) => setPlanForm({ ...planForm, features: e.target.value })} rows={6} />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setPlanDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit">
                {editingPlan ? "Guardar cambios" : "Crear plan"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
