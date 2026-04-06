import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { Button } from "../components/ui/button";
import { CreditCard, DollarSign, Building2, CheckCircle, Loader2, AlertTriangle } from "lucide-react";

const API_URL = process.env.REACT_APP_BACKEND_URL;

export default function CustomerPaymentPage() {
  const { orderId } = useParams();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("paid") === "1") {
      // Mark as paid after returning from Stripe
      fetch(`${API_URL}/api/customer/order/${orderId}/confirm-payment`, { method: "POST" })
        .catch(() => {});
    }
    fetch(`${API_URL}/api/customer/order/${orderId}`)
      .then(r => r.ok ? r.json() : Promise.reject("not_found"))
      .then(data => setOrder(data))
      .catch(() => setError("Orden no encontrada"))
      .finally(() => setLoading(false));
  }, [orderId]);

  const handleStripePayment = async () => {
    setPaying(true);
    try {
      const res = await fetch(`${API_URL}/api/customer/order/${orderId}/checkout`, { method: "POST" });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        setError("No se pudo generar el enlace de pago");
      }
    } catch {
      setError("Error al procesar el pago");
    } finally {
      setPaying(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-sky-500" />
      </div>
    );
  }

  if (error && !order) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
          <AlertTriangle className="h-12 w-12 text-amber-500 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-slate-800 mb-2">Orden no encontrada</h1>
          <p className="text-sm text-slate-500">El enlace de pago puede haber expirado o la orden ya fue procesada.</p>
        </div>
      </div>
    );
  }

  if (order?.payment_status === "paid") {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
          <CheckCircle className="h-16 w-16 text-emerald-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-slate-800 mb-2">Pago Completado</h1>
          <p className="text-sm text-slate-500 mb-4">Tu pago de <strong>${Number(order.total_amount || 0).toFixed(2)}</strong> ha sido recibido.</p>
          <p className="text-xs text-slate-400">Orden: {order.order_number}</p>
          <p className="text-xs text-slate-400 mt-1">Gracias por elegir Ventura Fresh Laundry</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4" data-testid="customer-payment-page">
      <div className="bg-white rounded-2xl shadow-lg max-w-md w-full overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-sky-600 to-sky-700 px-6 py-5 text-white">
          <h1 className="text-lg font-bold">Ventura Fresh Laundry</h1>
          <p className="text-sky-100 text-sm mt-0.5">Pago de orden</p>
        </div>

        {/* Order Details */}
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-500">Orden</span>
            <span className="font-mono font-semibold text-slate-800">{order.order_number}</span>
          </div>

          {order.customer_name && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-500">Cliente</span>
              <span className="text-sm font-medium text-slate-800">{order.customer_name}</span>
            </div>
          )}

          {order.service_type && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-500">Servicio</span>
              <span className="text-sm text-slate-700">{order.service_type === "pickup_delivery" ? "Pickup & Delivery" : "Wash & Fold"}</span>
            </div>
          )}

          {order.actual_lbs > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-500">Peso</span>
              <span className="text-sm text-slate-700">{order.actual_lbs} lbs</span>
            </div>
          )}

          <div className="border-t border-slate-100 pt-3">
            {order.subtotal > 0 && (
              <div className="flex items-center justify-between text-sm mb-1">
                <span className="text-slate-500">Subtotal</span>
                <span className="text-slate-700">${Number(order.subtotal).toFixed(2)}</span>
              </div>
            )}
            {order.delivery_fee > 0 && (
              <div className="flex items-center justify-between text-sm mb-1">
                <span className="text-slate-500">Envio</span>
                <span className="text-slate-700">${Number(order.delivery_fee).toFixed(2)}</span>
              </div>
            )}
            {order.processing_fee > 0 && (
              <div className="flex items-center justify-between text-sm mb-1">
                <span className="text-slate-500">Comision (3%)</span>
                <span className="text-slate-700">${Number(order.processing_fee).toFixed(2)}</span>
              </div>
            )}
            <div className="flex items-center justify-between text-lg font-bold pt-2 border-t border-slate-200 mt-2">
              <span>Total</span>
              <span className="text-slate-900">${Number(order.total_amount || 0).toFixed(2)}</span>
            </div>
          </div>

          {error && <p className="text-red-500 text-xs text-center">{error}</p>}

          {/* Payment Buttons */}
          <div className="space-y-3 pt-2">
            <Button
              className="w-full bg-sky-600 hover:bg-sky-700 text-white h-12 text-sm font-semibold"
              onClick={handleStripePayment}
              disabled={paying}
              data-testid="pay-stripe-btn"
            >
              {paying ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CreditCard className="h-4 w-4 mr-2" />}
              {paying ? "Procesando..." : "Pagar con Tarjeta"}
            </Button>

            <div className="bg-amber-50 rounded-xl border border-amber-200 p-4">
              <div className="flex items-start gap-2.5">
                <Building2 className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                <div className="text-xs text-amber-800 space-y-1">
                  <p className="font-semibold">Pago por Zelle</p>
                  <p>Envia ${Number(order.total_amount || 0).toFixed(2)} a:</p>
                  <p className="font-mono font-bold text-sm">payments@venturafreshlaundry.com</p>
                  <p className="text-amber-600">Incluye tu numero de orden: <strong>{order.order_number}</strong></p>
                </div>
              </div>
            </div>

            <div className="bg-emerald-50 rounded-xl border border-emerald-200 p-4">
              <div className="flex items-start gap-2.5">
                <DollarSign className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
                <div className="text-xs text-emerald-800">
                  <p className="font-semibold">Pago en Efectivo</p>
                  <p>Paga ${Number(order.total_amount || 0).toFixed(2)} al recoger/entregar. Ten el monto exacto listo.</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-slate-50 px-6 py-3 text-center">
          <p className="text-[10px] text-slate-400">Ventura Fresh Laundry · (805) 394-7337</p>
        </div>
      </div>
    </div>
  );
}
