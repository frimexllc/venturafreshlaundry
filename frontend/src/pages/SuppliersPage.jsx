import { useState, useEffect, useCallback } from "react";
import {
  Plus, Search, Edit, Trash2, ChevronRight,
  Package, ShoppingCart, TrendingUp, Phone, Mail, Globe,
  CheckCircle, XCircle, Boxes, Tag,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Badge } from "../components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import { toast } from "sonner";

const API = process.env.REACT_APP_BACKEND_URL;
const h = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${localStorage.getItem("token")}`,
});

// ── Categorías de proveedor con etiquetas en español ──────────────────
// "¿Qué tipo de productos / servicios suministra este proveedor?"
const SUPPLIER_CATEGORIES = [
  { value: "detergentes",    label: "Detergentes" },
  { value: "suavizantes",    label: "Suavizantes" },
  { value: "blanqueadores",  label: "Blanqueadores" },
  { value: "hojas_secadora", label: "Hojas de Secadora" },
  { value: "chemicals",      label: "Químicos / Limpieza general" },
  { value: "packaging",      label: "Empaque / Bolsas" },
  { value: "equipment",      label: "Equipo / Maquinaria" },
  { value: "uniforms",       label: "Uniformes" },
  { value: "maintenance",    label: "Mantenimiento" },
  { value: "delivery",       label: "Transporte / Entrega" },
  { value: "general",        label: "General / Varios" },
  { value: "custom",         label: "Otra categoría (personalizada)" },
];

const getCatLabel = (val) =>
  SUPPLIER_CATEGORIES.find(c => c.value === val)?.label || val || "—";

const CAT_COLOR = {
  detergentes:    "bg-blue-100 text-blue-700",
  suavizantes:    "bg-pink-100 text-pink-700",
  blanqueadores:  "bg-cyan-100 text-cyan-700",
  hojas_secadora: "bg-amber-100 text-amber-700",
  chemicals:      "bg-indigo-100 text-indigo-700",
  packaging:      "bg-purple-100 text-purple-700",
  equipment:      "bg-gray-200 text-gray-700",
  uniforms:       "bg-yellow-100 text-yellow-700",
  maintenance:    "bg-orange-100 text-orange-700",
  delivery:       "bg-green-100 text-green-700",
  general:        "bg-slate-100 text-slate-600",
  custom:         "bg-rose-100 text-rose-700",
};

// ── Supplier detail side-panel ────────────────────────────────────────
function SupplierDetailPanel({ supplier, purchaseOrders, catalogItems, stockMap, onClose, onEdit }) {
  const myPOs = purchaseOrders.filter(po => po.supplier_id === supplier.id);
  const orderedNames = [...new Set(myPOs.flatMap(po => (po.items || []).map(i => i.name)).filter(Boolean))];
  const catalogMatches = orderedNames.map(name => ({
    name,
    catalogItem: catalogItems.find(c => c.name.toLowerCase() === name.toLowerCase()),
    stockQty: stockMap[name],
  }));

  return (
    <div className="bg-white border rounded-xl p-5 space-y-5 sticky top-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-bold text-gray-900">{supplier.name}</h3>
          <div className="flex flex-wrap gap-1.5 mt-1">
            {supplier.status === "inactive" && <Badge className="bg-red-100 text-red-700">Inactivo</Badge>}
            {supplier.category && (
              <Badge className={CAT_COLOR[supplier.category] || "bg-gray-100 text-gray-600"}>
                <Tag className="w-3 h-3 mr-1" />
                {getCatLabel(supplier.category)}
              </Badge>
            )}
          </div>
        </div>
        <div className="flex gap-1">
          <button onClick={onEdit} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-700" title="Editar">
            <Edit className="w-4 h-4" />
          </button>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-600">
            <XCircle className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Contact */}
      <div className="space-y-1.5 text-sm">
        {supplier.contact_name && <div className="text-gray-600"><span className="font-medium">Contacto: </span>{supplier.contact_name}</div>}
        {supplier.phone && <a href={`tel:${supplier.phone}`} className="flex items-center gap-1.5 text-blue-600 hover:underline"><Phone className="w-3.5 h-3.5" />{supplier.phone}</a>}
        {supplier.email && <a href={`mailto:${supplier.email}`} className="flex items-center gap-1.5 text-blue-600 hover:underline"><Mail className="w-3.5 h-3.5" />{supplier.email}</a>}
        {supplier.website && <a href={supplier.website} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-blue-600 hover:underline"><Globe className="w-3.5 h-3.5" />Sitio web</a>}
        {supplier.payment_terms && <div className="text-gray-600"><span className="font-medium">Pago: </span>{supplier.payment_terms}</div>}
        {supplier.address && <div className="text-gray-500 text-xs">{supplier.address}</div>}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: "Órdenes", value: supplier.total_orders || 0 },
          { label: "Total gastado", value: `$${(supplier.total_spent || 0).toFixed(0)}` },
          { label: "Productos", value: orderedNames.length },
        ].map(({ label, value }) => (
          <div key={label} className="bg-gray-50 rounded-lg p-2.5 text-center">
            <p className="text-xs text-gray-400">{label}</p>
            <p className="text-base font-bold text-gray-900">{value}</p>
          </div>
        ))}
      </div>

      {/* Products supplied — crossed with catalog + stock */}
      {catalogMatches.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
            <Package className="w-4 h-4" /> Productos suministrados
          </h4>
          <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
            {catalogMatches.map(({ name, catalogItem, stockQty }) => (
              <div key={name} className="flex items-center justify-between text-sm rounded-lg bg-gray-50 px-3 py-2">
                <div className="min-w-0">
                  <span className="font-medium truncate block">{name}</span>
                  {catalogItem && <span className="text-xs text-gray-400">{catalogItem.brand} · {catalogItem.category}</span>}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {stockQty !== undefined ? (
                    <span className={`text-xs font-medium flex items-center gap-1 ${stockQty <= 5 ? "text-amber-600" : "text-green-600"}`}>
                      <Boxes className="w-3 h-3" />{stockQty}
                    </span>
                  ) : (
                    <span className="text-xs text-gray-300">—</span>
                  )}
                  {catalogItem
                    ? <CheckCircle className="w-3.5 h-3.5 text-green-500" title="En catálogo autorizado" />
                    : <XCircle className="w-3.5 h-3.5 text-gray-300" title="No está en el catálogo" />
                  }
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent POs */}
      {myPOs.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
            <ShoppingCart className="w-4 h-4" /> Órdenes recientes
          </h4>
          <div className="space-y-1.5">
            {myPOs.slice(0, 5).map(po => (
              <div key={po.id} className="flex items-center justify-between text-xs rounded-lg bg-gray-50 px-3 py-2">
                <span className="font-medium text-gray-700">{po.po_number}</span>
                <div className="flex items-center gap-2">
                  <Badge className={
                    po.status === "received" ? "bg-green-100 text-green-800"
                    : po.status === "pending" ? "bg-yellow-100 text-yellow-800"
                    : po.status === "cancelled" ? "bg-red-100 text-red-800"
                    : "bg-blue-100 text-blue-800"
                  }>{po.status}</Badge>
                  <span className="text-gray-500 font-medium">${po.total?.toFixed(2)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {supplier.notes && (
        <div className="bg-amber-50 border border-amber-100 rounded-lg p-3 text-sm text-gray-600">
          <span className="font-medium">Notas: </span>{supplier.notes}
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState([]);
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [catalogItems, setCatalogItems] = useState([]);
  const [stockMap, setStockMap] = useState({});

  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("all");
  const [selectedId, setSelectedId] = useState(null);

  const [modal, setModal] = useState(false);
  const [editId, setEditId] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [saving, setSaving] = useState(false);

  const emptyForm = {
    name: "", contact_name: "", email: "", phone: "",
    address: "", website: "", category: "general",
    customCategory: "",           // ← field for free-text category
    payment_terms: "", notes: "", status: "active",
  };
  const [form, setForm] = useState(emptyForm);

  // ── Loaders ────────────────────────────────────────────────────────
  const loadSuppliers = useCallback(async () => {
    try { const r = await fetch(`${API}/api/suppliers`, { headers: h() }); setSuppliers(await r.json().catch(() => [])); } catch {}
  }, []);
  const loadPOs = useCallback(async () => {
    try { const r = await fetch(`${API}/api/inventory/purchase-orders`, { headers: h() }); setPurchaseOrders(await r.json().catch(() => [])); } catch {}
  }, []);
  const loadCatalog = useCallback(async () => {
    try { const r = await fetch(`${API}/api/catalog`, { headers: h() }); setCatalogItems(await r.json().catch(() => [])); } catch {}
  }, []);
  const loadStock = useCallback(async () => {
    try {
      const r = await fetch(`${API}/api/inventory/stock`, { headers: h() });
      const data = await r.json().catch(() => []);
      const map = {};
      (Array.isArray(data) ? data : []).forEach(i => { map[i.name] = i.quantity; });
      setStockMap(map);
    } catch {}
  }, []);

  useEffect(() => { loadSuppliers(); loadPOs(); loadCatalog(); loadStock(); }, []);

  // ── Helpers ────────────────────────────────────────────────────────
  const filtered = suppliers.filter(s => {
    const matchSearch = !search
      || s.name.toLowerCase().includes(search.toLowerCase())
      || (s.contact_name || "").toLowerCase().includes(search.toLowerCase())
      || (s.email || "").toLowerCase().includes(search.toLowerCase());
    const matchCat = catFilter === "all" || s.category === catFilter;
    return matchSearch && matchCat;
  });

  const selectedSupplier = suppliers.find(s => s.id === selectedId);

  const openCreate = () => {
    setEditId(null);
    setForm(emptyForm);
    setModal(true);
  };

  const openEdit = (s) => {
    // Detect if stored category is a custom one (not in our list)
    const knownValues = SUPPLIER_CATEGORIES.map(c => c.value);
    const isCustom = s.category && !knownValues.includes(s.category);
    setEditId(s.id);
    setForm({
      ...s,
      category: isCustom ? "custom" : (s.category || "general"),
      customCategory: isCustom ? s.category : "",
    });
    setModal(true);
  };

  // ── Save ────────────────────────────────────────────────────────────
  const save = async () => {
    if (!form.name.trim()) { toast.error("El nombre es obligatorio"); return; }
    if (form.category === "custom" && !form.customCategory.trim()) {
      toast.error("Escribe el nombre de la categoría personalizada"); return;
    }
    setSaving(true);
    try {
      // Resolve final category value
      const finalCategory = form.category === "custom"
        ? form.customCategory.trim().toLowerCase().replace(/\s+/g, "_")
        : form.category;

      const { customCategory, ...rest } = form;
      const body = { ...rest, category: finalCategory };

      const method = editId ? "PUT" : "POST";
      const url = editId ? `${API}/api/suppliers/${editId}` : `${API}/api/suppliers`;
      const res = await fetch(url, { method, headers: h(), body: JSON.stringify(body) });
      if (!res.ok) throw new Error();
      toast.success(editId ? "Proveedor actualizado" : "Proveedor creado");
      setModal(false);
      loadSuppliers();
    } catch { toast.error("Error guardando proveedor"); }
    finally { setSaving(false); }
  };

  const del = async () => {
    if (!deleteConfirm) return;
    try {
      const res = await fetch(`${API}/api/suppliers/${deleteConfirm.id}`, { method: "DELETE", headers: h() });
      if (res.status === 409) { const d = await res.json(); toast.error(d.detail); }
      else {
        toast.success(`"${deleteConfirm.name}" eliminado`);
        if (selectedId === deleteConfirm.id) setSelectedId(null);
        loadSuppliers();
      }
    } catch { toast.error("Error eliminando proveedor"); }
    finally { setDeleteConfirm(null); }
  };

  // ── Unique categories present in existing suppliers (for filter pills) ─
  const existingCats = [...new Set(suppliers.map(s => s.category).filter(Boolean))];

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Proveedores</h1>
          <p className="text-sm text-gray-500">{suppliers.length} proveedores · {purchaseOrders.length} órdenes de compra</p>
        </div>
        <Button onClick={openCreate}><Plus className="w-4 h-4 mr-1" /> Nuevo Proveedor</Button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar nombre, contacto, email…" className="pl-9" />
      </div>

      {/* Category filter pills — built from actual suppliers + known list */}
      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={() => setCatFilter("all")}
          className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${catFilter === "all" ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"}`}
        >
          Todos ({suppliers.length})
        </button>
        {existingCats.map(cat => {
          const count = suppliers.filter(s => s.category === cat).length;
          return (
            <button
              key={cat}
              onClick={() => setCatFilter(cat)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${catFilter === cat ? "bg-gray-900 text-white border-gray-900" : `${CAT_COLOR[cat] || "bg-white text-gray-600"} border-transparent hover:border-gray-300`}`}
            >
              {getCatLabel(cat)} ({count})
            </button>
          );
        })}
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

        {/* List */}
        <div className={`space-y-2 ${selectedSupplier ? "lg:col-span-2" : "lg:col-span-5"}`}>
          {filtered.map(s => {
            const myPOs = purchaseOrders.filter(po => po.supplier_id === s.id);
            const productCount = [...new Set(myPOs.flatMap(po => (po.items || []).map(i => i.name)).filter(Boolean))].length;
            const active = s.id === selectedId;
            return (
              <div
                key={s.id}
                onClick={() => setSelectedId(active ? null : s.id)}
                className={`bg-white border rounded-xl p-4 cursor-pointer transition-all hover:shadow-sm ${active ? "border-blue-400 ring-1 ring-blue-100 bg-blue-50/30" : "hover:border-gray-300"}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-gray-900">{s.name}</span>
                      {s.status === "inactive" && <Badge className="bg-red-100 text-red-700 text-xs">Inactivo</Badge>}
                    </div>
                    {/* Category badge — now shows readable Spanish label */}
                    {s.category && (
                      <span className={`inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full text-xs font-medium ${CAT_COLOR[s.category] || "bg-gray-100 text-gray-600"}`}>
                        <Tag className="w-2.5 h-2.5" />{getCatLabel(s.category)}
                      </span>
                    )}
                    {s.contact_name && <p className="text-xs text-gray-500 mt-1">{s.contact_name}</p>}
                    {s.email && <p className="text-xs text-gray-400">{s.email}</p>}
                  </div>
                  <div className="flex items-center gap-0.5 flex-shrink-0">
                    <button onClick={e => { e.stopPropagation(); openEdit(s); }} className="p-1.5 hover:bg-gray-100 rounded-lg" title="Editar">
                      <Edit className="w-3.5 h-3.5 text-gray-400" />
                    </button>
                    <button onClick={e => { e.stopPropagation(); setDeleteConfirm({ id: s.id, name: s.name }); }} className="p-1.5 hover:bg-red-50 rounded-lg" title="Eliminar">
                      <Trash2 className="w-3.5 h-3.5 text-red-400" />
                    </button>
                    <ChevronRight className={`w-4 h-4 text-gray-300 transition-transform ${active ? "rotate-90 text-blue-400" : ""}`} />
                  </div>
                </div>
                {/* Mini stats */}
                <div className="flex items-center gap-3 mt-2 text-xs text-gray-400 flex-wrap">
                  {s.total_orders > 0 && <span className="flex items-center gap-1"><ShoppingCart className="w-3 h-3" />{s.total_orders} órdenes</span>}
                  {s.total_spent > 0 && <span className="flex items-center gap-1"><TrendingUp className="w-3 h-3" />${s.total_spent?.toFixed(0)}</span>}
                  {productCount > 0 && <span className="flex items-center gap-1"><Package className="w-3 h-3" />{productCount} productos</span>}
                  {s.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{s.phone}</span>}
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div className="text-center py-12 text-gray-400 bg-white border rounded-xl">
              <Package className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p>Sin proveedores{search ? " para la búsqueda" : ""}</p>
            </div>
          )}
        </div>

        {/* Detail panel */}
        {selectedSupplier && (
          <div className="lg:col-span-3">
            <SupplierDetailPanel
              supplier={selectedSupplier}
              purchaseOrders={purchaseOrders}
              catalogItems={catalogItems}
              stockMap={stockMap}
              onClose={() => setSelectedId(null)}
              onEdit={() => openEdit(selectedSupplier)}
            />
          </div>
        )}
      </div>

      {/* ── Delete confirm ── */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Eliminar proveedor</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-gray-600">¿Eliminar <strong>"{deleteConfirm?.name}"</strong>?</p>
            <p className="text-xs text-amber-600">Si tiene órdenes asociadas, el sistema te pedirá desactivarlo en su lugar.</p>
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setDeleteConfirm(null)} className="flex-1">Cancelar</Button>
              <Button onClick={del} className="flex-1 bg-red-600 hover:bg-red-700">Eliminar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Create / Edit modal ── */}
      <Dialog open={modal} onOpenChange={setModal}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editId ? "Editar Proveedor" : "Nuevo Proveedor"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">

              {/* Name */}
              <div className="col-span-2">
                <Label>Nombre del proveedor *</Label>
                <Input
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  placeholder="Ej. Distribuidora López, Walmart, Costco…"
                  className="mt-1"
                />
              </div>

              {/* Category — now clearly labeled and with custom option */}
              <div className="col-span-2">
                <Label>
                  Tipo de proveedor
                  <span className="text-gray-400 font-normal text-xs ml-1">— ¿qué suministra?</span>
                </Label>
                <select
                  value={form.category || "general"}
                  onChange={e => setForm({ ...form, category: e.target.value, customCategory: "" })}
                  className="w-full border rounded-lg px-3 py-2 text-sm bg-white mt-1"
                >
                  {SUPPLIER_CATEGORIES.map(c => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
                {/* Custom category text field — only shown when "custom" selected */}
                {form.category === "custom" && (
                  <div className="mt-2">
                    <Input
                      value={form.customCategory || ""}
                      onChange={e => setForm({ ...form, customCategory: e.target.value })}
                      placeholder="Escribe el nombre de la categoría, ej. 'Fragancias'"
                      className="border-blue-300 focus:border-blue-500"
                      autoFocus
                    />
                    <p className="text-xs text-gray-400 mt-1">
                      Se guardará tal como la escribas y aparecerá en los filtros.
                    </p>
                  </div>
                )}
              </div>

              {/* Contact */}
              <div>
                <Label>Nombre de contacto</Label>
                <Input value={form.contact_name || ""} onChange={e => setForm({ ...form, contact_name: e.target.value })} placeholder="Persona de contacto" className="mt-1" />
              </div>

              {/* Status */}
              <div>
                <Label>Estado</Label>
                <select value={form.status || "active"} onChange={e => setForm({ ...form, status: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm bg-white mt-1">
                  <option value="active">Activo</option>
                  <option value="inactive">Inactivo</option>
                </select>
              </div>

              {/* Phone */}
              <div>
                <Label>Teléfono</Label>
                <Input value={form.phone || ""} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="+1 555 000 0000" className="mt-1" />
              </div>

              {/* Email */}
              <div>
                <Label>Email</Label>
                <Input type="email" value={form.email || ""} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="proveedor@email.com" className="mt-1" />
              </div>

              {/* Address */}
              <div className="col-span-2">
                <Label>Dirección</Label>
                <Input value={form.address || ""} onChange={e => setForm({ ...form, address: e.target.value })} placeholder="Calle, ciudad, estado…" className="mt-1" />
              </div>

              {/* Website */}
              <div>
                <Label>Sitio web</Label>
                <Input value={form.website || ""} onChange={e => setForm({ ...form, website: e.target.value })} placeholder="https://…" className="mt-1" />
              </div>

              {/* Payment terms */}
              <div>
                <Label>Términos de pago</Label>
                <Input value={form.payment_terms || ""} onChange={e => setForm({ ...form, payment_terms: e.target.value })} placeholder="Ej. Contado, Net 30…" className="mt-1" />
              </div>

              {/* Notes */}
              <div className="col-span-2">
                <Label>Notas adicionales</Label>
                <Textarea value={form.notes || ""} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} placeholder="Horarios, descuentos, condiciones especiales…" className="mt-1" />
              </div>
            </div>

            <Button onClick={save} disabled={saving} className="w-full">
              {saving ? "Guardando…" : editId ? "Actualizar Proveedor" : "Crear Proveedor"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}