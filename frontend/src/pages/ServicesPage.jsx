import { useState, useEffect, useRef, useCallback } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, Check, Star, Clock, Shield, Truck, ArrowRight, Zap, X, Sparkles } from "lucide-react";
import PublicNav from "../components/PublicNav";
import PublicFooter from "../components/PublicFooter";
import { useLocale } from "../context/LocaleContext";
import leftBannerImage from "../assets/image.png";
import rightBannerImage from "../assets/image2.jpeg";

const AD_CONFIG = {
  left: {
    image: leftBannerImage,
    badge: "Dry Cleaning",
    title: "Coming soon",
    subtitle: "Premium care for your garments coming soon to Ventura.",
    description: "",
    cta: "Ver membresías",
    ctaUrl: "/membership",
    accent: "#0ea5e9",
    overlayFrom: "#0c4a6e",
    overlayTo: "#0369a1",
  },
  right: {
    image: rightBannerImage,
    badge: "Shoe cleaning",
    title: "Coming soon",
    subtitle: "Premium care for your shoes coming soon at Ventura Fresh Laundry.",
    description: "",
    cta: "Reservar Express",
    ctaUrl: "/schedule-pickup?express=true",
    accent: "#f59e0b",
    overlayFrom: "#1e1b4b",
    overlayTo: "#312e81",
  },
};

// ─── IntersectionObserver hook ────────────────────────────────────────────────
function useInView(threshold = 0.08) {
  const ref = useRef(null);
  const [v, setV] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
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
  up:    "opacity-0 translate-y-8",
  left:  "opacity-0 translate-x-6",
  right: "opacity-0 -translate-x-6",
  scale: "opacity-0 scale-95",
  blur:  "opacity-0 blur-sm scale-98",
};
const Reveal = ({ children, delay = 0, dir = "up", dur = 600, className = "" }) => {
  const [ref, v] = useInView();
  return (
    <div
      ref={ref}
      className={`${className} transition-all ease-out ${v ? "opacity-100 translate-y-0 translate-x-0 scale-100 blur-0" : ORIGINS[dir]}`}
      style={{ transitionDuration: `${dur}ms`, transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
};

// ─── Magnetic wrapper — solo desktop ─────────────────────────────────────────
const Mag = ({ children, className = "", strength = 0.28, as: Tag = "div", ...p }) => {
  const ref = useRef(null);
  const onMove = useCallback((e) => {
    if (!ref.current || window.innerWidth < 1024) return;
    const r = ref.current.getBoundingClientRect();
    ref.current.style.transform = `translate(${(e.clientX - r.left - r.width / 2) * strength}px,${(e.clientY - r.top - r.height / 2) * strength}px)`;
  }, [strength]);
  const onLeave = useCallback(() => {
    if (ref.current) ref.current.style.transform = "translate(0,0)";
  }, []);
  return (
    <Tag
      ref={ref}
      className={className}
      style={{ transition: "transform 500ms cubic-bezier(0.34,1.56,0.64,1)" }}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      {...p}
    >
      {children}
    </Tag>
  );
};

// ─── 3-D Tilt — solo desktop ──────────────────────────────────────────────────
const Tilt = ({ children, className = "", depth = 5 }) => {
  const ref = useRef(null);
  const [s, setS] = useState({});
  const onMove = useCallback((e) => {
    if (!ref.current || window.innerWidth < 1024) return;
    const r = ref.current.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width - 0.5) * depth * 2;
    const y = ((e.clientY - r.top) / r.height - 0.5) * -depth * 2;
    setS({ transform: `perspective(900px) rotateX(${y}deg) rotateY(${x}deg) translateZ(6px)`, transition: "transform 80ms linear" });
  }, [depth]);
  const onLeave = useCallback(() =>
    setS({ transform: "perspective(900px) rotateX(0) rotateY(0) translateZ(0)", transition: "transform 500ms cubic-bezier(0.34,1.56,0.64,1)" }), []);
  return (
    <div ref={ref} style={s} className={className} onMouseMove={onMove} onMouseLeave={onLeave}>
      {children}
    </div>
  );
};

// ─── Custom Cursor — solo desktop ─────────────────────────────────────────────
function useCursor() {
  const ring = useRef(null);
  const dot = useRef(null);
  const p = useRef({ x: -200, y: -200 });
  const l = useRef({ x: -200, y: -200 });
  const raf = useRef(null);
  useEffect(() => {
    if (window.innerWidth < 1024) return;
    const fn = (e) => { p.current = { x: e.clientX, y: e.clientY }; };
    window.addEventListener("mousemove", fn, { passive: true });
    const loop = () => {
      l.current.x += (p.current.x - l.current.x) * 0.1;
      l.current.y += (p.current.y - l.current.y) * 0.1;
      if (ring.current) ring.current.style.transform = `translate(${l.current.x - 18}px,${l.current.y - 18}px)`;
      if (dot.current) dot.current.style.transform = `translate(${p.current.x - 3}px,${p.current.y - 3}px)`;
      raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
    return () => { window.removeEventListener("mousemove", fn); cancelAnimationFrame(raf.current); };
  }, []);
  return { ring, dot };
}

// ─── Marquee ──────────────────────────────────────────────────────────────────
const Marquee = ({ items }) => (
  <div className="overflow-hidden py-3 border-y border-primary/10 bg-sky-50/50">
    <style>{`@keyframes mq{from{transform:translateX(0)}to{transform:translateX(-33.333%)}}`}</style>
    <div className="flex gap-8 whitespace-nowrap" style={{ animation: "mq 30s linear infinite" }}>
      {[...items, ...items, ...items].map((it, i) => (
        <span key={i} className="text-[11px] font-bold uppercase tracking-[0.15em] text-primary/45 flex items-center gap-2">
          <span className="w-1 h-1 rounded-full bg-primary/30 inline-block" />{it}
        </span>
      ))}
    </div>
  </div>
);

// ─── Accordion ────────────────────────────────────────────────────────────────
const AccordionItem = ({ title, children, isOpen, onClick, variant = "light" }) => {
  const isDark = variant === "dark";
  return (
    <div className={`border-b ${isDark ? "border-white/20" : "border-slate-200/70"} last:border-0`}>
      <button
        onClick={onClick}
        className="w-full py-4 flex items-center justify-between text-left group focus:outline-none min-h-[52px] touch-manipulation"
        aria-expanded={isOpen}
      >
        <span className={`text-sm sm:text-base font-semibold transition-colors duration-200 pr-4 ${isDark ? "text-white/80" : "text-slate-800"}`}>
          {title}
        </span>
        <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 ${
          isOpen
            ? isDark ? "bg-sky-400 text-white rotate-180" : "bg-primary text-white rotate-180"
            : isDark ? "bg-white/10 text-white/50" : "bg-slate-100 text-slate-400"
        }`}>
          <ChevronDown className="w-4 h-4" />
        </div>
      </button>
      <div className={`overflow-hidden transition-all duration-500 ease-in-out ${isOpen ? "max-h-[600px] pb-4 opacity-100" : "max-h-0 opacity-0"}`}>
        {children}
      </div>
    </div>
  );
};

// ─── Plan Badge ───────────────────────────────────────────────────────────────
const PlanBadge = ({ type, t }) => {
  if (!t || typeof t !== 'function') {
    // Fallback: devolver un badge sin traducción si t no está disponible
    const fallbackLabels = {
      standard: "36 h",
      premium: "24 h",
      express: "Same day",
      popular: "Most popular"
    };
    const label = fallbackLabels[type] || "36 h";
    const cls = type === 'popular' || type === 'premium' 
      ? "bg-sky-100 text-sky-700 border border-sky-200"
      : type === 'express'
      ? "bg-amber-100 text-amber-700 border border-amber-200"
      : "bg-slate-100 text-slate-500 border border-slate-200";
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap ${cls}`}>
        {label}
      </span>
    );
  }
  const configs = {
    standard: { label: t("36 h", "36 h"), cls: "bg-slate-100 text-slate-500 border border-slate-200" },
    premium:  { label: t("24 h", "24 h"), cls: "bg-sky-100 text-sky-700 border border-sky-200" },
    express:  { label: t("Same day", "Mismo día"), cls: "bg-amber-100 text-amber-700 border border-amber-200" },
    popular:  { label: t("Most popular", "Más popular"), cls: "bg-sky-100 text-sky-700 border border-sky-200" },
  };
  const c = configs[type] || configs.standard;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap ${c.cls}`}>
      {c.label}
    </span>
  );
};


// ════════════════════════════════════════════════════════════════════════════
//  AD BANNERS
// ════════════════════════════════════════════════════════════════════════════

// ── Banner horizontal (móvil/tablet) ─────────────────────────────────────────
const AdBannerHorizontal = ({ config }) => {
  const [hovered, setHovered] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  return (
    <div
      className="relative rounded-2xl overflow-hidden cursor-pointer"
      style={{
        minHeight: "88px",
        boxShadow: hovered ? `0 12px 40px -8px ${config.accent}55, 0 4px 16px rgba(0,0,0,0.14)` : "0 2px 12px rgba(0,0,0,0.09)",
        transform: hovered ? "translateY(-3px)" : "translateY(0)",
        transition: "all 0.35s cubic-bezier(0.34,1.56,0.64,1)",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => window.location.href = config.ctaUrl}
      role="link"
      tabIndex={0}
      onKeyDown={e => e.key === "Enter" && (window.location.href = config.ctaUrl)}
    >
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{
          backgroundImage: `url('${config.image}')`,
          transform: hovered ? "scale(1.07)" : "scale(1.02)",
          transition: "transform 0.6s ease",
        }}
      />
      <div className="absolute inset-0" style={{ background: `linear-gradient(100deg, ${config.overlayFrom}f2 0%, ${config.overlayTo}cc 55%, rgba(0,0,0,0.45) 100%)` }} />
      <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: `linear-gradient(to right, ${config.accent}, transparent)`, opacity: 0.9 }} />

      <div className="relative h-full flex items-center gap-3 px-4 py-3">
        <div className="flex-1 min-w-0">
          <span
            className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wide mb-1"
            style={{ background: `${config.accent}28`, border: `1px solid ${config.accent}55`, color: config.accent }}
          >
            {config.badge}
          </span>
          <h3 className="text-white font-black text-base leading-tight" style={{ textShadow: "0 1px 6px rgba(0,0,0,0.5)" }}>
            {config.title}
          </h3>
          <p className="text-white/60 text-xs leading-tight line-clamp-2 mt-0.5">{config.subtitle}</p>
        </div>

        <div className="w-px h-10 bg-white/20 flex-shrink-0 hidden sm:block" />

  {/*      <div className="flex-shrink-0 flex flex-col items-end gap-1.5">
          <p className="text-white/55 text-xs hidden sm:block text-right leading-tight max-w-[120px]">{config.description}</p>
          <span
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wide text-white whitespace-nowrap"
            style={{
              background: config.accent,
              boxShadow: `0 3px 10px ${config.accent}55`,
              transform: hovered ? "scale(1.05)" : "scale(1)",
              transition: "transform 0.3s ease",
            }}
          >
            {config.cta}
            <ArrowRight className="w-3 h-3" style={{ transform: hovered ? "translateX(2px)" : "translateX(0)", transition: "transform 0.3s ease" }} />
          </span>
        </div>*/}

        <button
          onClick={e => { e.stopPropagation(); setDismissed(true); }}
          className="absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center bg-black/30 hover:bg-black/50 transition-colors touch-manipulation"
          aria-label="Cerrar"
        >
          <X className="w-3 h-3 text-white/70" />
        </button>

        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: "linear-gradient(100deg, transparent 30%, rgba(255,255,255,0.07) 50%, transparent 70%)",
            transform: hovered ? "translateX(200%)" : "translateX(-200%)",
            transition: "transform 0.8s ease",
          }}
        />
      </div>
    </div>
  );
};

// ── Banner vertical (desktop xl+) ─────────────────────────────────────────────
const AdBannerVertical = ({ config }) => {
  const [hovered, setHovered] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  return (
    <div className="hidden xl:flex flex-col flex-shrink-0 w-[200px] sticky top-6 self-start" style={{ zIndex: 10 }}>
      <div className="flex items-center justify-between mb-2 px-1">
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400/70 select-none">Publicidad</span>
        <button
          onClick={() => setDismissed(true)}
          className="text-slate-300 hover:text-slate-500 transition-colors rounded-full p-0.5 hover:bg-slate-100 touch-manipulation"
          aria-label="Cerrar"
        >
          <X className="w-3 h-3" />
        </button>
      </div>
      <div
        className="relative rounded-2xl overflow-hidden cursor-pointer select-none"
        style={{
          height: "380px",
          boxShadow: hovered ? `0 24px 60px -10px ${config.accent}50, 0 8px 24px rgba(0,0,0,0.18)` : "0 4px 20px rgba(0,0,0,0.10)",
          transform: hovered ? "translateY(-5px) scale(1.015)" : "translateY(0) scale(1)",
          transition: "all 0.45s cubic-bezier(0.34,1.56,0.64,1)",
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={() => window.location.href = config.ctaUrl}
        role="link"
        tabIndex={0}
        onKeyDown={e => e.key === "Enter" && (window.location.href = config.ctaUrl)}
      >
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage: `url('${config.image}')`,
            transform: hovered ? "scale(1.1)" : "scale(1.02)",
            transition: "transform 0.7s cubic-bezier(0.25,0.46,0.45,0.94)",
          }}
        />
        <div className="absolute inset-0" style={{ background: `linear-gradient(155deg, ${config.overlayFrom}e0 0%, ${config.overlayTo}90 55%, transparent 100%)` }} />
        <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.2) 55%, transparent 100%)" }} />
        <div
          className="absolute inset-0 rounded-2xl pointer-events-none transition-all duration-300"
          style={{ boxShadow: hovered ? `inset 0 0 0 1.5px ${config.accent}90` : "inset 0 0 0 1px rgba(255,255,255,0.08)" }}
        />
        <div
          className="absolute top-0 left-0 right-0 h-0.5 transition-all duration-500"
          style={{ background: `linear-gradient(to right, transparent, ${config.accent}, transparent)`, opacity: hovered ? 1 : 0.3 }}
        />
        <div
          className="absolute top-3 right-3 transition-all duration-300"
          style={{ opacity: hovered ? 1 : 0, transform: hovered ? "scale(1)" : "scale(0.5)" }}
        >
          <Sparkles className="w-4 h-4" style={{ color: config.accent }} />
        </div>
        <div className="absolute inset-0 flex flex-col justify-between p-4">
          <div>
            <span
              className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wide backdrop-blur-sm"
              style={{ background: `${config.accent}22`, border: `1px solid ${config.accent}55`, color: config.accent }}
            >
              {config.badge}
            </span>
          </div>
          <div>
            <div className="w-8 h-0.5 mb-3 rounded-full" style={{ background: config.accent }} />
            <h3 className="text-white font-black leading-[1.1] mb-1.5" style={{ fontSize: "1.5rem", textShadow: "0 2px 12px rgba(0,0,0,0.6)" }}>
              {config.title}
            </h3>
            <p className="text-xs font-bold mb-1.5 uppercase tracking-wider" style={{ color: config.accent }}>{config.subtitle}</p>
            <p className="text-white/60 text-[11px] leading-relaxed mb-4">{config.description}</p>
            {/* <div
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-[11px] font-bold uppercase tracking-wide text-white transition-all duration-300"
              style={{
                background: config.accent,
                boxShadow: hovered ? `0 6px 20px ${config.accent}70` : `0 3px 10px ${config.accent}40`,
                transform: hovered ? "scale(1.04)" : "scale(1)",
              }}
            >
              {config.cta}
              <ArrowRight
                className="w-3.5 h-3.5 transition-transform duration-300"
                style={{ transform: hovered ? "translateX(3px)" : "translateX(0)" }}
              />
            </div>*/}
          </div>
        </div>
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: "linear-gradient(105deg, transparent 30%, rgba(255,255,255,0.07) 50%, transparent 70%)",
            transform: hovered ? "translateX(200%)" : "translateX(-200%)",
            transition: "transform 0.8s ease",
          }}
        />
      </div>
      <p className="text-center text-[10px] text-slate-400/60 mt-1.5 select-none">Ventura Fresh Laundry</p>
    </div>
  );
};

// ─── Pickup & Delivery Service Card ──────────────────────────────────────────
const PickupDeliveryServiceCard = ({ t }) => {
  const [h, setH] = useState(false);
  const rows = [
    { plan: t("Standard", "Estándar"), badge: "standard", memberPrice: "$2.50/lb", regularPrice: "$2.75/lb" },
    { plan: t("Premium", "Premium"),   badge: "premium",  memberPrice: "$2.75/lb", regularPrice: "$3.00/lb", isPopular: true },
    { plan: t("Express", "Express"),   badge: "express",  memberPrice: "$3.00/lb", regularPrice: "$3.25/lb" },
  ];
  return (
    <Tilt depth={4}>
      <div
        className={`relative bg-white rounded-2xl h-full flex flex-col overflow-hidden border transition-all duration-300 ${h ? "border-primary/30 shadow-2xl shadow-sky-100/60" : "border-slate-100 shadow-lg"}`}
        onMouseEnter={() => setH(true)}
        onMouseLeave={() => setH(false)}
      >
        <div className={`absolute top-0 left-6 right-6 h-px bg-gradient-to-r from-transparent via-primary to-transparent transition-all duration-500 ${h ? "opacity-100" : "opacity-0"}`} />
        <div className={`absolute inset-0 bg-gradient-to-br from-sky-50/40 to-transparent transition-opacity duration-500 pointer-events-none ${h ? "opacity-100" : "opacity-0"}`} />

        <div className="relative px-5 sm:px-7 pt-6 pb-4 border-b border-slate-100">
          <div className={`w-12 h-12 flex items-center justify-center text-2xl mb-3 rounded-2xl transition-all duration-300 ${h ? "bg-primary/15 scale-110 rotate-3" : "bg-slate-50"}`}>🚚</div>
          <h3 className={`text-xl sm:text-2xl font-bold mb-1 transition-colors duration-200 ${h ? "text-primary" : "text-slate-900"}`}>
            {t("Pickup & Delivery", "Recogida y Entrega")}
          </h3>
          <p className="text-slate-400 text-sm">{t("Laundry, fully automated on your schedule.", "Lavandería automatizada en tu horario.")}</p>
        </div>

        {/* Mobile list */}
        <div className="flex-grow divide-y divide-slate-50">
          {rows.map((row, i) => (
            <div key={i} className={`px-5 py-3 ${row.isPopular ? "bg-sky-50/60" : ""}`}>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-sm font-semibold ${row.isPopular ? "text-primary" : "text-slate-700"}`}>{row.plan}</span>
                  {row.isPopular && <span className="text-[11px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded-full">⭐</span>}
                  <PlanBadge type={row.badge} t={t} />
                </div>
                <div className="flex items-center gap-3 ml-auto">
                  <div className="flex items-center gap-1">
                    <Star className="w-3 h-3 text-primary fill-primary/40" />
                    <span className="text-sm font-black text-primary">{row.memberPrice}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-slate-400">{t("Regular", "Regular")}</span>
                    <span className="text-sm font-semibold text-slate-500">{row.regularPrice}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="relative px-5 py-3 bg-slate-50 border-t border-slate-100">
          <ul className="space-y-1">
            {[
              t("✅ FREE delivery (0–3 miles)", "✅ Entrega GRATIS (0–3 millas)"),
              t("🚗 $2.99–$5.99 (3–10 miles)", "🚗 $2.99–$5.99 (3–10 millas)"),
              t("📦 Min. order $40", "📦 Pedido mínimo $40"),
            ].map((item, i) => (
              <li key={i} className="text-xs text-slate-500">{item}</li>
            ))}
          </ul>
        </div>

        <div className="relative px-5 sm:px-7 pb-6 pt-4">
          <Link to="/schedule-pickup">
            <button
              className="group w-full flex items-center justify-center gap-2 bg-primary text-white rounded-xl px-6 py-3.5 text-sm font-bold uppercase tracking-wider hover:bg-primary/90 active:scale-95 transition-all duration-300 shadow-md shadow-primary/20 overflow-hidden relative touch-manipulation"
              style={{ minHeight: "48px" }}
            >
              <span className="relative z-10 flex items-center gap-2">
                {t("SCHEDULE PICK-UP", "PROGRAMAR RECOGIDA")}
                <ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1" />
              </span>
              <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/15 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
            </button>
          </Link>
        </div>
      </div>
    </Tilt>
  );
};
// ─── Wash & Fold Service Card ─────────────────────────────────────────────────
const WashFoldServiceCard = ({ t }) => {
  const [h, setH] = useState(false);
  const rows = [
    { plan: t("Standard", "Estándar"), badge: "standard", price: "$2.25/lb", bestFor: t("Budget-friendly", "Económico") },
    { plan: t("Premium", "Premium"),   badge: "premium",  price: "$2.50/lb", bestFor: t("Most popular", "Más popular"), isPopular: true },
    { plan: t("Express", "Express"),   badge: "express",  price: "$2.75/lb", bestFor: t("Urgent orders", "Urgentes") },
  ];
  return (
    <Tilt depth={4}>
      <div
        className={`relative bg-white rounded-2xl h-full flex flex-col overflow-hidden border transition-all duration-300 ${h ? "border-primary/30 shadow-2xl shadow-sky-100/60" : "border-slate-100 shadow-lg"}`}
        onMouseEnter={() => setH(true)}
        onMouseLeave={() => setH(false)}
      >
        <div className={`absolute top-0 left-6 right-6 h-px bg-gradient-to-r from-transparent via-primary to-transparent transition-all duration-500 ${h ? "opacity-100" : "opacity-0"}`} />
        <div className={`absolute inset-0 bg-gradient-to-br from-sky-50/40 to-transparent transition-opacity duration-500 pointer-events-none ${h ? "opacity-100" : "opacity-0"}`} />

        <div className="relative px-5 sm:px-7 pt-6 pb-4 border-b border-slate-100">
          <div className={`w-12 h-12 flex items-center justify-center text-2xl mb-3 rounded-2xl transition-all duration-300 ${h ? "bg-primary/15 scale-110 rotate-3" : "bg-slate-50"}`}>🧺</div>
          <h3 className={`text-xl sm:text-2xl font-bold mb-1 transition-colors duration-200 ${h ? "text-primary" : "text-slate-900"}`}>
            {t("Wash • Dry • Fold", "Lavar • Secar • Doblar")}
          </h3>
          <p className="text-slate-400 text-sm">{t("Professional care without lifting a finger.", "Cuidado profesional sin mover un dedo.")}</p>
        </div>

        <div className="flex-grow divide-y divide-slate-50">
          {rows.map((row, i) => (
            <div key={i} className={`px-5 py-3 flex items-center justify-between gap-2 ${row.isPopular ? "bg-sky-50/60" : ""}`}>
              <div className="flex items-center gap-2 flex-wrap min-w-0">
                <span className={`text-sm font-semibold ${row.isPopular ? "text-primary" : "text-slate-700"}`}>{row.plan}</span>
                {row.isPopular && <span className="text-[11px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded-full">⭐</span>}
                <PlanBadge type={row.badge} t={t} />
              </div>
              <span className="text-lg font-black text-primary ml-2 whitespace-nowrap">{row.price}</span>
            </div>
          ))}
        </div>

        <div className="relative px-5 py-2 bg-slate-50 border-t border-slate-100 text-xs text-slate-500">
          {t("Professional care · Minimum 10 lb per order", "Cuidado profesional · Mínimo 10 lb por orden")}
        </div>
        <div className="relative px-5 py-2 bg-slate-50 border-t border-slate-100 text-xs text-slate-500">
          {t("Monday – Sunday · 8:00 AM – 6:00 PM", "Lunes – Domingo · 8:00 AM – 6:00 PM")}
        </div>

        <div className="relative px-5 sm:px-7 pb-6 pt-4">
          <Link to="/schedule-pickup">
            <button
              className="group w-full flex items-center justify-center gap-2 bg-slate-900 text-white rounded-xl px-6 py-3.5 text-sm font-bold uppercase tracking-wider hover:bg-slate-800 active:scale-95 transition-all duration-300 shadow-md overflow-hidden relative touch-manipulation"
              style={{ minHeight: "48px" }}
            >
              <span className="relative z-10 flex items-center gap-2">
                {t("DROP OFF / SCHEDULE", "ENTREGA / PROGRAMAR")}
                <ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1" />
              </span>
              <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
            </button>
          </Link>
        </div>
      </div>
    </Tilt>
  );
};

// ─── Pickup & Delivery Service Card (formato columnas horizontales) ──────────
const PickupDeliveryServiceCardHead = ({ t }) => {
  const [h, setH] = useState(false);
  const tiers = [
    { name: t("Standard", "Estándar"), time: "36 h" },
    { name: t("Premium", "Premium"),   time: "24 h" },
    { name: t("Express", "Express"),   time: t("Same day","Mismo día") },
  ];
  return (
    <Tilt depth={4}>
      <div
        className={`relative bg-white rounded-2xl h-full flex flex-col overflow-hidden border transition-all duration-300 ${h ? "border-primary/30 shadow-2xl shadow-sky-100/60" : "border-slate-100 shadow-lg"}`}
        onMouseEnter={() => setH(true)}
        onMouseLeave={() => setH(false)}
      >
        <div className={`absolute top-0 left-6 right-6 h-px bg-gradient-to-r from-transparent via-primary to-transparent transition-all duration-500 ${h ? "opacity-100" : "opacity-0"}`} />
        <div className={`absolute inset-0 bg-gradient-to-br from-sky-50/40 to-transparent transition-opacity duration-500 pointer-events-none ${h ? "opacity-100" : "opacity-0"}`} />

        {/* Header */}
        <div className="relative px-5 sm:px-7 pt-6 pb-4 border-b border-slate-100">
          <div className={`w-12 h-12 flex items-center justify-center text-2xl mb-3 rounded-2xl transition-all duration-300 ${h ? "bg-primary/15 scale-110 rotate-3" : "bg-slate-50"}`}>🚚</div>
          <h3 className={`text-xl sm:text-2xl font-bold mb-1 transition-colors duration-200 ${h ? "text-primary" : "text-slate-900"}`}>
            {t("Pickup & Delivery", "Recogida y Entrega")}
          </h3>
          <p className="text-slate-400 text-sm">{t("Laundry, fully automated on your schedule.", "Lavandería automatizada en tu horario.")}</p>
        </div>

        {/* Tier grid: 3 columnas horizontales */}
        <div className="grid grid-cols-3 divide-x divide-slate-100 border-b border-slate-100">
          {tiers.map((tier, idx) => (
            <div key={idx} className="px-3 py-4 text-center">
              <div className="text-sm font-semibold text-slate-700 mb-1">{tier.name}</div>
              <div className="text-xl font-black text-primary">{tier.time}</div>
            </div>
          ))}
        </div>

        {/* Delivery info (bullets) */}
        <div className="relative px-5 py-3 bg-slate-50 border-t border-slate-100">
          <ul className="space-y-1.5">
            <li className="text-xs text-slate-600 flex items-center gap-2">
              <span className="text-green-600 text-sm">✅</span> {t("FREE delivery (0–3 miles)", "Entrega GRATIS (0–3 millas)")}
            </li>
            <li className="text-xs text-slate-600 flex items-center gap-2">
              <span className="text-red-500 text-sm">❌</span> {t("$2.99–$5.99 (3–10 miles)", "$2.99–$5.99 (3–10 millas)")}
            </li>
            <li className="text-xs text-slate-600 flex items-center gap-2">
              <span className="text-amber-500 text-sm">⚠️</span> {t("Min. order $40", "Pedido mínimo $40")}
            </li>
          </ul>
        </div>

        {/* Regular / Member prices row (como en la imagen) */}
        <div className="relative px-5 py-3 bg-white border-t border-slate-100 flex justify-between items-center">
<span className="text-base font-medium text-black-600">{t("Regular", "Regular")}</span>
<span className="text-base font-medium text-sky-600">{t("Member", "Miembro")}</span>
        </div>

        {/* Button */}
        <div className="relative px-5 sm:px-7 pb-6 pt-2">
          <Link to="/schedule-pickup">
            <button
              className="group w-full flex items-center justify-center gap-2 bg-primary text-white rounded-xl px-6 py-3.5 text-sm font-bold uppercase tracking-wider hover:bg-primary/90 active:scale-95 transition-all duration-300 shadow-md shadow-primary/20 overflow-hidden relative touch-manipulation"
              style={{ minHeight: "48px" }}
            >
              <span className="relative z-10 flex items-center gap-2">
                {t("SCHEDULE PICK-UP", "PROGRAMAR RECOGIDA")}
                <ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1" />
              </span>
              <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/15 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
            </button>
          </Link>
        </div>
      </div>
    </Tilt>
  );
};
// ─── Wash & Fold Service Card (formato columnas horizontales, sin etiqueta flotante) ───
// ─── Wash & Fold Service Card (formato columnas horizontales, sin etiqueta flotante) ───
const WashFoldServiceCardHead = ({ t }) => {
  const [h, setH] = useState(false);
  const tiers = [
    { name: t("Standard", "Estándar"),  time: "24–36 h", isPopular: false },
    { name: t("Premium", "Premium"),    time: "12–24 h", isPopular: true },
    { name: t("Express", "Express"),    time: t("Same day", "Mismo día"), isPopular: false },
  ];
  return (
    <Tilt depth={4}>
      <div
        className={`relative bg-white rounded-2xl h-full flex flex-col overflow-hidden border transition-all duration-300 ${h ? "border-primary/30 shadow-2xl shadow-sky-100/60" : "border-slate-100 shadow-lg"}`}
        onMouseEnter={() => setH(true)}
        onMouseLeave={() => setH(false)}
      >
        <div className={`absolute top-0 left-6 right-6 h-px bg-gradient-to-r from-transparent via-primary to-transparent transition-all duration-500 ${h ? "opacity-100" : "opacity-0"}`} />
        <div className={`absolute inset-0 bg-gradient-to-br from-sky-50/40 to-transparent transition-opacity duration-500 pointer-events-none ${h ? "opacity-100" : "opacity-0"}`} />

        {/* Header */}
        <div className="relative px-5 sm:px-7 pt-6 pb-4 border-b border-slate-100">
          <div className={`w-12 h-12 flex items-center justify-center text-2xl mb-3 rounded-2xl transition-all duration-300 ${h ? "bg-primary/15 scale-110 rotate-3" : "bg-slate-50"}`}>🧺</div>
          <h3 className={`text-xl sm:text-2xl font-bold mb-1 transition-colors duration-200 ${h ? "text-primary" : "text-slate-900"}`}>
            {t("Wash • Dry • Fold", "Lavar • Secar • Doblar")}
          </h3>
          <p className="text-slate-400 text-sm">{t("Professional care without lifting a finger.", "Cuidado profesional sin mover un dedo.")}</p>
        </div>

        {/* Tier grid: 3 columnas horizontales */}
        <div className="grid grid-cols-3 divide-x divide-slate-100 border-b border-slate-100">
          {tiers.map((tier, idx) => (
            <div key={idx} className="px-3 py-4 text-center">
              <div className="text-sm font-semibold text-slate-700 mb-1">
                {tier.name}
                {tier.isPopular && <span className="ml-1 text-primary text-xs">⭐</span>}
              </div>
              <div className="text-xl font-black text-primary mb-0.5">{tier.price}</div>
              <div className="text-xs text-slate-400">{tier.time}</div>
            </div>
          ))}
        </div>

        {/* Información adicional */}
        <div className="relative px-5 py-2 bg-slate-50 border-t border-slate-100 text-xs text-slate-500">
          {t("Professional care · Minimum 10 lb per order", "Cuidado profesional · Mínimo 10 lb por orden")}
        </div>
        <div className="relative px-5 py-2 bg-slate-50 border-t border-slate-100 text-xs text-slate-500">
          {t("Monday – Sunday · 8:00 AM – 6:00 PM", "Lunes – Domingo · 8:00 AM – 6:00 PM")}
        </div>

        {/* Botón */}
        <div className="relative px-5 sm:px-7 pb-6 pt-4">
          <Link to="/schedule-pickup">
            <button
              className="group w-full flex items-center justify-center gap-2 bg-slate-900 text-white rounded-xl px-6 py-3.5 text-sm font-bold uppercase tracking-wider hover:bg-slate-800 active:scale-95 transition-all duration-300 shadow-md overflow-hidden relative touch-manipulation"
              style={{ minHeight: "48px" }}
            >
              <span className="relative z-10 flex items-center gap-2">
                {t("DROP OFF / SCHEDULE", "ENTREGA / PROGRAMAR")}
                <ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1" />
              </span>
              <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
            </button>
          </Link>
        </div>
      </div>
    </Tilt>
  );
};

// ─── Membership Card ──────────────────────────────────────────────────────────
const MembershipCard = ({ plan, price, image, features, isPopular }) => {
  const { t } = useLocale();
  const [h, setH] = useState(false);
  return (
    <Tilt depth={isPopular ? 4 : 3}>
      <div
        className={`relative bg-white rounded-2xl overflow-hidden h-full flex flex-col transition-all duration-300 ${
          isPopular
            ? "border-2 border-primary shadow-2xl shadow-primary/20 sm:scale-105 md:scale-110 z-10"
            : "border border-slate-200 shadow-lg"
        } ${h ? "-translate-y-1" : ""}`}
        onMouseEnter={() => setH(true)}
        onMouseLeave={() => setH(false)}
      >
        {isPopular && (
          <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 z-20">
            <div className="flex items-center gap-1.5 bg-gradient-to-r from-primary to-sky-400 text-white px-3 sm:px-4 py-1.5 rounded-full text-[11px] font-black uppercase tracking-widest shadow-lg whitespace-nowrap">
              <Star className="w-3 h-3 fill-white flex-shrink-0" />
              {t("MOST POPULAR", "MÁS POPULAR")}
            </div>
          </div>
        )}
        <div className={`h-36 overflow-hidden flex items-center justify-center p-4 ${isPopular ? "bg-gradient-to-br from-sky-50 to-primary/5" : "bg-gradient-to-br from-slate-50 to-slate-100/50"}`}>
          <img
            src={image}
            alt={`${plan} – Ventura Fresh Laundry`}
            className={`max-w-full max-h-full object-contain transition-transform duration-500 ${h ? "scale-110" : ""}`}
            loading="lazy"
          />
        </div>
        <div className="p-4 sm:p-6 flex flex-col flex-grow">
          <h2 className={`text-base sm:text-xl font-black mb-1 transition-colors duration-200 ${h ? "text-primary" : "text-slate-900"}`}>{plan}</h2>
          <p className="text-2xl sm:text-3xl font-black text-primary mb-4">{price}</p>
          <ul className="space-y-2 flex-grow">
            {features.map((f, i) => (
              <li key={i} className="flex items-start gap-2 text-xs sm:text-sm text-slate-500">
                <Check className={`w-4 h-4 flex-shrink-0 mt-0.5 transition-colors duration-200 ${h ? "text-primary" : "text-sky-400"}`} />
                {f}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Tilt>
  );
};

// ─── Pricing Tables ───────────────────────────────────────────────────────────
const WashFoldTable = ({ t }) => {
  const rows = [
    { plan: t("Standard", "Estándar"), badge: "standard", price: "$2.25/lb", bestFor: t("Budget-friendly", "Económico") },
    { plan: t("Premium", "Premium"),   badge: "premium",  price: "$2.50/lb", bestFor: t("Most popular", "Más popular"), isPopular: true },
    { plan: t("Express", "Express"),   badge: "express",  price: "$2.75/lb", bestFor: t("Urgent orders", "Urgentes") },
  ];
  return (
    <div className="bg-white rounded-2xl overflow-hidden border border-slate-100 shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300 h-full flex flex-col">
      <div className="px-5 pt-5 pb-3 border-b border-slate-100">
        <p className="text-[11px] font-bold uppercase tracking-widest text-primary/50 mb-1">{t("In-Store Service", "Servicio en Tienda")}</p>
        <h3 className="text-lg sm:text-xl font-bold text-slate-900">{t("🧼 Wash & Fold", "🧼 Lavado y Doblado")}</h3>
      </div>
      {/* Mobile */}
      <div className="flex-grow divide-y divide-slate-50">
        {rows.map((row, i) => (
          <div key={i} className={`px-5 py-3 flex items-center justify-between gap-2 ${row.isPopular ? "bg-sky-50/50" : ""}`}>
            <div className="flex items-center gap-2 flex-wrap min-w-0">
              <span className={`text-sm font-semibold ${row.isPopular ? "text-primary" : "text-slate-700"}`}>{row.plan}</span>
              {row.isPopular && <span className="text-[11px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded-full">⭐</span>}
              <PlanBadge type={row.badge} t={t} />
            </div>
            <div className="flex flex-col items-end">
              <span className="text-base font-black text-primary whitespace-nowrap">{row.price}</span>
              <span className="text-xs text-slate-400">{row.bestFor}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="px-5 py-3 bg-slate-50 border-t border-slate-100">
        <p className="text-xs text-slate-400">{t("Professional care · minimum 10 lb per order", "Cuidado profesional · mínimo 10 lb por orden")}</p>
      </div>
    </div>
  );
};

const PickupDeliveryTable = ({ t }) => {
  const rows = [
    { plan: t("Standard", "Estándar"), badge: "standard", memberPrice: "$2.50/lb", regularPrice: "$2.75/lb" },
    { plan: t("Premium", "Premium"),   badge: "premium",  memberPrice: "$2.75/lb", regularPrice: "$3.00/lb", isPopular: true },
    { plan: t("Express", "Express"),   badge: "express",  memberPrice: "$3.00/lb", regularPrice: "$3.25/lb" },
  ];
  return (
    <div className="bg-white rounded-2xl overflow-hidden border border-slate-100 shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300 h-full flex flex-col">
      <div className="px-5 pt-5 pb-3 border-b border-slate-100">
        <p className="text-[11px] font-bold uppercase tracking-widest text-primary/50 mb-1">{t("Door to Door", "Puerta a Puerta")}</p>
        <h3 className="text-lg sm:text-xl font-bold text-slate-900">{t("🚚 Pickup & Delivery", "🚚 Recogida y Entrega")}</h3>
      </div>
      <div className="flex-grow divide-y divide-slate-50">
        {rows.map((row, i) => (
          <div key={i} className={`px-5 py-3 ${row.isPopular ? "bg-sky-50/50" : ""}`}>
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className={`text-sm font-semibold ${row.isPopular ? "text-primary" : "text-slate-700"}`}>{row.plan}</span>
              {row.isPopular && <span className="text-[11px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded-full">⭐</span>}
              <PlanBadge type={row.badge} t={t} />
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Star className="w-3 h-3 text-primary fill-primary/40 flex-shrink-0" />
                <span className="text-xs text-slate-500">{t("Members", "Miembros")}</span>
                <span className="text-sm font-black text-primary">{row.memberPrice}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-slate-400">{t("Regular", "Regular")}</span>
                <span className="text-sm font-semibold text-slate-500">{row.regularPrice}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="border-t border-slate-100">
        <div className="px-5 py-3 bg-sky-50/30">
          <p className="text-[11px] font-bold uppercase tracking-widest text-primary/60 mb-1.5 flex items-center gap-1">
            <Star className="w-3 h-3 fill-primary/30 text-primary" />{t("Members", "Miembros")}
          </p>
          <ul className="space-y-0.5">
            {[
              t("✅ FREE (0–3 miles)", "✅ GRATIS (0–3 millas)"),
              t("🚗 $2.99–$5.99 (3–10 miles)", "🚗 $2.99–$5.99 (3–10 millas)"),
              t("📦 Min. order $40", "📦 Pedido mínimo $40"),
            ].map((item, i) => <li key={i} className="text-xs text-slate-600">{item}</li>)}
          </ul>
        </div>
      </div>
    </div>
  );
};

const ExpressServiceBlock = ({ t }) => (
  <div className="my-6 sm:my-10 rounded-2xl overflow-hidden shadow-2xl">
    <div className="bg-gradient-to-r from-sky-900 to-blue-900 p-6 sm:p-8 md:p-12 text-center text-white relative">
      <div className="absolute inset-0 opacity-10 bg-[url('https://images.unsplash.com/photo-1545173168-9f1947eebb7f?w=1920&h=1080&fit=crop')] bg-cover bg-center" />
      <div className="relative z-10">
        <div className="inline-flex items-center gap-2 bg-white/20 backdrop-blur-sm rounded-full px-4 py-1.5 mb-4 sm:mb-6">
          <Zap className="w-4 h-4 text-yellow-300 fill-yellow-300 flex-shrink-0" />
          <span className="text-[11px] font-bold uppercase tracking-wider">{t("Express Service", "Servicio Express")}</span>
        </div>
        <h3 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-2 sm:mb-3">{t("⚡ Need it today?", "⚡ ¿Lo necesitas hoy?")}</h3>
        <p className="text-white/80 text-sm sm:text-lg mb-5 sm:mb-8">{t("Same Day Service Available", "Servicio disponible el mismo día")}</p>

        <div className="flex flex-col sm:flex-row justify-center gap-2 sm:gap-4 mb-5 sm:mb-8">
          {[
            { label: t("In-Store", "En Tienda"), price: "$2.75/lb" },
            { label: t("Members P&D", "Miembros R&E"), price: "$3.00/lb" },
            { label: t("Regular P&D", "Regular R&E"), price: "$3.25/lb" },
          ].map((chip, i) => (
            <div key={i} className="bg-white/15 backdrop-blur-sm border border-white/25 rounded-xl px-5 py-3 flex sm:flex-col items-center justify-between sm:justify-center gap-2 sm:gap-1 sm:min-w-[110px]">
              <p className="text-xs text-white/60 uppercase tracking-wider">{chip.label}</p>
              <p className="text-xl font-black text-white">{chip.price}</p>
            </div>
          ))}
        </div>

        <ul className="flex flex-wrap justify-center gap-3 sm:gap-6 text-xs sm:text-sm mb-5 sm:mb-8">
          {[
            t("Priority processing", "Procesamiento prioritario"),
            t("Fast turnaround", "Respuesta rápida"),
            t("Limited capacity", "Capacidad limitada"),
          ].map((item, i) => (
            <li key={i} className="flex items-center gap-1.5 sm:gap-2">
              <Check className="w-4 h-4 text-sky-300 flex-shrink-0" />{item}
            </li>
          ))}
        </ul>

        <Link to="/schedule-pickup?express=true">
          <Mag
            as="div"
            strength={0.2}
            className="inline-flex items-center gap-2 bg-white text-sky-900 rounded-full px-6 sm:px-8 py-3 font-bold text-sm uppercase tracking-wider shadow-lg hover:shadow-xl transition-all hover:-translate-y-0.5 active:scale-95 touch-manipulation"
            style={{ minHeight: "48px" }}
          >
            {t("Book Express Service", "Reservar Servicio Express")} <ArrowRight className="w-4 h-4" />
          </Mag>
        </Link>
      </div>
    </div>
  </div>
);

const SelfServiceTable = ({ t, washerPrices, dryerPrices }) => (
  <div className="bg-white rounded-2xl overflow-hidden border border-slate-100 shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300 h-full flex flex-col">
    <div className="px-5 pt-5 pb-3 border-b border-slate-100">
      <p className="text-[11px] font-bold uppercase tracking-widest text-primary/50 mb-1">{t("Walk-in", "Presencial")}</p>
      <h3 className="text-lg sm:text-xl font-bold text-slate-900">{t("🏪 Self-Service", "🏪 Autoservicio")}</h3>
      <p className="text-slate-400 text-xs mt-1">{t("Open 6:00 AM – 10:00 PM", "Abierto 6:00 AM – 10:00 PM")}</p>
    </div>
    <div className="flex-grow grid grid-cols-2 divide-x divide-slate-100">
      <div className="p-4">
        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-1.5">
          <span className="w-0.5 h-4 bg-primary rounded-full inline-block flex-shrink-0" />{t("Washers", "Lavadoras")}
        </p>
        <table className="w-full">
          <tbody>
            {washerPrices.map((it, i) => (
              <tr key={i} className="border-b border-slate-50 last:border-0 hover:bg-sky-50/30 transition-colors group">
                <td className="py-2 text-xs text-slate-500 group-hover:text-slate-700 pr-1 leading-tight">{it.size}</td>
                <td className="py-2 text-right text-xs font-bold text-slate-800 group-hover:text-primary transition-colors whitespace-nowrap">{it.price}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="p-4">
        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-1.5">
          <span className="w-0.5 h-4 bg-sky-300 rounded-full inline-block flex-shrink-0" />{t("Dryers", "Secadoras")}
        </p>
        <table className="w-full">
          <tbody>
            {dryerPrices.map((it, i) => (
              <tr key={i} className="border-b border-slate-50 last:border-0 hover:bg-sky-50/30 transition-colors group">
                <td className="py-2 text-xs text-slate-500 group-hover:text-slate-700 pr-1">{it.size}</td>
                <td className="py-2 text-right text-xs font-bold text-slate-800 group-hover:text-primary transition-colors whitespace-nowrap">{it.price}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-[11px] text-slate-400 mt-2">{t("+6 min extra: $0.25", "+6 min extra: $0.25")}</p>
      </div>
    </div>
  </div>
);

const PerPieceTable = ({ t, categories }) => (
  <div className="bg-white rounded-2xl overflow-hidden border border-slate-100 shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300 h-full flex flex-col">
    <div className="px-5 pt-5 pb-3 border-b border-slate-100">
      <p className="text-[11px] font-bold uppercase tracking-widest text-primary/50 mb-1">{t("Individual Items", "Artículos Individuales")}</p>
      <h3 className="text-lg sm:text-xl font-bold text-slate-900">{t("🧺 Per Piece Pricing", "🧺 Precio por Pieza")}</h3>
    </div>
    <div className="flex-grow grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-slate-100">
      {categories.map((cat, ci) => (
        <div key={ci} className="p-4">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 border-b-2 border-primary/15 pb-2 mb-3">{cat.category}</p>
          <table className="w-full">
            <tbody>
              {cat.items.map((it, i) => (
                <tr key={i} className="border-b border-slate-50 last:border-0 hover:bg-sky-50/30 transition-colors group">
                  <td className="py-2 text-xs text-slate-500 group-hover:text-slate-700 pr-2 leading-tight">{it.name}</td>
                  <td className="py-2 text-right text-xs font-bold text-slate-800 group-hover:text-primary transition-colors whitespace-nowrap">{it.price}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
    <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 text-center">
      <Link to="/schedule-pickup" className="inline-flex items-center gap-1.5 text-sm text-primary hover:text-sky-600 font-semibold transition-colors group">
        {t("Special items? Contact us", "¿Artículos especiales? Contáctanos")}
        <ArrowRight className="w-3.5 h-3.5 transition-transform duration-200 group-hover:translate-x-1" />
      </Link>
    </div>
  </div>
);

const DarkSection = ({ children, bgImage, from = "from-sky-950/92", to = "to-sky-900/88", scrollY = 0, parallaxStrength = 0.15 }) => (
  <section className="py-16 sm:py-20 relative overflow-hidden bg-sky-950">
    <div
      className="absolute inset-0 will-change-transform"
      style={{
        backgroundImage: `url('${bgImage}')`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        transform: `translateY(${scrollY * parallaxStrength}px) scale(1.08)`,
      }}
    />
    <div className="absolute inset-0 bg-sky-950/80" />
    <div className={`absolute inset-0 bg-gradient-to-br ${from} ${to}`} />
    <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: "radial-gradient(rgba(255,255,255,0.8) 1px,transparent 1px)", backgroundSize: "28px 28px" }} />
    <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">{children}</div>
  </section>
);

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────
export default function ServicesPage() {
  const { t, locale } = useLocale();
  const [openAccordions, setOpenAccordions] = useState({ b2b: 0, commercial: 0, airbnb: 0 });
  const [membershipSection, setMembershipSection] = useState(null);
  const [membershipPlans, setMembershipPlans] = useState([]);
  const [scrollY, setScrollY] = useState(0);
  const { ring, dot } = useCursor();

  useEffect(() => {
    let tick = false;
    const fn = () => {
      if (!tick) {
        requestAnimationFrame(() => { setScrollY(window.pageYOffset); tick = false; });
        tick = true;
      }
    };
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);

  const MEMBERSHIP_SECTION_DEFAULT = {
    heading: t("Flexible Plans for Every Home", "Planes flexibles para cada hogar"),
    subheading: null,
    special_title: t("🎉 New Member Special", "🎉 Oferta para nuevos miembros"),
    special_text: t("$10 OFF your first month on any membership.", "$10 de descuento en tu primer mes en cualquier membresía."),
    cta_title: t("Need help choosing?", "¿Necesitas ayuda para elegir?"),
    cta_text: t("Just call, text, or email us at", "Solo llama, envíanos un mensaje o escríbenos a"),
    cta_button_label: t("👉 BECOME A MEMBER", "👉 CONVIÉRTETE EN MIEMBRO"),
    cta_button_url: "/membership",
    contact_phone: "(820) 234-8181",
    is_active: true,
  };

  const DEFAULT_MEMBERSHIP_PLANS = [
    {
      plan: t("FAMILY PLUS", "FAMILY PLUS"), price: "$219 / month",
      image: "https://images.squarespace-cdn.com/content/v1/696c559a4b2b9b1b0febf8d7/f262a5b8-0043-4977-9d32-d6b343be3e70/FAMILY+PLUS.png",
      features: [t("Up to 90 lb/ month", "Hasta 90 lb/ mes"), t("Priority scheduling", "Programación prioritaria"), t("Saved preferences", "Preferencias guardadas"), t("Great for larger households or rentals", "Ideal para hogares grandes")],
      isPopular: false,
    },
    {
      plan: t("MOST POPULAR", "MÁS POPULAR"), price: "$149 / month",
      image: "https://images.squarespace-cdn.com/content/v1/696c559a4b2b9b1b0febf8d7/4a2815a1-54c1-45fb-8320-244dce8b83c8/MOST+POPULAR.png",
      features: [t("Up to 60 lb/ month", "Hasta 60 lb/ mes"), t("Basic preferences saved", "Preferencias básicas guardadas"), t("Best value for most families", "Mejor valor para la mayoría")],
      isPopular: true,
    },
    {
      plan: t("ELITE CONCIERGE", "ELITE CONCIERGE"), price: "$299 / month",
      image: "https://images.squarespace-cdn.com/content/v1/696c559a4b2b9b1b0febf8d7/13a4c501-7792-4f72-bf5c-072f95b5f995/ELITE+CONCIERGE.png",
      features: [t("Up to 120 lb/ month", "Hasta 120 lb/ mes"), t("Priority turnaround", "Respuesta prioritaria"), t("Premium packaging", "Empaque premium"), t("Saved preferences", "Preferencias guardadas"), t("1 emergency pickup", "1 recogida de emergencia")],
      isPopular: false,
    },
  ];

  const PER_PIECE_CATEGORIES = [
    {
      category: t("Home Essentials", "Artículos del hogar"),
      items: [{ name: t("Bath Mat", "Tapete de baño"), price: "$5.00" }, { name: t("Cooking Glove", "Guante de cocina"), price: "$5.00" }, { name: t("Pet Bed (Small)", "Cama mascotas (S)"), price: "$5.00" }, { name: t("Pet Bed (M/L)", "Cama mascotas (M/L)"), price: "$8.00" }],
    },
    {
      category: t("Bedding", "Ropa de cama"),
      items: [{ name: t("Standard Pillow", "Almohada estándar"), price: "$8.00" }, { name: t("Large Pillow", "Almohada grande"), price: "$10.00" }, { name: t("Duvet Cover", "Funda de edredón"), price: "$8.00" }, { name: t("Blanket", "Manta"), price: "$10.00" }],
    },
    {
      category: t("Comforters", "Edredones"),
      items: [{ name: t("Comforter T/D/Q", "Edredón T/D/Q"), price: "$18.00" }, { name: t("Comforter King", "Edredón King"), price: "$20.00" }, { name: t("Mattress Cover", "Cubrecama"), price: "$20.00" }, { name: t("Down Comforters", "Edredones plumas"), price: "$40.00" }],
    },
  ];

  const WASHER_PRICES = [
    { size: t("20 lb (2 loads)", "20 lb (2 cargas)"), price: "$4.00" },
    { size: t("30 lb (3 loads)", "30 lb (3 cargas)"), price: "$5.25" },
    { size: t("40 lb (4 loads)", "40 lb (4 cargas)"), price: "$6.00" },
    { size: t("60 lb (6 loads)", "60 lb (6 cargas)"), price: "$7.75" },
    { size: t("90 lb (9 loads)", "90 lb (9 cargas)"), price: "$11.25" },
  ];

  const DRYER_PRICES = [
    { size: "30 lb", price: "$2.25" },
    { size: "50 lb", price: "$2.50" },
    { size: "80 lb", price: "$3.00" },
  ];

  const toggleAcc = (sec, idx) => setOpenAccordions(p => ({ ...p, [sec]: p[sec] === idx ? -1 : idx }));

  useEffect(() => {
    const load = async () => {
      try {
        const [sR, pR] = await Promise.all([
          fetch(`${process.env.REACT_APP_BACKEND_URL}/api/public/membership-section`),
          fetch(`${process.env.REACT_APP_BACKEND_URL}/api/public/membership-plans`),
        ]);
        if (sR.ok) { const d = await sR.json(); setMembershipSection({ ...d, heading: t(d.heading, d.heading) }); }
        else setMembershipSection(MEMBERSHIP_SECTION_DEFAULT);
        if (pR.ok) { const d = await pR.json(); setMembershipPlans(d.map(p => ({ plan: t(p.name, p.name), price: p.price, image: p.image_url, features: (p.features || []).map(f => t(f, f)), isPopular: p.is_popular }))); }
        else setMembershipPlans(DEFAULT_MEMBERSHIP_PLANS);
      } catch {
        setMembershipSection(MEMBERSHIP_SECTION_DEFAULT);
        setMembershipPlans(DEFAULT_MEMBERSHIP_PLANS);
      }
    };
    load();
  }, [locale]);

  const MS = membershipSection || MEMBERSHIP_SECTION_DEFAULT;
  const plans = membershipPlans.length > 0 ? membershipPlans : DEFAULT_MEMBERSHIP_PLANS;
  const marqueeItems = [
    t("Pickup & Delivery", "Recogida y Entrega"),
    t("Wash & Fold", "Lavado y Doblado"),
    t("Airbnb Specialists", "Especialistas Airbnb"),
    t("B2B Solutions", "Soluciones B2B"),
    t("Self Service", "Autoservicio"),
    t("Ventura County", "Condado de Ventura"),
  ];

  return (
    <>
      <style>{`
        body { overflow-x: hidden; width: 100%; }
        .line-clamp-2 { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>

      {/* Custom cursor — solo desktop */}
      <div className="pointer-events-none fixed inset-0 z-[9999] hidden lg:block">
        <div ref={ring} className="absolute w-9 h-9 rounded-full border border-primary/50 will-change-transform" style={{ top: 0, left: 0 }} />
        <div ref={dot} className="absolute w-1.5 h-1.5 rounded-full bg-primary will-change-transform" style={{ top: 0, left: 0 }} />
      </div>

      <div className="min-h-screen bg-white overflow-x-hidden">
        <PublicNav />

        {/* ══ HERO ══ */}
        <section className="relative min-h-[55vh] sm:min-h-[65vh] flex items-end justify-center overflow-hidden">
          <div
            className="absolute inset-0 will-change-transform"
            style={{
              backgroundImage: "url('https://images.unsplash.com/photo-1545173168-9f1947eebb7f?w=1920&h=1080&fit=crop')",
              backgroundSize: "cover",
              backgroundPosition: "center",
              transform: `translateY(${scrollY * 0.18}px) scale(1.08)`,
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/92 via-slate-900/65 to-slate-800/30" />
          <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at center,transparent 40%,rgba(0,0,0,0.5) 100%)" }} />

          <div className="relative z-10 text-center px-4 sm:px-6 pb-12 sm:pb-20 max-w-5xl mx-auto w-full">
            <div
              className="inline-flex items-center gap-2 px-3 sm:px-4 py-2 rounded-full bg-white/10 backdrop-blur-md border border-white/20 mb-5 sm:mb-7"
              style={{ animation: "fadeUp 0.8s 0.1s both ease-out" }}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse flex-shrink-0" />
              <span className="text-[11px] text-white/65 font-bold uppercase tracking-[0.14em] sm:tracking-[0.18em]">
                {t("Our Services", "Nuestros Servicios")}
              </span>
            </div>
            <h1
              className="text-3xl sm:text-5xl md:text-6xl lg:text-7xl font-bold text-white leading-[1.08] mb-3 sm:mb-4 tracking-tight"
              style={{ animation: "fadeUp 0.9s 0.25s both ease-out" }}
            >
              {t("A clean space for", "Un espacio limpio para")}
              <span className="block font-bold">{t("everyone.", "todos.")}</span>
            </h1>
            <p
              className="text-sm sm:text-lg md:text-xl text-white/65 max-w-xl mx-auto font-medium"
              style={{ animation: "fadeUp 0.9s 0.4s both ease-out" }}
            >
              {t(
                "Self-service, wash & fold, pickup & delivery — tailored to your life.",
                "Autoservicio, lavado y doblado, recogida y entrega — adaptado a tu vida."
              )}
            </p>
          </div>

          <div className="absolute bottom-0 left-0 right-0 z-20">
            <svg viewBox="0 0 1440 90" preserveAspectRatio="none" className="w-full h-7 sm:h-14 lg:h-20">
              <path d="M0,45 C300,0 600,90 1440,45 L1440,90 L0,90 Z" fill="white" />
            </svg>
          </div>
        </section>

        <Marquee items={marqueeItems} />

        {/* ══ SERVICES GRID ══ */}
        <section className="py-12 sm:py-20 lg:py-24 relative overflow-hidden bg-white">
          <div className="relative z-10 max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-12">

            <Reveal dir="blur">
              <p className="text-center text-[11px] font-bold uppercase tracking-[0.18em] text-primary/50 mb-3">
                {t("Core Services", "Servicios Principales")}
              </p>
            </Reveal>
            <Reveal delay={80}>
              <h2 className="text-2xl sm:text-4xl lg:text-5xl font-bold text-slate-900 text-center mb-3 leading-tight">
                {t("Choose the option", "Elige la opción")}
                <span className="block text-primary font-bold">{t("that fits your day.", "que se adapte a tu día.")}</span>
              </h2>
            </Reveal>
            <Reveal delay={160}>
              <p className="text-slate-500 text-center mb-6 sm:mb-8 max-w-xl mx-auto text-sm sm:text-lg">
                {t("Walk-in, drop-off, or pickup & delivery — we've got you covered.", "Presencial, entrega o recogida — aquí estamos.")}
              </p>
            </Reveal>

            {/* Banners horizontales — móvil/tablet (< xl) */}
            <Reveal delay={180} dir="up" dur={500}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6 xl:hidden">
                <AdBannerHorizontal config={AD_CONFIG.left} />
                <AdBannerHorizontal config={AD_CONFIG.right} />
              </div>
            </Reveal>

            {/* Layout con banners verticales a los lados (xl+) */}
            <div className="flex gap-5 xl:gap-6 items-start">
              <AdBannerVertical config={AD_CONFIG.left} />

              <div className="flex-1 min-w-0">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 mb-4 sm:mb-8">
                  <Reveal delay={0} dir="up" dur={700}><PickupDeliveryServiceCardHead t={t} /></Reveal>
                  <Reveal delay={80} dir="up" dur={700}><WashFoldServiceCardHead t={t} /></Reveal>
                </div>

                <Reveal delay={160} dir="up" dur={700}>
                  <Tilt depth={3}>
                    <div className="relative bg-white rounded-2xl p-5 sm:p-8 border border-slate-100 shadow-lg overflow-hidden group hover:-translate-y-0.5 hover:shadow-xl hover:border-primary/20 transition-all duration-300">
                      <div className="absolute top-0 left-8 right-8 h-px bg-gradient-to-r from-transparent via-primary to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                      <div className="absolute inset-0 bg-gradient-to-br from-sky-50/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                      <div className="relative flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                        <div>
                          <div className="flex items-center gap-2.5 mb-2">
                            <div className="w-10 h-10 flex items-center justify-center text-xl bg-slate-50 group-hover:bg-primary/10 rounded-2xl transition-colors duration-300 flex-shrink-0">🏪</div>
                            <h3 className="text-lg sm:text-2xl font-bold text-slate-900 group-hover:text-primary transition-colors duration-200">
                              {t("Self-Service Laundry", "Lavandería de Autoservicio")}
                            </h3>
                          </div>
                          <p className="text-slate-500 text-sm pl-[50px] sm:pl-[52px]">
                            {t("Modern machines, fast dryers, hassle-free experience.", "Máquinas modernas, secadoras rápidas, sin complicaciones.")}
                          </p>
                        </div>
                        <div className="flex gap-5 sm:gap-8 flex-shrink-0 pl-[50px] sm:pl-0">
                          {[{ val: "6:00 AM", label: t("Open", "Abrimos") }, { val: "10:00 PM", label: t("Close", "Cerramos") }].map((h, i) => (
                            <div key={i} className="text-center">
                              <div className="text-lg sm:text-2xl font-black text-primary">{h.val}</div>
                              <div className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold">{h.label}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="relative grid grid-cols-1 sm:grid-cols-3 gap-2 mt-4 pt-4 border-t border-slate-100">
                        {[
                          t("Clean & well-maintained", "Limpio y bien mantenido"),
                          t("High-performance washers", "Lavadoras de alto rendimiento"),
                          t("Fast-drying machines", "Secadoras rápidas"),
                        ].map((item, i) => (
                          <div key={i} className="flex items-center gap-2 text-sm text-slate-600">
                            <Check className="h-4 w-4 text-sky-400 flex-shrink-0" />{item}
                          </div>
                        ))}
                      </div>
                    </div>
                  </Tilt>
                </Reveal>
              </div>

              <AdBannerVertical config={AD_CONFIG.right} />
            </div>

            <Reveal delay={120} dir="up"><ExpressServiceBlock t={t} /></Reveal>
          </div>
        </section>

        {/* ══ MEMBERSHIP ══ */}
        <section className="py-12 sm:py-20 lg:py-24 bg-gradient-to-b from-slate-50/60 to-white relative overflow-hidden">
          <div className="absolute inset-0 opacity-[0.4]" style={{ backgroundImage: "radial-gradient(rgba(14,165,233,0.08) 1px,transparent 1px)", backgroundSize: "24px 24px" }} />
          <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-12">
            <Reveal dir="blur">
              <p className="text-center text-[11px] font-bold uppercase tracking-[0.18em] text-primary/50 mb-3">{t("Membership", "Membresía")}</p>
            </Reveal>
            <Reveal delay={80}>
              <h2 className="text-2xl sm:text-4xl lg:text-5xl font-bold text-slate-900 text-center mb-3">{MS.heading}</h2>
            </Reveal>
            {MS.subheading && (
              <Reveal delay={140}>
                <p className="text-slate-500 text-center text-sm sm:text-lg mb-5">{MS.subheading}</p>
              </Reveal>
            )}
            {(MS.special_title || MS.special_text) && (
              <Reveal delay={180} dir="scale">
                <div className="relative overflow-hidden bg-gradient-to-r from-amber-50 to-yellow-50 rounded-2xl p-5 sm:p-6 max-w-2xl mx-auto border border-amber-200/60 mb-8 sm:mb-12 shadow-sm">
                  <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-amber-400/50 to-transparent" />
                  {MS.special_title && <h3 className="text-lg sm:text-2xl font-bold text-amber-800 mb-2">{MS.special_title}</h3>}
                  {MS.special_text && <p className="text-amber-700 text-sm sm:text-base leading-relaxed">{MS.special_text}</p>}
                </div>
              </Reveal>
            )}

            {/* Membership cards — 1 col móvil, 3 cols sm+ */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 sm:gap-6 items-center max-w-4xl mx-auto mb-10 sm:mb-14">
              {plans.map((plan, i) => (
                <Reveal key={i} delay={i * 90} dir="up" dur={700}>
                  <MembershipCard {...plan} />
                </Reveal>
              ))}
            </div>

            <Reveal delay={280} dir="scale">
              <div className="text-center bg-white rounded-2xl p-5 sm:p-8 shadow-lg max-w-2xl mx-auto border border-slate-100 hover:shadow-xl transition-shadow duration-300">
                <div className="w-10 h-10 sm:w-12 sm:h-12 mx-auto mb-4 bg-primary/10 rounded-2xl flex items-center justify-center">
                  <Shield className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />
                </div>
                {MS.cta_title && <h4 className="text-base sm:text-lg font-bold text-slate-900 mb-2">{MS.cta_title}</h4>}
                {MS.cta_text && (
                  <p className="text-slate-500 text-sm mb-5 sm:mb-6">
                    {MS.cta_text}{" "}
                    {MS.contact_phone && (
                      <a href={`tel:${MS.contact_phone.replace(/[^\d]/g, "")}`} className="text-primary font-bold hover:underline">
                        {MS.contact_phone}
                      </a>
                    )}
                  </p>
                )}
                {MS.cta_button_label && (() => {
                  const url = MS.cta_button_url || "/membership";
                  const isExt = /^https?:\/\//i.test(url);
                  const Inner = (
                    <Mag
                      as="div"
                      strength={0.22}
                      className="inline-flex items-center gap-2 overflow-hidden relative bg-primary text-white rounded-full px-7 sm:px-10 py-3.5 sm:py-4 text-sm font-bold uppercase tracking-widest shadow-lg shadow-primary/30 cursor-pointer hover:-translate-y-0.5 transition-transform duration-300 active:scale-95 group touch-manipulation"
                      style={{ minHeight: "48px" }}
                    >
                      <span className="relative z-10 flex items-center gap-2">
                        {MS.cta_button_label}
                        <ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1" />
                      </span>
                      <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/15 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
                    </Mag>
                  );
                  return isExt
                    ? <a href={url} target="_blank" rel="noopener noreferrer">{Inner}</a>
                    : <Link to={url}>{Inner}</Link>;
                })()}
              </div>
            </Reveal>
          </div>
        </section>

        {/* ══ AIRBNB ══ */}
        <DarkSection bgImage="https://images.unsplash.com/photo-1556910103-1c02745a2384?w=1920&h=1080&fit=crop" from="from-sky-950/92" to="to-sky-900/88" scrollY={scrollY}>
          <Reveal dir="blur">
            <p className="text-center text-[11px] font-bold uppercase tracking-[0.18em] text-sky-400/60 mb-4">{t("Airbnb & Rentals", "Airbnb y Alquileres")}</p>
          </Reveal>
          <Reveal delay={80}>
            <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold text-white text-center mb-4 leading-tight">
              {t("Premium Laundry for", "Lavandería Premium para")}
              <span className="block font-bold text-sky-300">{t("Airbnb Hosts.", "Anfitriones Airbnb.")}</span>
            </h2>
          </Reveal>
          <Reveal delay={160}>
            <p className="text-white/65 text-center mb-6 sm:mb-8 max-w-lg mx-auto text-sm sm:text-base leading-relaxed">
              {t("Spotless linens. Five-star guest experiences. Zero hassle.", "Ropa de cama impecable. Experiencias de cinco estrellas. Cero complicaciones.")}
            </p>
          </Reveal>
          <Reveal delay={240} dir="scale">
            <div className="bg-sky-950/80 rounded-2xl border border-white/15 p-4 sm:p-6 mb-6 sm:mb-8">
              <AccordionItem title={t("About This Service", "Sobre Este Servicio")} isOpen={openAccordions.airbnb === 0} onClick={() => toggleAcc("airbnb", 0)} variant="dark">
                <p className="text-white/65 text-sm leading-relaxed pt-1">
                  {t("Our Airbnb laundry service is built for hosts who want flawless turnovers and happier guests.", "Nuestro servicio está diseñado para anfitriones que quieren entregas impecables y huéspedes felices.")}
                </p>
              </AccordionItem>
              <AccordionItem title={t("Key Features", "Características Clave")} isOpen={openAccordions.airbnb === 1} onClick={() => toggleAcc("airbnb", 1)} variant="dark">
                <ul className="space-y-2 pt-1">
                  {[
                    t("Customized programs for Airbnb hosts", "Programas personalizados"),
                    t("Professional cleaning & sanitization", "Limpieza y sanitización profesional"),
                    t("Scheduled pickup aligned with turnover", "Recogida alineada con tu horario"),
                    t("Consistent quality for 5-star reviews", "Calidad constante para reseñas 5 estrellas"),
                    t("Save time, eliminate laundry stress", "Ahorra tiempo, elimina el estrés"),
                  ].map((item, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-sm text-white/65">
                      <Check className="w-4 h-4 text-sky-400 flex-shrink-0 mt-0.5" />{item}
                    </li>
                  ))}
                </ul>
              </AccordionItem>
            </div>
          </Reveal>
          <Reveal delay={340}>
            <div className="text-center">
              <Link to="/schedule-pickup">
                <Mag
                  as="div"
                  strength={0.2}
                  className="inline-flex items-center gap-2 overflow-hidden relative bg-white text-primary rounded-full px-7 sm:px-10 py-3.5 sm:py-4 text-sm font-bold uppercase tracking-widest shadow-xl cursor-pointer hover:-translate-y-0.5 transition-transform duration-300 active:scale-95 group touch-manipulation"
                  style={{ minHeight: "48px" }}
                >
                  <span className="relative z-10 flex items-center gap-2">
                    🗓️ {t("SCHEDULE PICK-UP", "PROGRAMAR RECOGIDA")}
                    <ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1" />
                  </span>
                  <span className="absolute inset-0 bg-gradient-to-r from-transparent via-primary/8 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
                </Mag>
              </Link>
            </div>
          </Reveal>
        </DarkSection>

        {/* ══ B2B ══ */}
        <DarkSection bgImage="https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=1920&h=1080&fit=crop" from="from-sky-950/92" to="to-indigo-950/88" scrollY={scrollY} parallaxStrength={0.12}>
          <Reveal dir="blur">
            <p className="text-center text-[11px] font-bold uppercase tracking-[0.18em] text-sky-400/60 mb-4">{t("B2B Solutions", "Soluciones B2B")}</p>
          </Reveal>
          <Reveal delay={80}>
            <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold text-white text-center mb-4 leading-tight">
              {t("High-Performance", "Alto Rendimiento")}
              <span className="block font-bold text-sky-300">{t("B2B Laundry.", "Lavandería B2B.")}</span>
            </h2>
          </Reveal>
          <Reveal delay={160}>
            <p className="text-white/65 text-center mb-6 sm:mb-8 max-w-lg mx-auto text-sm sm:text-base leading-relaxed">
              {t("Reliable, scalable, professional — built to handle volume every day.", "Confiable, escalable, profesional — para manejar volumen todos los días.")}
            </p>
          </Reveal>
          <Reveal delay={240} dir="scale">
            <div className="bg-sky-950/80 rounded-2xl border border-white/15 p-4 sm:p-6 mb-6 sm:mb-8">
              <AccordionItem title={t("About B2B Services", "Sobre Servicios B2B")} isOpen={openAccordions.b2b === 0} onClick={() => toggleAcc("b2b", 0)} variant="dark">
                <p className="text-white/65 text-sm leading-relaxed pt-1">
                  {t("We provide tailored B2B solutions that help businesses maintain the highest cleanliness standards.", "Ofrecemos soluciones B2B a medida que ayudan a las empresas a mantener los más altos estándares.")}
                </p>
              </AccordionItem>
              <AccordionItem title={t("Key Features", "Características Clave")} isOpen={openAccordions.b2b === 1} onClick={() => toggleAcc("b2b", 1)} variant="dark">
                <ul className="space-y-2 pt-1">
                  {[
                    t("Customized programs for all business sizes", "Programas para empresas de todos los tamaños"),
                    t("Commercial-grade washing & stain removal", "Lavado comercial y eliminación de manchas"),
                    t("Scheduled pickup & delivery", "Recogida y entrega programadas"),
                    t("Flexible volume, no long-term commitments", "Volumen flexible, sin compromisos"),
                    t("Priority support for business clients", "Soporte prioritario"),
                  ].map((item, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-sm text-white/65">
                      <Check className="w-4 h-4 text-sky-400 flex-shrink-0 mt-0.5" />{item}
                    </li>
                  ))}
                </ul>
              </AccordionItem>
            </div>
          </Reveal>
          <Reveal delay={340}>
            <div className="text-center">
              <Link to="/request-quote">
                <Mag
                  as="div"
                  data-testid="b2b-request-quote-button"
                  strength={0.2}
                  className="inline-flex items-center gap-2 overflow-hidden relative bg-white text-sky-700 rounded-full px-7 sm:px-10 py-3.5 sm:py-4 text-sm font-bold uppercase tracking-widest shadow-xl cursor-pointer hover:-translate-y-0.5 transition-transform duration-300 active:scale-95 group touch-manipulation"
                  style={{ minHeight: "48px" }}
                >
                  <span className="relative z-10 flex items-center gap-2">
                    📊 {t("REQUEST A QUOTE", "SOLICITAR COTIZACIÓN")}
                    <ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1" />
                  </span>
                  <span className="absolute inset-0 bg-gradient-to-r from-transparent via-sky-100/30 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
                </Mag>
              </Link>
            </div>
          </Reveal>
        </DarkSection>

        {/* ══ COMMERCIAL ══ */}
        <DarkSection bgImage="https://images.unsplash.com/photo-1521791055366-0d553872125f?w=1920&h=1080&fit=crop" from="from-sky-950/92" to="to-indigo-950/88" scrollY={scrollY} parallaxStrength={0.1}>
          <Reveal dir="blur">
            <p className="text-center text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400/70 mb-4">{t("Commercial Services", "Servicios Comerciales")}</p>
          </Reveal>
          <Reveal delay={80}>
            <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold text-white text-center mb-4 leading-tight">
              {t("Commercial Laundry", "Lavandería Comercial")}
              <span className="block font-bold text-slate-300">{t("You Can Depend On.", "En la que Puedes Confiar.")}</span>
            </h2>
          </Reveal>
          <Reveal delay={160}>
            <p className="text-white/65 text-center mb-6 sm:mb-8 max-w-lg mx-auto text-sm sm:text-base leading-relaxed">
              {t("Volume, quality, reliability — every single day.", "Volumen, calidad, confiabilidad — todos los días.")}
            </p>
          </Reveal>
          <Reveal delay={240} dir="scale">
            <div className="bg-sky-950/80 rounded-2xl border border-white/15 p-4 sm:p-6 mb-6 sm:mb-8">
              <AccordionItem title={t("About Commercial Services", "Sobre Servicios Comerciales")} isOpen={openAccordions.commercial === 0} onClick={() => toggleAcc("commercial", 0)} variant="dark">
                <p className="text-white/65 text-sm leading-relaxed pt-1">
                  {t("Designed for high-traffic businesses — restaurants, hotels, spas, gyms, offices.", "Diseñado para negocios de alto tráfico — restaurantes, hoteles, spas, gimnasios.")}
                </p>
              </AccordionItem>
              <AccordionItem title={t("Key Features", "Características Clave")} isOpen={openAccordions.commercial === 1} onClick={() => toggleAcc("commercial", 1)} variant="dark">
                <ul className="space-y-2 pt-1">
                  {[
                    t("Restaurants, hotels, spas, gyms, offices", "Restaurantes, hoteles, spas, gimnasios"),
                    t("High-volume processing with commercial equipment", "Procesamiento de alto volumen"),
                    t("Specialized care for uniforms and delicates", "Cuidado especializado para uniformes"),
                    t("Reliable pickup & delivery, strict quality control", "Recogida confiable y control de calidad"),
                    t("Flexible billing and service plans", "Facturación y planes flexibles"),
                  ].map((item, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-sm text-white/65">
                      <Check className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />{item}
                    </li>
                  ))}
                </ul>
              </AccordionItem>
            </div>
          </Reveal>
          <Reveal delay={340}>
            <div className="text-center">
              <Link to="/request-quote">
                <Mag
                  as="div"
                  data-testid="commercial-request-quote-button"
                  strength={0.2}
                  className="inline-flex items-center gap-2 overflow-hidden relative bg-white text-slate-900 rounded-full px-7 sm:px-10 py-3.5 sm:py-4 text-sm font-bold uppercase tracking-widest shadow-xl cursor-pointer hover:-translate-y-0.5 transition-transform duration-300 active:scale-95 group touch-manipulation"
                  style={{ minHeight: "48px" }}
                >
                  <span className="relative z-10 flex items-center gap-2">
                    📋 {t("REQUEST A QUOTE", "SOLICITAR COTIZACIÓN")}
                    <ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1" />
                  </span>
                  <span className="absolute inset-0 bg-gradient-to-r from-transparent via-slate-200/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
                </Mag>
              </Link>
            </div>
          </Reveal>
        </DarkSection>

        {/* ══ QUOTE ══ */}
        <section className="relative py-20 sm:py-28 overflow-hidden bg-slate-950">
          <div
            className="absolute inset-0 will-change-transform"
            style={{
              backgroundImage: "url('https://images.unsplash.com/photo-1517677208171-0bc6725a3e60?w=1920&h=1080&fit=crop')",
              backgroundSize: "cover",
              backgroundPosition: "center",
              transform: `translateY(${scrollY * 0.18}px) scale(1.1)`,
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-br from-black/85 to-black/70" />
          <div className="relative z-10 max-w-3xl mx-auto px-4 sm:px-6 text-center">
            <Reveal dir="scale" dur={900}>
              <div>
                <div className="flex items-center justify-center gap-4 mb-6 sm:mb-8">
                  <div className="h-px w-10 sm:w-16 bg-gradient-to-r from-transparent to-primary/60" />
                  <div className="w-2 h-2 rounded-full bg-primary/60 flex-shrink-0" />
                  <div className="h-px w-10 sm:w-16 bg-gradient-to-l from-transparent to-primary/60" />
                </div>
                <h2 className="text-2xl sm:text-4xl md:text-5xl font-bold text-white mb-5 sm:mb-6 leading-tight">
                  {t("If you care for your laundry,", "Si cuidas tu ropa,")}
                  <span className="block font-bold text-white/75">{t("you'll notice the difference.", "notarás la diferencia.")}</span>
                </h2>
                <div className="w-16 h-px bg-gradient-to-r from-transparent via-primary to-transparent mx-auto mb-5 sm:mb-6" />
                <p className="text-base sm:text-xl text-white/65 mb-8 sm:mb-10">{t("Clean linens, happy clients…", "Ropa de cama limpia, clientes felices…")}</p>
                <div className="flex justify-center flex-wrap gap-4 sm:gap-6">
                  {[
                    { icon: <Clock className="w-4 h-4 flex-shrink-0" />, text: t("Since 2020", "Desde 2020") },
                    { icon: <Star className="w-4 h-4 flex-shrink-0" />, text: t("5-Star Service", "Servicio 5 estrellas") },
                    { icon: <Truck className="w-4 h-4 flex-shrink-0" />, text: t("Free Pickup", "Recogida gratis") },
                  ].map((it, i) => (
                    <div key={i} className="flex items-center gap-2 text-white/45 text-sm">{it.icon}{it.text}</div>
                  ))}
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ══ PRICING ══ */}
        <section className="py-12 sm:py-20 lg:py-24 bg-white">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-12">
            <Reveal dir="blur">
              <p className="text-center text-[11px] font-bold uppercase tracking-[0.18em] text-primary/50 mb-3">{t("Pricing", "Precios")}</p>
            </Reveal>
            <Reveal delay={80}>
              <h2 className="text-2xl sm:text-4xl lg:text-5xl font-bold text-slate-900 text-center mb-3 leading-tight">
                {t("Transparent", "Precios")}
                <span className="block text-primary font-bold">{t("Pricing.", "Transparentes.")}</span>
              </h2>
            </Reveal>
            <Reveal delay={160}>
              <p className="text-slate-500 text-center mb-8 sm:mb-14 max-w-xl mx-auto text-sm sm:text-lg">
                {t("No surprises. Premium service you can count on.", "Sin sorpresas. Servicio premium en el que puedes confiar.")}
              </p>
            </Reveal>

           <div className="flex-1 min-w-0">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 mb-4 sm:mb-8">
                  <Reveal delay={0} dir="up" dur={700}><PickupDeliveryServiceCard t={t} /></Reveal>
                  <Reveal delay={80} dir="up" dur={700}><WashFoldServiceCard t={t} /></Reveal>
                </div>

              </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
              <Reveal dir="left" delay={0}><SelfServiceTable t={t} washerPrices={WASHER_PRICES} dryerPrices={DRYER_PRICES} /></Reveal>
              <Reveal dir="right" delay={60}><PerPieceTable t={t} categories={PER_PIECE_CATEGORIES} /></Reveal>
            </div>
          </div>
        </section>

        <PublicFooter />
      </div>
    </>
  );
}