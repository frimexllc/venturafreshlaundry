import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import OperatorAgent from "../components/operator-agent/OperatorAgent";
import { Button } from "../components/ui/button";
import { useLocale } from "../context/LocaleContext";

const API_URL = process.env.REACT_APP_BACKEND_URL;

export default function OperatorAgentPage() {
  const { t } = useLocale();
  const [dashboard, setDashboard] = useState(null);
  const [storeOrders, setStoreOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [dashboardRes, storeRes] = await Promise.all([
        fetch(`${API_URL}/api/automation/operator-dashboard`),
        fetch(`${API_URL}/api/store/orders`)
      ]);

      if (dashboardRes.ok) {
        const dashboardData = await dashboardRes.json();
        setDashboard(dashboardData);
      }

      if (storeRes.ok) {
        const storeData = await storeRes.json();
        setStoreOrders(Array.isArray(storeData) ? storeData : []);
      }
    } catch (error) {
      console.error("Failed loading operator agent context:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  return (
    <div className="space-y-4" data-testid="operator-agent-page">
      <div className="bg-white border border-slate-200 rounded-2xl p-4 md:p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-slate-900" data-testid="operator-agent-page-title">
            {t("Operator Voice Agent", "Agente de Voz Operativo")}
          </h1>
          <p className="text-sm text-slate-600 mt-1" data-testid="operator-agent-page-description">
            {t(
              "Reusable AI + voice workspace for operations, alerts, checklists and command execution.",
              "Espacio reutilizable de IA + voz para operación, alertas, checklists y ejecución de comandos."
            )}
          </p>
        </div>
        <Button onClick={loadData} variant="outline" className="gap-2" data-testid="operator-agent-refresh-button" disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          {t("Refresh context", "Actualizar contexto")}
        </Button>
      </div>

      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4" data-testid="operator-agent-metrics-container">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          <div className="rounded-xl bg-white border border-slate-200 p-3" data-testid="operator-agent-metric-pickups">
            <p className="text-slate-500">{t("Pickups", "Pickups")}</p>
            <p className="text-lg font-semibold text-slate-900">{dashboard?.stats?.pickups_remaining_today ?? 0}</p>
          </div>
          <div className="rounded-xl bg-white border border-slate-200 p-3" data-testid="operator-agent-metric-processing">
            <p className="text-slate-500">{t("Processing", "Procesando")}</p>
            <p className="text-lg font-semibold text-slate-900">{dashboard?.stats?.orders_in_processing ?? 0}</p>
          </div>
          <div className="rounded-xl bg-white border border-slate-200 p-3" data-testid="operator-agent-metric-ready">
            <p className="text-slate-500">{t("Ready", "Listas")}</p>
            <p className="text-lg font-semibold text-slate-900">{dashboard?.stats?.orders_ready ?? 0}</p>
          </div>
          <div className="rounded-xl bg-white border border-slate-200 p-3" data-testid="operator-agent-metric-store-orders">
            <p className="text-slate-500">{t("Store orders", "Órdenes tienda")}</p>
            <p className="text-lg font-semibold text-slate-900">{storeOrders.length}</p>
          </div>
        </div>
      </div>

      <OperatorAgent dashboard={dashboard} storeOrders={storeOrders} apiBaseUrl={API_URL} />
    </div>
  );
}
