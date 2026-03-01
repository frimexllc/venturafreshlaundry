import { useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { Package, CheckCircle } from "lucide-react";
import PublicNav from "../components/PublicNav";
import PublicFooter from "../components/PublicFooter";
import { useLocale } from "../context/LocaleContext";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Lista de códigos de país comunes
const countryCodes = [
  { value: "+1", label: "USA/Canadá (+1)" },
  { value: "+52", label: "México (+52)" },
  { value: "+34", label: "España (+34)" },
  { value: "+44", label: "Reino Unido (+44)" },
  { value: "+33", label: "Francia (+33)" },
  { value: "+49", label: "Alemania (+49)" },
  { value: "+39", label: "Italia (+39)" },
  { value: "+86", label: "China (+86)" },
  { value: "+81", label: "Japón (+81)" },
  { value: "+82", label: "Corea del Sur (+82)" },
  { value: "+55", label: "Brasil (+55)" },
  { value: "+54", label: "Argentina (+54)" },
  { value: "+57", label: "Colombia (+57)" },
  { value: "+56", label: "Chile (+56)" },
  { value: "+51", label: "Perú (+51)" },
];

const getErrorMessage = (error) => {
  const detail = error.response?.data?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail.map((d) => d.msg || d.message || JSON.stringify(d)).join(", ");
  }
  return "Error submitting request";
};

export default function WashFoldRequest() {
  const { t, locale } = useLocale();
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    country_code: "+1", // Código de país por defecto
    phone: "",
    contact_method: "",
    address_line1: "",
    address_line2: "",
    city: "",
    state: "",
    zip_code: "",
    dropoff_date: "",
    dropoff_time: "",
    notes: "",
  });

  const resetForm = () => {
    setForm({
      first_name: "",
      last_name: "",
      email: "",
      country_code: "+1",
      phone: "",
      contact_method: "",
      address_line1: "",
      address_line2: "",
      city: "",
      state: "",
      zip_code: "",
      dropoff_date: "",
      dropoff_time: "",
      notes: "",
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!form.contact_method) {
      toast.error(t("Please select the best way to contact you.", "Por favor selecciona la mejor forma de contactarte."));
      return;
    }
    // Comentamos esta validación ya que el campo está desactivado
    // if (!form.dropoff_time) {
    //   toast.error(t("Please select a preferred drop-off window.", "Por favor selecciona un horario preferido de entrega."));
    //   return;
    // }

    setSubmitting(true);
    try {
      const fullName = `${form.first_name.trim()} ${form.last_name.trim()}`.trim();
      const fullAddress = [
        form.address_line1.trim(),
        form.address_line2.trim(),
        form.city.trim(),
        form.state.trim(),
        form.zip_code.trim()
      ].filter(Boolean).join(", ");

      // Combinamos el código de país con el número de teléfono
      const fullPhone = `${form.country_code} ${form.phone.trim()}`;

      const res = await axios.post(`${API}/public/wash-fold-request`, {
        name: fullName,
        email: form.email.trim(),
        phone: fullPhone,
        address: fullAddress,
        dropoff_date: form.dropoff_date,
        dropoff_time: form.dropoff_time,
        contact_method: form.contact_method,
        notes: form.notes?.trim() || ""
      });

      toast.success(res.data?.message || t("Request submitted!", "¡Solicitud enviada!"));
      setSubmitted(true);
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-white">
        <PublicNav />

        <section className="pt-40 pb-20">
          <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <div className="h-20 w-20 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-6">
              <CheckCircle className="h-10 w-10 text-green-600" />
            </div>

            <h1 className="text-3xl font-bold text-slate-900 mb-4">
              {t("Request Submitted!", "¡Solicitud enviada!")}
            </h1>

            <p className="text-lg text-slate-600 mb-8">
              {t(
                "Thank you for your Wash & Fold request. Our team will reach out to confirm the details.",
                "Gracias por tu solicitud de Wash & Fold. Nuestro equipo se comunicará para confirmar los detalles."
              )}
            </p>

            <Button
              onClick={() => {
                setSubmitted(false);
                resetForm();
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

      <section className="pt-40 pb-8 bg-gradient-to-b from-sky-50 to-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="h-16 w-16 rounded-full bg-sky-100 flex items-center justify-center mx-auto mb-6">
            <Package className="h-8 w-8 text-sky-600" />
          </div>

          <h1
            className="text-4xl sm:text-5xl font-bold text-slate-900 mb-4"
            style={{ fontFamily: "'Playfair Display', serif" }}
          >
            {t("Wash & Fold Drop-Off", "Wash & Fold - Entrega")}
          </h1>

          <p className="text-lg text-slate-600 max-w-2xl mx-auto">
            {t(
              "Tell us how you want your clothes handled and we'll confirm your drop-off window.",
              "Cuéntanos cómo quieres que manejen tu ropa y confirmaremos tu horario de entrega."
            )}
          </p>
        </div>
      </section>

      <section className="py-12">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <form
            onSubmit={handleSubmit}
            className="bg-white rounded-2xl p-6 md:p-8 shadow-lg border border-slate-100"
          >
            <h2 className="text-2xl font-bold text-slate-900 mb-6">
              {t("Wash & Fold Details", "Detalles de Wash & Fold")}
            </h2>

            <div className="mb-6">
              <h3 className="font-semibold text-slate-900 mb-3">{t("Name", "Nombre")}</h3>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <Label className="text-slate-600 text-sm">{t("First Name *", "Nombre *")}</Label>
                  <Input
                    value={form.first_name}
                    onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                    required
                    className="mt-1"
                    data-testid="washfold-first-name"
                  />
                </div>
                <div>
                  <Label className="text-slate-600 text-sm">{t("Last Name *", "Apellido *")}</Label>
                  <Input
                    value={form.last_name}
                    onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                    required
                    className="mt-1"
                    data-testid="washfold-last-name"
                  />
                </div>
              </div>
            </div>

            <div className="mb-6">
              <h3 className="font-semibold text-slate-900 mb-3">{t("Email *", "Correo *")}</h3>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
                placeholder={t("your@email.com", "tu@correo.com")}
                data-testid="washfold-email"
              />
            </div>

            <div className="mb-6">
              <h3 className="font-semibold text-slate-900 mb-3">{t("Phone *", "Teléfono *")}</h3>
              <div className="flex gap-2">
                {/* Selector de código de país */}
                <Select
                  value={form.country_code}
                  onValueChange={(v) => setForm({ ...form, country_code: v })}
                >
                  <SelectTrigger className="w-32 mt-1" data-testid="washfold-country-code">
                    <SelectValue placeholder="+1" />
                  </SelectTrigger>
                  <SelectContent>
                    {countryCodes.map((code) => (
                      <SelectItem key={code.value} value={code.value}>
                        {code.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                
                {/* Campo de número telefónico */}
                <Input
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  required
                  placeholder="(___) ___-____"
                  className="flex-1 mt-1"
                  data-testid="washfold-phone"
                />
              </div>
              <p className="text-xs text-slate-500 mt-1">
                {t("Select your country code and enter your phone number", "Selecciona tu código de país y escribe tu número telefónico")}
              </p>
            </div>

            <div className="mb-6">
              <Label className="font-semibold text-slate-900">
                {t("Best way to contact you *", "Mejor forma de contactarte *")}
              </Label>
              <Select
                value={form.contact_method}
                onValueChange={(v) => setForm({ ...form, contact_method: v })}
              >
                <SelectTrigger className="mt-2" data-testid="washfold-contact-method">
                  <SelectValue placeholder={t("Select an option", "Selecciona una opción")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="phone">{t("Phone Call", "Llamada telefónica")}</SelectItem>
                  <SelectItem value="text">{t("Text Message", "Mensaje de texto")}</SelectItem>
                  <SelectItem value="email">{t("Email", "Correo")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="mb-6">
              <h3 className="font-semibold text-slate-900 mb-3">{t("Address *", "Dirección *")}</h3>
              <div className="space-y-4">
                <div>
                  <Label className="text-slate-600 text-sm">{t("Address Line 1 *", "Dirección línea 1 *")}</Label>
                  <Input
                    value={form.address_line1}
                    onChange={(e) => setForm({ ...form, address_line1: e.target.value })}
                    required
                    className="mt-1"
                    placeholder={t("Street address", "Dirección")}
                    data-testid="washfold-address1"
                  />
                </div>
                <div>
                  <Label className="text-slate-600 text-sm">{t("Address Line 2", "Dirección línea 2")}</Label>
                  <Input
                    value={form.address_line2}
                    onChange={(e) => setForm({ ...form, address_line2: e.target.value })}
                    className="mt-1"
                    placeholder={t("Apt, Suite, Unit, etc. (optional)", "Apto, Suite, Unidad, etc. (opcional)")}
                  />
                </div>
                <div className="grid sm:grid-cols-3 gap-4">
                  <div>
                    <Label className="text-slate-600 text-sm">{t("City *", "Ciudad *")}</Label>
                    <Input
                      value={form.city}
                      onChange={(e) => setForm({ ...form, city: e.target.value })}
                      required
                      className="mt-1"
                      data-testid="washfold-city"
                    />
                  </div>
                  <div>
                    <Label className="text-slate-600 text-sm">{t("State *", "Estado *")}</Label>
                    <Input
                      value={form.state}
                      onChange={(e) => setForm({ ...form, state: e.target.value })}
                      required
                      className="mt-1"
                      placeholder={t("CA", "CA")}
                      data-testid="washfold-state"
                    />
                  </div>
                  <div>
                    <Label className="text-slate-600 text-sm">{t("ZIP Code *", "Código postal *")}</Label>
                    <Input
                      value={form.zip_code}
                      onChange={(e) => setForm({ ...form, zip_code: e.target.value })}
                      required
                      className="mt-1"
                      data-testid="washfold-zip"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="mb-6">
              <h3 className="font-semibold text-slate-900 mb-3">{t("Drop-Off Schedule", "Horario de entrega")}</h3>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <Label className="text-slate-600 text-sm">{t("Preferred Date", "Fecha preferida")}</Label>
                  <Input
                    type="date"
                    value={form.dropoff_date}
                    onChange={(e) => setForm({ ...form, dropoff_date: e.target.value })}
                    className="mt-1"
                    min={new Date().toISOString().split("T")[0]}
                    data-testid="washfold-date"
                  />
                </div>
                
                {/* SECCIÓN COMENTADA: Campo de hora desactivado
                <div>
                  <Label className="text-slate-600 text-sm">{t("Preferred Time *", "Hora preferida *")}</Label>
                  <Select
                    value={form.dropoff_time}
                    onValueChange={(v) => setForm({ ...form, dropoff_time: v })}
                  >
                    <SelectTrigger className="mt-1" data-testid="washfold-dropoff-time">
                      <SelectValue placeholder={t("Select time window", "Selecciona horario")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="8am-12pm">{t("8:00 AM - 12:00 PM", "8:00 AM - 12:00 PM")}</SelectItem>
                      <SelectItem value="12pm-4pm">{t("12:00 PM - 4:00 PM", "12:00 PM - 4:00 PM")}</SelectItem>
                      <SelectItem value="2pm-6pm">{t("2:00 PM - 6:00 PM", "2:00 PM - 6:00 PM")}</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-slate-500 mt-1">{t("Pacific Time", "Hora del Pacífico")}</p>
                </div>
                */}
              </div>
            </div>

            <div className="mb-8">
              <h3 className="font-semibold text-slate-900 mb-3">{t("Laundry Preferences", "Preferencias de lavandería")}</h3>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={3}
                placeholder={t(
                  "Detergent type, folding style, hang dry items, special instructions, etc.",
                  "Tipo de detergente, estilo de doblado, prendas para secar al aire, instrucciones especiales, etc."
                )}
                data-testid="washfold-notes"
              />
            </div>

            <Button
              type="submit"
              className="w-full bg-sky-500 hover:bg-sky-600 text-white h-12 rounded-full text-lg font-semibold"
              disabled={submitting}
              data-testid="washfold-submit-btn"
            >
              {submitting ? t("Submitting...", "Enviando...") : t("Submit Wash & Fold Request", "Enviar solicitud de Wash & Fold")}
            </Button>
          </form>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}