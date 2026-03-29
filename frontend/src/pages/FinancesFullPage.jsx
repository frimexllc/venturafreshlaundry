import { useState, useEffect } from "react";
import { Plus, Search, DollarSign, TrendingUp, TrendingDown, Fuel, Car, Trash2, Edit, Receipt, Calendar, Filter, ArrowUpDown } from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Badge } from "../components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import { Separator } from "../components/ui/separator";
import { toast } from "sonner";

const API = process.env.REACT_APP_BACKEND_URL;
const h = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("token")}` });

const TYPE_LABELS = { fixed: "Fijo", variable: "Variable", subscription: "Suscripcion" };
const TYPE_COLORS = { fixed: "bg-red-100 text-red-800", variable: "bg-blue-100 text-blue-800", subscription: "bg-purple-100 text-purple-800" };
const PAYMENT_LABELS = { card: "Tarjeta", cash: "Efectivo", transfer: "Transferencia", check: "Cheque", zelle: "Zelle" };

const emptyExpense = { date: new Date().toISOString().split("T")[0], category: "", description: "", amount: "", expense_type: "variable", vendor: "", payment_method: "card", notes: "", recurring: false };
const emptyMileage = { date: new Date().toISOString().split("T")[0], vehicle_id: "", driver_name: "", start_odometer: "", end_odometer: "", purpose: "" };
const emptyVehicle = { name: "", plate: "", make: "", model: "", year: "", status: "active" };

export default function FinancesPage() {
  const [tab, setTab] = useState("expenses");
  const [dashboard, setDashboard] = useState(null);
  const [expenses, setExpenses] = useState([]);
  const [categories, setCategories] = useState([]);
  const [mileage, setMileage] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [period, setPeriod] = useState("month");
  const [expenseType, setExpenseType] = useState("");
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState(null); // 'expense' | 'mileage' | 'vehicle'
  const [form, setForm] = useState({});
  const [editId, setEditId] = useState(null);

  const loadDashboard = () => fetch(`${API}/api/finances/dashboard?period=${period}`, { headers: h() }).then(r => r.ok ? r.json() : null).then(setDashboard).catch(() => {});
  const loadExpenses = () => { const p = new URLSearchParams(); if (expenseType) p.set("expense_type", expenseType); if (search) p.set("search", search); fetch(`${API}/api/finances/expenses?${p}`, { headers: h() }).then(r => r.json()).then(setExpenses).catch(() => {}); };
  const loadCategories = () => fetch(`${API}/api/finances/categories`, { headers: h() }).then(r => r.json()).then(setCategories).catch(() => {});
  const loadMileage = () => fetch(`${API}/api/finances/mileage`, { headers: h() }).then(r => r.json()).then(setMileage).catch(() => {});
  const loadVehicles = () => fetch(`${API}/api/finances/vehicles`, { headers: h() }).then(r => r.json()).then(setVehicles).catch(() => {});

  useEffect(() => { loadDashboard(); loadCategories(); }, [period]);
  useEffect(() => { loadExpenses(); }, [expenseType, search]);
  useEffect(() => { if (tab === "mileage") { loadMileage(); loadVehicles(); } if (tab === "vehicles") loadVehicles(); }, [tab]);

  const saveExpense = async () => {
    if (!form.description || !form.amount) { toast.error("Descripcion y monto requeridos"); return; }
    const body = { ...form, amount: parseFloat(form.amount) };
    const res = await fetch(editId ? `${API}/api/finances/expenses/${editId}` : `${API}/api/finances/expenses`, { method: editId ? "PUT" : "POST", headers: h(), body: JSON.stringify(body) });
    if (res.ok) { toast.success("Gasto guardado"); setModal(null); loadExpenses(); loadDashboard(); } else toast.error("Error");
  };

  const saveMileage = async () => {
    if (!form.start_odometer || !form.end_odometer) { toast.error("Odometros requeridos"); return; }
    const body = { ...form, start_odometer: parseFloat(form.start_odometer), end_odometer: parseFloat(form.end_odometer) };
    const res = await fetch(`${API}/api/finances/mileage`, { method: "POST", headers: h(), body: JSON.stringify(body) });
    if (res.ok) { toast.success("Millaje registrado"); setModal(null); loadMileage(); loadDashboard(); } else toast.error("Error");
  };

  const saveVehicle = async () => {
    if (!form.name) { toast.error("Nombre requerido"); return; }
    const body = { ...form, year: form.year ? parseInt(form.year) : null };
    const res = await fetch(editId ? `${API}/api/finances/vehicles/${editId}` : `${API}/api/finances/vehicles`, { method: editId ? "PUT" : "POST", headers: h(), body: JSON.stringify(body) });
    if (res.ok) { toast.success("Vehiculo guardado"); setModal(null); loadVehicles(); } else toast.error("Error");
  };

  const delExpense = async (id) => { await fetch(`${API}/api/finances/expenses/${id}`, { method: "DELETE", headers: h() }); loadExpenses(); loadDashboard(); toast.success("Eliminado"); };
  const delVehicle = async (id) => { await fetch(`${API}/api/finances/vehicles/${id}`, { method: "DELETE", headers: h() }); loadVehicles(); toast.success("Eliminado"); };

  const StatCard = ({ label, value, icon: Icon, color = "text-gray-800", bg = "bg-white" }) => (
    <div className={`${bg} border rounded-xl p-4`}>
      <div className="flex items-center gap-2 text-xs text-gray-500 mb-1"><Icon className="w-3.5 h-3.5" />{label}</div>
      <div className={`text-xl font-bold ${color}`}>{value}</div>
    </div>
  );

  return (
    <div className="space-y-6" data-testid="finances-page">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div><h1 className="text-2xl font-bold text-gray-900">Finanzas</h1><p className="text-sm text-gray-500">Control financiero operativo</p></div>
        <div className="flex items-center gap-2">
          <select value={period} onChange={e => setPeriod(e.target.value)} className="border rounded-lg px-3 py-2 text-sm" data-testid="period-select">
            <option value="day">Hoy</option><option value="week">Semana</option><option value="month">Mes</option><option value="year">Ano</option>
          </select>
        </div>
      </div>
      {dashboard && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Ingresos" value={`$${dashboard.revenue?.toFixed(2) || '0'}`} icon={TrendingUp} color="text-green-700" bg="bg-green-50" />
          <StatCard label="Gastos" value={`$${dashboard.total_expenses?.toFixed(2) || '0'}`} icon={TrendingDown} color="text-red-700" bg="bg-red-50" />
          <StatCard label="Utilidad Neta" value={`$${dashboard.net_income?.toFixed(2) || '0'}`} icon={DollarSign} color={dashboard.net_income >= 0 ? "text-green-700" : "text-red-700"} bg={dashboard.net_income >= 0 ? "bg-green-50" : "bg-red-50"} />
          <StatCard label="Millaje" value={`${dashboard.mileage?.total_miles?.toFixed(0) || '0'} mi`} icon={Car} color="text-blue-700" bg="bg-blue-50" />
        </div>
      )}
      {dashboard?.by_category && Object.keys(dashboard.by_category).length > 0 && (
        <div className="bg-white border rounded-xl p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Gastos por Categoria</h3>
          <div className="space-y-2">
            {Object.entries(dashboard.by_category).map(([cat, amt]) => {
              const pct = dashboard.total_expenses > 0 ? (amt / dashboard.total_expenses) * 100 : 0;
              return (
                <div key={cat} className="flex items-center gap-3">
                  <span className="text-xs text-gray-600 w-40 truncate">{cat}</span>
                  <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden"><div className="h-full bg-blue-500 rounded-full" style={{ width: `${pct}%` }} /></div>
                  <span className="text-xs font-semibold text-gray-700 w-20 text-right">${amt.toFixed(2)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
        {[["expenses", "Gastos"], ["mileage", "Millaje"], ["vehicles", "Vehiculos"]].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} data-testid={`tab-${key}`} className={`flex-1 text-sm font-medium py-2 rounded-md transition-colors ${tab === key ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"}`}>{label}</button>
        ))}
      </div>
      {tab === "expenses" && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-[200px]"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" /><Input placeholder="Buscar gasto..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" /></div>
            <select value={expenseType} onChange={e => setExpenseType(e.target.value)} className="border rounded-lg px-3 py-2 text-sm"><option value="">Todos</option><option value="fixed">Fijos</option><option value="variable">Variables</option><option value="subscription">Suscripciones</option></select>
            <Button onClick={() => { setEditId(null); setForm({ ...emptyExpense }); setModal("expense"); }} data-testid="add-expense-btn"><Plus className="w-4 h-4 mr-1" /> Nuevo Gasto</Button>
          </div>
          <div className="bg-white border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b"><tr><th className="text-left px-4 py-3 font-medium text-gray-500">Fecha</th><th className="text-left px-4 py-3 font-medium text-gray-500">Descripcion</th><th className="text-left px-4 py-3 font-medium text-gray-500">Categoria</th><th className="text-left px-4 py-3 font-medium text-gray-500">Tipo</th><th className="text-right px-4 py-3 font-medium text-gray-500">Monto</th><th className="px-4 py-3"></th></tr></thead>
              <tbody className="divide-y">
                {expenses.map(e => (
                  <tr key={e.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-500">{e.date}</td>
                    <td className="px-4 py-3 font-medium text-gray-900">{e.description}</td>
                    <td className="px-4 py-3"><span className="text-xs bg-gray-100 text-gray-600 rounded-full px-2 py-0.5">{e.category}</span></td>
                    <td className="px-4 py-3"><Badge className={TYPE_COLORS[e.expense_type]}>{TYPE_LABELS[e.expense_type]}</Badge></td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900">${e.amount?.toFixed(2)}</td>
                    <td className="px-4 py-3 text-right"><button onClick={() => { setEditId(e.id); setForm(e); setModal("expense"); }} className="p-1 hover:bg-gray-100 rounded"><Edit className="w-3.5 h-3.5 text-gray-400" /></button><button onClick={() => delExpense(e.id)} className="p-1 hover:bg-red-50 rounded"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button></td>
                  </tr>
                ))}
                {expenses.length === 0 && <tr><td colSpan={6} className="text-center py-10 text-gray-400">Sin gastos registrados</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {tab === "mileage" && (
        <div className="space-y-4">
          <div className="flex justify-between"><span className="text-sm text-gray-500">{mileage.length} registros</span><Button onClick={() => { setForm({ ...emptyMileage }); setModal("mileage"); }} size="sm"><Plus className="w-4 h-4 mr-1" /> Registrar Millaje</Button></div>
          <div className="bg-white border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b"><tr><th className="text-left px-4 py-3 font-medium text-gray-500">Fecha</th><th className="text-left px-4 py-3 font-medium text-gray-500">Conductor</th><th className="text-right px-4 py-3 font-medium text-gray-500">Millas</th><th className="text-right px-4 py-3 font-medium text-gray-500">Reembolso</th><th className="text-left px-4 py-3 font-medium text-gray-500">Proposito</th></tr></thead>
              <tbody className="divide-y">
                {mileage.map(m => (
                  <tr key={m.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-500">{m.date}</td>
                    <td className="px-4 py-3 font-medium">{m.driver_name || "-"}</td>
                    <td className="px-4 py-3 text-right font-semibold">{m.miles?.toFixed(1)}</td>
                    <td className="px-4 py-3 text-right text-green-700 font-semibold">${m.reimbursement?.toFixed(2)}</td>
                    <td className="px-4 py-3 text-gray-500">{m.purpose || "-"}</td>
                  </tr>
                ))}
                {mileage.length === 0 && <tr><td colSpan={5} className="text-center py-10 text-gray-400">Sin registros de millaje</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {tab === "vehicles" && (
        <div className="space-y-4">
          <div className="flex justify-between"><span className="text-sm text-gray-500">{vehicles.length} vehiculos</span><Button onClick={() => { setEditId(null); setForm({ ...emptyVehicle }); setModal("vehicle"); }} size="sm"><Plus className="w-4 h-4 mr-1" /> Nuevo Vehiculo</Button></div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {vehicles.map(v => (
              <div key={v.id} className="bg-white border rounded-xl p-4">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2.5"><Car className="w-5 h-5 text-blue-600" /><div><h3 className="font-semibold text-sm">{v.name}</h3><p className="text-xs text-gray-500">{v.make} {v.model} {v.year || ""}</p></div></div>
                  <div className="flex gap-1"><button onClick={() => { setEditId(v.id); setForm(v); setModal("vehicle"); }} className="p-1 hover:bg-gray-100 rounded"><Edit className="w-3.5 h-3.5 text-gray-400" /></button><button onClick={() => delVehicle(v.id)} className="p-1 hover:bg-red-50 rounded"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button></div>
                </div>
                {v.plate && <Badge variant="outline" className="text-xs mb-2">{v.plate}</Badge>}
                <div className="text-xs text-gray-500">{(v.total_miles || 0).toFixed(0)} millas totales</div>
              </div>
            ))}
          </div>
        </div>
      )}
      <Dialog open={!!modal} onOpenChange={() => setModal(null)}>
        <DialogContent className="max-w-md" data-testid="finance-modal">
          <DialogHeader><DialogTitle>{modal === "expense" ? (editId ? "Editar Gasto" : "Nuevo Gasto") : modal === "mileage" ? "Registrar Millaje" : (editId ? "Editar Vehiculo" : "Nuevo Vehiculo")}</DialogTitle></DialogHeader>
          {modal === "expense" && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3"><div><Label>Fecha</Label><Input type="date" value={form.date || ""} onChange={e => setForm({ ...form, date: e.target.value })} /></div><div><Label>Monto ($)</Label><Input type="number" step="0.01" value={form.amount || ""} onChange={e => setForm({ ...form, amount: e.target.value })} data-testid="expense-amount" /></div></div>
              <div><Label>Descripcion</Label><Input value={form.description || ""} onChange={e => setForm({ ...form, description: e.target.value })} data-testid="expense-desc" /></div>
              <div className="grid grid-cols-2 gap-3"><div><Label>Categoria</Label><select value={form.category || ""} onChange={e => setForm({ ...form, category: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm">{categories.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}</select></div><div><Label>Tipo</Label><select value={form.expense_type || "variable"} onChange={e => setForm({ ...form, expense_type: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm"><option value="fixed">Fijo</option><option value="variable">Variable</option><option value="subscription">Suscripcion</option></select></div></div>
              <div className="grid grid-cols-2 gap-3"><div><Label>Proveedor</Label><Input value={form.vendor || ""} onChange={e => setForm({ ...form, vendor: e.target.value })} /></div><div><Label>Metodo Pago</Label><select value={form.payment_method || "card"} onChange={e => setForm({ ...form, payment_method: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm">{Object.entries(PAYMENT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div></div>
              <div><Label>Notas</Label><Textarea value={form.notes || ""} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} /></div>
              <Button onClick={saveExpense} className="w-full" data-testid="save-expense-btn">{editId ? "Actualizar" : "Guardar Gasto"}</Button>
            </div>
          )}
          {modal === "mileage" && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3"><div><Label>Fecha</Label><Input type="date" value={form.date || ""} onChange={e => setForm({ ...form, date: e.target.value })} /></div><div><Label>Vehiculo</Label><select value={form.vehicle_id || ""} onChange={e => setForm({ ...form, vehicle_id: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm"><option value="">Seleccionar</option>{vehicles.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}</select></div></div>
              <div><Label>Conductor</Label><Input value={form.driver_name || ""} onChange={e => setForm({ ...form, driver_name: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3"><div><Label>Odometro Inicio</Label><Input type="number" value={form.start_odometer || ""} onChange={e => setForm({ ...form, start_odometer: e.target.value })} /></div><div><Label>Odometro Final</Label><Input type="number" value={form.end_odometer || ""} onChange={e => setForm({ ...form, end_odometer: e.target.value })} /></div></div>
              <div><Label>Proposito</Label><Input value={form.purpose || ""} onChange={e => setForm({ ...form, purpose: e.target.value })} placeholder="Entregas zona norte, etc." /></div>
              <Button onClick={saveMileage} className="w-full" data-testid="save-mileage-btn">Registrar Millaje</Button>
            </div>
          )}
          {modal === "vehicle" && (
            <div className="space-y-3">
              <div><Label>Nombre *</Label><Input value={form.name || ""} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Van Principal" data-testid="vehicle-name" /></div>
              <div className="grid grid-cols-3 gap-3"><div><Label>Marca</Label><Input value={form.make || ""} onChange={e => setForm({ ...form, make: e.target.value })} /></div><div><Label>Modelo</Label><Input value={form.model || ""} onChange={e => setForm({ ...form, model: e.target.value })} /></div><div><Label>Ano</Label><Input type="number" value={form.year || ""} onChange={e => setForm({ ...form, year: e.target.value })} /></div></div>
              <div className="grid grid-cols-2 gap-3"><div><Label>Placas</Label><Input value={form.plate || ""} onChange={e => setForm({ ...form, plate: e.target.value })} /></div><div><Label>Estado</Label><select value={form.status || "active"} onChange={e => setForm({ ...form, status: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm"><option value="active">Activo</option><option value="maintenance">En Mantenimiento</option><option value="inactive">Inactivo</option></select></div></div>
              <Button onClick={saveVehicle} className="w-full" data-testid="save-vehicle-btn">{editId ? "Actualizar" : "Crear Vehiculo"}</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
