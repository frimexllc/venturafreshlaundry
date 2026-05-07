import { useState, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import {
  DollarSign, Scale, CreditCard, Banknote, Send, RefreshCw,
  Printer, X, ImageIcon, CheckCircle2, AlertTriangle, Eye,
  ShieldCheck, ShieldX, Clock, FileDown, Package, Truck,
  ChevronDown, ChevronUp, User, MapPin, Calendar, StickyNote,
  Zap, Hash,
} from "lucide-react";
import { toast } from "sonner";
import { safeString, formatCurrency, formatOrderNumber, isWashFoldService } from "./utils";
import { useLocale } from "../../context/LocaleContext";
import { formatShortDatePT } from "../../utils/dateUtils";

const API_URL = process.env.REACT_APP_BACKEND_URL;
const token = () => localStorage.getItem("token");
const authHeaders = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${token()}`,
});

function calcDeliveryFee(distanceMiles) {
  if (distanceMiles == null || isNaN(Number(distanceMiles))) return 0;
  const d = Number(distanceMiles);
  if (d <= 3) return 0;
  if (d > 10) return 5.99;
  const raw = (d - 3) * 1.5;
  return Math.round(Math.max(2.99, Math.min(raw, 5.99)) * 100) / 100;
}

// ── Section wrapper ────────────────────────────────────────────────
function Section({ icon, title, badge, children, collapsible = false, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-2xl border border-slate-200 overflow-hidden bg-white shadow-sm">
      <div
        className={`flex items-center gap-2.5 px-4 py-3 bg-gradient-to-r from-slate-50 to-white border-b border-slate-100 ${collapsible ? "cursor-pointer select-none" : ""}`}
        onClick={() => collapsible && setOpen(v => !v)}
      >
        <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-sky-50 text-sky-600 shrink-0">
          {icon}
        </span>
        <h3 className="font-semibold text-slate-800 text-sm flex-1">{title}</h3>
        {badge}
        {collapsible && (
          <span className="text-slate-400">{open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}</span>
        )}
      </div>
      {(!collapsible || open) && <div className="p-4">{children}</div>}
    </div>
  );
}

// ── Data row ───────────────────────────────────────────────────────
function DataRow({ label, value, className = "" }) {
  if (!value) return null;
  return (
    <div className={`space-y-0.5 ${className}`}>
      <p className="text-[10px] font-semibold tracking-widest text-slate-400 uppercase">{label}</p>
      <p className="text-sm font-medium text-slate-800 leading-snug">{value}</p>
    </div>
  );
}

// ── Receipt Card ───────────────────────────────────────────────────
function ReceiptCard({ receipt, onValidate, validating }) {
  const { t } = useLocale();
  const [expanded, setExpanded] = useState(false);
  const [blobUrl, setBlobUrl] = useState(null);
  const [imgError, setImgError] = useState(false);
  const [imgLoading, setImgLoading] = useState(true);

  useEffect(() => {
    let objectUrl = null;
    setImgLoading(true); setImgError(false);
    const fetchImage = async (retry = true) => {
      try {
        const tk = localStorage.getItem("token");
        const res = await fetch(`${API_URL}/api/files/${receipt.id}/download`, {
          headers: { Authorization: `Bearer ${tk}` },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        objectUrl = URL.createObjectURL(blob);
        setBlobUrl(objectUrl);
      } catch {
        if (retry) setTimeout(() => fetchImage(false), 1000);
        else { setImgError(true); setImgLoading(false); }
      }
    };
    fetchImage();
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [receipt.id]);

  const statusConfig = {
    verified_paid: {
      icon: <ShieldCheck className="w-4 h-4" />,
      label: t("AI: Verified payment", "IA: Pago verificado"),
      cls: "bg-emerald-50 border-emerald-200 text-emerald-700",
    },
    rejected: {
      icon: <ShieldX className="w-4 h-4" />,
      label: t("AI: Not a valid payment", "IA: No es pago válido"),
      cls: "bg-red-50 border-red-200 text-red-700",
    },
    pending: {
      icon: <Clock className="w-4 h-4" />,
      label: t("Pending AI review", "Pendiente revisión IA"),
      cls: "bg-amber-50 border-amber-200 text-amber-700",
    },
  };
  const st = statusConfig[receipt.ai_validation_status || "pending"] ?? statusConfig.pending;

  return (
    <div className="rounded-xl border border-slate-200 overflow-hidden bg-white">
      {/* Header row */}
      <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 border-b border-slate-100">
        <ImageIcon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
        <span className="text-xs font-medium text-slate-600 truncate flex-1">
          {receipt.original_filename || "receipt"}
        </span>
        <span className="text-[10px] text-slate-400 shrink-0">
          {receipt.created_at ? new Date(receipt.created_at).toLocaleString() : ""}
        </span>
      </div>

      {/* Image */}
      <div
        className={`relative bg-slate-100 cursor-pointer transition-all duration-300 ${expanded ? "min-h-[200px]" : "min-h-[120px]"}`}
        onClick={() => !imgLoading && !imgError && setExpanded(v => !v)}
      >
        {imgLoading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <RefreshCw className="w-5 h-5 text-slate-400 animate-spin" />
          </div>
        )}
        {imgError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-slate-400">
            <AlertTriangle className="w-6 h-6" />
            <span className="text-[11px]">{t("Could not load image.", "No se pudo cargar la imagen.")}</span>
          </div>
        )}
        {blobUrl && !imgError && (
          <img src={blobUrl} alt="Receipt"
            className={`w-full object-contain transition-all duration-300 ${expanded ? "max-h-[520px]" : "max-h-[160px]"}`}
            onLoad={() => setImgLoading(false)}
            onError={() => { setImgError(true); setImgLoading(false); }} />
        )}
        {!imgLoading && !imgError && blobUrl && (
          <button
            onClick={e => { e.stopPropagation(); setExpanded(v => !v); }}
            className="absolute bottom-2 right-2 bg-black/50 text-white rounded-lg px-2 py-1 text-[10px] flex items-center gap-1 hover:bg-black/70 transition-colors"
          >
            <Eye className="w-3 h-3" />
            {expanded ? t("Collapse", "Colapsar") : t("Expand", "Ampliar")}
          </button>
        )}
      </div>

      {/* Status */}
      <div className={`px-3 py-2.5 flex items-start gap-2.5 border-t border-slate-100 ${st.cls}`}>
        <span className="shrink-0 mt-0.5">{st.icon}</span>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold">{st.label}</p>
          {receipt.ai_validation_notes && (
            <p className="text-[11px] mt-0.5 opacity-80 leading-snug">{receipt.ai_validation_notes}</p>
          )}
          {receipt.ai_extracted_amount > 0 && (
            <p className="text-[11px] mt-0.5 font-bold">
              {t("Amount detected", "Monto detectado")}: ${Number(receipt.ai_extracted_amount).toFixed(2)}
            </p>
          )}
        </div>
        {(receipt.ai_validation_status || "pending") === "pending" && (
          <Button
            size="sm"
            className="h-7 px-2.5 text-[10px] bg-sky-600 hover:bg-sky-700 shrink-0"
            onClick={() => onValidate(receipt.id)}
            disabled={validating === receipt.id}
          >
            {validating === receipt.id
              ? <RefreshCw className="w-3 h-3 animate-spin" />
              : t("Validate IA", "Validar IA")}
          </Button>
        )}
      </div>
    </div>
  );
}

// ── Payment method button ──────────────────────────────────────────
function PayMethodBtn({ val, label, icon, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-1.5 py-2.5 px-1 rounded-xl border-2 text-[11px] font-semibold transition-all duration-150 ${
        active
          ? "bg-sky-600 text-white border-sky-600 shadow-md shadow-sky-200"
          : "bg-white text-slate-500 border-slate-200 hover:border-sky-300 hover:text-sky-600"
      }`}
    >
      <span className={active ? "text-white" : "text-slate-400"}>{icon}</span>
      {label}
    </button>
  );
}

// ── Main component ─────────────────────────────────────────────────
export default function OrderDetailDialog({ order, onClose, onRefresh }) {
  const { t } = useLocale();
  const [lbs, setLbs] = useState("");
  const [saving, setSaving] = useState(false);
  const [payMethod, setPayMethod] = useState("card");
  const [amountReceived, setAmountReceived] = useState("");
  const [processing, setProcessing] = useState(false);
  const [notes, setNotes] = useState("");
  const [localOrder, setLocalOrder] = useState(null);
  const [notifyChannel, setNotifyChannel] = useState("sms");
  const [notifySending, setNotifySending] = useState(false);

  const ADDON_CATALOG = [
    { id: "bath_mat",       name: "Bath Mat",         price: 5.00  },
    { id: "cooking_glove",  name: "Cooking Glove",    price: 5.00  },
    { id: "pet_bed_s",      name: "Pet Bed (S)",      price: 5.00  },
    { id: "pet_bed_ml",     name: "Pet Bed (M/L)",    price: 8.00  },
    { id: "pillow_std",     name: "Pillow Std",       price: 8.00  },
    { id: "pillow_lg",      name: "Pillow Lg",        price: 10.00 },
    { id: "duvet_cover",    name: "Duvet Cover",      price: 8.00  },
    { id: "blanket",        name: "Blanket",           price: 10.00 },
    { id: "comforter_tdq",  name: "Comforter T/D/Q",  price: 18.00 },
    { id: "comforter_king", name: "Comforter King",   price: 20.00 },
    { id: "mattress_cover", name: "Mattress Cover",   price: 20.00 },
    { id: "down_comforter", name: "Down Comforter",   price: 40.00 },
  ];
  const [addons, setAddons] = useState([]);
  const [savingAddons, setSavingAddons] = useState(false);

  useEffect(() => {
    setAddons(order?.addon_services ?? []);
  }, [order]);

  const [receipts, setReceipts] = useState([]);
  const [receiptsLoading, setReceiptsLoading] = useState(false);
  const [validatingId, setValidatingId] = useState(null);

  useEffect(() => {
    if (order) {
      setLocalOrder(order);
      setLbs(order.actual_lbs || order.estimated_lbs || "");
      setNotes(order.special_instructions || order.notes || "");
      setAmountReceived("");
    }
  }, [order]);

  const loadReceipts = useCallback(async (orderId) => {
    if (!orderId) return;
    setReceiptsLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/files/receipts-by-order/${orderId}`, {
        headers: { Authorization: `Bearer ${token()}` },
      });
      if (res.ok) setReceipts(await res.json() || []);
    } catch { /* silent */ }
    finally { setReceiptsLoading(false); }
  }, []);

  useEffect(() => {
    if (order) loadReceipts(order.id || order.order_id);
    else setReceipts([]);
  }, [order, loadReceipts]);

  if (!localOrder) return null;

  const orderId           = localOrder.id || localOrder.order_id;
  const isPaid            = (localOrder.payment_status || "").toLowerCase() === "paid";
  const totalAmount       = localOrder.total_amount || localOrder.total || 0;
  const isWF              = isWashFoldService(localOrder.service_type);
  const effectiveDeliveryFee = calcDeliveryFee(localOrder.distance_miles);
  const storedDeliveryFee    = Number(localOrder.delivery_fee || 0);
  const deliveryFeeMismatch  =
    Math.abs(effectiveDeliveryFee - storedDeliveryFee) > 0.01 && localOrder.distance_miles != null;
  const verifiedReceipts     = receipts.filter(r => r.ai_validation_status === "verified_paid");
  const hasVerifiedReceipt   = verifiedReceipts.length > 0;
  const addonTotal           = addons.reduce((s, a) => s + (Number(a.price) || 0) * (Number(a.qty) || 1), 0);

  // ── Handlers (logic unchanged) ──────────────────────────────────
  const handleValidateReceipt = async (fileId) => {
    setValidatingId(fileId);
    try {
      const res = await fetch(
        `${API_URL}/api/files/validate-payment-receipt/${fileId}?order_id=${orderId}`,
        { method: "POST", headers: { Authorization: `Bearer ${token()}` } }
      );
      if (res.ok) {
        const data = await res.json();
        setReceipts(prev => prev.map(r => r.id === fileId ? {
          ...r,
          ai_validation_status: data.is_valid_payment ? "verified_paid" : "rejected",
          ai_validation_notes: data.notes,
          ai_extracted_amount: data.amount,
        } : r));
        toast[data.is_valid_payment ? "success" : "error"](
          data.is_valid_payment
            ? t("Receipt validated — payment confirmed!", "¡Comprobante validado!")
            : t("Not a valid payment receipt", "No es un comprobante válido")
        );
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.detail || t("Validation error", "Error de validación"));
      }
    } catch { toast.error(t("Connection error", "Error de conexión")); }
    finally { setValidatingId(null); }
  };

  const handleSaveLbs = async () => {
    if (!lbs || isNaN(Number(lbs)) || Number(lbs) <= 0) {
      toast.error(t("Enter valid lbs", "Ingresa libras válidas")); return;
    }
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/api/orders/${orderId}`, {
        method: "PUT", headers: authHeaders(),
        body: JSON.stringify({ actual_lbs: Number(lbs) }),
      });
      if (res.ok) {
        const updated = await res.json();
        setLocalOrder(prev => ({ ...prev, actual_lbs: Number(lbs), total_amount: updated.total_amount || prev.total_amount }));
        toast.success(t("Lbs saved & total recalculated", "Libras guardadas y total recalculado"));
        onRefresh?.();
        try {
          const preferred = localOrder.preferred_contact || "sms";
          const autoChannel = preferred === "email" ? "email" : "sms";
          const nr = await fetch(`${API_URL}/api/orders/${orderId}/notify-customer`, {
            method: "POST", headers: authHeaders(),
            body: JSON.stringify({ channel: autoChannel }),
          });
          const nd = await nr.json();
          if (nr.ok && nd.ok)
            toast.success(t(`Notification sent via ${autoChannel.toUpperCase()}`, `Notificación enviada vía ${autoChannel.toUpperCase()}`));
        } catch (err) { console.error("Auto-notify error:", err); }
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.detail || t("Error saving lbs", "Error al guardar libras"));
      }
    } catch { toast.error(t("Connection error", "Error de conexión")); }
    finally { setSaving(false); }
  };

  const handlePayment = async () => {
    if (payMethod === "card") {
      setProcessing(true);
      try {
        const res = await fetch(`${API_URL}/api/orders/${orderId}/stripe-checkout`, {
          method: "POST", headers: authHeaders(),
          body: JSON.stringify({ origin_url: window.location.origin }),
        });
        if (res.ok) { const d = await res.json(); window.location.href = d.url || d.checkout_url; return; }
        const err = await res.json().catch(() => ({}));
        toast.error(err.detail || t("Stripe error", "Error de Stripe"));
      } catch { toast.error(t("Connection error", "Error de conexión")); }
      finally { setProcessing(false); }
      return;
    }
    const amt = payMethod === "cash" ? Number(amountReceived) : totalAmount;
    if (payMethod === "cash" && (!amt || amt < totalAmount)) {
      toast.error(t("Amount must be >= total", "Monto debe ser >= total")); return;
    }
    setProcessing(true);
    try {
      const res = await fetch(`${API_URL}/api/orders/${orderId}/payment`, {
        method: "POST", headers: authHeaders(),
        body: JSON.stringify({ payment_method: payMethod, amount_received: amt }),
      });
      if (res.ok) {
        const data = await res.json();
        setLocalOrder(prev => ({ ...prev, payment_status: "paid", payment_method: payMethod, amount_paid: amt, change_due: data.change_due }));
        toast.success(payMethod === "cash" && data.change_due > 0
          ? `${t("Paid!", "¡Pagado!")} ${t("Change", "Cambio")}: ${formatCurrency(data.change_due)}`
          : t("Payment registered", "Pago registrado"));
        onRefresh?.();
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.detail || t("Payment error", "Error de pago"));
      }
    } catch { toast.error(t("Connection error", "Error de conexión")); }
    finally { setProcessing(false); }
  };

  const handleSendNotification = async () => {
    setNotifySending(true);
    try {
      const res = await fetch(`${API_URL}/api/orders/${orderId}/notify-customer`, {
        method: "POST", headers: authHeaders(),
        body: JSON.stringify({ channel: notifyChannel }),
      });
      const data = await res.json();
      if (res.ok && data.ok)
        toast.success(t(`Notification sent via ${notifyChannel.toUpperCase()}`, `Notificación enviada por ${notifyChannel.toUpperCase()}`));
      else
        toast.error(data.detail || t("Could not send notification", "No se pudo enviar notificación"));
    } catch { toast.error(t("Connection error", "Error de conexión")); }
    finally { setNotifySending(false); }
  };

  const handlePrintTicket = async () => {
    try {
      const res = await fetch(`${API_URL}/api/orders/${orderId}/ticket`, { headers: authHeaders() });
      if (!res.ok) throw new Error();
      const html = await res.text();
      const pw = window.open("", "_blank", "width=350,height=600");
      if (!pw) { toast.error(t("Allow pop-ups", "Permite pop-ups")); return; }
      pw.document.write(html); pw.document.close();
    } catch { toast.error(t("Could not print ticket", "No se pudo imprimir ticket")); }
  };

  const handleDownloadPDF = async () => {
    try {
      const { default: html2pdf } = await import("html2pdf.js");
      const res = await fetch(`${API_URL}/api/orders/${orderId}/ticket`, { headers: authHeaders() });
      if (!res.ok) throw new Error();
      const htmlContent = await res.text();
      const container = document.createElement("div");
      container.innerHTML = htmlContent;
      container.style.width = "380px";
      document.body.appendChild(container);
      await html2pdf().set({
        margin: 4, filename: `ticket-${formatOrderNumber(localOrder)}.pdf`,
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: "mm", format: [100, 250], orientation: "portrait" },
      }).from(container).save();
      document.body.removeChild(container);
      toast.success(t("PDF downloaded", "PDF descargado"));
    } catch { toast.error(t("Could not generate PDF", "No se pudo generar el PDF")); }
  };

  const handleAddAddon = (item) => {
    const existing = addons.find(a => a.id === item.id);
    if (existing) setAddons(prev => prev.map(a => a.id === item.id ? { ...a, qty: (a.qty || 1) + 1 } : a));
    else setAddons(prev => [...prev, { ...item, qty: 1 }]);
  };
  const handleRemoveAddon = (id) => setAddons(prev => prev.filter(a => a.id !== id));
  const handleSaveAddons = async () => {
    setSavingAddons(true);
    try {
      const res = await fetch(`${API_URL}/api/orders/${orderId}`, {
        method: "PUT", headers: authHeaders(),
        body: JSON.stringify({ addon_services: addons }),
      });
      if (res.ok) {
        const updated = await res.json();
        setLocalOrder(prev => ({ ...prev, addon_services: addons, total_amount: updated.total_amount }));
        toast.success(t("Add-ons saved", "Extras guardados"));
        onRefresh?.();
      }
    } catch { toast.error(t("Error saving add-ons", "Error al guardar extras")); }
    finally { setSavingAddons(false); }
  };

  // ── Status pill colour ─────────────────────────────────────────
  const statusPillCls = {
    paid:      "bg-emerald-100 text-emerald-700 border-emerald-200",
    unpaid:    "bg-red-50 text-red-600 border-red-200",
    pending:   "bg-amber-50 text-amber-700 border-amber-200",
    completed: "bg-sky-50 text-sky-700 border-sky-200",
  };
  const rawStatus = (localOrder.status || "").toLowerCase();
  const pillCls   = statusPillCls[rawStatus] ?? "bg-slate-100 text-slate-600 border-slate-200";

  // ── Render ─────────────────────────────────────────────────────
  return (
    <Dialog open={!!order} onOpenChange={() => onClose()}>
      <DialogContent
        className="w-[95vw] max-w-xl max-h-[92vh] overflow-y-auto bg-slate-50 p-0 gap-0 rounded-2xl"
        data-testid="order-detail-dialog"
      >
        {/* ── Sticky header ── */}
        <div className="sticky top-0 z-20 flex items-center gap-3 px-5 py-4 bg-white border-b border-slate-200 rounded-t-2xl">
          <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-sky-600 text-white shrink-0">
            <Hash className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-bold tracking-widest text-slate-400 uppercase leading-none mb-0.5">
              {t("Order", "Orden")}
            </p>
            <p className="text-base font-bold text-slate-900 leading-tight tracking-tight">
              {formatOrderNumber(localOrder)}
            </p>
          </div>
          <span className={`text-[11px] font-bold px-3 py-1.5 rounded-full border capitalize ${pillCls}`}>
            {safeString(localOrder.status)}
          </span>
          <button
            onClick={onClose}
            className="flex items-center justify-center w-8 h-8 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-3">

          {/* ── Customer info ── */}
          <Section icon={<User className="w-4 h-4" />} title={t("Customer", "Cliente")} data-testid="order-detail-customer">
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              <DataRow label={t("Name", "Nombre")}        value={safeString(localOrder.customer_name, "N/A")} />
              <DataRow label={t("Phone", "Teléfono")}     value={safeString(localOrder.customer_phone, "N/A")} />
              <DataRow label="Email"                       value={safeString(localOrder.customer_email, "N/A")} className="col-span-2" />
              <DataRow label={t("Service", "Servicio")}   value={isWF ? "Wash & Fold" : "Pickup & Delivery"} />
              {localOrder.preferred_contact && (
                <DataRow label={t("Contact pref.", "Pref. contacto")} value={localOrder.preferred_contact} />
              )}
              {localOrder.membership_plan && (
                <div className="col-span-2">
                  <p className="text-[10px] font-semibold tracking-widest text-slate-400 uppercase mb-0.5">
                    {t("Membership", "Membresía")}
                  </p>
                  <span className="inline-flex items-center gap-1 text-xs font-bold text-sky-700 bg-sky-50 border border-sky-200 rounded-full px-2.5 py-1">
                    <Zap className="w-3 h-3" />{localOrder.membership_plan}
                  </span>
                </div>
              )}
            </div>
          </Section>

          {/* ── Distance badge ── */}
          {localOrder.distance_miles != null && (
            <div className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-xs font-semibold border ${
              localOrder.distance_miles <= 3
                ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                : "bg-sky-50 border-sky-200 text-sky-700"
            }`}>
              <Truck className="w-4 h-4 shrink-0" />
              <span>
                {Number(localOrder.distance_miles).toFixed(1)} {t("miles from store", "millas de la tienda")}
                {" · "}
                {localOrder.distance_miles <= 3
                  ? t("FREE delivery", "Entrega GRATIS")
                  : `${t("Fee", "Tarifa")}: ${formatCurrency(effectiveDeliveryFee)}`}
              </span>
              {deliveryFeeMismatch && (
                <span className="ml-auto flex items-center gap-1 text-amber-600 text-[10px] font-bold">
                  <AlertTriangle className="w-3 h-3" />
                  {t("Recalculated", "Recalculada")}
                </span>
              )}
            </div>
          )}

          {/* ── Addresses ── */}
          {(localOrder.pickup_address || localOrder.delivery_address) && (
            <Section icon={<MapPin className="w-4 h-4" />} title={t("Addresses", "Direcciones")} data-testid="order-detail-addresses">
              <div className="space-y-3">
                <DataRow label={t("Pickup address", "Dir. pickup")} value={localOrder.pickup_address} />
                {localOrder.delivery_address && localOrder.delivery_address !== localOrder.pickup_address && (
                  <DataRow label={t("Delivery address", "Dir. entrega")} value={localOrder.delivery_address} />
                )}
                {localOrder.gate_code && (
                  <div>
                    <p className="text-[10px] font-semibold tracking-widest text-slate-400 uppercase mb-1">
                      {t("Gate code", "Código portón")}
                    </p>
                    <span className="inline-block font-mono font-bold text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1 text-sm tracking-widest">
                      {localOrder.gate_code}
                    </span>
                  </div>
                )}
              </div>
            </Section>
          )}

          {/* ── Schedule ── */}
          {(localOrder.pickup_date || localOrder.pickup_time) && (
            <Section icon={<Calendar className="w-4 h-4" />} title={t("Schedule", "Horario")}>
              <div className="flex gap-6">
                <DataRow label={t("Date", "Fecha")} value={localOrder.pickup_date ? formatShortDatePT(localOrder.pickup_date) : null} />
                <DataRow label={t("Time", "Hora")}  value={localOrder.pickup_time} />
              </div>
            </Section>
          )}

         {/* ── Notes — FIX: parse inline list items ── */}
{notes && (
  <Section icon={<StickyNote className="w-4 h-4" />} title={t("Notes / Instructions", "Notas / Instrucciones")} data-testid="order-detail-notes">
    <ul className="space-y-1.5 list-disc pl-5 text-sm text-slate-700">
      {notes
        // Detecta patrones como "- item" o divide por espacios seguidos de palabra clave
        .split(/(?=- [A-Z])|(?<=[a-z]): /)
        .map((item) => item.trim())
        .filter((item) => item && item.length > 0)
        .map((item, i) => (
          <li key={i} className="leading-relaxed">
            {item.replace(/^- /, '')} {/* limpia guiones iniciales */}
          </li>
        ))}
    </ul>
  </Section>
)}

          {/* ── Preferences snapshot ── */}
          {localOrder.preferences_snapshot && (
            <Section
              icon={<User className="w-4 h-4" />}
              title={t("Customer preferences", "Preferencias del cliente")}
              collapsible
              defaultOpen={false}
            >
              <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                {Object.entries(localOrder.preferences_snapshot)
                  .filter(([k]) => !["id", "version", "customer_id"].includes(k))
                  .map(([k, v]) => (
                    <DataRow key={k} label={k.replace(/_/g, " ")} value={String(v || "—")} />
                  ))}
              </div>
            </Section>
          )}

          {/* ── Receipts ── */}
          <Section
            icon={<ImageIcon className="w-4 h-4" />}
            title={t("Payment Receipts", "Comprobantes de Pago")}
            badge={
              hasVerifiedReceipt
                ? <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
                    <CheckCircle2 className="w-3 h-3" />{verifiedReceipts.length} {t("verified", "verificado(s)")}
                  </span>
                : receiptsLoading
                  ? <RefreshCw className="w-3.5 h-3.5 text-slate-400 animate-spin" />
                  : null
            }
            data-testid="order-detail-receipts"
          >
            <div className="space-y-3">
              {receiptsLoading ? (
                <div className="py-8 text-center text-slate-400 text-xs flex flex-col items-center gap-2">
                  <RefreshCw className="w-6 h-6 animate-spin" />
                  {t("Loading receipts…", "Cargando comprobantes…")}
                </div>
              ) : receipts.length === 0 ? (
                <div className="py-8 text-center text-slate-400 text-xs flex flex-col items-center gap-2">
                  <ImageIcon className="w-10 h-10 opacity-20" />
                  <p>{t("No receipts uploaded by customer yet", "El cliente aún no ha subido comprobantes")}</p>
                </div>
              ) : (
                receipts.map(r => (
                  <ReceiptCard key={r.id} receipt={r} onValidate={handleValidateReceipt} validating={validatingId} />
                ))
              )}

              {!hasVerifiedReceipt && receipts.length > 0 &&
                ["pending_verification", "pending"].includes(localOrder.payment_status) && (
                <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-3.5 py-3 text-xs text-amber-800">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <p>{t("Customer submitted payment — validate the receipt with AI before confirming.", "El cliente envió pago — valida el comprobante con IA antes de confirmar.")}</p>
                </div>
              )}

              <button
                onClick={() => loadReceipts(orderId)}
                className="w-full py-1.5 text-[11px] text-slate-400 hover:text-slate-600 flex items-center justify-center gap-1.5 transition-colors"
              >
                <RefreshCw className="w-3 h-3" />{t("Refresh", "Actualizar")}
              </button>
            </div>
          </Section>

          {/* ── Add-ons ── */}
          <Section
            icon={<Package className="w-4 h-4" />}
            title={t("Individual Items / Add-ons", "Artículos / Extras")}
            collapsible
            defaultOpen={addons.length > 0}
            badge={addons.length > 0
              ? <span className="text-[11px] font-bold text-sky-600 bg-sky-50 border border-sky-200 rounded-full px-2 py-0.5">
                  {addons.length} — {formatCurrency(addonTotal)}
                </span>
              : null}
            data-testid="order-detail-addons"
          >
            <div className="space-y-3">
              {/* Selected addons */}
              {addons.length > 0 && (
                <div className="space-y-1.5">
                  {addons.map(a => (
                    <div key={a.id} className="flex items-center justify-between bg-sky-50 border border-sky-100 rounded-xl px-3 py-2.5">
                      <span className="text-sm text-slate-700 font-medium">
                        {a.name}{a.qty > 1 ? <span className="ml-1 text-sky-500 font-bold">×{a.qty}</span> : ""}
                      </span>
                      <div className="flex items-center gap-2.5">
                        <span className="text-sm font-bold text-slate-800">{formatCurrency((a.price || 0) * (a.qty || 1))}</span>
                        <button
                          onClick={() => handleRemoveAddon(a.id)}
                          className="flex items-center justify-center w-6 h-6 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                          data-testid={`addon-remove-${a.id}`}
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                  <Button
                    size="sm"
                    onClick={handleSaveAddons}
                    disabled={savingAddons}
                    className="w-full h-9 bg-sky-600 hover:bg-sky-700 text-xs font-semibold rounded-xl"
                    data-testid="addon-save-btn"
                  >
                    {savingAddons && <RefreshCw className="w-3 h-3 animate-spin mr-1.5" />}
                    {t("Save Add-ons", "Guardar Extras")}
                  </Button>
                </div>
              )}

              {/* Catalog grid */}
              <div className="grid grid-cols-2 gap-1.5 max-h-48 overflow-y-auto">
                {ADDON_CATALOG.map(item => (
                  <button
                    key={item.id}
                    onClick={() => handleAddAddon(item)}
                    data-testid={`addon-add-${item.id}`}
                    className="flex items-center justify-between px-3 py-2 text-left border border-slate-100 rounded-xl hover:border-sky-300 hover:bg-sky-50 transition-all text-xs group"
                  >
                    <span className="text-slate-700 font-medium truncate">{item.name}</span>
                    <span className="text-sky-600 font-bold shrink-0 ml-1 group-hover:text-sky-700">
                      ${item.price.toFixed(2)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </Section>

          {/* ── Lbs + Price breakdown ── */}
          <Section
            icon={<Scale className="w-4 h-4" />}
            title={t("Weight & Total", "Peso y Total")}
            data-testid="order-detail-lbs-payment"
          >
            <div className="space-y-4">
              {/* Lbs input */}
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <Label className="text-[10px] font-semibold tracking-widest text-slate-400 uppercase">
                    {t("Actual Lbs", "Libras reales")}
                  </Label>
                  <Input
                    type="number" step="0.1" min="0" placeholder="0.0"
                    value={lbs} onChange={e => setLbs(e.target.value)}
                    className="mt-1.5 h-10 text-sm rounded-xl border-slate-200 focus:border-sky-400 focus:ring-sky-200"
                    data-testid="order-detail-lbs-input"
                  />
                </div>
                <Button
                  size="sm"
                  onClick={handleSaveLbs}
                  disabled={saving}
                  className="h-10 px-4 bg-sky-600 hover:bg-sky-700 rounded-xl font-semibold"
                  data-testid="order-detail-save-lbs"
                >
                  {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : t("Save", "Guardar")}
                </Button>
              </div>

              {/* Price breakdown */}
              <div className="rounded-xl bg-slate-50 border border-slate-200 overflow-hidden text-xs">
                {localOrder.price_per_lb && localOrder.actual_lbs && (
                  <div className="flex justify-between items-center px-3.5 py-2.5 border-b border-slate-100">
                    <span className="text-slate-500">
                      {Number(localOrder.actual_lbs).toFixed(1)} lbs × ${Number(localOrder.price_per_lb).toFixed(2)}/lb
                    </span>
                    <span className="font-semibold text-slate-700">
                      {formatCurrency(Number(localOrder.actual_lbs) * Number(localOrder.price_per_lb))}
                    </span>
                  </div>
                )}
                <div className="flex justify-between items-center px-3.5 py-2.5 border-b border-slate-100">
                  <span className="flex items-center gap-1.5 text-slate-500">
                    <Truck className="w-3.5 h-3.5" />
                    {t("Delivery fee", "Tarifa de entrega")}
                    {effectiveDeliveryFee === 0 && localOrder.distance_miles != null && (
                      <span className="text-emerald-600 font-bold">{t("FREE", "GRATIS")}</span>
                    )}
                  </span>
                  <span className={effectiveDeliveryFee === 0 ? "font-bold text-emerald-600" : "font-semibold text-slate-700"}>
                    {effectiveDeliveryFee === 0 ? "$0.00" : formatCurrency(effectiveDeliveryFee)}
                  </span>
                </div>
                {addonTotal > 0 && (
                  <div className="flex justify-between items-center px-3.5 py-2.5 border-b border-slate-100">
                    <span className="text-slate-500">{t("Add-ons", "Extras")}</span>
                    <span className="font-semibold text-slate-700">{formatCurrency(addonTotal)}</span>
                  </div>
                )}
                <div className="flex items-center justify-between px-3.5 py-3 bg-white">
                  <span className="font-bold text-slate-700">{t("Total", "Total")}</span>
                  <span className="text-2xl font-extrabold text-slate-900 tracking-tight" data-testid="order-detail-total">
                    {totalAmount ? formatCurrency(totalAmount) : <span className="text-sm font-medium text-slate-400">{t("Pending lbs", "Pendiente lbs")}</span>}
                  </span>
                </div>
              </div>

              {/* Payment status */}
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-widest">
                  {t("Payment status", "Estado de pago")}
                </span>
                <span className={`text-xs font-bold px-3 py-1.5 rounded-full border ${
                  isPaid
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                    : "bg-red-50 text-red-600 border-red-200"
                }`} data-testid="order-detail-payment-status">
                  {isPaid ? `✓ ${t("Paid", "Pagado")}` : t("Unpaid", "Sin pagar")}
                </span>
              </div>

              {isPaid && localOrder.change_due > 0 && (
                <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-xl px-3.5 py-2.5">
                  <span className="text-xs font-semibold text-amber-700">{t("Change due", "Cambio")}</span>
                  <span className="text-sm font-bold text-amber-800">{formatCurrency(localOrder.change_due)}</span>
                </div>
              )}

              {/* Pay section */}
              {!isPaid && (
                <div className="space-y-4 border border-sky-200 bg-sky-50/40 rounded-2xl p-4" data-testid="order-detail-pay-section">
                  <div>
                    <p className="text-[10px] font-bold tracking-widest text-slate-400 uppercase mb-2.5">
                      {t("Payment method", "Método de pago")}
                    </p>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { val: "zelle",   label: "Zelle",                   icon: <Send className="w-4 h-4" /> },
                        { val: "venmo",   label: "Venmo",                   icon: <Send className="w-4 h-4" /> },
                        { val: "cashapp", label: "Cash App",                icon: <DollarSign className="w-4 h-4" /> },
                        { val: "card",    label: "Stripe",                  icon: <CreditCard className="w-4 h-4" /> },
                        { val: "cash",    label: t("Cash", "Efectivo"),      icon: <Banknote className="w-4 h-4" /> },
                        { val: "other",   label: t("Other", "Otro"),         icon: <DollarSign className="w-4 h-4" /> },
                      ].map(m => (
                        <PayMethodBtn
                          key={m.val} val={m.val} label={m.label} icon={m.icon}
                          active={payMethod === m.val}
                          onClick={() => setPayMethod(m.val)}
                          data-testid={`order-detail-pay-${m.val}`}
                        />
                      ))}
                    </div>
                  </div>

                  {payMethod === "cash" && (
                    <div>
                      <Label className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">
                        {t("Amount received", "Monto recibido")}
                      </Label>
                      <Input
                        type="number" step="0.01" min={totalAmount || 0}
                        placeholder={totalAmount ? `$${Number(totalAmount).toFixed(2)}` : "0.00"}
                        value={amountReceived} onChange={e => setAmountReceived(e.target.value)}
                        className="mt-1.5 h-10 rounded-xl border-slate-200"
                        data-testid="order-detail-cash-amount"
                      />
                    </div>
                  )}

                  {["zelle", "venmo", "cashapp"].includes(payMethod) && (
                    <div className="bg-white border border-amber-200 rounded-xl p-3.5 text-xs text-amber-800 space-y-1" data-testid="order-detail-zelle-info">
                      <p className="font-bold">
                        {payMethod === "zelle" ? "Instrucciones Zelle" : payMethod === "venmo" ? "Instrucciones Venmo" : "Instrucciones Cash App"}:
                      </p>
                      <p>Enviar a: <strong>{payMethod === "zelle" ? "payments@venturafreshlaundry.com" : payMethod === "venmo" ? "@VFLaundry" : "$VFLaundry"}</strong></p>
                      <p>Nota: Orden <strong>{formatOrderNumber(localOrder)}</strong></p>
                    </div>
                  )}

                  <Button
                    className="w-full h-11 bg-emerald-600 hover:bg-emerald-700 rounded-xl font-bold text-sm shadow-md shadow-emerald-100 transition-all"
                    onClick={handlePayment}
                    disabled={processing || !totalAmount}
                    data-testid="order-detail-collect-btn"
                  >
                    {processing
                      ? <RefreshCw className="w-4 h-4 animate-spin mr-2" />
                      : <DollarSign className="w-4 h-4 mr-2" />}
                    {payMethod === "card"
                      ? t("Pay with Stripe / Tap-to-Pay", "Pagar con Stripe / Tap")
                      : t("Register payment", "Registrar pago")}
                  </Button>

                  {!totalAmount && (
                    <p className="text-[11px] text-amber-600 text-center font-medium">
                      {t("Enter lbs first to calculate total", "Ingresa libras primero para calcular total")}
                    </p>
                  )}
                </div>
              )}
            </div>
          </Section>

          {/* ── Actions bar ── */}
          <div className="flex flex-wrap items-center gap-2 pt-1 pb-2" data-testid="order-detail-actions">
            <Button
              variant="outline" size="sm"
              className="text-xs gap-1.5 h-9 rounded-xl border-slate-200 font-semibold"
              onClick={handlePrintTicket}
              data-testid="order-detail-print"
            >
              <Printer className="w-3.5 h-3.5" /> {t("Print", "Imprimir")}
            </Button>
            <Button
              variant="outline" size="sm"
              className="text-xs gap-1.5 h-9 rounded-xl border-slate-200 font-semibold"
              onClick={handleDownloadPDF}
              data-testid="order-detail-pdf"
            >
              <FileDown className="w-3.5 h-3.5" /> PDF
            </Button>

            {/* Notify */}
            <div className="flex items-center gap-1.5 ml-auto" data-testid="order-detail-notify-group">
              <select
                value={notifyChannel}
                onChange={e => setNotifyChannel(e.target.value)}
                className="h-9 text-xs border border-slate-200 rounded-xl px-2.5 bg-white font-medium text-slate-600 focus:outline-none focus:border-sky-400"
                data-testid="order-detail-notify-channel"
              >
                <option value="sms">SMS</option>
                <option value="email">Email</option>
                <option value="call">Llamada</option>
                <option value="whatsapp">WhatsApp</option>
              </select>
              <Button
                size="sm"
                className="h-9 gap-1.5 text-xs bg-sky-600 hover:bg-sky-700 rounded-xl font-semibold"
                onClick={handleSendNotification}
                disabled={notifySending}
                data-testid="order-detail-notify"
              >
                {notifySending
                  ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  : <Send className="w-3.5 h-3.5" />}
                {t("Notify", "Notificar")}
              </Button>
            </div>
          </div>

        </div>
      </DialogContent>
    </Dialog>
  );
}