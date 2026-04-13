import { useState, useEffect, useCallback, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import {
  DollarSign, Scale, CreditCard, Banknote, Send, RefreshCw,
  Printer, X, ImageIcon, CheckCircle2, AlertTriangle, Eye,
  ShieldCheck, ShieldX, Clock, FileDown,
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

// ── Receipt Viewer (sin cambios relevantes) ──────────────────────────────────
function ReceiptCard({ receipt, onValidate, validating }) {
  const { t } = useLocale();
  const [expanded, setExpanded] = useState(false);
  const [blobUrl, setBlobUrl] = useState(null);
  const [imgError, setImgError] = useState(false);
  const [imgLoading, setImgLoading] = useState(true);

  useEffect(() => {
    let objectUrl = null;
    setImgLoading(true);
    setImgError(false);

    const fetchImage = async (retry = true) => {
      try {
        const tk = localStorage.getItem("token");
        const res = await fetch(`${API_URL}/api/files/${receipt.id}/download`, {
          headers: { Authorization: `Bearer ${tk}` },
        });
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(`HTTP ${res.status}: ${text.slice(0, 80)}`);
        }
        const blob = await res.blob();
        objectUrl = URL.createObjectURL(blob);
        setBlobUrl(objectUrl);
      } catch (err) {
        console.error("Image load error:", err);
        if (retry) {
          setTimeout(() => fetchImage(false), 1000);
        } else {
          setImgError(true);
          setImgLoading(false);
        }
      }
    };

    fetchImage();

    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [receipt.id]);

  const statusIcon = {
    verified_paid: <ShieldCheck className="w-4 h-4 text-emerald-500" />,
    rejected: <ShieldX className="w-4 h-4 text-red-500" />,
    pending: <Clock className="w-4 h-4 text-amber-500" />,
  }[receipt.ai_validation_status || "pending"] ?? <Clock className="w-4 h-4 text-slate-400" />;

  const statusLabel = {
    verified_paid: t("AI: Verified payment", "IA: Pago verificado"),
    rejected: t("AI: Not a valid payment", "IA: No es pago válido"),
    pending: t("Pending AI review", "Pendiente revisión IA"),
  }[receipt.ai_validation_status || "pending"] ?? t("Pending", "Pendiente");

  const statusCls = {
    verified_paid: "bg-emerald-50 border-emerald-200 text-emerald-700",
    rejected: "bg-red-50 border-red-200 text-red-700",
    pending: "bg-amber-50 border-amber-200 text-amber-700",
  }[receipt.ai_validation_status || "pending"] ?? "bg-slate-50 border-slate-200 text-slate-600";

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm">
      <div className="flex items-center gap-2 px-3 py-2.5 bg-slate-50 border-b border-slate-100">
        <ImageIcon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
        <span className="text-xs font-medium text-slate-600 truncate flex-1">
          {receipt.original_filename || "receipt"}
        </span>
        <span className="text-[10px] text-slate-400 shrink-0">
          {receipt.created_at ? new Date(receipt.created_at).toLocaleString() : ""}
        </span>
      </div>

      <div
        className={`relative bg-slate-100 cursor-pointer transition-all duration-300 ${
          expanded ? "min-h-[200px]" : "min-h-[120px]"
        }`}
        onClick={() => !imgLoading && !imgError && setExpanded((v) => !v)}
      >
        {imgLoading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <RefreshCw className="w-5 h-5 text-slate-400 animate-spin" />
          </div>
        )}

        {imgError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-slate-400">
            <AlertTriangle className="w-6 h-6" />
            <span className="text-[11px] text-center px-2">
              {t("Could not load image. Check that the file exists.", "No se pudo cargar la imagen. Verifica que el archivo exista.")}
            </span>
          </div>
        )}

        {blobUrl && !imgError && (
          <img
            src={blobUrl}
            alt="Receipt"
            className={`w-full object-contain transition-all duration-300 ${
              expanded ? "max-h-[520px]" : "max-h-[160px]"
            }`}
            onLoad={() => setImgLoading(false)}
            onError={() => { setImgError(true); setImgLoading(false); }}
          />
        )}

        {!imgLoading && !imgError && blobUrl && (
          <button
            onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }}
            className="absolute bottom-2 right-2 bg-black/50 text-white rounded-lg px-2 py-1 text-[10px] flex items-center gap-1 hover:bg-black/70 transition-colors"
          >
            <Eye className="w-3 h-3" />
            {expanded ? t("Collapse", "Colapsar") : t("Expand", "Ampliar")}
          </button>
        )}
      </div>

      <div className={`px-3 py-2 border-t border-slate-100 flex items-start gap-2 ${statusCls} border rounded-b-none`}>
        <div className="shrink-0 mt-0.5">{statusIcon}</div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold">{statusLabel}</p>
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
            {validating === receipt.id ? (
              <RefreshCw className="w-3 h-3 animate-spin" />
            ) : (
              t("Validate IA", "Validar IA")
            )}
          </Button>
        )}
      </div>
    </div>
  );
}

// ── Main Dialog ───────────────────────────────────────────────────────────────
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

  // Receipt state
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
      const res = await fetch(
        `${API_URL}/api/files/receipts-by-order/${orderId}`,
        { headers: { Authorization: `Bearer ${token()}` } }
      );
      if (res.ok) {
        const data = await res.json();
        setReceipts(data || []);
      }
    } catch {
      // silent
    } finally {
      setReceiptsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (order) {
      const id = order.id || order.order_id;
      loadReceipts(id);
    } else {
      setReceipts([]);
    }
  }, [order, loadReceipts]);

  if (!localOrder) return null;

  const orderId = localOrder.id || localOrder.order_id;
  const isPaid = (localOrder.payment_status || "").toLowerCase() === "paid";
  const totalAmount = localOrder.total_amount || localOrder.total || 0;
  const isWF = isWashFoldService(localOrder.service_type);

  // ── AI validate a receipt ──────────────────────────────────────────────────
  const handleValidateReceipt = async (fileId) => {
    setValidatingId(fileId);
    try {
      const res = await fetch(
        `${API_URL}/api/files/validate-payment-receipt/${fileId}?order_id=${orderId}`,
        { method: "POST", headers: { Authorization: `Bearer ${token()}` } }
      );
      if (res.ok) {
        const data = await res.json();
        setReceipts((prev) =>
          prev.map((r) =>
            r.id === fileId
              ? {
                  ...r,
                  ai_validation_status: data.is_valid_payment ? "verified_paid" : "rejected",
                  ai_validation_notes: data.notes,
                  ai_extracted_amount: data.amount,
                }
              : r
          )
        );
        if (data.is_valid_payment) {
          toast.success(t("Receipt validated — payment confirmed!", "¡Comprobante validado — pago confirmado!"));
        } else {
          toast.error(t("Not a valid payment receipt", "No es un comprobante de pago válido"));
        }
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.detail || t("Validation error", "Error de validación"));
      }
    } catch {
      toast.error(t("Connection error", "Error de conexión"));
    } finally {
      setValidatingId(null);
    }
  };

  // ── Save lbs + automatic notification ──────────────────────────────────────
  const handleSaveLbs = async () => {
    if (!lbs || isNaN(Number(lbs)) || Number(lbs) <= 0) {
      toast.error(t("Enter valid lbs", "Ingresa libras validas"));
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/api/orders/${orderId}`, {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify({ actual_lbs: Number(lbs) }),
      });
      if (res.ok) {
        const updated = await res.json();
        setLocalOrder((prev) => ({
          ...prev,
          actual_lbs: Number(lbs),
          total_amount: updated.total_amount || prev.total_amount,
        }));
        toast.success(t("Lbs saved & total recalculated", "Libras guardadas y total recalculado"));
        onRefresh?.();

        // ── NOTIFICACIÓN AUTOMÁTICA al cliente ──────────────────────────────
        try {
          const preferred = localOrder.preferred_contact || "sms";
          const notifyRes = await fetch(`${API_URL}/api/orders/${orderId}/notify-customer`, {
            method: "POST",
            headers: authHeaders(),
            body: JSON.stringify({ channel: preferred }),
          });
          const notifyData = await notifyRes.json();
          if (notifyRes.ok && notifyData.ok) {
            toast.success(t("Notification sent to customer", "Notificación enviada al cliente"));
          } else {
            console.warn("Auto-notification failed:", notifyData.detail);
          }
        } catch (err) {
          console.error("Auto-notify error:", err);
        }
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.detail || t("Error saving lbs", "Error al guardar libras"));
      }
    } catch {
      toast.error(t("Connection error", "Error de conexion"));
    } finally {
      setSaving(false);
    }
  };

  // ── Payment handler ────────────────────────────────────────────────────────
  const handlePayment = async () => {
    if (payMethod === "card") {
      setProcessing(true);
      try {
        const res = await fetch(`${API_URL}/api/orders/${orderId}/stripe-checkout`, {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ origin_url: window.location.origin }),
        });
        if (res.ok) {
          const data = await res.json();
          window.location.href = data.url || data.checkout_url;
          return;
        }
        const err = await res.json().catch(() => ({}));
        toast.error(err.detail || t("Stripe error", "Error de Stripe"));
      } catch {
        toast.error(t("Connection error", "Error de conexion"));
      } finally {
        setProcessing(false);
      }
      return;
    }

    const amt = payMethod === "cash" ? Number(amountReceived) : totalAmount;
    if (payMethod === "cash" && (!amt || amt < totalAmount)) {
      toast.error(t("Amount must be >= total", "Monto debe ser >= total"));
      return;
    }
    setProcessing(true);
    try {
      const res = await fetch(`${API_URL}/api/orders/${orderId}/payment`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ payment_method: payMethod, amount_received: amt }),
      });
      if (res.ok) {
        const data = await res.json();
        setLocalOrder((prev) => ({
          ...prev,
          payment_status: "paid",
          payment_method: payMethod,
          amount_paid: amt,
          change_due: data.change_due,
        }));
        toast.success(
          payMethod === "cash" && data.change_due > 0
            ? `${t("Paid!", "Pagado!")} ${t("Change", "Cambio")}: ${formatCurrency(data.change_due)}`
            : t("Payment registered", "Pago registrado")
        );
        onRefresh?.();
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.detail || t("Payment error", "Error de pago"));
      }
    } catch {
      toast.error(t("Connection error", "Error de conexion"));
    } finally {
      setProcessing(false);
    }
  };

  // ── Manual notification ────────────────────────────────────────────────────
  const handleSendNotification = async () => {
    setNotifySending(true);
    try {
      const res = await fetch(`${API_URL}/api/orders/${orderId}/notify-customer`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ channel: notifyChannel }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        toast.success(
          t(
            `Notification sent via ${notifyChannel.toUpperCase()}`,
            `Notificacion enviada por ${notifyChannel.toUpperCase()}`
          )
        );
      } else {
        toast.error(data.detail || t("Could not send notification", "No se pudo enviar notificacion"));
      }
    } catch {
      toast.error(t("Connection error", "Error de conexion"));
    } finally {
      setNotifySending(false);
    }
  };

  // ── Print & PDF ────────────────────────────────────────────────────────────
  const handlePrintTicket = async () => {
    try {
      const res = await fetch(`${API_URL}/api/orders/${orderId}/ticket`, {
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error();
      const html = await res.text();
      const pw = window.open("", "_blank", "width=350,height=600");
      if (!pw) { toast.error(t("Allow pop-ups", "Permite pop-ups")); return; }
      pw.document.write(html);
      pw.document.close();
    } catch {
      toast.error(t("Could not print ticket", "No se pudo imprimir ticket"));
    }
  };

  const handleDownloadPDF = async () => {
    try {
      const { default: html2pdf } = await import("html2pdf.js");
      const res = await fetch(`${API_URL}/api/orders/${orderId}/ticket`, {
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error();
      const htmlContent = await res.text();
      const container = document.createElement("div");
      container.innerHTML = htmlContent;
      container.style.width = "380px";
      document.body.appendChild(container);
      await html2pdf()
        .set({
          margin: 4,
          filename: `ticket-${formatOrderNumber(localOrder)}.pdf`,
          html2canvas: { scale: 2, useCORS: true },
          jsPDF: { unit: "mm", format: [100, 250], orientation: "portrait" },
        })
        .from(container)
        .save();
      document.body.removeChild(container);
      toast.success(t("PDF downloaded", "PDF descargado"));
    } catch {
      toast.error(t("Could not generate PDF", "No se pudo generar el PDF"));
    }
  };

  const verifiedReceipts = receipts.filter((r) => r.ai_validation_status === "verified_paid");
  const hasVerifiedReceipt = verifiedReceipts.length > 0;

  return (
    <Dialog open={!!order} onOpenChange={() => onClose()}>
      <DialogContent
        className="w-[95vw] max-w-xl max-h-[90vh] overflow-y-auto bg-white"
        data-testid="order-detail-dialog"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            {t("Order", "Orden")} {formatOrderNumber(localOrder)}
            <Badge variant="outline" className="ml-auto text-xs">
              {safeString(localOrder.status)}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          {/* Customer info */}
          <div className="grid grid-cols-2 gap-3 bg-slate-50 rounded-lg p-3" data-testid="order-detail-customer">
            <div>
              <span className="text-slate-400 text-xs">{t("Customer", "Cliente")}</span>
              <p className="font-semibold text-slate-800">{safeString(localOrder.customer_name, "N/A")}</p>
            </div>
            <div>
              <span className="text-slate-400 text-xs">{t("Phone", "Telefono")}</span>
              <p className="font-medium text-slate-700">{safeString(localOrder.customer_phone, "N/A")}</p>
            </div>
            <div>
              <span className="text-slate-400 text-xs">{t("Email", "Email")}</span>
              <p className="font-medium text-slate-700 truncate">{safeString(localOrder.customer_email, "N/A")}</p>
            </div>
            <div>
              <span className="text-slate-400 text-xs">{t("Service", "Servicio")}</span>
              <p className="font-medium text-slate-700">{isWF ? "Wash & Fold" : "Pickup & Delivery"}</p>
            </div>
            {localOrder.preferred_contact && (
              <div>
                <span className="text-slate-400 text-xs">{t("Contact pref.", "Pref. contacto")}</span>
                <p className="font-medium text-slate-700 capitalize">{localOrder.preferred_contact}</p>
              </div>
            )}
            {localOrder.membership_plan && (
              <div>
                <span className="text-slate-400 text-xs">{t("Membership", "Membresia")}</span>
                <p className="font-medium text-sky-700">{localOrder.membership_plan}</p>
              </div>
            )}
          </div>

          {/* Addresses */}
          {(localOrder.pickup_address || localOrder.delivery_address) && (
            <div className="bg-slate-50 rounded-lg p-3 space-y-2" data-testid="order-detail-addresses">
              {localOrder.pickup_address && (
                <div>
                  <span className="text-slate-400 text-xs">{t("Pickup address", "Dir. pickup")}</span>
                  <p className="font-medium text-slate-700">{localOrder.pickup_address}</p>
                </div>
              )}
              {localOrder.delivery_address && localOrder.delivery_address !== localOrder.pickup_address && (
                <div>
                  <span className="text-slate-400 text-xs">{t("Delivery address", "Dir. entrega")}</span>
                  <p className="font-medium text-slate-700">{localOrder.delivery_address}</p>
                </div>
              )}
              {localOrder.gate_code && (
                <div>
                  <span className="text-slate-400 text-xs">{t("Gate code", "Codigo porton")}</span>
                  <p className="font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded inline-block">{localOrder.gate_code}</p>
                </div>
              )}
            </div>
          )}

          {/* Schedule */}
          {(localOrder.pickup_date || localOrder.pickup_time) && (
            <div className="flex gap-4">
              {localOrder.pickup_date && (
                <div>
                  <span className="text-slate-400 text-xs">{t("Date", "Fecha")}</span>
                  <p className="font-medium">{formatShortDatePT(localOrder.pickup_date)}</p>
                </div>
              )}
              {localOrder.pickup_time && (
                <div>
                  <span className="text-slate-400 text-xs">{t("Time", "Hora")}</span>
                  <p className="font-medium">{localOrder.pickup_time}</p>
                </div>
              )}
            </div>
          )}

          {/* Notes */}
          {notes && (
            <div className="bg-amber-50 border border-amber-100 rounded-lg p-3" data-testid="order-detail-notes">
              <span className="text-amber-600 text-xs font-semibold">{t("Notes / Instructions", "Notas / Instrucciones")}</span>
              <p className="text-sm text-slate-700 mt-1">{notes}</p>
            </div>
          )}

          {/* Preferences snapshot */}
          {localOrder.preferences_snapshot && (
            <details className="bg-slate-50 rounded-lg p-3">
              <summary className="text-xs text-slate-500 cursor-pointer font-semibold">
                {t("Customer preferences", "Preferencias del cliente")}
              </summary>
              <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                {Object.entries(localOrder.preferences_snapshot)
                  .filter(([k]) => !["id", "version", "customer_id"].includes(k))
                  .map(([k, v]) => (
                    <div key={k}>
                      <span className="text-slate-400">{k.replace(/_/g, " ")}</span>
                      <p className="text-slate-700 font-medium">{String(v || "—")}</p>
                    </div>
                  ))}
              </div>
            </details>
          )}

          {/* ── PAYMENT RECEIPTS SECTION ─────────────────────────────────── */}
          <div className="border border-slate-200 rounded-xl overflow-hidden" data-testid="order-detail-receipts">
            <div className="flex items-center gap-2 px-4 py-3 bg-slate-50 border-b border-slate-100">
              <ImageIcon className="w-4 h-4 text-slate-500 shrink-0" />
              <h3 className="font-semibold text-slate-800 text-sm flex-1">{t("Payment Receipts", "Comprobantes de Pago")}</h3>
              {receiptsLoading && <RefreshCw className="w-3.5 h-3.5 text-slate-400 animate-spin" />}
              {hasVerifiedReceipt && (
                <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
                  <CheckCircle2 className="w-3 h-3" />
                  {verifiedReceipts.length} {t("verified", "verificado(s)")}
                </span>
              )}
              <button
                onClick={() => loadReceipts(orderId)}
                className="text-slate-400 hover:text-slate-600 transition-colors"
                title={t("Refresh", "Actualizar")}
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="p-3">
              {receiptsLoading ? (
                <div className="py-6 text-center text-slate-400 text-xs flex flex-col items-center gap-2">
                  <RefreshCw className="w-5 h-5 animate-spin" />
                  {t("Loading receipts…", "Cargando comprobantes…")}
                </div>
              ) : receipts.length === 0 ? (
                <div className="py-6 text-center text-slate-400 text-xs flex flex-col items-center gap-1.5">
                  <ImageIcon className="w-8 h-8 opacity-30" />
                  <p>{t("No receipts uploaded by customer yet", "El cliente aún no ha subido comprobantes")}</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {receipts.map((receipt) => (
                    <ReceiptCard key={receipt.id} receipt={receipt} onValidate={handleValidateReceipt} validating={validatingId} />
                  ))}
                </div>
              )}
              {(localOrder.payment_status === "pending_verification" || localOrder.payment_status === "pending") &&
                !hasVerifiedReceipt && receipts.length > 0 && (
                  <div className="mt-3 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 text-xs text-amber-800">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <p>
                      {t(
                        "Customer submitted payment — validate the receipt with AI before confirming.",
                        "El cliente envió pago — valida el comprobante con IA antes de confirmar."
                      )}
                    </p>
                  </div>
                )}
            </div>
          </div>

          {/* ── Lbs + Amount section ─────────────────────────────────────── */}
          <div className="border-t border-slate-200 pt-4 space-y-3" data-testid="order-detail-lbs-payment">
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <Label className="text-xs flex items-center gap-1.5">
                  <Scale className="w-3.5 h-3.5 text-slate-500" />
                  {t("Actual Lbs", "Libras reales")}
                </Label>
                <Input
                  type="number"
                  step="0.1"
                  min="0"
                  placeholder="0.0"
                  value={lbs}
                  onChange={(e) => setLbs(e.target.value)}
                  className="mt-1 h-9 text-sm"
                  data-testid="order-detail-lbs-input"
                />
              </div>
              <Button
                size="sm"
                onClick={handleSaveLbs}
                disabled={saving}
                className="h-9 bg-sky-600 hover:bg-sky-700"
                data-testid="order-detail-save-lbs"
              >
                {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : t("Save lbs", "Guardar lbs")}
              </Button>
            </div>

            <div className="flex items-center justify-between py-2 bg-slate-50 rounded-lg px-3">
              <span className="text-slate-500 font-medium">{t("Total", "Total")}</span>
              <span className="text-xl font-bold text-slate-900" data-testid="order-detail-total">
                {totalAmount ? formatCurrency(totalAmount) : t("Pending lbs", "Pendiente lbs")}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-slate-500">{t("Payment", "Pago")}</span>
              <Badge variant={isPaid ? "default" : "destructive"} data-testid="order-detail-payment-status">
                {isPaid ? t("Paid", "Pagado") : t("Unpaid", "Sin pagar")}
              </Badge>
            </div>

            {isPaid && localOrder.change_due > 0 && (
              <div className="text-sm text-amber-600 font-semibold bg-amber-50 rounded-lg px-3 py-2">
                {t("Change due", "Cambio")}: {formatCurrency(localOrder.change_due)}
              </div>
            )}

            {/* Payment form — only if not paid */}
            {!isPaid && (
              <div className="space-y-3 border border-sky-100 bg-sky-50/30 rounded-lg p-3" data-testid="order-detail-pay-section">
                <div>
                  <Label className="text-xs">{t("Payment method", "Metodo de pago")}</Label>
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 mt-1.5">
                    {[
                      { val: "zelle", label: "Zelle", icon: <Send className="w-3.5 h-3.5" /> },
                      { val: "venmo", label: "Venmo", icon: <Send className="w-3.5 h-3.5" /> },
                      { val: "cashapp", label: "CashApp", icon: <DollarSign className="w-3.5 h-3.5" /> },
                      { val: "card", label: "Stripe", icon: <CreditCard className="w-3.5 h-3.5" /> },
                      { val: "cash", label: t("Cash", "Efectivo"), icon: <Banknote className="w-3.5 h-3.5" /> },
                      { val: "other", label: t("Other", "Otro"), icon: <DollarSign className="w-3.5 h-3.5" /> },
                    ].map((m) => (
                      <button
                        key={m.val}
                        onClick={() => setPayMethod(m.val)}
                        className={`flex flex-col items-center gap-1 py-2 rounded-lg border text-xs font-medium transition-all ${
                          payMethod === m.val
                            ? "bg-sky-600 text-white border-sky-600"
                            : "bg-white text-slate-600 border-slate-200 hover:border-sky-300"
                        }`}
                        data-testid={`order-detail-pay-${m.val}`}
                      >
                        {m.icon}
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>

                {payMethod === "cash" && (
                  <div>
                    <Label className="text-xs">{t("Amount received", "Monto recibido")}</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min={totalAmount || 0}
                      placeholder={totalAmount ? `$${Number(totalAmount).toFixed(2)}` : "0.00"}
                      value={amountReceived}
                      onChange={(e) => setAmountReceived(e.target.value)}
                      className="mt-1 h-9"
                      data-testid="order-detail-cash-amount"
                    />
                  </div>
                )}

                {payMethod === "zelle" && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-xs text-amber-800" data-testid="order-detail-zelle-info">
                    <p className="font-semibold mb-1">Instrucciones Zelle:</p>
                    <p>Enviar a: <strong>payments@venturafreshlaundry.com</strong></p>
                    <p>Nota: Orden <strong>{formatOrderNumber(localOrder)}</strong></p>
                  </div>
                )}
                {(payMethod === "venmo" || payMethod === "cashapp") && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-xs text-amber-800">
                    <p className="font-semibold mb-1">
                      {payMethod === "venmo" ? "Instrucciones Venmo:" : "Instrucciones Cash App:"}
                    </p>
                    <p>
                      Enviar a:{" "}
                      <strong>
                        {payMethod === "venmo" ? "@VenturaFreshLaundry" : "$venturafreshlaundry"}
                      </strong>
                    </p>
                    <p>Nota: Orden <strong>{formatOrderNumber(localOrder)}</strong></p>
                  </div>
                )}

                <Button
                  className="w-full bg-emerald-600 hover:bg-emerald-700"
                  onClick={handlePayment}
                  disabled={processing || !totalAmount}
                  data-testid="order-detail-collect-btn"
                >
                  {processing ? (
                    <RefreshCw className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    <DollarSign className="w-4 h-4 mr-2" />
                  )}
                  {payMethod === "card"
                    ? t("Pay with Stripe / Tap-to-Pay", "Pagar con Stripe / Tap")
                    : t("Register payment", "Registrar pago")}
                </Button>
                {!totalAmount && (
                  <p className="text-xs text-amber-600 text-center">
                    {t("Enter lbs first to calculate total", "Ingresa libras primero para calcular total")}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap gap-2 border-t border-slate-200 pt-3" data-testid="order-detail-actions">
            <Button variant="outline" size="sm" className="text-xs gap-1" onClick={handlePrintTicket} data-testid="order-detail-print">
              <Printer className="w-3.5 h-3.5" /> {t("Print Ticket", "Imprimir Ticket")}
            </Button>
            <Button variant="outline" size="sm" className="text-xs gap-1" onClick={handleDownloadPDF} data-testid="order-detail-pdf">
              <FileDown className="w-3.5 h-3.5" /> PDF
            </Button>
            <div className="flex items-center gap-1" data-testid="order-detail-notify-group">
              <select
                value={notifyChannel}
                onChange={(e) => setNotifyChannel(e.target.value)}
                className="h-8 text-[10px] border border-slate-200 rounded-md px-1.5 bg-white"
                data-testid="order-detail-notify-channel"
              >
                <option value="sms">SMS</option>
                <option value="email">Email</option>
              </select>
              <Button
                variant="outline"
                size="sm"
                className="text-xs gap-1"
                onClick={handleSendNotification}
                disabled={notifySending}
                data-testid="order-detail-notify"
              >
                <Send className="w-3.5 h-3.5" /> {notifySending ? "..." : t("Notify", "Notificar")}
              </Button>
            </div>
            <Button variant="outline" size="sm" className="text-xs gap-1 ml-auto" onClick={onClose} data-testid="order-detail-close">
              <X className="w-3.5 h-3.5" /> {t("Close", "Cerrar")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}