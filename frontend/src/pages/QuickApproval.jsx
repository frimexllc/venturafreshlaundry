import { useCallback, useEffect, useState } from "react";
import { ShieldCheck, ShieldX, Clock, RefreshCw, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Button } from "../components/ui/button";
import { useLocale } from "../context/LocaleContext";
import { toast } from "sonner";

const API_URL = process.env.REACT_APP_BACKEND_URL;

function ActionBadge({ type }) {
  const colors = {
    update_order_status: "bg-sky-100 text-sky-700",
    register_payment: "bg-emerald-100 text-emerald-700",
    update_user_role: "bg-red-100 text-red-700",
    update_payment_status: "bg-amber-100 text-amber-700",
  };
  return (
    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${colors[type] || "bg-slate-100 text-slate-600"}`}>
      {type}
    </span>
  );
}

function PendingActionCard({ action, onApprove, onReject, approving, t }) {
  const criticals = action.critical_actions || [];
  const allActions = action.actions || [];
  const createdAt = action.created_at ? new Date(action.created_at).toLocaleString() : "";

  return (
    <div className="bg-white border border-amber-200 rounded-xl p-4 shadow-sm" data-testid={`pending-action-${action.id}`}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-amber-50 border border-amber-100">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-800">{t("Critical Action Pending", "Acción Crítica Pendiente")}</p>
            <p className="text-[11px] text-slate-400">{createdAt} &middot; Session: {action.session_id?.slice(0, 12)}…</p>
          </div>
        </div>
        <span className="text-[10px] bg-amber-50 text-amber-600 px-2 py-0.5 rounded-full border border-amber-100 font-medium">
          {t("Pending", "Pendiente")}
        </span>
      </div>

      <div className="space-y-2 mb-4">
        {allActions.map((act, i) => (
          <div key={i} className="bg-slate-50 rounded-lg p-3 border border-slate-100">
            <div className="flex items-center gap-2 mb-1">
              <ActionBadge type={act.type || act.action} />
              {criticals.some((c) => c.type === (act.type || act.action)) && (
                <span className="text-[9px] text-red-600 font-medium">{t("CRITICAL", "CRÍTICO")}</span>
              )}
            </div>
            {act.reason && <p className="text-xs text-slate-600 mt-1">{act.reason}</p>}
            {(act.payload || act.params) && (
              <pre className="text-[10px] text-slate-500 mt-1 bg-white rounded p-1.5 overflow-x-auto border border-slate-100">
                {JSON.stringify(act.payload || act.params, null, 2)}
              </pre>
            )}
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <Button
          size="sm"
          className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
          onClick={() => onApprove(action.id)}
          disabled={approving}
          data-testid={`approve-action-${action.id}`}
        >
          <ShieldCheck className="h-4 w-4 mr-1.5" />
          {t("Approve & Execute", "Aprobar y Ejecutar")}
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="flex-1 border-red-200 text-red-600 hover:bg-red-50"
          onClick={() => onReject(action.id)}
          disabled={approving}
          data-testid={`reject-action-${action.id}`}
        >
          <ShieldX className="h-4 w-4 mr-1.5" />
          {t("Reject", "Rechazar")}
        </Button>
      </div>
    </div>
  );
}

export default function QuickApproval() {
  const { t } = useLocale();
  const [actions, setActions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState(false);

  const loadPending = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_URL}/api/ai/pending-actions`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setActions(data.pending_actions || []);
    } catch {
      toast.error(t("Error loading pending actions", "Error cargando acciones pendientes"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { loadPending(); }, [loadPending]);

  const handleApprove = async (actionId) => {
    setApproving(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_URL}/api/ai/pending-actions/${actionId}/approve`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      toast.success(data.message || t("Action approved", "Acción aprobada"));
      await loadPending();
    } catch {
      toast.error(t("Error approving action", "Error aprobando acción"));
    } finally {
      setApproving(false);
    }
  };

  const handleReject = async (actionId) => {
    setApproving(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_URL}/api/ai/pending-actions/${actionId}/reject`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed");
      toast.success(t("Action rejected", "Acción rechazada"));
      await loadPending();
    } catch {
      toast.error(t("Error rejecting action", "Error rechazando acción"));
    } finally {
      setApproving(false);
    }
  };

  return (
    <div className="space-y-6" data-testid="quick-approval-page">
      <div className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-slate-900 flex items-center gap-2" data-testid="quick-approval-title">
            <ShieldCheck className="h-6 w-6 text-amber-500" />
            {t("Quick Approval", "Aprobación Rápida")}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {t("Review and approve or reject critical AI actions", "Revisa y aprueba o rechaza acciones críticas del AI")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {actions.length > 0 && (
            <span className="bg-amber-100 text-amber-700 text-xs font-semibold px-2.5 py-1 rounded-full" data-testid="pending-count-badge">
              {actions.length} {t("pending", "pendientes")}
            </span>
          )}
          <Button size="sm" variant="outline" onClick={loadPending} disabled={loading} data-testid="approval-refresh">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {loading && actions.length === 0 ? (
        <div className="flex justify-center py-12">
          <RefreshCw className="h-6 w-6 animate-spin text-sky-500" />
        </div>
      ) : actions.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center" data-testid="no-pending-actions">
          <CheckCircle2 className="h-10 w-10 text-emerald-400 mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-slate-800">{t("All clear!", "¡Todo limpio!")}</h3>
          <p className="text-sm text-slate-500 mt-1">{t("No pending actions to review", "No hay acciones pendientes para revisar")}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {actions.map((action) => (
            <PendingActionCard
              key={action.id}
              action={action}
              onApprove={handleApprove}
              onReject={handleReject}
              approving={approving}
              t={t}
            />
          ))}
        </div>
      )}
    </div>
  );
}
