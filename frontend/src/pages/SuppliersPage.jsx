import { useState, useEffect } from "react";
import { useLocale } from "../context/LocaleContext";
import { Plus, Search, Truck, Phone, Mail, MapPin, Globe, Edit, Trash2, X, ChevronDown, Package } from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Badge } from "../components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import { toast } from "sonner";

const API = process.env.REACT_APP_BACKEND_URL;
const headers = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("token")}` });

const CAT_LABELS = { chemicals: "Quimicos", packaging: "Empaque", equipment: "Equipo", uniforms: "Uniformes", maintenance: "Mantenimiento", delivery: "Entrega", general: "General", other: "Otro" };
const CAT_COLORS = { chemicals: "bg-blue-100 text-blue-800", packaging: "bg-amber-100 text-amber-800", equipment: "bg-purple-100 text-purple-800", uniforms: "bg-pink-100 text-pink-800", maintenance: "bg-red-100 text-red-800", delivery: "bg-green-100 text-green-800", general: "bg-gray-100 text-gray-800", other: "bg-gray-100 text-gray-800" };

const empty = { name: "", contact_name: "", email: "", phone: "", address: "", website: "", category: "general", products_services: [], payment_terms: "", notes: "", status: "active" };

export default function SuppliersPage() {
  const { t } = useLocale();
  const [suppliers, setSuppliers] = useState([]);
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ ...empty });
  const [editId, setEditId] = useState(null);
  const [tagsInput, setTagsInput] = useState("");

  const load = () => {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (catFilter) params.set("category", catFilter);
    fetch(`${API}/api/suppliers?${params}`, { headers: headers() }).then(r => r.json()).then(setSuppliers).catch(() => {});
  };
  useEffect(() => { load(); }, [search, catFilter]);

  const save = async () => {
    if (!form.name.trim()) { toast.error("Nombre requerido"); return; }
    const body = { ...form, products_services: tagsInput.split(",").map(s => s.trim()).filter(Boolean) };
    const method = editId ? "PUT" : "POST";
    const url = editId ? `${API}/api/suppliers/${editId}` : `${API}/api/suppliers`;
    const res = await fetch(url, { method, headers: headers(), body: JSON.stringify(body) });
    if (res.ok) { toast.success(editId ? "Proveedor actualizado" : "Proveedor creado"); setModalOpen(false); load(); }
    else toast.error("Error al guardar");
  };

  const del = async (id) => {
    if (!window.confirm("Eliminar proveedor?")) return;
    await fetch(`${API}/api/suppliers/${id}`, { method: "DELETE", headers: headers() });
    toast.success("Proveedor eliminado"); load();
  };

  const openEdit = (s) => { setEditId(s.id); setForm(s); setTagsInput((s.products_services || []).join(", ")); setModalOpen(true); };
  const openNew = () => { setEditId(null); setForm({ ...empty }); setTagsInput(""); setModalOpen(true); };

  return (
    <div className="space-y-6" data-testid="suppliers-page">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t("Suppliers", "Proveedores")}</h1>
          <p className="text-sm text-gray-500">{suppliers.length} {t("registered suppliers", "proveedores registrados")}</p>
        </div>
        <Button onClick={openNew} data-testid="add-supplier-btn"><Plus className="w-4 h-4 mr-1.5" /> {t("New Supplier","Nuevo Proveedor")}</Button>
      </div>
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input placeholder={t("Search supplier...","Buscar proveedor...")} value={search} onChange={e => setSearch(e.target.value)} className="pl-9" data-testid="supplier-search" />
        </div>
        <select value={catFilter} onChange={e => setCatFilter(e.target.value)} className="border rounded-lg px-3 py-2 text-sm" data-testid="supplier-cat-filter">
          <option value="">Todas las categorias</option>
          {Object.entries(CAT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {suppliers.map(s => (
          <div key={s.id} className="bg-white border rounded-xl p-4 hover:shadow-md transition-shadow" data-testid={`supplier-${s.id}`}>
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center"><Truck className="w-5 h-5 text-blue-600" /></div>
                <div>
                  <h3 className="font-semibold text-gray-900 text-sm">{s.name}</h3>
                  {s.contact_name && <p className="text-xs text-gray-500">{s.contact_name}</p>}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => openEdit(s)} className="p-1.5 rounded-lg hover:bg-gray-100"><Edit className="w-3.5 h-3.5 text-gray-400" /></button>
                <button onClick={() => del(s.id)} className="p-1.5 rounded-lg hover:bg-red-50"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>
              </div>
            </div>
            <Badge className={CAT_COLORS[s.category] || CAT_COLORS.general}>{CAT_LABELS[s.category] || s.category}</Badge>
            <div className="mt-3 space-y-1.5 text-xs text-gray-500">
              {s.phone && <div className="flex items-center gap-1.5"><Phone className="w-3 h-3" />{s.phone}</div>}
              {s.email && <div className="flex items-center gap-1.5"><Mail className="w-3 h-3" />{s.email}</div>}
              {s.address && <div className="flex items-center gap-1.5"><MapPin className="w-3 h-3" />{s.address}</div>}
            </div>
            {s.products_services?.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1">
                {s.products_services.slice(0, 4).map((p, i) => <span key={i} className="text-[10px] bg-gray-100 text-gray-600 rounded-full px-2 py-0.5">{p}</span>)}
                {s.products_services.length > 4 && <span className="text-[10px] text-gray-400">+{s.products_services.length - 4}</span>}
              </div>
            )}
            <div className="mt-3 pt-3 border-t flex items-center justify-between text-[11px] text-gray-400">
              <span>{s.total_orders || 0} ordenes</span>
              <span>${(s.total_spent || 0).toFixed(2)} gastado</span>
            </div>
          </div>
        ))}
        {suppliers.length === 0 && <div className="col-span-full text-center py-16 text-gray-400"><Package className="w-12 h-12 mx-auto mb-3 opacity-30" /><p>No hay proveedores</p></div>}
      </div>
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" data-testid="supplier-modal">
          <DialogHeader><DialogTitle>{editId ? t("Edit Supplier","Editar Proveedor") : t("New Supplier","Nuevo Proveedor")}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Nombre *</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} data-testid="supplier-name" /></div>
              <div><Label>Contacto</Label><Input value={form.contact_name} onChange={e => setForm({ ...form, contact_name: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Email</Label><Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
              <div><Label>Telefono</Label><Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></div>
            </div>
            <div><Label>Direccion</Label><Input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Website</Label><Input value={form.website} onChange={e => setForm({ ...form, website: e.target.value })} /></div>
              <div><Label>Categoria</Label>
                <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm">
                  {Object.entries(CAT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
            </div>
            <div><Label>Productos / Servicios (separados por coma)</Label><Input value={tagsInput} onChange={e => setTagsInput(e.target.value)} placeholder="Detergente, Suavizante, ..." /></div>
            <div><Label>Terminos de Pago</Label><Input value={form.payment_terms} onChange={e => setForm({ ...form, payment_terms: e.target.value })} placeholder="Net 30, COD, etc." /></div>
            <div><Label>Notas</Label><Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} /></div>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={() => setModalOpen(false)} className="flex-1">Cancelar</Button>
              <Button onClick={save} className="flex-1" data-testid="supplier-save-btn">{editId ? "Actualizar" : "Crear Proveedor"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
