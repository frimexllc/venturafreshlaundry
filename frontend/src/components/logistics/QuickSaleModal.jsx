import { useState, useEffect, useRef, useCallback } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import {
  ShoppingBag, CreditCard, CheckCircle, Loader2, X,
  ShieldCheck, Smartphone, User, DollarSign, FileText,
  Banknote, Wifi, WifiOff, AlertCircle, ArrowLeft, Nfc,
} from 'lucide-react';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL;

/* ─── Stripe Elements loader (singleton) ─────────────────────────── */
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

/* ─── Stripe Terminal loader (singleton) ─────────────────────────── */
let terminalInstance = null;
let connectedReaderCache = null;

async function getTerminal() {
  if (terminalInstance) return terminalInstance;
  const { loadStripeTerminal } = await import('@stripe/terminal-js');
  const StripeTerminal = await loadStripeTerminal();
  if (!StripeTerminal) throw new Error('No se pudo cargar Stripe Terminal SDK');
  const token = localStorage.getItem('token');
  terminalInstance = StripeTerminal.create({
    onFetchConnectionToken: async () => {
      const res = await fetch(`${API_URL}/api/stripe/terminal/connection-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Error obteniendo token de terminal');
      const data = await res.json();
      return data.secret;
    },
    onUnexpectedReaderDisconnect: () => {
      connectedReaderCache = null;
      toast.error('Lector desconectado');
    },
  });
  return terminalInstance;
}

/* ═══════════════════════════════════════════════════════════════════
   Card-on-screen checkout form (Stripe Elements)
   ═══════════════════════════════════════════════════════════════════ */
function CardCheckoutForm({ sale, onSuccess, onCancel }) {
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
      <SaleHeader sale={sale} icon={<CreditCard className="w-7 h-7" />} label="Tarjeta" />
      <div className="rounded-xl border border-gray-200 overflow-hidden p-4 bg-white">
        <PaymentElement
          onReady={() => setReady(true)}
          options={{ layout: 'tabs', wallets: { applePay: 'auto', googlePay: 'auto' } }}
        />
      </div>
      {errorMsg && <ErrorBanner message={errorMsg} />}
      <div className="flex items-center gap-2 text-[11px] text-gray-400">
        <ShieldCheck className="w-3.5 h-3.5 shrink-0 text-green-500" />
        Pago seguro — Apple Pay, Google Pay, Tarjeta
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={onCancel} data-testid="card-cancel-btn"
          className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">
          Volver
        </button>
        <button type="submit" disabled={!stripe || !ready || loading} data-testid="card-pay-btn"
          className="flex-1 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-bold transition-colors flex items-center justify-center gap-2">
          {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Procesando...</> : <><CreditCard className="w-4 h-4" /> Cobrar ${sale.amount.toFixed(2)}</>}
        </button>
      </div>
    </form>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   Terminal / Tap-to-Pay step
   ═══════════════════════════════════════════════════════════════════ */
function TerminalPaymentStep({ sale, onSuccess, onCancel }) {
  const [status, setStatus] = useState('init'); // init | discovering | connecting | collecting | processing | error
  const [errorMsg, setErrorMsg] = useState('');
  const [readers, setReaders] = useState([]);
  const termRef = useRef(null);
  const cancelledRef = useRef(false);

  const startTerminalFlow = useCallback(async () => {
    cancelledRef.current = false;
    setStatus('discovering');
    setErrorMsg('');
    try {
      const terminal = await getTerminal();
      termRef.current = terminal;

      // If already connected, skip discovery
      if (connectedReaderCache) {
        setStatus('collecting');
        await collectAndProcess(terminal, sale, onSuccess, setStatus, setErrorMsg, cancelledRef);
        return;
      }

      // Discover readers (simulated for test mode)
      const isTestMode = sale.clientSecret?.startsWith('pi_') || true;
      const discoverResult = await terminal.discoverReaders({ simulated: isTestMode });
      if (discoverResult.error) throw new Error(discoverResult.error.message);

      const found = discoverResult.discoveredReaders || [];
      setReaders(found);

      if (found.length === 0) {
        setStatus('error');
        setErrorMsg('No se encontraron lectores. Conecta un Stripe Reader y vuelve a intentar.');
        return;
      }

      // Auto-connect to first reader
      setStatus('connecting');
      const connectResult = await terminal.connectReader(found[0]);
      if (connectResult.error) throw new Error(connectResult.error.message);
      connectedReaderCache = connectResult.reader;

      if (cancelledRef.current) return;
      setStatus('collecting');
      await collectAndProcess(terminal, sale, onSuccess, setStatus, setErrorMsg, cancelledRef);
    } catch (err) {
      if (!cancelledRef.current) {
        setStatus('error');
        setErrorMsg(err.message || 'Error de terminal');
      }
    }
  }, [sale, onSuccess]);

  useEffect(() => { startTerminalFlow(); return () => { cancelledRef.current = true; }; }, [startTerminalFlow]);

  function handleCancel() {
    cancelledRef.current = true;
    if (termRef.current) {
      try { termRef.current.cancelCollectPaymentMethod(); } catch (_) {}
    }
    onCancel();
  }

  return (
    <div className="space-y-4">
      <SaleHeader sale={sale} icon={<Nfc className="w-7 h-7" />} label="Tap to Pay" color="emerald" />

      <div className="flex flex-col items-center gap-4 py-6 min-h-[180px] justify-center">
        {(status === 'init' || status === 'discovering') && (
          <><Loader2 className="w-10 h-10 text-emerald-500 animate-spin" /><p className="text-sm text-gray-500">Buscando lectores...</p></>
        )}
        {status === 'connecting' && (
          <><Wifi className="w-10 h-10 text-emerald-500 animate-pulse" /><p className="text-sm text-gray-500">Conectando al lector...</p></>
        )}
        {status === 'collecting' && (
          <div className="flex flex-col items-center gap-3 animate-pulse">
            <div className="w-24 h-24 rounded-full bg-emerald-100 flex items-center justify-center">
              <Nfc className="w-12 h-12 text-emerald-600" />
            </div>
            <p className="text-base font-semibold text-emerald-700">Acerca la tarjeta al lector</p>
            <p className="text-xs text-gray-400">Esperando contacto NFC / chip / banda...</p>
          </div>
        )}
        {status === 'processing' && (
          <><Loader2 className="w-10 h-10 text-emerald-600 animate-spin" /><p className="text-sm font-medium text-emerald-700">Procesando pago...</p></>
        )}
        {status === 'error' && (
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
              <WifiOff className="w-8 h-8 text-red-500" />
            </div>
            <p className="text-sm text-red-700 max-w-[260px]">{errorMsg}</p>
            <button onClick={startTerminalFlow} data-testid="terminal-retry-btn"
              className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 transition-colors">
              Reintentar
            </button>
          </div>
        )}
      </div>

      <button onClick={handleCancel} data-testid="terminal-cancel-btn"
        className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">
        Cancelar
      </button>
    </div>
  );
}

async function collectAndProcess(terminal, sale, onSuccess, setStatus, setErrorMsg, cancelledRef) {
  const collectResult = await terminal.collectPaymentMethod(sale.clientSecret);
  if (cancelledRef.current) return;
  if (collectResult.error) throw new Error(collectResult.error.message);

  setStatus('processing');
  const processResult = await terminal.processPayment(collectResult.paymentIntent);
  if (cancelledRef.current) return;
  if (processResult.error) throw new Error(processResult.error.message);

  // Confirm on backend
  const token = localStorage.getItem('token');
  await fetch(`${API_URL}/api/stripe/confirm-payment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ paymentIntentId: sale.paymentIntentId, orderId: sale.orderId }),
  }).catch(() => {});
  onSuccess();
}

/* ═══════════════════════════════════════════════════════════════════
   Cash confirmation step
   ═══════════════════════════════════════════════════════════════════ */
function CashConfirmStep({ sale, onSuccess, onCancel }) {
  const [loading, setLoading] = useState(false);

  async function handleConfirm() {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/api/stripe/quick-sale/cash`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          customerName: sale.customerName,
          amount: sale.amount,
          description: sale.description || 'Venta en tienda',
          customerPhone: sale.phone || '',
        }),
      });
      const data = await res.json();
      if (data.error || data.detail) throw new Error(data.error || data.detail);
      onSuccess(data);
    } catch (err) {
      toast.error(err.message || 'Error registrando venta');
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <SaleHeader sale={sale} icon={<Banknote className="w-7 h-7" />} label="Efectivo" color="amber" />

      <div className="flex flex-col items-center gap-3 py-6">
        <div className="w-20 h-20 rounded-full bg-amber-100 flex items-center justify-center">
          <Banknote className="w-10 h-10 text-amber-600" />
        </div>
        <p className="text-sm text-gray-600 text-center">
          Confirma que recibiste <span className="font-bold text-gray-900">${sale.amount.toFixed(2)}</span> en efectivo
        </p>
      </div>

      <div className="flex gap-2">
        <button onClick={onCancel} data-testid="cash-cancel-btn"
          className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">
          Volver
        </button>
        <button onClick={handleConfirm} disabled={loading} data-testid="cash-confirm-btn"
          className="flex-1 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-sm font-bold transition-colors flex items-center justify-center gap-2">
          {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Registrando...</> : <><Banknote className="w-4 h-4" /> Confirmar Efectivo</>}
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   Shared UI helpers
   ═══════════════════════════════════════════════════════════════════ */
function SaleHeader({ sale, icon, label, color = 'blue' }) {
  const colors = {
    blue: 'bg-blue-50 border-blue-100 text-blue-800 text-blue-600 text-blue-400',
    emerald: 'bg-emerald-50 border-emerald-100 text-emerald-800 text-emerald-600 text-emerald-400',
    amber: 'bg-amber-50 border-amber-100 text-amber-800 text-amber-600 text-amber-400',
  };
  const c = color === 'emerald' ? ['bg-emerald-50', 'border-emerald-100', 'text-emerald-600', 'text-emerald-800', 'text-emerald-400']
          : color === 'amber' ? ['bg-amber-50', 'border-amber-100', 'text-amber-600', 'text-amber-800', 'text-amber-400']
          : ['bg-blue-50', 'border-blue-100', 'text-blue-600', 'text-blue-800', 'text-blue-400'];
  return (
    <div className={`flex items-center justify-between ${c[0]} border ${c[1]} rounded-xl px-4 py-3`}>
      <div>
        <div className={`text-xs ${c[2]} font-semibold uppercase tracking-wide mb-0.5`}>Total a cobrar</div>
        <div className={`text-3xl font-black ${c[3]}`}>${sale.amount.toFixed(2)}</div>
        <div className={`text-xs ${c[4]} mt-0.5`}>{sale.orderNumber || ''} — {sale.customerName}</div>
      </div>
      <div className={`flex flex-col items-center gap-1 ${c[4]}`}>
        {icon}
        <span className="text-[9px] font-bold uppercase">{label}</span>
      </div>
    </div>
  );
}

function ErrorBanner({ message }) {
  return (
    <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 text-sm text-red-700">
      <X className="w-4 h-4 shrink-0 mt-0.5" />{message}
    </div>
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
        {sale.method && <p className="text-xs text-gray-400 mt-0.5 capitalize">Metodo: {sale.method}</p>}
      </div>
      <button onClick={onClose} data-testid="pos-success-close"
        className="mt-2 px-8 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold transition-colors">
        Nueva Venta
      </button>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   MAIN MODAL
   ═══════════════════════════════════════════════════════════════════ */
export function QuickSaleModal({ open, onClose, initialProduct }) {
  const [step, setStep] = useState('form'); // form | card | terminal | cash | success
  const [customerName, setCustomerName] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [clientSecret, setClientSecret] = useState(null);
  const [stripeInstance, setStripeInstance] = useState(null);
  const [saleData, setSaleData] = useState(null);
  const [creating, setCreating] = useState('');
  const [loadError, setLoadError] = useState('');

  const quickAmounts = [15, 25, 35, 50, 75, 100];

  useEffect(() => {
    if (!open) {
      setStep('form'); setCustomerName(''); setAmount('');
      setDescription(''); setCustomerPhone('');
      setClientSecret(null); setSaleData(null); setLoadError(''); setCreating('');
    } else if (initialProduct) {
      setAmount(String(initialProduct.price || ''));
      setDescription(initialProduct.name || '');
    }
  }, [open, initialProduct]);

  function validateForm() {
    if (!customerName.trim()) { toast.error('Nombre del cliente requerido'); return false; }
    const n = parseFloat(amount);
    if (isNaN(n) || n < 0.50) { toast.error('Monto minimo $0.50'); return false; }
    return true;
  }

  /* ── Pay with Card on Screen ───────────────────────────────────── */
  async function handleCard() {
    if (!validateForm()) return;
    setCreating('card'); setLoadError('');
    try {
      const token = localStorage.getItem('token');
      const numAmount = parseFloat(amount);
      const [stripeObj, saleRes] = await Promise.all([
        getStripe(),
        fetch(`${API_URL}/api/stripe/quick-sale`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ customerName: customerName.trim(), amount: numAmount, description: description.trim() || 'Venta en tienda', customerPhone: customerPhone.trim() }),
        }).then(r => r.json()),
      ]);
      if (saleRes.error || saleRes.detail) throw new Error(saleRes.error || saleRes.detail);
      setStripeInstance(stripeObj);
      setClientSecret(saleRes.clientSecret);
      setSaleData({ orderId: saleRes.orderId, orderNumber: saleRes.orderNumber, paymentIntentId: saleRes.paymentIntentId, customerName: customerName.trim(), amount: numAmount, method: 'tarjeta' });
      setStep('card');
    } catch (err) { setLoadError(err.message ?? 'Error creando la venta'); }
    finally { setCreating(''); }
  }

  /* ── Pay with Tap / Terminal ───────────────────────────────────── */
  async function handleTerminal() {
    if (!validateForm()) return;
    setCreating('terminal'); setLoadError('');
    try {
      const token = localStorage.getItem('token');
      const numAmount = parseFloat(amount);
      const res = await fetch(`${API_URL}/api/stripe/quick-sale/terminal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ customerName: customerName.trim(), amount: numAmount, description: description.trim() || 'Venta en tienda', customerPhone: customerPhone.trim() }),
      });
      const data = await res.json();
      if (data.error || data.detail) throw new Error(data.error || data.detail);
      setSaleData({ orderId: data.orderId, orderNumber: data.orderNumber, paymentIntentId: data.paymentIntentId, clientSecret: data.clientSecret, customerName: customerName.trim(), amount: numAmount, method: 'tap' });
      setStep('terminal');
    } catch (err) { setLoadError(err.message ?? 'Error preparando terminal'); }
    finally { setCreating(''); }
  }

  /* ── Pay with Cash ─────────────────────────────────────────────── */
  function handleCash() {
    if (!validateForm()) return;
    const numAmount = parseFloat(amount);
    setSaleData({ customerName: customerName.trim(), amount: numAmount, description: description.trim() || 'Venta en tienda', phone: customerPhone.trim(), method: 'efectivo' });
    setStep('cash');
  }

  function handleSuccess(extraData) {
    const merged = { ...saleData, ...extraData };
    setSaleData(merged);
    setStep('success');
    toast.success(`Venta completada — $${merged.amount?.toFixed(2) ?? ''} — ${merged.customerName}`);
  }

  const titleMap = { form: 'Venta Rapida POS', card: 'Tarjeta en Pantalla', terminal: 'Tap to Pay', cash: 'Pago en Efectivo', success: 'Venta Completada' };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md" data-testid="quick-sale-modal">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShoppingBag className="w-5 h-5 text-emerald-600" />
            {titleMap[step]}
          </DialogTitle>
        </DialogHeader>

        {/* ── FORM STEP ─────────────────────────────────────────── */}
        {step === 'form' && (
          <div className="space-y-4">
            <div>
              <Label htmlFor="pos-name" className="text-sm font-medium flex items-center gap-1.5 mb-1.5">
                <User className="w-3.5 h-3.5 text-gray-400" /> Cliente
              </Label>
              <Input id="pos-name" data-testid="pos-customer-name" placeholder="Nombre del cliente"
                value={customerName} onChange={(e) => setCustomerName(e.target.value)} autoFocus />
            </div>

            <div>
              <Label htmlFor="pos-amount" className="text-sm font-medium flex items-center gap-1.5 mb-1.5">
                <DollarSign className="w-3.5 h-3.5 text-gray-400" /> Monto (USD)
              </Label>
              <Input id="pos-amount" data-testid="pos-amount" type="number" step="0.01" min="0.50"
                placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} className="text-2xl font-bold h-14" />
              <div className="flex flex-wrap gap-1.5 mt-2">
                {quickAmounts.map((qa) => (
                  <button key={qa} type="button" onClick={() => setAmount(String(qa))} data-testid={`pos-quick-${qa}`}
                    className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${
                      amount === String(qa) ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-emerald-300 hover:bg-emerald-50'
                    }`}>
                    ${qa}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Label htmlFor="pos-desc" className="text-sm font-medium flex items-center gap-1.5 mb-1.5">
                <FileText className="w-3.5 h-3.5 text-gray-400" /> Concepto
              </Label>
              <Textarea id="pos-desc" data-testid="pos-description" placeholder="Lavado express, planchado, etc."
                value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
            </div>

            <div>
              <Label htmlFor="pos-phone" className="text-sm font-medium flex items-center gap-1.5 mb-1.5">
                <Smartphone className="w-3.5 h-3.5 text-gray-400" /> Telefono (opcional)
              </Label>
              <Input id="pos-phone" data-testid="pos-phone" placeholder="(805) 555-0000"
                value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} />
            </div>

            {loadError && <ErrorBanner message={loadError} />}

            {/* ── 3 Payment Method buttons ──────────────────────── */}
            <div className="space-y-2 pt-1">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Metodo de pago</p>

              <button onClick={handleTerminal} disabled={!!creating} data-testid="pos-pay-tap"
                className="w-full flex items-center gap-3 py-3.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-sm transition-colors shadow-md shadow-emerald-200">
                {creating === 'terminal' ? <Loader2 className="w-5 h-5 animate-spin" /> : <Nfc className="w-5 h-5" />}
                <span className="flex-1 text-left">Tap to Pay</span>
                <span className="text-xs opacity-70">Lector NFC</span>
              </button>

              <button onClick={handleCard} disabled={!!creating} data-testid="pos-pay-card"
                className="w-full flex items-center gap-3 py-3.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold text-sm transition-colors shadow-md shadow-blue-200">
                {creating === 'card' ? <Loader2 className="w-5 h-5 animate-spin" /> : <CreditCard className="w-5 h-5" />}
                <span className="flex-1 text-left">Tarjeta en Pantalla</span>
                <span className="text-xs opacity-70">Apple / Google Pay</span>
              </button>

              <button onClick={handleCash} disabled={!!creating} data-testid="pos-pay-cash"
                className="w-full flex items-center gap-3 py-3 px-4 rounded-xl bg-white border-2 border-gray-200 hover:border-amber-400 hover:bg-amber-50 disabled:opacity-50 text-gray-800 font-bold text-sm transition-colors">
                <Banknote className="w-5 h-5 text-amber-500" />
                <span className="flex-1 text-left">Efectivo</span>
                <span className="text-xs text-gray-400">Sin procesador</span>
              </button>
            </div>
          </div>
        )}

        {/* ── CARD PAYMENT STEP ─────────────────────────────────── */}
        {step === 'card' && stripeInstance && clientSecret && saleData && (
          <Elements stripe={stripeInstance} options={{
            clientSecret,
            appearance: { theme: 'stripe', variables: { colorPrimary: '#2563eb', borderRadius: '10px', fontFamily: 'system-ui, sans-serif' } },
          }}>
            <CardCheckoutForm sale={saleData} onSuccess={() => handleSuccess()} onCancel={() => setStep('form')} />
          </Elements>
        )}

        {/* ── TERMINAL STEP ─────────────────────────────────────── */}
        {step === 'terminal' && saleData && (
          <TerminalPaymentStep sale={saleData} onSuccess={() => handleSuccess()} onCancel={() => setStep('form')} />
        )}

        {/* ── CASH STEP ─────────────────────────────────────────── */}
        {step === 'cash' && saleData && (
          <CashConfirmStep sale={saleData} onSuccess={(data) => handleSuccess(data)} onCancel={() => setStep('form')} />
        )}

        {/* ── SUCCESS STEP ──────────────────────────────────────── */}
        {step === 'success' && saleData && (
          <SuccessScreen sale={saleData} onClose={onClose} />
        )}
      </DialogContent>
    </Dialog>
  );
}
