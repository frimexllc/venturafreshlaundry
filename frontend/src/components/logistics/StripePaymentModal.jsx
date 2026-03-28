import { useState, useEffect } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { CreditCard, CheckCircle, Loader2, Smartphone, X, ShieldCheck } from 'lucide-react';

const API_URL = process.env.REACT_APP_BACKEND_URL;

let stripePromise = null;

async function getStripe() {
  if (!stripePromise) {
    const res = await fetch(`${API_URL}/api/stripe/publishable-key`);
    if (!res.ok) throw new Error('Failed to load Stripe key');
    const { publishableKey } = await res.json();
    stripePromise = loadStripe(publishableKey);
  }
  return stripePromise;
}

function CheckoutForm({ order, onSuccess, onCancel }) {
  const stripe = useStripe();
  const elements = useElements();
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [ready, setReady] = useState(false);

  async function handlePay(e) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setLoading(true);
    setErrorMsg('');
    const { error } = await stripe.confirmPayment({ elements, redirect: 'if_required' });
    if (error) { setErrorMsg(error.message ?? 'Error al procesar el pago.'); setLoading(false); }
    else {
      // Confirm payment in backend
      const token = localStorage.getItem('token');
      fetch(`${API_URL}/api/stripe/confirm-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ orderId: order.id }),
      }).catch(() => {});
      onSuccess();
    }
  }

  return (
    <form onSubmit={handlePay} className="space-y-5">
      <div className="flex items-center justify-between bg-blue-50 border border-blue-100 rounded-xl px-4 py-3">
        <div>
          <div className="text-xs text-blue-600 font-semibold uppercase tracking-wide mb-0.5">Total a cobrar</div>
          <div className="text-2xl font-bold text-blue-800">${order.pricing.total.toFixed(2)}</div>
          <div className="text-xs text-blue-500">{order.orderNumber} - {order.customer.name}</div>
        </div>
        <div className="flex flex-col items-center gap-1 text-blue-400">
          <Smartphone className="w-7 h-7" />
          <span className="text-[9px] font-bold uppercase">Tap / Chip / Card</span>
        </div>
      </div>
      <div className="rounded-xl border border-gray-200 overflow-hidden p-4 bg-white">
        <PaymentElement onReady={() => setReady(true)} options={{ layout: 'tabs', wallets: { applePay: 'auto', googlePay: 'auto' } }} />
      </div>
      {errorMsg && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 text-sm text-red-700">
          <X className="w-4 h-4 shrink-0 mt-0.5" />{errorMsg}
        </div>
      )}
      <div className="flex items-center gap-2 text-[11px] text-gray-400">
        <ShieldCheck className="w-3.5 h-3.5 shrink-0 text-green-500" />
        Pago procesado de forma segura por Stripe.
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={onCancel} className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">Cancelar</button>
        <button type="submit" disabled={!stripe || !ready || loading} data-testid="stripe-pay-btn" className="flex-1 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-bold transition-colors flex items-center justify-center gap-2">
          {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Procesando...</> : <><CreditCard className="w-4 h-4" /> Cobrar ${order.pricing.total.toFixed(2)}</>}
        </button>
      </div>
    </form>
  );
}

function SuccessScreen({ order, onClose }) {
  return (
    <div className="flex flex-col items-center text-center gap-4 py-6">
      <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
        <CheckCircle className="w-9 h-9 text-green-600" />
      </div>
      <div>
        <h3 className="text-xl font-bold text-gray-900 mb-1">Pago exitoso!</h3>
        <p className="text-gray-500 text-sm">Se cobro <span className="font-bold text-gray-800">${order.pricing.total.toFixed(2)}</span> a {order.customer.name}</p>
        <p className="text-xs text-gray-400 mt-1">{order.orderNumber}</p>
      </div>
      <button onClick={onClose} data-testid="stripe-success-close" className="mt-2 px-6 py-2.5 rounded-xl bg-green-600 hover:bg-green-700 text-white text-sm font-bold transition-colors">Listo</button>
    </div>
  );
}

export function StripePaymentModal({ order, open, onClose, onPaymentSuccess }) {
  const [clientSecret, setClientSecret] = useState(null);
  const [stripeInstance, setStripeInstance] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [paid, setPaid] = useState(false);
  const [initializing, setInitializing] = useState(false);

  useEffect(() => {
    if (!open) { setClientSecret(null); setPaid(false); setLoadError(''); return; }
    setInitializing(true);
    Promise.all([
      getStripe(),
      fetch(`${API_URL}/api/stripe/create-payment-intent`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: order.pricing.total, currency: 'usd', orderId: order.id, orderNumber: order.orderNumber, customerName: order.customer.name }),
      }).then((r) => r.json()),
    ])
      .then(([stripe, data]) => { if (data.error) throw new Error(data.error); setStripeInstance(stripe); setClientSecret(data.clientSecret); })
      .catch((err) => setLoadError(err.message ?? 'Error conectando con Stripe'))
      .finally(() => setInitializing(false));
  }, [open, order.pricing.total, order.id, order.orderNumber, order.customer.name]);

  function handleSuccess() { setPaid(true); onPaymentSuccess?.(); }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md" data-testid="stripe-payment-modal">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-blue-600" /> Cobro con Stripe
          </DialogTitle>
        </DialogHeader>
        {paid ? (
          <SuccessScreen order={order} onClose={onClose} />
        ) : initializing ? (
          <div className="flex flex-col items-center gap-3 py-10 text-gray-400">
            <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
            <span className="text-sm">Preparando terminal de pago...</span>
          </div>
        ) : loadError ? (
          <div className="space-y-4 py-4">
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm"><strong>Error al inicializar Stripe:</strong><br />{loadError}</div>
            <button onClick={onClose} className="w-full py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">Cerrar</button>
          </div>
        ) : stripeInstance && clientSecret ? (
          <Elements stripe={stripeInstance} options={{ clientSecret, appearance: { theme: 'stripe', variables: { colorPrimary: '#2563eb', borderRadius: '10px', fontFamily: 'system-ui, sans-serif' } } }}>
            <CheckoutForm order={order} onSuccess={handleSuccess} onCancel={onClose} />
          </Elements>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
