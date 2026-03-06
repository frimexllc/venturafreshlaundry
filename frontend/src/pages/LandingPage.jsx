import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, Phone, MapPin, Clock, Sparkles, Wind, Truck, ArrowRight } from "lucide-react";
import { Button } from "../components/ui/button";
import PublicNav from "../components/PublicNav";
import PublicFooter from "../components/PublicFooter";
import videoVFL from "../assets/videoHeroHomeInicial.mp4";
import { useLocale } from "../context/LocaleContext";

// ─── Utility ─────────────────────────────────────────────────────────────────
const clamp = (v, min, max) => Math.min(Math.max(v, min), max);

// ─── Custom Cursor (desktop) ──────────────────────────────────────────────────
function useSmoothCursor() {
  const ring = useRef(null);
  const dot  = useRef(null);
  const pos  = useRef({ x: -200, y: -200 });
  const lag  = useRef({ x: -200, y: -200 });
  const raf  = useRef(null);

  useEffect(() => {
    const onMove = (e) => { pos.current = { x: e.clientX, y: e.clientY }; };
    window.addEventListener("mousemove", onMove, { passive: true });

    const loop = () => {
      lag.current.x += (pos.current.x - lag.current.x) * 0.1;
      lag.current.y += (pos.current.y - lag.current.y) * 0.1;
      if (ring.current) ring.current.style.transform = `translate(${lag.current.x - 18}px, ${lag.current.y - 18}px)`;
      if (dot.current)  dot.current.style.transform  = `translate(${pos.current.x - 3}px, ${pos.current.y - 3}px)`;
      raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
    return () => { window.removeEventListener("mousemove", onMove); cancelAnimationFrame(raf.current); };
  }, []);

  return { ring, dot };
}

// ─── Magnetic Button ─────────────────────────────────────────────────────────
const Magnetic = ({ children, className = "", strength = 0.38, as: Tag = "button", ...props }) => {
  const ref = useRef(null);
  const onMove = useCallback((e) => {
    const el = ref.current; if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.transform = `translate(${(e.clientX - r.left - r.width/2) * strength}px, ${(e.clientY - r.top - r.height/2) * strength}px)`;
  }, [strength]);
  const onLeave = useCallback(() => { if (ref.current) ref.current.style.transform = "translate(0,0)"; }, []);

  return (
    <Tag ref={ref} className={`${className}`}
      style={{ transition: "transform 500ms cubic-bezier(0.34,1.56,0.64,1)" }}
      onMouseMove={onMove} onMouseLeave={onLeave} {...props}>
      {children}
    </Tag>
  );
};

// ─── IntersectionObserver hook ────────────────────────────────────────────────
function useInView(threshold = 0.15) {
  const ref = useRef(null);
  const [v, setV] = useState(false);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setV(true); obs.disconnect(); } }, { threshold });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return [ref, v];
}

// ─── Reveal ──────────────────────────────────────────────────────────────────
const ORIGINS = {
  up:    "opacity-0 translate-y-12",
  left:  "opacity-0 translate-x-10",
  right: "opacity-0 -translate-x-10",
  scale: "opacity-0 scale-90",
  blur:  "opacity-0 blur-md scale-95",
};
const Reveal = ({ children, delay = 0, className = "", dir = "up", dur = 750 }) => {
  const [ref, v] = useInView();
  return (
    <div ref={ref} className={`${className} transition-all ease-out ${v ? "opacity-100 translate-y-0 translate-x-0 scale-100 blur-0" : ORIGINS[dir]}`}
      style={{ transitionDuration: `${dur}ms`, transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  );
};

// ─── Hero timer reveal ────────────────────────────────────────────────────────
const HR = ({ children, delay = 0, className = "" }) => {
  const [v, setV] = useState(false);
  useEffect(() => { const t = setTimeout(() => setV(true), delay); return () => clearTimeout(t); }, [delay]);
  return (
    <div className={`${className} transition-all duration-[900ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${v ? "opacity-100 translate-y-0 blur-0" : "opacity-0 translate-y-10 blur-sm"}`}>
      {children}
    </div>
  );
};

// ─── 3-D Tilt Card ────────────────────────────────────────────────────────────
const Tilt = ({ children, className = "", depth = 8 }) => {
  const ref = useRef(null);
  const [s, setS] = useState({});
  const onMove = useCallback((e) => {
    const r = ref.current.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width  - 0.5) * depth * 2;
    const y = ((e.clientY - r.top)  / r.height - 0.5) * -depth * 2;
    setS({ transform: `perspective(900px) rotateX(${y}deg) rotateY(${x}deg) translateZ(10px)`, transition: "transform 80ms linear" });
  }, [depth]);
  const onLeave = useCallback(() => {
    setS({ transform: "perspective(900px) rotateX(0) rotateY(0) translateZ(0)", transition: "transform 600ms cubic-bezier(0.34,1.56,0.64,1)" });
  }, []);
  return <div ref={ref} style={s} className={className} onMouseMove={onMove} onMouseLeave={onLeave}>{children}</div>;
};

// ─── Animated Number ──────────────────────────────────────────────────────────
const Count = ({ end, suffix = "", dur = 1800 }) => {
  const [n, setN] = useState(0);
  const [ref, v] = useInView(0.5);
  useEffect(() => {
    if (!v) return;
    const start = Date.now();
    const tick = () => {
      const p = clamp((Date.now() - start) / dur, 0, 1);
      setN(Math.round((1 - Math.pow(1 - p, 3)) * end));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [v, end, dur]);
  return <span ref={ref}>{n}{suffix}</span>;
};

// ─── Marquee ─────────────────────────────────────────────────────────────────
const Marquee = ({ items }) => (
  <div className="relative overflow-hidden py-3.5 border-y border-primary/10 bg-gradient-to-r from-sky-50/60 via-white to-sky-50/60">
    <style>{`@keyframes mq{from{transform:translateX(0)}to{transform:translateX(-33.333%)}}`}</style>
    <div className="flex gap-14 whitespace-nowrap" style={{ animation: "mq 26s linear infinite" }}>
      {[...items,...items,...items].map((item, i) => (
        <span key={i} className="text-xs font-semibold text-primary/50 uppercase tracking-[0.2em] flex items-center gap-3">
          <span className="w-1 h-1 rounded-full bg-primary/35 inline-block" />{item}
        </span>
      ))}
    </div>
  </div>
);

// ─── FAQ Item ─────────────────────────────────────────────────────────────────
const FAQItem = ({ question, answer, isOpen, onClick, index }) => (
  <div className={`transition-colors duration-300 ${isOpen ? "bg-sky-50/50" : "bg-white"}`}>
    <button onClick={onClick}
      className="w-full py-5 px-5 flex items-center justify-between text-left group focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/20">
      <div className="flex items-center gap-4 pr-4">
        <span className="text-xs font-bold text-primary/35 w-5 text-right flex-shrink-0 tabular-nums">{String(index+1).padStart(2,"0")}</span>
        <span className="text-base sm:text-[17px] font-medium text-slate-700 group-hover:text-primary transition-colors duration-200">{question}</span>
      </div>
      <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-all duration-400 ${isOpen ? "bg-primary rotate-180 scale-110" : "bg-slate-100 group-hover:bg-primary/10 group-hover:text-primary text-slate-400"}`}>
        <ChevronDown className={`w-4 h-4 ${isOpen ? "text-white" : ""}`} />
      </div>
    </button>
    <div className={`overflow-hidden transition-all duration-500 ease-in-out ${isOpen ? "max-h-[500px] pb-5 opacity-100" : "max-h-0 opacity-0"}`}>
      <div className="text-slate-500 leading-relaxed px-5 pl-14 text-sm">{answer}</div>
    </div>
    <div className="h-px bg-slate-100 mx-5 last:hidden" />
  </div>
);

// ─── Feature Card ─────────────────────────────────────────────────────────────
const FCard = ({ icon, title, desc, delay, idx }) => {
  const [h, setH] = useState(false);
  const accs = ["from-sky-400/10","from-slate-300/10","from-sky-600/10"];
  return (
    <Reveal delay={delay} dir="up" dur={800}>
      <Tilt depth={5}>
        <div className="relative dashboard-card p-8 h-full overflow-hidden cursor-default group"
          onMouseEnter={()=>setH(true)} onMouseLeave={()=>setH(false)}>
          <div className={`absolute inset-0 bg-gradient-to-br ${accs[idx]} to-transparent transition-opacity duration-500 ${h?"opacity-100":"opacity-0"}`}/>
          <div className={`absolute top-0 left-6 right-6 h-px bg-gradient-to-r from-transparent via-primary to-transparent transition-all duration-500 ${h?"opacity-100 scale-x-100":"opacity-0 scale-x-50"}`}/>
          <div className={`relative w-14 h-14 mx-auto mb-5 rounded-2xl flex items-center justify-center transition-all duration-500 ${h?"bg-primary/20 scale-110 rotate-6 shadow-lg shadow-primary/20":"bg-slate-100"}`}>
            {icon}
          </div>
          <h3 className={`relative text-xl font-bold text-center mb-2 transition-colors duration-200 ${h?"text-primary":"text-slate-800"}`}>{title}</h3>
          <p className="relative text-slate-500 text-sm text-center leading-relaxed">{desc}</p>
          <div className={`relative mt-4 flex justify-center transition-all duration-300 ${h?"opacity-100 translate-y-0":"opacity-0 translate-y-2"}`}>
            <ArrowRight className="w-4 h-4 text-primary" />
          </div>
        </div>
      </Tilt>
    </Reveal>
  );
};

// ─── Step Card ────────────────────────────────────────────────────────────────
const SCard = ({ s, delay }) => {
  const [ref, v] = useInView();
  const [h, setH] = useState(false);
  return (
    <div ref={ref} className={`transition-all duration-700 ease-out ${v?"opacity-100 translate-y-0":"opacity-0 translate-y-12"}`}
      style={{ transitionDelay: `${delay}ms` }}
      onMouseEnter={()=>setH(true)} onMouseLeave={()=>setH(false)}>
      <div className={`dashboard-card p-7 h-full flex flex-col transition-all duration-350 ${h?"-translate-y-2 shadow-xl shadow-sky-100/60":""}`}>
        <div className={`w-14 h-14 rounded-2xl text-xl font-black flex items-center justify-center mb-6 transition-all duration-400 ${h?"bg-primary text-white scale-110 rotate-3 shadow-lg shadow-primary/30":"bg-primary/10 text-primary"}`}>
          {s.step}
        </div>
        <h3 className="text-lg font-bold text-slate-800 mb-3">{s.title}</h3>
        <p className="text-slate-500 text-sm mb-4 leading-relaxed">{s.content}</p>
        <ul className="text-slate-500 text-sm space-y-2.5 mb-5 flex-grow">
          {s.list.map((item, i) => (
            <li key={i} className="flex items-start gap-2.5">
              <span className={`mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0 transition-all duration-300 ${h?"bg-primary scale-125":"bg-primary/35"}`}/>
              {item}
            </li>
          ))}
        </ul>
        <p className="text-slate-400 text-xs italic mb-6 border-l-2 border-primary/20 pl-3">{s.footer}</p>
        <div className="mt-auto">
          <Link to="/schedule-pickup">
            <button className="group/btn w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:border-primary hover:text-primary hover:bg-primary/5 transition-all duration-300 active:scale-95">
              {s.button}
              <ArrowRight className="w-3.5 h-3.5 transition-transform duration-200 group-hover/btn:translate-x-1" />
            </button>
          </Link>
        </div>
      </div>
    </div>
  );
};

// ─── Benefit Card ─────────────────────────────────────────────────────────────
const BCard = ({ b, delay, dir, accent }) => (
  <Reveal delay={delay} dir={dir} dur={750}>
    <div className="dashboard-card p-7 group hover:-translate-y-1.5 transition-all duration-350 h-full">
      <div className={`w-8 h-0.5 mb-5 rounded-full transition-all duration-500 ${accent} group-hover:w-16`}/>
      <h3 className="text-xl font-bold text-slate-800 mb-4 group-hover:text-primary transition-colors duration-200">{b.title}</h3>
      {b.text && <p className="text-slate-500 text-sm leading-relaxed">{b.text}</p>}
      {b.text1 && <p className="text-slate-500 text-sm leading-relaxed mb-4">{b.text1}</p>}
      {b.list && (
        <ul className="space-y-2 mb-4">
          {b.list.map((item, i) => (
            <li key={i} className="flex items-start gap-2.5 text-sm text-slate-500">
              <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-primary/40 flex-shrink-0 group-hover:bg-primary transition-colors duration-300" style={{ transitionDelay: `${i*50}ms` }}/>
              {item}
            </li>
          ))}
        </ul>
      )}
      {b.footer && <p className="text-slate-600 text-sm font-semibold">{b.footer}</p>}
    </div>
  </Reveal>
);

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function LandingPage() {
  const { t, locale } = useLocale();
  const [openFAQ, setOpenFAQ] = useState(null);
  const [scrollY, setScrollY] = useState(0);
  const [vidReady, setVidReady] = useState(false);
  const { ring, dot } = useSmoothCursor();

  useEffect(() => {
    let tick = false;
    const fn = () => { if (!tick) { requestAnimationFrame(() => { setScrollY(window.pageYOffset); tick = false; }); tick = true; } };
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);

  const faqs = useMemo(() => [
    { question: t("What services do you offer?","¿Qué servicios ofrecen?"), answer: locale==="es"?(<div><p className="mb-2">Ofrecemos una gama completa:</p><ul className="list-disc pl-5 space-y-1 text-sm"><li><strong>B2B</strong> – para empresas de todos los tamaños</li><li><strong>Airbnb</strong> – ropa de cama impecable</li><li><strong>Lavado y doblado</strong> – asequible y conveniente</li><li><strong>Recogida y entrega</strong> – en tu horario</li></ul></div>):(<div><p className="mb-2">We offer a full range of solutions:</p><ul className="list-disc pl-5 space-y-1 text-sm"><li><strong>B2B Laundry</strong> – for businesses of all sizes</li><li><strong>Airbnb Linens</strong> – spotless, fast turnaround</li><li><strong>Wash & Fold</strong> – affordable & convenient</li><li><strong>Pickup & Delivery</strong> – on your schedule</li></ul></div>) },
    { question: t("How do I get started?","¿Cómo empiezo?"), answer: t("Easy! Click Schedule Pick-Up, fill the short form, and we'll confirm your time window, folding preferences, and any special instructions before we arrive.","¡Fácil! Haz clic en Programar Recogida, llena el breve formulario, y confirmaremos tu ventana horaria y preferencias antes de llegar.") },
    { question: t("What makes you different?","¿Qué los hace diferentes?"), answer: t("Reliability, professional-grade cleaning, and flexible options. Every client gets priority support, tailored programs, and fast turnaround.","Confiabilidad, limpieza de nivel profesional y opciones flexibles. Cada cliente recibe soporte prioritario y respuesta rápida.") },
    { question: t("How can I contact you?","¿Cómo puedo contactarlos?"), answer: locale==="es"?(<div><ul className="list-none space-y-1 text-sm"><li><strong>Teléfono:</strong> (805) 836-8872</li><li><strong>Correo:</strong> info@venturafreshlaundry.com</li><li><strong>En persona:</strong> 5722 Telephone Rd #5, Ventura, CA</li></ul></div>):(<div><ul className="list-none space-y-1 text-sm"><li><strong>Phone/Text:</strong> (805) 836-8872</li><li><strong>Email:</strong> info@venturafreshlaundry.com</li><li><strong>In person:</strong> 5722 Telephone Rd #5, Ventura, CA</li></ul></div>) },
    { question: t("What's your pricing?","¿Cuáles son sus precios?"), answer: locale==="es"?(<ul className="list-none space-y-1.5 text-sm"><li><strong>Recogida y Entrega:</strong> mínimo $40</li><li><strong>Lavado y Doblado:</strong> $2.25/lb, mínimo 10 lb</li><li>Precios personalizados para cuentas comerciales</li></ul>):(<ul className="list-none space-y-1.5 text-sm"><li><strong>Pickup & Delivery:</strong> $40 minimum</li><li><strong>Wash & Fold:</strong> $2.25/lb, 10 lb min</li><li>Custom pricing for business accounts</li></ul>) },
    { question: t("What's it like to work with you?","¿Cómo es trabajar con ustedes?"), answer: t("Hassle-free, professional, and reliable. From pickup to delivery, clean and fresh every time with priority support for businesses and Airbnb hosts.","Sin complicaciones, profesional y confiable. De principio a fin, limpia y fresca cada vez.") },
  ], [locale, t]);

  const features = useMemo(() => [
    { icon: <Sparkles className="w-7 h-7 text-primary" />, title: t("Premium garment care","Cuidado premium"), desc: t("Professional-grade cleaning that preserves fabric integrity.","Limpieza profesional que preserva el tejido.") },
    { icon: <Wind className="w-7 h-7 text-slate-500" />, title: t("Custom folding","Doblado personalizado"), desc: t("Folded exactly the way you prefer, every time.","Doblado exactamente como prefieres, siempre.") },
    { icon: <Truck className="w-7 h-7 text-primary" />, title: t("Pickup & delivery","Recogida y entrega"), desc: t("Door-to-door on your schedule, no waiting required.","Puerta a puerta en tu horario.") },
  ], [t]);

  const steps = useMemo(() => [
    { step:"1", title:t("Schedule in Seconds","Programa en segundos"), content:t("Submit your request instantly.","Envía tu solicitud al instante."), list:[t("Choose your pickup window","Elige tu ventana"), t("Set folding preferences","Configura preferencias"), t("Add special instructions","Instrucciones especiales")], footer:t("Confirmed before we arrive.","Confirmado antes de llegar."), button:t("SCHEDULE NOW","PROGRAMAR") },
    { step:"2", title:t("We Pick Up","Recogemos"), content:t("Leave your bag at the agreed spot.","Deja tu bolsa en el lugar acordado."), list:[t("On-time pickup","Recogida puntual"), t("Order tracked & labeled","Pedido rastreado"), t("Safely transported","Transportado seguro")], footer:t("No waiting. No hassle.","Sin esperas. Sin complicaciones."), button:t("REQUEST PICK-UP","SOLICITAR") },
    { step:"3", title:t("Delivered Fresh","Entregado limpio"), content:t("Cleaned using premium products & equipment.","Lavado con productos premium."), list:[t("Fresh and clean","Fresco y limpio"), t("Folded to your preference","A tu gusto"), t("Ready to wear","Listo para usar")], footer:t("Back at your door.","De vuelta en tu puerta."), button:t("GET STARTED","COMENZAR") },
  ], [t]);

  const benefits = useMemo(() => [
    { title:t("Real-Time Updates","Actualizaciones en tiempo real"), text:t("Text notifications when picked up, in process, and on its way back. Always know where your order is.","Notificaciones cuando es recogida, en proceso y de regreso. Siempre sabrás dónde está tu pedido.") },
    { title:t("Eco-Conscious by Design","Ecológico por diseño"), text1:t("Professional equipment uses less water and energy:","Nuestros equipos usan menos agua y energía:"), list:[t("Lower water consumption","Menor consumo de agua"),t("Reduced electricity usage","Uso reducido de electricidad"),t("Smaller environmental footprint","Menor huella ambiental")], footer:t("Cleaner clothes, better for the planet.","Ropa más limpia, mejor para el planeta.") },
    { title:t("Personalized Service","Servicio personalizado"), text1:t("Getting started:","Para comenzar:"), list:[t("Schedule by phone or text","Programa por teléfono"),t("Set preferences once","Establece preferencias una vez"),t("Leave your laundry out","Deja tu ropa lista"),t("We handle the rest","Nosotros hacemos el resto")], footer:t("No complicated systems.","Sin sistemas complicados.") },
    { title:t("Simple Start to Finish","Simple de inicio a fin"), text:t("Text notifications when picked up, in process, and on its way back. You'll always know where your order is and that it's in good hands.","Notificaciones en cada etapa. Siempre sabrás dónde está tu pedido y que está en buenas manos.") },
  ], [t]);

  const marquee = [t("Pickup & Delivery","Recogida y Entrega"), t("Wash & Fold","Lavado y Doblado"), t("Same-Day Service","Servicio en el Día"), t("Airbnb Specialists","Especialistas Airbnb"), t("B2B Solutions","Soluciones B2B"), t("Ventura County","Condado de Ventura")];

  return (<>
    {/* ── Custom Cursor ── */}
    <div className="pointer-events-none fixed inset-0 z-[9999] hidden lg:block">
      <div ref={ring} className="absolute w-9 h-9 rounded-full border border-primary/50 will-change-transform" style={{top:0,left:0}}/>
      <div ref={dot}  className="absolute w-1.5 h-1.5 rounded-full bg-primary will-change-transform" style={{top:0,left:0}}/>
    </div>

    <div className="min-h-screen bg-white overflow-x-hidden">

      {/* ══ HERO ══════════════════════════════════════════════════════════ */}
      <section className="relative min-h-screen flex items-center overflow-hidden">
        <div className="absolute inset-0 z-0">
          <video className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-1200 ${vidReady?"opacity-100":"opacity-0"}`}
            src={videoVFL} autoPlay muted loop playsInline preload="auto" onCanPlay={()=>setVidReady(true)}/>
          {/* Cinematic layers */}
          <div className="absolute inset-0 bg-gradient-to-r from-slate-950/92 via-slate-900/65 to-slate-800/25"/>
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/70 via-transparent to-slate-900/15"/>
          <div className="absolute inset-0" style={{background:"radial-gradient(ellipse at center, transparent 35%, rgba(0,0,0,0.6) 100%)"}}/>
          {/* Subtle scan-lines texture */}
          <div className="absolute inset-0 opacity-[0.03]" style={{backgroundImage:"repeating-linear-gradient(0deg,#000 0px,#000 1px,transparent 1px,transparent 3px)"}}/>
        </div>

        <PublicNav />

        <div className="relative z-10 px-6 sm:px-10 lg:px-14 max-w-7xl mx-auto w-full pt-24">
          <div className="max-w-4xl">

            {/* Eyebrow badge */}
            <HR delay={60}>
              <div className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full bg-white/8 backdrop-blur-lg border border-white/15 mb-8 group">
                <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse"/>
                <span className="text-[11px] text-white/75 font-semibold uppercase tracking-[0.18em]">
                  {t("Ventura County's #1 Laundry Service","Lavandería #1 en Ventura County")}
                </span>
              </div>
            </HR>

            {/* Headline — solid line */}
            <HR delay={180}>
              <h1 className="text-5xl sm:text-6xl md:text-7xl lg:text-[88px] font-light text-white leading-[1.0] italic mb-1 tracking-tight">
                {t("We do your","Hacemos tu")}
              </h1>
            </HR>
            {/* Headline — outline (stroke) */}
            <HR delay={310}>
              <h1 className="text-5xl sm:text-6xl md:text-7xl lg:text-[88px] font-light leading-[1.0] italic mb-5 tracking-tight select-none"
                style={{WebkitTextStroke:"1.5px rgba(255,255,255,0.75)", color:"transparent"}}>
                {t("laundry.","lavandería.")}
              </h1>
            </HR>
            <HR delay={430}>
              <h2 className="text-2xl sm:text-3xl md:text-4xl font-extralight text-white/70 italic mb-10 tracking-wide">
                {t("You enjoy your time.","Tú disfrutas tu tiempo.")}
              </h2>
            </HR>

            {/* CTAs */}
            <HR delay={580}>
              <div className="flex flex-col sm:flex-row gap-4 mb-12 flex-wrap">
                <Link to="/schedule-pickup">
                  <Magnetic as="div" strength={0.3}
                    className="relative overflow-hidden bg-primary text-white rounded-full px-10 py-4 text-[13px] font-bold uppercase tracking-widest shadow-2xl shadow-primary/50 cursor-pointer group inline-flex items-center gap-2.5 hover:-translate-y-px transition-all duration-300 active:scale-95">
                    {t("Schedule Pick-Up","Programar Recogida")}
                    <ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1"/>
                    {/* Shine */}
                    <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700 ease-in-out"/>
                  </Magnetic>
                </Link>
                <Link to="/services">
                  <Magnetic as="div" strength={0.25}
                    className="backdrop-blur-md bg-white/8 border border-white/25 text-white rounded-full px-10 py-4 text-[13px] font-bold uppercase tracking-widest cursor-pointer inline-flex items-center gap-2 hover:bg-white/15 hover:border-white/50 transition-all duration-300 active:scale-95">
                    {t("More Services","Más Servicios")}
                  </Magnetic>
                </Link>
                <Link to="/request-quote">
                  <Magnetic as="div" strength={0.2}
                    className="border border-white/20 text-white/70 rounded-full px-10 py-4 text-[13px] font-bold uppercase tracking-widest cursor-pointer inline-flex items-center gap-2 hover:bg-white/8 hover:text-white hover:border-white/40 transition-all duration-300 active:scale-95">
                    🏢 {t("B2B / Commercial","B2B / Comercial")}
                  </Magnetic>
                </Link>
              </div>
            </HR>

            {/* Service pills */}
            <HR delay={740}>
              <div className="flex flex-wrap gap-3">
                {[t("Self Service","Autoservicio"), t("Wash & Fold","Lavado y Doblado"), t("Pickup & Delivery","Recogida y Entrega")].map((s,i)=>(
                  <span key={i} className="flex items-center gap-2.5 bg-white/6 backdrop-blur-sm border border-white/12 rounded-full px-5 py-2.5 text-sm text-white/80 cursor-default hover:bg-white/12 hover:text-white hover:border-white/25 transition-all duration-300 group">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0 group-hover:scale-150 transition-transform duration-200"/>
                    {s}
                  </span>
                ))}
              </div>
            </HR>
          </div>
        </div>

        {/* Scroll cue */}
        <div className="absolute bottom-32 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-1.5 opacity-50 select-none pointer-events-none">
          <span className="text-[10px] text-white uppercase tracking-[0.25em]">Scroll</span>
          <div className="w-px h-8 bg-gradient-to-b from-white/60 to-transparent animate-pulse"/>
        </div>

        {/* Wave */}
        <div className="absolute bottom-0 left-0 right-0 z-20">
          <svg viewBox="0 0 1440 100" preserveAspectRatio="none" className="w-full h-14 sm:h-20 lg:h-24">
            <path d="M0,50 C200,10 400,90 720,50 C1000,10 1240,90 1440,50 L1440,100 L0,100 Z" fill="white"/>
          </svg>
        </div>
      </section>

      {/* ══ MARQUEE ════════════════════════════════════════════════════════ */}
      <Marquee items={marquee}/>

      {/* ══ STATS ══════════════════════════════════════════════════════════ */}
      <section className="py-14 bg-white">
        <div className="max-w-5xl mx-auto px-6 grid grid-cols-2 sm:grid-cols-4 gap-10 sm:gap-6">
          {[
            {end:500,suf:"+",label:t("Happy clients","Clientes felices")},
            {end:98,suf:"%",label:t("On-time rate","Puntualidad")},
            {end:7,suf:" days",label:t("Open weekly","Abiertos siempre")},
            {end:24,suf:"h",label:t("Avg. turnaround","Tiempo promedio")},
          ].map((s,i)=>(
            <Reveal key={i} delay={i*90} dir="scale" dur={600}>
              <div className="text-center group cursor-default">
                <div className="text-4xl sm:text-5xl font-black text-primary mb-1 tabular-nums group-hover:scale-105 transition-transform duration-300 origin-bottom leading-none">
                  <Count end={s.end} suffix={s.suf}/>
                </div>
                <div className="text-[11px] uppercase tracking-widest text-slate-400 font-semibold">{s.label}</div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Glow rule */}
      <div className="h-px mx-auto max-w-4xl bg-gradient-to-r from-transparent via-primary/25 to-transparent"/>

      {/* ══ FEATURES ════════════════════════════════════════════════════════ */}
      <section className="py-20 sm:py-24 bg-white relative overflow-hidden">
        <div className="absolute inset-0 opacity-[0.035] pointer-events-none will-change-transform"
          style={{backgroundImage:`url(https://images.squarespace-cdn.com/content/v1/696c559a4b2b9b1b0febf8d7/8f9faf72-9068-4289-8f90-869a9b1b00d2/backgound.png)`,backgroundSize:"cover",backgroundPosition:"center",transform:`translateY(${scrollY*0.18}px)`}}/>
        <div className="relative z-10 max-w-6xl mx-auto px-6 sm:px-8 lg:px-12">
          <Reveal dir="blur">
            <p className="text-center text-[11px] font-bold uppercase tracking-[0.22em] text-primary/50 mb-3">{t("Why us","Por qué nosotros")}</p>
          </Reveal>
          <Reveal delay={80} dir="up" dur={850}>
            <h2 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-slate-900 text-center mb-3 leading-tight">
              {t("Laundry made","Lavandería hecha")}
              <em className="block text-primary font-extralight not-italic">{t("effortless.","sin esfuerzo.")}</em>
            </h2>
          </Reveal>
          <Reveal delay={160}>
            <p className="text-lg text-slate-400 text-center mb-14 max-w-xl mx-auto leading-relaxed">
              {t("Self-service to full pickup & delivery across Ventura County.","Autoservicio o recogida y entrega completa en todo Ventura County.")}
            </p>
          </Reveal>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-14">
            {features.map((f,i)=><FCard key={i} {...f} idx={i} delay={i*110}/>)}
          </div>
          <Reveal delay={360}>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              {[
                {to:"/services", label:t("View All Services","Ver Todos"), style:"bg-slate-900 text-white hover:bg-slate-800"},
                {to:"/schedule-pickup", label:t("Schedule Pick-Up","Programar"), style:"bg-primary text-white hover:bg-primary/90 shadow-lg shadow-primary/30"},
              ].map((b,i)=>(
                <Link key={i} to={b.to}>
                  <button className={`group flex items-center gap-2 ${b.style} rounded-full px-9 py-3.5 text-[13px] font-bold uppercase tracking-widest transition-all duration-300 hover:-translate-y-0.5 active:scale-95`}>
                    {b.label}
                    <ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1"/>
                  </button>
                </Link>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ══ HOW IT WORKS ════════════════════════════════════════════════════ */}
      <section className="py-20 sm:py-24 bg-slate-50/60">
        <div className="max-w-6xl mx-auto px-6 sm:px-8 lg:px-12">
          <Reveal dir="blur"><p className="text-center text-[11px] font-bold uppercase tracking-[0.22em] text-primary/50 mb-3">{t("Process","Proceso")}</p></Reveal>
          <Reveal delay={80}><h2 className="text-4xl sm:text-5xl font-bold text-slate-900 text-center mb-14">{t("How It Works","Cómo Funciona")}</h2></Reveal>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {steps.map((s,i)=><SCard key={i} s={s} delay={i*130}/>)}
          </div>
        </div>
      </section>

      {/* ══ BENEFITS ════════════════════════════════════════════════════════ */}
      <section className="py-20 sm:py-24 bg-white">
        <div className="max-w-6xl mx-auto px-6 sm:px-8 lg:px-12">
          <Reveal dir="blur"><p className="text-center text-[11px] font-bold uppercase tracking-[0.22em] text-primary/50 mb-3">{t("Benefits","Beneficios")}</p></Reveal>
          <Reveal delay={80}><h2 className="text-4xl sm:text-5xl font-bold text-slate-900 text-center mb-14">{t("Why clients love us","Por qué nos eligen")}</h2></Reveal>
          <div className="grid lg:grid-cols-2 gap-6">
            <div className="space-y-6">
              <BCard b={benefits[0]} delay={0}   dir="left" accent="bg-primary"/>
              <BCard b={benefits[1]} delay={100}  dir="left" accent="bg-emerald-400"/>
            </div>
            <div className="space-y-6">
              <BCard b={benefits[2]} delay={150}  dir="right" accent="bg-sky-400"/>
              <BCard b={benefits[3]} delay={250}  dir="right" accent="bg-slate-300"/>
            </div>
          </div>
        </div>
      </section>

      {/* ══ TESTIMONIAL CTA ════════════════════════════════════════════════ */}
      <section className="py-20 sm:py-28 relative overflow-hidden"
        style={{background:"linear-gradient(135deg,#071828 0%,#0c3050 50%,#0c4a6e 100%)"}}>
        {/* Animated orb mesh */}
        <div className="absolute top-0 left-0 w-[700px] h-[700px] rounded-full opacity-[0.18] will-change-transform pointer-events-none"
          style={{background:"radial-gradient(circle,#0ea5e9 0%,transparent 70%)",transform:`translate(-35%,-35%) translate(${scrollY*0.05}px,${scrollY*0.02}px)`}}/>
        <div className="absolute bottom-0 right-0 w-[500px] h-[500px] rounded-full opacity-[0.13] will-change-transform pointer-events-none"
          style={{background:"radial-gradient(circle,#38bdf8 0%,transparent 70%)",transform:`translate(30%,30%) translate(-${scrollY*0.03}px,-${scrollY*0.02}px)`}}/>
        {/* Dot grid */}
        <div className="absolute inset-0 opacity-[0.06] pointer-events-none"
          style={{backgroundImage:"radial-gradient(rgba(255,255,255,0.6) 1px,transparent 1px)",backgroundSize:"32px 32px"}}/>

        <div className="max-w-4xl mx-auto px-6 text-center relative z-10">
          <Reveal dir="blur"><span className="text-[11px] font-bold uppercase tracking-[0.22em] text-sky-400/70 mb-5 block">{t("What clients say","Lo que dicen")}</span></Reveal>
          <Reveal delay={80}>
            <h2 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white mb-4 leading-tight">
              {t("Take Back","Recupera")}
              <em className="block font-extralight not-italic text-sky-300">{t("Your Time.","Tu Tiempo.")}</em>
            </h2>
          </Reveal>
          <Reveal delay={160}>
            <p className="text-base text-white/50 mb-12 max-w-lg mx-auto leading-relaxed">
              {t("Hours disappear in laundry. Let us handle it while you focus on what matters.","Las horas desaparecen en la lavandería. Déjanos encargarnos mientras tú disfrutas.") }
            </p>
          </Reveal>
          <Reveal delay={240} dir="scale" dur={900}>
            <Tilt depth={3}>
              <blockquote className="relative bg-white/5 backdrop-blur-lg rounded-3xl p-8 sm:p-12 lg:p-16 border border-white/10 shadow-2xl hover:bg-white/8 transition-colors duration-500">
                <span className="absolute top-6 left-8 text-8xl text-sky-400/15 font-serif leading-none select-none">"</span>
                <p className="relative text-xl sm:text-2xl text-white/85 italic leading-relaxed mb-8">
                  {t('"Ventura Fresh Laundry completely changed the way I handle laundry. Always on time, and my clothes come back perfectly clean and folded."','"Ventura Fresh Laundry cambió por completo la forma en que manejo la lavandería. Siempre puntual, y mi ropa vuelve perfectamente limpia y doblada."')}
                </p>
                <div className="flex items-center justify-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-sky-500/15 border border-sky-400/25 flex items-center justify-center text-sky-300 font-bold text-sm">K</div>
                  <footer className="text-white/60 font-medium">Katy F. <span className="text-white/30 font-normal">— Ventura, CA</span></footer>
                </div>
              </blockquote>
            </Tilt>
          </Reveal>
          <Reveal delay={380}>
            <div className="mt-10">
              <Link to="/schedule-pickup">
                <Magnetic as="div" strength={0.28}
                  className="inline-flex items-center gap-2.5 overflow-hidden relative bg-primary text-white rounded-full px-12 py-4 text-[13px] font-bold uppercase tracking-widest shadow-2xl shadow-primary/40 cursor-pointer hover:-translate-y-0.5 transition-all duration-300 active:scale-95 group">
                  {t("Schedule Pick-Up","Programar Recogida")}
                  <ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1"/>
                  <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/15 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700"/>
                </Magnetic>
              </Link>
            </div>
          </Reveal>
        </div>

        <div className="absolute bottom-0 left-0 right-0">
          <svg viewBox="0 0 1440 80" preserveAspectRatio="none" className="w-full h-12 sm:h-20">
            <path d="M0,40 C360,80 1080,0 1440,40 L1440,80 L0,80 Z" fill="white"/>
          </svg>
        </div>
      </section>

      {/* ══ FAQ ════════════════════════════════════════════════════════════ */}
      <section className="py-20 sm:py-24 bg-white">
        <div className="max-w-3xl mx-auto px-6 sm:px-8">
          <Reveal dir="blur"><p className="text-center text-[11px] font-bold uppercase tracking-[0.22em] text-primary/50 mb-3">FAQ</p></Reveal>
          <Reveal delay={80}>
            <h2 className="text-4xl sm:text-5xl font-bold text-slate-900 text-center mb-2 leading-tight">
              {t("Got questions?","¿Tienes preguntas?")}
            </h2>
            <p className="text-center text-slate-400 font-light text-xl mb-12">{t("We have answers.","Tenemos respuestas.")}</p>
          </Reveal>
          <Reveal delay={160} dir="scale">
            <div className="rounded-2xl border border-slate-100 overflow-hidden shadow-sm">
              {faqs.map((faq,i)=>(
                <FAQItem key={i} index={i} question={faq.question} answer={faq.answer}
                  isOpen={openFAQ===i} onClick={()=>setOpenFAQ(openFAQ===i?null:i)}/>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ══ CONTACT ════════════════════════════════════════════════════════ */}
      <section className="py-12 sm:py-14 border-t border-slate-100 bg-slate-50/60">
        <div className="max-w-5xl mx-auto px-6">
          <div className="grid sm:grid-cols-3 gap-4">
            {[
              {icon:<MapPin className="h-5 w-5 text-primary"/>, label:t("Find us","Encuéntranos"), text:"5722 Telephone Rd #5, Ventura, CA"},
              {icon:<Clock className="h-5 w-5 text-primary"/>,  label:t("Hours","Horario"), text:t("Mon–Sun  6:00 AM – 10:00 PM","Lun–Dom  6:00 AM – 10:00 PM")},
              {icon:<Phone className="h-5 w-5 text-primary"/>, label:t("Call or text","Llama o escribe"), text:"(805) 836-8872"},
            ].map((c,i)=>(
              <Reveal key={i} delay={i*80} dir="up">
                <div className="flex items-center gap-4 p-5 rounded-2xl cursor-default hover:bg-white hover:shadow-md transition-all duration-300 group">
                  <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0 group-hover:bg-primary/20 group-hover:scale-110 transition-all duration-300">
                    {c.icon}
                  </div>
                  <div>
                    <p className="text-[11px] text-slate-400 uppercase tracking-widest font-semibold mb-0.5">{c.label}</p>
                    <p className="text-sm text-slate-700 font-medium">{c.text}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <PublicFooter/>
    </div>
  </>);
}