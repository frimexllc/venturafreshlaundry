import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { User, Mail, Lock, ArrowRight, Eye, EyeOff } from "lucide-react";
import PublicNav from "../components/PublicNav";
import { useLocale } from "../context/LocaleContext";

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
  const { t }    = useLocale();
  const navigate = useNavigate();
  const { ring, dot } = useCursor();

  const [mode,             setMode]             = useState("login");
  const [loading,          setLoading]          = useState(false);
  const [showPass,         setShowPass]         = useState(false);
  const [acceptedPolicies, setAcceptedPolicies] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const setF = (k, v) => setForm(p => ({ ...p, [k]: v }));

  // Get redirect path from URL params
  const redirectPath = new URLSearchParams(window.location.search).get("redirect") || "/account";

  // If already logged in, redirect
  useEffect(() => {
    const token = localStorage.getItem("customer_token");
    if (token) navigate(redirectPath, { replace: true });
  }, [navigate, redirectPath]);

  const switchMode = (m) => {
    setMode(m);
    setForm(p => ({ name: "", email: p.email, password: "" }));
    setShowPass(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!acceptedPolicies) {
      toast.error(t("Accept terms to continue", "Acepta los términos para continuar"));
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
        const res = await axios.post(`${API}/customer/auth/register`, { name: form.name, email: form.email, password: form.password });
        localStorage.setItem("customer_token", res.data.access_token);
        localStorage.setItem("customer_data", JSON.stringify(res.data.customer));
        toast.success(t("Account created!", "¡Cuenta creada!"));
        navigate(redirectPath);
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || t("Authentication failed", "Autenticación fallida"));
    } finally { setLoading(false); }
  };

  const isLogin = mode === "login";

  // Nav height: logo h-40 (160px) + py-4 top (16px) = 176px safe clearance
  const NAV_CLEARANCE = "11rem";

  return (
    <>
      <style>{`
        @keyframes spinDrum { from { transform:rotate(0deg) } to { transform:rotate(360deg) } }
      `}</style>

      {/* Custom cursor — desktop only */}
      <div className="pointer-events-none fixed inset-0 z-[9999] hidden lg:block">
        <div ref={ring} className="absolute w-8 h-8 rounded-full border-2 border-sky-400/40 will-change-transform" style={{ top: 0, left: 0 }} />
        <div ref={dot}  className="absolute w-[6px] h-[6px] rounded-full bg-sky-400 will-change-transform"         style={{ top: 0, left: 0 }} />
      </div>

      {/*
        The whole page is one dark container so PublicNav (position:absolute)
        floats over the correct dark background.
        paddingTop pushes content below the floating nav.
      */}
      <div
        className="relative min-h-screen"
        style={{
          background: "linear-gradient(150deg,#0b1929 0%,#081320 55%,#040c16 100%)",
          paddingTop: NAV_CLEARANCE,
        }}
      >
        {/* Floating nav with dark variant */}
        <PublicNav dark />

        {/* Subtle dot grid over the whole dark bg */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: "linear-gradient(rgba(255,255,255,0.025) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.025) 1px,transparent 1px)",
            backgroundSize: "44px 44px",
          }}
        />

        {/* Split layout */}
        <div className="flex" style={{ minHeight: `calc(100vh - ${NAV_CLEARANCE})` }}>

          {/* ══ LEFT — brand panel ══════════════════════════════════════ */}
          <div className="relative hidden lg:flex lg:w-[44%] flex-col justify-between pb-8 overflow-hidden">

            {/* Glow orbs */}
            <div className="absolute -top-20 -left-16 w-80 h-80 rounded-full pointer-events-none"
              style={{ background: "radial-gradient(circle,rgba(14,165,233,0.15) 0%,transparent 65%)", filter: "blur(40px)" }} />
            <div className="absolute -bottom-16 -right-10 w-60 h-60 rounded-full pointer-events-none"
              style={{ background: "radial-gradient(circle,rgba(56,189,248,0.08) 0%,transparent 65%)", filter: "blur(30px)" }} />

            {/* Live badge */}
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

            {/* Machine + headline */}
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
                  {t(
                    "Preferences, orders, and pickups — all in one place.",
                    "Preferencias, órdenes y recogidas — todo en un lugar."
                  )}
                </p>
              </div>
            </div>

            {/* Stats footer */}
            <div className="relative z-10 px-10">
              <div
                className="grid grid-cols-3 rounded-2xl overflow-hidden"
                style={{ border: "1px solid rgba(255,255,255,0.07)", background: "rgba(255,255,255,0.03)" }}
              >
                {[
                  { val: "10K+", label: t("Clients", "Clientes")     },
                  { val: "4.9★", label: t("Rating",  "Calificación") },
                  { val: "5+",   label: t("Years",   "Años")         },
                ].map((s, i) => (
                  <div key={i} className={`py-4 text-center ${i < 2 ? "border-r" : ""}`}
                    style={{ borderColor: "rgba(255,255,255,0.07)" }}>
                    <p className="text-white font-extrabold text-[17px] leading-none tracking-tight">{s.val}</p>
                    <p className="mt-1.5 text-[9px] font-bold uppercase tracking-[0.16em] text-white/30">{s.label}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ══ RIGHT — form panel ════════════════════════════════════ */}
          <div
            className="flex-1 flex flex-col items-center justify-center px-6 py-10 relative"
            style={{ background: "hsl(var(--background))" }}
          >
            {/* Dot texture */}
            <div className="absolute inset-0 pointer-events-none opacity-50"
              style={{ backgroundImage: "radial-gradient(rgba(14,165,233,0.07) 1px,transparent 1px)", backgroundSize: "22px 22px" }} />

            {/* Form container — uses project's slideUp animation */}
            <div className="relative w-full max-w-[360px] animate-slide-up">

              {/* Divider label */}
              <div className="flex items-center gap-3 mb-6">
                <div className="h-px flex-1 bg-border" />
                <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
                  {t("Customer Portal", "Portal de Clientes")}
                </span>
                <div className="h-px flex-1 bg-border" />
              </div>

              {/* Mode tabs */}
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

              {/* Heading — Manrope from project fonts */}
              <div className="mb-5">
                <h1 className="text-[26px] font-extrabold text-foreground leading-[1.15] tracking-tight">
                  {isLogin
                    ? <>{t("Sign in to your", "Inicia sesión en tu")}<br /><span className="text-sky-500">{t("account", "cuenta")}</span></>
                    : <>{t("Create your", "Crea tu")}<br /><span className="text-sky-500">{t("account", "cuenta")}</span></>
                  }
                </h1>
              </div>

              {/* Card with tilt effect */}
              <Tilt>
                <div
                  className="bg-card rounded-2xl overflow-hidden"
                  style={{
                    border: "1px solid hsl(var(--border))",
                    boxShadow: "var(--shadow-md)",
                  }}
                >
                  {/* Top accent */}
                  <div className="h-[3px]" style={{ background: "linear-gradient(90deg,hsl(var(--primary)),#38bdf8,#2563eb)" }} />

                  <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-4">

                    {/* Name — register only */}
                    <div style={{
                      overflow: "hidden",
                      transition: "max-height 0.25s var(--ease-smooth), opacity 0.2s ease",
                      maxHeight: !isLogin ? "80px" : "0px",
                      opacity: !isLogin ? 1 : 0,
                    }}>
                      <Field
                        label={t("Full Name", "Nombre completo")}
                        icon={User}
                        value={form.name}
                        onChange={e => setF("name", e.target.value)}
                        required={!isLogin}
                        placeholder={t("John Smith", "Juan García")}
                        testId="customer-name-input"
                        autoComplete="name"
                      />
                    </div>

                    {/* Email */}
                    <Field
                      label={t("Email Address", "Correo electrónico")}
                      icon={Mail}
                      type="email"
                      value={form.email}
                      onChange={e => setF("email", e.target.value)}
                      required
                      placeholder="you@example.com"
                      testId="customer-email-input"
                      autoComplete="email"
                    />

                    {/* Password */}
                    <Field
                      label={t("Password", "Contraseña")}
                      hint={isLogin ? t("Forgot?", "¿Olvidaste?") : null}
                      icon={Lock}
                      type={showPass ? "text" : "password"}
                      value={form.password}
                      onChange={e => setF("password", e.target.value)}
                      required
                      placeholder="••••••••"
                      testId="customer-password-input"
                      autoComplete={isLogin ? "current-password" : "new-password"}
                      rightEl={
                        <button
                          type="button"
                          onClick={() => setShowPass(p => !p)}
                          className="text-slate-400 hover:text-slate-600 transition-colors duration-100 focus:outline-none"
                        >
                          {showPass ? <EyeOff className="w-[15px] h-[15px]" /> : <Eye className="w-[15px] h-[15px]" />}
                        </button>
                      }
                    />

                    {/* Divider */}
                    <div className="h-px bg-border" />

                    {/* Terms */}
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
                        <Link
                          to="/terms-and-conditions"
                          onClick={e => e.stopPropagation()}
                          className="text-sky-500 font-semibold hover:underline"
                          data-testid="customer-terms-link"
                        >
                          {t("Terms", "Términos")}
                        </Link>
                        {" & "}
                        <Link
                          to="/privacy-policy"
                          onClick={e => e.stopPropagation()}
                          className="text-sky-500 font-semibold hover:underline"
                          data-testid="customer-privacy-link"
                        >
                          {t("Privacy Policy", "Privacidad")}
                        </Link>
                      </p>
                    </label>

                    {/* Submit — uses project's btn-primary class */}
                    <button
                      type="submit"
                      disabled={loading || !acceptedPolicies}
                      data-testid="customer-submit-btn"
                      className="btn-primary w-full flex items-center justify-center gap-2.5 py-3 text-[12px] font-bold uppercase tracking-[0.12em] group relative overflow-hidden disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-sky-500 disabled:transform-none"
                    >
                      {loading ? (
                        <>
                          <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          {t("Please wait...", "Un momento...")}
                        </>
                      ) : (
                        <>
                          {isLogin ? t("Sign In", "Iniciar sesión") : t("Create Account", "Crear cuenta")}
                          <ArrowRight className="w-3.5 h-3.5 transition-transform duration-150 group-hover:translate-x-0.5" />
                        </>
                      )}
                      {/* Shimmer sweep */}
                      <span className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-500 bg-gradient-to-r from-transparent via-white/10 to-transparent pointer-events-none" />
                    </button>

                    {/* Switch mode */}
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
                </div>
              </Tilt>

              {/* Quick links */}
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
    </>
  );
}