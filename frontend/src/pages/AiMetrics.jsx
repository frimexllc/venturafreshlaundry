import { useCallback, useEffect, useState } from "react";
import {
  BarChart3, Activity, CheckCircle2, XCircle, Clock, Bot, ShieldAlert, RefreshCw, TrendingUp, Zap
} from "lucide-react";
import { Button } from "../components/ui/button";
import { useLocale } from "../context/LocaleContext";
import { toast } from "sonner";

const API_URL = process.env.REACT_APP_BACKEND_URL;

function Stat({ icon: Icon, label, value, sub, color = "sky" }) {
  const colors = {
    sky: "bg-sky-50 text-sky-600 border-sky-100",
    green: "bg-emerald-50 text-emerald-600 border-emerald-100",
    amber: "bg-amber-50 text-amber-600 border-amber-100",
    red: "bg-red-50 text-red-600 border-red-100",
    violet: "bg-violet-50 text-violet-600 border-violet-100",
  };
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-start gap-3" data-testid={`metric-${label.replace(/\s/g, "-").toLowerCase()}`}>
      <div className={`p-2 rounded-lg border ${colors[color]}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <p className="text-xs text-slate-500">{label}</p>
        <p className="text-xl font-bold text-slate-900">{value}</p>
        {sub && <p className="text-[11px] text-slate-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function ActionBreakdownTable({ data, t }) {
  if (!data || data.length === 0) return <p className="text-sm text-slate-400">{t("No action data", "Sin datos de acciones")}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm" data-testid="action-breakdown-table">
        <thead>
          <tr className="border-b border-slate-100">
            <th className="text-left py-2 px-3 text-slate-500 font-medium">{t("Action Type", "Tipo de Acción")}</th>
            <th className="text-right py-2 px-3 text-slate-500 font-medium">{t("Count", "Cantidad")}</th>
            <th className="text-right py-2 px-3 text-slate-500 font-medium">{t("Success", "Éxito")}</th>
            <th className="text-right py-2 px-3 text-slate-500 font-medium">{t("Rate", "Tasa")}</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr key={row.type} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
              <td className="py-2 px-3 font-mono text-xs text-slate-700">{row.type}</td>
              <td className="py-2 px-3 text-right text-slate-600">{row.count}</td>
              <td className="py-2 px-3 text-right text-emerald-600 font-medium">{row.success}</td>
              <td className="py-2 px-3 text-right">
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${row.count > 0 && row.success / row.count >= 0.8 ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                  {row.count > 0 ? Math.round((row.success / row.count) * 100) : 0}%
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DailySummaryChart({ data, t }) {
  if (!data || data.length === 0) return <p className="text-sm text-slate-400">{t("No daily data", "Sin datos diarios")}</p>;
  const sorted = [...data].sort((a, b) => a.day.localeCompare(b.day));
  const max = Math.max(...sorted.map((d) => d.interactions_count || 0), 1);
  return (
    <div className="flex items-end gap-1 h-32" data-testid="daily-chart">
      {sorted.map((d) => {
        const h = Math.max(((d.interactions_count || 0) / max) * 100, 4);
        return (
          <div key={d.day} className="flex-1 flex flex-col items-center gap-1 group relative min-w-0">
            <div className="absolute bottom-full mb-1 bg-slate-800 text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10">
              {d.day}: {d.interactions_count} {t("interactions", "interacciones")}
            </div>
            <div className="w-full rounded-t bg-sky-500 transition-all hover:bg-sky-600" style={{ height: `${h}%` }} />
            <span className="text-[9px] text-slate-400 truncate w-full text-center">{d.day.slice(5)}</span>
          </div>
        );
      })}
    </div>
  );
}

function RecentLogsList({ logs, t }) {
  if (!logs || logs.length === 0) return <p className="text-sm text-slate-400">{t("No recent logs", "Sin logs recientes")}</p>;
  return (
    <div className="space-y-2 max-h-96 overflow-y-auto" data-testid="recent-logs-list">
      {logs.slice(0, 20).map((log) => (
        <div key={log.id} className="bg-slate-50 rounded-lg p-3 text-sm border border-slate-100">
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className="text-xs text-slate-400">{new Date(log.created_at).toLocaleString()}</span>
            <div className="flex gap-1.5">
              {log.executed && <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full font-medium">{t("Executed", "Ejecutado")}</span>}
              {log.requires_confirmation && <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-medium">{t("Needs approval", "Requiere aprobación")}</span>}
            </div>
          </div>
          <p className="text-slate-700 font-medium truncate">{log.message}</p>
          <p className="text-slate-500 text-xs mt-1 line-clamp-2">{log.reply}</p>
        </div>
      ))}
    </div>
  );
}

export default function AiMetrics() {
  const { t } = useLocale();
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);

  const loadMetrics = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_URL}/api/ai/metrics?days=${days}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed");
      setMetrics(await res.json());
    } catch {
      toast.error(t("Error loading AI metrics", "Error cargando métricas IA"));
    } finally {
      setLoading(false);
    }
  }, [days, t]);

  useEffect(() => { loadMetrics(); }, [loadMetrics]);

  const m = metrics || {};

  return (
    <div className="space-y-6" data-testid="ai-metrics-page">
      <div className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-slate-900 flex items-center gap-2" data-testid="ai-metrics-title">
            <Bot className="h-6 w-6 text-sky-500" />
            {t("AI Agent Metrics", "Métricas del Agente IA")}
          </h1>
          <p className="text-sm text-slate-500 mt-1">{t("Performance tracking for Jarvis operator assistant", "Seguimiento de rendimiento del asistente Jarvis")}</p>
        </div>
        <div className="flex items-center gap-2">
          {[7, 30, 90].map((d) => (
            <Button key={d} size="sm" variant={days === d ? "default" : "outline"} onClick={() => setDays(d)} data-testid={`metrics-period-${d}`}
              className={days === d ? "bg-sky-600 hover:bg-sky-700" : ""}>
              {d}d
            </Button>
          ))}
          <Button size="sm" variant="outline" onClick={loadMetrics} disabled={loading} data-testid="metrics-refresh">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {loading && !metrics ? (
        <div className="flex justify-center py-12">
          <RefreshCw className="h-6 w-6 animate-spin text-sky-500" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <Stat icon={Activity} label={t("Interactions", "Interacciones")} value={m.total_interactions ?? 0} color="sky" />
            <Stat icon={Zap} label={t("Sessions", "Sesiones")} value={m.total_sessions ?? 0} color="violet" />
            <Stat icon={CheckCircle2} label={t("Executed", "Ejecutados")} value={m.executed_commands ?? 0} color="green" />
            <Stat icon={ShieldAlert} label={t("Critical", "Críticos")} value={m.critical_actions_requested ?? 0} color="amber" />
            <Stat icon={TrendingUp} label={t("Success Rate", "Tasa de Éxito")} value={`${m.success_rate ?? 0}%`}
              sub={`${m.action_success_ok ?? 0}/${m.action_success_total ?? 0}`} color="green" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white border border-slate-200 rounded-2xl p-5">
              <h3 className="text-sm font-semibold text-slate-800 mb-4 flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-sky-500" />
                {t("Daily Activity", "Actividad Diaria")}
              </h3>
              <DailySummaryChart data={m.daily_summaries} t={t} />
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-5">
              <h3 className="text-sm font-semibold text-slate-800 mb-4 flex items-center gap-2">
                <Zap className="h-4 w-4 text-sky-500" />
                {t("Action Breakdown", "Desglose de Acciones")}
              </h3>
              <ActionBreakdownTable data={m.action_breakdown} t={t} />
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-5">
            <h3 className="text-sm font-semibold text-slate-800 mb-4 flex items-center gap-2">
              <Clock className="h-4 w-4 text-sky-500" />
              {t("Recent Activity", "Actividad Reciente")}
            </h3>
            <RecentLogsList logs={m.recent_logs} t={t} />
          </div>
        </>
      )}
    </div>
  );
}
