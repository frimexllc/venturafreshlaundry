import { useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, ChevronUp, Phone, MapPin, Clock, Mail } from "lucide-react";
import { Button } from "../components/ui/button";
import PublicNav from "../components/PublicNav";
import PublicFooter from "../components/PublicFooter";

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
    <div className={`overflow-hidden transition-all duration-300 ${isOpen ? 'max-h-[500px] pb-5' : 'max-h-0'}`}>
      <div className="text-slate-600 leading-relaxed">{answer}</div>
    </div>
  </div>
);

export default function LandingPage() {
  const [openFAQ, setOpenFAQ] = useState(null);

  const faqs = [
    {
      question: "What services do you offer?",
      answer: (
        <div>
          <p className="mb-2">We offer a full range of laundry solutions for businesses and Airbnb hosts, including:</p>
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
      question: "How do I get started?",
      answer: "Getting started is easy! Just call, text, or email us at (805) 836-8872, and we'll schedule your first pickup or create a customized laundry plan based on your needs."
    },
    {
      question: "What makes you different?",
      answer: "We combine reliability, professional-grade cleaning, and flexible service options. Every client gets priority support, tailored laundry programs, and fast turnaround to make your business or rental operation stress-free."
    },
    {
      question: "How can I contact you?",
      answer: (
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
      question: "What's your pricing model?",
      answer: (
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
      question: "What's it like to work with you?",
      answer: "Working with Ventura Fresh Laundry is hassle-free, professional, and reliable. From pickup to delivery, we ensure clean, fresh laundry every time, and provide priority support for businesses and Airbnb hosts."
    }
  ];

  return (
    <div className="min-h-screen bg-white">
      <PublicNav />

      {/* Hero Section with Video Background */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
        {/* Video Background */}
        <div className="absolute inset-0 z-0">
          <video
            autoPlay
            muted
            loop
            playsInline
            className="w-full h-full object-cover"
            poster="https://images.squarespace-cdn.com/content/v1/696c559a4b2b9b1b0febf8d7/afc754e5-400f-4091-855c-a38d60c731ed/backgound.png"
          >
            <source src="https://customer-assets.emergentagent.com/job_crm-without-n8n/artifacts/j1fccl3e_vflvideo.mov" type="video/mp4" />
          </video>
          <div className="absolute inset-0 bg-black/50"></div>
        </div>

        {/* Hero Content */}
        <div className="relative z-10 text-center px-4 max-w-4xl mx-auto">
          <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold text-white mb-2 leading-tight animate-fade-in" style={{ fontFamily: "'Playfair Display', serif" }}>
            We do your laundry.
          </h1>
          <h2 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold text-white mb-4 leading-tight animate-fade-in" style={{ fontFamily: "'Playfair Display', serif" }}>
            You enjoy your time.
          </h2>
          <p className="text-xl sm:text-2xl text-white/90 mb-10 animate-fade-in">
            Fast pickup, perfectly folded.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center animate-fade-in">
            <Link to="/schedule-pickup">
              <Button className="bg-sky-500 hover:bg-sky-600 text-white rounded-full px-8 py-6 text-lg font-semibold shadow-lg hover:shadow-xl transition-all" data-testid="hero-schedule-btn">
                👉 SCHEDULE PICK-UP
              </Button>
            </Link>
            <Link to="/services">
              <Button variant="outline" className="border-2 border-white text-white hover:bg-white hover:text-slate-900 rounded-full px-8 py-6 text-lg font-semibold transition-all bg-transparent">
                👉 MORE SERVICES
              </Button>
            </Link>
          </div>
        </div>

        {/* Scalloped Divider */}
        <div className="absolute bottom-0 left-0 right-0 z-10">
          <svg viewBox="0 0 1440 60" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full">
            <path d="M0,30 Q80,60 160,30 T320,30 T480,30 T640,30 T800,30 T960,30 T1120,30 T1280,30 T1440,30 L1440,60 L0,60 Z" fill="white"/>
          </svg>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 relative overflow-hidden">
        <div 
          className="absolute inset-0 bg-cover bg-center bg-fixed"
          style={{ backgroundImage: "url('https://images.squarespace-cdn.com/content/v1/696c559a4b2b9b1b0febf8d7/8f9faf72-9068-4289-8f90-869a9b1b00d2/backgound.png')" }}
        >
          <div className="absolute inset-0 bg-sky-600/90"></div>
        </div>

        <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white text-center mb-6 leading-tight" style={{ fontFamily: "'Playfair Display', serif" }}>
            Ventura Fresh Laundry makes laundry effortless across Ventura County
          </h2>
          <p className="text-xl text-white/90 text-center mb-12 max-w-3xl mx-auto">
            From convenient self-service to professional fluff & fold and fast pickup & delivery, we handle every detail so you don't have to.
          </p>

          <div className="grid md:grid-cols-3 gap-8 mb-12">
            <div className="text-center p-6">
              <div className="text-5xl mb-4">⭐</div>
              <h3 className="text-xl font-bold text-white mb-3">Premium garment care</h3>
              <p className="text-white/90">Consistent, high-quality cleaning</p>
            </div>
            <div className="text-center p-6">
              <div className="text-5xl mb-4">🧺</div>
              <h3 className="text-xl font-bold text-white mb-3">Custom folding</h3>
              <p className="text-white/90">Done exactly your way</p>
            </div>
            <div className="text-center p-6">
              <div className="text-5xl mb-4">🚚</div>
              <h3 className="text-xl font-bold text-white mb-3">Pickup & delivery</h3>
              <p className="text-white/90">Effortless, on your schedule</p>
            </div>
          </div>

          <p className="text-lg text-white/90 text-center max-w-2xl mx-auto mb-8">
            Simply schedule a pickup and we'll return your clothes clean, fresh, and perfectly folded to your preferences.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link to="/services">
              <Button className="bg-white text-sky-600 hover:bg-slate-100 rounded-full px-8 py-4 text-lg font-semibold">
                MORE SERVICES
              </Button>
            </Link>
            <Link to="/schedule-pickup">
              <Button className="bg-slate-900 text-white hover:bg-slate-800 rounded-full px-8 py-4 text-lg font-semibold">
                SCHEDULE PICK-UP
              </Button>
            </Link>
          </div>
        </div>

        {/* Wavy Divider */}
        <div className="absolute bottom-0 left-0 right-0 z-10">
          <svg viewBox="0 0 1440 120" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full">
            <path d="M0,40 Q360,100 720,40 T1440,40 L1440,120 L0,120 Z" fill="white"/>
          </svg>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="py-24 bg-slate-900 relative overflow-hidden">
        <div 
          className="absolute inset-0 bg-cover bg-center opacity-30"
          style={{ backgroundImage: "url('https://images.squarespace-cdn.com/content/v1/696c559a4b2b9b1b0febf8d7/3952928a-343a-44b5-ad18-6aa57be0b4eb/ventura_fresh_laundry_part_1.png')" }}
        ></div>

        <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white text-center mb-16" style={{ fontFamily: "'Playfair Display', serif" }}>
            How It Works
          </h2>

          <div className="grid md:grid-cols-3 gap-8">
            {/* Step 1 */}
            <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-8 border border-white/20">
              <div className="h-16 w-16 rounded-full bg-sky-500 text-white text-2xl font-bold flex items-center justify-center mx-auto mb-6">
                1
              </div>
              <h3 className="text-2xl font-bold text-white text-center mb-4">Call or Text to Schedule</h3>
              <p className="text-white/80 mb-4">
                Reach out to us by call, text, or email to set up your pickup. We'll confirm:
              </p>
              <ul className="text-white/80 space-y-2 text-sm">
                <li>• Your preferred pickup time window</li>
                <li>• Special instructions (detergent type, folding style, hang dry, etc.)</li>
                <li>• Any questions about your order</li>
              </ul>
              <p className="text-white/80 mt-4 text-sm">Our team makes sure everything is set before we arrive.</p>
            </div>

            {/* Step 2 */}
            <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-8 border border-white/20">
              <div className="h-16 w-16 rounded-full bg-sky-500 text-white text-2xl font-bold flex items-center justify-center mx-auto mb-6">
                2
              </div>
              <h3 className="text-2xl font-bold text-white text-center mb-4">We Pick Up</h3>
              <p className="text-white/80 mb-4">
                Leave your laundry bag(s) in the agreed location — at your door, front desk, or designated spot.
              </p>
              <p className="text-white/80 mb-2">Our driver will:</p>
              <ul className="text-white/80 space-y-2 text-sm">
                <li>• Pick up your items on time</li>
                <li>• Label and track your order</li>
                <li>• Transport your laundry safely to our facility</li>
              </ul>
              <p className="text-white/80 mt-4 text-sm font-semibold">No waiting. No hassle.</p>
            </div>

            {/* Step 3 */}
            <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-8 border border-white/20">
              <div className="h-16 w-16 rounded-full bg-sky-500 text-white text-2xl font-bold flex items-center justify-center mx-auto mb-6">
                3
              </div>
              <h3 className="text-2xl font-bold text-white text-center mb-4">Delivered Clean</h3>
              <p className="text-white/80 mb-4">
                Your clothes are professionally washed, dried, and folded using premium products and modern equipment.
              </p>
              <p className="text-white/80 mb-2">Then we return your order:</p>
              <ul className="text-white/80 space-y-2 text-sm">
                <li>• Clean and fresh</li>
                <li>• Neatly folded or hung, based on your preference</li>
                <li>• Carefully packaged and ready to wear</li>
              </ul>
              <p className="text-white/80 mt-4 text-sm font-semibold">Delivered right back to your door.</p>
            </div>
          </div>
        </div>

        {/* Wavy Divider */}
        <div className="absolute bottom-0 left-0 right-0 z-10">
          <svg viewBox="0 0 1440 120" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full">
            <path d="M0,60 Q360,0 720,60 T1440,60 L1440,120 L0,120 Z" fill="white"/>
          </svg>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="py-24 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-2 gap-16">
            {/* Left Column */}
            <div>
              {/* Real-Time Updates */}
              <div className="mb-12">
                <h3 className="text-3xl font-bold text-slate-900 mb-4" style={{ fontFamily: "'Playfair Display', serif" }}>
                  Real-Time Updates
                </h3>
                <p className="text-slate-600 leading-relaxed">
                  Stay informed every step of the way. You'll receive text notifications when your laundry is picked up, in process, and on its way back to you. You'll always know where your order is — and that it's in good hands.
                </p>
              </div>

              {/* Eco-Conscious */}
              <div>
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
            </div>

            {/* Right Column */}
            <div>
              {/* Personalized */}
              <div className="mb-12">
                <h3 className="text-3xl font-bold text-slate-900 mb-4" style={{ fontFamily: "'Playfair Display', serif" }}>
                  Personalized to Your Preferences
                </h3>
                <p className="text-slate-600 mb-4">
                  Getting started is easy:
                </p>
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

              {/* Simple */}
              <div>
                <h3 className="text-3xl font-bold text-slate-900 mb-4" style={{ fontFamily: "'Playfair Display', serif" }}>
                  Simple from Start to Finish
                </h3>
                <p className="text-slate-600 leading-relaxed">
                  Stay informed every step of the way. You'll receive text notifications when your laundry is picked up, in process, and on its way back to you. You'll always know where your order is — and that it's in good hands.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Testimonial Section */}
      <section className="py-24 relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #0ea5e9 0%, #0284c7 50%, #0369a1 100%)' }}>
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-10">
          <h2 className="text-4xl sm:text-5xl font-bold text-white mb-6" style={{ fontFamily: "'Playfair Display', serif" }}>
            Take Back Your Time!!
          </h2>
          <p className="text-xl text-white/90 mb-8">
            Laundry shouldn't take over your schedule.
          </p>
          <p className="text-lg text-white/80 mb-12 max-w-2xl mx-auto">
            We know how many hours disappear sorting, washing, drying, and folding. That's time you could spend relaxing, being with family, exploring the city, or simply recharging. Let us handle the laundry so you can focus on what truly matters.
          </p>

          <blockquote className="bg-white/20 backdrop-blur-sm rounded-2xl p-8 md:p-12 border border-white/30">
            <p className="text-xl md:text-2xl text-white italic mb-6 leading-relaxed">
              "Ventura Fresh Laundry completely changed the way I handle laundry. The pickup and delivery is always on time, and my clothes come back perfectly clean and folded. I honestly can't imagine going back to doing it myself."
            </p>
            <footer className="text-white/90 font-semibold text-lg">
              — Katy F.
            </footer>
          </blockquote>

          <p className="text-xl text-white font-bold mt-12">
            Ventura County Most Affordable Laundry Service is Ready to Take Laundry Off Your To-Do List.
          </p>
        </div>

        {/* Scalloped Divider */}
        <div className="absolute bottom-0 left-0 right-0 z-10">
          <svg viewBox="0 0 1440 60" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full">
            <path d="M0,30 Q80,60 160,30 T320,30 T480,30 T640,30 T800,30 T960,30 T1120,30 T1280,30 T1440,30 L1440,60 L0,60 Z" fill="white"/>
          </svg>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-24 bg-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 text-center mb-12" style={{ fontFamily: "'Playfair Display', serif" }}>
            Frequently Asked Questions
          </h2>

          <div className="bg-white rounded-2xl shadow-lg border border-slate-100 p-6 md:p-8">
            {faqs.map((faq, index) => (
              <FAQItem
                key={index}
                question={faq.question}
                answer={faq.answer}
                isOpen={openFAQ === index}
                onClick={() => setOpenFAQ(openFAQ === index ? null : index)}
              />
            ))}
          </div>
        </div>
      </section>

      {/* Contact Info Section */}
      <section className="py-16 bg-slate-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-3 gap-8 text-center">
            <div className="flex flex-col items-center">
              <div className="h-14 w-14 rounded-full bg-sky-100 flex items-center justify-center mb-4">
                <MapPin className="h-7 w-7 text-sky-600" />
              </div>
              <p className="text-slate-600">📍 5722 Telephone Rd #5, Ventura, CA 93003</p>
            </div>
            <div className="flex flex-col items-center">
              <div className="h-14 w-14 rounded-full bg-sky-100 flex items-center justify-center mb-4">
                <Clock className="h-7 w-7 text-sky-600" />
              </div>
              <p className="text-slate-600">🕒 Mon–Sun 6:00 AM – 10:00 PM</p>
            </div>
            <div className="flex flex-col items-center">
              <div className="h-14 w-14 rounded-full bg-sky-100 flex items-center justify-center mb-4">
                <Phone className="h-7 w-7 text-sky-600" />
              </div>
              <p className="text-slate-600">📞 (805) 836-8872</p>
            </div>
          </div>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}
