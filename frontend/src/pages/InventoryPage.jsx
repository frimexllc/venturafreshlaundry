import { useState, useEffect } from "react";
import { Package, Search, Plus, Trash2, AlertTriangle, ArrowDown, ArrowUp, ArrowUpDown, ShoppingCart, TrendingDown, Box, FileText } from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Badge } from "../components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import { toast } from "sonner";

const API = process.env.REACT_APP_BACKEND_URL;
const h = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("token")}` });

export default function InventoryPage() {
  const [tab, setTab] = useState("stock");
  const [stock, setStock] = useState([]);
  const [lowStock, setLowStock] = useState([]);
  const [movements, setMovements] = useState([]);
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({});

  const loadStock = () => fetch(`${API}/api/inventory/stock`, { headers: h() }).then(r => r.json()).then(setStock).catch(() => {});
  const loadLowStock = () => fetch(`${API}/api/inventory/low-stock`, { headers: h() }).then(r => r.json()).then(setLowStock).catch(() => {});
  const loadMovements = () => fetch(`${API}/api/inventory/stock/movements`, { headers: h() }).then(r => r.json()).then(setMovements).catch(() => {});
  const loadPOs = () => fetch(`${API}/api/inventory/purchase-orders`, { headers: h() }).then(r => r.json()).then(setPurchaseOrders).catch(() => {});
  const loadSuppliers = () => fetch(`${API}/api/suppliers`, { headers: h() }).then(r => r.json()).then(setSuppliers).catch(() => {});

  useEffect(() => { loadStock(); loadLowStock(); loadSuppliers(); }, []);
  useEffect(() => { if (tab === "movements") loadMovements(); if (tab === "po") loadPOs(); }, [tab]);

  const saveMovement = async () => {
    if (!form.product_name || !form.quantity) { toast.error("Producto y cantidad requeridos"); return; }
    const body = { ...form, quantity: parseFloat(form.quantity) };
    const res = await fetch(`${API}/api/inventory/stock/movement`, { method: "POST", headers: h(), body: JSON.stringify(body) });
    if (res.ok) { toast.success("Movimiento registrado"); setModal(null); loadStock(); loadLowStock(); if (tab === "movements") loadMovements(); } else toast.error("Error");
  };

  const savePO = async () => {
    if (!form.supplier_id || !form.items?.length) { toast.error("Proveedor y items requeridos"); return; }
    const total = form.items.reduce((s, i) => s + (i.quantity || 0) * (i.unit_price || 0), 0);
    const body = { ...form, total };
    const res = await fetch(`${API}/api/inventory/purchase-orders`, { method: "POST", headers: h(), body: JSON.stringify(body) });
    if (res.ok) { toast.success("Orden de compra creada"); setModal(null); loadPOs(); } else toast.error("Error");
  };

  const updatePOStatus = async (id, status) => {
    await fetch(`${API}/api/inventory/purchase-orders/${id}/status`, { method: "PUT", headers: h(), body: JSON.stringify({ status }) });
    loadPOs(); if (status === "received") { loadStock(); loadLowStock(); } toast.success(`Estado actualizado: ${status}`);
  };

  const PO_STATUS = { pending: "bg-yellow-100 text-yellow-800", approved: "bg-blue-100 text-blue-800", ordered: "bg-purple-100 text-purple-800", received: "bg-green-100 text-green-800", cancelled: "bg-red-100 text-red-800" };

  return (
    <div className="space-y-6" data-testid="inventory-page">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div><h1 className="text-2xl font-bold text-gray-900">Inventario</h1><p className="text-sm text-gray-500">{stock.length} productos en inventario</p></div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => { setForm({ product_name: "", category: "", quantity: "", movement_type: "in", reason: "" }); setModal("movement"); }} data-testid="add-movement-btn"><ArrowUpDown className="w-4 h-4 mr-1" /> Movimiento</Button>
          <Button onClick={() => { setForm({ supplier_id: "", items: [{ name: "", quantity: 1, unit_price: 0 }], notes: "", expected_date: "" }); setModal("po"); }} data-testid="add-po-btn"><ShoppingCart className="w-4 h-4 mr-1" /> Orden de Compra</Button>
        </div>
      </div>
      {lowStock.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4" data-testid="low-stock-alert">
          <div className="flex items-center gap-2 text-amber-800 font-semibold text-sm mb-2"><AlertTriangle className="w-4 h-4" /> {lowStock.length} productos con stock bajo</div>
          <div className="flex flex-wrap gap-2">{lowStock.map(i => <Badge key={i.id || i.name} className="bg-amber-100 text-amber-800">{i.name}: {i.quantity} unid.</Badge>)}</div>
        </div>
      )}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
        {[["stock", "Stock Actual"], ["movements", "Movimientos"], ["po", "Ordenes de Compra"]].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} data-testid={`inv-tab-${key}`} className={`flex-1 text-sm font-medium py-2 rounded-md transition-colors ${tab === key ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"}`}>{label}</button>
        ))}
      </div>
      {tab === "stock" && (
        <div className="bg-white border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b"><tr><th className="text-left px-4 py-3 font-medium text-gray-500">Producto</th><th className="text-left px-4 py-3 font-medium text-gray-500">Categoria</th><th className="text-right px-4 py-3 font-medium text-gray-500">Cantidad</th><th className="text-right px-4 py-3 font-medium text-gray-500">Min. Stock</th><th className="text-left px-4 py-3 font-medium text-gray-500">Estado</th></tr></thead>
            <tbody className="divide-y">
              {stock.map(i => (
                <tr key={i.id || i.name} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{i.name}</td>
                  <td className="px-4 py-3 text-gray-500">{i.category || "-"}</td>
                  <td className="px-4 py-3 text-right font-semibold">{i.quantity}</td>
                  <td className="px-4 py-3 text-right text-gray-400">{i.min_stock || 5}</td>
                  <td className="px-4 py-3">{i.quantity <= (i.min_stock || 5) ? <Badge className="bg-red-100 text-red-800">Bajo</Badge> : <Badge className="bg-green-100 text-green-800">OK</Badge>}</td>
                </tr>
              ))}
              {stock.length === 0 && <tr><td colSpan={5} className="text-center py-10 text-gray-400">Sin stock registrado</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      {tab === "movements" && (
        <div className="bg-white border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b"><tr><th className="text-left px-4 py-3 font-medium text-gray-500">Fecha</th><th className="text-left px-4 py-3 font-medium text-gray-500">Producto</th><th className="text-left px-4 py-3 font-medium text-gray-500">Tipo</th><th className="text-right px-4 py-3 font-medium text-gray-500">Cantidad</th><th className="text-left px-4 py-3 font-medium text-gray-500">Razon</th></tr></thead>
            <tbody className="divide-y">
              {movements.map(m => (
                <tr key={m.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-500">{m.created_at?.split("T")[0]}</td>
                  <td className="px-4 py-3 font-medium">{m.product_name}</td>
                  <td className="px-4 py-3">{m.movement_type === "in" ? <Badge className="bg-green-100 text-green-800"><ArrowDown className="w-3 h-3 mr-0.5" />Entrada</Badge> : m.movement_type === "out" ? <Badge className="bg-red-100 text-red-800"><ArrowUp className="w-3 h-3 mr-0.5" />Salida</Badge> : <Badge>Ajuste</Badge>}</td>
                  <td className="px-4 py-3 text-right font-semibold">{m.quantity}</td>
                  <td className="px-4 py-3 text-gray-500">{m.reason || "-"}</td>
                </tr>
              ))}
              {movements.length === 0 && <tr><td colSpan={5} className="text-center py-10 text-gray-400">Sin movimientos</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      {tab === "po" && (
        <div className="space-y-3">
          {purchaseOrders.map(po => (
            <div key={po.id} className="bg-white border rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <div><span className="font-semibold text-sm">{po.po_number}</span><span className="text-xs text-gray-400 ml-2">{po.supplier_name || ""}</span></div>
                <div className="flex items-center gap-2">
                  <Badge className={PO_STATUS[po.status] || ""}>{po.status}</Badge>
                  <span className="font-bold text-sm">${po.total?.toFixed(2)}</span>
                </div>
              </div>
              <div className="text-xs text-gray-500 mb-2">{po.items?.length} items — {po.created_at?.split("T")[0]}</div>
              {po.status === "pending" && <div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => updatePOStatus(po.id, "approved")}>Aprobar</Button><Button size="sm" variant="outline" className="text-red-600" onClick={() => updatePOStatus(po.id, "cancelled")}>Cancelar</Button></div>}
              {po.status === "approved" && <Button size="sm" onClick={() => updatePOStatus(po.id, "ordered")}>Marcar Ordenado</Button>}
              {po.status === "ordered" && <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => updatePOStatus(po.id, "received")}>Marcar Recibido (auto-stock)</Button>}
            </div>
          ))}
          {purchaseOrders.length === 0 && <div className="text-center py-10 text-gray-400">Sin ordenes de compra</div>}
        </div>
      )}
      <Dialog open={!!modal} onOpenChange={() => setModal(null)}>
        <DialogContent className="max-w-md" data-testid="inventory-modal">
          <DialogHeader><DialogTitle>{modal === "movement" ? "Movimiento de Stock" : "Orden de Compra"}</DialogTitle></DialogHeader>
          {modal === "movement" && (
            <div className="space-y-3">
              <div><Label>Producto</Label><Input value={form.product_name || ""} onChange={e => setForm({ ...form, product_name: e.target.value })} placeholder="Tide, Clorox, etc." data-testid="movement-product" /></div>
              <div className="grid grid-cols-2 gap-3"><div><Label>Tipo</Label><select value={form.movement_type || "in"} onChange={e => setForm({ ...form, movement_type: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm"><option value="in">Entrada</option><option value="out">Salida</option><option value="adjustment">Ajuste</option></select></div><div><Label>Cantidad</Label><Input type="number" value={form.quantity || ""} onChange={e => setForm({ ...form, quantity: e.target.value })} data-testid="movement-qty" /></div></div>
              <div><Label>Razon</Label><Input value={form.reason || ""} onChange={e => setForm({ ...form, reason: e.target.value })} placeholder="Compra, uso diario, ajuste..." /></div>
              <Button onClick={saveMovement} className="w-full" data-testid="save-movement-btn">Registrar</Button>
            </div>
          )}
          {modal === "po" && (
            <div className="space-y-3">
              <div><Label>Proveedor</Label><select value={form.supplier_id || ""} onChange={e => { const s = suppliers.find(x => x.id === e.target.value); setForm({ ...form, supplier_id: e.target.value, supplier_name: s?.name || "" }); }} className="w-full border rounded-lg px-3 py-2 text-sm"><option value="">Seleccionar</option>{suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
              <div><Label>Fecha esperada</Label><Input type="date" value={form.expected_date || ""} onChange={e => setForm({ ...form, expected_date: e.target.value })} /></div>
              <div><Label>Items</Label>
                {(form.items || []).map((item, i) => (
                  <div key={i} className="flex gap-2 mb-2">
                    <Input placeholder="Producto" value={item.name} onChange={e => { const items = [...form.items]; items[i].name = e.target.value; setForm({ ...form, items }); }} className="flex-1" />
                    <Input type="number" placeholder="Cant." value={item.quantity} onChange={e => { const items = [...form.items]; items[i].quantity = parseInt(e.target.value) || 0; setForm({ ...form, items }); }} className="w-20" />
                    <Input type="number" placeholder="Precio" step="0.01" value={item.unit_price} onChange={e => { const items = [...form.items]; items[i].unit_price = parseFloat(e.target.value) || 0; setForm({ ...form, items }); }} className="w-24" />
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={() => setForm({ ...form, items: [...(form.items || []), { name: "", quantity: 1, unit_price: 0 }] })}>+ Agregar item</Button>
              </div>
              <div><Label>Notas</Label><Textarea value={form.notes || ""} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} /></div>
              <Button onClick={savePO} className="w-full" data-testid="save-po-btn">Crear Orden de Compra</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
