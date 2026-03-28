import { useState, useEffect, useRef, useCallback } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ShoppingBag, Plus, Minus, Trash2, ShoppingCart, X, ArrowRight, Sparkles
} from "lucide-react";
import PublicNav from "../components/PublicNav";
import PublicFooter from "../components/PublicFooter";
import AddressAutocomplete from "../components/AddressAutocomplete";
import { StorePaymentModal } from "./StorePaymentModal";
import { toast } from "sonner";
import { useLocale } from "../context/LocaleContext";

const API_URL = process.env.REACT_APP_BACKEND_URL;
const DEFAULT_PRODUCT_IMAGE = "https://images.unsplash.com/photo-1582735689369-4fe89db7114c?w=400&h=300&fit=crop";

// ─── IntersectionObserver hook ────────────────────────────────────────────────
function useInView(threshold = 0.08) {
  const ref = useRef(null);
  const [v, setV] = useState(false);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setV(true); obs.disconnect(); } },
      { threshold }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return [ref, v];
}

// ─── Reveal ───────────────────────────────────────────────────────────────────
const ORIGINS = {
  up:    "opacity-0 translate-y-6",
  left:  "opacity-0 translate-x-6",
  right: "opacity-0 -translate-x-6",
  scale: "opacity-0 scale-97",
  blur:  "opacity-0 blur-sm scale-98",
};
const Reveal = ({ children, delay = 0, dir = "up", dur = 350, className = "" }) => {
  const [ref, v] = useInView();
  return (
    <div
      ref={ref}
      className={`${className} transition-all ease-out ${v ? "opacity-100 translate-y-0 translate-x-0 scale-100 blur-0" : ORIGINS[dir]}`}
      style={{ transitionDuration: `${dur}ms`, transitionDelay: v ? `${delay}ms` : "0ms" }}
    >
      {children}
    </div>
  );
};

// ─── Magnetic wrapper ─────────────────────────────────────────────────────────
const Mag = ({ children, className = "", strength = 0.32, as: Tag = "div", ...p }) => {
  const ref = useRef(null);
  const onMove = useCallback((e) => {
    const r = ref.current.getBoundingClientRect();
    ref.current.style.transform = `translate(${(e.clientX - r.left - r.width / 2) * strength}px,${(e.clientY - r.top - r.height / 2) * strength}px)`;
  }, [strength]);
  const onLeave = useCallback(() => { ref.current.style.transform = "translate(0,0)"; }, []);
  return (
    <Tag ref={ref} className={className}
      style={{ transition: "transform 300ms cubic-bezier(0.34,1.56,0.64,1)" }}
      onMouseMove={onMove} onMouseLeave={onLeave} {...p}>
      {children}
    </Tag>
  );
};

// ─── 3-D Tilt (disabled on touch) ────────────────────────────────────────────
const Tilt = ({ children, className = "", depth = 6 }) => {
  const ref = useRef(null);
  const [s, setS] = useState({});
  const [touch, setTouch] = useState(false);
  useEffect(() => { setTouch(window.matchMedia("(hover: none)").matches); }, []);
  const onMove = useCallback((e) => {
    if (touch) return;
    const r = ref.current.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width - 0.5) * depth * 2;
    const y = ((e.clientY - r.top) / r.height - 0.5) * -depth * 2;
    setS({ transform: `perspective(900px) rotateX(${y}deg) rotateY(${x}deg) translateZ(8px)`, transition: "transform 60ms linear" });
  }, [depth, touch]);
  const onLeave = useCallback(() => setS({ transform: "perspective(900px) rotateX(0) rotateY(0) translateZ(0)", transition: "transform 350ms cubic-bezier(0.34,1.56,0.64,1)" }), []);
  return <div ref={ref} style={s} className={className} onMouseMove={onMove} onMouseLeave={onLeave}>{children}</div>;
};

// ─── Custom Cursor (desktop only) ────────────────────────────────────────────
function useCursor() {
  const ring = useRef(null); const dot = useRef(null);
  const p = useRef({ x: -200, y: -200 }); const l = useRef({ x: -200, y: -200 }); const raf = useRef(null);
  useEffect(() => {
    const fn = (e) => { p.current = { x: e.clientX, y: e.clientY }; };
    window.addEventListener("mousemove", fn, { passive: true });
    const loop = () => {
      l.current.x += (p.current.x - l.current.x) * 0.15;
      l.current.y += (p.current.y - l.current.y) * 0.15;
      if (ring.current) ring.current.style.transform = `translate(${l.current.x - 18}px,${l.current.y - 18}px)`;
      if (dot.current)  dot.current.style.transform  = `translate(${p.current.x - 3}px,${p.current.y - 3}px)`;
      raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
    return () => { window.removeEventListener("mousemove", fn); cancelAnimationFrame(raf.current); };
  }, []);
  return { ring, dot };
}

// ─── Marquee ─────────────────────────────────────────────────────────────────
const Marquee = ({ items }) => (
  <div className="overflow-hidden py-3 border-y border-primary/10 bg-sky-50/50">
    <div className="flex gap-8 sm:gap-12 whitespace-nowrap" style={{ animation: "mq 30s linear infinite" }}>
      {[...items, ...items, ...items].map((it, i) => (
        <span key={i} className="text-[10px] sm:text-[11px] font-bold uppercase tracking-[0.2em] text-primary/45 flex items-center gap-2 sm:gap-3">
          <span className="w-1 h-1 rounded-full bg-primary/30 inline-block" />{it}
        </span>
      ))}
    </div>
  </div>
);

// ─── Product Card ─────────────────────────────────────────────────────────────
const ProductCard = ({ product, onAdd, t }) => {
  const [h, setH] = useState(false);
  const unavailable = product.stock <= 0 || !product.is_active;

  return (
    <Tilt depth={5}>
      <div
        className={`relative bg-white rounded-2xl overflow-hidden h-full flex flex-col border transition-all duration-200
          ${h ? "border-primary/30 shadow-2xl shadow-sky-100/60 -translate-y-1" : "border-slate-100 shadow-md"}`}
        onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
        data-testid={`product-${product.id}`}>

        <div className={`absolute top-0 left-6 right-6 h-px bg-gradient-to-r from-transparent via-primary to-transparent transition-opacity duration-300 z-10 ${h ? "opacity-100" : "opacity-0"}`} />

        {/* Image */}
        <div className={`relative aspect-square overflow-hidden transition-colors duration-200 ${h ? "bg-sky-50" : "bg-gradient-to-br from-slate-50 to-sky-50/40"}`}>
          <img
            src={product.image_url || DEFAULT_PRODUCT_IMAGE}
            alt={product.name}
            className={`w-full h-full object-cover transition-transform duration-350 ${h ? "scale-105" : "scale-100"}`}
            onError={(e) => { e.currentTarget.src = DEFAULT_PRODUCT_IMAGE; }}
            data-testid={`store-product-image-${product.id}`}
          />
          {unavailable && (
            <div className="absolute inset-0 bg-slate-900/50 flex items-center justify-center backdrop-blur-sm">
              <span className="text-white text-xs font-bold uppercase tracking-widest px-3 py-1 bg-slate-800/70 rounded-full">
                {t("Out of stock", "Agotado")}
              </span>
            </div>
          )}
          {product.stock <= 5 && product.stock > 0 && (
            <div className="absolute top-2 left-2 sm:top-3 sm:left-3 bg-amber-400 text-amber-900 text-[9px] sm:text-[10px] font-black uppercase tracking-widest px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full shadow-sm">
              {t("Only {count} left!", "¡Solo {count} quedan!").replace("{count}", product.stock)}
            </div>
          )}
        </div>

        {/* Body */}
        <div className="p-3.5 sm:p-5 flex flex-col flex-grow relative">
          <div className={`absolute inset-0 bg-gradient-to-br from-sky-50/60 to-transparent transition-opacity duration-300 ${h ? "opacity-100" : "opacity-0"}`} />
          {product.category && (
            <p className="relative text-[9px] sm:text-[10px] uppercase tracking-widest text-primary/60 font-bold mb-1">{product.category}</p>
          )}
          <h3 className={`relative text-sm sm:text-base lg:text-lg font-bold mb-1 transition-colors duration-150 ${h ? "text-primary" : "text-slate-900"}`}>
            {product.name}
          </h3>
          <p className="relative text-slate-500 text-xs sm:text-sm leading-relaxed mb-3 sm:mb-4 line-clamp-2 flex-grow">{product.description}</p>
          <div className="relative flex items-center justify-between mt-auto gap-2">
            <span className={`text-lg sm:text-2xl font-black transition-colors duration-150 ${h ? "text-primary" : "text-sky-600"}`}>
              ${product.price.toFixed(2)}
            </span>
            <button
              onClick={() => onAdd(product)}
              disabled={unavailable}
              data-testid={`add-to-cart-${product.id}`}
              className={`group flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-4 py-2 sm:py-2.5 rounded-xl text-[11px] sm:text-sm font-bold uppercase tracking-wider transition-all duration-200 active:scale-95 overflow-hidden relative
                ${unavailable
                  ? "bg-slate-100 text-slate-400 cursor-not-allowed"
                  : "bg-primary text-white shadow-md shadow-primary/20 hover:shadow-lg hover:shadow-primary/30 hover:bg-primary/90"
                }`}>
              <span className="relative z-10 flex items-center gap-1 sm:gap-1.5">
                <Plus className="h-3 w-3 sm:h-4 sm:w-4" />
                {unavailable ? t("N/A", "N/D") : t("Add", "Agregar")}
              </span>
              {!unavailable && (
                <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/15 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-500" />
              )}
            </button>
          </div>
        </div>
      </div>
    </Tilt>
  );
};

// ─── Field + Input ────────────────────────────────────────────────────────────
const Field = ({ label, required, children, ...p }) => (
  <div {...p}>
    <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1 block not-italic">
      {label}{required && <span className="text-primary ml-0.5">*</span>}
    </label>
    {children}
  </div>
);
const inputCls = "w-full border border-slate-200 bg-white rounded-xl px-3.5 py-2.5 text-sm text-slate-800 placeholder-slate-300 focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition-all duration-200";

// ─── MAIN ─────────────────────────────────────────────────────────────────────
export default function StorePage() {
  const { t } = useLocale();
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState(null);
  const [loading, setLoading] = useState(true);
  const [cartOpen, setCartOpen] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);
  const [shippingLoading, setShippingLoading] = useState(false);
  const [shippingQuote, setShippingQuote] = useState({ distance_km: null, fee: 0 });
  const [shippingError, setShippingError] = useState("");
  const [scrollY, setScrollY] = useState(0);
  const [stripeModalOpen, setStripeModalOpen] = useState(false);
  const [stripeOrderData, setStripeOrderData] = useState(null);
  const [checkoutForm, setCheckoutForm] = useState({
    name: "", email: "", phone: "", address: "", apt: "",
    instructions: "", notes: "", preferred_contact: "sms", payment_method: "card"
  });
  const [searchParams] = useSearchParams();
  const { ring, dot } = useCursor();

  useEffect(() => {
    let tick = false;
    const fn = () => { if (!tick) { requestAnimationFrame(() => { setScrollY(window.pageYOffset); tick = false; }); tick = true; } };
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);

  const pollCheckoutStatus = useCallback(async (sessionId, attempt = 0) => {
    const maxAttempts = 8;
    try {
      const res = await fetch(`${API_URL}/api/store/checkout/status/${sessionId}`);
      if (!res.ok) throw new Error("status");
      const data = await res.json();
      const paymentStatus = (data?.payment_status || "").toLowerCase();
      const checkoutStatus = (data?.status || "").toLowerCase();
      if (paymentStatus === "paid") { toast.success(t("Payment completed successfully!", "¡Pago completado exitosamente!")); localStorage.removeItem("cartId"); setCart(null); return; }
      if (checkoutStatus === "expired") { toast.error(t("Payment session expired", "La sesión de pago expiró")); return; }
      if (attempt >= maxAttempts) { toast.info(t("Payment pending, refresh in a moment", "Pago pendiente, actualiza en un momento")); return; }
      setTimeout(() => pollCheckoutStatus(sessionId, attempt + 1), 2000);
    } catch { if (attempt >= maxAttempts) { toast.error(t("Unable to verify payment", "No se pudo verificar pago")); return; } setTimeout(() => pollCheckoutStatus(sessionId, attempt + 1), 2000); }
  }, [t]);

  const formatApiError = (detail, fallback) => {
    if (!detail) return fallback;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) return detail.map((i) => i?.msg || JSON.stringify(i)).join(", ") || fallback;
    if (detail?.msg) return detail.msg;
    return JSON.stringify(detail);
  };

  useEffect(() => {
    const status = searchParams.get("status");
    const sessionId = searchParams.get("session_id");
    if (sessionId) { pollCheckoutStatus(sessionId); window.history.replaceState({}, "", window.location.pathname); return; }
    if (status === "cancelled") toast.error(t("Payment was cancelled", "El pago fue cancelado"));
  }, [pollCheckoutStatus, searchParams, t]);

  useEffect(() => {
    fetch(`${API_URL}/api/store/products`)
      .then(r => r.json()).then(setProducts).catch(console.error).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const cartId = localStorage.getItem("cartId");
    if (cartId) {
      fetch(`${API_URL}/api/store/cart/${cartId}`)
        .then(r => { if (r.ok) return r.json(); throw new Error(); })
        .then(d => { if (d && Array.isArray(d.items)) setCart(d); else throw new Error(); })
        .catch(() => localStorage.removeItem("cartId"));
    }
  }, []);

  useEffect(() => {
    if (!checkoutForm.address || checkoutForm.address.trim().length < 10) {
      setShippingQuote({ distance_km: null, fee: 0 }); setShippingError(""); return;
    }
    const timer = setTimeout(async () => {
      setShippingLoading(true);
      try {
        const res = await fetch(`${API_URL}/api/store/shipping/quote`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ address: checkoutForm.address }) });
        if (res.ok) { const d = await res.json(); setShippingQuote(d); setShippingError(""); }
        else { const e = await res.json(); setShippingQuote({ distance_km: null, fee: 0 }); setShippingError(formatApiError(e.detail, t("Unable to calculate shipping", "No se pudo calcular envío"))); }
      } catch { setShippingQuote({ distance_km: null, fee: 0 }); setShippingError(t("Unable to calculate shipping", "No se pudo calcular envío")); }
      finally { setShippingLoading(false); }
    }, 600);
    return () => clearTimeout(timer);
  }, [checkoutForm.address, t]);

  const createCart = async () => {
    const res = await fetch(`${API_URL}/api/store/cart`, { method: "POST" });
    if (!res.ok) { toast.error(t("Unable to create cart", "No se pudo crear el carrito")); return null; }
    const c = await res.json();
    if (!c || !Array.isArray(c.items)) { toast.error(t("Invalid cart data", "Datos de carrito inválidos")); return null; }
    localStorage.setItem("cartId", c.id); setCart(c); return c;
  };

  const addToCart = async (product) => {
    try {
      let cur = cart; if (!cur) cur = await createCart(); if (!cur) return;
      const res = await fetch(`${API_URL}/api/store/cart/${cur.id}/items`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ product_id: product.id, quantity: 1 }) });
      if (res.ok) { const d = await res.json(); if (!d || !Array.isArray(d.items)) { toast.error(t("Invalid cart data", "Datos de carrito inválidos")); return; } setCart(d); toast.success(t("{name} added to cart", "{name} agregado al carrito").replace("{name}", product.name)); }
      else { const e = await res.json(); toast.error(formatApiError(e.detail, t("Error adding to cart", "Error al agregar al carrito"))); }
    } catch { toast.error(t("Connection error", "Error de conexión")); }
  };

  const updateQuantity = async (productId, qty) => {
    if (!cart) return;
    try {
      const res = await fetch(`${API_URL}/api/store/cart/${cart.id}/items/${productId}?quantity=${qty}`, { method: "PUT" });
      if (res.ok) { const d = await res.json(); if (!d || !Array.isArray(d.items)) return; setCart(d); }
    } catch { toast.error(t("Connection error", "Error de conexión")); }
  };

  const removeFromCart = async (productId) => {
    if (!cart) return;
    try {
      const res = await fetch(`${API_URL}/api/store/cart/${cart.id}/items/${productId}`, { method: "DELETE" });
      if (res.ok) { const d = await res.json(); if (!d || !Array.isArray(d.items)) return; setCart(d); toast.success(t("Product removed from cart", "Producto eliminado del carrito")); }
    } catch { toast.error(t("Connection error", "Error de conexión")); }
  };

  const checkout = async () => {
    if (!cart || cart.items.length === 0) { toast.error(t("Cart is empty", "El carrito está vacío")); return; }
    if (!checkoutForm.name || !checkoutForm.email || !checkoutForm.phone || !checkoutForm.address) { toast.error(t("Please complete required fields", "Completa los campos obligatorios")); return; }
    if (shippingError) { toast.error(shippingError); return; }
    if (!shippingQuote.fee) { toast.error(t("Enter full address (street, city, state, ZIP)", "Ingresa dirección completa")); return; }

    // Inline Stripe Payment (tap/Apple Pay/Google Pay/Card)
    if (checkoutForm.payment_method === "card") {
      // First create the order via manual checkout, then open Stripe Payment modal
      setCheckingOut(true);
      try {
        const payload = { cart_id: cart.id, origin_url: window.location.origin, customer_name: checkoutForm.name, customer_email: checkoutForm.email, customer_phone: checkoutForm.phone, shipping_address: checkoutForm.address, shipping_apt: checkoutForm.apt, delivery_instructions: checkoutForm.instructions, notes: checkoutForm.notes, preferred_contact: checkoutForm.preferred_contact, fulfillment_type: "delivery", payment_method: "card" };
        const res = await fetch(`${API_URL}/api/store/checkout/manual`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        if (res.ok) {
          const d = await res.json();
          const total = cart.total + (shippingQuote.fee || 0);
          setStripeOrderData({ orderId: d.order_id || d.id, amount: total, description: `Tienda - ${checkoutForm.name}` });
          setStripeModalOpen(true);
        } else { const e = await res.json(); toast.error(formatApiError(e.detail, t("Error processing order", "Error al procesar orden"))); }
      } catch { toast.error(t("Connection error", "Error de conexión")); }
      finally { setCheckingOut(false); }
      return;
    }

    // Manual payment (cash, zelle, etc.)
    setCheckingOut(true);
    try {
      const payload = { cart_id: cart.id, origin_url: window.location.origin, customer_name: checkoutForm.name, customer_email: checkoutForm.email, customer_phone: checkoutForm.phone, shipping_address: checkoutForm.address, shipping_apt: checkoutForm.apt, delivery_instructions: checkoutForm.instructions, notes: checkoutForm.notes, preferred_contact: checkoutForm.preferred_contact, fulfillment_type: "delivery", payment_method: checkoutForm.payment_method };
      const res = await fetch(`${API_URL}/api/store/checkout/manual`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (res.ok) { toast.success(t("Order confirmed. Payment registered.", "Orden confirmada.")); localStorage.removeItem("cartId"); setCart(null); }
      else { const e = await res.json(); toast.error(formatApiError(e.detail, t("Error processing payment", "Error al procesar el pago"))); }
    } catch { toast.error(t("Connection error", "Error de conexión")); }
    finally { setCheckingOut(false); }
  };

  const cartItemCount = cart?.items?.reduce((s, i) => s + i.quantity, 0) || 0;
  const shippingFee = shippingQuote.fee || 0;
  const orderTotal = cart ? cart.total + shippingFee : 0;

  const marqueeItems = [
    t("Laundry Products", "Productos de Lavandería"),
    t("Premium Quality", "Calidad Premium"),
    t("Free Delivery", "Envío Gratis"),
    t("Detergents", "Detergentes"),
    t("Softeners", "Suavizantes"),
    t("Ventura Fresh Store", "Tienda Ventura Fresh"),
  ];

  const setField = (k, v) => setCheckoutForm(p => ({ ...p, [k]: v }));

  return (<>
    {/* Custom Cursor — desktop only */}
    <div className="pointer-events-none fixed inset-0 z-[9999] hidden lg:block">
      <div ref={ring} className="absolute w-9 h-9 rounded-full border border-primary/50 will-change-transform" style={{ top: 0, left: 0 }} />
      <div ref={dot}  className="absolute w-1.5 h-1.5 rounded-full bg-primary will-change-transform" style={{ top: 0, left: 0 }} />
    </div>

    <style>{`
      @keyframes fadeUp { from { opacity:0; transform:translateY(10px) } to { opacity:1; transform:translateY(0) } }
      @keyframes mq { from { transform:translateX(0) } to { transform:translateX(-33.333%) } }
      * { font-style: normal !important; }
    `}</style>

    <div className="min-h-screen bg-white overflow-x-hidden">
      <PublicNav />

      {/* ══ HERO ══════════════════════════════════════════════════════════ */}
      <section className="relative min-h-[55vh] sm:min-h-[65vh] flex items-end justify-center overflow-hidden">
        <div className="absolute inset-0 will-change-transform"
          style={{ backgroundImage: "url('https://images.unsplash.com/photo-1582735689369-4fe89db7114c?w=1920&h=1080&fit=crop')", backgroundSize: "cover", backgroundPosition: "center", transform: `translateY(${scrollY * 0.22}px) scale(1.08)` }} />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/92 via-slate-900/65 to-slate-800/30" />
        <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at center,transparent 40%,rgba(0,0,0,0.5) 100%)" }} />
        <div className="absolute inset-0 opacity-[0.025]" style={{ backgroundImage: "repeating-linear-gradient(0deg,#000 0px,#000 1px,transparent 1px,transparent 4px)" }} />

        <div className="relative z-10 text-center px-4 sm:px-6 pb-14 sm:pb-20 max-w-4xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-full bg-white/10 backdrop-blur-md border border-white/20 mb-5 sm:mb-7"
            style={{ animation: "fadeUp 0.5s 0.05s both ease-out" }}>
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            <span className="text-[10px] sm:text-[11px] text-white/75 font-bold uppercase tracking-[0.18em] not-italic">
              {t("Official Store", "Tienda Oficial")}
            </span>
          </div>

          {/* Solid white + solid primary — no italic, no stroke */}
          <h1 className="font-bold text-white leading-[1.08] mb-4 tracking-tight not-italic
            text-3xl xs:text-4xl sm:text-5xl md:text-6xl lg:text-7xl"
            style={{ animation: "fadeUp 0.5s 0.12s both ease-out" }}>
            {t("Everything you need", "Todo lo que necesitas")}
            <span className="block text-white not-italic">
              {t("for fresh laundry.", "para ropa fresca.")}
            </span>
          </h1>

          <p className="text-sm sm:text-lg md:text-xl text-white/70 max-w-xl mx-auto not-italic px-2 sm:px-0"
            style={{ animation: "fadeUp 0.5s 0.2s both ease-out" }}>
            {t("Quality laundry products and accessories, delivered to your door.",
               "Productos de lavandería y accesorios de calidad, a tu puerta.")}
          </p>
        </div>

        <div className="absolute bottom-0 left-0 right-0 z-20">
          <svg viewBox="0 0 1440 90" preserveAspectRatio="none" className="w-full h-8 sm:h-14 lg:h-20">
            <path d="M0,45 C300,0 600,90 1440,45 L1440,90 L0,90 Z" fill="white" />
          </svg>
        </div>
      </section>

      {/* ══ MARQUEE ═══════════════════════════════════════════════════════ */}
      <Marquee items={marqueeItems} />

      {/* ══ PRODUCTS ══════════════════════════════════════════════════════ */}
      <section className="py-10 sm:py-16 lg:py-24 relative overflow-hidden bg-white">
        <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: "url('https://images.unsplash.com/photo-1545173168-9f1947eebb7f?w=1920&h=1080&fit=crop')", backgroundSize: "cover", backgroundPosition: "center", transform: `translateY(${scrollY * 0.1}px)` }} />
        <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-12">

          <Reveal dir="blur" dur={300}>
            <p className="text-center text-[10px] sm:text-[11px] font-bold uppercase tracking-[0.22em] text-primary/50 mb-3 not-italic">
              {t("Our Products", "Nuestros Productos")}
            </p>
          </Reveal>
          <Reveal delay={50} dur={300}>
            <h2 className="text-2xl sm:text-4xl lg:text-5xl font-bold text-slate-900 text-center mb-3 leading-tight not-italic">
              {t("Shop the", "Compra la")}
              <span className="block text-primary font-bold not-italic">{t("collection.", "colección.")}</span>
            </h2>
          </Reveal>
          <Reveal delay={100} dur={300}>
            <p className="text-slate-400 text-center mb-8 sm:mb-14 max-w-xl mx-auto text-sm sm:text-lg not-italic">
              {t("Premium products for a premium clean.", "Productos premium para una limpieza premium.")}
            </p>
          </Reveal>

          {loading ? (
            <div className="flex justify-center py-20">
              <div className="w-12 h-12 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
            </div>
          ) : products.length === 0 ? (
            <Reveal dir="scale">
              <div className="text-center py-14 sm:py-20">
                <div className="w-16 h-16 sm:w-20 sm:h-20 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-5">
                  <ShoppingBag className="h-8 w-8 sm:h-10 sm:w-10 text-slate-300" />
                </div>
                <h3 className="text-xl sm:text-2xl font-bold text-slate-900 mb-3 not-italic">
                  {t("No products available", "No hay productos disponibles")}
                </h3>
                <p className="text-slate-400 max-w-sm mx-auto text-sm not-italic">
                  {t("We are working on bringing quality products. Check back soon!", "Estamos trabajando en traer productos de calidad. ¡Vuelve pronto!")}
                </p>
              </div>
            </Reveal>
          ) : (
            /* 2 cols mobile → 3 cols md → 4 cols xl */
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4 lg:gap-5">
              {products.map((product, i) => (
                <Reveal key={product.id} delay={i * 40} dir="up" dur={350}>
                  <ProductCard product={product} onAdd={addToCart} t={t} />
                </Reveal>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ══ FLOATING CART BUTTON ══════════════════════════════════════════ */}
      <button
        onClick={() => setCartOpen(true)}
        data-testid="cart-button"
        className="fixed bottom-5 right-4 sm:bottom-6 sm:right-6 z-40 bg-primary text-white p-3.5 sm:p-4 rounded-full shadow-xl shadow-primary/30 hover:bg-primary/90 transition-colors duration-200 active:scale-95 flex items-center justify-center">
        <ShoppingCart className="h-5 w-5 sm:h-6 sm:w-6" />
        {cartItemCount > 0 && (
          <span className="absolute -top-1.5 -right-1.5 sm:-top-2 sm:-right-2 bg-red-500 text-white text-[9px] sm:text-[10px] font-black rounded-full h-4 w-4 sm:h-5 sm:w-5 flex items-center justify-center shadow-md">
            {cartItemCount}
          </span>
        )}
      </button>

      {/* ══ CART SIDEBAR ══════════════════════════════════════════════════ */}
      {cartOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setCartOpen(false)} />

          {/* Full screen on mobile, fixed width on sm+ */}
          <div className="relative w-full sm:max-w-md bg-white h-full shadow-2xl overflow-y-auto flex flex-col" data-testid="cart-sidebar">

            {/* Header */}
            <div className="sticky top-0 z-10 bg-white/95 backdrop-blur-md border-b border-slate-100 px-4 sm:px-6 py-3.5 sm:py-4 flex items-center justify-between">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="w-7 h-7 sm:w-8 sm:h-8 bg-primary/10 rounded-xl flex items-center justify-center">
                  <ShoppingCart className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-primary" />
                </div>
                <h2 className="text-base sm:text-lg font-bold text-slate-900 not-italic">{t("Your Cart", "Tu Carrito")}</h2>
                {cartItemCount > 0 && (
                  <span className="bg-primary text-white text-[10px] font-black rounded-full h-5 w-5 flex items-center justify-center">{cartItemCount}</span>
                )}
              </div>
              <button onClick={() => setCartOpen(false)} className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center hover:bg-slate-200 transition-colors duration-150">
                <X className="h-4 w-4 text-slate-600" />
              </button>
            </div>

            <div className="flex-1 px-4 sm:px-6 py-4 sm:py-5 space-y-5 sm:space-y-6">

              {/* Empty state */}
              {(!cart || cart.items.length === 0) ? (
                <div className="text-center py-12 sm:py-16">
                  <div className="w-14 h-14 sm:w-16 sm:h-16 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <ShoppingBag className="h-7 w-7 sm:h-8 sm:w-8 text-slate-300" />
                  </div>
                  <p className="text-slate-500 font-medium text-sm sm:text-base not-italic">{t("Your cart is empty", "Tu carrito está vacío")}</p>
                  <p className="text-slate-400 text-xs sm:text-sm mt-1 not-italic">{t("Add some products to get started.", "Agrega productos para comenzar.")}</p>
                </div>
              ) : (<>

                {/* Cart Items */}
                <div className="space-y-2 sm:space-y-3">
                  {cart.items.map((item) => (
                    <div key={item.product_id}
                      className="flex items-center gap-2.5 sm:gap-3 p-3 sm:p-3.5 bg-slate-50 rounded-2xl border border-slate-100 hover:border-primary/20 transition-colors duration-150"
                      data-testid={`cart-item-${item.product_id}`}>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-slate-900 text-xs sm:text-sm truncate not-italic">{item.product_name}</h3>
                        <p className="text-primary font-bold text-xs sm:text-sm not-italic">${item.price.toFixed(2)}</p>
                      </div>
                      <div className="flex items-center gap-1 sm:gap-1.5 flex-shrink-0">
                        <button onClick={() => updateQuantity(item.product_id, item.quantity - 1)}
                          className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-white border border-slate-200 flex items-center justify-center hover:border-primary/30 hover:text-primary transition-all duration-150">
                          <Minus className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                        </button>
                        <span className="w-5 sm:w-6 text-center text-xs sm:text-sm font-bold text-slate-800">{item.quantity}</span>
                        <button onClick={() => updateQuantity(item.product_id, item.quantity + 1)}
                          className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-white border border-slate-200 flex items-center justify-center hover:border-primary/30 hover:text-primary transition-all duration-150">
                          <Plus className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                        </button>
                        <button onClick={() => removeFromCart(item.product_id)}
                          className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-red-50 text-red-400 flex items-center justify-center hover:bg-red-100 hover:text-red-600 transition-all duration-150 ml-0.5 sm:ml-1">
                          <Trash2 className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="border-t border-slate-100" />

                {/* Checkout Details */}
                <div>
                  <h3 className="text-sm font-bold text-slate-900 mb-1 not-italic">{t("Checkout details", "Detalles de compra")}</h3>
                  <p className="text-xs text-slate-400 mb-4 not-italic">{t("Add shipping and contact info to continue", "Agrega datos de envío y contacto para continuar")}</p>

                  <div className="space-y-3">
                    <Field label={t("Full name", "Nombre completo")} required>
                      <input value={checkoutForm.name} onChange={e => setField("name", e.target.value)} className={inputCls} data-testid="checkout-name" />
                    </Field>
                    <Field label={t("Email", "Email")} required>
                      <input type="email" value={checkoutForm.email} onChange={e => setField("email", e.target.value)} className={inputCls} data-testid="checkout-email" />
                    </Field>
                    <Field label={t("Phone", "Teléfono")} required>
                      <input value={checkoutForm.phone} onChange={e => setField("phone", e.target.value)} className={inputCls} data-testid="checkout-phone" />
                    </Field>
                    <Field label={t("Shipping address", "Dirección de envío")} required>
                      <AddressAutocomplete
                        value={checkoutForm.address}
                        onChange={(v) => setField("address", v)}
                        onSelect={(addr) => {
                          const fullAddr = [addr.street, addr.city, addr.state, addr.zip].filter(Boolean).join(", ");
                          setField("address", fullAddr);
                        }}
                        inputClassName={inputCls}
                        inputProps={{ "data-testid": "checkout-address" }}
                        placeholder={t("Start typing address…", "Empieza a escribir dirección…")}
                      />
                      <p className="text-[11px] text-slate-400 mt-1 not-italic" data-testid="checkout-address-format-help">
                        {t("Format: street + number, city, state, ZIP", "Formato: calle y número, ciudad, estado, ZIP")}
                      </p>
                    </Field>
                    <Field label={t("Apartment / Suite", "Apto / Suite")}>
                      <input value={checkoutForm.apt} onChange={e => setField("apt", e.target.value)} className={inputCls} data-testid="checkout-apt" />
                    </Field>
                    <Field label={t("Delivery instructions", "Instrucciones de entrega")}>
                      <input value={checkoutForm.instructions} onChange={e => setField("instructions", e.target.value)} className={inputCls} data-testid="checkout-instructions" />
                    </Field>
                    <Field label={t("Notes", "Notas")}>
                      <input value={checkoutForm.notes} onChange={e => setField("notes", e.target.value)} className={inputCls} data-testid="checkout-notes" />
                    </Field>
                    <div className="grid grid-cols-2 gap-2 sm:gap-3">
                      <Field label={t("Preferred contact", "Contacto preferido")}>
                        <select value={checkoutForm.preferred_contact} onChange={e => setField("preferred_contact", e.target.value)} className={inputCls} data-testid="checkout-preferred-contact">
                          <option value="sms">SMS</option>
                          <option value="email">Email</option>
                          <option value="whatsapp">WhatsApp</option>
                          <option value="call">{t("Call", "Llamada")}</option>
                        </select>
                      </Field>
                      <Field label={t("Payment method", "Método de pago")}>
                        <select value={checkoutForm.payment_method} onChange={e => setField("payment_method", e.target.value)} className={inputCls} data-testid="checkout-payment-method">
                          <option value="card">{t("Card / Apple Pay / Google Pay", "Tarjeta / Apple Pay / Google Pay")}</option>
                          <option value="cash">{t("Cash", "Efectivo")}</option>
                          <option value="transfer">{t("Transfer", "Transferencia")}</option>
                          <option value="other">{t("Other", "Otro")}</option>
                        </select>
                      </Field>
                    </div>
                  </div>
                </div>

                {/* Summary */}
                <div className="bg-slate-50 rounded-2xl p-3.5 sm:p-4 border border-slate-100 space-y-2" data-testid="checkout-summary">
                  <div className="flex justify-between text-sm text-slate-500">
                    <span className="not-italic">{t("Subtotal", "Subtotal")}</span>
                    <span className="font-medium text-slate-800 not-italic">${cart.total.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm text-slate-500">
                    <span className="not-italic">{t("Shipping", "Envío")}</span>
                    <span className={`font-medium not-italic ${shippingError ? "text-red-500" : "text-slate-800"}`}>
                      {shippingLoading
                        ? <span className="flex items-center gap-1 not-italic"><div className="w-3 h-3 border border-primary border-t-transparent rounded-full animate-spin" />{t("Calculating...", "Calculando...")}</span>
                        : shippingQuote.distance_km
                          ? `$${shippingFee.toFixed(2)} · ${shippingQuote.distance_km} km`
                          : "—"}
                    </span>
                  </div>
                  {shippingError && <p className="text-[11px] text-red-500 not-italic" data-testid="checkout-shipping-error">{shippingError}</p>}
                  <div className="flex justify-between font-bold text-slate-900 border-t border-slate-200 pt-2 mt-1">
                    <span className="not-italic">{t("Total", "Total")}</span>
                    <span className="text-primary not-italic">${orderTotal.toFixed(2)}</span>
                  </div>
                </div>

                {/* Checkout CTA */}
                <button
                  onClick={checkout}
                  disabled={checkingOut}
                  data-testid="checkout-button"
                  className="group w-full flex items-center justify-center gap-2 bg-primary text-white rounded-xl px-6 py-3.5 sm:py-4 text-sm font-bold uppercase tracking-wider hover:bg-primary/90 transition-all duration-200 shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 active:scale-95 overflow-hidden relative disabled:opacity-60 disabled:cursor-not-allowed">
                  {checkingOut ? (
                    <span className="flex items-center gap-2 not-italic">
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      {t("Processing...", "Procesando...")}
                    </span>
                  ) : (
                    <span className="relative z-10 flex items-center gap-2 not-italic">
                      {checkoutForm.payment_method === "card" ? t("Pay with Stripe (Tap / Card)", "Pagar con Stripe (Tap / Tarjeta)") : t("Confirm order", "Confirmar orden")}
                      <ArrowRight className="w-4 h-4 transition-transform duration-150 group-hover:translate-x-1" />
                    </span>
                  )}
                  <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/15 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-500" />
                </button>
              </>)}
            </div>
          </div>
        </div>
      )}

      <PublicFooter />
      <StorePaymentModal
        open={stripeModalOpen}
        onClose={() => { setStripeModalOpen(false); setStripeOrderData(null); }}
        amount={stripeOrderData?.amount}
        description={stripeOrderData?.description}
        orderId={stripeOrderData?.orderId}
        onPaymentSuccess={() => { toast.success(t("Payment completed!", "Pago completado!")); localStorage.removeItem("cartId"); setCart(null); setStripeModalOpen(false); }}
      />
    </div>
  </>);
}