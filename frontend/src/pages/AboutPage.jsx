import { useState, useEffect, useRef, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  Star, Heart, Users, Award, MapPin, Clock, Phone, ArrowRight, Sparkles
} from "lucide-react";
import PublicNav from "../components/PublicNav";
import PublicFooter from "../components/PublicFooter";
import { useLocale } from "../context/LocaleContext";

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

// ─── 3-D Tilt ────────────────────────────────────────────────────────────────
const Tilt = ({ children, className = "", depth = 7 }) => {
  const ref = useRef(null);
  const [s, setS] = useState({});
  const onMove = useCallback((e) => {
    const r = ref.current.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width - 0.5) * depth * 2;
    const y = ((e.clientY - r.top) / r.height - 0.5) * -depth * 2;
    setS({ transform: `perspective(900px) rotateX(${y}deg) rotateY(${x}deg) translateZ(8px)`, transition: "transform 60ms linear" });
  }, [depth]);
  const onLeave = useCallback(() => setS({ transform: "perspective(900px) rotateX(0) rotateY(0) translateZ(0)", transition: "transform 350ms cubic-bezier(0.34,1.56,0.64,1)" }), []);
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
    <style>{`@keyframes mq{from{transform:translateX(0)}to{transform:translateX(-33.333%)}}`}</style>
    <div className="flex gap-12 whitespace-nowrap" style={{ animation: "mq 30s linear infinite" }}>
      {[...items, ...items, ...items].map((it, i) => (
        <span key={i} className="text-[11px] font-bold uppercase tracking-[0.2em] text-primary/45 flex items-center gap-3">
          <span className="w-1 h-1 rounded-full bg-primary/30 inline-block" />{it}
        </span>
      ))}
    </div>
  </div>
);

// ─── Stat Card ────────────────────────────────────────────────────────────────
const StatCard = ({ value, label, delay }) => {
  const [h, setH] = useState(false);
  return (
    <Reveal delay={delay} dir="up">
      <Tilt depth={4}>
        <div
          className={`relative bg-white rounded-2xl p-6 text-center border transition-all duration-200 overflow-hidden
            ${h ? "border-primary/25 shadow-2xl shadow-sky-100/60 -translate-y-1" : "border-slate-100 shadow-lg"}`}
          onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}>
          <div className={`absolute top-0 left-4 right-4 h-px bg-gradient-to-r from-transparent via-primary to-transparent transition-opacity duration-300 ${h ? "opacity-100" : "opacity-0"}`} />
          <div className={`absolute inset-0 bg-gradient-to-br from-sky-50/60 to-transparent transition-opacity duration-300 ${h ? "opacity-100" : "opacity-0"}`} />
          <div className={`relative text-4xl font-black mb-1 transition-colors duration-150 ${h ? "text-primary" : "text-sky-600"}`}>{value}</div>
          <p className="relative text-slate-500 text-sm font-medium">{label}</p>
        </div>
      </Tilt>
    </Reveal>
  );
};

// ─── Value Card ───────────────────────────────────────────────────────────────
const ValueCard = ({ icon: Icon, title, text, delay }) => {
  const [h, setH] = useState(false);
  return (
    <Reveal delay={delay} dir="up">
      <Tilt depth={5}>
        <div
          className={`relative bg-white rounded-2xl p-7 h-full text-center border transition-all duration-200 overflow-hidden
            ${h ? "border-primary/25 shadow-2xl shadow-sky-100/60 -translate-y-1" : "border-slate-100 shadow-lg"}`}
          onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}>
          <div className={`absolute top-0 left-5 right-5 h-px bg-gradient-to-r from-transparent via-primary to-transparent transition-opacity duration-300 ${h ? "opacity-100" : "opacity-0"}`} />
          <div className={`absolute inset-0 bg-gradient-to-br from-sky-50/60 to-transparent transition-opacity duration-300 ${h ? "opacity-100" : "opacity-0"}`} />
          <div className={`relative w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-5 transition-all duration-200 ${h ? "bg-primary/15 scale-110 rotate-3" : "bg-sky-50"}`}>
            <Icon className={`h-7 w-7 transition-colors duration-150 ${h ? "text-primary" : "text-sky-500"}`} />
          </div>
          <h3 className={`relative font-bold text-base mb-2 transition-colors duration-150 ${h ? "text-primary" : "text-slate-900"}`}>{title}</h3>
          <p className="relative text-slate-500 text-sm leading-relaxed">{text}</p>
        </div>
      </Tilt>
    </Reveal>
  );
};

// ─── Info Row ─────────────────────────────────────────────────────────────────
const InfoRow = ({ icon: Icon, label, value, delay }) => (
  <Reveal delay={delay} dir="left">
    <div className="flex items-start gap-4 group">
      <div className="w-11 h-11 rounded-2xl bg-sky-50 group-hover:bg-primary/10 flex items-center justify-center flex-shrink-0 transition-colors duration-200">
        <Icon className="h-5 w-5 text-sky-500 group-hover:text-primary transition-colors duration-200" />
      </div>
      <div>
        <p className="font-semibold text-slate-800 text-sm">{label}</p>
        <p className="text-slate-500 text-sm leading-relaxed">{value}</p>
      </div>
    </div>
  </Reveal>
);

// ─── MAIN ─────────────────────────────────────────────────────────────────────
export default function AboutPage() {
  const { t } = useLocale();
  const [scrollY, setScrollY] = useState(0);
  const { ring, dot } = useCursor();

  useEffect(() => {
    let tick = false;
    const fn = () => { if (!tick) { requestAnimationFrame(() => { setScrollY(window.pageYOffset); tick = false; }); tick = true; } };
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);

  const marqueeItems = [
    t("About Us", "Nosotros"),
    t("Since 2020", "Desde 2020"),
    t("Ventura County", "Condado de Ventura"),
    t("5-Star Service", "Servicio 5 estrellas"),
    t("10,000+ Customers", "10,000+ Clientes"),
    t("Pickup & Delivery", "Recogida y Entrega"),
  ];

  const stats = [
    { value: "5+",  label: t("Years of Service", "Años de Servicio") },
    { value: "10K+", label: t("Happy Customers", "Clientes Felices") },
    { value: "50K+", label: t("Loads Completed", "Cargas Completadas") },
    { value: "4.9",  label: t("Star Rating", "Calificación") },
  ];

  const values = [
    { icon: Star,  title: t("Quality First", "Calidad Primero"),     text: t("We treat every item with care, using premium products and professional techniques.", "Tratamos cada prenda con cuidado, usando productos premium y técnicas profesionales.") },
    { icon: Heart, title: t("Customer Care", "Atención al Cliente"), text: t("Your satisfaction is our priority. We listen, adapt, and deliver on your preferences.", "Tu satisfacción es nuestra prioridad. Escuchamos, nos adaptamos y cumplimos con tus preferencias.") },
    { icon: Users, title: t("Community", "Comunidad"),               text: t("We're proud to be part of Ventura County and committed to serving our neighbors.", "Estamos orgullosos de ser parte del condado de Ventura y comprometidos a servir a nuestros vecinos.") },
    { icon: Award, title: t("Reliability", "Confiabilidad"),         text: t("On time, every time. You can count on us to keep our promises.", "A tiempo, siempre. Puedes contar con nosotros para cumplir nuestras promesas.") },
  ];

  return (<>
    {/* ── Custom Cursor ── */}
    <div className="pointer-events-none fixed inset-0 z-[9999] hidden lg:block">
      <div ref={ring} className="absolute w-9 h-9 rounded-full border border-primary/50 will-change-transform" style={{ top: 0, left: 0 }} />
      <div ref={dot}  className="absolute w-1.5 h-1.5 rounded-full bg-primary will-change-transform" style={{ top: 0, left: 0 }} />
    </div>

    <div className="min-h-screen bg-white overflow-x-hidden" style={{ fontStyle: "normal" }}>
      <PublicNav />

      {/* ══ HERO ══════════════════════════════════════════════════════════ */}
      <section className="relative min-h-[68vh] flex items-end justify-center overflow-hidden bg-slate-950">
        <div className="absolute inset-0 will-change-transform"
          style={{ backgroundImage: "url('https://images.unsplash.com/photo-1521791055366-0d553872125f?w=1920&h=1080&fit=crop')", backgroundSize: "cover", backgroundPosition: "center", transform: `translateY(${scrollY * 0.22}px) scale(1.08)` }} />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-900/60 to-slate-800/30" />
        <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at center,transparent 40%,rgba(0,0,0,0.5) 100%)" }} />
        <div className="absolute inset-0 opacity-[0.025]" style={{ backgroundImage: "repeating-linear-gradient(0deg,#000 0px,#000 1px,transparent 1px,transparent 4px)" }} />

        <div className="relative z-10 text-center px-6 pb-20 max-w-4xl mx-auto">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 backdrop-blur-md border border-white/20 mb-7"
            style={{ animation: "fadeUp 0.5s 0.05s both ease-out" }}>
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            <span className="text-[11px] text-white/65 font-bold uppercase tracking-[0.18em] not-italic">{t("Our Story", "Nuestra Historia")}</span>
          </div>
          <h1 className="text-5xl sm:text-6xl md:text-7xl font-bold text-white leading-[1.05] mb-4 tracking-tight not-italic"
            style={{ animation: "fadeUp 0.5s 0.12s both ease-out" }}>
            {t("People behind", "Las personas detrás")}
            <span className="block font-bold text-white not-italic">
              {t("the freshness.", "la frescura.")}
            </span>
          </h1>
          <p className="text-lg sm:text-xl text-white/65 max-w-xl mx-auto not-italic" style={{ animation: "fadeUp 0.5s 0.2s both ease-out" }}>
            {t("Ventura Fresh Laundry makes laundry effortless across Ventura County.", "Ventura Fresh Laundry hace que la lavandería sea sin esfuerzo en todo el condado de Ventura.")}
          </p>
        </div>

        {/* Wave */}
        <div className="absolute bottom-0 left-0 right-0 z-20">
          <svg viewBox="0 0 1440 90" preserveAspectRatio="none" className="w-full h-12 sm:h-16 lg:h-20">
            <path d="M0,45 C300,0 600,90 1440,45 L1440,90 L0,90 Z" fill="white" />
          </svg>
        </div>
      </section>

      <style>{`
        @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
        * { font-style: normal !important; }
      `}</style>

      {/* ══ MARQUEE ═══════════════════════════════════════════════════════ */}
      <Marquee items={marqueeItems} />

      {/* ══ OUR STORY ════════════════════════════════════════════════════ */}
      <section className="py-20 sm:py-24 relative overflow-hidden bg-white">
        <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: "url('https://images.unsplash.com/photo-1582735689369-4fe89db7114c?w=1920&h=1080&fit=crop')", backgroundSize: "cover", backgroundPosition: "center", transform: `translateY(${scrollY * 0.1}px)` }} />
        <div className="relative z-10 max-w-6xl mx-auto px-6 sm:px-8 lg:px-12">
          <div className="grid md:grid-cols-2 gap-14 items-center">
            {/* Text */}
            <div>
              <Reveal dir="blur" dur={300}>
                <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-primary/50 mb-3 not-italic">{t("Who We Are", "Quiénes Somos")}</p>
              </Reveal>
              <Reveal delay={50} dur={300}>
                <h2 className="text-4xl sm:text-5xl font-bold text-slate-900 mb-6 leading-tight not-italic">
                  {t("Our", "Nuestra")}
                  <span className="block text-primary font-bold not-italic">{t("Story.", "Historia.")}</span>
                </h2>
              </Reveal>
              <Reveal delay={100} dur={300}>
                <p className="text-slate-500 leading-relaxed mb-4 not-italic">
                  {t(
                    "Founded with a simple mission: to give people their time back. We understand that laundry is one of those never-ending chores that takes hours out of your week – time that could be spent with family, pursuing hobbies, or simply relaxing.",
                    "Fundada con una misión simple: devolverle el tiempo a las personas. Entendemos que la lavandería es una de esas tareas interminables que te quita horas de tu semana – tiempo que podría ser dedicado a la familia, pasatiempos o simplemente relajarse."
                  )}
                </p>
              </Reveal>
              <Reveal delay={140} dur={300}>
                <p className="text-slate-500 leading-relaxed mb-4 not-italic">
                  {t(
                    "At Ventura Fresh Laundry, we combine professional-grade equipment with personalized service to deliver an exceptional laundry experience. From our self-service facility to our full-service wash & fold and pickup & delivery options, we've designed every aspect of our business around your convenience.",
                    "En Ventura Fresh Laundry, combinamos equipos de grado profesional con un servicio personalizado para ofrecer una experiencia de lavandería excepcional. Desde nuestras instalaciones de autoservicio hasta nuestro servicio completo de lavado y doblado, hemos diseñado cada aspecto pensando en tu conveniencia."
                  )}
                </p>
              </Reveal>
              <Reveal delay={180} dur={300}>
                <p className="text-slate-500 leading-relaxed not-italic">
                  {t(
                    "We're proud to serve Ventura County with the most affordable and reliable laundry services in the area.",
                    "Estamos orgullosos de servir al condado de Ventura con los servicios de lavandería más asequibles y confiables de la zona."
                  )}
                </p>
              </Reveal>
            </div>

            {/* Stats grid */}
            <div className="grid grid-cols-2 gap-4">
              {stats.map((s, i) => (
                <StatCard key={i} value={s.value} label={s.label} delay={i * 60} />
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ══ VALUES ════════════════════════════════════════════════════════ */}
      <section className="py-20 sm:py-24 bg-gradient-to-b from-slate-50/60 to-white relative overflow-hidden">
        <div className="absolute inset-0 opacity-[0.4]" style={{ backgroundImage: "radial-gradient(rgba(14,165,233,0.08) 1px,transparent 1px)", backgroundSize: "24px 24px" }} />
        <div className="relative z-10 max-w-6xl mx-auto px-6 sm:px-8 lg:px-12">
          <Reveal dir="blur" dur={300}>
            <p className="text-center text-[11px] font-bold uppercase tracking-[0.22em] text-primary/50 mb-3 not-italic">{t("What We Stand For", "Lo que Defendemos")}</p>
          </Reveal>
          <Reveal delay={50} dur={300}>
            <h2 className="text-4xl sm:text-5xl font-bold text-slate-900 text-center mb-3 leading-tight not-italic">
              {t("Our", "Nuestros")}
              <span className="block text-primary font-bold not-italic">{t("Values.", "Valores.")}</span>
            </h2>
          </Reveal>
          <Reveal delay={100} dur={300}>
            <p className="text-slate-500 text-center mb-14 max-w-xl mx-auto text-lg not-italic">{t("The principles that drive every wash, fold, and delivery.", "Los principios que impulsan cada lavado, doblado y entrega.")}</p>
          </Reveal>
          <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-5">
            {values.map((v, i) => (
              <ValueCard key={i} icon={v.icon} title={v.title} text={v.text} delay={i * 60} />
            ))}
          </div>
        </div>
      </section>

      {/* ══ DARK QUOTE ════════════════════════════════════════════════════ */}
      <section className="py-28 relative overflow-hidden bg-sky-950">
        <div className="absolute inset-0 will-change-transform"
          style={{ backgroundImage: "url('https://images.unsplash.com/photo-1517677208171-0bc6725a3e60?w=1920&h=1080&fit=crop')", backgroundSize: "cover", backgroundPosition: "center", transform: `translateY(${scrollY * 0.18}px) scale(1.1)` }} />
        <div className="absolute inset-0 bg-sky-950/70" />
        <div className="absolute inset-0 bg-gradient-to-br from-sky-950/92 to-sky-900/88" />
        <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: "radial-gradient(rgba(255,255,255,0.8) 1px,transparent 1px)", backgroundSize: "28px 28px" }} />
        <div className="relative z-10 max-w-3xl mx-auto px-6 text-center">
          <Reveal dir="scale" dur={400}>
            <div>
              <div className="flex items-center justify-center gap-4 mb-8">
                <div className="h-px w-16 bg-gradient-to-r from-transparent to-sky-400/60" />
                <div className="w-2 h-2 rounded-full bg-sky-400/60" />
                <div className="h-px w-16 bg-gradient-to-l from-transparent to-sky-400/60" />
              </div>
              <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-6 leading-tight not-italic">
                {t("We didn't just open a laundry.", "No solo abrimos una lavandería.")}
                <span className="block font-bold text-white/75 mt-2 not-italic">{t("We gave our community time back.", "Le devolvimos tiempo a nuestra comunidad.")}</span>
              </h2>
              <div className="w-16 h-px bg-gradient-to-r from-transparent via-primary to-transparent mx-auto mb-6" />
              <p className="text-lg text-white/50 not-italic">{t("— Ventura Fresh Laundry", "— Ventura Fresh Laundry")}</p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ══ LOCATION ══════════════════════════════════════════════════════ */}
      <section className="py-20 sm:py-24 relative overflow-hidden bg-white">
        <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: "url('https://images.unsplash.com/photo-1545173168-9f1947eebb7f?w=1920&h=1080&fit=crop')", backgroundSize: "cover", backgroundPosition: "center", transform: `translateY(${scrollY * 0.08}px)` }} />
        <div className="relative z-10 max-w-6xl mx-auto px-6 sm:px-8 lg:px-12">
          <div className="grid md:grid-cols-2 gap-14 items-center">
            {/* Info */}
            <div>
              <Reveal dir="blur" dur={300}>
                <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-primary/50 mb-3 not-italic">{t("Find Us", "Encuéntranos")}</p>
              </Reveal>
              <Reveal delay={50} dur={300}>
                <h2 className="text-4xl sm:text-5xl font-bold text-slate-900 mb-10 leading-tight not-italic">
                  {t("Visit Our", "Visita Nuestra")}
                  <span className="block text-primary font-bold not-italic">{t("Location.", "Ubicación.")}</span>
                </h2>
              </Reveal>
              <div className="space-y-5 mb-10">
                <InfoRow icon={MapPin} label={t("Address", "Dirección")} value="5722 Telephone Rd #5, Ventura, CA 93003" delay={80} />
                <InfoRow icon={Clock}  label={t("Hours", "Horario")}     value={t("Monday – Sunday: 6:00 AM – 10:00 PM", "Lunes a Domingo: 6:00 AM – 10:00 PM")} delay={130} />
                <InfoRow icon={Phone}  label={t("Phone / Text", "Teléfono / Mensaje")} value="(805) 836-8872" delay={180} />
              </div>
              <Reveal delay={220} dur={300}>
                <Link to="/contact">
                  <Mag as="div" strength={0.28}
                    className="inline-flex items-center gap-2 overflow-hidden relative bg-primary text-white rounded-full px-10 py-4 text-[13px] font-bold uppercase tracking-widest shadow-lg shadow-primary/30 cursor-pointer hover:-translate-y-0.5 transition-transform duration-200 active:scale-95 group">
                    <span className="relative z-10 flex items-center gap-2 not-italic">
                      {t("Contact Us", "Contáctanos")}
                      <ArrowRight className="w-4 h-4 transition-transform duration-150 group-hover:translate-x-1" />
                    </span>
                    <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/15 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-500" />
                  </Mag>
                </Link>
              </Reveal>
            </div>

            {/* Map */}
            <Reveal delay={120} dir="right" dur={400}>
              <Tilt depth={3}>
                <div className="rounded-2xl overflow-hidden shadow-2xl shadow-sky-100/40 border border-slate-100 h-80">
                  <iframe
                    src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3279.5!2d-119.2!3d34.27!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x0%3A0x0!2zMzTCsDE2JzEyLjAiTiAxMTnCsDEyJzAwLjAiVw!5e0!3m2!1sen!2sus!4v1234567890"
                    width="100%" height="100%"
                    style={{ border: 0 }}
                    allowFullScreen loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                    title="Ventura Fresh Laundry Location"
                  />
                </div>
              </Tilt>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ══ CTA ═══════════════════════════════════════════════════════════ */}
      <section className="relative py-28 overflow-hidden bg-slate-950">
        <div className="absolute inset-0 will-change-transform"
          style={{ backgroundImage: "url('https://images.unsplash.com/photo-1545173168-9f1947eebb7f?w=1920&h=1080&fit=crop')", backgroundSize: "cover", backgroundPosition: "center top", transform: `translateY(${scrollY * 0.15}px) scale(1.08)` }} />
        <div className="absolute inset-0 bg-slate-950/60" />
        <div className="absolute inset-0 bg-gradient-to-br from-black/85 to-black/70" />
        <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at center,transparent 40%,rgba(0,0,0,0.5) 100%)" }} />
        <div className="relative z-10 max-w-3xl mx-auto px-6 text-center">
          <Reveal dir="scale" dur={400}>
            <div>
              <Sparkles className="w-8 h-8 text-primary/60 mx-auto mb-6" />
              <h2 className="text-4xl sm:text-5xl font-bold text-white mb-4 leading-tight not-italic">
                {t("Ready to Experience", "¿Listo para Experimentar")}
                <span className="block font-bold text-white/75 not-italic">{t("the Difference?", "la Diferencia?")}</span>
              </h2>
              <div className="w-16 h-px bg-gradient-to-r from-transparent via-primary to-transparent mx-auto mb-6" />
              <p className="text-white/65 text-lg mb-10 not-italic">
                {t("Let us take laundry off your to-do list.", "Deja que nosotros quitemos la lavandería de tu lista de tareas.")}
              </p>
              <Link to="/schedule-pickup">
                <Mag as="div" strength={0.25}
                  className="inline-flex items-center gap-2 overflow-hidden relative bg-primary text-white rounded-full px-12 py-4 text-[13px] font-bold uppercase tracking-widest shadow-xl shadow-primary/30 cursor-pointer hover:-translate-y-0.5 transition-transform duration-200 active:scale-95 group">
                  <span className="relative z-10 flex items-center gap-2 not-italic">
                    🚚 {t("Schedule Pickup", "Programar Recolección")}
                    <ArrowRight className="w-4 h-4 transition-transform duration-150 group-hover:translate-x-1" />
                  </span>
                  <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/15 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-500" />
                </Mag>
              </Link>
            </div>
          </Reveal>
        </div>
      </section>

      <PublicFooter />
    </div>
  </>);
}