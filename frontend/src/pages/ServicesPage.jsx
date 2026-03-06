import { useState, useEffect, useRef, useCallback } from "react";
import { Link } from "react-router-dom";
import { Button } from "../components/ui/button";
import { ChevronDown, Check, Star, Clock, Shield, Truck, ArrowRight, Sparkles } from "lucide-react";
import PublicNav from "../components/PublicNav";
import PublicFooter from "../components/PublicFooter";
import { useLocale } from "../context/LocaleContext";

// ─── Utility ──────────────────────────────────────────────────────────────────
const clamp = (v, a, b) => Math.min(Math.max(v, a), b);

// ─── IntersectionObserver hook ────────────────────────────────────────────────
function useInView(threshold = 0.12) {
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
  up:    "opacity-0 translate-y-10",
  left:  "opacity-0 translate-x-8",
  right: "opacity-0 -translate-x-8",
  scale: "opacity-0 scale-92",
  blur:  "opacity-0 blur-sm scale-97",
};
const Reveal = ({ children, delay = 0, dir = "up", dur = 700, className = "" }) => {
  const [ref, v] = useInView();
  return (
    <div ref={ref} className={`${className} transition-all ease-out ${v ? "opacity-100 translate-y-0 translate-x-0 scale-100 blur-0" : ORIGINS[dir]}`}
      style={{ transitionDuration: `${dur}ms`, transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  );
};

// ─── Magnetic wrapper ─────────────────────────────────────────────────────────
const Mag = ({ children, className = "", strength = 0.32, as: Tag = "div", ...p }) => {
  const ref = useRef(null);
  const onMove = useCallback((e) => {
    const r = ref.current.getBoundingClientRect();
    ref.current.style.transform = `translate(${(e.clientX-r.left-r.width/2)*strength}px,${(e.clientY-r.top-r.height/2)*strength}px)`;
  }, [strength]);
  const onLeave = useCallback(() => { ref.current.style.transform = "translate(0,0)"; }, []);
  return (
    <Tag ref={ref} className={className}
      style={{ transition: "transform 500ms cubic-bezier(0.34,1.56,0.64,1)" }}
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
    const x = ((e.clientX-r.left)/r.width -0.5)*depth*2;
    const y = ((e.clientY-r.top) /r.height-0.5)*-depth*2;
    setS({ transform:`perspective(900px) rotateX(${y}deg) rotateY(${x}deg) translateZ(8px)`, transition:"transform 80ms linear" });
  }, [depth]);
  const onLeave = useCallback(() => setS({ transform:"perspective(900px) rotateX(0) rotateY(0) translateZ(0)", transition:"transform 600ms cubic-bezier(0.34,1.56,0.64,1)" }), []);
  return <div ref={ref} style={s} className={className} onMouseMove={onMove} onMouseLeave={onLeave}>{children}</div>;
};

// ─── Custom Cursor ────────────────────────────────────────────────────────────
function useCursor() {
  const ring = useRef(null); const dot = useRef(null);
  const p = useRef({x:-200,y:-200}); const l = useRef({x:-200,y:-200}); const raf = useRef(null);
  useEffect(() => {
    const fn = (e) => { p.current = {x:e.clientX,y:e.clientY}; };
    window.addEventListener("mousemove", fn, { passive:true });
    const loop = () => {
      l.current.x += (p.current.x - l.current.x)*0.1;
      l.current.y += (p.current.y - l.current.y)*0.1;
      if(ring.current) ring.current.style.transform=`translate(${l.current.x-18}px,${l.current.y-18}px)`;
      if(dot.current)  dot.current.style.transform =`translate(${p.current.x-3}px,${p.current.y-3}px)`;
      raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
    return () => { window.removeEventListener("mousemove",fn); cancelAnimationFrame(raf.current); };
  }, []);
  return { ring, dot };
}

// ─── Marquee ─────────────────────────────────────────────────────────────────
const Marquee = ({ items }) => (
  <div className="overflow-hidden py-3 border-y border-primary/10 bg-sky-50/50">
    <style>{`@keyframes mq{from{transform:translateX(0)}to{transform:translateX(-33.333%)}}`}</style>
    <div className="flex gap-12 whitespace-nowrap" style={{animation:"mq 30s linear infinite"}}>
      {[...items,...items,...items].map((it,i)=>(
        <span key={i} className="text-[11px] font-bold uppercase tracking-[0.2em] text-primary/45 flex items-center gap-3">
          <span className="w-1 h-1 rounded-full bg-primary/30 inline-block"/>{it}
        </span>
      ))}
    </div>
  </div>
);

// ─── Accordion ────────────────────────────────────────────────────────────────
const AccordionItem = ({ title, children, isOpen, onClick, variant="light" }) => {
  const isDark = variant==="dark";
  return (
    <div className={`border-b ${isDark?"border-white/15":"border-slate-200/70"} last:border-0`}>
      <button onClick={onClick}
        className="w-full py-4 flex items-center justify-between text-left group focus:outline-none"
        aria-expanded={isOpen}>
        <span className={`text-base font-semibold transition-colors duration-200 pr-4 ${isDark?"text-white group-hover:text-sky-300":"text-slate-800 group-hover:text-primary"}`}>
          {title}
        </span>
        <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-all duration-350 ${isOpen ? (isDark?"bg-sky-400 text-white rotate-180":"bg-primary text-white rotate-180") : (isDark?"bg-white/15 text-white/60":"bg-slate-100 text-slate-400 group-hover:bg-primary/10 group-hover:text-primary")}`}>
          <ChevronDown className="w-4 h-4"/>
        </div>
      </button>
      <div className={`overflow-hidden transition-all duration-500 ease-in-out ${isOpen?"max-h-[500px] pb-4 opacity-100":"max-h-0 opacity-0"}`}>
        {children}
      </div>
    </div>
  );
};

// ─── Service Card ─────────────────────────────────────────────────────────────
const ServiceCard = ({ title, emoji, description, features=[], buttonText, buttonLink, price, category }) => {
  const [h, setH] = useState(false);
  return (
    <Tilt depth={5}>
      <div className={`relative bg-white rounded-2xl p-8 h-full flex flex-col overflow-hidden border transition-all duration-350 ${h?"border-primary/30 shadow-2xl shadow-sky-100/60 -translate-y-1":"border-slate-100 shadow-lg"}`}
        onMouseEnter={()=>setH(true)} onMouseLeave={()=>setH(false)}>
        {/* top accent */}
        <div className={`absolute top-0 left-6 right-6 h-px bg-gradient-to-r from-transparent via-primary to-transparent transition-all duration-500 ${h?"opacity-100":"opacity-0"}`}/>
        {/* bg glow */}
        <div className={`absolute inset-0 bg-gradient-to-br from-sky-50/60 to-transparent transition-opacity duration-500 ${h?"opacity-100":"opacity-0"}`}/>

        {emoji && (
          <div className={`relative w-14 h-14 flex items-center justify-center text-3xl mb-5 rounded-2xl transition-all duration-400 ${h?"bg-primary/15 scale-110 rotate-3":"bg-slate-50"}`}>
            {emoji}
          </div>
        )}
        {category && <p className="relative text-[11px] uppercase tracking-widest text-primary/60 font-bold mb-1">{category}</p>}
        <h3 className={`relative text-2xl font-bold mb-3 transition-colors duration-200 ${h?"text-primary":"text-slate-900"}`}>{title}</h3>
        <p className="relative text-slate-500 text-sm leading-relaxed mb-4">{description}</p>
        {price && <p className="relative text-3xl font-black text-primary mb-5">{price}</p>}
        {features.length > 0 && (
          <div className="relative space-y-2.5 mb-6 flex-grow">
            {features.map((f,i)=>(
              <p key={i} className="flex items-start gap-2.5 text-sm text-slate-600">
                <Check className={`h-4 w-4 flex-shrink-0 mt-0.5 transition-colors duration-200 ${h?"text-primary":"text-sky-400"}`}/>
                <span dangerouslySetInnerHTML={{__html:f}}/>
              </p>
            ))}
          </div>
        )}
        {buttonText && buttonLink && (
          <div className="relative mt-auto">
            <Link to={buttonLink}>
              <button className="group w-full flex items-center justify-center gap-2 bg-primary text-white rounded-xl px-6 py-3 text-sm font-bold uppercase tracking-wider hover:bg-primary/90 transition-all duration-300 shadow-md shadow-primary/20 hover:shadow-lg hover:shadow-primary/30 active:scale-95 overflow-hidden relative">
                <span className="relative z-10 flex items-center gap-2">{buttonText}<ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1"/></span>
                <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/15 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700"/>
              </button>
            </Link>
          </div>
        )}
      </div>
    </Tilt>
  );
};

// ─── Membership Card ──────────────────────────────────────────────────────────
const MembershipCard = ({ plan, price, image, features, isPopular }) => {
  const { t } = useLocale();
  const [h, setH] = useState(false);
  return (
    <Tilt depth={isPopular?5:4}>
      <div className={`relative bg-white rounded-2xl overflow-hidden h-full flex flex-col transition-all duration-350
        ${isPopular ? "border-2 border-primary shadow-2xl shadow-primary/20 scale-105 md:scale-110 z-10" : "border border-slate-200 shadow-lg"}
        ${h?"-translate-y-2":""}`}
        onMouseEnter={()=>setH(true)} onMouseLeave={()=>setH(false)}>
        {isPopular && (
          <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 z-20">
            <div className="flex items-center gap-1.5 bg-gradient-to-r from-primary to-sky-400 text-white px-4 py-1.5 rounded-full text-[11px] font-black uppercase tracking-widest shadow-lg">
              <Star className="w-3 h-3 fill-white"/>
              {t("MOST POPULAR","MÁS POPULAR")}
            </div>
          </div>
        )}
        {/* Image area */}
        <div className={`h-44 overflow-hidden flex items-center justify-center p-5 transition-colors duration-400 ${isPopular?"bg-gradient-to-br from-sky-50 to-primary/5":"bg-gradient-to-br from-slate-50 to-white"}`}>
          <img src={image} alt={`${plan} – Ventura Fresh Laundry`}
            className={`max-w-full max-h-full object-contain transition-transform duration-500 ${h?"scale-110":""}`} loading="lazy"/>
        </div>
        <div className="p-6 flex flex-col flex-grow">
          <h2 className={`text-xl font-black mb-1 transition-colors duration-200 ${h?"text-primary":"text-slate-900"}`}>{plan}</h2>
          <p className="text-3xl font-black text-primary mb-5">{price}</p>
          <ul className="space-y-2.5 flex-grow">
            {features.map((f,i)=>(
              <li key={i} className="flex items-start gap-2 text-sm text-slate-600">
                <Check className={`w-4 h-4 flex-shrink-0 mt-0.5 transition-colors duration-200 ${h?"text-primary":"text-sky-400"}`}/>
                {f}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Tilt>
  );
};

// ─── Pricing Table ────────────────────────────────────────────────────────────
const PricingTable = ({ title, data, note }) => {
  const { t } = useLocale();
  return (
    <div className="bg-white rounded-2xl p-8 shadow-lg border border-slate-100 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 h-full">
      <h3 className="text-xl font-bold text-slate-900 text-center mb-6">{title}</h3>
      <table className="w-full mb-5">
        <thead>
          <tr className="border-b-2 border-slate-100">
            <th className="py-2 text-left text-xs font-bold uppercase tracking-wider text-slate-400">{t("Option","Opción")}</th>
            <th className="py-2 text-center text-xs font-bold uppercase tracking-wider text-slate-400">{t("Rate","Tarifa")}</th>
            <th className="py-2 text-right text-xs font-bold uppercase tracking-wider text-slate-400">{t("Minimum","Mínimo")}</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row,i)=>(
            <tr key={i} className="border-b border-slate-50 last:border-0 hover:bg-sky-50/40 transition-colors group">
              <td className="py-3 text-sm text-slate-600 group-hover:text-slate-800 transition-colors">{row.option}</td>
              <td className="py-3 text-center text-sm font-bold text-primary">{row.rate}</td>
              <td className="py-3 text-right text-sm text-slate-500">{row.minimum}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {note && <p className="text-slate-400 text-xs text-center italic leading-relaxed border-t border-slate-50 pt-4">{note}</p>}
    </div>
  );
};

// ─── Section with dark BG + overlay ──────────────────────────────────────────
const DarkSection = ({ children, bgImage, from="from-sky-950/92", to="to-sky-900/88", scrollY=0, parallaxStrength=0.15 }) => (
  <section className="py-20 relative overflow-hidden">
    <div className="absolute inset-0 will-change-transform" style={{backgroundImage:`url('${bgImage}')`,backgroundSize:"cover",backgroundPosition:"center",transform:`translateY(${scrollY*parallaxStrength}px) scale(1.08)`}}/>
    <div className={`absolute inset-0 bg-gradient-to-br ${from} ${to}`}/>
    {/* grid texture */}
    <div className="absolute inset-0 opacity-[0.04]" style={{backgroundImage:"radial-gradient(rgba(255,255,255,0.8) 1px,transparent 1px)",backgroundSize:"28px 28px"}}/>
    <div className="relative z-10 max-w-4xl mx-auto px-6 sm:px-8">
      {children}
    </div>
  </section>
);

// ─── MAIN ─────────────────────────────────────────────────────────────────────
export default function ServicesPage() {
  const { t, locale } = useLocale();
  const [openAccordions, setOpenAccordions] = useState({ b2b:0, commercial:0, airbnb:0 });
  const [membershipSection, setMembershipSection] = useState(null);
  const [membershipPlans, setMembershipPlans] = useState([]);
  const [servicesData, setServicesData] = useState([]);
  const [scrollY, setScrollY] = useState(0);
  const { ring, dot } = useCursor();

  useEffect(() => {
    let tick=false;
    const fn = () => { if(!tick){ requestAnimationFrame(()=>{setScrollY(window.pageYOffset);tick=false;}); tick=true; }};
    window.addEventListener("scroll",fn,{passive:true});
    return ()=>window.removeEventListener("scroll",fn);
  },[]);

  const MEMBERSHIP_SECTION_DEFAULT = {
    heading: t("Flexible Plans for Every Home","Planes flexibles para cada hogar"),
    subheading: null,
    special_title: t("🎉 New Member Special","🎉 Oferta para nuevos miembros"),
    special_text: t("$10 OFF your first month on any membership.","$10 de descuento en tu primer mes en cualquier membresía."),
    cta_title: t("Need help choosing?","¿Necesitas ayuda para elegir?"),
    cta_text: t("Just call, text, or email us at","Solo llama, envíanos un mensaje o escríbenos a"),
    cta_button_label: t("👉 BECOME A MEMBER","👉 CONVIÉRTETE EN MIEMBRO"),
    cta_button_url: "/membership",
    contact_phone: "(805) 836-8872",
    is_active: true
  };

  const DEFAULT_MEMBERSHIP_PLANS = [
    { plan: t("FAMILY PLUS","FAMILY PLUS"), price:"$199 / month",
      image:"https://images.squarespace-cdn.com/content/v1/696c559a4b2b9b1b0febf8d7/f262a5b8-0043-4977-9d32-d6b343be3e70/FAMILY+PLUS.png",
      features:[t("Up to 90 lb/ month","Hasta 90 lb/ mes"),t("Priority scheduling","Programación prioritaria"),t("Great for larger households or rentals","Ideal para hogares grandes")], isPopular:false },
    { plan: t("MOST POPULAR","MÁS POPULAR"), price:"$139 / month",
      image:"https://images.squarespace-cdn.com/content/v1/696c559a4b2b9b1b0febf8d7/4a2815a1-54c1-45fb-8320-244dce8b83c8/MOST+POPULAR.png",
      features:[t("Up to 60 lb/ month","Hasta 60 lb/ mes"),t("Basic preferences saved","Preferencias básicas guardadas"),t("Best value for most families","Mejor valor para la mayoría")], isPopular:true },
    { plan: t("ELITE CONCIERGE","ELITE CONCIERGE"), price:"$299 / month",
      image:"https://images.squarespace-cdn.com/content/v1/696c559a4b2b9b1b0febf8d7/13a4c501-7792-4f72-bf5c-072f95b5f995/ELITE+CONCIERGE.png",
      features:[t("Up to 120 lb/ month","Hasta 120 lb/ mes"),t("Priority turnaround","Respuesta prioritaria"),t("Premium packaging","Empaque premium"),t("Saved preferences","Preferencias guardadas"),t("1 emergency pickup","1 recogida de emergencia")], isPopular:false },
  ];

  const PER_PIECE_CATEGORIES = [
    { category:t("Home Essentials","Artículos del hogar"), items:[{name:t("Bath Mat","Tapete de baño"),price:"$5.00"},{name:t("Cooking Glove","Guante de cocina"),price:"$5.00"},{name:t("Pet Bed (Small)","Cama mascotas (S)"),price:"$5.00"},{name:t("Pet Bed (M/L)","Cama mascotas (M/L)"),price:"$8.00"}]},
    { category:t("Bedding","Ropa de cama"), items:[{name:t("Standard Pillow","Almohada estándar"),price:"$8.00"},{name:t("Large Pillow","Almohada grande"),price:"$10.00"},{name:t("Duvet Cover","Funda de edredón"),price:"$8.00"},{name:t("Blanket","Manta"),price:"$10.00"}]},
    { category:t("Comforters","Edredones"), items:[{name:t("Comforter T/D/Q","Edredón T/D/Q"),price:"$18.00"},{name:t("Comforter King","Edredón King"),price:"$20.00"},{name:t("Mattress Cover","Cubrecama"),price:"$20.00"},{name:t("Down Comforters","Edredones plumas"),price:"$40.00"}]},
  ];
  const WASHER_PRICES = [{size:t("20 lb (2 Load)","20 lb (2 cargas)"),price:"$4.00"},{size:t("30 lb (3 Load)","30 lb (3 cargas)"),price:"$5.25"},{size:t("40 lb (4 Load)","40 lb (4 cargas)"),price:"$6.00"},{size:t("60 lb (6 Load)","60 lb (6 cargas)"),price:"$7.75"},{size:t("90 lb (9 Load)","90 lb (9 cargas)"),price:"$11.25"}];
  const DRYER_PRICES = [{size:"30 lb",price:"$2.25"},{size:"50 lb",price:"$2.50"},{size:"80 lb",price:"$3.00"}];

  const DEFAULT_SERVICES = [
    { title:t("Pickup & Delivery","Recogida y Entrega"), emoji:"🚚", description:t("Laundry, fully automated on your schedule.","Lavandería automatizada en tu horario."), features:[t("<strong>Member recurring:</strong> $2.50/lb (min $40)","<strong>Recurrente miembro:</strong> $2.50/lb (mín $40)"),t("<strong>As-needed:</strong> $2.75/lb (min $40)","<strong>Bajo demanda:</strong> $2.75/lb (mín $40)"),t("<strong>Pickup window confirmed every time</strong>","<strong>Ventana de recogida confirmada siempre</strong>")], buttonText:t("SCHEDULE PICK-UP","PROGRAMAR RECOGIDA"), buttonLink:"/schedule-pickup" },
    { title:t("Wash • Dry • Fold","Lavar • Secar • Doblar"), emoji:"🧺", description:t("Professional care without lifting a finger.","Cuidado profesional sin mover un dedo."), features:[t("<strong>$2.25 per pound</strong>","<strong>$2.25 por libra</strong>"),t("<strong>10 lb minimum order</strong>","<strong>Pedido mínimo de 10 lb</strong>"),t("<strong>Custom folding preferences</strong>","<strong>Preferencias de doblado personalizadas</strong>")] },
  ];

  const priceUnitLabels = { per_lb:t("per pound","por libra"), per_order:t("per order","por orden"), per_month:t("per month","por mes"), per_item:t("per item","por pieza") };
  const toggleAcc = (sec, idx) => setOpenAccordions(p => ({...p, [sec]:p[sec]===idx?-1:idx}));

  useEffect(()=>{
    const load = async () => {
      try {
        const [sR,pR] = await Promise.all([fetch(`${process.env.REACT_APP_BACKEND_URL}/api/public/membership-section`),fetch(`${process.env.REACT_APP_BACKEND_URL}/api/public/membership-plans`)]);
        if(sR.ok){ const d=await sR.json(); setMembershipSection({...d,heading:t(d.heading,d.heading)}); } else setMembershipSection(MEMBERSHIP_SECTION_DEFAULT);
        if(pR.ok){ const d=await pR.json(); setMembershipPlans(d.map(p=>({plan:t(p.name,p.name),price:p.price,image:p.image_url,features:(p.features||[]).map(f=>t(f,f)),isPopular:p.is_popular}))); } else setMembershipPlans(DEFAULT_MEMBERSHIP_PLANS);
      } catch { setMembershipSection(MEMBERSHIP_SECTION_DEFAULT); setMembershipPlans(DEFAULT_MEMBERSHIP_PLANS); }
    };
    load();
  },[locale,t]);

  useEffect(()=>{
    const load = async () => {
      try { const r=await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/public/services`); if(r.ok) setServicesData(await r.json()); } catch {}
    };
    load();
  },[]);

  const servicesToRender = servicesData.length>0
    ? servicesData.map(s=>({title:t(s.name,s.name),description:s.description?t(s.description,s.description):"",price:s.price!=null?`$${Number(s.price).toFixed(2)}${s.price_unit?` / ${priceUnitLabels[s.price_unit]||s.price_unit}`:""}`:null,category:s.category?t(s.category,s.category):null,features:[]}))
    : DEFAULT_SERVICES;

  const MS = membershipSection || MEMBERSHIP_SECTION_DEFAULT;
  const plans = membershipPlans.length>0 ? membershipPlans : DEFAULT_MEMBERSHIP_PLANS;

  const marqueeItems = [t("Pickup & Delivery","Recogida y Entrega"),t("Wash & Fold","Lavado y Doblado"),t("Airbnb Specialists","Especialistas Airbnb"),t("B2B Solutions","Soluciones B2B"),t("Self Service","Autoservicio"),t("Ventura County","Condado de Ventura")];

  return (<>
    {/* Cursor */}
    <div className="pointer-events-none fixed inset-0 z-[9999] hidden lg:block">
      <div ref={ring} className="absolute w-9 h-9 rounded-full border border-primary/50 will-change-transform" style={{top:0,left:0}}/>
      <div ref={dot}  className="absolute w-1.5 h-1.5 rounded-full bg-primary will-change-transform" style={{top:0,left:0}}/>
    </div>

    <div className="min-h-screen bg-white overflow-x-hidden">
      <PublicNav/>

      {/* ══ HERO ══════════════════════════════════════════════════════════ */}
      <section className="relative min-h-[72vh] flex items-end justify-center overflow-hidden">
        <div className="absolute inset-0 will-change-transform"
          style={{backgroundImage:"url('https://images.unsplash.com/photo-1545173168-9f1947eebb7f?w=1920&h=1080&fit=crop')",backgroundSize:"cover",backgroundPosition:"center",transform:`translateY(${scrollY*0.22}px) scale(1.08)`}}/>
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-900/60 to-slate-800/30"/>
        <div className="absolute inset-0" style={{background:"radial-gradient(ellipse at center,transparent 40%,rgba(0,0,0,0.5) 100%)"}}/>
        {/* scan texture */}
        <div className="absolute inset-0 opacity-[0.025]" style={{backgroundImage:"repeating-linear-gradient(0deg,#000 0px,#000 1px,transparent 1px,transparent 4px)"}}/>

        <div className="relative z-10 text-center px-6 pb-20 max-w-5xl mx-auto">
          {/* eyebrow */}
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/8 backdrop-blur-md border border-white/15 mb-7"
            style={{animation:"fadeUp 0.8s 0.1s both ease-out"}}>
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse"/>
            <span className="text-[11px] text-white/75 font-bold uppercase tracking-[0.18em]">{t("Our Services","Nuestros Servicios")}</span>
          </div>
          <h1 className="text-5xl sm:text-6xl md:text-7xl font-light text-white leading-[1.05] italic mb-4 tracking-tight"
            style={{animation:"fadeUp 0.9s 0.25s both ease-out"}}>
            {t("A clean space for","Un espacio limpio para")}
            <span className="block" style={{WebkitTextStroke:"1.5px rgba(255,255,255,0.8)",color:"transparent"}}>
              {t("everyone.","todos.")}
            </span>
          </h1>
          <p className="text-lg sm:text-xl text-white/70 max-w-xl mx-auto" style={{animation:"fadeUp 0.9s 0.4s both ease-out"}}>
            {t("Self-service, wash & fold, pickup & delivery — tailored to your life.","Autoservicio, lavado y doblado, recogida y entrega — adaptado a tu vida.")}
          </p>
        </div>

        {/* curved wave */}
        <div className="absolute bottom-0 left-0 right-0 z-20">
          <svg viewBox="0 0 1440 90" preserveAspectRatio="none" className="w-full h-12 sm:h-16 lg:h-20">
            <path d="M0,45 C300,0 600,90 1440,45 L1440,90 L0,90 Z" fill="white"/>
          </svg>
        </div>
      </section>

      <style>{`
        @keyframes fadeUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
      `}</style>

      {/* ══ MARQUEE ═══════════════════════════════════════════════════════ */}
      <Marquee items={marqueeItems}/>

      {/* ══ SERVICES GRID ═════════════════════════════════════════════════ */}
      <section className="py-20 sm:py-24 relative overflow-hidden bg-white">
        <div className="absolute inset-0 opacity-[0.03]" style={{backgroundImage:"url('https://images.unsplash.com/photo-1582735689369-4fe89db7114c?w=1920&h=1080&fit=crop')",backgroundSize:"cover",backgroundPosition:"center",transform:`translateY(${scrollY*0.12}px)`}}/>
        <div className="relative z-10 max-w-6xl mx-auto px-6 sm:px-8 lg:px-12">
          <Reveal dir="blur">
            <p className="text-center text-[11px] font-bold uppercase tracking-[0.22em] text-primary/50 mb-3">{t("Core Services","Servicios Principales")}</p>
          </Reveal>
          <Reveal delay={80}>
            <h2 className="text-4xl sm:text-5xl font-bold text-slate-900 text-center mb-3 leading-tight">
              {t("Choose the option","Elige la opción")}
              <em className="block text-primary font-extralight not-italic">{t("that fits your day.","que se adapte a tu día.")}</em>
            </h2>
          </Reveal>
          <Reveal delay={160}>
            <p className="text-slate-400 text-center mb-14 max-w-xl mx-auto text-lg">{t("Walk-in, drop-off, or pickup & delivery — we've got you covered.","Presencial, entrega o recogida — aquí estamos.")}</p>
          </Reveal>

          <div className="grid md:grid-cols-2 gap-6 mb-8">
            {servicesToRender.map((svc,i)=>(
              <Reveal key={i} delay={i*120} dir="up" dur={800}>
                <ServiceCard {...svc}/>
              </Reveal>
            ))}
          </div>

          {/* Self-Service card */}
          <Reveal delay={300} dir="up" dur={800}>
            <Tilt depth={3}>
              <div className="relative bg-white rounded-2xl p-8 border border-slate-100 shadow-lg overflow-hidden group hover:-translate-y-1 hover:shadow-xl hover:border-primary/20 transition-all duration-350">
                <div className="absolute top-0 left-8 right-8 h-px bg-gradient-to-r from-transparent via-primary to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"/>
                <div className="absolute inset-0 bg-gradient-to-br from-sky-50/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"/>
                <div className="relative flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                  <div>
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-12 h-12 flex items-center justify-center text-2xl bg-slate-50 group-hover:bg-primary/10 rounded-2xl transition-colors duration-300">🏪</div>
                      <h3 className="text-2xl font-bold text-slate-900 group-hover:text-primary transition-colors duration-200">{t("Self-Service Laundry","Lavandería de Autoservicio")}</h3>
                    </div>
                    <p className="text-slate-500 text-sm ml-15">{t("Modern machines, fast dryers, hassle-free experience.","Máquinas modernas, secadoras rápidas, sin complicaciones.")}</p>
                  </div>
                  <div className="flex gap-8 flex-shrink-0">
                    {[{val:"6:00 AM",label:t("Open","Abrimos")},{val:"10:00 PM",label:t("Close","Cerramos")}].map((h,i)=>(
                      <div key={i} className="text-center">
                        <div className="text-2xl font-black text-primary">{h.val}</div>
                        <div className="text-xs text-slate-400 uppercase tracking-wider font-semibold">{h.label}</div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="relative grid grid-cols-1 md:grid-cols-3 gap-3 mt-6 pt-6 border-t border-slate-100">
                  {[t("Clean & well-maintained","Limpio y bien mantenido"),t("High-performance washers","Lavadoras de alto rendimiento"),t("Fast-drying machines","Secadoras rápidas")].map((item,i)=>(
                    <div key={i} className="flex items-center gap-2 text-sm text-slate-600">
                      <Check className="h-4 w-4 text-sky-400 flex-shrink-0"/>{item}
                    </div>
                  ))}
                </div>
              </div>
            </Tilt>
          </Reveal>
        </div>
      </section>

      {/* ══ MEMBERSHIP ════════════════════════════════════════════════════ */}
      <section className="py-20 sm:py-24 bg-gradient-to-b from-slate-50/60 to-white relative overflow-hidden">
        {/* subtle dot grid */}
        <div className="absolute inset-0 opacity-[0.4]" style={{backgroundImage:"radial-gradient(rgba(14,165,233,0.08) 1px,transparent 1px)",backgroundSize:"24px 24px"}}/>
        <div className="relative z-10 max-w-6xl mx-auto px-6 sm:px-8 lg:px-12">
          <Reveal dir="blur">
            <p className="text-center text-[11px] font-bold uppercase tracking-[0.22em] text-primary/50 mb-3">{t("Membership","Membresía")}</p>
          </Reveal>
          <Reveal delay={80}>
            <h2 className="text-4xl sm:text-5xl font-bold text-slate-900 text-center mb-3">{MS.heading}</h2>
          </Reveal>
          {MS.subheading && <Reveal delay={140}><p className="text-slate-500 text-center text-lg mb-6">{MS.subheading}</p></Reveal>}

          {/* Special offer banner */}
          {(MS.special_title || MS.special_text) && (
            <Reveal delay={180} dir="scale">
              <div className="relative overflow-hidden bg-gradient-to-r from-amber-50 to-yellow-50 rounded-2xl p-6 max-w-2xl mx-auto border border-amber-200/60 mb-12 shadow-sm group hover:shadow-md transition-shadow duration-300">
                <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-amber-400/50 to-transparent"/>
                {MS.special_title && <h3 className="text-2xl font-bold text-amber-800 mb-2">{MS.special_title}</h3>}
                {MS.special_text  && <p className="text-amber-700 text-base leading-relaxed">{MS.special_text}</p>}
              </div>
            </Reveal>
          )}

          {/* Cards */}
          <div className="grid md:grid-cols-3 gap-6 items-center max-w-4xl mx-auto mb-14">
            {plans.map((plan,i)=>(
              <Reveal key={i} delay={i*110} dir="up" dur={800}>
                <MembershipCard {...plan}/>
              </Reveal>
            ))}
          </div>

          {/* Support block */}
          <Reveal delay={350} dir="scale">
            <div className="text-center bg-white rounded-2xl p-8 shadow-lg max-w-2xl mx-auto border border-slate-100 hover:shadow-xl transition-shadow duration-300">
              <div className="w-12 h-12 mx-auto mb-4 bg-primary/10 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                <Shield className="w-6 h-6 text-primary"/>
              </div>
              {MS.cta_title && <h4 className="text-lg font-bold text-slate-900 mb-2">{MS.cta_title}</h4>}
              {MS.cta_text && (
                <p className="text-slate-500 text-sm mb-6">
                  {MS.cta_text}{" "}
                  {MS.contact_phone && (
                    <a href={`tel:${MS.contact_phone.replace(/[^\d]/g,"")}`} className="text-primary font-bold hover:underline">{MS.contact_phone}</a>
                  )}
                </p>
              )}
              {MS.cta_button_label && (()=>{
                const url = MS.cta_button_url||"/membership";
                const isExt = /^https?:\/\//i.test(url);
                const Inner = (
                  <Mag as="div" strength={0.28}
                    className="inline-flex items-center gap-2 overflow-hidden relative bg-primary text-white rounded-full px-10 py-4 text-[13px] font-bold uppercase tracking-widest shadow-lg shadow-primary/30 cursor-pointer hover:-translate-y-0.5 transition-transform duration-300 active:scale-95 group">
                    <span className="relative z-10 flex items-center gap-2">{MS.cta_button_label}<ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1"/></span>
                    <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/15 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700"/>
                  </Mag>
                );
                return isExt ? <a href={url} target="_blank" rel="noopener noreferrer">{Inner}</a> : <Link to={url}>{Inner}</Link>;
              })()}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ══ AIRBNB ════════════════════════════════════════════════════════ */}
      <DarkSection bgImage="https://images.unsplash.com/photo-1556910103-1c02745a2384?w=1920&h=1080&fit=crop" from="from-sky-950/92" to="to-sky-900/88" scrollY={scrollY}>
        <Reveal dir="blur">
          <p className="text-center text-[11px] font-bold uppercase tracking-[0.22em] text-sky-400/70 mb-4">{t("Airbnb & Rentals","Airbnb y Alquileres")}</p>
        </Reveal>
        <Reveal delay={80}>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-dark text-center mb-4 leading-tight">
            {t("Premium Laundry for","Lavandería Premium para")}
            <em className="block font-extralight not-italic text-sky-300">{t("Airbnb Hosts.","Anfitriones Airbnb.")}</em>
          </h2>
        </Reveal>
        <Reveal delay={160}>
          <p className="text-dark/60 text-center mb-8 max-w-lg mx-auto leading-relaxed">
            {t("Spotless linens. Five-star guest experiences. Zero hassle.","Ropa de cama impecable. Experiencias de cinco estrellas. Cero complicaciones.")}
          </p>
        </Reveal>
        <Reveal delay={240} dir="scale">
          <div className="bg-white/8 backdrop-blur-lg rounded-2xl border border-white/12 p-6 mb-8">
            <AccordionItem title={t("About This Service","Sobre Este Servicio")} isOpen={openAccordions.airbnb===0} onClick={()=>toggleAcc("airbnb",0)} variant="dark">
              <p className="text-dark/75 text-sm leading-relaxed pt-1">{t("Our Airbnb laundry service is built for hosts who want flawless turnovers and happier guests. We professionally clean, sanitize, and return linens on schedule.","Nuestro servicio está diseñado para anfitriones que quieren entregas impecables y huéspedes felices. Limpiamos y sanitizamos su ropa según el horario.")}</p>
            </AccordionItem>
            <AccordionItem title={t("Key Features","Características Clave")} isOpen={openAccordions.airbnb===1} onClick={()=>toggleAcc("airbnb",1)} variant="dark">
              <ul className="space-y-2 pt-1">
                {[t("Customized programs for Airbnb hosts","Programas personalizados para anfitriones"),t("Professional cleaning & sanitization","Limpieza y sanitización profesional"),t("Scheduled pickup aligned with turnover","Recogida alineada con tu horario"),t("Consistent quality for 5-star reviews","Calidad constante para reseñas 5 estrellas"),t("Save time, eliminate laundry stress","Ahorra tiempo, elimina el estrés")].map((item,i)=>(
                  <li key={i} className="flex items-start gap-2.5 text-sm text-white/75">
                    <Check className="w-4 h-4 text-sky-400 flex-shrink-0 mt-0.5"/>{item}
                  </li>
                ))}
              </ul>
            </AccordionItem>
          </div>
        </Reveal>
        <Reveal delay={340}>
          <div className="text-center">
            <Link to="/schedule-pickup">
              <Mag as="div" strength={0.25} className="inline-flex items-center gap-2 overflow-hidden relative bg-white text-primary rounded-full px-10 py-4 text-[13px] font-bold uppercase tracking-widest shadow-xl cursor-pointer hover:-translate-y-0.5 transition-transform duration-300 active:scale-95 group">
                <span className="relative z-10 flex items-center gap-2">🗓️ {t("SCHEDULE PICK-UP","PROGRAMAR RECOGIDA")}<ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1"/></span>
                <span className="absolute inset-0 bg-gradient-to-r from-transparent via-primary/8 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700"/>
              </Mag>
            </Link>
          </div>
        </Reveal>
      </DarkSection>

      {/* ══ B2B ═══════════════════════════════════════════════════════════ */}
      <DarkSection bgImage="https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=1920&h=1080&fit=crop" from="from-sky-950/92" to="to-indigo-950/88" scrollY={scrollY} parallaxStrength={0.12}>
        <Reveal dir="blur">
          <p className="text-center text-[11px] font-bold uppercase tracking-[0.22em] text-sky-400/70 mb-4">{t("B2B Solutions","Soluciones B2B")}</p>
        </Reveal>
        <Reveal delay={80}>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-dark text-center mb-4 leading-tight">
            {t("High-Performance","Alto Rendimiento")}
            <em className="block font-extralight not-italic text-sky-300">{t("B2B Laundry.","Lavandería B2B.")}</em>
          </h2>
        </Reveal>
        <Reveal delay={160}>
          <p className="text-dark/60 text-center mb-8 max-w-lg mx-auto leading-relaxed">
            {t("Reliable, scalable, professional — built to handle volume every day.","Confiable, escalable, profesional — para manejar volumen todos los días.")}
          </p>
        </Reveal>
        <Reveal delay={240} dir="scale">
          <div className="bg-white/8 backdrop-blur-lg rounded-2xl border border-white/12 p-6 mb-8">
            <AccordionItem title={t("About B2B Services","Sobre Servicios B2B")} isOpen={openAccordions.b2b===0} onClick={()=>toggleAcc("b2b",0)} variant="dark">
              <p className="text-dark/75 text-sm leading-relaxed pt-1">{t("We provide tailored B2B solutions that help businesses maintain the highest cleanliness standards while reducing operational costs. Commercial-grade quality, fast turnaround.","Ofrecemos soluciones B2B a medida que ayudan a las empresas a mantener los más altos estándares de limpieza reduciendo costos operativos.")}</p>
            </AccordionItem>
            <AccordionItem title={t("Key Features","Características Clave")} isOpen={openAccordions.b2b===1} onClick={()=>toggleAcc("b2b",1)} variant="dark">
              <ul className="space-y-2 pt-1">
                {[t("Customized programs for all business sizes","Programas para empresas de todos los tamaños"),t("Commercial-grade washing & stain removal","Lavado comercial y eliminación de manchas"),t("Scheduled pickup & delivery","Recogida y entrega programadas"),t("Flexible volume, no long-term commitments","Volumen flexible, sin compromisos largos"),t("Priority support for business clients","Soporte prioritario para clientes")].map((item,i)=>(
                  <li key={i} className="flex items-start gap-2.5 text-sm text-white/75">
                    <Check className="w-4 h-4 text-sky-400 flex-shrink-0 mt-0.5"/>{item}
                  </li>
                ))}
              </ul>
            </AccordionItem>
          </div>
        </Reveal>
        <Reveal delay={340}>
          <div className="text-center">
            <Link to="/request-quote">
              <Mag as="div" data-testid="b2b-request-quote-button" strength={0.25}
                className="inline-flex items-center gap-2 overflow-hidden relative bg-white text-sky-700 rounded-full px-10 py-4 text-[13px] font-bold uppercase tracking-widest shadow-xl cursor-pointer hover:-translate-y-0.5 transition-transform duration-300 active:scale-95 group">
                <span className="relative z-10 flex items-center gap-2">📊 {t("REQUEST A QUOTE","SOLICITAR COTIZACIÓN")}<ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1"/></span>
                <span className="absolute inset-0 bg-gradient-to-r from-transparent via-sky-100/30 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700"/>
              </Mag>
            </Link>
          </div>
        </Reveal>
      </DarkSection>

      {/* ══ COMMERCIAL ════════════════════════════════════════════════════ */}
      <DarkSection bgImage="https://images.unsplash.com/photo-1521791055366-0d553872125f?w=1920&h=1080&fit=crop" from="from-slate-950/93" to="to-slate-900/90" scrollY={scrollY} parallaxStrength={0.1}>
        <Reveal dir="blur">
          <p className="text-center text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400/80 mb-4">{t("Commercial Services","Servicios Comerciales")}</p>
        </Reveal>
        <Reveal delay={80}>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white text-center mb-4 leading-tight">
            {t("Commercial Laundry","Lavandería Comercial")}
            <em className="block font-extralight not-italic text-slate-300">{t("You Can Depend On.","En la que Puedes Confiar.")}</em>
          </h2>
        </Reveal>
        <Reveal delay={160}>
          <p className="text-white/55 text-center mb-8 max-w-lg mx-auto leading-relaxed">
            {t("Volume, quality, reliability — every single day.","Volumen, calidad, confiabilidad — todos los días.")}
          </p>
        </Reveal>
        <Reveal delay={240} dir="scale">
          <div className="bg-white/6 backdrop-blur-lg rounded-2xl border border-white/10 p-6 mb-8">
            <AccordionItem title={t("About Commercial Services","Sobre Servicios Comerciales")} isOpen={openAccordions.commercial===0} onClick={()=>toggleAcc("commercial",0)} variant="dark">
              <p className="text-dark/70 text-sm leading-relaxed pt-1">{t("Designed for high-traffic businesses — restaurants, hotels, spas, gyms, offices. Consistent results, dependable logistics, tailored to your needs.","Diseñado para negocios de alto tráfico — restaurantes, hoteles, spas, gimnasios. Resultados consistentes, logística confiable.")}</p>
            </AccordionItem>
            <AccordionItem title={t("Key Features","Características Clave")} isOpen={openAccordions.commercial===1} onClick={()=>toggleAcc("commercial",1)} variant="dark">
              <ul className="space-y-2 pt-1">
                {[t("Restaurants, hotels, spas, gyms, offices","Restaurantes, hoteles, spas, gimnasios"),t("High-volume processing with commercial equipment","Procesamiento de alto volumen"),t("Specialized care for uniforms and delicates","Cuidado especializado para uniformes"),t("Reliable pickup & delivery, strict quality control","Recogida confiable y control de calidad"),t("Flexible billing and service plans","Facturación y planes flexibles")].map((item,i)=>(
                  <li key={i} className="flex items-start gap-2.5 text-sm text-dark/70">
                    <Check className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5"/>{item}
                  </li>
                ))}
              </ul>
            </AccordionItem>
          </div>
        </Reveal>
        <Reveal delay={340}>
          <div className="text-center">
            <Link to="/request-quote">
              <Mag as="div" data-testid="commercial-request-quote-button" strength={0.25}
                className="inline-flex items-center gap-2 overflow-hidden relative bg-white text-slate-900 rounded-full px-10 py-4 text-[13px] font-bold uppercase tracking-widest shadow-xl cursor-pointer hover:-translate-y-0.5 transition-transform duration-300 active:scale-95 group">
                <span className="relative z-10 flex items-center gap-2">📋 {t("REQUEST A QUOTE","SOLICITAR COTIZACIÓN")}<ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1"/></span>
                <span className="absolute inset-0 bg-gradient-to-r from-transparent via-slate-200/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700"/>
              </Mag>
            </Link>
          </div>
        </Reveal>
      </DarkSection>

      {/* ══ QUOTE ═════════════════════════════════════════════════════════ */}
      <section className="relative py-28 overflow-hidden">
        <div className="absolute inset-0 will-change-transform"
          style={{backgroundImage:"url('https://images.unsplash.com/photo-1517677208171-0bc6725a3e60?w=1920&h=1080&fit=crop')",backgroundSize:"cover",backgroundPosition:"center",transform:`translateY(${scrollY*0.2}px) scale(1.1)`}}/>
        <div className="absolute inset-0 bg-gradient-to-br from-black/85 to-black/70"/>
        <div className="absolute inset-0" style={{background:"radial-gradient(ellipse at center,transparent 40%,rgba(0,0,0,0.5) 100%)"}}/>
        <div className="relative z-10 max-w-3xl mx-auto px-6 text-center">
          <Reveal dir="scale" dur={900}>
            <div>
              <span className="text-white/20 text-8xl font-serif leading-none select-none block mb-4">"</span>
              <h2 className="text-4xl sm:text-5xl font-bold text-white italic mb-6 leading-tight">
                {t("If you care for your laundry,","Si cuidas tu ropa,")}
                <span className="block font-extralight">{t("you'll notice the difference.","notarás la diferencia.")}</span>
              </h2>
              <div className="w-16 h-px bg-gradient-to-r from-transparent via-primary to-transparent mx-auto mb-6"/>
              <p className="text-xl text-white/60 italic mb-10">{t("Clean linens, happy clients…","Ropa de cama limpia, clientes felices…")}</p>
              <div className="flex justify-center flex-wrap gap-6">
                {[{icon:<Clock className="w-4 h-4"/>,text:t("Since 2020","Desde 2020")},{icon:<Star className="w-4 h-4"/>,text:t("5-Star Service","Servicio 5 estrellas")},{icon:<Truck className="w-4 h-4"/>,text:t("Free Pickup","Recogida gratis")}].map((it,i)=>(
                  <div key={i} className="flex items-center gap-2 text-white/50 text-sm hover:text-white/80 transition-colors duration-200">
                    {it.icon}{it.text}
                  </div>
                ))}
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ══ PRICING ═══════════════════════════════════════════════════════ */}
      <section className="py-20 sm:py-24 bg-white">
        <div className="max-w-6xl mx-auto px-6 sm:px-8 lg:px-12">
          <Reveal dir="blur"><p className="text-center text-[11px] font-bold uppercase tracking-[0.22em] text-primary/50 mb-3">{t("Pricing","Precios")}</p></Reveal>
          <Reveal delay={80}>
            <h2 className="text-4xl sm:text-5xl font-bold text-slate-900 text-center mb-3 leading-tight">
              {t("Transparent","Precios")}
              <em className="block text-primary font-extralight not-italic">{t("Pricing.","Transparentes.")}</em>
            </h2>
          </Reveal>
          <Reveal delay={160}><p className="text-slate-400 text-center mb-14 max-w-xl mx-auto text-lg">{t("No surprises. Premium service you can count on.","Sin sorpresas. Servicio premium en el que puedes confiar.")}</p></Reveal>

          {/* Pickup & Self Service */}
          <div className="grid md:grid-cols-2 gap-6 mb-6">
            <Reveal dir="left" delay={0}>
              <PricingTable
                title={t("🚚 Pickup & Delivery","🚚 Recogida y Entrega")}
                data={[{option:t("Recurring (Subscription)","Recurrente"),rate:"$2.50/lb",minimum:"$40"},{option:t("As Needed","Bajo demanda"),rate:"$2.75/lb",minimum:"$40"}]}
                note={t("Recurring service is designed for weekly/bi-weekly customers, families, and rentals.","El servicio recurrente está diseñado para clientes semanales o quincenales.")}
              />
            </Reveal>
            <Reveal dir="right" delay={100}>
              <div className="bg-white rounded-2xl p-8 shadow-lg border border-slate-100 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 h-full">
                <h3 className="text-xl font-bold text-slate-900 text-center mb-3">{t("🏪 Self Service","🏪 Autoservicio")}</h3>
                <p className="text-slate-400 text-center text-sm mb-6">{t("Walk in and wash anytime.","Entra y lava en cualquier momento.")}</p>
                <div className="grid grid-cols-2 gap-6">
                  {[{title:t("Washers","Lavadoras"),items:WASHER_PRICES,note:null},{title:t("Dryers (30 min)","Secadoras (30 min)"),items:DRYER_PRICES,note:t("+6 min extra: $0.25","+6 min extra: $0.25")}].map((col,ci)=>(
                    <div key={ci}>
                      <h4 className="font-bold text-slate-800 mb-4 flex items-center gap-2 text-sm">
                        <span className="w-0.5 h-5 bg-primary rounded-full inline-block"/>
                        {col.title}
                      </h4>
                      <ul className="space-y-2">
                        {col.items.map((it,i)=>(
                          <li key={i} className="flex justify-between text-sm text-slate-500 hover:text-slate-800 transition-colors">
                            <span>{it.size}</span>
                            <strong className="text-slate-900 tabular-nums">{it.price}</strong>
                          </li>
                        ))}
                      </ul>
                      {col.note && <p className="text-xs text-slate-400 mt-3 italic">{col.note}</p>}
                    </div>
                  ))}
                </div>
              </div>
            </Reveal>
          </div>

          {/* Per Piece */}
          <Reveal delay={200} dir="up" dur={800}>
            <div className="bg-white rounded-2xl p-8 shadow-lg border border-slate-100 hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
              <h3 className="text-xl font-bold text-slate-900 text-center mb-8">{t("🧺 Per Piece Pricing","🧺 Precio por Pieza")}</h3>
              <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-8">
                {PER_PIECE_CATEGORIES.map((cat,ci)=>(
                  <div key={ci}>
                    <h4 className="font-bold text-slate-800 mb-4 text-sm uppercase tracking-wider border-b-2 border-primary/15 pb-2">{cat.category}</h4>
                    <div className="space-y-2">
                      {cat.items.map((it,i)=>(
                        <div key={i} className="flex justify-between text-sm text-slate-500 hover:text-slate-800 transition-colors group py-0.5">
                          <span>{it.name}</span>
                          <strong className="text-slate-900 tabular-nums group-hover:text-primary transition-colors duration-200">{it.price}</strong>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-8 pt-6 border-t border-slate-50 text-center">
                <Link to="/schedule-pickup" className="inline-flex items-center gap-1.5 text-sm text-primary hover:text-sky-600 font-semibold transition-colors group">
                  {t("Need special items? Contact us","¿Artículos especiales? Contáctanos")}
                  <ArrowRight className="w-3.5 h-3.5 transition-transform duration-200 group-hover:translate-x-1"/>
                </Link>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      <PublicFooter/>
    </div>
  </>);
}