import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { User, Mail, Lock, ArrowRight, Eye, EyeOff, Sparkles } from "lucide-react";
import PublicNav from "../components/PublicNav";
import PublicFooter from "../components/PublicFooter";
import { useLocale } from "../context/LocaleContext";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// ─── Magnetic wrapper ─────────────────────────────────────────────────────────
const Mag = ({ children, className = "", strength = 0.28, as: Tag = "div", ...p }) => {
  const ref = useRef(null);
  const onMove = useCallback((e) => {
    const r = ref.current.getBoundingClientRect();
    ref.current.style.transform = `translate(${(e.clientX - r.left - r.width / 2) * strength}px,${(e.clientY - r.top - r.height / 2) * strength}px)`;
  }, [strength]);
  const onLeave = useCallback(() => { ref.current.style.transform = "translate(0,0)"; }, []);
  return <Tag ref={ref} className={className} style={{ transition: "transform 500ms cubic-bezier(0.34,1.56,0.64,1)" }} onMouseMove={onMove} onMouseLeave={onLeave} {...p}>{children}</Tag>;
};

// ─── Tilt ─────────────────────────────────────────────────────────────────────
const Tilt = ({ children, className = "", depth = 5 }) => {
  const ref = useRef(null); const [s, setS] = useState({});
  const onMove = useCallback((e) => {
    const r = ref.current.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width - 0.5) * depth * 2;
    const y = ((e.clientY - r.top) / r.height - 0.5) * -depth * 2;
    setS({ transform: `perspective(900px) rotateX(${y}deg) rotateY(${x}deg) translateZ(8px)`, transition: "transform 80ms linear" });
  }, [depth]);
  const onLeave = useCallback(() => setS({ transform: "perspective(900px) rotateX(0) rotateY(0) translateZ(0)", transition: "transform 600ms cubic-bezier(0.34,1.56,0.64,1)" }), []);
  return <div ref={ref} style={s} className={className} onMouseMove={onMove} onMouseLeave={onLeave}>{children}</div>;
};

// ─── Custom Cursor ────────────────────────────────────────────────────────────
function useCursor() {
  const ring = useRef(null); const dot = useRef(null);
  const p = useRef({ x: -200, y: -200 }); const l = useRef({ x: -200, y: -200 }); const raf = useRef(null);
  useEffect(() => {
    const fn = (e) => { p.current = { x: e.clientX, y: e.clientY }; };
    window.addEventListener("mousemove", fn, { passive: true });
    const loop = () => {
      l.current.x += (p.current.x - l.current.x) * 0.1;
      l.current.y += (p.current.y - l.current.y) * 0.1;
      if (ring.current) ring.current.style.transform = `translate(${l.current.x - 18}px,${l.current.y - 18}px)`;
      if (dot.current)  dot.current.style.transform  = `translate(${p.current.x - 3}px,${p.current.y - 3}px)`;
      raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
    return () => { window.removeEventListener("mousemove", fn); cancelAnimationFrame(raf.current); };
  }, []);
  return { ring, dot };
}

// ─── Styled Input ─────────────────────────────────────────────────────────────
const AuthInput = ({ icon: Icon, rightIcon, type = "text", placeholder, value, onChange, required, testId, autoComplete }) => (
  <div className="relative">
    <Icon className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 z-10 pointer-events-none" />
    <input
      type={type}
      value={value}
      onChange={onChange}
      required={required}
      placeholder={placeholder}
      autoComplete={autoComplete}
      data-testid={testId}
      className="w-full pl-11 pr-11 py-3.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 focus:bg-white transition-all duration-200"
    />
    {rightIcon && <div className="absolute right-3.5 top-1/2 -translate-y-1/2">{rightIcon}</div>}
  </div>
);

// ─── Floating orb ─────────────────────────────────────────────────────────────
const Orb = ({ style }) => (
  <div className="absolute rounded-full pointer-events-none" style={{ filter: "blur(60px)", ...style }} />
);

// ─── MAIN ─────────────────────────────────────────────────────────────────────
export default function CustomerLogin() {
  const { t } = useLocale();
  const navigate = useNavigate();
  const { ring, dot } = useCursor();

  const [mode, setMode] = useState("login");
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [acceptedPolicies, setAcceptedPolicies] = useState(false);
  const [scrollY, setScrollY] = useState(0);
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const setF = (k, v) => setForm(p => ({ ...p, [k]: v }));

  useEffect(() => {
    let tick = false;
    const fn = () => { if (!tick) { requestAnimationFrame(() => { setScrollY(window.pageYOffset); tick = false; }); tick = true; } };
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);

  // Switch mode → reset form, keep email
  const switchMode = (m) => {
    setMode(m);
    setForm(p => ({ name: "", email: p.email, password: "" }));
    setShowPass(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!acceptedPolicies) {
      toast.error(t("You must accept the terms and privacy policy", "Debes aceptar los términos y la política de privacidad"));
      return;
    }
    setLoading(true);
    try {
      if (mode === "login") {
        const res = await axios.post(`${API}/customer/auth/login`, { email: form.email, password: form.password });
        localStorage.setItem("customer_token", res.data.access_token);
        localStorage.setItem("customer_data", JSON.stringify(res.data.customer));
        toast.success(t("Welcome back!", "¡Bienvenido de nuevo!"));
        navigate("/account");
      } else {
        const res = await axios.post(`${API}/customer/auth/register`, { name: form.name, email: form.email, password: form.password });
        localStorage.setItem("customer_token", res.data.access_token);
        localStorage.setItem("customer_data", JSON.stringify(res.data.customer));
        toast.success(t("Account created successfully!", "¡Cuenta creada exitosamente!"));
        navigate("/account");
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || t("Authentication failed", "Autenticación fallida"));
    } finally {
      setLoading(false);
    }
  };

  const isLogin = mode === "login";

  return (<>
    {/* Cursor */}
    <div className="pointer-events-none fixed inset-0 z-[9999] hidden lg:block">
      <div ref={ring} className="absolute w-9 h-9 rounded-full border border-primary/50 will-change-transform" style={{ top: 0, left: 0 }} />
      <div ref={dot}  className="absolute w-1.5 h-1.5 rounded-full bg-primary will-change-transform" style={{ top: 0, left: 0 }} />
    </div>

    <style>{`
      @keyframes fadeUp { from { opacity:0; transform:translateY(18px) } to { opacity:1; transform:translateY(0) } }
      @keyframes float  { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-10px)} }
      @keyframes spin-slow { from{transform:rotate(0)} to{transform:rotate(360deg)} }
    `}</style>

    <div className="min-h-screen overflow-x-hidden bg-white">
      <PublicNav />

      {/* ══ SPLIT LAYOUT ══════════════════════════════════════════════════ */}
      <div className="min-h-screen flex flex-col lg:flex-row">

        {/* ── LEFT: dark atmospheric panel ── */}
        <div className="relative hidden lg:flex lg:w-1/2 flex-col items-center justify-center overflow-hidden"
          style={{ background: "radial-gradient(ellipse at 30% 40%,#0c2a47 0%,#061525 60%,#020d18 100%)" }}>

          {/* Parallax BG */}
          <div className="absolute inset-0 will-change-transform"
            style={{ backgroundImage: "url('https://images.unsplash.com/photo-1545173168-9f1947eebb7f?w=1200&h=1600&fit=crop')", backgroundSize: "cover", backgroundPosition: "center", opacity: 0.12, transform: `translateY(${scrollY * 0.08}px)` }} />

          {/* Grid texture */}
          <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: "radial-gradient(rgba(255,255,255,0.8) 1px,transparent 1px)", backgroundSize: "28px 28px" }} />

          {/* Glow orbs */}
          <Orb style={{ width: 320, height: 320, top: "10%", left: "5%", background: "radial-gradient(circle,rgba(14,165,233,.22) 0%,transparent 70%)" }} />
          <Orb style={{ width: 240, height: 240, bottom: "15%", right: "5%", background: "radial-gradient(circle,rgba(56,189,248,.14) 0%,transparent 70%)" }} />

          {/* Spinning ring */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 rounded-full border border-sky-400/10"
            style={{ animation: "spin-slow 20s linear infinite" }}>
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-sky-400/40" />
          </div>
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-56 h-56 rounded-full border border-sky-400/8"
            style={{ animation: "spin-slow 14s linear infinite reverse" }} />

          {/* Content */}
          <div className="relative z-10 text-center px-12 max-w-sm">
            {/* Logo icon */}
            <div className="w-20 h-20 mx-auto mb-8 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center backdrop-blur-sm"
              style={{ animation: "float 4s ease-in-out infinite" }}>
              <span className="text-4xl">🧺</span>
            </div>

            <h2 className="text-4xl font-light text-white  leading-tight mb-4">
              {t("Your laundry,", "Tu ropa,")}
              <span className="block" style={{ WebkitTextStroke: "1.5px rgba(255,255,255,0.8)", color: "transparent" }}>
                {t("our care.", "nuestro cuidado.")}
              </span>
            </h2>
            <div className="w-12 h-px bg-gradient-to-r from-transparent via-primary to-transparent mx-auto mb-5" />
            <p className="text-white/50 text-sm leading-relaxed">
              {t(
                "Save preferences, track orders, and schedule pickups — all in one place.",
                "Guarda preferencias, rastrea órdenes y programa recogidas — todo en un solo lugar."
              )}
            </p>

            {/* Mini stats */}
            <div className="flex justify-center gap-8 mt-10">
              {[
                { val: "10K+", label: t("Customers", "Clientes") },
                { val: "4.9★", label: t("Rating", "Calificación") },
                { val: "5+",   label: t("Years", "Años") },
              ].map((s, i) => (
                <div key={i} className="text-center">
                  <p className="text-white font-black text-lg">{s.val}</p>
                  <p className="text-white/35 text-[10px] uppercase tracking-widest">{s.label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Bottom link */}
          <div className="absolute bottom-8 left-0 right-0 text-center">
            <Link to="/schedule-pickup" className="text-white/30 text-xs hover:text-white/60 transition-colors duration-200 uppercase tracking-widest">
              {t("Schedule without account →", "Programa sin cuenta →")}
            </Link>
          </div>
        </div>

        {/* ── RIGHT: form panel ── */}
        <div className="flex-1 flex flex-col items-center justify-center px-6 py-20 lg:py-0 relative bg-white">
          {/* Subtle BG dots */}
          <div className="absolute inset-0 opacity-[0.35] pointer-events-none"
            style={{ backgroundImage: "radial-gradient(rgba(14,165,233,0.06) 1px,transparent 1px)", backgroundSize: "24px 24px" }} />

          <div className="relative w-full max-w-sm" style={{ animation: "fadeUp 0.8s 0.1s both ease-out" }}>

            {/* Mode toggle tabs */}
            <div className="flex bg-slate-100 rounded-2xl p-1 mb-8">
              {["login", "register"].map(m => (
                <button key={m} type="button" onClick={() => switchMode(m)}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-bold uppercase tracking-wider transition-all duration-300
                    ${mode === m ? "bg-white text-primary shadow-md shadow-slate-200/60" : "text-slate-400 hover:text-slate-600"}`}>
                  {m === "login" ? t("Sign In", "Iniciar sesión") : t("Register", "Registrarse")}
                </button>
              ))}
            </div>

            {/* Heading */}
            <div className="mb-8">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="w-4 h-4 text-primary/60" />
                <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-primary/50">
                  {isLogin ? t("Welcome back", "Bienvenido de nuevo") : t("Join us", "Únete")}
                </span>
              </div>
              <h1 className="text-3xl font-bold text-slate-900 leading-tight">
                {isLogin
                  ? t("Sign in to your", "Inicia sesión en tu")
                  : t("Create your", "Crea tu")}
                <span className="block text-primary font-extralight">
                  {isLogin ? t("account.", "cuenta.") : t("account.", "cuenta.")}
                </span>
              </h1>
            </div>

            {/* Form card */}
            <Tilt depth={3}>
              <div className="relative bg-white rounded-2xl border border-slate-100 shadow-xl shadow-sky-50/60 overflow-hidden">
                {/* top accent */}
                <div className="absolute top-0 left-6 right-6 h-px bg-gradient-to-r from-transparent via-primary to-transparent" />
                <div className="absolute inset-0 bg-gradient-to-br from-sky-50/40 to-transparent pointer-events-none" />

                <form onSubmit={handleSubmit} className="relative p-7 space-y-4">
                  {/* Name (register only) */}
                  <div className={`overflow-hidden transition-all duration-500 ease-in-out ${!isLogin ? "max-h-24 opacity-100" : "max-h-0 opacity-0"}`}>
                    <div className="pb-1">
                      <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5 block">{t("Full Name", "Nombre completo")}</label>
                      <AuthInput
                        icon={User}
                        value={form.name}
                        onChange={e => setF("name", e.target.value)}
                        required={!isLogin}
                        placeholder={t("Your full name", "Tu nombre completo")}
                        testId="customer-name-input"
                        autoComplete="name"
                      />
                    </div>
                  </div>

                  {/* Email */}
                  <div>
                    <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5 block">{t("Email", "Correo")}</label>
                    <AuthInput
                      icon={Mail}
                      type="email"
                      value={form.email}
                      onChange={e => setF("email", e.target.value)}
                      required
                      placeholder={t("your@email.com", "tu@correo.com")}
                      testId="customer-email-input"
                      autoComplete="email"
                    />
                  </div>

                  {/* Password */}
                  <div>
                    <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5 block">{t("Password", "Contraseña")}</label>
                    <AuthInput
                      icon={Lock}
                      type={showPass ? "text" : "password"}
                      value={form.password}
                      onChange={e => setF("password", e.target.value)}
                      required
                      placeholder="••••••••"
                      testId="customer-password-input"
                      autoComplete={isLogin ? "current-password" : "new-password"}
                      rightIcon={
                        <button type="button" onClick={() => setShowPass(p => !p)}
                          className="text-slate-400 hover:text-slate-600 transition-colors duration-150 focus:outline-none">
                          {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      }
                    />
                  </div>

                  {/* Accept policies */}
                  <div className="flex items-start gap-3 pt-1" data-testid="customer-acceptance">
                    <div className="relative mt-0.5 flex-shrink-0">
                      <input
                        type="checkbox"
                        id="accept-policies"
                        checked={acceptedPolicies}
                        onChange={e => setAcceptedPolicies(e.target.checked)}
                        className="sr-only peer"
                        data-testid="customer-accept-checkbox"
                      />
                      <label htmlFor="accept-policies"
                        className="w-5 h-5 rounded-md border-2 border-slate-300 peer-checked:bg-primary peer-checked:border-primary flex items-center justify-center cursor-pointer transition-all duration-200 block">
                        {acceptedPolicies && <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>}
                      </label>
                    </div>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      {t("I accept the", "Acepto los")}{" "}
                      <Link to="/terms-and-conditions" className="text-primary font-semibold hover:underline" data-testid="customer-terms-link">
                        {t("Terms and Conditions", "Términos y condiciones")}
                      </Link>{" "}
                      {t("and the", "y la")}{" "}
                      <Link to="/privacy-policy" className="text-primary font-semibold hover:underline" data-testid="customer-privacy-link">
                        {t("Privacy Policy", "Política de privacidad")}
                      </Link>.
                    </p>
                  </div>

                  {/* Submit */}
                  <button type="submit" disabled={loading || !acceptedPolicies} data-testid="customer-submit-btn"
                    className="group w-full flex items-center justify-center gap-2 bg-primary text-white rounded-xl py-3.5 text-sm font-bold uppercase tracking-wider shadow-lg shadow-primary/25 hover:bg-primary/90 hover:shadow-xl hover:shadow-primary/30 transition-all duration-300 active:scale-95 overflow-hidden relative disabled:opacity-50 disabled:cursor-not-allowed mt-2">
                    {loading ? (
                      <span className="flex items-center gap-2">
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        {t("Please wait...", "Espere por favor...")}
                      </span>
                    ) : (
                      <span className="relative z-10 flex items-center gap-2">
                        {isLogin ? t("Sign In", "Iniciar sesión") : t("Create Account", "Crear cuenta")}
                        <ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1" />
                      </span>
                    )}
                    <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/15 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
                  </button>

                  {/* Mode switch */}
                  <p className="text-center text-xs text-slate-400 pt-1">
                    {isLogin ? t("Don't have an account?", "¿No tienes una cuenta?") : t("Already have an account?", "¿Ya tienes una cuenta?")}
                    {" "}
                    <button type="button" onClick={() => switchMode(isLogin ? "register" : "login")}
                      className="text-primary font-bold hover:underline transition-colors duration-150">
                      {isLogin ? t("Create one", "Crea una") : t("Sign in", "Inicia sesión")}
                    </button>
                  </p>
                </form>
              </div>
            </Tilt>

            {/* Bottom CTA */}
            <div className="mt-8 text-center">
              <p className="text-slate-400 text-xs mb-3">{t("Just need a pickup?", "¿Solo necesitas una recogida?")}</p>
              <Link to="/schedule-pickup">
                <Mag as="div" strength={0.2}
                  className="inline-flex items-center gap-2 border border-slate-200 text-slate-600 rounded-full px-6 py-2.5 text-xs font-bold uppercase tracking-wider hover:border-primary/30 hover:text-primary hover:bg-primary/5 transition-all duration-200 cursor-pointer">
                  🚚 {t("Schedule without account →", "Programa sin cuenta →")}
                </Mag>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  </>);
}