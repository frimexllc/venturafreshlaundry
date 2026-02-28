import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Button } from "../components/ui/button";
import { ChevronDown, ChevronUp, Check, Star, Clock, Shield, Truck } from "lucide-react";
import PublicNav from "../components/PublicNav";
import PublicFooter from "../components/PublicFooter";
import { useLocale } from "../context/LocaleContext";

// ============== COMPONENTES ==============

// Accordion Component Mejorado
const AccordionItem = ({ title, children, isOpen, onClick, variant = "light" }) => {
  const { t } = useLocale();
  const textColor = variant === "dark" ? "text-white" : "text-slate-900";
  const borderColor = variant === "dark" ? "border-white/20" : "border-slate-200";
  
  return (
    <div className={`border-b ${borderColor} last:border-0`}>
      <button
        onClick={onClick}
        className="w-full py-4 flex items-center justify-between text-left group"
        aria-expanded={isOpen}
        aria-controls={`accordion-${title.replace(/\s+/g, '-').toLowerCase()}`}
      >
        <span className={`text-lg font-bold ${textColor} group-hover:text-sky-500 transition-colors`}>
          {title}
        </span>
        {isOpen ? (
          <ChevronUp className="h-5 w-5 text-sky-500" />
        ) : (
          <ChevronDown className="h-5 w-5 text-slate-400 group-hover:text-sky-500 transition-colors" />
        )}
      </button>
      <div 
        id={`accordion-${title.replace(/\s+/g, '-').toLowerCase()}`}
        className={`overflow-hidden transition-all duration-300 ${
          isOpen ? 'max-h-[500px] pb-4 opacity-100' : 'max-h-0 opacity-0'
        }`}
        role="region"
        aria-labelledby={title}
      >
        {children}
      </div>
    </div>
  );
};

// Hero Section Component
const HeroSection = ({ title, subtitle, image, overlay = "bg-black/40", height = "min-h-[60vh]" }) => (
  <section className={`relative ${height} flex items-end justify-center overflow-hidden`}>
    <div 
      className="absolute inset-0 bg-cover bg-center bg-fixed"
      style={{ backgroundImage: `url('${image}')` }}
    >
      <div className={`absolute inset-0 ${overlay}`}></div>
    </div>
    <div className="relative z-10 text-center px-4 pb-16 max-w-4xl mx-auto animate-fadeIn">
      <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold text-white leading-tight" 
          style={{ fontFamily: "'Playfair Display', serif" }}>
        {title}
      </h1>
      {subtitle && <p className="text-xl text-white/90 mt-4 animate-slideUp">{subtitle}</p>}
    </div>
  </section>
);

// Service Card Component
const ServiceCard = ({ title, emoji, description, features = [], buttonText, buttonLink, price, category }) => {
  const { t } = useLocale();
  return (
    <div className="bg-white rounded-2xl p-8 shadow-lg border border-slate-100 hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
      {emoji && (
        <div className="flex justify-center mb-4">
          <span className="text-4xl">{emoji}</span>
        </div>
      )}
      <h3 className="text-2xl font-bold text-slate-900 text-center mb-4">
        {title}
      </h3>
      {category && (
        <p className="text-xs uppercase tracking-wider text-sky-600 text-center mb-2">{category}</p>
      )}
      <p className="text-slate-600 text-center mb-2">{description}</p>
      {price && <p className="text-3xl font-bold text-sky-600 text-center mb-4">{price}</p>}
      {features.length > 0 && (
        <div className="space-y-3 mb-6">
          {features.map((feature, i) => (
            <p key={i} className="flex items-start gap-2 text-slate-700">
              <Check className="h-5 w-5 text-sky-500 flex-shrink-0 mt-0.5" />
              <span dangerouslySetInnerHTML={{ __html: feature }} />
            </p>
          ))}
        </div>
      )}
      {buttonText && buttonLink && (
        <div className="text-center">
          <Link to={buttonLink}>
            <Button className="bg-sky-500 hover:bg-sky-600 text-white rounded-full px-8 transform transition-all duration-300 hover:scale-105">
              {buttonText}
            </Button>
          </Link>
        </div>
      )}
    </div>
  );
};

// Membership Card Component (CORREGIDO: ahora usa useLocale)
const MembershipCard = ({ plan, price, image, features, isPopular }) => {
  const { t } = useLocale();
  return (
    <div className={`bg-white rounded-2xl shadow-lg overflow-hidden hover:shadow-xl transition-all duration-300 hover:-translate-y-2 ${
      isPopular ? 'border-2 border-sky-500 relative transform scale-105 md:scale-110 z-10' : 'border border-slate-200'
    }`}>
      {isPopular && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-sky-500 to-sky-600 text-white px-4 py-1 rounded-full text-sm font-bold z-20 shadow-lg">
          <Star className="h-3 w-3 inline mr-1" />
          {t("MOST POPULAR", "MÁS POPULAR")}
        </div>
      )}
      <div className="h-48 overflow-hidden bg-gradient-to-br from-sky-50 to-white flex items-center justify-center p-4">
        <img 
          src={image} 
          alt={`${plan} Membership - Ventura Fresh Laundry`}
          className="max-w-full max-h-full object-contain transition-transform duration-500 hover:scale-110"
          loading="lazy"
        />
      </div>
      <div className="p-6">
        <h2 className="text-2xl font-bold text-slate-900 mb-2">{plan}</h2>
        <h2 className="text-3xl font-bold text-sky-600 mb-4">{price}</h2>
        <ul className="space-y-3">
          {features.map((feature, i) => (
            <li key={i} className="flex items-start gap-2 text-slate-700">
              <Check className="h-5 w-5 text-sky-500 flex-shrink-0 mt-0.5" />
              <span className="text-sm">{feature}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

// Pricing Table Component (CORREGIDO: ahora usa useLocale)
const PricingTable = ({ title, data, note }) => {
  const { t } = useLocale();
  return (
    <div className="bg-white rounded-2xl p-8 shadow-lg hover:shadow-xl transition-all duration-300">
      <h3 className="text-2xl font-bold text-slate-900 text-center mb-6">{title}</h3>
      <table className="w-full mb-6">
        <thead>
          <tr className="border-b border-slate-200">
            <th className="py-2 text-left font-semibold text-slate-700">{t("Option", "Opción")}</th>
            <th className="py-2 text-center font-semibold text-slate-700">{t("Rate", "Tarifa")}</th>
            <th className="py-2 text-right font-semibold text-slate-700">{t("Minimum", "Mínimo")}</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr key={i} className="border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors">
              <td className="py-3 text-slate-600">{row.option}</td>
              <td className="py-3 text-center text-slate-600">{row.rate}</td>
              <td className="py-3 text-right text-slate-600">{row.minimum}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {note && <p className="text-slate-500 text-sm text-center italic">{note}</p>}
    </div>
  );
};

// Service Section Background Component
const ServiceSection = ({ children, backgroundImage, overlay = "bg-sky-900/85" }) => (
  <section className="py-20 relative overflow-hidden">
    <div 
      className="absolute inset-0 bg-cover bg-center bg-fixed"
      style={{ backgroundImage: `url('${backgroundImage}')` }}
    >
      <div className={`absolute inset-0 ${overlay}`}></div>
    </div>
    <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
      {children}
    </div>
  </section>
);

// ============== PÁGINA PRINCIPAL ==============
export default function ServicesPage() {
  const { t, locale } = useLocale();
  const [openAccordions, setOpenAccordions] = useState({
    b2b: 0,
    commercial: 0,
    airbnb: 0
  });
  const [membershipSection, setMembershipSection] = useState(null);
  const [membershipPlans, setMembershipPlans] = useState([]);
  const [servicesData, setServicesData] = useState([]);

  // Valores por defecto traducidos
  const MEMBERSHIP_SECTION_DEFAULT = {
    heading: t("Flexible Plans for Every Home", "Planes flexibles para cada hogar"),
    subheading: null,
    special_title: t("🎉 New Member Special", "🎉 Oferta para nuevos miembros"),
    special_text: t("$10 OFF your first month on any membership. Ask when you call or text.", "$10 de descuento en tu primer mes en cualquier membresía. Pregunta cuando llames o envíes un mensaje."),
    cta_title: t("Need help choosing?", "¿Necesitas ayuda para elegir?"),
    cta_text: t("Just call, text, or email us at", "Solo llama, envía un mensaje o escríbenos a"),
    cta_button_label: t("👉 BECOME A MEMBER", "👉 CONVIÉRTETE EN MIEMBRO"),
    cta_button_url: "/membership",
    contact_phone: "(805) 836-8872",
    is_active: true
  };

  // Planes estáticos por defecto (traducidos)
  const DEFAULT_MEMBERSHIP_PLANS = [
    {
      plan: t("FAMILY PLUS", "FAMILY PLUS"),
      price: "$199 / month",
      image: "https://images.squarespace-cdn.com/content/v1/696c559a4b2b9b1b0febf8d7/f262a5b8-0043-4977-9d32-d6b343be3e70/FAMILY+PLUS.png",
      features: [
        t("Up to 90 lb/ month", "Hasta 90 lb/ mes"),
        t("Priority scheduling", "Programación prioritaria"),
        t("Great for larger households or rentals", "Ideal para hogares grandes o alquileres")
      ],
      isPopular: false
    },
    {
      plan: t("MOST POPULAR", "MÁS POPULAR"),
      price: "$139 / month",
      image: "https://images.squarespace-cdn.com/content/v1/696c559a4b2b9b1b0febf8d7/4a2815a1-54c1-45fb-8320-244dce8b83c8/MOST+POPULAR.png",
      features: [
        t("Up to 60 lb/ month", "Hasta 60 lb/ mes"),
        t("Basic Preferences saved (folding notes)", "Preferencias básicas guardadas (notas de doblado)"),
        t("Best value for most families", "Mejor valor para la mayoría de las familias")
      ],
      isPopular: true
    },
    {
      plan: t("ELITE CONCIERGE", "ELITE CONCIERGE"),
      price: "$299 / month",
      image: "https://images.squarespace-cdn.com/content/v1/696c559a4b2b9b1b0febf8d7/13a4c501-7792-4f72-bf5c-072f95b5f995/ELITE+CONCIERGE.png",
      features: [
        t("Up to 120 lb/ month", "Hasta 120 lb/ mes"),
        t("Priority turnaround (when possible)", "Respuesta prioritaria (cuando sea posible)"),
        t("Premium packaging", "Empaque premium"),
        t("Saved preferences", "Preferencias guardadas"),
        t("1 emergency pickup included", "1 recogida de emergencia incluida")
      ],
      isPopular: false
    }
  ];

  // Precios por pieza estáticos (traducidos)
  const PER_PIECE_CATEGORIES = [
    {
      category: t("Home Essentials", "Artículos del hogar"),
      items: [
        { name: t("Bath Mat", "Tapete de baño"), price: "$5.00" },
        { name: t("Cooking Glove", "Guante de cocina"), price: "$5.00" },
        { name: t("Pet Bed (Small)", "Cama para mascotas (pequeña)"), price: "$5.00" },
        { name: t("Pet Bed (M/L)", "Cama para mascotas (mediana/grande)"), price: "$8.00" }
      ]
    },
    {
      category: t("Bedding", "Ropa de cama"),
      items: [
        { name: t("Standard Pillow", "Almohada estándar"), price: "$8.00" },
        { name: t("Large Pillow", "Almohada grande"), price: "$10.00" },
        { name: t("Duvet Cover", "Funda de edredón"), price: "$8.00" },
        { name: t("Blanket", "Manta"), price: "$10.00" }
      ]
    },
    {
      category: t("Comforters", "Edredones"),
      items: [
        { name: t("Comforter (T/D/Q)", "Edredón (Twin/Double/Queen)"), price: "$18.00" },
        { name: t("Comforter (King)", "Edredón (King)"), price: "$20.00" },
        { name: t("Mattress Cover", "Cubrecama"), price: "$20.00" },
        { name: t("Down Comforters", "Edredones de plumas"), price: "$40.00" }
      ]
    }
  ];

  // Precios de lavadoras estáticos
  const WASHER_PRICES = [
    { size: t("20 lb (2 Load)", "20 lb (2 cargas)"), price: "$4.00" },
    { size: t("30 lb (3 Load)", "30 lb (3 cargas)"), price: "$5.25" },
    { size: t("40 lb (4 Load)", "40 lb (4 cargas)"), price: "$6.00" },
    { size: t("60 lb (6 Load)", "60 lb (6 cargas)"), price: "$7.75" },
    { size: t("90 lb (9 Load)", "90 lb (9 cargas)"), price: "$11.25" }
  ];

  // Precios de secadoras estáticos
  const DRYER_PRICES = [
    { size: t("30 lb", "30 lb"), price: "$2.25" },
    { size: t("50 lb", "50 lb"), price: "$2.50" },
    { size: t("80 lb", "80 lb"), price: "$3.00" }
  ];

  // Servicios por defecto (traducidos)
  const DEFAULT_SERVICES = [
    {
      title: t("Pickup & Delivery", "Recogida y Entrega"),
      emoji: "🚚",
      description: t("Laundry, fully automated on your schedule.", "Lavandería, completamente automatizada en tu horario."),
      features: [
        t("<strong>Member recurring service:</strong> $2.50/lb (minimum $40)", "<strong>Servicio recurrente para miembros:</strong> $2.50/lb (mínimo $40)"),
        t("<strong>As-needed service:</strong> $2.75/lb (minimum $40)", "<strong>Servicio bajo demanda:</strong> $2.75/lb (mínimo $40)"),
        t("<strong>Pickup window & preferences confirmed every time</strong>", "<strong>Ventana de recogida y preferencias confirmadas cada vez</strong>")
      ],
      buttonText: t("SCHEDULE PICK-UP", "PROGRAMAR RECOGIDA"),
      buttonLink: "/schedule-pickup"
    },
    {
      title: t("Wash • Dry • Fold", "Lavar • Secar • Doblar"),
      emoji: "🧺",
      description: t("Professional care without lifting a finger.", "Cuidado profesional sin mover un dedo."),
      features: [
        t("<strong>$2.25 per pound</strong>", "<strong>$2.25 por libra</strong>"),
        t("<strong>10 lb minimum order</strong> (orders under 10 lb are billed as 10 lb)", "<strong>Pedido mínimo de 10 lb</strong> (los pedidos de menos de 10 lb se facturan como 10 lb)"),
        t("<strong>Custom folding preferences available</strong>", "<strong>Preferencias de doblado personalizadas disponibles</strong>")
      ]
    }
  ];

  const priceUnitLabels = {
    per_lb: t("per pound", "por libra"),
    per_order: t("per order", "por orden"),
    per_month: t("per month", "por mes"),
    per_item: t("per item", "por pieza")
  };

  const toggleAccordion = (section, index) => {
    setOpenAccordions(prev => ({
      ...prev,
      [section]: prev[section] === index ? -1 : index
    }));
  };

  useEffect(() => {
    const loadMembership = async () => {
      try {
        const [sectionRes, plansRes] = await Promise.all([
          fetch(`${process.env.REACT_APP_BACKEND_URL}/api/public/membership-section`),
          fetch(`${process.env.REACT_APP_BACKEND_URL}/api/public/membership-plans`)
        ]);
        if (sectionRes.ok) {
          const data = await sectionRes.json();
          setMembershipSection({
            ...data,
            heading: t(data.heading, data.heading),
            special_title: data.special_title ? t(data.special_title, data.special_title) : null,
            special_text: data.special_text ? t(data.special_text, data.special_text) : null,
            cta_title: data.cta_title ? t(data.cta_title, data.cta_title) : null,
            cta_text: data.cta_text ? t(data.cta_text, data.cta_text) : null,
            cta_button_label: data.cta_button_label ? t(data.cta_button_label, data.cta_button_label) : null
          });
        } else {
          setMembershipSection(MEMBERSHIP_SECTION_DEFAULT);
        }
        if (plansRes.ok) {
          const data = await plansRes.json();
          const mapped = data.map((plan) => ({
            plan: t(plan.name, plan.name),
            price: plan.price,
            image: plan.image_url,
            features: (plan.features || []).map(f => t(f, f)),
            isPopular: plan.is_popular
          }));
          setMembershipPlans(mapped);
        } else {
          setMembershipPlans(DEFAULT_MEMBERSHIP_PLANS);
        }
      } catch (error) {
        setMembershipSection(MEMBERSHIP_SECTION_DEFAULT);
        setMembershipPlans(DEFAULT_MEMBERSHIP_PLANS);
      }
    };
    loadMembership();
  }, [locale, t]); // re-run when locale changes

  useEffect(() => {
    const loadServices = async () => {
      try {
        const res = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/public/services`);
        if (res.ok) {
          const data = await res.json();
          setServicesData(data);
        }
      } catch (error) {
        setServicesData([]);
      }
    };
    loadServices();
  }, []);

  const servicesToRender = servicesData.length > 0 ? servicesData.map((service) => ({
    title: t(service.name, service.name),
    description: service.description ? t(service.description, service.description) : "",
    price: service.price != null ? `$${Number(service.price).toFixed(2)}${service.price_unit ? ` / ${priceUnitLabels[service.price_unit] || service.price_unit}` : ""}` : null,
    category: service.category ? t(service.category, service.category) : null,
    features: []
  })) : DEFAULT_SERVICES;

  return (
    <div className="min-h-screen bg-white">
      <PublicNav />

      {/* Hero Section */}
      <HeroSection 
        title={t("A clean space for everyone and every load.", "Un espacio limpio para todos y cada carga.")}
        image="https://images.unsplash.com/photo-1545173168-9f1947eebb7f?w=1920&h=1080&fit=crop"
        overlay="bg-black/40"
      />

      {/* Services Section */}
      <section className="relative py-20 overflow-hidden">
        <div 
          className="absolute inset-0 bg-cover bg-center bg-fixed"
          style={{ backgroundImage: "url('https://images.unsplash.com/photo-1582735689369-4fe89db7114c?w=1920&h=1080&fit=crop')" }}
        >
          <div className="absolute inset-0 bg-white/80 backdrop-blur-sm"></div>
        </div>

        <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <span className="text-sky-600 font-semibold tracking-wider uppercase text-sm">{t("Our Services", "Nuestros Servicios")}</span>
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mt-2 mb-4">
              {t("Choose the option that fits your day", "Elige la opción que se adapte a tu día")}
            </h2>
            <p className="text-slate-600 max-w-2xl mx-auto">
              {t("Walk-in, drop-off, or pickup & delivery — we've got you covered", "Presencial, entrega, o recogida y entrega — estamos aquí para ayudarte")}
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            {servicesToRender.map((service, index) => (
              <ServiceCard key={index} {...service} />
            ))}
          </div>

          {/* Self Service Laundry */}
          <div className="mt-8 bg-white/90 backdrop-blur-sm rounded-2xl p-8 shadow-lg border border-slate-100 hover:shadow-xl transition-all duration-300">
            <div className="flex flex-col md:flex-row items-center justify-between">
              <div className="text-center md:text-left mb-4 md:mb-0">
                <h3 className="text-2xl font-bold text-slate-900 mb-2 flex items-center justify-center md:justify-start">
                  <span className="text-3xl mr-2">🏪</span> {t("Self-Service Laundry", "Lavandería de autoservicio")}
                </h3>
                <p className="text-slate-600">
                  {t("Modern machines, fast dryers, and a hassle-free experience", "Máquinas modernas, secadoras rápidas y una experiencia sin complicaciones")}
                </p>
              </div>
              <div className="flex gap-6">
                <div className="text-center">
                  <div className="text-2xl font-bold text-sky-600">6:00 AM</div>
                  <div className="text-sm text-slate-500">{t("Open", "Abrimos")}</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-sky-600">10:00 PM</div>
                  <div className="text-sm text-slate-500">{t("Close", "Cerramos")}</div>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6 pt-6 border-t border-slate-100">
              <div className="flex items-center gap-2 text-slate-700">
                <Check className="h-5 w-5 text-sky-500" />
                <span>{t("Clean & well-maintained", "Limpio y bien mantenido")}</span>
              </div>
              <div className="flex items-center gap-2 text-slate-700">
                <Check className="h-5 w-5 text-sky-500" />
                <span>{t("High-performance washers", "Lavadoras de alto rendimiento")}</span>
              </div>
              <div className="flex items-center gap-2 text-slate-700">
                <Check className="h-5 w-5 text-sky-500" />
                <span>{t("Fast-drying machines", "Máquinas de secado rápido")}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Membership Section - CORREGIDO: Cards centradas */}
      <section className="py-20 bg-gradient-to-b from-white to-slate-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Membership Header */}
          <div className="text-center mb-12">
            <span className="text-sky-600 font-semibold tracking-wider uppercase text-sm">{t("Membership", "Membresía")}</span>
            <h1 className="text-4xl md:text-5xl font-bold text-slate-900 mb-4" 
                style={{ fontFamily: "'Playfair Display', serif" }}>
              {(membershipSection || MEMBERSHIP_SECTION_DEFAULT).heading}
            </h1>
            {(membershipSection || MEMBERSHIP_SECTION_DEFAULT).subheading && (
              <p className="text-slate-600 text-lg mb-6">{(membershipSection || MEMBERSHIP_SECTION_DEFAULT).subheading}</p>
            )}
            {((membershipSection || MEMBERSHIP_SECTION_DEFAULT).special_title || (membershipSection || MEMBERSHIP_SECTION_DEFAULT).special_text) && (
              <div className="bg-gradient-to-r from-amber-50 to-yellow-50 rounded-2xl p-6 max-w-2xl mx-auto border border-amber-200">
                {(membershipSection || MEMBERSHIP_SECTION_DEFAULT).special_title && (
                  <h2 className="text-2xl md:text-3xl text-amber-800 mb-2">{(membershipSection || MEMBERSHIP_SECTION_DEFAULT).special_title}</h2>
                )}
                {(membershipSection || MEMBERSHIP_SECTION_DEFAULT).special_text && (
                  <p className="text-lg text-amber-700">{(membershipSection || MEMBERSHIP_SECTION_DEFAULT).special_text}</p>
                )}
              </div>
            )}
          </div>

          {/* Membership Cards Grid - CORREGIDO: 3 columnas centradas */}
          <div className="grid md:grid-cols-3 gap-6 mb-12 items-stretch max-w-4xl mx-auto">
            {(membershipPlans.length > 0 ? membershipPlans : DEFAULT_MEMBERSHIP_PLANS).map((plan, index) => (
              <MembershipCard key={index} {...plan} />
            ))}
          </div>

          {/* Membership Support */}
          <div className="text-center bg-white rounded-2xl p-8 shadow-lg max-w-3xl mx-auto">
            <div className="flex justify-center mb-4">
              <div className="bg-sky-100 p-3 rounded-full">
                <Shield className="h-6 w-6 text-sky-600" />
              </div>
            </div>
            {(membershipSection || MEMBERSHIP_SECTION_DEFAULT).cta_title && (
              <h4 className="text-lg font-semibold text-slate-900 mb-2">{(membershipSection || MEMBERSHIP_SECTION_DEFAULT).cta_title}</h4>
            )}
            {(membershipSection || MEMBERSHIP_SECTION_DEFAULT).cta_text && (
              <p className="text-slate-600">
                {(membershipSection || MEMBERSHIP_SECTION_DEFAULT).cta_text}
                {(membershipSection || MEMBERSHIP_SECTION_DEFAULT).contact_phone && (
                  <>
                    {" "}
                    <a href={`tel:${(membershipSection || MEMBERSHIP_SECTION_DEFAULT).contact_phone.replace(/[^\d]/g, "")}`} className="text-sky-600 font-bold hover:underline">
                      {(membershipSection || MEMBERSHIP_SECTION_DEFAULT).contact_phone}
                    </a>
                  </>
                )}
              </p>
            )}
            <div className="mt-6">
              {(membershipSection || MEMBERSHIP_SECTION_DEFAULT).cta_button_label && (
                (() => {
                  const ctaUrl = (membershipSection || MEMBERSHIP_SECTION_DEFAULT).cta_button_url || "/membership";
                  const isExternal = /^https?:\/\//i.test(ctaUrl);
                  if (isExternal) {
                    return (
                      <a href={ctaUrl} target="_blank" rel="noopener noreferrer">
                        <Button className="bg-gradient-to-r from-sky-500 to-sky-600 hover:from-sky-600 hover:to-sky-700 text-white rounded-full px-10 py-6 text-lg font-semibold transform transition-all duration-300 hover:scale-105 shadow-lg hover:shadow-xl">
                          {(membershipSection || MEMBERSHIP_SECTION_DEFAULT).cta_button_label}
                        </Button>
                      </a>
                    );
                  }
                  return (
                    <Link to={ctaUrl}>
                      <Button className="bg-gradient-to-r from-sky-500 to-sky-600 hover:from-sky-600 hover:to-sky-700 text-white rounded-full px-10 py-6 text-lg font-semibold transform transition-all duration-300 hover:scale-105 shadow-lg hover:shadow-xl">
                        {(membershipSection || MEMBERSHIP_SECTION_DEFAULT).cta_button_label}
                      </Button>
                    </Link>
                  );
                })()
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Airbnb Services Section */}
      <ServiceSection 
        backgroundImage="https://images.unsplash.com/photo-1556910103-1c02745a2384?w=1920&h=1080&fit=crop"
        overlay="bg-gradient-to-r from-sky-900/90 to-sky-800/90"
      >
        <div className="text-center mb-8">
          <span className="text-white/80 font-semibold tracking-wider uppercase text-sm border-b border-white/20 pb-2">{t("Airbnb & Rentals", "Airbnb y Alquileres")}</span>
        </div>
        <h2 className="text-3xl md:text-4xl font-bold text-white mb-4 text-center" style={{ fontFamily: "'Playfair Display', serif" }}>
          {t("Premium Laundry Services for Airbnb & Short-Term Rental Hosts", "Servicios de lavandería premium para anfitriones de Airbnb y alquileres a corto plazo")}
        </h2>
        <p className="text-white/90 text-center mb-2 text-lg">
          <span className="bg-white/20 px-3 py-1 rounded-full">{t("Spotless linens. Five-star guest experiences. Zero hassle.", "Ropa de cama impecable. Experiencias de huéspedes de cinco estrellas. Cero complicaciones.")}</span>
        </p>
        <p className="text-white/90 text-center mb-8 max-w-2xl mx-auto">
          {t("Professional care that helps you maintain consistent quality and boost reviews.", "Cuidado profesional que te ayuda a mantener una calidad constante y aumentar las reseñas.")}
        </p>

        <div className="bg-white/10 backdrop-blur-md rounded-xl border border-white/20 p-6">
          <AccordionItem 
            title={t("Airbnb Services", "Servicios para Airbnb")}
            isOpen={openAccordions.airbnb === 0}
            onClick={() => toggleAccordion('airbnb', 0)}
            variant="dark"
          >
            <p className="text-white/90 leading-relaxed">
              {t(
                "Our Airbnb and short-term rental laundry service is built for hosts who want flawless turnovers and happier guests. We professionally clean, sanitize, and return your linens and towels on schedule, helping you maintain consistent quality, boost reviews, and save valuable time.",
                "Nuestro servicio de lavandería para Airbnb y alquileres a corto plazo está diseñado para anfitriones que desean entregas impecables y huéspedes más felices. Limpiamos, sanitizamos y devolvemos tu ropa de cama y toallas según el horario, ayudándote a mantener una calidad constante, aumentar las reseñas y ahorrar tiempo valioso."
              )}
            </p>
          </AccordionItem>
          <AccordionItem 
            title={t("Key Features & Services", "Características y servicios clave")}
            isOpen={openAccordions.airbnb === 1}
            onClick={() => toggleAccordion('airbnb', 1)}
            variant="dark"
          >
            <ul className="text-white/90 space-y-2">
              <li className="flex items-start gap-2">
                <Check className="h-5 w-5 text-sky-400 flex-shrink-0 mt-0.5" />
                <span>{t("Customized laundry programs for Airbnb and short-term rental hosts", "Programas de lavandería personalizados para anfitriones de Airbnb y alquileres a corto plazo")}</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="h-5 w-5 text-sky-400 flex-shrink-0 mt-0.5" />
                <span>{t("Professional cleaning and sanitization of all linens and towels", "Limpieza y sanitización profesional de toda la ropa de cama y toallas")}</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="h-5 w-5 text-sky-400 flex-shrink-0 mt-0.5" />
                <span>{t("Scheduled pickup & delivery aligned with your turnover schedule", "Recogida y entrega programadas alineadas con tu horario de entregas")}</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="h-5 w-5 text-sky-400 flex-shrink-0 mt-0.5" />
                <span>{t("Consistent quality that helps you earn five-star reviews", "Calidad constante que te ayuda a obtener reseñas de cinco estrellas")}</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="h-5 w-5 text-sky-400 flex-shrink-0 mt-0.5" />
                <span>{t("Save valuable time and eliminate laundry day stress", "Ahorra tiempo valioso y elimina el estrés del día de lavandería")}</span>
              </li>
            </ul>
          </AccordionItem>
        </div>

        <div className="text-center mt-8">
          <Link to="/schedule-pickup">
            <Button className="bg-white text-sky-600 hover:bg-slate-100 rounded-full px-10 py-6 text-lg font-semibold transform transition-all duration-300 hover:scale-105 shadow-lg">
              🗓️ {t("SCHEDULE PICK-UP", "PROGRAMAR RECOGIDA")}
            </Button>
          </Link>
        </div>
      </ServiceSection>

      {/* B2B Services Section */}
      <ServiceSection 
        backgroundImage="https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=1920&h=1080&fit=crop"
        overlay="bg-gradient-to-r from-sky-900/90 to-indigo-900/90"
      >
        <div className="text-center mb-8">
          <span className="text-white/80 font-semibold tracking-wider uppercase text-sm border-b border-white/20 pb-2">{t("B2B Solutions", "Soluciones B2B")}</span>
        </div>
        <h2 className="text-3xl md:text-4xl font-bold text-white mb-4 text-center" style={{ fontFamily: "'Playfair Display', serif" }}>
          {t("High-Performance B2B Laundry Solutions", "Soluciones de lavandería B2B de alto rendimiento")}
        </h2>
        <p className="text-white/90 text-center mb-2 text-lg">
          <strong>{t("Reliable, scalable, and professional laundry services", "Servicios de lavandería confiables, escalables y profesionales")}</strong>
        </p>
        <p className="text-white/90 text-center mb-8 max-w-2xl mx-auto">
          {t("Built to handle volume, quality, and reliability every single day.", "Construido para manejar volumen, calidad y confiabilidad todos los días.")}
        </p>

        <div className="bg-white/10 backdrop-blur-md rounded-xl border border-white/20 p-6">
          <AccordionItem 
            title={t("B2B Services", "Servicios B2B")}
            isOpen={openAccordions.b2b === 0}
            onClick={() => toggleAccordion('b2b', 0)}
            variant="dark"
          >
            <p className="text-white/90 leading-relaxed">
              {t(
                "We provide tailored B2B laundry solutions that help businesses maintain the highest standards of cleanliness while reducing operational costs. From hospitality and healthcare to fitness centers and corporate facilities, our commercial-grade processes ensure consistent quality, fast turnaround, and dependable service you can trust.",
                "Ofrecemos soluciones de lavandería B2B personalizadas que ayudan a las empresas a mantener los más altos estándares de limpieza mientras reducen los costos operativos. Desde hotelería y salud hasta centros de fitness e instalaciones corporativas, nuestros procesos de grado comercial garantizan calidad constante, respuesta rápida y un servicio confiable en el que puedes confiar."
              )}
            </p>
          </AccordionItem>
          <AccordionItem 
            title={t("Key Features & Services", "Características y servicios clave")}
            isOpen={openAccordions.b2b === 1}
            onClick={() => toggleAccordion('b2b', 1)}
            variant="dark"
          >
            <ul className="text-white/90 space-y-2">
              <li className="flex items-start gap-2">
                <Check className="h-5 w-5 text-sky-400 flex-shrink-0 mt-0.5" />
                <span>{t("Customized laundry programs for businesses of all sizes", "Programas de lavandería personalizados para empresas de todos los tamaños")}</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="h-5 w-5 text-sky-400 flex-shrink-0 mt-0.5" />
                <span>{t("Commercial-grade washing and stain removal", "Lavado y eliminación de manchas de grado comercial")}</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="h-5 w-5 text-sky-400 flex-shrink-0 mt-0.5" />
                <span>{t("Scheduled pickup & delivery for maximum efficiency", "Recogida y entrega programadas para máxima eficiencia")}</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="h-5 w-5 text-sky-400 flex-shrink-0 mt-0.5" />
                <span>{t("Flexible volume options with no long-term commitments", "Opciones de volumen flexibles sin compromisos a largo plazo")}</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="h-5 w-5 text-sky-400 flex-shrink-0 mt-0.5" />
                <span>{t("Priority support for business clients", "Soporte prioritario para clientes comerciales")}</span>
              </li>
            </ul>
          </AccordionItem>
        </div>

        <div className="text-center mt-8">
          <Link to="/request-quote">
            <Button data-testid="b2b-request-quote-button" className="bg-white text-sky-600 hover:bg-slate-100 rounded-full px-10 py-6 text-lg font-semibold transform transition-all duration-300 hover:scale-105 shadow-lg">
              📊 {t("REQUEST A QUOTE", "SOLICITAR COTIZACIÓN")}
            </Button>
          </Link>
        </div>
      </ServiceSection>

      {/* Commercial Services Section */}
      <ServiceSection 
        backgroundImage="https://images.unsplash.com/photo-1521791055366-0d553872125f?w=1920&h=1080&fit=crop"
        overlay="bg-gradient-to-r from-slate-900/90 to-slate-800/90"
      >
        <div className="text-center mb-8">
          <span className="text-white/80 font-semibold tracking-wider uppercase text-sm border-b border-white/20 pb-2">{t("Commercial Services", "Servicios Comerciales")}</span>
        </div>
        <h2 className="text-3xl md:text-4xl font-bold text-white mb-4 text-center" style={{ fontFamily: "'Playfair Display', serif" }}>
          {t("Commercial Laundry Services", "Servicios de lavandería comercial")}
        </h2>
        <p className="text-white/90 text-center mb-2 text-lg">
          <strong>{t("Professional Commercial Laundry Services You Can Depend On", "Servicios de lavandería comercial profesional en los que puedes confiar")}</strong>
        </p>
        <p className="text-white/90 text-center mb-8 max-w-2xl mx-auto">
          {t("Built to handle volume, quality, and reliability every single day.", "Construido para manejar volumen, calidad y confiabilidad todos los días.")}
        </p>

        <div className="bg-white/10 backdrop-blur-md rounded-xl border border-white/20 p-6">
          <AccordionItem 
            title={t("Commercial Services", "Servicios Comerciales")}
            isOpen={openAccordions.commercial === 0}
            onClick={() => toggleAccordion('commercial', 0)}
            variant="dark"
          >
            <p className="text-white/90 leading-relaxed">
              {t(
                "Our commercial laundry services are designed to meet the demands of high-traffic businesses. Whether you manage a restaurant, hotel, spa, gym, or office facility, we deliver consistent results, dependable logistics, and a service plan tailored to your business needs.",
                "Nuestros servicios de lavandería comercial están diseñados para satisfacer las demandas de negocios de alto tráfico. Ya sea que administres un restaurante, hotel, spa, gimnasio u oficina, ofrecemos resultados consistentes, logística confiable y un plan de servicio adaptado a las necesidades de tu negocio."
              )}
            </p>
          </AccordionItem>
          <AccordionItem 
            title={t("Key Features & Services", "Características y servicios clave")}
            isOpen={openAccordions.commercial === 1}
            onClick={() => toggleAccordion('commercial', 1)}
            variant="dark"
          >
            <ul className="text-white/90 space-y-2">
              <li className="flex items-start gap-2">
                <Check className="h-5 w-5 text-sky-400 flex-shrink-0 mt-0.5" />
                <span>{t("Laundry solutions for restaurants, hotels, spas, gyms, and offices", "Soluciones de lavandería para restaurantes, hoteles, spas, gimnasios y oficinas")}</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="h-5 w-5 text-sky-400 flex-shrink-0 mt-0.5" />
                <span>{t("High-volume processing with commercial equipment", "Procesamiento de alto volumen con equipos comerciales")}</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="h-5 w-5 text-sky-400 flex-shrink-0 mt-0.5" />
                <span>{t("Specialized care for uniforms, linens, and delicate fabrics", "Cuidado especializado para uniformes, ropa de cama y telas delicadas")}</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="h-5 w-5 text-sky-400 flex-shrink-0 mt-0.5" />
                <span>{t("Reliable pickup & delivery with strict quality control", "Recogida y entrega confiable con estricto control de calidad")}</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="h-5 w-5 text-sky-400 flex-shrink-0 mt-0.5" />
                <span>{t("Flexible billing and service plans", "Facturación y planes de servicio flexibles")}</span>
              </li>
            </ul>
          </AccordionItem>
        </div>

        <div className="text-center mt-8">
          <Link to="/request-quote">
            <Button data-testid="commercial-request-quote-button" className="bg-white text-slate-900 hover:bg-slate-100 rounded-full px-10 py-6 text-lg font-semibold transform transition-all duration-300 hover:scale-105 shadow-lg">
              📋 {t("REQUEST A QUOTE", "SOLICITAR COTIZACIÓN")}
            </Button>
          </Link>
        </div>
      </ServiceSection>

      {/* Quote Section */}
      <section className="relative py-32 overflow-hidden">
        <div 
          className="absolute inset-0 bg-cover bg-center bg-fixed"
          style={{ backgroundImage: "url('https://images.unsplash.com/photo-1517677208171-0bc6725a3e60?w=1920&h=1080&fit=crop')" }}
        >
          <div className="absolute inset-0 bg-gradient-to-r from-black/80 to-black/70"></div>
        </div>
        <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="mb-6">
            <span className="text-white/40 text-6xl font-serif">"</span>
          </div>
          <h2 className="text-4xl md:text-5xl font-bold text-white italic mb-6" style={{ fontFamily: "'Playfair Display', serif" }}>
            {t("If you care for your laundry, you'll notice the difference.", "Si cuidas tu ropa, notarás la diferencia.")}
          </h2>
          <div className="w-24 h-1 bg-sky-500 mx-auto mb-6"></div>
          <p className="text-2xl text-white/80 italic">{t("Clean linens, happy clients…", "Ropa de cama limpia, clientes felices…")}</p>
          <div className="mt-8 flex justify-center gap-4">
            <div className="flex items-center gap-2 text-white/60">
              <Clock className="h-5 w-5" />
              <span>{t("Since 2020", "Desde 2020")}</span>
            </div>
            <div className="flex items-center gap-2 text-white/60">
              <Star className="h-5 w-5" />
              <span>{t("5-Star Service", "Servicio 5 estrellas")}</span>
            </div>
            <div className="flex items-center gap-2 text-white/60">
              <Truck className="h-5 w-5" />
              <span>{t("Free Pickup", "Recogida gratis")}</span>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section className="py-20 bg-gradient-to-b from-slate-50 to-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <span className="text-sky-600 font-semibold tracking-wider uppercase text-sm">{t("Pricing", "Precios")}</span>
            <h2 className="text-4xl md:text-5xl font-bold text-slate-900 mb-4" style={{ fontFamily: "'Playfair Display', serif" }}>
              {t("Transparent Pricing", "Precios transparentes")}
            </h2>
            <p className="text-xl text-sky-600 font-semibold">
              {t("No surprises. Premium service you can count on.", "Sin sorpresas. Servicio premium en el que puedes confiar.")}
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            {/* Pickup & Delivery Pricing */}
            <PricingTable 
              title={t("🚚 Pickup & Delivery", "🚚 Recogida y Entrega")}
              data={[
                { option: t("Recurring (Subscription)", "Recurrente (Suscripción)"), rate: "$2.50/lb", minimum: "$40" },
                { option: t("As Needed", "Bajo demanda"), rate: "$2.75/lb", minimum: "$40" }
              ]}
              note={t("Recurring service is designed for weekly or bi-weekly customers, families, professionals, and rentals.", "El servicio recurrente está diseñado para clientes semanales o quincenales, familias, profesionales y alquileres.")}
            />

            {/* Self Service Pricing */}
            <div className="bg-white rounded-2xl p-8 shadow-lg hover:shadow-xl transition-all duration-300">
              <h3 className="text-2xl font-bold text-slate-900 text-center mb-6">{t("🏪 Self Service", "🏪 Autoservicio")}</h3>
              <p className="text-slate-600 text-center mb-6">{t("Walk in and wash anytime during our store hours.", "Entra y lava en cualquier momento durante nuestro horario.")}</p>
              
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <h4 className="font-bold text-slate-900 mb-4 flex items-center gap-2">
                    <span className="w-1 h-6 bg-sky-500 rounded-full"></span>
                    {t("Washers", "Lavadoras")}
                  </h4>
                  <ul className="space-y-2">
                    {WASHER_PRICES.map((item, i) => (
                      <li key={i} className="flex justify-between text-sm text-slate-600">
                        <span>{item.size}:</span>
                        <strong className="text-slate-900">{item.price}</strong>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h4 className="font-bold text-slate-900 mb-4 flex items-center gap-2">
                    <span className="w-1 h-6 bg-sky-500 rounded-full"></span>
                    {t("Dryers (30 min)", "Secadoras (30 min)")}
                  </h4>
                  <ul className="space-y-2">
                    {DRYER_PRICES.map((item, i) => (
                      <li key={i} className="flex justify-between text-sm text-slate-600">
                        <span>{item.size}:</span>
                        <strong className="text-slate-900">{item.price}</strong>
                      </li>
                    ))}
                  </ul>
                  <p className="text-xs text-slate-500 mt-4 italic">{t("+6 min extra: $0.25", "+6 min extra: $0.25")}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Per Piece Pricing */}
          <div className="mt-8 bg-white rounded-2xl p-8 shadow-lg hover:shadow-xl transition-all duration-300">
            <h3 className="text-2xl font-bold text-slate-900 text-center mb-6">{t("🧺 Per Piece Pricing", "🧺 Precio por pieza")}</h3>
            <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-8">
              {PER_PIECE_CATEGORIES.map((category, idx) => (
                <div key={idx}>
                  <h4 className="font-bold text-slate-900 mb-4 text-lg border-b border-slate-100 pb-2">
                    {category.category}
                  </h4>
                  <div className="space-y-2">
                    {category.items.map((item, i) => (
                      <div key={i} className="flex justify-between text-sm text-slate-600">
                        <span>{item.name}:</span>
                        <strong className="text-slate-900">{item.price}</strong>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-6 pt-6 border-t border-slate-100 text-center">
              <Link to="/schedule-pickup" className="text-sky-600 hover:text-sky-700 font-semibold text-sm">
                {t("Need special items? Contact us →", "¿Necesitas artículos especiales? Contáctanos →")}
              </Link>
            </div>
          </div>
        </div>
      </section>

      <PublicFooter />

      {/* CSS Personalizado */}
      <style jsx>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(40px); }
          to { opacity: 1; transform: translateY(0); }
        }
        
        .animate-fadeIn {
          animation: fadeIn 0.8s ease-out;
        }
        
        .animate-slideUp {
          animation: slideUp 0.8s ease-out;
        }
      `}</style>
    </div>
  );
}