import { useState, useEffect } from "react";
import axios from "axios";
import {
  Users,
  ShoppingBag,
  FileText,
  HeadphonesIcon,
  UserPlus,
  TrendingUp,
  Clock,
  DollarSign
} from "lucide-react";
import { toast } from "sonner";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const StatCard = ({ icon: Icon, label, value, color, subtext }) => (
  <div className="stat-card animate-slide-up">
    <div className="flex items-start justify-between">
      <div>
        <p className="text-sm font-medium text-slate-500 mb-1">{label}</p>
        <p className="text-2xl font-bold text-slate-900">{value}</p>
        {subtext && <p className="text-xs text-slate-400 mt-1">{subtext}</p>}
      </div>
      <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${color}`}>
        <Icon className="h-5 w-5" />
      </div>
    </div>
  </div>
);

const ActivityItem = ({ event }) => {
  const getEventColor = (type) => {
    if (type.includes("CREATED")) return "bg-emerald-500";
    if (type.includes("UPDATED")) return "bg-sky-500";
    if (type.includes("DELETED")) return "bg-red-500";
    if (type.includes("CONVERTED")) return "bg-purple-500";
    return "bg-slate-400";
  };

  const formatEventType = (type) => {
    return type.replace(/_/g, " ").toLowerCase();
  };

  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    
    if (minutes < 1) return "Ahora";
    if (minutes < 60) return `Hace ${minutes}m`;
    if (hours < 24) return `Hace ${hours}h`;
    return date.toLocaleDateString("es-MX", { month: "short", day: "numeric" });
  };

  return (
    <div className="flex items-start gap-3 py-3">
      <div className={`h-2 w-2 rounded-full mt-2 ${getEventColor(event.event_type)}`} />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-slate-700 capitalize">{formatEventType(event.event_type)}</p>
        <p className="text-xs text-slate-400 font-mono">{event.entity_type} • {event.entity_id.slice(0, 8)}</p>
      </div>
      <span className="text-xs text-slate-400 whitespace-nowrap">{formatTime(event.created_at)}</span>
    </div>
  );
};

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [statsRes, activityRes] = await Promise.all([
        axios.get(`${API}/dashboard/stats`),
        axios.get(`${API}/dashboard/recent-activity`)
      ]);
      setStats(statsRes.data);
      setActivity(activityRes.data);
    } catch (error) {
      toast.error("Error cargando dashboard");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-600"></div>
      </div>
    );
  }

  return (
    <div data-testid="dashboard-page" className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
        <p className="text-slate-500 mt-1">Resumen de operaciones de hoy</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={Users}
          label="Total Clientes"
          value={stats?.total_customers || 0}
          color="bg-sky-100 text-sky-600"
        />
        <StatCard
          icon={ShoppingBag}
          label="Órdenes Hoy"
          value={stats?.orders_today || 0}
          color="bg-emerald-100 text-emerald-600"
          subtext={`${stats?.pending_orders || 0} pendientes`}
        />
        <StatCard
          icon={HeadphonesIcon}
          label="Tickets Abiertos"
          value={stats?.open_tickets || 0}
          color="bg-amber-100 text-amber-600"
        />
        <StatCard
          icon={DollarSign}
          label="Ingresos del Mes"
          value={`$${(stats?.revenue_this_month || 0).toLocaleString()}`}
          color="bg-purple-100 text-purple-600"
        />
      </div>

      {/* Secondary Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          icon={FileText}
          label="Cotizaciones Activas"
          value={stats?.active_quotes || 0}
          color="bg-blue-100 text-blue-600"
        />
        <StatCard
          icon={UserPlus}
          label="Leads Nuevos"
          value={stats?.new_leads || 0}
          color="bg-indigo-100 text-indigo-600"
        />
        <StatCard
          icon={TrendingUp}
          label="Total Órdenes"
          value={stats?.total_orders || 0}
          color="bg-teal-100 text-teal-600"
        />
      </div>

      {/* Activity Feed */}
      <div className="dashboard-card p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-900">Actividad Reciente</h2>
          <Clock className="h-5 w-5 text-slate-400" />
        </div>
        
        {activity.length === 0 ? (
          <p className="text-slate-500 text-sm py-4 text-center">No hay actividad reciente</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {activity.slice(0, 10).map((event, idx) => (
              <ActivityItem key={event.id || idx} event={event} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
