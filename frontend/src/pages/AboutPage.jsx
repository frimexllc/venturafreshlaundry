import { Link } from "react-router-dom";
import { Button } from "../components/ui/button";
import { 
  Star,
  Heart,
  Users,
  Award,
  MapPin,
  Clock,
  Phone,
  ArrowRight
} from "lucide-react";
import PublicNav from "../components/PublicNav";
import PublicFooter from "../components/PublicFooter";
import { useLocale } from "../context/LocaleContext";

export default function AboutPage() {
  const { t } = useLocale();

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
            {t("About Us", "Nosotros")}
          </h1>
          <p className="text-lg text-slate-600 max-w-2xl mx-auto">
            {t(
              "Ventura Fresh Laundry makes laundry effortless across Ventura County",
              "Ventura Fresh Laundry hace que la lavandería sea sin esfuerzo en todo el condado de Ventura"
            )}
          </p>
        </div>
      </section>

      {/* Our Story */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-3xl font-bold text-slate-900 mb-6">
                {t("Our Story", "Nuestra Historia")}
              </h2>
              <p className="text-slate-600 mb-4">
                {t(
                  "Founded with a simple mission: to give people their time back. We understand that laundry is one of those never-ending chores that takes hours out of your week – time that could be spent with family, pursuing hobbies, or simply relaxing.",
                  "Fundada con una misión simple: devolverle el tiempo a las personas. Entendemos que la lavandería es una de esas tareas interminables que te quita horas de tu semana – tiempo que podría ser dedicado a la familia, pasatiempos o simplemente relajarse."
                )}
              </p>
              <p className="text-slate-600 mb-4">
                {t(
                  "At Ventura Fresh Laundry, we combine professional-grade equipment with personalized service to deliver an exceptional laundry experience. From our self-service facility to our full-service wash & fold and pickup & delivery options, we've designed every aspect of our business around your convenience.",
                  "En Ventura Fresh Laundry, combinamos equipos de grado profesional con un servicio personalizado para ofrecer una experiencia de lavandería excepcional. Desde nuestras instalaciones de autoservicio hasta nuestro servicio completo de lavado y doblado y opciones de recogida y entrega, hemos diseñado cada aspecto de nuestro negocio pensando en tu conveniencia."
                )}
              </p>
              <p className="text-slate-600">
                {t(
                  "We're proud to serve Ventura County with the most affordable and reliable laundry services in the area.",
                  "Estamos orgullosos de servir al condado de Ventura con los servicios de lavandería más asequibles y confiables de la zona."
                )}
              </p>
            </div>
            <div className="bg-sky-50 rounded-2xl p-8">
              <div className="grid grid-cols-2 gap-6">
                <div className="text-center p-4">
                  <div className="text-4xl font-bold text-sky-600 mb-2">5+</div>
                  <p className="text-slate-600">{t("Years of Service", "Años de Servicio")}</p>
                </div>
                <div className="text-center p-4">
                  <div className="text-4xl font-bold text-sky-600 mb-2">10K+</div>
                  <p className="text-slate-600">{t("Happy Customers", "Clientes Felices")}</p>
                </div>
                <div className="text-center p-4">
                  <div className="text-4xl font-bold text-sky-600 mb-2">50K+</div>
                  <p className="text-slate-600">{t("Loads Completed", "Cargas Completadas")}</p>
                </div>
                <div className="text-center p-4">
                  <div className="text-4xl font-bold text-sky-600 mb-2">4.9</div>
                  <p className="text-slate-600">{t("Star Rating", "Calificación")}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Our Values */}
      <section className="py-20 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-slate-900 text-center mb-12">
            {t("Our Values", "Nuestros Valores")}
          </h2>
          <div className="grid md:grid-cols-4 gap-8">
            <div className="bg-white rounded-2xl p-6 shadow-sm text-center">
              <div className="h-14 w-14 rounded-full bg-sky-100 flex items-center justify-center mx-auto mb-4">
                <Star className="h-7 w-7 text-sky-600" />
              </div>
              <h3 className="font-bold text-slate-900 mb-2">{t("Quality First", "Calidad Primero")}</h3>
              <p className="text-slate-600 text-sm">
                {t(
                  "We treat every item with care, using premium products and professional techniques.",
                  "Tratamos cada prenda con cuidado, usando productos premium y técnicas profesionales."
                )}
              </p>
            </div>
            <div className="bg-white rounded-2xl p-6 shadow-sm text-center">
              <div className="h-14 w-14 rounded-full bg-sky-100 flex items-center justify-center mx-auto mb-4">
                <Heart className="h-7 w-7 text-sky-600" />
              </div>
              <h3 className="font-bold text-slate-900 mb-2">{t("Customer Care", "Atención al Cliente")}</h3>
              <p className="text-slate-600 text-sm">
                {t(
                  "Your satisfaction is our priority. We listen, adapt, and deliver on your preferences.",
                  "Tu satisfacción es nuestra prioridad. Escuchamos, nos adaptamos y cumplimos con tus preferencias."
                )}
              </p>
            </div>
            <div className="bg-white rounded-2xl p-6 shadow-sm text-center">
              <div className="h-14 w-14 rounded-full bg-sky-100 flex items-center justify-center mx-auto mb-4">
                <Users className="h-7 w-7 text-sky-600" />
              </div>
              <h3 className="font-bold text-slate-900 mb-2">{t("Community", "Comunidad")}</h3>
              <p className="text-slate-600 text-sm">
                {t(
                  "We're proud to be part of Ventura County and committed to serving our neighbors.",
                  "Estamos orgullosos de ser parte del condado de Ventura y comprometidos a servir a nuestros vecinos."
                )}
              </p>
            </div>
            <div className="bg-white rounded-2xl p-6 shadow-sm text-center">
              <div className="h-14 w-14 rounded-full bg-sky-100 flex items-center justify-center mx-auto mb-4">
                <Award className="h-7 w-7 text-sky-600" />
              </div>
              <h3 className="font-bold text-slate-900 mb-2">{t("Reliability", "Confiabilidad")}</h3>
              <p className="text-slate-600 text-sm">
                {t(
                  "On time, every time. You can count on us to keep our promises.",
                  "A tiempo, siempre. Puedes contar con nosotros para cumplir nuestras promesas."
                )}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Location */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-3xl font-bold text-slate-900 mb-6">
                {t("Visit Our Location", "Visita Nuestra Ubicación")}
              </h2>
              <div className="space-y-4 mb-8">
                <div className="flex items-start gap-4">
                  <MapPin className="h-6 w-6 text-sky-600 flex-shrink-0 mt-1" />
                  <div>
                    <p className="font-semibold text-slate-900">{t("Address", "Dirección")}</p>
                    <p className="text-slate-600">5722 Telephone Rd #5, Ventura, CA 93003</p>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <Clock className="h-6 w-6 text-sky-600 flex-shrink-0 mt-1" />
                  <div>
                    <p className="font-semibold text-slate-900">{t("Hours", "Horario")}</p>
                    <p className="text-slate-600">{t("Monday - Sunday: 6:00 AM - 10:00 PM", "Lunes a Domingo: 6:00 AM - 10:00 PM")}</p>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <Phone className="h-6 w-6 text-sky-600 flex-shrink-0 mt-1" />
                  <div>
                    <p className="font-semibold text-slate-900">{t("Phone / Text", "Teléfono / Mensaje")}</p>
                    <p className="text-slate-600">(805) 836-8872</p>
                  </div>
                </div>
              </div>
              <Link to="/contact">
                <Button className="bg-sky-500 hover:bg-sky-600 text-white rounded-full px-8">
                  {t("Contact Us", "Contáctanos")} <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </div>
            <div className="bg-slate-100 rounded-2xl h-80 flex items-center justify-center">
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
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 bg-sky-600">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl font-bold text-white mb-4">
            {t("Ready to Experience the Difference?", "¿Listo para Experimentar la Diferencia?")}
          </h2>
          <p className="text-white/90 text-lg mb-8">
            {t("Let us take laundry off your to-do list.", "Deja que nosotros quitemos la lavandería de tu lista de tareas.")}
          </p>
          <Link to="/schedule-pickup">
            <Button className="bg-white text-sky-600 hover:bg-slate-100 rounded-full px-10 py-3 h-auto text-lg font-semibold">
              {t("Schedule Pickup", "Programar Recolección")}
            </Button>
          </Link>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}