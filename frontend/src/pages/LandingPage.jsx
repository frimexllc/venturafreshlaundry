import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, ChevronUp, Phone, MapPin, Clock } from "lucide-react";
import { Button } from "../components/ui/button";
import PublicNav from "../components/PublicNav";
import PublicFooter from "../components/PublicFooter";
import videoVFL from "../assets/videoHeroHomeInicial.mp4";

// FAQ Accordion Component
const FAQItem = ({ question, answer, isOpen, onClick }) => (
  <div className="border-b border-slate-200 last:border-0">
    <button
      onClick={onClick}
      className="w-full py-5 flex items-center justify-between text-left group"
    >
      <span className="text-lg font-medium text-slate-900 group-hover:text-sky-600 transition-colors pr-4">
        {question}
      </span>
      <div className="flex-shrink-0 h-8 w-8 rounded-full bg-slate-100 flex items-center justify-center">
        {isOpen ? (
          <ChevronUp className="h-5 w-5 text-sky-600" />
        ) : (
          <ChevronDown className="h-5 w-5 text-slate-400" />
        )}
      </div>
    </button>
    <div
      className={`overflow-hidden transition-all duration-300 ${
        isOpen ? "max-h-[500px] pb-5" : "max-h-0"
      }`}
    >
      <div className="text-slate-600 leading-relaxed">{answer}</div>
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
  const [openFAQ, setOpenFAQ] = useState(null);
  const [scrollY, setScrollY] = useState(0);

  // Efecto de parallax
  useEffect(() => {
    const handleScroll = () => setScrollY(window.pageYOffset);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const faqs = [
    {
      question: "What services do you offer?",
      answer: (
        <div>
          <p className="mb-2">
            We offer a full range of laundry solutions for businesses and Airbnb
            hosts, including:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              <strong>B2B Laundry Services</strong> – customized for businesses
              of all sizes
            </li>
            <li>
              <strong>Airbnb & Short-Term Rental Laundry</strong> – spotless
              linens, fast turnaround
            </li>
            <li>
              <strong>Wash & Fold</strong> – affordable and convenient for any
              laundry load
            </li>
            <li>
              <strong>Pickup & Delivery Services</strong> – scheduled to fit your
              needs
            </li>
          </ul>
        </div>
      ),
    },
    {
      question: "How do I get started?",
      answer:
        "Getting started is easy! Simply click the pickup button below and complete the short request form. We'll schedule your first pickup and customize your laundry service based on your preferences.",
    },
    {
      question: "What makes you different?",
      answer:
        "We combine reliability, professional-grade cleaning, and flexible service options. Every client gets priority support, tailored laundry programs, and fast turnaround to make your business or rental operation stress-free.",
    },
    {
      question: "How can I contact you?",
      answer: (
        <div>
          <p>You can reach us:</p>
          <ul className="list-none space-y-1 mt-2">
            <li>
              <strong>Phone/Text:</strong> (805) 836-8872
            </li>
            <li>
              <strong>Email:</strong> info@venturafreshlaundry.com
            </li>
            <li>
              <strong>In person:</strong> 5722 Telephone Rd #5, Ventura, CA 93003
            </li>
          </ul>
        </div>
      ),
    },
    {
      question: "What's your pricing model?",
      answer: (
        <div>
          <ul className="list-none space-y-1">
            <li>
              <strong>Pickup & Delivery:</strong> $40 minimum per order (recurring
              or as-needed)
            </li>
            <li>
              <strong>Wash & Fold:</strong> $2.25 per pound, 10 lb minimum (orders
              under 10 lb are charged as 10 lb)
            </li>
            <li>Custom pricing available for large or recurring business accounts</li>
          </ul>
        </div>
      ),
    },
    {
      question: "What's it like to work with you?",
      answer:
        "Working with Ventura Fresh Laundry is hassle-free, professional, and reliable. From pickup to delivery, we ensure clean, fresh laundry every time, and provide priority support for businesses and Airbnb hosts.",
    },
  ];

  // URLs de imágenes / video
  const images = {
    // ✅ PON AQUÍ TU VIDEO MP4 (reemplaza este placeholder)
    heroVideo: videoVFL,
    background:
      "https://images.squarespace-cdn.com/content/v1/696c559a4b2b9b1b0febf8d7/8f9faf72-9068-4289-8f90-869a9b1b00d2/backgound.png",
    delivery:
      "https://images.squarespace-cdn.com/content/v1/696c559a4b2b9b1b0febf8d7/3952928a-343a-44b5-ad18-6aa57be0b4eb/ventura_fresh_laundry_part_1.png",
  };

  return (
    <div className="min-h-screen bg-white overflow-x-hidden">
      {/* Hero Section with Video Background */}
      <section className="relative min-h-screen flex items-center overflow-hidden">
        {/* ✅ VIDEO Background */}
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
          {/* ✅ Overlay ligero para legibilidad */}
          <div className="absolute inset-0 bg-black/25"></div>
        </div>

        {/* ✅ NAV NORMALIZADO (usa el componente PublicNav) */}
        <PublicNav />

        {/* Hero Content con animaciones escalonadas */}
        <div className="relative z-10 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto w-full">
          <div className="max-w-xl">
            <StaggeredElement delay={100}>
            <h1
  className="text-4xl sm:text-5xl md:text-6xl font-light text-white mb-2 leading-tight italic mt-20"
  style={{ fontFamily: "'Playfair Display', serif" }}
></h1>  <h1
                className="text-4xl sm:text-5xl md:text-6xl font-light text-white mb-2 leading-tight italic"
                style={{ fontFamily: "'Playfair Display', serif" }}
              >
                We do your laundry.
              </h1>
            </StaggeredElement>

            <StaggeredElement delay={200}>
              <h2
                className="text-4xl sm:text-5xl md:text-6xl font-light text-white mb-2 leading-tight italic"
                style={{ fontFamily: "'Playfair Display', serif" }}
              >
                You enjoy your time.
              </h2>
            </StaggeredElement>

            <StaggeredElement delay={300}>
              <p
                className="text-2xl sm:text-3xl text-white mb-8 italic"
                style={{ fontFamily: "'Playfair Display', serif" }}
              >
                Fast pickup, perfectly folded.
              </p>
            </StaggeredElement>

            {/* Botones */}
            <StaggeredElement delay={400}>
              <div className="flex flex-col sm:flex-row gap-3 mb-10">
                <Link to="/schedule-pickup">
                  <Button className="bg-sky-500 hover:bg-sky-600 text-white rounded-full px-6 py-3 text-sm font-semibold shadow-lg transition-all duration-300">
                    👉 SCHEDULE PICK-UP
                  </Button>
                </Link>
                <Link to="/services">
                  <Button
                    variant="outline"
                    className="border-2 border-white text-white hover:bg-white hover:text-slate-900 rounded-full px-6 py-3 text-sm font-semibold bg-transparent transition-all duration-300"
                  >
                    👉 MORE SERVICES
                  </Button>
                </Link>
                <Link to="/request-quote">
                  <Button
                    data-testid="landing-b2b-quote-button"
                    variant="outline"
                    className="border-2 border-sky-400 text-sky-400 hover:bg-sky-400 hover:text-white rounded-full px-6 py-3 text-sm font-semibold bg-transparent transition-all duration-300"
                  >
                    🏢 B2B / COMMERCIAL
                  </Button>
                </Link>
              </div>
            </StaggeredElement>

            {/* Service List */}
            <StaggeredElement delay={500}>
              <div className="space-y-2 text-white bg-white/10 p-6 rounded-2xl border border-white/20">
                <p className="text-lg hover:text-sky-300 transition-colors duration-300">
                  • Self Service
                </p>
                <p className="text-lg hover:text-sky-300 transition-colors duration-300">
                  • Wash & Fold
                </p>
                <p className="text-lg hover:text-sky-300 transition-colors duration-300">
                  • Pickup & Delivery
                </p>
              </div>
            </StaggeredElement>
          </div>
        </div>

        {/* Wave Divider */}
        <div className="absolute bottom-0 left-0 right-0 z-10 pointer-events-none">
          <svg
            viewBox="0 0 1440 120"
            xmlns="http://www.w3.org/2000/svg"
            className="w-full h-[120px]"
            preserveAspectRatio="none"
          >
            <path
              d="M0,0 C240,80 480,0 720,40 C960,80 1200,0 1440,40 L1440,120 L0,120 Z"
              fill="white"
              className="transition-all duration-1000"
              style={{ transform: `translateY(${scrollY * 0.1}px)` }}
            />
          </svg>
        </div>
      </section>

      {/* Features Section */}
      <section className="pt-20 pb-40 relative overflow-hidden">
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
              Ventura Fresh Laundry makes laundry effortless across Ventura County
            </h2>
          </StaggeredElement>

          <StaggeredElement delay={100}>
            <p className="text-xl text-white/90 text-center mb-12 max-w-3xl mx-auto bg-white/5 p-6 rounded-2xl">
              From convenient self-service to professional fluff & fold and fast pickup & delivery, we handle every detail so you don't have to.
            </p>
          </StaggeredElement>

          <div className="grid md:grid-cols-3 gap-8 mb-12">
            {[
              { icon: "⭐", title: "Premium garment care", desc: "Consistent, high-quality cleaning" },
              { icon: "🧺", title: "Custom folding", desc: "Done exactly your way" },
              { icon: "🚚", title: "Pickup & delivery", desc: "Effortless, on your schedule" },
            ].map((feature, idx) => (
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
              Simply schedule a pickup and we'll return your clothes clean, fresh, and perfectly folded to your preferences.
            </p>
          </StaggeredElement>

          <StaggeredElement delay={600}>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link to="/services">
                <Button className="bg-white text-sky-600 hover:bg-slate-100 rounded-full px-8 py-4 text-lg font-semibold transition-all duration-300 hover:scale-105">
                  MORE SERVICES
                </Button>
              </Link>
              <Link to="/schedule-pickup">
                <Button className="bg-slate-900 text-white hover:bg-slate-800 rounded-full px-8 py-4 text-lg font-semibold transition-all duration-300 hover:scale-105">
                  SCHEDULE PICK-UP
                </Button>
              </Link>
            </div>
          </StaggeredElement>
        </div>

        <div className="absolute bottom-0 left-0 right-0 z-10">
          <svg viewBox="0 0 1440 120" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full">
            <path
              d="M0,40 Q360,100 720,40 T1440,40 L1440,120 L0,120 Z"
              fill="white"
              className="transition-all duration-1000"
              style={{ transform: `translateY(${scrollY * 0.05}px)` }}
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
              How It Works
            </h2>
          </StaggeredElement>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                step: "1",
                title: "Schedule Your Pickup in Seconds",
                content:
                  "Click the pickup button below to submit your request instantly. Once received, we'll confirm:",
                list: [
                  "Your preferred pickup time window",
                  "Special instructions (detergent type, folding style, hang dry, etc.)",
                  "Any important details about your order",
                ],
                footer: "Our team ensures everything is set and seamless before we arrive.",
              },
              {
                step: "2",
                title: "We Pick Up",
                content:
                  "Leave your laundry bag(s) in the agreed location — at your door, front desk, or designated spot.",
                list: [
                  "Pick up your items on time",
                  "Label and track your order",
                  "Transport your laundry safely to our facility",
                ],
                footer: "No waiting. No hassle.",
              },
              {
                step: "3",
                title: "Delivered Clean",
                content:
                  "Your clothes are professionally washed, dried, and folded using premium products and modern equipment.",
                list: [
                  "Clean and fresh",
                  "Neatly folded or hung, based on your preference",
                  "Carefully packaged and ready to wear",
                ],
                footer: "Delivered right back to your door.",
              },
            ].map((stepData, idx) => (
              <StaggeredElement key={idx} delay={100 + idx * 100}>
                <div className="bg-white/10 rounded-2xl p-8 border border-white/20 hover:bg-white/15 transition-all duration-500 hover:scale-105">
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

                  {idx === 0 && (
                    <div className="mt-6">
                      <Link to="/schedule-pickup">
                        <Button className="bg-slate-900 text-white hover:bg-slate-800 rounded-full px-6 py-3 text-sm font-semibold w-full">
                          SCHEDULE PICK-UP
                        </Button>
                      </Link>
                    </div>
                  )}
                </div>
              </StaggeredElement>
            ))}
          </div>
        </div>

        <div className="absolute bottom-0 left-0 right-0 z-10">
          <svg viewBox="0 0 1440 120" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full">
            <path
              d="M0,60 Q360,0 720,60 T1440,60 L1440,120 L0,120 Z"
              fill="white"
              className="transition-all duration-1000"
              style={{ transform: `translateY(${scrollY * 0.03}px)` }}
            />
          </svg>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="py-24 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-2 gap-16">
            <div>
              <StaggeredElement>
                <div className="mb-12 p-6 rounded-2xl bg-gradient-to-br from-sky-50 to-white border border-sky-100 hover:shadow-xl transition-all duration-500">
                  <h3 className="text-3xl font-bold text-slate-900 mb-4" style={{ fontFamily: "'Playfair Display', serif" }}>
                    Real-Time Updates
                  </h3>
                  <p className="text-slate-600 leading-relaxed">
                    Stay informed every step of the way. You'll receive text notifications when your laundry is picked up, in process, and on its way back to you. You'll always know where your order is — and that it's in good hands.
                  </p>
                </div>
              </StaggeredElement>

              <StaggeredElement delay={100}>
                <div className="p-6 rounded-2xl bg-gradient-to-br from-emerald-50 to-white border border-emerald-100 hover:shadow-xl transition-all duration-500">
                  <h3 className="text-3xl font-bold text-slate-900 mb-4" style={{ fontFamily: "'Playfair Display', serif" }}>
                    Eco-Conscious by Design
                  </h3>
                  <p className="text-slate-600 mb-4">
                    Our professional equipment is built to use less water and energy than standard home machines. That means:
                  </p>
                  <ul className="text-slate-600 space-y-2">
                    <li>• Lower water consumption per load</li>
                    <li>• Reduced electricity usage</li>
                    <li>• A smaller environmental footprint</li>
                  </ul>
                  <p className="text-slate-600 mt-4 font-medium">
                    Cleaner clothes, smarter resource use, better for the planet.
                  </p>
                </div>
              </StaggeredElement>
            </div>

            <div>
              <StaggeredElement delay={200}>
                <div className="mb-12 p-6 rounded-2xl bg-gradient-to-br from-amber-50 to-white border border-amber-100 hover:shadow-xl transition-all duration-500">
                  <h3 className="text-3xl font-bold text-slate-900 mb-4" style={{ fontFamily: "'Playfair Display', serif" }}>
                    Personalized to Your Preferences
                  </h3>
                  <p className="text-slate-600 mb-4">Getting started is easy:</p>
                  <ul className="text-slate-600 space-y-2">
                    <li>• Schedule by phone or text</li>
                    <li>• Set your preferences once</li>
                    <li>• Leave your laundry out</li>
                    <li>• We take care of the rest</li>
                  </ul>
                  <p className="text-slate-600 mt-4 font-medium">
                    No complicated systems. No unnecessary steps.
                  </p>
                </div>
              </StaggeredElement>

              <StaggeredElement delay={300}>
                <div className="p-6 rounded-2xl bg-gradient-to-br from-purple-50 to-white border border-purple-100 hover:shadow-xl transition-all duration-500">
                  <h3 className="text-3xl font-bold text-slate-900 mb-4" style={{ fontFamily: "'Playfair Display', serif" }}>
                    Simple from Start to Finish
                  </h3>
                  <p className="text-slate-600 leading-relaxed">
                    Stay informed every step of the way. You'll receive text notifications when your laundry is picked up, in process, and on its way back to you. You'll always know where your order is — and that it's in good hands.
                  </p>
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
              Take Back Your Time!!
            </h2>
          </StaggeredElement>

          <StaggeredElement delay={100}>
            <p className="text-xl text-white/90 mb-8">Laundry shouldn't take over your schedule.</p>
          </StaggeredElement>

          <StaggeredElement delay={200}>
            <p className="text-lg text-white/80 mb-12 max-w-2xl mx-auto bg-white/10 p-6 rounded-2xl">
              We know how many hours disappear sorting, washing, drying, and folding. That's time you could spend relaxing, being with family, exploring the city, or simply recharging. Let us handle the laundry so you can focus on what truly matters.
            </p>
          </StaggeredElement>

          <StaggeredElement delay={300}>
            <blockquote className="bg-white/20 rounded-2xl p-8 md:p-12 border border-white/30 hover:bg-white/25 transition-all duration-500">
              <p className="text-xl md:text-2xl text-white italic mb-6 leading-relaxed">
                "Ventura Fresh Laundry completely changed the way I handle laundry. The pickup and delivery is always on time, and my clothes come back perfectly clean and folded. I honestly can't imagine going back to doing it myself."
              </p>
              <footer className="text-white/90 font-semibold text-lg">— Katy F.</footer>
            </blockquote>
          </StaggeredElement>

          <StaggeredElement delay={400}>
            <p className="text-xl text-white font-bold mt-12 bg-white/10 p-6 rounded-2xl inline-block">
              Ventura County Most Affordable Laundry Service is Ready to Take Laundry Off Your To-Do List.
            </p>
          </StaggeredElement>
        </div>

        <div className="absolute bottom-0 left-0 right-0 z-10">
          <svg viewBox="0 0 1440 60" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full">
            <path
              d="M0,30 Q80,60 160,30 T320,30 T480,30 T640,30 T800,30 T960,30 T1120,30 T1280,30 T1440,30 L1440,60 L0,60 Z"
              fill="white"
              className="transition-all duration-1000"
              style={{ transform: `translateY(${scrollY * 0.02}px)` }}
            />
          </svg>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-24 bg-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <StaggeredElement>
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 text-center mb-12" style={{ fontFamily: "'Playfair Display', serif" }}>
              Frequently Asked Questions
            </h2>
          </StaggeredElement>

          <div className="bg-gradient-to-br from-white to-slate-50 rounded-2xl shadow-xl border border-slate-100 p-6 md:p-8">
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
      <section className="py-16 bg-gradient-to-b from-slate-50 to-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-3 gap-8 text-center">
            {[
              { icon: <MapPin className="h-7 w-7 text-sky-600" />, text: "📍 5722 Telephone Rd #5, Ventura, CA 93003" },
              { icon: <Clock className="h-7 w-7 text-sky-600" />, text: "🕒 Mon–Sun 6:00 AM – 10:00 PM" },
              { icon: <Phone className="h-7 w-7 text-sky-600" />, text: "📞 (805) 836-8872" },
            ].map((contact, idx) => (
              <StaggeredElement key={idx} delay={idx * 100}>
                <div className="flex flex-col items-center hover:scale-105 transition-all duration-500">
                  <div className="h-14 w-14 rounded-full bg-gradient-to-br from-sky-100 to-white flex items-center justify-center mb-4 shadow-lg border border-sky-200">
                    {contact.icon}
                  </div>
                  <p className="text-slate-600 font-medium">{contact.text}</p>
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