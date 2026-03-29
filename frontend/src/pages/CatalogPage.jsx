import { useState, useEffect } from "react";
import { Package, Search, Plus, Trash2, Edit, Check, X, ChevronDown } from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Badge } from "../components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { Label } from "../components/ui/label";
import { toast } from "sonner";

const API = process.env.REACT_APP_BACKEND_URL;
const h = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("token")}` });

const CAT_LABELS = { detergent: "Detergentes", softener: "Suavizantes", dryer_sheet: "Hojas Secadora", bleach: "Blanqueadores" };
const CAT_COLORS = { detergent: "bg-blue-500", softener: "bg-pink-500", dryer_sheet: "bg-amber-500", bleach: "bg-cyan-500" };
const CAT_BG = { detergent: "bg-blue-50 border-blue-200", softener: "bg-pink-50 border-pink-200", dryer_sheet: "bg-amber-50 border-amber-200", bleach: "bg-cyan-50 border-cyan-200" };

export default function CatalogPage() {
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState("");
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ name: "", category: "detergent", brand: "", price: "", in_stock: true, default: false });
  const [editId, setEditId] = useState(null);

  const load = () => { fetch(`${API}/api/catalog${filter ? `?category=${filter}` : ""}`, { headers: h() }).then(r => r.json()).then(setItems).catch(() => {}); };
  useEffect(() => { load(); }, [filter]);

  const filtered = search ? items.filter(i => i.name.toLowerCase().includes(search.toLowerCase()) || (i.brand || "").toLowerCase().includes(search.toLowerCase())) : items;
  const grouped = {};
  filtered.forEach(i => { if (!grouped[i.category]) grouped[i.category] = []; grouped[i.category].push(i); });

  const save = async () => {
    if (!form.name.trim()) { toast.error("Nombre requerido"); return; }
    const body = { ...form, price: form.price ? parseFloat(form.price) : null };
    const method = editId ? "PUT" : "POST";
    const url = editId ? `${API}/api/catalog/${editId}` : `${API}/api/catalog`;
    const res = await fetch(url, { method, headers: h(), body: JSON.stringify(body) });
    if (res.ok) { toast.success("Producto guardado"); setModalOpen(false); load(); } else { const d = await res.json(); toast.error(d.detail || "Error"); }
  };

  const del = async (id) => { await fetch(`${API}/api/catalog/${id}`, { method: "DELETE", headers: h() }); load(); toast.success("Eliminado"); };
  const seed = async () => { await fetch(`${API}/api/catalog/seed`, { method: "POST", headers: h() }); load(); toast.success("Catalogo reiniciado"); };

  return (
    <div className="space-y-6" data-testid="catalog-page">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div><h1 className="text-2xl font-bold text-gray-900">Catalogo Autorizado</h1><p className="text-sm text-gray-500">{items.length} productos — Solo marcas autorizadas</p></div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={seed}>Reiniciar Catalogo</Button>
          <Button onClick={() => { setEditId(null); setForm({ name: "", category: "detergent", brand: "", price: "", in_stock: true, default: false }); setModalOpen(true); }} data-testid="add-catalog-btn"><Plus className="w-4 h-4 mr-1" /> Agregar Producto</Button>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" /><Input placeholder="Buscar producto o marca..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" /></div>
        <div className="flex gap-1">
          <button onClick={() => setFilter("")} className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${!filter ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-600 border-gray-200"}`}>Todos</button>
          {Object.entries(CAT_LABELS).map(([k, v]) => (
            <button key={k} onClick={() => setFilter(k)} className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${filter === k ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-600 border-gray-200"}`}>{v}</button>
          ))}
        </div>
      </div>
      {Object.entries(grouped).map(([cat, catItems]) => (
        <div key={cat}>
          <div className="flex items-center gap-2 mb-3"><div className={`w-3 h-3 rounded-full ${CAT_COLORS[cat]}`} /><h2 className="text-lg font-semibold text-gray-800">{CAT_LABELS[cat] || cat}</h2><span className="text-xs text-gray-400">{catItems.length} productos</span></div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {catItems.map(item => (
              <div key={item.id} className={`border rounded-xl p-3.5 transition-shadow hover:shadow-md ${CAT_BG[cat] || "bg-white"}`} data-testid={`catalog-item-${item.id}`}>
                <div className="flex items-start justify-between mb-1.5">
                  <div><h3 className="font-semibold text-sm text-gray-900">{item.name}</h3>{item.brand && <p className="text-xs text-gray-500">{item.brand}</p>}</div>
                  <div className="flex items-center gap-0.5">
                    {item.default && <Badge className="bg-green-100 text-green-800 text-[9px]">Default</Badge>}
                    <button onClick={() => { setEditId(item.id); setForm({ ...item, price: item.price || "" }); setModalOpen(true); }} className="p-1 hover:bg-white/80 rounded"><Edit className="w-3 h-3 text-gray-400" /></button>
                    <button onClick={() => del(item.id)} className="p-1 hover:bg-red-100 rounded"><Trash2 className="w-3 h-3 text-red-400" /></button>
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className={item.in_stock ? "text-green-600" : "text-red-600"}>{item.in_stock ? "En stock" : "Agotado"}</span>
                  {item.price && <span className="font-semibold text-gray-700">${item.price.toFixed(2)}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
      {Object.keys(grouped).length === 0 && <div className="text-center py-16 text-gray-400"><Package className="w-12 h-12 mx-auto mb-3 opacity-30" /><p>Sin productos en catalogo</p></div>}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-sm" data-testid="catalog-modal">
          <DialogHeader><DialogTitle>{editId ? "Editar Producto" : "Agregar Producto"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Nombre *</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} data-testid="catalog-name" /></div>
            <div className="grid grid-cols-2 gap-3"><div><Label>Categoria</Label><select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm">{Object.entries(CAT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div><div><Label>Marca</Label><Input value={form.brand || ""} onChange={e => setForm({ ...form, brand: e.target.value })} /></div></div>
            <div className="grid grid-cols-2 gap-3"><div><Label>Precio ($)</Label><Input type="number" step="0.01" value={form.price || ""} onChange={e => setForm({ ...form, price: e.target.value })} /></div><div className="flex items-end gap-3 pb-1"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.in_stock} onChange={e => setForm({ ...form, in_stock: e.target.checked })} /> En stock</label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.default} onChange={e => setForm({ ...form, default: e.target.checked })} /> Default</label></div></div>
            <Button onClick={save} className="w-full" data-testid="save-catalog-btn">{editId ? "Actualizar" : "Agregar"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
