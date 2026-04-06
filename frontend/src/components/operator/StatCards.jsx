import { Package, Truck, CheckCircle, AlertTriangle } from "lucide-react";

const StatCard = ({ icon: Icon, bg, count, label, highlight }) => (
  <div className={`bg-white rounded-xl border p-4 shadow-sm ${highlight ? "border-red-200 bg-red-50" : "border-slate-200"}`}>
    <div className="flex items-center gap-3">
      <div className={`h-10 w-10 rounded-full ${bg} flex items-center justify-center text-white`}>
        <Icon size={20} />
      </div>
      <div>
        <p className="text-2xl font-bold text-slate-900 leading-none">{count}</p>
        <p className="text-xs text-slate-500 mt-1 uppercase tracking-wider font-semibold">{label}</p>
      </div>
    </div>
  </div>
);

export const StatsGrid = ({ data, t }) => (
  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
    <StatCard icon={Package} bg="bg-blue-500" count={data?.pending_count || 0} label={t("Pendientes", "New")} />
    <StatCard icon={Truck} bg="bg-orange-500" count={data?.in_transit || 0} label={t("En Ruta", "Transit")} />
    <StatCard icon={CheckCircle} bg="bg-emerald-500" count={data?.completed_today || 0} label={t("Completadas", "Done")} />
    <StatCard icon={AlertTriangle} bg="bg-red-500" count={data?.alerts || 0} label={t("Alertas", "Alerts")} highlight={data?.alerts > 0} />
  </div>
);