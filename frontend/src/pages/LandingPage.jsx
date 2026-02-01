import { useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { 
  Phone, 
  MapPin, 
  Clock, 
  ChevronDown,
  ChevronUp,
  Sparkles,
  Bell,
  Leaf,
  CheckCircle
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import PublicNav from "../components/PublicNav";
import PublicFooter from "../components/PublicFooter";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Video background URL
const VIDEO_URL = "https://customer-assets.emergentagent.com/job_crm-without-n8n/artifacts/5zwa79vw_WhatsApp%20Video%202026-01-31%20at%2011.26.35%20PM.mp4";

const FAQItem = ({ question, answer }) => {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <div className="border-b border-slate-200 last:border-0">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full py-5 flex items-center justify-between text-left"
      >
        <span className="font-semibold text-slate-900 pr-4">{question}</span>
        {isOpen ? (
          <ChevronUp className="h-5 w-5 text-sky-600 flex-shrink-0" />
        ) : (
          <ChevronDown className="h-5 w-5 text-slate-400 flex-shrink-0" />
        )}
      </button>
      {isOpen && (
        <div className="pb-5 text-slate-600 animate-fade-in">
          {answer}
        </div>
      )}
    </div>
  );
};

export default function LandingPage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeForm, setActiveForm] = useState("pickup");
  const [submitting, setSubmitting] = useState(false);
  
  // Pickup form
  const [pickupForm, setPickupForm] = useState({
    name: "",
    email: "",
    phone: "",
    address: "",
    pickup_date: "",
    pickup_time: "",
    notes: "",
    gate_code: ""
  });

  // Contact form
  const [contactForm, setContactForm] = useState({
    name: "",
    email: "",
    phone: "",
    message: ""
  });

  // Commercial form
  const [commercialForm, setCommercialForm] = useState({
    company_name: "",
    contact_name: "",
    email: "",
    phone: "",
    industry: "",
    estimated_lbs: "",
    message: ""
  });

  const handlePickupSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await axios.post(`${API}/public/pickup-request`, pickupForm);
      toast.success(res.data.message);
      setPickupForm({ name: "", email: "", phone: "", address: "", pickup_date: "", pickup_time: "", notes: "", gate_code: "" });
    } catch (error) {
      toast.error(error.response?.data?.detail || "Error enviando solicitud");
    } finally {
      setSubmitting(false);
    }
  };

  const handleContactSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await axios.post(`${API}/public/contact`, contactForm);
      toast.success(res.data.message);
      setContactForm({ name: "", email: "", phone: "", message: "" });
    } catch (error) {
      toast.error(error.response?.data?.detail || "Error enviando mensaje");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCommercialSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await axios.post(`${API}/public/quote-request`, {
        ...commercialForm,
        estimated_lbs: commercialForm.estimated_lbs ? parseFloat(commercialForm.estimated_lbs) : null
      });
      toast.success(res.data.message);
      setCommercialForm({ company_name: "", contact_name: "", email: "", phone: "", industry: "", estimated_lbs: "", message: "" });
    } catch (error) {
      toast.error(error.response?.data?.detail || "Error enviando solicitud");
    } finally {
      setSubmitting(false);
    }
  };

  const scrollToSection = (id) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
    setMobileMenuOpen(false);
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-sm shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2">
              <img 
                src="https://images.squarespace-cdn.com/content/v1/66f3d06a2c293506cfa7d476/57cbc3f3-0394-4498-b021-3908fdc39db7/logo.png?format=100w" 
                alt="Ventura Fresh Laundry" 
                className="h-12 w-auto"
                onError={(e) => {
                  e.target.style.display = 'none';
                }}
              />
              <span className="text-xl font-bold text-sky-600">Ventura Fresh Laundry</span>
            </div>
            
            {/* Desktop nav */}
            <div className="hidden md:flex items-center gap-6">
              <button onClick={() => scrollToSection("services")} className="text-slate-600 hover:text-sky-600 font-medium transition-colors">
                Services
              </button>
              <button onClick={() => scrollToSection("about")} className="text-slate-600 hover:text-sky-600 font-medium transition-colors">
                About
              </button>
              <button onClick={() => scrollToSection("contact")} className="text-slate-600 hover:text-sky-600 font-medium transition-colors">
                Contact
              </button>
              <Link to="/login" className="text-slate-600 hover:text-sky-600 font-medium transition-colors">
                Account
              </Link>
              <Button onClick={() => scrollToSection("schedule")} className="bg-sky-500 hover:bg-sky-600 text-white rounded-full px-6">
                SCHEDULE PICK-UP
              </Button>
            </div>

            {/* Mobile menu button */}
            <button 
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 text-slate-600"
            >
              {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {mobileMenuOpen && (
          <div className="md:hidden bg-white border-t border-slate-100 py-4 px-4 animate-fade-in">
            <div className="flex flex-col gap-4">
              <button onClick={() => scrollToSection("services")} className="text-slate-600 hover:text-sky-600 font-medium text-left">Services</button>
              <button onClick={() => scrollToSection("about")} className="text-slate-600 hover:text-sky-600 font-medium text-left">About</button>
              <button onClick={() => scrollToSection("contact")} className="text-slate-600 hover:text-sky-600 font-medium text-left">Contact</button>
              <Link to="/login" className="text-slate-600 hover:text-sky-600 font-medium">Account</Link>
              <Button onClick={() => scrollToSection("schedule")} className="bg-sky-500 hover:bg-sky-600 text-white rounded-full w-full">
                SCHEDULE PICK-UP
              </Button>
            </div>
          </div>
        )}
      </nav>

      {/* Hero Section with Video Background */}
      <section className="relative min-h-screen flex items-center overflow-hidden">
        {/* Video Background */}
        <div className="absolute inset-0 z-0">
          <video
            autoPlay
            loop
            muted
            playsInline
            className="w-full h-full object-cover"
          >
            <source src={VIDEO_URL} type="video/mp4" />
          </video>
          <div className="absolute inset-0 bg-black/40"></div>
        </div>

        {/* Hero Content */}
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-16">
          <div className="max-w-2xl">
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white leading-tight mb-6" style={{ fontFamily: "'Playfair Display', serif" }}>
              We do your laundry.
              <br />
              You enjoy your time.
            </h1>
            <p className="text-xl text-white/90 mb-8" style={{ fontFamily: "'Playfair Display', serif" }}>
              Fast pickup, perfectly folded.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 mb-10">
              <Button 
                onClick={() => scrollToSection("schedule")} 
                className="bg-sky-500 hover:bg-sky-600 text-white rounded-full px-8 py-3 h-auto text-base font-medium flex items-center gap-2"
                data-testid="hero-schedule-btn"
              >
                👉 SCHEDULE PICK-UP
              </Button>
              <Button 
                onClick={() => scrollToSection("services")} 
                variant="outline"
                className="bg-transparent border-2 border-white text-white hover:bg-white/10 rounded-full px-8 py-3 h-auto text-base font-medium flex items-center gap-2"
              >
                👉 MORE SERVICES
              </Button>
            </div>

            <div className="flex flex-col gap-2 text-white text-lg">
              <span>• Self Service</span>
              <span>• Wash & Fold</span>
              <span>• Pickup & Delivery</span>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="about" className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
              Ventura Fresh Laundry makes laundry effortless across Ventura County
            </h2>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8 mb-16">
            <div className="text-center p-6">
              <div className="text-4xl mb-4">⭐</div>
              <h3 className="text-xl font-bold text-slate-900 mb-3">Premium garment care</h3>
              <p className="text-slate-600">Consistent, high-quality cleaning</p>
            </div>
            
            <div className="text-center p-6">
              <div className="text-4xl mb-4">🧺</div>
              <h3 className="text-xl font-bold text-slate-900 mb-3">Custom folding</h3>
              <p className="text-slate-600">Done exactly your way</p>
            </div>
            
            <div className="text-center p-6">
              <div className="text-4xl mb-4">🚚</div>
              <h3 className="text-xl font-bold text-slate-900 mb-3">Pickup & delivery</h3>
              <p className="text-slate-600">Effortless, on your schedule</p>
            </div>
          </div>

          <div className="max-w-4xl mx-auto text-center">
            <p className="text-lg text-slate-600 mb-8">
              From convenient self-service to professional fluff & fold and fast pickup & delivery, we handle every detail so you don't have to. Simply schedule a pickup and we'll return your clothes clean, fresh, and perfectly folded to your preferences.
            </p>
            <div className="flex flex-col sm:flex-row justify-center gap-4">
              <Button onClick={() => scrollToSection("services")} className="bg-sky-500 hover:bg-sky-600 text-white rounded-full px-8">
                👉 MORE SERVICES
              </Button>
              <Button onClick={() => scrollToSection("schedule")} className="bg-sky-500 hover:bg-sky-600 text-white rounded-full px-8">
                👉 SCHEDULE PICK-UP
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Info Section */}
      <section className="py-16 bg-sky-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-2xl md:text-3xl font-bold text-slate-900 mb-4">
              Laundry made simple. We take care of everything from pickup to perfectly folded delivery.
            </h2>
            <p className="text-lg text-slate-600 max-w-3xl mx-auto">
              In just a few easy steps, you'll enjoy a laundry experience designed around your schedule, your preferences, and your lifestyle.
            </p>
          </div>
          
          <div className="flex flex-col md:flex-row justify-center items-center gap-8 md:gap-16">
            <div className="flex items-center gap-3">
              <MapPin className="h-6 w-6 text-sky-600" />
              <span className="text-slate-700">📍 5722 Telephone Rd #5, Ventura, CA 93003</span>
            </div>
            <div className="flex items-center gap-3">
              <Phone className="h-6 w-6 text-sky-600" />
              <span className="text-slate-700">📞 +1 (805) 836-8872</span>
            </div>
            <Button onClick={() => scrollToSection("contact")} className="bg-sky-500 hover:bg-sky-600 text-white rounded-full px-8">
              👉 CONTACT US
            </Button>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section id="services" className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 text-center mb-16">How It Works?</h2>
          
          <div className="grid md:grid-cols-3 gap-12">
            {/* Step 1 */}
            <div className="text-center">
              <div className="h-20 w-20 rounded-full bg-sky-500 text-white flex items-center justify-center text-3xl font-bold mx-auto mb-6">1</div>
              <h3 className="text-2xl font-bold text-slate-900 mb-4">Call or Text to Schedule</h3>
              <p className="text-slate-600 mb-4">
                Reach out to us by call, text, or email to set up your pickup. We'll confirm:
              </p>
              <ul className="text-left text-slate-600 space-y-2 max-w-xs mx-auto">
                <li className="flex items-start gap-2">
                  <CheckCircle className="h-5 w-5 text-sky-500 flex-shrink-0 mt-0.5" />
                  <span>Your preferred pickup time window</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="h-5 w-5 text-sky-500 flex-shrink-0 mt-0.5" />
                  <span>Special instructions (detergent type, folding style, hang dry, etc.)</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="h-5 w-5 text-sky-500 flex-shrink-0 mt-0.5" />
                  <span>Any questions about your order</span>
                </li>
              </ul>
              <p className="text-slate-500 text-sm mt-4 italic">Our team makes sure everything is set before we arrive.</p>
            </div>

            {/* Step 2 */}
            <div className="text-center">
              <div className="h-20 w-20 rounded-full bg-sky-500 text-white flex items-center justify-center text-3xl font-bold mx-auto mb-6">2</div>
              <h3 className="text-2xl font-bold text-slate-900 mb-4">We Pick Up</h3>
              <p className="text-slate-600 mb-4">
                Leave your laundry bag(s) in the agreed location at your door, front desk, or designated spot.
              </p>
              <p className="text-slate-600 mb-4">Our driver will:</p>
              <ul className="text-left text-slate-600 space-y-2 max-w-xs mx-auto">
                <li className="flex items-start gap-2">
                  <CheckCircle className="h-5 w-5 text-sky-500 flex-shrink-0 mt-0.5" />
                  <span>Pick up your items on time</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="h-5 w-5 text-sky-500 flex-shrink-0 mt-0.5" />
                  <span>Label and track your order</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="h-5 w-5 text-sky-500 flex-shrink-0 mt-0.5" />
                  <span>Transport your laundry safely to our facility</span>
                </li>
              </ul>
              <p className="text-slate-500 text-sm mt-4 italic">No waiting. No hassle.</p>
            </div>

            {/* Step 3 */}
            <div className="text-center">
              <div className="h-20 w-20 rounded-full bg-sky-500 text-white flex items-center justify-center text-3xl font-bold mx-auto mb-6">3</div>
              <h3 className="text-2xl font-bold text-slate-900 mb-4">Delivered Clean</h3>
              <p className="text-slate-600 mb-4">
                Your clothes are professionally washed, dried, and folded using premium products and modern equipment.
              </p>
              <p className="text-slate-600 mb-4">Then we return your order:</p>
              <ul className="text-left text-slate-600 space-y-2 max-w-xs mx-auto">
                <li className="flex items-start gap-2">
                  <CheckCircle className="h-5 w-5 text-sky-500 flex-shrink-0 mt-0.5" />
                  <span>Clean and fresh</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="h-5 w-5 text-sky-500 flex-shrink-0 mt-0.5" />
                  <span>Neatly folded or hung, based on your preference</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="h-5 w-5 text-sky-500 flex-shrink-0 mt-0.5" />
                  <span>Carefully packaged and ready to wear</span>
                </li>
              </ul>
              <p className="text-slate-500 text-sm mt-4 italic">Delivered right back to your door.</p>
            </div>
          </div>

          <div className="text-center mt-12">
            <Button onClick={() => scrollToSection("schedule")} className="bg-sky-500 hover:bg-sky-600 text-white rounded-full px-10 py-3 h-auto text-lg">
              👉 SCHEDULE PICK-UP
            </Button>
          </div>
        </div>
      </section>

      {/* Benefits Grid */}
      <section className="py-20 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-2 gap-12">
            {/* Real-Time Updates */}
            <div className="bg-white rounded-2xl p-8 shadow-sm">
              <Bell className="h-10 w-10 text-sky-600 mb-4" />
              <h3 className="text-xl font-bold text-slate-900 mb-4">Real-Time Updates</h3>
              <p className="text-slate-600 mb-4">
                Stay informed every step of the way. You'll receive text notifications when your laundry is picked up, in process, and on its way back to you.
              </p>
              <p className="text-slate-600 italic">
                You'll always know where your order is — and that it's in good hands.
              </p>
            </div>

            {/* Personalized Preferences */}
            <div className="bg-white rounded-2xl p-8 shadow-sm">
              <Sparkles className="h-10 w-10 text-sky-600 mb-4" />
              <h3 className="text-xl font-bold text-slate-900 mb-4">Personalized to Your Preferences</h3>
              <p className="text-slate-600 mb-4">
                Your laundry, your way. Choose your detergent, folding style, special care instructions, and delivery location.
              </p>
              <p className="text-slate-600 italic">
                Every order is handled according to your preferences, so your clothes come back exactly how you like them.
              </p>
            </div>

            {/* Eco-Conscious */}
            <div className="bg-white rounded-2xl p-8 shadow-sm">
              <Leaf className="h-10 w-10 text-sky-600 mb-4" />
              <h3 className="text-xl font-bold text-slate-900 mb-4">Eco-Conscious by Design</h3>
              <p className="text-slate-600 mb-4">
                Our professional equipment is built to use less water and energy than standard home machines. That means:
              </p>
              <ul className="text-slate-600 space-y-2">
                <li>• Lower water consumption per load</li>
                <li>• Reduced electricity usage</li>
                <li>• A smaller environmental footprint</li>
              </ul>
              <p className="text-slate-600 mt-4 italic">
                Cleaner clothes, smarter resource use, better for the planet.
              </p>
            </div>

            {/* Simple */}
            <div className="bg-white rounded-2xl p-8 shadow-sm">
              <CheckCircle className="h-10 w-10 text-sky-600 mb-4" />
              <h3 className="text-xl font-bold text-slate-900 mb-4">Simple from Start to Finish</h3>
              <p className="text-slate-600 mb-4">Getting started is easy:</p>
              <ul className="text-slate-600 space-y-2">
                <li>• Schedule by phone or text</li>
                <li>• Set your preferences once</li>
                <li>• Leave your laundry out</li>
                <li>• We take care of the rest</li>
              </ul>
              <p className="text-slate-600 mt-4 italic">
                No complicated systems. No unnecessary steps.
              </p>
            </div>
          </div>

          <div className="text-center mt-12">
            <Button onClick={() => scrollToSection("schedule")} className="bg-sky-500 hover:bg-sky-600 text-white rounded-full px-10 py-3 h-auto">
              👉 SET-UP PREFERENCES
            </Button>
          </div>
        </div>
      </section>

      {/* Take Back Your Time */}
      <section className="py-20 bg-sky-600 text-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-6">Take Back Your Time!!</h2>
          <p className="text-xl text-white/90 mb-6">
            Laundry shouldn't take over your schedule.
          </p>
          <p className="text-lg text-white/80 mb-8">
            We know how many hours disappear sorting, washing, drying, and folding. That's time you could spend relaxing, being with family, exploring the city, or simply recharging.
          </p>
          <p className="text-lg text-white/80 mb-8">
            Let us handle the laundry so you can focus on what truly matters.
          </p>
          <p className="text-2xl font-semibold">
            Ventura County's Most Affordable Laundry Service is Ready to Take Laundry Off Your To-Do List.
          </p>
        </div>
      </section>

      {/* Testimonial */}
      <section className="py-20 bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="text-6xl text-sky-200 mb-6">"</div>
          <blockquote className="text-xl md:text-2xl text-slate-700 italic mb-6">
            Ventura Fresh Laundry completely changed the way I handle laundry. The pickup and delivery is always on time, and my clothes come back perfectly clean and folded. I honestly can't imagine going back to doing it myself.
          </blockquote>
          <p className="font-semibold text-slate-900">— Katy F.</p>
        </div>
      </section>

      {/* Schedule/Forms Section */}
      <section id="schedule" className="py-20 bg-slate-900 text-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Schedule Your Pickup</h2>
            <p className="text-slate-300">Fill out the form and we'll contact you to confirm your pickup window.</p>
          </div>

          {/* Form Tabs */}
          <div className="flex justify-center gap-2 mb-8 flex-wrap">
            <Button 
              onClick={() => setActiveForm("pickup")}
              variant={activeForm === "pickup" ? "default" : "outline"}
              className={activeForm === "pickup" ? "bg-sky-500" : "bg-transparent border-slate-600 text-white hover:bg-slate-800"}
            >
              Pickup Request
            </Button>
            <Button 
              onClick={() => setActiveForm("contact")}
              variant={activeForm === "contact" ? "default" : "outline"}
              className={activeForm === "contact" ? "bg-sky-500" : "bg-transparent border-slate-600 text-white hover:bg-slate-800"}
            >
              Contact Us
            </Button>
            <Button 
              onClick={() => setActiveForm("commercial")}
              variant={activeForm === "commercial" ? "default" : "outline"}
              className={activeForm === "commercial" ? "bg-sky-500" : "bg-transparent border-slate-600 text-white hover:bg-slate-800"}
            >
              Commercial/B2B
            </Button>
          </div>

          {/* Pickup Form */}
          {activeForm === "pickup" && (
            <form onSubmit={handlePickupSubmit} className="bg-white rounded-2xl p-6 md:p-8 text-slate-900 animate-fade-in">
              <div className="grid md:grid-cols-2 gap-4 mb-4">
                <div>
                  <Label className="text-slate-700">Full Name *</Label>
                  <Input 
                    value={pickupForm.name}
                    onChange={(e) => setPickupForm({...pickupForm, name: e.target.value})}
                    required
                    className="mt-1"
                    data-testid="pickup-name-input"
                  />
                </div>
                <div>
                  <Label className="text-slate-700">Email *</Label>
                  <Input 
                    type="email"
                    value={pickupForm.email}
                    onChange={(e) => setPickupForm({...pickupForm, email: e.target.value})}
                    required
                    className="mt-1"
                    data-testid="pickup-email-input"
                  />
                </div>
              </div>
              <div className="grid md:grid-cols-2 gap-4 mb-4">
                <div>
                  <Label className="text-slate-700">Phone *</Label>
                  <Input 
                    value={pickupForm.phone}
                    onChange={(e) => setPickupForm({...pickupForm, phone: e.target.value})}
                    required
                    className="mt-1"
                    data-testid="pickup-phone-input"
                  />
                </div>
                <div>
                  <Label className="text-slate-700">Gate Code (if any)</Label>
                  <Input 
                    value={pickupForm.gate_code}
                    onChange={(e) => setPickupForm({...pickupForm, gate_code: e.target.value})}
                    className="mt-1"
                  />
                </div>
              </div>
              <div className="mb-4">
                <Label className="text-slate-700">Pickup Address *</Label>
                <Input 
                  value={pickupForm.address}
                  onChange={(e) => setPickupForm({...pickupForm, address: e.target.value})}
                  required
                  className="mt-1"
                  placeholder="Street, City, State, ZIP"
                  data-testid="pickup-address-input"
                />
              </div>
              <div className="grid md:grid-cols-2 gap-4 mb-4">
                <div>
                  <Label className="text-slate-700">Preferred Date</Label>
                  <Input 
                    type="date"
                    value={pickupForm.pickup_date}
                    onChange={(e) => setPickupForm({...pickupForm, pickup_date: e.target.value})}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-slate-700">Preferred Time</Label>
                  <Select value={pickupForm.pickup_time} onValueChange={(v) => setPickupForm({...pickupForm, pickup_time: v})}>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Select time window" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="8am-10am">8am - 10am</SelectItem>
                      <SelectItem value="10am-12pm">10am - 12pm</SelectItem>
                      <SelectItem value="12pm-2pm">12pm - 2pm</SelectItem>
                      <SelectItem value="2pm-4pm">2pm - 4pm</SelectItem>
                      <SelectItem value="4pm-6pm">4pm - 6pm</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="mb-6">
                <Label className="text-slate-700">Special Instructions</Label>
                <Textarea 
                  value={pickupForm.notes}
                  onChange={(e) => setPickupForm({...pickupForm, notes: e.target.value})}
                  className="mt-1"
                  rows={3}
                  placeholder="Detergent preferences, folding style, hang dry items, etc."
                />
              </div>
              <Button type="submit" className="w-full bg-sky-500 hover:bg-sky-600 text-white h-12 rounded-full" disabled={submitting} data-testid="pickup-submit-btn">
                {submitting ? "Sending..." : "Schedule Pickup"}
              </Button>
            </form>
          )}

          {/* Contact Form */}
          {activeForm === "contact" && (
            <form onSubmit={handleContactSubmit} className="bg-white rounded-2xl p-6 md:p-8 text-slate-900 animate-fade-in">
              <div className="grid md:grid-cols-2 gap-4 mb-4">
                <div>
                  <Label className="text-slate-700">Full Name *</Label>
                  <Input 
                    value={contactForm.name}
                    onChange={(e) => setContactForm({...contactForm, name: e.target.value})}
                    required
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-slate-700">Email *</Label>
                  <Input 
                    type="email"
                    value={contactForm.email}
                    onChange={(e) => setContactForm({...contactForm, email: e.target.value})}
                    required
                    className="mt-1"
                  />
                </div>
              </div>
              <div className="mb-4">
                <Label className="text-slate-700">Phone</Label>
                <Input 
                  value={contactForm.phone}
                  onChange={(e) => setContactForm({...contactForm, phone: e.target.value})}
                  className="mt-1"
                />
              </div>
              <div className="mb-6">
                <Label className="text-slate-700">Message *</Label>
                <Textarea 
                  value={contactForm.message}
                  onChange={(e) => setContactForm({...contactForm, message: e.target.value})}
                  required
                  className="mt-1"
                  rows={4}
                  placeholder="How can we help you?"
                />
              </div>
              <Button type="submit" className="w-full bg-sky-500 hover:bg-sky-600 text-white h-12 rounded-full" disabled={submitting}>
                {submitting ? "Sending..." : "Send Message"}
              </Button>
            </form>
          )}

          {/* Commercial Form */}
          {activeForm === "commercial" && (
            <form onSubmit={handleCommercialSubmit} className="bg-white rounded-2xl p-6 md:p-8 text-slate-900 animate-fade-in">
              <div className="grid md:grid-cols-2 gap-4 mb-4">
                <div>
                  <Label className="text-slate-700">Company Name *</Label>
                  <Input 
                    value={commercialForm.company_name}
                    onChange={(e) => setCommercialForm({...commercialForm, company_name: e.target.value})}
                    required
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-slate-700">Contact Name *</Label>
                  <Input 
                    value={commercialForm.contact_name}
                    onChange={(e) => setCommercialForm({...commercialForm, contact_name: e.target.value})}
                    required
                    className="mt-1"
                  />
                </div>
              </div>
              <div className="grid md:grid-cols-2 gap-4 mb-4">
                <div>
                  <Label className="text-slate-700">Email *</Label>
                  <Input 
                    type="email"
                    value={commercialForm.email}
                    onChange={(e) => setCommercialForm({...commercialForm, email: e.target.value})}
                    required
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-slate-700">Phone</Label>
                  <Input 
                    value={commercialForm.phone}
                    onChange={(e) => setCommercialForm({...commercialForm, phone: e.target.value})}
                    className="mt-1"
                  />
                </div>
              </div>
              <div className="grid md:grid-cols-2 gap-4 mb-4">
                <div>
                  <Label className="text-slate-700">Industry</Label>
                  <Input 
                    value={commercialForm.industry}
                    onChange={(e) => setCommercialForm({...commercialForm, industry: e.target.value})}
                    className="mt-1"
                    placeholder="e.g., Hotel, Restaurant, Gym"
                  />
                </div>
                <div>
                  <Label className="text-slate-700">Estimated Lbs/Week</Label>
                  <Input 
                    type="number"
                    value={commercialForm.estimated_lbs}
                    onChange={(e) => setCommercialForm({...commercialForm, estimated_lbs: e.target.value})}
                    className="mt-1"
                  />
                </div>
              </div>
              <div className="mb-6">
                <Label className="text-slate-700">Tell us about your needs</Label>
                <Textarea 
                  value={commercialForm.message}
                  onChange={(e) => setCommercialForm({...commercialForm, message: e.target.value})}
                  className="mt-1"
                  rows={3}
                  placeholder="Describe your commercial laundry needs..."
                />
              </div>
              <Button type="submit" className="w-full bg-sky-500 hover:bg-sky-600 text-white h-12 rounded-full" disabled={submitting}>
                {submitting ? "Sending..." : "Request Quote"}
              </Button>
            </form>
          )}
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-20 bg-slate-50">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-8 text-center">Frequently Asked Questions</h2>
          
          <div className="bg-white rounded-2xl p-6 md:p-8">
            <FAQItem 
              question="What services do you offer?"
              answer="We offer self-service laundry, professional wash & fold, and pickup & delivery services across Ventura County. We handle everything from everyday clothes to delicate items with care."
            />
            <FAQItem 
              question="How do I get started?"
              answer="Simply fill out the pickup request form above, or call/text us at (805) 836-8872. We'll confirm your pickup time and any special instructions you have."
            />
            <FAQItem 
              question="What makes you different?"
              answer="We focus on personalized service - your preferences are saved and followed every time. Plus, you get real-time text updates so you always know where your laundry is."
            />
            <FAQItem 
              question="How can I contact you?"
              answer="Call or text us at (805) 836-8872, visit us at 5722 Telephone Rd #5, Ventura, CA 93003, or use the contact form above. We're open Mon-Sun 6:00 AM – 10:00 PM."
            />
            <FAQItem 
              question="What's your pricing model?"
              answer="We charge by the pound for wash & fold services, with pickup and delivery included for orders over a minimum weight. Contact us for commercial pricing tailored to your business needs."
            />
            <FAQItem 
              question="What's it like to work with you?"
              answer="Working with us is simple and hassle-free. You schedule a pickup, we collect your laundry, clean it to your exact preferences, and deliver it back to you clean and folded. You'll receive updates at every step."
            />
          </div>
        </div>
      </section>

      {/* Contact Section */}
      <section id="contact" className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row justify-center items-center gap-12">
            <div className="text-center">
              <MapPin className="h-8 w-8 text-sky-600 mx-auto mb-3" />
              <p className="text-slate-600">📍 5722 Telephone Rd #5, Ventura, CA 93003</p>
            </div>
            
            <div className="text-center">
              <Clock className="h-8 w-8 text-sky-600 mx-auto mb-3" />
              <p className="text-slate-600">🕒 Mon–Sun 6:00 AM – 10:00 PM</p>
            </div>
            
            <div className="text-center">
              <Phone className="h-8 w-8 text-sky-600 mx-auto mb-3" />
              <p className="text-slate-600">📞 (805) 836-8872</p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-900 text-white py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-8">
            <div className="text-center md:text-left">
              <p className="text-sm text-slate-400">© 2026 Ventura Fresh Laundry. All rights reserved.</p>
            </div>
            <div className="flex flex-col md:flex-row items-center gap-6">
              <span className="text-sm text-slate-400 font-medium">Quick links</span>
              <div className="flex items-center gap-6 text-sm text-slate-400">
                <button onClick={() => scrollToSection("services")} className="hover:text-white transition-colors">Services</button>
                <button onClick={() => scrollToSection("about")} className="hover:text-white transition-colors">About us</button>
                <button onClick={() => scrollToSection("contact")} className="hover:text-white transition-colors">Contact us</button>
                <Link to="/login" className="hover:text-white transition-colors">Admin</Link>
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
