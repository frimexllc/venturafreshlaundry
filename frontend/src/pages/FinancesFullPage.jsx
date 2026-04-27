import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useLocale } from "../context/LocaleContext";
import {
  Plus, Search, DollarSign, TrendingUp, TrendingDown,
  Car, Trash2, Edit, Receipt, Camera, Paperclip, X,
  Image as ImageIcon, AlertTriangle, ChevronDown, Wallet,
  RefreshCw, Eye, Filter, Check, ChevronLeft, ChevronRight
} from "lucide-react";
import { toast } from "sonner";

const API = process.env.REACT_APP_BACKEND_URL;
const getAuthHeaders = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${localStorage.getItem("token")}`,
});

// ─── Constants ────────────────────────────────────────────────────────────────
const TYPE_LABELS    = { fixed: "Fijo", variable: "Variable", subscription: "Suscripción" };
const TYPE_ICONS     = { fixed: "🏢", variable: "📦", subscription: "🔄" };
const PAYMENT_LABELS = { card: "Tarjeta", cash: "Efectivo", transfer: "Transferencia", check: "Cheque", zelle: "Zelle" };

const TYPE_ACCENT = {
  fixed:        { bar: "#f87171", iconBg: "#fef2f2", iconColor: "#ef4444", badgeBg: "#fef2f2", badgeColor: "#b91c1c" },
  variable:     { bar: "#38bdf8", iconBg: "#f0f9ff", iconColor: "#0ea5e9", badgeBg: "#f0f9ff", badgeColor: "#0369a1" },
  subscription: { bar: "#a78bfa", iconBg: "#f5f3ff", iconColor: "#8b5cf6", badgeBg: "#f5f3ff", badgeColor: "#6d28d9" },
};

const STAT_CFG = {
  revenue:  { g1: "#10b981", g2: "#14b8a6", label: "Ingresos",      trend: "up"   },
  expenses: { g1: "#f87171", g2: "#ef4444", label: "Gastos",        trend: "down" },
  net:      { g1: "#818cf8", g2: "#8b5cf6", label: "Utilidad Neta", trend: null   },
  mileage:  { g1: "#38bdf8", g2: "#06b6d4", label: "Millaje Total", trend: null   },
};

const emptyExpense = {
  date: new Date().toISOString().split("T")[0],
  category: "", description: "", amount: "",
  expense_type: "variable", vendor: "", payment_method: "card", notes: "",
};
const emptyMileage = { date: new Date().toISOString().split("T")[0], vehicle_id: "", driver_name: "", start_odometer: "", end_odometer: "", purpose: "" };
const emptyVehicle = { name: "", plate: "", make: "", model: "", year: "", status: "active" };

// ─── Formatters ───────────────────────────────────────────────────────────────
const formatCurrency = (n) =>
  new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", minimumFractionDigits: 0 }).format(n || 0);
const formatDate = (d) => {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
};

// ─── Shared styles ────────────────────────────────────────────────────────────
const inputSt = {
  width: "100%", border: "0.5px solid #e2e8f0", borderRadius: "10px",
  padding: "9px 12px", fontSize: "13px", color: "#0f172a",
  background: "#f8fafc", outline: "none", boxSizing: "border-box", fontFamily: "inherit",
};
const selectSt = { ...inputSt, cursor: "pointer", appearance: "none" };
const gradBtnSt = {
  display: "inline-flex", alignItems: "center", gap: "6px", padding: "9px 18px",
  borderRadius: "12px", border: "none", background: "linear-gradient(135deg,#0ea5e9,#6366f1)",
  color: "#fff", fontSize: "13px", fontWeight: 600, cursor: "pointer",
};
const iconBtnSt = {
  width: "30px", height: "30px", borderRadius: "8px", border: "0.5px solid #e2e8f0",
  background: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
  cursor: "pointer", color: "#94a3b8",
};
const iconSz = { width: "13px", height: "13px", pointerEvents: "none" };

// ─── Portal Modal Shell ───────────────────────────────────────────────────────
// ALL modals go through this — completely outside React tree of any other modal.
const PortalModal = ({ open, onClose, children, maxWidth = "480px", sheet = false }) => {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e) => {
      if (e.key === "Escape") { e.stopPropagation(); e.preventDefault(); onClose(); }
    };
    document.addEventListener("keydown", onKey, true);
    return () => { document.body.style.overflow = prev; document.removeEventListener("keydown", onKey, true); };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 9000,
        background: "rgba(0,0,0,0.45)",
        display: "flex",
        alignItems: sheet ? "flex-end" : "center",
        justifyContent: "center",
        padding: sheet ? 0 : "16px",
      }}
      onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          background: "#fff", width: "100%", maxWidth,
          borderRadius: sheet ? "20px 20px 0 0" : "20px",
          maxHeight: "90vh", overflowY: "auto",
          boxShadow: "0 20px 60px rgba(0,0,0,0.22)",
          animation: sheet ? "slideUp .22s ease" : "popIn .18s ease",
        }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <style>{`
          @keyframes popIn{from{opacity:0;transform:scale(.95)}to{opacity:1;transform:scale(1)}}
          @keyframes slideUp{from{opacity:0;transform:translateY(40px)}to{opacity:1;transform:translateY(0)}}
          @keyframes spin{to{transform:rotate(360deg)}}
          @keyframes fadeImg{from{opacity:0}to{opacity:1}}
        `}</style>
        {children}
      </div>
    </div>,
    document.body
  );
};

// ─── Lightbox ─────────────────────────────────────────────────────────────────
// Full-screen, zIndex 99000, intercepts ALL pointer events — nothing leaks through.
const Lightbox = ({ images, initialIndex = 0, onClose }) => {
  const [idx, setIdx] = useState(initialIndex);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e) => {
      e.stopPropagation(); e.preventDefault();
      if (e.key === "Escape")     onClose();
      if (e.key === "ArrowLeft")  setIdx(i => Math.max(0, i - 1));
      if (e.key === "ArrowRight") setIdx(i => Math.min(images.length - 1, i + 1));
    };
    document.addEventListener("keydown", onKey, true);
    return () => { document.body.style.overflow = prev; document.removeEventListener("keydown", onKey, true); };
  }, [onClose, images.length]);

  const stop = (e) => { e.stopPropagation(); e.preventDefault(); };

  return createPortal(
    <div
      style={{ position: "fixed", inset: 0, zIndex: 99000, background: "#000",
               display: "flex", flexDirection: "column" }}
      onClick={stop} onPointerDown={stop} onMouseDown={stop}
    >
      {/* Top bar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "14px 20px", background: "rgba(255,255,255,0.04)", flexShrink: 0 }}>
        <span style={{ color: "rgba(255,255,255,0.4)", fontSize: "13px", fontFamily: "monospace" }}>
          {idx + 1} / {images.length}
        </span>
        <button
          onClick={(e) => { e.stopPropagation(); onClose(); }}
          style={{ width: "36px", height: "36px", borderRadius: "50%",
                   border: "1.5px solid rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.08)",
                   color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          <X style={{ width: "15px", height: "15px", pointerEvents: "none" }} />
        </button>
      </div>

      {/* Image area with side arrows */}
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
                    position: "relative", overflow: "hidden" }}>
        {images.length > 1 && (
          <button onClick={(e) => { e.stopPropagation(); setIdx(i => Math.max(0, i - 1)); }}
            disabled={idx === 0}
            style={{ position: "absolute", left: "16px", width: "44px", height: "44px", borderRadius: "50%",
                     border: "1.5px solid rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.08)",
                     color: "#fff", cursor: idx === 0 ? "default" : "pointer", opacity: idx === 0 ? 0.2 : 1,
                     display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1 }}>
            <ChevronLeft style={{ width: "20px", height: "20px", pointerEvents: "none" }} />
          </button>
        )}
        <img key={idx} src={images[idx]} alt={`Comprobante ${idx + 1}`}
          style={{ maxWidth: "calc(100% - 120px)", maxHeight: "100%", objectFit: "contain",
                   borderRadius: "8px", animation: "fadeImg .15s ease" }} />
        {images.length > 1 && (
          <button onClick={(e) => { e.stopPropagation(); setIdx(i => Math.min(images.length - 1, i + 1)); }}
            disabled={idx === images.length - 1}
            style={{ position: "absolute", right: "16px", width: "44px", height: "44px", borderRadius: "50%",
                     border: "1.5px solid rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.08)",
                     color: "#fff", cursor: idx === images.length - 1 ? "default" : "pointer",
                     opacity: idx === images.length - 1 ? 0.2 : 1,
                     display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1 }}>
            <ChevronRight style={{ width: "20px", height: "20px", pointerEvents: "none" }} />
          </button>
        )}
      </div>

      {/* Thumbnail strip */}
      {images.length > 1 && (
        <div style={{ display: "flex", gap: "8px", justifyContent: "center", padding: "12px 20px",
                      background: "rgba(255,255,255,0.03)", flexShrink: 0, flexWrap: "wrap" }}>
          {images.map((src, i) => (
            <button key={i} onClick={(e) => { e.stopPropagation(); setIdx(i); }}
              style={{ width: "48px", height: "48px", borderRadius: "8px", overflow: "hidden", padding: 0,
                       cursor: "pointer", border: i === idx ? "2px solid #fff" : "2px solid transparent",
                       opacity: i === idx ? 1 : 0.4, transition: "all .15s" }}>
              <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", pointerEvents: "none" }} />
            </button>
          ))}
        </div>
      )}

      <div style={{ textAlign: "center", padding: "10px", flexShrink: 0 }}>
        <span style={{ color: "rgba(255,255,255,0.18)", fontSize: "11px" }}>ESC para cerrar · ← → para navegar</span>
      </div>
    </div>,
    document.body
  );
};

// ─── Reusable modal header ────────────────────────────────────────────────────
const MHead = ({ title, onClose }) => (
  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "20px 24px 0" }}>
    <h2 style={{ fontSize: "17px", fontWeight: 700, color: "#0f172a" }}>{title}</h2>
    <button onClick={onClose} style={{ ...iconBtnSt, borderRadius: "50%", width: "32px", height: "32px" }}>
      <X style={{ width: "14px", height: "14px", pointerEvents: "none" }} />
    </button>
  </div>
);

// ─── Field wrapper ────────────────────────────────────────────────────────────
const F = ({ label, children }) => (
  <div>
    <label style={{ fontSize: "10px", fontWeight: 700, color: "#64748b", textTransform: "uppercase",
                    letterSpacing: ".07em", display: "block", marginBottom: "5px" }}>{label}</label>
    {children}
  </div>
);

// ─── Primary button ───────────────────────────────────────────────────────────
const PBtn = ({ onClick, children }) => (
  <button onClick={onClick} style={{ ...gradBtnSt, width: "100%", justifyContent: "center",
                                     padding: "12px", borderRadius: "12px", fontSize: "14px" }}>
    {children}
  </button>
);

// ─── Stat Card ────────────────────────────────────────────────────────────────
const StatCard = ({ value, icon: Icon, cfg }) => (
  <div style={{ background: "#fff", borderRadius: "16px", border: "0.5px solid #f1f5f9",
                boxShadow: "0 1px 4px rgba(0,0,0,.06)", padding: "18px", position: "relative",
                overflow: "hidden" }}>
    <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "3px",
                  background: `linear-gradient(90deg,${cfg.g1},${cfg.g2})` }} />
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
      <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: `${cfg.g1}18`,
                    display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Icon style={{ width: "16px", height: "16px", color: cfg.g1 }} />
      </div>
      {cfg.trend && (
        <span style={{ fontSize: "11px", fontWeight: 600, padding: "2px 8px", borderRadius: "50px",
                       background: cfg.trend === "up" ? "#d1fae5" : "#fee2e2",
                       color: cfg.trend === "up" ? "#059669" : "#dc2626" }}>
          {cfg.trend === "up" ? "↑ +12%" : "↓ -8%"}
        </span>
      )}
    </div>
    <p style={{ fontSize: "11px", color: "#94a3b8", fontWeight: 600, textTransform: "uppercase",
                letterSpacing: ".06em", marginBottom: "4px" }}>{cfg.label}</p>
    <p style={{ fontSize: "20px", fontWeight: 700, color: "#0f172a" }}>{value}</p>
  </div>
);

// ─── Expense Card ─────────────────────────────────────────────────────────────
const ExpenseCard = ({ expense, onEdit, onDelete, onViewDetail }) => {
  const acc = TYPE_ACCENT[expense.expense_type] || TYPE_ACCENT.variable;
  const [hov, setHov] = useState(false);
  return (
    <div onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ background: "#fff", borderRadius: "14px", border: "0.5px solid #f1f5f9",
               boxShadow: hov ? "0 4px 14px rgba(0,0,0,.09)" : "0 1px 3px rgba(0,0,0,.05)",
               transform: hov ? "translateX(3px)" : "none",
               transition: "all .2s", display: "flex", overflow: "hidden" }}>
      <div style={{ width: "3px", background: acc.bar, flexShrink: 0 }} />
      <div style={{ flex: 1, padding: "14px 16px", display: "flex", alignItems: "center", gap: "14px", minWidth: 0 }}>
        <div style={{ width: "40px", height: "40px", borderRadius: "12px", flexShrink: 0,
                      background: acc.iconBg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "18px" }}>
          {TYPE_ICONS[expense.expense_type]}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: "14px", fontWeight: 600, color: "#0f172a", marginBottom: "6px",
                      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {expense.description}
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "5px" }}>
            {[`📅 ${formatDate(expense.date)}`, expense.category && `🏷️ ${expense.category}`, expense.vendor && `🏢 ${expense.vendor}`]
              .filter(Boolean).map(t => (
                <span key={t} style={{ fontSize: "11px", padding: "2px 8px", borderRadius: "50px",
                                       background: "#f8fafc", border: "0.5px solid #e2e8f0", color: "#64748b" }}>{t}</span>
              ))}
            <span style={{ fontSize: "11px", padding: "2px 8px", borderRadius: "50px", fontWeight: 600,
                           background: acc.badgeBg, color: acc.badgeColor }}>{TYPE_LABELS[expense.expense_type]}</span>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexShrink: 0 }}>
          <div style={{ textAlign: "right" }}>
            <p style={{ fontSize: "18px", fontWeight: 700, color: "#0f172a" }}>{formatCurrency(expense.amount)}</p>
            <p style={{ fontSize: "11px", color: "#94a3b8" }}>{PAYMENT_LABELS[expense.payment_method]}</p>
          </div>
          <div style={{ display: "flex", gap: "4px", opacity: hov ? 1 : 0, transition: "opacity .15s" }}>
            <button onClick={() => onViewDetail(expense)} style={iconBtnSt} title="Ver detalle"><Eye style={iconSz} /></button>
            <button onClick={() => onEdit(expense)} style={iconBtnSt} title="Editar"><Edit style={iconSz} /></button>
            <button onClick={() => onDelete(expense)} style={{ ...iconBtnSt }} title="Eliminar"><Trash2 style={iconSz} /></button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Mileage Card ─────────────────────────────────────────────────────────────
const MileageCard = ({ record }) => (
  <div style={{ background: "#fff", borderRadius: "14px", border: "0.5px solid #f1f5f9",
                boxShadow: "0 1px 3px rgba(0,0,0,.05)", padding: "14px 18px",
                display: "flex", alignItems: "center", gap: "14px" }}>
    <div style={{ width: "40px", height: "40px", borderRadius: "12px", background: "#f0f9ff",
                  display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      <Car style={{ width: "18px", height: "18px", color: "#0ea5e9" }} />
    </div>
    <div style={{ flex: 1, minWidth: 0 }}>
      <p style={{ fontSize: "14px", fontWeight: 600, color: "#0f172a" }}>{record.driver_name || "Conductor"}</p>
      <p style={{ fontSize: "12px", color: "#94a3b8", marginTop: "2px" }}>📅 {formatDate(record.date)}</p>
      {record.purpose && (
        <span style={{ fontSize: "11px", padding: "2px 8px", borderRadius: "50px", marginTop: "5px", display: "inline-block",
                       background: "#f8fafc", border: "0.5px solid #e2e8f0", color: "#64748b" }}>🎯 {record.purpose}</span>
      )}
    </div>
    <div style={{ display: "flex", gap: "20px", flexShrink: 0 }}>
      <div style={{ textAlign: "center" }}>
        <p style={{ fontSize: "11px", color: "#94a3b8", marginBottom: "2px" }}>Millas</p>
        <p style={{ fontSize: "14px", fontWeight: 600, color: "#0f172a" }}>{record.miles?.toFixed(1)} mi</p>
      </div>
      <div style={{ textAlign: "center" }}>
        <p style={{ fontSize: "11px", color: "#94a3b8", marginBottom: "2px" }}>Reembolso</p>
        <p style={{ fontSize: "14px", fontWeight: 600, color: "#059669" }}>{formatCurrency(record.reimbursement)}</p>
      </div>
    </div>
  </div>
);

// ─── Vehicle Card ─────────────────────────────────────────────────────────────
const VehicleCard = ({ vehicle, onEdit, onDelete }) => {
  const [hov, setHov] = useState(false);
  return (
    <div onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ background: "#fff", borderRadius: "16px", border: "0.5px solid #f1f5f9",
               boxShadow: hov ? "0 8px 24px rgba(0,0,0,.1)" : "0 1px 3px rgba(0,0,0,.06)",
               transform: hov ? "translateY(-3px)" : "none", transition: "all .2s", overflow: "hidden" }}>
      <div style={{ height: "3px", background: "linear-gradient(90deg,#818cf8,#8b5cf6)" }} />
      <div style={{ padding: "18px" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={{ width: "44px", height: "44px", borderRadius: "14px",
                          background: "linear-gradient(135deg,#818cf8,#8b5cf6)",
                          display: "flex", alignItems: "center", justifyContent: "center", fontSize: "20px" }}>🚗</div>
            <div>
              <p style={{ fontWeight: 600, fontSize: "14px", color: "#0f172a" }}>{vehicle.name}</p>
              <p style={{ fontSize: "12px", color: "#94a3b8" }}>{vehicle.make} {vehicle.model} {vehicle.year}</p>
            </div>
          </div>
          <div style={{ display: "flex", gap: "4px", opacity: hov ? 1 : 0, transition: "opacity .15s" }}>
            <button onClick={() => onEdit(vehicle)} style={iconBtnSt}><Edit style={iconSz} /></button>
            <button onClick={() => onDelete(vehicle)} style={iconBtnSt}><Trash2 style={iconSz} /></button>
          </div>
        </div>
        {vehicle.plate && (
          <span style={{ fontSize: "11px", fontFamily: "monospace", padding: "3px 8px", borderRadius: "6px",
                         background: "#f1f5f9", color: "#64748b", display: "inline-block", marginBottom: "12px" }}>
            {vehicle.plate}
          </span>
        )}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
                      paddingTop: "12px", borderTop: "0.5px solid #f1f5f9" }}>
          <span style={{ fontSize: "12px", color: "#94a3b8" }}>Millas totales</span>
          <span style={{ fontSize: "13px", fontWeight: 600, color: "#0f172a" }}>{(vehicle.total_miles || 0).toFixed(0)} mi</span>
        </div>
      </div>
    </div>
  );
};

// ─── Detail Sheet ─────────────────────────────────────────────────────────────
const DetailSheet = ({ expense, files, onClose, onOpenLightbox }) => {
  const acc = TYPE_ACCENT[expense.expense_type] || TYPE_ACCENT.variable;
  const imgs = files.filter(f => f.content_type?.startsWith("image/"))
                    .map(f => `${API}${f.url}?auth=${localStorage.getItem("token")}`);
  return (
    <PortalModal open onClose={onClose} maxWidth="500px" sheet>
      <div style={{ height: "4px", background: acc.bar, borderRadius: "20px 20px 0 0" }} />
      <div style={{ display: "flex", justifyContent: "center", padding: "10px 0 0" }}>
        <div style={{ width: "32px", height: "4px", borderRadius: "4px", background: "#e2e8f0" }} />
      </div>
      <div style={{ padding: "16px 22px 28px" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "18px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={{ width: "44px", height: "44px", borderRadius: "12px", background: acc.iconBg,
                          display: "flex", alignItems: "center", justifyContent: "center", fontSize: "20px", flexShrink: 0 }}>
              {TYPE_ICONS[expense.expense_type]}
            </div>
            <div>
              <p style={{ fontWeight: 700, fontSize: "15px", color: "#0f172a" }}>{expense.description}</p>
              <p style={{ fontSize: "12px", color: "#94a3b8", marginTop: "2px" }}>{expense.vendor || "Sin proveedor"}</p>
            </div>
          </div>
          <button onClick={onClose} style={{ ...iconBtnSt, borderRadius: "50%", flexShrink: 0, marginLeft: "8px" }}>
            <X style={{ width: "13px", height: "13px", pointerEvents: "none" }} />
          </button>
        </div>
        <div style={{ background: "linear-gradient(135deg,#f0f9ff,#ede9fe)", borderRadius: "14px",
                      padding: "16px 20px", marginBottom: "16px",
                      display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <p style={{ fontSize: "11px", color: "#64748b", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".06em" }}>Monto</p>
            <p style={{ fontSize: "26px", fontWeight: 700, color: "#4f46e5", marginTop: "2px" }}>{formatCurrency(expense.amount)}</p>
          </div>
          <span style={{ fontSize: "11px", padding: "4px 10px", borderRadius: "50px", fontWeight: 600,
                         background: acc.badgeBg, color: acc.badgeColor }}>{TYPE_LABELS[expense.expense_type]}</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "16px" }}>
          {[["Fecha", formatDate(expense.date)], ["Método", PAYMENT_LABELS[expense.payment_method] || "—"],
            ["Categoría", expense.category || "—"], ["Notas", expense.notes || "—"]].map(([l, v]) => (
            <div key={l} style={{ background: "#f8fafc", borderRadius: "10px", padding: "10px 12px", border: "0.5px solid #f1f5f9" }}>
              <p style={{ fontSize: "10px", color: "#94a3b8", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: "3px" }}>{l}</p>
              <p style={{ fontSize: "13px", fontWeight: 600, color: "#334155" }}>{v}</p>
            </div>
          ))}
        </div>
        {imgs.length > 0 && (
          <div style={{ background: "#f8fafc", borderRadius: "12px", padding: "12px 14px", border: "0.5px solid #f1f5f9", marginBottom: "16px" }}>
            <p style={{ fontSize: "10px", color: "#94a3b8", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: "10px" }}>
              Comprobantes ({imgs.length})
            </p>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              {imgs.map((src, i) => (
                <button key={i} onClick={() => onOpenLightbox(imgs, i)}
                  style={{ width: "60px", height: "60px", borderRadius: "10px", overflow: "hidden",
                           border: "0.5px solid #e2e8f0", padding: 0, cursor: "pointer" }}>
                  <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", pointerEvents: "none" }} />
                </button>
              ))}
            </div>
          </div>
        )}
        <button onClick={onClose}
          style={{ width: "100%", padding: "11px", borderRadius: "12px", border: "0.5px solid #e2e8f0",
                   background: "#f8fafc", fontSize: "14px", fontWeight: 500, color: "#475569", cursor: "pointer" }}>
          Cerrar
        </button>
      </div>
    </PortalModal>
  );
};

// ─── Delete Confirm ───────────────────────────────────────────────────────────
const DeleteConfirm = ({ target, onConfirm, onCancel }) => (
  <PortalModal open onClose={onCancel} maxWidth="360px">
    <div style={{ padding: "28px 24px 24px" }}>
      <div style={{ display: "flex", gap: "14px", alignItems: "flex-start", marginBottom: "16px" }}>
        <div style={{ width: "44px", height: "44px", borderRadius: "50%", background: "#fee2e2",
                      display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <AlertTriangle style={{ width: "20px", height: "20px", color: "#dc2626" }} />
        </div>
        <div>
          <p style={{ fontWeight: 700, fontSize: "15px", color: "#0f172a" }}>Confirmar eliminación</p>
          <p style={{ fontSize: "12px", color: "#94a3b8", marginTop: "3px" }}>Esta acción no se puede deshacer</p>
        </div>
      </div>
      <div style={{ background: "#fef2f2", borderRadius: "10px", padding: "10px 14px", fontSize: "13px",
                    fontWeight: 500, color: "#7f1d1d", marginBottom: "20px", borderLeft: "3px solid #fca5a5" }}>
        "{target.name}"
      </div>
      <div style={{ display: "flex", gap: "10px" }}>
        <button onClick={onCancel}
          style={{ flex: 1, padding: "11px", borderRadius: "12px", border: "0.5px solid #e2e8f0",
                   background: "#fff", fontSize: "14px", fontWeight: 500, color: "#475569", cursor: "pointer" }}>
          Cancelar
        </button>
        <button onClick={onConfirm}
          style={{ flex: 1, padding: "11px", borderRadius: "12px", border: "none", background: "#dc2626",
                   fontSize: "14px", fontWeight: 600, color: "#fff", cursor: "pointer",
                   display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}>
          <Trash2 style={{ width: "14px", height: "14px", pointerEvents: "none" }} /> Eliminar
        </button>
      </div>
    </div>
  </PortalModal>
);

// ─── Expense Form ─────────────────────────────────────────────────────────────
const ExpenseForm = ({ open, onClose, editingItem, form, setForm, categories, attachments,
                       existingFiles, ocrLoading, onSave, onOpenLightbox,
                       cameraRef, fileRef, onFileSelect, onRemoveAttachment }) => (
  <PortalModal open={open} onClose={onClose} maxWidth="500px">
    <MHead title={editingItem ? "✏️ Editar Gasto" : "💰 Nuevo Gasto"} onClose={onClose} />
    <div style={{ padding: "18px 24px 24px", display: "flex", flexDirection: "column", gap: "13px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
        <F label="Fecha"><input type="date" value={form.date||""} onChange={e=>setForm(f=>({...f,date:e.target.value}))} style={inputSt}/></F>
        <F label="Monto"><input type="number" step="0.01" placeholder="0.00" value={form.amount||""} onChange={e=>setForm(f=>({...f,amount:e.target.value}))} style={inputSt}/></F>
      </div>
      <F label="Descripción"><input value={form.description||""} onChange={e=>setForm(f=>({...f,description:e.target.value}))} placeholder="Ej: Compra de insumos" style={inputSt}/></F>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
        <F label="Categoría">
          <select value={form.category||""} onChange={e=>setForm(f=>({...f,category:e.target.value}))} style={selectSt}>
            <option value="">Seleccionar</option>
            {categories.map(c=><option key={c.name} value={c.name}>{c.name}</option>)}
          </select>
        </F>
        <F label="Tipo">
          <select value={form.expense_type||"variable"} onChange={e=>setForm(f=>({...f,expense_type:e.target.value}))} style={selectSt}>
            <option value="fixed">🏢 Fijo</option>
            <option value="variable">📦 Variable</option>
            <option value="subscription">🔄 Suscripción</option>
          </select>
        </F>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
        <F label="Proveedor"><input value={form.vendor||""} onChange={e=>setForm(f=>({...f,vendor:e.target.value}))} placeholder="Nombre del proveedor" style={inputSt}/></F>
        <F label="Método de Pago">
          <select value={form.payment_method||"card"} onChange={e=>setForm(f=>({...f,payment_method:e.target.value}))} style={selectSt}>
            {Object.entries(PAYMENT_LABELS).map(([k,v])=><option key={k} value={k}>{v}</option>)}
          </select>
        </F>
      </div>
      <F label="Notas">
        <textarea value={form.notes||""} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} rows={2}
          placeholder="Información adicional..." style={{...inputSt,resize:"none",lineHeight:"1.5"}}/>
      </F>

      {/* Attachments */}
      <F label="Comprobante">
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" style={{display:"none"}} onChange={onFileSelect}/>
        <input ref={fileRef} type="file" accept="image/*,.pdf" multiple style={{display:"none"}} onChange={onFileSelect}/>
        <div style={{display:"flex",gap:"8px"}}>
          <button type="button" onClick={()=>cameraRef.current?.click()}
            style={{flex:1,padding:"9px",borderRadius:"10px",border:"0.5px solid #e2e8f0",background:"#f8fafc",fontSize:"13px",color:"#475569",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:"6px"}}>
            <Camera style={{width:"14px",height:"14px"}}/> Tomar Foto
          </button>
          <button type="button" onClick={()=>fileRef.current?.click()}
            style={{flex:1,padding:"9px",borderRadius:"10px",border:"0.5px solid #e2e8f0",background:"#f8fafc",fontSize:"13px",color:"#475569",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:"6px"}}>
            <Paperclip style={{width:"14px",height:"14px"}}/> Adjuntar
          </button>
        </div>
        {ocrLoading && (
          <div style={{display:"flex",alignItems:"center",gap:"8px",padding:"8px 12px",background:"#fffbeb",border:"0.5px solid #fde68a",borderRadius:"10px",fontSize:"12px",color:"#92400e",marginTop:"8px"}}>
            <div style={{width:"12px",height:"12px",border:"2px solid #f59e0b",borderTopColor:"transparent",borderRadius:"50%",animation:"spin 1s linear infinite",flexShrink:0}}/>
            Escaneando recibo con IA...
          </div>
        )}
        {attachments.length > 0 && (
          <div style={{display:"flex",flexWrap:"wrap",gap:"8px",marginTop:"8px"}}>
            {attachments.map((a,i)=>(
              <div key={i} style={{position:"relative"}}>
                {a.preview
                  ? <button type="button" onClick={()=>onOpenLightbox([a.preview],0)} style={{display:"block",padding:0,border:"none",background:"none",cursor:"pointer"}}>
                      <img src={a.preview} alt="" style={{width:"56px",height:"56px",objectFit:"cover",borderRadius:"10px",border:"0.5px solid #e2e8f0",display:"block"}}/>
                    </button>
                  : <div style={{width:"56px",height:"56px",borderRadius:"10px",background:"#f1f5f9",border:"0.5px solid #e2e8f0",display:"flex",alignItems:"center",justifyContent:"center"}}>
                      <Receipt style={{width:"18px",height:"18px",color:"#94a3b8"}}/>
                    </div>
                }
                {a.uploading && (
                  <div style={{position:"absolute",inset:0,background:"rgba(255,255,255,.7)",borderRadius:"10px",display:"flex",alignItems:"center",justifyContent:"center"}}>
                    <div style={{width:"14px",height:"14px",border:"2px solid #6366f1",borderTopColor:"transparent",borderRadius:"50%",animation:"spin 1s linear infinite"}}/>
                  </div>
                )}
                {a.uploaded && !a.uploading && (
                  <div style={{position:"absolute",top:"-4px",right:"-4px",width:"16px",height:"16px",borderRadius:"50%",background:"#10b981",display:"flex",alignItems:"center",justifyContent:"center"}}>
                    <Check style={{width:"9px",height:"9px",color:"#fff",pointerEvents:"none"}}/>
                  </div>
                )}
                {!a.uploading && (
                  <button onClick={(e)=>{e.stopPropagation();onRemoveAttachment(i);}}
                    style={{position:"absolute",top:"-4px",left:"-4px",width:"18px",height:"18px",borderRadius:"50%",background:"#ef4444",border:"none",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer"}}>
                    <X style={{width:"10px",height:"10px",color:"#fff",pointerEvents:"none"}}/>
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
        {existingFiles.length > 0 && (
          <div style={{marginTop:"10px"}}>
            <p style={{fontSize:"10px",color:"#94a3b8",fontWeight:700,textTransform:"uppercase",letterSpacing:".07em",marginBottom:"6px"}}>Archivos guardados</p>
            <div style={{display:"flex",flexWrap:"wrap",gap:"8px"}}>
              {existingFiles.map((f)=>{
                const isImg = f.content_type?.startsWith("image/");
                const url = `${API}${f.url}?auth=${localStorage.getItem("token")}`;
                const allImgs = existingFiles.filter(x=>x.content_type?.startsWith("image/")).map(x=>`${API}${x.url}?auth=${localStorage.getItem("token")}`);
                return isImg
                  ? <button key={f.id} type="button" onClick={()=>onOpenLightbox(allImgs,allImgs.indexOf(url))} style={{padding:0,border:"none",background:"none",cursor:"pointer"}}>
                      <img src={url} alt={f.original_filename} style={{width:"56px",height:"56px",objectFit:"cover",borderRadius:"10px",border:"0.5px solid #e2e8f0",display:"block"}}/>
                    </button>
                  : <a key={f.id} href={url} target="_blank" rel="noopener noreferrer"
                      style={{display:"inline-flex",alignItems:"center",gap:"5px",padding:"5px 10px",background:"#eff6ff",border:"0.5px solid #bfdbfe",borderRadius:"8px",fontSize:"11px",color:"#1d4ed8",textDecoration:"none"}}>
                      <ImageIcon style={{width:"12px",height:"12px"}}/> {f.original_filename||"archivo"}
                    </a>;
              })}
            </div>
          </div>
        )}
      </F>
      <PBtn onClick={onSave}>{editingItem ? "Actualizar Gasto" : "Guardar Gasto"}</PBtn>
    </div>
  </PortalModal>
);

// ─── Mileage Form ─────────────────────────────────────────────────────────────
const MileageForm = ({ open, onClose, form, setForm, vehicles, onSave }) => (
  <PortalModal open={open} onClose={onClose} maxWidth="460px">
    <MHead title="📊 Registrar Millaje" onClose={onClose}/>
    <div style={{padding:"18px 24px 24px",display:"flex",flexDirection:"column",gap:"13px"}}>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"12px"}}>
        <F label="Fecha"><input type="date" value={form.date||""} onChange={e=>setForm(f=>({...f,date:e.target.value}))} style={inputSt}/></F>
        <F label="Vehículo">
          <select value={form.vehicle_id||""} onChange={e=>setForm(f=>({...f,vehicle_id:e.target.value}))} style={selectSt}>
            <option value="">Seleccionar</option>
            {vehicles.map(v=><option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        </F>
      </div>
      <F label="Conductor"><input value={form.driver_name||""} onChange={e=>setForm(f=>({...f,driver_name:e.target.value}))} placeholder="Nombre del conductor" style={inputSt}/></F>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"12px"}}>
        <F label="Odómetro Inicio"><input type="number" value={form.start_odometer||""} onChange={e=>setForm(f=>({...f,start_odometer:e.target.value}))} style={inputSt}/></F>
        <F label="Odómetro Final"><input type="number" value={form.end_odometer||""} onChange={e=>setForm(f=>({...f,end_odometer:e.target.value}))} style={inputSt}/></F>
      </div>
      <F label="Propósito"><input value={form.purpose||""} onChange={e=>setForm(f=>({...f,purpose:e.target.value}))} placeholder="Ej: Entregas zona norte" style={inputSt}/></F>
      <PBtn onClick={onSave}>Registrar Millaje</PBtn>
    </div>
  </PortalModal>
);

// ─── Vehicle Form ─────────────────────────────────────────────────────────────
const VehicleForm = ({ open, onClose, editingItem, form, setForm, onSave }) => (
  <PortalModal open={open} onClose={onClose} maxWidth="460px">
    <MHead title={editingItem?"✏️ Editar Vehículo":"🚗 Nuevo Vehículo"} onClose={onClose}/>
    <div style={{padding:"18px 24px 24px",display:"flex",flexDirection:"column",gap:"13px"}}>
      <F label="Nombre *"><input value={form.name||""} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="Ej: Van Principal" style={inputSt}/></F>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 80px",gap:"10px"}}>
        <F label="Marca"><input value={form.make||""} onChange={e=>setForm(f=>({...f,make:e.target.value}))} style={inputSt}/></F>
        <F label="Modelo"><input value={form.model||""} onChange={e=>setForm(f=>({...f,model:e.target.value}))} style={inputSt}/></F>
        <F label="Año"><input type="number" value={form.year||""} onChange={e=>setForm(f=>({...f,year:e.target.value}))} style={inputSt}/></F>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"12px"}}>
        <F label="Placas"><input value={form.plate||""} onChange={e=>setForm(f=>({...f,plate:e.target.value}))} style={{...inputSt,fontFamily:"monospace"}}/></F>
        <F label="Estado">
          <select value={form.status||"active"} onChange={e=>setForm(f=>({...f,status:e.target.value}))} style={selectSt}>
            <option value="active">✅ Activo</option>
            <option value="maintenance">🔧 Mantenimiento</option>
            <option value="inactive">❌ Inactivo</option>
          </select>
        </F>
      </div>
      <PBtn onClick={onSave}>{editingItem?"Actualizar Vehículo":"Crear Vehículo"}</PBtn>
    </div>
  </PortalModal>
);

// ═══════════════════════════════════════════════════════════════════════════════
//  MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════════
export default function FinancesPage() {
  const { t } = useLocale();

  const [activeTab, setActiveTab] = useState("expenses");
  const [period, setPeriod]       = useState("month");
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading]     = useState(true);

  const [expenses, setExpenses]     = useState([]);
  const [categories, setCategories] = useState([]);
  const [mileage, setMileage]       = useState([]);
  const [vehicles, setVehicles]     = useState([]);

  const [search, setSearch]                     = useState("");
  const [expenseTypeFilter, setExpenseTypeFilter] = useState("");

  // modal = "expense"|"mileage"|"vehicle"|"detail"|"delete"|null
  const [modal, setModal]               = useState(null);
  const [editingItem, setEditingItem]   = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [detailExpense, setDetailExpense] = useState(null);
  const [detailFiles, setDetailFiles]   = useState([]);

  // Lightbox: null = closed, { images, idx } = open
  const [lightbox, setLightbox] = useState(null);

  const [form, setForm]                   = useState({});
  const [attachments, setAttachments]     = useState([]);
  const [existingFiles, setExistingFiles] = useState([]);
  const [ocrLoading, setOcrLoading]       = useState(false);

  const cameraRef      = useRef(null);
  const fileRef        = useRef(null);
  const attachmentsRef = useRef([]);
  useEffect(() => { attachmentsRef.current = attachments; }, [attachments]);

  // ── Loaders ────────────────────────────────────────────────────────────────
  const loadDashboard = useCallback(async () => {
    try { const r = await fetch(`${API}/api/finances/dashboard?period=${period}`, { headers: getAuthHeaders() }); if (r.ok) setDashboard(await r.json()); } catch {}
    finally { setLoading(false); }
  }, [period]);

  const loadExpenses = useCallback(async () => {
    try {
      const p = new URLSearchParams();
      if (expenseTypeFilter) p.append("expense_type", expenseTypeFilter);
      if (search) p.append("search", search);
      const r = await fetch(`${API}/api/finances/expenses?${p}`, { headers: getAuthHeaders() });
      if (r.ok) setExpenses(await r.json());
    } catch { toast.error("Error cargando gastos"); }
  }, [expenseTypeFilter, search]);

  const loadCategories = useCallback(async () => {
    try { const r = await fetch(`${API}/api/finances/categories`, { headers: getAuthHeaders() }); if (r.ok) setCategories(await r.json()); } catch {}
  }, []);

  const loadMileage = useCallback(async () => {
    try { const r = await fetch(`${API}/api/finances/mileage`, { headers: getAuthHeaders() }); if (r.ok) setMileage(await r.json()); } catch {}
  }, []);

  const loadVehicles = useCallback(async () => {
    try { const r = await fetch(`${API}/api/finances/vehicles`, { headers: getAuthHeaders() }); if (r.ok) setVehicles(await r.json()); } catch {}
  }, []);

  useEffect(() => { loadDashboard(); loadCategories(); }, [loadDashboard, loadCategories]);
  useEffect(() => { loadExpenses(); }, [loadExpenses]);
  useEffect(() => {
    if (activeTab === "mileage") { loadMileage(); loadVehicles(); }
    if (activeTab === "vehicles") loadVehicles();
  }, [activeTab, loadMileage, loadVehicles]);

  // ── File handling ──────────────────────────────────────────────────────────
  const handleFileSelect = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const base = attachmentsRef.current.length;
    setAttachments(prev => [...prev, ...files.map(f => ({
      file: f, preview: f.type.startsWith("image/") ? URL.createObjectURL(f) : null,
      uploading: true, uploaded: false, uploadedId: null,
    }))]);
    e.target.value = "";
    for (let i = 0; i < files.length; i++) {
      const file = files[i]; const idx = base + i;
      try {
        const fd = new FormData(); fd.append("file", file);
        const r = await fetch(`${API}/api/files/upload?context=ocr-temp`, {
          method: "POST", headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }, body: fd,
        });
        if (r.ok) {
          const d = await r.json();
          setAttachments(prev => { const u=[...prev]; if(u[idx]) u[idx]={...u[idx],uploading:false,uploaded:true,uploadedId:d.id}; return u; });
          if (file.type.startsWith("image/") && modal === "expense") {
            setOcrLoading(true);
            try {
              const or = await fetch(`${API}/api/files/ocr/${d.id}`, { method: "POST", headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } });
              if (or.ok) {
                const od = await or.json();
                setForm(prev => ({ ...prev, ...(od.amount&&{amount:String(od.amount)}), ...(od.description&&{description:od.description}), ...(od.date&&{date:od.date}), ...(od.vendor&&{vendor:od.vendor}) }));
                toast.success("✅ Recibo escaneado");
              }
            } catch {} finally { setOcrLoading(false); }
          }
        } else {
          setAttachments(prev=>{const u=[...prev];if(u[idx])u[idx]={...u[idx],uploading:false,error:true};return u;});
          toast.error("Error al subir archivo");
        }
      } catch { setAttachments(prev=>{const u=[...prev];if(u[idx])u[idx]={...u[idx],uploading:false,error:true};return u;}); }
    }
  };

  const removeAttachment = (i) => {
    setAttachments(prev => { const u=[...prev]; if(u[i]?.preview) URL.revokeObjectURL(u[i].preview); u.splice(i,1); return u; });
  };

  const linkFiles = async (eid) => {
    const token = localStorage.getItem("token");
    for (const a of attachmentsRef.current) {
      if (a.uploaded && a.uploadedId) {
        try { await fetch(`${API}/api/files/${a.uploadedId}/context?context=expense:${eid}`, { method: "PATCH", headers: { Authorization: `Bearer ${token}` } }); } catch {}
      }
    }
  };

  const loadExistingFiles = async (id) => {
    try { const r = await fetch(`${API}/api/files/by-context/expense/${id}`, { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } }); if (r.ok) setExistingFiles(await r.json()); }
    catch { setExistingFiles([]); }
  };

  // ── CRUD ───────────────────────────────────────────────────────────────────
  const saveExpense = async () => {
    if (!form.description || !form.amount) { toast.error("❌ Descripción y monto requeridos"); return; }
    const method = editingItem ? "PUT" : "POST";
    const url    = editingItem ? `${API}/api/finances/expenses/${editingItem.id}` : `${API}/api/finances/expenses`;
    try {
      const r = await fetch(url, { method, headers: getAuthHeaders(), body: JSON.stringify({ ...form, amount: parseFloat(form.amount) }) });
      if (r.ok) {
        const saved = await r.json();
        const eid = editingItem?.id || saved.id;
        if (eid && attachmentsRef.current.some(a => a.uploaded)) await linkFiles(eid);
        toast.success(editingItem ? "✅ Gasto actualizado" : "✅ Gasto creado");
        closeModal(); loadExpenses(); loadDashboard();
      } else toast.error("Error al guardar");
    } catch { toast.error("Error de conexión"); }
  };

  const saveMileage = async () => {
    if (!form.start_odometer || !form.end_odometer) { toast.error("❌ Odómetros requeridos"); return; }
    try {
      const r = await fetch(`${API}/api/finances/mileage`, { method: "POST", headers: getAuthHeaders(), body: JSON.stringify({ ...form, start_odometer: parseFloat(form.start_odometer), end_odometer: parseFloat(form.end_odometer) }) });
      if (r.ok) { toast.success("✅ Millaje registrado"); closeModal(); loadMileage(); loadDashboard(); }
      else toast.error("Error al registrar");
    } catch { toast.error("Error de conexión"); }
  };

  const saveVehicle = async () => {
    if (!form.name) { toast.error("❌ Nombre requerido"); return; }
    const method = editingItem ? "PUT" : "POST";
    const url    = editingItem ? `${API}/api/finances/vehicles/${editingItem.id}` : `${API}/api/finances/vehicles`;
    try {
      const r = await fetch(url, { method, headers: getAuthHeaders(), body: JSON.stringify({ ...form, year: form.year ? parseInt(form.year) : null }) });
      if (r.ok) { toast.success(editingItem ? "✅ Actualizado" : "✅ Creado"); closeModal(); loadVehicles(); }
      else toast.error("Error al guardar");
    } catch { toast.error("Error de conexión"); }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      const r = await fetch(`${API}/api/finances/${deleteTarget.type}s/${deleteTarget.id}`, { method: "DELETE", headers: getAuthHeaders() });
      if (r.ok) {
        toast.success("✅ Eliminado");
        if (deleteTarget.type === "expense") { loadExpenses(); loadDashboard(); } else loadVehicles();
        setDeleteTarget(null); setModal(null);
      } else toast.error("Error al eliminar");
    } catch { toast.error("Error de conexión"); }
  };

  const closeModal = () => { setModal(null); setEditingItem(null); setForm({}); setAttachments([]); setExistingFiles([]); };

  const openExpense = (exp = null) => {
    if (exp) { setEditingItem(exp); setForm(exp); loadExistingFiles(exp.id); }
    else { setEditingItem(null); setForm(emptyExpense); setAttachments([]); setExistingFiles([]); }
    setModal("expense");
  };

  const openDetail = async (exp) => {
    setDetailExpense(exp); setDetailFiles([]);
    try { const r = await fetch(`${API}/api/files/by-context/expense/${exp.id}`, { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } }); if (r.ok) setDetailFiles(await r.json()); } catch {}
    setModal("detail");
  };

  const TABS = [
    { key: "expenses", label: "💰 Gastos"    },
    { key: "mileage",  label: "📊 Millaje"   },
    { key: "vehicles", label: "🚗 Vehículos" },
  ];

  // ── RENDER ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg,#f8fafc,#f1f5f9)" }}>
      <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "28px 16px" }}>

        {/* Header */}
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", justifyContent: "space-between", gap: "16px", marginBottom: "28px" }}>
          <div>
            <h1 style={{ fontSize: "26px", fontWeight: 700, color: "#0f172a" }}>{t("Finances","Finanzas")}</h1>
            <p style={{ fontSize: "13px", color: "#94a3b8", marginTop: "4px", display: "flex", alignItems: "center", gap: "5px" }}>
              <Wallet style={{ width: "14px", height: "14px" }} /> {t("Operational financial control","Control financiero operativo")}
            </p>
          </div>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <div style={{ position: "relative" }}>
              <select value={period} onChange={e => setPeriod(e.target.value)} style={{ ...selectSt, width: "auto", paddingRight: "28px", background: "#fff" }}>
                <option value="day">📅 Hoy</option>
                <option value="week">📆 Esta semana</option>
                <option value="month">📆 Este mes</option>
                <option value="year">📅 Este año</option>
              </select>
              <ChevronDown style={{ position: "absolute", right: "8px", top: "50%", transform: "translateY(-50%)", width: "13px", height: "13px", color: "#94a3b8", pointerEvents: "none" }} />
            </div>
            <button onClick={() => { loadDashboard(); loadExpenses(); }}
              style={{ display: "flex", alignItems: "center", gap: "6px", padding: "9px 14px", borderRadius: "10px", border: "0.5px solid #e2e8f0", background: "#fff", fontSize: "13px", color: "#475569", cursor: "pointer" }}>
              <RefreshCw style={{ width: "13px", height: "13px" }} /> Actualizar
            </button>
          </div>
        </div>

        {/* Stats */}
        {dashboard && !loading && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "14px", marginBottom: "20px" }}>
            <StatCard value={formatCurrency(dashboard.revenue)}        icon={TrendingUp}   cfg={STAT_CFG.revenue} />
            <StatCard value={formatCurrency(dashboard.total_expenses)} icon={TrendingDown} cfg={STAT_CFG.expenses} />
            <StatCard value={formatCurrency(dashboard.net_income)}     icon={DollarSign}   cfg={STAT_CFG.net} />
            <StatCard value={`${dashboard.mileage?.total_miles?.toFixed(0)||0} mi`} icon={Car} cfg={STAT_CFG.mileage} />
          </div>
        )}

        {/* Category breakdown */}
        {dashboard?.by_category && Object.keys(dashboard.by_category).length > 0 && (
          <div style={{ background: "#fff", borderRadius: "16px", border: "0.5px solid #f1f5f9", boxShadow: "0 1px 3px rgba(0,0,0,.06)", padding: "20px", marginBottom: "20px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
              <Filter style={{ width: "15px", height: "15px", color: "#818cf8" }} />
              <span style={{ fontSize: "13px", fontWeight: 600, color: "#0f172a" }}>Gastos por categoría</span>
            </div>
            {Object.entries(dashboard.by_category).map(([cat, amt], i) => {
              const pct = dashboard.total_expenses > 0 ? (amt / dashboard.total_expenses) * 100 : 0;
              const bars = ["#38bdf8,#6366f1","#818cf8,#8b5cf6","#a78bfa,#7c3aed","#f59e0b,#f97316"];
              return (
                <div key={cat} style={{ marginBottom: "12px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "5px" }}>
                    <span style={{ fontSize: "13px", fontWeight: 500, color: "#334155" }}>{cat}</span>
                    <span style={{ fontSize: "12px", color: "#94a3b8" }}>{formatCurrency(amt)} · {pct.toFixed(1)}%</span>
                  </div>
                  <div style={{ height: "5px", background: "#f1f5f9", borderRadius: "50px", overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${pct}%`, borderRadius: "50px", background: `linear-gradient(90deg,${bars[i%bars.length]})`, transition: "width .7s ease" }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Tabs */}
        <div style={{ background: "#fff", borderRadius: "14px", border: "0.5px solid #f1f5f9", boxShadow: "0 1px 3px rgba(0,0,0,.06)", padding: "5px", display: "flex", gap: "4px", marginBottom: "18px" }}>
          {TABS.map(({ key, label }) => (
            <button key={key} onClick={() => setActiveTab(key)} style={{
              flex: 1, padding: "10px", borderRadius: "10px", border: "none", fontSize: "13px", fontWeight: 500, cursor: "pointer", transition: "all .2s",
              background: activeTab === key ? "linear-gradient(135deg,#0ea5e9,#6366f1)" : "transparent",
              color: activeTab === key ? "#fff" : "#64748b",
            }}>{label}</button>
          ))}
        </div>

        {/* ── Gastos ── */}
        {activeTab === "expenses" && (
          <div>
            <div style={{ background: "#fff", borderRadius: "14px", border: "0.5px solid #f1f5f9", boxShadow: "0 1px 3px rgba(0,0,0,.06)", padding: "14px", marginBottom: "14px", display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <div style={{ position: "relative", flex: 1, minWidth: "200px" }}>
                <Search style={{ position: "absolute", left: "11px", top: "50%", transform: "translateY(-50%)", width: "14px", height: "14px", color: "#94a3b8", pointerEvents: "none" }} />
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por descripción o proveedor..." style={{ ...inputSt, paddingLeft: "34px" }} />
              </div>
              <select value={expenseTypeFilter} onChange={e => setExpenseTypeFilter(e.target.value)} style={{ ...selectSt, width: "auto" }}>
                <option value="">📋 Todos</option>
                <option value="fixed">🏢 Fijos</option>
                <option value="variable">📦 Variables</option>
                <option value="subscription">🔄 Suscripciones</option>
              </select>
              <button onClick={() => openExpense()} style={gradBtnSt}>
                <Plus style={{ width: "14px", height: "14px", pointerEvents: "none" }} /> Nuevo Gasto
              </button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {expenses.length === 0
                ? <div style={{ background: "#fff", borderRadius: "14px", border: "0.5px solid #f1f5f9", padding: "60px 20px", textAlign: "center" }}>
                    <Receipt style={{ width: "40px", height: "40px", color: "#e2e8f0", margin: "0 auto 12px" }} />
                    <p style={{ color: "#94a3b8", fontSize: "14px", marginBottom: "14px" }}>No hay gastos registrados</p>
                    <button onClick={() => openExpense()} style={{ ...gradBtnSt, borderRadius: "10px" }}>
                      <Plus style={{ width: "14px", height: "14px" }} /> Registrar primer gasto
                    </button>
                  </div>
                : expenses.map(exp => (
                    <ExpenseCard key={exp.id} expense={exp}
                      onEdit={openExpense}
                      onDelete={exp => { setDeleteTarget({ type: "expense", id: exp.id, name: exp.description }); setModal("delete"); }}
                      onViewDetail={openDetail} />
                  ))
              }
            </div>
          </div>
        )}

        {/* ── Millaje ── */}
        {activeTab === "mileage" && (
          <div>
            <div style={{ background: "#fff", borderRadius: "14px", border: "0.5px solid #f1f5f9", boxShadow: "0 1px 3px rgba(0,0,0,.06)", padding: "14px 18px", marginBottom: "14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <p style={{ fontSize: "14px", fontWeight: 600, color: "#0f172a" }}>Registros de Millaje</p>
                <p style={{ fontSize: "12px", color: "#94a3b8", marginTop: "2px" }}>{mileage.length} viajes registrados</p>
              </div>
              <button onClick={() => { setForm(emptyMileage); setModal("mileage"); }} style={gradBtnSt}>
                <Plus style={{ width: "14px", height: "14px" }} /> Registrar Viaje
              </button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {mileage.length === 0
                ? <div style={{ background: "#fff", borderRadius: "14px", border: "0.5px solid #f1f5f9", padding: "60px 20px", textAlign: "center" }}>
                    <Car style={{ width: "40px", height: "40px", color: "#e2e8f0", margin: "0 auto 12px" }} />
                    <p style={{ color: "#94a3b8", fontSize: "14px" }}>No hay registros de millaje</p>
                  </div>
                : mileage.map(r => <MileageCard key={r.id} record={r} />)
              }
            </div>
          </div>
        )}

        {/* ── Vehículos ── */}
        {activeTab === "vehicles" && (
          <div>
            <div style={{ background: "#fff", borderRadius: "14px", border: "0.5px solid #f1f5f9", boxShadow: "0 1px 3px rgba(0,0,0,.06)", padding: "14px 18px", marginBottom: "14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <p style={{ fontSize: "14px", fontWeight: 600, color: "#0f172a" }}>Flota de Vehículos</p>
                <p style={{ fontSize: "12px", color: "#94a3b8", marginTop: "2px" }}>{vehicles.length} vehículos en el sistema</p>
              </div>
              <button onClick={() => { setEditingItem(null); setForm(emptyVehicle); setModal("vehicle"); }} style={gradBtnSt}>
                <Plus style={{ width: "14px", height: "14px" }} /> Agregar Vehículo
              </button>
            </div>
            {vehicles.length === 0
              ? <div style={{ background: "#fff", borderRadius: "14px", border: "0.5px solid #f1f5f9", padding: "60px 20px", textAlign: "center" }}>
                  <Car style={{ width: "40px", height: "40px", color: "#e2e8f0", margin: "0 auto 12px" }} />
                  <p style={{ color: "#94a3b8", fontSize: "14px" }}>No hay vehículos registrados</p>
                </div>
              : <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))", gap: "14px" }}>
                  {vehicles.map(v => (
                    <VehicleCard key={v.id} vehicle={v}
                      onEdit={v => { setEditingItem(v); setForm(v); setModal("vehicle"); }}
                      onDelete={v => { setDeleteTarget({ type: "vehicle", id: v.id, name: v.name }); setModal("delete"); }} />
                  ))}
                </div>
            }
          </div>
        )}
      </div>

      {/* ══ ALL PORTALS — rendered at root, no nesting ══════════════════════ */}

      <ExpenseForm
        open={modal === "expense"}
        onClose={closeModal}
        editingItem={editingItem}
        form={form} setForm={setForm}
        categories={categories}
        attachments={attachments}
        existingFiles={existingFiles}
        ocrLoading={ocrLoading}
        onSave={saveExpense}
        onOpenLightbox={(imgs, idx) => setLightbox({ images: imgs, idx })}
        cameraRef={cameraRef} fileRef={fileRef}
        onFileSelect={handleFileSelect}
        onRemoveAttachment={removeAttachment}
      />

      <MileageForm
        open={modal === "mileage"}
        onClose={closeModal}
        form={form} setForm={setForm}
        vehicles={vehicles}
        onSave={saveMileage}
      />

      <VehicleForm
        open={modal === "vehicle"}
        onClose={closeModal}
        editingItem={editingItem}
        form={form} setForm={setForm}
        onSave={saveVehicle}
      />

      {modal === "detail" && detailExpense && (
        <DetailSheet
          expense={detailExpense}
          files={detailFiles}
          onClose={() => setModal(null)}
          onOpenLightbox={(imgs, idx) => setLightbox({ images: imgs, idx })}
        />
      )}

      {modal === "delete" && deleteTarget && (
        <DeleteConfirm
          target={deleteTarget}
          onConfirm={handleDelete}
          onCancel={() => { setModal(null); setDeleteTarget(null); }}
        />
      )}

      {/* Lightbox — zIndex 99000, intercepts everything */}
      {lightbox && (
        <Lightbox
          images={lightbox.images}
          initialIndex={lightbox.idx}
          onClose={() => setLightbox(null)}
        />
      )}
    </div>
  );
}