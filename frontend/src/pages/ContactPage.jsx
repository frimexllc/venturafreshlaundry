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
import { useLocale } from "../context/LocaleContext";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Mover FAQItem dentro del componente para acceder a t()
export default function ContactPage() {
  const { t } = useLocale();

  // Componente FAQ interno
  const FAQItem = ({ questionEn, questionEs, answerEn, answerEs }) => {
    const [isOpen, setIsOpen] = useState(false);
    return (
      <div className="border-b border-slate-200 last:border-0">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="w-full py-4 flex items-center justify-between text-left"
        >
          <span className="font-semibold text-slate-900 pr-4">{t(questionEn, questionEs)}</span>
          {isOpen ? (
            <ChevronUp className="h-5 w-5 text-sky-600 flex-shrink-0" />
          ) : (
            <ChevronDown className="h-5 w-5 text-slate-400 flex-shrink-0" />
          )}
        </button>
        {isOpen && (
          <div className="pb-4 text-slate-600 animate-fade-in">
            {t(answerEn, answerEs)}
          </div>
        )}
      </div>
    );
  };

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
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        message: `Subject: ${form.subject.trim()}\nPreferred Contact: ${form.contact_method}\n\n${form.message.trim()}`.trim()
      });
      toast.success(res.data.message);
      setForm({ name: "", email: "", phone: "", subject: "", contact_method: "", message: "" });
    } catch (error) {
      toast.error(error.response?.data?.detail || t("Error sending message", "Error al enviar mensaje"));
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
          >
            {t("Contact Us!", "¡Contáctanos!")}
          </h1>
          <p className="text-lg text-slate-600 max-w-2xl mx-auto">
            {t(
              "Let's take care of your laundry, so you can focus on what matters most.",
              "Nos encargamos de tu lavandería para que tú puedas concentrarte en lo que realmente importa."
            )}
          </p>
        </div>
      </section>

      {/* Contact Info + Form */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <p className="text-xl text-sky-600 font-semibold mb-2">
              {t("Clean • Bright • Trusted", "Limpio • Brillante • Confiable")}
            </p>
            <p className="text-slate-600 max-w-2xl mx-auto">
              {t(
                "If you have any questions, need help scheduling a pickup, or want to customize your laundry preferences, we're here to help. Contact us by phone or email and our team will respond as soon as possible.",
                "Si tienes alguna pregunta, necesitas ayuda para programar una recogida o deseas personalizar tus preferencias de lavandería, estamos aquí para ayudarte. Contáctanos por teléfono o correo electrónico y nuestro equipo responderá lo antes posible."
              )}
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
                      <p className="font-semibold text-slate-900">{t("Email", "Correo")}</p>
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
                      <p className="font-semibold text-slate-900">{t("Phone / Text", "Teléfono / Mensaje")}</p>
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
                      <p className="font-semibold text-slate-900">{t("Address", "Dirección")}</p>
                      <p className="text-slate-600">5722 Telephone Rd #5, Ventura, CA 93003</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-4">
                    <div className="h-12 w-12 rounded-xl bg-sky-100 flex items-center justify-center flex-shrink-0">
                      <Clock className="h-6 w-6 text-sky-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-slate-900">{t("Hours", "Horario")}</p>
                      <p className="text-slate-600">{t("Monday - Sunday", "Lunes - Domingo")}</p>
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
                <h3 className="text-xl font-bold text-slate-900 mb-6">{t("Send us a message", "Envíanos un mensaje")}</h3>
                
                <div className="space-y-4">
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <Label className="text-slate-700">{t("Full Name *", "Nombre Completo *")}</Label>
                      <Input 
                        value={form.name}
                        onChange={(e) => setForm({...form, name: e.target.value})}
                        required
                        className="mt-1"
                        data-testid="contact-name-input"
                      />
                    </div>
                    <div>
                      <Label className="text-slate-700">{t("Email *", "Correo *")}</Label>
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
                      <Label className="text-slate-700">{t("Phone", "Teléfono")}</Label>
                      <Input 
                        value={form.phone}
                        onChange={(e) => setForm({...form, phone: e.target.value})}
                        className="mt-1"
                        placeholder={t("+1 (___) ___-____", "+1 (___) ___-____")}
                      />
                    </div>
                    <div>
                      <Label className="text-slate-700">{t("Best way to contact you", "Mejor forma de contactarte")}</Label>
                      <Select value={form.contact_method} onValueChange={(v) => setForm({...form, contact_method: v})}>
                        <SelectTrigger className="mt-1">
                          <SelectValue placeholder={t("Select an option", "Selecciona una opción")} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="email">{t("Email", "Correo")}</SelectItem>
                          <SelectItem value="phone">{t("Phone Call", "Llamada")}</SelectItem>
                          <SelectItem value="text">{t("Text Message", "Mensaje de texto")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div>
                    <Label className="text-slate-700">{t("Subject *", "Asunto *")}</Label>
                    <Input 
                      value={form.subject}
                      onChange={(e) => setForm({...form, subject: e.target.value})}
                      required
                      className="mt-1"
                      placeholder={t("How can we help?", "¿Cómo podemos ayudarte?")}
                      data-testid="contact-subject-input"
                    />
                  </div>

                  <div>
                    <Label className="text-slate-700">{t("Message *", "Mensaje *")}</Label>
                    <Textarea 
                      value={form.message}
                      onChange={(e) => setForm({...form, message: e.target.value})}
                      required
                      className="mt-1"
                      rows={5}
                      placeholder={t("Tell us more about your inquiry...", "Cuéntanos más sobre tu consulta...")}
                      data-testid="contact-message-input"
                    />
                  </div>

                  <Button 
                    type="submit" 
                    className="w-full bg-sky-500 hover:bg-sky-600 text-white h-12 rounded-full" 
                    disabled={submitting}
                    data-testid="contact-submit-btn"
                  >
                    {submitting ? t("Sending...", "Enviando...") : (
                      <>
                        {t("Submit", "Enviar")} <Send className="ml-2 h-4 w-4" />
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
          <h2 className="text-2xl md:text-3xl font-bold text-slate-900 mb-2">
            {t("Simplify your days.", "Simplifica tus días.")}
          </h2>
          <p className="text-lg text-slate-600">
            {t("We'll take care of the laundry.", "Nosotros nos encargamos de la lavandería.")}
          </p>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-20">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-slate-900 mb-8 text-center">
            {t("Frequently Asked Questions", "Preguntas Frecuentes")}
          </h2>
          
          <div className="bg-white rounded-2xl p-6 md:p-8 shadow-sm border border-slate-100">
            <FAQItem 
              questionEn="What services do you offer?"
              questionEs="¿Qué servicios ofrecen?"
              answerEn="We offer self-service laundry, professional wash & fold, and pickup & delivery services across Ventura County. We handle everything from everyday clothes to delicate items with care."
              answerEs="Ofrecemos servicio de lavandería de autoservicio, lavado y doblado profesional, y servicios de recogida y entrega en todo el condado de Ventura. Manejamos todo, desde ropa de uso diario hasta prendas delicadas con cuidado."
            />
            <FAQItem 
              questionEn="How do I get started?"
              questionEs="¿Cómo empiezo?"
              answerEn="Simply fill out the contact form above, call/text us at (805) 836-8872, or schedule a pickup directly. We'll confirm your pickup time and any special instructions you have."
              answerEs="Simplemente completa el formulario de contacto de arriba, llámanos o envíanos un mensaje al (805) 836-8872, o programa una recogida directamente. Confirmaremos tu horario de recogida y cualquier instrucción especial que tengas."
            />
            <FAQItem 
              questionEn="What makes you different?"
              questionEs="¿Qué los hace diferentes?"
              answerEn="We focus on personalized service - your preferences are saved and followed every time. Plus, you get real-time text updates so you always know where your laundry is."
              answerEs="Nos enfocamos en el servicio personalizado: tus preferencias se guardan y se siguen cada vez. Además, recibes actualizaciones por mensaje de texto en tiempo real para que siempre sepas dónde está tu ropa."
            />
            <FAQItem 
              questionEn="How can I contact you?"
              questionEs="¿Cómo puedo contactarlos?"
              answerEn="Call or text us at (805) 836-8872, email info@venturafreshlaundry.com, visit us at 5722 Telephone Rd #5, Ventura, CA 93003, or use the contact form above."
              answerEs="Llámanos o envíanos un mensaje al (805) 836-8872, escríbenos a info@venturafreshlaundry.com, visítanos en 5722 Telephone Rd #5, Ventura, CA 93003, o usa el formulario de contacto de arriba."
            />
            <FAQItem 
              questionEn="What's your pricing model?"
              questionEs="¿Cómo es su modelo de precios?"
              answerEn="We charge by the pound for wash & fold services, with pickup and delivery included for orders over a minimum weight. Contact us for commercial pricing tailored to your business needs."
              answerEs="Cobramos por libra para los servicios de lavado y doblado, con recogida y entrega incluida para pedidos que superen un peso mínimo. Contáctanos para obtener precios comerciales adaptados a las necesidades de tu negocio."
            />
            <FAQItem 
              questionEn="What's it like to work with you?"
              questionEs="¿Cómo es trabajar con ustedes?"
              answerEn="Working with us is simple and hassle-free. You schedule a pickup, we collect your laundry, clean it to your exact preferences, and deliver it back to you clean and folded. You'll receive updates at every step."
              answerEs="Trabajar con nosotros es simple y sin complicaciones. Programa una recogida, recogemos tu ropa, la lavamos según tus preferencias exactas y te la devolvemos limpia y doblada. Recibirás actualizaciones en cada paso."
            />
          </div>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}