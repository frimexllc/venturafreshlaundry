import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { User, Mail, Lock, ArrowRight, Eye, EyeOff, Phone, MapPin, Building2, Hash, ShieldCheck, X, CheckCircle } from "lucide-react";
import PublicNav from "../components/PublicNav";
import { useLocale } from "../context/LocaleContext";
import AddressAutocomplete from "../components/AddressAutocomplete";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// ─── Washing Machine SVG ───────────────────────────────────────────────────────
const WashingMachineSVG = () => {
  const holeAngles = [0, 45, 90, 135, 180, 225, 270, 315];
  const bubbles = [
    { cx: 140, cy: 310, r: 4,   dur: "2.8s", delay: "0s"   },
    { cx: 165, cy: 320, r: 3,   dur: "3.2s", delay: "0.7s" },
    { cx: 195, cy: 308, r: 5,   dur: "2.5s", delay: "1.4s" },
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
        <circle key={i} cx={x} cy="47" r={i === 2 ? 5 : 3.5}
          fill={i === 2 ? "#38bdf8" : "#1e3a55"}
          stroke={i === 2 ? "#7dd3fc" : "none"} strokeWidth="0.8" />
      ))}
      <circle cx="220" cy="47" r="11" fill="#0c2d45" stroke="#2d4a6b" strokeWidth="1" />
      <line x1="220" y1="38" x2="220" y2="44" stroke="#38bdf8" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="170" cy="230" r="108" fill="#0d1a28" stroke="#1e3a55" strokeWidth="1.5" />
      <circle cx="170" cy="230" r="104" fill="#101f30" stroke="#243d5c" strokeWidth="1" />
      <circle cx="170" cy="230" r="100" fill="url(#drumGrad)" />
      <g clipPath="url(#drumClip)">
        <rect x="70" y="285" width="200" height="50" fill="url(#waterGrad)">
          <animate attributeName="y" values="295;288;295" dur="3s" repeatCount="indefinite" calcMode="spline" keySplines="0.4 0 0.6 1;0.4 0 0.6 1" />
          <animate attributeName="height" values="40;50;40" dur="3s" repeatCount="indefinite" calcMode="spline" keySplines="0.4 0 0.6 1;0.4 0 0.6 1" />
        </rect>
        <path fill="#0ea5e9" opacity="0.3">
          <animate attributeName="d"
            values="M70,295 Q120,285 170,295 Q220,305 270,295 L270,340 L70,340 Z;M70,290 Q120,300 170,290 Q220,280 270,290 L270,340 L70,340 Z;M70,295 Q120,285 170,295 Q220,305 270,295 L270,340 L70,340 Z"
            dur="2.5s" repeatCount="indefinite" />
        </path>
        {bubbles.map((b, i) => (
          <circle key={i} cx={b.cx} r={b.r} fill="#7dd3fc" opacity="0.5">
            <animate attributeName="cy" values={`${b.cy};${b.cy - 40};${b.cy}`} dur={b.dur} begin={b.delay} repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.5;0.1;0.5" dur={b.dur} begin={b.delay} repeatCount="indefinite" />
          </circle>
        ))}
      </g>
      <g clipPath="url(#drumClip)">
        <g style={{ transformOrigin: "170px 230px", animation: "spinDrum 4s linear infinite" }}>
          {holeAngles.map((deg, i) => {
            const rad = (deg * Math.PI) / 180;
            return <circle key={i} cx={170 + 70 * Math.sin(rad)} cy={230 - 70 * Math.cos(rad)} r="8" fill="#091525" stroke="#1e3a55" strokeWidth="1" opacity="0.8" />;
          })}
          <circle cx="170" cy="230" r="14" fill="#0d1a28" stroke="#243d5c" strokeWidth="1.2" />
          <circle cx="170" cy="230" r="6" fill="#1e3a55" />
        </g>
        <g transform="translate(170,230)" style={{ transformOrigin: "0px 0px", animation: "spinDrum 4s linear infinite" }}>
          <circle r="28" fill="#071420" stroke="#38bdf8" strokeWidth="1.5" opacity="0.95" filter="url(#glow)" />
          <text textAnchor="middle" dy=".35em" fill="#38bdf8" fontSize="13" fontWeight="800" fontFamily="'Manrope', sans-serif" letterSpacing="2">VFL</text>
        </g>
      </g>
      <circle cx="170" cy="230" r="100" fill="url(#glassGrad)" opacity="0.7" />
      <ellipse cx="145" cy="195" rx="28" ry="18" fill="white" opacity="0.08" transform="rotate(-25,145,195)" />
      <circle cx="170" cy="230" r="100" fill="none" stroke="#243d5c" strokeWidth="2.5" />
      <rect x="26" y="215" width="10" height="30" rx="4" fill="#1a3050" stroke="#2d4a6b" strokeWidth="0.8" />
      <rect x="262" y="222" width="8" height="16" rx="3" fill="#38bdf8" opacity="0.7" />
      <rect x="55" y="358" width="30" height="8" rx="4" fill="#0d1a28" />
      <rect x="255" y="358" width="30" height="8" rx="4" fill="#0d1a28" />
      <rect x="42" y="72" width="55" height="22" rx="5" fill="#0c1e30" stroke="#1e3a55" strokeWidth="0.8" />
      <rect x="46" y="76" width="15" height="14" rx="3" fill="#091525" />
      <rect x="65" y="76" width="15" height="14" rx="3" fill="#091525" />
      <rect x="84" y="76" width="9" height="14" rx="3" fill="#38bdf8" opacity="0.3" />
      <rect x="175" y="72" width="75" height="22" rx="5" fill="#050e1a" stroke="#1e3a55" strokeWidth="0.8" />
      <text x="212" y="87" textAnchor="middle" fill="#38bdf8" fontSize="10" fontFamily="monospace" opacity="0.9">30°C</text>
    </svg>
  );
};

// ─── Tilt card ─────────────────────────────────────────────────────────────────
const Tilt = ({ children }) => {
  const ref = useRef(null);
  const [s, setS] = useState({});
  const onMove = useCallback((e) => {
    const r = ref.current.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width  - 0.5) * 6;
    const y = ((e.clientY - r.top)  / r.height - 0.5) * -6;
    setS({ transform: `perspective(1000px) rotateX(${y}deg) rotateY(${x}deg) translateZ(4px)`, transition: "transform 60ms linear" });
  }, []);
  const onLeave = useCallback(() => setS({
    transform: "perspective(1000px) rotateX(0) rotateY(0) translateZ(0)",
    transition: "transform 400ms var(--ease-spring)",
  }), []);
  return <div ref={ref} style={s} onMouseMove={onMove} onMouseLeave={onLeave}>{children}</div>;
};

// ─── Custom cursor ─────────────────────────────────────────────────────────────
function useCursor() {
  const ring = useRef(null);
  const dot  = useRef(null);
  const p    = useRef({ x: -200, y: -200 });
  const l    = useRef({ x: -200, y: -200 });
  const raf  = useRef(null);
  useEffect(() => {
    const fn = (e) => { p.current = { x: e.clientX, y: e.clientY }; };
    window.addEventListener("mousemove", fn, { passive: true });
    const loop = () => {
      l.current.x += (p.current.x - l.current.x) * 0.14;
      l.current.y += (p.current.y - l.current.y) * 0.14;
      if (ring.current) ring.current.style.transform = `translate(${l.current.x - 16}px,${l.current.y - 16}px)`;
      if (dot.current)  dot.current.style.transform  = `translate(${p.current.x - 3}px,${p.current.y - 3}px)`;
      raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
    return () => { window.removeEventListener("mousemove", fn); cancelAnimationFrame(raf.current); };
  }, []);
  return { ring, dot };
}

// ─── Input field ───────────────────────────────────────────────────────────────
const Field = ({ label, hint, icon: Icon, rightEl, type = "text", placeholder, value, onChange, required, testId, autoComplete }) => (
  <div>
    <div className="flex items-center justify-between mb-1.5">
      <label className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">{label}</label>
      {hint && (
        <span className="text-[10px] font-semibold text-sky-500 hover:text-sky-600 cursor-pointer transition-colors duration-100">
          {hint}
        </span>
      )}
    </div>
    <div className="relative group">
      <Icon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-[15px] h-[15px] text-slate-400 z-10 pointer-events-none group-focus-within:text-sky-500 transition-colors duration-150" />
      <input
        type={type} value={value} onChange={onChange} required={required}
        placeholder={placeholder} autoComplete={autoComplete} data-testid={testId}
        className="input-default w-full pl-10 pr-10 text-[13px] font-medium text-slate-800 placeholder-slate-400"
      />
      {rightEl && <div className="absolute right-3 top-1/2 -translate-y-1/2">{rightEl}</div>}
    </div>
  </div>
);

// ─── Page ──────────────────────────────────────────────────────────────────────
export default function CustomerLogin() {
  const { t } = useLocale();
  const navigate = useNavigate();
  const { ring, dot } = useCursor();

  const [mode, setMode] = useState("login");
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [acceptedPolicies, setAcceptedPolicies] = useState(false);
  const [regStep, setRegStep] = useState(1);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [forgotMode, setForgotMode] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotSent, setForgotSent] = useState(false);
  const [resetToken, setResetToken] = useState(null);
  const [resetPassword, setResetPassword] = useState("");
  const [resetConfirm, setResetConfirm] = useState("");
  const [form, setForm] = useState({ name: "", email: "", password: "", phone: "", address: "", city: "", state: "", zip_code: "" });
  const setF = (k, v) => setForm(p => ({ ...p, [k]: v }));

  // Estado para validación de dirección
  const [addressValid, setAddressValid] = useState(null);
  const [checkingAddress, setCheckingAddress] = useState(false);

  // Get redirect path and reset token from URL
  const redirectRef = useRef(new URLSearchParams(window.location.search).get("redirect") || "/account");
  const redirectPath = redirectRef.current;

  // Check for reset token in URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const rt = params.get("reset");
    if (rt) {
      setResetToken(rt);
      setMode("login");
    }
  }, []);

  // If already logged in, redirect
  useEffect(() => {
    const token = localStorage.getItem("customer_token");
    if (token && !resetToken) navigate(redirectPath, { replace: true });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const switchMode = (m) => {
    setMode(m);
    setRegStep(1);
    setForm(p => ({ name: "", email: p.email, password: "", phone: "", address: "", city: "", state: "", zip_code: "" }));
    setShowPass(false);
    setAddressValid(null);
  };

  // Validar dirección contra el backend
  const validateAddressDistance = async (fullAddress) => {
    if (!fullAddress || fullAddress.length < 5) {
      setAddressValid(null);
      return;
    }
    setCheckingAddress(true);
    try {
      const res = await axios.post(`${API}/store/check-address`, { address: fullAddress });
      if (res.data.valid) {
        setAddressValid({ valid: true, distance: res.data.distance_km, zone: res.data.zone_name });
        toast.success(t(`Address within service area (${res.data.distance_km.toFixed(1)} km)`, `Dirección dentro del área de servicio (${res.data.distance_km.toFixed(1)} km)`));
      } else {
        setAddressValid({ valid: false, error: res.data.error });
        toast.error(res.data.error || t("Address outside service area", "Dirección fuera del área de servicio"));
      }
    } catch (err) {
      const errorMsg = err.response?.data?.detail || "Could not verify address";
      setAddressValid({ valid: false, error: errorMsg });
      toast.error(t("Could not verify address", "No se pudo verificar la dirección"));
    } finally {
      setCheckingAddress(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!acceptedPolicies) {
      toast.error(t("Accept terms to continue", "Acepta los términos para continuar"));
      return;
    }

    if (mode === "register" && regStep === 1) {
      // Validate step 1 fields
      if (!form.name.trim()) { toast.error(t("Enter your name", "Ingresa tu nombre")); return; }
      if (!form.email.includes("@")) { toast.error(t("Enter a valid email", "Correo inválido")); return; }
      if (form.password.length < 6) { toast.error(t("Password must be at least 6 characters", "La contraseña debe tener al menos 6 caracteres")); return; }
      setRegStep(2);
      return;
    }

    setLoading(true);
    try {
      if (mode === "login") {
        const res = await axios.post(`${API}/customer/auth/login`, { email: form.email, password: form.password });
        localStorage.setItem("customer_token", res.data.access_token);
        localStorage.setItem("customer_data", JSON.stringify(res.data.customer));
        toast.success(t("Welcome back!", "¡Bienvenido de nuevo!"));
        navigate(redirectPath);
      } else {
        // Validate step 2 fields
        if (!form.phone.trim()) { toast.error(t("Enter your phone number", "Ingresa tu número de teléfono")); setLoading(false); return; }
        if (!form.address.trim()) { toast.error(t("Enter your address", "Ingresa tu dirección")); setLoading(false); return; }
        if (!form.city.trim()) { toast.error(t("Enter your city", "Ingresa tu ciudad")); setLoading(false); return; }
        if (!form.state.trim()) { toast.error(t("Enter your state", "Ingresa tu estado")); setLoading(false); return; }
        if (!form.zip_code.trim()) { toast.error(t("Enter your zip code", "Ingresa tu código postal")); setLoading(false); return; }

        // Validar que la dirección esté dentro del área de servicio
        if (!addressValid || !addressValid.valid) {
          toast.error(t("Please select a valid address within our service area", "Selecciona una dirección válida dentro de nuestra zona de servicio"));
          setLoading(false);
          return;
        }

        const res = await axios.post(`${API}/customer/auth/register`, {
          name: form.name,
          email: form.email,
          password: form.password,
          phone: form.phone.trim(),
          address: form.address.trim(),
          city: form.city.trim(),
          state: form.state.trim(),
          zip_code: form.zip_code.trim(),
        });
        localStorage.setItem("customer_token", res.data.access_token);
        localStorage.setItem("customer_data", JSON.stringify(res.data.customer));
        setShowTermsModal(true);
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || t("Authentication failed", "Autenticación fallida"));
    } finally { setLoading(false); }
  };

  const handleAcceptTermsModal = () => {
    setShowTermsModal(false);
    toast.success(t("Account created!", "¡Cuenta creada!"));
    navigate(redirectPath);
  };

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    if (!forgotEmail.includes("@")) { toast.error(t("Enter a valid email", "Correo inválido")); return; }
    setLoading(true);
    try {
      await axios.post(`${API}/customer/auth/forgot-password`, { email: forgotEmail });
      setForgotSent(true);
      toast.success(t("Check your email for a reset link", "Revisa tu correo para el enlace de recuperación"));
    } catch (err) {
      toast.error(err.response?.data?.detail || t("Error sending reset email", "Error al enviar correo de recuperación"));
    } finally { setLoading(false); }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    if (resetPassword.length < 6) { toast.error(t("Password must be at least 6 characters", "La contraseña debe tener al menos 6 caracteres")); return; }
    if (resetPassword !== resetConfirm) { toast.error(t("Passwords don't match", "Las contraseñas no coinciden")); return; }
    setLoading(true);
    try {
      await axios.post(`${API}/customer/auth/reset-password`, { token: resetToken, password: resetPassword });
      toast.success(t("Password reset! You can now login.", "¡Contraseña restablecida! Ya puedes iniciar sesión."));
      setResetToken(null);
      setResetPassword("");
      setResetConfirm("");
      window.history.replaceState({}, "", "/account/login");
    } catch (err) {
      toast.error(err.response?.data?.detail || t("Reset failed", "Error al restablecer"));
    } finally { setLoading(false); }
  };

  const isLogin = mode === "login";
  const NAV_CLEARANCE = "11rem";

  return (
    <>
      <style>{`
        @keyframes spinDrum { from { transform:rotate(0deg) } to { transform:rotate(360deg) } }
      `}</style>

      {/* Custom cursor — desktop only */}
      <div className="pointer-events-none fixed inset-0 z-[9999] hidden lg:block">
        <div ref={ring} className="absolute w-8 h-8 rounded-full border-2 border-sky-400/40 will-change-transform" style={{ top: 0, left: 0 }} />
        <div ref={dot}  className="absolute w-[6px] h-[6px] rounded-full bg-sky-400 will-change-transform" style={{ top: 0, left: 0 }} />
      </div>

      <div
        className="relative min-h-screen"
        style={{
          background: "linear-gradient(150deg,#0b1929 0%,#081320 55%,#040c16 100%)",
          paddingTop: NAV_CLEARANCE,
        }}
      >
        <PublicNav dark />

        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: "linear-gradient(rgba(255,255,255,0.025) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.025) 1px,transparent 1px)",
            backgroundSize: "44px 44px",
          }}
        />

        <div className="flex" style={{ minHeight: `calc(100vh - ${NAV_CLEARANCE})` }}>
          {/* LEFT — brand panel */}
          <div className="relative hidden lg:flex lg:w-[44%] flex-col justify-between pb-8 overflow-hidden">
            <div className="absolute -top-20 -left-16 w-80 h-80 rounded-full pointer-events-none"
              style={{ background: "radial-gradient(circle,rgba(14,165,233,0.15) 0%,transparent 65%)", filter: "blur(40px)" }} />
            <div className="absolute -bottom-16 -right-10 w-60 h-60 rounded-full pointer-events-none"
              style={{ background: "radial-gradient(circle,rgba(56,189,248,0.08) 0%,transparent 65%)", filter: "blur(30px)" }} />
            <div className="relative z-10 pt-6 px-10">
              <div className="inline-flex items-center gap-2.5 border border-white/10 rounded-full px-4 py-1.5"
                style={{ background: "rgba(255,255,255,0.05)" }}>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"
                  style={{ boxShadow: "0 0 6px rgba(52,211,153,0.9)" }} />
                <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/50">
                  {t("Premium Laundry", "Lavandería Premium")}
                </span>
              </div>
            </div>
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
                  {t("Preferences, orders, and pickups — all in one place.", "Preferencias, órdenes y recogidas — todo en un lugar.")}
                </p>
              </div>
            </div>
            <div className="relative z-10 px-10">
              <div className="grid grid-cols-3 rounded-2xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.07)", background: "rgba(255,255,255,0.03)" }}>
                {[
                  { val: "10K+", label: t("Clients", "Clientes")     },
                  { val: "4.9★", label: t("Rating",  "Calificación") },
                  { val: "5+",   label: t("Years",   "Años")         },
                ].map((s, i) => (
                  <div key={i} className={`py-4 text-center ${i < 2 ? "border-r" : ""}`} style={{ borderColor: "rgba(255,255,255,0.07)" }}>
                    <p className="text-white font-extrabold text-[17px] leading-none tracking-tight">{s.val}</p>
                    <p className="mt-1.5 text-[9px] font-bold uppercase tracking-[0.16em] text-white/30">{s.label}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* RIGHT — form panel */}
          <div className="flex-1 flex flex-col items-center justify-center px-6 py-10 relative" style={{ background: "hsl(var(--background))" }}>
            <div className="absolute inset-0 pointer-events-none opacity-50"
              style={{ backgroundImage: "radial-gradient(rgba(14,165,233,0.07) 1px,transparent 1px)", backgroundSize: "22px 22px" }} />

            <div className="relative w-full max-w-[360px] animate-slide-up">
              <div className="flex items-center gap-3 mb-6">
                <div className="h-px flex-1 bg-border" />
                <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
                  {t("Customer Portal", "Portal de Clientes")}
                </span>
                <div className="h-px flex-1 bg-border" />
              </div>

              <div className="flex bg-secondary border border-border rounded-2xl p-1 mb-5 shadow-[var(--shadow-xs)]">
                {["login", "register"].map(m => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => switchMode(m)}
                    className={`flex-1 py-2.5 rounded-xl text-[11px] font-bold uppercase tracking-[0.12em] transition-all duration-150 ${
                      mode === m
                        ? "bg-sky-500 text-white shadow-[var(--shadow-sky)]"
                        : "text-slate-400 hover:text-slate-600"
                    }`}
                  >
                    {m === "login" ? t("Sign In", "Iniciar sesión") : t("Register", "Registrarse")}
                  </button>
                ))}
              </div>

              <div className="mb-5">
                <h1 className="text-[26px] font-extrabold text-foreground leading-[1.15] tracking-tight">
                  {isLogin
                    ? <>{t("Sign in to your", "Inicia sesión en tu")}<br /><span className="text-sky-500">{t("account", "cuenta")}</span></>
                    : <>{t("Create your", "Crea tu")}<br /><span className="text-sky-500">{t("account", "cuenta")}</span></>
                  }
                </h1>
              </div>

              <Tilt>
                <div className="bg-card rounded-2xl overflow-hidden" style={{ border: "1px solid hsl(var(--border))", boxShadow: "var(--shadow-md)" }}>
                  <div className="h-[3px]" style={{ background: "linear-gradient(90deg,hsl(var(--primary)),#38bdf8,#2563eb)" }} />

                  {resetToken ? (
                    <form onSubmit={handleResetPassword} className="p-6 flex flex-col gap-4">
                      <div className="text-center mb-2">
                        <div className="w-12 h-12 bg-sky-50 rounded-2xl flex items-center justify-center mx-auto mb-3"><Lock className="w-6 h-6 text-sky-500" /></div>
                        <h2 className="text-lg font-bold text-slate-800">{t("New Password", "Nueva Contraseña")}</h2>
                        <p className="text-xs text-slate-400 mt-1">{t("Enter your new password below", "Ingresa tu nueva contraseña")}</p>
                      </div>
                      <Field label={t("New Password", "Nueva contraseña")} icon={Lock}
                        type={showPass ? "text" : "password"} value={resetPassword}
                        onChange={e => setResetPassword(e.target.value)} required placeholder="••••••••"
                        testId="reset-password-input" autoComplete="new-password"
                        rightEl={<button type="button" onClick={() => setShowPass(p => !p)} className="text-slate-400 hover:text-slate-600 transition-colors"><Eye className="w-[15px] h-[15px]" /></button>} />
                      <Field label={t("Confirm Password", "Confirmar contraseña")} icon={Lock}
                        type="password" value={resetConfirm}
                        onChange={e => setResetConfirm(e.target.value)} required placeholder="••••••••"
                        testId="reset-confirm-input" autoComplete="new-password" />
                      <button type="submit" disabled={loading} data-testid="reset-submit-btn"
                        className="btn-primary w-full flex items-center justify-center gap-2 py-3 text-[12px] font-bold uppercase tracking-wider disabled:opacity-50">
                        {loading ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : null}
                        {t("Reset Password", "Restablecer Contraseña")}
                      </button>
                      <button type="button" onClick={() => { setResetToken(null); window.history.replaceState({}, "", "/account/login"); }}
                        className="text-xs text-sky-500 font-semibold hover:underline text-center">
                        ← {t("Back to login", "Volver al login")}
                      </button>
                    </form>
                  ) : forgotMode ? (
                    <form onSubmit={handleForgotPassword} className="p-6 flex flex-col gap-4">
                      <div className="text-center mb-2">
                        <div className="w-12 h-12 bg-sky-50 rounded-2xl flex items-center justify-center mx-auto mb-3"><Mail className="w-6 h-6 text-sky-500" /></div>
                        <h2 className="text-lg font-bold text-slate-800">{t("Forgot Password?", "¿Olvidaste tu contraseña?")}</h2>
                        <p className="text-xs text-slate-400 mt-1">{t("We'll send you a reset link", "Te enviaremos un enlace de recuperación")}</p>
                      </div>
                      {forgotSent ? (
                        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center">
                          <CheckCircle className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                          <p className="text-sm font-semibold text-emerald-700">{t("Email sent!", "¡Correo enviado!")}</p>
                          <p className="text-xs text-emerald-600 mt-1">{t("Check your inbox for the reset link", "Revisa tu bandeja de entrada para el enlace")}</p>
                        </div>
                      ) : (
                        <Field label={t("Email Address", "Correo electrónico")} icon={Mail} type="email"
                          value={forgotEmail} onChange={e => setForgotEmail(e.target.value)} required
                          placeholder="you@example.com" testId="forgot-email-input" autoComplete="email" />
                      )}
                      {!forgotSent && (
                        <button type="submit" disabled={loading} data-testid="forgot-submit-btn"
                          className="btn-primary w-full flex items-center justify-center gap-2 py-3 text-[12px] font-bold uppercase tracking-wider disabled:opacity-50">
                          {loading ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : null}
                          {t("Send Reset Link", "Enviar Enlace")}
                        </button>
                      )}
                      <button type="button" onClick={() => { setForgotMode(false); setForgotSent(false); }}
                        className="text-xs text-sky-500 font-semibold hover:underline text-center">
                        ← {t("Back to login", "Volver al login")}
                      </button>
                    </form>
                  ) : (
                    <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-4">
                      {isLogin && (
                        <>
                          <Field label={t("Email Address", "Correo electrónico")} icon={Mail} type="email"
                            value={form.email} onChange={e => setF("email", e.target.value)} required
                            placeholder="you@example.com" testId="customer-email-input" autoComplete="email" />
                          <Field label={t("Password", "Contraseña")} icon={Lock}
                            type={showPass ? "text" : "password"} value={form.password}
                            onChange={e => setF("password", e.target.value)} required placeholder="••••••••"
                            testId="customer-password-input" autoComplete="current-password"
                            rightEl={<button type="button" onClick={() => setShowPass(p => !p)} className="text-slate-400 hover:text-slate-600 transition-colors duration-100 focus:outline-none">{showPass ? <EyeOff className="w-[15px] h-[15px]" /> : <Eye className="w-[15px] h-[15px]" />}</button>} />
                          <button type="button" onClick={() => { setForgotMode(true); setForgotEmail(form.email); }}
                            className="text-xs text-sky-500 font-semibold hover:underline text-right -mt-2" data-testid="forgot-password-link">
                            {t("Forgot your password?", "¿Olvidaste tu contraseña?")}
                          </button>
                        </>
                      )}

                      {!isLogin && regStep === 1 && (
                        <>
                          <Field label={t("Full Name", "Nombre completo")} icon={User}
                            value={form.name} onChange={e => setF("name", e.target.value)} required
                            placeholder={t("John Smith", "Juan García")} testId="customer-name-input" autoComplete="name" />
                          <Field label={t("Email Address", "Correo electrónico")} icon={Mail} type="email"
                            value={form.email} onChange={e => setF("email", e.target.value)} required
                            placeholder="you@example.com" testId="customer-email-input" autoComplete="email" />
                          <Field label={t("Password", "Contraseña")} icon={Lock}
                            type={showPass ? "text" : "password"} value={form.password}
                            onChange={e => setF("password", e.target.value)} required placeholder="••••••••"
                            testId="customer-password-input" autoComplete="new-password"
                            rightEl={<button type="button" onClick={() => setShowPass(p => !p)} className="text-slate-400 hover:text-slate-600 transition-colors">{showPass ? <EyeOff className="w-[15px] h-[15px]" /> : <Eye className="w-[15px] h-[15px]" />}</button>} />
                        </>
                      )}

                      {!isLogin && regStep === 2 && (
                        <>
                          <div className="flex items-center gap-2 mb-1">
                            <button type="button" onClick={() => setRegStep(1)} className="text-[10px] font-bold text-sky-500 hover:text-sky-600 transition-colors" data-testid="reg-back-btn">
                              ← {t("Back", "Atrás")}
                            </button>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                              {t("Step 2 of 2 — Contact & Address", "Paso 2 de 2 — Contacto y Dirección")}
                            </span>
                          </div>

                          <Field label={t("Phone Number", "Número de teléfono")} icon={Phone}
                            type="tel" value={form.phone} onChange={e => setF("phone", e.target.value)}
                            required placeholder="(805) 555-1234" testId="customer-phone-input" autoComplete="tel" />

                          {/* AddressAutocomplete integrado */}
                          <div>
                            <label className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500 mb-1.5 block">
                              {t("Full Address", "Dirección completa")}
                            </label>
                            <AddressAutocomplete
                              value={form.address}
                              onChange={(val) => setF("address", val)}
                              onSelect={(parsed) => {
                                setF("address", parsed.display);
                                setF("city", parsed.city);
                                setF("state", parsed.state);
                                setF("zip_code", parsed.zip);
                                validateAddressDistance(parsed.display);
                              }}
                              placeholder={t("Start typing your address…", "Escribe tu dirección…")}
                              inputClassName="input-default w-full pl-10 pr-10 text-[13px] font-medium text-slate-800 placeholder-slate-400"
                              countryCode="us"
                            />
                            {checkingAddress && (
                              <div className="mt-2 text-xs text-sky-600 flex items-center gap-1">
                                <div className="w-3 h-3 border-2 border-sky-300 border-t-sky-600 rounded-full animate-spin" />
                                {t("Verifying address...", "Verificando dirección...")}
                              </div>
                            )}
                            {addressValid && !addressValid.valid && !checkingAddress && (
                              <div className="mt-2 text-xs text-red-600 flex items-center gap-1">
                                <X className="w-3 h-3" />
                                {addressValid.error || t("Address not in service area", "Dirección fuera del área de servicio")}
                              </div>
                            )}
                            {addressValid && addressValid.valid && !checkingAddress && (
                              <div className="mt-2 text-xs text-green-600 flex items-center gap-1">
                                <CheckCircle className="w-3 h-3" />
                                {t("Valid address ✓", "Dirección válida ✓")}
                              </div>
                            )}
                          </div>

                          {/* Campos ocultos que se llenan automáticamente */}
                          <input type="hidden" value={form.city} />
                          <input type="hidden" value={form.state} />
                          <input type="hidden" value={form.zip_code} />
                        </>
                      )}

                      <div className="h-px bg-border" />

                      <label className="flex items-start gap-3 cursor-pointer group" data-testid="customer-acceptance">
                        <div className="mt-0.5 flex-shrink-0 relative">
                          <input
                            type="checkbox"
                            checked={acceptedPolicies}
                            onChange={e => setAcceptedPolicies(e.target.checked)}
                            className="sr-only peer"
                            data-testid="customer-accept-checkbox"
                          />
                          <div className="w-[18px] h-[18px] rounded-md border-2 border-slate-300 peer-checked:bg-sky-500 peer-checked:border-sky-500 flex items-center justify-center transition-all duration-150 group-hover:border-sky-400">
                            {acceptedPolicies && (
                              <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" strokeWidth="3.5" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </div>
                        </div>
                        <p className="text-[12px] text-muted-foreground leading-relaxed font-medium">
                          {t("I accept the", "Acepto los")}{" "}
                          <Link to="/terms-and-conditions" onClick={e => e.stopPropagation()} className="text-sky-500 font-semibold hover:underline" data-testid="customer-terms-link">
                            {t("Terms", "Términos")}
                          </Link>
                          {" & "}
                          <Link to="/privacy-policy" onClick={e => e.stopPropagation()} className="text-sky-500 font-semibold hover:underline" data-testid="customer-privacy-link">
                            {t("Privacy Policy", "Privacidad")}
                          </Link>
                        </p>
                      </label>

                      <button
                        type="submit"
                        disabled={loading || !acceptedPolicies || (mode === "register" && regStep === 2 && (!addressValid || !addressValid.valid))}
                        data-testid="customer-submit-btn"
                        className="btn-primary w-full flex items-center justify-center gap-2.5 py-3 text-[12px] font-bold uppercase tracking-[0.12em] group relative overflow-hidden disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {loading ? (
                          <>
                            <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            {t("Please wait...", "Un momento...")}
                          </>
                        ) : (
                          <>
                            {isLogin
                              ? t("Sign In", "Iniciar sesión")
                              : regStep === 1
                                ? t("Continue", "Continuar")
                                : t("Create Account", "Crear cuenta")
                            }
                            <ArrowRight className="w-3.5 h-3.5 transition-transform duration-150 group-hover:translate-x-0.5" />
                          </>
                        )}
                        <span className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-500 bg-gradient-to-r from-transparent via-white/10 to-transparent pointer-events-none" />
                      </button>

                      <p className="text-center text-[12px] text-muted-foreground font-medium">
                        {isLogin ? t("No account?", "¿Sin cuenta?") : t("Already registered?", "¿Ya tienes cuenta?")}{" "}
                        <button
                          type="button"
                          onClick={() => switchMode(isLogin ? "register" : "login")}
                          className="text-sky-500 font-bold hover:underline transition-colors duration-100"
                        >
                          {isLogin ? t("Create one →", "Crear una →") : t("Sign in →", "Inicia sesión →")}
                        </button>
                      </p>
                    </form>
                  )}
                </div>
              </Tilt>

              <div className="mt-5 text-center">
                <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400 mb-3">
                  {t("Explore our services", "Explora nuestros servicios")}
                </p>
                <Link to="/services">
                  <button
                    type="button"
                    className="btn-secondary inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.12em]"
                  >
                    {t("View Services", "Ver Servicios")}
                  </button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>

      {showTermsModal && (
        <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/60 backdrop-blur-sm" data-testid="terms-modal-overlay">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 overflow-hidden animate-slide-up" data-testid="terms-modal">
            <div className="bg-gradient-to-r from-sky-600 to-sky-500 px-6 py-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm">
                  <ShieldCheck className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-white font-bold text-lg leading-tight">
                    {t("Welcome to Ventura Fresh Laundry!", "¡Bienvenido a Ventura Fresh Laundry!")}
                  </h2>
                  <p className="text-white/70 text-xs font-medium mt-0.5">
                    {t("Your data, your trust", "Tus datos, tu confianza")}
                  </p>
                </div>
              </div>
            </div>
            <div className="px-6 py-5 space-y-4">
              <p className="text-sm text-slate-600 leading-relaxed">
                {t(
                  "Your personal information (name, phone, address) will be stored securely with the sole purpose of improving your service experience:",
                  "Tu información personal (nombre, teléfono, dirección) será almacenada de forma segura con el único propósito de mejorar tu experiencia de servicio:"
                )}
              </p>
              <ul className="space-y-2.5">
                {[
                  t("Auto-fill your pickup and delivery forms for faster orders.", "Autocompletar tus formularios de recogida y entrega para órdenes más rápidas."),
                  t("Send you order updates via SMS and email.", "Enviarte actualizaciones de tus órdenes por SMS y correo."),
                  t("Personalize your laundry preferences.", "Personalizar tus preferencias de lavandería."),
                  t("We will never share your data with third parties.", "Nunca compartiremos tus datos con terceros."),
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-2.5">
                    <div className="w-5 h-5 rounded-full bg-sky-50 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <svg className="w-3 h-3 text-sky-500" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <span className="text-sm text-slate-600">{item}</span>
                  </li>
                ))}
              </ul>
              <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                <p className="text-xs text-slate-500 leading-relaxed">
                  {t(
                    "By continuing, you agree to our Terms and Conditions and Privacy Policy. You can request deletion of your data at any time.",
                    "Al continuar, aceptas nuestros Términos y Condiciones y Política de Privacidad. Puedes solicitar la eliminación de tus datos en cualquier momento."
                  )}
                  {" "}
                  <Link to="/terms-and-conditions" className="text-sky-500 font-semibold hover:underline" onClick={() => setShowTermsModal(false)}>
                    {t("Read full terms", "Leer términos completos")}
                  </Link>
                </p>
              </div>
            </div>
            <div className="px-6 pb-5">
              <button
                onClick={handleAcceptTermsModal}
                data-testid="terms-modal-accept-btn"
                className="btn-primary w-full flex items-center justify-center gap-2 py-3 text-sm font-bold uppercase tracking-wider group relative overflow-hidden"
              >
                <ShieldCheck className="w-4 h-4" />
                {t("I Understand, Continue", "Entendido, Continuar")}
                <ArrowRight className="w-4 h-4 transition-transform duration-150 group-hover:translate-x-0.5" />
                <span className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-500 bg-gradient-to-r from-transparent via-white/10 to-transparent pointer-events-none" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}