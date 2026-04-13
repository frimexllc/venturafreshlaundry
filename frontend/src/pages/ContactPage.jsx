import { useState, useEffect, useRef, useCallback } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import {
  Mail, Phone, MapPin, Clock, ChevronDown, Send, ArrowRight, Sparkles, MessageSquare
} from "lucide-react";
import PublicNav from "../components/PublicNav";
import PublicFooter from "../components/PublicFooter";
import SmsConsentField from "../components/SmsConsentField";
import { useLocale } from "../context/LocaleContext";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

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
const Tilt = ({ children, className = "", depth = 6 }) => {
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
    <div className="flex gap-12 whitespace-nowrap" style={{ animation: "mq 30s linear infinite" }}>
      {[...items, ...items, ...items].map((it, i) => (
        <span key={i} className="text-[11px] font-bold uppercase tracking-[0.2em] text-primary/45 flex items-center gap-3">
          <span className="w-1 h-1 rounded-full bg-primary/30 inline-block" />{it}
        </span>
      ))}
    </div>
  </div>
);

// ─── Accordion ────────────────────────────────────────────────────────────────
const AccordionItem = ({ title, children, isOpen, onClick }) => (
  <div className="border-b border-slate-200/70 last:border-0">
    <button onClick={onClick}
      className="w-full py-5 flex items-center justify-between text-left group focus:outline-none"
      aria-expanded={isOpen}>
      <span className="text-base font-semibold text-slate-800 group-hover:text-primary transition-colors duration-150 pr-4">
        {title}
      </span>
      <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-all duration-200
        ${isOpen ? "bg-primary text-white rotate-180" : "bg-slate-100 text-slate-400 group-hover:bg-primary/10 group-hover:text-primary"}`}>
        <ChevronDown className="w-4 h-4" />
      </div>
    </button>
    <div className={`overflow-hidden transition-all duration-300 ease-in-out ${isOpen ? "max-h-[500px] pb-5 opacity-100" : "max-h-0 opacity-0"}`}>
      <p className="text-slate-500 text-sm leading-relaxed">{children}</p>
    </div>
  </div>
);

// ─── Contact Info Card ────────────────────────────────────────────────────────
const InfoCard = ({ icon: Icon, label, children, delay }) => {
  const [h, setH] = useState(false);
  return (
    <Reveal delay={delay} dir="left">
      <Tilt depth={3}>
        <div
          className={`relative flex items-start gap-4 p-5 rounded-2xl border transition-all duration-200 overflow-hidden
            ${h ? "border-primary/25 shadow-lg shadow-sky-100/60 -translate-y-0.5 bg-white" : "border-slate-100 bg-white shadow-md"}`}
          onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}>
          <div className={`absolute top-0 left-4 right-4 h-px bg-gradient-to-r from-transparent via-primary to-transparent transition-opacity duration-300 ${h ? "opacity-100" : "opacity-0"}`} />
          <div className={`absolute inset-0 bg-gradient-to-br from-sky-50/50 to-transparent transition-opacity duration-300 ${h ? "opacity-100" : "opacity-0"}`} />
          <div className={`relative w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 transition-all duration-200 ${h ? "bg-primary/15 scale-110" : "bg-sky-50"}`}>
            <Icon className={`h-5 w-5 transition-colors duration-150 ${h ? "text-primary" : "text-sky-500"}`} />
          </div>
          <div className="relative">
            <p className={`font-bold text-sm mb-0.5 transition-colors duration-150 ${h ? "text-primary" : "text-slate-800"}`}>{label}</p>
            <div className="text-slate-500 text-sm leading-relaxed">{children}</div>
          </div>
        </div>
      </Tilt>
    </Reveal>
  );
};

// ─── Styled Input ─────────────────────────────────────────────────────────────
const inputCls = "w-full border border-slate-200 bg-white rounded-xl px-4 py-3 text-sm text-slate-800 placeholder-slate-300 focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition-all duration-200 mt-1.5";

// ─── MAIN ─────────────────────────────────────────────────────────────────────
export default function ContactPage() {
  const { t } = useLocale();
  const [scrollY, setScrollY] = useState(0);
  const [openFaq, setOpenFaq] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const { ring, dot } = useCursor();

  const [form, setForm] = useState({
    name: "", email: "", phone: "", subject: "",
    contact_method: "", sms_consent: false, message: ""
  });

  // Reset sms_consent if the selected contact method does not require it
  useEffect(() => {
    const requiresConsent = ["text", "sms", "whatsapp"].includes(form.contact_method);
    if (!requiresConsent && form.sms_consent) {
      setForm(prev => ({ ...prev, sms_consent: false }));
    }
  }, [form.contact_method]);

  useEffect(() => {
    let tick = false;
    const fn = () => { if (!tick) { requestAnimationFrame(() => { setScrollY(window.pageYOffset); tick = false; }); tick = true; } };
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (["text", "sms", "whatsapp"].includes(form.contact_method) && !form.sms_consent) {
      toast.error(t("You must accept SMS consent to receive text notifications.", "Debes aceptar el consentimiento SMS para recibir notificaciones por mensaje."));
      return;
    }
    setSubmitting(true);
    try {
      const res = await axios.post(`${API}/public/contact`, {
        name: form.name.trim(), email: form.email.trim(), phone: form.phone.trim(),
        contact_method: form.contact_method, sms_consent: form.sms_consent,
        subject: form.subject.trim(),
        message: `Subject: ${form.subject.trim()}\nPreferred Contact: ${form.contact_method}\n\n${form.message.trim()}`.trim()
      });
      toast.success(res.data.message);
      setSubmitted(true);
      setForm({ name: "", email: "", phone: "", subject: "", contact_method: "", sms_consent: false, message: "" });
      setTimeout(() => setSubmitted(false), 5000);
    } catch (err) {
      toast.error(err.response?.data?.detail || t("Error sending message", "Error al enviar mensaje"));
    } finally {
      setSubmitting(false);
    }
  };

  const toggleFaq = (i) => setOpenFaq(p => p === i ? null : i);

  const marqueeItems = [
    t("Contact Us", "Contáctanos"), t("Pickup & Delivery", "Recogida y Entrega"),
    t("(820) 234-8181", "(820) 234-8181"), t("Ventura County", "Condado de Ventura"),
    t("Open 7 Days", "Abierto 7 Días"), t("We Reply Fast", "Respondemos Rápido"),
  ];

  const faqs = [
    {
      q: t("What services do you offer?", "¿Qué servicios ofrecen?"),
      a: t("We offer self-service laundry, professional wash & fold, and pickup & delivery services across Ventura County. We handle everything from everyday clothes to delicate items with care.", "Ofrecemos servicio de lavandería de autoservicio, lavado y doblado profesional, y servicios de recogida y entrega en todo el condado de Ventura.")
    },
    {
      q: t("How do I get started?", "¿Cómo empiezo?"),
      a: t("Simply fill out the contact form, call/text us at (820) 234-8181, or schedule a pickup directly. We'll confirm your pickup time and any special instructions.", "Completa el formulario de contacto, llámanos al (820) 234-8181, o programa una recogida. Confirmaremos tu horario y cualquier instrucción especial.")
    },
    {
      q: t("What makes you different?", "¿Qué los hace diferentes?"),
      a: t("We focus on personalized service — your preferences are saved and followed every time. Plus, you get real-time text updates so you always know where your laundry is.", "Nos enfocamos en el servicio personalizado: tus preferencias se guardan cada vez. Además, recibes actualizaciones en tiempo real por mensaje de texto.")
    },
    {
      q: t("How can I contact you?", "¿Cómo puedo contactarlos?"),
      a: t("Call or text (820) 234-8181, email info@venturafreshlaundry.com, visit us at 5722 Telephone Rd #5, Ventura, CA 93003, or use the contact form above.", "Llama o envía un mensaje al (820) 234-8181, escríbenos a info@venturafreshlaundry.com, o visítanos en 5722 Telephone Rd #5, Ventura, CA 93003.")
    },
    {
      q: t("What's your pricing model?", "¿Cómo es su modelo de precios?"),
      a: t("We charge by the pound for wash & fold, with pickup and delivery included for orders over a minimum weight. Contact us for commercial pricing tailored to your business.", "Cobramos por libra para lavado y doblado, con recogida y entrega incluida para pedidos que superen el peso mínimo. Contáctanos para precios comerciales.")
    },
    {
      q: t("What's it like to work with you?", "¿Cómo es trabajar con ustedes?"),
      a: t("Simple and hassle-free. Schedule a pickup, we collect, clean to your exact preferences, and deliver back folded. You'll receive updates at every step.", "Simple y sin complicaciones. Programa una recogida, recogemos, lavamos según tus preferencias y te lo devolvemos doblado. Recibirás actualizaciones en cada paso.")
    },
  ];

  return (
    <>
      {/* Cursor */}
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
        <section className="relative min-h-[65vh] flex items-end justify-center overflow-hidden">
          <div className="absolute inset-0 will-change-transform"
            style={{ backgroundImage: "url('https://images.unsplash.com/photo-1423666639041-f56000c27a9a?w=1920&h=1080&fit=crop')", backgroundSize: "cover", backgroundPosition: "center", transform: `translateY(${scrollY * 0.22}px) scale(1.08)` }} />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/92 via-slate-900/65 to-slate-800/25" />
          <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at center,transparent 40%,rgba(0,0,0,0.5) 100%)" }} />
          <div className="absolute inset-0 opacity-[0.025]" style={{ backgroundImage: "repeating-linear-gradient(0deg,#000 0px,#000 1px,transparent 1px,transparent 4px)" }} />

          <div className="relative z-10 text-center px-6 pb-20 max-w-4xl mx-auto">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/8 backdrop-blur-md border border-white/15 mb-7"
              style={{ animation: "fadeUp 0.5s 0.05s both ease-out" }}>
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              <span className="text-[11px] text-white/75 font-bold uppercase tracking-[0.18em] not-italic">{t("Get in touch", "Escríbenos")}</span>
            </div>
            <h1 className="text-5xl sm:text-6xl md:text-7xl leading-[1.05] mb-4 tracking-tight not-italic"
              style={{ animation: "fadeUp 0.5s 0.12s both ease-out" }}>
              <span className="text-white">{t("We're here", "Estamos aquí")}</span>
              <span className="block text-white not-italic">
                {t("for you.", "para ti.")}
              </span>
            </h1>
            <p className="text-lg sm:text-xl text-white/70 max-w-xl mx-auto not-italic" style={{ animation: "fadeUp 0.5s 0.2s both ease-out" }}>
              {t("Let's take care of your laundry, so you can focus on what matters most.", "Nos encargamos de tu lavandería para que tú te concentres en lo que importa.")}
            </p>
          </div>

          <div className="absolute bottom-0 left-0 right-0 z-20">
            <svg viewBox="0 0 1440 90" preserveAspectRatio="none" className="w-full h-12 sm:h-16 lg:h-20">
              <path d="M0,45 C300,0 600,90 1440,45 L1440,90 L0,90 Z" fill="white" />
            </svg>
          </div>
        </section>

        {/* ══ MARQUEE ═══════════════════════════════════════════════════════ */}
        <Marquee items={marqueeItems} />

        {/* ══ CONTACT GRID ══════════════════════════════════════════════════ */}
        <section className="py-20 sm:py-24 relative overflow-hidden bg-white">
          <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: "url('https://images.unsplash.com/photo-1582735689369-4fe89db7114c?w=1920&h=1080&fit=crop')", backgroundSize: "cover", backgroundPosition: "center", transform: `translateY(${scrollY * 0.1}px)` }} />

          <div className="relative z-10 max-w-6xl mx-auto px-6 sm:px-8 lg:px-12">
            <Reveal dir="blur" dur={300}>
              <p className="text-center text-[11px] font-bold uppercase tracking-[0.22em] text-primary/50 mb-3 not-italic">{t("Reach Out", "Escríbenos")}</p>
            </Reveal>
            <Reveal delay={50} dur={300}>
              <h2 className="text-4xl sm:text-5xl font-bold text-slate-900 text-center mb-3 leading-tight not-italic">
                {t("Talk to us,", "Hablemos,")}
                <span className="block text-primary font-bold not-italic">{t("anytime.", "cuando quieras.")}</span>
              </h2>
            </Reveal>
            <Reveal delay={100} dur={300}>
              <p className="text-slate-400 text-center mb-14 max-w-xl mx-auto text-lg not-italic">
                {t("Call, text, email, or show up — we reply fast.", "Llama, escribe, correo o visítanos — respondemos rápido.")}
              </p>
            </Reveal>

            <div className="grid lg:grid-cols-2 gap-10 items-start">

              {/* ── LEFT: Info + Map ── */}
              <div className="space-y-4">
                <InfoCard icon={Mail} label={t("Email", "Correo")} delay={0}>
                  <a href="mailto:info@venturafreshlaundry.com" className="text-primary hover:underline font-medium not-italic">
                    info@venturafreshlaundry.com
                  </a>
                </InfoCard>
                <InfoCard icon={Phone} label={t("Phone / Text", "Teléfono / Mensaje")} delay={60}>
                  <a href="tel:+18058368872" className="text-primary hover:underline font-medium not-italic">+1 (820) 234-8181</a>
                </InfoCard>
                <InfoCard icon={MapPin} label={t("Address", "Dirección")} delay={120}>
                  <span className="not-italic">5722 Telephone Rd #5, Ventura, CA 93003</span>
                </InfoCard>
<InfoCard icon={Clock} label={t("Hours", "Horario")} delay={180}>
  <div className="not-italic space-y-1">
    
    <div>
      <strong>{t("Self-Service:", "Autoservicio:")}</strong>
      <br />
      {t("Monday – Sunday · 6:00 AM – 10:00 PM", "Lunes – Domingo · 6:00 AM – 10:00 PM")}
      <br />
      <span className="text-sm">
        {t("Last wash at 9:00 PM", "Última lavada a las 9:00 PM")}
      </span>
    </div>

    <div>
      <strong>{t("Wash & Fold:", "Lavado y Doblado:")}</strong>
      <br />
      {t("Monday – Sunday · 8:00 AM – 6:00 PM", "Lunes – Domingo · 8:00 AM – 6:00 PM")}
    </div>

  </div>
</InfoCard>

                {/* Map */}
                <Reveal delay={220} dir="up" dur={400}>
                  <Tilt depth={2}>
                    <div className="rounded-2xl overflow-hidden shadow-xl shadow-sky-100/40 border border-slate-100 h-60 mt-2">
                      <iframe
                        src="https://www.google.com/maps/embed?pb=!1m14!1m8!1m3!1d13189.551976893248!2d-119.213715!3d34.264157!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x80e84d4c078097ed%3A0x5e2cf7ad62ef27e9!2sLaunderland!5e0!3m2!1ses-419!2smx!4v1774668361862!5m2!1ses-419!2smx"
                        width="100%"
                        height="100%"
                        style={{ border: 0 }}
                        allowFullScreen
                        loading="lazy"
                        referrerPolicy="no-referrer-when-downgrade"
                        title="Ventura Fresh Laundry Location"
                      />
                    </div>
                  </Tilt>
                </Reveal>
              </div>

              {/* ── RIGHT: Contact Form ── */}
              <Reveal delay={80} dir="right" dur={400}>
                <Tilt depth={2}>
                  <div className="relative bg-white rounded-2xl border border-slate-100 shadow-xl shadow-sky-50/60 overflow-hidden">
                    <div className="absolute top-0 left-8 right-8 h-px bg-gradient-to-r from-transparent via-primary to-transparent" />
                    <div className="absolute inset-0 bg-gradient-to-br from-sky-50/40 to-transparent pointer-events-none" />

                    <div className="relative p-7 sm:p-8">
                      <div className="flex items-center gap-3 mb-7">
                        <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center">
                          <MessageSquare className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                          <h3 className="text-lg font-bold text-slate-900 not-italic">{t("Send us a message", "Envíanos un mensaje")}</h3>
                          <p className="text-slate-400 text-xs not-italic">{t("We usually reply within a few hours.", "Solemos responder en pocas horas.")}</p>
                        </div>
                      </div>

                      {submitted && (
                        <div className="mb-6 p-4 rounded-xl bg-emerald-50 border border-emerald-200/60 flex items-center gap-3">
                          <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center flex-shrink-0">
                            <span className="text-emerald-600 text-lg">✓</span>
                          </div>
                          <div>
                            <p className="text-emerald-800 font-semibold text-sm not-italic">{t("Message sent!", "¡Mensaje enviado!")}</p>
                            <p className="text-emerald-600 text-xs not-italic">{t("We'll get back to you soon.", "Te responderemos pronto.")}</p>
                          </div>
                        </div>
                      )}

                      <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="grid sm:grid-cols-2 gap-4">
                          <div>
                            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 not-italic">{t("Full Name", "Nombre Completo")} <span className="text-primary">*</span></label>
                            <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required className={inputCls} data-testid="contact-name-input" />
                          </div>
                          <div>
                            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 not-italic">{t("Email", "Correo")} <span className="text-primary">*</span></label>
                            <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} required className={inputCls} data-testid="contact-email-input" />
                          </div>
                        </div>

                        <div className="grid sm:grid-cols-2 gap-4">
                          <div>
                            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 not-italic">{t("Phone", "Teléfono")}</label>
                            <input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="+1 (___) ___-____" className={inputCls} />
                          </div>
                          <div>
                            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 not-italic">
                              {t("Best contact", "Contacto preferido")}
                            </label>
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
                              {[
                                { val: "phone", icon: "📞", en: t("Phone Call", "Llamada") },
                                { val: "text",  icon: "💬", en: "Text/SMS" },
                                { val: "email", icon: "✉️", en: "Email" },
                              ].map((o) => (
                                <button
                                  key={o.val}
                                  type="button"
                                  onClick={() => setForm({ ...form, contact_method: o.val })}
                                  style={{
                                    display: "flex", alignItems: "center", gap: 6,
                                    padding: "8px 14px", borderRadius: 999,
                                    border: `1.5px solid ${form.contact_method === o.val ? "#0ea5e9" : "#e2e8f0"}`,
                                    background: form.contact_method === o.val ? "rgba(14,165,233,.08)" : "white",
                                    color: form.contact_method === o.val ? "#0ea5e9" : "#64748b",
                                    fontSize: 12, fontWeight: form.contact_method === o.val ? 700 : 500,
                                    cursor: "pointer", transition: "all .15s",
                                    boxShadow: form.contact_method === o.val ? "0 0 0 3px rgba(14,165,233,.12)" : "none",
                                  }}
                                >
                                  <span style={{ fontSize: 14 }}>{o.icon}</span>
                                  {o.en}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>

                        {/* Condicional: solo mostrar el campo de consentimiento si el método seleccionado requiere SMS */}
                        {["text", "sms", "whatsapp"].includes(form.contact_method) && (
                          <SmsConsentField
                            checked={form.sms_consent}
                            onChange={e => setForm({ ...form, sms_consent: e.target.checked })}
                            idPrefix="contact-sms-consent"
                          />
                        )}

                        <div>
                          <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 not-italic">{t("Subject", "Asunto")} <span className="text-primary">*</span></label>
                          <input value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })} required placeholder={t("How can we help?", "¿Cómo podemos ayudarte?")} className={inputCls} data-testid="contact-subject-input" />
                        </div>

                        <div>
                          <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 not-italic">{t("Message", "Mensaje")} <span className="text-primary">*</span></label>
                          <textarea value={form.message} onChange={e => setForm({ ...form, message: e.target.value })} required rows={5}
                            placeholder={t("Tell us more about your inquiry...", "Cuéntanos más sobre tu consulta...")}
                            className={`${inputCls} resize-none`} data-testid="contact-message-input" />
                        </div>

                        <button type="submit" disabled={submitting} data-testid="contact-submit-btn"
                          className="group w-full flex items-center justify-center gap-2 bg-primary text-white rounded-xl px-6 py-3.5 text-sm font-bold uppercase tracking-wider hover:bg-primary/90 transition-all duration-200 shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 active:scale-95 overflow-hidden relative disabled:opacity-60 disabled:cursor-not-allowed">
                          {submitting ? (
                            <span className="flex items-center gap-2 not-italic">
                              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                              {t("Sending...", "Enviando...")}
                            </span>
                          ) : (
                            <span className="relative z-10 flex items-center gap-2 not-italic">
                              {t("Send Message", "Enviar Mensaje")}
                              <Send className="w-4 h-4 transition-transform duration-150 group-hover:translate-x-1" />
                            </span>
                          )}
                          <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/15 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-500" />
                        </button>
                      </form>
                    </div>
                  </div>
                </Tilt>
              </Reveal>
            </div>
          </div>
        </section>

        {/* ══ DARK TAGLINE ══════════════════════════════════════════════════ */}
        <section className="relative py-28 overflow-hidden bg-sky-950">
          <div className="absolute inset-0 will-change-transform"
            style={{ backgroundImage: "url('https://images.unsplash.com/photo-1517677208171-0bc6725a3e60?w=1920&h=1080&fit=crop')", backgroundSize: "cover", backgroundPosition: "center", transform: `translateY(${scrollY * 0.18}px) scale(1.1)` }} />
          <div className="absolute inset-0 bg-sky-950/70" /><div className="absolute inset-0 bg-gradient-to-br from-sky-950/80 to-sky-900/75" />
          <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: "radial-gradient(rgba(255,255,255,0.8) 1px,transparent 1px)", backgroundSize: "28px 28px" }} />
          <div className="relative z-10 max-w-3xl mx-auto px-6 text-center">
            <Reveal dir="scale" dur={400}>
              <div>
                <Sparkles className="w-7 h-7 text-sky-400/60 mx-auto mb-5" />
                <h2 className="text-4xl sm:text-5xl font-bold text-white mb-4 leading-tight not-italic">
                  {t("Simplify your days.", "Simplifica tus días.")}
                  <span className="block font-light mt-1 not-italic">{t("We'll handle the laundry.", "Nosotros manejamos la lavandería.")}</span>
                </h2>
                <div className="w-16 h-px bg-gradient-to-r from-transparent via-primary to-transparent mx-auto mb-6" />
                <p className="text-white/55 text-lg not-italic">
                  {t("Clean • Bright • Trusted", "Limpio • Brillante • Confiable")}
                </p>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ══ FAQ ═══════════════════════════════════════════════════════════ */}
        <section className="py-20 sm:py-24 bg-gradient-to-b from-slate-50/60 to-white relative overflow-hidden">
          <div className="absolute inset-0 opacity-[0.35]" style={{ backgroundImage: "radial-gradient(rgba(14,165,233,0.07) 1px,transparent 1px)", backgroundSize: "24px 24px" }} />
          <div className="relative z-10 max-w-3xl mx-auto px-6 sm:px-8">
            <Reveal dir="blur" dur={300}>
              <p className="text-center text-[11px] font-bold uppercase tracking-[0.22em] text-primary/50 mb-3 not-italic">{t("FAQ", "Preguntas Frecuentes")}</p>
            </Reveal>
            <Reveal delay={50} dur={300}>
              <h2 className="text-4xl sm:text-5xl font-bold text-slate-900 text-center mb-3 leading-tight not-italic">
                {t("Common", "Preguntas")}
                <span className="block text-primary font-bold not-italic">{t("questions.", "comunes.")}</span>
              </h2>
            </Reveal>
            <Reveal delay={100} dur={300}>
              <p className="text-slate-400 text-center mb-12 text-lg not-italic">{t("Can't find what you're looking for? Contact us directly.", "¿No encuentras lo que buscas? Contáctanos directamente.")}</p>
            </Reveal>

            <Reveal delay={140} dir="scale" dur={350}>
              <div className="bg-white rounded-2xl border border-slate-100 shadow-lg divide-y-0 px-6 sm:px-8 py-2">
                {faqs.map((faq, i) => (
                  <AccordionItem key={i} title={faq.q} isOpen={openFaq === i} onClick={() => toggleFaq(i)}>
                    {faq.a}
                  </AccordionItem>
                ))}
              </div>
            </Reveal>

            <Reveal delay={220} dir="up" dur={300}>
              <div className="text-center mt-10">
                <p className="text-slate-400 text-sm mb-5 not-italic">{t("Still have questions?", "¿Todavía tienes preguntas?")}</p>
                <Mag as="a" href="tel:+1(820) 234-8181" strength={0.25}
                  className="inline-flex items-center gap-2 overflow-hidden relative bg-primary text-white rounded-full px-10 py-4 text-[13px] font-bold uppercase tracking-widest shadow-lg shadow-primary/30 cursor-pointer hover:-translate-y-0.5 transition-transform duration-200 active:scale-95 group">
                  <span className="relative z-10 flex items-center gap-2 not-italic">
                    📞 {t("Call Us Now", "Llámanos Ahora")}
                    <ArrowRight className="w-4 h-4 transition-transform duration-150 group-hover:translate-x-1" />
                  </span>
                  <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/15 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-500" />
                </Mag>
              </div>
            </Reveal>
          </div>
        </section>

        <PublicFooter />
      </div>
    </>
  );
}