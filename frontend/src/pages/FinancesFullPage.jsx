import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useLocale } from "../context/LocaleContext";
import {
  Plus, Search, DollarSign, TrendingUp, TrendingDown,
  Car, Trash2, Edit, Receipt, Camera, Paperclip, X,
  Image as ImageIcon, AlertTriangle, ChevronDown, Wallet,
  RefreshCw, Eye, Filter, Check, ChevronLeft, ChevronRight,
  GripVertical, ArrowUp, ArrowDown, ArrowUpDown, Download,
  Award
} from "lucide-react";
import { toast } from "sonner";

const API = process.env.REACT_APP_BACKEND_URL;
const getAuth = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${localStorage.getItem("token")}`,
});
const token = () => localStorage.getItem("token");

// ─── Constants ────────────────────────────────────────────────────────────────
const TYPE_LABELS    = { fixed: "Fijo", variable: "Variable", subscription: "Suscripción" };
const TYPE_ICONS     = { fixed: "🏢", variable: "📦", subscription: "🔄" };
const PAYMENT_LABELS = { card: "Tarjeta", cash: "Efectivo", transfer: "Transferencia", check: "Cheque", zelle: "Zelle" };

const TYPE_ACCENT = {
  fixed:        { pill: { bg: "#fee2e2", color: "#b91c1c" }, bar: "#f87171", dot: "#ef4444" },
  variable:     { pill: { bg: "#e0f2fe", color: "#0369a1" }, bar: "#38bdf8", dot: "#0ea5e9" },
  subscription: { pill: { bg: "#ede9fe", color: "#6d28d9" }, bar: "#a78bfa", dot: "#8b5cf6" },
};

const emptyExpense = {
  date: new Date().toISOString().split("T")[0],
  category: "", description: "", amount: "",
  expense_type: "variable", vendor: "", payment_method: "card", notes: "",
};
const emptyMileage = {
  date: new Date().toISOString().split("T")[0],
  vehicle_id: "", driver_name: "", start_odometer: "", end_odometer: "", purpose: "",
};
const emptyVehicle = { name: "", plate: "", make: "", model: "", year: "", status: "active" };

// ─── Formatters ───────────────────────────────────────────────────────────────
const fmtCurrency = (n) =>
  new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", minimumFractionDigits: 0 }).format(n || 0);
const fmtDate = (d) => {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
};

// ─── Design tokens ────────────────────────────────────────────────────────────
const surface = {
  background: "#ffffff",
  borderRadius: "16px",
  border: "1px solid #e2e8f0",
  boxShadow: "0 1px 3px rgba(0,0,0,.04), 0 1px 2px rgba(0,0,0,.03)",
};

const inputBase = {
  width: "100%",
  border: "1px solid #e2e8f0",
  borderRadius: "10px",
  padding: "9px 12px",
  fontSize: "13px",
  color: "#0f172a",
  background: "#f8fafc",
  outline: "none",
  boxSizing: "border-box",
  fontFamily: "inherit",
  transition: "border-color .15s, box-shadow .15s",
};

const primaryBtn = {
  display: "inline-flex", alignItems: "center", gap: "6px",
  padding: "9px 16px", borderRadius: "10px", border: "none",
  background: "#0f172a",
  color: "#fff", fontSize: "13px", fontWeight: 600, cursor: "pointer",
  whiteSpace: "nowrap", letterSpacing: "-.01em",
  transition: "background .15s",
};

const outlineBtn = {
  display: "inline-flex", alignItems: "center", gap: "6px",
  padding: "8px 14px", borderRadius: "10px",
  border: "1px solid #e2e8f0", background: "#fff",
  color: "#475569", fontSize: "13px", fontWeight: 500, cursor: "pointer",
  whiteSpace: "nowrap", letterSpacing: "-.01em",
  transition: "background .15s, border-color .15s",
};

const iconBtn = {
  width: "30px", height: "30px", borderRadius: "8px",
  border: "1px solid #e2e8f0", background: "#fff",
  display: "flex", alignItems: "center", justifyContent: "center",
  cursor: "pointer", color: "#94a3b8", flexShrink: 0,
  transition: "background .1s, color .1s",
};

const sz12 = { width: "12px", height: "12px", pointerEvents: "none" };
const sz13 = { width: "13px", height: "13px", pointerEvents: "none" };
const sz14 = { width: "14px", height: "14px", pointerEvents: "none" };
const sz16 = { width: "16px", height: "16px", pointerEvents: "none" };

// ─── Portal Modal ─────────────────────────────────────────────────────────────
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
        background: "rgba(15,23,42,0.45)", backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: sheet ? "flex-end" : "center",
        justifyContent: "center",
        padding: sheet ? 0 : "20px",
      }}
      onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          background: "#fff", width: "100%", maxWidth,
          borderRadius: sheet ? "20px 20px 0 0" : "20px",
          maxHeight: "90vh", overflowY: "auto",
          boxShadow: "0 32px 80px rgba(0,0,0,.16), 0 0 0 1px rgba(0,0,0,.04)",
          animation: sheet ? "slideUp .22s ease" : "popIn .2s cubic-bezier(.16,1,.3,1)",
        }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <style>{`
          @keyframes popIn{from{opacity:0;transform:scale(.95) translateY(8px)}to{opacity:1;transform:scale(1) translateY(0)}}
          @keyframes slideUp{from{opacity:0;transform:translateY(32px)}to{opacity:1;transform:translateY(0)}}
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
    <div style={{ position: "fixed", inset: 0, zIndex: 99000, background: "#030712",
                  display: "flex", flexDirection: "column" }}
         onClick={stop} onPointerDown={stop}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "14px 20px", background: "rgba(255,255,255,.03)", flexShrink: 0,
                    borderBottom: "1px solid rgba(255,255,255,.06)" }}>
        <span style={{ color: "rgba(255,255,255,.35)", fontSize: "12px", fontFamily: "monospace" }}>
          {idx + 1} / {images.length}
        </span>
        <button onClick={(e) => { e.stopPropagation(); onClose(); }}
          style={{ width: "34px", height: "34px", borderRadius: "8px",
                   border: "1px solid rgba(255,255,255,.12)", background: "rgba(255,255,255,.06)",
                   color: "rgba(255,255,255,.7)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <X style={{ width: "14px", height: "14px", pointerEvents: "none" }} />
        </button>
      </div>
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
                    position: "relative", overflow: "hidden" }}>
        {images.length > 1 && (
          <button onClick={(e) => { e.stopPropagation(); setIdx(i => Math.max(0, i - 1)); }}
            disabled={idx === 0}
            style={{ position: "absolute", left: "16px", width: "40px", height: "40px", borderRadius: "10px",
                     border: "1px solid rgba(255,255,255,.12)", background: "rgba(255,255,255,.06)",
                     color: "rgba(255,255,255,.7)", cursor: idx === 0 ? "default" : "pointer",
                     opacity: idx === 0 ? .25 : 1, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1 }}>
            <ChevronLeft style={{ width: "18px", height: "18px", pointerEvents: "none" }} />
          </button>
        )}
        <img key={idx} src={images[idx]} alt=""
          style={{ maxWidth: "calc(100% - 120px)", maxHeight: "100%", objectFit: "contain",
                   borderRadius: "8px", animation: "fadeImg .15s ease" }} />
        {images.length > 1 && (
          <button onClick={(e) => { e.stopPropagation(); setIdx(i => Math.min(images.length - 1, i + 1)); }}
            disabled={idx === images.length - 1}
            style={{ position: "absolute", right: "16px", width: "40px", height: "40px", borderRadius: "10px",
                     border: "1px solid rgba(255,255,255,.12)", background: "rgba(255,255,255,.06)",
                     color: "rgba(255,255,255,.7)", cursor: idx === images.length - 1 ? "default" : "pointer",
                     opacity: idx === images.length - 1 ? .25 : 1, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1 }}>
            <ChevronRight style={{ width: "18px", height: "18px", pointerEvents: "none" }} />
          </button>
        )}
      </div>
      {images.length > 1 && (
        <div style={{ display: "flex", gap: "6px", justifyContent: "center", padding: "14px 20px",
                      background: "rgba(255,255,255,.02)", flexShrink: 0, flexWrap: "wrap" }}>
          {images.map((src, i) => (
            <button key={i} onClick={(e) => { e.stopPropagation(); setIdx(i); }}
              style={{ width: "44px", height: "44px", borderRadius: "8px", overflow: "hidden", padding: 0,
                       cursor: "pointer",
                       border: i === idx ? "2px solid #fff" : "2px solid rgba(255,255,255,.12)",
                       opacity: i === idx ? 1 : .45, transition: "all .15s" }}>
              <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", pointerEvents: "none" }} />
            </button>
          ))}
        </div>
      )}
      <div style={{ textAlign: "center", padding: "8px", flexShrink: 0 }}>
        <span style={{ color: "rgba(255,255,255,.15)", fontSize: "11px", letterSpacing: ".05em" }}>ESC · ← →</span>
      </div>
    </div>,
    document.body
  );
};

// ─── Modal helpers ────────────────────────────────────────────────────────────
const MHead = ({ title, onClose }) => (
  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "20px 22px 0" }}>
    <h2 style={{ fontSize: "15px", fontWeight: 700, color: "#0f172a", letterSpacing: "-.02em" }}>{title}</h2>
    <button onClick={onClose}
      style={{ ...iconBtn, borderRadius: "50%", width: "30px", height: "30px" }}>
      <X style={sz12} />
    </button>
  </div>
);

const F = ({ label, children }) => (
  <div>
    <label style={{ fontSize: "10px", fontWeight: 700, color: "#94a3b8",
                    textTransform: "uppercase", letterSpacing: ".08em",
                    display: "block", marginBottom: "6px" }}>
      {label}
    </label>
    {children}
  </div>
);

const PBtn = ({ onClick, children, danger }) => (
  <button onClick={onClick} style={{
    width: "100%", padding: "11px", borderRadius: "12px", border: "none",
    background: danger ? "#dc2626" : "#0f172a",
    color: "#fff", fontSize: "14px", fontWeight: 600, cursor: "pointer",
    display: "flex", alignItems: "center", justifyContent: "center", gap: "7px",
    letterSpacing: "-.01em", transition: "opacity .15s",
  }}>
    {children}
  </button>
);

// ─── Stat Card ────────────────────────────────────────────────────────────────
const StatCard = ({ value, sub, icon: Icon, accent, label, index, onDragStart, onDragEnter, onDragEnd }) => {
  const [hov, setHov] = useState(false);
  return (
    <div
      draggable
      onDragStart={() => onDragStart(index)}
      onDragEnter={() => onDragEnter(index)}
      onDragEnd={onDragEnd}
      onDragOver={(e) => e.preventDefault()}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        ...surface,
        padding: "20px",
        position: "relative",
        overflow: "hidden",
        cursor: "grab",
        transition: "box-shadow .2s, transform .2s",
        boxShadow: hov
          ? "0 8px 24px rgba(0,0,0,.1), 0 0 0 1px rgba(0,0,0,.04)"
          : surface.boxShadow,
        transform: hov ? "translateY(-2px)" : "none",
        userSelect: "none",
      }}
    >
      {/* Accent top bar */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, height: "2px",
        background: `linear-gradient(90deg,${accent[0]},${accent[1]})`,
      }} />
      {/* Grip indicator */}
      <div style={{
        position: "absolute", top: "10px", right: "10px", color: "#cbd5e1",
        opacity: hov ? 1 : 0, transition: "opacity .15s",
      }}>
        <GripVertical style={sz12} />
      </div>
      <div style={{ marginBottom: "16px" }}>
        <div style={{
          width: "34px", height: "34px", borderRadius: "10px",
          background: `${accent[0]}15`,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <Icon style={{ width: "15px", height: "15px", color: accent[0] }} />
        </div>
      </div>
      <p style={{
        fontSize: "10px", color: "#94a3b8", fontWeight: 700,
        textTransform: "uppercase", letterSpacing: ".08em", marginBottom: "5px",
      }}>
        {label}
      </p>
      <p style={{ fontSize: "22px", fontWeight: 700, color: "#0f172a", lineHeight: 1.15, letterSpacing: "-.02em" }}>
        {value}
      </p>
      {sub && (
        <p style={{ fontSize: "11px", color: "#94a3b8", marginTop: "5px", fontWeight: 500 }}>{sub}</p>
      )}
    </div>
  );
};

// ─── Expense Row ──────────────────────────────────────────────────────────────
const ExpenseRow = ({ expense, selected, onSelect, onEdit, onDelete, onView, index,
                      onDragStart, onDragEnter, onDragEnd, displayCols }) => {
  const [hov, setHov] = useState(false);
  const acc = TYPE_ACCENT[expense.expense_type] || TYPE_ACCENT.variable;

  return (
    <tr
      draggable
      onDragStart={() => onDragStart(index)}
      onDragEnter={() => onDragEnter(index)}
      onDragEnd={onDragEnd}
      onDragOver={(e) => e.preventDefault()}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: selected ? "#f0f9ff" : hov ? "#f8fafc" : "#fff",
        transition: "background .1s",
        cursor: "default",
        borderBottom: "1px solid #f1f5f9",
      }}
    >
      <td style={{ padding: "11px 14px", width: "36px" }}>
        <input type="checkbox" checked={selected} onChange={onSelect}
          style={{ cursor: "pointer", width: "13px", height: "13px", accentColor: "#0f172a" }} />
      </td>
      <td style={{ padding: "11px 6px", width: "24px" }}>
        <GripVertical style={{ ...sz13, color: hov ? "#94a3b8" : "#e2e8f0", cursor: "grab" }} />
      </td>

      {displayCols.map((col) => {
        if (col === "date") return (
          <td key="date" style={{ padding: "11px 14px", fontSize: "12px", color: "#94a3b8",
                                   whiteSpace: "nowrap", fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>
            {fmtDate(expense.date)}
          </td>
        );
        if (col === "type") return (
          <td key="type" style={{ padding: "11px 14px" }}>
            <span style={{
              display: "inline-flex", alignItems: "center", gap: "5px",
              fontSize: "11px", fontWeight: 600, padding: "3px 9px", borderRadius: "50px",
              background: acc.pill.bg, color: acc.pill.color,
            }}>
              <span style={{ width: "5px", height: "5px", borderRadius: "50%",
                             background: acc.dot, flexShrink: 0 }} />
              {TYPE_LABELS[expense.expense_type]}
            </span>
          </td>
        );
        if (col === "description") return (
          <td key="description" style={{ padding: "11px 14px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <div style={{ width: "2px", height: "26px", borderRadius: "2px",
                            background: acc.bar, flexShrink: 0 }} />
              <div>
                <p style={{ fontSize: "13px", fontWeight: 600, color: "#0f172a",
                            maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis",
                            whiteSpace: "nowrap", letterSpacing: "-.01em" }}>
                  {expense.description}
                </p>
                {expense.vendor && (
                  <p style={{ fontSize: "11px", color: "#94a3b8", marginTop: "1px" }}>{expense.vendor}</p>
                )}
              </div>
            </div>
          </td>
        );
        if (col === "category") return (
          <td key="category" style={{ padding: "11px 14px", fontSize: "12px", color: "#64748b", fontWeight: 500 }}>
            {expense.category || "—"}
          </td>
        );
        if (col === "method") return (
          <td key="method" style={{ padding: "11px 14px", fontSize: "12px", color: "#64748b", fontWeight: 500 }}>
            {PAYMENT_LABELS[expense.payment_method] || "—"}
          </td>
        );
        if (col === "amount") return (
          <td key="amount" style={{ padding: "11px 14px", textAlign: "right",
                                    fontSize: "13px", fontWeight: 700, color: "#0f172a",
                                    fontVariantNumeric: "tabular-nums", letterSpacing: "-.01em" }}>
            {fmtCurrency(expense.amount)}
          </td>
        );
        if (col === "actions") return (
          <td key="actions" style={{ padding: "11px 14px" }}>
            <div style={{ display: "flex", gap: "4px",
                          opacity: hov ? 1 : 0, transition: "opacity .15s", justifyContent: "flex-end" }}>
              <button onClick={() => onView(expense)} style={iconBtn} title="Ver"><Eye style={sz12} /></button>
              <button onClick={() => onEdit(expense)} style={iconBtn} title="Editar"><Edit style={sz12} /></button>
              <button onClick={() => onDelete(expense)} style={{ ...iconBtn, color: "#f87171" }} title="Eliminar">
                <Trash2 style={sz12} />
              </button>
            </div>
          </td>
        );
        return null;
      })}
    </tr>
  );
};

// ─── Detail Sheet ─────────────────────────────────────────────────────────────
const DetailSheet = ({ expense, files, onClose, onOpenLightbox }) => {
  const acc = TYPE_ACCENT[expense.expense_type] || TYPE_ACCENT.variable;
  const imgs = files.filter(f => f.content_type?.startsWith("image/"))
                    .map(f => `${API}${f.url}?auth=${token()}`);
  return (
    <PortalModal open onClose={onClose} maxWidth="480px">
      <div style={{ display: "flex", justifyContent: "center", padding: "12px 0 0" }}>
        <div style={{ width: "36px", height: "4px", borderRadius: "4px", background: "#e2e8f0" }} />
      </div>
      <div style={{ padding: "16px 22px 28px" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "20px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={{ width: "44px", height: "44px", borderRadius: "12px",
                          background: acc.pill.bg,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: "20px", flexShrink: 0 }}>
              {TYPE_ICONS[expense.expense_type]}
            </div>
            <div>
              <p style={{ fontWeight: 700, fontSize: "15px", color: "#0f172a", letterSpacing: "-.01em" }}>
                {expense.description}
              </p>
              <p style={{ fontSize: "12px", color: "#94a3b8", marginTop: "2px" }}>
                {expense.vendor || "Sin proveedor"}
              </p>
            </div>
          </div>
          <button onClick={onClose} style={{ ...iconBtn, borderRadius: "50%", flexShrink: 0, marginLeft: "8px" }}>
            <X style={sz12} />
          </button>
        </div>

        <div style={{
          background: "#f8fafc", borderRadius: "14px",
          padding: "18px 20px", marginBottom: "16px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          border: "1px solid #f1f5f9",
        }}>
          <div>
            <p style={{ fontSize: "10px", color: "#94a3b8", fontWeight: 700,
                        textTransform: "uppercase", letterSpacing: ".08em", marginBottom: "5px" }}>
              Monto
            </p>
            <p style={{ fontSize: "28px", fontWeight: 700, color: "#0f172a",
                        letterSpacing: "-.03em", fontVariantNumeric: "tabular-nums" }}>
              {fmtCurrency(expense.amount)}
            </p>
          </div>
          <span style={{ fontSize: "11px", padding: "4px 10px", borderRadius: "50px",
                         fontWeight: 600, background: acc.pill.bg, color: acc.pill.color }}>
            {TYPE_LABELS[expense.expense_type]}
          </span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "16px" }}>
          {[
            ["Fecha",    fmtDate(expense.date)],
            ["Método",   PAYMENT_LABELS[expense.payment_method] || "—"],
            ["Categoría", expense.category || "—"],
            ["Notas",    expense.notes || "—"],
          ].map(([l, v]) => (
            <div key={l} style={{ background: "#f8fafc", borderRadius: "12px",
                                  padding: "12px 14px", border: "1px solid #f1f5f9" }}>
              <p style={{ fontSize: "10px", color: "#94a3b8", fontWeight: 700,
                          textTransform: "uppercase", letterSpacing: ".08em", marginBottom: "4px" }}>
                {l}
              </p>
              <p style={{ fontSize: "13px", fontWeight: 600, color: "#334155" }}>{v}</p>
            </div>
          ))}
        </div>

        {imgs.length > 0 && (
          <div style={{ background: "#f8fafc", borderRadius: "12px", padding: "14px 16px",
                        border: "1px solid #f1f5f9", marginBottom: "16px" }}>
            <p style={{ fontSize: "10px", color: "#94a3b8", fontWeight: 700,
                        textTransform: "uppercase", letterSpacing: ".08em", marginBottom: "10px" }}>
              Comprobantes ({imgs.length})
            </p>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              {imgs.map((src, i) => (
                <button key={i} onClick={() => onOpenLightbox(imgs, i)}
                  style={{ width: "56px", height: "56px", borderRadius: "10px", overflow: "hidden",
                           border: "1px solid #e2e8f0", padding: 0, cursor: "pointer" }}>
                  <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", pointerEvents: "none" }} />
                </button>
              ))}
            </div>
          </div>
        )}

        <button onClick={onClose}
          style={{ width: "100%", padding: "11px", borderRadius: "12px",
                   border: "1px solid #e2e8f0", background: "#f8fafc",
                   fontSize: "14px", fontWeight: 500, color: "#475569", cursor: "pointer" }}>
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
      <div style={{ display: "flex", gap: "14px", alignItems: "flex-start", marginBottom: "18px" }}>
        <div style={{ width: "42px", height: "42px", borderRadius: "12px", background: "#fee2e2",
                      display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <AlertTriangle style={{ width: "18px", height: "18px", color: "#dc2626" }} />
        </div>
        <div>
          <p style={{ fontWeight: 700, fontSize: "15px", color: "#0f172a", letterSpacing: "-.01em" }}>
            Confirmar eliminación
          </p>
          <p style={{ fontSize: "12px", color: "#94a3b8", marginTop: "3px" }}>
            Esta acción no se puede deshacer
          </p>
        </div>
      </div>
      <div style={{ background: "#fff5f5", borderRadius: "10px", padding: "10px 14px",
                    fontSize: "13px", fontWeight: 500, color: "#7f1d1d", marginBottom: "20px",
                    border: "1px solid #fecaca", wordBreak: "break-word" }}>
        "{target.name}"
      </div>
      <div style={{ display: "flex", gap: "10px" }}>
        <button onClick={onCancel}
          style={{ flex: 1, padding: "11px", borderRadius: "12px", border: "1px solid #e2e8f0",
                   background: "#fff", fontSize: "14px", fontWeight: 500, color: "#475569", cursor: "pointer" }}>
          Cancelar
        </button>
        <button onClick={onConfirm}
          style={{ flex: 1, padding: "11px", borderRadius: "12px", border: "none",
                   background: "#dc2626", fontSize: "14px", fontWeight: 600,
                   color: "#fff", cursor: "pointer",
                   display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}>
          <Trash2 style={sz13} /> Eliminar
        </button>
      </div>
    </div>
  </PortalModal>
);

// ─── Expense Form ─────────────────────────────────────────────────────────────
const ExpenseForm = ({
  open, onClose, editingItem, form, setForm, categories,
  attachments, existingFiles, ocrLoading, onSave, onOpenLightbox,
  cameraRef, fileRef, onFileSelect, onRemoveAttachment,
}) => (
  <PortalModal open={open} onClose={onClose} maxWidth="500px">
    <MHead title={editingItem ? "Editar Gasto" : "Nuevo Gasto"} onClose={onClose} />
    <div style={{ padding: "16px 22px 22px", display: "flex", flexDirection: "column", gap: "13px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
        <F label="Fecha">
          <input type="date" value={form.date || ""} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} style={inputBase} />
        </F>
        <F label="Monto">
          <input type="number" step="0.01" placeholder="0.00" value={form.amount || ""}
            onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} style={inputBase} />
        </F>
      </div>
      <F label="Descripción">
        <input value={form.description || ""} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
          placeholder="Ej: Compra de insumos" style={inputBase} />
      </F>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
        <F label="Categoría">
          <select value={form.category || ""} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
            style={{ ...inputBase, cursor: "pointer" }}>
            <option value="">Seleccionar</option>
            {categories.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
          </select>
        </F>
        <F label="Tipo">
          <select value={form.expense_type || "variable"} onChange={e => setForm(f => ({ ...f, expense_type: e.target.value }))}
            style={{ ...inputBase, cursor: "pointer" }}>
            <option value="fixed">Fijo</option>
            <option value="variable">Variable</option>
            <option value="subscription">Suscripción</option>
          </select>
        </F>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
        <F label="Proveedor">
          <input value={form.vendor || ""} onChange={e => setForm(f => ({ ...f, vendor: e.target.value }))}
            placeholder="Nombre del proveedor" style={inputBase} />
        </F>
        <F label="Método de Pago">
          <select value={form.payment_method || "card"} onChange={e => setForm(f => ({ ...f, payment_method: e.target.value }))}
            style={{ ...inputBase, cursor: "pointer" }}>
            {Object.entries(PAYMENT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </F>
      </div>
      <F label="Notas">
        <textarea value={form.notes || ""} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
          rows={2} placeholder="Información adicional..."
          style={{ ...inputBase, resize: "none", lineHeight: "1.5" }} />
      </F>

      <F label="Comprobante">
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={onFileSelect} />
        <input ref={fileRef} type="file" accept="image/*,.pdf" multiple style={{ display: "none" }} onChange={onFileSelect} />
        <div style={{ display: "flex", gap: "8px" }}>
          {[["📷 Foto", () => cameraRef.current?.click()], ["📎 Adjuntar", () => fileRef.current?.click()]].map(([label, action]) => (
            <button key={label} type="button" onClick={action}
              style={{ flex: 1, padding: "9px", borderRadius: "10px",
                       border: "1px solid #e2e8f0", background: "#f8fafc",
                       fontSize: "12px", color: "#475569", cursor: "pointer",
                       display: "flex", alignItems: "center", justifyContent: "center", gap: "5px", fontWeight: 500 }}>
              {label}
            </button>
          ))}
        </div>
        {ocrLoading && (
          <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 12px",
                        background: "#fffbeb", border: "1px solid #fde68a",
                        borderRadius: "10px", fontSize: "12px", color: "#92400e", marginTop: "8px" }}>
            <div style={{ width: "12px", height: "12px", border: "2px solid #f59e0b",
                          borderTopColor: "transparent", borderRadius: "50%",
                          animation: "spin 1s linear infinite", flexShrink: 0 }} />
            Escaneando recibo con IA…
          </div>
        )}
        {attachments.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginTop: "8px" }}>
            {attachments.map((a, i) => (
              <div key={i} style={{ position: "relative" }}>
                {a.preview
                  ? <button type="button" onClick={() => onOpenLightbox([a.preview], 0)}
                      style={{ display: "block", padding: 0, border: "none", background: "none", cursor: "pointer" }}>
                      <img src={a.preview} alt="" style={{ width: "56px", height: "56px", objectFit: "cover",
                                                           borderRadius: "10px", border: "1px solid #e2e8f0", display: "block" }} />
                    </button>
                  : <div style={{ width: "56px", height: "56px", borderRadius: "10px",
                                  background: "#f1f5f9", border: "1px solid #e2e8f0",
                                  display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Receipt style={sz16} />
                    </div>
                }
                {a.uploading && (
                  <div style={{ position: "absolute", inset: 0, background: "rgba(255,255,255,.75)",
                                borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <div style={{ width: "14px", height: "14px", border: "2px solid #0f172a",
                                  borderTopColor: "transparent", borderRadius: "50%",
                                  animation: "spin 1s linear infinite" }} />
                  </div>
                )}
                {a.uploaded && !a.uploading && (
                  <div style={{ position: "absolute", top: "-4px", right: "-4px", width: "16px", height: "16px",
                                borderRadius: "50%", background: "#10b981",
                                display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Check style={{ width: "9px", height: "9px", color: "#fff", pointerEvents: "none" }} />
                  </div>
                )}
                {!a.uploading && (
                  <button onClick={(e) => { e.stopPropagation(); onRemoveAttachment(i); }}
                    style={{ position: "absolute", top: "-4px", left: "-4px", width: "18px", height: "18px",
                             borderRadius: "50%", background: "#ef4444", border: "none",
                             display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                    <X style={{ width: "10px", height: "10px", color: "#fff", pointerEvents: "none" }} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
        {existingFiles.length > 0 && (
          <div style={{ marginTop: "10px" }}>
            <p style={{ fontSize: "10px", color: "#94a3b8", fontWeight: 700,
                        textTransform: "uppercase", letterSpacing: ".08em", marginBottom: "6px" }}>
              Archivos guardados
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
              {existingFiles.map((f) => {
                const isImg = f.content_type?.startsWith("image/");
                const url = `${API}${f.url}?auth=${token()}`;
                const allImgs = existingFiles.filter(x => x.content_type?.startsWith("image/"))
                                             .map(x => `${API}${x.url}?auth=${token()}`);
                return isImg
                  ? <button key={f.id} type="button" onClick={() => onOpenLightbox(allImgs, allImgs.indexOf(url))}
                      style={{ padding: 0, border: "none", background: "none", cursor: "pointer" }}>
                      <img src={url} alt={f.original_filename}
                        style={{ width: "56px", height: "56px", objectFit: "cover",
                                 borderRadius: "10px", border: "1px solid #e2e8f0", display: "block" }} />
                    </button>
                  : <a key={f.id} href={url} target="_blank" rel="noopener noreferrer"
                      style={{ display: "inline-flex", alignItems: "center", gap: "5px",
                               padding: "5px 10px", background: "#eff6ff", border: "1px solid #bfdbfe",
                               borderRadius: "8px", fontSize: "11px", color: "#1d4ed8", textDecoration: "none" }}>
                      <ImageIcon style={sz12} /> {f.original_filename || "archivo"}
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
    <MHead title="Registrar Millaje" onClose={onClose} />
    <div style={{ padding: "16px 22px 22px", display: "flex", flexDirection: "column", gap: "13px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
        <F label="Fecha">
          <input type="date" value={form.date || ""} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} style={inputBase} />
        </F>
        <F label="Vehículo">
          <select value={form.vehicle_id || ""} onChange={e => setForm(f => ({ ...f, vehicle_id: e.target.value }))}
            style={{ ...inputBase, cursor: "pointer" }}>
            <option value="">Seleccionar</option>
            {vehicles.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        </F>
      </div>
      <F label="Conductor">
        <input value={form.driver_name || ""} onChange={e => setForm(f => ({ ...f, driver_name: e.target.value }))}
          placeholder="Nombre del conductor" style={inputBase} />
      </F>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
        <F label="Odómetro Inicio">
          <input type="number" value={form.start_odometer || ""} onChange={e => setForm(f => ({ ...f, start_odometer: e.target.value }))} style={inputBase} />
        </F>
        <F label="Odómetro Final">
          <input type="number" value={form.end_odometer || ""} onChange={e => setForm(f => ({ ...f, end_odometer: e.target.value }))} style={inputBase} />
        </F>
      </div>
      <F label="Propósito">
        <input value={form.purpose || ""} onChange={e => setForm(f => ({ ...f, purpose: e.target.value }))}
          placeholder="Ej: Entregas zona norte" style={inputBase} />
      </F>
      <PBtn onClick={onSave}>Registrar Millaje</PBtn>
    </div>
  </PortalModal>
);

// ─── Vehicle Form ─────────────────────────────────────────────────────────────
const VehicleForm = ({ open, onClose, editingItem, form, setForm, onSave }) => (
  <PortalModal open={open} onClose={onClose} maxWidth="460px">
    <MHead title={editingItem ? "Editar Vehículo" : "Nuevo Vehículo"} onClose={onClose} />
    <div style={{ padding: "16px 22px 22px", display: "flex", flexDirection: "column", gap: "13px" }}>
      <F label="Nombre *">
        <input value={form.name || ""} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
          placeholder="Ej: Van Principal" style={inputBase} />
      </F>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 80px", gap: "10px" }}>
        <F label="Marca">
          <input value={form.make || ""} onChange={e => setForm(f => ({ ...f, make: e.target.value }))} style={inputBase} />
        </F>
        <F label="Modelo">
          <input value={form.model || ""} onChange={e => setForm(f => ({ ...f, model: e.target.value }))} style={inputBase} />
        </F>
        <F label="Año">
          <input type="number" value={form.year || ""} onChange={e => setForm(f => ({ ...f, year: e.target.value }))} style={inputBase} />
        </F>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
        <F label="Placas">
          <input value={form.plate || ""} onChange={e => setForm(f => ({ ...f, plate: e.target.value }))}
            style={{ ...inputBase, fontFamily: "monospace" }} />
        </F>
        <F label="Estado">
          <select value={form.status || "active"} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
            style={{ ...inputBase, cursor: "pointer" }}>
            <option value="active">Activo</option>
            <option value="maintenance">Mantenimiento</option>
            <option value="inactive">Inactivo</option>
          </select>
        </F>
      </div>
      <PBtn onClick={onSave}>{editingItem ? "Actualizar Vehículo" : "Crear Vehículo"}</PBtn>
    </div>
  </PortalModal>
);

// ─── Mileage Card ─────────────────────────────────────────────────────────────
const MileageCard = ({ record }) => (
  <div style={{ ...surface, padding: "16px 20px", display: "flex", alignItems: "center", gap: "16px" }}>
    <div style={{ width: "40px", height: "40px", borderRadius: "12px", background: "#e0f2fe",
                  display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      <Car style={{ width: "17px", height: "17px", color: "#0369a1" }} />
    </div>
    <div style={{ flex: 1, minWidth: 0 }}>
      <p style={{ fontSize: "14px", fontWeight: 600, color: "#0f172a", letterSpacing: "-.01em" }}>
        {record.driver_name || "Conductor"}
      </p>
      <p style={{ fontSize: "12px", color: "#94a3b8", marginTop: "2px" }}>{fmtDate(record.date)}</p>
      {record.purpose && (
        <span style={{ fontSize: "11px", padding: "2px 8px", borderRadius: "50px", marginTop: "6px",
                       display: "inline-block", background: "#f1f5f9", color: "#64748b",
                       fontWeight: 500, border: "1px solid #e2e8f0" }}>
          {record.purpose}
        </span>
      )}
    </div>
    <div style={{ display: "flex", gap: "24px", flexShrink: 0 }}>
      <div style={{ textAlign: "right" }}>
        <p style={{ fontSize: "10px", color: "#94a3b8", marginBottom: "3px", fontWeight: 700,
                    textTransform: "uppercase", letterSpacing: ".08em" }}>Millas</p>
        <p style={{ fontSize: "16px", fontWeight: 700, color: "#0f172a", letterSpacing: "-.01em" }}>
          {(record.miles || 0).toFixed(1)}
        </p>
      </div>
      <div style={{ textAlign: "right" }}>
        <p style={{ fontSize: "10px", color: "#94a3b8", marginBottom: "3px", fontWeight: 700,
                    textTransform: "uppercase", letterSpacing: ".08em" }}>Reembolso</p>
        <p style={{ fontSize: "16px", fontWeight: 700, color: "#059669", letterSpacing: "-.01em" }}>
          {fmtCurrency(record.reimbursement)}
        </p>
      </div>
    </div>
  </div>
);

// ─── Vehicle Card ─────────────────────────────────────────────────────────────
const VehicleCard = ({ vehicle, onEdit, onDelete }) => {
  const [hov, setHov] = useState(false);
  const statusCfg = {
    active:      { bg: "#dcfce7", color: "#15803d", label: "Activo" },
    maintenance: { bg: "#fef9c3", color: "#a16207", label: "Mantenimiento" },
    inactive:    { bg: "#fee2e2", color: "#b91c1c", label: "Inactivo" },
  }[vehicle.status] || { bg: "#f1f5f9", color: "#64748b", label: vehicle.status };

  return (
    <div
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        ...surface, overflow: "hidden",
        boxShadow: hov ? "0 8px 28px rgba(0,0,0,.1), 0 0 0 1px rgba(0,0,0,.04)" : surface.boxShadow,
        transform: hov ? "translateY(-2px)" : "none", transition: "all .2s",
      }}
    >
      <div style={{ height: "2px", background: "linear-gradient(90deg,#818cf8,#8b5cf6)" }} />
      <div style={{ padding: "18px" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={{ width: "42px", height: "42px", borderRadius: "12px", background: "#ede9fe",
                          display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Car style={{ width: "18px", height: "18px", color: "#7c3aed" }} />
            </div>
            <div>
              <p style={{ fontWeight: 700, fontSize: "14px", color: "#0f172a", letterSpacing: "-.01em" }}>
                {vehicle.name}
              </p>
              <p style={{ fontSize: "12px", color: "#94a3b8", marginTop: "2px" }}>
                {[vehicle.make, vehicle.model, vehicle.year].filter(Boolean).join(" ")}
              </p>
            </div>
          </div>
          <div style={{ display: "flex", gap: "4px", opacity: hov ? 1 : 0, transition: "opacity .15s" }}>
            <button onClick={() => onEdit(vehicle)} style={iconBtn}><Edit style={sz12} /></button>
            <button onClick={() => onDelete(vehicle)} style={{ ...iconBtn, color: "#f87171" }}><Trash2 style={sz12} /></button>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
          {vehicle.plate && (
            <span style={{ fontSize: "11px", fontFamily: "monospace", padding: "3px 9px",
                           borderRadius: "6px", background: "#f8fafc",
                           color: "#64748b", border: "1px solid #e2e8f0", fontWeight: 600 }}>
              {vehicle.plate}
            </span>
          )}
          <span style={{ fontSize: "11px", fontWeight: 600, padding: "3px 9px", borderRadius: "50px",
                         background: statusCfg.bg, color: statusCfg.color }}>
            {statusCfg.label}
          </span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
                      paddingTop: "12px", borderTop: "1px solid #f1f5f9" }}>
          <span style={{ fontSize: "12px", color: "#94a3b8", fontWeight: 500 }}>Millas totales</span>
          <span style={{ fontSize: "13px", fontWeight: 700, color: "#0f172a", letterSpacing: "-.01em" }}>
            {(vehicle.total_miles || 0).toFixed(0)} mi
          </span>
        </div>
      </div>
    </div>
  );
};

// ─── Sort Icon ────────────────────────────────────────────────────────────────
const SortIcon = ({ col, sortKey, sortDir }) => {
  if (sortKey !== col) return <ArrowUpDown style={{ ...sz12, opacity: .25 }} />;
  return sortDir === "asc" ? <ArrowUp style={sz12} /> : <ArrowDown style={sz12} />;
};

// ─── Empty State ──────────────────────────────────────────────────────────────
const Empty = ({ icon: Icon, message, action }) => (
  <div style={{ ...surface, padding: "60px 20px", textAlign: "center" }}>
    <Icon style={{ width: "36px", height: "36px", color: "#e2e8f0", margin: "0 auto 12px", display: "block" }} />
    <p style={{ color: "#94a3b8", fontSize: "14px", marginBottom: action ? "16px" : 0 }}>{message}</p>
    {action}
  </div>
);

// ════════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ════════════════════════════════════════════════════════════════════════════════
const ALL_EXPENSE_COLS = [
  { key: "date",        label: "Fecha",       sortable: true  },
  { key: "type",        label: "Tipo",        sortable: true  },
  { key: "description", label: "Descripción", sortable: true  },
  { key: "category",    label: "Categoría",   sortable: true  },
  { key: "method",      label: "Método",      sortable: false },
  { key: "amount",      label: "Monto",       sortable: true  },
  { key: "actions",     label: "",            sortable: false },
];
const PAGE_SIZES = [10, 25, 50];

const STAT_DEFS = [
  { key: "orderRevenue", label: "Ingresos (Órdenes)", icon: TrendingUp,   accent: ["#10b981", "#14b8a6"] },
  { key: "membership",   label: "Membresías",        icon: Award,         accent: ["#8b5cf6", "#c084fc"] },
  { key: "totalRevenue", label: "Ingresos Total",    icon: DollarSign,    accent: ["#3b82f6", "#60a5fa"] },
  { key: "expenses",     label: "Gastos",            icon: TrendingDown,  accent: ["#f87171", "#ef4444"] },
  { key: "net",          label: "Utilidad Neta",     icon: DollarSign,    accent: ["#06b6d4", "#22d3ee"] },
  { key: "mileage",      label: "Millaje Total",     icon: Car,           accent: ["#f59e0b", "#fbbf24"] },
];

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

  const [search, setSearch]             = useState("");
  const [typeFilter, setTypeFilter]     = useState("");
  const [sortKey, setSortKey]           = useState("date");
  const [sortDir, setSortDir]           = useState("desc");
  const [page, setPage]                 = useState(1);
  const [pageSize, setPageSize]         = useState(25);
  const [selectedRows, setSelectedRows] = useState(new Set());
  const [showColPicker, setShowColPicker] = useState(false);
  const [visibleCols, setVisibleCols]   = useState(new Set(ALL_EXPENSE_COLS.map(c => c.key)));
  const [colOrder, setColOrder]         = useState(ALL_EXPENSE_COLS.map(c => c.key));
  const [statOrder, setStatOrder]       = useState([0, 1, 2, 3]);

  const [modal, setModal]               = useState(null);
  const [editingItem, setEditingItem]   = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [detailExpense, setDetailExpense] = useState(null);
  const [detailFiles, setDetailFiles]   = useState([]);
  const [lightbox, setLightbox]         = useState(null);

  const [form, setForm]                   = useState({});
  const [attachments, setAttachments]     = useState([]);
  const [existingFiles, setExistingFiles] = useState([]);
  const [ocrLoading, setOcrLoading]       = useState(false);

  const cameraRef      = useRef(null);
  const fileRef        = useRef(null);
  const attachmentsRef = useRef([]);
  useEffect(() => { attachmentsRef.current = attachments; }, [attachments]);

  const dragStat   = useRef(null); const dragStatOv  = useRef(null);
  const dragRow    = useRef(null); const dragRowOv   = useRef(null);
  const dragCol    = useRef(null); const dragColOv   = useRef(null);

  // ── Loaders ────────────────────────────────────────────────────────────────
  const loadDashboard = useCallback(async () => {
    try {
      const r = await fetch(`${API}/api/finances/dashboard?period=${period}`, { headers: getAuth() });
      if (r.ok) setDashboard(await r.json());
    } catch {} finally { setLoading(false); }
  }, [period]);

  const loadExpenses = useCallback(async () => {
    try {
      const p = new URLSearchParams();
      if (typeFilter) p.append("expense_type", typeFilter);
      if (search) p.append("search", search);
      const r = await fetch(`${API}/api/finances/expenses?${p}`, { headers: getAuth() });
      if (r.ok) setExpenses(await r.json());
    } catch { toast.error("Error cargando gastos"); }
  }, [typeFilter, search]);

  const loadCategories = useCallback(async () => {
    try { const r = await fetch(`${API}/api/finances/categories`, { headers: getAuth() }); if (r.ok) setCategories(await r.json()); } catch {}
  }, []);
  const loadMileage = useCallback(async () => {
    try { const r = await fetch(`${API}/api/finances/mileage`, { headers: getAuth() }); if (r.ok) setMileage(await r.json()); } catch {}
  }, []);
  const loadVehicles = useCallback(async () => {
    try { const r = await fetch(`${API}/api/finances/vehicles`, { headers: getAuth() }); if (r.ok) setVehicles(await r.json()); } catch {}
  }, []);

  useEffect(() => { loadDashboard(); loadCategories(); }, [loadDashboard, loadCategories]);
  useEffect(() => { loadExpenses(); }, [loadExpenses]);
  useEffect(() => {
    if (activeTab === "mileage") { loadMileage(); loadVehicles(); }
    if (activeTab === "vehicles") loadVehicles();
  }, [activeTab, loadMileage, loadVehicles]);

  // ── Derived data ────────────────────────────────────────────────────────────
  const sorted = [...expenses].sort((a, b) => {
    let va = sortKey === "amount" ? Number(a.amount) : a[sortKey] ?? "";
    let vb = sortKey === "amount" ? Number(b.amount) : b[sortKey] ?? "";
    if (va < vb) return sortDir === "asc" ? -1 : 1;
    if (va > vb) return sortDir === "asc" ?  1 : -1;
    return 0;
  });

  const totalPages  = Math.max(1, Math.ceil(sorted.length / pageSize));
  const pageStart   = (page - 1) * pageSize;
  const paginated   = sorted.slice(pageStart, pageStart + pageSize);
  const displayCols = colOrder.filter(k => visibleCols.has(k));

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
    setPage(1);
  };

  const onStatDragStart = (i) => { dragStat.current = i; };
  const onStatDragEnter = (i) => { dragStatOv.current = i; };
  const onStatDragEnd   = () => {
    if (dragStat.current !== null && dragStatOv.current !== null && dragStat.current !== dragStatOv.current) {
      const n = [...statOrder]; const [m] = n.splice(dragStat.current, 1); n.splice(dragStatOv.current, 0, m); setStatOrder(n);
    }
    dragStat.current = dragStatOv.current = null;
  };

  const onColDragStart = (e, i) => { dragCol.current = i; e.dataTransfer.effectAllowed = "move"; };
  const onColDragEnter = (i)    => { dragColOv.current = i; };
  const onColDragEnd   = ()     => {
    if (dragCol.current !== null && dragColOv.current !== null && dragCol.current !== dragColOv.current) {
      const n = [...colOrder]; const [m] = n.splice(dragCol.current, 1); n.splice(dragColOv.current, 0, m); setColOrder(n);
    }
    dragCol.current = dragColOv.current = null;
  };

  const onRowDragStart = (i) => { dragRow.current = i; };
  const onRowDragEnter = (i) => { dragRowOv.current = i; };
  const onRowDragEnd   = () => {
    if (dragRow.current !== null && dragRowOv.current !== null && dragRow.current !== dragRowOv.current) {
      const n = [...expenses];
      const si = pageStart + dragRow.current; const di = pageStart + dragRowOv.current;
      const [m] = n.splice(si, 1); n.splice(di, 0, m); setExpenses(n);
    }
    dragRow.current = dragRowOv.current = null;
  };

  const toggleRow   = (id) => setSelectedRows(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll   = ()   => setSelectedRows(s => s.size === paginated.length ? new Set() : new Set(paginated.map(e => e.id)));
  const allSelected = paginated.length > 0 && selectedRows.size === paginated.length;

  const exportCSV = () => {
    const rows = selectedRows.size > 0 ? sorted.filter(e => selectedRows.has(e.id)) : sorted;
    if (!rows.length) { toast.error("Sin gastos para exportar"); return; }
    const esc  = v => `"${`${v ?? ""}`.replace(/"/g, '""')}"`;
    const hdr  = ["Fecha", "Tipo", "Descripción", "Categoría", "Proveedor", "Método", "Monto", "Notas"];
    const body = rows.map(e => [fmtDate(e.date), e.expense_type, e.description, e.category, e.vendor, e.payment_method, e.amount, e.notes]);
    const csv  = [hdr.map(esc).join(","), ...body.map(r => r.map(esc).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    Object.assign(document.createElement("a"), { href: url, download: `gastos.csv` }).click();
    URL.revokeObjectURL(url);
    toast.success(`${rows.length} gastos exportados`);
  };

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
          method: "POST", headers: { Authorization: `Bearer ${token()}` }, body: fd,
        });
        if (r.ok) {
          const d = await r.json();
          setAttachments(prev => { const u = [...prev]; if (u[idx]) u[idx] = { ...u[idx], uploading: false, uploaded: true, uploadedId: d.id }; return u; });
          if (file.type.startsWith("image/") && modal === "expense") {
            setOcrLoading(true);
            try {
              const or = await fetch(`${API}/api/files/ocr/${d.id}`, { method: "POST", headers: { Authorization: `Bearer ${token()}` } });
              if (or.ok) {
                const od = await or.json();
                setForm(prev => ({ ...prev, ...(od.amount && { amount: String(od.amount) }), ...(od.description && { description: od.description }), ...(od.date && { date: od.date }), ...(od.vendor && { vendor: od.vendor }) }));
                toast.success("Recibo escaneado");
              }
            } catch {} finally { setOcrLoading(false); }
          }
        } else {
          setAttachments(prev => { const u = [...prev]; if (u[idx]) u[idx] = { ...u[idx], uploading: false, error: true }; return u; });
        }
      } catch { setAttachments(prev => { const u = [...prev]; if (u[idx]) u[idx] = { ...u[idx], uploading: false, error: true }; return u; }); }
    }
  };

  const removeAttachment = (i) => {
    setAttachments(prev => { const u = [...prev]; if (u[i]?.preview) URL.revokeObjectURL(u[i].preview); u.splice(i, 1); return u; });
  };

  const linkFiles = async (eid) => {
    for (const a of attachmentsRef.current) {
      if (a.uploaded && a.uploadedId) {
        try { await fetch(`${API}/api/files/${a.uploadedId}/context?context=expense:${eid}`, { method: "PATCH", headers: { Authorization: `Bearer ${token()}` } }); } catch {}
      }
    }
  };

  const loadExistingFiles = async (id) => {
    try { const r = await fetch(`${API}/api/files/by-context/expense/${id}`, { headers: { Authorization: `Bearer ${token()}` } }); if (r.ok) setExistingFiles(await r.json()); }
    catch { setExistingFiles([]); }
  };

  // ── CRUD ───────────────────────────────────────────────────────────────────
  const closeModal = () => { setModal(null); setEditingItem(null); setForm({}); setAttachments([]); setExistingFiles([]); };

  const openExpense = (exp = null) => {
    if (exp) { setEditingItem(exp); setForm(exp); loadExistingFiles(exp.id); }
    else { setEditingItem(null); setForm(emptyExpense); setAttachments([]); setExistingFiles([]); }
    setModal("expense");
  };

  const openDetail = async (exp) => {
    setDetailExpense(exp); setDetailFiles([]);
    try { const r = await fetch(`${API}/api/files/by-context/expense/${exp.id}`, { headers: { Authorization: `Bearer ${token()}` } }); if (r.ok) setDetailFiles(await r.json()); } catch {}
    setModal("detail");
  };

  const saveExpense = async () => {
    if (!form.description || !form.amount) { toast.error("Descripción y monto requeridos"); return; }
    const method = editingItem ? "PUT" : "POST";
    const url    = editingItem ? `${API}/api/finances/expenses/${editingItem.id}` : `${API}/api/finances/expenses`;
    try {
      const r = await fetch(url, { method, headers: getAuth(), body: JSON.stringify({ ...form, amount: parseFloat(form.amount) }) });
      if (r.ok) {
        const saved = await r.json();
        if ((editingItem?.id || saved.id) && attachmentsRef.current.some(a => a.uploaded)) await linkFiles(editingItem?.id || saved.id);
        toast.success(editingItem ? "Gasto actualizado" : "Gasto creado");
        closeModal(); loadExpenses(); loadDashboard();
      } else toast.error("Error al guardar");
    } catch { toast.error("Error de conexión"); }
  };

  const saveMileage = async () => {
    if (!form.start_odometer || !form.end_odometer) { toast.error("Odómetros requeridos"); return; }
    try {
      const r = await fetch(`${API}/api/finances/mileage`, {
        method: "POST", headers: getAuth(),
        body: JSON.stringify({ ...form, start_odometer: parseFloat(form.start_odometer), end_odometer: parseFloat(form.end_odometer) }),
      });
      if (r.ok) { toast.success("Millaje registrado"); closeModal(); loadMileage(); loadDashboard(); }
      else toast.error("Error al registrar");
    } catch { toast.error("Error de conexión"); }
  };

  const saveVehicle = async () => {
    if (!form.name) { toast.error("Nombre requerido"); return; }
    const method = editingItem ? "PUT" : "POST";
    const url    = editingItem ? `${API}/api/finances/vehicles/${editingItem.id}` : `${API}/api/finances/vehicles`;
    try {
      const r = await fetch(url, { method, headers: getAuth(), body: JSON.stringify({ ...form, year: form.year ? parseInt(form.year) : null }) });
      if (r.ok) { toast.success(editingItem ? "Actualizado" : "Vehículo creado"); closeModal(); loadVehicles(); }
      else toast.error("Error al guardar");
    } catch { toast.error("Error de conexión"); }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      const r = await fetch(`${API}/api/finances/${deleteTarget.type}s/${deleteTarget.id}`, { method: "DELETE", headers: getAuth() });
      if (r.ok) {
        toast.success("Eliminado");
        if (deleteTarget.type === "expense") { loadExpenses(); loadDashboard(); } else loadVehicles();
        setDeleteTarget(null); setModal(null);
      } else toast.error("Error al eliminar");
    } catch { toast.error("Error de conexión"); }
  };

  // ── Dashboard values ────────────────────────────────────────────────────────
  const totalRevenue = (dashboard?.order_revenue || 0) + (dashboard?.membership_revenue || 0);
  const statValues = {
    orderRevenue: { value: fmtCurrency(dashboard?.order_revenue || 0), sub: "Órdenes + Tienda" },
    membership:   { value: fmtCurrency(dashboard?.membership_revenue || 0), sub: "Pagos de membresías" },
    totalRevenue: { value: fmtCurrency(totalRevenue), sub: "Suma total" },
    expenses:     { value: fmtCurrency(dashboard?.total_expenses || 0), sub: "Gastos operativos" },
    net:          { value: fmtCurrency(dashboard?.net_income || 0), sub: dashboard?.net_income >= 0 ? "Ganancia" : "Pérdida" },
    mileage:      { value: `${(dashboard?.mileage?.total_miles || 0).toFixed(0)} mi`, sub: `${dashboard?.mileage?.total_trips || 0} viajes` },
  };

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc" }}>
      <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "28px 20px" }}>

        {/* ── Header ── */}
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center",
                      justifyContent: "space-between", gap: "14px", marginBottom: "28px" }}>
          <div>
            <h1 style={{ fontSize: "22px", fontWeight: 700, color: "#0f172a", letterSpacing: "-.03em",
                         display: "flex", alignItems: "center", gap: "10px" }}>
              <div style={{ width: "34px", height: "34px", borderRadius: "10px", background: "#f1f5f9",
                            display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Wallet style={{ width: "16px", height: "16px", color: "#475569" }} />
              </div>
              {t("Finances", "Finanzas")}
            </h1>
            <p style={{ fontSize: "13px", color: "#94a3b8", marginTop: "4px", marginLeft: "44px",
                        fontWeight: 500 }}>
              Control financiero operativo
            </p>
          </div>
          <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
            <select value={period} onChange={e => setPeriod(e.target.value)}
              style={{ ...inputBase, width: "auto", cursor: "pointer", fontWeight: 500 }}>
              <option value="day">Hoy</option>
              <option value="week">Esta semana</option>
              <option value="month">Este mes</option>
              <option value="year">Este año</option>
            </select>
            <button onClick={() => { loadDashboard(); loadExpenses(); }} style={outlineBtn}>
              <RefreshCw style={sz13} /> Actualizar
            </button>
          </div>
        </div>

        {/* ── Stat Cards ── */}
        {!loading && dashboard && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px,1fr))", gap: "14px", marginBottom: "20px" }}>
            {statOrder.map((defIdx, i) => {
              const def = STAT_DEFS[defIdx];
              const vals = statValues[def.key];
              if (!vals) return null;
              return (
                <StatCard
                  key={defIdx}
                  index={i}
                  icon={def.icon}
                  accent={def.accent}
                  label={def.label}
                  value={vals.value}
                  sub={vals.sub}
                  onDragStart={onStatDragStart}
                  onDragEnter={onStatDragEnter}
                  onDragEnd={onStatDragEnd}
                />
              );
            })}
          </div>
        )}
        {loading && (
          <div style={{ display: "flex", justifyContent: "center", padding: "40px 0" }}>
            <div style={{ width: "24px", height: "24px", border: "2px solid #0f172a",
                          borderTopColor: "transparent", borderRadius: "50%",
                          animation: "spin 1s linear infinite" }} />
          </div>
        )}

        {/* ── Category Breakdown ── */}
        {dashboard?.by_category && Object.keys(dashboard.by_category).length > 0 && (
          <div style={{ ...surface, padding: "20px 22px", marginBottom: "18px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "18px" }}>
              <Filter style={{ width: "13px", height: "13px", color: "#94a3b8" }} />
              <span style={{ fontSize: "12px", fontWeight: 700, color: "#0f172a",
                             textTransform: "uppercase", letterSpacing: ".06em" }}>
                Gastos por categoría
              </span>
            </div>
            {Object.entries(dashboard.by_category).map(([cat, amt], i) => {
              const pct = dashboard.total_expenses > 0 ? (amt / dashboard.total_expenses) * 100 : 0;
              const barColors = ["#10b981", "#818cf8", "#f59e0b", "#38bdf8", "#f87171"];
              return (
                <div key={cat} style={{ marginBottom: "14px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                    <span style={{ fontSize: "13px", fontWeight: 600, color: "#334155", letterSpacing: "-.01em" }}>
                      {cat}
                    </span>
                    <span style={{ fontSize: "12px", color: "#94a3b8", fontWeight: 500,
                                   fontVariantNumeric: "tabular-nums" }}>
                      {fmtCurrency(amt)} · {pct.toFixed(1)}%
                    </span>
                  </div>
                  <div style={{ height: "4px", background: "#f1f5f9", borderRadius: "50px", overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${pct}%`, borderRadius: "50px",
                                  background: barColors[i % barColors.length],
                                  transition: "width .7s ease" }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Tabs ── */}
        <div style={{ ...surface, padding: "5px", display: "flex", gap: "4px", marginBottom: "18px" }}>
          {[
            { key: "expenses", label: "Gastos" },
            { key: "mileage",  label: "Millaje" },
            { key: "vehicles", label: "Vehículos" },
          ].map(({ key, label }) => (
            <button key={key} onClick={() => setActiveTab(key)} style={{
              flex: 1, padding: "10px", borderRadius: "10px", border: "none",
              fontSize: "13px", fontWeight: 600, cursor: "pointer", transition: "all .2s",
              letterSpacing: "-.01em",
              background: activeTab === key ? "#0f172a" : "transparent",
              color: activeTab === key ? "#fff" : "#64748b",
            }}>{label}</button>
          ))}
        </div>

        {/* ══ TAB: Expenses ══════════════════════════════════════════════════ */}
        {activeTab === "expenses" && (
          <div style={{ ...surface, overflow: "hidden" }}>
            <div style={{ padding: "13px 16px", borderBottom: "1px solid #f1f5f9",
                          background: "#f8fafc", display: "flex", flexWrap: "wrap",
                          alignItems: "center", gap: "8px", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", flex: 1, minWidth: "240px" }}>
                <div style={{ position: "relative", flex: 1, maxWidth: "260px" }}>
                  <Search style={{ position: "absolute", left: "10px", top: "50%",
                                   transform: "translateY(-50%)", ...sz13,
                                   color: "#94a3b8", pointerEvents: "none" }} />
                  <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
                    placeholder="Buscar descripción, proveedor…"
                    style={{ ...inputBase, paddingLeft: "30px" }} />
                </div>
                <select value={typeFilter} onChange={e => { setTypeFilter(e.target.value); setPage(1); }}
                  style={{ ...inputBase, width: "auto", cursor: "pointer", fontWeight: 500 }}>
                  <option value="">Todos los tipos</option>
                  <option value="fixed">Fijo</option>
                  <option value="variable">Variable</option>
                  <option value="subscription">Suscripción</option>
                </select>
                {selectedRows.size > 0 && (
                  <span style={{ fontSize: "12px", color: "#0f172a", fontWeight: 600,
                                 background: "#f1f5f9", padding: "4px 10px", borderRadius: "20px",
                                 border: "1px solid #e2e8f0" }}>
                    {selectedRows.size} seleccionados
                  </span>
                )}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "12px", color: "#94a3b8", fontWeight: 500 }}>
                  {sorted.length} resultado{sorted.length !== 1 ? "s" : ""}
                </span>
                <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}
                  style={{ ...inputBase, width: "auto", cursor: "pointer", fontSize: "12px", padding: "6px 10px", fontWeight: 500 }}>
                  {PAGE_SIZES.map(n => <option key={n} value={n}>{n} / pág</option>)}
                </select>
                <div style={{ position: "relative" }}>
                  <button onClick={() => setShowColPicker(v => !v)} style={outlineBtn}>
                    <Eye style={sz13} /> Columnas
                  </button>
                  {showColPicker && (
                    <div style={{ position: "absolute", right: 0, top: "100%", marginTop: "6px",
                                  background: "#fff", border: "1px solid #e2e8f0", borderRadius: "14px",
                                  boxShadow: "0 12px 40px rgba(0,0,0,.12)", zIndex: 30,
                                  padding: "14px", width: "180px" }}>
                      <p style={{ fontSize: "10px", fontWeight: 700, color: "#94a3b8",
                                  textTransform: "uppercase", letterSpacing: ".08em", marginBottom: "10px" }}>
                        Columnas visibles
                      </p>
                      {ALL_EXPENSE_COLS.filter(c => c.key !== "actions").map(col => (
                        <label key={col.key}
                          style={{ display: "flex", alignItems: "center", gap: "8px",
                                   fontSize: "13px", color: "#334155", cursor: "pointer",
                                   padding: "5px 0", fontWeight: 500 }}>
                          <input type="checkbox" checked={visibleCols.has(col.key)}
                            onChange={() => setVisibleCols(s => { const n = new Set(s); n.has(col.key) ? n.delete(col.key) : n.add(col.key); return n; })}
                            style={{ cursor: "pointer", accentColor: "#0f172a" }} />
                          {col.label || col.key}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
                <button onClick={exportCSV} style={{ ...outlineBtn, borderColor: "#bbf7d0",
                  background: "#f0fdf4", color: "#15803d" }}>
                  <Download style={sz13} />
                  {selectedRows.size > 0 ? `Exportar (${selectedRows.size})` : "Exportar"}
                </button>
                <button onClick={() => openExpense()} style={primaryBtn}>
                  <Plus style={sz13} /> Nuevo Gasto
                </button>
              </div>
            </div>

            <div style={{ padding: "6px 16px", background: "#f8fafc", borderBottom: "1px solid #f1f5f9",
                          fontSize: "10px", color: "#b0bec5", fontWeight: 500,
                          display: "flex", alignItems: "center", gap: "6px" }}>
              <GripVertical style={sz12} />
              Arrastra las cabeceras para reordenar · Arrastra filas para reorganizar
            </div>

            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "660px" }}>
                <thead>
                  <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                    <th style={{ padding: "11px 14px", width: "36px" }}>
                      <input type="checkbox" checked={allSelected} onChange={toggleAll}
                        style={{ cursor: "pointer", width: "13px", height: "13px", accentColor: "#0f172a" }} />
                    </th>
                    <th style={{ padding: "11px 6px", width: "24px" }} />
                    {displayCols.map((colKey, idx) => {
                      const colDef = ALL_EXPENSE_COLS.find(c => c.key === colKey);
                      if (!colDef) return null;
                      return (
                        <th
                          key={colKey}
                          draggable
                          onDragStart={e => onColDragStart(e, idx)}
                          onDragEnter={() => onColDragEnter(idx)}
                          onDragEnd={onColDragEnd}
                          onDragOver={e => e.preventDefault()}
                          onClick={() => colDef.sortable && toggleSort(colKey)}
                          style={{ padding: "11px 14px", textAlign: colKey === "amount" ? "right" : "left",
                                   cursor: colDef.sortable ? "pointer" : "grab", userSelect: "none" }}
                        >
                          <span style={{ display: "inline-flex", alignItems: "center", gap: "4px",
                                         fontSize: "10px", fontWeight: 700, textTransform: "uppercase",
                                         letterSpacing: ".08em",
                                         color: sortKey === colKey ? "#0f172a" : "#94a3b8" }}>
                            {colDef.label}
                            {colDef.sortable && <SortIcon col={colKey} sortKey={sortKey} sortDir={sortDir} />}
                          </span>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {paginated.length === 0 ? (
                    <tr>
                      <td colSpan={displayCols.length + 2}
                        style={{ textAlign: "center", padding: "60px 20px",
                                 color: "#94a3b8", fontSize: "14px" }}>
                        {expenses.length === 0 ? "No hay gastos registrados" : "Sin resultados para este filtro"}
                      </td>
                    </tr>
                  ) : paginated.map((exp, idx) => (
                    <ExpenseRow
                      key={exp.id} expense={exp} index={idx}
                      selected={selectedRows.has(exp.id)}
                      onSelect={() => toggleRow(exp.id)}
                      onEdit={openExpense}
                      onDelete={exp => { setDeleteTarget({ type: "expense", id: exp.id, name: exp.description }); setModal("delete"); }}
                      onView={openDetail}
                      onDragStart={onRowDragStart}
                      onDragEnter={onRowDragEnter}
                      onDragEnd={onRowDragEnd}
                      displayCols={displayCols}
                    />
                  ))}
                </tbody>
                {paginated.length > 0 && (
                  <tfoot>
                    <tr style={{ borderTop: "2px solid #e2e8f0", background: "#f8fafc" }}>
                      <td colSpan={displayCols.filter(k => k !== "amount").length + 2}
                        style={{ padding: "11px 14px", fontSize: "12px", fontWeight: 600, color: "#64748b" }}>
                        {sorted.length} gastos · pág {page}/{totalPages}
                      </td>
                      {displayCols.includes("amount") && (
                        <td style={{ padding: "11px 14px", textAlign: "right",
                                     fontSize: "14px", fontWeight: 700, color: "#0f172a",
                                     letterSpacing: "-.01em", fontVariantNumeric: "tabular-nums" }}>
                          {fmtCurrency(sorted.reduce((s, e) => s + Number(e.amount || 0), 0))}
                        </td>
                      )}
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>

            {totalPages > 1 && (
              <div style={{ padding: "12px 16px", borderTop: "1px solid #f1f5f9",
                            display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: "12px", color: "#94a3b8", fontWeight: 500 }}>
                  Mostrando {pageStart + 1}–{Math.min(pageStart + pageSize, sorted.length)} de {sorted.length}
                </span>
                <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
                  <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                    style={{ ...iconBtn, opacity: page === 1 ? .35 : 1 }}>
                    <ChevronLeft style={sz13} />
                  </button>
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    const pg = page <= 3 ? i + 1 : page + i - 2;
                    if (pg < 1 || pg > totalPages) return null;
                    return (
                      <button key={pg} onClick={() => setPage(pg)}
                        style={{ width: "30px", height: "30px", borderRadius: "8px", border: "none",
                                 fontSize: "12px", fontWeight: 600, cursor: "pointer",
                                 background: pg === page ? "#0f172a" : "transparent",
                                 color: pg === page ? "#fff" : "#64748b",
                                 transition: "all .15s" }}>
                        {pg}
                      </button>
                    );
                  })}
                  <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                    style={{ ...iconBtn, opacity: page === totalPages ? .35 : 1 }}>
                    <ChevronRight style={sz13} />
                  </button>
                </div>
              </div>
            )}

            {expenses.length === 0 && (
              <div style={{ padding: "60px 20px", textAlign: "center" }}>
                <Receipt style={{ width: "36px", height: "36px", color: "#e2e8f0",
                                  margin: "0 auto 12px", display: "block" }} />
                <p style={{ color: "#94a3b8", fontSize: "14px", marginBottom: "16px" }}>
                  No hay gastos registrados
                </p>
                <button onClick={() => openExpense()} style={{ ...primaryBtn, borderRadius: "10px" }}>
                  <Plus style={sz14} /> Registrar primer gasto
                </button>
              </div>
            )}
          </div>
        )}

        {/* ══ TAB: Mileage ══════════════════════════════════════════════════ */}
        {activeTab === "mileage" && (
          <div>
            <div style={{ ...surface, padding: "16px 20px", marginBottom: "16px",
                          display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <p style={{ fontSize: "14px", fontWeight: 700, color: "#0f172a", letterSpacing: "-.01em" }}>
                  Registros de Millaje
                </p>
                <p style={{ fontSize: "12px", color: "#94a3b8", marginTop: "2px", fontWeight: 500 }}>
                  {mileage.length} viajes registrados
                </p>
              </div>
              <button onClick={() => { setForm(emptyMileage); setModal("mileage"); }} style={primaryBtn}>
                <Plus style={sz14} /> Registrar Viaje
              </button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {mileage.length === 0
                ? <Empty icon={Car} message="No hay registros de millaje" />
                : mileage.map(r => <MileageCard key={r.id} record={r} />)
              }
            </div>
          </div>
        )}

        {/* ══ TAB: Vehicles ════════════════════════════════════════════════ */}
        {activeTab === "vehicles" && (
          <div>
            <div style={{ ...surface, padding: "16px 20px", marginBottom: "16px",
                          display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <p style={{ fontSize: "14px", fontWeight: 700, color: "#0f172a", letterSpacing: "-.01em" }}>
                  Flota de Vehículos
                </p>
                <p style={{ fontSize: "12px", color: "#94a3b8", marginTop: "2px", fontWeight: 500 }}>
                  {vehicles.length} vehículos en el sistema
                </p>
              </div>
              <button onClick={() => { setEditingItem(null); setForm(emptyVehicle); setModal("vehicle"); }} style={primaryBtn}>
                <Plus style={sz14} /> Agregar Vehículo
              </button>
            </div>
            {vehicles.length === 0
              ? <Empty icon={Car} message="No hay vehículos registrados" />
              : <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))", gap: "14px" }}>
                  {vehicles.map(v => (
                    <VehicleCard key={v.id} vehicle={v}
                      onEdit={v => { setEditingItem(v); setForm(v); setModal("vehicle"); }}
                      onDelete={v => { setDeleteTarget({ type: "vehicle", id: v.id, name: v.name }); setModal("delete"); }}
                    />
                  ))}
                </div>
            }
          </div>
        )}
      </div>

      {/* ══ Portals ════════════════════════════════════════════════════════ */}
      <ExpenseForm
        open={modal === "expense"} onClose={closeModal}
        editingItem={editingItem} form={form} setForm={setForm}
        categories={categories} attachments={attachments}
        existingFiles={existingFiles} ocrLoading={ocrLoading}
        onSave={saveExpense}
        onOpenLightbox={(imgs, idx) => setLightbox({ images: imgs, idx })}
        cameraRef={cameraRef} fileRef={fileRef}
        onFileSelect={handleFileSelect} onRemoveAttachment={removeAttachment}
      />
      <MileageForm open={modal === "mileage"} onClose={closeModal}
        form={form} setForm={setForm} vehicles={vehicles} onSave={saveMileage} />
      <VehicleForm open={modal === "vehicle"} onClose={closeModal}
        editingItem={editingItem} form={form} setForm={setForm} onSave={saveVehicle} />
      {modal === "detail" && detailExpense && (
        <DetailSheet expense={detailExpense} files={detailFiles}
          onClose={() => setModal(null)}
          onOpenLightbox={(imgs, idx) => setLightbox({ images: imgs, idx })} />
      )}
      {modal === "delete" && deleteTarget && (
        <DeleteConfirm target={deleteTarget} onConfirm={handleDelete}
          onCancel={() => { setModal(null); setDeleteTarget(null); }} />
      )}
      {lightbox && (
        <Lightbox images={lightbox.images} initialIndex={lightbox.idx}
          onClose={() => setLightbox(null)} />
      )}
    </div>
  );
}