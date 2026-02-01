import { useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { 
  Droplets, 
  Phone, 
  Mail, 
  MapPin, 
  Clock, 
  Truck, 
  Sparkles, 
  Leaf, 
  Bell,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Menu,
  X
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

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
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-sm border-b border-slate-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2">
              <Droplets className="h-8 w-8 text-sky-600" />
              <span className="text-xl font-bold text-slate-900">Ventura Fresh Laundry</span>
            </div>
            
            {/* Desktop nav */}
            <div className="hidden md:flex items-center gap-8">
              <button onClick={() => scrollToSection("services")} className="text-slate-600 hover:text-sky-600 font-medium transition-colors">
                Services
              </button>
              <button onClick={() => scrollToSection("how-it-works")} className="text-slate-600 hover:text-sky-600 font-medium transition-colors">
                How It Works
              </button>
              <button onClick={() => scrollToSection("contact")} className="text-slate-600 hover:text-sky-600 font-medium transition-colors">
                Contact
              </button>
              <Link to="/login" className="text-slate-600 hover:text-sky-600 font-medium transition-colors">
                Login
              </Link>
              <Button onClick={() => scrollToSection("schedule")} className="btn-primary">
                Schedule Pick-up
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
              <button onClick={() => scrollToSection("how-it-works")} className="text-slate-600 hover:text-sky-600 font-medium text-left">How It Works</button>
              <button onClick={() => scrollToSection("contact")} className="text-slate-600 hover:text-sky-600 font-medium text-left">Contact</button>
              <Link to="/login" className="text-slate-600 hover:text-sky-600 font-medium">Login</Link>
              <Button onClick={() => scrollToSection("schedule")} className="btn-primary w-full">Schedule Pick-up</Button>
            </div>
          </div>
        )}
      </nav>

      {/* Hero Section */}
      <section className="pt-24 pb-16 md:pt-32 md:pb-24 bg-gradient-to-br from-sky-50 via-white to-sky-50/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div className="space-y-6">
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-slate-900 leading-tight">
                We do your laundry.
                <span className="block text-sky-600">You enjoy your time.</span>
              </h1>
              <p className="text-lg text-slate-600 max-w-lg">
                Fast pickup, perfectly folded. Ventura Fresh Laundry makes laundry effortless across Ventura County.
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <Button onClick={() => scrollToSection("schedule")} className="btn-primary text-lg px-8 py-3 h-auto" data-testid="hero-schedule-btn">
                  Schedule Pick-up
                </Button>
                <Button onClick={() => scrollToSection("services")} variant="outline" className="btn-secondary text-lg px-8 py-3 h-auto">
                  More Services
                </Button>
              </div>
              <div className="flex items-center gap-6 pt-4">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                  <span className="text-sm text-slate-600">Self Service</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                  <span className="text-sm text-slate-600">Wash & Fold</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                  <span className="text-sm text-slate-600">Pickup & Delivery</span>
                </div>
              </div>
            </div>
            <div className="relative">
              <img 
                src="https://images.unsplash.com/photo-1582735689369-4fe89db7114c?w=800" 
                alt="Fresh laundry" 
                className="rounded-2xl shadow-2xl w-full"
              />
              <div className="absolute -bottom-6 -left-6 bg-white rounded-xl shadow-lg p-4 hidden md:block">
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 rounded-full bg-sky-100 flex items-center justify-center">
                    <Truck className="h-6 w-6 text-sky-600" />
                  </div>
                  <div>
                    <p className="font-bold text-slate-900">Free Pickup</p>
                    <p className="text-sm text-slate-500">Same day available</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Services Section */}
      <section id="services" className="py-16 md:py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">Our Services</h2>
            <p className="text-lg text-slate-600 max-w-2xl mx-auto">
              From convenient self-service to professional fluff & fold and fast pickup & delivery, we handle every detail.
            </p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8">
            <div className="bg-slate-50 rounded-2xl p-8 hover:shadow-lg transition-shadow">
              <div className="h-14 w-14 rounded-xl bg-sky-100 flex items-center justify-center mb-6">
                <Sparkles className="h-7 w-7 text-sky-600" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-3">Premium Garment Care</h3>
              <p className="text-slate-600">Consistent, high-quality cleaning with attention to fabric care and special instructions.</p>
            </div>
            
            <div className="bg-slate-50 rounded-2xl p-8 hover:shadow-lg transition-shadow">
              <div className="h-14 w-14 rounded-xl bg-emerald-100 flex items-center justify-center mb-6">
                <CheckCircle2 className="h-7 w-7 text-emerald-600" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-3">Custom Folding</h3>
              <p className="text-slate-600">Done exactly your way. Set your preferences once and we'll follow them every time.</p>
            </div>
            
            <div className="bg-slate-50 rounded-2xl p-8 hover:shadow-lg transition-shadow">
              <div className="h-14 w-14 rounded-xl bg-purple-100 flex items-center justify-center mb-6">
                <Truck className="h-7 w-7 text-purple-600" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-3">Pickup & Delivery</h3>
              <p className="text-slate-600">Effortless, on your schedule. We pick up and deliver right to your door.</p>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="py-16 md:py-24 bg-sky-50/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">How It Works</h2>
            <p className="text-lg text-slate-600">In just a few easy steps, enjoy a laundry experience designed around you.</p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="h-16 w-16 rounded-full bg-sky-600 text-white flex items-center justify-center text-2xl font-bold mx-auto mb-6">1</div>
              <h3 className="text-xl font-bold text-slate-900 mb-3">Schedule Your Pickup</h3>
              <p className="text-slate-600">Fill out the form below or call/text us. We'll confirm your preferred time window.</p>
            </div>
            
            <div className="text-center">
              <div className="h-16 w-16 rounded-full bg-sky-600 text-white flex items-center justify-center text-2xl font-bold mx-auto mb-6">2</div>
              <h3 className="text-xl font-bold text-slate-900 mb-3">We Pick Up</h3>
              <p className="text-slate-600">Leave your laundry bag at your door. Our driver will pick it up on time.</p>
            </div>
            
            <div className="text-center">
              <div className="h-16 w-16 rounded-full bg-sky-600 text-white flex items-center justify-center text-2xl font-bold mx-auto mb-6">3</div>
              <h3 className="text-xl font-bold text-slate-900 mb-3">Delivered Clean</h3>
              <p className="text-slate-600">Your clothes come back clean, fresh, and perfectly folded to your preferences.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-16 md:py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            <div className="text-center p-6">
              <Bell className="h-10 w-10 text-sky-600 mx-auto mb-4" />
              <h3 className="font-bold text-slate-900 mb-2">Real-Time Updates</h3>
              <p className="text-sm text-slate-600">Text notifications at every step so you always know where your order is.</p>
            </div>
            
            <div className="text-center p-6">
              <Sparkles className="h-10 w-10 text-sky-600 mx-auto mb-4" />
              <h3 className="font-bold text-slate-900 mb-2">Personalized Preferences</h3>
              <p className="text-sm text-slate-600">Choose your detergent, folding style, and special care instructions.</p>
            </div>
            
            <div className="text-center p-6">
              <Leaf className="h-10 w-10 text-sky-600 mx-auto mb-4" />
              <h3 className="font-bold text-slate-900 mb-2">Eco-Conscious</h3>
              <p className="text-sm text-slate-600">Professional equipment uses less water and energy than home machines.</p>
            </div>
            
            <div className="text-center p-6">
              <Clock className="h-10 w-10 text-sky-600 mx-auto mb-4" />
              <h3 className="font-bold text-slate-900 mb-2">Simple & Fast</h3>
              <p className="text-sm text-slate-600">No complicated systems. Schedule once, we take care of the rest.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Schedule/Forms Section */}
      <section id="schedule" className="py-16 md:py-24 bg-slate-900 text-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Schedule Your Pickup</h2>
            <p className="text-slate-300">Fill out the form and we'll contact you to confirm your pickup window.</p>
          </div>

          {/* Form Tabs */}
          <div className="flex justify-center gap-2 mb-8">
            <Button 
              onClick={() => setActiveForm("pickup")}
              variant={activeForm === "pickup" ? "default" : "outline"}
              className={activeForm === "pickup" ? "bg-sky-600" : "bg-transparent border-slate-600 text-white hover:bg-slate-800"}
            >
              Pickup Request
            </Button>
            <Button 
              onClick={() => setActiveForm("contact")}
              variant={activeForm === "contact" ? "default" : "outline"}
              className={activeForm === "contact" ? "bg-sky-600" : "bg-transparent border-slate-600 text-white hover:bg-slate-800"}
            >
              Contact Us
            </Button>
            <Button 
              onClick={() => setActiveForm("commercial")}
              variant={activeForm === "commercial" ? "default" : "outline"}
              className={activeForm === "commercial" ? "bg-sky-600" : "bg-transparent border-slate-600 text-white hover:bg-slate-800"}
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
                  placeholder="Any special requests or instructions..."
                />
              </div>
              <Button type="submit" className="w-full btn-primary h-12" disabled={submitting} data-testid="pickup-submit-btn">
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
              <Button type="submit" className="w-full btn-primary h-12" disabled={submitting}>
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
              <Button type="submit" className="w-full btn-primary h-12" disabled={submitting}>
                {submitting ? "Sending..." : "Request Quote"}
              </Button>
            </form>
          )}
        </div>
      </section>

      {/* Testimonial */}
      <section className="py-16 md:py-24 bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="text-5xl text-sky-200 mb-6">"</div>
          <blockquote className="text-xl md:text-2xl text-slate-700 italic mb-6">
            Ventura Fresh Laundry completely changed the way I handle laundry. The pickup and delivery is always on time, and my clothes come back perfectly clean and folded. I honestly can't imagine going back to doing it myself.
          </blockquote>
          <p className="font-semibold text-slate-900">— Katy F.</p>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-16 md:py-24 bg-slate-50">
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
              question="What's your pricing model?"
              answer="We charge by the pound for wash & fold services, with pickup and delivery included for orders over a minimum weight. Contact us for commercial pricing tailored to your business needs."
            />
            <FAQItem 
              question="How can I contact you?"
              answer="Call or text us at (805) 836-8872, visit us at 5722 Telephone Rd #5, Ventura, CA 93003, or use the contact form above. We're open Mon-Sun 6:00 AM – 10:00 PM."
            />
          </div>
        </div>
      </section>

      {/* Contact Section */}
      <section id="contact" className="py-16 md:py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-3 gap-8">
            <div className="text-center p-6">
              <div className="h-14 w-14 rounded-full bg-sky-100 flex items-center justify-center mx-auto mb-4">
                <MapPin className="h-7 w-7 text-sky-600" />
              </div>
              <h3 className="font-bold text-slate-900 mb-2">Address</h3>
              <p className="text-slate-600">5722 Telephone Rd #5<br/>Ventura, CA 93003</p>
            </div>
            
            <div className="text-center p-6">
              <div className="h-14 w-14 rounded-full bg-sky-100 flex items-center justify-center mx-auto mb-4">
                <Phone className="h-7 w-7 text-sky-600" />
              </div>
              <h3 className="font-bold text-slate-900 mb-2">Phone / Text</h3>
              <a href="tel:+18058368872" className="text-sky-600 hover:text-sky-700 font-medium">(805) 836-8872</a>
            </div>
            
            <div className="text-center p-6">
              <div className="h-14 w-14 rounded-full bg-sky-100 flex items-center justify-center mx-auto mb-4">
                <Clock className="h-7 w-7 text-sky-600" />
              </div>
              <h3 className="font-bold text-slate-900 mb-2">Hours</h3>
              <p className="text-slate-600">Mon – Sun<br/>6:00 AM – 10:00 PM</p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-900 text-white py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-2">
              <Droplets className="h-8 w-8 text-sky-400" />
              <span className="text-xl font-bold">Ventura Fresh Laundry</span>
            </div>
            <div className="flex items-center gap-6 text-sm text-slate-400">
              <button onClick={() => scrollToSection("services")} className="hover:text-white transition-colors">Services</button>
              <button onClick={() => scrollToSection("how-it-works")} className="hover:text-white transition-colors">How It Works</button>
              <button onClick={() => scrollToSection("contact")} className="hover:text-white transition-colors">Contact</button>
              <Link to="/login" className="hover:text-white transition-colors">Admin Login</Link>
            </div>
          </div>
          <div className="border-t border-slate-800 mt-8 pt-8 text-center text-sm text-slate-500">
            © 2026 Ventura Fresh Laundry. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
