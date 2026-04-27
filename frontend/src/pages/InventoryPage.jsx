import { useState, useEffect, useCallback, useRef } from "react";
import { useLocale } from "../context/LocaleContext";
import {
  AlertTriangle, ArrowDown, ArrowUp, ArrowUpDown, ShoppingCart,
  TrendingDown, Box, Package, Search, RefreshCw, Edit2, Check, X,
  Plus, ChevronDown, UserPlus, ExternalLink, BookOpen,
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

// ── Creatable combobox (categories & suppliers) ───────────────────────
function CreatableCombobox({ value, onChange, options, placeholder, createLabel, onCreateNew, renderOption }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef(null);

  useEffect(() => {
    const close = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const isObj = options.length > 0 && typeof options[0] === "object";
  const getLabel = o => typeof o === "string" ? o : o.name;
  const getId = o => typeof o === "string" ? o : o.id;

  const filtered = options.filter(o => getLabel(o).toLowerCase().includes(search.toLowerCase()));
  const displayValue = value
    ? (isObj ? options.find(o => o.id === value)?.name || value : value)
    : "";
  const canCreate = search.trim() && !options.some(o => getLabel(o).toLowerCase() === search.trim().toLowerCase());

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => { setOpen(v => !v); setSearch(""); }}
        className="w-full border rounded-lg px-3 py-2 text-sm bg-white text-left flex items-center justify-between gap-2 hover:border-gray-400 transition-colors"
      >
        <span className={displayValue ? "text-gray-900" : "text-gray-400"}>{displayValue || placeholder}</span>
        <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white border rounded-xl shadow-lg overflow-hidden">
          <div className="p-2 border-b">
            <Input autoFocus value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar…" className="h-8 text-sm" />
          </div>
          <ul className="max-h-52 overflow-y-auto py-1">
            {filtered.map((o, i) => {
              const id = getId(o); const label = getLabel(o); const sel = value === id;
              return (
                <li key={i} onClick={() => { onChange(id, o); setOpen(false); setSearch(""); }}
                  className={`px-3 py-2 text-sm cursor-pointer flex items-center justify-between hover:bg-gray-50 ${sel ? "bg-blue-50 text-blue-700 font-medium" : ""}`}
                >
                  {renderOption ? renderOption(o) : label}
                  {sel && <Check className="w-3.5 h-3.5 flex-shrink-0" />}
                </li>
              );
            })}
            {filtered.length === 0 && !canCreate && <li className="px-3 py-3 text-sm text-gray-400 text-center">Sin resultados</li>}
          </ul>
          {canCreate && onCreateNew && (
            <div className="border-t p-2">
              <button type="button" onClick={() => { onCreateNew(search.trim()); setOpen(false); setSearch(""); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg text-blue-700 bg-blue-50 hover:bg-blue-100 font-medium transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> {createLabel} "{search.trim()}"
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Inline editable min_stock ─────────────────────────────────────────
function EditableMinStock({ value, onSave }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value);
  if (!editing) return (
    <span onClick={() => { setVal(value); setEditing(true); }}
      className="flex items-center gap-1 cursor-pointer group text-gray-400 hover:text-gray-700"
    >
      {value}<Edit2 className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
    </span>
  );
  return (
    <span className="flex items-center gap-1">
      <Input type="number" value={val} autoFocus onChange={e => setVal(e.target.value)}
        className="w-16 h-7 text-xs px-1 py-0"
        onKeyDown={e => { if (e.key === "Enter") { onSave(parseFloat(val)); setEditing(false); } if (e.key === "Escape") setEditing(false); }}
      />
      <button onClick={() => { onSave(parseFloat(val)); setEditing(false); }} className="text-green-600"><Check className="w-3.5 h-3.5" /></button>
      <button onClick={() => setEditing(false)} className="text-red-400"><X className="w-3.5 h-3.5" /></button>
    </span>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, color = "text-gray-500" }) {
  return (
    <div className="bg-white border rounded-xl px-4 py-3 flex items-center gap-3">
      <div className={`p-2 rounded-lg bg-gray-50 ${color}`}><Icon className="w-4 h-4" /></div>
      <div><p className="text-xs text-gray-500">{label}</p><p className="text-lg font-bold text-gray-900">{value}</p></div>
    </div>
  );
}

// ── Quick inline supplier creation ────────────────────────────────────
function QuickSupplierForm({ initialName, onCreated, onCancel }) {
  const [form, setForm] = useState({ name: initialName || "", contact_name: "", phone: "", email: "", category: "general" });
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!form.name.trim()) { toast.error("Nombre requerido"); return; }
    setSaving(true);
    try {
      const res = await fetch(`${API}/api/suppliers`, { method: "POST", headers: h(), body: JSON.stringify(form) });
      if (!res.ok) throw new Error();
      const s = await res.json();
      toast.success(`Proveedor "${s.name}" creado`);
      onCreated(s);
    } catch { toast.error("Error creando proveedor"); }
    finally { setSaving(false); }
  };
  return (
    <div className="border border-blue-200 rounded-xl bg-blue-50 p-4 space-y-3">
      <div className="flex items-center gap-2 text-blue-700 font-medium text-sm"><UserPlus className="w-4 h-4" /> Nuevo proveedor</div>
      <div className="grid grid-cols-2 gap-2">
        <div className="col-span-2"><Label className="text-xs">Nombre *</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="h-8 text-sm" /></div>
        <div><Label className="text-xs">Contacto</Label><Input value={form.contact_name} onChange={e => setForm({ ...form, contact_name: e.target.value })} className="h-8 text-sm" placeholder="Opcional" /></div>
        <div><Label className="text-xs">Teléfono</Label><Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className="h-8 text-sm" placeholder="Opcional" /></div>
        <div><Label className="text-xs">Email</Label><Input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className="h-8 text-sm" placeholder="Opcional" /></div>
        <div>
          <Label className="text-xs">Categoría</Label>
          <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} className="w-full border rounded-lg px-2 py-1.5 text-sm bg-white">
            {["chemicals","packaging","equipment","uniforms","maintenance","delivery","general","other"].map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={save} disabled={saving} className="flex-1">{saving ? "Guardando…" : "Guardar"}</Button>
        <Button size="sm" variant="outline" onClick={onCancel}>Cancelar</Button>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
export default function InventoryPage() {
  const { t } = useLocale();

  // ── Data ────────────────────────────────────────────────────────────
  const [tab, setTab] = useState("stock");
  const [stock, setStock] = useState([]);
  const [lowStock, setLowStock] = useState([]);
  const [movements, setMovements] = useState([]);
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [catalogItems, setCatalogItems] = useState([]);   // full catalog for name suggestions
  const [catalogCategories, setCatalogCategories] = useState([]);
  const [loading, setLoading] = useState(false);

  // ── Filters ─────────────────────────────────────────────────────────
  const [stockSearch, setStockSearch] = useState("");
  const [stockCategory, setStockCategory] = useState("all");
  const [movFilter, setMovFilter] = useState("all");
  const [movSearch, setMovSearch] = useState("");
  const [poStatus, setPoStatus] = useState("all");

  // ── Modal ────────────────────────────────────────────────────────────
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({});
  const [showQuickSupplier, setShowQuickSupplier] = useState(false);
  const [quickSupplierName, setQuickSupplierName] = useState("");

  // ── Loaders ──────────────────────────────────────────────────────────
  const loadStock = useCallback(async () => {
    setLoading(true);
    try { const r = await fetch(`${API}/api/inventory/stock`, { headers: h() }); setStock(await r.json().catch(() => [])); }
    catch { toast.error("Error cargando stock"); } finally { setLoading(false); }
  }, []);

  const loadLowStock = useCallback(async () => {
    try { const r = await fetch(`${API}/api/inventory/low-stock`, { headers: h() }); setLowStock(await r.json().catch(() => [])); } catch {}
  }, []);

  const loadMovements = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams();
      if (movFilter !== "all") p.set("movement_type", movFilter);
      if (movSearch) p.set("product_name", movSearch);
      const r = await fetch(`${API}/api/inventory/stock/movements?${p}`, { headers: h() });
      setMovements(await r.json().catch(() => []));
    } catch { toast.error("Error cargando movimientos"); } finally { setLoading(false); }
  }, [movFilter, movSearch]);

  const loadPOs = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams();
      if (poStatus !== "all") p.set("status", poStatus);
      const r = await fetch(`${API}/api/inventory/purchase-orders?${p}`, { headers: h() });
      setPurchaseOrders(await r.json().catch(() => []));
    } catch { toast.error("Error cargando órdenes"); } finally { setLoading(false); }
  }, [poStatus]);

  const loadSuppliers = useCallback(async () => {
    try { const r = await fetch(`${API}/api/suppliers`, { headers: h() }); setSuppliers(await r.json().catch(() => [])); } catch {}
  }, []);

  // Load full catalog for product name autocomplete AND categories
  const loadCatalog = useCallback(async () => {
    try {
      const r = await fetch(`${API}/api/catalog`, { headers: h() });
      const data = await r.json().catch(() => []);
      setCatalogItems(Array.isArray(data) ? data : []);
      setCatalogCategories([...new Set((Array.isArray(data) ? data : []).map(i => i.category).filter(Boolean))].sort());
    } catch {}
  }, []);

  useEffect(() => { loadStock(); loadLowStock(); loadSuppliers(); loadCatalog(); }, []);
  useEffect(() => { if (tab === "movements") loadMovements(); }, [tab, movFilter, movSearch]);
  useEffect(() => { if (tab === "po") loadPOs(); }, [tab, poStatus]);

  // ── Merged product names: catalog + existing stock (deduped) ─────────
  const allProductNames = [...new Set([
    ...catalogItems.map(i => i.name),
    ...stock.map(i => i.name),
  ])].sort();

  // ── Merged categories: catalog + stock ───────────────────────────────
  const stockCategories = [...new Set(stock.map(i => i.category).filter(Boolean))];
  const allCategories = [...new Set([...catalogCategories, ...stockCategories])].sort();

  // ── Min stock update ─────────────────────────────────────────────────
  const updateMinStock = async (name, min_stock) => {
    try {
      await fetch(`${API}/api/inventory/stock/min-stock`, { method: "PUT", headers: h(), body: JSON.stringify({ product_name: name, min_stock }) });
      setStock(prev => prev.map(i => i.name === name ? { ...i, min_stock } : i));
      toast.success("Mínimo actualizado");
    } catch { toast.error("Error actualizando mínimo"); }
  };

  // ── Save movement ────────────────────────────────────────────────────
  const saveMovement = async () => {
    if (!form.product_name || !form.quantity) { toast.error("Producto y cantidad requeridos"); return; }
    // Auto-fill category from catalog if not set
    const catalogMatch = catalogItems.find(i => i.name.toLowerCase() === form.product_name.toLowerCase());
    const body = { ...form, quantity: parseFloat(form.quantity), category: form.category || catalogMatch?.category || "" };
    const res = await fetch(`${API}/api/inventory/stock/movement`, { method: "POST", headers: h(), body: JSON.stringify(body) });
    if (res.ok) { toast.success("Movimiento registrado"); setModal(null); loadStock(); loadLowStock(); if (tab === "movements") loadMovements(); }
    else toast.error("Error al registrar movimiento");
  };

  // ── Save PO ──────────────────────────────────────────────────────────
  const savePO = async () => {
    if (!form.supplier_id) { toast.error("Selecciona un proveedor"); return; }
    if (!form.items?.some(i => i.name)) { toast.error("Agrega al menos un item"); return; }
    const total = form.items.reduce((s, i) => s + (i.quantity || 0) * (i.unit_price || 0), 0);
    const res = await fetch(`${API}/api/inventory/purchase-orders`, { method: "POST", headers: h(), body: JSON.stringify({ ...form, total }) });
    if (res.ok) { toast.success("Orden de compra creada"); setModal(null); loadPOs(); }
    else toast.error("Error creando orden");
  };

  const updatePOStatus = async (id, status) => {
    await fetch(`${API}/api/inventory/purchase-orders/${id}/status`, { method: "PUT", headers: h(), body: JSON.stringify({ status }) });
    loadPOs(); if (status === "received") { loadStock(); loadLowStock(); } toast.success(`Estado: ${status}`);
  };

  const handleSupplierCreated = s => {
    setSuppliers(prev => [...prev, s].sort((a, b) => a.name.localeCompare(b.name)));
    setForm(prev => ({ ...prev, supplier_id: s.id, supplier_name: s.name }));
    setShowQuickSupplier(false);
  };

  const handleCategoryCreated = name => {
    setCatalogCategories(prev => [...new Set([...prev, name])].sort());
    setForm(prev => ({ ...prev, category: name }));
  };

  // ── Derived ──────────────────────────────────────────────────────────
  const filteredStock = stock.filter(i => {
    const matchS = !stockSearch || i.name?.toLowerCase().includes(stockSearch.toLowerCase());
    const matchC = stockCategory === "all" || i.category === stockCategory;
    return matchS && matchC;
  });
  const totalUnits = stock.reduce((s, i) => s + (i.quantity || 0), 0);
  const outOfStock = stock.filter(i => i.quantity === 0).length;

  // For each stock item, find its catalog entry (for category badge color)
  const CAT_BG = { detergent: "bg-blue-100 text-blue-700", softener: "bg-pink-100 text-pink-700", dryer_sheet: "bg-amber-100 text-amber-700", bleach: "bg-cyan-100 text-cyan-700" };

  const PO_STATUS = { pending: "bg-yellow-100 text-yellow-800", approved: "bg-blue-100 text-blue-800", ordered: "bg-purple-100 text-purple-800", received: "bg-green-100 text-green-800", cancelled: "bg-red-100 text-red-800" };
  const PO_LABEL = { pending: "Pendiente", approved: "Aprobado", ordered: "Ordenado", received: "Recibido", cancelled: "Cancelado" };

  // When user picks a product name from datalist, auto-fill category
  const handleProductNameChange = (name) => {
    const match = catalogItems.find(i => i.name.toLowerCase() === name.toLowerCase());
    setForm(prev => ({ ...prev, product_name: name, ...(match ? { category: match.category } : {}) }));
  };

  return (
    <div className="space-y-6" data-testid="inventory-page">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Inventario</h1>
          <p className="text-sm text-gray-500">{stock.length} productos · {catalogItems.length} en catálogo</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={loadStock} size="icon" disabled={loading} title="Actualizar">
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button variant="outline" onClick={() => { setForm({ product_name: "", category: "", quantity: "", movement_type: "in", reason: "" }); setModal("movement"); }} data-testid="add-movement-btn">
            <ArrowUpDown className="w-4 h-4 mr-1" /> Movimiento
          </Button>
          <Button onClick={() => { setForm({ supplier_id: "", items: [{ name: "", quantity: 1, unit_price: 0 }], notes: "", expected_date: "" }); setShowQuickSupplier(false); setModal("po"); }} data-testid="add-po-btn">
            <ShoppingCart className="w-4 h-4 mr-1" /> Orden de Compra
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard icon={Package} label="Total Productos" value={stock.length} />
        <StatCard icon={Box} label="Unidades Totales" value={totalUnits.toLocaleString()} />
        <StatCard icon={AlertTriangle} label="Stock Bajo" value={lowStock.length} color={lowStock.length > 0 ? "text-amber-600" : "text-gray-500"} />
        <StatCard icon={TrendingDown} label="Sin Stock" value={outOfStock} color={outOfStock > 0 ? "text-red-600" : "text-gray-500"} />
      </div>

      {/* Low stock banner */}
      {lowStock.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4" data-testid="low-stock-alert">
          <div className="flex items-center gap-2 text-amber-800 font-semibold text-sm mb-2"><AlertTriangle className="w-4 h-4" />{lowStock.length} productos con stock bajo</div>
          <div className="flex flex-wrap gap-2">
            {lowStock.map(i => <Badge key={i.id || i.name} className="bg-amber-100 text-amber-800">{i.name}: {i.quantity} unid.</Badge>)}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
        {[["stock","Stock Actual"],["movements","Movimientos"],["po","Órdenes de Compra"]].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} data-testid={`inv-tab-${key}`}
            className={`flex-1 text-sm font-medium py-2 rounded-md transition-colors ${tab === key ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"}`}
          >{label}</button>
        ))}
      </div>

      {/* ═══ STOCK TAB ═══ */}
      {tab === "stock" && (
        <>
          <div className="space-y-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input value={stockSearch} onChange={e => setStockSearch(e.target.value)} placeholder="Buscar producto…" className="pl-9" />
            </div>
            {/* Dynamic category pills from catalog + stock */}
            <div className="flex flex-wrap gap-1.5">
              {["all", ...allCategories].map(cat => (
                <button key={cat} onClick={() => setStockCategory(cat)}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${stockCategory === cat ? "bg-gray-800 text-white border-gray-800" : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"}`}
                >{cat === "all" ? "Todas" : cat}</button>
              ))}
            </div>
          </div>
          <div className="bg-white border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Producto</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Categoría</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-500">Cantidad</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-500">Min. Stock <span className="text-gray-300 font-normal text-xs">(✎)</span></th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredStock.map(i => {
                  const minStock = i.min_stock ?? 5;
                  const isEmpty = i.quantity === 0;
                  const isLow = i.quantity <= minStock;
                  const catStyle = CAT_BG[i.category] || "bg-gray-100 text-gray-600";
                  return (
                    <tr key={i.id || i.name} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <span className="font-medium">{i.name}</span>
                        {i.unit && <span className="text-gray-400 text-xs ml-1">({i.unit})</span>}
                      </td>
                      <td className="px-4 py-3">
                        {i.category
                          ? <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${catStyle}`}>{i.category}</span>
                          : <span className="text-gray-300">—</span>}
                      </td>
                      <td className={`px-4 py-3 text-right font-semibold tabular-nums ${isEmpty ? "text-red-600" : isLow ? "text-amber-600" : "text-gray-800"}`}>{i.quantity}</td>
                      <td className="px-4 py-3 text-right"><EditableMinStock value={minStock} onSave={v => updateMinStock(i.name, v)} /></td>
                      <td className="px-4 py-3">
                        {isEmpty ? <Badge className="bg-red-100 text-red-800">Sin Stock</Badge>
                          : isLow ? <Badge className="bg-amber-100 text-amber-800">Bajo</Badge>
                          : <Badge className="bg-green-100 text-green-800">OK</Badge>}
                      </td>
                    </tr>
                  );
                })}
                {filteredStock.length === 0 && (
                  <tr><td colSpan={5} className="text-center py-12 text-gray-400">
                    {stock.length === 0 ? "Sin stock registrado" : "Sin resultados"}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
          {/* Link to catalog */}
          {stock.length === 0 && (
            <div className="text-center">
              <a href="/admin/catalog" className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:underline">
                <BookOpen className="w-4 h-4" /> Ir al catálogo para agregar productos al inventario
              </a>
            </div>
          )}
        </>
      )}

      {/* ═══ MOVEMENTS TAB ═══ */}
      {tab === "movements" && (
        <>
          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input value={movSearch} onChange={e => setMovSearch(e.target.value)} placeholder="Buscar producto…" className="pl-9" />
            </div>
            <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
              {[["all","Todos"],["in","Entradas"],["out","Salidas"],["adjustment","Ajustes"]].map(([k,l]) => (
                <button key={k} onClick={() => setMovFilter(k)}
                  className={`px-3 py-1 text-xs rounded-md font-medium transition-colors ${movFilter === k ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"}`}
                >{l}</button>
              ))}
            </div>
          </div>
          <div className="bg-white border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Fecha</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Producto</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Tipo</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-500">Cant.</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Razón</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {movements.map(m => (
                  <tr key={m.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-gray-500 tabular-nums">{m.created_at?.split("T")[0]}</td>
                    <td className="px-4 py-3 font-medium">{m.product_name}</td>
                    <td className="px-4 py-3">
                      {m.movement_type === "in"
                        ? <Badge className="bg-green-100 text-green-800 flex items-center gap-0.5 w-fit"><ArrowDown className="w-3 h-3" />Entrada</Badge>
                        : m.movement_type === "out"
                        ? <Badge className="bg-red-100 text-red-800 flex items-center gap-0.5 w-fit"><ArrowUp className="w-3 h-3" />Salida</Badge>
                        : <Badge className="bg-blue-100 text-blue-800 flex items-center gap-0.5 w-fit"><ArrowUpDown className="w-3 h-3" />Ajuste</Badge>}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums">{m.quantity}</td>
                    <td className="px-4 py-3 text-gray-500">{m.reason || m.reference || "—"}</td>
                  </tr>
                ))}
                {movements.length === 0 && <tr><td colSpan={5} className="text-center py-12 text-gray-400">Sin movimientos</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ═══ PURCHASE ORDERS TAB ═══ */}
      {tab === "po" && (
        <>
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
            {[["all","Todos"],["pending","Pendientes"],["approved","Aprobados"],["ordered","Ordenados"],["received","Recibidos"]].map(([k,l]) => (
              <button key={k} onClick={() => setPoStatus(k)}
                className={`px-3 py-1 text-xs rounded-md font-medium transition-colors ${poStatus === k ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"}`}
              >{l}</button>
            ))}
          </div>
          <div className="space-y-3">
            {purchaseOrders.map(po => (
              <div key={po.id} className="bg-white border rounded-xl p-4 hover:shadow-sm transition-shadow">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <span className="font-semibold text-sm">{po.po_number}</span>
                    {po.supplier_name && (
                      <a href="/admin/suppliers" className="text-xs text-blue-500 hover:underline ml-2 inline-flex items-center gap-0.5">
                        {po.supplier_name}<ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    )}
                    {po.expected_date && <span className="text-xs text-gray-400 ml-2">· Esperado: {po.expected_date}</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={PO_STATUS[po.status] || "bg-gray-100 text-gray-800"}>{PO_LABEL[po.status] || po.status}</Badge>
                    <span className="font-bold text-sm">${po.total?.toFixed(2)}</span>
                  </div>
                </div>
                {po.items?.length > 0 && (
                  <div className="mb-3 rounded-lg bg-gray-50 divide-y text-xs">
                    {po.items.map((item, i) => (
                      <div key={i} className="flex items-center justify-between px-3 py-1.5">
                        <span className="text-gray-700">{item.name}</span>
                        <span className="text-gray-500">{item.quantity} × ${item.unit_price?.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="text-xs text-gray-400 mb-3">{po.created_at?.split("T")[0]}{po.notes ? ` · ${po.notes}` : ""}</div>
                <div className="flex gap-2">
                  {po.status === "pending" && <>
                    <Button size="sm" variant="outline" onClick={() => updatePOStatus(po.id, "approved")} className="text-blue-600 border-blue-200 hover:bg-blue-50">Aprobar</Button>
                    <Button size="sm" variant="outline" onClick={() => updatePOStatus(po.id, "cancelled")} className="text-red-600 border-red-200 hover:bg-red-50">Cancelar</Button>
                  </>}
                  {po.status === "approved" && <Button size="sm" onClick={() => updatePOStatus(po.id, "ordered")} className="bg-purple-600 hover:bg-purple-700">Marcar Ordenado</Button>}
                  {po.status === "ordered" && <Button size="sm" onClick={() => updatePOStatus(po.id, "received")} className="bg-green-600 hover:bg-green-700">✓ Recibido (actualiza stock)</Button>}
                </div>
              </div>
            ))}
            {purchaseOrders.length === 0 && <div className="text-center py-12 text-gray-400 bg-white border rounded-xl">Sin órdenes de compra</div>}
          </div>
        </>
      )}

      {/* ════════ MODALS ════════ */}
      <Dialog open={!!modal} onOpenChange={() => { setModal(null); setShowQuickSupplier(false); }}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto" data-testid="inventory-modal">
          <DialogHeader>
            <DialogTitle>{modal === "movement" ? "Movimiento de Stock" : "Orden de Compra"}</DialogTitle>
          </DialogHeader>

          {/* ── MOVEMENT FORM ── */}
          {modal === "movement" && (
            <div className="space-y-4">
              <div>
                <Label>Producto <span className="text-gray-400 text-xs">(sugerencias del catálogo)</span></Label>
                <Input
                  value={form.product_name || ""}
                  onChange={e => handleProductNameChange(e.target.value)}
                  placeholder="Tide, Clorox, Suavitel…"
                  list="catalog-names-datalist"
                  data-testid="movement-product"
                />
                {/* Datalist combines catalog + existing stock names */}
                <datalist id="catalog-names-datalist">
                  {allProductNames.map(n => <option key={n} value={n} />)}
                </datalist>
                {/* Show if product is already in catalog */}
                {form.product_name && catalogItems.find(i => i.name.toLowerCase() === form.product_name.toLowerCase()) && (
                  <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                    <Check className="w-3 h-3" /> Producto en catálogo autorizado
                  </p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Tipo</Label>
                  <select value={form.movement_type || "in"} onChange={e => setForm({ ...form, movement_type: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm bg-white">
                    <option value="in">↓ Entrada</option>
                    <option value="out">↑ Salida</option>
                    <option value="adjustment">↕ Ajuste</option>
                  </select>
                </div>
                <div>
                  <Label>Cantidad</Label>
                  <Input type="number" min="0" step="0.5" value={form.quantity || ""} onChange={e => setForm({ ...form, quantity: e.target.value })} data-testid="movement-qty" />
                </div>
              </div>
              {/* Category creatable combobox — auto-filled if product matched catalog */}
              <div>
                <Label>Categoría <span className="text-gray-400 text-xs">(escribe para crear nueva)</span></Label>
                <CreatableCombobox
                  value={form.category || ""}
                  onChange={val => setForm({ ...form, category: val })}
                  options={allCategories}
                  placeholder="detergent, bleach, softener…"
                  createLabel="Crear categoría"
                  onCreateNew={handleCategoryCreated}
                />
              </div>
              <div>
                <Label>Razón</Label>
                <Input value={form.reason || ""} onChange={e => setForm({ ...form, reason: e.target.value })} placeholder="Compra, uso diario, ajuste…" />
              </div>
              <Button onClick={saveMovement} className="w-full" data-testid="save-movement-btn">Registrar</Button>
            </div>
          )}

          {/* ── PO FORM ── */}
          {modal === "po" && (
            <div className="space-y-4">
              <div>
                <Label>Proveedor <span className="text-gray-400 text-xs">(busca o crea nuevo)</span></Label>
                {showQuickSupplier ? (
                  <QuickSupplierForm initialName={quickSupplierName} onCreated={handleSupplierCreated} onCancel={() => setShowQuickSupplier(false)} />
                ) : (
                  <CreatableCombobox
                    value={form.supplier_id || ""}
                    onChange={(id, obj) => setForm({ ...form, supplier_id: id, supplier_name: obj?.name || id })}
                    options={suppliers}
                    placeholder="Seleccionar proveedor…"
                    createLabel="Crear proveedor"
                    onCreateNew={name => { setQuickSupplierName(name); setShowQuickSupplier(true); }}
                    renderOption={s => (
                      <span className="flex items-center gap-2 min-w-0">
                        <span className="truncate">{s.name}</span>
                        {s.category && <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded flex-shrink-0">{s.category}</span>}
                      </span>
                    )}
                  />
                )}
              </div>
              <div>
                <Label>Fecha esperada</Label>
                <Input type="date" value={form.expected_date || ""} onChange={e => setForm({ ...form, expected_date: e.target.value })} />
              </div>
              <div>
                <Label>Items <span className="text-gray-400 text-xs">(sugerencias del catálogo)</span></Label>
                <div className="space-y-2">
                  <div className="grid grid-cols-12 gap-1 text-xs text-gray-400 px-1">
                    <span className="col-span-5">Producto</span><span className="col-span-3 text-center">Cant.</span><span className="col-span-3 text-right">Precio</span>
                  </div>
                  {(form.items || []).map((item, i) => (
                    <div key={i} className="grid grid-cols-12 gap-1 items-center">
                      <Input placeholder="Producto" value={item.name} list={`po-item-list-${i}`}
                        onChange={e => { const items = [...form.items]; items[i].name = e.target.value; setForm({ ...form, items }); }}
                        className="col-span-5 h-8 text-xs"
                      />
                      {/* Combined catalog + stock suggestions */}
                      <datalist id={`po-item-list-${i}`}>
                        {allProductNames.map(n => <option key={n} value={n} />)}
                      </datalist>
                      <Input type="number" placeholder="0" value={item.quantity}
                        onChange={e => { const items = [...form.items]; items[i].quantity = parseInt(e.target.value) || 0; setForm({ ...form, items }); }}
                        className="col-span-3 h-8 text-xs"
                      />
                      <Input type="number" placeholder="0.00" step="0.01" value={item.unit_price}
                        onChange={e => { const items = [...form.items]; items[i].unit_price = parseFloat(e.target.value) || 0; setForm({ ...form, items }); }}
                        className="col-span-3 h-8 text-xs"
                      />
                      <button onClick={() => setForm({ ...form, items: form.items.filter((_, j) => j !== i) })}
                        disabled={form.items.length === 1} className="col-span-1 flex justify-center text-red-300 hover:text-red-500 disabled:opacity-20"
                      ><X className="w-3.5 h-3.5" /></button>
                    </div>
                  ))}
                  {(form.items || []).some(i => i.quantity && i.unit_price) && (
                    <div className="text-right text-sm font-semibold text-gray-700 pr-6">
                      Total: ${(form.items || []).reduce((s, i) => s + (i.quantity || 0) * (i.unit_price || 0), 0).toFixed(2)}
                    </div>
                  )}
                  <Button variant="outline" size="sm" onClick={() => setForm({ ...form, items: [...(form.items || []), { name: "", quantity: 1, unit_price: 0 }] })} className="w-full text-xs">
                    + Agregar item
                  </Button>
                </div>
              </div>
              <div>
                <Label>Notas <span className="text-gray-400 text-xs">(opcional)</span></Label>
                <Textarea value={form.notes || ""} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} />
              </div>
              <Button onClick={savePO} className="w-full" data-testid="save-po-btn" disabled={showQuickSupplier}>
                Crear Orden de Compra
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}