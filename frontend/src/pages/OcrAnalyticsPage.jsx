import { useState, useEffect } from "react";
import { useLocale } from "../context/LocaleContext";
import {
  ScanLine, CheckCircle2, XCircle, DollarSign, TrendingUp,
  Store, Calendar, FileText, RefreshCw, BarChart3,
} from "lucide-react";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { toast } from "sonner";

const API = process.env.REACT_APP_BACKEND_URL;
const h = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${localStorage.getItem("token")}`,
});

function StatCard({ icon: Icon, label, value, sub, color }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 flex items-start gap-4" data-testid={`ocr-stat-${label.toLowerCase().replace(/\s/g, '-')}`}>
      <div className={`p-2.5 rounded-lg ${color}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">{label}</p>
        <p className="text-2xl font-bold text-slate-900 mt-0.5">{value}</p>
        {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
      </div>
    </div>
  );
}

function RateBar({ label, pct, color }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="text-slate-600 font-medium">{label}</span>
        <span className="font-bold text-slate-800">{pct}%</span>
      </div>
      <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-700 ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function OcrAnalyticsPage() {
  const { t } = useLocale();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    fetch(`${API}/api/files/ocr-analytics`, { headers: h() })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setData)
      .catch(() => toast.error(t("Failed to load OCR analytics", "Error al cargar analytics OCR")))
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
        {t("No OCR data available", "Sin datos OCR disponibles")}
      </div>
    );
  }

  const { total_scans, successful, failed, success_rate, field_rates, total_amount_captured, recent_scans, top_vendors } = data;

  return (
    <div className="space-y-6 p-1" data-testid="ocr-analytics-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {t("OCR Analytics", "Analytics OCR")}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {t("Receipt scanning performance & ROI", "Rendimiento de escaneo de recibos y ROI")}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} data-testid="ocr-refresh-btn">
          <RefreshCw className="w-4 h-4 mr-1.5" />
          {t("Refresh", "Actualizar")}
        </Button>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={ScanLine} label={t("Total Scans", "Total Escaneos")} value={total_scans} color="bg-sky-50 text-sky-600" />
        <StatCard icon={CheckCircle2} label={t("Successful", "Exitosos")} value={successful} sub={`${success_rate}% ${t("success rate", "tasa de exito")}`} color="bg-emerald-50 text-emerald-600" />
        <StatCard icon={XCircle} label={t("Failed", "Fallidos")} value={failed} color="bg-red-50 text-red-600" />
        <StatCard icon={DollarSign} label={t("Total Captured", "Total Capturado")} value={`$${total_amount_captured.toLocaleString("en-US", { minimumFractionDigits: 2 })}`} color="bg-amber-50 text-amber-600" />
      </div>

      {/* Field Extraction Rates + Top Vendors */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Field Rates */}
        <div className="bg-white rounded-xl border border-slate-200 p-5" data-testid="ocr-field-rates">
          <div className="flex items-center gap-2 mb-5">
            <BarChart3 className="w-5 h-5 text-slate-600" />
            <h2 className="font-semibold text-slate-800">
              {t("Field Extraction Accuracy", "Precision de Extraccion")}
            </h2>
          </div>
          <div className="space-y-4">
            <RateBar label={t("Amount", "Monto")} pct={field_rates.amount} color="bg-emerald-500" />
            <RateBar label={t("Vendor", "Proveedor")} pct={field_rates.vendor} color="bg-sky-500" />
            <RateBar label={t("Date", "Fecha")} pct={field_rates.date} color="bg-amber-500" />
          </div>
          {total_scans === 0 && (
            <p className="text-xs text-slate-400 mt-4 text-center">
              {t("No scans yet — upload a receipt in Finances to start tracking", "Sin escaneos aun — sube un recibo en Finanzas para comenzar")}
            </p>
          )}
        </div>

        {/* Top Vendors */}
        <div className="bg-white rounded-xl border border-slate-200 p-5" data-testid="ocr-top-vendors">
          <div className="flex items-center gap-2 mb-5">
            <Store className="w-5 h-5 text-slate-600" />
            <h2 className="font-semibold text-slate-800">
              {t("Top Vendors", "Proveedores Principales")}
            </h2>
          </div>
          {top_vendors.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-6">
              {t("No vendor data yet", "Sin datos de proveedores")}
            </p>
          ) : (
            <div className="space-y-3">
              {top_vendors.map((v, i) => (
                <div key={i} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
                  <div className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-full bg-slate-100 text-slate-600 text-xs font-bold flex items-center justify-center">{i + 1}</span>
                    <span className="font-medium text-slate-700 text-sm">{v.vendor}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant="outline" className="text-xs">{v.count} {t("scans", "escaneos")}</Badge>
                    <span className="font-semibold text-slate-800 text-sm">${v.total.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent Scans */}
      <div className="bg-white rounded-xl border border-slate-200 p-5" data-testid="ocr-recent-scans">
        <div className="flex items-center gap-2 mb-4">
          <FileText className="w-5 h-5 text-slate-600" />
          <h2 className="font-semibold text-slate-800">
            {t("Recent Scans", "Escaneos Recientes")}
          </h2>
        </div>
        {recent_scans.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-8">
            {t("No scans recorded yet", "Sin escaneos registrados")}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs text-slate-500 uppercase tracking-wide">
                  <th className="pb-2 pr-4">{t("File", "Archivo")}</th>
                  <th className="pb-2 pr-4">{t("Status", "Estado")}</th>
                  <th className="pb-2 pr-4">{t("Amount", "Monto")}</th>
                  <th className="pb-2 pr-4">{t("Vendor", "Proveedor")}</th>
                  <th className="pb-2 pr-4">{t("Date", "Fecha")}</th>
                  <th className="pb-2">{t("Scanned At", "Escaneado")}</th>
                </tr>
              </thead>
              <tbody>
                {recent_scans.map((s) => (
                  <tr key={s.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                    <td className="py-2.5 pr-4 font-medium text-slate-700 max-w-[180px] truncate">{s.filename || "—"}</td>
                    <td className="py-2.5 pr-4">
                      {s.status === "success" ? (
                        <Badge className="bg-emerald-100 text-emerald-700 text-xs">{t("Success", "Exitoso")}</Badge>
                      ) : (
                        <Badge className="bg-red-100 text-red-700 text-xs">{t("Error", "Error")}</Badge>
                      )}
                    </td>
                    <td className="py-2.5 pr-4 font-semibold text-slate-800">
                      {s.result?.amount ? `$${s.result.amount.toFixed(2)}` : "—"}
                    </td>
                    <td className="py-2.5 pr-4 text-slate-600">{s.result?.vendor || "—"}</td>
                    <td className="py-2.5 pr-4 text-slate-600">{s.result?.date || "—"}</td>
                    <td className="py-2.5 text-slate-400 text-xs">
                      {s.created_at ? new Date(s.created_at).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" }) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
