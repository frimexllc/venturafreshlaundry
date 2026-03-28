import { useState, useEffect } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import {
  ShoppingBag, CreditCard, CheckCircle, Loader2, X,
  ShieldCheck, Smartphone, User, DollarSign, FileText,
} from 'lucide-react';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL;

let stripePromise = null;
async function getStripe() {
  if (!stripePromise) {
    const res = await fetch(`${API_URL}/api/stripe/publishable-key`);
    if (!res.ok) throw new Error('Stripe no configurado');
    const { publishableKey } = await res.json();
    stripePromise = loadStripe(publishableKey);
  }
  return stripePromise;
}

function POSCheckoutForm({ sale, clientSecret, onSuccess, onCancel }) {
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
    if (error) {
      setErrorMsg(error.message ?? 'Error al procesar el pago.');
      setLoading(false);
    } else {
      // Confirm payment in backend
      const token = localStorage.getItem('token');
      fetch(`${API_URL}/api/stripe/confirm-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ paymentIntentId: sale.paymentIntentId, orderId: sale.orderId }),
      }).catch(() => {});
      onSuccess();
    }
  }

  return (
    <form onSubmit={handlePay} className="space-y-4">
      <div className="flex items-center justify-between bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3">
        <div>
          <div className="text-xs text-emerald-600 font-semibold uppercase tracking-wide mb-0.5">Total a cobrar</div>
          <div className="text-3xl font-black text-emerald-800">${sale.amount.toFixed(2)}</div>
          <div className="text-xs text-emerald-500 mt-0.5">{sale.orderNumber} - {sale.customerName}</div>
        </div>
        <div className="flex flex-col items-center gap-1 text-emerald-400">
          <Smartphone className="w-8 h-8" />
          <span className="text-[9px] font-bold uppercase">Tap / Card</span>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 overflow-hidden p-4 bg-white">
        <PaymentElement
          onReady={() => setReady(true)}
          options={{
            layout: 'tabs',
            wallets: { applePay: 'auto', googlePay: 'auto' },
          }}
        />
      </div>

      {errorMsg && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 text-sm text-red-700">
          <X className="w-4 h-4 shrink-0 mt-0.5" />{errorMsg}
        </div>
      )}

      <div className="flex items-center gap-2 text-[11px] text-gray-400">
        <ShieldCheck className="w-3.5 h-3.5 shrink-0 text-green-500" />
        Pago seguro via Stripe — Apple Pay, Google Pay, Tarjeta
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={!stripe || !ready || loading}
          data-testid="pos-pay-btn"
          className="flex-1 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-bold transition-colors flex items-center justify-center gap-2"
        >
          {loading ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Procesando...</>
          ) : (
            <><CreditCard className="w-4 h-4" /> Cobrar ${sale.amount.toFixed(2)}</>
          )}
        </button>
      </div>
    </form>
  );
}

function SuccessScreen({ sale, onClose }) {
  return (
    <div className="flex flex-col items-center text-center gap-4 py-6">
      <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center">
        <CheckCircle className="w-11 h-11 text-emerald-600" />
      </div>
      <div>
        <h3 className="text-xl font-bold text-gray-900 mb-1">Pago exitoso!</h3>
        <p className="text-gray-500 text-sm">
          Se cobro <span className="font-bold text-gray-800">${sale.amount.toFixed(2)}</span> a {sale.customerName}
        </p>
        <p className="text-xs text-gray-400 mt-1">{sale.orderNumber}</p>
      </div>
      <button
        onClick={onClose}
        data-testid="pos-success-close"
        className="mt-2 px-8 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold transition-colors"
      >
        Nueva Venta
      </button>
    </div>
  );
}

export function QuickSaleModal({ open, onClose }) {
  const [step, setStep] = useState('form'); // form | payment | success
  const [customerName, setCustomerName] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [clientSecret, setClientSecret] = useState(null);
  const [stripeInstance, setStripeInstance] = useState(null);
  const [saleData, setSaleData] = useState(null);
  const [creating, setCreating] = useState(false);
  const [loadError, setLoadError] = useState('');

  // Quick amounts
  const quickAmounts = [15, 25, 35, 50, 75, 100];

  useEffect(() => {
    if (!open) {
      setStep('form');
      setCustomerName('');
      setAmount('');
      setDescription('');
      setCustomerPhone('');
      setClientSecret(null);
      setSaleData(null);
      setLoadError('');
    }
  }, [open]);

  async function handleCreateSale() {
    const numAmount = parseFloat(amount);
    if (!customerName.trim()) { toast.error('Nombre del cliente requerido'); return; }
    if (isNaN(numAmount) || numAmount < 0.50) { toast.error('Monto minimo $0.50'); return; }

    setCreating(true);
    setLoadError('');
    try {
      const token = localStorage.getItem('token');
      const [stripeObj, saleRes] = await Promise.all([
        getStripe(),
        fetch(`${API_URL}/api/stripe/quick-sale`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            customerName: customerName.trim(),
            amount: numAmount,
            description: description.trim() || 'Venta en tienda',
            customerPhone: customerPhone.trim(),
          }),
        }).then(r => r.json()),
      ]);

      if (saleRes.error || saleRes.detail) throw new Error(saleRes.error || saleRes.detail);

      setStripeInstance(stripeObj);
      setClientSecret(saleRes.clientSecret);
      setSaleData({
        orderId: saleRes.orderId,
        orderNumber: saleRes.orderNumber,
        paymentIntentId: saleRes.paymentIntentId,
        customerName: customerName.trim(),
        amount: numAmount,
      });
      setStep('payment');
    } catch (err) {
      setLoadError(err.message ?? 'Error creando la venta');
    } finally {
      setCreating(false);
    }
  }

  function handleSuccess() {
    setStep('success');
    toast.success(`Venta completada - $${saleData.amount.toFixed(2)} - ${saleData.customerName}`);
  }

  function handleClose() {
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="max-w-md" data-testid="quick-sale-modal">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShoppingBag className="w-5 h-5 text-emerald-600" />
            {step === 'success' ? 'Venta Completada' : step === 'payment' ? 'Cobro con Stripe' : 'Venta Rapida POS'}
          </DialogTitle>
        </DialogHeader>

        {step === 'form' && (
          <div className="space-y-4">
            <div>
              <Label htmlFor="pos-name" className="text-sm font-medium flex items-center gap-1.5 mb-1.5">
                <User className="w-3.5 h-3.5 text-gray-400" /> Cliente
              </Label>
              <Input
                id="pos-name"
                data-testid="pos-customer-name"
                placeholder="Nombre del cliente"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                autoFocus
              />
            </div>

            <div>
              <Label htmlFor="pos-amount" className="text-sm font-medium flex items-center gap-1.5 mb-1.5">
                <DollarSign className="w-3.5 h-3.5 text-gray-400" /> Monto (USD)
              </Label>
              <Input
                id="pos-amount"
                data-testid="pos-amount"
                type="number"
                step="0.01"
                min="0.50"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="text-2xl font-bold h-14"
              />
              <div className="flex flex-wrap gap-1.5 mt-2">
                {quickAmounts.map((qa) => (
                  <button
                    key={qa}
                    type="button"
                    onClick={() => setAmount(String(qa))}
                    data-testid={`pos-quick-${qa}`}
                    className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${
                      amount === String(qa)
                        ? 'bg-emerald-600 text-white border-emerald-600'
                        : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-emerald-300 hover:bg-emerald-50'
                    }`}
                  >
                    ${qa}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Label htmlFor="pos-desc" className="text-sm font-medium flex items-center gap-1.5 mb-1.5">
                <FileText className="w-3.5 h-3.5 text-gray-400" /> Concepto
              </Label>
              <Textarea
                id="pos-desc"
                data-testid="pos-description"
                placeholder="Lavado express, planchado, etc."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
              />
            </div>

            <div>
              <Label htmlFor="pos-phone" className="text-sm font-medium flex items-center gap-1.5 mb-1.5">
                <Smartphone className="w-3.5 h-3.5 text-gray-400" /> Telefono (opcional)
              </Label>
              <Input
                id="pos-phone"
                data-testid="pos-phone"
                placeholder="(805) 555-0000"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
              />
            </div>

            {loadError && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-red-700 text-sm">
                {loadError}
              </div>
            )}

            <button
              onClick={handleCreateSale}
              disabled={creating || !customerName.trim() || !amount}
              data-testid="pos-proceed-to-pay"
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-sm transition-colors shadow-md shadow-emerald-200"
            >
              {creating ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Preparando cobro...</>
              ) : (
                <><CreditCard className="w-4 h-4" /> Cobrar {amount ? `$${parseFloat(amount).toFixed(2)}` : ''}</>
              )}
            </button>
          </div>
        )}

        {step === 'payment' && stripeInstance && clientSecret && saleData && (
          <Elements
            stripe={stripeInstance}
            options={{
              clientSecret,
              appearance: {
                theme: 'stripe',
                variables: {
                  colorPrimary: '#059669',
                  borderRadius: '10px',
                  fontFamily: 'system-ui, sans-serif',
                },
              },
            }}
          >
            <POSCheckoutForm
              sale={saleData}
              clientSecret={clientSecret}
              onSuccess={handleSuccess}
              onCancel={() => setStep('form')}
            />
          </Elements>
        )}

        {step === 'success' && saleData && (
          <SuccessScreen sale={saleData} onClose={handleClose} />
        )}
      </DialogContent>
    </Dialog>
  );
}
