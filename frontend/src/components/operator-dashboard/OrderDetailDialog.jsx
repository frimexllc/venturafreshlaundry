import { useState, useEffect } from "react";
import axios from "axios";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "../ui/dialog";
import { toast } from "sonner";
import { useLocale } from "../../context/LocaleContext";
import {
  ORDER_STATUSES, PAYMENT_METHODS, PREFERENCE_LABELS,
  safeString, formatOrderNumber, formatCurrency, renderPreferenceValue,
  calculateServiceCharge, getErrorMessage, isWashFoldService
} from "./utils";

const API_URL = process.env.REACT_APP_BACKEND_URL;

export default function OrderDetailDialog({ order, onClose, onRefresh }) {
  const { t } = useLocale();
  const [weightForm, setWeightForm] = useState({ estimated_lbs: "", actual_lbs: "" });
  const [savingWeights, setSavingWeights] = useState(false);
  const [paymentForm, setPaymentForm] = useState({ method: "cash", amountReceived: "" });
  const [savingPayment, setSavingPayment] = useState(false);
  const [stripeLoading, setStripeLoading] = useState(false);
  const [currentOrder, setCurrentOrder] = useState(null);

  useEffect(() => {
    if (order) {
      setCurrentOrder(order);
      setWeightForm({ estimated_lbs: order.estimated_lbs ?? "", actual_lbs: order.actual_lbs ?? "" });
      setPaymentForm({ method: order.payment_method || "cash", amountReceived: order.amount_paid ?? "" });
    } else {
      setCurrentOrder(null);
    }
  }, [order]);

  const getStatusLabel = (status, serviceType) => {
    const normalizedStatus = (status || "").toString().toUpperCase();
    if (isWashFoldService(serviceType)) {
      const map = { NEW: t("Order Received", "Orden recibida"), PROCESSING: t("Processing", "Procesando"), READY: t("Ready for Pickup", "Lista para recoger"), COMPLETED: t("Completed", "Completada"), CANCELLED: t("Cancelled", "Cancelada") };
      return map[normalizedStatus] || safeString(status);
    }
    const map = { NEW: t("Order Created", "Orden creada"), CONFIRMED: t("Pickup Confirmed", "Pickup confirmado"), PICKUP_SCHEDULED: t("Pickup Confirmed", "Pickup confirmado"), PICKED_UP: t("Order in Process", "Orden en proceso"), PROCESSING: t("Order in Process", "Orden en proceso"), READY: t("Ready", "Lista"), OUT_FOR_DELIVERY: t("Out for Delivery", "En camino"), DELIVERED: t("Delivered", "Entregada"), COMPLETED: t("Completed", "Completada"), CANCELLED: t("Cancelled", "Cancelada") };
    return map[normalizedStatus] || safeString(status);
  };

  const getStatusInfo = (status, serviceType) => {
    const found = ORDER_STATUSES.find((s) => s.value === status) || ORDER_STATUSES[0];
    return { ...found, label: getStatusLabel(found.value, serviceType) };
  };

  const getPaymentMethodLabel = (method) => {
    const map = { cash: t("Cash", "Efectivo"), card: t("Card (Stripe)", "Tarjeta (Stripe)"), transfer: t("Transfer", "Transferencia"), other: t("Other", "Otro") };
    return map[method] || safeString(method);
  };

  const getPaymentStatusLabel = (status) => {
    if (!status) return t("Pending", "Pendiente");
    const normalized = status.toString().toLowerCase();
    if (normalized === "paid") return t("Paid", "Pagado");
    if (normalized === "refunded") return t("Refunded", "Reembolsado");
    if (normalized === "failed") return t("Failed", "Fallido");
    return t("Pending", "Pendiente");
  };

  const getPreferenceLabel = (key) => {
    const map = {
      detergent_type: t("Detergent", "Detergente"), water_temperature: t("Water temperature", "Temperatura de agua"),
      fabric_softener: t("Fabric softener", "Suavizante"), folding_style: t("Folding style", "Estilo de doblado"),
      hanging_instructions: t("Hanging instructions", "Instrucciones de colgado"), allergies: t("Allergies", "Alergias"),
      special_instructions: t("Special instructions", "Instrucciones especiales"), pickup_time_preference: t("Preferred time", "Horario preferido"),
      gate_code: t("Gate code", "Código de acceso"), hang_dry_items: t("Hang dry items", "Secado al aire"), fragrance_preference: t("Fragrance", "Fragancia")
    };
    return map[key] || key;
  };

  const charge = currentOrder ? calculateServiceCharge(currentOrder) : null;

  const getWeightDelta = () => {
    try {
      const est = parseFloat(weightForm.estimated_lbs);
      const act = parseFloat(weightForm.actual_lbs);
      if (Number.isNaN(est) || Number.isNaN(act)) return "-";
      const diff = parseFloat((act - est).toFixed(2));
      return diff > 0 ? `+${diff}` : `${diff}`;
    } catch { return "-"; }
  };

  const getChangePreview = () => {
    try {
      const totalRaw = currentOrder?.total_amount ?? charge;
      if (!totalRaw) return "-";
      const amount = parseFloat(paymentForm.amountReceived);
      const total = parseFloat(totalRaw);
      if (Number.isNaN(amount) || Number.isNaN(total)) return "-";
      const diff = amount - total;
      return diff >= 0 ? `$${diff.toFixed(2)}` : `-$${Math.abs(diff).toFixed(2)}`;
    } catch { return "-"; }
  };

  const updateOrderWeights = async () => {
    if (!currentOrder) return;
    const orderPrimaryId = currentOrder.id || currentOrder.order_id;
    setSavingWeights(true);
    try {
      const payload = {
        estimated_lbs: weightForm.estimated_lbs === "" ? null : parseFloat(weightForm.estimated_lbs),
        actual_lbs: weightForm.actual_lbs === "" ? null : parseFloat(weightForm.actual_lbs)
      };
      const res = await axios.put(`${API_URL}/api/orders/${orderPrimaryId}`, payload);
      const updated = res.data;
      toast.success(t("Weights updated", "Libras actualizadas"));
      setCurrentOrder((prev) => prev ? { ...prev, ...updated, order_id: prev.order_id, id: prev.id || updated.id } : prev);
      onRefresh?.();
    } catch (error) {
      toast.error(getErrorMessage(error, t("Error updating weights", "Error actualizando libras")));
    } finally {
      setSavingWeights(false);
    }
  };

  const handlePrintTicket = async () => {
    if (!currentOrder) return;
    const orderPrimaryId = currentOrder.id || currentOrder.order_id;
    if (!orderPrimaryId) { toast.error(t("Invalid order", "Orden inválida")); return; }
    try {
      const res = await axios.get(`${API_URL}/api/orders/${orderPrimaryId}/qr.svg`, { responseType: "blob" });
      const blobUrl = window.URL.createObjectURL(res.data);
      const printWindow = window.open("");
      if (!printWindow) { toast.error(t("Allow pop-ups to print", "Permite ventanas emergentes para imprimir")); return; }
      printWindow.document.write(`<html><body style="margin:0;display:flex;align-items:center;justify-content:center;"><img src="${blobUrl}" style="max-width:100%;" onload="window.print();window.onafterprint=function(){window.close();};" /></body></html>`);
      printWindow.document.close();
    } catch {
      toast.error(t("Could not generate ticket", "No se pudo generar el ticket"));
    }
  };

  const handleRegisterPayment = async () => {
    if (!currentOrder) return;
    const orderPrimaryId = currentOrder.id || currentOrder.order_id;
    const totalAmount = currentOrder.total_amount ?? charge;
    if (!totalAmount) { toast.error(t("Set actual lbs to calculate total", "Ingresa lbs reales para calcular")); return; }
    if (!currentOrder.total_amount) {
      await axios.put(`${API_URL}/api/orders/${orderPrimaryId}`, { actual_lbs: currentOrder.actual_lbs });
    }
    if (paymentForm.method === "cash" && paymentForm.amountReceived === "") {
      toast.error(t("Enter amount received", "Ingresa el monto recibido")); return;
    }
    setSavingPayment(true);
    try {
      const payload = { payment_method: paymentForm.method, amount_received: paymentForm.amountReceived === "" ? null : parseFloat(paymentForm.amountReceived) };
      const res = await axios.post(`${API_URL}/api/orders/${orderPrimaryId}/payment`, payload);
      toast.success(t("Payment registered", "Pago registrado"));
      setCurrentOrder((prev) => prev ? { ...prev, ...res.data } : prev);
      onRefresh?.();
    } catch (error) {
      toast.error(getErrorMessage(error, t("Error registering payment", "Error registrando pago")));
    } finally {
      setSavingPayment(false);
    }
  };

  const initiateStripeCheckout = async () => {
    if (!currentOrder) return;
    setStripeLoading(true);
    try {
      const orderId = currentOrder.id || currentOrder.order_id;
      const res = await axios.post(`${API_URL}/api/orders/${orderId}/stripe-checkout`, { origin_url: window.location.origin });
      if (res.data?.url) window.location.href = res.data.url;
      else toast.error(t("Unable to start Stripe checkout", "No se pudo iniciar Stripe"));
    } catch (error) {
      toast.error(getErrorMessage(error, t("Stripe checkout failed", "Falló Stripe")));
    } finally {
      setStripeLoading(false);
    }
  };

  if (!order || !currentOrder) return null;

  return (
    <Dialog open={!!order && !!currentOrder} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-[95vw] max-w-lg bg-white max-h-[90vh] overflow-y-auto" data-testid="operator-order-detail-modal">
        <DialogHeader>
          <DialogTitle className="text-base sm:text-lg">
            {t("Order", "Orden")} <span className="font-mono text-sm" data-testid="operator-order-number">{formatOrderNumber(currentOrder)}</span>
          </DialogTitle>
          <DialogDescription className="text-xs sm:text-sm" data-testid="operator-order-description">
            {t("Complete order details for operation.", "Detalle completo de la orden para operación.")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: t("Status", "Estado"), value: getStatusInfo(currentOrder?.status, currentOrder?.service_type).label, testId: "status" },
              { label: t("Service", "Servicio"), value: safeString(currentOrder.service_type, "-"), testId: "service" },
              { label: t("Customer", "Cliente"), value: safeString(currentOrder.customer_name, "-"), testId: "customer" },
              { label: t("Membership", "Membresía"), value: safeString(currentOrder.membership_plan, t("No", "No")), testId: "membership" },
              { label: t("Phone", "Teléfono"), value: safeString(currentOrder.customer_phone, "-"), testId: "phone" },
              { label: t("Email", "Correo"), value: safeString(currentOrder.customer_email, "-"), testId: "email" },
            ].map(({ label, value, testId }) => (
              <div key={testId}>
                <p className="text-xs text-slate-500">{label}</p>
                <p className="font-medium text-sm break-words" data-testid={`operator-order-${testId}`}>{value}</p>
              </div>
            ))}
          </div>

          <div>
            <p className="text-xs text-slate-500">{t("Contact preference", "Contacto preferido")}</p>
            <p className="font-medium text-sm" data-testid="operator-order-contact">{safeString(currentOrder.preferred_contact, "-")}</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-slate-500">{t("Pickup Date", "Fecha Pickup")}</p>
              <p className="font-medium text-sm" data-testid="operator-order-pickup-date">{safeString(currentOrder.pickup_date, "-")}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">{t("Time Window", "Ventana de tiempo")}</p>
              <p className="font-medium text-sm" data-testid="operator-order-pickup-window">{safeString(currentOrder.pickup_time, "-")}</p>
            </div>
          </div>

          <div>
            <p className="text-xs text-slate-500">{t("Pickup Address", "Dirección Pickup")}</p>
            <p className="font-medium text-sm break-words" data-testid="operator-order-pickup-address">{safeString(currentOrder.pickup_address, "-")}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">{t("Delivery Address", "Dirección Entrega")}</p>
            <p className="font-medium text-sm break-words" data-testid="operator-order-delivery-address">{safeString(currentOrder.delivery_address, "-")}</p>
          </div>

          {currentOrder.special_instructions && (
            <div>
              <p className="text-xs text-slate-500">{t("Notes", "Notas")}</p>
              <p className="font-medium text-sm" data-testid="operator-order-notes">{safeString(currentOrder.special_instructions)}</p>
            </div>
          )}
          {currentOrder.gate_code && (
            <div>
              <p className="text-xs text-slate-500">{t("Gate code", "Código de acceso")}</p>
              <p className="font-medium text-sm" data-testid="operator-order-gate">{safeString(currentOrder.gate_code)}</p>
            </div>
          )}

          {/* Weights */}
          <div className="border-t pt-3" data-testid="operator-lbs-section">
            <p className="text-sm font-medium text-slate-700 mb-2">{t("Pounds", "Libras")}</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-slate-500">{t("Est. Lbs", "Est. Lbs")}</p>
                <Input type="number" step="0.1" value={weightForm.estimated_lbs} onChange={(e) => setWeightForm({ ...weightForm, estimated_lbs: e.target.value })} className="mt-1 h-8 text-sm" data-testid="operator-estimated-lbs-input" />
              </div>
              <div>
                <p className="text-xs text-slate-500">{t("Actual Lbs", "Actual Lbs")}</p>
                <Input type="number" step="0.1" value={weightForm.actual_lbs} onChange={(e) => setWeightForm({ ...weightForm, actual_lbs: e.target.value })} className="mt-1 h-8 text-sm" data-testid="operator-actual-lbs-input" />
              </div>
            </div>
            <div className="flex items-center justify-between mt-2">
              <p className="text-xs text-slate-500" data-testid="operator-lbs-delta">{t("Difference:", "Diferencia:")} {getWeightDelta()}</p>
              <Button variant="outline" size="sm" className="text-xs" onClick={updateOrderWeights} disabled={savingWeights} data-testid="operator-save-lbs">
                {savingWeights ? t("Saving...", "Guardando...") : t("Save lbs", "Guardar libras")}
              </Button>
            </div>
          </div>

          {/* Payment */}
          <div className="border-t pt-3" data-testid="operator-payment-section">
            <p className="text-sm font-medium text-slate-700 mb-2">{t("Payment", "Pago")}</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-slate-500">{t("Total", "Total")}</p>
                <p className="font-medium text-sm" data-testid="operator-payment-total">{formatCurrency(currentOrder.total_amount ?? charge)}</p>
                <p className="text-xs text-slate-500 mt-0.5" data-testid="operator-payment-total-note">
                  {charge ? t("Auto-calculated from actual lbs", "Calculado automáticamente según lbs reales") : t("Set actual lbs to calculate total", "Ingresa lbs reales para calcular")}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">{t("Status", "Estado")}</p>
                <p className="font-medium text-sm" data-testid="operator-payment-status">{getPaymentStatusLabel(currentOrder.payment_status)}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-2">
              <div>
                <p className="text-xs text-slate-500">{t("Method", "Método")}</p>
                <select value={paymentForm.method} onChange={(e) => setPaymentForm({ ...paymentForm, method: e.target.value })} className="w-full mt-1 border border-slate-200 rounded-md px-2 py-1.5 text-xs sm:text-sm" data-testid="operator-payment-method">
                  {PAYMENT_METHODS.map((method) => (
                    <option key={method.value} value={method.value}>{getPaymentMethodLabel(method.value)}</option>
                  ))}
                </select>
                {paymentForm.method === "card" && (
                  <p className="text-xs text-slate-500 mt-1" data-testid="operator-payment-stripe-note">
                    {t("Card payments open Stripe Checkout", "Los pagos con tarjeta abren Stripe Checkout")}
                  </p>
                )}
              </div>
              <div>
                <p className="text-xs text-slate-500">{t("Amount received", "Monto recibido")}</p>
                <Input type="number" step="0.01" value={paymentForm.amountReceived} onChange={(e) => setPaymentForm({ ...paymentForm, amountReceived: e.target.value })} className="mt-1 h-8 text-sm" disabled={paymentForm.method !== "cash"} placeholder={paymentForm.method === "cash" ? "0.00" : t("Not required", "No requerido")} data-testid="operator-payment-amount" />
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 mt-2">
              <p className="text-xs text-slate-500" data-testid="operator-payment-change">{t("Change:", "Cambio:")} {paymentForm.method === "cash" ? getChangePreview() : "-"}</p>
              <div className="flex flex-wrap gap-1.5">
                <Button variant="outline" size="sm" className="text-xs" onClick={handleRegisterPayment} disabled={savingPayment} data-testid="operator-payment-save">
                  {savingPayment ? t("Saving...", "Guardando...") : t("Register payment", "Registrar pago")}
                </Button>
                <Button variant="secondary" size="sm" className="text-xs" onClick={handlePrintTicket} data-testid="operator-payment-print">
                  {t("Print Ticket", "Imprimir Ticket")}
                </Button>
                {paymentForm.method === "card" && (
                  <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-xs" onClick={initiateStripeCheckout} disabled={stripeLoading || !charge} data-testid="operator-payment-stripe">
                    {stripeLoading ? t("Starting Stripe...", "Iniciando Stripe...") : t("Pay with Stripe", "Pagar con Stripe")}
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* Preferences */}
          <div className="border-t pt-3" data-testid="operator-preferences-section">
            <p className="text-sm font-medium text-slate-700 mb-2">{t("Laundry preferences", "Preferencias de lavandería")}</p>
            {currentOrder.preferences_snapshot ? (
              <div className="grid grid-cols-2 gap-2 sm:gap-3">
                {Object.entries(PREFERENCE_LABELS).map(([key]) => (
                  <div key={key}>
                    <p className="text-xs text-slate-500">{getPreferenceLabel(key)}</p>
                    <p className="font-medium text-xs sm:text-sm" data-testid={`operator-pref-${key}`}>
                      {renderPreferenceValue(currentOrder.preferences_snapshot?.[key])}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm font-medium text-slate-600" data-testid="operator-pref-empty">
                {t("No preferences recorded", "Sin preferencias registradas")}
              </p>
            )}
            <p className="text-xs text-slate-500 mt-2" data-testid="operator-pref-id">
              {t("PREF:", "PREF:")} {safeString(currentOrder.preferences_id, "N/A")}
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
