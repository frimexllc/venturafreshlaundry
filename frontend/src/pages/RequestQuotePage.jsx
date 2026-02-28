import { useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { CheckCircle, Building2, Briefcase, Truck, Hotel } from "lucide-react";
import PublicNav from "../components/PublicNav";
import PublicFooter from "../components/PublicFooter";
import { useLocale } from "../context/LocaleContext";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const BUSINESS_TYPES = [
  { value: "hotel", labelEn: "Hotel / Hospitality", labelEs: "Hotel / Hospitalidad" },
  { value: "airbnb", labelEn: "Airbnb / Vacation Rental", labelEs: "Airbnb / Alquiler vacacional" },
  { value: "restaurant", labelEn: "Restaurant / Food Service", labelEs: "Restaurante / Servicio de alimentos" },
  { value: "healthcare", labelEn: "Healthcare / Medical", labelEs: "Salud / Médico" },
  { value: "fitness", labelEn: "Gym / Fitness Center", labelEs: "Gimnasio / Centro de fitness" },
  { value: "spa", labelEn: "Spa / Salon", labelEs: "Spa / Salón" },
  { value: "property_management", labelEn: "Property Management", labelEs: "Administración de propiedades" },
  { value: "corporate", labelEn: "Corporate Office", labelEs: "Oficina corporativa" },
  { value: "manufacturing", labelEn: "Manufacturing / Industrial", labelEs: "Manufactura / Industrial" },
  { value: "retail", labelEn: "Retail", labelEs: "Venta al por menor" },
  { value: "other", labelEn: "Other", labelEs: "Otro" }
];

const SERVICE_TYPES = [
  { value: "wash_fold", labelEn: "Wash & Fold", labelEs: "Lavado y Doblado" },
  { value: "dry_cleaning", labelEn: "Dry Cleaning", labelEs: "Lavado en seco" },
  { value: "linens", labelEn: "Linens & Towels", labelEs: "Ropa de cama y toallas" },
  { value: "uniforms", labelEn: "Uniforms", labelEs: "Uniformes" },
  { value: "full_service", labelEn: "Full Service (All of the above)", labelEs: "Servicio completo (todo lo anterior)" }
];

const FREQUENCY_OPTIONS = [
  { value: "daily", labelEn: "Daily", labelEs: "Diario" },
  { value: "twice_week", labelEn: "Twice a Week", labelEs: "Dos veces por semana" },
  { value: "weekly", labelEn: "Weekly", labelEs: "Semanal" },
  { value: "biweekly", labelEn: "Biweekly", labelEs: "Quincenal" },
  { value: "monthly", labelEn: "Monthly", labelEs: "Mensual" },
  { value: "on_demand", labelEn: "On Demand", labelEs: "Bajo demanda" }
];

const CONTACT_METHODS = [
  { value: "phone", labelEn: "Phone Call", labelEs: "Llamada telefónica" },
  { value: "text", labelEn: "Text Message", labelEs: "Mensaje de texto" },
  { value: "email", labelEn: "Email", labelEs: "Correo electrónico" },
  { value: "whatsapp", labelEn: "WhatsApp", labelEs: "WhatsApp" }
];

export default function RequestQuotePage() {
  const { t, locale } = useLocale();
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    contact_method: "",
    address_line1: "",
    address_line2: "",
    city: "",
    state: "",
    zip_code: "",
    job_title: "",
    service_type: "",
    has_membership: "",
    company_legal_name: "",
    dba_name: "",
    business_type: "",
    laundry_frequency: "",
    estimated_lbs: "",
    best_date: "",
    best_time: "",
    additional_notes: "",
    subscribe_newsletter: false
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validate required fields
    const required = ['first_name', 'last_name', 'email', 'phone', 'address_line1', 'city', 'state', 'zip_code', 'service_type', 'has_membership', 'business_type', 'laundry_frequency', 'estimated_lbs', 'best_date', 'best_time'];
    const missing = required.filter(f => !form[f]);
    if (missing.length > 0) {
      toast.error(t("Please fill all required fields", "Por favor completa todos los campos obligatorios"));
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        ...form,
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        address_line1: form.address_line1.trim(),
        address_line2: form.address_line2.trim(),
        city: form.city.trim(),
        state: form.state.trim(),
        zip_code: form.zip_code.trim(),
        job_title: form.job_title.trim(),
        company_legal_name: form.company_legal_name.trim(),
        dba_name: form.dba_name.trim(),
        business_type: form.business_type.trim(),
        laundry_frequency: form.laundry_frequency,
        best_date: form.best_date,
        best_time: form.best_time,
        additional_notes: form.additional_notes.trim(),
        estimated_lbs: parseFloat(form.estimated_lbs) || 0
      };

      const res = await axios.post(`${API}/public/b2b-quote`, payload);
      toast.success(res.data.message || t("Quote request submitted successfully!", "¡Solicitud de cotización enviada con éxito!"));
      setSubmitted(true);
    } catch (error) {
      toast.error(error.response?.data?.detail || t("Error submitting request", "Error al enviar la solicitud"));
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-white">
        <PublicNav />
        <section className="pt-32 pb-20">
          <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <div className="h-20 w-20 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-6">
              <CheckCircle className="h-10 w-10 text-green-600" />
            </div>
            <h1 className="text-3xl font-bold text-slate-900 mb-4">
              {t("Quote Request Received!", "¡Solicitud de cotización recibida!")}
            </h1>
            <p className="text-lg text-slate-600 mb-8">
              {t(
                "Thank you for your interest in our commercial laundry services. Our team will review your requirements and contact you within 24-48 hours with a customized quote.",
                "Gracias por tu interés en nuestros servicios de lavandería comercial. Nuestro equipo revisará tus requisitos y se pondrá en contacto contigo dentro de 24-48 horas con una cotización personalizada."
              )}
            </p>
            <Button 
              onClick={() => {
                setSubmitted(false);
                setForm({
                  first_name: "", last_name: "", email: "", phone: "", contact_method: "",
                  address_line1: "", address_line2: "", city: "", state: "", zip_code: "",
                  job_title: "", service_type: "", has_membership: "", company_legal_name: "",
                  dba_name: "", business_type: "", laundry_frequency: "", estimated_lbs: "",
                  best_date: "", best_time: "", additional_notes: "", subscribe_newsletter: false
                });
              }}
              className="bg-sky-500 hover:bg-sky-600 text-white rounded-full px-8"
            >
              {t("Submit Another Request", "Enviar otra solicitud")}
            </Button>
          </div>
        </section>
        <PublicFooter />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <PublicNav />

      {/* Hero Section - Aumentado pt-32 para evitar superposición con el nav */}
      <section className="pt-32 pb-8 bg-gradient-to-b from-slate-900 to-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="flex justify-center gap-4 mb-6">
            <div className="h-14 w-14 rounded-xl bg-sky-500/20 flex items-center justify-center">
              <Building2 className="h-7 w-7 text-sky-400" />
            </div>
            <div className="h-14 w-14 rounded-xl bg-sky-500/20 flex items-center justify-center">
              <Hotel className="h-7 w-7 text-sky-400" />
            </div>
            <div className="h-14 w-14 rounded-xl bg-sky-500/20 flex items-center justify-center">
              <Briefcase className="h-7 w-7 text-sky-400" />
            </div>
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold text-white mb-4" style={{ fontFamily: "'Playfair Display', serif" }}>
            {t("Commercial Laundry Services", "Servicios de lavandería comercial")}
          </h1>
          <p className="text-xl text-slate-300 max-w-3xl mx-auto mb-4">
            {t("Reliable commercial laundry services for growing businesses", "Servicios de lavandería comercial confiables para negocios en crecimiento")}
          </p>
          <p className="text-slate-400 max-w-2xl mx-auto">
            {t(
              "Streamline your operations with reliable commercial laundry service. Provide your information below and our team will contact you to prepare a customized quote based on your volume, service requirements, and logistics needs.",
              "Optimiza tus operaciones con un servicio de lavandería comercial confiable. Proporciona tu información a continuación y nuestro equipo se pondrá en contacto contigo para preparar una cotización personalizada según tu volumen, requisitos de servicio y necesidades logísticas."
            )}
          </p>
        </div>
      </section>

      {/* Form Section */}
      <section className="py-12">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-slate-200 shadow-lg p-8">
            
            {/* Contact Information */}
            <div className="mb-8">
              <h2 className="text-xl font-bold text-slate-900 mb-4 flex items-center gap-2">
                <span className="h-8 w-8 rounded-full bg-sky-100 text-sky-600 flex items-center justify-center text-sm font-bold">1</span>
                {t("Contact Information", "Información de contacto")}
              </h2>
              
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <Label>{t("First Name *", "Nombre *")}</Label>
                  <Input
                    value={form.first_name}
                    onChange={(e) => setForm({...form, first_name: e.target.value})}
                    required
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>{t("Last Name *", "Apellido *")}</Label>
                  <Input
                    value={form.last_name}
                    onChange={(e) => setForm({...form, last_name: e.target.value})}
                    required
                    className="mt-1"
                  />
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-4 mt-4">
                <div>
                  <Label>{t("Email *", "Correo *")}</Label>
                  <Input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({...form, email: e.target.value})}
                    required
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>{t("Phone *", "Teléfono *")}</Label>
                  <Input
                    type="tel"
                    value={form.phone}
                    onChange={(e) => setForm({...form, phone: e.target.value})}
                    placeholder="+1 (555) 000-0000"
                    required
                    className="mt-1"
                  />
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-4 mt-4">
                <div>
                  <Label>{t("Best way to contact you", "Mejor forma de contactarte")}</Label>
                  <Select value={form.contact_method} onValueChange={(v) => setForm({...form, contact_method: v})}>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder={t("Select an option", "Selecciona una opción")} />
                    </SelectTrigger>
                    <SelectContent>
                      {CONTACT_METHODS.map(m => (
                        <SelectItem key={m.value} value={m.value}>
                          {t(m.labelEn, m.labelEs)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>{t("Job Title / Role", "Cargo / Rol")}</Label>
                  <Input
                    value={form.job_title}
                    onChange={(e) => setForm({...form, job_title: e.target.value})}
                    placeholder={t("e.g., Operations Manager", "ej. Gerente de operaciones")}
                    className="mt-1"
                  />
                </div>
              </div>

              <div className="mt-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.subscribe_newsletter}
                    onChange={(e) => setForm({...form, subscribe_newsletter: e.target.checked})}
                    className="rounded border-slate-300"
                  />
                  <span className="text-sm text-slate-600">{t("Sign up for news and updates", "Suscríbete para recibir noticias y actualizaciones")}</span>
                </label>
              </div>
            </div>

            {/* Business Address */}
            <div className="mb-8">
              <h2 className="text-xl font-bold text-slate-900 mb-4 flex items-center gap-2">
                <span className="h-8 w-8 rounded-full bg-sky-100 text-sky-600 flex items-center justify-center text-sm font-bold">2</span>
                {t("Business Address", "Dirección comercial")}
              </h2>
              
              <div className="space-y-4">
                <div>
                  <Label>{t("Address Line 1 *", "Dirección línea 1 *")}</Label>
                  <Input
                    value={form.address_line1}
                    onChange={(e) => setForm({...form, address_line1: e.target.value})}
                    required
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>{t("Address Line 2", "Dirección línea 2")}</Label>
                  <Input
                    value={form.address_line2}
                    onChange={(e) => setForm({...form, address_line2: e.target.value})}
                    placeholder={t("Suite, Unit, Building (optional)", "Suite, Unidad, Edificio (opcional)")}
                    className="mt-1"
                  />
                </div>
                <div className="grid md:grid-cols-3 gap-4">
                  <div>
                    <Label>{t("City *", "Ciudad *")}</Label>
                    <Input
                      value={form.city}
                      onChange={(e) => setForm({...form, city: e.target.value})}
                      required
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label>{t("State *", "Estado *")}</Label>
                    <Input
                      value={form.state}
                      onChange={(e) => setForm({...form, state: e.target.value})}
                      required
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label>{t("ZIP Code *", "Código postal *")}</Label>
                    <Input
                      value={form.zip_code}
                      onChange={(e) => setForm({...form, zip_code: e.target.value})}
                      required
                      className="mt-1"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Business Information */}
            <div className="mb-8">
              <h2 className="text-xl font-bold text-slate-900 mb-4 flex items-center gap-2">
                <span className="h-8 w-8 rounded-full bg-sky-100 text-sky-600 flex items-center justify-center text-sm font-bold">3</span>
                {t("Business Information", "Información comercial")}
              </h2>
              
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <Label>{t("Company Legal Name", "Nombre legal de la empresa")}</Label>
                  <Input
                    value={form.company_legal_name}
                    onChange={(e) => setForm({...form, company_legal_name: e.target.value})}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>{t("DBA / Trade Name (if different)", "Nombre comercial / DBA (si es diferente)")}</Label>
                  <Input
                    value={form.dba_name}
                    onChange={(e) => setForm({...form, dba_name: e.target.value})}
                    className="mt-1"
                  />
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-4 mt-4">
                <div>
                  <Label>{t("Business Type / Industry *", "Tipo de negocio / Industria *")}</Label>
                  <Select value={form.business_type} onValueChange={(v) => setForm({...form, business_type: v})}>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder={t("Select an option", "Selecciona una opción")} />
                    </SelectTrigger>
                    <SelectContent>
                      {BUSINESS_TYPES.map(t => (
                        <SelectItem key={t.value} value={t.value}>
                          {locale === "es" ? t.labelEs : t.labelEn}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>{t("Do you have an active membership? *", "¿Tienes una membresía activa? *")}</Label>
                  <Select value={form.has_membership} onValueChange={(v) => setForm({...form, has_membership: v})}>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder={t("Select an option", "Selecciona una opción")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="yes">{t("Yes", "Sí")}</SelectItem>
                      <SelectItem value="no">{t("No", "No")}</SelectItem>
                      <SelectItem value="interested">{t("Interested in learning more", "Interesado en conocer más")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Service Requirements */}
            <div className="mb-8">
              <h2 className="text-xl font-bold text-slate-900 mb-4 flex items-center gap-2">
                <span className="h-8 w-8 rounded-full bg-sky-100 text-sky-600 flex items-center justify-center text-sm font-bold">4</span>
                {t("Service Requirements", "Requisitos del servicio")}
              </h2>
              
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <Label>{t("Type of Service *", "Tipo de servicio *")}</Label>
                  <Select value={form.service_type} onValueChange={(v) => setForm({...form, service_type: v})}>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder={t("Select an option", "Selecciona una opción")} />
                    </SelectTrigger>
                    <SelectContent>
                      {SERVICE_TYPES.map(s => (
                        <SelectItem key={s.value} value={s.value}>
                          {locale === "es" ? s.labelEs : s.labelEn}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>{t("Expected Laundry Frequency *", "Frecuencia esperada de lavandería *")}</Label>
                  <Select value={form.laundry_frequency} onValueChange={(v) => setForm({...form, laundry_frequency: v})}>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder={t("Select an option", "Selecciona una opción")} />
                    </SelectTrigger>
                    <SelectContent>
                      {FREQUENCY_OPTIONS.map(f => (
                        <SelectItem key={f.value} value={f.value}>
                          {locale === "es" ? f.labelEs : f.labelEn}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="mt-4">
                <Label>{t("Estimated Average Pounds per Pick-up *", "Libras promedio estimadas por recogida *")}</Label>
                <Input
                  type="number"
                  min="1"
                  value={form.estimated_lbs}
                  onChange={(e) => setForm({...form, estimated_lbs: e.target.value})}
                  placeholder={t("e.g., 100", "ej. 100")}
                  required
                  className="mt-1"
                />
              </div>
            </div>

            {/* Scheduling */}
            <div className="mb-8">
              <h2 className="text-xl font-bold text-slate-900 mb-4 flex items-center gap-2">
                <span className="h-8 w-8 rounded-full bg-sky-100 text-sky-600 flex items-center justify-center text-sm font-bold">5</span>
                {t("Best Time to Reach You", "Mejor momento para contactarte")}
              </h2>
              
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <Label>{t("Best Date *", "Mejor fecha *")}</Label>
                  <Input
                    type="date"
                    value={form.best_date}
                    onChange={(e) => setForm({...form, best_date: e.target.value})}
                    required
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>{t("Best Time (Pacific Time) *", "Mejor hora (hora del Pacífico) *")}</Label>
                  <Input
                    type="time"
                    value={form.best_time}
                    onChange={(e) => setForm({...form, best_time: e.target.value})}
                    required
                    className="mt-1"
                  />
                </div>
              </div>

              <div className="mt-4">
                <Label>{t("Additional Notes", "Notas adicionales")}</Label>
                <Textarea
                  value={form.additional_notes}
                  onChange={(e) => setForm({...form, additional_notes: e.target.value})}
                  placeholder={t("Any specific requirements or questions?", "¿Requisitos o preguntas específicas?")}
                  className="mt-1"
                  rows={3}
                />
              </div>
            </div>

            {/* Submit */}
            <div className="pt-4">
              <Button
                type="submit"
                disabled={submitting}
                className="w-full bg-sky-600 hover:bg-sky-700 text-white rounded-full h-12 text-lg"
              >
                {submitting ? t("Submitting...", "Enviando...") : t("SUBMIT QUOTE REQUEST", "ENVIAR SOLICITUD DE COTIZACIÓN")}
              </Button>
              <p className="text-center text-sm text-slate-500 mt-3">
                {t("By submitting this form, you agree to be contacted by our team.", "Al enviar este formulario, aceptas ser contactado por nuestro equipo.")}
              </p>
            </div>
          </form>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}