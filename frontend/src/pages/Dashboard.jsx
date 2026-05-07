import { useState, useEffect } from "react";
import axios from "axios";
import { useAuth } from "../context/AuthContext";
import {
  Users,
  ShoppingBag,
  FileText,
  HeadphonesIcon,
  UserPlus,
  TrendingUp,
  Clock,
  DollarSign,
  Bot,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  ArrowRight,
  Sparkles,
  Zap,
  Award
} from "lucide-react";
import { toast } from "sonner";
import { createNotificationsSocket } from "../utils/notificationsSocket";
import { Button } from "../components/ui/button";
import { useLocale } from "../context/LocaleContext";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const StatCard = ({ icon: Icon, label, value, color, subtext, onClick }) => (
  <div 
    className={`stat-card animate-slide-up ${onClick ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}`}
    onClick={onClick}
  >
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

const ActivityItem = ({ event, t }) => {
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
    
    if (minutes < 1) return t("Now", "Ahora");
    if (minutes < 60) return t("{minutes}m ago", "hace {minutes}m").replace("{minutes}", minutes);
    if (hours < 24) return t("{hours}h ago", "hace {hours}h").replace("{hours}", hours);
    return date.toLocaleDateString(t("en-US", "es-ES"), { month: "short", day: "numeric" });
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

const SuggestionCard = ({ suggestion }) => {
  const getIcon = (type) => {
    switch(type) {
      case 'warning': return AlertTriangle;
      case 'urgent': return AlertTriangle;
      case 'revenue': return DollarSign;
      case 'info': return CheckCircle;
      default: return Zap;
    }
  };

  const getColor = (priority) => {
    switch(priority) {
      case 'critical': return 'border-red-200 bg-red-50';
      case 'high': return 'border-orange-200 bg-orange-50';
      case 'medium': return 'border-yellow-200 bg-yellow-50';
      default: return 'border-slate-200 bg-slate-50';
    }
  };

  const Icon = getIcon(suggestion.type);

  return (
    <div className={`p-3 rounded-lg border ${getColor(suggestion.priority)} flex items-start gap-3`}>
      <Icon className={`h-5 w-5 mt-0.5 ${suggestion.priority === 'critical' ? 'text-red-600' : suggestion.priority === 'high' ? 'text-orange-600' : 'text-slate-600'}`} />
      <div className="flex-1">
        <p className="font-medium text-slate-900 text-sm">{suggestion.title}</p>
        <p className="text-xs text-slate-600 mt-0.5">{suggestion.description}</p>
      </div>
    </div>
  );
};

export default function Dashboard() {
  const { user } = useAuth();
  const { t, locale } = useLocale();
  const [stats, setStats] = useState(null);
  const [activity, setActivity] = useState([]);
  const [briefing, setBriefing] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [briefingLoading, setBriefingLoading] = useState(true);
  const [realtimeStatus, setRealtimeStatus] = useState("offline");
  const [financeStats, setFinanceStats] = useState(null);

  useEffect(() => {
    fetchData();
    fetchBriefing();
    fetchFinanceStats();
  }, []);

  useEffect(() => {
    const socket = createNotificationsSocket();
    if (!socket) {
      setRealtimeStatus("disabled");
      return;
    }

    const handleNotification = (payload) => {
      const message = payload?.message || t("Update received", "Actualización recibida");
      toast.info(message);
      fetchData();
      fetchBriefing();
      fetchFinanceStats();
    };

    socket.on("connect", () => setRealtimeStatus("connected"));
    socket.on("disconnect", () => setRealtimeStatus("offline"));
    socket.on("connect_error", () => setRealtimeStatus("offline"));
    socket.on("notification", handleNotification);
    socket.on("dashboard", () => {
      fetchData();
      fetchBriefing();
      fetchFinanceStats();
    });

    return () => {
      socket.off("notification", handleNotification);
      socket.disconnect();
    };
  }, [t]);

  const fetchData = async () => {
    try {
      const [statsRes, activityRes] = await Promise.all([
        axios.get(`${API}/dashboard/stats`),
        axios.get(`${API}/dashboard/recent-activity`)
      ]);
      setStats(statsRes.data);
      setActivity(activityRes.data);
    } catch (error) {
      console.error("Error loading dashboard:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchBriefing = async () => {
    setBriefingLoading(true);
    try {
      const [briefingRes, suggestionsRes] = await Promise.all([
        axios.get(`${API}/ai/briefing`),
        axios.get(`${API}/ai/suggestions`)
      ]);
      setBriefing(briefingRes.data);
      setSuggestions(suggestionsRes.data?.suggestions || []);
    } catch (error) {
      console.error("Error loading AI briefing:", error);
      setBriefing(null);
    } finally {
      setBriefingLoading(false);
    }
  };

  const fetchFinanceStats = async () => {
    try {
      const res = await axios.get(`${API}/finances/dashboard?period=month`);
      setFinanceStats(res.data);
    } catch (error) {
      console.error("Error loading finance stats:", error);
    }
  };

  const realtimeLabel = realtimeStatus === "connected"
    ? t("Realtime: connected", "Tiempo real: conectado")
    : realtimeStatus === "disabled"
      ? t("Realtime: not configured", "Tiempo real: sin configurar")
      : t("Realtime: disconnected", "Tiempo real: desconectado");
  const realtimeClass = realtimeStatus === "connected"
    ? "bg-emerald-100 text-emerald-700"
    : realtimeStatus === "disabled"
      ? "bg-slate-100 text-slate-500"
      : "bg-orange-100 text-orange-700";

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-600"></div>
      </div>
    );
  }

  const totalRevenue = (stats?.revenue_this_month || 0) + (financeStats?.membership_revenue || 0);

  return (
    <div data-testid="dashboard-page" className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {t("Welcome back, {name}!", "Bienvenido de nuevo, {name}!").replace("{name}", user?.name?.split(' ')[0] || t("Admin", "Admin"))}
          </h1>
          <p className="text-slate-500 mt-1">{t("Here's what's happening today", "Esto es lo que está pasando hoy")}</p>
        </div>
        <div className="flex items-center gap-3">
          <span className={`px-3 py-1 rounded-full text-xs font-semibold ${realtimeClass}`} data-testid="dashboard-realtime-status">
            {realtimeLabel}
          </span>
          <Button 
            variant="outline" 
            onClick={fetchBriefing}
            disabled={briefingLoading}
            data-testid="dashboard-refresh-btn"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${briefingLoading ? 'animate-spin' : ''}`} />
            {t("Refresh", "Actualizar")}
          </Button>
        </div>
      </div>

      {/* AI Briefing Card */}
      <div className="bg-gradient-to-br from-sky-50 to-indigo-50 rounded-2xl border border-sky-100 overflow-hidden">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-sky-500 to-indigo-600 flex items-center justify-center">
              <Bot className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="font-semibold text-slate-900 flex items-center gap-2">
                {t("AI Business Assistant", "Asistente de Negocios IA")}
                <Sparkles className="h-4 w-4 text-amber-500" />
              </h2>
              <p className="text-sm text-slate-500">{t("Powered by Groq • llama-3.3-70b", "Desarrollado por Groq • llama-3.3-70b")}</p>
            </div>
          </div>
          
          {briefingLoading ? (
            <div className="flex items-center gap-3 py-8">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-sky-600"></div>
              <span className="text-slate-600">{t("Analyzing your business data...", "Analizando tus datos de negocio...")}</span>
            </div>
          ) : briefing?.briefing ? (
            <div className="prose prose-slate prose-sm max-w-none">
              <div className="whitespace-pre-wrap text-slate-700 leading-relaxed">
                {briefing.briefing}
              </div>
            </div>
          ) : (
            <p className="text-slate-500 py-4">
              {t("Unable to generate briefing. Click refresh to try again.", "No se pudo generar el briefing. Haz clic en actualizar para intentarlo de nuevo.")}
            </p>
          )}
        </div>
        
        {/* AI Suggestions */}
        {suggestions.length > 0 && (
          <div className="border-t border-sky-100 bg-white/50 p-4">
            <h3 className="font-medium text-slate-900 mb-3 flex items-center gap-2">
              <Zap className="h-4 w-4 text-amber-500" />
              {t("Action Items", "Elementos de acción")}
            </h3>
            <div className="space-y-2">
              {suggestions.slice(0, 4).map((suggestion, idx) => (
                <SuggestionCard key={idx} suggestion={suggestion} />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={Users}
          label={t("Total Customers", "Total de clientes")}
          value={stats?.total_customers || 0}
          color="bg-sky-100 text-sky-600"
        />
        <StatCard
          icon={ShoppingBag}
          label={t("Orders Today", "Órdenes de hoy")}
          value={stats?.orders_today || 0}
          color="bg-emerald-100 text-emerald-600"
          subtext={t("{count} pending", "{count} pendientes").replace("{count}", stats?.pending_orders || 0)}
        />
        <StatCard
          icon={HeadphonesIcon}
          label={t("Open Tickets", "Tickets abiertos")}
          value={stats?.open_tickets || 0}
          color="bg-amber-100 text-amber-600"
        />
        <StatCard
          icon={Award}
          label={t("Active Members", "Miembros activos")}
          value={stats?.active_members || 0}
          color="bg-purple-100 text-purple-600"
        />
      </div>

      {/* Financial Stats Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          icon={FileText}
          label={t("Active Quotes", "Cotizaciones activas")}
          value={stats?.active_quotes || 0}
          color="bg-blue-100 text-blue-600"
        />
        <StatCard
          icon={UserPlus}
          label={t("New Leads", "Nuevos leads")}
          value={stats?.new_leads || 0}
          color="bg-indigo-100 text-indigo-600"
        />
        <StatCard
          icon={DollarSign}
          label={t("Monthly Revenue (Orders)", "Ingresos mensuales (Órdenes)")}
          value={`$${(stats?.revenue_this_month || 0).toLocaleString()}`}
          color="bg-emerald-100 text-emerald-600"
        />
      </div>

      {/* Additional Revenue Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {financeStats && (
          <>
            <StatCard
              icon={Award}
              label={t("Membership Revenue", "Ingresos por membresías")}
              value={`$${(financeStats.membership_revenue || 0).toLocaleString()}`}
              color="bg-violet-100 text-violet-600"
              subtext={t("This month", "Este mes")}
            />
            <StatCard
              icon={TrendingUp}
              label={t("Total Revenue", "Ingresos totales")}
              value={`$${totalRevenue.toLocaleString()}`}
              color="bg-amber-100 text-amber-600"
              subtext={t("Orders + Memberships", "Órdenes + membresías")}
            />
          </>
        )}
      </div>

      {/* Recent Activity & Business Overview */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Activity Feed */}
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-slate-900 flex items-center gap-2">
              <Clock className="h-5 w-5 text-slate-400" />
              {t("Recent Activity", "Actividad reciente")}
            </h2>
          </div>
          <div className="divide-y divide-slate-100">
            {activity.length > 0 ? (
              activity.slice(0, 8).map((event, idx) => (
                <ActivityItem key={idx} event={event} t={t} />
              ))
            ) : (
              <p className="text-slate-500 py-4 text-center">{t("No recent activity", "Sin actividad reciente")}</p>
            )}
          </div>
        </div>

        {/* Quick Stats from AI */}
        {briefing?.data && (
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <h2 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
              <Bot className="h-5 w-5 text-sky-600" />
              {t("Business Overview", "Resumen del negocio")}
            </h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 bg-slate-50 rounded-lg">
                <p className="text-xs text-slate-500">{t("New Orders", "Nuevas órdenes")}</p>
                <p className="text-xl font-bold text-slate-900">{briefing.data.orders_new}</p>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg">
                <p className="text-xs text-slate-500">{t("Processing", "Procesando")}</p>
                <p className="text-xl font-bold text-slate-900">{briefing.data.orders_processing}</p>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg">
                <p className="text-xs text-slate-500">{t("Ready", "Listas")}</p>
                <p className="text-xl font-bold text-slate-900">{briefing.data.orders_ready}</p>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg">
                <p className="text-xs text-slate-500">{t("Out for Delivery", "En camino")}</p>
                <p className="text-xl font-bold text-slate-900">{briefing.data.orders_out_delivery}</p>
              </div>
              <div className="p-3 bg-green-50 rounded-lg col-span-2">
                <p className="text-xs text-green-600">{t("Total Revenue", "Ingresos totales")}</p>
                <p className="text-xl font-bold text-green-700">${briefing.data.total_revenue?.toFixed(2) || '0.00'}</p>
              </div>
              <div className="p-3 bg-orange-50 rounded-lg col-span-2">
                <p className="text-xs text-orange-600">{t("Pending Payments", "Pagos pendientes")}</p>
                <p className="text-xl font-bold text-orange-700">${briefing.data.pending_revenue?.toFixed(2) || '0.00'}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}