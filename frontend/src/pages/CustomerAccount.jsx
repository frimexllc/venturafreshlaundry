import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import {
  User, Mail, MapPin, Package, LogOut, Calendar, Clock,
  ArrowRight, Sparkles, ChevronDown, Settings, Shield, Heart, Award,
  CreditCard, Building2, DollarSign, ScanLine, Upload
} from "lucide-react";
import PublicNav from "../components/PublicNav";
import PublicFooter from "../components/PublicFooter";
import { useLocale } from "../context/LocaleContext";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const statusConfig = {
  new:             { label: { en: "New",             es: "Nueva"      }, cls: "bg-blue-50 text-blue-600 border-blue-200/60" },
  processing:      { label: { en: "Processing",      es: "Procesando" }, cls: "bg-amber-50 text-amber-600 border-amber-200/60" },
  ready:           { label: { en: "Ready",           es: "Lista"      }, cls: "bg-violet-50 text-violet-600 border-violet-200/60" },
  out_for_delivery:{ label: { en: "Out for Delivery",es: "En camino"  }, cls: "bg-orange-50 text-orange-600 border-orange-200/60" },
  delivered:       { label: { en: "Delivered",       es: "Entregada"  }, cls: "bg-emerald-50 text-emerald-600 border-emerald-200/60" },
  completed:       { label: { en: "Completed",       es: "Completada" }, cls: "bg-emerald-50 text-emerald-600 border-emerald-200/60" },
  cancelled:       { label: { en: "Cancelled",       es: "Cancelada"  }, cls: "bg-red-50 text-red-600 border-red-200/60" },
};

// ─── IntersectionObserver hook with threshold ────────────────────────────────
function useInView(threshold = 0.1) {
  const ref = useRef(null);
  const [v, setV] = useState(false);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setV(true); obs.disconnect(); } }, { threshold });
    obs.observe(el); return () => obs.disconnect();
  }, []);
  return [ref, v];
}

// ─── Reveal with custom direction and delay ─────────────────────────────────
const ORIGINS = { up: "opacity-0 translate-y-8", left: "opacity-0 translate-x-6", right: "opacity-0 -translate-x-6", scale: "opacity-0 scale-95", blur: "opacity-0 blur-sm scale-97" };
const Reveal = ({ children, delay = 0, dir = "up", dur = 650, className = "" }) => {
  const [ref, v] = useInView();
  return (
    <div ref={ref} className={`${className} transition-all ease-out ${v ? "opacity-100 translate-y-0 translate-x-0 scale-100 blur-0" : ORIGINS[dir]}`}
      style={{ transitionDuration: `${dur}ms`, transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  );
};

// ─── Magnetic wrapper (subtle movement) ─────────────────────────────────────
const Mag = ({ children, className = "", strength = 0.28, as: Tag = "div", ...p }) => {
  const ref = useRef(null);
  const onMove = useCallback((e) => {
    const r = ref.current.getBoundingClientRect();
    ref.current.style.transform = `translate(${(e.clientX - r.left - r.width / 2) * strength}px,${(e.clientY - r.top - r.height / 2) * strength}px)`;
  }, [strength]);
  const onLeave = useCallback(() => { ref.current.style.transform = "translate(0,0)"; }, []);
  return <Tag ref={ref} className={className} style={{ transition: "transform 500ms cubic-bezier(0.34,1.56,0.64,1)" }} onMouseMove={onMove} onMouseLeave={onLeave} {...p}>{children}</Tag>;
};

// ─── Tilt effect for cards ───────────────────────────────────────────────────
const Tilt = ({ children, className = "", depth = 4 }) => {
  const ref = useRef(null); const [s, setS] = useState({});
  const onMove = useCallback((e) => {
    const r = ref.current.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width - 0.5) * depth * 2;
    const y = ((e.clientY - r.top) / r.height - 0.5) * -depth * 2;
    setS({ transform: `perspective(900px) rotateX(${y}deg) rotateY(${x}deg) translateZ(6px)`, transition: "transform 80ms linear" });
  }, [depth]);
  const onLeave = useCallback(() => setS({ transform: "perspective(900px) rotateX(0) rotateY(0) translateZ(0)", transition: "transform 600ms cubic-bezier(0.34,1.56,0.64,1)" }), []);
  return <div ref={ref} style={s} className={className} onMouseMove={onMove} onMouseLeave={onLeave}>{children}</div>;
};

// ─── Custom Cursor (visible on desktop) ─────────────────────────────────────
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

// ─── Styled Input / Textarea ────────────────────────────────────────────────
const inputCls = "w-full border border-slate-200 bg-white rounded-xl px-4 py-3 text-sm text-slate-800 placeholder-slate-300 focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition-all duration-200 mt-1.5";
const Field = ({ label, children }) => (
  <div>
    <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{label}</label>
    {children}
  </div>
);

// ─── Enhanced Card with glassmorphism effect ─────────────────────────────────
const Card = ({ children, className = "", hover = false, glass = false }) => {
  const [h, setH] = useState(false);
  const base = glass ? "bg-white/70 backdrop-blur-sm border-white/30" : "bg-white";
  return (
    <div
      className={`relative rounded-2xl border overflow-hidden transition-all duration-350 ${base} ${hover ? (h ? "border-primary/25 shadow-xl shadow-primary/5 scale-[1.01]" : "border-slate-100 shadow-lg") : "border-slate-100 shadow-lg"} ${className}`}
      onMouseEnter={() => hover && setH(true)} onMouseLeave={() => hover && setH(false)}>
      {hover && <div className={`absolute top-0 left-6 right-6 h-px bg-gradient-to-r from-transparent via-primary to-transparent transition-opacity duration-500 ${h ? "opacity-100" : "opacity-0"}`} />}
      {hover && <div className={`absolute inset-0 bg-gradient-to-br from-sky-50/30 to-transparent transition-opacity duration-500 pointer-events-none ${h ? "opacity-100" : "opacity-0"}`} />}
      <div className="relative">{children}</div>
    </div>
  );
};

// ─── Loading skeleton for preferences ────────────────────────────────────────
const PreferencesSkeleton = () => (
  <div className="space-y-5 animate-pulse">
    <div className="grid sm:grid-cols-3 gap-4">
      {[1,2,3].map(i => <div key={i} className="h-[70px] bg-slate-100 rounded-xl" />)}
    </div>
    <div className="grid sm:grid-cols-3 gap-4">
      {[1,2,3].map(i => <div key={i} className="h-[70px] bg-slate-100 rounded-xl" />)}
    </div>
    <div className="grid sm:grid-cols-3 gap-4">
      {[1,2,3].map(i => <div key={i} className="h-[70px] bg-slate-100 rounded-xl" />)}
    </div>
    <div className="h-[100px] bg-slate-100 rounded-xl" />
    <div className="h-[100px] bg-slate-100 rounded-xl" />
    <div className="h-[70px] bg-slate-100 rounded-xl" />
  </div>
);

// ─── MAIN ─────────────────────────────────────────────────────────────────────
export default function CustomerAccount() {
  const { t, locale } = useLocale();
  const navigate = useNavigate();
  const { ring, dot } = useCursor();

  const [customer, setCustomer] = useState(null);
  const [orders, setOrders] = useState([]);
  const [pendingPayments, setPendingPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [scrollY, setScrollY] = useState(0);
  const [prefOpen, setPrefOpen] = useState(true);
  const [hasMembership, setHasMembership] = useState(false);
  const [membershipPlan, setMembershipPlan] = useState(null);
  const [payingOrderId, setPayingOrderId] = useState(null);
  const [uploadingReceipt, setUploadingReceipt] = useState(null); // { orderId, loading }

  // State for preferences (all fields)
  const [preferences, setPreferences] = useState({
    detergent_type: "",
    water_temperature: "",
    fabric_softener: "",
    dryer_sheets: "",
    bleach: "",
    drying: "",
    folding_style: "",
    special_care: "",
    garment_separation: "",
    hanging_instructions: "",
    allergies: "",
    special_instructions: "",
    pickup_time_preference: "",
    gate_code: ""
  });
  const [preferencesMeta, setPreferencesMeta] = useState({ updated_at: null, version: null });
  const [preferencesLoading, setPreferencesLoading] = useState(false);

  const statusLabel = (s) => {
    const cfg = statusConfig[s];
    if (!cfg) return s;
    return locale === "es" ? cfg.label.es : cfg.label.en;
  };
  const statusCls = (s) => statusConfig[s]?.cls || "bg-slate-100 text-slate-600 border-slate-200";

  const paymentStatusLabel = (s) => {
    const map = {
      unpaid: { en: "Unpaid", es: "Sin pagar", cls: "bg-red-50 text-red-600 border-red-200" },
      pending_verification: { en: "Pending", es: "Pendiente", cls: "bg-amber-50 text-amber-600 border-amber-200" },
      paid: { en: "Paid", es: "Pagado", cls: "bg-emerald-50 text-emerald-600 border-emerald-200" },
    };
    const cfg = map[s] || map.unpaid;
    return { label: locale === "es" ? cfg.es : cfg.en, cls: cfg.cls };
  };

  // Parallax effect on scroll
  useEffect(() => {
    let ticking = false;
    const handleScroll = () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          setScrollY(window.pageYOffset);
          ticking = false;
        });
        ticking = true;
      }
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Auth and data fetching
  useEffect(() => {
    const token = localStorage.getItem("customer_token");
    const customerData = localStorage.getItem("customer_data");
    if (!token) { navigate("/account/login"); return; }
    if (customerData) setCustomer(JSON.parse(customerData));

    // Check if returning from Stripe payment
    const params = new URLSearchParams(window.location.search);
    const paidOrderId = params.get("paid");
    if (paidOrderId) {
      fetch(`${API}/customer/order/${paidOrderId}/confirm-payment`, { method: "POST" })
        .then(() => {
          toast.success(t("Payment confirmed!", "¡Pago confirmado!"));
          window.history.replaceState({}, "", "/account");
          const freshToken = localStorage.getItem("customer_token");
          if (freshToken) {
            fetchOrders(freshToken);
            fetchPendingPayments(freshToken);
          }
        })
        .catch(() => {});
    }

    fetchOrders(token);
    fetchPendingPayments(token);
    // Fetch membership first; only load preferences if customer has one
    fetchMembershipStatus(token).then((hasMem) => {
      if (hasMem) fetchPreferences(token);
    });
  }, [navigate]);

  const fetchOrders = async (token) => {
    try {
      const res = await axios.get(`${API}/customer/orders`, { headers: { Authorization: `Bearer ${token}` } });
      setOrders(res.data || []);
    } catch (err) {
      if (err.response?.status === 401) handleLogout();
    } finally {
      setLoading(false);
    }
  };

  const fetchPendingPayments = async (token) => {
    try {
      const res = await axios.get(`${API}/customer/pending-payments`, { headers: { Authorization: `Bearer ${token}` } });
      setPendingPayments((res.data || []).filter(o => o.total_amount > 0));
    } catch (err) { /* silent */ }
  };

  // Returns boolean so callers can chain logic
  const fetchMembershipStatus = async (token) => {
    try {
      const res = await axios.get(`${API}/customer/membership-status`, { headers: { Authorization: `Bearer ${token}` } });
      const hasMem = res.data?.has_membership || false;
      setHasMembership(hasMem);
      setMembershipPlan(res.data?.membership_plan || null);
      return hasMem;
    } catch (err) { /* silent */ }
    return false;
  };

  const fetchPreferences = async (token) => {
    setPreferencesLoading(true);
    try {
      const res = await axios.get(`${API}/customer/preferences`, { headers: { Authorization: `Bearer ${token}` } });
      const d = res.data || {};
      setPreferences({
        detergent_type: d.detergent_type || "",
        water_temperature: d.water_temperature || "",
        fabric_softener: d.fabric_softener || "",
        dryer_sheets: d.dryer_sheets || "",
        bleach: d.bleach || "",
        drying: d.drying || "",
        folding_style: d.folding_style || "",
        special_care: d.special_care || "",
        garment_separation: d.garment_separation || "",
        hanging_instructions: d.hanging_instructions || "",
        allergies: d.allergies || "",
        special_instructions: d.special_instructions || "",
        pickup_time_preference: d.pickup_time_preference || "",
        gate_code: d.gate_code || "",
      });
      setPreferencesMeta({ updated_at: d.updated_at || null, version: d.version || null });
    } catch (err) {
      // 404 = no prefs saved yet (normal), 403 = no membership (shouldn't happen here)
      if (err.response?.status !== 404 && err.response?.status !== 403) {
        toast.error(t("Could not load preferences", "No se pudieron cargar las preferencias"));
      }
    } finally {
      setPreferencesLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("customer_token");
    localStorage.removeItem("customer_data");
    toast.success(t("Signed out successfully", "Sesión cerrada correctamente"));
    navigate("/account/login");
  };

  const handleSavePreferences = async () => {
    const token = localStorage.getItem("customer_token"); if (!token) return;
    try {
      const res = await axios.post(`${API}/customer/preferences`, preferences, { headers: { Authorization: `Bearer ${token}` } });
      toast.success(t("Preferences saved", "Preferencias guardadas"));
      setPreferencesMeta({ updated_at: res.data.updated_at || null, version: res.data.version || null });
    } catch (err) {
      const detail = err.response?.data?.detail;
      if (err.response?.status === 403) {
        toast.error(t("Active membership required", "Se requiere membresía activa"));
      } else {
        toast.error(detail || t("Could not save preferences", "No se pudieron guardar las preferencias"));
      }
    }
  };

  const handleDeletePreferences = async () => {
    const token = localStorage.getItem("customer_token"); if (!token) return;
    try {
      await axios.delete(`${API}/customer/preferences`, { headers: { Authorization: `Bearer ${token}` } });
      toast.success(t("Preferences deleted", "Preferencias eliminadas"));
      setPreferences({
        detergent_type: "", water_temperature: "", fabric_softener: "", dryer_sheets: "", bleach: "", drying: "",
        folding_style: "", special_care: "", garment_separation: "", hanging_instructions: "", allergies: "",
        special_instructions: "", pickup_time_preference: "", gate_code: "",
      });
      setPreferencesMeta({ updated_at: null, version: null });
    } catch (err) {
      toast.error(err.response?.data?.detail || t("Could not delete preferences", "No se pudieron eliminar las preferencias"));
    }
  };

  // Pago con tarjeta (Stripe)
  const handlePayStripe = async (orderId) => {
    const token = localStorage.getItem("customer_token"); if (!token) return;
    setPayingOrderId(orderId);
    try {
      const res = await axios.post(`${API}/customer/order/${orderId}/checkout-auth`, {}, { headers: { Authorization: `Bearer ${token}` } });
      if (res.data?.url) window.location.href = res.data.url;
      else toast.error(t("Could not create payment session", "No se pudo crear la sesión de pago"));
    } catch (err) {
      toast.error(err.response?.data?.detail || t("Payment error", "Error de pago"));
    } finally {
      setPayingOrderId(null);
    }
  };

  // Marcar pago con Zelle / Venmo / CashApp (envía a verificación manual)
  const handlePayZelle = async (orderId) => {
    const token = localStorage.getItem("customer_token"); if (!token) return;
    try {
      await axios.post(`${API}/customer/order/${orderId}/mark-zelle`, {}, { headers: { Authorization: `Bearer ${token}` } });
      toast.success(t("Payment submitted for verification", "Pago enviado para verificación"));
      const freshToken = localStorage.getItem("customer_token");
      if (freshToken) {
        fetchPendingPayments(freshToken);
        fetchOrders(freshToken);
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || t("Error", "Error"));
    }
  };

  // Carga de comprobante con OCR
  const handleUploadReceipt = async (orderId, expectedAmount) => {
    const token = localStorage.getItem("customer_token");
    if (!token) return;

    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/jpeg,image/png,image/webp";
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      setUploadingReceipt({ orderId, loading: true });
      const formData = new FormData();
      formData.append("file", file);

      try {
        // 1. Subir imagen al endpoint de cliente
        const uploadRes = await axios.post(`${API}/customer/upload-receipt`, formData, {
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "multipart/form-data" },
          params: { context: `payment:${orderId}` },
        });
        const fileId = uploadRes.data.id;

        // 2. Ejecutar OCR con el endpoint de cliente
        const ocrRes = await axios.post(`${API}/customer/ocr-receipt/${fileId}`, {}, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const extractedAmount = ocrRes.data.amount;

        // 3. Comparar montos (tolerancia $0.01)
        if (Math.abs(extractedAmount - expectedAmount) <= 0.01) {
          await axios.post(`${API}/customer/order/${orderId}/mark-zelle`, {}, {
            headers: { Authorization: `Bearer ${token}` },
          });
          toast.success(t(
            "Payment verified automatically! Order marked as paid.",
            "¡Pago verificado automáticamente! Orden marcada como pagada."
          ));
          const freshToken = localStorage.getItem("customer_token");
          if (freshToken) {
            await fetchPendingPayments(freshToken);
            await fetchOrders(freshToken);
          }
        } else {
          toast.error(t(
            `Amount mismatch: expected $${Number(expectedAmount).toFixed(2)}, got $${Number(extractedAmount).toFixed(2)}`,
            `Monto incorrecto: se esperaba $${Number(expectedAmount).toFixed(2)}, se obtuvo $${Number(extractedAmount).toFixed(2)}`
          ));
        }
      } catch (err) {
        console.error("Receipt upload error:", err);
        const detail = err.response?.data?.detail;
        toast.error(detail || t("Error processing receipt", "Error al procesar el comprobante"));
      } finally {
        setUploadingReceipt(null);
      }
    };
    input.click();
  };

  const setPref = (k, v) => setPreferences(p => ({ ...p, [k]: v }));

  const formatDate = (ds) => {
    if (!ds) return "";
    return new Date(ds).toLocaleDateString(locale === "es" ? "es-ES" : "en-US", { year: "numeric", month: "long", day: "numeric" });
  };

  if (loading) return (
    <div className="min-h-screen bg-white">
      <PublicNav />
      <div className="pt-40 flex items-center justify-center">
        <div className="w-10 h-10 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
      </div>
    </div>
  );

  const firstName = customer?.name?.split(" ")[0] || t("Customer", "Cliente");

  return (<>
    {/* Custom cursor */}
    <div className="pointer-events-none fixed inset-0 z-[9999] hidden lg:block">
      <div ref={ring} className="absolute w-9 h-9 rounded-full border border-primary/50 will-change-transform" style={{ top: 0, left: 0 }} />
      <div ref={dot}  className="absolute w-1.5 h-1.5 rounded-full bg-primary will-change-transform" style={{ top: 0, left: 0 }} />
    </div>

    <style>{`
      @keyframes fadeUp { from { opacity:0; transform:translateY(16px) } to { opacity:1; transform:translateY(0) } }
      @keyframes float { 0% { transform: translateY(0px); } 50% { transform: translateY(-8px); } 100% { transform: translateY(0px); } }
      .float-animation { animation: float 4s ease-in-out infinite; }
    `}</style>

    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-sky-50/30 overflow-x-hidden">
      <PublicNav />

      {/* ══ HERO SECTION with enhanced parallax and glass effect ────────────── */}
      <section className="relative overflow-hidden pt-24 pb-32">
        <div className="absolute inset-0 will-change-transform"
          style={{
            backgroundImage: "url('https://images.unsplash.com/photo-1545173168-9f1947eebb7f?w=1920&h=600&fit=crop')",
            backgroundSize: "cover",
            backgroundPosition: "center 30%",
            transform: `translateY(${scrollY * 0.15}px) scale(1.06)`,
            opacity: 0.7
          }} />
        <div className="absolute inset-0 bg-gradient-to-b from-sky-950/90 via-sky-900/80 to-transparent" />
        <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: "radial-gradient(rgba(255,255,255,0.8) 1px,transparent 1px)", backgroundSize: "28px 28px" }} />

        <div className="relative z-10 max-w-4xl mx-auto px-6 sm:px-8 pt-16">
          <div style={{ animation: "fadeUp 0.8s 0.1s both ease-out" }}>
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 backdrop-blur-md border border-white/20 mb-6 shadow-lg">
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              <span className="text-[11px] text-white/80 font-bold uppercase tracking-[0.18em]">{t("My Account", "Mi Cuenta")}</span>
            </div>
          </div>
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-light text-white mb-2 leading-tight"
            style={{ animation: "fadeUp 0.9s 0.2s both ease-out" }}>
            {t("Hi,", "Hola,")}
            <span className="ml-3 bg-gradient-to-r from-white to-sky-200 bg-clip-text text-transparent" style={{ WebkitTextStroke: "1px rgba(255,255,255,0.3)" }}>
              {firstName}
            </span>
          </h1>
          <p className="text-white/60 text-lg" style={{ animation: "fadeUp 0.9s 0.35s both ease-out" }}>
            {customer?.email}
          </p>
        </div>

        <div className="absolute bottom-0 left-0 right-0 z-20">
          <svg viewBox="0 0 1440 70" preserveAspectRatio="none" className="w-full h-10 sm:h-14">
            <path d="M0,35 C360,0 720,70 1440,35 L1440,70 L0,70 Z" fill="#f8fafc" />
          </svg>
        </div>
      </section>
      <br /><br />

      {/* ══ MAIN CONTENT ────────────────────────────────────────────────────── */}
      <div className="max-w-4xl mx-auto px-6 sm:px-8 pb-24 -mt-10 space-y-6 relative z-10">

        {/* Profile header card */}
        <Reveal dir="up" delay={0}>
          <Tilt depth={2}>
            <Card hover glass>
              <div className="px-7 py-6 flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-4 flex-1 min-w-0">
                  <div className="relative flex-shrink-0">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-sky-400 to-primary flex items-center justify-center shadow-xl shadow-primary/25 float-animation">
                      <span className="text-white text-xl font-black">{firstName[0]?.toUpperCase()}</span>
                    </div>
                    <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-emerald-400 rounded-full border-2 border-white shadow-md" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-slate-800 text-lg break-words">
                      {customer?.name}
                      <Heart className="w-3.5 h-3.5 text-rose-400 fill-rose-400 inline-block ml-1.5 align-middle" />
                    </div>
                    <p className="text-slate-400 text-sm break-words">{customer?.email}</p>
                  </div>
                </div>
                <button onClick={handleLogout} data-testid="customer-logout-btn"
                  className="group flex items-center gap-2 px-5 py-2.5 rounded-full border border-slate-200 text-slate-500 text-sm font-semibold hover:border-red-200 hover:text-red-500 hover:bg-red-50 transition-all duration-300 shadow-sm hover:shadow flex-shrink-0">
                  <LogOut className="h-4 w-4 transition-transform duration-200 group-hover:-translate-x-0.5" />
                  {t("Sign out", "Cerrar sesión")}
                </button>
              </div>
            </Card>
          </Tilt>
        </Reveal>

        {/* Membership upsell for non-members */}
        {!hasMembership && (
          <Reveal delay={120} dir="up">
            <Card hover className="overflow-hidden">
              <div className="px-7 py-6 flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-violet-400 to-purple-500 rounded-xl flex items-center justify-center shadow-md">
                    <Award className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <h2 className="font-bold text-slate-800 text-base">{t("Upgrade to Membership", "Obtén una Membresía")}</h2>
                    <p className="text-xs text-slate-400">{t("Unlock laundry preferences & exclusive benefits", "Desbloquea preferencias de lavado y beneficios exclusivos")}</p>
                  </div>
                </div>
                <Link to="/membership">
                  <Mag as="div" strength={0.2}
                    className="inline-flex items-center gap-1.5 bg-gradient-to-r from-violet-500 to-purple-600 text-white rounded-full px-5 py-2.5 text-xs font-bold uppercase tracking-wider shadow-md hover:shadow-lg transition-all duration-300 cursor-pointer active:scale-95"
                    data-testid="membership-upsell-btn">
                    {t("View Plans", "Ver Planes")}
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Mag>
                </Link>
              </div>
            </Card>
          </Reveal>
        )}

        {/* Quick stats row */}
        <div className="grid grid-cols-3 gap-5">
          {[
            { icon: Package,  value: orders.length,    label: t("Orders", "Órdenes"), color: "from-sky-400 to-primary" },
            { icon: Calendar, value: orders.filter(o => ["new","processing"].includes(o.status)).length, label: t("Active", "Activas"), color: "from-amber-400 to-orange-500" },
            { icon: Shield,   value: orders.filter(o => o.status === "completed").length, label: t("Done", "Completadas"), color: "from-emerald-400 to-teal-500" },
          ].map((s, i) => (
            <Reveal key={i} delay={i * 80} dir="up">
              <Tilt depth={3}>
                <Card hover className="transition-all duration-300 hover:scale-[1.02]">
                  <div className="px-5 py-5 text-center">
                    <div className={`w-10 h-10 bg-gradient-to-br ${s.color} rounded-xl flex items-center justify-center mx-auto mb-3 shadow-md`}>
                      <s.icon className="h-5 w-5 text-white" />
                    </div>
                    <p className="text-3xl font-black text-slate-800">{s.value}</p>
                    <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">{s.label}</p>
                  </div>
                </Card>
              </Tilt>
            </Reveal>
          ))}
        </div>

        {/* ══ PENDING PAYMENTS SECTION ════════════════════════════════════ */}
        {pendingPayments.length > 0 && (
          <Reveal delay={100} dir="up">
            <Card hover className="overflow-hidden border-amber-200/60">
              <div className="px-7 py-5 flex items-center gap-3 border-b border-amber-100 bg-amber-50/30">
                <div className="w-10 h-10 bg-gradient-to-br from-amber-400 to-orange-500 rounded-xl flex items-center justify-center shadow-md">
                  <CreditCard className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h2 className="font-bold text-slate-800 text-lg" data-testid="pending-payments-title">
                    {t("Pending Payments", "Pagos Pendientes")}
                  </h2>
                  <p className="text-xs text-slate-400">{pendingPayments.length} {t("orders pending", "órdenes pendientes")}</p>
                </div>
              </div>
              <div className="px-7 py-5 space-y-4">
                {pendingPayments.map((order) => (
                  <div key={order.id} className="rounded-2xl border border-slate-100 bg-white p-5 space-y-4 hover:border-primary/20 hover:shadow-md transition-all duration-300" data-testid={`pending-order-${order.order_number}`}>
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div>
                        <span className="font-bold text-slate-800 text-sm">{order.order_number}</span>
                        <span className={`ml-2 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest border ${paymentStatusLabel(order.payment_status).cls}`}>
                          {paymentStatusLabel(order.payment_status).label}
                        </span>
                      </div>
                      <span className="font-black text-primary text-xl">${Number(order.total_amount || 0).toFixed(2)}</span>
                    </div>

                    {order.service_type && (
                      <p className="text-xs text-slate-400 capitalize">{order.service_type.replace(/_/g, " ")}</p>
                    )}

                    {order.payment_status === "pending_verification" ? (
                      <div className="bg-amber-50 rounded-xl border border-amber-200 p-3 text-xs text-amber-700 font-medium">
                        {t("Payment submitted — waiting for verification by our team.", "Pago enviado — esperando verificación de nuestro equipo.")}
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                        {/* Stripe */}
                        <button
                          onClick={() => handlePayStripe(order.id)}
                          disabled={payingOrderId === order.id}
                          className="flex items-center justify-center gap-2 bg-sky-600 hover:bg-sky-700 text-white rounded-xl px-4 py-3 text-sm font-semibold transition-all duration-200 disabled:opacity-50"
                        >
                          {payingOrderId === order.id ? (
                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <CreditCard className="h-4 w-4" />
                          )}
                          {t("Card", "Tarjeta")}
                        </button>

                        {/* Zelle */}
                        <button
                          onClick={() => handlePayZelle(order.id)}
                          className="flex items-center justify-center gap-2 text-white rounded-xl px-4 py-3 text-sm font-semibold transition-all duration-200 hover:brightness-110 active:scale-95"
                          style={{ backgroundColor: "#6D1ED4" }}
                        >
                          <Building2 className="h-4 w-4" />
                          Zelle
                        </button>

                        {/* Venmo */}
                        <button
                          onClick={() => handlePayZelle(order.id)}
                          className="flex items-center justify-center gap-2 text-white rounded-xl px-4 py-3 text-sm font-semibold transition-all duration-200 hover:brightness-110 active:scale-95"
                          style={{ backgroundColor: "#0074DE" }}
                        >
                          <DollarSign className="h-4 w-4" />
                          Venmo
                        </button>

                        {/* CashApp */}
                        <button
                          onClick={() => handlePayZelle(order.id)}
                          className="flex items-center justify-center gap-2 text-black rounded-xl px-4 py-3 text-sm font-semibold transition-all duration-200 hover:brightness-110 active:scale-95"
                          style={{ backgroundColor: "#00E013" }}
                        >
                          <DollarSign className="h-4 w-4" />
                          CashApp
                        </button>

                        {/* Upload receipt (OCR) */}
                        <button
                          onClick={() => handleUploadReceipt(order.id, order.total_amount)}
                          disabled={uploadingReceipt?.orderId === order.id}
                          className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl px-4 py-3 text-sm font-semibold transition-all duration-200 disabled:opacity-50"
                        >
                          {uploadingReceipt?.orderId === order.id ? (
                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <ScanLine className="h-4 w-4" />
                          )}
                          {t("Receipt", "Comprobante")}
                        </button>
                      </div>
                    )}

                    {order.payment_status !== "pending_verification" && (
                      <div className="bg-slate-50 rounded-xl p-3 text-xs text-slate-500">
                        <p className="font-semibold text-slate-600 mb-1">{t("Payment instructions:", "Instrucciones de pago:")}</p>
                        <p>
                          {t("Send", "Envía")} <strong>${Number(order.total_amount || 0).toFixed(2)}</strong>{" "}
                          {t("to", "a")} <span className="font-mono font-bold text-slate-700">(805) 626-2524 (Zelle) / @TuUsuarioVenmo / $TuCashApp</span>
                        </p>
                        <p className="mt-0.5">{t("Include order #", "Incluye # de orden")}: <strong>{order.order_number}</strong></p>
                        <p className="mt-1 text-amber-600">{t("Or upload a receipt to get instant verification", "O sube un comprobante para verificación instantánea")}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          </Reveal>
        )}

        {/* Preferences section — ONLY for members */}
        {hasMembership && (
          <Reveal delay={120} dir="up">
            <Card hover data-testid="customer-preferences-card" className="overflow-hidden">
              <button onClick={() => setPrefOpen(p => !p)}
                className="w-full px-7 py-5 flex items-center justify-between text-left focus:outline-none group transition-all duration-300">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center group-hover:bg-primary/15 transition-colors duration-200">
                    <Settings className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h2 className="font-bold text-slate-800 text-lg group-hover:text-primary transition-colors duration-200">
                      {t("Laundry Preferences", "Preferencias de lavandería")}
                    </h2>
                    {membershipPlan && (
                      <p className="text-[11px] text-primary font-semibold flex items-center gap-1" data-testid="customer-membership-badge">
                        <Award className="h-3 w-3" /> {membershipPlan}
                      </p>
                    )}
                    {preferencesMeta.updated_at && (
                      <p className="text-[11px] text-slate-400" data-testid="customer-preferences-updated">
                        {t("Updated", "Actualizado")}: {formatDate(preferencesMeta.updated_at)}
                      </p>
                    )}
                  </div>
                </div>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-500 ${prefOpen ? "bg-primary text-white rotate-180" : "bg-slate-100 text-slate-400 group-hover:bg-primary/10 group-hover:text-primary"}`}>
                  <ChevronDown className="w-4 h-4" />
                </div>
              </button>

              <div className={`overflow-hidden transition-all duration-500 ease-in-out ${prefOpen ? "max-h-[2500px] opacity-100" : "max-h-0 opacity-0"}`}>
                <div className="px-7 pb-7 border-t border-slate-100">
                  {preferencesLoading ? (
                    <PreferencesSkeleton />
                  ) : (
                    <div className="pt-5 space-y-5">
                      {/* Detergent, Softener, Dryer Sheets */}
                      <div className="grid sm:grid-cols-3 gap-4">
                        <Field label={t("Detergent", "Detergente")}>
                          <Select value={preferences.detergent_type} onValueChange={v => setPref("detergent_type", v)}>
                            <SelectTrigger className="mt-1.5 rounded-xl border-slate-200 text-sm h-[44px] hover:border-primary/30 transition-all focus:ring-2 focus:ring-primary/10" data-testid="customer-pref-detergent">
                              <SelectValue placeholder={t("Select", "Selecciona")} />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Tide Original">Tide Original</SelectItem>
                              <SelectItem value="Tide + Oxi">Tide + Oxi</SelectItem>
                              <SelectItem value="Gain Original">Gain Original</SelectItem>
                              <SelectItem value="Gain + Aroma Boost">Gain + Aroma Boost</SelectItem>
                              <SelectItem value="Arm & Hammer">Arm & Hammer</SelectItem>
                              <SelectItem value="Persil ProClean">Persil ProClean</SelectItem>
                              <SelectItem value="Foca">Foca</SelectItem>
                              <SelectItem value="Roma">Roma</SelectItem>
                              <SelectItem value="Ariel">Ariel</SelectItem>
                              <SelectItem value="OxiClean">OxiClean</SelectItem>
                              <SelectItem value="No Preference">{t("No Preference", "Sin preferencia")}</SelectItem>
                            </SelectContent>
                          </Select>
                        </Field>
                        <Field label={t("Fabric softener", "Suavizante")}>
                          <Select value={preferences.fabric_softener} onValueChange={v => setPref("fabric_softener", v)}>
                            <SelectTrigger className="mt-1.5 rounded-xl border-slate-200 text-sm h-[44px] hover:border-primary/30 transition-all" data-testid="customer-pref-softener">
                              <SelectValue placeholder={t("Select", "Selecciona")} />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Downy Original">Downy Original</SelectItem>
                              <SelectItem value="Downy Ultra">Downy Ultra</SelectItem>
                              <SelectItem value="Snuggle Blue Sparkle">Snuggle Blue Sparkle</SelectItem>
                              <SelectItem value="Suavitel Field Flowers">Suavitel Field Flowers</SelectItem>
                              <SelectItem value="Suavitel Morning Sun">Suavitel Morning Sun</SelectItem>
                              <SelectItem value="Gain Softener">Gain Softener</SelectItem>
                              <SelectItem value="Bounce Liquid Softener">Bounce Liquid Softener</SelectItem>
                              <SelectItem value="No Softener">{t("No Softener", "Sin suavizante")}</SelectItem>
                              <SelectItem value="No Preference">{t("No Preference", "Sin preferencia")}</SelectItem>
                            </SelectContent>
                          </Select>
                        </Field>
                        <Field label={t("Dryer sheets", "Hojas de secadora")}>
                          <Select value={preferences.dryer_sheets} onValueChange={v => setPref("dryer_sheets", v)}>
                            <SelectTrigger className="mt-1.5 rounded-xl border-slate-200 text-sm h-[44px] hover:border-primary/30 transition-all" data-testid="customer-pref-dryer-sheets">
                              <SelectValue placeholder={t("Select", "Selecciona")} />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Bounce Original">Bounce Original</SelectItem>
                              <SelectItem value="Gain Dryer Sheets">Gain Dryer Sheets</SelectItem>
                              <SelectItem value="Snuggle Dryer Sheets">Snuggle Dryer Sheets</SelectItem>
                              <SelectItem value="Downy Dryer Sheets">Downy Dryer Sheets</SelectItem>
                              <SelectItem value="Suavitel Dryer Sheets">Suavitel Dryer Sheets</SelectItem>
                              <SelectItem value="No Dryer Sheets">{t("No Dryer Sheets", "Sin hojas")}</SelectItem>
                              <SelectItem value="No Preference">{t("No Preference", "Sin preferencia")}</SelectItem>
                            </SelectContent>
                          </Select>
                        </Field>
                      </div>

                      {/* Bleach, Water Temp, Drying */}
                      <div className="grid sm:grid-cols-3 gap-4">
                        <Field label={t("Bleach", "Blanqueador")}>
                          <Select value={preferences.bleach} onValueChange={v => setPref("bleach", v)}>
                            <SelectTrigger className="mt-1.5 rounded-xl border-slate-200 text-sm h-[44px] hover:border-primary/30 transition-all" data-testid="customer-pref-bleach">
                              <SelectValue placeholder={t("Select", "Selecciona")} />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Clorox Regular Bleach">Clorox Regular Bleach</SelectItem>
                              <SelectItem value="OxiClean">OxiClean</SelectItem>
                              <SelectItem value="Cloralex">Cloralex</SelectItem>
                              <SelectItem value="No Bleach">{t("No Bleach", "Sin blanqueador")}</SelectItem>
                              <SelectItem value="No Preference">{t("No Preference", "Sin preferencia")}</SelectItem>
                            </SelectContent>
                          </Select>
                        </Field>
                        <Field label={t("Water temp", "Temperatura del agua")}>
                          <Select value={preferences.water_temperature} onValueChange={v => setPref("water_temperature", v)}>
                            <SelectTrigger className="mt-1.5 rounded-xl border-slate-200 text-sm h-[44px] hover:border-primary/30 transition-all" data-testid="customer-pref-temperature">
                              <SelectValue placeholder={t("Select", "Selecciona")} />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Cold">{t("Cold", "Fría")}</SelectItem>
                              <SelectItem value="Warm">{t("Warm", "Tibia")}</SelectItem>
                              <SelectItem value="Hot">{t("Hot", "Caliente")}</SelectItem>
                              <SelectItem value="No Preference">{t("No Preference", "Sin preferencia")}</SelectItem>
                            </SelectContent>
                          </Select>
                        </Field>
                        <Field label={t("Drying", "Secado")}>
                          <Select value={preferences.drying} onValueChange={v => setPref("drying", v)}>
                            <SelectTrigger className="mt-1.5 rounded-xl border-slate-200 text-sm h-[44px] hover:border-primary/30 transition-all" data-testid="customer-pref-drying">
                              <SelectValue placeholder={t("Select", "Selecciona")} />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Low Heat">{t("Low Heat", "Temperatura baja")}</SelectItem>
                              <SelectItem value="Medium Heat">{t("Medium Heat", "Temperatura media")}</SelectItem>
                              <SelectItem value="High Heat">{t("High Heat", "Temperatura alta")}</SelectItem>
                              <SelectItem value="No Preference">{t("No Preference", "Sin preferencia")}</SelectItem>
                            </SelectContent>
                          </Select>
                        </Field>
                      </div>

                      {/* Folding, Special Care, Separation */}
                      <div className="grid sm:grid-cols-3 gap-4">
                        <Field label={t("Folding style", "Estilo de doblado")}>
                          <Select value={preferences.folding_style} onValueChange={v => setPref("folding_style", v)}>
                            <SelectTrigger className="mt-1.5 rounded-xl border-slate-200 text-sm h-[44px] hover:border-primary/30 transition-all" data-testid="customer-pref-folding">
                              <SelectValue placeholder={t("Select", "Selecciona")} />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Standard Fold">{t("Standard Fold", "Doblado estándar")}</SelectItem>
                              <SelectItem value="Retail Fold (Store Style)">{t("Retail Fold", "Doblado tipo tienda")}</SelectItem>
                              <SelectItem value="Hanging (Shirts Only)">{t("Hanging (Shirts Only)", "Colgado (solo camisas)")}</SelectItem>
                              <SelectItem value="Fold + Hang Combination">{t("Fold + Hang Combination", "Doblado + colgado")}</SelectItem>
                              <SelectItem value="No Preference">{t("No Preference", "Sin preferencia")}</SelectItem>
                            </SelectContent>
                          </Select>
                        </Field>
                        <Field label={t("Special care", "Cuidado especial")}>
                          <Select value={preferences.special_care} onValueChange={v => setPref("special_care", v)}>
                            <SelectTrigger className="mt-1.5 rounded-xl border-slate-200 text-sm h-[44px] hover:border-primary/30 transition-all" data-testid="customer-pref-special-care">
                              <SelectValue placeholder={t("Select", "Selecciona")} />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Hypoallergenic Only">{t("Hypoallergenic Only", "Solo hipoalergénico")}</SelectItem>
                              <SelectItem value="Baby Safe Products">{t("Baby Safe Products", "Productos seguros para bebé")}</SelectItem>
                              <SelectItem value="No Harsh Chemicals">{t("No Harsh Chemicals", "Sin químicos agresivos")}</SelectItem>
                              <SelectItem value="No Preference">{t("No Preference", "Sin preferencia")}</SelectItem>
                            </SelectContent>
                          </Select>
                        </Field>
                        <Field label={t("Garment separation", "Separación de prendas")}>
                          <Select value={preferences.garment_separation} onValueChange={v => setPref("garment_separation", v)}>
                            <SelectTrigger className="mt-1.5 rounded-xl border-slate-200 text-sm h-[44px] hover:border-primary/30 transition-all" data-testid="customer-pref-separation">
                              <SelectValue placeholder={t("Select", "Selecciona")} />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="No Separation">{t("No Separation", "Sin separación")}</SelectItem>
                              <SelectItem value="Separate by Person (Label Bags by Name)">{t("Separate by Person", "Separar por persona")}</SelectItem>
                              <SelectItem value="Separate by Clothing Type">{t("Separate by Clothing Type", "Separar por tipo de prenda")}</SelectItem>
                              <SelectItem value="Separate by Color (Light / Dark)">{t("Separate by Color", "Separar por color")}</SelectItem>
                              <SelectItem value="No Preference">{t("No Preference", "Sin preferencia")}</SelectItem>
                            </SelectContent>
                          </Select>
                        </Field>
                      </div>

                      {/* Text fields */}
                      <Field label={t("Hanging / special items", "Colgado / prendas especiales")}>
                        <input value={preferences.hanging_instructions} onChange={e => setPref("hanging_instructions", e.target.value)} placeholder={t("e.g. Shirts on hangers", "Ej. Camisas en gancho")} className={inputCls} data-testid="customer-pref-hanging" />
                      </Field>
                      <Field label={t("Allergies or sensitivities", "Alergias o sensibilidades")}>
                        <textarea value={preferences.allergies} onChange={e => setPref("allergies", e.target.value)} rows={3} placeholder={t("e.g. No fragrances", "Ej. Sin fragancias")} className={`${inputCls} resize-none`} data-testid="customer-pref-allergies" />
                      </Field>
                      <Field label={t("Additional notes", "Notas adicionales")}>
                        <textarea value={preferences.special_instructions} onChange={e => setPref("special_instructions", e.target.value)} rows={3} placeholder={t("Special instructions", "Instrucciones especiales")} className={`${inputCls} resize-none`} data-testid="customer-pref-notes" />
                      </Field>

                      <div className="grid sm:grid-cols-2 gap-4">
                        <Field label={t("Preferred pickup time", "Horario preferido de pickup")}>
                          <input value={preferences.pickup_time_preference} onChange={e => setPref("pickup_time_preference", e.target.value)} placeholder={t("e.g. 8am – 12pm", "Ej. 8am – 12pm")} className={inputCls} data-testid="customer-pref-pickup-time" />
                        </Field>
                        <Field label={t("Gate / Access code", "Puerta / Código de acceso")}>
                          <input value={preferences.gate_code} onChange={e => setPref("gate_code", e.target.value)} placeholder={t("e.g. 1234#", "Ej. 1234#")} className={inputCls} data-testid="customer-pref-gate" />
                        </Field>
                      </div>

                      {/* Action buttons */}
                      <div className="flex flex-wrap gap-3 pt-2">
                        <button onClick={handleSavePreferences} data-testid="customer-preferences-save"
                          className="group relative overflow-hidden bg-gradient-to-r from-primary to-sky-500 text-white rounded-xl px-6 py-3 text-sm font-bold uppercase tracking-wider shadow-md hover:shadow-lg transition-all duration-300 active:scale-95">
                          <span className="relative z-10 flex items-center gap-2">
                            {t("Save preferences", "Guardar preferencias")}
                            <ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1" />
                          </span>
                          <span className="absolute inset-0 bg-gradient-to-r from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                        </button>
                        <button onClick={handleDeletePreferences} data-testid="customer-preferences-delete"
                          className="flex items-center gap-2 px-6 py-3 rounded-xl border border-slate-200 text-slate-500 text-sm font-semibold hover:border-red-200 hover:text-red-500 hover:bg-red-50 transition-all duration-200">
                          {t("Delete preferences", "Eliminar preferencias")}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </Card>
          </Reveal>
        )}

        {/* Orders section */}
        <Reveal delay={160} dir="up">
          <Card hover>
            <div className="px-7 py-5 flex items-center justify-between border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center">
                  <Package className="h-5 w-5 text-primary" />
                </div>
                <h2 className="font-bold text-slate-800 text-lg">{t("Orders", "Órdenes")}</h2>
              </div>
              <Link to="/schedule-pickup">
                <Mag as="div" strength={0.2}
                  className="inline-flex items-center gap-1.5 bg-gradient-to-r from-primary to-sky-500 text-white rounded-full px-5 py-2 text-xs font-bold uppercase tracking-wider shadow-md hover:shadow-lg transition-all duration-300 cursor-pointer active:scale-95">
                  + {t("New Pickup", "Nueva recogida")}
                </Mag>
              </Link>
            </div>

            <div className="px-7 py-5">
              {orders.length === 0 ? (
                <div className="text-center py-14">
                  <div className="w-20 h-20 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-inner">
                    <Package className="h-10 w-10 text-slate-300" />
                  </div>
                  <p className="text-slate-500 font-medium mb-2">{t("No orders yet", "Aún no tienes órdenes")}</p>
                  <p className="text-slate-400 text-sm mb-6">{t("Schedule your first pickup to get started.", "Programa tu primera recogida para comenzar.")}</p>
                  <Link to="/schedule-pickup">
                    <Mag as="div" strength={0.2} className="inline-flex items-center gap-2 bg-gradient-to-r from-primary to-sky-500 text-white rounded-full px-8 py-3.5 text-sm font-bold uppercase tracking-wider shadow-lg hover:shadow-xl cursor-pointer hover:-translate-y-0.5 transition-all duration-300 active:scale-95">
                      🚚 {t("Schedule Your First Pickup", "Programa tu primera recogida")}
                    </Mag>
                  </Link>
                </div>
              ) : (
                <div className="space-y-3">
                  {orders.map((order, i) => (
                    <Reveal key={order.id} delay={i * 60} dir="up">
                      <div className="relative flex items-center justify-between flex-wrap gap-3 p-4 rounded-2xl border border-slate-100 hover:border-primary/30 hover:shadow-lg hover:shadow-sky-50 transition-all duration-300 group bg-white overflow-hidden">
                        <div className="absolute inset-0 bg-gradient-to-r from-sky-50/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
                        <div className="relative">
                          <div className="flex items-center gap-3 mb-2 flex-wrap">
                            <span className="font-bold text-slate-800 text-sm">{order.order_number}</span>
                            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest border ${statusCls(order.status)}`}>
                              {statusLabel(order.status)}
                            </span>
                            {order.payment_status && (
                              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest border ${paymentStatusLabel(order.payment_status).cls}`}>
                                {paymentStatusLabel(order.payment_status).label}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-4 text-xs text-slate-400 flex-wrap">
                            <span className="flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" />{order.pickup_date || "TBD"}</span>
                            {order.pickup_time_window && <span className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" />{order.pickup_time_window}</span>}
                            {order.pickup_address && <span className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" />{order.pickup_address.split(",")[0]}</span>}
                          </div>
                        </div>
                        <div className="relative text-right">
                          {order.service_type && <p className="text-xs text-slate-400 mb-0.5 capitalize">{order.service_type.replace("_", " ")}</p>}
                          {order.total_amount != null && (
                            <p className="font-black text-primary text-lg">${Number(order.total_amount).toFixed(2)}</p>
                          )}
                        </div>
                      </div>
                    </Reveal>
                  ))}
                </div>
              )}
            </div>
          </Card>
        </Reveal>

        {/* CTA banner */}
        <Reveal delay={300} dir="scale">
          <div className="relative overflow-hidden bg-gradient-to-br from-sky-950 to-sky-800 rounded-2xl p-8 text-center shadow-xl">
            <div className="absolute inset-0 opacity-[0.08]" style={{ backgroundImage: "radial-gradient(rgba(255,255,255,0.8) 1px,transparent 1px)", backgroundSize: "22px 22px" }} />
            <div className="absolute top-0 left-10 right-10 h-px bg-gradient-to-r from-transparent via-sky-400/70 to-transparent" />
            <Sparkles className="w-8 h-8 text-sky-300 mx-auto mb-4 float-animation" />
            <h3 className="text-xl font-bold text-white mb-1">{t("Ready for your next pickup?", "¿Listo para tu próxima recogida?")}</h3>
            <p className="text-white/60 text-sm mb-6">{t("Schedule in seconds, we'll handle the rest.", "Programa en segundos, nosotros hacemos el resto.")}</p>
            <Link to="/schedule-pickup">
              <Mag as="div" strength={0.22}
                className="inline-flex items-center gap-2 bg-gradient-to-r from-primary to-sky-500 text-white rounded-full px-8 py-3.5 text-sm font-bold uppercase tracking-wider shadow-lg hover:shadow-xl cursor-pointer hover:-translate-y-0.5 transition-all duration-300 active:scale-95 group overflow-hidden relative">
                <span className="relative z-10 flex items-center gap-2">
                  🚚 {t("Schedule Pickup", "Programar Recogida")}
                  <ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1" />
                </span>
                <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/15 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
              </Mag>
            </Link>
          </div>
        </Reveal>

        {/* Profile and Address */}
        <div className="grid sm:grid-cols-2 gap-5">
          <Reveal delay={200} dir="left">
            <Tilt depth={3}>
              <Card hover glass>
                <div className="px-6 py-5">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-9 h-9 bg-primary/10 rounded-xl flex items-center justify-center">
                      <Mail className="h-4 w-4 text-primary" />
                    </div>
                    <h2 className="font-bold text-slate-800 text-sm uppercase tracking-wider">{t("Profile", "Perfil")}</h2>
                  </div>
                  <div className="space-y-2 text-sm">
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">{t("Email", "Correo")}</p>
                      <p className="text-slate-700 font-medium break-words">{customer?.email}</p>
                    </div>
                    {customer?.phone && (
                      <div>
                        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">{t("Phone", "Teléfono")}</p>
                        <p className="text-slate-700 font-medium">{customer.phone}</p>
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            </Tilt>
          </Reveal>

          <Reveal delay={260} dir="right">
            <Tilt depth={3}>
              <Card hover glass>
                <div className="px-6 py-5">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-9 h-9 bg-primary/10 rounded-xl flex items-center justify-center">
                      <MapPin className="h-4 w-4 text-primary" />
                    </div>
                    <h2 className="font-bold text-slate-800 text-sm uppercase tracking-wider">{t("Address", "Dirección")}</h2>
                  </div>
                  {customer?.address
                    ? <p className="text-slate-600 text-sm leading-relaxed break-words">{customer.address}</p>
                    : <p className="text-slate-400 text-sm italic">{t("No address saved", "No hay dirección guardada")}</p>}
                </div>
              </Card>
            </Tilt>
          </Reveal>
        </div>
      </div>

      <PublicFooter />
    </div>
  </>);
}