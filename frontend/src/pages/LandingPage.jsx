import { useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { ChevronDown, ChevronUp, Phone, MapPin, Clock } from "lucide-react";
import { Button } from "../components/ui/button";
import PublicNav from "../components/PublicNav";
import PublicFooter from "../components/PublicFooter";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

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
    <div className={`overflow-hidden transition-all duration-300 ${isOpen ? 'max-h-96 pb-5' : 'max-h-0'}`}>
      <p className="text-slate-600 leading-relaxed">{answer}</p>
    </div>
  </div>
);

export default function LandingPage() {
  const [openFAQ, setOpenFAQ] = useState(null);

  const faqs = [
    {
      question: "What services do you offer?",
      answer: "We offer B2B laundry services, Airbnb linen cleaning, Wash & Fold, and Pickup & Delivery services across Ventura County."
    },
    {
      question: "How do I get started?",
      answer: "Simply call or text us at (805) 836-8872, or use our online scheduling form. We'll confirm your pickup time and any special instructions."
    },
    {
      question: "What makes you different?",
      answer: "Reliability, professional cleaning, and flexible options. Your preferences are saved and followed every time. Plus, you get real-time updates on your order status."
    },
    {
      question: "How can I contact you?",
      answer: "Phone/Text: (805) 836-8872 | Email: info@venturafreshlaundry.com | Address: 5722 Telephone Rd #5, Ventura, CA 93003"
    },
    {
      question: "What's your pricing model?",
      answer: "Pickup & Delivery: Minimum order applies. Wash & Fold: $1.75 per pound. Contact us for commercial/B2B pricing tailored to your needs."
    }
  ];

  return (
    <div className="min-h-screen bg-white">
      <PublicNav />

      {/* Hero Section - Video Background */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
        {/* Video Background */}
        <div className="absolute inset-0 z-0">
          <video
            autoPlay
            muted
            loop
            playsInline
            className="w-full h-full object-cover"
            poster="https://images.unsplash.com/photo-1517677208171-0bc6725a3e60?w=1920&h=1080&fit=crop"
          >
            <source src="https://customer-assets.emergentagent.com/job_crm-without-n8n/artifacts/j1fccl3e_vflvideo.mov" type="video/mp4" />
          </video>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"></div>
        </div>

        {/* Hero Content */}
        <div className="relative z-10 text-center px-4 max-w-4xl mx-auto animate-fade-in">
          <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold text-white mb-4 leading-tight" style={{ fontFamily: "'Playfair Display', serif" }}>
            We do your laundry.
          </h1>
          <h2 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold text-white mb-4 leading-tight" style={{ fontFamily: "'Playfair Display', serif" }}>
            You enjoy your time.
          </h2>
          <p className="text-xl sm:text-2xl text-white/90 mb-10">
            Fast pickup, perfectly folded.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link to="/schedule-pickup">
              <Button className="bg-sky-500 hover:bg-sky-600 text-white rounded-full px-8 py-6 text-lg font-semibold shadow-lg hover:shadow-xl transition-all" data-testid="hero-schedule-btn">
                👉 SCHEDULE PICK-UP
              </Button>
            </Link>
            <Link to="/services">
              <Button variant="outline" className="border-2 border-white text-white hover:bg-white hover:text-slate-900 rounded-full px-8 py-6 text-lg font-semibold transition-all">
                👉 MORE SERVICES
              </Button>
            </Link>
          </div>
        </div>

        {/* Wave Divider */}
        <div className="absolute bottom-0 left-0 right-0 z-10">
          <svg viewBox="0 0 1440 120" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full">
            <path d="M0,60 C360,120 720,0 1080,60 C1260,90 1380,90 1440,60 L1440,120 L0,120 Z" fill="white"/>
          </svg>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 relative overflow-hidden">
        {/* Background Image with Parallax Effect */}
        <div 
          className="absolute inset-0 bg-cover bg-center bg-fixed"
          style={{ 
            backgroundImage: "url('https://images.unsplash.com/photo-1545173168-9f1947eebb7f?w=1920&h=1080&fit=crop')",
          }}
        >
          <div className="absolute inset-0 bg-sky-600/85"></div>
        </div>

        <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white text-center mb-12 leading-tight" style={{ fontFamily: "'Playfair Display', serif" }}>
            Ventura Fresh Laundry makes laundry effortless across Ventura County
          </h2>

          <div className="grid md:grid-cols-3 gap-8 mb-12">
            <div className="text-center p-6">
              <div className="text-5xl mb-4">⭐</div>
              <h3 className="text-xl font-bold text-white mb-3">Premium garment care</h3>
              <p className="text-white/90">Consistent, high-quality cleaning for all your items</p>
            </div>
            <div className="text-center p-6">
              <div className="text-5xl mb-4">🧺</div>
              <h3 className="text-xl font-bold text-white mb-3">Custom folding</h3>
              <p className="text-white/90">Done exactly your way, every single time</p>
            </div>
            <div className="text-center p-6">
              <div className="text-5xl mb-4">🚚</div>
              <h3 className="text-xl font-bold text-white mb-3">Pickup & delivery</h3>
              <p className="text-white/90">Effortless service, on your schedule</p>
            </div>
          </div>

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

        {/* Wave Divider */}
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
          style={{ 
            backgroundImage: "url('https://images.unsplash.com/photo-1582735689369-4fe89db7114c?w=1920&h=1080&fit=crop')"
          }}
        ></div>

        <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white text-center mb-16" style={{ fontFamily: "'Playfair Display', serif" }}>
            How It Works
          </h2>

          <div className="grid md:grid-cols-3 gap-8">
            {/* Step 1 */}
            <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-8 text-center border border-white/20">
              <div className="h-16 w-16 rounded-full bg-sky-500 text-white text-2xl font-bold flex items-center justify-center mx-auto mb-6">
                1
              </div>
              <h3 className="text-2xl font-bold text-white mb-4">Call or Text to Schedule</h3>
              <p className="text-white/80 leading-relaxed">
                Contact us to confirm your pickup time, share special instructions, and ask any questions. We're here to help!
              </p>
            </div>

            {/* Step 2 */}
            <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-8 text-center border border-white/20">
              <div className="h-16 w-16 rounded-full bg-sky-500 text-white text-2xl font-bold flex items-center justify-center mx-auto mb-6">
                2
              </div>
              <h3 className="text-2xl font-bold text-white mb-4">We Pick Up</h3>
              <p className="text-white/80 leading-relaxed">
                Leave your laundry out and our driver will pick it up, label it carefully, and transport it to our facility.
              </p>
            </div>

            {/* Step 3 */}
            <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-8 text-center border border-white/20">
              <div className="h-16 w-16 rounded-full bg-sky-500 text-white text-2xl font-bold flex items-center justify-center mx-auto mb-6">
                3
              </div>
              <h3 className="text-2xl font-bold text-white mb-4">Delivered Clean</h3>
              <p className="text-white/80 leading-relaxed">
                We wash, dry, and fold your items. Then deliver them back to you—clean, fresh, and perfectly packaged.
              </p>
            </div>
          </div>
        </div>

        {/* Wave Divider */}
        <div className="absolute bottom-0 left-0 right-0 z-10">
          <svg viewBox="0 0 1440 120" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full">
            <path d="M0,60 Q360,0 720,60 T1440,60 L1440,120 L0,120 Z" fill="white"/>
          </svg>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="py-24 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-3 gap-12">
            {/* Benefit 1 */}
            <div className="text-center">
              <div className="h-20 w-20 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-6">
                <span className="text-4xl">🌿</span>
              </div>
              <h3 className="text-2xl font-bold text-slate-900 mb-4">Eco-Conscious</h3>
              <p className="text-slate-600 leading-relaxed">
                Water and energy-saving equipment with a reduced environmental footprint. Clean clothes, cleaner planet.
              </p>
            </div>

            {/* Benefit 2 */}
            <div className="text-center">
              <div className="h-20 w-20 rounded-full bg-sky-100 flex items-center justify-center mx-auto mb-6">
                <span className="text-4xl">✨</span>
              </div>
              <h3 className="text-2xl font-bold text-slate-900 mb-4">Personalized to You</h3>
              <p className="text-slate-600 leading-relaxed">
                Set your preferences once—detergent, folding style, special care—and we handle the rest, every time.
              </p>
            </div>

            {/* Benefit 3 */}
            <div className="text-center">
              <div className="h-20 w-20 rounded-full bg-purple-100 flex items-center justify-center mx-auto mb-6">
                <span className="text-4xl">📱</span>
              </div>
              <h3 className="text-2xl font-bold text-slate-900 mb-4">Real-Time Updates</h3>
              <p className="text-slate-600 leading-relaxed">
                Get notifications at every step: pickup confirmed, processing, out for delivery. Always know your status.
              </p>
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
          <p className="text-xl text-white/90 mb-12">
            Laundry shouldn't take over your schedule. Let us handle it while you focus on what matters.
          </p>

          <blockquote className="bg-white/20 backdrop-blur-sm rounded-2xl p-8 md:p-12 border border-white/30">
            <p className="text-xl md:text-2xl text-white italic mb-6 leading-relaxed">
              "Ventura Fresh Laundry completely changed how I manage my week. I get hours back every weekend, and my clothes have never looked better!"
            </p>
            <footer className="text-white/90 font-semibold text-lg">
              — Katy F.
            </footer>
          </blockquote>
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
              <p className="text-slate-600">5722 Telephone Rd #5, Ventura, CA 93003</p>
            </div>
            <div className="flex flex-col items-center">
              <div className="h-14 w-14 rounded-full bg-sky-100 flex items-center justify-center mb-4">
                <Clock className="h-7 w-7 text-sky-600" />
              </div>
              <p className="text-slate-600">Mon–Sun 6:00 AM – 10:00 PM</p>
            </div>
            <div className="flex flex-col items-center">
              <div className="h-14 w-14 rounded-full bg-sky-100 flex items-center justify-center mb-4">
                <Phone className="h-7 w-7 text-sky-600" />
              </div>
              <p className="text-slate-600">(805) 836-8872</p>
            </div>
          </div>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}
