import { useState, useEffect } from "react";
import { useLocale } from "../context/LocaleContext";
import {
  Bell, CheckCircle2, XCircle, Clock, Mail, MessageCircle,
  Smartphone, RefreshCw, BarChart3, AlertCircle,
} from "lucide-react";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { toast } from "sonner";

const API = process.env.REACT_APP_BACKEND_URL;
const h = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${localStorage.getItem("token")}`,
});

const CHANNEL_ICONS = {
  sms: Smartphone,
  whatsapp: MessageCircle,
  email: Mail,
  voice: Bell,
};
const CHANNEL_COLORS = {
  sms: "bg-sky-50 text-sky-600",
  whatsapp: "bg-emerald-50 text-emerald-600",
  email: "bg-violet-50 text-violet-600",
  voice: "bg-amber-50 text-amber-600",
};

function ChannelCard({ channel, data, t }) {
  const Icon = CHANNEL_ICONS[channel] || Bell;
  const color = CHANNEL_COLORS[channel] || "bg-slate-50 text-slate-600";
  const rate = data.total > 0 ? Math.round((data.sent / data.total) * 100) : 0;

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4" data-testid={`notif-channel-${channel}`}>
      <div className="flex items-center gap-3 mb-3">
        <div className={`p-2 rounded-lg ${color}`}><Icon className="w-5 h-5" /></div>
        <div>
          <p className="font-semibold text-slate-800 text-sm capitalize">{channel}</p>
          <p className="text-xs text-slate-400">{data.total} {t("total", "total")}</p>
        </div>
        <span className="ml-auto text-lg font-bold text-slate-900">{rate}%</span>
      </div>
      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
        <div className="h-full bg-emerald-500 rounded-full transition-all duration-700" style={{ width: `${rate}%` }} />
      </div>
      <div className="flex gap-3 mt-2 text-xs">
        <span className="text-emerald-600">{data.sent} {t("sent", "enviados")}</span>
        <span className="text-red-500">{data.failed} {t("failed", "fallidos")}</span>
        {data.other > 0 && <span className="text-slate-400">{data.other} {t("other", "otros")}</span>}
      </div>
    </div>
  );
}

export default function NotificationMetricsPage() {
  const { t } = useLocale();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    fetch(`${API}/api/notification-metrics?days=30`, { headers: h() })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(setData)
      .catch(() => toast.error(t("Failed to load metrics", "Error al cargar metricas")))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <RefreshCw className="w-6 h-6 animate-spin text-sky-500" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-6 text-center text-slate-500">
        {t("No notification data available", "Sin datos de notificaciones")}
      </div>
    );
  }

  const { total, sent, failed, duplicate_skipped, queued_quiet_hours, success_rate, by_channel, by_event, recent } = data;
  const channelEntries = Object.entries(by_channel);
  const eventEntries = Object.entries(by_event).sort((a, b) => b[1].total - a[1].total);

  return (
    <div className="space-y-6 p-1" data-testid="notification-metrics-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {t("Notification Metrics", "Metricas de Notificaciones")}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {t("SMS, WhatsApp & Email performance", "Rendimiento de SMS, WhatsApp y Email")}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} data-testid="notif-refresh-btn">
          <RefreshCw className="w-4 h-4 mr-1.5" /> {t("Refresh", "Actualizar")}
        </Button>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: t("Total", "Total"), value: total, icon: Bell, color: "bg-slate-50 text-slate-600" },
          { label: t("Sent", "Enviados"), value: sent, icon: CheckCircle2, color: "bg-emerald-50 text-emerald-600" },
          { label: t("Failed", "Fallidos"), value: failed, icon: XCircle, color: "bg-red-50 text-red-600" },
          { label: t("Duplicates", "Duplicados"), value: duplicate_skipped, icon: AlertCircle, color: "bg-amber-50 text-amber-600" },
          { label: t("Success Rate", "Tasa Exito"), value: `${success_rate}%`, icon: BarChart3, color: "bg-sky-50 text-sky-600" },
        ].map((s, i) => (
          <div key={i} className="bg-white rounded-xl border border-slate-200 p-3 flex items-center gap-3" data-testid={`notif-stat-${i}`}>
            <div className={`p-2 rounded-lg ${s.color}`}><s.icon className="w-4 h-4" /></div>
            <div>
              <p className="text-lg font-bold text-slate-900">{s.value}</p>
              <p className="text-xs text-slate-400">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Channel breakdown */}
      {channelEntries.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-slate-600 mb-3">
            {t("By Channel", "Por Canal")}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {channelEntries.map(([ch, d]) => (
              <ChannelCard key={ch} channel={ch} data={d} t={t} />
            ))}
          </div>
        </div>
      )}

      {/* Event breakdown */}
      {eventEntries.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-5" data-testid="notif-by-event">
          <h2 className="font-semibold text-slate-800 mb-4 text-sm flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-slate-500" />
            {t("By Event Type", "Por Tipo de Evento")}
          </h2>
          <div className="space-y-2.5">
            {eventEntries.map(([event, d]) => {
              const rate = d.total > 0 ? Math.round((d.sent / d.total) * 100) : 0;
              return (
                <div key={event} className="flex items-center gap-3 text-sm">
                  <span className="text-slate-600 font-medium min-w-[180px] truncate">{event.replace(/_/g, " ")}</span>
                  <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${rate}%` }} />
                  </div>
                  <span className="text-xs text-slate-500 shrink-0 w-20 text-right">
                    {d.sent}/{d.total} ({rate}%)
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Recent notifications */}
      <div className="bg-white rounded-xl border border-slate-200 p-5" data-testid="notif-recent">
        <h2 className="font-semibold text-slate-800 mb-4 text-sm flex items-center gap-2">
          <Clock className="w-4 h-4 text-slate-500" />
          {t("Recent Notifications", "Notificaciones Recientes")}
        </h2>
        {recent.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-6">
            {t("No notifications recorded yet", "Sin notificaciones registradas")}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 uppercase tracking-wide">
                  <th className="pb-2 pr-3 text-left">{t("Channel", "Canal")}</th>
                  <th className="pb-2 pr-3 text-left">{t("Event", "Evento")}</th>
                  <th className="pb-2 pr-3 text-left">{t("Status", "Estado")}</th>
                  <th className="pb-2 pr-3 text-left">{t("To", "Para")}</th>
                  <th className="pb-2 text-left">{t("Time", "Hora")}</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((r, i) => (
                  <tr key={i} className="border-b border-slate-50 hover:bg-slate-50/50">
                    <td className="py-2 pr-3">
                      <Badge variant="outline" className="text-[10px] capitalize">{r.channel || "—"}</Badge>
                    </td>
                    <td className="py-2 pr-3 text-slate-600">{(r.event || "—").replace(/_/g, " ")}</td>
                    <td className="py-2 pr-3">
                      {r.status === "sent" ? (
                        <Badge className="bg-emerald-100 text-emerald-700 text-[10px]">{t("Sent", "Enviado")}</Badge>
                      ) : r.status === "failed" ? (
                        <Badge className="bg-red-100 text-red-700 text-[10px]">{t("Failed", "Fallido")}</Badge>
                      ) : (
                        <Badge className="bg-slate-100 text-slate-600 text-[10px]">{r.status || "—"}</Badge>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-slate-500 truncate max-w-[120px]">{r.to || r.phone || r.email || "—"}</td>
                    <td className="py-2 text-slate-400">
                      {r.timestamp ? new Date(r.timestamp).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" }) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Empty state hint */}
      {total === 0 && (
        <div className="bg-sky-50 border border-sky-100 rounded-xl p-5 text-center">
          <Bell className="w-8 h-8 text-sky-400 mx-auto mb-2" />
          <p className="text-sm text-sky-700 font-medium">
            {t("No notifications sent yet. As orders are created and statuses change, notification metrics will appear here.",
              "Sin notificaciones aun. A medida que se creen ordenes y cambien estados, las metricas aparecerán aqui.")}
          </p>
        </div>
      )}
    </div>
  );
}
