import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import {
  User, Mail, Lock, ArrowRight, Eye, EyeOff, Phone,
  X, CheckCircle, CreditCard, ShieldCheck, AlertCircle,
  RefreshCw, Zap, Star,
} from "lucide-react";
import PublicNav from "../components/PublicNav";
import { useLocale } from "../context/LocaleContext";
import AddressAutocomplete from "../components/AddressAutocomplete";

import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  CardElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";

// ─── Axios instance ────────────────────────────────────────────────────────────
const api = axios.create({
  baseURL: process.env.REACT_APP_BACKEND_URL || "https://ventura-deploy-test.preview.emergentagent.com",
  headers: { "Content-Type": "application/json" },
  timeout: 30000,
});
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("customer_token");
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  },
  (error) => Promise.reject(error)
);

let stripePromise = null;
const getStripe = (key) => {
  if (!stripePromise && key) stripePromise = loadStripe(key);
  return stripePromise;
};

// ─── WashingMachine SVG ────────────────────────────────────────────────────────
const WashingMachineSVG = () => {
  const holeAngles = [0, 45, 90, 135, 180, 225, 270, 315];
  const bubbles = [
    { cx: 140, cy: 310, r: 4, dur: "2.8s", delay: "0s" },
    { cx: 165, cy: 320, r: 3, dur: "3.2s", delay: "0.7s" },
    { cx: 195, cy: 308, r: 5, dur: "2.5s", delay: "1.4s" },
    { cx: 155, cy: 300, r: 2.5, dur: "3.6s", delay: "0.3s" },
    { cx: 185, cy: 318, r: 3.5, dur: "2.9s", delay: "1.1s" },
  ];
  const dots = [60, 80, 100, 120, 140, 160];
  return (
    <svg viewBox="0 0 340 420" width="100%" style={{ maxWidth: 300, filter: "drop-shadow(0 24px 48px rgba(14,165,233,0.45))" }}>
      <defs>
        <radialGradient id="drumGrad" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#1e4d7b" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#0a1e35" stopOpacity="1" />
        </radialGradient>
        <radialGradient id="glassGrad" cx="40%" cy="35%" r="60%">
          <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#0ea5e9" stopOpacity="0.04" />
        </radialGradient>
        <radialGradient id="waterGrad" cx="50%" cy="100%" r="80%">
          <stop offset="0%" stopColor="#0ea5e9" stopOpacity="0.65" />
          <stop offset="100%" stopColor="#0369a1" stopOpacity="0.25" />
        </radialGradient>
        <clipPath id="drumClip"><circle cx="170" cy="230" r="100" /></clipPath>
        <linearGradient id="bodyGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#1a3558" />
          <stop offset="50%" stopColor="#243f6a" />
          <stop offset="100%" stopColor="#1a3558" />
        </linearGradient>
        <filter id="glow">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      <rect x="30" y="60" width="280" height="300" rx="20" fill="url(#bodyGrad)" stroke="#2a4568" strokeWidth="1.5" />
      <rect x="30" y="310" width="280" height="50" rx="0" fill="#111e2e" />
      <rect x="30" y="340" width="280" height="20" rx="20" fill="#111e2e" />
      <rect x="30" y="30" width="280" height="35" rx="12" fill="#0d1a28" stroke="#1e3a55" strokeWidth="1" />
      <circle cx="290" cy="47" r="9" fill="#0c2d45" stroke="#38bdf8" strokeWidth="1.2" filter="url(#glow)" />
      <circle cx="290" cy="47" r="4" fill="#38bdf8" opacity="0.9" />
      {dots.map((x, i) => (
        <circle key={i} cx={x} cy="47" r={i === 2 ? 5 : 3.5} fill={i === 2 ? "#38bdf8" : "#1e3a55"} stroke={i === 2 ? "#7dd3fc" : "none"} strokeWidth="0.8" />
      ))}
      <circle cx="170" cy="230" r="108" fill="#0d1a28" stroke="#1e3a55" strokeWidth="1.5" />
      <circle cx="170" cy="230" r="100" fill="url(#drumGrad)" />
      <g clipPath="url(#drumClip)">
        <rect x="70" y="285" width="200" height="50" fill="url(#waterGrad)">
          <animate attributeName="y" values="295;288;295" dur="3s" repeatCount="indefinite" calcMode="spline" keySplines="0.4 0 0.6 1;0.4 0 0.6 1" />
        </rect>
        {bubbles.map((b, i) => (
          <circle key={i} cx={b.cx} r={b.r} fill="#7dd3fc" opacity="0.5">
            <animate attributeName="cy" values={`${b.cy};${b.cy - 40};${b.cy}`} dur={b.dur} begin={b.delay} repeatCount="indefinite" />
          </circle>
        ))}
      </g>
      <g clipPath="url(#drumClip)">
        <g style={{ transformOrigin: "170px 230px", animation: "spinDrum 4s linear infinite" }}>
          {holeAngles.map((deg, i) => {
            const rad = (deg * Math.PI) / 180;
            return <circle key={i} cx={170 + 70 * Math.sin(rad)} cy={230 - 70 * Math.cos(rad)} r="8" fill="#091525" stroke="#1e3a55" strokeWidth="1" opacity="0.8" />;
          })}
        </g>
        <g transform="translate(170,230)" style={{ transformOrigin: "0px 0px", animation: "spinDrum 4s linear infinite" }}>
          <circle r="28" fill="#071420" stroke="#38bdf8" strokeWidth="1.5" opacity="0.95" filter="url(#glow)" />
          <text textAnchor="middle" dy=".35em" fill="#38bdf8" fontSize="13" fontWeight="800" fontFamily="'Manrope', sans-serif" letterSpacing="2">VFL</text>
        </g>
      </g>
      <circle cx="170" cy="230" r="100" fill="url(#glassGrad)" opacity="0.7" />
      <circle cx="170" cy="230" r="100" fill="none" stroke="#243d5c" strokeWidth="2.5" />
    </svg>
  );
};

// ─── Tilt card ─────────────────────────────────────────────────────────────────
const Tilt = ({ children }) => {
  const ref = useRef(null);
  const [s, setS] = useState({});
  const onMove = useCallback((e) => {
    if (!ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width - 0.5) * 6;
    const y = ((e.clientY - r.top) / r.height - 0.5) * -6;
    setS({ transform: `perspective(1000px) rotateX(${y}deg) rotateY(${x}deg) translateZ(4px)`, transition: "transform 60ms linear" });
  }, []);
  const onLeave = useCallback(() => setS({
    transform: "perspective(1000px) rotateX(0) rotateY(0) translateZ(0)",
    transition: "transform 400ms ease",
  }), []);
  return <div ref={ref} style={s} onMouseMove={onMove} onMouseLeave={onLeave}>{children}</div>;
};

// ─── Custom cursor ─────────────────────────────────────────────────────────────
function useCursor() {
  const ring = useRef(null);
  const dot = useRef(null);
  const p = useRef({ x: -200, y: -200 });
  const l = useRef({ x: -200, y: -200 });
  const raf = useRef(null);
  useEffect(() => {
    const fn = (e) => { p.current = { x: e.clientX, y: e.clientY }; };
    window.addEventListener("mousemove", fn, { passive: true });
    const loop = () => {
      l.current.x += (p.current.x - l.current.x) * 0.14;
      l.current.y += (p.current.y - l.current.y) * 0.14;
      if (ring.current) ring.current.style.transform = `translate(${l.current.x - 16}px,${l.current.y - 16}px)`;
      if (dot.current) dot.current.style.transform = `translate(${p.current.x - 3}px,${p.current.y - 3}px)`;
      raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
    return () => { window.removeEventListener("mousemove", fn); if (raf.current) cancelAnimationFrame(raf.current); };
  }, []);
  return { ring, dot };
}

// ─── Input field ───────────────────────────────────────────────────────────────
const Field = ({ label, hint, icon: Icon, rightEl, type = "text", placeholder, value, onChange, required, testId, autoComplete }) => (
  <div className="w-full">
    <div className="flex items-center justify-between mb-1.5">
      <label className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">{label}</label>
      {hint && <span className="text-[10px] font-semibold text-sky-500">{hint}</span>}
    </div>
    <div className="relative group">
      <Icon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-[15px] h-[15px] text-slate-400 z-10 pointer-events-none group-focus-within:text-sky-500 transition-colors duration-150" />
      <input
        type={type} value={value} onChange={onChange} required={required}
        placeholder={placeholder} autoComplete={autoComplete} data-testid={testId}
        className="w-full pl-10 pr-10 text-[13px] sm:text-sm font-medium text-slate-800 placeholder-slate-400 rounded-xl border border-slate-200 bg-white focus:outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100 transition-all duration-150 py-2.5"
      />
      {rightEl && <div className="absolute right-3 top-1/2 -translate-y-1/2">{rightEl}</div>}
    </div>
  </div>
);

// ─── Full-screen centered overlay (FIX para steps 3/4/5) ──────────────────────
const FullScreenCenter = ({ children, dark = true }) => (
  <>
    <style>{`@keyframes spinDrum { from { transform:rotate(0deg) } to { transform:rotate(360deg) } }`}</style>
    <div
      className="relative min-h-screen"
      style={{ background: dark ? "linear-gradient(150deg,#0b1929 0%,#081320 55%,#040c16 100%)" : undefined }}
    >
      <PublicNav dark={dark} />
      {/* FIX: position fixed + inset-0 garantiza centrado real en todos los browsers */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "1.25rem",
          zIndex: 20,
          overflowY: "auto",
        }}
      >
        <div style={{ width: "100%", maxWidth: "440px", margin: "auto" }}>
          {children}
        </div>
      </div>
    </div>
  </>
);

// ─── Email Verification Step ───────────────────────────────────────────────────
function EmailVerificationStep({ email, tempToken, onVerified, t }) {
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown(c => c - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  const handleVerify = async () => {
    if (!code.trim() || code.length < 4) {
      setError(t("Enter the verification code", "Ingresa el código de verificación"));
      return;
    }
    setVerifying(true);
    setError("");
    try {
      const response = await api.post("/api/customer/auth/verify-email-registration",
        { email, code: code.trim(), temp_token: tempToken }
      );
      if (response.data.access_token) {
        localStorage.setItem("customer_token", response.data.access_token);
        localStorage.setItem("customer_data", JSON.stringify(response.data.customer));
        toast.success(t("Email verified! Account created!", "¡Email verificado! Cuenta creada!"));
        onVerified(response.data);
      } else {
        throw new Error("No token received");
      }
    } catch (err) {
      setError(err.response?.data?.detail || t("Invalid or expired code", "Código inválido o expirado"));
    } finally {
      setVerifying(false);
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0) return;
    setResending(true);
    try {
      await api.post("/api/customer/auth/resend-verification", { email });
      toast.success(t("Code sent!", "¡Código enviado!"));
      setResendCooldown(60);
    } catch {
      toast.error(t("Could not resend code", "No se pudo reenviar el código"));
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="p-5 sm:p-7 flex flex-col gap-5">
      {/* Header */}
      <div className="text-center">
        <div className="w-14 h-14 bg-gradient-to-br from-emerald-400 to-teal-600 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-lg shadow-emerald-200/50">
          <Mail className="w-7 h-7 text-white" />
        </div>
        <h2 className="text-lg font-bold text-slate-800">
          {t("Verify your email", "Verifica tu email")}
        </h2>
        <p className="text-xs text-slate-400 mt-1 leading-relaxed">
          {t("We sent a 6-digit code to", "Enviamos un código de 6 dígitos a")}{" "}
          <span className="font-semibold text-slate-600 break-all">{email}</span>
        </p>
        <p className="text-[11px] text-amber-600 mt-2 font-medium">
          {t("Your account will be created after verification", "Tu cuenta será creada después de la verificación")}
        </p>
      </div>

      {/* Code input */}
      <div>
        <label className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500 mb-1.5 block">
          {t("6-digit verification code", "Código de verificación de 6 dígitos")}
        </label>
        <input
          type="text"
          inputMode="numeric"
          maxLength={6}
          value={code}
          onChange={e => { setCode(e.target.value.replace(/\D/g, "")); setError(""); }}
          placeholder="000000"
          className={`w-full text-center text-2xl font-bold tracking-[0.35em] rounded-xl border bg-white focus:outline-none focus:ring-2 focus:ring-sky-100 transition-all duration-150 py-4 ${error ? "border-red-300 focus:border-red-400" : "border-slate-200 focus:border-sky-400"}`}
          onKeyDown={e => e.key === "Enter" && handleVerify()}
          autoFocus
        />
        {error && (
          <p className="flex items-center gap-1 text-xs text-red-500 mt-1.5">
            <AlertCircle className="w-3 h-3 flex-shrink-0" /> {error}
          </p>
        )}
      </div>

      {/* Verify button */}
      <button
        onClick={handleVerify}
        disabled={verifying || code.length < 4}
        className="w-full flex items-center justify-center gap-2.5 py-3.5 text-[12px] font-bold uppercase tracking-[0.12em] disabled:opacity-50 disabled:cursor-not-allowed rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-200/50 hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200"
      >
        {verifying ? (
          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
        ) : (
          <CheckCircle className="w-4 h-4" />
        )}
        {verifying
          ? t("Verifying…", "Verificando…")
          : t("Verify & create account", "Verificar y crear cuenta")}
      </button>

      {/* Resend */}
      <button
        onClick={handleResend}
        disabled={resending || resendCooldown > 0}
        className="flex items-center justify-center gap-1.5 text-xs text-slate-400 font-semibold hover:text-sky-500 transition-colors text-center disabled:opacity-50"
      >
        <RefreshCw className={`w-3 h-3 ${resending ? "animate-spin" : ""}`} />
        {resendCooldown > 0
          ? `${t("Resend in", "Reenviar en")} ${resendCooldown}s`
          : t("Resend code", "Reenviar código")}
      </button>

      {/* Tip */}
      <div className="bg-amber-50 border border-amber-100 rounded-xl p-3">
        <p className="text-[11px] text-amber-700 leading-relaxed">
          💡 {t(
            "Check your spam folder if you don't see it in a few minutes.",
            "Revisa tu carpeta de spam si no lo ves en unos minutos."
          )}
        </p>
      </div>
    </div>
  );
}

// ─── Card Collection Step — inner (usa hooks de Stripe) ───────────────────────
function CardCollectionInner({ customerData, onSuccess, onSkip, t, token }) {
  const stripe = useStripe();
  const elements = useElements();
  const [saving, setSaving] = useState(false);
  const [cardReady, setCardReady] = useState(false);
  const [cardError, setCardError] = useState("");
  const [cardBrand, setCardBrand] = useState("");

  const CARD_STYLE = {
    style: {
      base: {
        fontSize: "15px",
        color: "#1e293b",
        fontFamily: "'Inter', system-ui, sans-serif",
        fontWeight: "500",
        letterSpacing: "0.02em",
        "::placeholder": { color: "#94a3b8" },
      },
      invalid: { color: "#ef4444" },
    },
  };

  const handleSaveCard = async () => {
    if (!stripe || !elements) return;
    setSaving(true);
    setCardError("");

    const authToken = localStorage.getItem("customer_token") || token;
    if (!authToken) {
      setCardError(t("Session expired. Please log in again.", "Sesión expirada. Por favor inicia sesión nuevamente."));
      setSaving(false);
      return;
    }

    try {
      const siRes = await api.post("/api/customer/payments/setup-intent", {}, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const { client_secret } = siRes.data;

      const { error, setupIntent } = await stripe.confirmCardSetup(client_secret, {
        payment_method: {
          card: elements.getElement(CardElement),
          billing_details: {
            name: customerData?.name || "",
            email: customerData?.email || "",
          },
        },
      });

      if (error) { setCardError(error.message); setSaving(false); return; }

      await api.post("/api/customer/payments/save-method", {
        payment_method_id: setupIntent.payment_method,
        customer_name: customerData?.name,
        customer_email: customerData?.email,
      }, { headers: { Authorization: `Bearer ${authToken}` } });

      toast.success(t("Card saved! You're all set for automatic charges.", "¡Tarjeta guardada! Listo para cobros automáticos."));
      onSuccess();
    } catch (err) {
      const msg = err.response?.data?.detail || t("Could not save card", "No se pudo guardar la tarjeta");
      setCardError(typeof msg === "string" ? msg : JSON.stringify(msg));
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col">
      {/* Header gradient */}
      <div className="bg-gradient-to-br from-sky-600 to-blue-700 px-6 py-6 text-center">
        <div className="w-14 h-14 bg-white/20 backdrop-blur rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-lg">
          <CreditCard className="w-7 h-7 text-white" />
        </div>
        <h2 className="text-lg font-bold text-white">
          {t("Add a payment method", "Agrega un método de pago")}
        </h2>
        <p className="text-white/70 text-xs mt-1 leading-relaxed">
          {t("Required for automatic charges on pickup & delivery orders", "Requerido para cobros automáticos en órdenes de recogida y entrega")}
        </p>
      </div>

      <div className="p-5 sm:p-6 flex flex-col gap-5">
        {/* Security badges */}
        <div className="flex items-center justify-center gap-4 text-[10px] text-slate-400 font-semibold">
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" /> SSL Encrypted
          </span>
          <span className="w-px h-3 bg-slate-200" />
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" /> Stripe Secured
          </span>
          <span className="w-px h-3 bg-slate-200" />
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" /> PCI DSS
          </span>
        </div>

        {/* Card element */}
        <div>
          <label className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500 mb-1.5 block">
            {t("Card details", "Datos de la tarjeta")}
          </label>
          <div className={`border-2 rounded-xl px-4 py-4 bg-white transition-all duration-200 ${cardError ? "border-red-300 ring-2 ring-red-50" : cardReady ? "border-emerald-400 ring-2 ring-emerald-50" : "border-slate-200 focus-within:border-sky-400 focus-within:ring-2 focus-within:ring-sky-50"}`}>
            <CardElement
              options={CARD_STYLE}
              onChange={(e) => {
                setCardReady(e.complete);
                setCardError(e.error?.message || "");
                setCardBrand(e.brand || "");
              }}
            />
          </div>
          {cardError && (
            <p className="flex items-center gap-1 text-xs text-red-500 mt-1.5">
              <AlertCircle className="w-3 h-3 flex-shrink-0" /> {cardError}
            </p>
          )}
          {cardReady && !cardError && (
            <p className="flex items-center gap-1 text-xs text-emerald-600 mt-1.5 font-medium">
              <CheckCircle className="w-3 h-3 flex-shrink-0" />
              {t("Card details look good!", "¡Datos de la tarjeta correctos!")}
            </p>
          )}
        </div>

        {/* How automatic charges work */}
        <div className="rounded-xl border border-sky-100 bg-gradient-to-br from-sky-50 to-blue-50 p-4">
          <p className="text-[11px] font-bold uppercase tracking-wider text-sky-600 mb-2.5 flex items-center gap-1.5">
            <Zap className="w-3 h-3" />
            {t("How automatic charges work", "Cómo funcionan los cobros automáticos")}
          </p>
          <ul className="space-y-2">
            {[
              t(
                "When your order is weighed, the exact amount is charged automatically — no action needed.",
                "Cuando tu orden es pesada, el monto exacto se cobra automáticamente — sin acción de tu parte."
              ),
              t(
                "Pickup & Delivery orders always require a card on file.",
                "Las órdenes de Recogida y Entrega siempre requieren una tarjeta registrada."
              ),
              t(
                "Wash & Fold drop-off: pay at counter or with your saved card.",
                "Wash & Fold: paga en mostrador o con tu tarjeta guardada."
              ),
              t(
                "You'll receive a receipt by email after each charge.",
                "Recibirás un recibo por email después de cada cobro."
              ),
            ].map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-[11px] text-sky-700 leading-relaxed">
                <span className="mt-0.5 w-4 h-4 rounded-full bg-sky-200/70 flex items-center justify-center flex-shrink-0 text-[9px] font-bold text-sky-700">
                  {i + 1}
                </span>
                {item}
              </li>
            ))}
          </ul>
        </div>

        {/* Member perks */}
        <div className="rounded-xl border border-violet-100 bg-violet-50/60 p-3.5 flex items-start gap-2.5">
          <Star className="w-3.5 h-3.5 text-violet-500 mt-0.5 flex-shrink-0" />
          <p className="text-[11px] text-violet-700 leading-relaxed">
            {t(
              "Members get charged at the exclusive member rate — never the regular price.",
              "Los miembros son cobrados a la tarifa exclusiva de miembros — nunca al precio regular."
            )}
          </p>
        </div>

        {/* Save button */}
        <button
          onClick={handleSaveCard}
          disabled={saving || !cardReady || !stripe}
          className="w-full flex items-center justify-center gap-2.5 py-3.5 text-[12px] font-bold uppercase tracking-[0.12em] disabled:opacity-50 disabled:cursor-not-allowed rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-lg shadow-sky-200/50 hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200"
        >
          {saving ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              {t("Saving card…", "Guardando tarjeta…")}
            </>
          ) : (
            <>
              <CreditCard className="w-4 h-4" />
              {t("Save card & continue", "Guardar tarjeta y continuar")}
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>

        {/* Skip */}
        <button
          onClick={onSkip}
          className="text-xs text-slate-400 font-semibold hover:text-slate-600 transition-colors text-center leading-relaxed"
        >
          {t(
            "Skip for now — I'll add it from my account later",
            "Omitir — lo agregaré desde mi cuenta después"
          )}
        </button>
      </div>
    </div>
  );
}

// ─── Card Collection Step wrapper (con Elements) ───────────────────────────────
function CardCollectionStep({ customerData, onSuccess, onSkip, t, token, stripeInstance }) {
  if (!stripeInstance) {
    return (
      <div className="p-6 text-center space-y-4">
        <CreditCard className="w-10 h-10 text-slate-300 mx-auto" />
        <p className="text-sm text-slate-500">
          {t("Payment setup not available at this time", "Configuración de pago no disponible en este momento")}
        </p>
        <button
          onClick={onSkip}
          className="w-full py-3 text-sm font-bold rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-lg shadow-sky-200/50 hover:shadow-xl transition-all duration-200"
        >
          {t("Continue to my account", "Continuar a mi cuenta")}
        </button>
      </div>
    );
  }
  return (
    <Elements stripe={stripeInstance}>
      <CardCollectionInner
        customerData={customerData}
        onSuccess={onSuccess}
        onSkip={onSkip}
        t={t}
        token={token}
      />
    </Elements>
  );
}

// ─── Welcome / Terms Modal ────────────────────────────────────────────────────
function WelcomeModal({ onAccept, t }) {
  return (
    <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden">
      <div className="bg-gradient-to-r from-sky-600 to-sky-500 px-5 sm:px-6 py-5 flex items-center gap-3">
        <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center flex-shrink-0">
          <ShieldCheck className="w-5 h-5 text-white" />
        </div>
        <div>
          <h2 className="text-white font-bold text-base sm:text-lg">
            {t("Welcome to Ventura Fresh Laundry!", "¡Bienvenido a Ventura Fresh Laundry!")}
          </h2>
          <p className="text-white/70 text-xs mt-0.5">{t("Your data, your trust", "Tus datos, tu confianza")}</p>
        </div>
      </div>
      <div className="px-5 sm:px-6 py-5 space-y-3">
        {[
          t("Auto-fill pickup and delivery forms for faster orders.", "Autocompletar formularios de recogida y entrega."),
          t("Send order updates via SMS and email.", "Enviar actualizaciones por SMS y correo."),
          t("Pickup & Delivery: auto-charged when weight is registered (requires saved card).", "Recogida y Entrega: cobro automático al registrar el peso (requiere tarjeta)."),
          t("Wash & Fold drop-off: pay in-store or with saved card.", "Wash & Fold: paga en mostrador o con tarjeta guardada."),
          t("We will never share your data with third parties.", "Nunca compartiremos tus datos con terceros."),
        ].map((item, i) => (
          <div key={i} className="flex items-start gap-2.5">
            <div className="w-5 h-5 rounded-full bg-sky-50 flex items-center justify-center flex-shrink-0 mt-0.5">
              <CheckCircle className="w-3 h-3 text-sky-500" />
            </div>
            <span className="text-xs sm:text-sm text-slate-600">{item}</span>
          </div>
        ))}
      </div>
      <div className="px-5 sm:px-6 pb-5">
        <button
          onClick={onAccept}
          className="w-full flex items-center justify-center gap-2 py-3 text-sm font-bold uppercase tracking-wider rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-lg shadow-sky-200/50 hover:shadow-xl transition-all duration-200"
        >
          <ShieldCheck className="w-4 h-4" />
          {t("I Understand, Continue", "Entendido, Continuar")}
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function CustomerLogin() {
  const { t } = useLocale();
  const navigate = useNavigate();

  const [mode, setMode] = useState("login");
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [acceptedPolicies, setAcceptedPolicies] = useState(false);

  // regStep: 1 = Personal, 2 = Address/Phone, 3 = Email Verify, 4 = Card, 5 = Welcome
  const [regStep, setRegStep] = useState(1);

  const [forgotMode, setForgotMode] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotSent, setForgotSent] = useState(false);
  const [resetToken, setResetToken] = useState(null);
  const [resetPassword, setResetPassword] = useState("");
  const [resetConfirm, setResetConfirm] = useState("");
  const [registeredCustomer, setRegisteredCustomer] = useState(null);
  const [stripePubKey, setStripePubKey] = useState(null);
  const [tempToken, setTempToken] = useState(null);
  const [addressValid, setAddressValid] = useState(null);
  const [checkingAddress, setCheckingAddress] = useState(false);

  const [form, setForm] = useState({
    name: "", email: "", password: "", phone: "",
    address: "", city: "", state: "", zip_code: "",
  });
  const setF = (k, v) => setForm(p => ({ ...p, [k]: v }));

  // ─── NUEVO: Detectar si viene del botón de membresía ─────────────────────────
  const source = new URLSearchParams(window.location.search).get("source");
  const tab = new URLSearchParams(window.location.search).get("tab");
  const shouldRedirectToMembership = source === "membership_button" || tab === "register";

  // Modificar redirectRef para que redirija a membership si viene del botón
  const redirectRef = useRef(
    shouldRedirectToMembership ? "/membership" : 
    new URLSearchParams(window.location.search).get("redirect") || "/account"
  );
  const redirectPath = redirectRef.current;
  
  const addressDebounceRef = useRef(null);
  const { ring, dot } = useCursor();

  // Cargar Stripe key al montar
  useEffect(() => {
    const fetchStripeKey = async () => {
      try {
        const response = await api.get("/api/customer/payments/setup-intent-key");
        setStripePubKey(response.data?.publishable_key);
      } catch { setStripePubKey(null); }
    };
    fetchStripeKey();
  }, []);

  // Detectar token de reset en URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const rt = params.get("reset");
    if (rt) { setResetToken(rt); setMode("login"); }
  }, []);

  // Detectar si la URL es /account/login?tab=register para abrir directamente el registro
  useEffect(() => {
    const path = window.location.pathname;
    const tabParam = new URLSearchParams(window.location.search).get("tab");
    const sourceParam = new URLSearchParams(window.location.search).get("source");
    
    if (tabParam === "register" || sourceParam === "membership_button") {
      setMode("register");
      setRegStep(1);
    } else if (path === "/account/register") {
      setMode("register");
      setRegStep(1);
    } else if (path === "/account/login") {
      setMode("login");
    }
  }, []);

  // ── FIX 1: NO redirigir si estamos en steps 3/4/5 del registro ──────────────
  useEffect(() => {
    const token = localStorage.getItem("customer_token");
    const isPostVerifyStep = mode === "register" && regStep >= 3;
    const isFromMembership = shouldRedirectToMembership;
    
    if (token && !resetToken && !isPostVerifyStep) {
      // Si el usuario viene del botón de membresía, redirigir a membership
      if (isFromMembership) {
        navigate("/membership", { replace: true });
      } else {
        navigate(redirectPath, { replace: true });
      }
    }
  }, [navigate, redirectPath, resetToken, mode, regStep, shouldRedirectToMembership]);

  useEffect(() => {
    return () => { if (addressDebounceRef.current) clearTimeout(addressDebounceRef.current); };
  }, []);

  const validateAddressDistance = useCallback(async (fullAddress) => {
    if (!fullAddress || fullAddress.length < 5) { setAddressValid(null); return; }
    if (addressDebounceRef.current) clearTimeout(addressDebounceRef.current);
    addressDebounceRef.current = setTimeout(async () => {
      setCheckingAddress(true);
      try {
        const res = await api.post("/api/store/check-address", { address: fullAddress });
        if (res.data.valid) {
          setAddressValid({ valid: true });
          toast.success(t("Address within service area", "Dirección dentro del área"));
        } else {
          setAddressValid({ valid: false, error: res.data.error });
          toast.warning(res.data.error || t("Address outside service area", "Fuera del área de servicio"));
        }
      } catch { setAddressValid({ valid: true }); }
      finally { setCheckingAddress(false); }
    }, 400);
  }, [t]);

  const switchMode = (m) => {
    setMode(m); setRegStep(1);
    setForm({ name: "", email: form.email, password: "", phone: "", address: "", city: "", state: "", zip_code: "" });
    setShowPass(false); setAddressValid(null); setForgotMode(false); setForgotSent(false);
    setTempToken(null);
  };

  // ── Registration flow ──────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!acceptedPolicies) {
      toast.error(t("Accept terms to continue", "Acepta los términos para continuar"));
      return;
    }

    if (mode === "register" && regStep === 1) {
      if (!form.name.trim()) { toast.error(t("Enter your name", "Ingresa tu nombre")); return; }
      if (!form.email.includes("@")) { toast.error(t("Enter a valid email", "Correo inválido")); return; }
      if (form.password.length < 6) { toast.error(t("Password must be at least 6 characters", "Mínimo 6 caracteres")); return; }
      setRegStep(2);
      return;
    }

    setLoading(true);
    try {
      if (mode === "login") {
        const res = await api.post("/api/customer/auth/login", { email: form.email, password: form.password });
        localStorage.setItem("customer_token", res.data.access_token);
        localStorage.setItem("customer_data", JSON.stringify(res.data.customer));
        toast.success(t("Welcome back!", "¡Bienvenido de nuevo!"));
        
        // Redirige según el origen
        if (shouldRedirectToMembership) {
          navigate("/membership");
        } else {
          navigate(redirectPath);
        }
      } else {
        if (!form.phone.trim()) { toast.error(t("Enter your phone number", "Ingresa tu teléfono")); setLoading(false); return; }
        if (!form.address.trim()) { toast.error(t("Enter your address", "Ingresa tu dirección")); setLoading(false); return; }

        const res = await api.post("/api/customer/auth/initiate-registration", {
          name: form.name, email: form.email, password: form.password,
          phone: form.phone.trim(), address: form.address.trim(),
          city: form.city.trim() || "Ventura",
          state: form.state.trim() || "CA",
          zip_code: form.zip_code.trim() || "93003",
        });

        setTempToken(res.data.temp_token);
        setRegisteredCustomer(res.data.user_data);
        setRegStep(3);
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || t("Authentication failed", "Autenticación fallida"));
    } finally { setLoading(false); }
  };

  // ── FIX 5: handleEmailVerified — setRegStep ANTES de que el useEffect reaccione
  const handleEmailVerified = (customerData) => {
    setRegisteredCustomer(customerData.customer);
    if (stripePubKey) {
      setRegStep(4);
    } else {
      setRegStep(5);
    }
  };

  const handleCardSuccess = () => setRegStep(5);
  const handleCardSkip = () => setRegStep(5);

  const handleAcceptWelcome = () => {
    toast.success(t("Account created! Welcome!", "¡Cuenta creada! ¡Bienvenido!"));
    // Redirige a membership page si viene del botón de membresía, sino a /account
    if (shouldRedirectToMembership) {
      navigate("/membership");
    } else {
      navigate(redirectPath);
    }
  };

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    if (!forgotEmail.includes("@")) { toast.error(t("Enter a valid email", "Correo inválido")); return; }
    setLoading(true);
    try {
      await api.post("/api/customer/auth/forgot-password", { email: forgotEmail });
      setForgotSent(true);
    } catch (err) {
      toast.error(err.response?.data?.detail || t("Error sending reset email", "Error al enviar correo"));
    } finally { setLoading(false); }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    if (resetPassword.length < 6) { toast.error(t("Password must be at least 6 characters", "Mínimo 6 caracteres")); return; }
    if (resetPassword !== resetConfirm) { toast.error(t("Passwords don't match", "Las contraseñas no coinciden")); return; }
    setLoading(true);
    try {
      await api.post("/api/customer/auth/reset-password", { token: resetToken, password: resetPassword });
      toast.success(t("Password reset! You can now login.", "¡Contraseña restablecida!"));
      setResetToken(null); setResetPassword(""); setResetConfirm("");
      window.history.replaceState({}, "", "/account/login");
    } catch (err) {
      toast.error(err.response?.data?.detail || t("Reset failed", "Error al restablecer"));
    } finally { setLoading(false); }
  };

  const isLogin = mode === "login";
  const NAV_CLEARANCE = "11rem";

  // ── Step 3: Email verification ─────────────────────────────────────────────
  if (mode === "register" && regStep === 3) {
    return (
      <FullScreenCenter>
        <Tilt>
          <div className="bg-white rounded-2xl overflow-hidden border border-slate-200 shadow-2xl">
            <div className="h-[3px]" style={{ background: "linear-gradient(90deg,#10b981,#0ea5e9,#2563eb)" }} />
            <EmailVerificationStep
              email={form.email}
              tempToken={tempToken}
              onVerified={handleEmailVerified}
              t={t}
            />
          </div>
        </Tilt>
      </FullScreenCenter>
    );
  }

  // ── Step 4: Card collection ────────────────────────────────────────────────
  if (mode === "register" && regStep === 4) {
    const stripeInstance = getStripe(stripePubKey);
    return (
      <FullScreenCenter>
        <Tilt>
          <div className="bg-white rounded-2xl overflow-hidden border border-slate-200 shadow-2xl">
            <div className="h-[3px]" style={{ background: "linear-gradient(90deg,#0ea5e9,#38bdf8,#2563eb)" }} />
            <CardCollectionStep
              customerData={registeredCustomer}
              onSuccess={handleCardSuccess}
              onSkip={handleCardSkip}
              t={t}
              token={localStorage.getItem("customer_token")}
              stripeInstance={stripeInstance}
            />
          </div>
        </Tilt>
      </FullScreenCenter>
    );
  }

  // ── Step 5: Welcome modal ──────────────────────────────────────────────────
  if (mode === "register" && regStep === 5) {
    return (
      <>
        <style>{`@keyframes spinDrum { from { transform:rotate(0deg) } to { transform:rotate(360deg) } }`}</style>
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 50,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "1rem",
            overflowY: "auto",
            background: "linear-gradient(150deg,rgba(11,25,41,0.96) 0%,rgba(4,12,22,0.98) 100%)",
            backdropFilter: "blur(8px)",
          }}
        >
          <WelcomeModal onAccept={handleAcceptWelcome} t={t} />
        </div>
      </>
    );
  }

  // ── Steps 1 & 2 + Login ────────────────────────────────────────────────────
  return (
    <>
      <style>{`@keyframes spinDrum { from { transform:rotate(0deg) } to { transform:rotate(360deg) } }`}</style>

      <div className="pointer-events-none fixed inset-0 z-[9999] hidden lg:block">
        <div ref={ring} className="absolute w-8 h-8 rounded-full border-2 border-sky-400/40 will-change-transform" style={{ top: 0, left: 0 }} />
        <div ref={dot} className="absolute w-[6px] h-[6px] rounded-full bg-sky-400 will-change-transform" style={{ top: 0, left: 0 }} />
      </div>

      <div className="relative min-h-screen" style={{ background: "linear-gradient(150deg,#0b1929 0%,#081320 55%,#040c16 100%)", paddingTop: NAV_CLEARANCE }}>
        <PublicNav dark />
        <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: "linear-gradient(rgba(255,255,255,0.025) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.025) 1px,transparent 1px)", backgroundSize: "44px 44px" }} />

        <div className="flex flex-col lg:flex-row" style={{ minHeight: `calc(100vh - ${NAV_CLEARANCE})` }}>

          {/* LEFT PANEL */}
          <div className="relative hidden lg:flex lg:w-[44%] flex-col justify-between pb-8 overflow-hidden">
            <div className="relative z-10 flex flex-col items-center flex-1 justify-center px-10 py-4">
              <div style={{ transform: "perspective(900px) rotateY(2deg) rotateX(1deg)", width: "100%", maxWidth: 360 }}>
                <WashingMachineSVG />
              </div>
              <div className="mt-5 text-center" style={{ maxWidth: 290 }}>
                <h2 className="text-[28px] font-extrabold text-white leading-[1.15] tracking-tight">
                  {t("Your laundry.", "Tu ropa.")}<br />
                  <span className="text-sky-400">{t("Our care.", "Nuestro cuidado.")}</span>
                </h2>
                <p className="mt-2.5 text-[13px] text-white/45 leading-relaxed font-medium">
                  {t("Preferences, orders, and pickups all in one place.", "Preferencias, órdenes y recogidas todo en un lugar.")}
                </p>
              </div>
            </div>
            <div className="relative z-10 px-10">
              <div className="grid grid-cols-3 rounded-2xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.07)", background: "rgba(255,255,255,0.03)" }}>
                {[{ val: "10K+", label: t("Clients", "Clientes") }, { val: "4.9★", label: t("Rating", "Calificación") }, { val: "5+", label: t("Years", "Años") }].map((s, i) => (
                  <div key={i} className={`py-4 text-center ${i < 2 ? "border-r" : ""}`} style={{ borderColor: "rgba(255,255,255,0.07)" }}>
                    <p className="text-white font-extrabold text-[17px] leading-none">{s.val}</p>
                    <p className="mt-1.5 text-[9px] font-bold uppercase tracking-[0.16em] text-white/30">{s.label}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* RIGHT PANEL */}
          <div className="flex-1 flex flex-col items-center justify-center px-4 sm:px-6 py-8 sm:py-10 relative bg-slate-50">
            <div className="absolute inset-0 pointer-events-none opacity-50" style={{ backgroundImage: "radial-gradient(rgba(14,165,233,0.07) 1px,transparent 1px)", backgroundSize: "22px 22px" }} />

            <div className="relative w-full max-w-[420px] mx-auto">
              {/* Step progress */}
              {mode === "register" && (
                <div className="flex items-center justify-center gap-1 sm:gap-2 mb-4 flex-wrap">
                  {[t("Personal", "Personal"), t("Address", "Dirección")].map((label, i) => (
                    <div key={i} className="flex items-center gap-1 sm:gap-2">
                      <div className={`w-5 h-5 sm:w-6 sm:h-6 rounded-full flex items-center justify-center text-[9px] sm:text-[10px] font-black transition-all ${regStep > i + 1 ? "bg-emerald-500 text-white" : regStep === i + 1 ? "bg-sky-500 text-white" : "bg-slate-200 text-slate-400"}`}>
                        {regStep > i + 1 ? "✓" : i + 1}
                      </div>
                      <span className={`text-[9px] sm:text-[10px] font-bold uppercase tracking-wider hidden sm:inline ${regStep === i + 1 ? "text-sky-500" : "text-slate-400"}`}>{label}</span>
                      {i < 1 && <div className={`w-4 sm:w-6 h-px ${regStep > i + 1 ? "bg-emerald-300" : "bg-slate-200"}`} />}
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-center gap-2 sm:gap-3 mb-6">
                <div className="h-px flex-1 bg-slate-200" />
                <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400 text-center">
                  {t("Customer Portal", "Portal de Clientes")}
                </span>
                <div className="h-px flex-1 bg-slate-200" />
              </div>

              {/* Mode toggle */}
              <div className="flex bg-slate-100 border border-slate-200 rounded-2xl p-1 mb-5 shadow-sm">
                {["login", "register"].map(m => (
                  <button key={m} type="button" onClick={() => switchMode(m)}
                    className={`flex-1 py-2 sm:py-2.5 rounded-xl text-[10px] sm:text-[11px] font-bold uppercase tracking-[0.12em] transition-all duration-150 ${mode === m ? "bg-sky-500 text-white shadow-sm" : "text-slate-400 hover:text-slate-600"}`}>
                    {m === "login" ? t("Sign In", "Iniciar sesión") : t("Register", "Registrarse")}
                  </button>
                ))}
              </div>

              <div className="mb-5">
                <h1 className="text-[22px] sm:text-[26px] font-extrabold text-slate-800 leading-[1.15] tracking-tight">
                  {isLogin
                    ? <>{t("Sign in to your", "Inicia sesión en tu")}<br /><span className="text-sky-500">{t("account", "cuenta")}</span></>
                    : regStep === 1
                      ? <>{t("Create your", "Crea tu")}<br /><span className="text-sky-500">{t("account", "cuenta")}</span></>
                      : <>{t("Your", "Tu")}<br /><span className="text-sky-500">{t("location", "ubicación")}</span></>
                  }
                </h1>
              </div>

              <Tilt>
                <div className="bg-white rounded-2xl overflow-hidden border border-slate-200 shadow-md">
                  <div className="h-[3px]" style={{ background: "linear-gradient(90deg,#0ea5e9,#38bdf8,#2563eb)" }} />

                  {/* Reset password form */}
                  {resetToken ? (
                    <form onSubmit={handleResetPassword} className="p-4 sm:p-6 flex flex-col gap-4">
                      <div className="text-center mb-2">
                        <div className="w-12 h-12 bg-sky-50 rounded-2xl flex items-center justify-center mx-auto mb-3"><Lock className="w-6 h-6 text-sky-500" /></div>
                        <h2 className="text-base sm:text-lg font-bold text-slate-800">{t("New Password", "Nueva Contraseña")}</h2>
                      </div>
                      <Field label={t("New Password", "Nueva contraseña")} icon={Lock} type={showPass ? "text" : "password"} value={resetPassword} onChange={e => setResetPassword(e.target.value)} required placeholder="********" testId="reset-password-input" autoComplete="new-password"
                        rightEl={<button type="button" onClick={() => setShowPass(p => !p)} className="text-slate-400 hover:text-slate-600"><Eye className="w-[15px] h-[15px]" /></button>} />
                      <Field label={t("Confirm Password", "Confirmar contraseña")} icon={Lock} type="password" value={resetConfirm} onChange={e => setResetConfirm(e.target.value)} required placeholder="********" testId="reset-confirm-input" autoComplete="new-password" />
                      <button type="submit" disabled={loading} className="w-full flex items-center justify-center gap-2 py-3 text-[12px] font-bold uppercase disabled:opacity-50 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-lg shadow-sky-200/50 hover:shadow-xl transition-all duration-200">
                        {loading && <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                        {t("Reset Password", "Restablecer Contraseña")}
                      </button>
                      <button type="button" onClick={() => { setResetToken(null); window.history.replaceState({}, "", "/account/login"); }} className="text-xs text-sky-500 font-semibold hover:underline text-center">
                        {t("Back to login", "Volver al login")}
                      </button>
                    </form>

                  /* Forgot password form */
                  ) : forgotMode ? (
                    <form onSubmit={handleForgotPassword} className="p-4 sm:p-6 flex flex-col gap-4">
                      <div className="text-center mb-2">
                        <div className="w-12 h-12 bg-sky-50 rounded-2xl flex items-center justify-center mx-auto mb-3"><Mail className="w-6 h-6 text-sky-500" /></div>
                        <h2 className="text-base sm:text-lg font-bold text-slate-800">{t("Forgot Password?", "¿Olvidaste tu contraseña?")}</h2>
                      </div>
                      {forgotSent ? (
                        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center">
                          <CheckCircle className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                          <p className="text-sm font-semibold text-emerald-700">{t("Email sent!", "¡Correo enviado!")}</p>
                        </div>
                      ) : (
                        <Field label={t("Email Address", "Correo electrónico")} icon={Mail} type="email" value={forgotEmail} onChange={e => setForgotEmail(e.target.value)} required placeholder="you@example.com" testId="forgot-email-input" autoComplete="email" />
                      )}
                      {!forgotSent && (
                        <button type="submit" disabled={loading} className="w-full flex items-center justify-center gap-2 py-3 text-[12px] font-bold uppercase disabled:opacity-50 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-lg shadow-sky-200/50 hover:shadow-xl transition-all duration-200">
                          {loading && <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                          {t("Send Reset Link", "Enviar Enlace")}
                        </button>
                      )}
                      <button type="button" onClick={() => { setForgotMode(false); setForgotSent(false); }} className="text-xs text-sky-500 font-semibold hover:underline text-center">
                        {t("Back to login", "Volver al login")}
                      </button>
                    </form>

                  /* Main login/register form */
                  ) : (
                    <form onSubmit={handleSubmit} className="p-4 sm:p-6 flex flex-col gap-4">
                      {isLogin && (
                        <>
                          <Field label={t("Email Address", "Correo electrónico")} icon={Mail} type="email" value={form.email} onChange={e => setF("email", e.target.value)} required placeholder="you@example.com" testId="customer-email-input" autoComplete="email" />
                          <Field label={t("Password", "Contraseña")} icon={Lock} type={showPass ? "text" : "password"} value={form.password} onChange={e => setF("password", e.target.value)} required placeholder="********" testId="customer-password-input" autoComplete="current-password"
                            rightEl={<button type="button" onClick={() => setShowPass(p => !p)} className="text-slate-400 hover:text-slate-600">{showPass ? <EyeOff className="w-[15px] h-[15px]" /> : <Eye className="w-[15px] h-[15px]" />}</button>} />
                          <button type="button" onClick={() => { setForgotMode(true); setForgotEmail(form.email); }} className="text-xs text-sky-500 font-semibold hover:underline text-right -mt-2">
                            {t("Forgot your password?", "¿Olvidaste tu contraseña?")}
                          </button>
                        </>
                      )}

                      {!isLogin && regStep === 1 && (
                        <>
                          <Field label={t("Full Name", "Nombre completo")} icon={User} value={form.name} onChange={e => setF("name", e.target.value)} required placeholder={t("John Smith", "Juan García")} testId="customer-name-input" autoComplete="name" />
                          <Field label={t("Email Address", "Correo electrónico")} icon={Mail} type="email" value={form.email} onChange={e => setF("email", e.target.value)} required placeholder="you@example.com" testId="customer-email-input" autoComplete="email" />
                          <Field label={t("Password", "Contraseña")} icon={Lock} type={showPass ? "text" : "password"} value={form.password} onChange={e => setF("password", e.target.value)} required placeholder="********" testId="customer-password-input" autoComplete="new-password"
                            rightEl={<button type="button" onClick={() => setShowPass(p => !p)} className="text-slate-400 hover:text-slate-600">{showPass ? <EyeOff className="w-[15px] h-[15px]" /> : <Eye className="w-[15px] h-[15px]" />}</button>} />
                        </>
                      )}

                      {!isLogin && regStep === 2 && (
                        <>
                          <div className="flex items-center gap-2 mb-1">
                            <button type="button" onClick={() => setRegStep(1)} className="text-[10px] font-bold text-sky-500 hover:text-sky-600">{t("Back", "Atrás")}</button>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{t("Step 2 of 2 - Contact", "Paso 2 de 2 - Contacto")}</span>
                          </div>
                          <Field label={t("Phone Number", "Número de teléfono")} icon={Phone} type="tel" value={form.phone} onChange={e => setF("phone", e.target.value)} required placeholder="(805) 555-1234" testId="customer-phone-input" autoComplete="tel" />
                          <div>
                            <label className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500 mb-1.5 block">{t("Full Address", "Dirección completa")}</label>
                            <AddressAutocomplete
                              value={form.address} onChange={(val) => setF("address", val)}
                              onSelect={(parsed) => {
                                setF("address", parsed.display);
                                setF("city", parsed.city || "Ventura");
                                setF("state", parsed.state || "CA");
                                setF("zip_code", parsed.zip || "93003");
                                validateAddressDistance(parsed.display);
                              }}
                              placeholder={t("Start typing your address...", "Escribe tu dirección...")}
                              inputClassName="w-full pl-10 pr-10 text-[13px] sm:text-sm font-medium text-slate-800 placeholder-slate-400 rounded-xl border border-slate-200 bg-white focus:outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100 transition-all duration-150 py-2.5"
                              countryCode="us"
                            />
                            {checkingAddress && (
                              <div className="mt-2 text-xs text-sky-600 flex items-center gap-1">
                                <div className="w-3 h-3 border-2 border-sky-300 border-t-sky-600 rounded-full animate-spin" />
                                {t("Verifying...", "Verificando...")}
                              </div>
                            )}
                            {addressValid && !addressValid.valid && !checkingAddress && (
                              <div className="mt-2 text-xs text-red-600 flex items-center gap-1">
                                <X className="w-3 h-3" />{addressValid.error}
                              </div>
                            )}
                            {addressValid?.valid && !checkingAddress && (
                              <div className="mt-2 text-xs text-green-600 flex items-center gap-1">
                                <CheckCircle className="w-3 h-3" />{t("Valid address ✓", "Dirección válida ✓")}
                              </div>
                            )}
                          </div>

                          {/* Card notice en step 2 */}
                          <div className="rounded-xl border border-sky-100 bg-sky-50 p-3 flex items-start gap-2">
                            <CreditCard className="w-3.5 h-3.5 text-sky-500 mt-0.5 flex-shrink-0" />
                            <p className="text-[11px] text-sky-700 leading-relaxed">
                              {t(
                                "After verifying your email, you'll add a card for automatic charges.",
                                "Después de verificar tu email, agregarás una tarjeta para cobros automáticos."
                              )}
                            </p>
                          </div>
                        </>
                      )}

                      <div className="h-px bg-slate-200" />

                      {/* Terms checkbox */}
                      <label className="flex items-start gap-3 cursor-pointer group" data-testid="customer-acceptance">
                        <div className="mt-0.5 flex-shrink-0 relative">
                          <input type="checkbox" checked={acceptedPolicies} onChange={e => setAcceptedPolicies(e.target.checked)} className="sr-only peer" data-testid="customer-accept-checkbox" />
                          <div className="w-[18px] h-[18px] rounded-md border-2 border-slate-300 peer-checked:bg-sky-500 peer-checked:border-sky-500 flex items-center justify-center transition-all duration-150 group-hover:border-sky-400">
                            {acceptedPolicies && <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" strokeWidth="3.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                          </div>
                        </div>
                        <p className="text-[11px] sm:text-[12px] text-slate-500 leading-relaxed font-medium">
                          {t("I accept the", "Acepto los")}{" "}
                          <Link to="/terms-and-conditions" onClick={e => e.stopPropagation()} className="text-sky-500 font-semibold hover:underline">{t("Terms", "Términos")}</Link>
                          {" & "}
                          <Link to="/privacy-policy" onClick={e => e.stopPropagation()} className="text-sky-500 font-semibold hover:underline">{t("Privacy Policy", "Privacidad")}</Link>
                        </p>
                      </label>

                      {/* Submit */}
                      <button
                        type="submit"
                        disabled={loading || !acceptedPolicies}
                        data-testid="customer-submit-btn"
                        className="w-full flex items-center justify-center gap-2.5 py-3 text-[11px] sm:text-[12px] font-bold uppercase tracking-[0.12em] group relative overflow-hidden disabled:opacity-50 disabled:cursor-not-allowed rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-lg shadow-sky-200/50 hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200"
                      >
                        {loading ? (
                          <><div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />{t("Please wait...", "Un momento...")}</>
                        ) : (
                          <>
                            {isLogin ? t("Sign In", "Iniciar sesión") : regStep === 1 ? t("Continue", "Continuar") : t("Create account →", "Crear cuenta →")}
                            <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
                          </>
                        )}
                      </button>

                      <p className="text-center text-[11px] sm:text-[12px] text-slate-500 font-medium">
                        {isLogin ? t("No account?", "¿Sin cuenta?") : t("Already registered?", "¿Ya tienes cuenta?")}{" "}
                        <button type="button" onClick={() => switchMode(isLogin ? "register" : "login")} className="text-sky-500 font-bold hover:underline">
                          {isLogin ? t("Create one →", "Crear una →") : t("Sign in →", "Inicia sesión →")}
                        </button>
                      </p>
                    </form>
                  )}
                </div>
              </Tilt>

              <div className="mt-5 text-center">
                <Link to="/services">
                  <button type="button" className="inline-flex items-center gap-2 text-[10px] sm:text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500 hover:text-sky-500 transition-colors">
                    {t("View Services", "Ver Servicios")}
                  </button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}