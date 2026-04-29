import { useState, useEffect, useRef } from "react";
import { useLocale } from "../context/LocaleContext";
import {
  Package, Search, Plus, Trash2, Edit, PlusCircle,
  Boxes, ChevronDown, Check, X, Tag, Settings, AlertTriangle, RefreshCw,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Badge } from "../components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { Label } from "../components/ui/label";
import { toast } from "sonner";

const API = process.env.REACT_APP_BACKEND_URL;
const h = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${localStorage.getItem("token")}`,
});

// ── Paleta de colores por índice (para categorías dinámicas) ──────────
const PALETTE = [
  { dot: "bg-blue-500",   bg: "bg-blue-50 border-blue-200",   badge: "bg-blue-100 text-blue-700",   pill: "bg-blue-600" },
  { dot: "bg-pink-500",   bg: "bg-pink-50 border-pink-200",   badge: "bg-pink-100 text-pink-700",   pill: "bg-pink-600" },
  { dot: "bg-amber-500",  bg: "bg-amber-50 border-amber-200", badge: "bg-amber-100 text-amber-700", pill: "bg-amber-600" },
  { dot: "bg-cyan-500",   bg: "bg-cyan-50 border-cyan-200",   badge: "bg-cyan-100 text-cyan-700",   pill: "bg-cyan-600" },
  { dot: "bg-green-500",  bg: "bg-green-50 border-green-200", badge: "bg-green-100 text-green-700", pill: "bg-green-600" },
  { dot: "bg-purple-500", bg: "bg-purple-50 border-purple-200",badge:"bg-purple-100 text-purple-700",pill: "bg-purple-600" },
  { dot: "bg-orange-500", bg: "bg-orange-50 border-orange-200",badge:"bg-orange-100 text-orange-700",pill: "bg-orange-600" },
  { dot: "bg-rose-500",   bg: "bg-rose-50 border-rose-200",   badge: "bg-rose-100 text-rose-700",   pill: "bg-rose-600" },
];
const palette = (i) => PALETTE[i % PALETTE.length];

// ── Componente de Confirmación Modal ──────────────────────────────────
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

// ── Modal para reiniciar catálogo (doble confirmación) ────────────────
const ResetCatalogModal = ({ isOpen, onClose, onConfirm }) => {
  const [step, setStep] = useState(1);
  const [confirmText, setConfirmText] = useState("");

  if (!isOpen) return null;

  const handleConfirm = () => {
    if (step === 1) {
      setStep(2);
    } else if (step === 2 && confirmText === "REINICIAR CATÁLOGO") {
      onConfirm();
      onClose();
      setStep(1);
      setConfirmText("");
    }
  };

  const handleClose = () => {
    onClose();
    setStep(1);
    setConfirmText("");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={handleClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-full bg-red-100">
            <RefreshCw className="h-5 w-5 text-red-600" />
          </div>
          <h2 className="text-xl font-bold text-slate-900">Reiniciar Catálogo</h2>
        </div>

        {step === 1 ? (
          <>
            <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-amber-800 text-sm">
                ⚠️ <strong>ADVERTENCIA:</strong> Esta acción eliminará TODOS los productos del catálogo. 
                Esta operación NO se puede deshacer.
              </p>
            </div>
            <ul className="text-sm text-slate-600 space-y-2 mb-6">
              <li>• Todos los productos del catálogo serán eliminados</li>
              <li>• Las categorías personalizadas se mantendrán</li>
              <li>• El inventario no se verá afectado</li>
              <li>• Se cargarán los productos por defecto</li>
            </ul>
            <div className="flex gap-3">
              <Button type="button" variant="outline" onClick={handleClose} className="flex-1">
                Cancelar
              </Button>
              <Button type="button" onClick={() => setStep(2)} className="flex-1 bg-red-600 hover:bg-red-700">
                Continuar
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-slate-600 mb-3">
              Para confirmar, escribe <strong className="text-red-600">"REINICIAR CATÁLOGO"</strong> en el campo de abajo:
            </p>
            <Input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="REINICIAR CATÁLOGO"
              className="mb-4"
              autoFocus
            />
            <div className="flex gap-3">
              <Button type="button" variant="outline" onClick={() => setStep(1)} className="flex-1">
                Volver
              </Button>
              <Button 
                type="button" 
                onClick={handleConfirm} 
                disabled={confirmText !== "REINICIAR CATÁLOGO"}
                className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-slate-300"
              >
                Confirmar Reinicio
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

// ── Combobox para categoría con opción "Crear nueva" ─────────────────
function CategoryCombobox({ value, onChange, categories, onCategoryCreated }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef(null);

  useEffect(() => {
    const close = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const filtered = categories.filter(c =>
    c.value.toLowerCase().includes(search.toLowerCase()) ||
    c.label.toLowerCase().includes(search.toLowerCase())
  );

  const canCreate = search.trim() &&
    !categories.some(c =>
      c.value.toLowerCase() === search.trim().toLowerCase() ||
      c.label.toLowerCase() === search.trim().toLowerCase()
    );

  const selected = categories.find(c => c.value === value);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => { setOpen(v => !v); setSearch(""); }}
        className="w-full border rounded-lg px-3 py-2 text-sm bg-white text-left flex items-center justify-between gap-2 hover:border-gray-400 transition-colors"
      >
        {selected ? (
          <span className="flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${palette(categories.indexOf(selected)).dot}`} />
            {selected.label}
          </span>
        ) : (
          <span className="text-gray-400">Seleccionar o crear categoría…</span>
        )}
        <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white border rounded-xl shadow-lg overflow-hidden">
          <div className="p-2 border-b">
            <Input
              autoFocus value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar o escribir nueva…"
              className="h-8 text-sm"
            />
          </div>
          <ul className="max-h-52 overflow-y-auto py-1">
            {filtered.map((cat, i) => (
              <li
                key={cat.value}
                onClick={() => { onChange(cat.value); setOpen(false); setSearch(""); }}
                className={`px-3 py-2 text-sm cursor-pointer flex items-center justify-between hover:bg-gray-50 ${value === cat.value ? "bg-blue-50 text-blue-700 font-medium" : ""}`}
              >
                <span className="flex items-center gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${palette(i).dot}`} />
                  {cat.label}
                </span>
                {value === cat.value && <Check className="w-3.5 h-3.5" />}
              </li>
            ))}
            {filtered.length === 0 && !canCreate && (
              <li className="px-3 py-3 text-sm text-gray-400 text-center">Sin resultados</li>
            )}
          </ul>
          {canCreate && (
            <div className="border-t p-2">
              <button
                type="button"
                onClick={() => {
                  const newCat = {
                    value: search.trim().toLowerCase().replace(/\s+/g, "_"),
                    label: search.trim(),
                  };
                  onCategoryCreated(newCat);
                  onChange(newCat.value);
                  setOpen(false);
                  setSearch("");
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg text-green-700 bg-green-50 hover:bg-green-100 font-medium transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Crear categoría "{search.trim()}"
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Modal para agregar al inventario desde catálogo ──────────────────
function AddToStockModal({ item, catLabel, catBg, onClose, onDone }) {
  const [qty, setQty] = useState(1);
  const [reason, setReason] = useState("Compra");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!qty || qty <= 0) { toast.error("Cantidad inválida"); return; }
    setSaving(true);
    try {
      const res = await fetch(`${API}/api/inventory/stock/movement`, {
        method: "POST", headers: h(),
        body: JSON.stringify({
          product_name: item.name,
          category: item.category,
          quantity: parseFloat(qty),
          movement_type: "in",
          reason,
        }),
      });
      if (!res.ok) throw new Error();
      toast.success(`+${qty} unidades de "${item.name}" agregadas al stock`);
      onDone();
    } catch { toast.error("Error registrando entrada"); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Boxes className="w-4 h-4 text-blue-600" /> Agregar al inventario
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className={`rounded-lg p-3 border ${catBg}`}>
            <p className="font-semibold text-sm">{item.name}</p>
            <p className="text-xs text-gray-500">{item.brand} · {catLabel}</p>
          </div>
          <div>
            <Label>Cantidad a ingresar</Label>
            <Input type="number" min="1" step="0.5" value={qty} onChange={e => setQty(e.target.value)} className="mt-1" autoFocus />
          </div>
          <div>
            <Label>Razón</Label>
            <Input value={reason} onChange={e => setReason(e.target.value)} placeholder="Compra, donación, ajuste…" className="mt-1" />
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} className="flex-1">Cancelar</Button>
            <Button onClick={save} disabled={saving} className="flex-1 bg-green-600 hover:bg-green-700">
              {saving ? "Guardando…" : "Registrar entrada"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Modal para gestionar/renombrar categorías ────────────────────────
function ManageCategoriesModal({ categories, onClose, onUpdate }) {
  const [cats, setCats] = useState(categories.map(c => ({ ...c })));
  const [newLabel, setNewLabel] = useState("");

  const addCat = () => {
    const trimmed = newLabel.trim();
    if (!trimmed) return;
    const val = trimmed.toLowerCase().replace(/\s+/g, "_");
    if (cats.some(c => c.value === val)) { toast.error("Ya existe esa categoría"); return; }
    setCats(prev => [...prev, { value: val, label: trimmed }]);
    setNewLabel("");
  };

  const removeAt = (i) => setCats(prev => prev.filter((_, j) => j !== i));

  const updateLabel = (i, label) =>
    setCats(prev => prev.map((c, j) => j === i ? { ...c, label } : c));

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Tag className="w-4 h-4" /> Gestionar Categorías</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-gray-500">Edita los nombres visibles o elimina categorías sin productos.</p>
          <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
            {cats.map((cat, i) => (
              <div key={cat.value} className="flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${palette(i).dot}`} />
                <Input
                  value={cat.label}
                  onChange={e => updateLabel(i, e.target.value)}
                  className="h-8 text-sm flex-1"
                />
                <button onClick={() => removeAt(i)} className="text-red-400 hover:text-red-600 flex-shrink-0">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
          <div className="flex gap-2 pt-1 border-t">
            <Input
              value={newLabel}
              onChange={e => setNewLabel(e.target.value)}
              placeholder="Nueva categoría…"
              className="h-8 text-sm"
              onKeyDown={e => e.key === "Enter" && addCat()}
            />
            <Button size="sm" onClick={addCat} variant="outline"><Plus className="w-3.5 h-3.5" /></Button>
          </div>
          <Button
            onClick={() => { onUpdate(cats); onClose(); }}
            className="w-full"
          >
            Guardar cambios
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ════════════════════════════════════════════════════════════════════
// Default categories — used only to seed if backend returns nothing
const DEFAULT_CATEGORIES = [
  { value: "detergent",   label: "Detergentes" },
  { value: "softener",    label: "Suavizantes" },
  { value: "dryer_sheet", label: "Hojas Secadora" },
  { value: "bleach",      label: "Blanqueadores" },
];

export default function CatalogPage() {
  const { t } = useLocale();

  const [items, setItems]             = useState([]);
  const [categories, setCategories]   = useState(DEFAULT_CATEGORIES);
  const [stockMap, setStockMap]       = useState({});
  const [filter, setFilter]           = useState("");
  const [search, setSearch]           = useState("");
  const [modalOpen, setModalOpen]     = useState(false);
  const [manageCatsOpen, setManageCatsOpen] = useState(false);
  const [addToStockItem, setAddToStockItem] = useState(null);
  const [editId, setEditId]           = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [resetCatalogConfirm, setResetCatalogConfirm] = useState({ isOpen: false });
  const [form, setForm] = useState({
    name: "", category: "detergent", brand: "", price: "", in_stock: true, default: false,
  });

  // ── Build category index for fast color lookup ─────────────────────
  const catIndex = Object.fromEntries(categories.map((c, i) => [c.value, i]));
  const getCat = (val) => categories.find(c => c.value === val) || { value: val, label: val };
  const getP = (val) => palette(catIndex[val] ?? categories.length);

  // ── Loaders ────────────────────────────────────────────────────────
  const loadCatalog = async () => {
    try {
      const r = await fetch(`${API}/api/catalog${filter ? `?category=${filter}` : ""}`, { headers: h() });
      const data = await r.json().catch(() => []);
      setItems(Array.isArray(data) ? data : []);

      const seen = new Map();
      (Array.isArray(data) ? data : []).forEach(item => {
        if (item.category && !seen.has(item.category)) {
          const existing = categories.find(c => c.value === item.category);
          seen.set(item.category, existing?.label || item.category.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase()));
        }
      });
      if (seen.size > 0) {
        setCategories(prev => {
          const merged = new Map(prev.map(c => [c.value, c]));
          seen.forEach((label, value) => { if (!merged.has(value)) merged.set(value, { value, label }); });
          return [...merged.values()];
        });
      }
    } catch {}
  };

  const loadStock = async () => {
    try {
      const r = await fetch(`${API}/api/inventory/stock`, { headers: h() });
      const data = await r.json().catch(() => []);
      const map = {};
      (Array.isArray(data) ? data : []).forEach(i => { map[i.name] = i.quantity; });
      setStockMap(map);
    } catch {}
  };

  useEffect(() => { loadCatalog(); loadStock(); }, [filter]);

  useEffect(() => {
    try { localStorage.setItem("catalog_categories", JSON.stringify(categories)); } catch {}
  }, [categories]);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("catalog_categories") || "null");
      if (saved?.length) setCategories(saved);
    } catch {}
  }, []);

  const handleCategoryCreated = (newCat) => {
    setCategories(prev => {
      if (prev.some(c => c.value === newCat.value)) return prev;
      return [...prev, newCat];
    });
    toast.success(`Categoría "${newCat.label}" creada`);
  };

  const save = async () => {
    if (!form.name.trim()) { toast.error("Nombre requerido"); return; }
    if (!form.category) { toast.error("Selecciona una categoría"); return; }
    const body = { ...form, price: form.price ? parseFloat(form.price) : null };
    const method = editId ? "PUT" : "POST";
    const url = editId ? `${API}/api/catalog/${editId}` : `${API}/api/catalog`;
    const res = await fetch(url, { method, headers: h(), body: JSON.stringify(body) });
    if (res.ok) {
      toast.success("Producto guardado");
      setModalOpen(false);
      loadCatalog();
    } else {
      const d = await res.json().catch(() => ({}));
      toast.error(d.detail || "Error guardando");
    }
  };

  const del = async () => {
    if (!deleteConfirm) return;
    await fetch(`${API}/api/catalog/${deleteConfirm.id}`, { method: "DELETE", headers: h() });
    toast.success(`"${deleteConfirm.name}" eliminado`);
    setDeleteConfirm(null);
    loadCatalog();
  };

  const seed = async () => {
    await fetch(`${API}/api/catalog/seed`, { method: "POST", headers: h() });
    setCategories(DEFAULT_CATEGORIES);
    localStorage.setItem("catalog_categories", JSON.stringify(DEFAULT_CATEGORIES));
    loadCatalog();
    toast.success("Catálogo reiniciado con productos por defecto");
  };

  const filtered = search
    ? items.filter(i =>
        i.name.toLowerCase().includes(search.toLowerCase()) ||
        (i.brand || "").toLowerCase().includes(search.toLowerCase())
      )
    : items;

  const grouped = {};
  filtered.forEach(i => {
    const key = i.category || "other";
    grouped[key] = grouped[key] || [];
    grouped[key].push(i);
  });

  const sortedGroupKeys = Object.keys(grouped).sort((a, b) => {
    const ia = categories.findIndex(c => c.value === a);
    const ib = categories.findIndex(c => c.value === b);
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
  });

  const totalInStock = items.filter(i => stockMap[i.name] !== undefined).length;

  return (
    <div className="space-y-6" data-testid="catalog-page">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Catálogo Autorizado</h1>
          <p className="text-sm text-gray-500">
            {items.length} productos ·{" "}
            <span className="text-green-600 font-medium">{totalInStock} en inventario</span> ·{" "}
            {categories.length} categorías
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline" size="sm"
            onClick={() => setManageCatsOpen(true)}
            title="Gestionar categorías"
          >
            <Tag className="w-3.5 h-3.5 mr-1" /> Categorías
          </Button>
          <Button 
            variant="outline" size="sm" 
            onClick={() => setResetCatalogConfirm({ isOpen: true })}
            className="border-red-300 text-red-600 hover:bg-red-50 hover:border-red-400"
          >
            <RefreshCw className="w-3.5 h-3.5 mr-1" /> Reiniciar
          </Button>
          <Button
            onClick={() => {
              setEditId(null);
              setForm({ name: "", category: categories[0]?.value || "detergent", brand: "", price: "", in_stock: true, default: false });
              setModalOpen(true);
            }}
            data-testid="add-catalog-btn"
            className="bg-sky-600 hover:bg-sky-700"
          >
            <Plus className="w-4 h-4 mr-1" /> Agregar Producto
          </Button>
        </div>
      </div>

      {/* Search + category filter pills */}
      <div className="space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Buscar producto o marca…"
            value={search} onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          <button
            onClick={() => setFilter("")}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
              !filter ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
            }`}
          >
            Todos ({items.length})
          </button>
          {categories
            .filter(cat => grouped[cat.value]?.length > 0 || filter === cat.value)
            .map((cat, i) => {
              const count = (grouped[cat.value] || []).length;
              const p = palette(i);
              const active = filter === cat.value;
              return (
                <button
                  key={cat.value}
                  onClick={() => setFilter(active ? "" : cat.value)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                    active
                      ? "bg-gray-900 text-white border-gray-900"
                      : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
                  }`}
                >
                  <span className={`inline-block w-2 h-2 rounded-full mr-1.5 ${active ? "bg-white" : p.dot}`} />
                  {cat.label} ({count})
                </button>
              );
            })}
        </div>
      </div>

      {/* Grouped product cards */}
      {sortedGroupKeys.map(catVal => {
        const catItems = grouped[catVal];
        const cat = getCat(catVal);
        const idx = categories.findIndex(c => c.value === catVal);
        const p = palette(idx);
        return (
          <div key={catVal}>
            <div className="flex items-center gap-2 mb-3">
              <div className={`w-3 h-3 rounded-full ${p.dot}`} />
              <h2 className="text-lg font-semibold text-gray-800">{cat.label}</h2>
              <span className="text-xs text-gray-400">{catItems.length} producto{catItems.length !== 1 ? "s" : ""}</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {catItems.map(item => {
                const stockQty = stockMap[item.name];
                const inStock = stockQty !== undefined;
                const isLow = inStock && stockQty <= 5;
                return (
                  <div
                    key={item.id}
                    className={`border rounded-xl p-3.5 transition-shadow hover:shadow-md flex flex-col gap-2 ${p.bg}`}
                    data-testid={`catalog-item-${item.id}`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="min-w-0">
                        <h3 className="font-semibold text-sm text-gray-900 truncate">{item.name}</h3>
                        {item.brand && <p className="text-xs text-gray-500">{item.brand}</p>}
                      </div>
                      <div className="flex items-center gap-0.5 flex-shrink-0">
                        {item.default && <Badge className="bg-green-100 text-green-800 text-[9px] px-1">Default</Badge>}
                        <button
                          onClick={() => { setEditId(item.id); setForm({ ...item, price: item.price || "" }); setModalOpen(true); }}
                          className="p-1 hover:bg-white/80 rounded"
                        ><Edit className="w-3 h-3 text-gray-400" /></button>
                        <button
                          onClick={() => setDeleteConfirm({ id: item.id, name: item.name })}
                          className="p-1 hover:bg-red-100 rounded"
                        ><Trash2 className="w-3 h-3 text-red-400" /></button>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-xs">
                      {inStock ? (
                        <span className={`font-medium flex items-center gap-1 ${isLow ? "text-amber-600" : "text-green-700"}`}>
                          <Boxes className="w-3 h-3" />
                          {stockQty} en stock{isLow ? " ⚠" : ""}
                        </span>
                      ) : (
                        <span className="text-gray-400 flex items-center gap-1">
                          <Boxes className="w-3 h-3" /> Sin stock
                        </span>
                      )}
                      {item.price && <span className="font-semibold text-gray-700">${Number(item.price).toFixed(2)}</span>}
                    </div>

                    <button
                      onClick={() => setAddToStockItem(item)}
                      className="mt-auto w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium bg-white/70 hover:bg-white border border-white/50 hover:border-gray-300 text-gray-700 transition-colors"
                    >
                      <PlusCircle className="w-3.5 h-3.5 text-green-600" />
                      Agregar al inventario
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {sortedGroupKeys.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <Package className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>{search ? "Sin resultados para la búsqueda" : "Sin productos en catálogo"}</p>
        </div>
      )}

      {/* ── Add to stock modal ── */}
      {addToStockItem && (
        <AddToStockModal
          item={addToStockItem}
          catLabel={getCat(addToStockItem.category).label}
          catBg={getP(addToStockItem.category).bg}
          onClose={() => setAddToStockItem(null)}
          onDone={() => { setAddToStockItem(null); loadStock(); }}
        />
      )}

      {/* ── Manage categories modal ── */}
      {manageCatsOpen && (
        <ManageCategoriesModal
          categories={categories}
          onClose={() => setManageCatsOpen(false)}
          onUpdate={updated => {
            setCategories(updated);
            toast.success("Categorías actualizadas");
          }}
        />
      )}

      {/* ── Delete confirm modal ── */}
      <ConfirmationModal
        isOpen={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={del}
        title="Confirmar eliminación"
        message={`¿Estás seguro de eliminar "${deleteConfirm?.name}" del catálogo? Esta acción no se puede deshacer.`}
        confirmText="Eliminar"
        cancelText="Cancelar"
        variant="danger"
      />

      {/* ── Reset catalog modal (doble confirmación) ── */}
      <ResetCatalogModal
        isOpen={resetCatalogConfirm.isOpen}
        onClose={() => setResetCatalogConfirm({ isOpen: false })}
        onConfirm={seed}
      />

      {/* ── Add / Edit product modal ── */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-sm" data-testid="catalog-modal">
          <DialogHeader>
            <DialogTitle>{editId ? "Editar Producto" : "Agregar Producto"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Nombre *</Label>
              <Input
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                placeholder="Ej. Tide Original, Clorox Splash…"
                className="mt-1"
                data-testid="catalog-name"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <Label>Categoría *</Label>
                <button
                  type="button"
                  onClick={() => setManageCatsOpen(true)}
                  className="text-xs text-blue-500 hover:underline flex items-center gap-1"
                >
                  <Settings className="w-3 h-3" /> Gestionar
                </button>
              </div>
              <CategoryCombobox
                value={form.category}
                onChange={val => setForm({ ...form, category: val })}
                categories={categories}
                onCategoryCreated={handleCategoryCreated}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Marca</Label>
                <Input
                  value={form.brand || ""}
                  onChange={e => setForm({ ...form, brand: e.target.value })}
                  placeholder="P&G, Clorox…"
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Precio ($)</Label>
                <Input
                  type="number" step="0.01"
                  value={form.price || ""}
                  onChange={e => setForm({ ...form, price: e.target.value })}
                  className="mt-1"
                />
              </div>
            </div>

            <div className="flex items-center gap-4 pt-1">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={form.in_stock} onChange={e => setForm({ ...form, in_stock: e.target.checked })} />
                En stock
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={form.default} onChange={e => setForm({ ...form, default: e.target.checked })} />
                Default
              </label>
            </div>

            <Button onClick={save} className="w-full bg-sky-600 hover:bg-sky-700" data-testid="save-catalog-btn">
              {editId ? "Actualizar" : "Agregar"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}