import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, ChevronUp, Phone, MapPin, Clock } from "lucide-react";
import { Button } from "../components/ui/button";
import PublicNav from "../components/PublicNav";
import PublicFooter from "../components/PublicFooter";
import videoVFL from "../assets/videoHeroHomeInicial.mp4";
import { useLocale } from "../context/LocaleContext";

// FAQ Accordion Component
const FAQItem = ({ question, answer, isOpen, onClick }) => (
  <div className="border-b border-slate-700 last:border-0">
    <button
      onClick={onClick}
      className="w-full py-5 flex items-center justify-between text-left group"
    >
      <span className="text-lg font-medium text-slate-100 group-hover:text-sky-300 transition-colors pr-4">
        {question}
      </span>
      <div className="flex-shrink-0 h-8 w-8 rounded-full bg-slate-800 flex items-center justify-center">
        {isOpen ? (
          <ChevronUp className="h-5 w-5 text-sky-600" />
        ) : (
          <ChevronDown className="h-5 w-5 text-slate-300" />
        )}
      </div>
    </button>
    <div
      className={`overflow-hidden transition-all duration-300 ${
        isOpen ? "max-h-[500px] pb-5" : "max-h-0"
      }`}
    >
      <div className="text-slate-300 leading-relaxed">{answer}</div>
    </div>
  </div>
);

// Componente de animación escalonada
const StaggeredElement = ({ children, delay = 0, className = "" }) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), delay);
    return () => clearTimeout(timer);
  }, [delay]);

  return (
    <div
      className={`${className} ${
        isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
      } transition-all duration-700 ease-out`}
    >
      {children}
    </div>
  );
};

export default function LandingPage() {
  const { t, locale } = useLocale();
  const [openFAQ, setOpenFAQ] = useState(null);
  const [scrollY, setScrollY] = useState(0);

  // Colores editables del Home (aquí puedes ajustar el look completo):
  const LANDING_THEME = {
    heroOverlay: "linear-gradient(135deg, rgba(2, 6, 23, 0.82) 0%, rgba(15, 23, 42, 0.65) 48%, rgba(3, 37, 65, 0.58) 100%)",
    waveHeroToFeatures: "#0b4a72",
    waveToDarkSections: "#0f172a"
  };

  // Efecto de parallax
  useEffect(() => {
    const handleScroll = () => setScrollY(window.pageYOffset);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // FAQs según idioma
  const faqs = useMemo(() => [
    {
      question: t("What services do you offer?", "¿Qué servicios ofrecen?"),
      answer: locale === "es" ? (
        <div>
          <p className="mb-2">
            Ofrecemos una gama completa de soluciones de lavandería para negocios y anfitriones de Airbnb, incluyendo:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Servicios de lavandería B2B</strong> – personalizados para empresas de todos los tamaños</li>
            <li><strong>Lavandería para Airbnb y alquileres de corto plazo</strong> – ropa de cama impecable, respuesta rápida</li>
            <li><strong>Lavado y doblado</strong> – asequible y conveniente para cualquier carga de ropa</li>
            <li><strong>Servicios de recogida y entrega</strong> – programados para adaptarse a tus necesidades</li>
          </ul>
        </div>
      ) : (
        <div>
          <p className="mb-2">
            We offer a full range of laundry solutions for businesses and Airbnb hosts, including:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>B2B Laundry Services</strong> – customized for businesses of all sizes</li>
            <li><strong>Airbnb & Short-Term Rental Laundry</strong> – spotless linens, fast turnaround</li>
            <li><strong>Wash & Fold</strong> – affordable and convenient for any laundry load</li>
            <li><strong>Pickup & Delivery Services</strong> – scheduled to fit your needs</li>
          </ul>
        </div>
      )
    },
    {
      question: t("How do I get started?", "¿Cómo empiezo?"),
      answer: t(
        "Getting started is easy! Simply click the pickup button below and complete the short request form. We'll schedule your first pickup and customize your laundry service based on your preferences.",
        "¡Comenzar es fácil! Simplemente haz clic en el botón de recogida y completa el breve formulario de solicitud. Programaremos tu primera recogida y personalizaremos tu servicio de lavandería según tus preferencias."
      )
    },
    {
      question: t("What makes you different?", "¿Qué los hace diferentes?"),
      answer: t(
        "We combine reliability, professional-grade cleaning, and flexible service options. Every client gets priority support, tailored laundry programs, and fast turnaround to make your business or rental operation stress-free.",
        "Combinamos confiabilidad, limpieza de nivel profesional y opciones de servicio flexibles. Cada cliente recibe soporte prioritario, programas de lavandería personalizados y respuesta rápida para que tu negocio u operación de alquiler sea sin estrés."
      )
    },
    {
      question: t("How can I contact you?", "¿Cómo puedo contactarlos?"),
      answer: locale === "es" ? (
        <div>
          <p>Puedes contactarnos:</p>
          <ul className="list-none space-y-1 mt-2">
            <li><strong>Teléfono/Mensaje:</strong> (805) 836-8872</li>
            <li><strong>Correo:</strong> info@venturafreshlaundry.com</li>
            <li><strong>En persona:</strong> 5722 Telephone Rd #5, Ventura, CA 93003</li>
          </ul>
        </div>
      ) : (
        <div>
          <p>You can reach us:</p>
          <ul className="list-none space-y-1 mt-2">
            <li><strong>Phone/Text:</strong> (805) 836-8872</li>
            <li><strong>Email:</strong> info@venturafreshlaundry.com</li>
            <li><strong>In person:</strong> 5722 Telephone Rd #5, Ventura, CA 93003</li>
          </ul>
        </div>
      )
    },
    {
      question: t("What's your pricing model?", "¿Cómo es su modelo de precios?"),
      answer: locale === "es" ? (
        <div>
          <ul className="list-none space-y-1">
            <li><strong>Recogida y Entrega:</strong> mínimo $40 por orden (recurrente o bajo demanda)</li>
            <li><strong>Lavado y Doblado:</strong> $2.25 por libra, mínimo 10 libras (órdenes de menos de 10 lb se cobran como 10 lb)</li>
            <li>Precios personalizados disponibles para cuentas comerciales grandes o recurrentes</li>
          </ul>
        </div>
      ) : (
        <div>
          <ul className="list-none space-y-1">
            <li><strong>Pickup & Delivery:</strong> $40 minimum per order (recurring or as-needed)</li>
            <li><strong>Wash & Fold:</strong> $2.25 per pound, 10 lb minimum (orders under 10 lb are charged as 10 lb)</li>
            <li>Custom pricing available for large or recurring business accounts</li>
          </ul>
        </div>
      )
    },
    {
      question: t("What's it like to work with you?", "¿Cómo es trabajar con ustedes?"),
      answer: t(
        "Working with Ventura Fresh Laundry is hassle-free, professional, and reliable. From pickup to delivery, we ensure clean, fresh laundry every time, and provide priority support for businesses and Airbnb hosts.",
        "Trabajar con Ventura Fresh Laundry es sin complicaciones, profesional y confiable. Desde la recogida hasta la entrega, aseguramos ropa limpia y fresca cada vez, y ofrecemos soporte prioritario para empresas y anfitriones de Airbnb."
      )
    }
  ], [locale, t]);

  // URLs de imágenes / video
  const images = {
    heroVideo: videoVFL,
    background:
      "https://images.squarespace-cdn.com/content/v1/696c559a4b2b9b1b0febf8d7/8f9faf72-9068-4289-8f90-869a9b1b00d2/backgound.png",
    delivery:
      "https://images.squarespace-cdn.com/content/v1/696c559a4b2b9b1b0febf8d7/3952928a-343a-44b5-ad18-6aa57be0b4eb/ventura_fresh_laundry_part_1.png",
  };

  // Lista de características en la sección de características (Features Section)
  const features = useMemo(() => [
    { icon: "⭐", title: t("Premium garment care", "Cuidado premium de prendas"), desc: t("Consistent, high-quality cleaning", "Limpieza constante y de alta calidad") },
    { icon: "🧺", title: t("Custom folding", "Doblado personalizado"), desc: t("Done exactly your way", "Hecho exactamente a tu manera") },
    { icon: "🚚", title: t("Pickup & delivery", "Recogida y entrega"), desc: t("Effortless, on your schedule", "Sin esfuerzo, en tu horario") },
  ], [t]);

  // Pasos en How It Works
  const steps = useMemo(() => [
    {
      step: "1",
      title: t("Schedule Your Pickup in Seconds", "Programa tu recogida en segundos"),
      content: t(
        "Click the pickup button below to submit your request instantly. Once received, we'll confirm:",
        "Haz clic en el botón de recogida a continuación para enviar tu solicitud al instante. Una vez recibida, confirmaremos:"
      ),
      list: [
        t("Your preferred pickup time window", "Tu ventana de tiempo de recogida preferida"),
        t("Special instructions (detergent type, folding style, hang dry, etc.)", "Instrucciones especiales (tipo de detergente, estilo de doblado, secado al aire, etc.)"),
        t("Any important details about your order", "Cualquier detalle importante sobre tu pedido"),
      ],
      footer: t("Our team ensures everything is set and seamless before we arrive.", "Nuestro equipo se asegura de que todo esté listo y sin problemas antes de llegar."),
      button: t("SCHEDULE PICK-UP", "PROGRAMAR RECOGIDA"),
    },
    {
      step: "2",
      title: t("We Pick Up", "Recogemos"),
      content: t(
        "Leave your laundry bag(s) in the agreed location — at your door, front desk, or designated spot.",
        "Deja tu(s) bolsa(s) de ropa en el lugar acordado: en tu puerta, recepción o lugar designado."
      ),
      list: [
        t("Pick up your items on time", "Recogemos tus artículos a tiempo"),
        t("Label and track your order", "Etiquetamos y rastreamos tu pedido"),
        t("Transport your laundry safely to our facility", "Transportamos tu ropa de manera segura a nuestras instalaciones"),
      ],
      footer: t("No waiting. No hassle.", "Sin esperas. Sin complicaciones."),
      button: t("REQUEST PICK-UP", "SOLICITAR RECOGIDA"),
    },
    {
      step: "3",
      title: t("Delivered Clean", "Entregado limpio"),
      content: t(
        "Your clothes are professionally washed, dried, and folded using premium products and modern equipment.",
        "Tu ropa se lava, seca y dobla profesionalmente con productos premium y equipos modernos."
      ),
      list: [
        t("Clean and fresh", "Limpia y fresca"),
        t("Neatly folded or hung, based on your preference", "Bien doblada o colgada, según tu preferencia"),
        t("Carefully packaged and ready to wear", "Cuidadosamente empaquetada y lista para usar"),
      ],
      footer: t("Delivered right back to your door.", "Entregada de vuelta en tu puerta."),
      button: t("GET STARTED", "COMENZAR"),
    },
  ], [t]);

  // Textos de beneficios
  const benefits = useMemo(() => [
    {
      title: t("Real-Time Updates", "Actualizaciones en tiempo real"),
      text: t(
        "Stay informed every step of the way. You'll receive text notifications when your laundry is picked up, in process, and on its way back to you. You'll always know where your order is — and that it's in good hands.",
        "Mantente informado en cada paso. Recibirás notificaciones por mensaje de texto cuando tu ropa sea recogida, esté en proceso y de regreso a ti. Siempre sabrás dónde está tu pedido y que está en buenas manos."
      )
    },
    {
      title: t("Eco-Conscious by Design", "Ecológico por diseño"),
      text1: t(
        "Our professional equipment is built to use less water and energy than standard home machines. That means:",
        "Nuestros equipos profesionales están diseñados para usar menos agua y energía que las máquinas domésticas estándar. Eso significa:"
      ),
      list: [
        t("Lower water consumption per load", "Menor consumo de agua por carga"),
        t("Reduced electricity usage", "Uso reducido de electricidad"),
        t("A smaller environmental footprint", "Una huella ambiental más pequeña"),
      ],
      footer: t("Cleaner clothes, smarter resource use, better for the planet.", "Ropa más limpia, uso inteligente de recursos, mejor para el planeta.")
    },
    {
      title: t("Personalized to Your Preferences", "Personalizado a tus preferencias"),
      text1: t("Getting started is easy:", "Comenzar es fácil:"),
      list: [
        t("Schedule by phone or text", "Programa por teléfono o mensaje"),
        t("Set your preferences once", "Establece tus preferencias una vez"),
        t("Leave your laundry out", "Deja tu ropa lista"),
        t("We take care of the rest", "Nosotros nos encargamos del resto"),
      ],
      footer: t("No complicated systems. No unnecessary steps.", "Sin sistemas complicados. Sin pasos innecesarios.")
    },
    {
      title: t("Simple from Start to Finish", "Simple de principio a fin"),
      text: t(
        "Stay informed every step of the way. You'll receive text notifications when your laundry is picked up, in process, and on its way back to you. You'll always know where your order is — and that it's in good hands.",
        "Mantente informado en cada paso. Recibirás notificaciones por mensaje de texto cuando tu ropa sea recogida, esté en proceso y de regreso a ti. Siempre sabrás dónde está tu pedido y que está en buenas manos."
      )
    }
  ], [t]);

  return (
    <div className="min-h-screen bg-slate-950 overflow-x-hidden">
      {/* Hero Section with Video Background */}
      <section className="relative min-h-screen flex items-center overflow-hidden">
        {/* VIDEO Background */}
        <div className="absolute inset-0 z-0">
          <video
            className="absolute inset-0 w-full h-full object-cover"
            src={images.heroVideo}
            autoPlay
            muted
            loop
            playsInline
            preload="auto"
          />
          {/* Overlay oscuro para mejorar contraste del texto blanco */}
          <div className="absolute inset-0" style={{ background: LANDING_THEME.heroOverlay }}></div>
        </div>

        {/* NAV NORMALIZADO (usa el componente PublicNav) */}
        <PublicNav />

        {/* Hero Content con animaciones escalonadas */}
        <div className="relative z-10 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto w-full">
          <div className="max-w-xl">
            <StaggeredElement delay={100}>
              <h1
                className="text-4xl sm:text-5xl md:text-6xl font-light text-white mb-2 leading-tight italic mt-20"
                style={{ fontFamily: "'Playfair Display', serif" }}
              >
                {t("We do your laundry.", "Hacemos tu lavandería.")}
              </h1>
            </StaggeredElement>

            <StaggeredElement delay={200}>
              <h2
                className="text-4xl sm:text-5xl md:text-6xl font-light text-white mb-2 leading-tight italic"
                style={{ fontFamily: "'Playfair Display', serif" }}
              >
                {t("You enjoy your time.", "Tú disfrutas tu tiempo.")}
              </h2>
            </StaggeredElement>

            <StaggeredElement delay={300}>
              <p
                className="text-2xl sm:text-3xl text-white mb-8 italic"
                style={{ fontFamily: "'Playfair Display', serif" }}
              >
                {t("Fast pickup, perfectly folded.", "Recogida rápida, perfectamente doblado.")}
              </p>
            </StaggeredElement>

            {/* Botones */}
            <StaggeredElement delay={400}>
              <div className="flex flex-col sm:flex-row gap-3 mb-10">
                <Link to="/schedule-pickup">
                  <Button className="bg-sky-500 hover:bg-sky-600 text-white rounded-full px-6 py-3 text-sm font-semibold shadow-lg transition-all duration-300">
                    👉 {t("SCHEDULE PICK-UP", "PROGRAMAR RECOGIDA")}
                  </Button>
                </Link>
                <Link to="/services">
                  <Button
                    variant="outline"
                    className="border-2 border-white text-white hover:bg-white hover:text-slate-900 rounded-full px-6 py-3 text-sm font-semibold bg-transparent transition-all duration-300"
                  >
                    👉 {t("MORE SERVICES", "MÁS SERVICIOS")}
                  </Button>
                </Link>
                <Link to="/request-quote">
                  <Button
                    data-testid="landing-b2b-quote-button"
                    variant="outline"
                    className="border-2 border-sky-400 text-sky-400 hover:bg-sky-400 hover:text-white rounded-full px-6 py-3 text-sm font-semibold bg-transparent transition-all duration-300"
                  >
                    🏢 {t("B2B / COMMERCIAL", "B2B / COMERCIAL")}
                  </Button>
                </Link>
              </div>
            </StaggeredElement>

            {/* Service List */}
            <StaggeredElement delay={500}>
              <div className="space-y-2 text-white bg-white/10 p-6 rounded-2xl border border-white/20">
                <p className="text-lg hover:text-sky-300 transition-colors duration-300">
                  • {t("Self Service", "Autoservicio")}
                </p>
                <p className="text-lg hover:text-sky-300 transition-colors duration-300">
                  • {t("Wash & Fold", "Lavado y Doblado")}
                </p>
                <p className="text-lg hover:text-sky-300 transition-colors duration-300">
                  • {t("Pickup & Delivery", "Recogida y Entrega")}
                </p>
              </div>
            </StaggeredElement>
          </div>
        </div>

        {/* Wave Divider - Una sola ola alargada */}
        <div className="absolute bottom-0 left-0 right-0 z-10 pointer-events-none">
          <svg
            viewBox="0 0 1440 120"
            xmlns="http://www.w3.org/2000/svg"
            className="w-full h-[120px]"
            preserveAspectRatio="none"
          >
            <path
              d="M0,40 C360,0 1080,80 1440,40 L1440,120 L0,120 Z"
              fill={LANDING_THEME.waveHeroToFeatures}
              opacity="0.9"
            />
          </svg>
        </div>
      </section>

      {/* Features Section */}
      <section className="pt-20 pb-40 relative overflow-hidden">
        {/* Fondo con overlay */}
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage: `url(${images.background})`,
            transform: `translateY(${scrollY * 0.3}px) scale(1.1)`,
            filter: "brightness(0.8)",
          }}
        >
          <div className="absolute inset-0 bg-gradient-to-b from-sky-600/90 via-sky-600/80 to-sky-600/90"></div>
        </div>

        <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <StaggeredElement>
            <h2
              className="text-3xl sm:text-4xl md:text-5xl font-bold text-white text-center mb-6 leading-tight"
              style={{ fontFamily: "'Playfair Display', serif" }}
            >
              {t(
                "Ventura Fresh Laundry makes laundry effortless across Ventura County",
                "Ventura Fresh Laundry hace que la lavandería sea sin esfuerzo en todo el condado de Ventura"
              )}
            </h2>
          </StaggeredElement>

          <StaggeredElement delay={100}>
            <p className="text-xl text-white/90 text-center mb-12 max-w-3xl mx-auto bg-white/5 p-6 rounded-2xl">
              {t(
                "From convenient self-service to professional fluff & fold and fast pickup & delivery, we handle every detail so you don't have to.",
                "Desde el autoservicio conveniente hasta el lavado y doblado profesional y la recogida y entrega rápida, manejamos cada detalle para que tú no tengas que hacerlo."
              )}
            </p>
          </StaggeredElement>

          <div className="grid md:grid-cols-3 gap-8 mb-12">
            {features.map((feature, idx) => (
              <StaggeredElement key={idx} delay={200 + idx * 100}>
                <div className="text-center p-6 bg-white/10 rounded-3xl border border-white/20 hover:bg-white/15 transition-all duration-500 hover:scale-105 hover:shadow-2xl">
                  <div className="text-5xl mb-4 transition-transform duration-300">
                    {feature.icon}
                  </div>
                  <h3 className="text-xl font-bold text-white mb-3">
                    {feature.title}
                  </h3>
                  <p className="text-white/90">{feature.desc}</p>
                </div>
              </StaggeredElement>
            ))}
          </div>

          <StaggeredElement delay={500}>
            <p className="text-lg text-white/90 text-center max-w-2xl mx-auto mb-8 bg-white/5 p-6 rounded-2xl">
              {t(
                "Simply schedule a pickup and we'll return your clothes clean, fresh, and perfectly folded to your preferences.",
                "Simplemente programa una recogida y te devolveremos tu ropa limpia, fresca y perfectamente doblada según tus preferencias."
              )}
            </p>
          </StaggeredElement>

          {/* Botones con z-index superior para que estén por encima del SVG */}
          <StaggeredElement delay={600}>
            <div className="flex flex-col sm:flex-row gap-4 justify-center relative z-20">
              <Link to="/services">
                <Button className="bg-white text-sky-600 hover:bg-slate-100 rounded-full px-8 py-4 text-lg font-semibold transition-all duration-300 hover:scale-105">
                  {t("MORE SERVICES", "MÁS SERVICIOS")}
                </Button>
              </Link>
              <Link to="/schedule-pickup">
                <Button className="bg-slate-900 text-white hover:bg-slate-800 rounded-full px-8 py-4 text-lg font-semibold transition-all duration-300 hover:scale-105">
                  {t("SCHEDULE PICK-UP", "PROGRAMAR RECOGIDA")}
                </Button>
              </Link>
            </div>
          </StaggeredElement>
        </div>

        {/* SVG inferior - Una sola ola alargada */}
        <div className="absolute bottom-0 left-0 right-0 z-10 pointer-events-none">
          <svg viewBox="0 0 1440 120" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full">
            <path
              d="M0,40 Q360,100 720,40 T1440,40 L1440,120 L0,120 Z"
              fill={LANDING_THEME.waveToDarkSections}
            />
          </svg>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="py-24 bg-slate-900 relative overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center opacity-30"
          style={{
            backgroundImage: `url(${images.delivery})`,
            transform: `translateY(${scrollY * 0.2}px) scale(1.05)`,
            backgroundPosition: "center 30%",
          }}
        ></div>

        <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <StaggeredElement>
            <h2
              className="text-3xl sm:text-4xl md:text-5xl font-bold text-white text-center mb-16"
              style={{ fontFamily: "'Playfair Display', serif" }}
            >
              {t("How It Works", "Cómo Funciona")}
            </h2>
          </StaggeredElement>

          <div className="grid md:grid-cols-3 gap-8">
            {steps.map((stepData, idx) => (
              <StaggeredElement key={idx} delay={100 + idx * 100}>
                <div className="bg-white/10 rounded-2xl p-8 border border-white/20 hover:bg-white/15 transition-all duration-500 hover:scale-105 flex flex-col h-full">
                  <div className="h-16 w-16 rounded-full bg-gradient-to-br from-sky-500 to-sky-700 text-white text-2xl font-bold flex items-center justify-center mx-auto mb-6 shadow-lg">
                    {stepData.step}
                  </div>
                  <h3 className="text-2xl font-bold text-white text-center mb-4">
                    {stepData.title}
                  </h3>
                  <p className="text-white/80 mb-4">{stepData.content}</p>
                  <ul className="text-white/80 space-y-2 text-sm">
                    {stepData.list.map((item, itemIdx) => (
                      <li key={itemIdx}>• {item}</li>
                    ))}
                  </ul>
                  <p className="text-white/80 mt-4 text-sm font-semibold">
                    {stepData.footer}
                  </p>
                  <div className="mt-6">
                    <Link to="/schedule-pickup">
                      <Button className="bg-slate-900 text-white hover:bg-slate-800 rounded-full px-6 py-3 text-sm font-semibold w-full">
                        {stepData.button}
                      </Button>
                    </Link>
                  </div>
                </div>
              </StaggeredElement>
            ))}
          </div>
        </div>

        {/* SVG inferior - Una sola ola alargada */}
        <div className="absolute bottom-0 left-0 right-0 z-10 pointer-events-none">
          <svg viewBox="0 0 1440 120" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full">
            <path
              d="M0,60 Q360,0 720,60 T1440,60 L1440,120 L0,120 Z"
              fill={LANDING_THEME.waveToDarkSections}
            />
          </svg>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="py-24 bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-2 gap-16">
            <div>
              <StaggeredElement>
                <div className="mb-12 p-6 rounded-2xl bg-gradient-to-br from-slate-800/90 to-slate-900/90 border border-slate-700 hover:shadow-xl transition-all duration-500">
                  <h3 className="text-3xl font-bold text-slate-100 mb-4" style={{ fontFamily: "'Playfair Display', serif" }}>
                    {benefits[0].title}
                  </h3>
                  <p className="text-slate-300 leading-relaxed">{benefits[0].text}</p>
                </div>
              </StaggeredElement>

              <StaggeredElement delay={100}>
                <div className="p-6 rounded-2xl bg-gradient-to-br from-slate-800/90 to-slate-900/90 border border-slate-700 hover:shadow-xl transition-all duration-500">
                  <h3 className="text-3xl font-bold text-slate-100 mb-4" style={{ fontFamily: "'Playfair Display', serif" }}>
                    {benefits[1].title}
                  </h3>
                  <p className="text-slate-300 mb-4">{benefits[1].text1}</p>
                  <ul className="text-slate-300 space-y-2">
                    {benefits[1].list.map((item, i) => (
                      <li key={i}>• {item}</li>
                    ))}
                  </ul>
                  <p className="text-slate-300 mt-4 font-medium">{benefits[1].footer}</p>
                </div>
              </StaggeredElement>
            </div>

            <div>
              <StaggeredElement delay={200}>
                <div className="mb-12 p-6 rounded-2xl bg-gradient-to-br from-slate-800/90 to-slate-900/90 border border-slate-700 hover:shadow-xl transition-all duration-500">
                  <h3 className="text-3xl font-bold text-slate-100 mb-4" style={{ fontFamily: "'Playfair Display', serif" }}>
                    {benefits[2].title}
                  </h3>
                  <p className="text-slate-300 mb-4">{benefits[2].text1}</p>
                  <ul className="text-slate-300 space-y-2">
                    {benefits[2].list.map((item, i) => (
                      <li key={i}>• {item}</li>
                    ))}
                  </ul>
                  <p className="text-slate-300 mt-4 font-medium">{benefits[2].footer}</p>
                </div>
              </StaggeredElement>

              <StaggeredElement delay={300}>
                <div className="p-6 rounded-2xl bg-gradient-to-br from-slate-800/90 to-slate-900/90 border border-slate-700 hover:shadow-xl transition-all duration-500">
                  <h3 className="text-3xl font-bold text-slate-100 mb-4" style={{ fontFamily: "'Playfair Display', serif" }}>
                    {benefits[3].title}
                  </h3>
                  <p className="text-slate-300 leading-relaxed">{benefits[3].text}</p>
                </div>
              </StaggeredElement>
            </div>
          </div>
        </div>
      </section>

      {/* Testimonial Section */}
      <section className="py-24 relative overflow-hidden" style={{ background: "linear-gradient(135deg, #0ea5e9 0%, #0284c7 50%, #0369a1 100%)" }}>
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-10">
          <StaggeredElement>
            <h2 className="text-4xl sm:text-5xl font-bold text-white mb-6" style={{ fontFamily: "'Playfair Display', serif" }}>
              {t("Take Back Your Time!!", "¡Recupera tu tiempo!!")}
            </h2>
          </StaggeredElement>

          <StaggeredElement delay={100}>
            <p className="text-xl text-white/90 mb-8">
              {t("Laundry shouldn't take over your schedule.", "La lavandería no debería apoderarse de tu agenda.")}
            </p>
          </StaggeredElement>

          <StaggeredElement delay={200}>
            <p className="text-lg text-white/80 mb-12 max-w-2xl mx-auto bg-white/10 p-6 rounded-2xl">
              {t(
                "We know how many hours disappear sorting, washing, drying, and folding. That's time you could spend relaxing, being with family, exploring the city, or simply recharging. Let us handle the laundry so you can focus on what truly matters.",
                "Sabemos cuántas horas desaparecen clasificando, lavando, secando y doblando. Ese es tiempo que podrías pasar relajándote, con tu familia, explorando la ciudad o simplemente recargando energías. Déjanos encargarnos de la lavandería para que puedas concentrarte en lo que realmente importa."
              )}
            </p>
          </StaggeredElement>

          <StaggeredElement delay={300}>
            <blockquote className="bg-white/20 rounded-2xl p-8 md:p-12 border border-white/30 hover:bg-white/25 transition-all duration-500">
              <p className="text-xl md:text-2xl text-white italic mb-6 leading-relaxed">
                {t(
                  '"Ventura Fresh Laundry completely changed the way I handle laundry. The pickup and delivery is always on time, and my clothes come back perfectly clean and folded. I honestly can\'t imagine going back to doing it myself."',
                  '"Ventura Fresh Laundry cambió por completo la forma en que manejo la lavandería. La recogida y entrega siempre llega a tiempo, y mi ropa vuelve perfectamente limpia y doblada. Honestamente, no puedo imaginar volver a hacerlo yo mismo."'
                )}
              </p>
              <footer className="text-white/90 font-semibold text-lg">— Katy F.</footer>
            </blockquote>
          </StaggeredElement>

          <StaggeredElement delay={400}>
            <p className="text-xl text-white font-bold mt-12 bg-white/10 p-6 rounded-2xl inline-block">
              {t(
                "Ventura County Most Affordable Laundry Service is Ready to Take Laundry Off Your To-Do List.",
                "El servicio de lavandería más asequible del condado de Ventura está listo para quitar la lavandería de tu lista de tareas."
              )}
            </p>
          </StaggeredElement>
        </div>

        {/* SVG inferior - Una sola ola alargada */}
        <div className="absolute bottom-0 left-0 right-0 z-10 pointer-events-none">
          <svg viewBox="0 0 1440 60" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full">
            <path
              d="M0,30 Q80,60 160,30 T1440,30 L1440,60 L0,60 Z"
              fill={LANDING_THEME.waveToDarkSections}
            />
          </svg>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-24 bg-slate-950">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <StaggeredElement>
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-100 text-center mb-12" style={{ fontFamily: "'Playfair Display', serif" }}>
              {t("Frequently Asked Questions", "Preguntas Frecuentes")}
            </h2>
          </StaggeredElement>

          <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl shadow-xl border border-slate-700 p-6 md:p-8">
            {faqs.map((faq, index) => (
              <StaggeredElement key={index} delay={index * 50}>
                <FAQItem
                  question={faq.question}
                  answer={faq.answer}
                  isOpen={openFAQ === index}
                  onClick={() => setOpenFAQ(openFAQ === index ? null : index)}
                />
              </StaggeredElement>
            ))}
          </div>
        </div>
      </section>

      {/* Contact Info Section */}
      <section className="py-16 bg-gradient-to-b from-slate-900 to-slate-950">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-3 gap-8 text-center">
            {[
              { icon: <MapPin className="h-7 w-7 text-sky-600" />, text: t("📍 5722 Telephone Rd #5, Ventura, CA 93003", "📍 5722 Telephone Rd #5, Ventura, CA 93003") },
              { icon: <Clock className="h-7 w-7 text-sky-600" />, text: t("🕒 Mon–Sun 6:00 AM – 10:00 PM", "🕒 Lun–Dom 6:00 AM – 10:00 PM") },
              { icon: <Phone className="h-7 w-7 text-sky-600" />, text: t("📞 (805) 836-8872", "📞 (805) 836-8872") },
            ].map((contact, idx) => (
              <StaggeredElement key={idx} delay={idx * 100}>
                <div className="flex flex-col items-center hover:scale-105 transition-all duration-500">
                  <div className="h-14 w-14 rounded-full bg-gradient-to-br from-slate-800 to-slate-700 flex items-center justify-center mb-4 shadow-lg border border-slate-600">
                    {contact.icon}
                  </div>
                  <p className="text-slate-200 font-medium">{contact.text}</p>
                </div>
              </StaggeredElement>
            ))}
          </div>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}