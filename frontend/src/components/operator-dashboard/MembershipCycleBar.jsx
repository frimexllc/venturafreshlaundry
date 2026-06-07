/**
 * MembershipCycleBar.jsx
 * Barra de consumo de membresía — dinámica, se ajusta al plan real de la DB.
 * 
 * USO:
 *   import MembershipCycleBar from "../components/MembershipCycleBar";
 *   <MembershipCycleBar customerId={customer.id} compact={false} />
 * 
 * O con datos ya cargados:
 *   <MembershipCycleBar usage={cycleUsageObject} compact={false} />
 */

import { useEffect, useState, useCallback } from "react";
import axios from "axios";
import { RefreshCw, Award, TrendingUp, Calendar, AlertCircle } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// ── Colores según % de uso ────────────────────────────────────────────────────
function getBarColor(pct) {
  if (pct >= 100) return { bar: "#dc2626", bg: "#fee2e2", text: "#991b1b", label: "Exhausted" };
  if (pct >= 85)  return { bar: "#f59e0b", bg: "#fef3c7", text: "#92400e", label: "Almost full" };
  if (pct >= 60)  return { bar: "#3b82f6", bg: "#dbeafe", text: "#1e40af", label: "Good" };
  return { bar: "#10b981", bg: "#d1fae5", text: "#065f46", label: "Healthy" };
}

// ── Formato legible de fecha ──────────────────────────────────────────────────
function fmtDate(str) {
  if (!str) return "";
  try {
    const d = new Date(str);
    if (isNaN(d.getTime())) return str;
    return d.toLocaleDateString("en-US", {
      month: "short", day: "numeric",
    });
  } catch { return str; }
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function MembershipCycleBar({
  // Opción A: pasar usage ya cargado
  usage: usageProp = null,
  // Opción B: pasar customerId y el componente lo carga
  customerId = null,
  // UI
  compact = false,
  showPlanDetails = true,
  className = "",
  onUsageLoaded = null,   // callback opcional (usage) => void
  onRefresh = null,       // callback para refrescar desde padre
}) {
  const [usage, setUsage] = useState(usageProp);
  const [loading, setLoading] = useState(!usageProp && !!customerId);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchUsage = useCallback(async () => {
    if (!customerId && !usageProp) return;
    
    // Si ya tenemos usageProp y no estamos forzando refresh, no hacer nada
    if (usageProp && !refreshing) {
      setUsage(usageProp);
      return;
    }
    
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem("customer_token");
      if (!token) throw new Error("No token");
      
      const response = await axios.get(`${API}/customer/membership-usage`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      const data = response.data;
      setUsage(data);
      onUsageLoaded?.(data);
    } catch (err) {
      console.error("Error fetching membership usage:", err);
      setError(err.response?.data?.detail || err.message || "Could not load membership data");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [customerId, usageProp, refreshing, onUsageLoaded]);

  useEffect(() => {
    if (usageProp) {
      setUsage(usageProp);
      setLoading(false);
      return;
    }
    if (customerId) {
      fetchUsage();
    }
  }, [customerId, usageProp, fetchUsage]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchUsage();
    onRefresh?.();
  };

  // ── Loading skeleton ──────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className={`animate-pulse rounded-xl bg-slate-100 p-4 ${className}`}>
        <div className="h-4 bg-slate-200 rounded w-1/3 mb-3" />
        <div className="h-8 bg-slate-200 rounded w-full mb-2" />
        <div className="h-3 bg-slate-200 rounded w-2/3" />
      </div>
    );
  }

  // ── Error state ───────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className={`rounded-xl border border-amber-200 bg-amber-50 p-4 ${className}`}>
        <div className="flex items-center gap-2 text-amber-700">
          <AlertCircle className="w-4 h-4" />
          <span className="text-xs font-medium">Could not load membership data</span>
          <button onClick={handleRefresh} className="ml-auto text-amber-600 hover:text-amber-800">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  }

  // ── No active membership ──────────────────────────────────────────────────
  if (!usage || !usage.has_membership || !usage.lbs_allowance) {
    return null;
  }

  const {
    plan,
    lbs_allowance,
    lbs_used,
    lbs_remaining,
    pct_used,
    cycle_start,
    cycle_end,
    plan_price,
    plan_features = [],
  } = usage;

  const pct = Math.min(pct_used ?? 0, 100);
  const col = getBarColor(pct);
  const full = pct >= 100;

  // ── COMPACT (para header / sidebar) ──────────────────────────────────────
  if (compact) {
    return (
      <div className={`${className}`}>
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-semibold text-slate-600 truncate">
            {plan || "Membership"}
          </span>
          <span
            className="text-xs font-bold ml-2 whitespace-nowrap"
            style={{ color: col.text }}
          >
            {lbs_remaining} lbs left
          </span>
        </div>
        <div className="h-2 rounded-full bg-slate-200 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{ width: `${pct}%`, background: col.bar }}
          />
        </div>
        <div className="text-[10px] text-slate-400 mt-1 flex justify-between">
          <span>{fmtDate(cycle_start)} – {fmtDate(cycle_end)}</span>
          <button onClick={handleRefresh} className="hover:text-sky-500">
            <RefreshCw className="w-3 h-3" />
          </button>
        </div>
      </div>
    );
  }

  // ── FULL (para AccountPage / dashboard) ──────────────────────────────────
  return (
    <div
      className={`rounded-2xl border p-5 ${className}`}
      style={{ borderColor: col.bar + "40", background: col.bg + "60" }}
    >
      {/* Header con botón refresh */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-0.5">
            Membership Cycle
          </p>
          <h3 className="text-base font-bold text-slate-900">{plan || "Active Plan"}</h3>
          {plan_price && (
            <p className="text-xs text-slate-400 mt-0.5">{plan_price}</p>
          )}
        </div>
        <div className="text-right flex-shrink-0">
          <p
            className="text-2xl font-black leading-none"
            style={{ color: col.text }}
          >
            {lbs_remaining}
          </p>
          <p className="text-xs text-slate-500 mt-0.5">lbs remaining</p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mb-3">
        <div className="flex justify-between text-xs text-slate-500 mb-1.5">
          <span>{lbs_used} lbs used</span>
          <span>{lbs_allowance} lbs total</span>
        </div>
        <div className="h-3 rounded-full bg-white/70 border border-slate-200 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700 ease-out"
            style={{ width: `${pct}%`, background: col.bar }}
          />
        </div>
        <div className="flex justify-between text-xs mt-1">
          <span style={{ color: col.text }} className="font-semibold">
            {pct.toFixed(0)}% used - {col.label}
          </span>
          {full && (
            <span className="text-red-600 font-bold">Allowance exhausted</span>
          )}
        </div>
      </div>

      {/* Cycle dates */}
      <div className="flex items-center justify-between text-xs text-slate-500 bg-white/50 rounded-lg px-3 py-2 mb-3">
        <span className="flex items-center gap-1">
          <Calendar className="w-3.5 h-3.5" />
          Cycle:{" "}
          <strong className="text-slate-700">
            {fmtDate(cycle_start)} – {fmtDate(cycle_end)}
          </strong>
        </span>
        <span className="font-semibold" style={{ color: col.text }}>
          {full
            ? "Extra lbs at regular rate"
            : `${lbs_remaining} lbs covered`}
        </span>
      </div>

      {/* Plan features */}
      {showPlanDetails && plan_features.length > 0 && (
        <ul className="space-y-1 mt-3 border-t border-slate-200/60 pt-3">
          {plan_features.slice(0, 4).map((f, i) => (
            <li key={i} className="flex items-center gap-2 text-xs text-slate-600">
              <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: col.bar }} />
              {f}
            </li>
          ))}
        </ul>
      )}

      {/* Warning messages */}
      {!full && pct >= 80 && (
        <div className="mt-3 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          ⚠️ You've used {pct.toFixed(0)}% of your monthly allowance.
          Extra lbs will be charged at the regular rate.
        </div>
      )}
      {full && (
        <div className="mt-3 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          🔴 Monthly allowance exhausted. Additional lbs billed at regular rate.
        </div>
      )}

      {/* Refresh button at bottom */}
      <div className="mt-3 flex justify-end">
        <button
          onClick={handleRefresh}
          className="text-slate-400 hover:text-sky-500 transition-colors p-1"
          title="Refresh usage data"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}