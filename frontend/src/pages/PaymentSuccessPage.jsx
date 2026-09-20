import { CheckCircle, ArrowLeft } from 'lucide-react';
import { useSearchParams, Link } from 'react-router-dom';
import { useEffect, useState } from 'react';

const API_URL = process.env.REACT_APP_BACKEND_URL;

export default function PaymentSuccessPage() {
  const [params] = useSearchParams();
  const sessionId = params.get('session_id');
  const orderId = params.get('order_id');
  // null = still checking (or nothing to check), true = confirmed paid, false = not paid yet / lookup failed
  const [verified, setVerified] = useState(null);
  const [checking, setChecking] = useState(Boolean(sessionId && orderId));

  useEffect(() => {
    if (sessionId && orderId) {
      fetch(`${API_URL}/api/orders/${orderId}/stripe-status?session_id=${sessionId}`)
        .then(r => r.ok ? r.json() : Promise.reject())
        .then(d => setVerified(d.payment_status === 'paid'))
        .catch(() => setVerified(false))
        .finally(() => setChecking(false));
    }
  }, [sessionId, orderId]);

  const pending = !checking && verified === false;

  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-50 to-white flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg border border-gray-100 max-w-md w-full p-8 text-center">
        <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 ${pending ? "bg-amber-100" : "bg-emerald-100"}`}>
          <CheckCircle className={`w-11 h-11 ${pending ? "text-amber-600" : "text-emerald-600"}`} />
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          {checking ? "Verificando tu pago…" : pending ? "Confirmando tu pago…" : "Pago Recibido!"}
        </h1>
        <p className="text-gray-500 text-sm mb-6">
          {checking
            ? "Un momento mientras confirmamos tu pago con Stripe."
            : pending
            ? "Estamos confirmando tu pago con Stripe. Si ya completaste el pago, tu orden se actualizará en unos minutos."
            : "Gracias por tu pago. Tu orden esta siendo procesada por nuestro equipo."}
        </p>
        {orderId && (
          <p className="text-xs text-gray-400 mb-4">Orden: {orderId}</p>
        )}
        <Link to="/" className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-sm font-semibold transition-colors">
          <ArrowLeft className="w-4 h-4" /> Volver al inicio
        </Link>
        <p className="text-[11px] text-gray-300 mt-6">Ventura Fresh Laundry</p>
      </div>
    </div>
  );
}
