import { useState, useEffect } from "react";
import { useLocale } from "../context/LocaleContext";
import {
  RefreshCw, ArrowUpRight, ArrowDownLeft, Users, Package,
  CheckCircle2, XCircle, AlertCircle, History, Zap,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { toast } from "sonner";

const API = process.env.REACT_APP_BACKEND_URL;
const h = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${localStorage.getItem("token")}`,
});

function SyncCard({ title, icon: Icon, description, onRun, onDryRun, loading, result }) {
  const { t } = useLocale();
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5" data-testid={`sync-card-${title.toLowerCase().replace(/\s/g, '-')}`}>
      <div className="flex items-start gap-3 mb-4">
        <div className="p-2 rounded-lg bg-violet-50 text-violet-600"><Icon className="w-5 h-5" /></div>
        <div>
          <h3 className="font-semibold text-slate-800 text-sm">{title}</h3>
          <p className="text-xs text-slate-400 mt-0.5">{description}</p>
        </div>
      </div>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" className="text-xs" onClick={onDryRun} disabled={loading} data-testid={`sync-dry-${title.toLowerCase().replace(/\s/g, '-')}`}>
          {t("Preview", "Vista previa")}
        </Button>
        <Button size="sm" className="text-xs bg-violet-600 hover:bg-violet-700" onClick={onRun} disabled={loading} data-testid={`sync-run-${title.toLowerCase().replace(/\s/g, '-')}`}>
          {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin mr-1" /> : null}
          {t("Sync Now", "Sincronizar")}
        </Button>
      </div>
      {result && (
        <div className="mt-3 bg-slate-50 rounded-lg p-3 text-xs space-y-1" data-testid={`sync-result-${title.toLowerCase().replace(/\s/g, '-')}`}>
          {result.dry_run && <Badge className="bg-amber-100 text-amber-700 text-[10px] mb-1">{t("DRY RUN", "SIMULACION")}</Badge>}
          <div className="flex gap-3">
            <span className="text-emerald-600 font-semibold"><CheckCircle2 className="w-3 h-3 inline mr-0.5" />{result.created || 0} {t("created", "creados")}</span>
            <span className="text-sky-600 font-semibold"><RefreshCw className="w-3 h-3 inline mr-0.5" />{result.updated || 0} {t("updated", "actualizados")}</span>
            {result.errors > 0 && <span className="text-red-600 font-semibold"><XCircle className="w-3 h-3 inline mr-0.5" />{result.errors} {t("errors", "errores")}</span>}
            {result.skipped > 0 && <span className="text-slate-400">{result.skipped} {t("skipped", "omitidos")}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

export default function StripeSyncPage() {
  const { t } = useLocale();
  const [status, setStatus] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState({});
  const [results, setResults] = useState({});
  const [fullSyncLoading, setFullSyncLoading] = useState(false);

  const load = () => {
    fetch(`${API}/api/stripe-sync/status`, { headers: h() })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(setStatus)
      .catch(() => {});
    fetch(`${API}/api/stripe-sync/history?limit=10`, { headers: h() })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(setHistory)
      .catch(() => {});
  };

  useEffect(load, []);

  const runSync = async (endpoint, key, dryRun = false) => {
    setLoading(p => ({ ...p, [key]: true }));
    try {
      const res = await fetch(`${API}/api/stripe-sync/${endpoint}`, {
        method: "POST",
        headers: h(),
        body: JSON.stringify({ dry_run: dryRun, limit: 100 }),
      });
      if (res.ok) {
        const data = await res.json();
        setResults(p => ({ ...p, [key]: data }));
        toast.success(dryRun ? t("Preview complete", "Vista previa completa") : t("Sync complete", "Sincronizacion completa"));
        if (!dryRun) load();
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.detail || t("Sync failed", "Fallo la sincronizacion"));
      }
    } catch {
      toast.error(t("Connection error", "Error de conexion"));
    } finally {
      setLoading(p => ({ ...p, [key]: false }));
    }
  };

  const runFullSync = async () => {
    setFullSyncLoading(true);
    try {
      const res = await fetch(`${API}/api/stripe-sync/full`, {
        method: "POST",
        headers: h(),
        body: JSON.stringify({ dry_run: false, limit: 100 }),
      });
      if (res.ok) {
        const data = await res.json();
        setResults({
          push_customers: data.push_customers,
          push_products: data.push_products,
          pull_customers: data.pull_customers,
          pull_products: data.pull_products,
        });
        toast.success(t("Full sync complete!", "Sincronizacion completa!"));
        load();
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.detail || t("Sync failed", "Fallo la sincronizacion"));
      }
    } catch {
      toast.error(t("Connection error", "Error de conexion"));
    } finally {
      setFullSyncLoading(false);
    }
  };

  return (
    <div className="space-y-6 p-1" data-testid="stripe-sync-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {t("Stripe Sync", "Sincronizacion Stripe")}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {t("Bidirectional sync: Customers & Products", "Sincronizacion bidireccional: Clientes y Productos")}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load}>
            <RefreshCw className="w-4 h-4 mr-1.5" /> {t("Refresh", "Actualizar")}
          </Button>
          <Button size="sm" className="bg-violet-600 hover:bg-violet-700" onClick={runFullSync} disabled={fullSyncLoading} data-testid="stripe-full-sync-btn">
            {fullSyncLoading ? <RefreshCw className="w-4 h-4 animate-spin mr-1.5" /> : <Zap className="w-4 h-4 mr-1.5" />}
            {t("Full Sync", "Sincronizar Todo")}
          </Button>
        </div>
      </div>

      {/* Status */}
      {status && (
        <div className="flex items-center gap-3 bg-white rounded-xl border border-slate-200 p-4" data-testid="stripe-sync-status">
          <div className={`w-3 h-3 rounded-full ${status.enabled ? "bg-emerald-500" : "bg-red-500"}`} />
          <span className="text-sm font-medium text-slate-700">
            Stripe: {status.enabled ? t("Connected", "Conectado") : t("Not configured", "No configurado")}
          </span>
          {status.last_sync && (
            <span className="text-xs text-slate-400 ml-auto">
              {t("Last sync", "Ultima sync")}: {new Date(status.last_sync.timestamp).toLocaleString("es-MX")}
            </span>
          )}
        </div>
      )}

      {/* Push cards */}
      <div>
        <h2 className="text-sm font-semibold text-slate-600 mb-3 flex items-center gap-1.5">
          <ArrowUpRight className="w-4 h-4 text-violet-500" /> {t("Push: App → Stripe", "Push: App → Stripe")}
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <SyncCard
            title={t("Push Customers", "Push Clientes")}
            icon={Users}
            description={t("Create/update Stripe customers from app data", "Crear/actualizar clientes Stripe desde la app")}
            onRun={() => runSync("push/customers", "push_customers")}
            onDryRun={() => runSync("push/customers", "push_customers", true)}
            loading={loading.push_customers}
            result={results.push_customers}
          />
          <SyncCard
            title={t("Push Products", "Push Productos")}
            icon={Package}
            description={t("Sync services as Stripe products with prices", "Sincronizar servicios como productos Stripe con precios")}
            onRun={() => runSync("push/products", "push_products")}
            onDryRun={() => runSync("push/products", "push_products", true)}
            loading={loading.push_products}
            result={results.push_products}
          />
        </div>
      </div>

      {/* Pull cards */}
      <div>
        <h2 className="text-sm font-semibold text-slate-600 mb-3 flex items-center gap-1.5">
          <ArrowDownLeft className="w-4 h-4 text-sky-500" /> {t("Pull: Stripe → App", "Pull: Stripe → App")}
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <SyncCard
            title={t("Pull Customers", "Pull Clientes")}
            icon={Users}
            description={t("Import Stripe customers into app database", "Importar clientes Stripe a la base de datos")}
            onRun={() => runSync("pull/customers", "pull_customers")}
            onDryRun={() => runSync("pull/customers", "pull_customers", true)}
            loading={loading.pull_customers}
            result={results.pull_customers}
          />
          <SyncCard
            title={t("Pull Products", "Pull Productos")}
            icon={Package}
            description={t("Import Stripe products/prices into app", "Importar productos/precios Stripe a la app")}
            onRun={() => runSync("pull/products", "pull_products")}
            onDryRun={() => runSync("pull/products", "pull_products", true)}
            loading={loading.pull_products}
            result={results.pull_products}
          />
        </div>
      </div>

      {/* History */}
      {history.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-5" data-testid="stripe-sync-history">
          <h2 className="font-semibold text-slate-800 flex items-center gap-2 mb-4 text-sm">
            <History className="w-4 h-4 text-slate-500" /> {t("Sync History", "Historial de Sync")}
          </h2>
          <div className="space-y-2">
            {history.map((log, i) => (
              <div key={log.id || i} className="flex items-center gap-3 text-xs border-b border-slate-50 pb-2 last:border-0">
                <Badge variant="outline" className="text-[10px] shrink-0">{log.action}</Badge>
                <span className="text-slate-600 font-medium">{log.entity}</span>
                <span className="text-slate-400 ml-auto">{new Date(log.timestamp).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" })}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
