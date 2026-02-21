import { useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { 
  Mail,
  Phone,
  MapPin,
  Clock,
  ChevronDown,
  ChevronUp,
  Send
} from "lucide-react";
import PublicNav from "../components/PublicNav";
import PublicFooter from "../components/PublicFooter";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const FAQItem = ({ question, answer }) => {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <div className="border-b border-slate-200 last:border-0">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full py-4 flex items-center justify-between text-left"
      >
        <span className="font-semibold text-slate-900 pr-4">{question}</span>
        {isOpen ? (
          <ChevronUp className="h-5 w-5 text-sky-600 flex-shrink-0" />
        ) : (
          <ChevronDown className="h-5 w-5 text-slate-400 flex-shrink-0" />
        )}
      </button>
      {isOpen && (
        <div className="pb-4 text-slate-600 animate-fade-in">
          {answer}
        </div>
      )}
    </div>
  );
};

export default function ContactPage() {
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    subject: "",
    contact_method: "",
    message: ""
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await axios.post(`${API}/public/contact`, {
        name: form.name,
        email: form.email,
        phone: form.phone,
        message: `Subject: ${form.subject}\nPreferred Contact: ${form.contact_method}\n\n${form.message}`
      });
      toast.success(res.data.message);
      setForm({ name: "", email: "", phone: "", subject: "", contact_method: "", message: "" });
    } catch (error) {
      toast.error(error.response?.data?.detail || "Error sending message");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-white">
      <PublicNav />

      {/* Hero Section */}
      <section className="pt-24 pb-16 bg-gradient-to-b from-sky-50 to-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <h1
  className="text-4xl sm:text-5xl font-bold text-slate-900 mb-6 mt-12"
  style={{ fontFamily: "'Playfair Display', serif" }}
>    Contact Us!
          </h1>
          <p className="text-lg text-slate-600 max-w-2xl mx-auto">
            Let's take care of your laundry, so you can focus on what matters most.
          </p>
        </div>
      </section>

      {/* Contact Info + Form */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <p className="text-xl text-sky-600 font-semibold mb-2">Clean • Bright • Trusted</p>
            <p className="text-slate-600 max-w-2xl mx-auto">
              If you have any questions, need help scheduling a pickup, or want to customize your laundry preferences, we're here to help. Contact us by phone or email and our team will respond as soon as possible.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-12">
            {/* Contact Information */}
            <div>
              <div className="bg-slate-50 rounded-2xl p-8 mb-8">
                <div className="space-y-6">
                  <div className="flex items-start gap-4">
                    <div className="h-12 w-12 rounded-xl bg-sky-100 flex items-center justify-center flex-shrink-0">
                      <Mail className="h-6 w-6 text-sky-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-slate-900">Email</p>
                      <a href="mailto:info@venturafreshlaundry.com" className="text-sky-600 hover:underline">
                        info@venturafreshlaundry.com
                      </a>
                    </div>
                  </div>
                  <div className="flex items-start gap-4">
                    <div className="h-12 w-12 rounded-xl bg-sky-100 flex items-center justify-center flex-shrink-0">
                      <Phone className="h-6 w-6 text-sky-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-slate-900">Phone / Text</p>
                      <a href="tel:+18058368872" className="text-sky-600 hover:underline">
                        +1 (805) 836-8872
                      </a>
                    </div>
                  </div>
                  <div className="flex items-start gap-4">
                    <div className="h-12 w-12 rounded-xl bg-sky-100 flex items-center justify-center flex-shrink-0">
                      <MapPin className="h-6 w-6 text-sky-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-slate-900">Address</p>
                      <p className="text-slate-600">5722 Telephone Rd #5, Ventura, CA 93003</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-4">
                    <div className="h-12 w-12 rounded-xl bg-sky-100 flex items-center justify-center flex-shrink-0">
                      <Clock className="h-6 w-6 text-sky-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-slate-900">Hours</p>
                      <p className="text-slate-600">Monday - Sunday</p>
                      <p className="text-slate-600">7:00 AM - 10:00 PM</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Map */}
              <div className="bg-slate-100 rounded-2xl h-64">
                <iframe
                  src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3279.5!2d-119.2!3d34.27!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x0%3A0x0!2zMzTCsDE2JzEyLjAiTiAxMTnCsDEyJzAwLjAiVw!5e0!3m2!1sen!2sus!4v1234567890"
                  width="100%"
                  height="100%"
                  style={{ border: 0, borderRadius: "1rem" }}
                  allowFullScreen
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  title="Ventura Fresh Laundry Location"
                />
              </div>
            </div>

            {/* Contact Form */}
            <div>
              <form onSubmit={handleSubmit} className="bg-white rounded-2xl p-8 shadow-lg border border-slate-100">
                <h3 className="text-xl font-bold text-slate-900 mb-6">Send us a message</h3>
                
                <div className="space-y-4">
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <Label className="text-slate-700">Full Name *</Label>
                      <Input 
                        value={form.name}
                        onChange={(e) => setForm({...form, name: e.target.value})}
                        required
                        className="mt-1"
                        data-testid="contact-name-input"
                      />
                    </div>
                    <div>
                      <Label className="text-slate-700">Email *</Label>
                      <Input 
                        type="email"
                        value={form.email}
                        onChange={(e) => setForm({...form, email: e.target.value})}
                        required
                        className="mt-1"
                        data-testid="contact-email-input"
                      />
                    </div>
                  </div>

                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <Label className="text-slate-700">Phone</Label>
                      <Input 
                        value={form.phone}
                        onChange={(e) => setForm({...form, phone: e.target.value})}
                        className="mt-1"
                        placeholder="+1 (___) ___-____"
                      />
                    </div>
                    <div>
                      <Label className="text-slate-700">Best way to contact you</Label>
                      <Select value={form.contact_method} onValueChange={(v) => setForm({...form, contact_method: v})}>
                        <SelectTrigger className="mt-1">
                          <SelectValue placeholder="Select an option" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="email">Email</SelectItem>
                          <SelectItem value="phone">Phone Call</SelectItem>
                          <SelectItem value="text">Text Message</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div>
                    <Label className="text-slate-700">Subject *</Label>
                    <Input 
                      value={form.subject}
                      onChange={(e) => setForm({...form, subject: e.target.value})}
                      required
                      className="mt-1"
                      placeholder="How can we help?"
                      data-testid="contact-subject-input"
                    />
                  </div>

                  <div>
                    <Label className="text-slate-700">Message *</Label>
                    <Textarea 
                      value={form.message}
                      onChange={(e) => setForm({...form, message: e.target.value})}
                      required
                      className="mt-1"
                      rows={5}
                      placeholder="Tell us more about your inquiry..."
                      data-testid="contact-message-input"
                    />
                  </div>

                  <Button 
                    type="submit" 
                    className="w-full bg-sky-500 hover:bg-sky-600 text-white h-12 rounded-full" 
                    disabled={submitting}
                    data-testid="contact-submit-btn"
                  >
                    {submitting ? "Sending..." : (
                      <>
                        Submit <Send className="ml-2 h-4 w-4" />
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </section>

      {/* Tagline */}
      <section className="py-12 bg-sky-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-2xl md:text-3xl font-bold text-slate-900 mb-2">Simplify your days.</h2>
          <p className="text-lg text-slate-600">We'll take care of the laundry.</p>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-20">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-slate-900 mb-8 text-center">Frequently Asked Questions</h2>
          
          <div className="bg-white rounded-2xl p-6 md:p-8 shadow-sm border border-slate-100">
            <FAQItem 
              question="What services do you offer?"
              answer="We offer self-service laundry, professional wash & fold, and pickup & delivery services across Ventura County. We handle everything from everyday clothes to delicate items with care."
            />
            <FAQItem 
              question="How do I get started?"
              answer="Simply fill out the contact form above, call/text us at (805) 836-8872, or schedule a pickup directly. We'll confirm your pickup time and any special instructions you have."
            />
            <FAQItem 
              question="What makes you different?"
              answer="We focus on personalized service - your preferences are saved and followed every time. Plus, you get real-time text updates so you always know where your laundry is."
            />
            <FAQItem 
              question="How can I contact you?"
              answer="Call or text us at (805) 836-8872, email info@venturafreshlaundry.com, visit us at 5722 Telephone Rd #5, Ventura, CA 93003, or use the contact form above."
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

      <PublicFooter />
    </div>
  );
}
