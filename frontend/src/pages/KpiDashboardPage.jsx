import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { DollarSign, Package, TrendingUp, AlertTriangle, Users, Truck, BarChart3, Ticket } from "lucide-react";

const API = process.env.REACT_APP_BACKEND_URL;

function KpiCard({ title, value, subtitle, icon: Icon, color = "text-slate-700", alert }) {
  return (
    <Card className={`relative overflow-hidden ${alert ? "border-amber-300 bg-amber-50/50" : ""}`} data-testid={`kpi-card-${title.toLowerCase().replace(/\s/g,"-")}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{title}</p>
            <p className={`text-2xl font-bold ${color}`}>{value}</p>
            {subtitle && <p className="text-xs text-slate-400">{subtitle}</p>}
          </div>
          <div className={`p-2 rounded-lg ${alert ? "bg-amber-100" : "bg-slate-100"}`}>
            <Icon className={`w-5 h-5 ${alert ? "text-amber-600" : "text-slate-500"}`} />
          </div>
        </div>
        {alert && (
          <div className="mt-2 flex items-center gap-1 text-xs text-amber-700 font-medium">
            <AlertTriangle className="w-3 h-3" /> {alert}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function KpiDashboardPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("token");
    fetch(`${API}/api/kpis/operational`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex items-center justify-center h-64 text-slate-400">Cargando KPIs...</div>;
  if (!data) return <div className="text-center text-slate-400 py-12">Error cargando datos</div>;

  const fmt = (v) => v != null ? `$${Number(v).toLocaleString("en-US", { minimumFractionDigits: 2 })}` : "--";

  return (
    <div className="space-y-6" data-testid="kpi-dashboard">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">KPIs Operativos</h1>
          <p className="text-sm text-slate-500 mt-1">Vista consolidada del rendimiento de todos los modulos</p>
        </div>
        <Badge variant="outline" className="text-xs">
          <BarChart3 className="w-3 h-3 mr-1" /> Mes actual
        </Badge>
      </div>

      {/* Revenue & Financial */}
      <div>
        <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-3">Finanzas</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiCard title="Ingresos Mes" value={fmt(data.revenue?.monthly)} subtitle={`${data.revenue?.paid_orders || 0} ordenes pagadas`} icon={DollarSign} color="text-emerald-600" />
          <KpiCard title="Gastos Mes" value={fmt(data.expenses?.monthly)} icon={TrendingUp} color="text-red-500" />
          <KpiCard title="Utilidad Neta" value={fmt(data.expenses?.net_income)} icon={DollarSign} color={data.expenses?.net_income >= 0 ? "text-emerald-600" : "text-red-600"} />
          <KpiCard title="Ticket Promedio" value={fmt(data.revenue?.avg_ticket)} icon={Ticket} />
        </div>
      </div>

      {/* Orders */}
      <div>
        <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-3">Ordenes</h2>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <KpiCard title="Total Ordenes" value={data.orders?.total || 0} icon={Package} />
          <KpiCard title="Hoy" value={data.orders?.today || 0} icon={Package} color="text-blue-600" />
          <KpiCard title="Esta Semana" value={data.orders?.this_week || 0} icon={Package} />
          <KpiCard title="Activas" value={data.orders?.active || 0} icon={Truck} color="text-amber-600" alert={data.orders?.active > 10 ? `${data.orders.active} en proceso` : null} />
          <KpiCard title="Completadas" value={data.orders?.completed || 0} icon={Package} color="text-emerald-600" />
        </div>
      </div>

      {/* Inventory & Mileage */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-3">Inventario</h2>
          <div className="grid grid-cols-3 gap-3">
            <KpiCard title="Items Stock" value={data.inventory?.total_items || 0} icon={Package} />
            <KpiCard
              title="Stock Bajo"
              value={data.inventory?.low_stock_alerts || 0}
              icon={AlertTriangle}
              color={data.inventory?.low_stock_alerts > 0 ? "text-red-600" : "text-emerald-600"}
              alert={data.inventory?.low_stock_alerts > 0 ? "Reabastecer" : null}
            />
            <KpiCard title="POs Pendientes" value={data.inventory?.pending_purchase_orders || 0} icon={Package} alert={data.inventory?.pending_purchase_orders > 0 ? "Revisar" : null} />
          </div>
        </div>
        <div>
          <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-3">Millaje & Clientes</h2>
          <div className="grid grid-cols-3 gap-3">
            <KpiCard title="Millas Mes" value={`${data.mileage?.monthly_miles || 0} mi`} subtitle={`IRS: ${fmt(data.mileage?.irs_deduction)}`} icon={Truck} />
            <KpiCard title="Total Clientes" value={data.customers?.total || 0} icon={Users} />
            <KpiCard title="Nuevos Mes" value={data.customers?.new_this_month || 0} icon={Users} color="text-blue-600" />
          </div>
        </div>
      </div>

      {/* Support */}
      <div>
        <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-3">Soporte & CRM</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiCard title="Tickets Abiertos" value={data.support?.open_tickets || 0} icon={Ticket} alert={data.support?.open_tickets > 5 ? "Atender urgente" : null} />
          <KpiCard title="Leads Nuevos" value={data.support?.new_leads || 0} icon={Users} color="text-purple-600" />
        </div>
      </div>
    </div>
  );
}
